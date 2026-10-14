/**
 * Motor matemático de proyección y perspectiva 3D
 * Calcula transformaciones, matrices de cámara (LookAt + Perspectiva), puntos de fuga y mallas de guía.
 */

import { Vector3D, Point2D, Camera3D, VanishingPoint, PerspectiveGridLine } from './types';

// ==========================================
// Operaciones con Vectores 3D
// ==========================================

export function v3(x: number, y: number, z: number): Vector3D {
  return { x, y, z };
}

export function vAdd(a: Vector3D, b: Vector3D): Vector3D {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function vSub(a: Vector3D, b: Vector3D): Vector3D {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function vScale(v: Vector3D, s: number): Vector3D {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

export function vDot(a: Vector3D, b: Vector3D): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function vCross(a: Vector3D, b: Vector3D): Vector3D {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function vLen(v: Vector3D): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

export function vNorm(v: Vector3D): Vector3D {
  const len = vLen(v);
  if (len < 0.000001) return { x: 0, y: 0, z: 0 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

export function vRotateX(v: Vector3D, rad: number): Vector3D {
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: v.x,
    y: v.y * cos - v.z * sin,
    z: v.y * sin + v.z * cos,
  };
}

export function vRotateY(v: Vector3D, rad: number): Vector3D {
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: v.x * cos + v.z * sin,
    y: v.y,
    z: -v.x * sin + v.z * cos,
  };
}

export function vRotateZ(v: Vector3D, rad: number): Vector3D {
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: v.x * cos - v.y * sin,
    y: v.x * sin + v.y * cos,
    z: v.z,
  };
}

// ==========================================
// Matrices 4x4 y Proyección de Cámara
// ==========================================

export type Matrix4x4 = number[]; // 16 elementos en orden row-major

export function createLookAtMatrix(eye: Vector3D, target: Vector3D, up: Vector3D): Matrix4x4 {
  const zAxis = vNorm(vSub(eye, target)); // Forward (apuntando hacia la cámara)
  let xAxis = vNorm(vCross(up, zAxis));   // Right
  if (vLen(xAxis) < 0.0001) {
    xAxis = { x: 1, y: 0, z: 0 };
  }
  const yAxis = vCross(zAxis, xAxis);     // Up corregido

  return [
    xAxis.x, xAxis.y, xAxis.z, -vDot(xAxis, eye),
    yAxis.x, yAxis.y, yAxis.z, -vDot(yAxis, eye),
    zAxis.x, zAxis.y, zAxis.z, -vDot(zAxis, eye),
    0, 0, 0, 1,
  ];
}

export function createPerspectiveMatrix(fovDeg: number, aspect: number, near: number, far: number): Matrix4x4 {
  const fovRad = (fovDeg * Math.PI) / 180;
  const f = 1.0 / Math.tan(fovRad / 2.0);
  const nf = 1.0 / (near - far);

  return [
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, 2 * far * near * nf,
    0, 0, -1, 0,
  ];
}

export function multiplyMatrices(a: Matrix4x4, b: Matrix4x4): Matrix4x4 {
  const out = new Array(16).fill(0);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += a[r * 4 + k] * b[k * 4 + c];
      }
      out[r * 4 + c] = sum;
    }
  }
  return out;
}

/**
 * Transforma un punto 3D del espacio de mundo al plano 2D de pantalla (lienzo)
 */
export function project3DTo2D(
  point: Vector3D,
  viewProjMatrix: Matrix4x4,
  canvasWidth: number,
  canvasHeight: number
): { point2D: Point2D; isBehindCamera: boolean; depth: number } {
  const x = point.x;
  const y = point.y;
  const z = point.z;

  const clipX = viewProjMatrix[0] * x + viewProjMatrix[1] * y + viewProjMatrix[2] * z + viewProjMatrix[3];
  const clipY = viewProjMatrix[4] * x + viewProjMatrix[5] * y + viewProjMatrix[6] * z + viewProjMatrix[7];
  const clipZ = viewProjMatrix[8] * x + viewProjMatrix[9] * y + viewProjMatrix[10] * z + viewProjMatrix[11];
  const clipW = viewProjMatrix[12] * x + viewProjMatrix[13] * y + viewProjMatrix[14] * z + viewProjMatrix[15];

  if (clipW <= 0.0001) {
    return {
      point2D: { x: canvasWidth / 2, y: canvasHeight / 2 },
      isBehindCamera: true,
      depth: clipZ,
    };
  }

  const ndcX = clipX / clipW;
  const ndcY = clipY / clipW;

  // Convertir NDC [-1, 1] a coordenadas del Canvas [0, W] x [0, H] (con Y invertida para dibujo)
  const screenX = (ndcX * 0.5 + 0.5) * canvasWidth;
  const screenY = (-ndcY * 0.5 + 0.5) * canvasHeight;

  return {
    point2D: { x: screenX, y: screenY },
    isBehindCamera: false,
    depth: clipW,
  };
}

/**
 * Calcula los Puntos de Fuga (VP X, VP Y, VP Z) para la cámara dada.
 */
export function calculateVanishingPoints(
  _camera: Camera3D,
  viewProjMatrix: Matrix4x4,
  canvasWidth: number,
  canvasHeight: number
): { X?: VanishingPoint; Y?: VanishingPoint; Z?: VanishingPoint } {
  const axes: ('X' | 'Y' | 'Z')[] = ['X', 'Y', 'Z'];
  const dirs: Record<'X' | 'Y' | 'Z', Vector3D> = {
    X: { x: 1, y: 0, z: 0 },
    Y: { x: 0, y: 1, z: 0 },
    Z: { x: 0, y: 0, z: 1 },
  };

  const result: { X?: VanishingPoint; Y?: VanishingPoint; Z?: VanishingPoint } = {};
  const cx = canvasWidth / 2;
  const cy = canvasHeight / 2;

  axes.forEach((axis) => {
    const dir = dirs[axis];

    // Proyectamos el vector de dirección como punto en el infinito
    const clipX = viewProjMatrix[0] * dir.x + viewProjMatrix[1] * dir.y + viewProjMatrix[2] * dir.z;
    const clipY = viewProjMatrix[4] * dir.x + viewProjMatrix[5] * dir.y + viewProjMatrix[6] * dir.z;
    const clipW = viewProjMatrix[12] * dir.x + viewProjMatrix[12] * 0 + viewProjMatrix[13] * dir.y + viewProjMatrix[14] * dir.z;

    let sx: number;
    let sy: number;

    if (Math.abs(clipW) > 0.0001) {
      const sign = clipW > 0 ? 1 : -1;
      const ndcX = (clipX / clipW) * sign;
      const ndcY = (clipY / clipW) * sign;
      sx = (ndcX * 0.5 + 0.5) * canvasWidth;
      sy = (-ndcY * 0.5 + 0.5) * canvasHeight;
    } else {
      // Paralelo al plano de proyección (en el infinito)
      sx = cx + clipX * 10000;
      sy = cy - clipY * 10000;
    }

    const isOnScreen = sx >= 30 && sx <= canvasWidth - 30 && sy >= 30 && sy <= canvasHeight - 30;

    // Calcular vector y ángulo desde el centro
    const dx = sx - cx;
    const dy = sy - cy;
    const angleRad = Math.atan2(dy, dx);
    const angleDeg = (angleRad * 180) / Math.PI;

    // Calcular punto de corte con el borde del canvas si está fuera
    let edgeX = sx;
    let edgeY = sy;
    if (!isOnScreen) {
      const padding = 28;
      const halfW = canvasWidth / 2 - padding;
      const halfH = canvasHeight / 2 - padding;

      const scaleX = Math.abs(dx) > 0.001 ? halfW / Math.abs(dx) : 999999;
      const scaleY = Math.abs(dy) > 0.001 ? halfH / Math.abs(dy) : 999999;
      const t = Math.min(scaleX, scaleY);

      edgeX = cx + dx * t;
      edgeY = cy + dy * t;
    }

    result[axis] = {
      axis,
      label: `VP ${axis}`,
      point: { x: sx, y: sy },
      isOnScreen,
      screenEdgePoint: { x: edgeX, y: edgeY },
      angleDeg,
    };
  });

  return result;
}

/**
 * Genera la cuadrícula de perspectiva 3D con guías convergiendo a los puntos de fuga
 * (Suelo 3D, paredes de referencia y líneas de proyección)
 */
export function generatePerspectiveGrid(
  _camera: Camera3D,
  viewProjMatrix: Matrix4x4,
  canvasWidth: number,
  canvasHeight: number,
  bounds = { xMin: -3.5, xMax: 3.5, zMin: -3.5, zMax: 3.5, yFloor: -1.4, yCeil: 2.0 }
): PerspectiveGridLine[] {
  const lines: PerspectiveGridLine[] = [];

  // 1. Líneas del suelo (Plano XZ en Y = yFloor)
  const steps = 7;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const z = bounds.zMin + t * (bounds.zMax - bounds.zMin);
    const p1 = project3DTo2D({ x: bounds.xMin, y: bounds.yFloor, z }, viewProjMatrix, canvasWidth, canvasHeight);
    const p2 = project3DTo2D({ x: bounds.xMax, y: bounds.yFloor, z }, viewProjMatrix, canvasWidth, canvasHeight);
    if (!p1.isBehindCamera && !p2.isBehindCamera) {
      lines.push({ start: p1.point2D, end: p2.point2D, axis: 'X', opacity: 0.22 });
    }
  }

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = bounds.xMin + t * (bounds.xMax - bounds.xMin);
    const p1 = project3DTo2D({ x, y: bounds.yFloor, z: bounds.zMin }, viewProjMatrix, canvasWidth, canvasHeight);
    const p2 = project3DTo2D({ x, y: bounds.yFloor, z: bounds.zMax }, viewProjMatrix, canvasWidth, canvasHeight);
    if (!p1.isBehindCamera && !p2.isBehindCamera) {
      lines.push({ start: p1.point2D, end: p2.point2D, axis: 'Z', opacity: 0.22 });
    }
  }

  // 2. Líneas verticales (Eje Y) en las esquinas y puntos clave
  const cornerCoords = [
    { x: bounds.xMin, z: bounds.zMin },
    { x: bounds.xMax, z: bounds.zMin },
    { x: bounds.xMin, z: bounds.zMax },
    { x: bounds.xMax, z: bounds.zMax },
    { x: 0, z: bounds.zMin },
    { x: bounds.xMin, z: 0 },
  ];

  cornerCoords.forEach(({ x, z }) => {
    const pBottom = project3DTo2D({ x, y: bounds.yFloor, z }, viewProjMatrix, canvasWidth, canvasHeight);
    const pTop = project3DTo2D({ x, y: bounds.yCeil, z }, viewProjMatrix, canvasWidth, canvasHeight);
    if (!pBottom.isBehindCamera && !pTop.isBehindCamera) {
      lines.push({ start: pBottom.point2D, end: pTop.point2D, axis: 'Y', opacity: 0.18 });
    }
  });

  // 3. Techo o caja delimitadora superior
  for (let i = 0; i <= steps; i += 2) {
    const t = i / steps;
    const z = bounds.zMin + t * (bounds.zMax - bounds.zMin);
    const p1 = project3DTo2D({ x: bounds.xMin, y: bounds.yCeil, z }, viewProjMatrix, canvasWidth, canvasHeight);
    const p2 = project3DTo2D({ x: bounds.xMax, y: bounds.yCeil, z }, viewProjMatrix, canvasWidth, canvasHeight);
    if (!p1.isBehindCamera && !p2.isBehindCamera) {
      lines.push({ start: p1.point2D, end: p2.point2D, axis: 'X', opacity: 0.12 });
    }
  }

  return lines;
}
