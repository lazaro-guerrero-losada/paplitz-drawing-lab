/**
 * Tipos y estructuras para el Laboratorio de Perspectiva con 1 Punto Focal (Focal 3D)
 * Paisaje en perspectiva cónica con 8 líneas discontinuas que convergen en 1 punto focal central.
 */

import { Point2D, GradeLevel, CurveSegment2D } from '../perspective3d/types';

export type Focal3DShapeType =
  | 'CUBE'              // Cubo / Prisma rectangular (3 aristas de fuga al punto focal)
  | 'CYLINDER'          // Cilindro (Elipse frontal + elipse trasera + 2 tangentes + EJE + RADIO)
  | 'TRIANGULAR_PRISM'  // Prisma triangular (3 aristas de fuga al punto focal)
  | 'PYRAMID'           // Pirámide (base + aristas que convergen al ápice / eje focal)
  | 'HEXAGON_PRISM'     // Prisma hexagonal
  | 'MIXED_WHEEL';      // Rueda completa mixta con las 8 formas alrededor del punto focal

export type FocalAidMode = 'off' | 'line' | 'vertices';
export type FocalVisionMode = 'all' | 'solution' | 'drawing' | 'off';
export type FocalPracticeMode = 'single' | 'full_wheel';

export interface FocalRay {
  index: number; // 0 a 7
  angleDeg: number; // 0, 45, 90, 135, 180, 225, 270, 315
  label: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface PrecalculatedShape3D {
  id: string;
  type: Focal3DShapeType;
  title: string;
  sectorIndex: number; // 0 a 7
  angleDeg: number;
  centerPos: Point2D;
  // Componentes geométricas para evaluación didáctica
  frontCurves: CurveSegment2D[];
  backCurves: CurveSegment2D[];
  depthCurves: CurveSegment2D[]; // Las líneas de fuga hacia el punto focal
  axisCurve?: CurveSegment2D;    // Eje central requerido en cilindro
  radiusCurve?: CurveSegment2D;  // Radio del cilindro
  guidelinesToFocal: CurveSegment2D[]; // Rayos discontinuos desde los vértices hasta el punto focal
  anchorCurves: CurveSegment2D[]; // Líneas de referencia permanentes que indican dónde está la forma y sus dimensiones (visibles siempre, con o sin ayudas)
  allCurves: CurveSegment2D[];   // Todas las curvas objetivo que el alumno debe dibujar
}

export interface Focal3DChallenge {
  id: string;
  title: string;
  subtitle: string;
  seed: number;
  mode: FocalPracticeMode; // 'single' (un sector por ronda) o 'full_wheel' (las 8 formas a la vez)
  shapeType: Focal3DShapeType;
  focalPoint: Point2D;
  focalRays: FocalRay[];
  shapes: PrecalculatedShape3D[];
  activeSectorIndex: number;
  tipText: string;
}

export interface ShapeEvaluationDetail {
  shapeId: string;
  type: Focal3DShapeType;
  score: number;
  coverage: number;
  precision: number;
  isComplete: boolean;
  missingParts: string[];
}

export interface FocalEvaluationResult {
  score: number; // 0 - 100
  passed: boolean;
  grade: GradeLevel;
  precisionScore: number;
  coverageScore: number;
  focalConvergenceScore: number;
  feedbackTitle: string;
  feedbackMessage: string;
  tipMessage: string;
  shapeDetails: ShapeEvaluationDetail[];
  matchedCurves: { points: Point2D[]; accuracy: number }[];
  missingCurves: { points: Point2D[] }[];
  drawnCount: number;
  targetCount: number;
}
