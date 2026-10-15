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
      role: c.role || 'form',
    }));

    return {
      score: 0,
      passed: false,
      grade: 'D',
      feedbackMessage: 'No se han detectado trazos: dibuja los contornos de la forma en perspectiva.',
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

  const matchedSegments: { points: Point2D[]; accuracy: number }[] = [];
  const missingSegments: { points: Point2D[] }[] = [];

  const curveDetails: CurveEvaluationDetail[] = [];
  let totalTargetSamplePoints = 0;
  let totalMatchedPoints = 0;
  let totalDistanceErrors = 0;

  targetCurves.forEach((curve) => {
    if (curve.points.length < 2) return;

    // Umbral adaptativo: 26.0px para curvas libres/elipses/construcción (acomoda la vibración natural
    // del lápiz en pantallas de cristal); 20.0px para aristas rectas de poliedros.
    const isCurved =
      curve.points.length > 24 ||
      curve.id.includes('ellipse') ||
      curve.id.includes('dome') ||
      curve.id.includes('ring') ||
      curve.id.includes('silhouette') ||
      curve.id.includes('meridian') ||
      curve.role === 'construction';

    const matchThreshold = isCurved ? 26.0 : 20.0;
    const minAlignmentCos = isCurved ? 0.60 : 0.68;

    const tangents = computeCurveTangents(curve.points);
    let curveMatchedCount = 0;
    let curveDistanceErrorSum = 0;

    let currentSegment: Point2D[] = [];
    let currentIsMatched: boolean | null = null;

    curve.points.forEach((targetPt, ptIdx) => {
      totalTargetSamplePoints++;
      const targetTangent = tangents[ptIdx];

      // Buscar distancia mínima con segmentos del usuario alineados angularmente
      let bestDist = Infinity;

      for (let j = 0; j < userSegments.length; j++) {
        const seg = userSegments[j];
        const d = pointToSegmentDistance(targetPt, seg.a, seg.b);

        if (d <= matchThreshold) {
          const dot = targetTangent.x * seg.dir.x + targetTangent.y * seg.dir.y;
          const absCos = Math.abs(dot);

          if (absCos >= minAlignmentCos) {
            if (d < bestDist) {
              bestDist = d;
              if (bestDist < 3.0) break; // Optimización de salida temprana
            }
          }
        }
      }

      const isMatched = bestDist <= matchThreshold;

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
    const curveAvgDist = curveMatchedCount > 0 ? curveDistanceErrorSum / curveMatchedCount : matchThreshold;
    const curvePrecision = Math.max(0, 1 - curveAvgDist / matchThreshold);

    // Puntuación de la curva (0 - 100): 70% cobertura de longitud, 30% precisión de distancia
    const curveScore = curveCoverage * (70 + 30 * curvePrecision);
    const isCompleted = curveCoverage >= 0.45;

    curveDetails.push({
      id: curve.id,
      label: curve.label || curve.id,
      coverage: curveCoverage,
      precision: curvePrecision,
      score: Math.round(curveScore * 10) / 10,
      isCompleted,
      role: curve.role || 'form',
    });
  });

  // Separar curvas de la Forma (siluetas y aristas visibles esenciales) vs Curvas de Construcción (meridianos, secciones)
  const formCurves = curveDetails.filter((c) => c.role !== 'construction');
  const constructionCurves = curveDetails.filter((c) => c.role === 'construction');

  const missingFormCurves = formCurves.filter((c) => c.coverage < 0.35);
  const avgFormScore =
    formCurves.length > 0
      ? formCurves.reduce((sum, c) => sum + c.score, 0) / formCurves.length
      : 0;

  // Evaluación de Líneas de Construcción:
  // En esferas o toroides, el usuario dibuja líneas de soporte para proyectar el volumen.
  // No se requiere dibujar TODAS las secciones generadas:
  // - Para esfera (2 meridianos): dibujar 1 meridiano satisface el requisito de construcción.
  // - Para toroide/anillo (4+ secciones): dibujar 2 secciones satisface el requisito.
  let avgConstructionScore = 0;
  let hasConstruction = constructionCurves.length > 0;

  if (hasConstruction) {
    const sortedConstruction = [...constructionCurves].sort((a, b) => b.score - a.score);
    const requiredCount = Math.min(
      constructionCurves.length,
      constructionCurves.length >= 4 ? 2 : 1
    );
    const topConstruction = sortedConstruction.slice(0, requiredCount);
    avgConstructionScore =
      topConstruction.reduce((sum, c) => sum + c.score, 0) / requiredCount;
  }

  // Ponderación de la Nota:
  // - Si la figura tiene líneas de construcción: 70% siluetas/aristas de la forma + 30% líneas de construcción
  // - Si no tiene líneas de construcción (poliedros, cilindros): 100% aristas de la forma
  let rawScore = hasConstruction
    ? avgFormScore * 0.7 + avgConstructionScore * 0.3
    : avgFormScore;

  // Penalización leve por exceso masivo de garabatos (evita relleno aleatorio con el lápiz)
  const excessFactor = totalUserPoints > totalTargetSamplePoints * 4.0 ? 0.92 : 1.0;
  rawScore *= excessFactor;

  // CONTROL DE INTEGRIDAD ESTRUCTURAL (exclusivo para aristas de la FORMA):
  // Si falta una arista o tapa de la forma visible (< 35% cobertura), no se puede aprobar.
  if (missingFormCurves.length > 0) {
    if (missingFormCurves.length >= 2) {
      rawScore = Math.min(rawScore, 35.0);
    } else {
      rawScore = Math.min(rawScore, 48.0);
    }
  }

  const finalScore = Math.max(0, Math.min(100, Math.round(rawScore)));
  const passed = finalScore >= 70;

  // Asignación de Calificación por Letra (mantenida internamente por compatibilidad)
  let grade: GradeLevel = 'D';
  if (finalScore >= 90 && missingFormCurves.length === 0) grade = 'S';
  else if (finalScore >= 80 && missingFormCurves.length === 0) grade = 'A';
  else if (finalScore >= 65 && missingFormCurves.length === 0) grade = 'B';
  else if (finalScore >= 50) grade = 'C';
  else grade = 'D';

  const completedCurvesCount = curveDetails.filter((c) => c.isCompleted).length;
  const overallCoverage = totalTargetSamplePoints > 0 ? totalMatchedPoints / totalTargetSamplePoints : 0;

  // Mensaje de diagnóstico didáctico en español
  let feedbackMessage = '';
  if (completedCurvesCount === 0 || overallCoverage < 0.15) {
    feedbackMessage = 'No se han detectado trazos suficientes. Dibuja los contornos de la figura en perspectiva.';
  } else if (missingFormCurves.length > 0) {
    if (missingFormCurves.length === 1) {
      feedbackMessage = `Figura incompleta: falta dibujar "${missingFormCurves[0].label}" (en rojo).`;
    } else {
      feedbackMessage = `Figura incompleta: faltan ${missingFormCurves.length} contornos esenciales (en rojo).`;
    }
  } else if (hasConstruction && avgConstructionScore < 40) {
    feedbackMessage = 'Forma dibujada. Traza las líneas de construcción (meridianos / secciones) para consolidar el volumen 3D.';
  } else if (overallCoverage < 0.65) {
    feedbackMessage = 'Figura parcial: completa el recorrido entero de cada contorno en perspectiva.';
  } else if (finalScore >= 90) {
    feedbackMessage = '¡Construcción en perspectiva impecable! Convergencia exacta a los puntos de fuga.';
  } else if (finalScore >= 80) {
    feedbackMessage = '¡Gran ejecución de perspectiva! Excelente alineación espacial y proporciones.';
  } else if (finalScore >= 70) {
    feedbackMessage = 'Aprobado. Buena intuición espacial y solidez de volumen.';
  } else {
    feedbackMessage = 'Los contornos necesitan ajuste: revisa la fuga y convergencia hacia la retícula 3D.';
  }

  return {
    score: finalScore,
    passed,
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
