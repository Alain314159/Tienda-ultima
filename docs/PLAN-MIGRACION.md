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
- [ ] `vitest --coverage` — cobertura de tests (pendiente)
- [ ] `rollup-plugin-visualizer` — análisis de bundle (pendiente)

---

## 🎯 FASE 5 — TypeScript ✅ COMPLETADA

- [x] Todos los módulos `src/**` migrados a `.ts`
- [x] Todos los SFCs con `lang="ts"`
- [x] `src/types/index.ts` — interfaces de dominio
- [x] `src/db.ts` — Dexie tipado (`TiendaProDB` con `Table<T, string>`)
- [x] SRP: `db.js` dividido en `utils/numero.ts`, `utils/formato.ts`, `utils/id.ts`
- [x] tsconfig strict (+ `noImplicitAny: false`, `useUnknownInCatchVariables: false`
      durante la transición)
- [x] `index.html` → `main.ts`
- [ ] `@tanstack/vue-form` (opcional, ahora posible al estar todo en script setup)
- [ ] Estructura feature-based `src/features/` (opcional, evaluar)

---

## ✅ Completado (histórico)

- [x] Bugs críticos de render (`.value`, `calcFIFO`, etc.)
- [x] ESLint 10 + Prettier 3 + Stylelint
- [x] Husky + lint-staged + commitlint
- [x] Dividir App.vue en 8 vistas (`src/views/`) con Vue Router 5 lazy loading
- [x] Actualizar stack completo (vue 3.5, vite 8, vitest 5, jspdf 4)
- [x] Limpieza: App.vue.backup/.bak2, 8 servicios muertos, 12 scripts fix-*.mjs,
      stores duplicados (sociosStore, utilitiesStore, calculosStore)
