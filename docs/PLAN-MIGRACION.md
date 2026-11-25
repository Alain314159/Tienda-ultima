# Plan de Migración — Tienda Pro

Documento vivo. Marcar `[x]` al completar. Actualizar al añadir tareas.

---

## 📌 Principios

1. **Una librería a la vez** — terminar 100% antes de pasar a la siguiente.
2. **El que toca, migra** — archivos que se tocan se migran a `<script setup>` + TypeScript.
3. **Extraer al tocar** — si la librería toca algo de App.vue que estaba pendiente de extraer, se extrae ahora.
4. **Sin builds excesivos** — build + tests solo al cerrar una fase, no en cada paso.
5. **Commit + push al cerrar cada fase.**

---

## 🎯 FASE 2 — Librerías

### 2.1 — `vue-sonner` (toasts) ✅

- [x] `toastMsg()` como wrapper de `toast()` (ok→success, warn→warning, bad→error) — ahora en `src/utils/toast.ts`
- [x] `<Toaster />` en App.vue
- [x] `AppToast.vue` eliminado

### 2.2 — `reka-ui` (modales) ✅

- [x] `ModalConfirm.vue` con reka-ui AlertDialog + script setup
- [x] `ModalPrompt.vue` con reka-ui Dialog + script setup
- [x] Accesibilidad: focus trap, Escape, click-fuera → cancelar

### 2.3 — `dexie-reactive` — ⏸️ POSTPUESTO

**Decisión:** salteado. Los stores funcionan con `ref` + `cargarXxx()` manual.
Alto riesgo, bajo beneficio. Evaluar a futuro para vistas específicas.

### 2.4 — Zod (validación) — parcial

- [x] `src/schemas/index.ts` con schemas Zod + helper `validar()`
- [x] Validación integrada en `useProductosStore.guardarProducto`
- [ ] Integrar en otros stores (compra, gasto, socio, retiro) al tocarlos

---

## 🎯 FASE 3 — Composables (extraer de App.vue) ✅ COMPLETADA

App.vue pasó de **5577 líneas / 167 métodos (Options API)** a **~680 líneas de
shell con `<script setup>`**. Cada responsabilidad tiene un único dueño:

- [x] `useHistorial` — paginación/agrupación de historial por períodos
- [x] `useGraficos` — Chart.js (barras + dona, carga dinámica)
- [x] `useNotificaciones` → `useNotificacionesStore` (nativos + stock)
- [x] `useTelegram` → `useTelegramStore` (bot, backups, cola, rotación)
- [x] `useBackup` → `useBackupStore` (export/import/restore/cifrado)
- [x] `usePIN` → `useUIStore.pedirPin()`
- [x] `useGestos` — swipe horizontal + pull-to-refresh
- [x] `useCobro` — modal de cobro + procesamiento FIFO de la venta
- [x] `useCompartir` — precios/existencia por WhatsApp/clipboard
- [x] `useStorageInfo` — persistencia y cuota del navegador
- [x] `useCuadre` — cuadre por período + PDF (`services/pdf.ts`)

### Stores nuevos (Pinia)

- [x] `useUIStore` — modales, confirm/prompt (API promisificada `preguntar()`), PIN, scroll-lock
- [x] `useInsightsStore` — recomendaciones/anomalías
- [x] `useTelegramStore`, `useBackupStore`, `useNotificacionesStore`

### Componentes extraídos del template de App.vue

- [x] `AjustesModal.vue` (~550 líneas de ajustes)
- [x] Cobro/Retiro/Aporte/ShareSheet movidos a sus vistas dueñas

### God-object eliminado

- [x] `APP_CTX` / `useApp()` / Proxy sobre la instancia — ELIMINADOS
- [x] Las 8 vistas usan stores + composables directamente
- [x] Cada vista posee sus formularios (compraForm, prodForm, gastoForm, …)
- [x] `main.js` desacoplado: botón back usa `useUIStore`, autosave usa `datosDeStores()`

### Bugs corregidos durante la división

- [x] `ajustesAbierto` duplicado (App.vue data + useAjustesStore): el scroll-lock
      revisaba el del store mientras el template usaba el local → nunca se activaba
- [x] `ventasStore.histVentasMostrados` no existía: el historial de ventas del
      período actual no renderizaba
- [x] `f.usados` (undefined) en `procesarVenta` y mermas: el servicio FIFO
      devuelve `lotesUsados` → registrar una venta lanzaba TypeError
- [x] Búsqueda del historial de ventas filtraba por `busqVenta` (productos)
      en vez de `busqHist`

---

## 🎯 FASE 4 — Calidad ✅

- [x] ESLint 10 + typescript-eslint + Prettier 3 + Stylelint (0 errores)
- [x] `vue-tsc --noEmit` — 0 errores (`npm run typecheck`)
- [x] `madge --circular src/` — sin dependencias circulares
- [x] Tests de montaje: app completa + 8 vistas renderizan sin warnings
      (`tests/mount.test.js`, usa happy-dom + fake-indexeddb)
- [x] `vitest --coverage` — cobertura con umbrales anti-regresión (provider v8,
      `npm run test:coverage`; líneas 33 / branch 17 — subir al mejorar la suite)
- [x] `rollup-plugin-visualizer` — `npm run build:analisis` genera `bundle-report.html`
      (pdf 425K, charts 188K y mathjs 137K van en chunks diferidos, no en el arranque)

---

## 🎯 FASE 5 — TypeScript ✅ COMPLETADA

- [x] Todos los módulos `src/**` migrados a `.ts`
- [x] Todos los SFCs con `lang="ts"`
- [x] `src/types/index.ts` — interfaces de dominio
- [x] `src/db.ts` — Dexie tipado (`TiendaProDB` con `Table<T, string>`)
- [x] SRP: `db.js` dividido en `utils/numero.ts`, `utils/formato.ts`, `utils/id.ts`
- [x] tsconfig strict COMPLETO (`noImplicitAny: true`, `useUnknownInCatchVariables: true`;
      382 errores de la transición corregidos — sin `any` ni `@ts-ignore`)
- [x] `index.html` → `main.ts`
- [ ] `@tanstack/vue-form` (opcional, ahora posible al estar todo en script setup)
- [ ] Estructura feature-based `src/features/` (opcional, evaluar)

---

## 🎯 ENDURECIMIENTO POST-AUDITORÍA (2026-10-14) ✅

Continuación de la auditoría de ruedas reinventadas con foco en calidad y seguridad:

- [x] **CI quality gates**: `quality.yml` reutilizable (lint + typecheck + tests
      con cobertura + build). `deploy.yml` y `android.yml` dependen de él
      (`needs: quality`); `ci.yml` cubre ramas de trabajo y PRs. Antes un commit
      roto podía llegar a Pages/APK sin que nada se quejara.
- [x] **Cobertura con umbrales** (`@vitest/coverage-v8`): líneas 33 / funciones 22 /
      statements 31 / branch 17 — trinquete anti-regresión.
- [x] **TypeScript strict total**: `noImplicitAny` + `useUnknownInCatchVariables`
      activados; 382 errores corregidos sin `any` ni `@ts-ignore`.
- [x] **BUG CRÍTICO corregido** (destapado por el modo estricto): `guardarProducto`
      perdió en la división SRP la generación de `id` al crear y la preservación
      del original al editar → crear/editar producto desde la vista lanzaba
      `DataError` de IndexedDB. Tests reescritos con la forma real del form
      (los anteriores pasaban `{id}` y enmascaraban el bug).
- [x] **BUG corregido**: `GlobalSearch` filtraba archivados en el índice MiniSearch
      pero no en el fallback por subcadena — los archivados se colaban.
- [x] **`TG_APP_KEY` fuera del repo público**: `import.meta.env.VITE_TG_APP_KEY`,
      `.env.example`, secret en GitHub Actions, inyección en los 3 builds.
      Pendiente para el dueño: rotar la key en el Cloudflare Worker (la actual
      quedó expuesta en el historial git).
- [x] **Tests de comportamiento**: 156 tests (antes 121) — servicio calculadora
      (porcentajes relacionales, lista blanca anti-inyección, carga diferida) y
      componentes Calculator + GlobalSearch con @vue/test-utils.
- [x] **Análisis de bundle**: `npm run build:analisis` → `bundle-report.html`.

---

## 🎯 PULIDO FINAL 190% (2026-10-14) ✅

Ronda de pulido a fondo tras el endurecimiento: cobertura de la lógica nuclear
y cierre de los TODOs contables que quedaban en el código.

### Tests de la lógica nuclear (+89, total 245)

Módulos antes casi sin cobertura, ahora con tests de comportamiento:
`useCobro` (11% → transacción FIFO completa, venta con pérdida, conteo de
billetes, rollback), `useCuadre` (7% → P&G, subfilas por lote, totales),
`useGraficos`, `storage`, `telegram`, `pdf`, `autosave`, `importacion`,
`cierres`/`caja`/`mermas`. Cobertura global: 35.7% → **47.1% líneas**
(trinquete subido a 44/31/41/21).

### TODOs contables conectados (antes siempre en 0)

- `saldoCaja` descuenta las compras del período (no anuladas).
- `comprasPeriodo` de cierres delega en `comprasStore.comprasPeriodo`.
- `gananciaNetaPeriodo` resta mermas del período (nuevo `mermasPeriodo`).
- `cerrarPeriodo` registra compras, mermas y `cajaFinal` reales.
- `useCuadre` excluye compras anuladas del reporte.

### 3 bugs reales corregidos (destapados por los tests nuevos)

1. **COGS inflado en cada cierre**: `cerrarPeriodo` multiplicaba `it.costo`
   (costo TOTAL de la línea, así lo guarda `useCobro`) por la cantidad otra
   vez → cierre con COGS x N y `gananciasAcumuladas` falseadas.
2. **Efectivo inicial duplicado en caja**: `saldoCaja` sumaba `capitalTotal`
   (que ya incluye `capitalInicial`) sobre `ini`.
3. **Retiros y ganancia neta**: documentado por qué NO se restan los retiros
   de `gananciaNetaPeriodo` (son distribuciones; `gananciaDisponible` ya los
   descuenta — restarlos ahí sería doble conteo).

### Otras decisiones

- `useCajaStore` se instancia lazy dentro de `cerrarPeriodo` para evitar el
  ciclo de inicialización capital → cierres → caja → capital.
- Eliminado `margenPeriodo` muerto de `useComprasStore` (siempre '0.00').
- `GITHUB_TOKEN` de StatusPanel → `VITE_GITHUB_TOKEN` (+ `.env.example`).

---

## ✅ Completado (histórico)

- [x] Bugs críticos de render (`.value`, `calcFIFO`, etc.)
- [x] ESLint 10 + Prettier 3 + Stylelint
- [x] Husky + lint-staged + commitlint
- [x] Dividir App.vue en 8 vistas (`src/views/`) con Vue Router 5 lazy loading
- [x] Actualizar stack completo (vue 3.5, vite 8, vitest 5, jspdf 4)
- [x] Limpieza: App.vue.backup/.bak2, 8 servicios muertos, 12 scripts fix-*.mjs,
      stores duplicados (sociosStore, utilitiesStore, calculosStore)

---

## 🎯 RONDA 190% — CONTABILIDAD COMPLETA + NAVEGADOR REAL (2026-10-14) ✅

Objetivo del dueño: "asegúrate que la contabilidad esté completa, automatiza
un navegador, haz build web y úsala, más tipos de pruebas, sé creativo".

### Contabilidad

1. **saldoCaja acumulativo (fix crítico)**: mezclaba totales de todo el
   histórico (capital, aportes, retiros, movCaja) con totales de solo el
   período (ventas, compras). Tras cada cierre, la caja "perdía" el efectivo
   del período cerrado → arqueos descuadrados → ajustes fantasma acumulados.
   Ahora usa `ventasTotal`/`comprasTotal` (histórico no anulado): la caja es
   un balance de efectivo físico, no un total de período.
2. **Libro diario de partida doble** (la tabla `asientos` existía en el
   esquema Dexie desde la v3 pero nunca se escribió): generador puro en
   `services/libroDiario.ts` que se regenera completo tras cada mutación
   (auto-reparable, idempotente, excluido de backups). Cuentas: Caja,
   Inventario, Capital, Ingresos, Costo de ventas, Gastos, Mermas, Retiros
   de ganancia, Ajustes de caja, Pagos fuera de caja, Sobrantes.
   UI en Reportes: balanza de comprobación + diagnóstico que cruza los
   saldos del libro contra el sistema (caja / inventario / resultado).
3. **PDF**: PATRIMONIO NETO real (capital + ganancias − retiros; antes era
   capital + inventario, mezcla de conceptos) + filas de retiros
   acumulados y gastos pagados fuera de caja (partida conciliatoria).
4. Cierre de período registra `numVentas`; eliminado `registrarVenta`
   muerto (guardaba costo unitario — esquema divergente del flujo real).
5. Historial de cierres: leía `c.totalVentas`/`c.fechaCierre` (campos que
   nunca se guardaron) → mostraba $0.00 y fecha vacía.

### Bug grave de UI (cazado usando la app con navegador automatizado)

`ModalConfirm`/`ModalPrompt` (reka-ui) portalan su Content a `<body>` como
hermano del overlay → `position: static` al final del flujo del documento →
**nunca centrados y, en páginas largas, directamente fuera de pantalla**
(botón Confirmar a y=888 con viewport de 844). Los diálogos de confirmación
eran invisibles en móvil. Fix: `body > .modal-box { position: fixed;
inset: 0; margin: auto }`.

### Pruebas (259 → 260 unit + E2E real en verde)

- +12 tests de libro diario (partida doble, balanza, idempotencia,
  cross-checks contables contra los getters del sistema).
- +3 tests de caja acumulativa (regresión: cerrar período NO resetea caja;
  arqueo cuadra tras cierre).
- Spec funcional E2E resucitado y puesto en verde (20/20): flujo contable
  completo en Chromium real con validación de IndexedDB y libro balanceado.
  Fixes del spec: onboarding, placeholders actuales, helper de modales
  robusto (filter visible + waitFor), fórmula de caja sin doble conteo.

### CI (pruebas que no se pueden hacer a mano)

- `e2e.yml` (reutilizable): E2E smoke+funcional contra `vite preview` +
  Lighthouse con presupuesto trinquete (perf ≥ 70, a11y ≥ 85, bp ≥ 90).
- Gates en `deploy.yml` y `android.yml`: nada se publica (web ni APK) sin
  pasar quality + E2E. El bug del modal solo era detectable así.

### Rendimiento (Lighthouse perf 69 → 76, TBT 350 → 180 ms)

- `modulePreload.resolveDependencies`: pdf-vendor (428 KiB jsPDF) y
  html2canvas ya no se precargan al arranque.
- MiniSearch pasa a import dinámico (carga al abrir la búsqueda global,
  degradación suave a subcadena mientras llega).

### Trinquetes

- Cobertura: líneas 44→48, funciones 31→36, statements 41→45, branches
  21→25 (actual: 48.6/36.0/45.9/25.8).

## 🎯 RONDA 190% (II) — PROPERTY TESTING + BALANCE GENERAL + STRESS CI (2026-10-14) ✅

Continuación de la ronda 190%. Cinco commits: `49545eb`, `2185bb7`, `cc868a6`,
`9467329`, `adf1788`.

### Contabilidad

- **Bug COGS con ítems anulados**: el P&L de useCuadre, la tabla por
  (producto, costo, precio) y `cerrarPeriodo` sumaban el costo de ítems
  anulados dentro de ventas activas (el libro diario sí filtraba): un ítem
  anulado inflaba el COGS y hundía la ganancia del período. Corregido en los
  tres sitios + insight "ventas bajo costo" + tests de regresión.
- **Balance General (estado de situación)**: `balanceGeneral()` pura en
  libroDiario.ts — Activo (Caja + Inventario) = Capital + Resultado histórico
  integral − Retiros de ganancia + Pagos fuera de caja, con la identidad
  exacta Σdeudores = Σacreedores. El "resultado integral" añade al P&L
  clásico los sobrantes de inventario y los ajustes de arqueo. UI en Reportes
  con check ✓/✗ de cuadre.
- **Bug de redondeo no idempotente**: `m(m(x)) ≠ m(x)` en ~3.7% de valores
  con |x| ≳ 1e11 — el épsilon incondicional empujaba valores ya sobre el
  punto de malla. Ahora solo se corrige lo pegado a la mitad exacta y solo
  mientras eps < 0.25 (sin ambigüedad posible). Casado por property testing;
  verificado con 300k muestras por década de magnitud.
- **eliminarGasto del store** no borraba el espejo movCaja (la Vista sí):
  ambos caminos correctos ahora.

### Property-based testing (tipo de prueba nuevo: fast-check)

`tests/property.test.js` — 20 propiedades × 100-200 casos aleatorios:

- **dinero**: idempotencia de m() en el dominio representable (±1e11),
  simetría half-away-from-zero, cota de error de sumas, medio paso máximo.
- **FIFO**: conservación de cantidad, costo = Σ(cant×costo), orden por
  fecha, aislamiento por producto, nunca sobreconsume un lote.
- **libro diario**: partida doble SIEMPRE balanceada, **ECUACIÓN
  FUNDAMENTAL** (Caja del libro === caja recalculada de forma independiente
  de los datos fuente), P&L cruzado, idempotencia, invarianza a
  permutaciones, exclusión de anulados, monotonicidad, y Balance General
  Activo = Patrimonio para cualquier libro aleatorio.

### Bug cazado usando la app real (navegador automatizado)

- **v-memo congelaba la expansión del historial de ventas**:
  `v-memo=[v.id, v.anulada, v.total, v.ganancia]` no incluía
  `ventaExpandida` → el clic actualizaba el store pero el item jamás se
  re-renderizaba → **la anulación por ítem era inalcanzable en producción**
  (solo en períodos cerrados, sin v-memo). Fix + test de regresión montando
  VentasView (verificado que falla con el v-memo viejo).
- Sesión completa verificada en vivo: socio+aporte → productos → compras
  (guard de "Caja insuficiente" validado) → ventas → **anulación parcial**
  (total 175→75, lote revertido, asientos venta:75/costo:45) → balanza
  $7,020 balanceada → balance general $5,080 = $5,080 → diagnóstico 3/3 ✓
  → cuadre P&L COGS $120 (sin los $40 anulados) → PDF → búsqueda difusa,
  modo oscuro y calculadora — sin errores de consola.

### CI: pruebas imposibles de ejecutar localmente

- `e2e-matrix.yml`: **matriz cross-browser** (chromium / firefox / webkit,
  viewport móvil) corriendo smoke + funcional completo. No es gate de deploy
  (flakiness de webkit no debe bloquear): alerta temprana en PRs + cron
  semanal.
- `tests/stress.spec.mjs`: dataset de tienda real (30 productos, 90 lotes,
  1500 ventas, 200 gastos, 100 mermas) vía bulkPut directo; mide arranque,
  historial paginado, cuadre y libro con umbrales (15s/10s/25s) y partida
  doble balanceada (3288 asientos en la verificación local: 4.4s/0.09s/0.67s).
- smoke/funcional refactorizados a multi-navegador (`BROWSER` env).

### Trinquetes

- Cobertura: statements 45→46, branches 25→26 (actual: 49.2 líneas /
  36.8 funciones / 46.5 statements / 26.8 branches).
- Tests: 284 unit + 20 propiedades (dentro de las 284) + E2E 22 checks +
  stress 4 mediciones.
