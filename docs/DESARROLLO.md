# Desarrollo — Tienda Pro v6.0.0

Documentación técnica para quien mantiene o modifica la app. La documentación de uso está en [MANUAL-USUARIO.md](MANUAL-USUARIO.md); la de sincronización, en [SINCRONIZACION.md](SINCRONIZACION.md) y [PLAN-CUENTAS-Y-SINCRONIZACION.md](PLAN-CUENTAS-Y-SINCRONIZACION.md).

## Stack

| Capa | Tecnología |
| --- | --- |
| Framework | Vue 3.5 + TypeScript, `<script setup>`, Composition API |
| Bundler | Vite 8 |
| Estado | Pinia (un store por responsabilidad) |
| Router | Vue Router 5, hash history, lazy loading por vista |
| Datos locales | Dexie.js 4 sobre IndexedDB (`TiendaProDB`) |
| UI | reka-ui (modales accesibles), vue-sonner (toasts), @lucide/vue (iconos), Chart.js + vue-chartjs |
| Validación | Zod (`src/schemas/`) |
| Búsqueda | MiniSearch (carga diferida, tolerante a errores de tipeo) |
| PDF | jsPDF + jspdf-autotable |
| PWA | vite-plugin-pwa (Service Worker) |
| Nube | @supabase/supabase-js (solo Auth con Google y las funciones RPC de sync) |
| WiFi | WebRTC sin STUN/TURN (`iceServers: []`), QR con `qrcode`/`jsqr`, códigos en Base45 |
| APK | Capacitor 8 (`com.tiendapro.app`), notificaciones locales, Capgo para OTA |
| Tests | Vitest (unitarios + montaje de la app), Playwright (smoke y funcional) |
| Calidad | ESLint, Stylelint, Prettier, vue-tsc, commitlint, Husky |

La app es **offline-first y sin backend propio**: todo vive en el navegador/teléfono; Supabase solo guarda la copia de sincronización.

## Estructura de carpetas

```
Tienda-ultima/
├── .github/workflows/   # CI y despliegue (ver más abajo)
├── android/             # Proyecto nativo Capacitor
├── docs/                # Esta documentación
├── public/              # Iconos PWA, privacidad.html
├── src/
│   ├── App.vue          # Shell: encabezado, SyncIndicador, BottomNav, modales
│   ├── main.ts          # Entry point + Service Worker + botón atrás nativo
│   ├── db.ts            # Dexie tipado (TiendaProDB, versiones 1-10)
│   ├── types/           # Interfaces de dominio (Producto, Venta, ...)
│   ├── constants.ts     # Constantes (categorías de gasto, métodos de pago, ...)
│   ├── insights.ts      # Motor de recomendaciones y anomalías
│   ├── router/          # 8 rutas con lazy loading (hash history)
│   ├── sync/            # Motor de sincronización + transportes
│   ├── stores/          # Pinia: un store por responsabilidad
│   ├── composables/     # useCobro, useCuadre, useGestos, useGraficos, ...
│   ├── components/      # AjustesModal, BottomNav, SheetMas, SyncWifi, ...
│   ├── views/           # 8 vistas (una por ruta)
│   ├── services/        # fifo, backup, pin, pdf, libroDiario, autosave, ...
│   ├── utils/           # fecha, formato, numero, id, toast, ...
│   └── styles.css
├── supabase/migrations/ # 0001_sync_nube.sql (tabla sync_registros + RPC)
├── tests/               # Vitest + Playwright (smoke, funcional, estrés)
├── capacitor.config.json
├── vite.config.ts       # base '/Tienda-ultima/' en web, './' en Capacitor
└── package.json
```

### Rutas

| Ruta | Vista | Sección |
| --- | --- | --- |
| `/dashboard` | `DashboardView.vue` | Inicio |
| `/ventas` | `VentasView.vue` | Ventas |
| `/compras` | `ComprasView.vue` | Compras |
| `/productos` | `ProductosView.vue` | Productos |
| `/inventario` | `InventarioView.vue` | Inventario y ajustes |
| `/socios` | `SociosView.vue` | Socios, capital y repartos |
| `/gastos` | `GastosView.vue` | Gastos operativos |
| `/reportes` | `ReportesView.vue` | Reportes, contabilidad, cierres y arqueos |

La barra inferior muestra Inicio, Ventas, Compras e Inventario; el resto vive en `SheetMas.vue` (botón **Más**): Productos, Gastos, Socios, Reportes, Compartir por WiFi, Nube y cuenta, Ajustes.

### Stores principales

| Store | Responsabilidad |
| --- | --- |
| `useConfigStore` | Configuración (`cfg`): tema, PIN, nombre, umbrales, período |
| `useProductosStore` / `useLotesStore` | Catálogo y lotes |
| `useVentasStore` | Ventas, anulaciones, FIFO (vía `services/fifo.ts`) |
| `useComprasStore` | Compras y creación de lotes |
| `useAjustesStore` | Mermas y sobrantes |
| `useCajaStore` | Movimientos de caja y arqueos |
| `useCapitalStore` | Capital, retiros, socios y repartos |
| `useGastosStore` | Gastos operativos |
| `useCierresStore` | Cierres de período y cifras del período |
| `useBackupStore` | Exportar/importar, autosave, restaurar |
| `useNubeStore` | Estado de sync en la nube (`al-dia`, `sincronizando`, `error`, `sin-sesion`, `sin-sincronizar`) |
| `useNotificacionesStore` | Avisos: stock bajo, arqueo, anomalías, cierre, respaldo |
| `useInsightsStore` | Recomendaciones y anomalías del dashboard |
| `useUIStore` | Modales, confirm/prompt, PIN |

### Módulo de sincronización (`src/sync/`)

| Archivo | Papel |
| --- | --- |
| `tipos.ts` | `TABLAS_SINCRONIZABLES` (15), `Cambio`, `Descarte`, `RegistroSync` |
| `seguimiento.ts` | Registra cada alta/modificación/borrado en la tabla `cambios` |
| `motor.ts` | Aplica filas remotas; regla de conflicto `ganaRemoto(ts, dispositivo)`; guarda los perdedores en `descartes` |
| `nube.ts` | Cliente Supabase: `sync_empujar` / `sync_tirar`, sesión de Google, deep link `tiendapro://auth` |
| `config.ts` | URL del proyecto Supabase y clave pública |
| `webrtc.ts` | Canal WebRTC sin STUN/TURN (solo red local) |
| `enlace.ts` | Sesión WiFi: intercambio de códigos y progreso |
| `qr.ts` / `codigo.ts` | QR y códigos en Base45 (oferta/respuesta) |

## Base de datos local

Base **TiendaProDB** (IndexedDB vía Dexie), actualmente en la **versión 10**. Hay 20 tablas:

| Tabla | Contenido |
| --- | --- |
| `productos` | Catálogo (nombre, unidad, precio, archivado) |
| `lotes` | Lotes de inventario con costo y cantidad |
| `ventas` | Ventas con ítems y lotes usados (FIFO) |
| `compras` | Compras registradas |
| `ajustes` | Mermas y sobrantes |
| `arqueos` | Arqueos de caja |
| `movCaja` | Movimientos de caja |
| `cierres` | Cierres de período |
| `capital` | Aportes de capital |
| `retiros` | Retiros (de ganancia o de capital) |
| `socios` | Socios con porcentaje |
| `distribuciones` | Repartos de ganancia |
| `gastos` | Gastos operativos |
| `asientos` | Libro diario (partida doble, se reconstruye) |
| `pasivos` | Cuentas por pagar |
| `auditorias` | Auditorías físicas de inventario |
| `config` | Configuración (clave/valor) |
| `cambios` | Registro de cambios para sync (cursor `++id`) |
| `descartes` | Versiones locales que perdieron un conflicto |
| `syncMeta` | Cursores y estado de los transportes |

Historial de versiones: v1 esquema base; v2 gastos; v3 libro diario; v4 pasivos; v5 auditorías; v6 índices compuestos; v7–v8 cola de Telegram (eliminada en v10); v9 sincronización (`cambios`, `descartes`, `syncMeta`); **v10 elimina la cola de Telegram** y deja el esquema actual.

### Lógica de costos (FIFO)

`services/fifo.ts` descuenta cada venta del lote más antiguo con stock. El costo de venta es real por lote, así que la ganancia por venta y el valor del inventario son exactos. Los asientos del libro diario (`services/libroDiario.ts`) se generan desde las tablas fuente y se reconstruyen en cada dispositivo, por eso no viajan en la sincronización.

## Scripts de npm

```bash
npm run dev          # Servidor de desarrollo (Vite)
npm run build        # Build de producción
npm run preview      # Preview del build
npm test             # Vitest (unitarios + montaje de la app)
npm run test:watch   # Vitest en modo watch
npm run test:coverage# Vitest con cobertura
npm run smoke        # Playwright: smoke contra la demo desplegada
npm run smoke:local  # Smoke contra preview local (BASE_URL=http://localhost:4173/Tienda-ultima/)
npm run functional   # Playwright: pruebas funcionales
npm run test:all     # Vitest + smoke + funcional
npm run test:enlace  # Prueba real de sync WiFi (necesita dos dispositivos; en VM el canal WebRTC no abre)
npm run lint         # ESLint (src/)
npm run lint:css     # Stylelint
npm run typecheck    # vue-tsc --noEmit
npm run format       # Prettier
npm run build:cap    # Build web + cap sync android
npm run apk:debug    # APK debug
npm run apk:release  # APK release firmado (necesita TIENDA_KEYSTORE y claves)
```

## Tests

- **Vitest** (`tests/*.test.js`, ~60 archivos): base de datos, FIFO, cuadre, cobro, cierres, gastos, backup, importación, sync (motor, enlace, nube), insights y montaje de vistas. Se ejecutan con `npm test`.
- **Playwright** (`tests/smoke.spec.mjs`, `tests/functional.spec.mjs`, `tests/stress.spec.mjs`): smoke y funcional en Chromium real contra el preview local o la demo. Los scripts `smoke`/`functional` usan `BASE_URL`; en local, `BASE_URL=http://localhost:4173/Tienda-ultima/`.
- **Sync WiFi real** (`tests/sync-enlace.spec.mjs`, `npm run test:enlace`): abre el canal WebRTC entre dos páginas. En una VM el canal no abre (ICE queda en `checking`); solo se valida con dos teléfonos reales en la misma red.

## CI/CD

Workflows en `.github/workflows/`:

| Workflow | Qué hace |
| --- | --- |
| `quality.yml` | Gates de calidad: `npm ci`, lint, typecheck, tests con cobertura, build (Node 22) |
| `e2e.yml` | E2E con Playwright + Lighthouse |
| `e2e-matrix.yml` | Matriz de E2E |
| `ci.yml` | CI en PRs: quality + E2E |
| `deploy.yml` | **Tests, Build & Deploy**: en cada push a `main`, quality → e2e → build web (Node 24) → GitHub Pages → APK firmado (artifact `tiendapro-release-…`) |
| `supabase-keepalive.yml` | Mantiene despierto el proyecto de Supabase (programado) |

El despliegue web publica en GitHub Pages con base `/Tienda-ultima/` (`https://alain314159.github.io/Tienda-ultima/`). El APK se firma con el keystore de los *secrets* de GitHub Actions y se verifica con `apksigner` antes de publicarlo.

## Nube (Supabase)

- Proyecto: **Gestion-tienda-pro** (`chstqhjoizljlpgehdkn`), región `ca-central-1`, Postgres 17.
- Migración: `supabase/migrations/0001_sync_nube.sql` — tabla `sync_registros` (una fila por usuario y registro) y funciones `sync_empujar(jsonb)`, `sync_tirar(bigint, integer)` y `sync_latido`.
- Auth: solo **Google** (OAuth web, redirect `https://chstqhjoizljlpgehdkn.supabase.co/auth/v1/callback`); el acceso por email está desactivado. Pantalla de consentimiento en producción: app «Tienda Pro», home y privacidad en GitHub Pages.
- La app nunca lee/escribe `sync_registros` directamente: solo a través de las funciones RPC, con la sesión de Google.
