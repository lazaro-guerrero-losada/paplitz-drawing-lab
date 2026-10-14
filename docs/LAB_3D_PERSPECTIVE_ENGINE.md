# 📦 Lab 3D — Motor de Perspectiva 3D Dinámica y Entrenamiento de Formas

> **Módulo:** `src/lib/perspective3d/` & `src/components/Lab3D/`  
> **Inspiración Didáctica:** Entrenamiento de perspectiva espacial extrema (Artly "Forms - Guess 3D") integrado en el sistema Neobrutalista Paplitz.

---

## 1. Visión General del Modo Lab 3D

El **Laboratorio de Perspectiva 3D (Lab 3D)** introduce una experiencia de práctica libre y minijuegos donde el alumno se sitúa dentro de un entorno tridimensional inmersivo (una habitación cúbica de 6 paredes con puntos de fuga visibles $VP_X, VP_Y, VP_Z$). 

A diferencia del modo clásico de dibujo de cubos en 2D con ejes estáticos:
1. **Ángulos de Cámara Extremos e Inusuales:** Se generan cámaras procedurales dinámicas con elevaciones picadas o contrapicadas agresivas y azimuts diagonales que fuerzan una comprensión genuina de la convergencia espacial.
2. **8 Primitivas Tridimensionales Paramétricas:** Se practican formas fundamentales de diseño industrial y dibujo analítico:
   - `SPHERE` (Esfera con silueta tangente y meridianos).
   - `RING` (Toroide con anillos concéntricos y secciones transversales elípticas).
   - `CUBE` (Hexaedro regular fugué hacia 3 puntos de fuga).
   - `CYLINDER` (Cilindro con bases elípticas y aristas de contorno).
   - `CONE` (Cono con base elíptica inclinada y generatrices tangentes al ápice).
   - `PYRAMID` (Pirámide de base cuadrangular y cúspide elevada).
   - `CAPSULE` (Cápsula redondeada cilíndrica con cúpulas esféricas).
   - `PRISM` (Prisma recto de base triangular).
3. **Puntos de Anclaje Frontales Orientados:** El motor garantiza que la cara o curva base visible siempre pertenezca a la parte más cercana al observador (`camera.eye`), evitando inversiones perceptivas o figuras que parezcan proyectarse hacia afuera.

---

## 2. Arquitectura Matemática y Proyección 3D (`src/lib/perspective3d/math3d.ts`)

### 2.1 Cámara y Matrices de Transformación
La cámara se modela con posición en el espacio $\vec{E}$ (`eye`), punto de mira $\vec{T}$ (`target`), vector vertical $\vec{U}$ (`up`), campo de visión vertical $\theta$ (`fov`), relación de aspecto $A$ y planos de recorte $z_{near}, z_{far}$:

$$\text{Matriz View} = \text{LookAt}(\vec{E}, \vec{T}, \vec{U})$$
$$\text{Matriz Proj} = \text{Perspective}(\theta, A, z_{near}, z_{far})$$
$$M_{viewProj} = M_{proj} \times M_{view}$$

### 2.2 Proyección 3D a Pantalla 2D y Recorte en Near-Plane
Para proyectar un punto 3D $\vec{P} = (x, y, z)$ a coordenadas de pantalla $(x_s, y_s)$:
1. Transformación a Clip Space homogéneo:
   $$\begin{pmatrix} x_c \\ y_c \\ z_c \\ w_c \end{pmatrix} = M_{viewProj} \begin{pmatrix} x \\ y \\ z \\ 1 \end{pmatrix}$$
2. Validación de plano cercano: Si $w_c < \epsilon$, el punto se encuentra detrás o muy cerca de la lente y es recortado con `clipAndProject3DSegment` para evitar artefactos de inversión de coordenadas en pantalla.
3. Coordenadas Normalizadas (NDC) a Screen Space:
   $$x_s = \frac{x_c / w_c + 1}{2} \cdot W$$
   $$y_s = \frac{1 - y_c / w_c}{2} \cdot H$$

### 2.3 Cálculo en Forma Cerrada de Puntos de Fuga (`calculateVanishingPoints`)
Los puntos de fuga no se estiman visualmente; se calculan analíticamente proyectando los vectores unitarios direccionales de cada eje cartesiano al infinito:
- $\vec{D}_X = (1, 0, 0)$
- $\vec{D}_Y = (0, 1, 0)$
- $\vec{D}_Z = (0, 0, 1)$

Para cada eje $K \in \{X, Y, Z\}$, se proyecta el punto $P_{\infty} = \vec{T} + \vec{D}_K \cdot 10000.0$:
- Si el punto proyectado cae dentro del canvas, se marca como `isOnScreen: true` y se dibuja el indicador de fuga correspondiente.
- Si el punto se proyecta fuera del canvas, el motor calcula la intersección exacta con el borde del marco de pantalla y muestra un indicador direccional (`▲ VP Z`, `▼ VP Y`, `► VP X`) señalando el ángulo exacto al que convergen las líneas.

### 2.4 Habitación de Perspectiva de 6 Paredes (`generate6WallRoomGrid`)
El espacio se delimita mediante un cubo envolvente $[-L, L]^3$ ($L = 2.4$):
- **6 Caras:** Suelo ($Y = -L$), Techo ($Y = +L$), Pared Izquierda ($X = -L$), Pared Derecha ($X = +L$), Pared Trasera ($Z = -L$) y Pared Delantera ($Z = +L$).
- **Subdivisión por Malla:** Cada cara contiene líneas de rejilla espaciadas uniformemente proyectadas en perspectiva con opacidad atenuada (`opacity: 0.12` a `0.20`).
- **12 Aristas Estructurales:** Las esquinas de la habitación se proyectan con mayor nitidez (`opacity: 0.35`) para transmitir inmediatamente la escala espacial.

---

## 3. Generador de Primitivas 3D (`src/lib/perspective3d/primitives.ts`)

Cada generador de primitiva devuelve tres conjuntos de datos:
1. `anchorCurves`: Curvas iniciales dadas al usuario (en tinta negra sólida frontal y gris tenue para partes traseras).
2. `targetCurves`: Curvas y aristas que el usuario debe dibujar a mano alzada para completar la figura.
3. `previewModel3D`: Modelo 3D rotatorio en formato wireframe para la tarjeta de referencia superior derecha.

### 3.1 Orientación Dinámica de las Caras Dadas
Para evitar que un prisma o cilindro parezca extenderse en la dirección errónea:
- El algoritmo evalúa la distancia tridimensional desde la cámara $\vec{E}$ a ambos extremos de la figura:
  $$d_1 = \|\vec{E} - \vec{C}_1\|, \quad d_2 = \|\vec{E} - \vec{C}_2\|$$
- Siempre se toma la cara con $\min(d_1, d_2)$ como la cara **dada (ancla)** y se le pide al alumno trazar el cuerpo y la cara opuesta con $\max(d_1, d_2)$, garantizando que la forma siempre se reduzca visualmente en profundidad siguiendo las líneas de fuga hacia el fondo.

---

## 4. Componentes de Interfaz de Usuario (UI)

### 4.1 Panel Flotante Lateral de Selección de Formas (`src/components/Lab3D/PrimitiveSelectorPanel.tsx`)
- **Ubicación:** Lateral izquierdo superior flotante (`top-16 left-3`).
- **Funcionalidades:**
  - Checkboxes neobrutalistas para habilitar/deshabilitar cualquiera de las 8 formas (`CUBE`, `SPHERE`, `CYLINDER`, `CONE`, `PYRAMID`, `RING`, `CAPSULE`, `PRISM`).
  - Botón **Todas** para seleccionar el catálogo completo.
  - Botón **Solo Actual** para enfocar la sesión en una única figura.
  - Botón **🎲 Azar** para cargar de inmediato un reto aleatorio extraído del subconjunto activo.
  - Botón **Reto** por cada figura para cargar inmediatamente una perspectiva de esa geometría específica.
  - Mecanismo de seguridad: impide deseleccionar todas las formas a la vez (siempre mantiene al menos una forma seleccionada).
  - Pestaña colapsable: se minimiza a un botón compacto `[ 📐 Formas (X/8) ]` para maximizar el área de dibujo en pantallas pequeñas o tablets.

### 4.2 Barra de Herramientas Flotante Centrada Inferior
Diseñada bajo el sistema neobrutalista `card-ink` con borde negro y sombra sólida `shadow-[4px_4px_0px_#000000]`, integra en un único bloque ergonómico:
1. **Deshacer (`Undo2`) & Rehacer (`Redo2`)**: Control total del historial de trazos libres.
2. **Borrar Todo (`Trash2`)**: Limpieza inmediata del lienzo.
3. **Divisor rígido**: Separador de tinta vertical.
4. **Botón de Ayudas Visuales de 3 Fases**:
   - **`Off` (Desactivado):** Lienzo despejado para práctica estricta a mano alzada.
   - **`Línea` (`line`):** Traza una línea gris punteada (`strokeDasharray: [3, 5]`, tono neutral Slate) a lo largo de todas las aristas y curvas objetivo para ver la solución exacta en pantalla.
   - **`Vértices` (`vertices`):** Muestra únicamente los vértices clave (marcadores azules con borde negro y centro blanco) y una línea fina direccional que parte de cada vértice apuntando en el vector exacto hacia su vértice conectado. El usuario puede ver el ángulo y dirección de fuga sin que se le revele el trazo completo.
5. **Rejilla 3D (`Grid`)**: Alterna la visualización de las 6 paredes cúbicas de referencia y puntos de fuga.
6. **Nuevo Ángulo (`RotateCcw`)**: Genera una nueva perspectiva tridimensional del reto en curso sin tener que subir a la cabecera.
7. **Comprobar / Siguiente (`Check` / `ChevronRight`)**: Disparador del evaluador analítico y avance de rondas.

### 4.3 Tarjeta Flotante 3D de Referencia (`src/components/Lab3D/Perspective3DPreviewCard.tsx`)
- Muestra el modelo objetivo rotando en un canvas 3D independiente.
- Soporta interactividad de ratón/stylus: permite hacer clic y arrastrar para inspeccionar la geometría en 360°.
- Badge negro inferior neobrutalista con el nombre en mayúsculas de la primitiva.

### 4.4 Lienzo Despejado y Cabecera Sobria
- **Cabecera Minimalista**: Se eliminaron selectores redundantes y botones de cambio de modo superfluos, dejando una barra superior limpia con botón de regreso y contador de rondas.
- **Lienzo Libre de Oclusiones**: Se retiraron las etiquetas técnicas duplicadas que antes quedaban ocultas o semi-tapadas debajo del menú flotante lateral.

### 4.5 Calibración de Coordenadas del Lienzo sin Desplazamiento (Offset Fix)
Para garantizar precisión 1:1 en pantallas de cualquier resolución o DPI:
```typescript
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
```
Se aplica `pointerCapture` y rechazo de palma (`activePointerIdRef`) para evitar trazos accidentales con la mano al usar Stylus/Apple Pencil/S-Pen.

---

## 5. Algoritmo de Evaluación y Calificación (`src/lib/perspective3d/evaluator3d.ts`)

La evaluación compara los trazos libres del usuario con las curvas tridimensionales objetivo:
1. **Distancia Hausdorff & Fréchet Muestreada:** Se calcula la distancia mínima cuadrática entre los puntos del trazo y la curva de referencia.
2. **Alineación Angular de Tangentes:** Verifica que el usuario haya dibujado en la dirección de fuga correcta y no en sentido perpendicular.
3. **Puntaje y Letras:**
   - **S (90 - 100 PTS):** Precisión quirúrgica de aristas y proporciones.
   - **A (80 - 89.9 PTS):** Excelente control de fuga.
   - **B (65 - 79.9 PTS):** Buena aproximación con ligeras desviaciones.
   - **C (45 - 64.9 PTS):** Proporciones deformadas o fugas divergentes.
   - **D (< 45 PTS):** Trazos ausentes o fuera de perspectiva.
4. **Retroalimentación Diagnóstica en Color:**
   - **Cyan (`#38bdf8`):** Trazos originales del usuario.
   - **Verde Esmeralda (`#22c55e`):** Aristas y curvas correctamente identificadas y dibujadas.
   - **Rojo Carmesí (`#ef4444`):** Aristas faltantes o con desviación geométrica excesiva.

---

## 6. Sistema de Diseño Neobrutalista Aplicado

El módulo cumple estrictamente con el sistema de diseño visual de Paplitz:
- Bordes negros sólidos: `border-2 border-black`.
- Sombras rígidas sin difuminado: `shadow-[2px_2px_0px_#000000]`, `shadow-[3px_3px_0px_#000000]`, `shadow-[4px_4px_0px_#000000]`.
- Clases de utilidad globales: `.btn-ink`, `.btn-ink-outline`, `.card-ink`.
- Tipografías:
  - `font-mono`: Metadatos técnicos, coordenadas, rondas y nombres de formas.
  - `font-display` (Eczar serif): Calificaciones, títulos y encabezados.
