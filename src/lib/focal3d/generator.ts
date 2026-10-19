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
} from './types';

function dist(p1: Point2D, p2: Point2D): number {
  return Math.hypot(p2.x - p1.x, p2.y - p1.y);
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
 */
function buildPrecalculatedShape(
  sectorIndex: number,
  type: Focal3DShapeType,
  focalPoint: Point2D,
  baseRadius: number
): PrecalculatedShape3D {
  // Ángulo del sector (distribuidos en 8 sectores: 0°, 45°, 90°, 135°, 180°, 225°, 270°, 315°)
  // Desplazamos un pequeño desfase (+15° a +25°) para que las formas caigan limpiamente en los cuadrantes como en la foto
  const angleDeg = (sectorIndex * 45 + 18) % 360;
  const angleRad = (angleDeg * Math.PI) / 180;

  // Centro de la cara frontal (más alejada del punto focal)
  const centerPos: Point2D = {
    x: focalPoint.x + baseRadius * Math.cos(angleRad),
    y: focalPoint.y + baseRadius * Math.sin(angleRad),
  };

  // Vector radial normalizado hacia el punto focal F
  const dF = dist(centerPos, focalPoint);
  const uRad: Point2D = {
    x: (focalPoint.x - centerPos.x) / dF,
    y: (focalPoint.y - centerPos.y) / dF,
  };
  // Vector perpendicular
  const vPerp: Point2D = {
    x: -uRad.y,
    y: uRad.x,
  };

  // Factor de profundidad hacia el punto focal (entre 0.35 y 0.45)
  const depthFactor = 0.40;

  const frontCurves: CurveSegment2D[] = [];
  const backCurves: CurveSegment2D[] = [];
  const depthCurves: CurveSegment2D[] = [];
  let axisCurve: CurveSegment2D | undefined;
  let radiusCurve: CurveSegment2D | undefined;
  const guidelinesToFocal: CurveSegment2D[] = [];
  const anchorCurves: CurveSegment2D[] = [];

  const prefix = `s${sectorIndex}-${type.toLowerCase()}`;

  if (type === 'CUBE') {
    // CUBO / PRISMA RECTANGULAR:
    // Cara frontal rectangular de dimensiones w x h
    const halfW = 38;
    const halfH = 34;

    const v0: Point2D = { x: centerPos.x - halfW * vPerp.x - halfH * uRad.x, y: centerPos.y - halfW * vPerp.y - halfH * uRad.y };
    const v1: Point2D = { x: centerPos.x + halfW * vPerp.x - halfH * uRad.x, y: centerPos.y + halfW * vPerp.y - halfH * uRad.y };
    const v2: Point2D = { x: centerPos.x + halfW * vPerp.x + halfH * uRad.x, y: centerPos.y + halfW * vPerp.y + halfH * uRad.y };
    const v3: Point2D = { x: centerPos.x - halfW * vPerp.x + halfH * uRad.x, y: centerPos.y - halfW * vPerp.y + halfH * uRad.y };
    const frontVerts = [v0, v1, v2, v3];

    // Cara trasera (convergencia cónica exacta hacia el punto focal F)
    const backVerts = frontVerts.map((v) => ({
      x: v.x + depthFactor * (focalPoint.x - v.x),
      y: v.y + depthFactor * (focalPoint.y - v.y),
    }));

    // 4 Aristas frontales
    const f0 = makeLineCurve(`${prefix}-f0`, frontVerts[0], frontVerts[1], 'Arista frontal 1');
    const f1 = makeLineCurve(`${prefix}-f1`, frontVerts[1], frontVerts[2], 'Arista frontal 2');
    const f2 = makeLineCurve(`${prefix}-f2`, frontVerts[2], frontVerts[3], 'Arista frontal 3');
    const f3 = makeLineCurve(`${prefix}-f3`, frontVerts[3], frontVerts[0], 'Arista frontal 4');
    frontCurves.push(f0, f1, f2, f3);

    // En un cubo se necesitan 3 aristas de profundidad visibles hacia el punto focal
    // Los 3 vértices más orientados hacia el punto focal F
    const orderedIndices = [0, 1, 2, 3].sort((a, b) => dist(frontVerts[a], focalPoint) - dist(frontVerts[b], focalPoint));
    const visibleDepthIndices = orderedIndices.slice(0, 3); // 3 aristas de fuga visibles

    visibleDepthIndices.forEach((idx, i) => {
      depthCurves.push(
        makeLineCurve(
          `${prefix}-d${i}`,
          frontVerts[idx],
          backVerts[idx],
          `Línea de fuga ${i + 1} al punto focal`
        )
      );
      // Rayo guía prolongado hasta el punto focal
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

    // Aristas traseras visibles conectando los vértices de fuga
    backCurves.push(makeLineCurve(`${prefix}-b0`, backVerts[visibleDepthIndices[0]], backVerts[visibleDepthIndices[1]], 'Arista trasera 1'));
    backCurves.push(makeLineCurve(`${prefix}-b1`, backVerts[visibleDepthIndices[1]], backVerts[visibleDepthIndices[2]], 'Arista trasera 2'));

    // LÍNEAS DE ANCLAJE OBLIGATORIAS (permanentes, incluso con ayudas apagadas):
    // Cara frontal para dimensiones (ancho x alto) y las 3 líneas de fuga al punto focal
    anchorCurves.push(
      makeLineCurve(`${prefix}-anc-f0`, frontVerts[0], frontVerts[1], 'Anclaje frontal 1', 'construction', 'solid'),
      makeLineCurve(`${prefix}-anc-f1`, frontVerts[1], frontVerts[2], 'Anclaje frontal 2', 'construction', 'solid'),
      makeLineCurve(`${prefix}-anc-f2`, frontVerts[2], frontVerts[3], 'Anclaje frontal 3', 'construction', 'solid'),
      makeLineCurve(`${prefix}-anc-f3`, frontVerts[3], frontVerts[0], 'Anclaje frontal 4', 'construction', 'solid')
    );
    visibleDepthIndices.forEach((idx, i) => {
      anchorCurves.push(
        makeLineCurve(
          `${prefix}-anc-ray-${i}`,
          frontVerts[idx],
          focalPoint,
          `Línea de fuga obligatoria ${i + 1}`,
          'construction',
          'dashed'
        )
      );
    });

  } else if (type === 'CYLINDER') {
    // CILINDRO ("colanders"):
    // "in a cylinder I need the axis line, and the radius"
    const radiusV = 36; // Semieje transversal perpendicular al rayo focal
    const radiusU = 20; // Semieje en la dirección del rayo focal (escorzo en perspectiva)

    // Cara frontal elíptica
    frontCurves.push(makeEllipseCurve(`${prefix}-front-ellipse`, centerPos, vPerp, uRad, radiusV, radiusU, 'Elipse frontal base'));

    // Centro de la cara trasera (desplazado hacia el punto focal)
    const backCenter: Point2D = {
      x: centerPos.x + depthFactor * (focalPoint.x - centerPos.x),
      y: centerPos.y + depthFactor * (focalPoint.y - centerPos.y),
    };
    const backRadiusV = radiusV * (1 - depthFactor);
    const backRadiusU = radiusU * (1 - depthFactor);

    // Cara trasera elíptica
    backCurves.push(makeEllipseCurve(`${prefix}-back-ellipse`, backCenter, vPerp, uRad, backRadiusV, backRadiusU, 'Elipse trasera'));

    // 2 Generatrices / Tangentes laterales que convergen al punto focal
    const tan1Front: Point2D = { x: centerPos.x + radiusV * vPerp.x, y: centerPos.y + radiusV * vPerp.y };
    const tan2Front: Point2D = { x: centerPos.x - radiusV * vPerp.x, y: centerPos.y - radiusV * vPerp.y };

    const tan1Back: Point2D = { x: backCenter.x + backRadiusV * vPerp.x, y: backCenter.y + backRadiusV * vPerp.y };
    const tan2Back: Point2D = { x: backCenter.x - backRadiusV * vPerp.x, y: backCenter.y - backRadiusV * vPerp.y };

    depthCurves.push(makeLineCurve(`${prefix}-tan1`, tan1Front, tan1Back, 'Generatriz lateral 1 hacia punto focal'));
    depthCurves.push(makeLineCurve(`${prefix}-tan2`, tan2Front, tan2Back, 'Generatriz lateral 2 hacia punto focal'));

    // EJE CENTRAL: del centro de la elipse frontal al centro de la elipse trasera (y al punto focal)
    axisCurve = makeLineCurve(`${prefix}-axis`, centerPos, backCenter, 'Eje central cilíndrico hacia el punto focal');

    // RADIO: del centro de la elipse frontal a uno de sus extremos
    radiusCurve = makeLineCurve(`${prefix}-radius`, centerPos, tan1Front, 'Radio de la elipse frontal');

    // Rayos de guía prolongados hacia el punto focal
    guidelinesToFocal.push(makeLineCurve(`${prefix}-axis-guide`, centerPos, focalPoint, 'Guía de eje central al punto focal', 'construction', 'dashed'));
    guidelinesToFocal.push(makeLineCurve(`${prefix}-tan1-guide`, tan1Front, focalPoint, 'Guía lateral 1 al punto focal', 'construction', 'dashed'));
    guidelinesToFocal.push(makeLineCurve(`${prefix}-tan2-guide`, tan2Front, focalPoint, 'Guía lateral 2 al punto focal', 'construction', 'dashed'));

    // LÍNEAS DE ANCLAJE OBLIGATORIAS PARA CILINDRO:
    // "in a cylinder I need the axis line, and the radius"
    anchorCurves.push(
      makeLineCurve(
        `${prefix}-anc-axis`,
        centerPos,
        focalPoint,
        'Eje central cilíndrico hacia el punto focal',
        'construction',
        'dashed'
      )
    );
    anchorCurves.push(
      makeLineCurve(
        `${prefix}-anc-radius`,
        centerPos,
        tan1Front,
        'Radio de dimensión de la elipse frontal',
        'construction',
        'solid'
      )
    );

  } else if (type === 'TRIANGULAR_PRISM') {
    // PRISMA TRIANGULAR:
    // "for a triangle 3 lines, etc."
    const halfW = 40;
    const h = 48;

    const v0: Point2D = { x: centerPos.x, y: centerPos.y - h * uRad.y };
    const v1: Point2D = { x: centerPos.x + halfW * vPerp.x + (h * 0.5) * uRad.x, y: centerPos.y + halfW * vPerp.y + (h * 0.5) * uRad.y };
    const v2: Point2D = { x: centerPos.x - halfW * vPerp.x + (h * 0.5) * uRad.x, y: centerPos.y - halfW * vPerp.y + (h * 0.5) * uRad.y };
    const frontVerts = [v0, v1, v2];

    const backVerts = frontVerts.map((v) => ({
      x: v.x + depthFactor * (focalPoint.x - v.x),
      y: v.y + depthFactor * (focalPoint.y - v.y),
    }));

    // 3 Aristas del triángulo frontal
    frontCurves.push(makeLineCurve(`${prefix}-tf0`, frontVerts[0], frontVerts[1], 'Cara triangular 1'));
    frontCurves.push(makeLineCurve(`${prefix}-tf1`, frontVerts[1], frontVerts[2], 'Cara triangular 2'));
    frontCurves.push(makeLineCurve(`${prefix}-tf2`, frontVerts[2], frontVerts[0], 'Cara triangular 3'));

    // Exactamente 3 líneas de fuga desde los 3 vértices hacia el punto focal
    for (let i = 0; i < 3; i++) {
      depthCurves.push(makeLineCurve(`${prefix}-td${i}`, frontVerts[i], backVerts[i], `Línea de fuga triangular ${i + 1}`));
      guidelinesToFocal.push(makeLineCurve(`${prefix}-tguide-${i}`, frontVerts[i], focalPoint, `Guía de fuga ${i + 1}`, 'construction', 'dashed'));
    }

    // Aristas del triángulo trasero
    backCurves.push(makeLineCurve(`${prefix}-tb0`, backVerts[0], backVerts[1], 'Arista trasera 1'));
    backCurves.push(makeLineCurve(`${prefix}-tb1`, backVerts[1], backVerts[2], 'Arista trasera 2'));
    backCurves.push(makeLineCurve(`${prefix}-tb2`, backVerts[2], backVerts[0], 'Arista trasera 3'));

    // LÍNEAS DE ANCLAJE OBLIGATORIAS: Cara triangular y las 3 líneas de fuga
    anchorCurves.push(
      makeLineCurve(`${prefix}-anc-tf0`, frontVerts[0], frontVerts[1], 'Anclaje triángulo 1', 'construction', 'solid'),
      makeLineCurve(`${prefix}-anc-tf1`, frontVerts[1], frontVerts[2], 'Anclaje triángulo 2', 'construction', 'solid'),
      makeLineCurve(`${prefix}-anc-tf2`, frontVerts[2], frontVerts[0], 'Anclaje triángulo 3', 'construction', 'solid')
    );
    for (let i = 0; i < 3; i++) {
      anchorCurves.push(
        makeLineCurve(
          `${prefix}-anc-tray-${i}`,
          frontVerts[i],
          focalPoint,
          `Línea de fuga triangular ${i + 1}`,
          'construction',
          'dashed'
        )
      );
    }

  } else if (type === 'PYRAMID') {
    // PIRÁMIDE:
    // Base cuadrangular + ápice convergente hacia el punto focal
    const halfW = 42;
    const halfH = 38;
    const v0: Point2D = { x: centerPos.x - halfW * vPerp.x - halfH * 0.7 * uRad.x, y: centerPos.y - halfW * vPerp.y - halfH * 0.7 * uRad.y };
    const v1: Point2D = { x: centerPos.x + halfW * vPerp.x - halfH * 0.7 * uRad.x, y: centerPos.y + halfW * vPerp.y - halfH * 0.7 * uRad.y };
    const v2: Point2D = { x: centerPos.x + halfW * 0.8 * vPerp.x + halfH * 0.7 * uRad.x, y: centerPos.y + halfW * 0.8 * vPerp.y + halfH * 0.7 * uRad.y };
    const v3: Point2D = { x: centerPos.x - halfW * 0.8 * vPerp.x + halfH * 0.7 * uRad.x, y: centerPos.y - halfW * 0.8 * vPerp.y + halfH * 0.7 * uRad.y };

    frontCurves.push(makeLineCurve(`${prefix}-pyr-b0`, v0, v1, 'Base piramidal 1'));
    frontCurves.push(makeLineCurve(`${prefix}-pyr-b1`, v1, v2, 'Base piramidal 2'));
    frontCurves.push(makeLineCurve(`${prefix}-pyr-b2`, v2, v3, 'Base piramidal 3'));
    frontCurves.push(makeLineCurve(`${prefix}-pyr-b3`, v3, v0, 'Base piramidal 4'));

    // Ápice desplazado en el eje central hacia el punto focal
    const apex: Point2D = {
      x: centerPos.x + (depthFactor * 1.3) * (focalPoint.x - centerPos.x),
      y: centerPos.y + (depthFactor * 1.3) * (focalPoint.y - centerPos.y),
    };

    depthCurves.push(makeLineCurve(`${prefix}-pyr-a0`, v0, apex, 'Arista arista al ápice 1'));
    depthCurves.push(makeLineCurve(`${prefix}-pyr-a1`, v1, apex, 'Arista arista al ápice 2'));
    depthCurves.push(makeLineCurve(`${prefix}-pyr-a2`, v2, apex, 'Arista arista al ápice 3'));
    depthCurves.push(makeLineCurve(`${prefix}-pyr-a3`, v3, apex, 'Arista arista al ápice 4'));

    guidelinesToFocal.push(makeLineCurve(`${prefix}-pyr-guide`, apex, focalPoint, 'Eje focal de pirámide', 'construction', 'dashed'));

    anchorCurves.push(
      makeLineCurve(`${prefix}-anc-pb0`, v0, v1, 'Anclaje base 1', 'construction', 'solid'),
      makeLineCurve(`${prefix}-anc-pb1`, v1, v2, 'Anclaje base 2', 'construction', 'solid'),
      makeLineCurve(`${prefix}-anc-pb2`, v2, v3, 'Anclaje base 3', 'construction', 'solid'),
      makeLineCurve(`${prefix}-anc-pb3`, v3, v0, 'Anclaje base 4', 'construction', 'solid'),
      makeLineCurve(`${prefix}-anc-paxis`, centerPos, focalPoint, 'Eje de convergencia de ápice', 'construction', 'dashed')
    );

  } else {
    // HEXAGON_PRISM:
    const R = 38;
    const frontVerts: Point2D[] = [];
    for (let k = 0; k < 6; k++) {
      const a = (k * 60 * Math.PI) / 180;
      frontVerts.push({
        x: centerPos.x + R * Math.cos(a) * vPerp.x + R * Math.sin(a) * uRad.x,
        y: centerPos.y + R * Math.cos(a) * vPerp.y + R * Math.sin(a) * uRad.y,
      });
    }

    const backVerts = frontVerts.map((v) => ({
      x: v.x + depthFactor * (focalPoint.x - v.x),
      y: v.y + depthFactor * (focalPoint.y - v.y),
    }));

    for (let k = 0; k < 6; k++) {
      frontCurves.push(makeLineCurve(`${prefix}-hxf${k}`, frontVerts[k], frontVerts[(k + 1) % 6], `Cara hexagonal ${k + 1}`));
    }

    // 4 aristas de profundidad visibles hacia el punto focal
    for (let k = 0; k < 4; k++) {
      depthCurves.push(makeLineCurve(`${prefix}-hxd${k}`, frontVerts[k], backVerts[k], `Línea de fuga hexagonal ${k + 1}`));
      guidelinesToFocal.push(makeLineCurve(`${prefix}-hxguide-${k}`, frontVerts[k], focalPoint, `Guía hexagonal ${k + 1}`, 'construction', 'dashed'));
    }

    for (let k = 0; k < 3; k++) {
      backCurves.push(makeLineCurve(`${prefix}-hxb${k}`, backVerts[k], backVerts[(k + 1) % 6], `Arista trasera hexagonal ${k + 1}`));
    }

    for (let k = 0; k < 6; k++) {
      anchorCurves.push(makeLineCurve(`${prefix}-anc-hxf${k}`, frontVerts[k], frontVerts[(k + 1) % 6], 'Anclaje hexágono', 'construction', 'solid'));
    }
    for (let k = 0; k < 4; k++) {
      anchorCurves.push(makeLineCurve(`${prefix}-anc-hxray-${k}`, frontVerts[k], focalPoint, `Línea de fuga hexagonal ${k + 1}`, 'construction', 'dashed'));
    }
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
    MIXED_WHEEL: 'Rueda Completa 3D (8 Formas)',
  };

  return {
    id: `shape-${sectorIndex}-${type.toLowerCase()}`,
    type,
    title: typeTitles[type] || 'Forma 3D hacia Punto Focal',
    sectorIndex,
    angleDeg,
    centerPos,
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
 * Genera un reto de perspectiva con 1 punto focal central y 8 líneas discontinuas
 */
export function generateFocal3DChallenge(
  seed = Math.floor(Math.random() * 100000),
  mode: FocalPracticeMode = 'full_wheel',
  forcedShapeType: Focal3DShapeType = 'CUBE',
  canvasWidth = 920,
  canvasHeight = 580,
  activeSectorIndex = 0
): Focal3DChallenge {
  // 1. Punto focal en el centro exacto del paisaje
  const focalPoint: Point2D = {
    x: Math.round(canvasWidth / 2),
    y: Math.round(canvasHeight / 2),
  };

  // 2. 8 Líneas discontinuas que trazan las líneas focales desde el punto central
  const rayAngles = [0, 45, 90, 135, 180, 225, 270, 315];
  const rayLabels = ['0° (Este)', '45° (Noreste)', '90° (Norte)', '135° (Noroeste)', '180° (Oeste)', '225° (Suroeste)', '270° (Sur)', '315° (Sureste)'];
  const maxRayLen = Math.max(canvasWidth, canvasHeight) * 1.2;

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

  // 3. Generación de las formas precalculadas alrededor del punto focal
  const shapes: PrecalculatedShape3D[] = [];
  const baseRadius = Math.min(canvasWidth, canvasHeight) * 0.36; // Distancia cómoda para los cuerpos 3D

  if (mode === 'full_wheel') {
    // Modo Rueda Completa: 8 formas distribuidas alrededor de los 8 sectores (idéntico a la foto de referencia)
    for (let s = 0; s < 8; s++) {
      let shapeTypeForSector: Focal3DShapeType = forcedShapeType;
      if (forcedShapeType === 'MIXED_WHEEL') {
        // En modo mixto repartimos variedad: Cubos, Cilindros, Prismas Triangulares, Pirámides
        const mixedTypes: Focal3DShapeType[] = [
          'CUBE',
          'CYLINDER',
          'TRIANGULAR_PRISM',
          'CUBE',
          'CYLINDER',
          'PYRAMID',
          'CUBE',
          'TRIANGULAR_PRISM',
        ];
        shapeTypeForSector = mixedTypes[s];
      }
      shapes.push(buildPrecalculatedShape(s, shapeTypeForSector, focalPoint, baseRadius));
    }
  } else {
    // Modo Sector Individual: 1 forma en el sector activo
    shapes.push(buildPrecalculatedShape(activeSectorIndex, forcedShapeType, focalPoint, baseRadius));
  }

  const shapeTypeLabels: Record<Focal3DShapeType, string> = {
    CUBE: 'Cubos y Prismas hacia Punto Focal',
    CYLINDER: 'Cilindros con Eje y Radio',
    TRIANGULAR_PRISM: 'Prismas Triangulares (3 Líneas de Fuga)',
    PYRAMID: 'Pirámides en Perspectiva Cónica',
    HEXAGON_PRISM: 'Prismas Hexagonales',
    MIXED_WHEEL: 'Rueda Completa de Formas 3D (8 Sectores)',
  };

  const title = mode === 'full_wheel'
    ? `${shapeTypeLabels[forcedShapeType]} · Rueda 8 Formas`
    : `${shapeTypeLabels[forcedShapeType]} · Sector ${activeSectorIndex + 1}/8`;

  const tipText = forcedShapeType === 'CYLINDER'
    ? 'En el cilindro es crucial trazar el eje central hacia el punto focal, marcar el radio de la elipse frontal y conectar las tangentes de fuga.'
    : forcedShapeType === 'TRIANGULAR_PRISM'
    ? 'Para el prisma triangular traza los 3 vértices de la cara frontal y haz converger sus 3 aristas de profundidad al punto focal central.'
    : 'Traza la cara frontal y haz fugar exactamente 3 aristas de profundidad hacia el punto focal central antes de cerrar la cara trasera.';

  return {
    id: `focal3d-${seed}-${mode}-${forcedShapeType}`,
    title,
    subtitle: '8 líneas focales discontinuas convergentes en un único punto focal central (Perspectiva Cónica 1 Punto)',
    seed,
    mode,
    shapeType: forcedShapeType,
    focalPoint,
    focalRays,
    shapes,
    activeSectorIndex,
    tipText,
  };
}
