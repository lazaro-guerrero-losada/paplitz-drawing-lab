/**
 * Motor de Evaluación y Puntuación Riguroso para Lab 3D
 * Compara los trazos del usuario contra las curvas objetivo proyectadas en perspectiva 3D.
 * 
 * Características clave:
 * 1. Alineación direccional por cosenos de tangentes (|cos theta| >= 0.65): evita que trazos verticales
 *    crucen elipses horizontales y sumen aciertos indebidos.
 * 2. Umbral de proximidad MATCH_THRESHOLD calibrado a 18.0px (penaliza líneas paralelas o divergentes
 *    que no convergen hacia los puntos de fuga).
 * 3. Integridad estructural curva a curva: evalúa cada contorno independientemente. Si una arista
 *    o elipse esencial queda sin dibujar (< 35% de cobertura), la figura se penaliza drásticamente
 *    (tope en Grado D / C-) y se identifica explícitamente en el mensaje de feedback didáctico.
 */

import {
  Point2D,
  CurveSegment2D,
  UserStroke3D,
  EvaluationResult3D,
  GradeLevel,
  CurveEvaluationDetail,
} from './types';

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

interface UserSegment {
  a: Point2D;
  b: Point2D;
  dir: Point2D; // Vector unitario de dirección
  length: number;
}

/**
 * Calcula los vectores unitarios tangentes en cada punto de una curva objetivo.
 * Detecta si la curva es un ciclo cerrado (elipse, anillo) para envolver los extremos suavemente.
 */
function computeCurveTangents(points: Point2D[]): Point2D[] {
  const n = points.length;
  if (n === 0) return [];
  if (n === 1) return [{ x: 1, y: 0 }];

  // Si el primer y último punto están a menos de 5px, tratamos como ciclo cerrado
  const isClosed = distSq(points[0], points[n - 1]) < 25;

  const tangents: Point2D[] = new Array(n);
  for (let i = 0; i < n; i++) {
    let prev: Point2D;
    let next: Point2D;

    if (i === 0) {
      prev = isClosed ? points[n - 2] : points[0];
      next = points[1];
    } else if (i === n - 1) {
      prev = points[n - 2];
      next = isClosed ? points[1] : points[n - 1];
    } else {
      prev = points[i - 1];
      next = points[i + 1];
    }

    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy);
    if (len > 0.0001) {
      tangents[i] = { x: dx / len, y: dy / len };
    } else {
      tangents[i] = { x: 1, y: 0 };
    }
  }
  return tangents;
}

export function evaluate3DSubmission(
  userStrokes: UserStroke3D[],
  targetCurves: CurveSegment2D[]
): EvaluationResult3D {
  // Si no hay trazos del usuario
  if (userStrokes.length === 0) {
    const emptyCurveDetails: CurveEvaluationDetail[] = targetCurves.map((c) => ({
      id: c.id,
      label: c.label || c.id,
      coverage: 0,
      precision: 0,
      score: 0,
      isCompleted: false,
    }));

    return {
      score: 0.0,
      grade: 'D',
      feedbackMessage: 'No lines drawn: start by tracing the missing forms in perspective.',
      matchedSegments: [],
      missingSegments: targetCurves.map((c) => ({ points: c.points })),
      userStrokes: [],
      drawnCount: 0,
      targetCount: targetCurves.length,
      curveDetails: emptyCurveDetails,
    };
  }

  // Pre-aplanar los segmentos de todos los trazos del usuario con sus vectores unitarios de dirección
  const userSegments: UserSegment[] = [];
  let totalUserPoints = 0;

  userStrokes.forEach((s) => {
    totalUserPoints += s.points.length;
    for (let i = 0; i < s.points.length - 1; i++) {
      const a = s.points[i];
      const b = s.points[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const length = Math.hypot(dx, dy);
      if (length >= 0.5) {
        userSegments.push({
          a,
          b,
          dir: { x: dx / length, y: dy / length },
          length,
        });
      }
    }
  });

  // Umbral estricto y calibrado: 18.0px para acomodar trazos a mano alzada pero penalizar
  // desvíos notables de ángulo o líneas paralelas que no convergen hacia los puntos de fuga.
  const MATCH_THRESHOLD = 18.0;

  // Umbral de colinealidad tangente: |cos(theta)| >= 0.65 (~49.5° de desvío angular máximo)
  const MIN_ALIGNMENT_COS = 0.65;

  const matchedSegments: { points: Point2D[]; accuracy: number }[] = [];
  const missingSegments: { points: Point2D[] }[] = [];

  const curveDetails: CurveEvaluationDetail[] = [];
  let totalTargetSamplePoints = 0;
  let totalMatchedPoints = 0;
  let totalDistanceErrors = 0;

  targetCurves.forEach((curve) => {
    if (curve.points.length < 2) return;

    const tangents = computeCurveTangents(curve.points);
    let curveMatchedCount = 0;
    let curveDistanceErrorSum = 0;

    let currentSegment: Point2D[] = [];
    let currentIsMatched: boolean | null = null;

    curve.points.forEach((targetPt, ptIdx) => {
      totalTargetSamplePoints++;
      const targetTangent = tangents[ptIdx];

      // Buscar distancia mínima únicamente con segmentos del usuario que tengan alineación angular válida
      let bestDist = Infinity;

      for (let j = 0; j < userSegments.length; j++) {
        const seg = userSegments[j];
        const d = pointToSegmentDistance(targetPt, seg.a, seg.b);

        if (d <= MATCH_THRESHOLD) {
          // Comprobar colinealidad entre la tangente de la curva y el trazo del usuario
          const dot = targetTangent.x * seg.dir.x + targetTangent.y * seg.dir.y;
          const absCos = Math.abs(dot);

          if (absCos >= MIN_ALIGNMENT_COS) {
            if (d < bestDist) {
              bestDist = d;
              if (bestDist < 3.0) break; // Optimización de salida temprana
            }
          }
        }
      }

      const isMatched = bestDist <= MATCH_THRESHOLD;

      if (isMatched) {
        totalMatchedPoints++;
        totalDistanceErrors += bestDist;
        curveMatchedCount++;
        curveDistanceErrorSum += bestDist;
      }

      // Agrupación contigua en segmentos para el renderizado coloreado (Verde / Rojo)
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

    // Métricas específicas de esta curva individual
    const curveTotal = curve.points.length;
    const curveCoverage = curveTotal > 0 ? curveMatchedCount / curveTotal : 0;
    const curveAvgDist = curveMatchedCount > 0 ? curveDistanceErrorSum / curveMatchedCount : MATCH_THRESHOLD;
    const curvePrecision = Math.max(0, 1 - curveAvgDist / MATCH_THRESHOLD);
    
    // Puntuación de la curva (0 - 100)
    const curveScore = curveCoverage * (75 + 25 * curvePrecision);
    const isCompleted = curveCoverage >= 0.50; // Se considera dibujada si se cubrió al menos el 50%

    curveDetails.push({
      id: curve.id,
      label: curve.label || curve.id,
      coverage: curveCoverage,
      precision: curvePrecision,
      score: Math.round(curveScore * 10) / 10,
      isCompleted,
    });
  });

  // Métricas agregadas
  const completedCurvesCount = curveDetails.filter((c) => c.isCompleted).length;
  const missingCurves = curveDetails.filter((c) => c.coverage < 0.35); // Aristas omitidas o apenas tocadas
  const overallCoverage = totalTargetSamplePoints > 0 ? totalMatchedPoints / totalTargetSamplePoints : 0;
  const avgDistance = totalMatchedPoints > 0 ? totalDistanceErrors / totalMatchedPoints : MATCH_THRESHOLD;
  const avgPrecision = Math.max(0, 1 - avgDistance / MATCH_THRESHOLD);

  // Promedio de puntuación curva por curva (evita que dos líneas largas opaquen un círculo omitido)
  const avgCurveScore =
    curveDetails.length > 0
      ? curveDetails.reduce((sum, c) => sum + c.score, 0) / curveDetails.length
      : 0;

  // Penalización por trazos superfluos o descontrolados
  const excessFactor = totalUserPoints > totalTargetSamplePoints * 3.5 ? 0.9 : 1.0;

  let rawScore = avgCurveScore * excessFactor;

  // CONTROL DE INTEGRIDAD ESTRUCTURAL:
  // Si falta alguna curva o arista crítica (< 35% de cobertura), la figura es incompleta.
  // Es imposible obtener una calificación aprobatoria de nivel A o B si falta una cara o tapa.
  if (missingCurves.length > 0) {
    if (missingCurves.length >= 2) {
      rawScore = Math.min(rawScore, 32.0); // Calificación D baja
    } else {
      rawScore = Math.min(rawScore, 48.0); // Calificación D alta / límite de reprobado
    }
  }

  // Si las líneas son muy imprecisas o divergentes respecto a las fugas
  if (avgPrecision < 0.45 && rawScore > 60.0) {
    rawScore = Math.min(rawScore, 58.0);
  }

  rawScore = Math.max(0, Math.min(100, Math.round(rawScore * 10) / 10));

  // Asignación de Calificación por Letra
  let grade: GradeLevel = 'D';
  if (rawScore >= 90.0 && missingCurves.length === 0) grade = 'S';
  else if (rawScore >= 80.0 && missingCurves.length === 0) grade = 'A';
  else if (rawScore >= 65.0 && missingCurves.length === 0) grade = 'B';
  else if (rawScore >= 50.0) grade = 'C';
  else grade = 'D';

  // Mensaje de diagnóstico didáctico y contextualizado
  let feedbackMessage = '';
  if (completedCurvesCount === 0 || overallCoverage < 0.15) {
    feedbackMessage = 'No lines drawn: trace the missing contours in perspective.';
  } else if (missingCurves.length > 0) {
    if (missingCurves.length === 1) {
      feedbackMessage = `Incomplete figure: "${missingCurves[0].label}" in red was not drawn.`;
    } else {
      feedbackMessage = `Incomplete figure: ${missingCurves.length} contours in red were not drawn.`;
    }
  } else if (avgPrecision < 0.55) {
    feedbackMessage = 'Perspective lines diverge from vanishing points. Align strokes with the 3D room grid.';
  } else if (overallCoverage < 0.65) {
    feedbackMessage = 'Partial figure: complete the full length of each contour in red.';
  } else if (rawScore >= 90.0) {
    feedbackMessage = 'Flawless 3D perspective construction! Exact vanishing convergence.';
  } else if (rawScore >= 80.0) {
    feedbackMessage = 'Great perspective execution! Clean alignment with the guide grid.';
  } else if (rawScore >= 65.0) {
    feedbackMessage = 'Good spatial intuition. Tighten line curvature towards the vanishing points.';
  } else {
    feedbackMessage = 'Perspective contours need improvement: check alignment with vanishing points.';
  }

  return {
    score: rawScore,
    grade,
    feedbackMessage,
    matchedSegments,
    missingSegments,
    userStrokes,
    drawnCount: completedCurvesCount,
    targetCount: targetCurves.length,
    curveDetails,
  };
}
