import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Point2D,
  UserStroke3D,
} from '../../lib/perspective3d/types';
import {
  Focal3DShapeType,
  FocalPracticeMode,
  FocalAidMode,
  FocalVisionMode,
  Focal3DChallenge,
  FocalEvaluationResult,
} from '../../lib/focal3d/types';
import { generateFocal3DChallenge } from '../../lib/focal3d/generator';
import { evaluateFocal3DSubmission } from '../../lib/focal3d/evaluator';
import { FocalSelectorPanel } from './FocalSelectorPanel';
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
  CheckCircle,
  AlertTriangle,
  Sparkles,
  PenTool,
  Box,
  Trophy,
} from 'lucide-react';
import { SessionRecordItem } from '../../lib/sessionRecorder';

interface Focal3DViewProps {
  onAwardXP?: (amount: number) => void;
  onAvatarMoodChange?: (mood: any) => void;
  onExit?: () => void;
  isRecording?: boolean;
  onToggleRecording?: () => void;
  onOpenRecordModal?: () => void;
  recordedCount?: number;
  onRecordExercise?: (record: SessionRecordItem) => void;
}

export const Focal3DView: React.FC<Focal3DViewProps> = ({
  onAwardXP,
  onAvatarMoodChange,
  onExit,
  isRecording = false,
  onToggleRecording,
  onOpenRecordModal,
  recordedCount = 0,
  onRecordExercise,
}) => {
  // Configuración de la sesión (8 rondas por defecto)
  const TOTAL_ROUNDS = 8;
  const [currentRound, setCurrentRound] = useState<number>(1);
  const [sessionScores, setSessionScores] = useState<number[]>([]);
  const [isSessionComplete, setIsSessionComplete] = useState<boolean>(false);

  // Modo de práctica: 'full_wheel' (8 formas a la vez como en la foto) o 'single' (sector por sector)
  const [practiceMode, setPracticeMode] = useState<FocalPracticeMode>('full_wheel');
  // Tipo de forma seleccionada
  const [selectedShapeType, setSelectedShapeType] = useState<Focal3DShapeType>('CUBE');

  // Herramienta activa: 'ink' (tinta negra de forma) o 'construction' (guía gris discontinua)
  const [strokeTool, setStrokeTool] = useState<'ink' | 'construction'>('ink');
  // Visualización de ayudas y rejilla
  const [showFocalGrid, setShowFocalGrid] = useState<boolean>(true);
  const [aidMode, setAidMode] = useState<FocalAidMode>('off'); // 'off' | 'line' | 'vertices'
  const [visionMode, setVisionMode] = useState<FocalVisionMode>('all');

  // Dimensiones del lienzo en formato apaisado (Landscape)
  const [canvasDimensions, setCanvasDimensions] = useState<{ width: number; height: number }>({
    width: 960,
    height: 600,
  });

  // Reto actual
  const [challenge, setChallenge] = useState<Focal3DChallenge>(() =>
    generateFocal3DChallenge(Date.now(), 'full_wheel', 'CUBE', 960, 600, 0)
  );

  // Trazos y evaluación
  const [strokes, setStrokes] = useState<UserStroke3D[]>([]);
  const [redoStack, setRedoStack] = useState<UserStroke3D[]>([]);
  const [evaluation, setEvaluation] = useState<FocalEvaluationResult | null>(null);

  // Referencias interactivas
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef<boolean>(false);
  const currentPointsRef = useRef<Point2D[]>([]);
  const activePointerIdRef = useRef<number | null>(null);
  const [currentLiveStroke, setCurrentLiveStroke] = useState<Point2D[]>([]);

  // Ajustar tamaño del canvas al contenedor manteniendo nitidez HD
  useEffect(() => {
    const updateDimensions = () => {
      if (!canvasContainerRef.current) return;
      const rect = canvasContainerRef.current.getBoundingClientRect();
      const w = Math.max(700, Math.floor(rect.width));
      const h = Math.max(450, Math.floor(rect.height));
      setCanvasDimensions({ width: w, height: h });
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Cargar nuevo reto
  const loadNewChallenge = useCallback(
    (roundNum: number, modeOverride?: FocalPracticeMode, typeOverride?: Focal3DShapeType) => {
      const mode = modeOverride || practiceMode;
      const type = typeOverride || selectedShapeType;
      const sectorIdx = (roundNum - 1) % 8;
      const seed = Math.floor(Math.random() * 1000000);
      const newCh = generateFocal3DChallenge(
        seed,
        mode,
        type,
        canvasDimensions.width,
        canvasDimensions.height,
        sectorIdx
      );
      setChallenge(newCh);
      setStrokes([]);
      setRedoStack([]);
      setEvaluation(null);
      setCurrentLiveStroke([]);
      setVisionMode('all');
      setCurrentRound(roundNum);
    },
    [practiceMode, selectedShapeType, canvasDimensions]
  );

  // Recargar si cambian las dimensiones iniciales
  useEffect(() => {
    loadNewChallenge(currentRound);
  }, [canvasDimensions.width, canvasDimensions.height]);

  // Manejo de Undo / Redo / Clear
  const handleUndo = () => {
    if (strokes.length === 0 || evaluation) return;
    const last = strokes[strokes.length - 1];
    setRedoStack((prev) => [...prev, last]);
    setStrokes((prev) => prev.slice(0, -1));
  };

  const handleRedo = () => {
    if (redoStack.length === 0 || evaluation) return;
    const next = redoStack[redoStack.length - 1];
    setStrokes((prev) => [...prev, next]);
    setRedoStack((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    if (strokes.length === 0 || evaluation) return;
    setStrokes([]);
    setRedoStack([]);
    setCurrentLiveStroke([]);
  };

  // Comprobar / Siguiente
  const handleSubmitOrNext = () => {
    if (!evaluation) {
      // 1. Evaluar trazos
      const result = evaluateFocal3DSubmission(strokes, challenge);
      setEvaluation(result);

      if (onRecordExercise) {
        const newRecord: SessionRecordItem = {
          id: `focal3d-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          timestamp: new Date().toISOString(),
          displayTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          type: '3d',
          nodeCode: 'FOCAL-1P',
          nodeTitle: challenge.title,
          seed: challenge.seed,
          score: Math.round(result.score),
          passed: result.passed,
          userComment: '',
          metricsSummary: `${Math.round(result.score)}% · ${result.passed ? 'Aprobado ✓' : 'No Superado'} · 1 Punto Focal`,
          reportMarkdown: `### ${challenge.title}\nScore: ${result.score}%`,
          reportJsonString: JSON.stringify(result),
        };
        onRecordExercise(newRecord);
      }

      const awardedXp = Math.round(result.score * 0.4);
      if (awardedXp > 0 && onAwardXP) onAwardXP(awardedXp);

      if (onAvatarMoodChange) {
        if (result.passed) onAvatarMoodChange('happy');
        else if (result.score >= 50) onAvatarMoodChange('thinking');
        else onAvatarMoodChange('fail-spiral');
      }

      setSessionScores((prev) => [...prev, result.score]);
    } else {
      // 2. Siguiente ronda
      if (currentRound >= TOTAL_ROUNDS) {
        setIsSessionComplete(true);
      } else {
        loadNewChallenge(currentRound + 1);
      }
    }
  };

  // Reiniciar sesión
  const handleRestartSession = () => {
    setSessionScores([]);
    setIsSessionComplete(false);
    loadNewChallenge(1);
  };

  // ==========================================
  // Renderizado del Canvas Canvas 2D
  // ==========================================
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Fondo blanco nítido
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const fp = challenge.focalPoint;

    // 1. DIBUJAR LAS 8 LÍNEAS DISCONTINUAS QUE CONVERGEN AL PUNTO FOCAL
    if (showFocalGrid) {
      ctx.save();
      ctx.strokeStyle = '#cbd5e1'; // Gris pizarra claro tenue
      ctx.lineWidth = 1.3;
      ctx.setLineDash([8, 6]); // Líneas discontinuas exactas

      for (const ray of challenge.focalRays) {
        ctx.beginPath();
        ctx.moveTo(ray.x1, ray.y1);
        ctx.lineTo(ray.x2, ray.y2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 2. DIBUJAR EL PUNTO FOCAL CENTRAL (Centro óptico con diana y etiqueta)
    ctx.save();
    // Halo tenue
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(fp.x, fp.y, 8, 0, Math.PI * 2);
    ctx.stroke();

    // Punto central sólido
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(fp.x, fp.y, 3, 0, Math.PI * 2);
    ctx.fill();

    // Etiqueta del Punto Focal
    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('PUNTO FOCAL (1 PF)', fp.x, fp.y + 19);
    ctx.restore();

    // 3. LÍNEAS DE ANCLAJE OBLIGATORIAS (VISIBLES SIEMPRE, INCLUSO CON AYUDAS OFF)
    // Indican dónde está cada forma, sus dimensiones y los rayos de convergencia al punto focal
    if (!evaluation || visionMode === 'all' || visionMode === 'solution') {
      ctx.save();
      for (const shape of challenge.shapes) {
        if (shape.anchorCurves) {
          for (const anc of shape.anchorCurves) {
            ctx.beginPath();
            if (anc.style === 'dashed') {
              ctx.strokeStyle = '#64748b'; // Rayos de fuga al punto focal / eje
              ctx.lineWidth = 1.3;
              ctx.setLineDash([6, 5]);
            } else {
              ctx.strokeStyle = '#475569'; // Cara frontal / dimensiones sólidas
              ctx.lineWidth = 1.6;
              ctx.setLineDash([]);
            }
            anc.points.forEach((pt, idx) => {
              if (idx === 0) ctx.moveTo(pt.x, pt.y);
              else ctx.lineTo(pt.x, pt.y);
            });
            ctx.stroke();
          }
        }

        // Vértices y marcadores de dimensiones
        if (shape.type === 'CYLINDER') {
          // Centro del cilindro
          ctx.fillStyle = '#0f172a';
          ctx.beginPath();
          ctx.arc(shape.centerPos.x, shape.centerPos.y, 3.2, 0, Math.PI * 2);
          ctx.fill();

          // Marcador de radio
          if (shape.radiusCurve && shape.radiusCurve.points.length > 0) {
            const rTip = shape.radiusCurve.points[shape.radiusCurve.points.length - 1];
            ctx.fillStyle = '#475569';
            ctx.beginPath();
            ctx.arc(rTip.x, rTip.y, 2.5, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#475569';
            ctx.font = 'bold 9px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('R', (shape.centerPos.x + rTip.x) / 2, (shape.centerPos.y + rTip.y) / 2 - 5);
          }
        } else {
          // Puntos en los vértices frontales para facilitar inicio de trazos
          shape.frontCurves.forEach((fc) => {
            if (fc.points.length > 0) {
              const p = fc.points[0];
              ctx.fillStyle = '#475569';
              ctx.beginPath();
              ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
              ctx.fill();
            }
          });
        }
      }
      ctx.restore();
    }

    // 4. AYUDAS 3D ADICIONALES (Rayos de fuga prolongados o esqueleto completo fantasma)
    if (!evaluation && aidMode !== 'off') {
      ctx.save();
      for (const shape of challenge.shapes) {
        // En modo 'line': muestra los rayos de fuga prolongados desde cada vértice al punto focal
        if (aidMode === 'line' || aidMode === 'vertices') {
          ctx.strokeStyle = '#94a3b8';
          ctx.lineWidth = 1.1;
          ctx.setLineDash([4, 4]);

          for (const g of shape.guidelinesToFocal) {
            ctx.beginPath();
            g.points.forEach((pt, i) => {
              if (i === 0) ctx.moveTo(pt.x, pt.y);
              else ctx.lineTo(pt.x, pt.y);
            });
            ctx.stroke();
          }
          ctx.setLineDash([]);
        }

        // En modo 'vertices': muestra el esqueleto completo de la figura precalculada
        if (aidMode === 'vertices') {
          ctx.strokeStyle = 'rgba(15, 23, 42, 0.28)';
          ctx.lineWidth = 1.8;
          ctx.setLineDash([5, 4]);

          for (const c of shape.allCurves) {
            ctx.beginPath();
            c.points.forEach((pt, i) => {
              if (i === 0) ctx.moveTo(pt.x, pt.y);
              else ctx.lineTo(pt.x, pt.y);
            });
            ctx.stroke();
          }
          ctx.setLineDash([]);
        }
      }
      ctx.restore();
    }

    // 4. MODO CORRECCIÓN: SUPERPOSICIÓN DE EVALUACIÓN (SOLUCIÓN, MATCHED Y MISSING)
    if (evaluation && (visionMode === 'all' || visionMode === 'solution')) {
      ctx.save();
      // Curvas faltantes en rojo suave punteado
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.55)';
      ctx.lineWidth = 2.0;
      ctx.setLineDash([4, 4]);
      for (const mc of evaluation.missingCurves) {
        ctx.beginPath();
        mc.points.forEach((pt, i) => {
          if (i === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        });
        ctx.stroke();
      }

      // Curvas acertadas en verde esmeralda
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.75)';
      ctx.lineWidth = 2.4;
      ctx.setLineDash([]);
      for (const m of evaluation.matchedCurves) {
        ctx.beginPath();
        m.points.forEach((pt, i) => {
          if (i === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        });
        ctx.stroke();
      }

      // Rayos de fuga ideales en gris
      ctx.strokeStyle = 'rgba(100, 116, 139, 0.40)';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 4]);
      for (const shape of challenge.shapes) {
        for (const g of shape.guidelinesToFocal) {
          ctx.beginPath();
          g.points.forEach((pt, i) => {
            if (i === 0) ctx.moveTo(pt.x, pt.y);
            else ctx.lineTo(pt.x, pt.y);
          });
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // 5. TRAZOS DEL USUARIO (Ocultos si en modo visión 'solution' u 'off')
    const shouldDrawUserStrokes = !evaluation || (visionMode === 'all' || visionMode === 'drawing');

    if (shouldDrawUserStrokes) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      strokes.forEach((stroke) => {
        if (stroke.points.length < 2) return;
        ctx.beginPath();
        if (stroke.isConstruction) {
          ctx.strokeStyle = '#94a3b8'; // Línea gris fina de construcción
          ctx.lineWidth = 1.4;
          ctx.setLineDash([4, 4]);
        } else {
          ctx.strokeStyle = '#0f172a'; // Tinta negra precisa
          ctx.lineWidth = 2.4;
          ctx.setLineDash([]);
        }
        stroke.points.forEach((pt, idx) => {
          if (idx === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        });
        ctx.stroke();
        ctx.setLineDash([]);
      });

      // Trazo en curso
      if (currentLiveStroke.length > 1) {
        ctx.beginPath();
        if (strokeTool === 'construction') {
          ctx.strokeStyle = '#94a3b8';
          ctx.lineWidth = 1.4;
          ctx.setLineDash([4, 4]);
        } else {
          ctx.strokeStyle = '#0f172a';
          ctx.lineWidth = 2.4;
          ctx.setLineDash([]);
        }
        currentLiveStroke.forEach((pt, idx) => {
          if (idx === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        });
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();
    }
  }, [
    challenge,
    strokes,
    currentLiveStroke,
    evaluation,
    showFocalGrid,
    aidMode,
    strokeTool,
    visionMode,
    canvasDimensions,
  ]);

  // Manejadores de puntero
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
    if (evaluation) return;
    if (activePointerIdRef.current !== null && activePointerIdRef.current !== e.pointerId) return;
    e.preventDefault();
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
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
        id: `fstroke-${Date.now()}-${Math.random()}`,
        points: pts,
        timestamp: Date.now(),
        isConstruction: strokeTool === 'construction',
      };
      setStrokes((prev) => [...prev, newStroke]);
      setRedoStack([]);
    }
    currentPointsRef.current = [];
    setCurrentLiveStroke([]);
  };

  // Atajos de teclado
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

      if (e.key === 'Enter') {
        e.preventDefault();
        handleSubmitOrNext();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      } else if (e.key.toLowerCase() === 'v' && evaluation) {
        e.preventDefault();
        setVisionMode((prev) => {
          if (prev === 'all') return 'solution';
          if (prev === 'solution') return 'drawing';
          if (prev === 'drawing') return 'off';
          return 'all';
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [evaluation, strokes, redoStack, challenge, currentRound]);

  const averageScore =
    sessionScores.length > 0
      ? Math.round((sessionScores.reduce((a, b) => a + b, 0) / sessionScores.length) * 10) / 10
      : 0;

  return (
    <div className="relative w-full h-[calc(100vh-65px)] min-h-[500px] bg-white flex flex-col overflow-hidden select-none">
      {/* 1. PANEL FLOTANTE LATERAL DE FORMAS Y MODOS (IGUAL A LAB 3D) */}
      <div className="absolute top-3 left-3 sm:left-5 z-20 flex items-start gap-2">
        <FocalSelectorPanel
          currentType={selectedShapeType}
          onSelectType={(type) => {
            setSelectedShapeType(type);
            loadNewChallenge(currentRound, practiceMode, type);
          }}
          practiceMode={practiceMode}
          onChangePracticeMode={(mode) => {
            setPracticeMode(mode);
            loadNewChallenge(currentRound, mode, selectedShapeType);
          }}
          currentRound={currentRound}
        />

        {sessionScores.length > 0 && (
          <div className="bg-white border-2 border-black px-2.5 py-1.5 shadow-[2px_2px_0px_#000000] font-mono text-xs font-bold flex items-center gap-1">
            <span className="text-neutral-500">Media:</span>
            <span>{averageScore}%</span>
          </div>
        )}

        {onExit && (
          <button
            onClick={onExit}
            className="bg-white border-2 border-black px-2.5 py-1.5 shadow-[2px_2px_0px_#000000] font-mono text-xs font-bold hover:bg-neutral-100 flex items-center gap-1 cursor-pointer"
            title="Volver a Práctica"
          >
            ← Salir
          </button>
        )}
      </div>

      {/* 2. TARJETA DE NOTA Y PROGRESO (SUPERIOR DERECHA) */}
      <div className="absolute top-3 right-4 sm:right-6 z-20 flex items-start gap-2 sm:gap-2.5 pointer-events-none">
        {evaluation && (
          <div className="pointer-events-auto bg-white border-2 border-black p-2 sm:p-2.5 shadow-[4px_4px_0px_#000000] font-mono flex flex-col items-center justify-center min-w-[88px] sm:min-w-[100px] aspect-square select-none animate-in fade-in zoom-in-95 duration-150">
            <span className="text-[10px] sm:text-xs font-bold uppercase text-neutral-500 tracking-wider">
              Nota
            </span>
            <span className="text-2xl sm:text-3xl font-black leading-none my-1">
              {Math.round(evaluation.score)}%
            </span>
            <span
              className={`text-[9px] sm:text-[10px] font-bold uppercase px-1.5 py-0.5 border border-black ${
                evaluation.passed ? 'bg-black text-white' : 'bg-neutral-200 text-black'
              }`}
            >
              {evaluation.passed ? 'Aprobado' : 'Reintentar'}
            </span>
          </div>
        )}

        {/* Tarjeta Informativa del Reto */}
        <div className="pointer-events-auto bg-white border-2 border-black p-2 sm:p-2.5 shadow-[3px_3px_0px_#000000] font-mono max-w-[200px] hidden md:block">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase mb-1">
            <Box className="w-3.5 h-3.5" />
            <span>1 Punto Focal</span>
          </div>
          <p className="text-[10px] text-neutral-600 leading-tight">
            {challenge.tipText}
          </p>
        </div>
      </div>

      {/* 3. LIENZO PRINCIPAL INTERACTIVO CON DETALLES TÉCNICOS */}
      <div
        ref={canvasContainerRef}
        className="relative flex-1 w-full h-full overflow-hidden flex items-center justify-center cursor-crosshair"
      >
        <div className="absolute bottom-3 left-3 text-[9px] font-mono font-bold uppercase bg-white border border-black px-1.5 py-0.5 pointer-events-none shadow-[1px_1px_0px_#000000] z-10 opacity-75 hidden sm:block">
          <span>8 LÍNEAS FOCALES DISCONTINUAS · 1 FOCAL POINT</span>
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

      {/* 4. BARRA DE HERRAMIENTAS FLOTANTE INFERIOR (NEOBRUTALISTA PAPLITZ) */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30">
        <div className="bg-white border-2 border-black p-1.5 sm:p-2 shadow-[4px_4px_0px_#000000] flex items-center gap-1.5 sm:gap-2">
          {/* MODO DIBUJO: Deshacer, Rehacer, Borrar, Herramienta Tinta/Construcción */}
          {!evaluation && (
            <>
              <button
                onClick={handleUndo}
                disabled={strokes.length === 0}
                className="btn-ink-outline p-2 text-xs disabled:opacity-30 disabled:cursor-not-allowed shadow-[1px_1px_0px_#000000]"
                title="Deshacer trazo (Ctrl+Z)"
              >
                <Undo2 className="w-4 h-4 stroke-[2.2]" />
              </button>

              <button
                onClick={handleRedo}
                disabled={redoStack.length === 0}
                className="btn-ink-outline p-2 text-xs disabled:opacity-30 disabled:cursor-not-allowed shadow-[1px_1px_0px_#000000]"
                title="Rehacer trazo"
              >
                <Redo2 className="w-4 h-4 stroke-[2.2]" />
              </button>

              <button
                onClick={handleClear}
                disabled={strokes.length === 0}
                className="btn-ink-outline p-2 text-xs hover:bg-neutral-200 hover:text-black disabled:opacity-30 disabled:cursor-not-allowed shadow-[1px_1px_0px_#000000]"
                title="Borrar todos los trazos"
              >
                <Trash2 className="w-4 h-4 stroke-[2.2]" />
              </button>

              <div className="w-[2px] h-6 bg-black mx-0.5" />

              {/* Tinta vs Línea de Construcción */}
              <button
                type="button"
                onClick={() => setStrokeTool((prev) => (prev === 'ink' ? 'construction' : 'ink'))}
                className={`p-2 text-xs font-mono font-bold border-2 border-black transition-all cursor-pointer shadow-[1px_1px_0px_#000000] flex items-center gap-1.5 ${
                  strokeTool === 'construction'
                    ? 'bg-neutral-800 text-white'
                    : 'bg-white text-neutral-800 hover:bg-neutral-100'
                }`}
                title={
                  strokeTool === 'construction'
                    ? 'Línea de construcción activa (fina gris discontinua hacia el punto focal). Clic para volver a Tinta.'
                    : 'Activar línea de construcción (trazo auxiliar discontinuo para fugar hacia el punto focal sin penalizar).'
                }
              >
                <span className={`w-3.5 border-b-2 ${strokeTool === 'construction' ? 'border-dashed border-white' : 'border-neutral-800'}`} />
                <span className="text-[10px] uppercase tracking-wider font-mono">
                  {strokeTool === 'construction' ? 'Construcción' : 'Tinta'}
                </span>
              </button>

              <div className="w-[2px] h-6 bg-black mx-0.5" />
            </>
          )}

          {/* MODO CORRECCIÓN: Visión Cíclica */}
          {evaluation && (
            <>
              <button
                type="button"
                onClick={() => {
                  setVisionMode((prev) => {
                    if (prev === 'all') return 'solution';
                    if (prev === 'solution') return 'drawing';
                    if (prev === 'drawing') return 'off';
                    return 'all';
                  });
                }}
                className={`px-2.5 py-1.5 text-xs font-mono font-bold border-2 border-black transition-all cursor-pointer shadow-[1px_1px_0px_#000000] flex items-center gap-1.5 ${
                  visionMode !== 'off' ? 'bg-black text-white' : 'bg-white text-neutral-600 hover:bg-neutral-100'
                }`}
                title="Visión: Ambos → Solución (oculta dibujo) → Mi Dibujo → Off (V)"
              >
                {visionMode === 'all' && <Eye className="w-4 h-4 stroke-[2.2]" />}
                {visionMode === 'solution' && <Sparkles className="w-4 h-4 stroke-[2.2]" />}
                {visionMode === 'drawing' && <PenTool className="w-4 h-4 stroke-[2.2]" />}
                {visionMode === 'off' && <EyeOff className="w-4 h-4 stroke-[2.2]" />}
                <span className="text-[10px] uppercase tracking-wider font-mono">
                  {visionMode === 'all'
                    ? 'Visión: Ambos'
                    : visionMode === 'solution'
                    ? 'Visión: Solución'
                    : visionMode === 'drawing'
                    ? 'Visión: Dibujo'
                    : 'Visión: Off'}
                </span>
              </button>

              <div className="w-[2px] h-6 bg-black mx-0.5" />
            </>
          )}

          {/* Botón REC */}
          <button
            type="button"
            onClick={isRecording ? onOpenRecordModal : onToggleRecording}
            className={`px-2.5 py-1.5 text-xs font-mono font-bold border-2 border-black cursor-pointer shadow-[1px_1px_0px_#000000] flex items-center gap-1.5 transition-colors ${
              isRecording ? 'bg-black text-white' : 'bg-white hover:bg-neutral-100 text-black'
            }`}
            title={isRecording ? `Grabando: ${recordedCount} ejercicios` : 'Activar grabación de sesión'}
          >
            <span className={`w-2 h-2 rounded-full ${isRecording ? 'bg-black animate-pulse' : 'bg-neutral-300 border border-black'}`} />
            <span>{isRecording ? `REC (${recordedCount})` : 'REC'}</span>
          </button>

          {/* Rejilla de 8 Líneas Focales */}
          <button
            onClick={() => setShowFocalGrid((prev) => !prev)}
            className={`p-2 text-xs font-mono font-bold border-2 border-black transition-colors cursor-pointer shadow-[1px_1px_0px_#000000] ${
              showFocalGrid ? 'bg-black text-white' : 'bg-neutral-100 text-neutral-400 border-neutral-300 shadow-none'
            }`}
            title={showFocalGrid ? 'Ocultar 8 líneas focales' : 'Mostrar 8 líneas focales discontinuas'}
          >
            <Grid className="w-4 h-4 stroke-[2.2]" />
          </button>

          {/* Ayudas 3D: 3 Fases (Off -> Rayos de Fuga -> Solución Completa) */}
          {!evaluation && (
            <>
              <div className="w-[2px] h-6 bg-black mx-0.5" />

              <button
                onClick={() => {
                  setAidMode((prev) => {
                    if (prev === 'off') return 'line';
                    if (prev === 'line') return 'vertices';
                    return 'off';
                  });
                }}
                className={`p-2 text-xs font-mono font-bold border-2 border-black transition-all cursor-pointer shadow-[1px_1px_0px_#000000] flex items-center gap-1.5 ${
                  aidMode !== 'off' ? 'bg-black text-white' : 'bg-white text-neutral-600 hover:bg-neutral-100'
                }`}
                title="Ciclar ayudas: Apagado → Rayos de Fuga → Solución Precalculada Completa"
              >
                {aidMode === 'off' && <EyeOff className="w-4 h-4 stroke-[2.2]" />}
                {aidMode === 'line' && <Eye className="w-4 h-4 stroke-[2.2]" />}
                {aidMode === 'vertices' && <Crosshair className="w-4 h-4 stroke-[2.5]" />}

                <span className="hidden sm:inline uppercase text-[10px] tracking-wider font-mono">
                  {aidMode === 'off' ? 'Ayuda: Off' : aidMode === 'line' ? 'Ayuda: Rayos' : 'Ayuda: Solución'}
                </span>
              </button>

              {/* Botón Regenerar / Nuevo Ángulo */}
              <button
                onClick={() => loadNewChallenge(currentRound)}
                className="btn-ink-outline p-2 text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer shadow-[1px_1px_0px_#000000] hover:bg-neutral-100"
                title="Regenerar formas o cambiar semillas"
              >
                <RotateCcw className="w-4 h-4 stroke-[2.2]" />
              </button>
            </>
          )}

          {/* Botón Principal: Comprobar o Siguiente */}
          {evaluation ? (
            <div className="flex items-center gap-1.5 shrink-0 ml-1">
              <div className="flex items-center gap-1 border-2 border-black bg-neutral-100 px-2.5 py-1.5 font-mono text-xs font-bold shadow-[1px_1px_0px_#000000] shrink-0">
                {evaluation.passed ? (
                  <CheckCircle className="w-3.5 h-3.5 text-black stroke-[2.5]" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 text-black stroke-[2.5]" />
                )}
                <span>{Math.round(evaluation.score)}%</span>
              </div>
              <button
                onClick={handleSubmitOrNext}
                className="btn-ink px-3 sm:px-4 py-2 text-xs font-mono uppercase font-bold flex items-center gap-1 cursor-pointer shadow-[2px_2px_0px_#000000] shrink-0"
                title="Siguiente ejercicio (Enter)"
              >
                <span>Siguiente</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={handleSubmitOrNext}
              disabled={strokes.length === 0}
              className="btn-ink px-3.5 sm:px-5 py-2 text-xs font-mono uppercase font-bold disabled:opacity-30 cursor-pointer shadow-[2px_2px_0px_#000000] flex items-center gap-1.5 shrink-0 ml-1"
              title="Evaluar convergencia hacia el punto focal (Enter)"
            >
              <span>Comprobar</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* MODAL FIN DE SESIÓN (8 RONDAS) */}
      {isSessionComplete && (
        <div className="absolute inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white border-4 border-black p-6 shadow-[8px_8px_0px_#000000] max-w-sm w-full font-mono text-center">
            <Trophy className="w-12 h-12 mx-auto mb-2 text-yellow-500 stroke-[2]" />
            <h3 className="text-xl font-black uppercase mb-1">¡Sesión Completada!</h3>
            <p className="text-xs text-neutral-600 mb-4">
              Has completado las 8 rondas de perspectiva cónica con 1 punto focal central.
            </p>
            <div className="bg-neutral-100 border-2 border-black p-3 mb-4">
              <span className="text-xs text-neutral-500 uppercase block">Puntuación Media</span>
              <span className="text-3xl font-black">{averageScore}%</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleRestartSession}
                className="btn-ink flex-1 py-2 text-xs font-mono font-bold uppercase cursor-pointer"
              >
                Reiniciar
              </button>
              {onExit && (
                <button
                  onClick={onExit}
                  className="btn-ink-outline flex-1 py-2 text-xs font-mono font-bold uppercase cursor-pointer"
                >
                  Salir
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
