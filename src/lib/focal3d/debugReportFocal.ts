import {
  Focal3DChallenge,
  FocalEvaluationResult,
} from './types';
import { UserStroke3D } from '../perspective3d/types';
import { copyReportToClipboard } from '../debugReport';

export interface DebugReportFocalData {
  reportVersion: string;
  timestamp: string;
  userNote?: string;
  challenge: {
    id: string;
    seed: number;
    title: string;
    subtitle: string;
    mode: string;
    density: string;
    shapeType: string;
    activeSectorIndex: number;
    activeShapeCount: number;
    focalPoint: { x: number; y: number };
    shapes: {
      id: string;
      type: string;
      sectorIndex: number;
      angleDeg: number;
      centerPos: { x: number; y: number };
      frontVerticesCount: number;
      anchorCurvesCount: number;
      totalCurvesCount: number;
    }[];
  };
  userDrawing: {
    strokeCount: number;
    constructionStrokeCount: number;
    strokes: {
      pointCount: number;
      startPoint: { x: number; y: number };
      endPoint: { x: number; y: number };
      lengthPx: number;
      isConstruction: boolean;
    }[];
  };
  evaluation: {
    evaluated: boolean;
    score: number;
    passed: boolean;
    grade?: string;
    precisionScore?: number;
    coverageScore?: number;
    focalConvergenceScore?: number;
    feedbackTitle?: string;
    feedbackMessage?: string;
    tipMessage?: string;
    drawnCount?: number;
    targetCount?: number;
    shapeDetails?: {
      shapeId: string;
      type: string;
      score: number;
      coverage: number;
      precision: number;
      isComplete: boolean;
      missingParts: string[];
    }[];
  };
  environment: {
    userAgent: string;
    devicePixelRatio: number;
    screenResolution: string;
  };
}

/**
 * Builds the complete diagnostic and debug report for a 1-Focal Point (Focal 3D) exercise
 */
export function buildFocalDebugReport(
  challenge: Focal3DChallenge,
  strokes: UserStroke3D[],
  evaluation?: FocalEvaluationResult | null,
  userNote?: string
): { reportData: DebugReportFocalData; markdownText: string; jsonString: string } {
  const analyzedStrokes = strokes.map((s) => {
    const pts = s.points;
    const pStart = pts[0] || { x: 0, y: 0 };
    const pEnd = pts[pts.length - 1] || { x: 0, y: 0 };
    let pathLength = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      pathLength += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    }
    const lengthPx = Math.round(pathLength * 10) / 10;

    return {
      pointCount: pts.length,
      startPoint: { x: Math.round(pStart.x * 10) / 10, y: Math.round(pStart.y * 10) / 10 },
      endPoint: { x: Math.round(pEnd.x * 10) / 10, y: Math.round(pEnd.y * 10) / 10 },
      lengthPx,
      isConstruction: s.isConstruction || false,
    };
  });

  const shapesSummary = challenge.shapes.map((sh) => ({
    id: sh.id,
    type: sh.type,
    sectorIndex: sh.sectorIndex,
    angleDeg: sh.angleDeg,
    centerPos: {
      x: Math.round(sh.centerPos.x * 10) / 10,
      y: Math.round(sh.centerPos.y * 10) / 10,
    },
    frontVerticesCount: sh.frontVertices.length,
    anchorCurvesCount: sh.anchorCurves.length,
    totalCurvesCount: sh.allCurves.length,
  }));

  const reportData: DebugReportFocalData = {
    reportVersion: '1.0.0-focal3d',
    timestamp: new Date().toISOString(),
    userNote: userNote?.trim() ? userNote.trim() : undefined,
    challenge: {
      id: challenge.id,
      seed: challenge.seed,
      title: challenge.title,
      subtitle: challenge.subtitle,
      mode: challenge.mode,
      density: challenge.density,
      shapeType: challenge.shapeType,
      activeSectorIndex: challenge.activeSectorIndex,
      activeShapeCount: challenge.activeShapeCount,
      focalPoint: {
        x: Math.round(challenge.focalPoint.x * 10) / 10,
        y: Math.round(challenge.focalPoint.y * 10) / 10,
      },
      shapes: shapesSummary,
    },
    userDrawing: {
      strokeCount: strokes.length,
      constructionStrokeCount: strokes.filter((s) => s.isConstruction).length,
      strokes: analyzedStrokes,
    },
    evaluation: {
      evaluated: !!evaluation,
      score: evaluation ? Math.round(evaluation.score) : 0,
      passed: evaluation?.passed ?? false,
      grade: evaluation?.grade,
      precisionScore: evaluation ? Math.round(evaluation.precisionScore) : undefined,
      coverageScore: evaluation ? Math.round(evaluation.coverageScore) : undefined,
      focalConvergenceScore: evaluation ? Math.round(evaluation.focalConvergenceScore) : undefined,
      feedbackTitle: evaluation?.feedbackTitle,
      feedbackMessage: evaluation?.feedbackMessage ?? 'Sin evaluar',
      tipMessage: evaluation?.tipMessage,
      drawnCount: evaluation?.drawnCount ?? strokes.length,
      targetCount: evaluation?.targetCount ?? challenge.shapes.reduce((acc, s) => acc + s.allCurves.length, 0),
      shapeDetails: evaluation?.shapeDetails.map((sd) => ({
        shapeId: sd.shapeId,
        type: sd.type,
        score: Math.round(sd.score),
        coverage: Math.round(sd.coverage * 100),
        precision: Math.round(sd.precision * 100),
        isComplete: sd.isComplete,
        missingParts: sd.missingParts,
      })),
    },
    environment: {
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown',
      devicePixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio : 1,
      screenResolution: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : 'Unknown',
    },
  };

  const jsonString = JSON.stringify(reportData, null, 2);

  const scoreDisplay = evaluation ? `${Math.round(evaluation.score)}%` : 'N/A';
  const passedStatus = evaluation ? (evaluation.passed ? 'APROBADO ✓' : 'NO SUPERADO ✗') : 'NO EVALUADO';
  const noteSection = userNote?.trim()
    ? `\n- **📝 NOTA DEL USUARIO / USER NOTE:**\n> "${userNote.trim()}"`
    : '';

  let shapesBreakdown = '';
  if (evaluation?.shapeDetails && evaluation.shapeDetails.length > 0) {
    shapesBreakdown +=
      `\n- **Desglose de Formas Evaluadas:**\n` +
      evaluation.shapeDetails
        .map(
          (sd, i) =>
            `  - **Forma ${i + 1}** (\`${sd.type}\`): ${Math.round(sd.score)}% nota · ${Math.round(sd.coverage * 100)}% cob. · ${Math.round(sd.precision * 100)}% prec. (${sd.isComplete ? '✓ Completa' : sd.missingParts.length ? '✗ Faltan: ' + sd.missingParts.join(', ') : '✗ Desviada'})`
        )
        .join('\n');
  }

  const markdownText = `
### 🎯 REPORTE DE PERSPECTIVA 1 PUNTO FOCAL (FOCAL 3D)
- **Forma:** \`${challenge.title}\` (\`${challenge.shapeType}\`)
- **Modo:** \`${challenge.mode}\` | **Densidad:** \`${challenge.density}\` (${challenge.activeShapeCount} formas activas)
- **Semilla (Seed):** \`#${challenge.seed}\`
- **Punto Focal:** \`(${Math.round(challenge.focalPoint.x)}, ${Math.round(challenge.focalPoint.y)})\`
- **Nota Obtenida:** **${scoreDisplay}** (${passedStatus})
- **Trazos del Alumno:** ${strokes.length} (${strokes.filter((s) => s.isConstruction).length} de construcción)
- **Precisión:** ${evaluation ? Math.round(evaluation.precisionScore) : 0}% · **Cobertura:** ${evaluation ? Math.round(evaluation.coverageScore) : 0}% · **Convergencia:** ${evaluation ? Math.round(evaluation.focalConvergenceScore) : 0}%
- **Diagnóstico:** *"${evaluation?.feedbackMessage || 'N/A'}"*${shapesBreakdown}${noteSection}

<details>
<summary>📦 Ver JSON Completo de Diagnóstico Focal 3D (clic para desplegar)</summary>

\`\`\`json
${jsonString}
\`\`\`
</details>
`.trim();

  return { reportData, markdownText, jsonString };
}

/**
 * Downloads the Focal 3D debug report as a .json file
 */
export function downloadReportFocalJson(
  jsonString: string,
  seed: number,
  shapeType: string,
  userNote?: string
): void {
  try {
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const sanitizedNote = userNote?.trim()
      ? `_${userNote
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .slice(0, 20)}`
      : '';
    link.download = `paplitz_focal3d_report_${shapeType.toLowerCase()}_seed_${seed}${sanitizedNote}_${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Error al descargar JSON de reporte Focal 3D:', err);
  }
}

export { copyReportToClipboard as copyReportFocalToClipboard };
