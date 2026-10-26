/**
 * Modelos 3D y Des-proyección Espacial para Focal 3D
 * Genera mallas 3D para la previsualización y reconstruye los trazos 2D del usuario
 * en coordenadas 3D para permitir rotación orbital 360° interactiva.
 */

import { Vector3D, WireframeModel3D, UserStroke3D } from '../perspective3d/types';
import { v3 } from '../perspective3d/math3d';
import { Focal3DShapeType, Focal3DChallenge, PrecalculatedShape3D } from './types';

/**
 * Genera el modelo alámbrico 3D canónico (WireframeModel3D) para cada tipo de figura de Focal 3D
 */
export function getFocal3DWireframeModel(type: Focal3DShapeType): WireframeModel3D {
  if (type === 'CUBE') {
    const w = 0.85;
    const h = 0.75;
    const d = 0.85;

    const vertices: Vector3D[] = [
      v3(-w, -h, d), // 0: frente abajo izq
      v3(w, -h, d),  // 1: frente abajo der
      v3(w, h, d),   // 2: frente arriba der
      v3(-w, h, d),  // 3: frente arriba izq
      v3(-w, -h, -d), // 4: atrás abajo izq
      v3(w, -h, -d),  // 5: atrás abajo der
      v3(w, h, -d),   // 6: atrás arriba der
      v3(-w, h, -d),  // 7: atrás arriba izq
    ];

    const edges: [number, number][] = [
      [0, 1], [1, 2], [2, 3], [3, 0], // Cara frontal
      [4, 5], [5, 6], [6, 7], [7, 4], // Cara trasera
      [0, 4], [1, 5], [2, 6], [3, 7], // 4 aristas de profundidad
    ];

    return { vertices, edges };
  }

  if (type === 'CYLINDER') {
    const R = 0.85;
    const halfH = 0.95;
    const N = 36;
    const frontRing: Vector3D[] = [];
    const backRing: Vector3D[] = [];

    for (let i = 0; i < N; i++) {
      const a = (i * 2 * Math.PI) / N;
      const cosA = Math.cos(a);
      const sinA = Math.sin(a);
      frontRing.push(v3(R * cosA, R * sinA, halfH));
      backRing.push(v3(R * cosA, R * sinA, -halfH));
    }
    // Cerrar bucles
    frontRing.push(frontRing[0]);
    backRing.push(backRing[0]);

    const heightAxis: Vector3D[] = [v3(0, 0, halfH), v3(0, 0, -halfH)];
    const leftSide: Vector3D[] = [v3(-R, 0, halfH), v3(-R, 0, -halfH)];
    const rightSide: Vector3D[] = [v3(R, 0, halfH), v3(R, 0, -halfH)];
    const topSide: Vector3D[] = [v3(0, R, halfH), v3(0, R, -halfH)];
    const bottomSide: Vector3D[] = [v3(0, -R, halfH), v3(0, -R, -halfH)];

    return {
      vertices: [v3(-R, 0, halfH), v3(R, 0, halfH), v3(0, 0, halfH), v3(0, 0, -halfH)],
      edges: [],
      rings: [frontRing, backRing, heightAxis],
      tangentRings: [leftSide, rightSide, topSide, bottomSide],
    };
  }

  if (type === 'TRIANGULAR_PRISM') {
    const w = 0.95;
    const h = 0.95;
    const d = 0.95;

    const vertices: Vector3D[] = [
      v3(0, h, d),        // 0: frente cima
      v3(w, -h * 0.6, d), // 1: frente der
      v3(-w, -h * 0.6, d),// 2: frente izq
      v3(0, h, -d),       // 3: atrás cima
      v3(w, -h * 0.6, -d),// 4: atrás der
      v3(-w, -h * 0.6, -d),// 5: atrás izq
    ];

    const edges: [number, number][] = [
      [0, 1], [1, 2], [2, 0], // Frente
      [3, 4], [4, 5], [5, 3], // Atrás
      [0, 3], [1, 4], [2, 5], // Profundidad
    ];

    return { vertices, edges };
  }

  if (type === 'PYRAMID') {
    const w = 0.9;
    const h = 0.7;
    const d = 0.85;
    const apexZ = 1.05;

    const vertices: Vector3D[] = [
      v3(-w, -h, -d), // 0: base izq abajo
      v3(w, -h, -d),  // 1: base der abajo
      v3(w, h, -d),   // 2: base der arriba
      v3(-w, h, -d),  // 3: base izq arriba
      v3(0, 0, apexZ),// 4: ápice hacia el frente
    ];

    const edges: [number, number][] = [
      [0, 1], [1, 2], [2, 3], [3, 0], // Base cuadrangular
      [0, 4], [1, 4], [2, 4], [3, 4], // 4 aristas al ápice
    ];

    return { vertices, edges };
  }

  // HEXAGON_PRISM o default
  const R = 0.9;
  const d = 0.85;
  const vertices: Vector3D[] = [];
  const edges: [number, number][] = [];

  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    vertices.push(v3(R * Math.cos(a), R * Math.sin(a), d)); // 0..5
  }
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    vertices.push(v3(R * Math.cos(a), R * Math.sin(a), -d)); // 6..11
  }

  for (let i = 0; i < 6; i++) {
    edges.push([i, (i + 1) % 6]); // Frente
    edges.push([i + 6, ((i + 1) % 6) + 6]); // Atrás
    edges.push([i, i + 6]); // Profundidad
  }

  return { vertices, edges };
}

export interface UnprojectedFocalStroke3D {
  points3D: Vector3D[];
  isConstruction?: boolean;
}

/**
 * Eleva los trazos 2D del usuario al espacio 3D para el visor orbital interactivo.
 * Determina la profundidad Z de cada punto proyectándolo hacia las referencias geométricas del reto.
 */
export function unprojectFocalStrokesTo3D(
  strokes: UserStroke3D[],
  challenge: Focal3DChallenge,
  activeShape?: PrecalculatedShape3D
): UnprojectedFocalStroke3D[] {
  const shape = activeShape || challenge.shapes[0];
  if (!shape) return [];

  const center = shape.centerPos;
  const fp = challenge.focalPoint;

  // Escala de normalización a unidades 3D canónicas (~[-1, 1])
  let maxExtent = 100;
  if (shape.frontVertices && shape.frontVertices.length >= 2) {
    const d = Math.hypot(shape.frontVertices[1].x - shape.frontVertices[0].x, shape.frontVertices[1].y - shape.frontVertices[0].y);
    if (d > 20) maxExtent = d;
  }
  const normScale = 1.0 / (maxExtent * 0.7);

  const distCenterFocal = Math.hypot(center.x - fp.x, center.y - fp.y);
  const depthZSpan = 1.6;

  return strokes.map((s) => {
    const points3D: Vector3D[] = s.points.map((pt) => {
      // Coordenadas X e Y centradas en la figura
      const x3 = (pt.x - center.x) * normScale;
      const y3 = -(pt.y - center.y) * normScale; // Invertir Y para orientación estándar 3D

      // Profundidad Z: calculada según proximidad relativa al punto focal
      // Puntos más alejados del punto focal están más cerca del espectador (Z > 0);
      // puntos más cercanos al punto focal penetran en profundidad (Z < 0).
      const distPtFocal = Math.hypot(pt.x - fp.x, pt.y - fp.y);
      const relDiff = distPtFocal - distCenterFocal;
      const t = Math.max(-1.0, Math.min(1.0, relDiff / (distCenterFocal * 0.45 || 100)));
      const z3 = t * (depthZSpan * 0.5);

      return { x: x3, y: y3, z: z3 };
    });

    return {
      points3D,
      isConstruction: s.isConstruction,
    };
  });
}
