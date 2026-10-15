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
- **Ubicación:** Lateral izquierdo superior flotante (`top-3 left-3 sm:left-5`).
- **Funcionalidades:**
  - Checkboxes neobrutalistas para habilitar/deshabilitar cualquiera de las 8 formas (`CUBE`, `SPHERE`, `CYLINDER`, `CONE`, `PYRAMID`, `RING`, `CAPSULE`, `PRISM`).
  - Botón **Todas** para seleccionar el catálogo completo.
  - Botón **Solo Actual** para enfocar la sesión en una única figura.
  - Botón **Reto** por cada figura para cargar inmediatamente una perspectiva de esa geometría específica.
  - Mecanismo de seguridad: impide deseleccionar todas las formas a la vez (siempre mantiene al menos una forma seleccionada).
  - Pestaña colapsable: se minimiza a un botón compacto `[ 📐 Formas (X/8) ]` para maximizar el área de dibujo en pantallas pequeñas o tablets.
  - Control de perspectiva centrado: la rotación de ángulo se gestiona exclusivamente desde el botón ergonómico **Nuevo Ángulo** de la barra de herramientas inferior.

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

### 4.4 Lienzo Despejado y Máxima Superficie de Dibujo (Sin Cabecera Redundante)
- **Área de Dibujo Maximizada al 100%:** Se eliminó la cabecera intermedia de `ROUND X/8` y etiquetas redundantes para expandir verticalmente el lienzo de dibujo en toda la altura disponible bajo la barra principal de navegación de Paplitz.
- **Flotantes de Control Ergonómicos (`top-3`):** El selector de formas (`PrimitiveSelectorPanel`), la tarjeta de inspección 3D (`Perspective3DPreviewCard`) y el banner de calificación se sitúan a ras superior (`top-3`) sin estorbar el cuadrante principal de trazo.
- **Lienzo Libre de Oclusiones:** Se retiraron las etiquetas técnicas duplicadas que antes quedaban ocultas o semi-tapadas debajo del menú flotante lateral.

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

## 5. Algoritmo de Evaluación y Calificación Rigurosa (`src/lib/perspective3d/evaluator3d.ts`)

La evaluación compara los trazos libres del usuario con las curvas tridimensionales objetivo aplicando rigurosidad geométrica y didáctica:
1. **Alineación Direccional Tangente ($|\cos\theta| \ge 0.65$):**
   - Para cada punto de una curva objetivo, se deriva su vector tangente unitario $\vec{u}_T$ (con soporte continuo para ciclos cerrados como elipses y anillos).
   - Para cada segmento del trazo del usuario, se extrae su vector unitario $\vec{u}_S$.
   - Solo se consideran coincidencias si $|\vec{u}_T \cdot \vec{u}_S| \ge 0.65$ ($\approx 49.5^\circ$ de desvío angular máximo). Trazos cruzados u ortogonales (por ejemplo, aristas verticales cruzando la elipse superior de un cilindro) son rechazados taxativamente.
2. **Umbral de Fuga Calibrado (`MATCH_THRESHOLD = 18.0`px):**
   - Ajustado para penalizar líneas que se dibujan en paralelo sin converger hacia los puntos de fuga ($VP_X, VP_Y, VP_Z$).
   - Conforme la línea paralela del usuario se aleja de la perspectiva cónica real, la distancia supera los 18px y el tramo se tiñe de rojo en pantalla.
3. **Integridad Estructural Curva a Curva (`CurveEvaluationDetail`):**
   - Se evalúa independientemente cada contorno (cobertura $C_k$, precisión $P_k$ y nota individual $s_k$).
   - **Regla de Figura Incompleta:** Si cualquier contorno esencial tiene una cobertura $< 35\%$ (por ejemplo, si no se dibujó la elipse superior de un cilindro o faltan caras de un cubo), la calificación queda automáticamente topada en un máximo de **$48\%$ (No Superado)** y el feedback nombra explícitamente el contorno faltante.
4. **Sistema de Calificación Unificado con la Pestaña de Práctica:**
   - **Porcentaje Numérico (%)**: La puntuación se expresa directamente en porcentaje del $0\%$ al $100\%$, eliminando las letras anglosajonas (S, A, B, C, D).
   - **Estado de Aprobación**:
     - **`Aprobado ✓`** (badge negro `bg-black text-white` con icono `CheckCircle`): cuando se alcanza o supera el $70\%$ (`score >= 70%`).
     - **`No Superado`** (badge blanco con borde negro `bg-white text-black border-2 border-black` con icono `AlertTriangle`): cuando la nota es inferior al umbral mínimo del $70\%$.
   - **Barra Inferior con Píldora de Puntuación**: Al evaluar, la barra de herramientas muestra la píldora `[✓ / ⚠] [Score]%` junto al botón `Siguiente`, idéntica a la barra de Práctica.
5. **Retroalimentación Diagnóstica en Color:**
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

---

## 7. Sistema de Reporte de Evaluación 3D (`src/lib/perspective3d/debugReport3d.ts`)

Para permitir la depuración analítica de ejercicios, reporte de fallos o discrepancias en la nota y comunicación fluida con otros agentes de IA, se implementó el sistema de reporte idéntico a Práctica:
1. **Generador `build3DDebugReport`:**
   - Serializa los parámetros de la cámara (FOV, eye, target).
   - Registra el estado de los puntos de fuga proyectados ($VP_X, VP_Y, VP_Z$, dentro/fuera de pantalla).
   - Cuantifica las curvas y aristas objetivo (`targetCurvesCount`), anclas dadas y trazos del usuario (puntos, longitudes, tiempos).
   - Detalla la calificación (`score`, `grade`, `feedbackMessage`, aciertos/faltas).
   - Adjunta notas y explicaciones del usuario.
2. **Modal Neobrutalista de Reporte (`ReportModal` en `Lab3DView`):**
   - Disparador en la barra inferior: botón con icono `AlertTriangle` (`btn-ink-outline`).
   - Muestra metadatos inmediatos: Forma, Semilla (`#seed`) y Calificación.
   - Textarea interactivo para redactar notas con botones de etiquetas rápidas de un clic:
     - `+Nota injusta`
     - `+Punto de fuga desalineado`
     - `+Trazo no detectado`
     - `+Fallo de proporción`
     - `+Buena sensación`
   - Vista previa del informe completo formateado en Markdown.
   - Acciones de exportación: **Descargar JSON** (`downloadReport3DJson`) y **Copiar Texto** (`copyReport3DToClipboard`).

---

## 8. Función de Grabación de Sesión — Modo Récord (`src/lib/sessionRecorder.ts` & `SessionRecordPanel.tsx`)

Portado de forma fiel y extendido para soportar ejercicios `'3d'`:
1. **Grabación Continua Unificada:**
   - Botón `REC` presente en la barra de herramientas inferior de Lab 3D, en la barra de navegación superior desktop y en el menú lateral móvil.
   - Estado visual: animado con pulso rojo cuando está activo (`REC (N)`) y contador de ejercicios registrados en tiempo real.
2. **Auto-registro al Comprobar:**
   - Cada vez que el usuario pulsa "Comprobar" y se califica un reto 3D, si el Modo Récord está activo, el ejercicio se almacena automáticamente en el historial de sesión en memoria React.
   - Sincronización bidireccional de comentarios: si el usuario añade una nota en el modal de reporte, esta se asocia instantáneamente al ejercicio grabado correspondiente.
3. **Panel Consolidado (`SessionRecordPanel`):**
   - Resumen estadístico: Nota media, superados vs fallidos, ejercicios con comentario.
   - Lista detallada con historial cronológico, edición de comentarios inline y diagnóstico expandible.
   - **Exportar Sesión**: Copia un reporte consolidado en Markdown listo para compartir con un agente o tutor.
   - **Descargar JSON**: Exporta todos los datos crudos estructurados de la sesión en un archivo `.json`.
   - **100% Volátil en Memoria**: La sesión no persiste basura residual en almacenamiento local; se reinicia limpiamente al recargar la página.

---

## 9. Matemáticas de Siluetas Tangenciales Dependientes del Punto de Vista (`primitives.ts`)

En dibujo analítico tridimensional, las superficies regladas o curvas de revolución no poseen aristas fijas en el espacio físico; sus líneas de contorno aparente (siluetas) son **estrictamente tangenciales al punto de vista de la cámara** $\vec{E} = (E_x, E_y, E_z)$:

### 9.1 Cono en Perspectiva (`createConePrimitive`)
Para un cono con ápice $\vec{A} = (0, y_{apex}, 0)$ y base circular en $y = y_{base}$ de radio $R$ (altura $H = y_{apex} - y_{base}$):
- **Base Circular Completa:** Se proporciona la circunferencia completa de la base en tinta negra sólida continua (`solid`), sin cuerdas artificiales que unan los puntos de tangencia ni particiones en semilunas.
- **Eje Vertical de Altura:** Emerge desde el centro de la base $(0, y_{base}, 0)$ hasta el ápice $(0, y_{apex}, 0)$ en trazo fino técnico (`faint`), informando al alumno de la altura tridimensional exacta del cono para que pueda calcular la convergencia a mano alzada sin ayudas.
- Condición de tangencia de la visual desde la cámara $\vec{E}$:
  $$(\vec{E} - \vec{A}) \cdot \vec{N}(\theta) = 0 \implies \cos(\theta - \phi) = \frac{(y_{apex} - E_y) R}{H \cdot D_{xz}}$$
  donde $D_{xz} = \sqrt{E_x^2 + E_z^2}$ y $\phi = \text{atan2}(E_z, E_x)$.
- Los dos ángulos de contacto tangencial en la elipse base son:
  $$\Delta\theta = \arccos\left(\text{clamp}\left(\frac{(y_{apex} - E_y) R}{H \cdot D_{xz}}, -1, 1\right)\right)$$
  $$\theta_1 = \phi + \Delta\theta, \quad \theta_2 = \phi - \Delta\theta$$
- Generatrices de silueta: van desde el ápice $\vec{A}$ a $\vec{P}_1 = (R\cos\theta_1, y_{base}, R\sin\theta_1)$ y $\vec{P}_2 = (R\cos\theta_2, y_{base}, R\sin\theta_2)$, garantizando tangencia proyectiva exacta en 2D.
- Muestreo continuo con `sampleDenseSegment3D(apex, P, 32)` para evaluación suave en todo el recorrido.

### 9.2 Cilindro en Perspectiva (`createCylinderPrimitive`)
- **Base Inferior Completa:** La elipse de la base se muestra como un bucle cerrado continuo en tinta negra sólida (`solid`). El usuario debe deducir visualmente los puntos tangentes desde la perspectiva para trazar los laterales (salvo si activa el botón de ayudas).
- **Eje Vertical de Altura:** Línea vertical fina técnica (`faint`) trazada desde el centro de la base inferior $(0, -halfH, 0)$ hasta el centro de la tapa superior $(0, halfH, 0)$, rematada con un sutil trazo límite horizontal.
- Normal exterior: $\vec{N}(\theta) = (\cos\theta, 0, \sin\theta)$.
- Condición de silueta: $(\vec{E} - \vec{P}) \cdot \vec{N}(\theta) = 0 \implies D_{xz} \cos(\theta - \phi) = R$.
- Ángulos de tangencia: $\theta_{1,2} = \phi \pm \arccos(R / D_{xz})$.
- Las aristas laterales conectan los puntos tangentes de la base inferior con los de la tapa superior y se ordenan en pantalla como Lateral Izquierdo y Derecho.

### 9.3 Esfera en Perspectiva (`createSpherePrimitive`)
- **Ecuador Completo:** El ecuador horizontal ($XZ$, $Y=0$) se presenta como circunferencia cerrada continua en tinta negra sólida (`solid`).
- Cono tangente desde la cámara a la esfera: con radio $R$ y distancia $D = \|\vec{E}\|$:
  $$\sin\alpha = \frac{R}{D}, \quad d_{contact} = \frac{R^2}{D}, \quad r_{contact} = R \sqrt{1 - \frac{R^2}{D^2}}$$
- El círculo de contacto $3D$ se proyecta exactamente sobre la silueta aparente exterior de la esfera.
- Líneas ortogonales canónicas: Meridianos ortogonales en $XY$ ($Z=0$) y $YZ$ ($X=0$) cuyos arcos frontales visibles son los objetivos a dibujar.

### 9.4 Prisma Triangular con Eje Longitudinal de Profundidad (`createPrismPrimitive`)
- **Cara Triangular Frontal Calibrada:** La cara triangular más cercana a la cámara se proporciona como guía sólida negra (`solid`).
- **Eje Longitudinal de Profundidad (`depth-axis`):** Para evitar que el alumno dibuje el prisma en sentido invertido o desvíe la dirección de extrusión, se traza un eje técnico tenue discontinuo (`faint`, `role: 'construction'`) desde el baricentro de la cara triangular frontal:
  $$\vec{C}_{\text{frontal}} = \frac{1}{3}\sum_{i=0}^2 \vec{P}_{\text{frontal}, i}$$
  hasta el baricentro de la cara triangular posterior:
  $$\vec{C}_{\text{posterior}} = \frac{1}{3}\sum_{i=0}^2 \vec{P}_{\text{posterior}, i}$$
  rematado con un delimitador transversal posterior (`depth-tick`).
- Permite al usuario comprender de inmediato la orientación y longitud en fuga hacia el fondo sin recurrir a ayudas completas.

### 9.5 Toroide, Pirámide y Cápsula
- **Pirámide y Cápsula:** Incorporan igualmente la base cerrada sólida y el eje vertical fino de altura para comunicar la cota volumétrica sin necesidad de activar pistas.
- **Toroide (`createRingPrimitive`):** Envolventes tangenciales superior e inferior calculadas analíticamente para cada sección transversal según el vector visual.

### 9.6 Back-Face Culling de Aristas Ocultas en Poliedros Opacos (`primitives.ts`)
En cuerpos geométricos planos poliédricos sólidos (Cubo, Pirámide, Prisma):
- **Oclusión Realista del Sólido:** Las aristas posteriores que quedan ocultas dentro o detrás del volumen sólido no se exigen al usuario ni se penalizan si no se dibujan.
- **Cálculo de Visibilidad por Caras Adyacentes:** Cada arista pertenece a dos caras adyacentes $F_1, F_2$. La arista es visible si y solo si al menos una cara está orientada hacia el observador:
  $$\text{EsVisible}(E) = (\vec{N}_1 \cdot \vec{V} > 0) \lor (\vec{N}_2 \cdot \vec{V} > 0)$$
  donde $\vec{N}$ es la normal exterior de la cara y $\vec{V} = \vec{E} - \vec{P}_{\text{centro}}$.
- Si ambas caras adyacentes miran en sentido contrario a la cámara ($\vec{N}_1 \cdot \vec{V} \le 0$ y $\vec{N}_2 \cdot \vec{V} \le 0$), la arista queda clasificada como ocluida y se excluye de `targetCurves`.
- **Cubo:** Exige las 3 aristas verticales visibles y las aristas del techo orientadas al observador.
- **Pirámide:** Exige únicamente las aristas oblicuas inclinadas hacia la cámara.
- **Prisma Triangular:** Exige la arista de cresta y las aristas longitudinales y rampas correspondientes a las caras iluminadas hacia la cámara.

### 9.7 Diferenciación entre Contornos de Forma y Líneas de Construcción (`role: 'form' | 'construction'`)
En dibujo técnico y croquis analítico existe una distinción fundamental entre el perfil externo del objeto y las líneas de andamiaje:
- **`role: 'form'` (Contornos de la Forma):** Siluetas exteriores tangenciales y aristas de arista viva visibles. Son esenciales para delimitar el volumen (peso 70% cuando hay construcción, 100% en poliedros). La omisión de un contorno de forma (< 35% de cobertura) bloquea la aprobación de la figura.
- **`role: 'construction'` (Líneas de Construcción):** Meridianos ortogonales en la esfera, secciones transversales elípticas en el toroide o anillo divisor en la cápsula.
  - En la **Esfera:** Trazar la silueta exterior y al menos 1 meridiano satisface el 100% de la cuota de construcción sin penalizar la omisión del segundo meridiano.
  - En el **Toroide / Anillo:** Trazar las envolventes tangenciales y 2 secciones transversales satisface la cuota de construcción.
  - Las líneas de construcción no activan penalizaciones de figura incompleta.

### 9.8 Muestreo Continuo, Asignación Exclusiva y Evaluación Calibrada (`evaluator3d.ts`)
- Todas las aristas y curvas se muestrean densamente (24 a 48 puntos mediante `sampleDenseSegment3D`).
- **Asignación Exclusiva de Segmentos (Segment-to-Curve Bipartite Matching):**
  - Cada segmento del trazo del alumno se asocia a la arista objetivo con la que presenta mayor correspondencia geométrica y angular mediante la función de aptitud $\text{fitness} = \frac{|\cos\theta|}{1.0 + d / 4.0}$.
  - Impide de raíz que una línea vertical de fuste cilíndrico satisfaga fraudulentamente los laterales de la elipse superior, o que un único trazo horizontal satisfaga aristas opuestas.
  - Vértices compartidos: se admite co-asignación únicamente en uniones extremas ($d \le 8.0\,\text{px}$) con $\text{fitness} \ge 0.85 \times \text{bestFitness}$.
- **Límite Físico de Cobertura por Longitud Trazada:**
  - La cobertura de una curva no puede exceder la longitud real trazada por el usuario para esa arista:
    $$\text{maxPossibleCoverage} = \min\left(1.0, \frac{L_{\text{asignada}} + 1.5 \times \text{threshold}}{L_{\text{objetivo}}}\right)$$
  - Evita que un pequeño amago de $18\,\text{px}$ obtenga falsamente un $76\%$ de cobertura sobre una elipse de $380\,\text{px}$.
- **Umbrales Calibrados de Distancia (`matchThreshold`):**
  - **$16.0\,\text{px}$ para Aristas Rectas:** Exige convergencia estricta hacia los puntos de fuga e impide líneas paralelas o divergentes en poliedros y fustes cilíndricos.
  - **$20.0\,\text{px}$ para Curvas Libres y Elipses:** Acomoda la vibración y oscilación natural del stylus sobre cristal sin admitir figuras desproporcionadas o desplazadas.
- **Alineación Tangente por Cosenos:**
  - $|\cos\theta| \ge 0.72$ para aristas rectas (desviación angular máxima $\le 44^\circ$).
  - $|\cos\theta| \ge 0.65$ para curvas (desviación angular máxima $\le 49.5^\circ$).
- **Precisión No Lineal y Puntuación Rigurosa:**
  - Precisión de distancia con decaimiento no lineal: $\text{precision} = \max(0, 1 - (d_{\text{media}} / \text{threshold})^{1.3})$.
    - Errores mínimos ($d \le 3\,\text{px}$) obtienen precisión $\ge 90\%$.
    - Desviaciones apreciables de fuga ($d \approx 11\,\text{px}$) caen bruscamente a precisión $\approx 38\%$.
  - Modulación de la nota por precisión: $\text{score} = \text{coverage} \times 100 \times \text{precision}^{1.15}$.
    - Un trazo con $96\%$ de cobertura pero con fuga desalineada ($45\%$ precisión) puntúa $\sim 35-40\%$, suspendiendo justificadamente la arista (`✗ Desviado de la fuga`).
    - Trazos convergentes limpios ($d \le 3\,\text{px}$) mantienen calificaciones excelentes ($92-97\%$).
- **Diagnóstico Transparente en Reportes:**
  - Se distingue con exactitud el estado de cada contorno: `✓ Completado`, `✗ Desviado de la fuga` (trazado completo pero con fuga errónea), `✗ Incompleto` o `✗ No Dibujado`.



