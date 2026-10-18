/**
 * Paplitz - Motor de Geometría en Perspectiva con Pistas y Guías Didácticas
 */

export interface Point2D {
  x: number;
  y: number;
}

export interface Edge {
  start: number;
  end: number;
  family: 'width' | 'height' | 'depth';
}

export interface Face {
  name: string;
  vertices: [number, number, number, number];
}

export type PerspectiveMode = 'guided' | 'gentle' | 'normal' | 'dynamic';
export type AxesMode = 'xyz' | 'base_axes' | 'none';
export type BoxType = 'cube' | 'tower' | 'slab' | 'dynamic';
export type ViewpointMode = 'normal' | 'high' | 'low' | 'dynamic';
export type RotationAngleMode = 'symmetric' | 'steep_left' | 'steep_right' | 'dynamic';

export interface CubeChallengeOptions {
  mode?: PerspectiveMode;
  axesMode?: AxesMode;
  forceSide?: 'left' | 'right';
  isShadowLevel?: boolean;
  hasGroundGrid?: boolean;
  boxType?: BoxType;
  viewpoint?: ViewpointMode;
  rotationAngle?: RotationAngleMode;
}

export interface CoordinateAxis {
  id: 'X' | 'Y' | 'Z';
  label: string;
  origin: Point2D;
  farPoint: Point2D;
}

export interface LightSource {
  light2D: Point2D;          // Foco de luz en el aire (L)
  groundStation2D: Point2D;  // Base del foco en el plano horizontal (L')
  side: 'left' | 'right';
}

export interface ShadowTargetEdge {
  start: Point2D;
  end: Point2D;
  label: string;
}

export interface ShadowChallengeData {
  light: LightSource;
  shadowVertices2D: Point2D[];
  shadowPolygon: Point2D[];
  targetEdges: ShadowTargetEdge[];
  constructionRays: {
    fromLight: { start: Point2D; end: Point2D };
    fromGround: { start: Point2D; end: Point2D };
    intersection: Point2D;
  }[];
}

export interface CubeChallenge {
  id: string;
  seed: number;
  mode: PerspectiveMode;
  axesMode: AxesMode;
  axes: CoordinateAxis[];
  horizonY: number;
  givenSide: 'left' | 'right';
  vertices2D: Point2D[];
  edges: Edge[];
  givenFace: Face;
  givenEdges: Edge[];
  hintEdges: Edge[]; // Mantenido para retrocompatibilidad
  targetEdges: Edge[];
  targetVertices2D: { [key: number]: Point2D };
  isShadowLevel?: boolean;
  hasGroundGrid?: boolean;
  shadowData?: ShadowChallengeData;
  boxType?: BoxType;
  viewpoint?: ViewpointMode;
  rotationAngle?: RotationAngleMode;
}

function pseudoRandom(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * Genera un paralelepípedo / cubo con proporciones calibradas y ricas en perspectiva:
 * - Soporta Cubo 1:1:1 puro, Torre Vertical (Monolito) y Losa Horizontal (Plataforma).
 * - Soporta puntos de vista contrastados: Cenital (Bird's Eye / alto) y Contrapicado (Worm's Eye / bajo).
 * - Soporta rotaciones angulares asimétricas: 30°/60° y 20°/70° con escorzo diferenciado.
 * - En sombras: proporciones 1:1:1 idénticas para el cubo básico, y sombras adaptadas para torres y losas.
 * - Garantiza que ningún vértice caiga bajo la barra inferior flotante ni bajo el HUD superior.
 */
export function generateCubeChallenge(
  seed: number = Math.floor(Math.random() * 1000000),
  canvasWidth: number = 600,
  canvasHeight: number = 540,
  options: CubeChallengeOptions = {}
): CubeChallenge {
  const rnd = pseudoRandom(seed);
  const isShadow = !!options.isShadowLevel;
  const hasGroundGrid = isShadow ? (options.hasGroundGrid !== undefined ? options.hasGroundGrid : true) : false;
  const mode: PerspectiveMode = isShadow ? 'normal' : (options.mode || (options.axesMode && options.axesMode !== 'none' ? 'guided' : 'normal'));
  const axesMode: AxesMode = isShadow ? 'none' : (options.axesMode !== undefined 
    ? options.axesMode 
    : (mode === 'guided' ? 'xyz' : 'none'));

  // Determinar boxType efectivo
  let rawBoxType: BoxType = options.boxType || 'cube';
  if (rawBoxType === 'dynamic') {
    const val = rnd();
    rawBoxType = val < 0.36 ? 'tower' : val < 0.70 ? 'slab' : 'cube';
  }

  // Determinar viewpoint efectivo (altura de horizonte / picado-contrapicado)
  let rawViewpoint: ViewpointMode = options.viewpoint || 'normal';
  if (rawViewpoint === 'dynamic') {
    rawViewpoint = rnd() > 0.5 ? 'high' : 'low';
  }

  // Determinar rotationAngle efectivo (giro asimétrico de caras 30°/60°)
  let rawRotation: RotationAngleMode = options.rotationAngle || 'symmetric';
  if (rawRotation === 'dynamic') {
    rawRotation = rnd() > 0.5 ? 'steep_left' : 'steep_right';
  }

  const lightSide: 'left' | 'right' = options.forceSide || (rnd() > 0.5 ? 'left' : 'right');
  
  // Posición central X, Y calibrada para mantener todos los vértices en zona segura ([65, 455] en Y, [70, 530] en X)
  let cx = isShadow ? (lightSide === 'left' ? 240 : 360) : canvasWidth / 2;
  let cy = isShadow ? 245 : canvasHeight / 2;

  if (!isShadow) {
    if (rawViewpoint === 'high') {
      cy = 290; // Cubo más abajo para abrir la tapa ampliamente sin tocar el toolbar inferior
    } else if (rawViewpoint === 'low') {
      cy = 205; // Cubo más arriba para el contrapicado sin tocar el HUD superior
    } else {
      cy = 245;
    }
  }

  // Dimensiones según el tipo de caja (boxType)
  let height: number;
  let baseWidth: number;

  if (isShadow) {
    if (rawBoxType === 'tower') {
      height = 118 + rnd() * 8;
      baseWidth = 46 + rnd() * 4;
    } else if (rawBoxType === 'slab') {
      height = 50 + rnd() * 6;
      baseWidth = 90 + rnd() * 6;
    } else {
      // 'cube' en sombras: ¡Proporción cúbica pura 1:1:1 perfecta!
      // Altura 92px con base de 66px a 30° proyecta aristas ópticamente iguales
      height = 92 + rnd() * 4;
      baseWidth = 66 + rnd() * 4;
    }
  } else {
    if (rawBoxType === 'tower') {
      height = 205 + rnd() * 18;
      baseWidth = 74 + rnd() * 8;
    } else if (rawBoxType === 'slab') {
      height = 68 + rnd() * 8;
      baseWidth = 145 + rnd() * 12;
    } else {
      // 'cube': Proporciones de cubo estándar
      if (mode === 'gentle' || mode === 'guided') {
        height = 135 + rnd() * 10;
        baseWidth = 105 + rnd() * 8;
      } else {
        height = 148 + rnd() * 14;
        baseWidth = 112 + rnd() * 10;
      }
    }
  }

  // Escorzo y rotación angular de caras izquierda y derecha
  let leftWidth = baseWidth;
  let rightWidth = baseWidth;
  let leftSlopeRatio = 1.0;
  let rightSlopeRatio = 1.0;

  if (rawRotation === 'steep_left') {
    leftWidth = Math.round(baseWidth * 0.58);
    rightWidth = Math.round(baseWidth * 1.42);
    leftSlopeRatio = 1.65;  // Cara izquierda muy inclinada y escorzada
    rightSlopeRatio = 0.65; // Cara derecha frontal amplia
  } else if (rawRotation === 'steep_right') {
    leftWidth = Math.round(baseWidth * 1.42);
    rightWidth = Math.round(baseWidth * 0.58);
    leftSlopeRatio = 0.65;  // Cara izquierda frontal amplia
    rightSlopeRatio = 1.65; // Cara derecha muy inclinada y escorzada
  }

  // Factor de pendiente según modo de perspectiva y punto de vista
  let topSlopeFactor: number;
  let bottomSlopeFactor: number;

  if (isShadow) {
    topSlopeFactor = 0.20;
    bottomSlopeFactor = 0.17;
  } else if (rawViewpoint === 'high') {
    topSlopeFactor = 0.32;   // Tapa superior muy abierta (Bird's Eye)
    bottomSlopeFactor = 0.16; // Base más horizontal
  } else if (rawViewpoint === 'low') {
    topSlopeFactor = 0.08;   // Tapa superior en escorzo extremo (Worm's Eye)
    bottomSlopeFactor = 0.28; // Base descendente acusada
  } else {
    // Normal / Gentle
    if (mode === 'gentle' || mode === 'guided') {
      // 1.4 Fuga suave: ángulo sereno ~14°, casi paralelo
      topSlopeFactor = 0.14;
      bottomSlopeFactor = 0.12;
    } else if (mode === 'dynamic') {
      topSlopeFactor = 0.28;
      bottomSlopeFactor = 0.22;
    } else {
      // 2.1 Perspectiva cónica natural: convergencia clara ~24° arriba, ~18° abajo
      topSlopeFactor = 0.24;
      bottomSlopeFactor = 0.18;
    }
  }

  const leftSlopeTop = leftWidth * topSlopeFactor * leftSlopeRatio;
  const leftSlopeBottom = leftWidth * bottomSlopeFactor * leftSlopeRatio;
  const rightSlopeTop = rightWidth * topSlopeFactor * rightSlopeRatio;
  const rightSlopeBottom = rightWidth * bottomSlopeFactor * rightSlopeRatio;

  const frontX = cx;
  const frontYBottom = cy + height * 0.38;
  const frontYTop = frontYBottom - height;

  const leftX = frontX - leftWidth;
  const leftYTop = frontYTop - leftSlopeTop;
  const leftYBottom = frontYBottom - leftSlopeBottom;

  const rightX = frontX + rightWidth;
  const rightYTop = frontYTop - rightSlopeTop;
  const rightYBottom = frontYBottom - rightSlopeBottom;

  const backX = frontX - leftWidth + rightWidth;
  const backYTop = leftYTop - rightSlopeTop;

  // Vértices:
  // 0: Frontal Abajo
  // 1: Frontal Arriba
  // 2: Izquierda Abajo
  // 3: Izquierda Arriba
  // 4: Derecha Abajo
  // 5: Derecha Arriba
  // 6: Trasero Arriba (Tapa)
  const vertices2D: Point2D[] = [
    { x: frontX, y: frontYBottom }, // 0
    { x: frontX, y: frontYTop },    // 1
    { x: leftX,  y: leftYBottom },  // 2
    { x: leftX,  y: leftYTop },     // 3
    { x: rightX, y: rightYBottom }, // 4
    { x: rightX, y: rightYTop },    // 5
    { x: backX,  y: backYTop },     // 6
  ];

  const givenSide: 'left' | 'right' = options.forceSide || (rnd() > 0.5 ? 'left' : 'right');

  let givenFace: Face;
  let givenEdges: Edge[];
  let allTargetEdges: Edge[];
  const hintEdges: Edge[] = [];

  if (givenSide === 'left') {
    givenFace = {
      name: 'Cara Izquierda',
      vertices: [0, 1, 3, 2],
    };

    givenEdges = [
      { start: 0, end: 1, family: 'height' },
      { start: 1, end: 3, family: 'width' },
      { start: 3, end: 2, family: 'height' },
      { start: 2, end: 0, family: 'width' },
    ];

    allTargetEdges = [
      { start: 0, end: 4, family: 'depth' },  // Base derecha
      { start: 1, end: 5, family: 'depth' },  // Techo derecho
      { start: 4, end: 5, family: 'height' }, // Vertical derecha
      { start: 3, end: 6, family: 'depth' },  // Tapa hacia atrás-der
      { start: 5, end: 6, family: 'width' },  // Tapa hacia atrás-izq
    ];
  } else {
    givenFace = {
      name: 'Cara Derecha',
      vertices: [0, 1, 5, 4],
    };

    givenEdges = [
      { start: 0, end: 1, family: 'height' },
      { start: 1, end: 5, family: 'depth' },
      { start: 5, end: 4, family: 'height' },
      { start: 4, end: 0, family: 'depth' },
    ];

    allTargetEdges = [
      { start: 0, end: 2, family: 'width' },  // Base izquierda
      { start: 1, end: 3, family: 'width' },  // Techo izquierdo
      { start: 2, end: 3, family: 'height' }, // Vertical izquierda
      { start: 5, end: 6, family: 'width' },  // Tapa hacia atrás-izq
      { start: 3, end: 6, family: 'depth' },  // Tapa hacia atrás-der
    ];
  }

  // Las aristas que debe dibujar el usuario: las 5 aristas faltantes (o vacío en nivel de sombras)
  const targetEdges = isShadow ? [] : allTargetEdges;

  let shadowData: ShadowChallengeData | undefined = undefined;

  if (isShadow) {
    // En nivel de sombra, el cubo ya está completamente construido (las 9 aristas visibles dadas)
    givenEdges = [
      { start: 0, end: 1, family: 'height' },
      { start: 1, end: 3, family: 'width' },
      { start: 3, end: 2, family: 'height' },
      { start: 2, end: 0, family: 'width' },
      { start: 1, end: 5, family: 'depth' },
      { start: 5, end: 4, family: 'height' },
      { start: 4, end: 0, family: 'depth' },
      { start: 3, end: 6, family: 'depth' },
      { start: 5, end: 6, family: 'width' },
    ];

    const lightX = lightSide === 'left' ? 75 : 525;
    const lightY = 18;
    const groundStationY = 245;

    const light2D: Point2D = { x: lightX, y: lightY };
    const groundStation2D: Point2D = { x: lightX, y: groundStationY };
    const lightSource: LightSource = { light2D, groundStation2D, side: lightSide };

    const H_light = groundStationY - lightY;

    const clampShadowPt = (p: Point2D): Point2D => ({
      x: Math.round(Math.max(45, Math.min(canvasWidth - 45, p.x))),
      y: Math.round(Math.max(50, Math.min(canvasHeight - 80, p.y))),
    });

    if (lightSide === 'left') {
      // 3 postes verticales que delimitan la silueta de sombra (de izq a der):
      // 1. Poste izquierdo: V2 (suelo) -> V3 (techo)
      const H_edge1 = vertices2D[2].y - vertices2D[3].y;
      const u1 = H_light / (H_light - H_edge1);
      const S1 = clampShadowPt({
        x: Math.round(lightX + u1 * (vertices2D[2].x - lightX)),
        y: Math.round(groundStationY + u1 * (vertices2D[2].y - groundStationY)),
      });

      // 2. Poste frontal central: V0 (suelo) -> V1 (techo)
      const H_edge2 = vertices2D[0].y - vertices2D[1].y;
      const u2 = H_light / (H_light - H_edge2);
      const S2 = clampShadowPt({
        x: Math.round(lightX + u2 * (vertices2D[0].x - lightX)),
        y: Math.round(groundStationY + u2 * (vertices2D[0].y - groundStationY)),
      });

      // 3. Poste derecho: V4 (suelo) -> V5 (techo)
      const H_edge3 = vertices2D[4].y - vertices2D[5].y;
      const u3 = H_light / (H_light - H_edge3);
      const S3 = clampShadowPt({
        x: Math.round(lightX + u3 * (vertices2D[4].x - lightX)),
        y: Math.round(groundStationY + u3 * (vertices2D[4].y - groundStationY)),
      });

      const shadowVertices2D = [S1, S2, S3];
      const shadowPolygon = [vertices2D[2], S1, S2, S3, vertices2D[4], vertices2D[0]];
      const targetShadowEdges: ShadowTargetEdge[] = [
        { start: vertices2D[2], end: S1, label: 'Rayo Suelo Izquierdo' },
        { start: S1, end: S2, label: 'Cresta Superior Izquierda' },
        { start: S2, end: S3, label: 'Cresta Superior Derecha' },
        { start: S3, end: vertices2D[4], label: 'Rayo Suelo Derecho' },
      ];

      const constructionRays = [
        { fromLight: { start: light2D, end: S1 }, fromGround: { start: groundStation2D, end: S1 }, intersection: S1 },
        { fromLight: { start: light2D, end: S2 }, fromGround: { start: groundStation2D, end: S2 }, intersection: S2 },
        { fromLight: { start: light2D, end: S3 }, fromGround: { start: groundStation2D, end: S3 }, intersection: S3 },
      ];

      shadowData = {
        light: lightSource,
        shadowVertices2D,
        shadowPolygon,
        targetEdges: targetShadowEdges,
        constructionRays,
      };
    } else {
      // Luz desde la derecha: los postes proyectan la sombra hacia la izquierda
      // 1. Poste derecho: V4 (suelo) -> V5 (techo)
      const H_edge1 = vertices2D[4].y - vertices2D[5].y;
      const u1 = H_light / (H_light - H_edge1);
      const S1 = clampShadowPt({
        x: Math.round(lightX + u1 * (vertices2D[4].x - lightX)),
        y: Math.round(groundStationY + u1 * (vertices2D[4].y - groundStationY)),
      });

      // 2. Poste frontal central: V0 (suelo) -> V1 (techo)
      const H_edge2 = vertices2D[0].y - vertices2D[1].y;
      const u2 = H_light / (H_light - H_edge2);
      const S2 = clampShadowPt({
        x: Math.round(lightX + u2 * (vertices2D[0].x - lightX)),
        y: Math.round(groundStationY + u2 * (vertices2D[0].y - groundStationY)),
      });

      // 3. Poste izquierdo: V2 (suelo) -> V3 (techo)
      const H_edge3 = vertices2D[2].y - vertices2D[3].y;
      const u3 = H_light / (H_light - H_edge3);
      const S3 = clampShadowPt({
        x: Math.round(lightX + u3 * (vertices2D[2].x - lightX)),
        y: Math.round(groundStationY + u3 * (vertices2D[2].y - groundStationY)),
      });

      const shadowVertices2D = [S1, S2, S3];
      const shadowPolygon = [vertices2D[4], S1, S2, S3, vertices2D[2], vertices2D[0]];
      const targetShadowEdges: ShadowTargetEdge[] = [
        { start: vertices2D[4], end: S1, label: 'Rayo Suelo Derecho' },
        { start: S1, end: S2, label: 'Cresta Superior Derecha' },
        { start: S2, end: S3, label: 'Cresta Superior Izquierda' },
        { start: S3, end: vertices2D[2], label: 'Rayo Suelo Izquierdo' },
      ];

      const constructionRays = [
        { fromLight: { start: light2D, end: S1 }, fromGround: { start: groundStation2D, end: S1 }, intersection: S1 },
        { fromLight: { start: light2D, end: S2 }, fromGround: { start: groundStation2D, end: S2 }, intersection: S2 },
        { fromLight: { start: light2D, end: S3 }, fromGround: { start: groundStation2D, end: S3 }, intersection: S3 },
      ];

      shadowData = {
        light: lightSource,
        shadowVertices2D,
        shadowPolygon,
        targetEdges: targetShadowEdges,
        constructionRays,
      };
    }
  }

  // Cálculo de los ejes de referencia proyectados X, Y, Z (proporción óptima con confinamiento seguro)
  const safeCanvasBox: BoundingBox2D = {
    left: 45,
    right: canvasWidth - 45,
    top: 55,
    bottom: canvasHeight - 75,
  };

  const axes: CoordinateAxis[] = [];
  const rawAxisZFar = { x: vertices2D[0].x, y: vertices2D[0].y - (height + 65) };
  const rawAxisXFar = {
    x: vertices2D[0].x + (vertices2D[2].x - vertices2D[0].x) * 1.55,
    y: vertices2D[0].y + (vertices2D[2].y - vertices2D[0].y) * 1.55,
  };
  const rawAxisYFar = {
    x: vertices2D[0].x + (vertices2D[4].x - vertices2D[0].x) * 1.55,
    y: vertices2D[0].y + (vertices2D[4].y - vertices2D[0].y) * 1.55,
  };

  const axisZ: CoordinateAxis = {
    id: 'Z',
    label: 'Z',
    origin: vertices2D[0],
    farPoint: clampRayToBox(vertices2D[0].x, vertices2D[0].y, rawAxisZFar.x, rawAxisZFar.y, safeCanvasBox, 10),
  };

  const axisX: CoordinateAxis = {
    id: 'X',
    label: 'X',
    origin: vertices2D[0],
    farPoint: clampRayToBox(vertices2D[0].x, vertices2D[0].y, rawAxisXFar.x, rawAxisXFar.y, safeCanvasBox, 10),
  };

  const axisY: CoordinateAxis = {
    id: 'Y',
    label: 'Y',
    origin: vertices2D[0],
    farPoint: clampRayToBox(vertices2D[0].x, vertices2D[0].y, rawAxisYFar.x, rawAxisYFar.y, safeCanvasBox, 10),
  };

  if (!isShadow && axesMode === 'xyz') {
    axes.push(axisX, axisY, axisZ);
  } else if (!isShadow && axesMode === 'base_axes') {
    axes.push(axisX, axisY);
  }

  const givenVertexSet = new Set(givenFace.vertices);

  const targetVertices2D: { [key: number]: Point2D } = {};
  vertices2D.forEach((p, idx) => {
    if (!givenVertexSet.has(idx)) {
      targetVertices2D[idx] = p;
    }
  });

  const horizonY = isShadow
    ? 210
    : (rawViewpoint === 'high' ? 110 : rawViewpoint === 'low' ? 255 : frontYTop - 45);

  return {
    id: `cube-${seed}`,
    seed,
    mode,
    axesMode,
    axes,
    horizonY,
    givenSide,
    vertices2D,
    edges: [...givenEdges, ...targetEdges],
    givenFace,
    givenEdges,
    hintEdges,
    targetEdges,
    targetVertices2D,
    isShadowLevel: isShadow,
    hasGroundGrid,
    shadowData,
    boxType: rawBoxType,
    viewpoint: rawViewpoint,
    rotationAngle: rawRotation,
  };
}

export interface BoundingBox2D {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * Confinamiento geométrico estricto:
 * Recorta un eje o vector de proyección desde su origen para que permanezca
 * dentro de un rectángulo delimitador, dejando holgura perimetral para flechas y texto.
 */
export function clampRayToBox(
  ox: number,
  oy: number,
  rawFx: number,
  rawFy: number,
  box: BoundingBox2D,
  endPadding: number = 0
): Point2D {
  const dx = rawFx - ox;
  const dy = rawFy - oy;
  const rawDist = Math.hypot(dx, dy);
  if (rawDist < 0.001) return { x: rawFx, y: rawFy };

  const ux = dx / rawDist;
  const uy = dy / rawDist;

  let maxDist = rawDist;

  // Intersección con los bordes horizontales del recuadro
  if (ux > 0.0001) {
    maxDist = Math.min(maxDist, (box.right - ox) / ux);
  } else if (ux < -0.0001) {
    maxDist = Math.min(maxDist, (box.left - ox) / ux);
  }

  // Intersección con los bordes verticales del recuadro
  if (uy > 0.0001) {
    maxDist = Math.min(maxDist, (box.bottom - oy) / uy);
  } else if (uy < -0.0001) {
    maxDist = Math.min(maxDist, (box.top - oy) / uy);
  }

  const safeDist = Math.max(5, Math.min(rawDist, maxDist - endPadding));

  return {
    x: ox + ux * safeDist,
    y: oy + uy * safeDist,
  };
}
