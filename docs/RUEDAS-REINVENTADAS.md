# Auditoría de ruedas reinventadas — Tienda Pro

**Rama:** `migracion-pinia-nueva` · **Fecha:** 2026-10-14 · **Base:** commit `05bffd9`

Regla aplicada (acordada con el propietario): una pieza de código propio se
reemplaza directamente por una librería solo si la librería la cubre **al 100%**
sin pérdida semántica. En caso contrario, se listan las opciones con pros y
contras para decisión posterior.

**Resultado:** 13 ruedas identificadas. Ninguna es reemplazable al 100% por una
única librería sin trade-offs, por lo que **todas quedan como opciones de
decisión**. Lo que sí se corrigió ya (commit `05bffd9`) fue duplicación interna:
`hashContenido` existía en 2 módulos y `services/fechas.ts` estaba un 90% muerto
(solo 2 de 12 métodos se usaban; hoy viven tipados en `utils/formato.ts`).

---

## Tabla resumen

| #   | Rueda                                     | Dónde                         | Alternativas                                       | Prioridad               |
| --- | ----------------------------------------- | ----------------------------- | -------------------------------------------------- | ----------------------- |
| 1   | Evaluador de expresiones con `Function()` | `Calculator.vue:289`          | mathjs, expr-eval                                  | 🔴 Alta (seguridad/CSP) |
| 2   | Gestos táctiles a mano                    | `composables/useGestos.ts`    | VueUse `useSwipe` (ya instalado), @vueuse/gesture  | 🟡 Media                |
| 3   | IDs con `Date.now()+random`               | `utils/id.ts`                 | nanoid, crypto.randomUUID, ulid                    | 🟢 Baja                 |
| 4   | Clon profundo vía JSON                    | `utils/id.ts:11`              | `structuredClone()` nativo                         | 🟡 Media                |
| 5   | Formato moneda ad-hoc                     | `utils/formato.ts`            | `Intl.NumberFormat` cacheado, currency.js          | 🟢 Baja                 |
| 6   | Aritmética de dinero casera               | `utils/numero.ts`             | currency.js, dinero.js, big.js                     | 🟡 Media (riesgo sutil) |
| 7   | Búsqueda global por `includes()`          | `GlobalSearch.vue`            | MiniSearch, Fuse.js, FlexSearch                    | 🟡 Media (UX)           |
| 8   | Charts imperativos (getElementById)       | `composables/useGraficos.ts`  | vue-chartjs                                        | 🟡 Media                |
| 9   | Iconos SVG copiados a mano                | `icons.ts` + `AppIcon.vue`    | unplugin-icons, lucide-vue-next                    | 🟡 Media                |
| 10  | Watchdog de promesas                      | `utils/watchdog.ts`           | p-timeout                                          | 🟢 Baja                 |
| 11  | Logger completo a mano                    | `services/logger.ts`          | loglevel, consola, @capgo/capacitor-logger, Sentry | 🟡 Media                |
| 12  | Wrapper de storage propio                 | `services/storage.ts`         | VueUse `useLocalStorage`, localForage              | 🟢 Baja (justificado)   |
| 13  | Paginación manual                         | `composables/useHistorial.ts` | VueUse `useOffsetPagination` (ya instalado)        | 🟢 Baja                 |

---

## 1. Evaluador de expresiones de la calculadora — 🔴 prioridad alta

**Dónde:** `src/components/Calculator.vue`, función `evaluar()` (línea ~289).

**Código actual:** normaliza `×÷−` y porcentajes con regex y luego ejecuta:

```js
const r = Function('"use strict"; return (' + s + ')')();
```

con una lista blanca previa `/^[\d+\-*/(). ]+$/`. Es un mini-lenguaje matemático
reinventado sobre `eval`.

**Por qué importa:** aunque la lista blanca reduce la inyección, `Function()`
está bloqueado por CSPs estrictas (Play Store / WebView corporativas), no
soporta `^`, raíces en línea, y cada mejora del "lenguaje" es regex frágil.

**Alternativas:**

| Librería                                 | Pros                                                                                                                                      | Contras                                                                                                                 |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **mathjs** (`math.evaluate`)             | Mantenida activamente; parser completo (`^`, `sqrt`, funciones, unidades); segura por diseño (no usa `eval`); elimina ~40 líneas de regex | ~90–150 KB gzipped si solo se usa el evaluador; hay que registrar el chunk dinámico para no engordar el bundle inicial  |
| **expr-eval**                            | ~2 KB gzipped; API mínima (`Parser.evaluate`)                                                                                             | ⚠️ **CVE-2025-12735 (nov 2025, activo):** no restringe funciones pasadas a `evaluate`. No recomendable hoy sin parchear |
| **Mantener `Function()` + lista blanca** | Cero dependencias; ya funciona                                                                                                            | Frágil ante CSP; sin exponente; deuda de seguridad permanente                                                           |

**Recomendación:** si se quiere librería → **mathjs** con import dinámico (igual
que Chart.js). Si no se quiere dependencia → mantener la lista blanca actual
es aceptable, pero añadir tests del evaluador. La sintaxis `A ± B%` actual
debería re-implementarse como pre-transformación en cualquier caso.

---

## 2. Gestos táctiles (swipe + pull-to-refresh) — 🟡

**Dónde:** `src/composables/useGestos.ts` (148 líneas): umbral de 30px/1.5x,
compromiso a 80px/<1s, pull-to-refresh con `pullDist` animado, guardas de
modal/input.

**Alternativas:**

| Opción                                          | Pros                                                           | Contras                                                                                                                           |
| ----------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **VueUse `useSwipe`** (ya instalado)            | 0 dependencias nuevas; probada; devuelve dirección y distancia | Solo cubre el swipe; no el pull-to-refresh ni los umbrales personalizados (30/80px, ratio 1.5, <1s) ni las guardas de modal/input |
| **@vueuse/gesture** (port Vue de framer-motion) | Drag/swheel/pinch completos, física de movimiento              | Dependencia extra (~10 KB); reescribiría la interacción actual; sobre-ingeniería para 2 gestos                                    |
| **pulltorefresh-js**                            | Pull-to-refresh probado en móvil                               | No mantenido activamente; estilos propios que chocan con el design system; no resuelve el swipe                                   |

**Recomendación:** migrar **solo la mitad del swipe** a `useSwipe` (ya pagada
en el bundle) y conservar el pull-to-refresh propio (~60 líneas). Ganancia
modesta; es una decisión de gusto, no urgente.

---

## 3. Generación de IDs — 🟢

**Dónde:** `src/utils/id.ts` — `prefix + Date.now().toString(36) + Math.random().toString(36).slice(2,7)`.

**Alternativas:**

| Opción                  | Pros                                                                                                | Contras                                                                                                                                  |
| ----------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **nanoid**              | 130 B; más rápido que UUID; alfabeto URL-safe; colisiones criptográficamente improbables            | **No ordenable** por tiempo (rompería la ordenación implícita actual de lotes/ventas por ID); pierde el prefijo legible salvo envoltorio |
| **ulid**                | Ordenable lexicográficamente (mejor localidad en IndexedDB); formato canónico; prefijo concatenable | ~1.2 KB; los IDs existentes en la BD mezclarían formatos (inofensivo pero feo)                                                           |
| **crypto.randomUUID()** | Nativo, 0 dependencias                                                                              | No ordenable; sin prefijo; 36 chars (más almacenamiento)                                                                                 |
| **Mantener actual**     | 1 línea; cero deps; ya funciona                                                                     | `Math.random()` no es cripto-seguro (aquí irrelevante); colisión teórica ~1/60M por ms y prefijo                                         |

**Recomendación:** mantener. El formato actual es correcto para el dominio.
Si algún día se necesita orden estricto por creación, **ulid** es el candidato.

---

## 4. Clon profundo vía JSON — 🟡

**Dónde:** `src/utils/id.ts:11` — `clean()` = `JSON.parse(JSON.stringify(obj))`.

**Alternativas:**

| Opción                           | Pros                                                                                                                                                                        | Contras                                                                                                                                                                                                                             |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`structuredClone()`** (nativo) | Estándar web; preserva `Date`, `Map`, `Set`, `RegExp`, `ArrayBuffer`; ~40x más rápido que JSON en objetos grandes; ya disponible en todos los WebView modernos (Chrome 98+) | Diferencias semánticas: **conserva** claves con valor `undefined` (hoy se eliminan) y **lanza** error con funciones (hoy se descartan silenciosamente); los Proxy de Vue sí se atraviesan pero hay que verificarlo con la data real |
| **Mantener JSON**                | Comportamiento idéntico al actual; serializa igual que los backups (JSON)                                                                                                   | Pierde `Date`→string (los backups quedan igual, pero el clon intermedio cambia de tipo); O(n) con GC agresivo                                                                                                                       |

**Recomendación:** opción de decisión. Si se cambia, hacerlo con un test que
compare `clean()` vs `structuredClone()` sobre `datosDeStores()` real. El
beneficio es rendimiento y corrección de tipos; el riesgo es bajo pero no nulo.

---

## 5. Formato de moneda — 🟢

**Dónde:** `src/utils/formato.ts` — `fmt()` concatena `'$' + n(v).toLocaleString('en-US', {...})`.

**Alternativas:**

| Opción                                    | Pros                                                                                                                                                   | Contras                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| **`Intl.NumberFormat` cacheado** (nativo) | Crear el formateador es lo caro; cacheándolo en constante módulo es ~5-10x más rápido en listas largas (historial, tabla del cuadre); sin dependencias | Solo mejora rendimiento; no añade manejo de dinero              |
| **currency.js**                           | Aritmética + formato en centavos enteros; API agradable                                                                                                | 2 KB; obliga a repasar TODAS las operaciones de dinero (ver #6) |
| **dinero.js v2**                          | Patrón Money de Fowler tipado; inmutable                                                                                                               | Más verbosa; overkill para una app con 4 decimales internos     |

**Recomendación:** aplicar el micro-cambio nativo (cache de `Intl.NumberFormat`)
— es interno e invisible. Las librerías de dinero solo tienen sentido junto con
la decisión del punto #6.

---

## 6. Aritmética de dinero — 🟡

**Dónde:** `src/utils/numero.ts` — `n()` (parse), `m()`/`q()` (redondeo a 4 decimales).

**Situación:** el convenio "4 decimales internos + redondeo final" es correcto
y está documentado en el propio archivo. Es una rueda _pequeña y razonable_,
pero las operaciones intermedias siguen en coma flotante.

**Alternativas:**

| Opción                  | Pros                                                                                       | Contras                                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **currency.js**         | Todas las ops en enteros de centavos; ~2 KB; adopción trivial (`currency(1.10).add(0.05)`) | Redondea a 2 decimales por defecto (configurable a 4, pero hay que auditar `fifo.ts`, `useCuadre.ts`, `useCobro.ts`); TOCOS ~15 archivos |
| **dinero.js v2**        | Inmutabilidad + tipado fuerte; multi-moneda                                                | Más ceremonial (transformaciones constantes); el beneficio real aparece con multi-divisa, que no es el caso                              |
| **big.js / decimal.js** | Precisión arbitraria; decimal.js ya se probó y se eliminó por no usarse                    | Orientadas a cálculo, no a dinero; hay que escribir el formateo igualmente                                                               |
| **Mantener n/m/q**      | Ya probado por el negocio; cero migración; FIFO/cuadre dependen de él                      | Riesgo residual de coma flotante en sumas largas (mitigado por `m()` en cada paso)                                                       |

**Recomendación:** mantener `n/m/q` (es el corazón de la contabilidad y está
estabilizado). Documentar como decisión arquitectónica. Reconsiderar
**currency.js** solo si aparecen errores de centavos reportados.

---

## 7. Búsqueda global — 🟡 (UX)

**Dónde:** `src/components/GlobalSearch.vue` — filtro por
`nombre.toLowerCase().includes(query)` sobre productos/ventas/socios/gastos.

**Alternativas:**

| Opción         | Pros                                                                                            | Contras                                                                                                 |
| -------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **MiniSearch** | ~7 KB; full-text con prefijo, fuzzy y ranking; indexa incremental; ideal para el volumen actual | Cambia el modelo mental (índice vs filtro); hay que mantener el índice sincronizado con los stores      |
| **Fuse.js**    | Fuzzy difuso muy bueno (tolera typos); API simple                                               | Recalcula el índice en cada búsqueda si la data cambia (más lento con ventas grandes); sin ranking BM25 |
| **FlexSearch** | El más rápido en benchmarks                                                                     | API más críptica; el índice consume memoria; overkill                                                   |

**Recomendación:** **MiniSearch** es el mejor equilibrio si se quiere tolerar
errores de tipeo ("cocacola" → "Coca Cola"). El filtro actual es correcto en
corrección, solo limitado en UX. Decisión del propietario.

---

## 8. Charts imperativos — 🟡

**Dónde:** `src/composables/useGraficos.ts` — busca canvas con
`document.getElementById('chartVentas')`, destruye y re-crea el Chart a mano,
`repintar()` con `nextTick + rAF`.

**Problema real:** es el único lugar del código que sigue tocando el DOM
directamente (anti-patrón en Vue); la reactividad de Chart.js se gestiona a
mano.

**Alternativas:**

| Opción                    | Pros                                                                                                                                                                             | Contras                                                                                                                  |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **vue-chartjs**           | Wrapper oficial de Vue para Chart.js; componentes declarativos `<Bar>`/`<Doughnut>`; lifecycle y reactividad gestionados; el código de config (~150 líneas de datos) se conserva | Requiere registrar componentes; el import dinámico actual (code-splitting) hay que replicarlo con `defineAsyncComponent` |
| **vue-echarts (ECharts)** | Charts más pulidos, tooltip mejor                                                                                                                                                | Cambio de librería completo; bundle mucho mayor; reescribir configs                                                      |
| **unovis**                | Framework de visualización moderno con bindings Vue                                                                                                                              | Curva de aprendizaje; comunidad joven                                                                                    |

**Recomendación:** **vue-chartjs** — reemplazo natural que elimina el único
DOM-manual del código y el bug-clase de "chart fantasma" al cambiar de vista.
Esfuerzo: ~2-3 h. Riesgo bajo (la lógica de datos queda igual).

---

## 9. Iconos SVG copiados a mano — 🟡

**Dónde:** `src/icons.ts` (55 líneas de paths SVG copiados de Lucide/Feather) +
`AppIcon.vue` que los inyecta con `v-html`.

**Alternativas:**

| Opción                                    | Pros                                                                                                                      | Contras                                                                                                                                             |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **unplugin-icons + @iconify-json/lucide** | Acceso a >200k iconos on-demand, compilados en build (0 runtime); tree-shaking perfecto; tipado; auto-import en templates | Cambia la API de templates (`<icon name="x">` → `<i-lucide-x>`); tocar cada template (~10 vistas/componentes); añade 2 dev-deps                     |
| **lucide-vue-next**                       | Componentes Vue oficiales de Lucide; tree-shaken; API directa                                                             | Cambia igualmente los templates; sin la capa iconify (solo Lucide — suficiente aquí)                                                                |
| **@iconify/vue**                          | Runtime, cualquier set sin build config                                                                                   | Carga por red/cache en runtime (offline-first se resiente); algo más pesado                                                                         |
| **Mantener icons.ts**                     | Cero cambios; funciona offline total                                                                                      | Mantenimiento manual de paths; `v-html` (seguro aquí porque son constantes propias, pero es superficie de ataque futura); sin tree-shaking granular |

**Recomendación:** **lucide-vue-next** es el camino limpio: los paths actuales
YA son Lucide, migración 1:1 nombre a nombre, y elimina el `v-html`. Es
decisión del propietario por el alcance del cambio en templates.

---

## 10. Watchdog de promesas — 🟢

**Dónde:** `src/utils/watchdog.ts` — `Promise.race` con timeout (20 líneas).

**Alternativas:** **p-timeout** (Sindre Sorhus, ~1 KB) hace exactamente esto
con `AbortSignal` opcional. VueUse `useTimeoutPromise` cubre la mitad.

**Recomendación:** mantener — 20 líneas sin dependencias, con métrica de
duración incluida que p-timeout no da gratis. No vale la dependencia.

---

## 11. Logger completo — 🟡

**Dónde:** `src/services/logger.ts` (333 líneas): captura de `console.*`,
serializador propio a prueba de ciclos, buffer + flush por tiempo/línea,
rotación de 7 días, escritura a archivo (Capacitor) o localStorage (web),
eventos de negocio.

**Por qué no es reemplazable al 100%:** ninguna librería cliente combina
_file rotation en Capacitor Filesystem_ + _captura de console_ + _eventos de
negocio_. Las opciones cubren partes:

| Opción                             | Qué cubre                                      | Pros                                                          | Contras                                                                                               |
| ---------------------------------- | ---------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **loglevel + plugin-prefix**       | Niveles y consola                              | 1 KB; estándar de facto                                       | No persiste nada; habría que escribir igualmente el transporte a archivo                              |
| **consola** (equipo Nuxt)          | Formato bonito, tags                           | DX agradable                                                  | Pensada para dev-time, no para persistir en dispositivo                                               |
| **@capgo/capacitor-logger**        | Escritura nativa                               | Integración Capgo (ya usan `@capgo/capacitor-updater`)        | Joven; no captura console por sí sola                                                                 |
| **Sentry / Capgo crash reporting** | Errores en producción, stacktraces, sourcemaps | Estándar de industria; liberaría ~80 líneas de captura global | Servicio externo (coste/privacidad); offline-first requiere SDK con cola (lo tienen, pero añade peso) |

**Recomendación:** mantener el logger propio (está bien aislado y es offline).
**Opción valiosa a decidir:** añadir Sentry/Capgo solo para la captura de
errores fatales (`window.onerror` / `unhandledrejection`), simplificando el
logger interno a eventos de negocio.

---

## 12. Wrapper de storage — 🟢 (justificado)

**Dónde:** `src/services/storage.ts` (42 líneas) — puente
`Preferences` (nativo) / `localStorage` (web) + helpers JSON.

**Alternativas:** VueUse `useLocalStorage` (reactivo, ya instalado) no sabe de
Capacitor; **localForage** usa IndexedDB (más espacio) pero tampoco puente
nativo.

**Recomendación:** mantener. Es el adapter correcto para offline-first híbrido.
Si algún ajuste necesita reactividad, usar `useLocalStorage` en ese punto
concreto, no globalmente.

---

## 13. Paginación manual — 🟢

**Dónde:** `src/composables/useHistorial.ts` — `pagina/porPagina/hayMas/mostrarMas`.

**Alternativas:** VueUse **`useOffsetPagination`** (ya instalado) implementa
exactamente ese state-machine con más controles (pageCount, isFirst/isLast).

**Recomendación:** opcional; migrar solo si se toca el composable por otra
razón. El agrupado por períodos (la parte valiosa) no lo cubre ninguna
librería.

---

## Lo que ya está bien resuelto con librerías (sin rueda)

- **Persistencia:** Dexie 4 (IndexedDB) con esquema versionado — correcto.
- **UI accesible:** reka-ui en modales — correcto.
- **Toasts:** vue-sonner con wrapper propio fino (`utils/toast.ts`) — patrón
  adapter correcto, no rueda.
- **Validación:** Zod en schemas de formularios — correcto.
- **PDF:** jsPDF + autotable en servicio aislado con import dinámico — correcto.
- **Notificaciones nativas:** Capacitor LocalNotifications — correcto.
- **Lógica de dominio** (FIFO, cuadre, insights, telegram-proxy): no existe
  librería que la reemplace; son el core del negocio.

## Observaciones de seguridad detectadas durante la auditoría

1. `src/telegram.ts:5` — `TG_APP_KEY` hardcodeada en el cliente. Cualquiera
   que descomprime el APK puede usar el proxy. Mitigable con Firebase App Check
   o rotación de clave; requiere cambio en el Worker.
2. `Calculator.vue` — `Function()` descrito en #1.
3. `services/backup.ts` — PBKDF2 con 100k iteraciones: aceptable hoy;
   OWASP 2026 recomienda 600k para SHA-256 si se endurece.
