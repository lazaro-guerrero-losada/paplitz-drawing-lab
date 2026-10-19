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
  scaleFactor = 1.0
): PrecalculatedShape3D {
  // Variación pseudoaleatoria determinista según seed y sector
  const rnd1 = seededRandom(seed * 17 + sectorIndex * 73 + 1);
  const rnd2 = seededRandom(seed * 29 + sectorIndex * 89 + 2);
  const rnd3 = seededRandom(seed * 41 + sectorIndex * 101 + 3);
  const rndDist = seededRandom(seed * 53 + sectorIndex * 113 + 4);

  // Distancia variable desde el punto focal para dar profundidad orgánica al conjunto
  const shapeDist = baseRadius * (0.90 + rndDist * 0.18);

  // Ángulo del sector con pequeño desfase orgánico (+14° a +22°)
  const angleDeg = (sectorIndex * 45 + 18) % 360;
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
    // Dimensiones irregulares (varía ancho, alto y profundidad según el prisma)
    const halfW = Math.round((28 + rnd1 * 26) * scaleFactor); // 28 a 54 px * scale
    const halfH = Math.round((24 + rnd2 * 26) * scaleFactor); // 24 a 50 px * scale
    const depthFactor = 0.28 + rnd3 * 0.22; // 0.28 a 0.50 (unos cubos más profundos que otros)

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
    // CILINDRO: Dimensiones variables (radio transversal y escorzo)
    const radiusV = Math.round((26 + rnd1 * 22) * scaleFactor); // 26 a 48 px * scale
    const radiusU = Math.round((15 + rnd2 * 14) * scaleFactor); // 15 a 29 px * scale
    const depthFactor = 0.28 + rnd3 * 0.22;

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
    // PRISMA TRIANGULAR: Proporciones variables
    const halfW = Math.round((28 + rnd1 * 24) * scaleFactor);
    const h = Math.round((32 + rnd2 * 28) * scaleFactor);
    const depthFactor = 0.28 + rnd3 * 0.22;

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
    // PIRÁMIDE: Proporciones variables
    const halfW = Math.round((30 + rnd1 * 22) * scaleFactor);
    const halfH = Math.round((26 + rnd2 * 22) * scaleFactor);
    const depthFactor = 0.30 + rnd3 * 0.20;

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
    // HEXAGON_PRISM: Proporciones variables
    const R = Math.round((28 + rnd1 * 22) * scaleFactor);
    const depthFactor = 0.28 + rnd3 * 0.22;

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
 * Genera un reto de perspectiva con 1 punto focal central y 8 líneas discontinuas,
 * adaptando el número y tamaño de las figuras según el espacio de pantalla (Tablet / Desktop)
 * y variando dinámicamente sus posiciones en diagonales y cuadrantes.
 */
export function generateFocal3DChallenge(
  seed = Math.floor(Math.random() * 100000),
  mode: FocalPracticeMode = 'full_wheel',
  forcedShapeType: Focal3DShapeType = 'CUBE',
  canvasWidth = 920,
  canvasHeight = 580,
  activeSectorIndex = 0,
  density: FocalWheelDensity = 'auto'
): Focal3DChallenge {
  // 1. Punto focal en el centro exacto del paisaje
  const focalPoint: Point2D = {
    x: Math.round(canvasWidth / 2),
    y: Math.round(canvasHeight / 2),
  };

  // 2. 8 Líneas discontinuas que trazan los rayos focales desde el punto central
  const rayAngles = [0, 45, 90, 135, 180, 225, 270, 315];
  const rayLabels = ['0° (Este)', '45° (Noreste)', '90° (Norte)', '135° (Noroeste)', '180° (Oeste)', '225° (Suroeste)', '270° (Sur)', '315° (Sureste)'];
  const maxRayLen = Math.max(canvasWidth, canvasHeight) * 1.3;

  const focalRays: FocalRay[] = rayAngles.map((ang, idx) => {
    const rad = (ang * Math.PI) / 180;
    return {
      index: idx,
      angleDeg: ang,
      label: rayLabels[idx],
      x1: focalPoint.x,
      y1: focalPoint.y,
      x2: Math.round(focalPoint.x + maxRayLen * Math.cos(rad)),
      y2: Math.round(focalPoint.y + maxRayLen * Math.sin(rad)),
    };
  });

  // 3. Adaptación de resolución: en tablets o pantallas más pequeñas, se generan menos figuras
  // para que sean notablemente más grandes y cómodas para dibujar con stylus/dedo
  const minDim = Math.min(canvasWidth, canvasHeight);
  let targetShapeCount = 8;
  let scaleFactor = 1.05;
  let sectorIndices: number[] = [0, 1, 2, 3, 4, 5, 6, 7];

  if (density === 'wheel2') {
    targetShapeCount = 2;
    scaleFactor = 1.65;
  } else if (density === 'wheel4') {
    targetShapeCount = 4;
    scaleFactor = 1.40;
  } else if (density === 'wheel8') {
    targetShapeCount = 8;
    scaleFactor = 1.05;
  } else {
    // Modo 'auto': se adapta automáticamente al ancho y alto disponible
    if (minDim < 520 || canvasWidth < 740) {
      // Pantalla pequeña / Tablet vertical: 2 figuras grandes en diagonal
      targetShapeCount = 2;
      scaleFactor = 1.60;
    } else if (minDim < 680 || canvasWidth < 960) {
      // Tablet horizontal / pantalla media: 4 figuras grandes
      targetShapeCount = 4;
      scaleFactor = 1.38;
    } else {
      // Escritorio HD
      targetShapeCount = 8;
      scaleFactor = 1.05;
    }
  }

  // 4. Posicionamiento dinámico variable: las figuras no están siempre en los mismos sectores
  // Varían sus trayectorias diagonales y tramos del lienzo
  if (targetShapeCount === 2) {
    // Pares diagonales / transversales (ej. diagonal abajo-arriba izq-der, o arriba-abajo izq-der)
    const pairs = [
      [5, 1], // Diagonal SW -> NE ("de abajo arriba izquierda a derecha")
      [3, 7], // Diagonal NW -> SE ("de arriba abajo izquierda a derecha")
      [4, 0], // Transversal Oeste -> Este
      [6, 2], // Transversal Sur -> Norte
    ];
    const pairIdx = Math.abs(seed) % pairs.length;
    sectorIndices = pairs[pairIdx];
  } else if (targetShapeCount === 4) {
    const quadPatterns = [
      [1, 3, 5, 7], // 4 Diagonales en X completa
      [0, 2, 4, 6], // 4 Ortogonales en cruz (+)
      [1, 2, 5, 6], // Mixto Diagonal + Vertical
      [0, 3, 4, 7], // Mixto Diagonal + Horizontal
    ];
    const qIdx = Math.abs(seed) % quadPatterns.length;
    sectorIndices = quadPatterns[qIdx];
  } else {
    // 8 sectores con rotación inicial variable
    const rotOffset = Math.abs(seed) % 8;
    sectorIndices = [0, 1, 2, 3, 4, 5, 6, 7].map((s) => (s + rotOffset) % 8);
  }

  // 5. Generación de las formas precalculadas alrededor del punto focal
  const shapes: PrecalculatedShape3D[] = [];
  const baseRadius = minDim * (targetShapeCount <= 4 ? 0.38 : 0.35);

  if (mode === 'full_wheel') {
    sectorIndices.forEach((s, idx) => {
      let shapeTypeForSector: Focal3DShapeType = forcedShapeType;
      if (forcedShapeType === 'MIXED_WHEEL') {
        const mixedTypes: Focal3DShapeType[] = [
          'CUBE',
          'CYLINDER',
          'TRIANGULAR_PRISM',
          'PYRAMID',
          'HEXAGON_PRISM',
        ];
        shapeTypeForSector = mixedTypes[(idx + Math.abs(seed)) % mixedTypes.length];
      }
      shapes.push(
        buildPrecalculatedShape(
          s,
          shapeTypeForSector,
          focalPoint,
          baseRadius,
          seed + idx * 79,
          scaleFactor
        )
      );
    });
  } else {
    // Modo Sector Individual: 1 figura grande en el sector activo
    shapes.push(
      buildPrecalculatedShape(
        activeSectorIndex,
        forcedShapeType,
        focalPoint,
        baseRadius,
        seed,
        1.55
      )
    );
  }

  const shapeTypeLabels: Record<Focal3DShapeType, string> = {
    CUBE: 'Cubos y Prismas hacia Punto Focal',
    CYLINDER: 'Cilindros con Eje y Radio',
    TRIANGULAR_PRISM: 'Prismas Triangulares (Aristas de Fuga)',
    PYRAMID: 'Pirámides en Perspectiva Cónica',
    HEXAGON_PRISM: 'Prismas Hexagonales',
    MIXED_WHEEL: 'Rueda Mixta de Formas 3D',
  };

  const title = mode === 'full_wheel'
    ? `${shapeTypeLabels[forcedShapeType]} · ${shapes.length} Formas`
    : `${shapeTypeLabels[forcedShapeType]} · Sector ${activeSectorIndex + 1}/8`;

  const tipText = forcedShapeType === 'CYLINDER'
    ? 'En el cilindro se proporciona el eje central y el radio. Traza las dos elipses y las generatrices tangentes.'
    : forcedShapeType === 'TRIANGULAR_PRISM'
    ? 'Une los vértices frontales para crear el triángulo y proyecta sus aristas de profundidad hacia el punto focal central.'
    : 'Usa las 3 aristas mínimas indispensables (ancho, alto y profundidad) para construir el cubo completo en perspectiva.';

  return {
    id: `focal3d-${seed}-${mode}-${forcedShapeType}-${density}`,
    title,
    subtitle: `${shapes.length} figuras en perspectiva cónica a 1 punto focal central`,
    seed,
    mode,
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
