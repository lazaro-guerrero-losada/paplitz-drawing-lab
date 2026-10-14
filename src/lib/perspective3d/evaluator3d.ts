/**
 * Motor de Evaluación y Puntuación para Lab 3D
 * Compara los trazos del usuario contra las curvas objetivo proyectadas en perspectiva 3D.
 * Produce el desglose visual de líneas verdes (acertadas) y rojas (faltantes o desviadas),
 * nota con letra (S, A, B, C, D) y puntaje exacto con un decimal.
 */

import { Point2D, CurveSegment2D, UserStroke3D, EvaluationResult3D, GradeLevel } from './types';

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

export function evaluate3DSubmission(
  userStrokes: UserStroke3D[],
  targetCurves: CurveSegment2D[]
): EvaluationResult3D {
  // Si no hay trazos del usuario
  if (userStrokes.length === 0) {
    return {
      score: 0.0,
      grade: 'D',
      feedbackMessage: 'No lines drawn: start by tracing the missing forms in perspective.',
      matchedSegments: [],
      missingSegments: targetCurves.map((c) => ({ points: c.points })),
      userStrokes: [],
      drawnCount: 0,
      targetCount: targetCurves.length,
    };
  }

  // Pre-aplanar los segmentos de todos los trazos del usuario para búsqueda rápida
  const userSegments: { a: Point2D; b: Point2D }[] = [];
  userStrokes.forEach((s) => {
    for (let i = 0; i < s.points.length - 1; i++) {
      userSegments.push({ a: s.points[i], b: s.points[i + 1] });
    }
  });

  // Distancia máxima calibrada a 28px para acomodar la variabilidad natural del trazo libre a mano alzada / stylus
  const MATCH_THRESHOLD = 28.0;

  const matchedSegments: { points: Point2D[]; accuracy: number }[] = [];
  const missingSegments: { points: Point2D[] }[] = [];

  let totalTargetSamplePoints = 0;
  let totalMatchedPoints = 0;
  let totalDistanceErrors = 0;

  targetCurves.forEach((curve) => {
    if (curve.points.length < 2) return;

    let currentSegment: Point2D[] = [];
    let currentIsMatched: boolean | null = null;
    let curveMatchedPoints = 0;

    curve.points.forEach((targetPt) => {
      totalTargetSamplePoints++;

      // Buscar distancia mínima a cualquier segmento del usuario
      let minDist = Infinity;
      for (let j = 0; j < userSegments.length; j++) {
        const d = pointToSegmentDistance(targetPt, userSegments[j].a, userSegments[j].b);
        if (d < minDist) {
          minDist = d;
          if (minDist < 4) break; // Optimización de salida temprana
        }
      }

      const isMatched = minDist <= MATCH_THRESHOLD;

      if (isMatched) {
        totalMatchedPoints++;
        totalDistanceErrors += minDist;
        curveMatchedPoints++;
      }

      // Agrupación contigua en segmentos para el renderizado coloreado
      if (currentIsMatched === null) {
        currentIsMatched = isMatched;
        currentSegment.push(targetPt);
      } else if (currentIsMatched === isMatched) {
        currentSegment.push(targetPt);
      } else {
        // Cambio de estado
        if (currentSegment.length > 1) {
          if (currentIsMatched) {
            matchedSegments.push({ points: currentSegment, accuracy: 1.0 });
          } else {
            missingSegments.push({ points: currentSegment });
          }
        }
        currentSegment = [currentSegment[currentSegment.length - 1], targetPt];
        currentIsMatched = isMatched;
      }
    });

    if (currentSegment.length > 1) {
      if (currentIsMatched) {
        matchedSegments.push({ points: currentSegment, accuracy: 1.0 });
      } else {
        missingSegments.push({ points: currentSegment });
      }
    }
  });

  // Cálculo del ratio de cobertura y precisión
  const coverageRatio = totalTargetSamplePoints > 0 ? totalMatchedPoints / totalTargetSamplePoints : 0;
  const avgDistance = totalMatchedPoints > 0 ? totalDistanceErrors / totalMatchedPoints : MATCH_THRESHOLD;
  const precisionRatio = Math.max(0, 1 - avgDistance / MATCH_THRESHOLD);

  // Penalización por trazos superfluos o descontrolados (generoso con bocetado y construcción)
  let totalUserPoints = 0;
  userStrokes.forEach((s) => (totalUserPoints += s.points.length));
  const excessFactor = totalUserPoints > totalTargetSamplePoints * 3.5 ? 0.9 : 1.0;

  // Puntaje final (0.0 a 100.0)
  let rawScore = (coverageRatio * 75 + precisionRatio * 25) * excessFactor;
  rawScore = Math.max(0, Math.min(100, Math.round(rawScore * 10) / 10));

  // Asignación de Calificación por Letra
  let grade: GradeLevel = 'D';
  if (rawScore >= 90.0) grade = 'S';
  else if (rawScore >= 80.0) grade = 'A';
  else if (rawScore >= 65.0) grade = 'B';
  else if (rawScore >= 50.0) grade = 'C';
  else grade = 'D';

  // Mensaje de diagnóstico didáctico (estilo Artly)
  let feedbackMessage = '';
  if (coverageRatio < 0.35) {
    feedbackMessage = 'Lines are missing: the red ones were not drawn.';
  } else if (coverageRatio < 0.65) {
    feedbackMessage = 'Incomplete figure: finish the remaining perspective contours in red.';
  } else if (precisionRatio < 0.6) {
    feedbackMessage = 'All there — just off the lines.';
  } else if (rawScore >= 90.0) {
    feedbackMessage = 'Flawless 3D perspective construction! Exact vanishing convergence.';
  } else if (rawScore >= 80.0) {
    feedbackMessage = 'Great perspective execution! Clean alignment with the guide grid.';
  } else {
    feedbackMessage = 'Good spatial intuition. Tighten line curvature towards the vanishing points.';
  }

  return {
    score: rawScore,
    grade,
    feedbackMessage,
    matchedSegments,
    missingSegments,
    userStrokes,
    drawnCount: matchedSegments.length,
    targetCount: targetCurves.length,
  };
}
