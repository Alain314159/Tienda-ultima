# Mejoras pendientes — Tienda Pro

Análisis del código en el commit `763d65e` (2026-11-27), revisando arquitectura,
rendimiento, UX, seguridad y tests contra el código real. No es una lista de
fallos graves: hoy la app funciona bien porque una tienda tiene pocos datos.
Casi todo lo de aquí es deuda que crece con el uso, o fricción diaria para el
tendero. Ordenado por prioridad: primero lo que evita perder dinero o datos,
después lo que ahorra toques cada día, y al final lo interno.

> No incluye el `.env` trackeado en el repo público (alerta aparte, pendiente
> de decisión) ni el bug del menú «Más» (ya arreglado el 2026-11-27).

## Estado de implementación

Implementación por oleadas a partir del 2026-11-28 (sin commit aún; el padre
hace commit y push al final tras verificar).

**Oleada 1 — Seguridad y Ventas/cobro (terminada 2026-11-28):**
- 1.1 PIN con bloqueo (5 fallos → 1 min, duplicando hasta 15 min, persistido) y mínimo 4 dígitos: HECHO.
- 1.2 Importar respaldo nunca sobrescribe pin/pinActivo; cfg validada campo a campo: HECHO.
- 1.6 Deep link con state/nonce (TTL 10 min, un solo uso): HECHO (sin verificar en dispositivo real si Supabase preserva el state hasta `tiendapro://auth`).
- 1.7 Sync WiFi con código de emparejamiento de 6 dígitos y handshake con huella SHA-256: HECHO.
- 1.8 Sync valida contenido remoto con `validarFilaRemota()`; lo inválido va a `descartes` (motivo `remoto-invalido`, no restaurable): HECHO.
- 1.9 Mínimo 100 000 iteraciones PBKDF2 al importar; 5 intentos de contraseña y espera de 1 min: HECHO.
- 1.10 Cerrar sesión borra datos locales: HECHO la función (`salirDeNube` con `borrarDatosLocales`), PENDIENTE el diálogo de confirmación + PIN en CuentaNube.vue (oleada 2).
- 1.11 Export plano sin hash del PIN; `window.__app`/`Log` solo en DEV (falta `window.db`, que se pone en db.ts — oleada 2); Eruda eliminada; CSP sin jsdelivr y con supabase.co + Google; logs redactados: HECHO (salvo cifrado en reposo, pendiente con plan).
- Capgo `appId`: VERIFICADO que no coincide (`com.tiendapro.tiendapro` en el plugin frente a `com.tiendapro.app` de la app); NO cambiado por no poder verificar cuál es el correcto en el panel de Capgo.
- 2.1 Buscador que no se cierra al añadir: HECHO.
- 2.2 Confirmar pago valida lo recibido siempre (campo «Dinero recibido» visible): HECHO.
- 2.3 «Limpiar carrito» y × de línea con confirmación: HECHO.
- 2.4 Ajuste de inventario con confirmación (lotes FIFO detallados): HECHO.
- 2.5 Atajos de billetes (+1 por denominación, «Monto exacto»): HECHO.
- 2.6 Errores en lenguaje claro (fifo, cobro, compras, inventario, ventas): HECHO en los sitios tocados.
- 2.9 Estados de carga en export/import (botones «Exportando…»/«Importando…»): HECHO. PDF «Generando PDF…»: HECHO.
- Pendiente de la oleada 1: actualizar `tests/logger.test.js` (afirma el comportamiento anterior que la redacción debe impedir) y 14 tests que afirman comportamientos viejos (`fifo`, `property`, `inventario-ui`, `ventas-ui`) — oleada 3 (tests).

**Oleada 2 — terminada:** Sync y persistencia de Supabase + Código interno.
- Persistencia de sesión (requisito extra, prioritario): HECHO. Cliente con `persistSession`/`autoRefreshToken` explícitos; `restaurarSesionNube()` al arrancar; ante fallo de refresh transitorio NO se cierra sesión (reintenta, estado «Reconectando…»); solo se cierra si Supabase dice `refresh_token_not_found`/`invalid_grant`. Comprobado con tests de cliente falso (sesión restaurada tras «reinicio», refresh fallido no cierra sesión).
- 3.1 Sync de fondo cada 45 s con sesión activa y online (aunque el panel esté cerrado): HECHO.
- 3.2 Aviso visible (toast con «Sincronizar ahora») cuando la sync de fondo falla: HECHO.
- 3.3 Indicador: rojo solo ante error real; «Sin conexión»/«Sin sincronizar» en ámbar; umbral de 10 min → 24 h; nuevo estado «Reconectando…»: HECHO.
- 3.4 Reintento con backoff (3 intentos, 1 s → 2 s → 4 s, solo errores transitorios): HECHO.
- 3.5 `compactar()` tras sync exitosa: HECHO en nube; PENDIENTE en WiFi (oleada 3).
- 3.6 bulkGet en el motor de sync (precarga por tabla): HECHO.
- 3.7 Recordatorios de sync pendiente y deuda vencida (1/día): HECHO.
- Autosave atómico (temporal + rename) y aviso visible si falla: HECHO.
- Aviso de poco espacio (QuotaExceededError, 80 %/90 %): HECHO.
- 1.10 Diálogo al cerrar sesión (confirmación + PIN, borrar datos o conservarlos): HECHO.
- 4.1 Predicado de período centralizado (`enPeriodo`/`fechaMs` en fecha.ts, 8 sitios, sin `new Date` crudo): HECHO. Reutilización parcial: `generarReporte`/`cerrarPeriodo` siguen con sus propios totales porque usan rangos arbitrarios, no el período actual.
- 4.2 Pre-parseo de fechas a timestamp en insights/cuadre/historial: HECHO.
- 4.3 Insights optimizado (Map por id, sin `find()` en bucles): HECHO. Troceado/debounce del computed: PENDIENTE (cambiaría cuándo se actualiza el punto rojo).
- 4.4 Libro diario con debounce/coalescing (250 ms, promesa compartida): HECHO.
- 4.5 Esquema Dexie por composición (base + overrides), esquema efectivo idéntico por versión: HECHO. Hallazgo: la v10 nunca borró realmente `tgQueue` (en Dexie, omitir una tabla no la borra; haría falta `tgQueue: null`); el store vacío es inocuo pero la doc que dice que la v10 lo elimina no es exacta — queda para decidir si se hace una v11.
- 4.6 Catch vacíos con log de contexto (formato.ts y archivos del grupo): HECHO.
- 4.7 `useBackupStore` god store: PENDIENTE (refactor grande, no asignado).
- 4.8 Carga inicial full-table: PENDIENTE (grande, decisión de diseño).
- 4.9 Dynamic imports inefectivos eliminados (un solo mecanismo estático): HECHO.
- `window.db` solo en DEV (db.ts): HECHO.
- Limpieza sociosActivos/gastosOrdenadas: HECHO (salvo el re-filtro en ReportesView.vue:561, vista fuera del grupo — oleada 3).

**Oleada 3 — terminada:** Accesibilidad y tests.
- 5.1 Contraste ≥ 4,5:1 (variables `--pri-txt`/`--warn-txt`/`--ok-txt`, badges y textos oscurecidos en claro y oscuro) y textos críticos de 8-11 px subidos a ~11-12 px: HECHO.
- 5.2 Objetivos táctiles ~44 px (eliminar/editar/quitar, +/− de cantidad, cierre de buscador): HECHO (switches quedan en 46×26 px, por encima del mínimo WCAG de 24 px).
- 5.3 `<label>` asociados en los 8 formularios; PIN con teclado numérico + autocomplete: HECHO.
- 5.4 Botón atrás cubre Nube y WiFi (refs movidas a useUIStore; hayModalAbierto incluye todos los paneles): HECHO.
- 5.5 Arqueo enterrado al fondo de Reportes: PENDIENTE (requiere reordenar ReportesView; no se hizo).
- 5.6 `:focus-visible` con anillo de 3 px, `prefers-reduced-motion`, h2 en las 8 vistas: HECHO. Toasts de error 6 s (avisos 5 s) con aria-live: HECHO.
- 3.5 `compactar()` tras sync WiFi: HECHO.
- 6.1 Tests inestables: HECHO (limpieza de las 20 tablas antes de cada test; `vi.useFakeTimers` no es viable: congela fake-indexeddb).
- 6.2 Huecos de cobertura: PARCIAL (solo accesibilidad, 28 tests nuevos). Sigue pendiente: cambio de teléfono E2E, sync contra Supabase real, tests de notificaciones/autosave, y smoke/funcional de anular/arqueo/cierre/restaurar.
- 15 tests de comportamientos viejos actualizados: HECHO.

**Verificación final del coordinador (2026-11-28):** typecheck OK, lint OK, build OK, suite Vitest completa **80 archivos, 912 tests, todos pasan** (socios-ui 16/16 en aislamiento), smoke en Chromium real **16/16 TODO OK**. Sin commit ni push (lo hace el padre).

---

## 1. Seguridad y no perder dinero

### 1.1 El PIN no tiene bloqueo por intentos ni longitud mínima
- **Dónde:** `src/stores/useUIStore.ts:126-150` (`pedirPin`), `src/components/AjustesModal.vue:94-99,416-430`.
- **Qué:** ante un PIN incorrecto solo sale un toast y se puede reintentar
  indefinidamente, sin contador ni espera. El PIN nuevo acepta cualquier
  cadena de hasta 6 caracteres (el «4 dígitos» del placeholder no se valida).
- **Esfuerzo:** pequeño. **Impacto:** alto.

### 1.2 Importar un respaldo puede cambiar el PIN y toda la configuración
- **Dónde:** `src/stores/useBackupStore.ts:547-580` (`importarData`), `:277-290`
  (`validarEsquema` solo comprueba que `cfg` sea un objeto).
- **Qué:** la importación reemplaza `cfg` al completo, incluido `pin` y
  `pinActivo`. Un archivo manipulado podría fijar un PIN conocido o desactivar
  el PIN. Solución: no importar nunca `pin`/`pinActivo` desde el respaldo, y
  validar el resto de `cfg` campo a campo.
- **Esfuerzo:** pequeño. **Impacto:** alto.

### 1.3 El aviso de error del cobro puede mentir: la venta sí se guardó
- **Dónde:** `src/utils/watchdog.ts:5-21`, `src/composables/useCobro.ts:137,165-180`.
- **Qué:** el watchdog es solo un `Promise.race` con timeout de 15 s: al
  expirar muestra «Puede haber quedado a medias», pero la transacción Dexie
  sigue corriendo y la venta puede terminar guardándose. El usuario cree que
  no se cobró y puede cobrar la misma venta dos veces.
- **Esfuerzo:** mediano. **Impacto:** alto.

### 1.4 El autosave falla en silencio y su escritura no es atómica
- **Dónde:** `src/services/autosave.ts:48-82`, `src/services/backupFolder.ts:50-88`.
- **Qué:** si el autosave falla, el `catch` solo hace `console.error` (sin
  aviso visible) y un guardado concurrente se descarta sin reintento. El
  archivo se escribe directo, sin temporal + renombrado: un corte a mitad
  puede dejar un respaldo corrupto que solo se descubre al restaurar.
- **Esfuerzo:** pequeño-mediano. **Impacto:** alto.

### 1.5 Sin aviso de poco espacio en el teléfono
- **Dónde:** `src/composables/useStorageInfo.ts:48-56`, `src/components/AjustesModal.vue:150-185`.
- **Qué:** no hay ningún manejo de `QuotaExceededError` en todo `src/`. El
  espacio solo se mide al abrir Ajustes y solo cambia un color. Con el
  teléfono lleno, las escrituras fallan con un error genérico.
- **Esfuerzo:** mediano. **Impacto:** alto.

### 1.6 El enlace de vuelta de Google acepta tokens de cualquiera
- **Dónde:** `src/sync/nube.ts:163-196` (`alVolverDeGoogle`, `leerTokens`),
  `android/app/src/main/AndroidManifest.xml:26-32`.
- **Qué:** cualquier URL `tiendapro://auth` con `access_token`/`refresh_token`
  en el fragmento se acepta y se vincula la cuenta, sin `state` ni nonce.
  Una app o enlace malicioso podría vincular la cuenta del atacante y la sync
  empezaría a subirle la contabilidad.
- **Esfuerzo:** mediano. **Impacto:** alto.

### 1.7 La sync WiFi no autentica a la otra parte
- **Dónde:** `src/sync/webrtc.ts:24-30`, `src/sync/enlace.ts`, `src/components/SyncWifi.vue`.
- **Qué:** el canal WebRTC va cifrado (DTLS) pero sin PIN de emparejamiento ni
  huella: basta con el QR/código. Quien esté en la misma WiFi (o fotografíe
  el QR) recibe una copia completa del negocio y puede inyectar filas.
- **Esfuerzo:** mediano. **Impacto:** alto.

### 1.8 La sync no valida el contenido que recibe
- **Dónde:** `src/sync/motor.ts:79-84` (`esValida`), `supabase/migrations/0001_sync_nube.sql:47-72`.
- **Qué:** solo se comprueba tabla, id, `ts` numérico y `datos` objeto. Un
  `ts` arbitrario del emisor decide los conflictos y los datos se aplican sin
  pasar por los schemas Zod: montos negativos, fechas imposibles o una lápida
  con `ts` futuro que borra filas.
- **Esfuerzo:** mediano. **Impacto:** alto.

### 1.9 Las iteraciones PBKDF2 del respaldo cifrado las controla el archivo
- **Dónde:** `src/stores/useBackupStore.ts:188-198`.
- **Qué:** al importar, `kdf.iter` se lee del archivo sin mínimo ni máximo
  (`iter: 1` haría trivial la fuerza bruta) y no hay límite de intentos de
  contraseña. Solución: mínimo de iteraciones y tope de intentos.
- **Esfuerzo:** pequeño. **Impacto:** alto.

### 1.10 Cerrar sesión en la nube no borra los datos locales
- **Dónde:** `src/sync/nube.ts:198-205`.
- **Qué:** `salirDeNube()` solo cierra la sesión y borra el cursor; la
  IndexedDB completa queda en el teléfono y se mezcla con la siguiente cuenta.
- **Esfuerzo:** pequeño. **Impacto:** medio.

### 1.11 Datos en claro en reposo (hash del PIN incluido)
- **Dónde:** `src/db.ts`, `src/services/backupFolder.ts:38-70`,
  `src/stores/exportar.ts:59`.
- **Qué:** IndexedDB sin cifrar, autosave como gzip JSON en claro y el export
  plano incluye `cfg` con el hash del PIN. El export cifrado existe pero es
  opt-in y no cubre autosave/`backupAuto`.
- **Esfuerzo:** grande. **Impacto:** alto.

---

## 2. Vender y cobrar más rápido y sin errores

### 2.1 Vender varios productos exige reabrir el buscador por cada uno
- **Dónde:** `src/stores/useVentasStore.ts:143-146`, `src/views/VentasView.vue:37`.
- **Qué:** al añadir un producto se limpia la búsqueda y se cierra el
  desplegable. Vender 5 productos = 5 veces tocar buscador + escribir + tocar
  resultado. Mantener el buscador abierto y con el texto acelera el flujo más
  repetido de la app.
- **Esfuerzo:** pequeño. **Impacto:** alto.

### 2.2 Confirmar pago queda bajo la calculadora; sin calculadora no valida lo recibido
- **Dónde:** `src/views/VentasView.vue:268-310`, `src/composables/useCobro.ts:47,170-186`.
- **Qué:** con la calculadora abierta, «Confirmar Pago» queda al final y exige
  desplazar el modal. Y solo se valida que no falte dinero si la calculadora
  está abierta (cerrada por defecto): con ella cerrada, la venta se procesa
  sin preguntar cuánto se recibió. El tendero puede cobrar de menos sin aviso.
- **Esfuerzo:** pequeño/mediano. **Impacto:** alto.

### 2.3 «Limpiar carrito» borra toda la venta sin confirmación
- **Dónde:** `src/views/VentasView.vue:51,104-106`.
- **Qué:** vacía el carrito de un toque, sin confirmación ni deshacer, justo
  debajo de «Cobrar Venta». Lo mismo el × de cada línea.
- **Esfuerzo:** pequeño. **Impacto:** alto.

### 2.4 Ajuste de inventario (merma/sobrante) sin confirmación
- **Dónde:** `src/views/InventarioView.vue:220-270`.
- **Qué:** «Registrar ajuste» escribe en BD, consume lotes FIFO y genera
  asientos directamente. Una cantidad o motivo equivocado borra stock y valor
  real sin ninguna barrera.
- **Esfuerzo:** pequeño. **Impacto:** alto.

### 2.5 La calculadora de billetes exige rellenar 9 filas a mano
- **Dónde:** `src/composables/useCobro.ts:26`, `src/views/VentasView.vue:274-300`.
- **Qué:** 9 inputs de denominaciones fijas, sin botones «+1 billete», sin
  «monto exacto» ni campo único de «recibido». Además está oculta por defecto.
- **Esfuerzo:** mediano. **Impacto:** medio.

### 2.6 Errores técnicos volcados tal cual en toasts de 3 segundos
- **Dónde:** `src/utils/toast.ts:22-24`, `src/services/fifo.ts:27,55`,
  `src/stores/useBackupStore.ts:241,272,610,683,727`, entre otros.
- **Qué:** 10 sitios vuelcan `e.message` interno («No hay lotes disponibles»,
  «Lote con ventas: no editable»…) y 7 anteponen un genérico «Error: ». Los
  toasts duran 3 s y solo se ven 3 a la vez. Los errores de sync sí están en
  lenguaje claro; el problema es la inconsistencia.
- **Esfuerzo:** mediano. **Impacto:** alto.

---

## 3. Sincronización que no falle en silencio

### 3.1 La sync solo corre mientras el panel «Nube y cuenta» está abierto
- **Dónde:** `src/sync/nube.ts:48-98`, `src/components/CuentaNube.vue:50,104-115`.
- **Qué:** el ritmo automático (al abrir, al volver, cada 30 s) vive dentro del
  componente. Si se cierra el panel, no hay más sync hasta volver a abrirlo.
  Un temporizador en el store o en `App.vue` (solo con sesión activa) la haría
  realmente automática.
- **Esfuerzo:** mediano. **Impacto:** medio.

### 3.2 La sync automática falla en silencio; el reintento está escondido
- **Dónde:** `src/components/CuentaNube.vue:43-60,111,144-146`.
- **Qué:** si una vuelta falla, solo se escribe el aviso dentro del panel
  (invisible si está cerrado). No hay toast ni banner. Reintentar exige tocar
  el indicador y luego «Sincronizar ahora».
- **Esfuerzo:** pequeño. **Impacto:** alto.

### 3.3 El indicador se pone en rojo a los 10 minutos sin sync
- **Dónde:** `src/stores/useNubeStore.ts:19,33`, `src/components/SyncIndicador.vue:20-46`.
- **Qué:** con internet intermitente (lo normal en Cuba) el chip pasa gran
  parte del día en rojo aunque no haya ningún problema: los datos viven en el
  teléfono y la sync es solo respaldo. El rojo permanente enseña a ignorarlo
  justo cuando aparezca un error real.
- **Esfuerzo:** pequeño. **Impacto:** alto.

### 3.4 Sin reintento ni backoff en la vuelta de nube
- **Dónde:** `src/sync/nube.ts:55-98`.
- **Qué:** un error de red transitorio aborta toda la vuelta. Los cursores ya
  son reanudables, así que un reintento con backoff encaja sin cambiar nada.
- **Esfuerzo:** pequeño-mediano. **Impacto:** medio-bajo.

### 3.5 La tabla `cambios` crece sin límite: `compactar()` existe pero nadie la llama
- **Dónde:** `src/sync/seguimiento.ts:138-153` (solo la llama un test).
- **Qué:** cada alta, edición y borrado añade una fila para siempre. La primera
  sync hace `toArray()` de toda la tabla, así que su coste crece con la vida
  de la tienda. Basta llamar a `compactar(cursor)` tras una sync exitosa.
- **Esfuerzo:** pequeño. **Impacto:** medio-alto.

### 3.6 El motor de sync hace lecturas N+1 secuenciales por fila
- **Dónde:** `src/sync/motor.ts:134-160,199-258`.
- **Qué:** por cada cambio/fila remota, un `get()` + `ultima()` secuenciales.
  En la primera sync de una tienda con miles de ventas son miles de lecturas
  en serie. Solución: precargar marcas por tabla o `bulkGet`.
- **Esfuerzo:** mediano. **Impacto:** medio.

### 3.7 Recordatorios que faltan: sync pendiente y deuda vencida
- **Dónde:** `src/stores/useNotificacionesStore.ts:178-283`.
- **Qué:** los datos ya existen (tabla `cambios` + cursor en `syncMeta` para
  la sync pendiente; tabla `pasivos` con `vencimiento` para deudas). Falta
  avisar. También: nada suena con la app cerrada (todas las notificaciones
  dependen de un `setInterval` con la app abierta) y el chequeo de agotados
  solo corre tras vender.
- **Esfuerzo:** pequeño (avisos) / mediano (notificar con app cerrada). **Impacto:** alto.

---

## 4. Código que se mantenga sin romperse

### 4.1 El predicado «en el período actual» está duplicado en 8 sitios
- **Dónde:** `src/stores/useVentasStore.ts:91,108`, `useComprasStore.ts:38-39`,
  `useGastosStore.ts:41`, `useAjustesStore.ts:40`, `useCierresStore.ts:143-154`,
  `src/composables/useCuadre.ts:141`, `src/composables/useHistorial.ts:44-47`,
  `src/insights.ts:148`.
- **Qué:** en todos se repite `new Date(configStore.periodoInicio)` + filtro +
  `reduce`. Es el punto exacto donde ya hubo 3 bugs de `periodoInicio`: hoy
  2 sitios usan `inicioDiaLocal()` y 6 usan `new Date()` crudo. Además los
  mismos totales se calculan 3 veces (ventas, cierres, cuadre).
- **Esfuerzo:** mediano. **Impacto:** alto.

### 4.2 `new Date()` casi 200 veces; cada filtro vuelve a parsear las mismas fechas
- **Dónde:** `src/insights.ts` (~15 filtros sobre el mismo array),
  `src/composables/useCuadre.ts:141-148`, `src/stores/useVentasStore.ts:91-108`.
- **Qué:** en `generarRecomendaciones` una venta se parsea unas 15 veces por
  ejecución. Solución: un helper `enPeriodo(fecha)` (junto con 4.1) y/o
  pre-parsear a timestamp una sola vez.
- **Esfuerzo:** pequeño-mediano. **Impacto:** medio.

### 4.3 El motor de insights (648 líneas) se recalcula entero en cada cambio
- **Dónde:** `src/insights.ts`, `src/stores/useInsightsStore.ts:31-49`.
- **Qué:** un `computed` que depende de 8 tablas; cualquier venta o gasto
  dispara ~15 escaneos completos, con `productos.find()` dentro de bucles.
  Corre siempre (el punto rojo de la barra lo usa), no solo en el Dashboard.
- **Esfuerzo:** mediano. **Impacto:** medio.

### 4.4 El libro diario se reconstruye completo (9 tablas) en cada venta o compra
- **Dónde:** `src/services/libroDiario.ts:360-393`, disparado desde 6 sitios.
- **Qué:** 9 `toArray()` + `clear()` + `bulkPut()` de todos los asientos, sin
  coalescing ni debounce: 3 ventas seguidas son 3 reconstrucciones completas.
- **Esfuerzo:** mediano. **Impacto:** medio.

### 4.5 El esquema Dexie se repite 10 veces en `db.ts`
- **Dónde:** `src/db.ts:60-232`.
- **Qué:** cada versión re-lista las 20 tablas con sus índices; las versiones
  6-10 son copias casi idénticas. Un índice añadido debe repetirse a mano en
  todas las posteriores (ya hubo un bug silencioso así en la v8). Dexie exige
  el esquema completo por versión, pero se puede componer (base + overrides).
- **Esfuerzo:** pequeño-mediano. **Impacto:** medio.

### 4.6 29 `catch {}` vacíos; `App.vue` concentra 13
- **Dónde:** `src/App.vue:300,312,339,348,365,450,458,465,476,479,540,580`,
  `src/stores/useNubeStore.ts:41,59`, entre otros.
- **Qué:** muchos son best-effort legítimos, pero los de inicialización tragan
  fallos reales de IndexedDB sin dejar rastro (el mismo patrón del bug v8).
  Al menos los de la ruta de datos deberían loguear con contexto.
- **Esfuerzo:** pequeño. **Impacto:** medio.

### 4.7 `useBackupStore.ts` (758 líneas) mezcla UI, validación, importación y autosave
- **Dónde:** `src/stores/useBackupStore.ts`, `validarEsquema()` líneas 277-546.
- **Qué:** el archivo más grande de `src/`; ya existe `src/stores/importacion.ts`
  para parte de esto, pero la validación no se mudó allí.
- **Esfuerzo:** grande. **Impacto:** medio-bajo.

### 4.8 Carga inicial: todas las tablas completas en memoria al arrancar
- **Dónde:** `src/stores/recarga.ts:56-73`, `src/App.vue:481`.
- **Qué:** 14 `toArray()` en paralelo y cada store guarda su tabla entera en un
  `ref` reactivo. El arranque y la memoria crecen con el historial completo,
  aunque el usuario solo abra el Dashboard.
- **Esfuerzo:** grande. **Impacto:** bajo hoy, medio a futuro.

### 4.9 Bundle: precache PWA de 2,1 MB; dos dynamic imports inefectivos
- **Dónde:** `vite.config.ts:115-120`, `src/stores/useCapitalStore.ts:318,346`.
- **Qué:** `recarga.ts` y `@capacitor/app` se importan dinámicamente y también
  estáticamente, así que esos imports no separan nada y solo añaden complejidad.
- **Esfuerzo:** pequeño. **Impacto:** bajo.

---

## 5. Accesibilidad y pulido

### 5.1 Contraste por debajo de 4,5:1 y texto mínimo de 8–11 px
- **Dónde:** `src/styles.css:458-480,930-935,1115-1135` (badges `.ok/.low/.out`,
  `.pos/.neg`, toasts), `src/views/ProductosView.vue:147`.
- **Qué:** texto blanco sobre verde/ámbar/rojo/azul a 2,15–3,76:1 (el mínimo
  legible es 4,5:1) y decenas de textos a 8–11 px: importes, stock y estados.
  Con sol o brillo bajo cuesta leer lo más importante.
- **Esfuerzo:** pequeño. **Impacto:** alto.

### 5.2 Botones de acción demasiado pequeños (22–34 px)
- **Dónde:** `src/styles.css:1065-1075,1300-1315,2320,3111`,
  `src/views/VentasView.vue:51,57-85`, `src/views/DashboardView.vue:128`.
- **Qué:** editar/eliminar/quitar y descartar anomalías miden 22–33 px (el
  mínimo táctil cómodo son 44 px). Los principales sí miden ~48 px.
- **Esfuerzo:** pequeño. **Impacto:** alto.

### 5.3 Formularios sin `<label>`: 9 etiquetas para 69 campos
- **Dónde:** `src/views/VentasView.vue:8-13`, `ProductosView.vue:8-83`,
  `GastosView.vue:15-33`, `SociosView.vue:13-22`, entre otros.
- **Qué:** casi todos los campos usan solo `placeholder`. Con TalkBack el campo
  se anuncia sin propósito. El PIN al pedirlo tampoco trae teclado numérico
  (`src/stores/useUIStore.ts:126-147` → `ModalPrompt.vue:10-17`).
- **Esfuerzo:** mediano. **Impacto:** alto.

### 5.4 El botón atrás de Android no cubre Nube ni WiFi
- **Dónde:** `src/main.ts:67-118`, `src/stores/useUIStore.ts`.
- **Qué:** atrás cierra cobro, ajustes, Más, búsqueda… pero no «Nube y cuenta»
  ni «Compartir por WiFi»: con esos paneles abiertos, atrás salta al dashboard
  o minimiza la app.
- **Esfuerzo:** pequeño. **Impacto:** medio.

### 5.5 Arqueo enterrado al fondo de Reportes; formularios largos
- **Dónde:** `src/views/ReportesView.vue:214-`, `src/views/ProductosView.vue:1-100`.
- **Qué:** el arqueo diario exige bajar pasando «Cerrar Período» y todo el
  Libro Diario. El formulario de producto es muy largo y el Guardar queda
  lejos. El swipe entre secciones existe pero no hay ninguna pista visual.
- **Esfuerzo:** pequeño/mediano. **Impacto:** medio.

### 5.6 Sin `:focus-visible`, sin `prefers-reduced-motion`, sin encabezados
- **Dónde:** `src/styles.css` (cero `:focus-visible`, cero
  `prefers-reduced-motion`), vistas sin `<h2>`.
- **Qué:** con teclado o TalkBack no se sabe dónde está el foco; las
  animaciones infinitas (puntos que pulsan, shimmer) no se pueden desactivar;
  sin encabezados, recorrer la app por voz es lineal y lento.
- **Esfuerzo:** pequeño. **Impacto:** medio.

---

## 6. Tests

### 6.1 Tests inestables: socios-ui y ventas-ui fallan según el orden
- **Dónde:** `tests/ventas-ui.test.js:74-81`, `tests/socios-ui.test.js:78-90`,
  `tests/setup.js:1`.
- **Qué:** `fake-indexeddb` compartido y limpieza parcial (nadie limpia
  `cambios`, `descartes`, `syncMeta`, `pasivos` ni `auditorias`), y polling con
  timeout real en vez de relojes falsos. Causa conocida de los fallos
  intermitentes.
- **Esfuerzo:** pequeño-mediano. **Impacto:** medio.

### 6.2 Huecos de cobertura
- Cambio de teléfono de punta a punta (BD vacía + importar; el momento de
  mayor riesgo de pérdida de datos). Esfuerzo mediano, impacto alto.
- Sync contra Supabase real (hoy solo cliente falso en memoria). Esfuerzo
  mediano, impacto medio.
- Notificaciones de stock/arqueo/cierre (solo el recordatorio de respaldo
  tiene tests). Esfuerzo pequeño, impacto medio.
- Fallos de autosave/`backupAuto` y de las operaciones en dos pasos
  (arqueo y cierre de período no son transaccionales:
  `src/stores/useCajaStore.ts:132-165`, `src/stores/useCierresStore.ts:135-210`).
  Esfuerzo pequeño, impacto medio.
- Accesibilidad: ningún test (ni axe ni contraste). Esfuerzo pequeño,
  impacto bajo-medio.
- Smoke/funcional no cubren anular venta, arqueo, cierre ni restaurar
  respaldo en el navegador real. Esfuerzo mediano, impacto medio.

---

## Lo que se verificó que está bien (para no «arreglar» lo que funciona)

- La venta es atómica (transacción Dexie con stock fresco y aborto ante
  sobreventa); igual las anulaciones. Un apagón a mitad de cobro no deja venta
  sin descuento ni descuento sin venta.
- La sync es reanudable por diseño (cursores, push en lotes de 500, pull por
  ventana, idempotencia en el servidor).
- Stock con `stockMap` O(1); toasts y modales centralizados; índices
  compuestos desde la v6; todas las dependencias de `package.json` se usan;
  cero TODO/FIXME/HACK reales en `src/`.
