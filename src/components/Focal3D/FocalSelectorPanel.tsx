import React, { useState } from 'react';
import { Focal3DShapeType, FocalPracticeMode, FocalWheelDensity } from '../../lib/focal3d/types';
import {
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  Compass,
  Target,
  Box,
  Cylinder,
  Triangle,
  Pyramid as PyramidIcon,
  Hexagon,
  Sparkles,
} from 'lucide-react';

interface FocalSelectorPanelProps {
  currentType: Focal3DShapeType;
  onSelectType: (type: Focal3DShapeType) => void;
  practiceMode: FocalPracticeMode;
  onChangePracticeMode: (mode: FocalPracticeMode) => void;
  density: FocalWheelDensity;
  onChangeDensity: (density: FocalWheelDensity) => void;
  activeShapeCount: number;
  currentRound: number;
}

const SHAPE_CONFIG: Record<
  Focal3DShapeType,
  { name: string; tag: string; description: string; icon: React.FC<{ className?: string }> }
> = {
  CUBE: {
    name: 'Cubo / Prisma',
    tag: '3 Aristas',
    description: 'Mínimo indispensable: arista ancho, alto y profundidad',
    icon: Box,
  },
  CYLINDER: {
    name: 'Cilindro',
    tag: 'Eje + Radio',
    description: 'Eje central al punto focal y radio de elipse base',
    icon: Cylinder,
  },
  TRIANGULAR_PRISM: {
    name: 'Prisma Triangular',
    tag: 'Puntos + Fuga',
    description: 'Vértices frontales a unir + 1 arista de profundidad',
    icon: Triangle,
  },
  PYRAMID: {
    name: 'Pirámide',
    tag: 'Base + Ápice',
    description: 'Vértices de base cuadrangular y arista al ápice',
    icon: PyramidIcon,
  },
  HEXAGON_PRISM: {
    name: 'Prisma Hexagonal',
    tag: '6 Vértices',
    description: 'Vértices del hexágono + 1 arista de profundidad',
    icon: Hexagon,
  },
  MIXED_WHEEL: {
    name: 'Rueda Mixta',
    tag: 'Variedad',
    description: 'Cubos, cilindros, prismas y pirámides variables',
    icon: Sparkles,
  },
};

export const FocalSelectorPanel: React.FC<FocalSelectorPanelProps> = ({
  currentType,
  onSelectType,
  practiceMode,
  onChangePracticeMode,
  density,
  onChangeDensity,
  activeShapeCount,
  currentRound,
}) => {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);

  // Modo Colapsado / Pestaña Flotante (igual a Lab 3D)
  if (isCollapsed) {
    return (
      <button
        onClick={() => setIsCollapsed(false)}
        className="card-ink bg-white px-2.5 py-1.5 flex items-center gap-1.5 cursor-pointer shadow-[3px_3px_0px_#000000] hover:-translate-y-0.5 transition-all text-xs font-mono font-bold uppercase border-2 border-black"
        title="Desplegar menú lateral de formas y modos 1-Punto Focal"
      >
        <SlidersHorizontal className="w-3.5 h-3.5 stroke-[2.2]" />
        <span>Formas Focal</span>
        <span className="bg-black text-white px-1.5 py-0.2 text-[10px] leading-tight">
          {SHAPE_CONFIG[currentType].name.split(' ')[0]}
        </span>
        <ChevronRight className="w-3.5 h-3.5 stroke-[2.5]" />
      </button>
    );
  }

  return (
    <div className="card-ink bg-white p-3 w-64 sm:w-72 shadow-[4px_4px_0px_#000000] flex flex-col gap-2.5 select-none border-2 border-black">
      {/* Encabezado del Panel Lateral */}
      <div className="flex items-center justify-between border-b-2 border-black pb-2">
        <div className="flex items-center gap-1.5">
          <SlidersHorizontal className="w-4 h-4 stroke-[2.5]" />
          <h3 className="font-mono font-black text-xs uppercase tracking-wider">
            1 Punto Focal
          </h3>
        </div>

        <div className="flex items-center gap-1">
          <span className="bg-black text-white px-1.5 py-0.5 text-[10px] font-mono font-black leading-none shadow-[1px_1px_0px_#000000]">
            {practiceMode === 'full_wheel' ? `${activeShapeCount} Formas` : `Sector ${currentRound}/8`}
          </span>
          <button
            onClick={() => setIsCollapsed(true)}
            className="p-1 hover:bg-neutral-100 border border-black cursor-pointer shadow-[1px_1px_0px_#000000] ml-1"
            title="Minimizar menú lateral"
          >
            <ChevronLeft className="w-3.5 h-3.5 stroke-[2.5]" />
          </button>
        </div>
      </div>

      {/* Selector de Modo de Práctica: Rueda Completa vs 1 Sector */}
      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-500 font-bold">
          Modo de Ejercicio
        </span>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => onChangePracticeMode('full_wheel')}
            className={`py-1.5 px-2 text-[10px] font-mono font-bold uppercase border-2 border-black flex items-center justify-center gap-1 cursor-pointer transition-all shadow-[1px_1px_0px_#000000] ${
              practiceMode === 'full_wheel'
                ? 'bg-black text-white'
                : 'bg-white hover:bg-neutral-100 text-black'
            }`}
          >
            <Compass className="w-3 h-3" />
            <span>Rueda ({activeShapeCount})</span>
          </button>

          <button
            type="button"
            onClick={() => onChangePracticeMode('single')}
            className={`py-1.5 px-2 text-[10px] font-mono font-bold uppercase border-2 border-black flex items-center justify-center gap-1 cursor-pointer transition-all shadow-[1px_1px_0px_#000000] ${
              practiceMode === 'single'
                ? 'bg-black text-white'
                : 'bg-white hover:bg-neutral-100 text-black'
            }`}
          >
            <Target className="w-3 h-3" />
            <span>Sector ({currentRound}/8)</span>
          </button>
        </div>
      </div>

      {/* Selector de Densidad / Adaptación a Pantalla (Tablets vs Desktop) */}
      {practiceMode === 'full_wheel' && (
        <div className="flex flex-col gap-1 bg-neutral-50 border border-black p-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-mono uppercase tracking-wider text-neutral-600 font-bold">
              Figuras en Pantalla
            </span>
            <span className="text-[9px] font-mono font-bold bg-white px-1 border border-neutral-300">
              {activeShapeCount} formas
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1">
            <button
              type="button"
              onClick={() => onChangeDensity('auto')}
              className={`py-1 text-[9px] font-mono font-bold uppercase border border-black cursor-pointer transition-all ${
                density === 'auto' ? 'bg-black text-white' : 'bg-white hover:bg-neutral-100 text-black'
              }`}
              title="Adaptar automáticamente al tamaño de pantalla (Tablets: 2 a 4 figuras grandes, Desktop: 8)"
            >
              Auto
            </button>
            <button
              type="button"
              onClick={() => onChangeDensity('wheel4')}
              className={`py-1 text-[9px] font-mono font-bold uppercase border border-black cursor-pointer transition-all ${
                density === 'wheel4' ? 'bg-black text-white' : 'bg-white hover:bg-neutral-100 text-black'
              }`}
              title="4 Figuras grandes (ideal para tablets o práctica cómoda)"
            >
              4 (Tab)
            </button>
            <button
              type="button"
              onClick={() => onChangeDensity('wheel2')}
              className={`py-1 text-[9px] font-mono font-bold uppercase border border-black cursor-pointer transition-all ${
                density === 'wheel2' ? 'bg-black text-white' : 'bg-white hover:bg-neutral-100 text-black'
              }`}
              title="2 Figuras extra grandes en diagonal"
            >
              2 (Diag)
            </button>
            <button
              type="button"
              onClick={() => onChangeDensity('wheel8')}
              className={`py-1 text-[9px] font-mono font-bold uppercase border border-black cursor-pointer transition-all ${
                density === 'wheel8' ? 'bg-black text-white' : 'bg-white hover:bg-neutral-100 text-black'
              }`}
              title="8 Figuras completas"
            >
              8 (HD)
            </button>
          </div>
        </div>
      )}

      {/* Lista de Formas 3D Precalculadas */}
      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-500 font-bold">
          Forma Geométrica
        </span>
        <div className="flex flex-col gap-1 max-h-[300px] overflow-y-auto pr-0.5">
          {(Object.keys(SHAPE_CONFIG) as Focal3DShapeType[]).map((type) => {
            const cfg = SHAPE_CONFIG[type];
            const isSelected = currentType === type;
            const IconComponent = cfg.icon;

            return (
              <button
                key={type}
                type="button"
                onClick={() => onSelectType(type)}
                className={`p-2 border-2 border-black flex items-center justify-between text-left cursor-pointer transition-all shadow-[2px_2px_0px_#000000] hover:-translate-y-0.5 ${
                  isSelected
                    ? 'bg-black text-white'
                    : 'bg-white hover:bg-neutral-100 text-black'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`p-1 border border-black ${
                      isSelected ? 'bg-white text-black' : 'bg-neutral-100 text-neutral-800'
                    }`}
                  >
                    <IconComponent className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex flex-col">
                    <span className="font-mono font-black text-xs uppercase leading-tight">
                      {cfg.name}
                    </span>
                    <span
                      className={`text-[9px] font-mono leading-tight ${
                        isSelected ? 'text-neutral-300' : 'text-neutral-500'
                      }`}
                    >
                      {cfg.description}
                    </span>
                  </div>
                </div>

                <span
                  className={`text-[9px] font-mono uppercase font-bold px-1.5 py-0.5 border border-black shrink-0 ml-1 ${
                    isSelected ? 'bg-white text-black' : 'bg-neutral-200 text-black'
                  }`}
                >
                  {cfg.tag}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
