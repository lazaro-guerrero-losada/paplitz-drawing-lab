/**
 * Reconstrucción 3D y Control de Órbita 360° para Lab 3D
 * Permite des-proyectar trazos 2D del usuario al espacio 3D (World Space),
 * anclándolos a la geometría espacial del reto para orbitar 360° en tiempo real.
 */

import {
  Vector3D,
  Point2D,
  Camera3D,
  CurveSegment2D,
  UserStroke3D,
  UserStrokeWorld3D,
} from './types';
import {
  vAdd,
  vSub,
  vScale,
  vDot,
  vCross,
  vLen,
  vNorm,
  Matrix4x4,
  createLookAtMatrix,
  createPerspectiveMatrix,
  multiplyMatrices,
} from './math3d';

export interface CameraRay {
  origin: Vector3D;
  direction: Vector3D;
}

/**
 * Calcula el rayo óptico en el espacio de mundo para un píxel 2D de pantalla.
 * La ecuación es exactamente la inversa de project3DTo2D + createLookAtMatrix.
 */
export function getCameraRay(
  screenPt: Point2D,
  camera: Camera3D,
  width: number,
  height: number
): CameraRay {
  const ndcX = (2 * screenPt.x) / width - 1;
  const ndcY = 1 - (2 * screenPt.y) / height;

  const fovRad = (camera.fov * Math.PI) / 180;
  const f = 1.0 / Math.tan(fovRad / 2.0);
  const shiftY = camera.shiftY || 0;

  // En espacio de cámara (Z = -1)
  const camDirX = (ndcX * camera.aspectRatio) / f;
  const camDirY = (ndcY + shiftY) / f;

  // Base ortonormal de la cámara en espacio de mundo
  const zAxis = vNorm(vSub(camera.eye, camera.target));
  let xAxis = vNorm(vCross(camera.up, zAxis));
  if (vLen(xAxis) < 0.0001) {
    xAxis = { x: 1, y: 0, z: 0 };
  }
  const yAxis = vCross(zAxis, xAxis);

  const worldDir = vNorm({
    x: xAxis.x * camDirX + yAxis.x * camDirY - zAxis.x * 1.0,
    y: xAxis.y * camDirX + yAxis.y * camDirY - zAxis.y * 1.0,
    z: xAxis.z * camDirX + yAxis.z * camDirY - zAxis.z * 1.0,
  });

  return {
    origin: camera.eye,
    direction: worldDir,
  };
}

interface Ref3DSegment {
  p1_2D: Point2D;
  p2_2D: Point2D;
  p1_3D: Vector3D;
  p2_3D: Vector3D;
  curveId: string;
  isGiven: boolean;
}

/**
 * Reconstruye y eleva los trazos 2D del usuario al espacio 3D (World Coordinates),
 * encontrando la profundidad óptima t para cada punto a lo largo del rayo de la cámara
 * y aplicando un filtro de suavizado de profundidad a lo largo de cada trazo.
 */
export function unprojectUserStrokesTo3D(
  strokes: UserStroke3D[],
  camera: Camera3D,
  width: number,
  height: number,
  targetCurves: CurveSegment2D[],
  anchorCurves: CurveSegment2D[]
): UserStrokeWorld3D[] {
  // 1. Recopilar segmentos de referencia 3D -> 2D
  const refSegments: Ref3DSegment[] = [];

  const addCurveToRef = (curve: CurveSegment2D) => {
    if (!curve.points || !curve.points3D) return;
    const count = Math.min(curve.points.length, curve.points3D.length);
    for (let i = 0; i < count - 1; i++) {
      refSegments.push({
        p1_2D: curve.points[i],
        p2_2D: curve.points[i + 1],
        p1_3D: curve.points3D[i],
        p2_3D: curve.points3D[i + 1],
        curveId: curve.id,
        isGiven: curve.isGiven,
      });
    }
  };

  targetCurves.forEach(addCurveToRef);
  anchorCurves.forEach(addCurveToRef);

  // Distancia por defecto (centro del objeto)
  const defaultDepth = Math.max(0.1, vLen(vSub(camera.eye, camera.target)));

  // 2. Procesar cada trazo del usuario
  return strokes.map((stroke, strokeIdx) => {
    if (!stroke.points || stroke.points.length === 0) {
      return {
        id: stroke.id || `stroke_${strokeIdx}`,
        points3D: [],
        isConstruction: stroke.isConstruction,
      };
    }

    const n = stroke.points.length;
    const rawDepths: number[] = new Array(n);
    const rays: CameraRay[] = new Array(n);

    // Calcular profundidad para cada punto del trazo
    for (let i = 0; i < n; i++) {
      const pt2D = stroke.points[i];
      const ray = getCameraRay(pt2D, camera, width, height);
      rays[i] = ray;

      let bestDist = Infinity;
      let bestDepth = defaultDepth;

      for (let s = 0; s < refSegments.length; s++) {
        const seg = refSegments[s];
        const dx = seg.p2_2D.x - seg.p1_2D.x;
        const dy = seg.p2_2D.y - seg.p1_2D.y;
        const len2 = dx * dx + dy * dy;

        let alpha = 0;
        if (len2 > 0.0001) {
          alpha = Math.max(
            0,
            Math.min(1, ((pt2D.x - seg.p1_2D.x) * dx + (pt2D.y - seg.p1_2D.y) * dy) / len2)
          );
        }

        const projX = seg.p1_2D.x + alpha * dx;
        const projY = seg.p1_2D.y + alpha * dy;
        const dist2D = Math.sqrt((pt2D.x - projX) * (pt2D.x - projX) + (pt2D.y - projY) * (pt2D.y - projY));

        if (dist2D < bestDist) {
          bestDist = dist2D;
          // Punto 3D interpolado en el segmento
          const m3D: Vector3D = {
            x: (1 - alpha) * seg.p1_3D.x + alpha * seg.p2_3D.x,
            y: (1 - alpha) * seg.p1_3D.y + alpha * seg.p2_3D.y,
            z: (1 - alpha) * seg.p1_3D.z + alpha * seg.p2_3D.z,
          };
          // Proyección escalar sobre el rayo: t = (M3D - Eye) · RayDir
          const t = vDot(vSub(m3D, camera.eye), ray.direction);
          if (t > 0.1) {
            bestDepth = t;
          }
        }
      }

      // Mezcla de suavizado si está un poco lejos del segmento (evita saltos bruscos)
      let finalDepth = bestDepth;
      const MAX_SNAP = 150;
      const MIN_SNAP = 40;
      if (bestDist > MAX_SNAP) {
        finalDepth = defaultDepth;
      } else if (bestDist > MIN_SNAP) {
        const factor = (MAX_SNAP - bestDist) / (MAX_SNAP - MIN_SNAP);
        finalDepth = factor * bestDepth + (1 - factor) * defaultDepth;
      }

      rawDepths[i] = Math.max(0.1, finalDepth);
    }

    // 3. Suavizado de profundidad a lo largo del trazo (filtro de 3 tomas)
    const smoothDepths: number[] = new Array(n);
    for (let i = 0; i < n; i++) {
      if (n <= 2) {
        smoothDepths[i] = rawDepths[i];
      } else {
        const prev = i > 0 ? rawDepths[i - 1] : rawDepths[i];
        const next = i < n - 1 ? rawDepths[i + 1] : rawDepths[i];
        smoothDepths[i] = 0.25 * prev + 0.5 * rawDepths[i] + 0.25 * next;
      }
    }

    // 4. Generar los puntos 3D finales: P_3D = Eye + t * ray.direction
    const points3D: Vector3D[] = new Array(n);
    for (let i = 0; i < n; i++) {
      points3D[i] = vAdd(camera.eye, vScale(rays[i].direction, smoothDepths[i]));
    }

    return {
      id: stroke.id || `stroke_${strokeIdx}`,
      points3D,
      isConstruction: stroke.isConstruction,
    };
  });
}

/**
 * Obtiene los ángulos esféricos (azimut, elevación y distancia) de la cámara del reto
 * para que la vista inicial u orbital comience exactamente en la orientación del reto.
 */
export function getOriginalCameraOrbitAngles(camera: Camera3D): {
  azimuthRad: number;
  elevationRad: number;
  distance: number;
  target: Vector3D;
} {
  const delta = vSub(camera.eye, camera.target);
  const distance = Math.max(0.1, vLen(delta));
  const elevationRad = Math.asin(Math.min(0.999, Math.max(-0.999, delta.y / distance)));
  const azimuthRad = Math.atan2(delta.x, delta.z);

  return {
    azimuthRad,
    elevationRad,
    distance,
    target: { ...camera.target },
  };
}

/**
 * Crea la matriz de vista-proyección orbital para navegación 360° en tiempo real
 */
export function createOrbitViewProj(
  azimuthRad: number,
  elevationRad: number,
  distance: number,
  target: Vector3D,
  fovDeg: number,
  aspect: number,
  shiftY: number = 0
): { viewProj: Matrix4x4; eye: Vector3D } {
  // Limitar elevación para evitar singularidad en los polos
  const clampedElevation = Math.max(-1.45, Math.min(1.45, elevationRad)); // +/- ~83 grados
  const cosEl = Math.cos(clampedElevation);
  const sinEl = Math.sin(clampedElevation);
  const sinAz = Math.sin(azimuthRad);
  const cosAz = Math.cos(azimuthRad);

  const eye: Vector3D = {
    x: target.x + distance * cosEl * sinAz,
    y: target.y + distance * sinEl,
    z: target.z + distance * cosEl * cosAz,
  };

  const viewMat = createLookAtMatrix(eye, target, { x: 0, y: 1, z: 0 });
  const projMat = createPerspectiveMatrix(fovDeg, aspect, 0.1, 100, shiftY);
  const viewProj = multiplyMatrices(projMat, viewMat);

  return { viewProj, eye };
}
