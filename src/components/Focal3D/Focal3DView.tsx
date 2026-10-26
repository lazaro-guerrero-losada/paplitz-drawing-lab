import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Point2D,
  UserStroke3D,
  Vector3D,
} from '../../lib/perspective3d/types';
import {
  Focal3DShapeType,
  FocalPracticeMode,
  FocalAidMode,
  FocalVisionMode,
  Focal3DChallenge,
  FocalEvaluationResult,
  FocalWheelDensity,
} from '../../lib/focal3d/types';
import { generateFocal3DChallenge } from '../../lib/focal3d/generator';
import { evaluateFocal3DSubmission } from '../../lib/focal3d/evaluator';
import { FocalSelectorPanel } from './FocalSelectorPanel';
import { Perspective3DPreviewCard } from '../Lab3D/Perspective3DPreviewCard';
import {
  getFocal3DWireframeModel,
  unprojectFocalStrokesTo3D,
} from '../../lib/focal3d/focal3dModels';
import {
  v3,
  vRotateX,
  vRotateY,
} from '../../lib/perspective3d/math3d';
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
  Trophy,
  X,
  Copy,
  Download,
  FileText,
  Check,
  Box,
} from 'lucide-react';
import { SessionRecordItem } from '../../lib/sessionRecorder';
import {
  buildFocalDebugReport,
  downloadReportFocalJson,
  copyReportFocalToClipboard,
} from '../../lib/focal3d/debugReportFocal';

interface Focal3DViewProps {
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

export const Focal3DView: React.FC<Focal3DViewProps> = ({
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
  // Configuración de la sesión (8 rondas por defecto)
  const TOTAL_ROUNDS = 8;
  const [currentRound, setCurrentRound] = useState<number>(1);
  const [sessionScores, setSessionScores] = useState<number[]>([]);
  const [isSessionComplete, setIsSessionComplete] = useState<boolean>(false);

  // Modo de práctica: 'horizon' (1-2 figuras grandes con línea focal horizontal), 'full_wheel' o 'single'
  const [practiceMode, setPracticeMode] = useState<FocalPracticeMode>('horizon');
  // Densidad y adaptación a pantalla: 'auto' (2-4 en tablet, 8 en desktop), 'wheel8', 'wheel4', 'wheel2'
  const [density, setDensity] = useState<FocalWheelDensity>('auto');
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
    generateFocal3DChallenge(Date.now(), 'horizon', 'CUBE', 960, 600, 0, 'auto')
  );

  // Trazos y evaluación
  const [strokes, setStrokes] = useState<UserStroke3D[]>([]);
  const [redoStack, setRedoStack] = useState<UserStroke3D[]>([]);
  const [evaluation, setEvaluation] = useState<FocalEvaluationResult | null>(null);

  // Reporte técnico y feedback de depuración
  const [showReportModal, setShowReportModal] = useState<boolean>(false);
  const [userNote, setUserNote] = useState<string>('');
  const [copiedReport, setCopiedReport] = useState<boolean>(false);
  const [downloadedReport, setDownloadedReport] = useState<boolean>(false);
  const currentRecordIdRef = useRef<string | null>(null);

  // Generación memoizada del reporte de depuración Focal 3D
  const currentReport = React.useMemo(() => {
    return buildFocalDebugReport(challenge, strokes, evaluation, userNote);
  }, [challenge, strokes, evaluation, userNote]);

  // Referencias interactivas
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef<boolean>(false);
  const currentPointsRef = useRef<Point2D[]>([]);
  const activePointerIdRef = useRef<number | null>(null);
  const [currentLiveStroke, setCurrentLiveStroke] = useState<Point2D[]>([]);

  // Modo Visor 3D orbital interactivo (Giro 3D directo tras evaluar o con el botón "Ver en 3D")
  const [is3DViewActive, setIs3DViewActive] = useState<boolean>(false);
  const [rotX, setRotX] = useState<number>(0.35);
  const [rotY, setRotY] = useState<number>(-0.45);
  const [zoom3D, setZoom3D] = useState<number>(1.0);
  const isOrbitingRef = useRef<boolean>(false);
  const lastOrbitPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Modelo alámbrico 3D de la forma para el visor orbital y la tarjeta de previsualización
  const previewModel3D = React.useMemo(() => {
    const shapeType = challenge.shapes[0]?.type || challenge.shapeType;
    return getFocal3DWireframeModel(shapeType, challenge.shapes[0]);
  }, [challenge]);

  // Trazos del usuario elevados a coordenadas 3D para rotación orbital
  const unprojectedStrokes = React.useMemo(() => {
    return unprojectFocalStrokesTo3D(strokes, challenge, challenge.shapes[0]);
  }, [strokes, challenge]);

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
    (
      roundNum: number,
      modeOverride?: FocalPracticeMode,
      typeOverride?: Focal3DShapeType,
      densityOverride?: FocalWheelDensity
    ) => {
      const mode = modeOverride || practiceMode;
      const type = typeOverride || selectedShapeType;
      const den = densityOverride || density;
      const sectorIdx = (roundNum - 1) % 8;
      const seed = Math.floor(Math.random() * 1000000);
      const newCh = generateFocal3DChallenge(
        seed,
        mode,
        type,
        canvasDimensions.width,
        canvasDimensions.height,
        sectorIdx,
        den
      );
      setChallenge(newCh);
      setStrokes([]);
      setRedoStack([]);
      setEvaluation(null);
      setCurrentLiveStroke([]);
      setVisionMode('all');
      setIs3DViewActive(false);
      setRotX(0.35);
      setRotY(-0.45);
      setZoom3D(1.0);
      setCurrentRound(roundNum);
      setUserNote('');
      setShowReportModal(false);
      setCopiedReport(false);
      setDownloadedReport(false);
      currentRecordIdRef.current = null;
    },
    [practiceMode, selectedShapeType, density, canvasDimensions]
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
        const rep = buildFocalDebugReport(challenge, strokes, result, userNote);
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
          userComment: userNote.trim(),
          metricsSummary: `${Math.round(result.score)}% · ${result.passed ? 'Aprobado ✓' : 'No Superado'} · 1 Punto Focal`,
          reportMarkdown: rep.markdownText,
          reportJsonString: rep.jsonString,
        };
        currentRecordIdRef.current = newRecord.id;
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

    if (is3DViewActive) {
      // ==========================================
      // VISOR 3D ORBITAL INTERACTIVO
      // ==========================================
      const { width, height } = canvasDimensions;
      const cx = width / 2;
      const cy = height / 2;
      const baseScale = Math.min(width, height) * 0.28 * zoom3D;

      const project3D = (v: Vector3D) => {
        let r = vRotateY(v, rotY);
        r = vRotateX(r, rotX);
        return {
          x: cx + r.x * baseScale,
          y: cy - r.y * baseScale, // Invertir Y para orientación estándar 3D
          z: r.z,
        };
      };

      // 1. Rejilla técnica 3D de suelo (Ground plane grid)
      ctx.save();
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1.0;
      const gridExtent = 1.8;
      const gridSteps = 6;
      const groundY = -1.2;
      for (let i = -gridSteps; i <= gridSteps; i++) {
        const val = (i / gridSteps) * gridExtent;
        // Líneas paralelas a Z
        const p1 = project3D(v3(val, groundY, -gridExtent));
        const p2 = project3D(v3(val, groundY, gridExtent));
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

        // Líneas paralelas a X
        const p3 = project3D(v3(-gridExtent, groundY, val));
        const p4 = project3D(v3(gridExtent, groundY, val));
        ctx.beginPath();
        ctx.moveTo(p3.x, p3.y);
        ctx.lineTo(p4.x, p4.y);
        ctx.stroke();
      }
      ctx.restore();

      // 2. Modelo Alámbrico 3D (Solución Técnica)
      const shouldDrawSolution3D = visionMode === 'all' || visionMode === 'solution';
      if (shouldDrawSolution3D && previewModel3D) {
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Aristas rectas
        if (previewModel3D.vertices && previewModel3D.edges) {
          previewModel3D.edges.forEach(([i1, i2]) => {
            const p1 = project3D(previewModel3D.vertices[i1]);
            const p2 = project3D(previewModel3D.vertices[i2]);
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = '#09090b';
            ctx.lineWidth = 2.4;
            ctx.setLineDash([6, 4]); // Solución técnica punteada
            ctx.stroke();
          });

          // Marcadores de vértices clave (estilo técnico Lab 3D)
          previewModel3D.vertices.forEach((v) => {
            const p = project3D(v);
            ctx.beginPath();
            ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 1.8;
            ctx.setLineDash([]);
            ctx.stroke();
          });
        }

        // Anillos y aristas curvas (ej. cilindros)
        if (previewModel3D.rings) {
          previewModel3D.rings.forEach((ring, rIdx) => {
            if (ring.length < 2) return;
            ctx.beginPath();
            ring.forEach((pt, idx) => {
              const p = project3D(pt);
              if (idx === 0) ctx.moveTo(p.x, p.y);
              else ctx.lineTo(p.x, p.y);
            });
            ctx.strokeStyle = rIdx === 0 ? '#0f172a' : '#475569';
            ctx.lineWidth = rIdx === 0 ? 2.2 : 1.6;
            ctx.setLineDash([5, 4]);
            ctx.stroke();
          });
        }

        // Aristas tangenciales (cilindro)
        if (previewModel3D.tangentRings) {
          previewModel3D.tangentRings.forEach((ring) => {
            if (ring.length < 2) return;
            ctx.beginPath();
            ring.forEach((pt, idx) => {
              const p = project3D(pt);
              if (idx === 0) ctx.moveTo(p.x, p.y);
              else ctx.lineTo(p.x, p.y);
            });
            ctx.strokeStyle = '#94a3b8';
            ctx.lineWidth = 1.6;
            ctx.setLineDash([12, 4, 2, 4]);
            ctx.stroke();
          });
        }
        ctx.restore();
      }

      // 3. Trazos del Usuario en 3D
      const shouldDrawUserStrokes3D = visionMode === 'all' || visionMode === 'drawing';
      if (shouldDrawUserStrokes3D && unprojectedStrokes.length > 0) {
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        unprojectedStrokes.forEach((s) => {
          if (!s.points3D || s.points3D.length < 2) return;
          ctx.beginPath();
          s.points3D.forEach((pt, idx) => {
            const p = project3D(pt);
            if (idx === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
          });

          if (s.isConstruction) {
            ctx.strokeStyle = '#94a3b8'; // Trazo de construcción en gris punteado
            ctx.lineWidth = 1.4;
            ctx.setLineDash([4, 4]);
          } else {
            ctx.strokeStyle = '#0f172a'; // Tinta del usuario en negro sólido
            ctx.lineWidth = 2.6;
            ctx.setLineDash([]);
          }
          ctx.stroke();
        });
        ctx.restore();
      }

      return;
    }

    const fp = challenge.focalPoint;

    // 1. DIBUJAR LÍNEAS DISCONTINUAS Y LÍNEA FOCAL HORIZONTAL (HORIZONTE)
    if (showFocalGrid || challenge.mode === 'horizon') {
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

      // LÍNEA FOCAL HORIZONTAL (Destacada de lado a lado del lienzo)
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.6;
      ctx.setLineDash([10, 6]);
      ctx.beginPath();
      ctx.moveTo(0, fp.y);
      ctx.lineTo(canvas.width, fp.y);
      ctx.stroke();

      // Etiqueta sutil de la línea horizontal
      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'left';
      const labelY = challenge.horizonSide === 'lower' ? fp.y + 14 : fp.y - 6;
      ctx.fillText('LÍNEA FOCAL HORIZONTAL', 14, labelY);
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
    const fpLabelY = challenge.horizonSide === 'upper' ? fp.y - 12 : fp.y + 18;
    ctx.fillText('PUNTO FOCAL (1 PF)', fp.x, fpLabelY);
    ctx.restore();

    // 3. LÍNEAS Y PUNTOS DE ANCLAJE MÍNIMOS INDISPENSABLES (VISIBLES SIEMPRE, INCLUSO CON AYUDAS OFF)
    // Proporciona la mínima información para construir la forma (3 aristas en cubo, vértices en polígonos, eje+radio en cilindro)
    if (!evaluation || visionMode === 'all' || visionMode === 'solution') {
      ctx.save();
      for (const shape of challenge.shapes) {
        // Trazado de las líneas de anclaje indispensables
        if (shape.anchorCurves) {
          for (const anc of shape.anchorCurves) {
            ctx.beginPath();
            if (anc.style === 'dashed') {
              ctx.strokeStyle = '#64748b'; // Arista de profundidad / eje hacia el punto focal
              ctx.lineWidth = 1.4;
              ctx.setLineDash([5, 4]);
            } else {
              ctx.strokeStyle = '#334155'; // Arista de ancho / alto sólida
              ctx.lineWidth = 1.8;
              ctx.setLineDash([]);
            }
            anc.points.forEach((pt, idx) => {
              if (idx === 0) ctx.moveTo(pt.x, pt.y);
              else ctx.lineTo(pt.x, pt.y);
            });
            ctx.stroke();
          }
        }

        // Puntos de anclaje según el tipo de figura geométrica:
        if (shape.type === 'CUBE') {
          // EN CUBO: Puntos en los extremos de las 3 aristas concurrentes (ancho, alto y profundidad)
          if (shape.anchorVertices && shape.anchorVertices.length >= 3) {
            // Vértice origen (esquina compartida)
            const origin = shape.anchorVertices[0];
            ctx.fillStyle = '#0f172a';
            ctx.beginPath();
            ctx.arc(origin.x, origin.y, 3.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.2;
            ctx.stroke();

            // Extremos de ancho, alto y profundidad
            for (let i = 1; i < shape.anchorVertices.length; i++) {
              const pt = shape.anchorVertices[i];
              ctx.fillStyle = i === 3 ? '#64748b' : '#334155';
              ctx.beginPath();
              ctx.arc(pt.x, pt.y, 2.5, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        } else if (shape.type === 'CYLINDER') {
          // EN CILINDRO: Centro + Radio
          ctx.fillStyle = '#0f172a';
          ctx.beginPath();
          ctx.arc(shape.centerPos.x, shape.centerPos.y, 3.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.2;
          ctx.stroke();

          if (shape.radiusCurve && shape.radiusCurve.points.length > 0) {
            const rTip = shape.radiusCurve.points[shape.radiusCurve.points.length - 1];
            ctx.fillStyle = '#334155';
            ctx.beginPath();
            ctx.arc(rTip.x, rTip.y, 2.8, 0, Math.PI * 2);
            ctx.fill();

            // Etiqueta R
            ctx.fillStyle = '#475569';
            ctx.font = 'bold 9px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('R', (shape.centerPos.x + rTip.x) / 2, (shape.centerPos.y + rTip.y) / 2 - 5);
          }
        } else if (shape.type === 'TRIANGULAR_PRISM' || shape.type === 'HEXAGON_PRISM') {
          // EN POLÍGONOS (Triángulo / Hexágono):
          // En la cara frontal aparecen SOLO LOS VÉRTICES (puntos) para unir + 1 arista de profundidad
          if (shape.frontVertices) {
            shape.frontVertices.forEach((v) => {
              ctx.fillStyle = '#1e293b';
              ctx.beginPath();
              ctx.arc(v.x, v.y, 3.2, 0, Math.PI * 2);
              ctx.fill();
              ctx.strokeStyle = '#ffffff';
              ctx.lineWidth = 1.2;
              ctx.stroke();
            });
          }
          // Punto final de la arista de profundidad
          if (shape.anchorVertices && shape.anchorVertices.length > 0) {
            const lastV = shape.anchorVertices[shape.anchorVertices.length - 1];
            ctx.fillStyle = '#64748b';
            ctx.beginPath();
            ctx.arc(lastV.x, lastV.y, 2.4, 0, Math.PI * 2);
            ctx.fill();
          }
        } else if (shape.type === 'PYRAMID') {
          // EN PIRÁMIDE: Vértices de la base + ápice
          if (shape.frontVertices) {
            shape.frontVertices.forEach((v) => {
              ctx.fillStyle = '#1e293b';
              ctx.beginPath();
              ctx.arc(v.x, v.y, 3.0, 0, Math.PI * 2);
              ctx.fill();
              ctx.strokeStyle = '#ffffff';
              ctx.lineWidth = 1.2;
              ctx.stroke();
            });
          }
          if (shape.anchorVertices && shape.anchorVertices.length > 0) {
            const apex = shape.anchorVertices[shape.anchorVertices.length - 1];
            ctx.fillStyle = '#64748b';
            ctx.beginPath();
            ctx.arc(apex.x, apex.y, 2.8, 0, Math.PI * 2);
            ctx.fill();
          }
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

      if (visionMode === 'solution') {
        // En VISIÓN: SOLUCIÓN, dibuja la solución ideal completa:
        // Aristas visibles en verde esmeralda sólido, y aristas ocultas/constructivas en verde punteado
        for (const shape of challenge.shapes) {
          for (const c of shape.allCurves) {
            ctx.beginPath();
            if (c.role === 'construction' || c.style === 'dashed') {
              ctx.strokeStyle = 'rgba(16, 185, 129, 0.55)'; // Arista oculta / constructiva punteada
              ctx.lineWidth = 1.6;
              ctx.setLineDash([4, 4]);
            } else {
              ctx.strokeStyle = 'rgba(16, 185, 129, 0.85)'; // Arista visible sólida
              ctx.lineWidth = 2.4;
              ctx.setLineDash([]);
            }
            c.points.forEach((pt, i) => {
              if (i === 0) ctx.moveTo(pt.x, pt.y);
              else ctx.lineTo(pt.x, pt.y);
            });
            ctx.stroke();
          }
        }
      } else {
        // En VISIÓN: AMBOS, superpone curvas faltantes en rojo y acertadas en verde
        // Curvas faltantes (solo aristas visibles de forma) en rojo suave punteado
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

        // Curvas acertadas: sólidas si son de forma, punteadas si son líneas constructivas
        for (const m of evaluation.matchedCurves) {
          ctx.beginPath();
          if (m.role === 'construction' || m.style === 'dashed') {
            ctx.strokeStyle = 'rgba(16, 185, 129, 0.60)';
            ctx.lineWidth = 1.6;
            ctx.setLineDash([4, 4]);
          } else {
            ctx.strokeStyle = 'rgba(16, 185, 129, 0.75)';
            ctx.lineWidth = 2.4;
            ctx.setLineDash([]);
          }
          m.points.forEach((pt, i) => {
            if (i === 0) ctx.moveTo(pt.x, pt.y);
            else ctx.lineTo(pt.x, pt.y);
          });
          ctx.stroke();
        }
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
    is3DViewActive,
    rotX,
    rotY,
    zoom3D,
    previewModel3D,
    unprojectedStrokes,
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
    if (is3DViewActive) {
      e.preventDefault();
      try {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      } catch {}
      isOrbitingRef.current = true;
      lastOrbitPosRef.current = { x: e.clientX, y: e.clientY };
      return;
    }
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
    if (is3DViewActive) {
      if (!isOrbitingRef.current) return;
      e.preventDefault();
      const dx = e.clientX - lastOrbitPosRef.current.x;
      const dy = e.clientY - lastOrbitPosRef.current.y;
      lastOrbitPosRef.current = { x: e.clientX, y: e.clientY };
      setRotY((prev) => prev + dx * 0.008);
      setRotX((prev) => Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, prev + dy * 0.008)));
      return;
    }
    if (!isDrawingRef.current || (activePointerIdRef.current !== null && activePointerIdRef.current !== e.pointerId)) return;
    e.preventDefault();
    const pt = getCanvasCoords(e);
    currentPointsRef.current.push(pt);
    setCurrentLiveStroke([...currentPointsRef.current]);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (is3DViewActive) {
      isOrbitingRef.current = false;
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
      return;
    }
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

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    if (!is3DViewActive) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom3D((prev) => Math.max(0.4, Math.min(2.5, prev * delta)));
  };

  const handleDoubleClick = () => {
    if (!is3DViewActive) return;
    setRotX(0.35);
    setRotY(-0.45);
    setZoom3D(1.0);
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
      } else if (e.key.toLowerCase() === 'r' && evaluation) {
        e.preventDefault();
        setIs3DViewActive((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [evaluation, strokes, redoStack, challenge, currentRound, is3DViewActive]);

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
            loadNewChallenge(currentRound, practiceMode, type, density);
          }}
          practiceMode={practiceMode}
          onChangePracticeMode={(mode) => {
            setPracticeMode(mode);
            loadNewChallenge(currentRound, mode, selectedShapeType, density);
          }}
          density={density}
          onChangeDensity={(d) => {
            setDensity(d);
            loadNewChallenge(currentRound, practiceMode, selectedShapeType, d);
          }}
          activeShapeCount={challenge.activeShapeCount || challenge.shapes.length}
          currentRound={currentRound}
          horizonSide={challenge.horizonSide}
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

      {/* 2. TARJETA DE NOTA Y PREVIEW 3D (SUPERIOR DERECHA) */}
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

        <div className="pointer-events-auto">
          <Perspective3DPreviewCard
            model={previewModel3D}
            primitiveType={challenge.shapes[0]?.type || challenge.shapeType}
            title={challenge.shapes[0]?.title || challenge.title}
          />
        </div>
      </div>

      {/* 3. LIENZO PRINCIPAL INTERACTIVO CON DETALLES TÉCNICOS */}
      <div
        ref={canvasContainerRef}
        className={`relative flex-1 w-full h-full overflow-hidden flex items-center justify-center ${
          is3DViewActive ? 'cursor-grab active:cursor-grabbing' : evaluation ? 'cursor-default' : 'cursor-crosshair'
        }`}
      >
        {/* Banner de Giro 3D activo */}
        {is3DViewActive && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 text-[10px] font-mono font-bold uppercase bg-white border border-black px-2.5 py-1 pointer-events-none shadow-[2px_2px_0px_#000000] z-10 flex items-center gap-1.5 animate-in fade-in duration-200">
            <span className="w-1.5 h-1.5 rounded-full bg-black animate-pulse" />
            <span>Giro 3D: Arrastra para rotar 360° · Doble clic resetear · Rueda zoom</span>
          </div>
        )}

        <div className="absolute bottom-3 left-3 text-[9px] font-mono font-bold uppercase bg-white border border-black px-1.5 py-0.5 pointer-events-none shadow-[1px_1px_0px_#000000] z-10 opacity-75 hidden sm:block">
          <span>{is3DViewActive ? 'ESPACIO 3D ORBITAL · 360°' : '8 LÍNEAS FOCALES DISCONTINUAS · 1 FOCAL POINT'}</span>
        </div>

        <canvas
          ref={canvasRef}
          width={canvasDimensions.width}
          height={canvasDimensions.height}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onWheel={handleWheel}
          onDoubleClick={handleDoubleClick}
          className={`touch-none block w-full h-full select-none ${
            is3DViewActive ? 'cursor-grab active:cursor-grabbing' : evaluation ? 'cursor-default' : 'cursor-crosshair'
          }`}
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

          {/* MODO CORRECCIÓN: Visión Cíclica y Visor 3D Orbital */}
          {evaluation && (
            <>
              {/* Botón Ver en 3D / Volver a 2D */}
              <button
                type="button"
                onClick={() => setIs3DViewActive((prev) => !prev)}
                className={`px-2.5 py-1.5 text-xs font-mono font-bold border-2 border-black transition-all cursor-pointer shadow-[1px_1px_0px_#000000] flex items-center gap-1.5 ${
                  is3DViewActive ? 'bg-black text-white' : 'bg-white text-black hover:bg-neutral-100'
                }`}
                title={is3DViewActive ? 'Volver a vista 2D del reto (R)' : 'Ver tu dibujo y la figura en 3D interactivo 360° (R)'}
              >
                <Box className="w-4 h-4 stroke-[2.2]" />
                <span className="text-[10px] uppercase tracking-wider font-mono">
                  {is3DViewActive ? 'Volver 2D' : 'Ver en 3D'}
                </span>
              </button>

              <div className="w-[2px] h-6 bg-black mx-0.5" />

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

          {/* Botón Reportar Ejercicio - Visible siempre */}
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

      {/* MODAL DE REPORTE Y DIAGNÓSTICO FOCAL 3D CON NOTAS */}
      {showReportModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-fade-in font-sans">
          <div className="bg-white border-4 border-black p-4 sm:p-5 max-w-lg w-full shadow-[8px_8px_0px_#000000] flex flex-col gap-3 max-h-[92vh] overflow-y-auto">
            {/* Cabecera */}
            <div className="flex items-center justify-between border-b-2 border-black pb-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-black stroke-[2.5]" />
                <h3 className="font-display font-bold text-sm sm:text-base uppercase tracking-tight">
                  Reporte de Perspectiva 1 Punto Focal
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
                <span className="text-neutral-500">Forma:</span> <strong>{challenge.title}</strong>
              </div>
              <div>
                <span className="text-neutral-500">Semilla:</span> <strong>#{challenge.seed}</strong>
              </div>
              <div>
                <span className="text-neutral-500">Nota:</span>{' '}
                <strong>{evaluation ? `${Math.round(evaluation.score)}% (${evaluation.passed ? 'Aprobado ✓' : 'No Superado'})` : 'Calculada'}</strong>
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
                placeholder="Escribe aquí qué ocurrió (ej: 'Línea de fuga no detectada hacia el foco', 'Fallo en cara posterior', 'Buena orientación pero nota baja')..."
                className="w-full h-20 p-2 text-xs font-mono bg-white border border-black resize-none focus:outline-none focus:ring-2 focus:ring-black selection:bg-black selection:text-white"
                autoFocus
              />
              <div className="flex flex-wrap gap-1 items-center pt-0.5">
                <span className="text-[10px] font-mono text-neutral-500 font-bold mr-1">Rápido:</span>
                {['Nota injusta', 'Punto focal desalineado', 'Trazo no detectado', 'Fallo de profundidad', 'Buena sensación'].map((tag) => (
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
                    downloadReportFocalJson(currentReport.jsonString, challenge.seed, challenge.shapeType, userNote);
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
                    await copyReportFocalToClipboard(currentReport.markdownText);
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
