import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Primitive3DChallenge,
  UserStroke3D,
  EvaluationResult3D,
  Point2D,
  PrimitiveType,
  AidMode,
} from '../../lib/perspective3d/types';
import { generate3DChallenge, ALL_PRIMITIVES } from '../../lib/perspective3d/primitives';
import { evaluate3DSubmission } from '../../lib/perspective3d/evaluator3d';
import { Perspective3DPreviewCard } from './Perspective3DPreviewCard';
import { PrimitiveSelectorPanel } from './PrimitiveSelectorPanel';
import {
  Undo2,
  Redo2,
  Trash2,
  Eye,
  EyeOff,
  Crosshair,
  Grid,
  ChevronRight,
  RotateCcw,
  Trophy,
  Check,
  AlertTriangle,
  X,
  Copy,
  Download,
  FileText,
} from 'lucide-react';
import { SessionRecordItem } from '../../lib/sessionRecorder';
import {
  build3DDebugReport,
  copyReport3DToClipboard,
  downloadReport3DJson,
} from '../../lib/perspective3d/debugReport3d';

interface Lab3DViewProps {
  onAwardXP?: (amount: number) => void;
  onAvatarMoodChange?: (mood: any) => void;
  onExit?: () => void;
  isRecording?: boolean;
  onToggleRecording?: () => void;
  onOpenRecordModal?: () => void;
  recordedCount?: number;
  onRecordExercise?: (record: SessionRecordItem) => void;
  onUpdateRecordComment?: (recordId: string, comment: string) => void;
}

export const Lab3DView: React.FC<Lab3DViewProps> = ({
  onAwardXP,
  onAvatarMoodChange,
  onExit,
  isRecording = false,
  onToggleRecording,
  onOpenRecordModal,
  recordedCount = 0,
  onRecordExercise,
  onUpdateRecordComment,
}) => {
  // Configuración de la sesión
  const TOTAL_ROUNDS = 8;
  const [currentRound, setCurrentRound] = useState<number>(1);
  const [sessionScores, setSessionScores] = useState<number[]>([]);
  const [isSessionComplete, setIsSessionComplete] = useState<boolean>(false);

  // Estados para Reporte Técnico y Notas
  const [showReportModal, setShowReportModal] = useState<boolean>(false);
  const [userNote, setUserNote] = useState<string>('');
  const [copiedReport, setCopiedReport] = useState<boolean>(false);
  const [downloadedReport, setDownloadedReport] = useState<boolean>(false);
  const currentRecordIdRef = useRef<string | null>(null);

  // Formas seleccionadas para el entrenamiento
  const [enabledPrimitives, setEnabledPrimitives] = useState<PrimitiveType[]>([...ALL_PRIMITIVES]);

  // Reto actual
  const [challenge, setChallenge] = useState<Primitive3DChallenge>(() =>
    generate3DChallenge(Date.now(), undefined, 800, 600, ALL_PRIMITIVES)
  );

  // Estados del lienzo
  const [strokes, setStrokes] = useState<UserStroke3D[]>([]);
  const [redoStack, setRedoStack] = useState<UserStroke3D[]>([]);
  const [evaluation, setEvaluation] = useState<EvaluationResult3D | null>(null);

  // Opciones de visualización y Ayudas 3D
  const [showGrid, setShowGrid] = useState<boolean>(true); // Activar / desactivar rejilla 3D
  const [aidMode, setAidMode] = useState<AidMode>('off'); // 3 Estados: off, line, vertices

  // Referencias del Canvas e interactividad
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef<boolean>(false);
  const currentPointsRef = useRef<Point2D[]>([]);
  const activePointerIdRef = useRef<number | null>(null);
  const [currentLiveStroke, setCurrentLiveStroke] = useState<Point2D[]>([]);

  // Redimensionar canvas manteniendo aspect ratio nítido
  const [canvasDimensions, setCanvasDimensions] = useState<{ width: number; height: number }>({
    width: 800,
    height: 600,
  });

  // Cargar nuevo reto
  const loadNewChallenge = useCallback(
    (roundNum: number, forcedType?: PrimitiveType, allowedOverride?: PrimitiveType[]) => {
      const allowed = allowedOverride || enabledPrimitives;
      const type = forcedType;
      const newSeed = Math.floor(Math.random() * 1000000);
      const newCh = generate3DChallenge(
        newSeed,
        type,
        canvasDimensions.width,
        canvasDimensions.height,
        allowed
      );
      setChallenge(newCh);
      setStrokes([]);
      setRedoStack([]);
      setCurrentLiveStroke([]);
      setEvaluation(null);
      setCurrentRound(roundNum);
      setUserNote('');
      setShowReportModal(false);
      setCopiedReport(false);
      setDownloadedReport(false);
      currentRecordIdRef.current = null;
    },
    [canvasDimensions, enabledPrimitives]
  );

  // Ajustar dimensiones del canvas exactamente al contenedor del área de dibujo
  useEffect(() => {
    const updateSize = () => {
      if (!canvasContainerRef.current) return;
      const rect = canvasContainerRef.current.getBoundingClientRect();
      const w = Math.max(320, Math.floor(rect.width));
      const h = Math.max(320, Math.floor(rect.height));

      setCanvasDimensions({ width: w, height: h });
      setChallenge((prev) =>
        generate3DChallenge(prev.seed, prev.type, w, h, enabledPrimitives)
      );
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // ==========================================
  // Renderizado del Canvas 2D / 3D
  // ==========================================
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvasDimensions;
    ctx.clearRect(0, 0, width, height);

    // 1. DIBUJAR GUÍAS Y REJILLA 3D (Si showGrid está activo, como en Screenshot 1)
    if (showGrid && challenge.gridLines) {
      // Líneas de perspectiva del suelo y paredes
      challenge.gridLines.forEach((line) => {
        ctx.beginPath();
        ctx.moveTo(line.start.x, line.start.y);
        ctx.lineTo(line.end.x, line.end.y);
        ctx.strokeStyle = '#94a3b8'; // Slate-400 técnico
        ctx.globalAlpha = line.opacity || 0.18;
        ctx.lineWidth = 1.0;
        ctx.stroke();
      });

      // Puntos de Fuga (VP X, VP Y, VP Z) con flechas indicadoras (Screenshot 1 & 4)
      const vpList = [challenge.vanishingPoints.X, challenge.vanishingPoints.Y, challenge.vanishingPoints.Z].filter(
        Boolean
      );

      vpList.forEach((vp) => {
        if (!vp) return;
        ctx.globalAlpha = 0.85;

        // Si el punto de fuga está dentro de la pantalla, dibujar etiqueta directa
        const posX = vp.isOnScreen ? vp.point.x : vp.screenEdgePoint.x;
        const posY = vp.isOnScreen ? vp.point.y : vp.screenEdgePoint.y;

        // Flecha o triángulo indicador
        ctx.fillStyle = '#475569';
        ctx.beginPath();
        const iconSize = 6;
        if (vp.axis === 'Y') {
          // Triángulo vertical hacia arriba o abajo
          const isUp = posY < height / 2;
          ctx.moveTo(posX, posY + (isUp ? -iconSize : iconSize));
          ctx.lineTo(posX - iconSize, posY + (isUp ? iconSize : -iconSize));
          ctx.lineTo(posX + iconSize, posY + (isUp ? iconSize : -iconSize));
        } else if (vp.axis === 'X') {
          // Triángulo horizontal hacia la derecha
          ctx.moveTo(posX + iconSize, posY);
          ctx.lineTo(posX - iconSize, posY - iconSize);
          ctx.lineTo(posX - iconSize, posY + iconSize);
        } else {
          // VP Z: punto o triángulo hacia la profundidad
          ctx.arc(posX, posY, 4, 0, Math.PI * 2);
        }
        ctx.fill();

        // Texto de etiqueta (ej: "▲ VP Z", "▼ VP Y", "► VP X")
        ctx.font = 'bold 11px monospace';
        ctx.fillStyle = '#334155';
        ctx.textAlign = 'center';
        ctx.textBaseline = posY < height / 2 ? 'bottom' : 'top';
        ctx.fillText(vp.label, posX, posY < height / 2 ? posY - 8 : posY + 8);
      });
      ctx.globalAlpha = 1.0;
    }

    // 2. DIBUJAR LÍNEAS ANCLA / BASE DADAS (Negras sólidas / grises posteriores)
    challenge.anchorCurves.forEach((curve) => {
      if (curve.points.length < 2) return;
      ctx.beginPath();
      curve.points.forEach((pt, idx) => {
        if (idx === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });

      if (curve.style === 'faint') {
        ctx.strokeStyle = '#94a3b8'; // Mitad posterior tenue
        ctx.lineWidth = 1.4;
        ctx.setLineDash([4, 4]);
      } else {
        ctx.strokeStyle = '#09090b'; // Línea de tinta frontal sólida
        ctx.lineWidth = 2.8;
        ctx.setLineDash([]);
      }
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // 3. AYUDAS VISUALES 3D (3 Estados: Off, Línea, Vértices)
    if (!evaluation) {
      if (aidMode === 'line') {
        // ESTADO 1: Línea gris de puntos que muestra el trazo completo para terminar la forma
        ctx.save();
        ctx.strokeStyle = '#94a3b8'; // Slate 400
        ctx.lineWidth = 1.8;
        ctx.setLineDash([3, 5]); // Línea de puntos gris
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        challenge.targetCurves.forEach((tc) => {
          if (tc.points.length < 2) return;
          ctx.beginPath();
          tc.points.forEach((pt, idx) => {
            if (idx === 0) ctx.moveTo(pt.x, pt.y);
            else ctx.lineTo(pt.x, pt.y);
          });
          ctx.stroke();
        });
        ctx.restore();
      } else if (aidMode === 'vertices') {
        // ESTADO 2: Solo vértices y una línea fina que apunta hacia el otro vértice
        ctx.save();
        ctx.strokeStyle = '#2563eb'; // Azul técnico
        ctx.lineWidth = 1.6;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.setLineDash([]);

        const drawnVertices: Point2D[] = [];
        const addVertex = (p: Point2D) => {
          if (!drawnVertices.some((v) => Math.hypot(v.x - p.x, v.y - p.y) < 4)) {
            drawnVertices.push(p);
          }
        };

        challenge.targetCurves.forEach((tc) => {
          if (tc.points.length < 2) return;
          const pts = tc.points;

          if (pts.length === 2) {
            // Segmento recto entre 2 vértices
            const pA = pts[0];
            const pB = pts[1];
            addVertex(pA);
            addVertex(pB);

            const dx = pB.x - pA.x;
            const dy = pB.y - pA.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 8) {
              const ux = dx / dist;
              const uy = dy / dist;
              const stubLen = Math.min(32, Math.max(10, dist * 0.28));

              // Línea fina desde pA que apunta hacia pB
              ctx.beginPath();
              ctx.moveTo(pA.x, pA.y);
              ctx.lineTo(pA.x + ux * stubLen, pA.y + uy * stubLen);
              ctx.stroke();

              // Línea fina desde pB que apunta hacia pA
              ctx.beginPath();
              ctx.moveTo(pB.x, pB.y);
              ctx.lineTo(pB.x - ux * stubLen, pB.y - uy * stubLen);
              ctx.stroke();
            }
          } else {
            // Segmento curvo (anillos o siluetas)
            const isClosed = Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) < 4;
            if (isClosed) {
              const step = Math.floor(pts.length / 4);
              for (let k = 0; k < 4; k++) {
                const idxA = (k * step) % pts.length;
                const pA = pts[idxA];
                addVertex(pA);

                const stubCount = Math.max(3, Math.floor(step * 0.28));
                ctx.beginPath();
                for (let s = 0; s <= stubCount; s++) {
                  const pt = pts[(idxA + s) % pts.length];
                  if (s === 0) ctx.moveTo(pt.x, pt.y);
                  else ctx.lineTo(pt.x, pt.y);
                }
                ctx.stroke();
              }
            } else {
              const pA = pts[0];
              const pB = pts[pts.length - 1];
              addVertex(pA);
              addVertex(pB);

              const stubCount = Math.max(3, Math.floor(pts.length * 0.28));
              ctx.beginPath();
              for (let s = 0; s <= stubCount && s < pts.length; s++) {
                const pt = pts[s];
                if (s === 0) ctx.moveTo(pt.x, pt.y);
                else ctx.lineTo(pt.x, pt.y);
              }
              ctx.stroke();

              ctx.beginPath();
              for (let s = pts.length - 1; s >= pts.length - 1 - stubCount && s >= 0; s--) {
                const pt = pts[s];
                if (s === pts.length - 1) ctx.moveTo(pt.x, pt.y);
                else ctx.lineTo(pt.x, pt.y);
              }
              ctx.stroke();
            }
          }
        });

        // Dibujar los marcadores de vértices con estilo técnico brutalista
        drawnVertices.forEach((v) => {
          ctx.fillStyle = '#2563eb';
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(v.x, v.y, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Centro blanco nítido
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(v.x, v.y, 1.5, 0, Math.PI * 2);
          ctx.fill();
        });

        ctx.restore();
      }
    }

    // 4. TRAZOS DEL USUARIO
    if (evaluation) {
      // SI YA FUE EVALUADO (Screenshots 3 y 5):
      // Los trazos del usuario se muestran en azul cyan suave
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      strokes.forEach((stroke) => {
        if (stroke.points.length < 2) return;
        ctx.beginPath();
        stroke.points.forEach((pt, idx) => {
          if (idx === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        });
        ctx.stroke();
      });

      // SUPERPOSICIÓN DE EVALUACIÓN:
      // Líneas Verdes (Acertadas)
      ctx.strokeStyle = '#22c55e'; // Verde esmeralda vivo
      ctx.lineWidth = 3.2;
      evaluation.matchedSegments.forEach((seg) => {
        if (seg.points.length < 2) return;
        ctx.beginPath();
        seg.points.forEach((pt, idx) => {
          if (idx === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        });
        ctx.stroke();
      });

      // Líneas Rojas (Faltantes o Desviadas, como en Screenshot 3 & 5)
      ctx.strokeStyle = '#ef4444'; // Rojo carmesí
      ctx.lineWidth = 3.2;
      evaluation.missingSegments.forEach((seg) => {
        if (seg.points.length < 2) return;
        ctx.beginPath();
        seg.points.forEach((pt, idx) => {
          if (idx === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        });
        ctx.stroke();
      });
    } else {
      // MIENTRAS EL USUARIO DIBUJA (Screenshot 1, 2, 4):
      // Tinta negra técnica y precisa
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      strokes.forEach((stroke) => {
        if (stroke.points.length < 2) return;
        ctx.beginPath();
        stroke.points.forEach((pt, idx) => {
          if (idx === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        });
        ctx.stroke();
      });

      // Trazo en curso en tiempo real
      if (currentLiveStroke.length > 1) {
        ctx.beginPath();
        currentLiveStroke.forEach((pt, idx) => {
          if (idx === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        });
        ctx.stroke();
      }
    }
  }, [challenge, strokes, currentLiveStroke, evaluation, showGrid, aidMode, canvasDimensions]);

  // ==========================================
  // Manejadores de Eventos del Puntero (Stylus, Touch, Mouse) con Corrección de Escala
  // ==========================================
  const getCanvasCoords = (e: React.PointerEvent<HTMLCanvasElement>): Point2D => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
    const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (evaluation) return; // Ya evaluado, no permitir dibujar hasta la siguiente ronda
    if (activePointerIdRef.current !== null && activePointerIdRef.current !== e.pointerId) {
      return; // Rechazo de toques secundarios / palma
    }
    e.preventDefault();
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // Ignorar si no es soportado
    }
    activePointerIdRef.current = e.pointerId;
    isDrawingRef.current = true;
    const pt = getCanvasCoords(e);
    currentPointsRef.current = [pt];
    setCurrentLiveStroke([pt]);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || (activePointerIdRef.current !== null && activePointerIdRef.current !== e.pointerId)) return;
    e.preventDefault();
    const pt = getCanvasCoords(e);
    currentPointsRef.current.push(pt);
    setCurrentLiveStroke([...currentPointsRef.current]);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activePointerIdRef.current !== null && activePointerIdRef.current !== e.pointerId) return;
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    activePointerIdRef.current = null;
    const pts = currentPointsRef.current;
    if (pts.length > 1) {
      const newStroke: UserStroke3D = {
        id: `stroke-${Date.now()}-${Math.random()}`,
        points: pts,
        timestamp: Date.now(),
      };
      setStrokes((prev) => [...prev, newStroke]);
      setRedoStack([]);
    }
    currentPointsRef.current = [];
    setCurrentLiveStroke([]);
  };

  // ==========================================
  // Acciones de la Barra de Herramientas
  // ==========================================
  const handleUndo = () => {
    if (strokes.length === 0 || evaluation) return;
    const last = strokes[strokes.length - 1];
    setStrokes((prev) => prev.slice(0, prev.length - 1));
    setRedoStack((prev) => [...prev, last]);
  };

  const handleRedo = () => {
    if (redoStack.length === 0 || evaluation) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, prev.length - 1));
    setStrokes((prev) => [...prev, next]);
  };

  const handleClear = () => {
    if (evaluation) return;
    setStrokes([]);
    setRedoStack([]);
  };

  // Memo para el reporte técnico actual 3D
  const currentReport = useMemo(() => {
    return build3DDebugReport(challenge, strokes, evaluation, userNote);
  }, [challenge, strokes, evaluation, userNote]);

  // Evaluación y paso a siguiente ronda
  const handleSubmitOrNext = () => {
    if (!evaluation) {
      // 1. Evaluar trazos
      const result = evaluate3DSubmission(strokes, challenge.targetCurves);
      setEvaluation(result);

      // Si el Modo Récord está activo, registrar ejercicio automáticamente
      if (isRecording && onRecordExercise) {
        const rep = build3DDebugReport(challenge, strokes, result, userNote);
        const newRecordId = `${Date.now()}_${challenge.seed}`;
        currentRecordIdRef.current = newRecordId;
        const newRecord: SessionRecordItem = {
          id: newRecordId,
          timestamp: new Date().toISOString(),
          displayTime: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
          type: '3d',
          nodeCode: `3D-${challenge.type.toUpperCase()}`,
          nodeTitle: `Perspectiva ${challenge.name}`,
          seed: challenge.seed,
          score: Math.round(result.score),
          passed: result.score >= 70,
          userComment: userNote.trim(),
          metricsSummary: `Grado: ${result.grade} · Completadas: ${result.drawnCount}/${result.targetCount}`,
          reportMarkdown: rep.markdownText,
          reportJsonString: rep.jsonString,
        };
        onRecordExercise(newRecord);
      }

      // Otorgar XP y feedback
      const awardedXp = Math.round(result.score * 0.4);
      if (awardedXp > 0 && onAwardXP) {
        onAwardXP(awardedXp);
      }

      if (onAvatarMoodChange) {
        if (result.score >= 80) onAvatarMoodChange('happy');
        else if (result.score >= 50) onAvatarMoodChange('thinking');
        else onAvatarMoodChange('fail-spiral');
      }

      setSessionScores((prev) => [...prev, result.score]);
    } else {
      // 2. Pasar a la siguiente ronda
      if (currentRound >= TOTAL_ROUNDS) {
        setIsSessionComplete(true);
      } else {
        loadNewChallenge(currentRound + 1);
      }
    }
  };

  // Reiniciar sesión de 8 rondas
  const handleRestartSession = () => {
    setSessionScores([]);
    setIsSessionComplete(false);
    loadNewChallenge(1);
  };

  // Promedio de puntuación
  const averageScore =
    sessionScores.length > 0
      ? Math.round((sessionScores.reduce((a, b) => a + b, 0) / sessionScores.length) * 10) / 10
      : 0;

  return (
    <div
      className="relative w-full h-[calc(100vh-65px)] min-h-[500px] bg-white flex flex-col overflow-hidden select-none"
    >
      {/* PANEL FLOTANTE IZQUIERDO DE SELECCIÓN DE FORMAS 3D */}
      <div className="absolute top-3 left-3 sm:left-5 z-20">
        <PrimitiveSelectorPanel
          selectedTypes={enabledPrimitives}
          onChangeSelectedTypes={(newSelected) => {
            setEnabledPrimitives(newSelected);
            if (!newSelected.includes(challenge.type)) {
              loadNewChallenge(currentRound, undefined, newSelected);
            }
          }}
          onSelectImmediate={(type) => {
            loadNewChallenge(currentRound, type);
          }}
          currentType={challenge.type}
        />
      </div>

      {/* 2. TARJETA CON EL MODELO 3D OBJETIVO (SUPERIOR DERECHA) */}
      <div className="absolute top-3 right-4 sm:right-6 z-20">
        <Perspective3DPreviewCard
          model={challenge.previewModel3D}
          primitiveType={challenge.type}
          title={challenge.name}
        />
      </div>

      {/* 3. BANNER DE CALIFICACIÓN Y PUNTUACIÓN TRAS EVALUAR (ESTILO BRUTALISTA PAPLITZ) */}
      {evaluation && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 animate-in fade-in slide-in-from-top-3 duration-200">
          <div className="card-ink bg-white text-black p-3.5 sm:px-6 sm:py-3.5 flex flex-col items-center min-w-[280px] sm:min-w-[340px]">
            <div className="flex items-center gap-3">
              {/* Caja de Calificación por Letra */}
              <div
                className={`w-10 h-10 border-2 border-black flex items-center justify-center font-display font-black text-2xl text-white shadow-[2px_2px_0px_#000000] ${
                  evaluation.grade === 'S'
                    ? 'bg-amber-400 text-black'
                    : evaluation.grade === 'A'
                    ? 'bg-emerald-500 text-white'
                    : evaluation.grade === 'B'
                    ? 'bg-blue-600 text-white'
                    : evaluation.grade === 'C'
                    ? 'bg-yellow-400 text-black'
                    : 'bg-red-500 text-white'
                }`}
              >
                {evaluation.grade}
              </div>

              {/* Puntaje Numérico */}
              <div className="flex items-baseline gap-1 font-mono">
                <span className="text-3xl font-black text-black tracking-tight">
                  {evaluation.score.toFixed(1)}
                </span>
                <span className="text-xs font-bold text-neutral-500 uppercase">PTS</span>
              </div>
            </div>

            {/* Mensaje de retroalimentación didáctica */}
            <p className="mt-2 text-xs font-mono font-bold text-neutral-800 border-t-2 border-black pt-1.5 w-full text-center">
              {evaluation.feedbackMessage}
            </p>
          </div>
        </div>
      )}

      {/* 4. LIENZO PRINCIPAL INTERACTIVO CON DETALLES TÉCNICOS PAPLITZ */}
      <div
        ref={canvasContainerRef}
        className="relative flex-1 w-full h-full overflow-hidden flex items-center justify-center cursor-crosshair"
      >
        {/* Indicador de 6 Paredes Inferior Izquierdo */}
        <div className="absolute bottom-3 left-3 text-[9px] font-mono font-bold uppercase bg-white border border-black px-1.5 py-0.5 pointer-events-none shadow-[1px_1px_0px_#000000] z-10 opacity-75 hidden sm:block">
          <span>6 PAREDES · VP X, Y, Z</span>
        </div>

        <canvas
          ref={canvasRef}
          width={canvasDimensions.width}
          height={canvasDimensions.height}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="touch-none block w-full h-full select-none"
        />
      </div>

      {/* 5. BARRA DE HERRAMIENTAS FLOTANTE INFERIOR (NEOBRUTALISTA PAPLITZ) */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30">
        <div className="bg-white border-2 border-black p-1.5 sm:p-2 shadow-[4px_4px_0px_#000000] flex items-center gap-1.5 sm:gap-2">
          {/* Deshacer */}
          <button
            onClick={handleUndo}
            disabled={strokes.length === 0 || !!evaluation}
            className="btn-ink-outline p-2 text-xs disabled:opacity-30 disabled:cursor-not-allowed shadow-[1px_1px_0px_#000000]"
            title="Deshacer trazo (Ctrl+Z)"
          >
            <Undo2 className="w-4 h-4 stroke-[2.2]" />
          </button>

          {/* Rehacer */}
          <button
            onClick={handleRedo}
            disabled={redoStack.length === 0 || !!evaluation}
            className="btn-ink-outline p-2 text-xs disabled:opacity-30 disabled:cursor-not-allowed shadow-[1px_1px_0px_#000000]"
            title="Rehacer trazo"
          >
            <Redo2 className="w-4 h-4 stroke-[2.2]" />
          </button>

          {/* Borrar Todo */}
          <button
            onClick={handleClear}
            disabled={strokes.length === 0 || !!evaluation}
            className="btn-ink-outline p-2 text-xs hover:bg-red-50 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed shadow-[1px_1px_0px_#000000]"
            title="Borrar todos los trazos"
          >
            <Trash2 className="w-4 h-4 stroke-[2.2]" />
          </button>

          <div className="w-[2px] h-6 bg-black mx-0.5" />

          {/* Botón REC (Modo Récord) */}
          <button
            type="button"
            onClick={isRecording ? onOpenRecordModal : onToggleRecording}
            className={`px-2.5 py-1.5 text-xs font-mono font-bold border-2 border-black cursor-pointer shadow-[1px_1px_0px_#000000] flex items-center gap-1.5 transition-colors ${
              isRecording ? 'bg-black text-white' : 'bg-white hover:bg-neutral-100 text-black'
            }`}
            title={isRecording ? `Grabando: ${recordedCount} ejercicios. Clic para ver o exportar sesión` : "Activar grabación de sesión (Modo Récord)"}
          >
            <span className={`w-2 h-2 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-neutral-400 border border-black'}`} />
            <span>{isRecording ? `REC (${recordedCount})` : 'REC'}</span>
          </button>

          {/* Botón Reportar Ejercicio */}
          <button
            type="button"
            onClick={() => setShowReportModal(true)}
            className={`btn-ink-outline p-2 text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer shadow-[1px_1px_0px_#000000] hover:bg-neutral-100 ${
              userNote.trim() ? 'bg-black text-white' : ''
            }`}
            title="Escribir nota y descargar reporte técnico de este ejercicio (JSON / Copiar)"
          >
            <AlertTriangle className="w-4 h-4 stroke-[2.2]" />
          </button>

          <div className="w-[2px] h-6 bg-black mx-0.5" />

          {/* Botón de Ayudas 3D: 3 Fases (Off -> Línea gris punteada -> Vértices con dirección) */}
          <button
            onClick={() => {
              setAidMode((prev) => {
                if (prev === 'off') return 'line';
                if (prev === 'line') return 'vertices';
                return 'off';
              });
            }}
            className={`p-2 text-xs font-mono font-bold border-2 border-black transition-all cursor-pointer shadow-[1px_1px_0px_#000000] flex items-center gap-1.5 ${
              aidMode === 'line'
                ? 'bg-amber-300 text-black'
                : aidMode === 'vertices'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-neutral-600 hover:bg-neutral-100'
            }`}
            title="Ciclar ayudas 3D: Apagado → Línea gris punteada → Vértices con dirección"
          >
            {aidMode === 'off' && <EyeOff className="w-4 h-4 stroke-[2.2]" />}
            {aidMode === 'line' && <Eye className="w-4 h-4 stroke-[2.2]" />}
            {aidMode === 'vertices' && <Crosshair className="w-4 h-4 stroke-[2.5]" />}

            <span className="hidden sm:inline uppercase text-[10px] tracking-wider font-mono">
              {aidMode === 'off' ? 'Ayuda: Off' : aidMode === 'line' ? 'Ayuda: Línea' : 'Ayuda: Vértices'}
            </span>
          </button>

          {/* Rejilla 3D (Toggles 3D guidelines on/off) */}
          <button
            onClick={() => setShowGrid((prev) => !prev)}
            className={`p-2 text-xs font-mono font-bold border-2 border-black transition-colors cursor-pointer shadow-[1px_1px_0px_#000000] ${
              showGrid ? 'bg-black text-white' : 'bg-neutral-100 text-neutral-400 border-neutral-300 shadow-none'
            }`}
            title={showGrid ? 'Ocultar guías de perspectiva 3D' : 'Mostrar guías de perspectiva 3D'}
          >
            <Grid className="w-4 h-4 stroke-[2.2]" />
          </button>

          {/* Nuevo Ángulo */}
          <button
            onClick={() => loadNewChallenge(currentRound)}
            className="btn-ink-outline p-2 text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer shadow-[1px_1px_0px_#000000] hover:bg-neutral-100"
            title="Generar otro ángulo o perspectiva 3D"
          >
            <RotateCcw className="w-4 h-4 stroke-[2.2]" />
            <span className="hidden md:inline uppercase text-[10px] tracking-wider font-mono">
              Nuevo Ángulo
            </span>
          </button>

          {/* Botón Principal: Submit (cuando se dibuja) o Next (tras evaluar) */}
          <button
            onClick={handleSubmitOrNext}
            className={`btn-ink px-4 sm:px-5 py-2 text-xs font-mono uppercase font-bold flex items-center gap-1.5 shadow-[2px_2px_0px_#000000] ${
              evaluation ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''
            }`}
          >
            <span>{evaluation ? 'Siguiente' : 'Comprobar'}</span>
            {evaluation ? <ChevronRight className="w-4 h-4 stroke-[2.5]" /> : <Check className="w-4 h-4 stroke-[3]" />}
          </button>
        </div>
      </div>

      {/* 6. MODAL DE RESUMEN FINAL TRAS COMPLETAR 8 RONDAS */}
      {isSessionComplete && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="card-ink bg-white p-6 sm:p-8 max-w-md w-full text-center animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-amber-400 border-2 border-black mx-auto flex items-center justify-center shadow-[3px_3px_0px_#000000] mb-4">
              <Trophy className="w-8 h-8 text-black stroke-[2.5]" />
            </div>

            <span className="text-xs font-mono font-bold uppercase tracking-widest text-neutral-500">
              Sesión 3D Completada
            </span>
            <h2 className="text-2xl sm:text-3xl font-display font-black mt-1">¡Perspectiva Dominada!</h2>

            <div className="my-6 bg-neutral-50 border-2 border-black p-4 shadow-[2px_2px_0px_#000000]">
              <div className="text-xs font-mono text-neutral-600 uppercase font-bold">Puntuación Media</div>
              <div className="text-4xl font-mono font-black mt-1 text-black">
                {averageScore} <span className="text-lg font-sans text-neutral-500">PTS</span>
              </div>

              {/* Récord por rondas */}
              <div className="grid grid-cols-4 gap-2 mt-4 pt-3 border-t border-neutral-300 text-xs font-mono">
                {sessionScores.map((sc, idx) => (
                  <div key={idx} className="bg-white border-2 border-black p-1 shadow-[1px_1px_0px_#000000]">
                    <div className="text-[10px] text-neutral-500 font-bold">R{idx + 1}</div>
                    <div className="font-black">{sc.toFixed(0)}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleRestartSession}
                className="btn-ink flex-1 py-3 text-sm font-mono font-bold uppercase flex items-center justify-center gap-2 cursor-pointer shadow-[3px_3px_0px_#000000]"
              >
                <RotateCcw className="w-4 h-4 stroke-[2.5]" />
                <span>Jugar Otra Vez</span>
              </button>

              {onExit && (
                <button
                  onClick={onExit}
                  className="btn-ink-outline px-4 py-3 text-sm font-mono font-bold uppercase cursor-pointer shadow-[3px_3px_0px_#000000]"
                >
                  Salir
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 7. MODAL DE REPORTE Y DIAGNÓSTICO 3D CON NOTAS */}
      {showReportModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-fade-in font-sans">
          <div className="bg-white border-4 border-black p-4 sm:p-5 max-w-lg w-full shadow-[8px_8px_0px_#000000] flex flex-col gap-3 max-h-[92vh] overflow-y-auto">
            {/* Cabecera */}
            <div className="flex items-center justify-between border-b-2 border-black pb-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-black stroke-[2.5]" />
                <h3 className="font-display font-bold text-sm sm:text-base uppercase tracking-tight">
                  Reporte de Perspectiva 3D
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowReportModal(false)}
                className="p-1 hover:bg-neutral-100 border border-black cursor-pointer shadow-[1px_1px_0px_#000000]"
                title="Cerrar modal (Esc)"
              >
                <X className="w-4 h-4 text-black stroke-[2.5]" />
              </button>
            </div>

            {/* Metadatos del reto */}
            <div className="flex items-center justify-between text-xs font-mono bg-neutral-50 p-2 border border-black">
              <div>
                <span className="text-neutral-500">Forma:</span> <strong>{challenge.name}</strong>
              </div>
              <div>
                <span className="text-neutral-500">Semilla:</span> <strong>#{challenge.seed}</strong>
              </div>
              <div>
                <span className="text-neutral-500">Nota:</span>{' '}
                <strong>{evaluation ? `${evaluation.score.toFixed(1)} PTS (${evaluation.grade})` : 'Calculada'}</strong>
              </div>
            </div>

            {/* Campo de Nota / Explicación del problema */}
            <div className="flex flex-col gap-1.5 bg-neutral-50 p-3 border-2 border-black">
              <label className="text-xs font-mono font-bold text-black flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Nota o apreciación del ejercicio:</span>
                </span>
                <span className="text-[10px] text-neutral-500 font-normal hidden sm:inline">
                  (Se incluirá en el archivo .JSON y en el texto copiado)
                </span>
              </label>
              <textarea
                value={userNote}
                onChange={(e) => {
                  const nextVal = e.target.value;
                  setUserNote(nextVal);
                  if (currentRecordIdRef.current && onUpdateRecordComment) {
                    onUpdateRecordComment(currentRecordIdRef.current, nextVal);
                  }
                }}
                placeholder="Escribe aquí qué ocurrió (ej: 'El punto de fuga Z se percibe forzado', 'Trazo curvado no detectado', 'Buena orientación pero nota baja')..."
                className="w-full h-20 p-2 text-xs font-mono bg-white border border-black resize-none focus:outline-none focus:ring-2 focus:ring-black selection:bg-black selection:text-white"
                autoFocus
              />
              <div className="flex flex-wrap gap-1 items-center pt-0.5">
                <span className="text-[10px] font-mono text-neutral-500 font-bold mr-1">Rápido:</span>
                {['Nota injusta', 'Punto de fuga desalineado', 'Trazo no detectado', 'Fallo de proporción', 'Buena sensación'].map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => {
                      const nextVal = userNote.trim() ? `${userNote.trim()} · ${tag}` : tag;
                      setUserNote(nextVal);
                      if (currentRecordIdRef.current && onUpdateRecordComment) {
                        onUpdateRecordComment(currentRecordIdRef.current, nextVal);
                      }
                    }}
                    className="text-[10px] font-mono bg-white hover:bg-black hover:text-white border border-black px-1.5 py-0.5 cursor-pointer transition-colors shadow-[1px_1px_0px_#000000]"
                  >
                    +{tag}
                  </button>
                ))}
                {userNote && (
                  <button
                    type="button"
                    onClick={() => {
                      setUserNote('');
                      if (currentRecordIdRef.current && onUpdateRecordComment) {
                        onUpdateRecordComment(currentRecordIdRef.current, '');
                      }
                    }}
                    className="text-[10px] font-mono text-neutral-500 hover:text-black ml-auto underline cursor-pointer"
                  >
                    Borrar nota
                  </button>
                )}
              </div>
            </div>

            {/* Vista previa del contenido */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-mono font-bold text-neutral-600">
                Vista previa del reporte (Markdown / JSON con tu nota):
              </label>
              <textarea
                readOnly
                value={currentReport.markdownText}
                className="w-full h-28 p-2 font-mono text-[10px] bg-neutral-50 border border-black resize-none selection:bg-black selection:text-white"
              />
            </div>

            {/* Acciones de exportación */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-neutral-200">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    downloadReport3DJson(currentReport.jsonString, challenge.seed, challenge.type, userNote);
                    setDownloadedReport(true);
                    setTimeout(() => setDownloadedReport(false), 2500);
                  }}
                  className="btn-ink px-3 py-1.5 text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer shadow-[2px_2px_0px_#000000]"
                  title="Descargar archivo .JSON incluyendo tu nota"
                >
                  {downloadedReport ? <Check className="w-3.5 h-3.5 stroke-[2.5]" /> : <Download className="w-3.5 h-3.5" />}
                  <span>{downloadedReport ? '¡Descargado!' : 'Descargar JSON'}</span>
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    await copyReport3DToClipboard(currentReport.markdownText);
                    setCopiedReport(true);
                    setTimeout(() => setCopiedReport(false), 2500);
                  }}
                  className="btn-ink-outline px-3 py-1.5 text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer shadow-[2px_2px_0px_#000000]"
                  title="Copiar texto con tu nota al portapapeles"
                >
                  {copiedReport ? <Check className="w-3.5 h-3.5 text-black stroke-[2.5]" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedReport ? '¡Copiado!' : 'Copiar Texto'}</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowReportModal(false)}
                className="px-3 py-1.5 text-xs font-mono text-neutral-600 hover:text-black border border-neutral-300 hover:border-black cursor-pointer ml-auto"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
