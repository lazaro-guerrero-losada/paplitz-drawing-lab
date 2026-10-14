/**
 * Generador de Desafíos y Primitivas 3D para Lab 3D
 * Soporta SPHERE, RING, CUBE, CYLINDER, CONE, PYRAMID, CAPSULE y PRISM
 * con habitación 3D de 6 paredes y perspectivas dinámicas perfectamente calibradas.
 */

import {
  Vector3D,
  Point2D,
  Camera3D,
  CurveSegment2D,
  PrimitiveType,
  Primitive3DChallenge,
  WireframeModel3D,
} from './types';
import {
  v3,
  vAdd,
  vSub,
  vScale,
  vNorm,
  vCross,
  vLen,
  vDot,
  createLookAtMatrix,
  createPerspectiveMatrix,
  multiplyMatrices,
  project3DTo2D,
  calculateVanishingPoints,
  generate6WallRoomGrid,
} from './math3d';

// Generador pseudo-aleatorio con semilla
function seededRng(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * Genera una cámara 3D con un ángulo de visión inusual / dramático pero geométricamente limpio
 */
export function generateDynamicCamera(
  rng: () => number,
  canvasWidth: number,
  canvasHeight: number
): Camera3D {
  // Elevación: vista picada (+22° a +42°) o contrapicado (-18° a -32°)
  const isWormEye = rng() > 0.65;
  const elevationDeg = isWormEye ? -(18 + rng() * 16) : 22 + rng() * 20;
  const elevRad = (elevationDeg * Math.PI) / 180;

  // Azimut: entre 30° y 60° o 120° y 150° para perspectiva clara a 3 puntos sin degeneración
  const quadrant = rng() > 0.5 ? 0 : Math.PI / 2;
  const azimuthRad = quadrant + ((30 + rng() * 30) * Math.PI) / 180;

  // Distancia cómoda para enmarcar la habitación y el objeto en el lienzo
  const distance = 4.8 + rng() * 0.5;

  const camX = distance * Math.cos(elevRad) * Math.sin(azimuthRad);
  const camY = distance * Math.sin(elevRad);
  const camZ = distance * Math.cos(elevRad) * Math.cos(azimuthRad);

  const eye = v3(camX, camY, camZ);
  const target = v3(0, 0, 0);

  // Inclinación sutil de cámara (Dutch roll de ±4° a ±8°)
  const rollDeg = (rng() - 0.5) * 12;
  const rollRad = (rollDeg * Math.PI) / 180;

  const baseUp = v3(0, 1, 0);
  const forward = vNorm(vSub(target, eye));
  const right = vNorm(vCross(forward, baseUp));
  const up = vNorm(vAdd(vScale(baseUp, Math.cos(rollRad)), vScale(right, Math.sin(rollRad))));

  return {
    eye,
    target,
    up,
    fov: 55 + rng() * 8,
    aspectRatio: canvasWidth / canvasHeight,
    near: 0.15,
    far: 50.0,
  };
}

/**
 * Convierte un conjunto de puntos 3D muestreados a un CurveSegment2D proyectado en pantalla
 */
function sample3DCurveTo2D(
  points3D: Vector3D[],
  viewProjMatrix: number[],
  width: number,
  height: number,
  id: string,
  label: string,
  isGiven: boolean,
  style: 'solid' | 'dashed' | 'faint' = 'solid'
): CurveSegment2D {
  const points2D: Point2D[] = [];
  points3D.forEach((p3) => {
    const proj = project3DTo2D(p3, viewProjMatrix, width, height);
    if (!proj.isBehindCamera) {
      points2D.push(proj.point2D);
    }
  });

  return {
    id,
    points: points2D,
    isGiven,
    label,
    style,
  };
}

// ==========================================
// Generadores de Primitivas Específicas
// ==========================================

export function createSpherePrimitive(
  camera: Camera3D,
  viewProj: number[],
  W: number,
  H: number
): {
  anchorCurves: CurveSegment2D[];
  targetCurves: CurveSegment2D[];
  previewModel3D: WireframeModel3D;
} {
  const R = 0.95;
  const segments = 48;

  // 1. Ecuador (Plano XZ en Y = 0)
  const equator3D: Vector3D[] = [];
  for (let i = 0; i <= segments; i++) {
    const th = (i / segments) * Math.PI * 2;
    equator3D.push(v3(R * Math.cos(th), 0, R * Math.sin(th)));
  }

  const frontEquator3D: Vector3D[] = [];
  const backEquator3D: Vector3D[] = [];
  equator3D.forEach((p) => {
    const dirToCam = vSub(camera.eye, p);
    const normal = vNorm(v3(p.x, 0, p.z));
    if (vDot(dirToCam, normal) >= 0) {
      frontEquator3D.push(p);
    } else {
      backEquator3D.push(p);
    }
  });

  const anchorCurves: CurveSegment2D[] = [
    sample3DCurveTo2D(frontEquator3D, viewProj, W, H, 'equator-front', 'Ecuador Frontal', true, 'solid'),
    sample3DCurveTo2D(backEquator3D, viewProj, W, H, 'equator-back', 'Ecuador Posterior', true, 'faint'),
  ];

  // 2. Meridianos verticales
  const meridianXY: Vector3D[] = [];
  for (let i = 0; i <= segments; i++) {
    const th = (i / segments) * Math.PI * 2;
    meridianXY.push(v3(R * Math.sin(th), R * Math.cos(th), 0));
  }

  const meridianYZ: Vector3D[] = [];
  for (let i = 0; i <= segments; i++) {
    const th = (i / segments) * Math.PI * 2;
    meridianYZ.push(v3(0, R * Math.cos(th), R * Math.sin(th)));
  }

  // 3. Silueta exterior exacta en perspectiva de cono tangente
  const distCam = vLen(camera.eye);
  const sinAlpha = Math.min(0.999, R / distCam);
  const cosAlpha = Math.sqrt(Math.max(0, 1 - sinAlpha * sinAlpha));
  const contactDist = R * sinAlpha;
  const contactRadius = R * cosAlpha;

  const camDir = vNorm(camera.eye);
  const contactCenter = vScale(camDir, contactDist);

  let tempUp = camera.up;
  let uDir = vNorm(vCross(camDir, tempUp));
  if (vLen(uDir) < 0.001) uDir = v3(1, 0, 0);
  const vDir = vCross(camDir, uDir);

  const silhouette3D: Vector3D[] = [];
  for (let i = 0; i <= segments; i++) {
    const th = (i / segments) * Math.PI * 2;
    const offset = vAdd(vScale(uDir, contactRadius * Math.cos(th)), vScale(vDir, contactRadius * Math.sin(th)));
    silhouette3D.push(vAdd(contactCenter, offset));
  }

  const targetCurves: CurveSegment2D[] = [
    sample3DCurveTo2D(silhouette3D, viewProj, W, H, 'silhouette', 'Silueta Exterior', false, 'solid'),
    sample3DCurveTo2D(meridianXY, viewProj, W, H, 'meridian-1', 'Meridiano Vertical 1', false, 'solid'),
    sample3DCurveTo2D(meridianYZ, viewProj, W, H, 'meridian-2', 'Meridiano Vertical 2', false, 'solid'),
  ];

  const previewModel3D: WireframeModel3D = {
    vertices: [],
    edges: [],
    rings: [equator3D, meridianXY, meridianYZ, silhouette3D],
  };

  return { anchorCurves, targetCurves, previewModel3D };
}

export function createRingPrimitive(
  _camera: Camera3D,
  viewProj: number[],
  W: number,
  H: number
): {
  anchorCurves: CurveSegment2D[];
  targetCurves: CurveSegment2D[];
  previewModel3D: WireframeModel3D;
} {
  const R = 1.05;
  const r = 0.28;
  const segments = 48;

  // Anillo medio central (Guía base dada)
  const centerRing: Vector3D[] = [];
  for (let i = 0; i <= segments; i++) {
    const th = (i / segments) * Math.PI * 2;
    centerRing.push(v3(R * Math.cos(th), 0, R * Math.sin(th)));
  }

  const anchorCurves: CurveSegment2D[] = [
    sample3DCurveTo2D(centerRing, viewProj, W, H, 'center-ring', 'Eje Central del Toroide', true, 'solid'),
  ];

  // Anillos concéntricos interior y exterior
  const outerRingTop: Vector3D[] = [];
  const outerRingBottom: Vector3D[] = [];
  const innerRingTop: Vector3D[] = [];
  const innerRingBottom: Vector3D[] = [];

  for (let i = 0; i <= segments; i++) {
    const th = (i / segments) * Math.PI * 2;
    const cosT = Math.cos(th);
    const sinT = Math.sin(th);
    outerRingTop.push(v3((R + r) * cosT, r * 0.7, (R + r) * sinT));
    outerRingBottom.push(v3((R + r) * cosT, -r * 0.7, (R + r) * sinT));
    innerRingTop.push(v3((R - r) * cosT, r * 0.7, (R - r) * sinT));
    innerRingBottom.push(v3((R - r) * cosT, -r * 0.7, (R - r) * sinT));
  }

  // 4 secciones transversales circulares
  const crossSections: Vector3D[][] = [];
  const angles = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];
  angles.forEach((theta) => {
    const ring: Vector3D[] = [];
    const cx = R * Math.cos(theta);
    const cz = R * Math.sin(theta);
    const radDir = v3(Math.cos(theta), 0, Math.sin(theta));
    const upDir = v3(0, 1, 0);

    for (let j = 0; j <= 24; j++) {
      const phi = (j / 24) * Math.PI * 2;
      const pt = vAdd(v3(cx, 0, cz), vAdd(vScale(radDir, r * Math.cos(phi)), vScale(upDir, r * Math.sin(phi))));
      ring.push(pt);
    }
    crossSections.push(ring);
  });

  const targetCurves: CurveSegment2D[] = [
    sample3DCurveTo2D(outerRingTop, viewProj, W, H, 'outer-top', 'Borde Exterior Superior', false, 'solid'),
    sample3DCurveTo2D(outerRingBottom, viewProj, W, H, 'outer-bottom', 'Borde Exterior Inferior', false, 'solid'),
    sample3DCurveTo2D(innerRingTop, viewProj, W, H, 'inner-top', 'Borde Interior Superior', false, 'solid'),
    ...crossSections.map((cs, idx) =>
      sample3DCurveTo2D(cs, viewProj, W, H, `cross-${idx}`, `Sección Transversal ${idx + 1}`, false, 'solid')
    ),
  ];

  const previewModel3D: WireframeModel3D = {
    vertices: [],
    edges: [],
    rings: [centerRing, outerRingTop, outerRingBottom, innerRingTop, innerRingBottom, ...crossSections],
  };

  return { anchorCurves, targetCurves, previewModel3D };
}

export function createCubePrimitive(
  _camera: Camera3D,
  viewProj: number[],
  W: number,
  H: number
): {
  anchorCurves: CurveSegment2D[];
  targetCurves: CurveSegment2D[];
  previewModel3D: WireframeModel3D;
} {
  const s = 0.8;
  const v: Vector3D[] = [
    v3(-s, -s, -s), // 0: Izq-Abajo-Atrás
    v3(s, -s, -s),  // 1: Der-Abajo-Atrás
    v3(s, -s, s),   // 2: Der-Abajo-Frente
    v3(-s, -s, s),  // 3: Izq-Abajo-Frente
    v3(-s, s, -s),  // 4: Izq-Arriba-Atrás
    v3(s, s, -s),   // 5: Der-Arriba-Atrás
    v3(s, s, s),    // 6: Der-Arriba-Frente
    v3(-s, s, s),   // 7: Izq-Arriba-Frente
  ];

  // Base en el suelo dada
  const basePoints = [v[0], v[1], v[2], v[3], v[0]];
  const anchorCurves: CurveSegment2D[] = [
    sample3DCurveTo2D(basePoints, viewProj, W, H, 'base-quad', 'Plano Base del Cubo', true, 'solid'),
  ];

  const edgePairs: [number, number, string][] = [
    [0, 4, 'Pilar Izq-Atrás'],
    [1, 5, 'Pilar Der-Atrás'],
    [2, 6, 'Pilar Der-Frente'],
    [3, 7, 'Pilar Izq-Frente'],
    [4, 5, 'Techo Posterior'],
    [5, 6, 'Techo Lateral'],
    [6, 7, 'Techo Frontal'],
    [7, 4, 'Techo Izquierdo'],
  ];

  const targetCurves: CurveSegment2D[] = edgePairs.map(([startIdx, endIdx, name], idx) => {
    return sample3DCurveTo2D([v[startIdx], v[endIdx]], viewProj, W, H, `edge-${idx}`, name, false, 'solid');
  });

  const previewModel3D: WireframeModel3D = {
    vertices: v,
    edges: [
      [0, 1], [1, 2], [2, 3], [3, 0],
      [4, 5], [5, 6], [6, 7], [7, 4],
      [0, 4], [1, 5], [2, 6], [3, 7],
    ],
  };

  return { anchorCurves, targetCurves, previewModel3D };
}

export function createCylinderPrimitive(
  camera: Camera3D,
  viewProj: number[],
  W: number,
  H: number
): {
  anchorCurves: CurveSegment2D[];
  targetCurves: CurveSegment2D[];
  previewModel3D: WireframeModel3D;
} {
  const R = 0.85;
  const halfH = 0.95;
  const segments = 48;

  // Base inferior en el suelo Y = -halfH
  const bottomRing: Vector3D[] = [];
  for (let i = 0; i <= segments; i++) {
    const th = (i / segments) * Math.PI * 2;
    bottomRing.push(v3(R * Math.cos(th), -halfH, R * Math.sin(th)));
  }

  const anchorCurves: CurveSegment2D[] = [
    sample3DCurveTo2D(bottomRing, viewProj, W, H, 'bottom-ellipse', 'Elipse Base Inferior', true, 'solid'),
  ];

  // Tapa superior
  const topRing: Vector3D[] = [];
  for (let i = 0; i <= segments; i++) {
    const th = (i / segments) * Math.PI * 2;
    topRing.push(v3(R * Math.cos(th), halfH, R * Math.sin(th)));
  }

  // Generatrices laterales tangentes exactas
  const camHorizDist = Math.sqrt(camera.eye.x * camera.eye.x + camera.eye.z * camera.eye.z);
  const camAngle = Math.atan2(camera.eye.x, camera.eye.z);
  const tangentOffset = Math.asin(Math.min(0.999, R / Math.max(R + 0.01, camHorizDist)));

  const angleLeft = camAngle + Math.PI / 2 + tangentOffset;
  const angleRight = camAngle - Math.PI / 2 - tangentOffset;

  const leftEdge = [
    v3(R * Math.sin(angleLeft), -halfH, R * Math.cos(angleLeft)),
    v3(R * Math.sin(angleLeft), halfH, R * Math.cos(angleLeft)),
  ];

  const rightEdge = [
    v3(R * Math.sin(angleRight), -halfH, R * Math.cos(angleRight)),
    v3(R * Math.sin(angleRight), halfH, R * Math.cos(angleRight)),
  ];

  const targetCurves: CurveSegment2D[] = [
    sample3DCurveTo2D(topRing, viewProj, W, H, 'top-ellipse', 'Elipse Superior', false, 'solid'),
    sample3DCurveTo2D(leftEdge, viewProj, W, H, 'left-side', 'Contorno Lateral Izquierdo', false, 'solid'),
    sample3DCurveTo2D(rightEdge, viewProj, W, H, 'right-side', 'Contorno Lateral Derecho', false, 'solid'),
  ];

  const previewModel3D: WireframeModel3D = {
    vertices: [],
    edges: [],
    rings: [bottomRing, topRing, leftEdge, rightEdge],
  };

  return { anchorCurves, targetCurves, previewModel3D };
}

export function createConePrimitive(
  camera: Camera3D,
  viewProj: number[],
  W: number,
  H: number
): {
  anchorCurves: CurveSegment2D[];
  targetCurves: CurveSegment2D[];
  previewModel3D: WireframeModel3D;
} {
  const R = 0.95;
  const halfH = 0.95;
  const segments = 48;

  const baseRing: Vector3D[] = [];
  for (let i = 0; i <= segments; i++) {
    const th = (i / segments) * Math.PI * 2;
    baseRing.push(v3(R * Math.cos(th), -halfH, R * Math.sin(th)));
  }

  const anchorCurves: CurveSegment2D[] = [
    sample3DCurveTo2D(baseRing, viewProj, W, H, 'cone-base', 'Base Circular del Cono', true, 'solid'),
  ];

  const apex = v3(0, halfH + 0.1, 0);

  const camHorizDist = Math.sqrt(camera.eye.x * camera.eye.x + camera.eye.z * camera.eye.z);
  const camAngle = Math.atan2(camera.eye.x, camera.eye.z);
  const tangentOffset = Math.asin(Math.min(0.999, R / Math.max(R + 0.01, camHorizDist)));

  const angleLeft = camAngle + Math.PI / 2 + tangentOffset;
  const angleRight = camAngle - Math.PI / 2 - tangentOffset;

  const leftSlant = [v3(R * Math.sin(angleLeft), -halfH, R * Math.cos(angleLeft)), apex];
  const rightSlant = [v3(R * Math.sin(angleRight), -halfH, R * Math.cos(angleRight)), apex];

  const targetCurves: CurveSegment2D[] = [
    sample3DCurveTo2D(leftSlant, viewProj, W, H, 'left-slant', 'Arista Tangente Izquierda', false, 'solid'),
    sample3DCurveTo2D(rightSlant, viewProj, W, H, 'right-slant', 'Arista Tangente Derecha', false, 'solid'),
  ];

  const previewModel3D: WireframeModel3D = {
    vertices: [apex],
    edges: [],
    rings: [baseRing, leftSlant, rightSlant],
  };

  return { anchorCurves, targetCurves, previewModel3D };
}

export function createPyramidPrimitive(
  _camera: Camera3D,
  viewProj: number[],
  W: number,
  H: number
): {
  anchorCurves: CurveSegment2D[];
  targetCurves: CurveSegment2D[];
  previewModel3D: WireframeModel3D;
} {
  const s = 0.9;
  const halfH = 0.95;

  const b0 = v3(-s, -halfH, -s);
  const b1 = v3(s, -halfH, -s);
  const b2 = v3(s, -halfH, s);
  const b3 = v3(-s, -halfH, s);
  const apex = v3(0, halfH + 0.1, 0);

  const baseQuad = [b0, b1, b2, b3, b0];
  const anchorCurves: CurveSegment2D[] = [
    sample3DCurveTo2D(baseQuad, viewProj, W, H, 'pyramid-base', 'Base Cuadrada en Perspectiva', true, 'solid'),
  ];

  const targetCurves: CurveSegment2D[] = [
    sample3DCurveTo2D([b0, apex], viewProj, W, H, 'slant-0', 'Arista a la Cúspide (Atrás-Izq)', false, 'solid'),
    sample3DCurveTo2D([b1, apex], viewProj, W, H, 'slant-1', 'Arista a la Cúspide (Atrás-Der)', false, 'solid'),
    sample3DCurveTo2D([b2, apex], viewProj, W, H, 'slant-2', 'Arista a la Cúspide (Frente-Der)', false, 'solid'),
    sample3DCurveTo2D([b3, apex], viewProj, W, H, 'slant-3', 'Arista a la Cúspide (Frente-Izq)', false, 'solid'),
  ];

  const previewModel3D: WireframeModel3D = {
    vertices: [b0, b1, b2, b3, apex],
    edges: [
      [0, 1], [1, 2], [2, 3], [3, 0],
      [0, 4], [1, 4], [2, 4], [3, 4],
    ],
  };

  return { anchorCurves, targetCurves, previewModel3D };
}

export function createCapsulePrimitive(
  _camera: Camera3D,
  viewProj: number[],
  W: number,
  H: number
): {
  anchorCurves: CurveSegment2D[];
  targetCurves: CurveSegment2D[];
  previewModel3D: WireframeModel3D;
} {
  const R = 0.75;
  const cylH = 0.8;
  const segments = 48;

  const lowerRing: Vector3D[] = [];
  for (let i = 0; i <= segments; i++) {
    const th = (i / segments) * Math.PI * 2;
    lowerRing.push(v3(R * Math.cos(th), -cylH / 2, R * Math.sin(th)));
  }

  const lowerDomeArc: Vector3D[] = [];
  for (let i = 0; i <= 24; i++) {
    const th = Math.PI + (i / 24) * Math.PI;
    lowerDomeArc.push(v3(R * Math.cos(th), -cylH / 2 + R * Math.sin(th), 0));
  }

  const anchorCurves: CurveSegment2D[] = [
    sample3DCurveTo2D(lowerRing, viewProj, W, H, 'capsule-lower-ring', 'Anillo Inferior Cápsula', true, 'solid'),
    sample3DCurveTo2D(lowerDomeArc, viewProj, W, H, 'capsule-lower-dome', 'Cúpula Inferior', true, 'solid'),
  ];

  const upperRing: Vector3D[] = [];
  for (let i = 0; i <= segments; i++) {
    const th = (i / segments) * Math.PI * 2;
    upperRing.push(v3(R * Math.cos(th), cylH / 2, R * Math.sin(th)));
  }

  const upperDomeArc: Vector3D[] = [];
  for (let i = 0; i <= 24; i++) {
    const th = (i / 24) * Math.PI;
    upperDomeArc.push(v3(R * Math.cos(th), cylH / 2 + R * Math.sin(th), 0));
  }

  const leftSide = [v3(-R, -cylH / 2, 0), v3(-R, cylH / 2, 0)];
  const rightSide = [v3(R, -cylH / 2, 0), v3(R, cylH / 2, 0)];

  const targetCurves: CurveSegment2D[] = [
    sample3DCurveTo2D(upperRing, viewProj, W, H, 'capsule-upper-ring', 'Anillo Divisor Superior', false, 'solid'),
    sample3DCurveTo2D(upperDomeArc, viewProj, W, H, 'capsule-upper-dome', 'Cúpula Esférica Superior', false, 'solid'),
    sample3DCurveTo2D(leftSide, viewProj, W, H, 'capsule-left', 'Lateral Cilíndrico Izquierdo', false, 'solid'),
    sample3DCurveTo2D(rightSide, viewProj, W, H, 'capsule-right', 'Lateral Cilíndrico Derecho', false, 'solid'),
  ];

  const previewModel3D: WireframeModel3D = {
    vertices: [],
    edges: [],
    rings: [lowerRing, upperRing, lowerDomeArc, upperDomeArc, leftSide, rightSide],
  };

  return { anchorCurves, targetCurves, previewModel3D };
}

/**
 * Prisma Triangular con orientación calibrada hacia la cámara:
 * La cara triangular más cercana a la cámara es SIEMPRE la cara base dada en tinta negra,
 * y las aristas longitudinales fugan de manera natural alejándose hacia el fondo.
 */
export function createPrismPrimitive(
  camera: Camera3D,
  viewProj: number[],
  W: number,
  H: number
): {
  anchorCurves: CurveSegment2D[];
  targetCurves: CurveSegment2D[];
  previewModel3D: WireframeModel3D;
} {
  const w = 0.85;
  const h = 0.95;
  const depth = 1.2;

  // Cara triangular A (Z = -depth / 2)
  const a0 = v3(-w, -h / 2, -depth / 2);
  const a1 = v3(w, -h / 2, -depth / 2);
  const a2 = v3(0, h / 2, -depth / 2);

  // Cara triangular B (Z = +depth / 2)
  const b0 = v3(-w, -h / 2, depth / 2);
  const b1 = v3(w, -h / 2, depth / 2);
  const b2 = v3(0, h / 2, depth / 2);

  // Comparar distancias a la cámara para determinar la cara frontal
  const distA = vLen(vSub(camera.eye, v3(0, 0, -depth / 2)));
  const distB = vLen(vSub(camera.eye, v3(0, 0, depth / 2)));

  const isACcloser = distA < distB;
  const nearTriangle = isACcloser ? [a0, a1, a2, a0] : [b0, b1, b2, b0];
  const farTriangle = isACcloser ? [b0, b1, b2, b0] : [a0, a1, a2, a0];

  const nearPts = isACcloser ? [a0, a1, a2] : [b0, b1, b2];
  const farPts = isACcloser ? [b0, b1, b2] : [a0, a1, a2];

  // La cara frontal dada al usuario es SIEMPRE la cara más cercana a la cámara
  const anchorCurves: CurveSegment2D[] = [
    sample3DCurveTo2D(nearTriangle, viewProj, W, H, 'prism-near', 'Cara Triangular Frontal', true, 'solid'),
  ];

  // El objetivo es la cara posterior (que disminuye en perspectiva hacia el fondo) y las 3 aristas que fugan
  const targetCurves: CurveSegment2D[] = [
    sample3DCurveTo2D(farTriangle, viewProj, W, H, 'prism-far', 'Cara Triangular Posterior', false, 'solid'),
    sample3DCurveTo2D([nearPts[0], farPts[0]], viewProj, W, H, 'prism-edge-0', 'Arista Longitudinal Izquierda', false, 'solid'),
    sample3DCurveTo2D([nearPts[1], farPts[1]], viewProj, W, H, 'prism-edge-1', 'Arista Longitudinal Derecha', false, 'solid'),
    sample3DCurveTo2D([nearPts[2], farPts[2]], viewProj, W, H, 'prism-edge-2', 'Arista Longitudinal Superior', false, 'solid'),
  ];

  const previewModel3D: WireframeModel3D = {
    vertices: [a0, a1, a2, b0, b1, b2],
    edges: [
      [0, 1], [1, 2], [2, 0], // Cara A
      [3, 4], [4, 5], [5, 3], // Cara B
      [0, 3], [1, 4], [2, 5], // Aristas longitudinales
    ],
  };

  return { anchorCurves, targetCurves, previewModel3D };
}

// ==========================================
// Función Maestra: Generación de Retos 3D
// ==========================================

export const ALL_PRIMITIVES: PrimitiveType[] = [
  'SPHERE',
  'RING',
  'CUBE',
  'CYLINDER',
  'CONE',
  'PYRAMID',
  'CAPSULE',
  'PRISM',
];

export function generate3DChallenge(
  seed: number = Math.floor(Math.random() * 1000000),
  forcedType?: PrimitiveType,
  canvasWidth: number = 800,
  canvasHeight: number = 600
): Primitive3DChallenge {
  const rng = seededRng(seed);

  const type = forcedType || ALL_PRIMITIVES[Math.floor(rng() * ALL_PRIMITIVES.length)];
  const camera = generateDynamicCamera(rng, canvasWidth, canvasHeight);

  const viewMatrix = createLookAtMatrix(camera.eye, camera.target, camera.up);
  const projMatrix = createPerspectiveMatrix(camera.fov, camera.aspectRatio, camera.near, camera.far);
  const viewProjMatrix = multiplyMatrices(projMatrix, viewMatrix);

  // Puntos de fuga exactos
  const vanishingPoints = calculateVanishingPoints(camera, viewProjMatrix, canvasWidth, canvasHeight);

  // Habitación 3D de 6 Paredes completa
  const gridLines = generate6WallRoomGrid(camera, viewMatrix, projMatrix, canvasWidth, canvasHeight);

  let primitiveData: {
    anchorCurves: CurveSegment2D[];
    targetCurves: CurveSegment2D[];
    previewModel3D: WireframeModel3D;
  };

  let name = '';
  let tipText = '';

  switch (type) {
    case 'SPHERE':
      primitiveData = createSpherePrimitive(camera, viewProjMatrix, canvasWidth, canvasHeight);
      name = 'SPHERE';
      tipText = 'Dibuja la silueta exterior y los meridianos guiándote por el ecuador dado.';
      break;
    case 'RING':
      primitiveData = createRingPrimitive(camera, viewProjMatrix, canvasWidth, canvasHeight);
      name = 'RING';
      tipText = 'Construye los anillos concéntricos interior y exterior del toroide.';
      break;
    case 'CUBE':
      primitiveData = createCubePrimitive(camera, viewProjMatrix, canvasWidth, canvasHeight);
      name = 'CUBE';
      tipText = 'Fuga las aristas verticales y de profundidad hacia los 3 puntos de fuga.';
      break;
    case 'CYLINDER':
      primitiveData = createCylinderPrimitive(camera, viewProjMatrix, canvasWidth, canvasHeight);
      name = 'CYLINDER';
      tipText = 'Dibuja la elipse superior y las aristas laterales en fuga vertical.';
      break;
    case 'CONE':
      primitiveData = createConePrimitive(camera, viewProjMatrix, canvasWidth, canvasHeight);
      name = 'CONE';
      tipText = 'Ubica el ápice vertical y conecta las tangentes a la base elíptica.';
      break;
    case 'PYRAMID':
      primitiveData = createPyramidPrimitive(camera, viewProjMatrix, canvasWidth, canvasHeight);
      name = 'PYRAMID';
      tipText = 'Traza las aristas convergentes desde la base hasta la cúspide.';
      break;
    case 'CAPSULE':
      primitiveData = createCapsulePrimitive(camera, viewProjMatrix, canvasWidth, canvasHeight);
      name = 'CAPSULE';
      tipText = 'Construye el cuerpo cilíndrico y la cúpula semiesférica superior.';
      break;
    case 'PRISM':
      primitiveData = createPrismPrimitive(camera, viewProjMatrix, canvasWidth, canvasHeight);
      name = 'PRISM';
      tipText = 'Proyecta las aristas longitudinales hacia el fondo para la cara posterior.';
      break;
  }

  return {
    id: `challenge-3d-${seed}-${type}`,
    type,
    name,
    seed,
    camera,
    vanishingPoints,
    gridLines,
    anchorCurves: primitiveData.anchorCurves,
    targetCurves: primitiveData.targetCurves,
    previewModel3D: primitiveData.previewModel3D,
    tipText,
  };
}
