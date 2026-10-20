/**
 * Generador Procedural para el Laboratorio de Perspectiva con 1 Punto Focal (Focal 3D)
 * Calcula matemáticamente el punto focal central, los 8 rayos radiales y las formas 3D precalculadas
 * cuyas aristas de profundidad convergen con exactitud milimétrica hacia el punto focal.
 */

import { Point2D, CurveSegment2D } from '../perspective3d/types';
import {
  Focal3DShapeType,
  FocalRay,
  PrecalculatedShape3D,
  Focal3DChallenge,
  FocalPracticeMode,
  FocalWheelDensity,
} from './types';

function dist(p1: Point2D, p2: Point2D): number {
  return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}

function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9999.12345) * 10000;
  return x - Math.floor(x);
}

function makeLineCurve(id: string, p1: Point2D, p2: Point2D, label: string, role: 'form' | 'construction' = 'form', style: 'solid' | 'dashed' = 'solid'): CurveSegment2D {
  const STEPS = 12;
  const points: Point2D[] = [];
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS;
    points.push({
      x: p1.x + (p2.x - p1.x) * t,
      y: p1.y + (p2.y - p1.y) * t,
    });
  }
  return {
    id,
    points,
    isGiven: false,
    label,
    role,
    style,
  };
}

function makeEllipseCurve(id: string, center: Point2D, u: Point2D, v: Point2D, radiusU: number, radiusV: number, label: string, isFull = true): CurveSegment2D {
  const STEPS = 32;
  const points: Point2D[] = [];
  const maxAngle = isFull ? Math.PI * 2 : Math.PI;
  for (let i = 0; i <= STEPS; i++) {
    const theta = (i / STEPS) * maxAngle;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    points.push({
      x: center.x + radiusU * cosT * u.x + radiusV * sinT * v.x,
      y: center.y + radiusU * cosT * u.y + radiusV * sinT * v.y,
    });
  }
  return {
    id,
    points,
    isGiven: false,
    label,
    role: 'form',
    style: 'solid',
  };
}

/**
 * Genera una forma 3D precalculada en un sector determinado (0 a 7)
 * con dimensiones irregulares/variables y la mínima información indispensable de anclaje.
 */
function buildPrecalculatedShape(
  sectorIndex: number,
  type: Focal3DShapeType,
  focalPoint: Point2D,
  baseRadius: number,
  seed: number,
  scaleFactor = 1.0,
  totalShapeCount = 8,
  customAngleDeg?: number,
  customDist?: number
): PrecalculatedShape3D {
  // Variación pseudoaleatoria determinista según seed y sector
  const rnd1 = seededRandom(seed * 17 + sectorIndex * 73 + 1);
  const rnd2 = seededRandom(seed * 29 + sectorIndex * 89 + 2);
  const rnd3 = seededRandom(seed * 41 + sectorIndex * 101 + 3);
  const rndDist = seededRandom(seed * 53 + sectorIndex * 113 + 4);

  // Distancia variable desde el punto focal para dar profundidad orgánica al conjunto.
  // En rueda de 8 formas adyacentes, la variación radial es suave (0.08) para evitar solapes entre esquinas.
  const distVariation = totalShapeCount >= 8 ? 0.08 : 0.16;
  const shapeDist = customDist !== undefined ? customDist : baseRadius * (0.92 + rndDist * distVariation);

  // Ángulo del sector: personalizado si se pasa (modo horizonte), o centrado a (+22.5°) en la rueda
  const angleDeg = customAngleDeg !== undefined ? customAngleDeg : (sectorIndex * 45 + 22.5) % 360;
  const angleRad = (angleDeg * Math.PI) / 180;

  // Centro de la cara frontal (más alejada del punto focal)
  const centerPos: Point2D = {
    x: focalPoint.x + shapeDist * Math.cos(angleRad),
    y: focalPoint.y + shapeDist * Math.sin(angleRad),
  };

  // Vector radial normalizado hacia el punto focal F
  const dF = dist(centerPos, focalPoint);
  const uRad: Point2D = {
    x: (focalPoint.x - centerPos.x) / dF,
    y: (focalPoint.y - centerPos.y) / dF,
  };
  // Vector perpendicular transversal
  const vPerp: Point2D = {
    x: -uRad.y,
    y: uRad.x,
  };

  // Restricción angular transversal máxima de seguridad:
  // En 1 o 2 formas grandes, se amplía a 38° para permitir figuras de gran escala sin restricciones artificiales.
  const maxAngularDeg = totalShapeCount >= 8 ? 13.5 : totalShapeCount >= 4 ? 24.0 : 38.0;
  const maxHalfW = shapeDist * Math.tan((maxAngularDeg * Math.PI) / 180);

  const frontCurves: CurveSegment2D[] = [];
  const backCurves: CurveSegment2D[] = [];
  const depthCurves: CurveSegment2D[] = [];
  let axisCurve: CurveSegment2D | undefined;
  let radiusCurve: CurveSegment2D | undefined;
  const guidelinesToFocal: CurveSegment2D[] = [];
  const anchorCurves: CurveSegment2D[] = [];
  let frontVertices: Point2D[] = [];
  let anchorVertices: Point2D[] = [];

  const prefix = `s${sectorIndex}-${type.toLowerCase()}`;

  if (type === 'CUBE') {
    // CUBO / PRISMA RECTANGULAR:
    // Dimensiones de gran formato y proporciones variables
    const rawHalfW = Math.round((28 + rnd1 * 26) * scaleFactor);
    const halfW = Math.min(rawHalfW, Math.round(maxHalfW));
    const rawHalfH = Math.round((26 + rnd2 * 24) * scaleFactor);
    const halfH = Math.min(rawHalfH, Math.round(shapeDist * 0.44));
    const depthFactor = 0.22 + rnd3 * 0.16;

    const v0: Point2D = { x: centerPos.x - halfW * vPerp.x - halfH * uRad.x, y: centerPos.y - halfW * vPerp.y - halfH * uRad.y };
    const v1: Point2D = { x: centerPos.x + halfW * vPerp.x - halfH * uRad.x, y: centerPos.y + halfW * vPerp.y - halfH * uRad.y };
    const v2: Point2D = { x: centerPos.x + halfW * vPerp.x + halfH * uRad.x, y: centerPos.y + halfW * vPerp.y + halfH * uRad.y };
    const v3: Point2D = { x: centerPos.x - halfW * vPerp.x + halfH * uRad.x, y: centerPos.y - halfW * vPerp.y + halfH * uRad.y };
    const frontVerts = [v0, v1, v2, v3];
    frontVertices = frontVerts;

    // Cara trasera convergente hacia el punto focal F
    const backVerts = frontVerts.map((v) => ({
      x: v.x + depthFactor * (focalPoint.x - v.x),
      y: v.y + depthFactor * (focalPoint.y - v.y),
    }));

    // 4 Aristas frontales completas (solución para evaluación y ayudas)
    frontCurves.push(
      makeLineCurve(`${prefix}-f0`, frontVerts[0], frontVerts[1], 'Arista frontal 1'),
      makeLineCurve(`${prefix}-f1`, frontVerts[1], frontVerts[2], 'Arista frontal 2'),
      makeLineCurve(`${prefix}-f2`, frontVerts[2], frontVerts[3], 'Arista frontal 3'),
      makeLineCurve(`${prefix}-f3`, frontVerts[3], frontVerts[0], 'Arista frontal 4')
    );

    // 3 aristas de profundidad visibles hacia el punto focal
    const orderedIndices = [0, 1, 2, 3].sort((a, b) => dist(frontVerts[a], focalPoint) - dist(frontVerts[b], focalPoint));
    const visibleDepthIndices = orderedIndices.slice(0, 3);

    visibleDepthIndices.forEach((idx, i) => {
      depthCurves.push(
        makeLineCurve(
          `${prefix}-d${i}`,
          frontVerts[idx],
          backVerts[idx],
          `Línea de fuga ${i + 1} al punto focal`
        )
      );
      // Rayo guía prolongado hasta el punto focal (para cuando se activan las ayudas)
      guidelinesToFocal.push(
        makeLineCurve(
          `${prefix}-guide-${i}`,
          frontVerts[idx],
          focalPoint,
          `Guía de convergencia ${i + 1}`,
          'construction',
          'dashed'
        )
      );
    });

    backCurves.push(
      makeLineCurve(`${prefix}-b0`, backVerts[visibleDepthIndices[0]], backVerts[visibleDepthIndices[1]], 'Arista trasera 1'),
      makeLineCurve(`${prefix}-b1`, backVerts[visibleDepthIndices[1]], backVerts[visibleDepthIndices[2]], 'Arista trasera 2')
    );

    // MÍNIMA INFORMACIÓN INDISPENSABLE SIN AYUDAS (3 ARISTAS EN UN VÉRTICE: ANCHO, ALTO Y PROFUNDIDAD)
    // El usuario tiene exactamente las 3 aristas concurrentes necesarias para construir el prisma:
    // 1. Arista de ancho (v0 -> v1)
    // 2. Arista de alto (v0 -> v3)
    // 3. Arista de profundidad (v0 -> backVerts[0]) con guía hacia el punto focal
    anchorCurves.push(
      makeLineCurve(`${prefix}-anc-w`, v0, v1, 'Arista de ancho', 'construction', 'solid'),
      makeLineCurve(`${prefix}-anc-h`, v0, v3, 'Arista de alto', 'construction', 'solid'),
      makeLineCurve(`${prefix}-anc-d`, v0, backVerts[0], 'Arista de profundidad', 'construction', 'dashed'),
      makeLineCurve(`${prefix}-anc-ray`, backVerts[0], focalPoint, 'Guía de fuga al punto focal', 'construction', 'dashed')
    );
    anchorVertices = [v0, v1, v3, backVerts[0]];

  } else if (type === 'CYLINDER') {
    // CILINDRO: Dimensiones variables de gran escala
    const rawRadiusV = Math.round((28 + rnd1 * 24) * scaleFactor);
    const radiusV = Math.min(rawRadiusV, Math.round(maxHalfW));
    const rawRadiusU = Math.round((16 + rnd2 * 14) * scaleFactor);
    const radiusU = Math.min(rawRadiusU, Math.round(shapeDist * 0.32));
    const depthFactor = 0.22 + rnd3 * 0.16;

    frontCurves.push(makeEllipseCurve(`${prefix}-front-ellipse`, centerPos, vPerp, uRad, radiusV, radiusU, 'Elipse frontal base'));

    const backCenter: Point2D = {
      x: centerPos.x + depthFactor * (focalPoint.x - centerPos.x),
      y: centerPos.y + depthFactor * (focalPoint.y - centerPos.y),
    };
    const backRadiusV = radiusV * (1 - depthFactor);
    const backRadiusU = radiusU * (1 - depthFactor);

    backCurves.push(makeEllipseCurve(`${prefix}-back-ellipse`, backCenter, vPerp, uRad, backRadiusV, backRadiusU, 'Elipse trasera'));

    const tan1Front: Point2D = { x: centerPos.x + radiusV * vPerp.x, y: centerPos.y + radiusV * vPerp.y };
    const tan2Front: Point2D = { x: centerPos.x - radiusV * vPerp.x, y: centerPos.y - radiusV * vPerp.y };
    const tan1Back: Point2D = { x: backCenter.x + backRadiusV * vPerp.x, y: backCenter.y + backRadiusV * vPerp.y };
    const tan2Back: Point2D = { x: backCenter.x - backRadiusV * vPerp.x, y: backCenter.y - backRadiusV * vPerp.y };

    depthCurves.push(
      makeLineCurve(`${prefix}-tan1`, tan1Front, tan1Back, 'Generatriz lateral 1 hacia punto focal'),
      makeLineCurve(`${prefix}-tan2`, tan2Front, tan2Back, 'Generatriz lateral 2 hacia punto focal')
    );

    axisCurve = makeLineCurve(`${prefix}-axis`, centerPos, backCenter, 'Eje central cilíndrico');
    radiusCurve = makeLineCurve(`${prefix}-radius`, centerPos, tan1Front, 'Radio de la elipse frontal');

    guidelinesToFocal.push(
      makeLineCurve(`${prefix}-axis-guide`, centerPos, focalPoint, 'Guía de eje central al punto focal', 'construction', 'dashed'),
      makeLineCurve(`${prefix}-tan1-guide`, tan1Front, focalPoint, 'Guía lateral 1 al punto focal', 'construction', 'dashed'),
      makeLineCurve(`${prefix}-tan2-guide`, tan2Front, focalPoint, 'Guía lateral 2 al punto focal', 'construction', 'dashed')
    );

    // MÍNIMA INFORMACIÓN INDISPENSABLE EN CILINDRO:
    // Eje central hacia el punto focal + Radio de dimensión
    anchorCurves.push(
      makeLineCurve(`${prefix}-anc-axis`, centerPos, focalPoint, 'Eje central al punto focal', 'construction', 'dashed'),
      makeLineCurve(`${prefix}-anc-radius`, centerPos, tan1Front, 'Radio de dimensión', 'construction', 'solid')
    );
    frontVertices = [centerPos, tan1Front];
    anchorVertices = [centerPos, tan1Front];

  } else if (type === 'TRIANGULAR_PRISM') {
    // PRISMA TRIANGULAR: Proporciones variables de gran formato
    const rawHalfW = Math.round((28 + rnd1 * 26) * scaleFactor);
    const halfW = Math.min(rawHalfW, Math.round(maxHalfW));
    const rawH = Math.round((32 + rnd2 * 26) * scaleFactor);
    const h = Math.min(rawH, Math.round(shapeDist * 0.46));
    const depthFactor = 0.22 + rnd3 * 0.16;

    const v0: Point2D = { x: centerPos.x, y: centerPos.y - h * uRad.y };
    const v1: Point2D = { x: centerPos.x + halfW * vPerp.x + (h * 0.5) * uRad.x, y: centerPos.y + halfW * vPerp.y + (h * 0.5) * uRad.y };
    const v2: Point2D = { x: centerPos.x - halfW * vPerp.x + (h * 0.5) * uRad.x, y: centerPos.y - halfW * vPerp.y + (h * 0.5) * uRad.y };
    const frontVerts = [v0, v1, v2];
    frontVertices = frontVerts;

    const backVerts = frontVerts.map((v) => ({
      x: v.x + depthFactor * (focalPoint.x - v.x),
      y: v.y + depthFactor * (focalPoint.y - v.y),
    }));

    frontCurves.push(
      makeLineCurve(`${prefix}-tf0`, frontVerts[0], frontVerts[1], 'Cara triangular 1'),
      makeLineCurve(`${prefix}-tf1`, frontVerts[1], frontVerts[2], 'Cara triangular 2'),
      makeLineCurve(`${prefix}-tf2`, frontVerts[2], frontVerts[0], 'Cara triangular 3')
    );

    for (let i = 0; i < 3; i++) {
      depthCurves.push(makeLineCurve(`${prefix}-td${i}`, frontVerts[i], backVerts[i], `Línea de fuga triangular ${i + 1}`));
      guidelinesToFocal.push(makeLineCurve(`${prefix}-tguide-${i}`, frontVerts[i], focalPoint, `Guía de fuga ${i + 1}`, 'construction', 'dashed'));
    }

    backCurves.push(
      makeLineCurve(`${prefix}-tb0`, backVerts[0], backVerts[1], 'Arista trasera 1'),
      makeLineCurve(`${prefix}-tb1`, backVerts[1], backVerts[2], 'Arista trasera 2'),
      makeLineCurve(`${prefix}-tb2`, backVerts[2], backVerts[0], 'Arista trasera 3')
    );

    // MÍNIMA INFORMACIÓN INDISPENSABLE EN PRISMAS TRIANGULARES:
    // En la cara frontal aparecen SOLO LOS VÉRTICES (puntos) + 1 arista de profundidad hacia el punto focal
    anchorCurves.push(
      makeLineCurve(`${prefix}-anc-td0`, v0, backVerts[0], 'Arista de profundidad', 'construction', 'dashed'),
      makeLineCurve(`${prefix}-anc-tray0`, backVerts[0], focalPoint, 'Guía de fuga al punto focal', 'construction', 'dashed')
    );
    anchorVertices = [...frontVerts, backVerts[0]];

  } else if (type === 'PYRAMID') {
    // PIRÁMIDE: Proporciones variables de gran formato
    const rawHalfW = Math.round((30 + rnd1 * 26) * scaleFactor);
    const halfW = Math.min(rawHalfW, Math.round(maxHalfW));
    const rawHalfH = Math.round((26 + rnd2 * 24) * scaleFactor);
    const halfH = Math.min(rawHalfH, Math.round(shapeDist * 0.42));
    const depthFactor = 0.22 + rnd3 * 0.16;

    const v0: Point2D = { x: centerPos.x - halfW * vPerp.x - halfH * 0.7 * uRad.x, y: centerPos.y - halfW * vPerp.y - halfH * 0.7 * uRad.y };
    const v1: Point2D = { x: centerPos.x + halfW * vPerp.x - halfH * 0.7 * uRad.x, y: centerPos.y + halfW * vPerp.y - halfH * 0.7 * uRad.y };
    const v2: Point2D = { x: centerPos.x + halfW * 0.8 * vPerp.x + halfH * 0.7 * uRad.x, y: centerPos.y + halfW * 0.8 * vPerp.y + halfH * 0.7 * uRad.y };
    const v3: Point2D = { x: centerPos.x - halfW * 0.8 * vPerp.x + halfH * 0.7 * uRad.x, y: centerPos.y - halfW * 0.8 * vPerp.y + halfH * 0.7 * uRad.y };
    const frontVerts = [v0, v1, v2, v3];
    frontVertices = frontVerts;

    frontCurves.push(
      makeLineCurve(`${prefix}-pyr-b0`, v0, v1, 'Base piramidal 1'),
      makeLineCurve(`${prefix}-pyr-b1`, v1, v2, 'Base piramidal 2'),
      makeLineCurve(`${prefix}-pyr-b2`, v2, v3, 'Base piramidal 3'),
      makeLineCurve(`${prefix}-pyr-b3`, v3, v0, 'Base piramidal 4')
    );

    const apex: Point2D = {
      x: centerPos.x + (depthFactor * 1.3) * (focalPoint.x - centerPos.x),
      y: centerPos.y + (depthFactor * 1.3) * (focalPoint.y - centerPos.y),
    };

    depthCurves.push(
      makeLineCurve(`${prefix}-pyr-a0`, v0, apex, 'Arista al ápice 1'),
      makeLineCurve(`${prefix}-pyr-a1`, v1, apex, 'Arista al ápice 2'),
      makeLineCurve(`${prefix}-pyr-a2`, v2, apex, 'Arista al ápice 3'),
      makeLineCurve(`${prefix}-pyr-a3`, v3, apex, 'Arista al ápice 4')
    );

    guidelinesToFocal.push(makeLineCurve(`${prefix}-pyr-guide`, apex, focalPoint, 'Eje focal de pirámide', 'construction', 'dashed'));

    // MÍNIMA INFORMACIÓN: Vértices de la base + 1 arista/eje al ápice hacia el punto focal
    anchorCurves.push(
      makeLineCurve(`${prefix}-anc-pyr-axis`, centerPos, apex, 'Arista al ápice', 'construction', 'dashed'),
      makeLineCurve(`${prefix}-anc-pyr-ray`, apex, focalPoint, 'Eje focal de ápice', 'construction', 'dashed')
    );
    anchorVertices = [...frontVerts, apex];

  } else {
    // HEXAGON_PRISM: Proporciones variables de gran formato
    const rawR = Math.round((28 + rnd1 * 26) * scaleFactor);
    const R = Math.min(rawR, Math.round(maxHalfW));
    const depthFactor = 0.22 + rnd3 * 0.16;

    const frontVerts: Point2D[] = [];
    for (let k = 0; k < 6; k++) {
      const a = (k * 60 * Math.PI) / 180;
      frontVerts.push({
        x: centerPos.x + R * Math.cos(a) * vPerp.x + R * Math.sin(a) * uRad.x,
        y: centerPos.y + R * Math.cos(a) * vPerp.y + R * Math.sin(a) * uRad.y,
      });
    }
    frontVertices = frontVerts;

    const backVerts = frontVerts.map((v) => ({
      x: v.x + depthFactor * (focalPoint.x - v.x),
      y: v.y + depthFactor * (focalPoint.y - v.y),
    }));

    for (let k = 0; k < 6; k++) {
      frontCurves.push(makeLineCurve(`${prefix}-hxf${k}`, frontVerts[k], frontVerts[(k + 1) % 6], `Cara hexagonal ${k + 1}`));
    }

    for (let k = 0; k < 4; k++) {
      depthCurves.push(makeLineCurve(`${prefix}-hxd${k}`, frontVerts[k], backVerts[k], `Línea de fuga hexagonal ${k + 1}`));
      guidelinesToFocal.push(makeLineCurve(`${prefix}-hxguide-${k}`, frontVerts[k], focalPoint, `Guía hexagonal ${k + 1}`, 'construction', 'dashed'));
    }

    for (let k = 0; k < 3; k++) {
      backCurves.push(makeLineCurve(`${prefix}-hxb${k}`, backVerts[k], backVerts[(k + 1) % 6], `Arista trasera hexagonal ${k + 1}`));
    }

    // MÍNIMA INFORMACIÓN EN HEXÁGONO: Vértices frontales + 1 arista de profundidad
    anchorCurves.push(
      makeLineCurve(`${prefix}-anc-hxd0`, frontVerts[0], backVerts[0], 'Arista de profundidad', 'construction', 'dashed'),
      makeLineCurve(`${prefix}-anc-hxray0`, backVerts[0], focalPoint, 'Guía de fuga al punto focal', 'construction', 'dashed')
    );
    anchorVertices = [...frontVerts, backVerts[0]];
  }

  // Colección total de curvas objetivo requeridas
  const allCurves: CurveSegment2D[] = [
    ...frontCurves,
    ...depthCurves,
    ...backCurves,
  ];
  if (axisCurve) allCurves.push(axisCurve);
  if (radiusCurve) allCurves.push(radiusCurve);

  const typeTitles: Record<Focal3DShapeType, string> = {
    CUBE: 'Cubo / Prisma Rectangular (3 Líneas de Fuga)',
    CYLINDER: 'Cilindro (Eje Central + Radio + Tangentes)',
    TRIANGULAR_PRISM: 'Prisma Triangular (3 Aristas de Fuga)',
    PYRAMID: 'Pirámide hacia Punto Focal',
    HEXAGON_PRISM: 'Prisma Hexagonal',
    MIXED_WHEEL: 'Rueda Completa 3D (Formas Variadas)',
  };

  return {
    id: `shape-${sectorIndex}-${type.toLowerCase()}-${seed}`,
    type,
    title: typeTitles[type] || 'Forma 3D hacia Punto Focal',
    sectorIndex,
    angleDeg,
    centerPos,
    frontVertices,
    anchorVertices,
    frontCurves,
    backCurves,
    depthCurves,
    axisCurve,
    radiusCurve,
    guidelinesToFocal,
    anchorCurves,
    allCurves,
  };
}

/**
 * Calcula la caja envolvente (AABB) de todos los vértices y puntos de control de una forma 3D
 */
function getShapeBounds(shape: PrecalculatedShape3D): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  const checkPt = (p: Point2D) => {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  };

  shape.frontVertices.forEach(checkPt);
  shape.anchorVertices.forEach(checkPt);
  shape.allCurves.forEach((c) => c.points.forEach(checkPt));

  return { minX, maxX, minY, maxY };
}

/**
 * Comprueba si dos formas 3D interfieren, se solapan o guardan una distancia menor al margen de seguridad
 */
function shapesInterfere(shapeA: PrecalculatedShape3D, shapeB: PrecalculatedShape3D, minClearance = 24): boolean {
  const bA = getShapeBounds(shapeA);
  const bB = getShapeBounds(shapeB);

  // Si las cajas delimitadoras con margen de holgura no se intersectan, están completamente libres
  if (
    bA.maxX + minClearance < bB.minX ||
    bB.maxX + minClearance < bA.minX ||
    bA.maxY + minClearance < bB.minY ||
    bB.maxY + minClearance < bA.minY
  ) {
    return false;
  }

  // Verificación detallada de proximidad punto a punto
  const ptsA: Point2D[] = [...shapeA.frontVertices, ...shapeA.anchorVertices];
  shapeA.allCurves.forEach((c) => {
    if (c.points.length > 0) {
      ptsA.push(c.points[0], c.points[c.points.length - 1]);
    }
  });

  const ptsB: Point2D[] = [...shapeB.frontVertices, ...shapeB.anchorVertices];
  shapeB.allCurves.forEach((c) => {
    if (c.points.length > 0) {
      ptsB.push(c.points[0], c.points[c.points.length - 1]);
    }
  });

  for (const pa of ptsA) {
    for (const pb of ptsB) {
      if (Math.hypot(pa.x - pb.x, pa.y - pb.y) < minClearance) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Escala y retrae de manera homotética una forma hacia su centro para resolver interferencias
 */
function shrinkShape(shape: PrecalculatedShape3D, factor = 0.88): void {
  const c = shape.centerPos;
  const scalePoint = (p: Point2D): Point2D => ({
    x: Math.round((c.x + (p.x - c.x) * factor) * 10) / 10,
    y: Math.round((c.y + (p.y - c.y) * factor) * 10) / 10,
  });

  shape.frontVertices = shape.frontVertices.map(scalePoint);
  shape.anchorVertices = shape.anchorVertices.map(scalePoint);
  shape.frontCurves.forEach((crv) => {
    crv.points = crv.points.map(scalePoint);
  });
  shape.backCurves.forEach((crv) => {
    crv.points = crv.points.map(scalePoint);
  });
  shape.depthCurves.forEach((crv) => {
    crv.points = crv.points.map(scalePoint);
  });
  shape.anchorCurves.forEach((crv) => {
    crv.points = crv.points.map(scalePoint);
  });
  if (shape.axisCurve) shape.axisCurve.points = shape.axisCurve.points.map(scalePoint);
  if (shape.radiusCurve) shape.radiusCurve.points = shape.radiusCurve.points.map(scalePoint);
  shape.allCurves.forEach((crv) => {
    crv.points = crv.points.map(scalePoint);
  });
}

/**
 * Ajusta y confina una forma precalculada dentro de los márgenes seguros de la pantalla,
 * garantizando que nunca quede tapada por la barra inferior de botones ni por el menú superior.
 */
function clampShapeToSafeArea(
  shape: PrecalculatedShape3D,
  safeMinX: number,
  safeMinY: number,
  safeMaxX: number,
  safeMaxY: number
): void {
  const bounds = getShapeBounds(shape);
  let shiftX = 0;
  let shiftY = 0;

  if (bounds.minX < safeMinX) shiftX = safeMinX - bounds.minX;
  else if (bounds.maxX > safeMaxX) shiftX = safeMaxX - bounds.maxX;

  if (bounds.minY < safeMinY) shiftY = safeMinY - bounds.minY;
  else if (bounds.maxY > safeMaxY) shiftY = safeMaxY - bounds.maxY;

  if (shiftX !== 0 || shiftY !== 0) {
    const shiftPoint = (p: Point2D): Point2D => ({
      x: Math.round((p.x + shiftX) * 10) / 10,
      y: Math.round((p.y + shiftY) * 10) / 10,
    });

    shape.centerPos = shiftPoint(shape.centerPos);
    shape.frontVertices = shape.frontVertices.map(shiftPoint);
    shape.anchorVertices = shape.anchorVertices.map(shiftPoint);
    shape.frontCurves.forEach((crv) => {
      crv.points = crv.points.map(shiftPoint);
    });
    shape.backCurves.forEach((crv) => {
      crv.points = crv.points.map(shiftPoint);
    });
    shape.depthCurves.forEach((crv) => {
      crv.points = crv.points.map(shiftPoint);
    });
    shape.anchorCurves.forEach((crv) => {
      crv.points = crv.points.map(shiftPoint);
    });
    if (shape.axisCurve) shape.axisCurve.points = shape.axisCurve.points.map(shiftPoint);
    if (shape.radiusCurve) shape.radiusCurve.points = shape.radiusCurve.points.map(shiftPoint);
    shape.allCurves.forEach((crv) => {
      crv.points = crv.points.map(shiftPoint);
    });
  }
}

/**
 * Genera un reto de perspectiva con 1 punto focal sobre una línea horizontal extrema
 * (cerca del límite superior o inferior para maximizar el área de dibujo),
 * con 1 o 2 figuras grandes de posiciones y dimensiones aleatorias.
 */
export function generateFocal3DChallenge(
  seed = Math.floor(Math.random() * 100000),
  _mode: FocalPracticeMode = 'horizon',
  forcedShapeType: Focal3DShapeType = 'CUBE',
  canvasWidth = 920,
  canvasHeight = 580,
  activeSectorIndex = 0,
  density: FocalWheelDensity = 'auto'
): Focal3DChallenge {
  const minDim = Math.min(canvasWidth, canvasHeight);
  const maxRayLen = Math.max(canvasWidth, canvasHeight) * 1.5;

  // LÍMITES SEGUROS DE DIBUJO:
  // Garantizan matemáticamente que ninguna figura se dibuje detrás de la barra flotante de botones inferior ni del menú superior
  const SAFE_TOP = 50;
  const SAFE_BOTTOM = canvasHeight - 95;
  const SAFE_LEFT = 45;
  const SAFE_RIGHT = canvasWidth - 45;

  // HORIZONTE AL LÍMITE SUPERIOR O INFERIOR:
  // Si 'upper': las figuras se sitúan en la zona superior (cielo/altura),
  // por lo que la línea focal horizontal se desplaza cerca del límite INFERIOR.
  // Si 'lower': las figuras se sitúan en la zona inferior (suelo/tierra),
  // por lo que la línea focal horizontal se desplaza cerca del límite SUPERIOR.
  const horizonSide: 'upper' | 'lower' = (Math.abs(seed) % 2 === 0) ? 'upper' : 'lower';

  // Posición Y de la línea horizontal de horizonte:
  // Con esto se gana el máximo espacio posible para hacer las figuras mucho más grandes.
  const horizonY = horizonSide === 'upper'
    ? Math.max(canvasHeight - 110, SAFE_BOTTOM - 20)
    : Math.min(80, SAFE_TOP + 30);

  // Punto focal sobre la línea horizontal (centrado en X con leve variación orgánica)
  const focalX = Math.round(canvasWidth / 2 + ((Math.abs(seed * 3) % 41) - 20));
  const focalPoint: Point2D = {
    x: focalX,
    y: horizonY,
  };

  const horizonLine = {
    x1: 0,
    y1: horizonY,
    x2: canvasWidth,
    y2: horizonY,
  };

  // 8 rayos focales que parten del punto focal y abren hacia el campo de dibujo
  const activeRayAngles = horizonSide === 'upper'
    ? [195, 215, 235, 255, 270, 285, 305, 325, 345] // Rayos hacia arriba
    : [15, 35, 55, 75, 90, 105, 125, 145, 165];     // Rayos hacia abajo

  const focalRays: FocalRay[] = activeRayAngles.map((ang, idx) => {
    const rad = (ang * Math.PI) / 180;
    return {
      index: idx,
      angleDeg: ang,
      label: `${ang}°`,
      x1: focalPoint.x,
      y1: focalPoint.y,
      x2: Math.round(focalPoint.x + maxRayLen * Math.cos(rad)),
      y2: Math.round(focalPoint.y + maxRayLen * Math.sin(rad)),
    };
  });

  // Número de figuras: 1 o 2 figuras grandes (según densidad elegida o auto)
  let shapeCount = 1;
  if (density === '1_figure') {
    shapeCount = 1;
  } else if (density === '2_figures' || density === 'wheel2' || density === 'wheel4' || density === 'wheel8') {
    shapeCount = 2;
  } else {
    shapeCount = (Math.abs(seed * 7) % 2 === 0) ? 1 : 2;
  }

  // Factor de escala extra grande gracias al espacio liberado por la línea límite
  const scaleFactor = shapeCount === 1 ? 2.65 : 2.30;

  // Espacio vertical disponible entre el horizonte y el límite seguro
  const availHeight = horizonSide === 'upper'
    ? (horizonY - 50) - SAFE_TOP
    : SAFE_BOTTOM - (horizonY + 50);

  const shapes: PrecalculatedShape3D[] = [];

  const getShapeTypeForIndex = (idx: number): Focal3DShapeType => {
    if (forcedShapeType !== 'MIXED_WHEEL') return forcedShapeType;
    const mixedPool: Focal3DShapeType[] = [
      'CUBE',
      'CYLINDER',
      'TRIANGULAR_PRISM',
      'PYRAMID',
      'HEXAGON_PRISM',
    ];
    return mixedPool[(Math.abs(seed + idx * 37)) % mixedPool.length];
  };

  if (shapeCount === 1) {
    // 1 FIGURA EXTRA GRANDE:
    // Posición y dimensiones aleatorias en el campo abierto
    const angleOffset = ((Math.abs(seed * 31) % 60) - 30); // -30° a +30°
    const baseAngle = horizonSide === 'upper' ? 270 : 90;
    const angleDeg = baseAngle + angleOffset;

    const rndDist = seededRandom(seed * 53 + 1);
    const distFromFocal = availHeight * (0.50 + rndDist * 0.28);

    shapes.push(
      buildPrecalculatedShape(
        activeSectorIndex,
        getShapeTypeForIndex(0),
        focalPoint,
        minDim * 0.40,
        seed,
        scaleFactor,
        1,
        angleDeg,
        distFromFocal
      )
    );
  } else {
    // 2 FIGURAS GRANDES:
    // Una a la izquierda del punto focal y otra a la derecha, con dimensiones y distancias aleatorias independientes
    const angleLeft = horizonSide === 'upper'
      ? 230 + ((Math.abs(seed * 23) % 24) - 12) // ~218° a 242° (arriba a la izquierda)
      : 130 + ((Math.abs(seed * 23) % 24) - 12); // ~118° a 142° (abajo a la izquierda)

    const angleRight = horizonSide === 'upper'
      ? 310 + ((Math.abs(seed * 47) % 24) - 12) // ~298° a 322° (arriba a la derecha)
      : 50 + ((Math.abs(seed * 47) % 24) - 12);  // ~38° a 62° (abajo a la derecha)

    const rndDist1 = seededRandom(seed * 71 + 2);
    const rndDist2 = seededRandom(seed * 97 + 3);
    const distLeft = availHeight * (0.48 + rndDist1 * 0.26);
    const distRight = availHeight * (0.48 + rndDist2 * 0.26);

    shapes.push(
      buildPrecalculatedShape(
        activeSectorIndex,
        getShapeTypeForIndex(0),
        focalPoint,
        minDim * 0.40,
        seed + 101,
        scaleFactor,
        2,
        angleLeft,
        distLeft
      ),
      buildPrecalculatedShape(
        (activeSectorIndex + 1) % 8,
        getShapeTypeForIndex(1),
        focalPoint,
        minDim * 0.40,
        seed + 202,
        scaleFactor,
        2,
        angleRight,
        distRight
      )
    );
  }

  // 6. CONFINAR TODAS LAS FIGURAS DENTRO DEL ÁREA SEGURA DE DIBUJO:
  // Garantiza matemáticamente que ninguna figura quede tapada por la barra flotante inferior ni el menú superior
  shapes.forEach((sh) => {
    clampShapeToSafeArea(sh, SAFE_LEFT, SAFE_TOP, SAFE_RIGHT, SAFE_BOTTOM);
  });

  // 7. VERIFICACIÓN ACTIVA Y RESOLUCIÓN DE INTERFERENCIAS ENTRE FORMAS:
  // Garantiza que ningún par de formas se toque o se solape
  for (let pass = 0; pass < 3; pass++) {
    let hadInterference = false;
    for (let i = 0; i < shapes.length; i++) {
      for (let j = i + 1; j < shapes.length; j++) {
        if (shapesInterfere(shapes[i], shapes[j], 26)) {
          hadInterference = true;
          shrinkShape(shapes[i], 0.88);
          shrinkShape(shapes[j], 0.88);
        }
      }
    }
    if (!hadInterference) break;
  }

  const shapeTypeLabels: Record<Focal3DShapeType, string> = {
    CUBE: 'Cubos y Prismas hacia Punto Focal',
    CYLINDER: 'Cilindros con Eje y Radio',
    TRIANGULAR_PRISM: 'Prismas Triangulares (Aristas de Fuga)',
    PYRAMID: 'Pirámides en Perspectiva Cónica',
    HEXAGON_PRISM: 'Prismas Hexagonales',
    MIXED_WHEEL: 'Formas 3D Mixtas en Perspectiva',
  };

  const title = `${shapeTypeLabels[forcedShapeType]} · Vista Horizonte (${horizonSide === 'upper' ? 'Arriba' : 'Abajo'}, ${shapes.length} ${shapes.length === 1 ? 'Figura Grande' : 'Figuras Grandes'})`;

  const tipText = forcedShapeType === 'CYLINDER'
    ? 'En el cilindro se proporciona el eje central y el radio. Traza las dos elipses y las generatrices tangentes.'
    : forcedShapeType === 'TRIANGULAR_PRISM'
    ? 'Une los vértices frontales para crear el triángulo y proyecta sus aristas de profundidad hacia el punto focal.'
    : 'Usa las 3 aristas mínimas indispensables (ancho, alto y profundidad) para construir el prisma completo en perspectiva.';

  return {
    id: `focal3d-${seed}-horizon-${forcedShapeType}-${density}`,
    title,
    subtitle: `${shapes.length} ${shapes.length === 1 ? 'figura grande' : 'figuras grandes'} en perspectiva cónica con línea focal horizontal límite`,
    seed,
    mode: 'horizon',
    horizonSide,
    horizonLine,
    density,
    activeShapeCount: shapes.length,
    shapeType: forcedShapeType,
    focalPoint,
    focalRays,
    shapes,
    activeSectorIndex,
    tipText,
  };
}
