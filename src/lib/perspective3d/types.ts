/**
 * Tipos y estructuras de datos para el Laboratorio de Perspectiva 3D (Lab 3D)
 * Inspirado en el sistema de entrenamiento en perspectiva dinámica de Artly ("Forms - Guess").
 */

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface Point2D {
  x: number;
  y: number;
}

export interface Camera3D {
  eye: Vector3D;
  target: Vector3D;
  up: Vector3D;
  fov: number; // Grados del ángulo de visión vertical (50 - 75)
  aspectRatio: number;
  near: number;
  far: number;
}

export interface VanishingPoint {
  axis: 'X' | 'Y' | 'Z';
  label: string;
  point: Point2D; // Coordenadas 2D proyectadas
  isOnScreen: boolean;
  screenEdgePoint: Point2D; // Coordenada en el borde de la pantalla si está fuera
  angleDeg: number; // Ángulo de dirección desde el centro de la pantalla
}

export interface PerspectiveGridLine {
  start: Point2D;
  end: Point2D;
  axis: 'X' | 'Y' | 'Z' | 'neutral';
  opacity?: number;
}

export interface CurveSegment2D {
  id: string;
  points: Point2D[];
  isGiven: boolean; // Si es parte del ancla inicial proporcionada
  label: string;
  style?: 'solid' | 'dashed' | 'faint';
}

export type PrimitiveType =
  | 'SPHERE'
  | 'RING'
  | 'CUBE'
  | 'CYLINDER'
  | 'CONE'
  | 'PYRAMID'
  | 'CAPSULE'
  | 'PRISM';

export interface WireframeModel3D {
  vertices: Vector3D[];
  edges: [number, number][];
  rings?: Vector3D[][]; // Para primitivas con curvas continuas
}

export interface Primitive3DChallenge {
  id: string;
  type: PrimitiveType;
  name: string;
  seed: number;
  camera: Camera3D;
  vanishingPoints: {
    X?: VanishingPoint;
    Y?: VanishingPoint;
    Z?: VanishingPoint;
  };
  gridLines: PerspectiveGridLine[];
  anchorCurves: CurveSegment2D[]; // Trazos base dados (líneas negras sólidas / grises tenues)
  targetCurves: CurveSegment2D[]; // Curvas que el usuario debe dibujar
  previewModel3D: WireframeModel3D; // Modelo 3D rotatorio para la tarjeta superior derecha
  tipText: string;
}

export interface UserStroke3D {
  id: string;
  points: Point2D[];
  timestamp: number;
}

export type GradeLevel = 'S' | 'A' | 'B' | 'C' | 'D';

export interface EvaluationResult3D {
  score: number; // 0.0 - 100.0
  grade: GradeLevel;
  feedbackMessage: string;
  matchedSegments: {
    points: Point2D[];
    accuracy: number;
  }[];
  missingSegments: {
    points: Point2D[];
  }[];
  userStrokes: UserStroke3D[];
  drawnCount: number;
  targetCount: number;
}
