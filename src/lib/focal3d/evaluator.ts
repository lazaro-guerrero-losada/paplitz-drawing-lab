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
 * Evalúa las líneas de construcción dibujadas por el alumno según su rectitud y paralelismo/convergencia.
 * La longitud NO penaliza porque las líneas de construcción son para orientar.
 */
function evaluateConstructionStrokes(
  strokes: UserStroke3D[],
  challenge: Focal3DChallenge
): { constructionScore: number; count: number; avgStraightness: number; avgAlignment: number } {
  const cStrokes = strokes.filter((s) => s.isConstruction);
  if (cStrokes.length === 0) {
    return { constructionScore: 100, count: 0, avgStraightness: 1, avgAlignment: 1 };
  }

  let sumStraightness = 0;
  let sumAlignment = 0;
  let validCount = 0;

  for (const s of cStrokes) {
    const pts = s.points;
    if (pts.length < 2) continue;
    const a = pts[0];
    const b = pts[pts.length - 1];
    const len = dist(a, b);
    if (len < 15) continue; // Descartar microtoques o ruido

    // 1. Rectitud: desviación media de los puntos respecto a la cuerda recta entre extremos
    let sumDev = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      sumDev += pointToSegmentDistance(pts[i], a, b);
    }
    const avgDev = pts.length > 2 ? sumDev / (pts.length - 2) : 0;
    const straightness = Math.max(0, Math.min(1, 1 - avgDev / 5.5));

    // 2. Paralelismo / Alineación con rayos hacia el punto focal o aristas constructivas (sin penalizar longitud)
    const dir = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };

    // Comparar contra rayo directo al punto focal
    const dFocal = dist(mid, challenge.focalPoint);
    let bestAlign = 0;
    if (dFocal > 1) {
      const uFocal = { x: (challenge.focalPoint.x - mid.x) / dFocal, y: (challenge.focalPoint.y - mid.y) / dFocal };
      const cosF = Math.abs(dir.x * uFocal.x + dir.y * uFocal.y);
      const lineDist = Math.abs((b.x - a.x) * (a.y - challenge.focalPoint.y) - (a.x - challenge.focalPoint.x) * (b.y - a.y)) / len;
      if (cosF >= 0.85 && lineDist <= 40) {
        bestAlign = cosF * Math.max(0, 1 - lineDist / 40);
      }
    }

    // Comparar contra aristas constructivas y guías de las figuras del reto
    for (const shape of challenge.shapes) {
      const targetCurves = [
        ...shape.guidelinesToFocal,
        ...shape.anchorCurves,
        ...shape.depthCurves,
        ...shape.backCurves,
        ...shape.frontCurves,
      ];
      for (const tc of targetCurves) {
        const tp0 = tc.points[0];
        const tpn = tc.points[tc.points.length - 1];
        const tLen = dist(tp0, tpn);
        if (tLen < 1) continue;
        const tDir = { x: (tpn.x - tp0.x) / tLen, y: (tpn.y - tp0.y) / tLen };
        const cosT = Math.abs(dir.x * tDir.x + dir.y * tDir.y);
        if (cosT >= 0.85) {
          const dSeg = pointToSegmentDistance(mid, tp0, tpn);
          if (dSeg <= 40) {
            const scoreT = cosT * Math.max(0, 1 - dSeg / 40);
            if (scoreT > bestAlign) bestAlign = scoreT;
          }
        }
      }
    }

    sumStraightness += straightness;
    sumAlignment += bestAlign;
    validCount++;
  }

  const avgStraightness = validCount > 0 ? sumStraightness / validCount : 1;
  const avgAlignment = validCount > 0 ? sumAlignment / validCount : 1;
  const constructionScore = Math.round((avgStraightness * 0.5 + avgAlignment * 0.5) * 100);

  return { constructionScore, count: validCount, avgStraightness, avgAlignment };
}

/**
 * Comprueba si una curva o rayo de profundidad ha sido satisfecho por un trazo de construcción
 */
function isCurveMatchedByConstruction(curve: CurveSegment2D, strokes: UserStroke3D[]): boolean {
  const cStrokes = strokes.filter((s) => s.isConstruction);
  const cp0 = curve.points[0];
  const cpn = curve.points[curve.points.length - 1];
  const cLen = dist(cp0, cpn);
  if (cLen < 1) return false;
  const cDir = { x: (cpn.x - cp0.x) / cLen, y: (cpn.y - cp0.y) / cLen };

  for (const s of cStrokes) {
    const pts = s.points;
    if (pts.length < 2) continue;
    const a = pts[0];
    const b = pts[pts.length - 1];
    const len = dist(a, b);
    if (len < 15) continue;
    const sDir = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    const cosVal = Math.abs(sDir.x * cDir.x + sDir.y * cDir.y);
    if (cosVal >= 0.82) {
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const d = pointToSegmentDistance(mid, cp0, cpn);
      if (d <= 35) return true;
    }
  }
  return false;
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
  const constructionStrokes = strokes.filter((s) => s.isConstruction);

  if (inkStrokes.length === 0 && constructionStrokes.length === 0) {
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
      missingCurves: challenge.shapes.flatMap((s) =>
        s.allCurves.filter((c) => c.role !== 'construction').map((c) => ({ points: c.points }))
      ),
      drawnCount: 0,
      targetCount: challenge.shapes.reduce(
        (acc, s) => acc + s.allCurves.filter((c) => c.role !== 'construction').length,
        0
      ),
    };
  }

  const userSegments = extractUserSegments(strokes);
  const constEval = evaluateConstructionStrokes(strokes, challenge);

  // 2. Evaluar cada forma precalculada
  const shapeDetails: ShapeEvaluationDetail[] = [];
  const matchedCurves: { points: Point2D[]; accuracy: number; role?: 'form' | 'construction'; style?: 'solid' | 'dashed' }[] = [];
  const missingCurves: { points: Point2D[] }[] = [];

  let sumCoverage = 0;
  let sumPrecision = 0;
  let totalEvaluatedCurves = 0;

  for (const shape of challenge.shapes) {
    let shapeCompletedCurves = 0;
    const missingParts: string[] = [];

    // A. Evaluar caras frontales
    let frontOk = 0;
    let visibleFrontCount = 0;
    for (const c of shape.frontCurves) {
      if (c.role !== 'construction') {
        visibleFrontCount++;
        const res = evaluateSingleCurve(c, userSegments);
        sumCoverage += res.coverage;
        sumPrecision += res.precision;
        totalEvaluatedCurves++;
        if (res.isCompleted) {
          shapeCompletedCurves++;
          frontOk++;
          matchedCurves.push({ points: c.points, accuracy: res.precision, role: 'form', style: 'solid' });
        } else {
          missingCurves.push({ points: c.points });
        }
      } else {
        // Aristas ocultas constructivas: NO penalizan si faltan; si se dibujan se registran
        if (isCurveMatchedByConstruction(c, strokes)) {
          matchedCurves.push({ points: c.points, accuracy: 0.90, role: 'construction', style: 'dashed' });
        }
      }
    }
    if (visibleFrontCount > 0 && frontOk < visibleFrontCount * 0.5) {
      missingParts.push('Cara frontal incompleta');
    }

    // B. Evaluar líneas de fuga hacia el punto focal
    let depthOk = 0;
    for (const c of shape.depthCurves) {
      if (c.role !== 'construction') {
        const res = evaluateSingleCurve(c, userSegments);
        sumCoverage += res.coverage;
        sumPrecision += res.precision;
        totalEvaluatedCurves++;
        if (res.isCompleted) {
          shapeCompletedCurves++;
          depthOk++;
          matchedCurves.push({ points: c.points, accuracy: res.precision, role: 'form', style: 'solid' });
        } else if (isCurveMatchedByConstruction(c, strokes)) {
          // Satisfecha mediante línea constructiva hacia el punto focal
          shapeCompletedCurves++;
          depthOk++;
          matchedCurves.push({ points: c.points, accuracy: 0.90, role: 'construction', style: 'dashed' });
        } else {
          missingCurves.push({ points: c.points });
        }
      } else {
        // Línea de fuga oculta/constructiva (ej. arista oculta desde v0 al punto focal)
        if (isCurveMatchedByConstruction(c, strokes)) {
          depthOk++;
          matchedCurves.push({ points: c.points, accuracy: 0.90, role: 'construction', style: 'dashed' });
        }
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
      if (axisRes.isCompleted) {
        shapeCompletedCurves++;
        matchedCurves.push({ points: shape.axisCurve.points, accuracy: axisRes.precision, role: 'form', style: 'solid' });
      } else if (isCurveMatchedByConstruction(shape.axisCurve, strokes)) {
        shapeCompletedCurves++;
        matchedCurves.push({ points: shape.axisCurve.points, accuracy: 0.90, role: 'construction', style: 'dashed' });
      }
    }

    if (shape.radiusCurve) {
      const radiusRes = evaluateSingleCurve(shape.radiusCurve, userSegments);
      if (radiusRes.isCompleted) {
        shapeCompletedCurves++;
        matchedCurves.push({ points: shape.radiusCurve.points, accuracy: radiusRes.precision, role: 'form', style: 'solid' });
      } else if (isCurveMatchedByConstruction(shape.radiusCurve, strokes)) {
        shapeCompletedCurves++;
        matchedCurves.push({ points: shape.radiusCurve.points, accuracy: 0.90, role: 'construction', style: 'dashed' });
      }
    }

    // D. Evaluar caras traseras
    for (const c of shape.backCurves) {
      if (c.role !== 'construction') {
        const res = evaluateSingleCurve(c, userSegments);
        sumCoverage += res.coverage;
        sumPrecision += res.precision;
        totalEvaluatedCurves++;
        if (res.isCompleted) {
          shapeCompletedCurves++;
          matchedCurves.push({ points: c.points, accuracy: res.precision, role: 'form', style: 'solid' });
        } else {
          missingCurves.push({ points: c.points });
        }
      } else {
        // Aristas traseras constructivas/ocultas
        if (isCurveMatchedByConstruction(c, strokes)) {
          matchedCurves.push({ points: c.points, accuracy: 0.90, role: 'construction', style: 'dashed' });
        }
      }
    }

    const visibleShapeCurvesCount = shape.allCurves.filter((c) => c.role !== 'construction').length;
    const shapeCoverage = visibleShapeCurvesCount > 0 ? shapeCompletedCurves / visibleShapeCurvesCount : 0;
    const shapeScore = Math.min(100, Math.round(shapeCoverage * 100));

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
  const formScore = Math.round(precisionScore * 0.50 + coverageScore * 0.50);

  let focalConvergenceScore = Math.round(precisionScore * 0.60 + coverageScore * 0.40);
  let finalScore = formScore;

  // Integración de las líneas de construcción (rectitud y paralelismo sin penalizar longitud)
  if (constEval.count > 0) {
    const cScore = constEval.constructionScore;
    finalScore = Math.max(0, Math.min(100, Math.round(formScore * 0.80 + cScore * 0.20)));
    focalConvergenceScore = Math.round(focalConvergenceScore * 0.70 + cScore * 0.30);
  }

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
    constructionScore: constEval.count > 0 ? constEval.constructionScore : undefined,
    constructionStrokesCount: constEval.count > 0 ? constEval.count : undefined,
  };
}
