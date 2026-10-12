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

## 🎯 FASE 2 — Librerías (en orden)

### 2.1 — `vue-sonner` (toasts)

**Objetivo:** reemplazar `toastMsg()` + `AppToast.vue` por `vue-sonner`.

**Motivo:** es la más fácil (función global, sin setup), mayor ganancia inmediata.

- [x] Auditar usos de `toastMsg()` (121, todos en App.vue)
- [x] `<Toaster />` en App.vue
- [x] `toastMsg()` como wrapper de `toast()` (ok→success, warn→warning, bad→error)
- [x] `AppToast.vue` eliminado
- [x] Build + 15/15 tests + ESLint 0 errores + toast renderiza

### 2.2 — `reka-ui` (modales)

**Objetivo:** reemplazar `ModalConfirm.vue`, `ModalPrompt.vue`, `pedirPin()`.

- [x] `ModalConfirm.vue` con reka-ui AlertDialog + script setup (misma API, 16 call sites intactos)
- [x] `ModalPrompt.vue` con reka-ui Dialog + script setup
- [x] Accesibilidad: focus trap, Escape, click-fuera → cancelar
- [x] Build + 15/15 tests + ESLint 0 + smoke 16/16

### 2.3 — `dexie-reactive` (reactividad IndexedDB) — ⏸️ POSTPUESTO

**Decisión:** salteado. `useLiveQuery` es un composable que necesita effect scope;
los stores se instancian fuera de componentes. Los stores ya funcionan con
`ref` + `cargarXxx()` manual. Alto riesgo, bajo beneficio. Evaluar a futuro
para vistas específicas, no para los stores.

### 2.4 — `@tanstack/vue-form` + Zod (formularios)

**Objetivo:** reemplazar validación manual.

- [ ] Definir schemas Zod para productos, compras, gastos
- [ ] Migrar formulario piloto (ProductosView)
- [ ] Verificar build + smoke test

---

## 🎯 FASE 3 — Composables (extraer de App.vue)

Extraer por responsabilidad. Cada uno debe poder describirse en una oración.

- [ ] `useHistorial` — paginación/agrupación de historial (9 métodos)
- [ ] `useGraficos` — Chart.js (6 métodos)
- [ ] `useNotificaciones` — notificaciones nativas + stock (8 métodos)
- [ ] `useTelegram` — comunicación con el bot (15 métodos)
- [ ] `useBackup` — export/import/restore (~10 métodos)
- [ ] `usePIN` — verificación de PIN

---

## 🎯 FASE 4 — Calidad

- [ ] `vue-doctor` — análisis integral
- [ ] `madge --circular src/` — dependencias circulares
- [ ] `vitest --coverage` — cobertura de tests
- [ ] `rollup-plugin-visualizer` — análisis de bundle

---

## 🎯 FASE 5 — Opcional / Largo plazo

- [ ] Migrar `App.vue` completo a `<script setup>`
- [ ] Migrar vistas y stores a TypeScript
- [ ] Feature-based structure (`src/features/`)

---

## ✅ Completado

- [x] Bugs críticos de render (`.value`, `calcFIFO`, etc.)
- [x] ESLint 10 + Prettier 3 + Stylelint
- [x] Husky + lint-staged + commitlint
- [x] Dividir App.vue en 8 vistas (`src/views/`)
- [x] Patrón provide/inject (`appCtx`)
- [x] Utilidades globales en `main.js`
- [x] Vue Router 5 con lazy loading
- [x] Vistas a `<script setup>`
- [x] Eliminar 10 stores huérfanos
- [x] Actualizar stack a últimas versiones
