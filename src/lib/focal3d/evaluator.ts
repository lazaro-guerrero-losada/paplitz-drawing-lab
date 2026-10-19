/**
 * Motor de Evaluación para el Laboratorio de Perspectiva con 1 Punto Focal (Focal 3D)
 * Evalúa con precisión matemática la proximidad, el paralelismo, la convergencia al punto focal central
 * y la integridad estructural (3 líneas en cubo, eje y radio en cilindro, 3 aristas en prisma triangular).
 */

import { Point2D, UserStroke3D, GradeLevel, CurveSegment2D } from '../perspective3d/types';
import { Focal3DChallenge, FocalEvaluationResult, ShapeEvaluationDetail } from './types';

function distSq(p1: Point2D, p2: Point2D): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return dx * dx + dy * dy;
}

function dist(p1: Point2D, p2: Point2D): number {
  return Math.sqrt(distSq(p1, p2));
}

function pointToSegmentDistance(p: Point2D, a: Point2D, b: Point2D): number {
  const l2 = distSq(a, b);
  if (l2 < 0.0001) return dist(p, a);
  let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return dist(p, { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
}

interface UserLineSegment {
  a: Point2D;
  b: Point2D;
  dir: Point2D; // vector unitario
  len: number;
}

/**
 * Convierte los trazos de tinta del usuario en segmentos lineales con vector unitario
 */
function extractUserSegments(strokes: UserStroke3D[]): UserLineSegment[] {
  const segments: UserLineSegment[] = [];
  for (const s of strokes) {
    if (s.isConstruction) continue; // Las líneas de construcción no evalúan negativamente
    const pts = s.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const len = dist(a, b);
      if (len < 0.5) continue;
      segments.push({
        a,
        b,
        dir: { x: (b.x - a.x) / len, y: (b.y - a.y) / len },
        len,
      });
    }
  }
  return segments;
}

/**
 * Evalúa una curva objetivo contra el conjunto de trazos del usuario
 */
function evaluateSingleCurve(
  curve: CurveSegment2D,
  userSegments: UserLineSegment[],
  matchThreshold = 22.0
): { coverage: number; precision: number; isCompleted: boolean } {
  const pts = curve.points;
  if (pts.length < 2 || userSegments.length === 0) {
    return { coverage: 0, precision: 0, isCompleted: false };
  }

  let matchedSampleCount = 0;
  let totalSampleDist = 0;
  const sampleCount = pts.length;

  for (let i = 0; i < sampleCount; i++) {
    const p = pts[i];
    // Tangente teórica de la curva objetivo
    const prev = i > 0 ? pts[i - 1] : pts[0];
    const next = i < sampleCount - 1 ? pts[i + 1] : pts[sampleCount - 1];
    const tLen = dist(prev, next);
    const targetDir = tLen > 0.001
      ? { x: (next.x - prev.x) / tLen, y: (next.y - prev.y) / tLen }
      : { x: 1, y: 0 };

    let bestDist = Infinity;
    for (const uSeg of userSegments) {
      // Filtrado direccional: solo consideramos trazos que apunten en una dirección compatible
      // (|cos(theta)| >= 0.50)
      const dot = Math.abs(uSeg.dir.x * targetDir.x + uSeg.dir.y * targetDir.y);
      if (dot < 0.50) continue;

      const d = pointToSegmentDistance(p, uSeg.a, uSeg.b);
      if (d < bestDist) {
        bestDist = d;
      }
    }

    if (bestDist <= matchThreshold) {
      matchedSampleCount++;
      totalSampleDist += bestDist;
    }
  }

  const coverage = matchedSampleCount / sampleCount;
  const avgDist = matchedSampleCount > 0 ? totalSampleDist / matchedSampleCount : matchThreshold;
  const precision = Math.max(0, 1 - avgDist / matchThreshold);
  const isCompleted = coverage >= 0.45 && precision >= 0.45;

  return { coverage, precision, isCompleted };
}

/**
 * Validador principal para retos de perspectiva con 1 punto focal central
 */
export function evaluateFocal3DSubmission(
  strokes: UserStroke3D[],
  challenge: Focal3DChallenge
): FocalEvaluationResult {
  // 1. Validar lienzo vacío
  const inkStrokes = strokes.filter((s) => !s.isConstruction);
  if (inkStrokes.length === 0) {
    return {
      score: 0,
      passed: false,
      grade: 'D',
      precisionScore: 0,
      coverageScore: 0,
      focalConvergenceScore: 0,
      feedbackTitle: '¡Lienzo Vacío!',
      feedbackMessage: 'Dibuja las formas 3D haciendo converger sus aristas de profundidad hacia el punto focal central.',
      tipMessage: 'Usa las 8 líneas discontinuas como guía visual hacia el punto focal.',
      shapeDetails: [],
      matchedCurves: [],
      missingCurves: challenge.shapes.flatMap((s) => s.allCurves.map((c) => ({ points: c.points }))),
      drawnCount: 0,
      targetCount: challenge.shapes.reduce((acc, s) => acc + s.allCurves.length, 0),
    };
  }

  const userSegments = extractUserSegments(strokes);

  // 2. Evaluar cada forma precalculada
  const shapeDetails: ShapeEvaluationDetail[] = [];
  const matchedCurves: { points: Point2D[]; accuracy: number }[] = [];
  const missingCurves: { points: Point2D[] }[] = [];

  let sumCoverage = 0;
  let sumPrecision = 0;
  let totalEvaluatedCurves = 0;

  for (const shape of challenge.shapes) {
    let shapeCompletedCurves = 0;
    const missingParts: string[] = [];

    // A. Evaluar caras frontales
    let frontOk = 0;
    for (const c of shape.frontCurves) {
      const res = evaluateSingleCurve(c, userSegments);
      sumCoverage += res.coverage;
      sumPrecision += res.precision;
      totalEvaluatedCurves++;
      if (res.isCompleted) {
        shapeCompletedCurves++;
        frontOk++;
        matchedCurves.push({ points: c.points, accuracy: res.precision });
      } else {
        missingCurves.push({ points: c.points });
      }
    }
    if (frontOk < shape.frontCurves.length * 0.5) {
      missingParts.push('Cara frontal incompleta');
    }

    // B. Evaluar líneas de fuga hacia el punto focal
    let depthOk = 0;
    for (const c of shape.depthCurves) {
      const res = evaluateSingleCurve(c, userSegments);
      sumCoverage += res.coverage;
      sumPrecision += res.precision;
      totalEvaluatedCurves++;
      if (res.isCompleted) {
        shapeCompletedCurves++;
        depthOk++;
        matchedCurves.push({ points: c.points, accuracy: res.precision });
      } else {
        missingCurves.push({ points: c.points });
      }
    }

    // Requisito didáctico: En cubo/prisma se requieren 3 líneas de profundidad
    if (shape.type === 'CUBE' && depthOk < 3) {
      missingParts.push(`Faltan líneas de fuga (trazadas ${depthOk} de 3 necesarias al punto focal)`);
    } else if (shape.type === 'TRIANGULAR_PRISM' && depthOk < 3) {
      missingParts.push(`Faltan aristas de profundidad (trazadas ${depthOk} de 3 necesarias)`);
    }

    // C. Requisitos específicos de CILINDRO (Eje central y Radio)
    if (shape.axisCurve) {
      const axisRes = evaluateSingleCurve(shape.axisCurve, userSegments);
      sumCoverage += axisRes.coverage;
      sumPrecision += axisRes.precision;
      totalEvaluatedCurves++;
      if (axisRes.isCompleted) {
        shapeCompletedCurves++;
        matchedCurves.push({ points: shape.axisCurve.points, accuracy: axisRes.precision });
      }
    }

    if (shape.radiusCurve) {
      const radiusRes = evaluateSingleCurve(shape.radiusCurve, userSegments);
      sumCoverage += radiusRes.coverage;
      sumPrecision += radiusRes.precision;
      totalEvaluatedCurves++;
      if (radiusRes.isCompleted) {
        shapeCompletedCurves++;
        matchedCurves.push({ points: shape.radiusCurve.points, accuracy: radiusRes.precision });
      }
    }

    // D. Evaluar caras traseras
    for (const c of shape.backCurves) {
      const res = evaluateSingleCurve(c, userSegments);
      sumCoverage += res.coverage;
      sumPrecision += res.precision;
      totalEvaluatedCurves++;
      if (res.isCompleted) {
        shapeCompletedCurves++;
        matchedCurves.push({ points: c.points, accuracy: res.precision });
      } else {
        missingCurves.push({ points: c.points });
      }
    }

    const totalShapeCurves = shape.allCurves.length;
    const shapeCoverage = totalShapeCurves > 0 ? shapeCompletedCurves / totalShapeCurves : 0;
    const shapeScore = Math.round(shapeCoverage * 100);

    shapeDetails.push({
      shapeId: shape.id,
      type: shape.type,
      score: shapeScore,
      coverage: Math.round(shapeCoverage * 100) / 100,
      precision: Math.round((sumPrecision / Math.max(1, totalEvaluatedCurves)) * 100) / 100,
      isComplete: missingParts.length === 0 && shapeScore >= 70,
      missingParts,
    });
  }

  // 3. Puntuación Global Ponderada
  const rawCoverage = totalEvaluatedCurves > 0 ? sumCoverage / totalEvaluatedCurves : 0;
  const rawPrecision = totalEvaluatedCurves > 0 ? sumPrecision / totalEvaluatedCurves : 0;

  const coverageScore = Math.round(rawCoverage * 100);
  const precisionScore = Math.round(rawPrecision * 100);
  const focalConvergenceScore = Math.round((precisionScore * 0.6 + coverageScore * 0.4));

  // La nota depende estrechamente de la proximidad a las líneas precalculadas (tal como pidió el usuario)
  const finalScore = Math.max(
    0,
    Math.min(100, Math.round(precisionScore * 0.50 + coverageScore * 0.50))
  );

  const passed = finalScore >= 70;

  let grade: GradeLevel = 'D';
  if (finalScore >= 90) grade = 'S';
  else if (finalScore >= 80) grade = 'A';
  else if (finalScore >= 70) grade = 'B';
  else if (finalScore >= 50) grade = 'C';

  // 4. Feedback didáctico
  let feedbackTitle = '¡Perspectiva Cónica Dominada! 🌟';
  let feedbackMessage = `Excelente convergencia hacia el punto focal (${finalScore}%). Las aristas de profundidad convergen con rigurosidad matemática.`;
  let tipMessage = 'Mantén la muñeca firme y usa trazos rectilíneos directos hacia el centro.';

  const missingAll = shapeDetails.flatMap((s) => s.missingParts);

  if (finalScore < 70) {
    feedbackTitle = 'Ajusta la Convergencia al Punto Focal 💨';
    feedbackMessage = missingAll.length > 0
      ? `Revisa las líneas: ${missingAll.slice(0, 2).join('; ')}.`
      : `La proximidad a las aristas precalculadas necesita mayor precisión (${finalScore}%).`;
    tipMessage = 'Usa la herramienta "Ayuda: Línea" para visualizar los rayos que conectan cada vértice con el punto focal.';
  } else if (finalScore >= 90) {
    feedbackTitle = '¡Geometría 3D Impecable! 🏆';
    feedbackMessage = `Puntuación sobresaliente de ${finalScore}%. Todas las aristas de profundidad conectan con el punto focal sin desviaciones.`;
    tipMessage = 'Intenta ahora practicar sin ayudas visuales para afianzar tu percepción espacial.';
  }

  return {
    score: finalScore,
    passed,
    grade,
    precisionScore,
    coverageScore,
    focalConvergenceScore,
    feedbackTitle,
    feedbackMessage,
    tipMessage,
    shapeDetails,
    matchedCurves,
    missingCurves,
    drawnCount: matchedCurves.length,
    targetCount: totalEvaluatedCurves,
  };
}
