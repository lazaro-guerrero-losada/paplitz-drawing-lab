import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import {
  Primitive3DChallenge,
  UserStroke3D,
  EvaluationResult3D,
  Vector3D,
} from '../../lib/perspective3d/types';
import {
  project3DTo2D,
} from '../../lib/perspective3d/math3d';
import {
  unprojectUserStrokesTo3D,
  getOriginalCameraOrbitAngles,
  createOrbitViewProj,
} from '../../lib/perspective3d/reconstruct3d';
import {
  Play,
  Pause,
  ZoomIn,
  ZoomOut,
  ArrowLeft,
  Compass,
  Box,
} from 'lucide-react';

interface Lab3DRotationViewerProps {
  challenge: Primitive3DChallenge;
  strokes: UserStroke3D[];
  evaluation: EvaluationResult3D | null;
  onBackToDraw: () => void;
  width?: number;
  height?: number;
}

export const Lab3DRotationViewer: React.FC<Lab3DRotationViewerProps> = ({
  challenge,
  strokes,
  evaluation,
  onBackToDraw,
  width: initialWidth = 800,
  height: initialHeight = 600,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Dimensiones reactivas
  const [viewportSize, setViewportSize] = useState<{ width: number; height: number }>({
    width: initialWidth,
    height: initialHeight,
  });

  // Reconstrucción 3D de los trazos del usuario
  const reconstructedStrokes = useMemo(() => {
    return unprojectUserStrokesTo3D(
      strokes,
      challenge.camera,
      viewportSize.width,
      viewportSize.height,
      challenge.targetCurves,
      challenge.anchorCurves
    );
  }, [strokes, challenge, viewportSize.width, viewportSize.height]);

  // Ángulos y distancia originales de la cámara del reto
  const originalOrbit = useMemo(() => {
    return getOriginalCameraOrbitAngles(challenge.camera);
  }, [challenge.camera]);

  // Estado de rotación orbital
  const [azimuth, setAzimuth] = useState<number>(originalOrbit.azimuthRad);
  const [elevation, setElevation] = useState<number>(originalOrbit.elevationRad);
  const [distance, setDistance] = useState<number>(originalOrbit.distance);
  const [target, setTarget] = useState<Vector3D>({ ...originalOrbit.target });

  // Controles de visualización y animación
  const [isAutoRotating, setIsAutoRotating] = useState<boolean>(false);
  const [showUserStrokes, setShowUserStrokes] = useState<boolean>(true);
  const [showAnchorCurves, setShowAnchorCurves] = useState<boolean>(true);
  const [showGhostSolution, setShowGhostSolution] = useState<boolean>(true);
  const [showGroundGrid, setShowGroundGrid] = useState<boolean>(true);
  const [showAxes, setShowAxes] = useState<boolean>(true);

  // Referencias para interacciones de arrastre
  const isDraggingRef = useRef<boolean>(false);
  const dragModeRef = useRef<'orbit' | 'pan'>('orbit');
  const lastPointerPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // ResizeObserver para adaptar el canvas al contenedor
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setViewportSize({
            width: Math.floor(width),
            height: Math.floor(height),
          });
        }
      }
    });

    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Bucle de auto-rotación (Turntable)
  useEffect(() => {
    if (!isAutoRotating) return;

    let animId: number;
    const tick = () => {
      if (!isDraggingRef.current) {
        setAzimuth((prev) => (prev + 0.007) % (Math.PI * 2));
      }
      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [isAutoRotating]);

  // Presets de Cámara
  const handleSnapOriginal = useCallback(() => {
    setAzimuth(originalOrbit.azimuthRad);
    setElevation(originalOrbit.elevationRad);
    setDistance(originalOrbit.distance);
    setTarget({ ...originalOrbit.target });
  }, [originalOrbit]);

  const handleSnapIsometric = useCallback(() => {
    setAzimuth(Math.PI / 4);
    setElevation(0.55); // ~31 grados
    setDistance(originalOrbit.distance);
    setTarget({ ...originalOrbit.target });
  }, [originalOrbit]);

  const handleSnapTop = useCallback(() => {
    setAzimuth(0);
    setElevation(1.42); // ~81 grados cenital
    setDistance(originalOrbit.distance * 1.1);
    setTarget({ ...originalOrbit.target });
  }, [originalOrbit]);

  const handleSnapFront = useCallback(() => {
    setAzimuth(0);
    setElevation(0.05);
    setDistance(originalOrbit.distance);
    setTarget({ ...originalOrbit.target });
  }, [originalOrbit]);

  const handleSnapSide = useCallback(() => {
    setAzimuth(Math.PI / 2);
    setElevation(0.05);
    setDistance(originalOrbit.distance);
    setTarget({ ...originalOrbit.target });
  }, [originalOrbit]);

  const handleZoom = useCallback((factor: number) => {
    setDistance((prev) => Math.max(0.5, Math.min(25, prev * factor)));
  }, []);

  // Atajos de teclado
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onBackToDraw();
      } else if (e.code === 'Space') {
        e.preventDefault();
        setIsAutoRotating((prev) => !prev);
      } else if (e.key.toLowerCase() === 'o' || e.key === '1') {
        handleSnapOriginal();
      } else if (e.key.toLowerCase() === 'i' || e.key === '2') {
        handleSnapIsometric();
      } else if (e.key.toLowerCase() === 't' || e.key === '3') {
        handleSnapTop();
      } else if (e.key.toLowerCase() === 'f' || e.key === '4') {
        handleSnapFront();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    onBackToDraw,
    handleSnapOriginal,
    handleSnapIsometric,
    handleSnapTop,
    handleSnapFront,
  ]);

  // Gestores de Pointer / Touch
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    isDraggingRef.current = true;
    lastPointerPosRef.current = { x: e.clientX, y: e.clientY };

    // Botón secundario o shift = Pan, botón principal = Orbit
    dragModeRef.current = e.button === 2 || e.shiftKey ? 'pan' : 'orbit';
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDraggingRef.current) return;

    const dx = e.clientX - lastPointerPosRef.current.x;
    const dy = e.clientY - lastPointerPosRef.current.y;
    lastPointerPosRef.current = { x: e.clientX, y: e.clientY };

    if (dragModeRef.current === 'pan') {
      // Desplazamiento del centro en el plano de la cámara
      const panSpeed = distance * 0.0015;
      const cosAz = Math.cos(azimuth);
      const sinAz = Math.sin(azimuth);
      // Vector derecha
      const rightX = cosAz;
      const rightZ = -sinAz;
      // Actualizar target
      setTarget((prev) => ({
        x: prev.x - dx * rightX * panSpeed,
        y: prev.y + dy * panSpeed,
        z: prev.z - dx * rightZ * panSpeed,
      }));
    } else {
      // Rotación orbital 360°
      const rotSpeed = 0.007;
      setAzimuth((prev) => prev - dx * rotSpeed);
      setElevation((prev) => Math.max(-1.42, Math.min(1.42, prev + dy * rotSpeed)));
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    isDraggingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignorar si el puntero ya no está capturado
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 1.08 : 0.92;
    handleZoom(zoomFactor);
  };

  // Renderizado principal en Canvas con soporte Hi-DPI
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = viewportSize;
    if (width <= 0 || height <= 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // Fondo técnico Paplitz
    ctx.fillStyle = '#f8fafc'; // Slate-50
    ctx.fillRect(0, 0, width, height);

    // Matriz de Vista-Proyección orbital
    const aspect = width / height;
    const { viewProj } = createOrbitViewProj(
      azimuth,
      elevation,
      distance,
      target,
      challenge.camera.fov,
      aspect,
      challenge.camera.shiftY || 0
    );

    // Función auxiliar para dibujar polilíneas 3D en pantalla
    const drawPolyline3D = (
      points3D: Vector3D[],
      strokeStyle: string,
      lineWidth: number,
      dash: number[] = [],
      cap: CanvasLineCap = 'round'
    ) => {
      if (points3D.length < 2) return;
      ctx.save();
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = lineWidth;
      ctx.setLineDash(dash);
      ctx.lineCap = cap;
      ctx.lineJoin = 'round';

      let inPath = false;
      for (let i = 0; i < points3D.length; i++) {
        const proj = project3DTo2D(points3D[i], viewProj, width, height);
        if (proj.isBehindCamera) {
          if (inPath) {
            ctx.stroke();
            inPath = false;
          }
          continue;
        }

        if (!inPath) {
          ctx.beginPath();
          ctx.moveTo(proj.point2D.x, proj.point2D.y);
          inPath = true;
        } else {
          ctx.lineTo(proj.point2D.x, proj.point2D.y);
        }
      }
      if (inPath) {
        ctx.stroke();
      }
      ctx.restore();
    };

    // 1. REJILLA DE SUELO 3D (Ground Plane Grid)
    if (showGroundGrid) {
      const gridSize = 3.0;
      const gridStep = 0.5;
      const floorY = -1.0;

      ctx.save();
      ctx.strokeStyle = 'rgba(203, 213, 225, 0.6)'; // Slate-300 suave
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);

      for (let x = -gridSize; x <= gridSize + 0.001; x += gridStep) {
        const p1: Vector3D = { x, y: floorY, z: -gridSize };
        const p2: Vector3D = { x, y: floorY, z: gridSize };
        drawPolyline3D([p1, p2], 'rgba(203, 213, 225, 0.65)', 1, [2, 4]);
      }
      for (let z = -gridSize; z <= gridSize + 0.001; z += gridStep) {
        const p1: Vector3D = { x: -gridSize, y: floorY, z };
        const p2: Vector3D = { x: gridSize, y: floorY, z };
        drawPolyline3D([p1, p2], 'rgba(203, 213, 225, 0.65)', 1, [2, 4]);
      }
      ctx.restore();
    }

    // 2. EJES 3D XYZ EN EL ORIGEN (Rojo = X, Verde = Y, Azul = Z)
    if (showAxes) {
      const axisLen = 0.7;
      const origin: Vector3D = { x: 0, y: 0, z: 0 };
      drawPolyline3D([origin, { x: axisLen, y: 0, z: 0 }], '#ef4444', 2.2); // X rojo
      drawPolyline3D([origin, { x: 0, y: axisLen, z: 0 }], '#22c55e', 2.2); // Y verde
      drawPolyline3D([origin, { x: 0, y: 0, z: axisLen }], '#3b82f6', 2.2); // Z azul

      // Etiquetas pequeñas en las puntas de los ejes
      const projX = project3DTo2D({ x: axisLen + 0.08, y: 0, z: 0 }, viewProj, width, height);
      const projY = project3DTo2D({ x: 0, y: axisLen + 0.08, z: 0 }, viewProj, width, height);
      const projZ = project3DTo2D({ x: 0, y: 0, z: axisLen + 0.08 }, viewProj, width, height);

      ctx.save();
      ctx.font = 'bold 10px monospace';
      if (!projX.isBehindCamera) {
        ctx.fillStyle = '#ef4444';
        ctx.fillText('X', projX.point2D.x, projX.point2D.y);
      }
      if (!projY.isBehindCamera) {
        ctx.fillStyle = '#22c55e';
        ctx.fillText('Y', projY.point2D.x, projY.point2D.y);
      }
      if (!projZ.isBehindCamera) {
        ctx.fillStyle = '#3b82f6';
        ctx.fillText('Z', projZ.point2D.x, projZ.point2D.y);
      }
      ctx.restore();
    }

    // 3. SOLUCIÓN IDEAL / MODELO 3D GHOST (Blueprint / Slate tenue)
    if (showGhostSolution) {
      const model = challenge.previewModel3D;

      // Aristas de malla
      if (model?.vertices && model?.edges) {
        model.edges.forEach(([i1, i2]) => {
          const v1 = model.vertices[i1];
          const v2 = model.vertices[i2];
          drawPolyline3D([v1, v2], 'rgba(59, 130, 246, 0.45)', 1.4, [4, 3]);
        });
      }

      // Anillos y contornos curvos
      if (model?.rings) {
        model.rings.forEach((ring) => {
          drawPolyline3D(ring, 'rgba(59, 130, 246, 0.55)', 1.5, [4, 3]);
        });
      }

      // Generatrices tangenciales
      if (model?.tangentRings) {
        model.tangentRings.forEach((ring) => {
          drawPolyline3D(ring, 'rgba(148, 163, 184, 0.6)', 1.2, [6, 4]);
        });
      }

      // Curvas objetivo del reto con sus puntos 3D nativos
      challenge.targetCurves.forEach((curve) => {
        if (curve.points3D && curve.points3D.length >= 2) {
          drawPolyline3D(curve.points3D, 'rgba(37, 99, 235, 0.75)', 1.8, [6, 3]);
        }
      });
    }

    // 4. ARISTAS Y CURVAS BASE DADAS (Anchor Curves 3D)
    if (showAnchorCurves) {
      challenge.anchorCurves.forEach((curve) => {
        if (curve.points3D && curve.points3D.length >= 2) {
          // Si el estilo es dashed o faint se respeta, si no sólido negro
          const isFaint = curve.style === 'faint';
          const strokeColor = isFaint ? '#64748b' : '#0f172a';
          const lineWidth = isFaint ? 1.4 : 2.4;
          const dash = curve.style === 'dashed' ? [6, 4] : [];
          drawPolyline3D(curve.points3D, strokeColor, lineWidth, dash);
        }
      });
    }

    // 5. TRAZOS 3D DIBUJADOS POR EL USUARIO (Hand-drawn 3D Strokes)
    if (showUserStrokes && reconstructedStrokes.length > 0) {
      reconstructedStrokes.forEach((stroke) => {
        if (stroke.points3D.length < 2) return;

        // Tinta de forma vs trazo de construcción
        if (stroke.isConstruction) {
          drawPolyline3D(stroke.points3D, '#94a3b8', 1.4, [5, 4]);
        } else {
          // Si hay evaluación disponible, dar sutil distinción de calidad
          const strokeColor = '#0f172a'; // Tinta oscura principal
          drawPolyline3D(stroke.points3D, strokeColor, 2.6);

          // Puntos inicial y final de cada trazo para dar toque de dibujo a mano
          const firstProj = project3DTo2D(stroke.points3D[0], viewProj, width, height);
          const lastProj = project3DTo2D(
            stroke.points3D[stroke.points3D.length - 1],
            viewProj,
            width,
            height
          );

          ctx.save();
          ctx.fillStyle = '#0f172a';
          if (!firstProj.isBehindCamera) {
            ctx.beginPath();
            ctx.arc(firstProj.point2D.x, firstProj.point2D.y, 2.0, 0, Math.PI * 2);
            ctx.fill();
          }
          if (!lastProj.isBehindCamera) {
            ctx.beginPath();
            ctx.arc(lastProj.point2D.x, lastProj.point2D.y, 2.0, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }
      });
    }

    // Marca de agua / Brújula 3D discreta en esquina inferior derecha
    ctx.save();
    ctx.font = 'bold 9px monospace';
    ctx.fillStyle = '#64748b';
    const azDeg = Math.round(((azimuth * 180) / Math.PI) % 360);
    const elDeg = Math.round((elevation * 180) / Math.PI);
    ctx.fillText(`AZ: ${azDeg}° · EL: ${elDeg}° · DIST: ${distance.toFixed(1)}m`, 14, height - 14);
    ctx.restore();

    ctx.restore();
  }, [
    viewportSize,
    azimuth,
    elevation,
    distance,
    target,
    challenge,
    showGroundGrid,
    showAxes,
    showGhostSolution,
    showAnchorCurves,
    showUserStrokes,
    reconstructedStrokes,
  ]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full select-none overflow-hidden bg-slate-50 flex flex-col"
    >
      {/* 1. BARRA SUPERIOR: INFORMACIÓN, MODALIDAD Y BOTÓN VOLVER A DIBUJAR */}
      <div className="absolute top-3 left-4 right-4 z-20 flex items-center justify-between pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-2">
          {/* Botón Salir / Volver a Dibujar */}
          <button
            onClick={onBackToDraw}
            className="btn-ink px-3 py-1.5 text-xs font-mono font-bold uppercase flex items-center gap-1.5 shadow-[2px_2px_0px_#000000] cursor-pointer"
            title="Volver al lienzo de dibujo 2D (Esc)"
          >
            <ArrowLeft className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Dibujar</span>
          </button>

          {/* Badge Neobrutalista del Modo Giro 3D */}
          <div className="bg-white border-2 border-black px-2.5 py-1 text-xs font-mono font-bold shadow-[2px_2px_0px_#000000] flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="uppercase text-[11px] tracking-wide">
              Visor 3D: {challenge.name}
            </span>
            <span className="hidden sm:inline text-neutral-400 font-normal">|</span>
            <span className="hidden sm:inline text-neutral-600 text-[10px]">
              {reconstructedStrokes.length} trazos 3D
            </span>
          </div>
        </div>

        {/* Indicador de Nota / Estado si existe evaluación */}
        {evaluation && (
          <div className="pointer-events-auto bg-white border-2 border-black px-2.5 py-1 shadow-[2px_2px_0px_#000000] font-mono flex items-center gap-2">
            <span className="text-[10px] uppercase font-bold text-neutral-500">Nota:</span>
            <span className="text-sm font-black">{Math.round(evaluation.score)}%</span>
            <span
              className={`text-[9px] font-bold uppercase px-1 py-0.5 border border-black ${
                evaluation.passed ? 'bg-black text-white' : 'bg-neutral-200 text-black'
              }`}
            >
              {evaluation.passed ? 'Aprobado' : 'Reintentar'}
            </span>
          </div>
        )}
      </div>

      {/* 2. LIENZO CANVAS INTERACTIVO 360° */}
      <div className="relative flex-1 w-full h-full cursor-grab active:cursor-grabbing">
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onWheel={handleWheel}
          onContextMenu={(e) => e.preventDefault()}
          className="block w-full h-full touch-none"
        />

        {/* Tooltip de ayuda gestual en el centro inferior cuando no se arrastra */}
        <div className="absolute top-16 left-1/2 -translate-x-1/2 pointer-events-none z-10 opacity-70 hidden sm:block">
          <span className="bg-white/90 border border-black px-2 py-0.5 text-[10px] font-mono font-bold uppercase shadow-[1px_1px_0px_#000000]">
            Arrastra para orbitar 360° · Rueda / Pellizco para zoom · Shift+Arrastrar para mover
          </span>
        </div>
      </div>

      {/* 3. BARRA FLOTANTE DE PRESETS DE CÁMARA (Lado Izquierdo o Superior) */}
      <div className="absolute top-16 left-4 z-20 flex flex-col gap-1.5 pointer-events-auto">
        <button
          onClick={handleSnapOriginal}
          className="bg-white hover:bg-neutral-100 border-2 border-black px-2 py-1 text-[10px] font-mono font-bold uppercase shadow-[2px_2px_0px_#000000] flex items-center gap-1.5 transition-colors cursor-pointer text-left"
          title="Regresar a la perspectiva original del reto (O / 1)"
        >
          <Compass className="w-3.5 h-3.5 stroke-[2.2]" />
          <span>Vista Original</span>
        </button>

        <button
          onClick={handleSnapIsometric}
          className="bg-white hover:bg-neutral-100 border-2 border-black px-2 py-1 text-[10px] font-mono font-bold uppercase shadow-[2px_2px_0px_#000000] flex items-center gap-1.5 transition-colors cursor-pointer text-left"
          title="Vista isométrica estándar (I / 2)"
        >
          <Box className="w-3.5 h-3.5 stroke-[2.2]" />
          <span>Isométrica</span>
        </button>

        <button
          onClick={handleSnapTop}
          className="bg-white hover:bg-neutral-100 border-2 border-black px-2 py-1 text-[10px] font-mono font-bold uppercase shadow-[2px_2px_0px_#000000] flex items-center gap-1.5 transition-colors cursor-pointer text-left"
          title="Vista superior cenital (T / 3)"
        >
          <span>🔝 Cenital</span>
        </button>

        <button
          onClick={handleSnapFront}
          className="bg-white hover:bg-neutral-100 border-2 border-black px-2 py-1 text-[10px] font-mono font-bold uppercase shadow-[2px_2px_0px_#000000] flex items-center gap-1.5 transition-colors cursor-pointer text-left"
          title="Vista frontal alzada (F / 4)"
        >
          <span>👁️ Frontal</span>
        </button>

        <button
          onClick={handleSnapSide}
          className="bg-white hover:bg-neutral-100 border-2 border-black px-2 py-1 text-[10px] font-mono font-bold uppercase shadow-[2px_2px_0px_#000000] flex items-center gap-1.5 transition-colors cursor-pointer text-left"
          title="Vista lateral perfil"
        >
          <span>➡️ Lateral</span>
        </button>
      </div>

      {/* 4. BARRA DE HERRAMIENTAS INFERIOR: AUTO-ROTACIÓN, CAPAS Y ZOOM */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30">
        <div className="bg-white border-2 border-black p-1.5 sm:p-2 shadow-[4px_4px_0px_#000000] flex items-center gap-1.5 sm:gap-2">
          {/* Botón Auto-Giro Turntable */}
          <button
            onClick={() => setIsAutoRotating((prev) => !prev)}
            className={`px-2.5 py-1.5 text-xs font-mono font-bold border-2 border-black transition-all cursor-pointer shadow-[1px_1px_0px_#000000] flex items-center gap-1.5 ${
              isAutoRotating ? 'bg-black text-white' : 'bg-white hover:bg-neutral-100 text-black'
            }`}
            title="Auto-rotación 360° constante (Espacio)"
          >
            {isAutoRotating ? (
              <Pause className="w-3.5 h-3.5 fill-current" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current" />
            )}
            <span className="text-[10px] uppercase tracking-wider font-mono">
              {isAutoRotating ? 'Pausar' : 'Girar 360°'}
            </span>
          </button>

          <div className="w-[2px] h-6 bg-black mx-0.5" />

          {/* Toggle: Trazos 3D del usuario */}
          <button
            onClick={() => setShowUserStrokes((prev) => !prev)}
            className={`p-2 text-xs font-mono font-bold border-2 border-black transition-all cursor-pointer shadow-[1px_1px_0px_#000000] flex items-center gap-1 ${
              showUserStrokes ? 'bg-black text-white' : 'bg-neutral-100 text-neutral-400 border-neutral-300'
            }`}
            title="Alternar visibilidad de mis trazos dibujados en 3D"
          >
            <span className="text-[10px] uppercase font-mono">✏️ Mis Trazos</span>
          </button>

          {/* Toggle: Curvas Base Dadas */}
          <button
            onClick={() => setShowAnchorCurves((prev) => !prev)}
            className={`p-2 text-xs font-mono font-bold border-2 border-black transition-all cursor-pointer shadow-[1px_1px_0px_#000000] flex items-center gap-1 ${
              showAnchorCurves ? 'bg-black text-white' : 'bg-neutral-100 text-neutral-400 border-neutral-300'
            }`}
            title="Alternar visibilidad de las aristas base dadas"
          >
            <span className="text-[10px] uppercase font-mono">⚓ Base</span>
          </button>

          {/* Toggle: Solución Ideal 3D (Ghost Wireframe) */}
          <button
            onClick={() => setShowGhostSolution((prev) => !prev)}
            className={`p-2 text-xs font-mono font-bold border-2 border-black transition-all cursor-pointer shadow-[1px_1px_0px_#000000] flex items-center gap-1 ${
              showGhostSolution ? 'bg-black text-white' : 'bg-neutral-100 text-neutral-400 border-neutral-300'
            }`}
            title="Alternar visibilidad del modelo 3D ideal (Ghost blueprint)"
          >
            <span className="text-[10px] uppercase font-mono">👻 Solución 3D</span>
          </button>

          {/* Toggle: Suelo 3D */}
          <button
            onClick={() => setShowGroundGrid((prev) => !prev)}
            className={`p-2 text-xs font-mono font-bold border-2 border-black transition-all cursor-pointer shadow-[1px_1px_0px_#000000] flex items-center gap-1 ${
              showGroundGrid ? 'bg-black text-white' : 'bg-neutral-100 text-neutral-400 border-neutral-300'
            }`}
            title="Alternar rejilla de suelo 3D"
          >
            <span className="text-[10px] uppercase font-mono">🏁 Suelo</span>
          </button>

          {/* Toggle: Ejes XYZ */}
          <button
            onClick={() => setShowAxes((prev) => !prev)}
            className={`p-2 text-xs font-mono font-bold border-2 border-black transition-all cursor-pointer shadow-[1px_1px_0px_#000000] flex items-center gap-1 ${
              showAxes ? 'bg-black text-white' : 'bg-neutral-100 text-neutral-400 border-neutral-300'
            }`}
            title="Alternar visibilidad de los ejes XYZ"
          >
            <span className="text-[10px] uppercase font-mono">🧭 Ejes</span>
          </button>

          <div className="w-[2px] h-6 bg-black mx-0.5" />

          {/* Zoom Menos */}
          <button
            onClick={() => handleZoom(1.15)}
            className="btn-ink-outline p-2 text-xs shadow-[1px_1px_0px_#000000] cursor-pointer"
            title="Alejar cámara"
          >
            <ZoomOut className="w-3.5 h-3.5 stroke-[2.2]" />
          </button>

          {/* Zoom Más */}
          <button
            onClick={() => handleZoom(0.85)}
            className="btn-ink-outline p-2 text-xs shadow-[1px_1px_0px_#000000] cursor-pointer"
            title="Acercar cámara"
          >
            <ZoomIn className="w-3.5 h-3.5 stroke-[2.2]" />
          </button>
        </div>
      </div>
    </div>
  );
};
