/**
 * Modelos 3D y Des-proyección Espacial Precisa para Focal 3D
 * Genera mallas alámbricas 3D canónicas y reconstruye los trazos 2D del usuario
 * en el espacio 3D real manteniendo sus proporciones exactas y fidelidad a mano alzada.
 */

import { Vector3D, WireframeModel3D, UserStroke3D, Point2D } from '../perspective3d/types';
import { v3 } from '../perspective3d/math3d';
import { Focal3DShapeType, Focal3DChallenge, PrecalculatedShape3D } from './types';

function dist2D(a: Point2D, b: Point2D): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function dist3D(a: Vector3D, b: Vector3D): number {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

export interface Curve3DMeta {
  curveId: string;
  start3D: Vector3D;
  end3D: Vector3D;
  isStraight: boolean;
  points3D?: Vector3D[];
}

export interface Shape3DStructure {
  model: WireframeModel3D;
  curvesMeta: Map<string, Curve3DMeta>;
  groundY: number;
}

/**
 * Genera la geometría canónica 3D de la figura y el mapeo de cada arista/curva 2D a sus coordenadas 3D.
 */
export function getShape3DStructure(
  type: Focal3DShapeType,
  shape?: PrecalculatedShape3D
): Shape3DStructure {
  const curvesMeta = new Map<string, Curve3DMeta>();

  if (type === 'CUBE') {
    // Proporciones canónicas basadas en la figura del reto si está disponible
    let w = 0.85;
    let h = 0.85;
    let d = 0.85;

    if (shape && shape.frontVertices && shape.frontVertices.length >= 4) {
      const v0_2D = shape.frontVertices[0];
      const v1_2D = shape.frontVertices[1];
      const v2_2D = shape.frontVertices[2];
      const w2d = dist2D(v0_2D, v1_2D);
      const h2d = dist2D(v1_2D, v2_2D);
      const max2D = Math.max(w2d, h2d, 30);
      w = (w2d / max2D) * 0.88;
      h = (h2d / max2D) * 0.88;
      d = 0.85;
    }

    const v0 = v3(-w, -h, d);  // 0: frente abajo izq
    const v1 = v3(w, -h, d);   // 1: frente abajo der
    const v2 = v3(w, h, d);    // 2: frente arriba der
    const v3_pt = v3(-w, h, d);// 3: frente arriba izq
    const b0 = v3(-w, -h, -d); // 4: atrás abajo izq
    const b1 = v3(w, -h, -d);  // 5: atrás abajo der
    const b2 = v3(w, h, -d);   // 6: atrás arriba der
    const b3 = v3(-w, h, -d);  // 7: atrás arriba izq

    const vertices: Vector3D[] = [v0, v1, v2, v3_pt, b0, b1, b2, b3];
    const edges: [number, number][] = [
      [0, 1], [1, 2], [2, 3], [3, 0], // Cara frontal
      [4, 5], [5, 6], [6, 7], [7, 4], // Cara trasera
      [0, 4], [1, 5], [2, 6], [3, 7], // 4 aristas de profundidad
    ];

    // Mapeo unívoco de curvas 2D a segmentos 3D
    const addMeta = (idSuffix: string, start: Vector3D, end: Vector3D) => {
      curvesMeta.set(idSuffix, {
        curveId: idSuffix,
        start3D: start,
        end3D: end,
        isStraight: true,
      });
    };

    addMeta('f0', v0, v1);
    addMeta('f1', v1, v2);
    addMeta('f2', v2, v3_pt);
    addMeta('f3', v3_pt, v0);

    addMeta('d0', v3_pt, b3);
    addMeta('d1', v2, b2);
    addMeta('d2', v0, b0);
    addMeta('d3', v1, b1);

    addMeta('b0', b2, b3);
    addMeta('b1', b0, b1);
    addMeta('b2', b1, b2);
    addMeta('b3', b3, b0);

    addMeta('anc-w', v0, v1);
    addMeta('anc-h', v0, v3_pt);
    addMeta('anc-d', v0, b0);

    return {
      model: { vertices, edges },
      curvesMeta,
      groundY: -h - 0.25,
    };
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
    frontRing.push(frontRing[0]);
    backRing.push(backRing[0]);

    const heightAxis: Vector3D[] = [v3(0, 0, halfH), v3(0, 0, -halfH)];
    const leftSide: Vector3D[] = [v3(-R, 0, halfH), v3(-R, 0, -halfH)];
    const rightSide: Vector3D[] = [v3(R, 0, halfH), v3(R, 0, -halfH)];
    const topSide: Vector3D[] = [v3(0, R, halfH), v3(0, R, -halfH)];
    const bottomSide: Vector3D[] = [v3(0, -R, halfH), v3(0, -R, -halfH)];

    curvesMeta.set('front-ellipse', {
      curveId: 'front-ellipse',
      start3D: frontRing[0],
      end3D: frontRing[frontRing.length - 1],
      isStraight: false,
      points3D: frontRing,
    });
    curvesMeta.set('back-ellipse', {
      curveId: 'back-ellipse',
      start3D: backRing[0],
      end3D: backRing[backRing.length - 1],
      isStraight: false,
      points3D: backRing,
    });
    curvesMeta.set('tan1', {
      curveId: 'tan1',
      start3D: rightSide[0],
      end3D: rightSide[1],
      isStraight: true,
    });
    curvesMeta.set('tan2', {
      curveId: 'tan2',
      start3D: leftSide[0],
      end3D: leftSide[1],
      isStraight: true,
    });
    curvesMeta.set('axis', {
      curveId: 'axis',
      start3D: heightAxis[0],
      end3D: heightAxis[1],
      isStraight: true,
    });
    curvesMeta.set('radius', {
      curveId: 'radius',
      start3D: v3(0, 0, halfH),
      end3D: v3(R, 0, halfH),
      isStraight: true,
    });
    curvesMeta.set('anc-axis', {
      curveId: 'anc-axis',
      start3D: heightAxis[0],
      end3D: heightAxis[1],
      isStraight: true,
    });
    curvesMeta.set('anc-radius', {
      curveId: 'anc-radius',
      start3D: v3(0, 0, halfH),
      end3D: v3(R, 0, halfH),
      isStraight: true,
    });

    return {
      model: {
        vertices: [v3(-R, 0, halfH), v3(R, 0, halfH), v3(0, 0, halfH), v3(0, 0, -halfH)],
        edges: [],
        rings: [frontRing, backRing, heightAxis],
        tangentRings: [leftSide, rightSide, topSide, bottomSide],
      },
      curvesMeta,
      groundY: -R - 0.25,
    };
  }

  if (type === 'TRIANGULAR_PRISM') {
    const w = 0.9;
    const h = 0.95;
    const d = 0.9;

    const v0 = v3(0, h, d);
    const v1 = v3(w, -h * 0.6, d);
    const v2 = v3(-w, -h * 0.6, d);
    const b0 = v3(0, h, -d);
    const b1 = v3(w, -h * 0.6, -d);
    const b2 = v3(-w, -h * 0.6, -d);

    const vertices: Vector3D[] = [v0, v1, v2, b0, b1, b2];
    const edges: [number, number][] = [
      [0, 1], [1, 2], [2, 0],
      [3, 4], [4, 5], [5, 3],
      [0, 3], [1, 4], [2, 5],
    ];

    const addMeta = (idSuffix: string, start: Vector3D, end: Vector3D) => {
      curvesMeta.set(idSuffix, { curveId: idSuffix, start3D: start, end3D: end, isStraight: true });
    };

    addMeta('tf0', v0, v1);
    addMeta('tf1', v1, v2);
    addMeta('tf2', v2, v0);

    addMeta('td0', v0, b0);
    addMeta('td1', v1, b1);
    addMeta('td2', v2, b2);

    addMeta('tb0', b0, b1);
    addMeta('tb1', b1, b2);
    addMeta('tb2', b2, b0);

    addMeta('anc-td0', v0, b0);

    return {
      model: { vertices, edges },
      curvesMeta,
      groundY: -h * 0.6 - 0.25,
    };
  }

  if (type === 'PYRAMID') {
    const w = 0.85;
    const h = 0.75;
    const d = 0.85;
    const apexZ = 1.05;

    const v0 = v3(-w, -h, -d);
    const v1 = v3(w, -h, -d);
    const v2 = v3(w, h, -d);
    const v3_pt = v3(-w, h, -d);
    const apex = v3(0, 0, apexZ);

    const vertices: Vector3D[] = [v0, v1, v2, v3_pt, apex];
    const edges: [number, number][] = [
      [0, 1], [1, 2], [2, 3], [3, 0],
      [0, 4], [1, 4], [2, 4], [3, 4],
    ];

    const addMeta = (idSuffix: string, start: Vector3D, end: Vector3D) => {
      curvesMeta.set(idSuffix, { curveId: idSuffix, start3D: start, end3D: end, isStraight: true });
    };

    addMeta('pyr-b0', v0, v1);
    addMeta('pyr-b1', v1, v2);
    addMeta('pyr-b2', v2, v3_pt);
    addMeta('pyr-b3', v3_pt, v0);

    addMeta('pyr-a0', v0, apex);
    addMeta('pyr-a1', v1, apex);
    addMeta('pyr-a2', v2, apex);
    addMeta('pyr-a3', v3_pt, apex);

    addMeta('anc-pyr-axis', v3(0, 0, -d), apex);

    return {
      model: { vertices, edges },
      curvesMeta,
      groundY: -h - 0.25,
    };
  }

  // HEXAGON_PRISM o default
  const R = 0.85;
  const d = 0.85;
  const vertices: Vector3D[] = [];
  const edges: [number, number][] = [];

  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    vertices.push(v3(R * Math.cos(a), R * Math.sin(a), d));
  }
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    vertices.push(v3(R * Math.cos(a), R * Math.sin(a), -d));
  }

  for (let i = 0; i < 6; i++) {
    edges.push([i, (i + 1) % 6]);
    edges.push([i + 6, ((i + 1) % 6) + 6]);
    edges.push([i, i + 6]);
  }

  for (let i = 0; i < 6; i++) {
    const vCurr = vertices[i];
    const vNext = vertices[(i + 1) % 6];
    const bCurr = vertices[i + 6];
    const bNext = vertices[((i + 1) % 6) + 6];

    curvesMeta.set(`hxf${i}`, { curveId: `hxf${i}`, start3D: vCurr, end3D: vNext, isStraight: true });
    curvesMeta.set(`hxd${i}`, { curveId: `hxd${i}`, start3D: vCurr, end3D: bCurr, isStraight: true });
    curvesMeta.set(`hxb${i}`, { curveId: `hxb${i}`, start3D: bCurr, end3D: bNext, isStraight: true });
  }
  curvesMeta.set('anc-hxd0', { curveId: 'anc-hxd0', start3D: vertices[0], end3D: vertices[6], isStraight: true });

  return {
    model: { vertices, edges },
    curvesMeta,
    groundY: -R - 0.25,
  };
}

/**
 * Genera el modelo alámbrico 3D canónico (WireframeModel3D) para cada tipo de figura de Focal 3D
 */
export function getFocal3DWireframeModel(
  type: Focal3DShapeType,
  shape?: PrecalculatedShape3D
): WireframeModel3D {
  return getShape3DStructure(type, shape).model;
}

export interface UnprojectedFocalStroke3D {
  points3D: Vector3D[];
  isConstruction?: boolean;
}

/**
 * Eleva con precisión milimétrica los trazos 2D del usuario al espacio 3D.
 * Empareja cada trazo del alumno con la arista/curva correspondiente del modelo 3D
 * y preserva fielmente la textura, ondulación y expresión del dibujo a mano alzada.
 */
export function unprojectFocalStrokesTo3D(
  strokes: UserStroke3D[],
  challenge: Focal3DChallenge,
  activeShape?: PrecalculatedShape3D
): UnprojectedFocalStroke3D[] {
  const shape = activeShape || challenge.shapes[0];
  if (!shape) return [];

  const { curvesMeta } = getShape3DStructure(shape.type, shape);

  // Lista combinada de todas las curvas del reto
  const candidateCurves = [...shape.allCurves, ...(shape.anchorCurves || [])];

  return strokes.map((s) => {
    const pts = s.points;
    const n = pts.length;
    if (n < 2) {
      return {
        points3D: pts.map(() => v3(0, 0, 0)),
        isConstruction: s.isConstruction,
      };
    }

    const pStart = pts[0];
    const pEnd = pts[n - 1];
    const sDirX = pEnd.x - pStart.x;
    const sDirY = pEnd.y - pStart.y;
    const sLen = Math.hypot(sDirX, sDirY);
    const uDirX = sLen > 0.001 ? sDirX / sLen : 1;
    const uDirY = sLen > 0.001 ? sDirY / sLen : 0;

    // Buscar la curva del reto que mejor se alinea y coincide con este trazo
    let bestCurve = candidateCurves[0];
    let bestMeta: Curve3DMeta | undefined;
    let bestScore = -1;

    for (const c of candidateCurves) {
      if (!c.points || c.points.length < 2) continue;

      // Buscar si tenemos metadata 3D para esta curva
      let matchedMeta: Curve3DMeta | undefined;
      for (const [key, meta] of curvesMeta.entries()) {
        if (c.id.endsWith(key) || c.id.includes(key)) {
          matchedMeta = meta;
          break;
        }
      }

      const sampleCount = Math.min(6, n);
      let totalDist = 0;
      for (let k = 0; k < sampleCount; k++) {
        const pt = pts[Math.floor((k / (sampleCount - 1)) * (n - 1))];
        let minDist = Infinity;
        for (let j = 0; j < c.points.length - 1; j++) {
          const a = c.points[j];
          const b = c.points[j + 1];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const l2 = dx * dx + dy * dy;
          const alpha = l2 > 0.0001 ? Math.max(0, Math.min(1, ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / l2)) : 0;
          const d = Math.hypot(pt.x - (a.x + alpha * dx), pt.y - (a.y + alpha * dy));
          if (d < minDist) minDist = d;
        }
        totalDist += minDist;
      }
      const avgDist = totalDist / sampleCount;

      const cStart = c.points[0];
      const cEnd = c.points[c.points.length - 1];
      const cLen = Math.hypot(cEnd.x - cStart.x, cEnd.y - cStart.y);
      const cDirX = cLen > 0.001 ? (cEnd.x - cStart.x) / cLen : 1;
      const cDirY = cLen > 0.001 ? (cEnd.y - cStart.y) / cLen : 0;
      const align = Math.abs(uDirX * cDirX + uDirY * cDirY);

      let score = (align + 0.1) / (1.0 + avgDist / 22.0);

      // Si el trazo es de construcción y la curva es de construcción, bonificar
      if (s.isConstruction && (c.role === 'construction' || c.id.includes('anc') || c.id.includes('guide'))) {
        score *= 1.25;
      } else if (!s.isConstruction && (c.role === 'construction' || c.id.includes('guide'))) {
        score *= 0.65;
      }

      if (matchedMeta) score *= 1.2;

      if (score > bestScore) {
        bestScore = score;
        bestCurve = c;
        bestMeta = matchedMeta;
      }
    }

    // Reconstruir en 3D
    const c2Start = bestCurve.points[0];
    const c2End = bestCurve.points[bestCurve.points.length - 1];
    const c2Len = Math.hypot(c2End.x - c2Start.x, c2End.y - c2Start.y);

    if (bestMeta && bestMeta.isStraight) {
      // Segmento recto 3D: orientar sentido de avance
      const dFwd = dist2D(pStart, c2Start) + dist2D(pEnd, c2End);
      const dRev = dist2D(pStart, c2End) + dist2D(pEnd, c2Start);
      const isFwd = dFwd <= dRev;

      const s2D = isFwd ? c2Start : c2End;
      const e2D = isFwd ? c2End : c2Start;
      const s3D = isFwd ? bestMeta.start3D : bestMeta.end3D;
      const e3D = isFwd ? bestMeta.end3D : bestMeta.start3D;

      const vx = e2D.x - s2D.x;
      const vy = e2D.y - s2D.y;
      const l2 = Math.max(0.001, vx * vx + vy * vy);
      const l2d = Math.sqrt(l2);
      const l3d = dist3D(s3D, e3D);
      const scale = l3d / Math.max(l2d, 1);

      // Vector normal unitario a la arista en 2D
      const n2x = -vy / l2d;
      const n2y = vx / l2d;

      // Vector normal correspondiente en 3D
      const e3dx = (e3D.x - s3D.x) / Math.max(l3d, 0.001);
      const e3dy = (e3D.y - s3D.y) / Math.max(l3d, 0.001);

      let norm3D: Vector3D;
      if (Math.abs(e3dx) > 0.65) {
        norm3D = v3(0, 1, 0); // Arista horizontal: normal vertical
      } else if (Math.abs(e3dy) > 0.65) {
        norm3D = v3(1, 0, 0); // Arista vertical: normal horizontal
      } else {
        norm3D = v3(n2x * 0.7, -n2y * 0.7, 0); // Arista de profundidad
      }

      const points3D: Vector3D[] = pts.map((pt, i) => {
        const uIdx = n > 1 ? i / (n - 1) : 0;
        const uProj = ((pt.x - s2D.x) * vx + (pt.y - s2D.y) * vy) / l2;
        const u = 0.5 * uIdx + 0.5 * Math.max(-0.05, Math.min(1.05, uProj));

        // Punto base sobre la arista ideal 3D
        const base = v3(
          (1 - u) * s3D.x + u * e3D.x,
          (1 - u) * s3D.y + u * e3D.y,
          (1 - u) * s3D.z + u * e3D.z
        );

        // Desviación de mano alzada del alumno
        const qx = s2D.x + u * vx;
        const qy = s2D.y + u * vy;
        const dev = (pt.x - qx) * n2x + (pt.y - qy) * n2y;
        const wobble = dev * scale * 0.7;

        return v3(
          base.x + norm3D.x * wobble,
          base.y + norm3D.y * wobble,
          base.z + norm3D.z * wobble
        );
      });

      return {
        points3D,
        isConstruction: s.isConstruction,
      };
    }

    if (bestMeta && !bestMeta.isStraight && bestMeta.points3D && bestMeta.points3D.length > 2) {
      // Curva cerrada (elipse / anillo de cilindro)
      const ring3D = bestMeta.points3D;
      const ring2D = bestCurve.points;
      const cnt = Math.min(ring3D.length, ring2D.length);

      const points3D: Vector3D[] = pts.map((pt) => {
        let bestJ = 0;
        let minD = Infinity;
        for (let j = 0; j < cnt; j++) {
          const d = dist2D(pt, ring2D[j]);
          if (d < minD) {
            minD = d;
            bestJ = j;
          }
        }

        const ref3D = ring3D[bestJ];
        const ref2D = ring2D[bestJ];
        const devX = (pt.x - ref2D.x) * 0.007;
        const devY = -(pt.y - ref2D.y) * 0.007;

        return v3(ref3D.x + devX, ref3D.y + devY, ref3D.z);
      });

      return {
        points3D,
        isConstruction: s.isConstruction,
      };
    }

    // Fallback proporcionado en el espacio de la figura
    const center = shape.centerPos;
    const maxExtent = Math.max(c2Len, 60);
    const scale = 0.85 / maxExtent;
    const zDefault = 0.5;

    return {
      points3D: pts.map((pt) =>
        v3(
          (pt.x - center.x) * scale,
          -(pt.y - center.y) * scale,
          zDefault
        )
      ),
      isConstruction: s.isConstruction,
    };
  });
}
