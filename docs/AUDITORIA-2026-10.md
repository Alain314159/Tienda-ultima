# Auditoría completa — Tienda Pro (octubre 2026)

Rama: `migracion-pinia-nueva` · Metodología: checklist de skills (capacitor
security, vue-composition-api-best-practices, smart-code-review, vite,
vitest-testing) + `npm outdated` / `npm audit` + OSV/GHSA vía web-search.

Verificación final: **vue-tsc 0 errores · ESLint 0/0 · Stylelint 0 · 119/119
tests · build OK · npm audit sin hallazgos explotables en runtime.**

---

## 1. Resumen ejecutivo

| Área                            | Estado                | Acción tomada                                           |
| ------------------------------- | --------------------- | ------------------------------------------------------- |
| Dependencias                    | 🟡 parches pendientes | Actualizadas (capacitor 8.5.3, vue 3.5.44, zod, dotenv) |
| Vulnerabilidades npm            | 🔴 17 hallazgos       | 17 → 11 (todos dev-only, sin parche upstream)           |
| mathjs (CVE-2026-40897/41139)   | 🟢 no afectado        | 15.2.0 = versión parcheada de ambos CVEs                |
| Backups cifrados >64KB          | 🔴 rotos              | Corregido (base64 por trozos)                           |
| PIN en claro en IndexedDB       | 🔴                    | PBKDF2-SHA256 600k + migración automática               |
| PBKDF2 100k iteraciones         | 🟡 débil              | 600k + sobre versionado (v1 sigue abriendo)             |
| CSP ausente                     | 🟡                    | Meta CSP estricta; scripts inline eliminados            |
| allowMixedContent / allowBackup | 🟡                    | false / false                                           |
| Listeners sin limpiar           | 🔵                    | Nombrados + removeEventListener                         |
| Tests                           | 🟡 45                 | **119** (FIFO, stores, schemas, cripto, watchdog, PIN)  |
| Lint                            | 🟡 3 err + 233 warn   | **0/0** (código muerto eliminado)                       |

---

## 2. Hallazgos corregidos en esta auditoría

### 🔴 CRÍTICO — Backups cifrados grandes fallaban (RangeError)

`exportarCifrado` usaba `btoa(String.fromCharCode(...new Uint8Array(cipher)))`.
El spread `...bytes` pasa cada byte como argumento: con payloads >64KB desborda
la pila (`RangeError: Maximum call stack size exceeded`, reproducido con 200KB).
**Cualquier tienda real (inventario + historial) supera ese tamaño al cifrar.**

**Corrección**: `aBase64()`/`desdeBase64()` en `services/backup.ts` codifican
por trozos de 32KB. Test de regresión con 500KB incluido.

### 🔴 CRÍTICO — PIN almacenado en texto plano

`cfg.pin` se guardaba tal cual en IndexedDB: cualquiera con acceso al
almacenamiento (WebView debug, backup ADB, otro perfil) lee el PIN.
`pedirPin` comparaba en claro.

**Corrección**: `services/pin.ts` — PBKDF2-SHA256 600k iteraciones + sal
aleatoria, comparación en tiempo ~constante, fail-closed ante valores
corruptos. `guardarCfg` hashea automáticamente; `cargarCfg` migra los PIN
legacy en claro en segundo plano. Tests: 8 casos (formato, sal única, legacy,
corrupción, migración real en IndexedDB).

### 🟡 PBKDF2 de backups por debajo de recomendación

100k iteraciones; OWASP 2023+ recomienda 600k para PBKDF2-SHA256.

**Corrección**: 600k por defecto. El sobre cifrado pasa a `version: 2` con
`kdf: { algo, iter }` declarado; el importador lee `kdf.iter || 100000`, así
que **los backups v1 existentes siguen abriéndose**. Test que simula sobre
v1 end-to-end.

### 🟡 Sin Content-Security-Policy

**Corrección**: meta CSP en `index.html`:
`default-src 'self'; script-src 'self' https://cdn.jsdelivr.net` (Eruda es
opt-in desde Ajustes), `connect-src` limitado al proxy TG + capgo,
`object-src 'none'; frame-src 'none'; base-uri 'self'; form-action 'self'`.
El loader de Eruda pasó de `<script>` inline a `public/eruda.js` (relativo,
compatible con subpath de GitHub Pages). `ws:`/`wss:` permitidos solo en
`connect-src` para no romper HMR de Vite en desarrollo.

### 🟡 Android: allowBackup=true

Auto Backup de Android subía la base IndexedDB (contabilidad completa) sin
cifrar a Google Drive. **Corregido**: `allowBackup="false"`. El respaldo de
datos del usuario ya tiene canales propios (Telegram cifrado, JSON, carpeta
local).

### 🟡 allowMixedContent=true sin endpoints http

Ningún endpoint http en uso (proxy TG y capgo son https). **Corregido**:
`false` en `capacitor.config.json`.

### 🟡 Listeners de window/document sin limpiar + listener muerto

`App.vue` registraba 6 listeners en `onMounted` sin removerlos (anti-patrón
#5 de la skill Vue). El de `resize` era un cuerpo vacío (código muerto).

**Corrección**: handlers nombrados + `removeEventListener` en
`onBeforeUnmount`; resize eliminado.

### 🟡 Dependencias desactualizadas (npm outdated)

Actualizados dentro de semver: `@capacitor/*` 8.5.3/8.1.2/8.1.4/8.0.4,
`vue` 3.5.44, `zod` 4.6.7, `dotenv` 18.0.7.

### 🔵 ESLint: 3 errores + 233 advertencias

- 71 `catch (e)` con `e` sin uso → _optional catch binding_ `catch {` (codemod
  verificado; el script con regex se descartó tras corromper 5 stores y
  restaurarlos con git).
- Config: reglas base `no-unused-vars`/`no-shadow` duplicaban a
  `@typescript-eslint/*` (falsos positivos en posiciones de tipo) → delegadas.
- Código muerto eliminado: imports sin uso, 5 funciones `recargarStores()`
  no exportadas, 4 funciones de formulario huérfanas en ProductosView,
  `self`/`ini`/`gananciaSemanaAnt`/`fileName`/`token`, sombras renombradas
  (`target`, `stock`, `m`, `q`, `p`, `g`).

---

## 3. Verificaciones sin hallazgos (positivas)

- **mathjs 15.2.0**: CVE-2026-40897 y CVE-2026-41139 (sandbox bypass → RCE)
  afectan `>=13.1.0 <15.2.0` (confirmado vía OSV API). Instalado exactamente
  15.2.0. Además la calculadora usa factory mínima (`mathjs/number` con solo
  evaluate + aritmética) y whitelist regex de defensa en profundidad.
- **Sin XSS**: cero `v-html`/`innerHTML` (icons.ts con v-html se eliminó en la
  migración anterior), sin `eval`/`new Function`.
- **localStorage**: solo carrito (no sensible) y log de debug acotado.
- **WebView**: `webContentsDebuggingEnabled: false`, `androidScheme: https`.
- **Options API**: sin remanentes; todo `<script setup>` con TS.
- **Reactividad** (skill vue): `storeToRefs` donde se destructura; el único
  watch profundo es el carrito con debounce 300ms (patrón correcto); stores
  singleton mantienen listeners de ciclo de vida de app (aceptable).
- **PIN/CSP**: `pedirPin` async verificado; fail-closed.

---

## 4. Riesgos residuales aceptados (documentados)

1. **`TG_APP_KEY` embebida** (`src/telegram.ts`) — secretio compartido con el
   Worker proxy. El token real del bot vive solo en el Worker (env). Extraer
   la app permite llamar al proxy en nombre de la tienda; no expone el token
   ni datos de otras tiendas (el Worker valida nombre+chat). Mitigación
   completa requeriría cuentas de usuario en backend — fuera de alcance de
   una app offline-first. Documentado también en RUEDAS-REINVENTADAS.md.
2. **11 advisories "high" de `braces`** (GHSA-vfj7-8cjw-p6xm, afecta a
   `braces@*`, sin parche upstream) — toda la cadena es toolchain de
   desarrollo (stylelint/glob sobre CSS propio). No llega al bundle de
   producción. El "fix" de npm desactualizaría @capacitor/cli y
   vite-plugin-checker: se rechaza expresamente. Se reevaluará cuando
   upstream publique parche.
3. **TypeScript 7.0.2 (port nativo Go) disponible** — major con riesgo de
   compatibilidad con vue-tsc/typescript-eslint. No aplicado; reevaluar
   cuando el ecosistema declare soporte.
4. **Eruda desde CDN (jsdelivr)** — opt-in desde Ajustes; requiere permitir
   `cdn.jsdelivr.net` en script-src. Alternativa futura: empaquetarlo como
   devDependency (pesa ~100KB y no se usaría en producción).

---

## 5. Cobertura de tests (45 → 119)

| Suite                | Tests | Cubre                                                             |
| -------------------- | ----- | ----------------------------------------------------------------- |
| db                   | 15    | utils + persistencia + exportar                                   |
| mount                | 9     | shell + 8 vistas sin errores de bindings                          |
| utils                | 21    | numero/formato/id/calculadora                                     |
| **fifo** (nuevo)     | 16    | lógica nuclear de costos FIFO                                     |
| **stores** (nuevo)   | 18    | config/productos/lotes/caja/carrito con IndexedDB real            |
| **schemas** (nuevo)  | 12    | validación Zod de 5 formularios                                   |
| **crypto** (nuevo)   | 15    | gzip, SHA-256, PBKDF2/AES-GCM, base64 por trozos, sobre v1 legacy |
| **watchdog** (nuevo) | 5     | timeouts y limpieza de timers                                     |
| **pin** (nuevo)      | 8     | hash, verificación, legacy, migración                             |

Pendiente razonable para el futuro: `useCuadre` (generación de cuadres),
`procesarVenta` end-to-end (transacción FIFO + lotes + caja), vistas con
interacción (Vitest + Testing Library).

---

## 6. Commits de esta auditoría

- `ffd7b9e` refactor(lint): cero advertencias ESLint
- `0c40dc1` chore(deps): parches de seguridad y actualización menor
- `cd75659` test: +61 tests de lógica nuclear (45 → 106)
- `c26af60` fix(seguridad)!: hardening (CSP, PIN, PBKDF2, base64, listeners)
- (este informe) docs: auditoría completa
