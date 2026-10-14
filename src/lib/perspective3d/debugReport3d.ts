import {
  Primitive3DChallenge,
  UserStroke3D,
  EvaluationResult3D,
} from './types';
import { copyReportToClipboard } from '../debugReport';

export interface DebugReport3DData {
  reportVersion: string;
  timestamp: string;
  userNote?: string;
  challenge: {
    id: string;
    seed: number;
    type: string;
    name: string;
    tipText: string;
    camera: {
      eye: { x: number; y: number; z: number };
      target: { x: number; y: number; z: number };
      fovDeg: number;
    };
    vanishingPoints: {
      vpx: { x: number; y: number; isOnScreen: boolean } | null;
      vpy: { x: number; y: number; isOnScreen: boolean } | null;
      vpz: { x: number; y: number; isOnScreen: boolean } | null;
    };
    targetCurvesCount: number;
    anchorCurvesCount: number;
  };
  userDrawing: {
    strokeCount: number;
    strokes: {
      pointCount: number;
      startPoint: { x: number; y: number };
      endPoint: { x: number; y: number };
      lengthPx: number;
    }[];
  };
  evaluation: {
    evaluated: boolean;
    score: number;
    passed: boolean;
    feedbackMessage: string;
    matchedSegmentsCount: number;
    drawnCount: number;
    targetCount: number;
    curves?: {
      id: string;
      label: string;
      coveragePct: number;
      precisionPct: number;
      score: number;
      isCompleted: boolean;
    }[];
  };
  environment: {
    userAgent: string;
    devicePixelRatio: number;
    screenResolution: string;
  };
}

/**
 * Genera el reporte de diagnóstico y depuración completo para un ejercicio 3D de Lab 3D
 */
export function build3DDebugReport(
  challenge: Primitive3DChallenge,
  strokes: UserStroke3D[],
  evaluation?: EvaluationResult3D | null,
  userNote?: string
): { reportData: DebugReport3DData; markdownText: string; jsonString: string } {
  const analyzedStrokes = strokes.map((s) => {
    const pts = s.points;
    const pStart = pts[0] || { x: 0, y: 0 };
    const pEnd = pts[pts.length - 1] || { x: 0, y: 0 };
    const dx = pEnd.x - pStart.x;
    const dy = pEnd.y - pStart.y;
    const lengthPx = Math.round(Math.hypot(dx, dy) * 10) / 10;

    return {
      pointCount: pts.length,
      startPoint: { x: Math.round(pStart.x * 10) / 10, y: Math.round(pStart.y * 10) / 10 },
      endPoint: { x: Math.round(pEnd.x * 10) / 10, y: Math.round(pEnd.y * 10) / 10 },
      lengthPx,
    };
  });

  const reportData: DebugReport3DData = {
    reportVersion: '1.0.0-3d',
    timestamp: new Date().toISOString(),
    userNote: userNote?.trim() ? userNote.trim() : undefined,
    challenge: {
      id: challenge.id,
      seed: challenge.seed,
      type: challenge.type,
      name: challenge.name,
      tipText: challenge.tipText,
      camera: {
        eye: {
          x: Math.round(challenge.camera.eye.x * 10) / 10,
          y: Math.round(challenge.camera.eye.y * 10) / 10,
          z: Math.round(challenge.camera.eye.z * 10) / 10,
        },
        target: {
          x: Math.round(challenge.camera.target.x * 10) / 10,
          y: Math.round(challenge.camera.target.y * 10) / 10,
          z: Math.round(challenge.camera.target.z * 10) / 10,
        },
        fovDeg: challenge.camera.fov,
      },
      vanishingPoints: {
        vpx: challenge.vanishingPoints.X
          ? {
              x: Math.round(challenge.vanishingPoints.X.point.x * 10) / 10,
              y: Math.round(challenge.vanishingPoints.X.point.y * 10) / 10,
              isOnScreen: challenge.vanishingPoints.X.isOnScreen,
            }
          : null,
        vpy: challenge.vanishingPoints.Y
          ? {
              x: Math.round(challenge.vanishingPoints.Y.point.x * 10) / 10,
              y: Math.round(challenge.vanishingPoints.Y.point.y * 10) / 10,
              isOnScreen: challenge.vanishingPoints.Y.isOnScreen,
            }
          : null,
        vpz: challenge.vanishingPoints.Z
          ? {
              x: Math.round(challenge.vanishingPoints.Z.point.x * 10) / 10,
              y: Math.round(challenge.vanishingPoints.Z.point.y * 10) / 10,
              isOnScreen: challenge.vanishingPoints.Z.isOnScreen,
            }
          : null,
      },
      targetCurvesCount: challenge.targetCurves.length,
      anchorCurvesCount: challenge.anchorCurves.length,
    },
    userDrawing: {
      strokeCount: strokes.length,
      strokes: analyzedStrokes,
    },
    evaluation: {
      evaluated: !!evaluation,
      score: evaluation?.score ? Math.round(evaluation.score) : 0,
      passed: evaluation?.passed ?? false,
      feedbackMessage: evaluation?.feedbackMessage ?? 'Sin evaluar',
      matchedSegmentsCount: evaluation?.matchedSegments.length ?? 0,
      drawnCount: evaluation?.drawnCount ?? strokes.length,
      targetCount: evaluation?.targetCount ?? challenge.targetCurves.length,
      curves: evaluation?.curveDetails?.map((c) => ({
        id: c.id,
        label: c.label,
        coveragePct: Math.round(c.coverage * 100),
        precisionPct: Math.round(c.precision * 100),
        score: Math.round(c.score * 10) / 10,
        isCompleted: c.isCompleted,
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

  const curvesBreakdown =
    evaluation?.curveDetails && evaluation.curveDetails.length > 0
      ? `\n- **Desglose de Contornos:**\n` +
        evaluation.curveDetails
          .map(
            (c) =>
              `  - \`${c.label}\`: ${Math.round(c.coverage * 100)}% cobertura · ${Math.round(c.precision * 100)}% precisión (${c.isCompleted ? '✓ Completado' : '✗ Incompleto'})`
          )
          .join('\n')
      : '';

  const markdownText = `
### 📐 REPORTE DE PERSPECTIVA 3D (LAB 3D)
- **Forma:** \`${challenge.name}\` (\`${challenge.type}\`)
- **Semilla (Seed):** \`#${challenge.seed}\`
- **Cámara:** FOV: \`${challenge.camera.fov}°\` | Eye: \`(${reportData.challenge.camera.eye.x}, ${reportData.challenge.camera.eye.y}, ${reportData.challenge.camera.eye.z})\`
- **Nota Obtenida:** **${scoreDisplay}** (${passedStatus})
- **Trazos / Aristas:** ${evaluation?.drawnCount ?? strokes.length}/${evaluation?.targetCount ?? challenge.targetCurves.length} completados
- **Diagnóstico:** *"${evaluation?.feedbackMessage || 'N/A'}"*${curvesBreakdown}${noteSection}

<details>
<summary>📦 Ver JSON Completo de Diagnóstico 3D (clic para desplegar)</summary>

\`\`\`json
${jsonString}
\`\`\`
</details>
`.trim();

  return { reportData, markdownText, jsonString };
}

/**
 * Descarga el reporte 3D como archivo .json
 */
export function downloadReport3DJson(
  jsonString: string,
  seed: number,
  primitiveType: string,
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
    link.download = `paplitz_3d_report_${primitiveType}_seed_${seed}${sanitizedNote}_${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Error al descargar JSON de reporte 3D:', err);
  }
}

export { copyReportToClipboard as copyReport3DToClipboard };
