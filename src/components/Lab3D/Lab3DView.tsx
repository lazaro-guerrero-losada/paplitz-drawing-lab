import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Primitive3DChallenge,
  UserStroke3D,
  EvaluationResult3D,
  Point2D,
  PrimitiveType,
} from '../../lib/perspective3d/types';
import { generate3DChallenge, ALL_PRIMITIVES } from '../../lib/perspective3d/primitives';
import { evaluate3DSubmission } from '../../lib/perspective3d/evaluator3d';
import { Perspective3DPreviewCard } from './Perspective3DPreviewCard';
import {
  Undo2,
  Redo2,
  Trash2,
  Eye,
  EyeOff,
  Grid,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Trophy,
  Zap,
} from 'lucide-react';

interface Lab3DViewProps {
  onAwardXP?: (amount: number) => void;
  onAvatarMoodChange?: (mood: any) => void;
  onExit?: () => void;
}

export const Lab3DView: React.FC<Lab3DViewProps> = ({
  onAwardXP,
  onAvatarMoodChange,
  onExit,
}) => {
  // Configuración de la sesión
  const TOTAL_ROUNDS = 8;
  const [currentRound, setCurrentRound] = useState<number>(1);
  const [sessionScores, setSessionScores] = useState<number[]>([]);
  const [isSessionComplete, setIsSessionComplete] = useState<boolean>(false);

  // Modo de práctica: 'rounds' (Desafío de 8 rondas) o 'free' (Práctica Libre Infinita)
  const [practiceMode, setPracticeMode] = useState<'rounds' | 'free'>('rounds');
  const [selectedPrimitiveType, setSelectedPrimitiveType] = useState<PrimitiveType | 'RANDOM'>('RANDOM');

  // Reto actual
  const [challenge, setChallenge] = useState<Primitive3DChallenge>(() =>
    generate3DChallenge(Date.now(), undefined, 800, 600)
  );

  // Estados del lienzo
  const [strokes, setStrokes] = useState<UserStroke3D[]>([]);
  const [redoStack, setRedoStack] = useState<UserStroke3D[]>([]);
  const [evaluation, setEvaluation] = useState<EvaluationResult3D | null>(null);

  // Opciones de visualización (como en las capturas 1 y 2)
  const [showGrid, setShowGrid] = useState<boolean>(true); // Activar / desactivar rejilla 3D
  const [peekHint, setPeekHint] = useState<boolean>(false); // Ojo para ver solución fantasma

  // Referencias del Canvas e interactividad
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef<boolean>(false);
  const currentPointsRef = useRef<Point2D[]>([]);

  // Redimensionar canvas manteniendo aspect ratio nítido
  const [canvasDimensions, setCanvasDimensions] = useState<{ width: number; height: number }>({
    width: 800,
    height: 600,
  });

  // Cargar nuevo reto
  const loadNewChallenge = useCallback(
    (roundNum: number, forcedType?: PrimitiveType) => {
      const type = forcedType || (selectedPrimitiveType === 'RANDOM' ? undefined : selectedPrimitiveType);
      const newSeed = Math.floor(Math.random() * 1000000);
      const newCh = generate3DChallenge(
        newSeed,
        type,
        canvasDimensions.width,
        canvasDimensions.height
      );
      setChallenge(newCh);
      setStrokes([]);
      setRedoStack([]);
      setEvaluation(null);
      setPeekHint(false);
      setCurrentRound(roundNum);
    },
    [canvasDimensions, selectedPrimitiveType]
  );

  // Ajustar dimensiones del canvas al contenedor
  useEffect(() => {
    const updateSize = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const w = Math.max(320, Math.floor(rect.width));
      const h = Math.max(380, Math.floor(rect.height));

      setCanvasDimensions({ width: w, height: h });
      setChallenge((prev) =>
        generate3DChallenge(prev.seed, prev.type, w, h)
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

    // 3. MODO PEEK (OJO): Muestra fantasma de las líneas objetivo si el usuario mantiene presionado el ojo
    if (peekHint && !evaluation) {
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.45)';
      ctx.lineWidth = 2.2;
      ctx.setLineDash([6, 4]);
      challenge.targetCurves.forEach((tc) => {
        if (tc.points.length < 2) return;
        ctx.beginPath();
        tc.points.forEach((pt, idx) => {
          if (idx === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        });
        ctx.stroke();
      });
      ctx.setLineDash([]);
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
    }
  }, [challenge, strokes, evaluation, showGrid, peekHint, canvasDimensions]);

  // ==========================================
  // Manejadores de Eventos del Puntero (Stylus, Touch, Mouse)
  // ==========================================
  const getCanvasCoords = (e: React.PointerEvent<HTMLCanvasElement>): Point2D => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (evaluation) return; // Ya evaluado, no permitir dibujar hasta la siguiente ronda
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    isDrawingRef.current = true;
    const pt = getCanvasCoords(e);
    currentPointsRef.current = [pt];
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    const pt = getCanvasCoords(e);
    currentPointsRef.current.push(pt);

    // Actualización visual suave durante el trazo en curso
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pts = currentPointsRef.current;
    if (pts.length >= 2) {
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(pts[pts.length - 2].x, pts[pts.length - 2].y);
      ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      ctx.stroke();
    }
  };

  const handlePointerUp = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
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

  // Evaluación y paso a siguiente ronda
  const handleSubmitOrNext = () => {
    if (!evaluation) {
      // 1. Evaluar trazos
      const result = evaluate3DSubmission(strokes, challenge.targetCurves);
      setEvaluation(result);

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
      if (practiceMode === 'rounds') {
        if (currentRound >= TOTAL_ROUNDS) {
          setIsSessionComplete(true);
        } else {
          loadNewChallenge(currentRound + 1);
        }
      } else {
        // Práctica libre infinita
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
      ref={containerRef}
      className="relative w-full h-[calc(100vh-65px)] min-h-[500px] bg-white flex flex-col overflow-hidden select-none"
    >
      {/* 1. BARRA SUPERIOR (HEADER ESTILO ARTLY) */}
      <header className="w-full px-4 py-2.5 flex items-center justify-between border-b-2 border-black bg-white z-20">
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Botón Salir / Regresar */}
          {onExit && (
            <button
              onClick={onExit}
              className="p-1.5 border-2 border-black rounded-lg hover:bg-neutral-100 shadow-[2px_2px_0px_#000000] cursor-pointer transition-transform active:translate-x-0.5 active:translate-y-0.5"
              title="Volver"
            >
              <ChevronLeft className="w-4 h-4 stroke-[2.5]" />
            </button>
          )}

          {/* Modo / Categoría Pill */}
          <button
            onClick={() => setPracticeMode((prev) => (prev === 'rounds' ? 'free' : 'rounds'))}
            className="flex items-center gap-1.5 bg-black hover:bg-neutral-800 text-white px-3 py-1 rounded-full text-xs font-mono font-bold tracking-wider uppercase shadow-[2px_2px_0px_#000000] cursor-pointer transition-colors"
            title="Clic para cambiar entre Desafío (8 Rondas) y Práctica Libre"
          >
            <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
            <span>{practiceMode === 'rounds' ? 'FORMS - GUESS 3D' : 'PRÁCTICA LIBRE 3D'}</span>
          </button>

          {/* Indicador de Ronda */}
          <div className="bg-neutral-100 border-2 border-black px-2.5 py-1 rounded-full text-xs font-mono font-bold shadow-[2px_2px_0px_#000000]">
            {practiceMode === 'rounds' ? `ROUND ${currentRound} / ${TOTAL_ROUNDS}` : `RETO #${currentRound}`}
          </div>
        </div>

        {/* Selector rápido de Primitiva o Aleatorio */}
        <div className="flex items-center gap-2">
          <select
            value={selectedPrimitiveType}
            onChange={(e) => {
              const val = e.target.value as PrimitiveType | 'RANDOM';
              setSelectedPrimitiveType(val);
              loadNewChallenge(currentRound, val === 'RANDOM' ? undefined : val);
            }}
            className="hidden sm:inline-block border-2 border-black px-2 py-1 text-xs font-mono font-bold rounded-lg bg-white shadow-[2px_2px_0px_#000000] cursor-pointer"
          >
            <option value="RANDOM">🎲 Primitiva Aleatoria</option>
            {ALL_PRIMITIVES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          <button
            onClick={() => loadNewChallenge(currentRound)}
            className="btn-ink-outline p-1.5 text-xs font-mono font-bold flex items-center gap-1 rounded-lg cursor-pointer"
            title="Generar otro ángulo o perspectiva"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Nuevo Ángulo</span>
          </button>
        </div>
      </header>

      {/* 2. TARJETA FLOTANTE CON EL MODELO 3D OBJETIVO (SUPERIOR DERECHA) */}
      <div className="absolute top-16 right-4 sm:right-6 z-20">
        <Perspective3DPreviewCard
          model={challenge.previewModel3D}
          primitiveType={challenge.type}
          title={challenge.name}
        />
      </div>

      {/* 3. BANNER DE CALIFICACIÓN Y PUNTUACIÓN TRAS EVALUAR (SUPERIOR CENTRO, COMO EN SCREENSHOT 3 & 5) */}
      {evaluation && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="bg-slate-900/95 text-white border-2 border-black rounded-2xl px-5 py-3 shadow-[4px_4px_0px_#000000] flex flex-col items-center max-w-sm sm:max-w-md text-center backdrop-blur-md">
            <div className="flex items-center gap-2.5">
              {/* Letra de Calificación */}
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center font-display font-black text-lg text-white shadow-inner ${
                  evaluation.grade === 'S'
                    ? 'bg-amber-500'
                    : evaluation.grade === 'A'
                    ? 'bg-emerald-500'
                    : evaluation.grade === 'B'
                    ? 'bg-blue-500'
                    : evaluation.grade === 'C'
                    ? 'bg-yellow-500'
                    : 'bg-red-500'
                }`}
              >
                {evaluation.grade}
              </div>

              {/* Puntaje Numérico */}
              <span className="text-xl sm:text-2xl font-mono font-extrabold tracking-tight">
                {evaluation.score.toFixed(1)} <span className="text-sm font-sans text-neutral-400">PTS</span>
              </span>
            </div>

            {/* Mensaje de retroalimentación didáctica */}
            <p className="mt-1.5 text-xs sm:text-sm font-sans text-neutral-200">
              {evaluation.feedbackMessage}
            </p>
          </div>
        </div>
      )}

      {/* 4. LIENZO PRINCIPAL INTERACTIVO */}
      <div className="relative flex-1 w-full h-full overflow-hidden flex items-center justify-center cursor-crosshair">
        <canvas
          ref={canvasRef}
          width={canvasDimensions.width}
          height={canvasDimensions.height}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="touch-none block w-full h-full"
        />
      </div>

      {/* 5. BARRA DE HERRAMIENTAS FLOTANTE INFERIOR (ESTILO ARTLY / PAPLITZ) */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30">
        <div className="bg-slate-900/95 text-white border-2 border-black rounded-full px-4 py-2 sm:px-6 sm:py-2.5 shadow-[4px_4px_0px_#000000] flex items-center gap-3 sm:gap-4 backdrop-blur-md">
          {/* Deshacer */}
          <button
            onClick={handleUndo}
            disabled={strokes.length === 0 || !!evaluation}
            className="p-1.5 text-neutral-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
            title="Deshacer trazo"
          >
            <Undo2 className="w-5 h-5 stroke-[2.2]" />
          </button>

          {/* Rehacer */}
          <button
            onClick={handleRedo}
            disabled={redoStack.length === 0 || !!evaluation}
            className="p-1.5 text-neutral-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
            title="Rehacer trazo"
          >
            <Redo2 className="w-5 h-5 stroke-[2.2]" />
          </button>

          {/* Borrar Todo */}
          <button
            onClick={handleClear}
            disabled={strokes.length === 0 || !!evaluation}
            className="p-1.5 text-neutral-300 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
            title="Limpiar lienzo"
          >
            <Trash2 className="w-5 h-5 stroke-[2.2]" />
          </button>

          <div className="w-[1px] h-6 bg-slate-700" />

          {/* Ojo (Peek): Permite echar un vistazo a la solución fantasma */}
          <button
            onMouseDown={() => setPeekHint(true)}
            onMouseUp={() => setPeekHint(false)}
            onTouchStart={() => setPeekHint(true)}
            onTouchEnd={() => setPeekHint(false)}
            className={`p-1.5 transition-colors cursor-pointer ${
              peekHint ? 'text-indigo-400' : 'text-neutral-300 hover:text-white'
            }`}
            title="Mantén presionado para ver la solución fantasma"
          >
            {peekHint ? <Eye className="w-5 h-5 stroke-[2.2]" /> : <EyeOff className="w-5 h-5 stroke-[2.2]" />}
          </button>

          {/* Rejilla 3D (Toggles 3D guidelines on/off, como Screenshot 1 vs 2) */}
          <button
            onClick={() => setShowGrid((prev) => !prev)}
            className={`p-1.5 transition-colors cursor-pointer ${
              showGrid ? 'text-blue-400' : 'text-neutral-500 hover:text-neutral-300'
            }`}
            title={showGrid ? 'Ocultar guías de perspectiva 3D' : 'Mostrar guías de perspectiva 3D'}
          >
            <Grid className="w-5 h-5 stroke-[2.2]" />
          </button>

          {/* Botón Principal: Submit (cuando se dibuja) o Next (tras evaluar) */}
          <button
            onClick={handleSubmitOrNext}
            className="ml-1 sm:ml-2 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-white font-mono font-bold text-xs sm:text-sm px-4 sm:px-5 py-2 rounded-full border border-slate-600 transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
          >
            <span>{evaluation ? 'Next' : 'Submit'}</span>
            {evaluation && <ChevronRight className="w-4 h-4 stroke-[2.5]" />}
          </button>
        </div>
      </div>

      {/* 6. MODAL DE RESUMEN FINAL TRAS COMPLETAR 8 RONDAS */}
      {isSessionComplete && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border-2 border-black rounded-2xl p-6 sm:p-8 max-w-md w-full shadow-[6px_6px_0px_#000000] text-center animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-amber-400 border-2 border-black rounded-2xl mx-auto flex items-center justify-center shadow-[3px_3px_0px_#000000] mb-4">
              <Trophy className="w-8 h-8 text-black stroke-[2.5]" />
            </div>

            <span className="text-xs font-mono font-bold uppercase tracking-widest text-neutral-500">
              Sesión 3D Completada
            </span>
            <h2 className="text-2xl sm:text-3xl font-display font-black mt-1">¡Perspectiva Dominada!</h2>

            <div className="my-6 bg-neutral-50 border-2 border-black rounded-xl p-4 shadow-[2px_2px_0px_#000000]">
              <div className="text-xs font-mono text-neutral-600 uppercase">Puntuación Media</div>
              <div className="text-4xl font-mono font-black mt-1 text-black">
                {averageScore} <span className="text-lg font-sans text-neutral-500">PTS</span>
              </div>

              {/* Récord por rondas */}
              <div className="grid grid-cols-4 gap-2 mt-4 pt-3 border-t border-neutral-300 text-xs font-mono">
                {sessionScores.map((sc, idx) => (
                  <div key={idx} className="bg-white border border-black rounded p-1">
                    <div className="text-[10px] text-neutral-500">R{idx + 1}</div>
                    <div className="font-bold">{sc.toFixed(0)}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleRestartSession}
                className="btn-ink flex-1 py-3 text-sm font-mono font-bold uppercase flex items-center justify-center gap-2 cursor-pointer shadow-[3px_3px_0px_#000000]"
              >
                <RotateCcw className="w-4 h-4" />
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
    </div>
  );
};
