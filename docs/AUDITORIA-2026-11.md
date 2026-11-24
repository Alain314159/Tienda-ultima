# Auditoría — Tienda Pro (noviembre 2026)

Rama: `migracion-pinia-nueva` · Metodología: `npm outdated` y `npm audit`, avisos
GHSA y versiones vigentes consultados en el registro de npm y en nodejs.org,
comparación glifo a glifo de los iconos entre los dos paquetes de Lucide,
recorrido del historial de git y de las alertas de _secret scanning_ del
repositorio.

Verificación final: **vue-tsc 0 errores · ESLint 0/0 · Stylelint 0 · 789/789
tests (60 archivos) · build OK · guarda de secretos: 0 hallazgos.**

---

## 1. Resumen ejecutivo

| Área                                 | Estado                                      | Acción tomada                                                             |
| ------------------------------------ | ------------------------------------------- | ------------------------------------------------------------------------- |
| Credenciales en el historial público | 🔴 P0, pendiente del propietario            | Detectado y documentado; rotarlo no se puede hacer desde el repositorio   |
| Dependencias                         | 🟡 35 desactualizadas, 1 aviso de seguridad | Subidas a la versión minor o parche más reciente compatible (`aacc4c0`)   |
| Herramientas de calidad              | 🟡 stylelint 17, checker 0.14               | stylelint 18.1, config-standard 41.1, vite-plugin-checker 1.1 (`4968062`) |
| Iconos                               | 🟡 paquete depreciado                       | `lucide-vue-next` → `@lucide/vue` 1.79.0 (`9dc6aa9`)                      |
| Prevención de secretos               | 🔴 no existía                               | Guarda en `pre-commit` y caso en la suite para CI (`4932d41`)             |
| Tests                                | 🟢 721                                      | 789 (+68)                                                                 |
| `npm audit`                          | 🟡 7 moderados                              | Sin movimiento: afectan solo a la cadena de desarrollo y compilación      |

## 2. Hallazgo de seguridad P0: credenciales en el historial público

**Qué hay.** El token del bot de Telegram estuvo escrito como literal en
`src/telegram.js` desde el commit `52f2ac8` (2026-09-15) hasta `fc4410c`
(2026-09-17). El commit `7b2f130` lo quitó del código, pero sigue recuperable en
el historial de todas las ramas. GitHub mantiene abierta desde el 2026-09-15 la
alerta n.º 1 de _secret scanning_ (tipo `telegram_bot_token`, marcada como
filtrada públicamente).

**Segunda credencial.** La `APP_KEY` del Worker proxy, introducida en `7b2f130`,
estuvo en el historial hasta `0be1917` y sigue en `src/telegram.js` de la punta de
`main`. Es la clave que habilita el uso del proxy, así que tiene la misma
gravedad.

**Por qué importa.** El token del historial es el mismo que las notas de trabajo
del propietario dan por vigente: no es un secreto antiguo ya retirado. Encaja
además con el «webhook pirata» (dominio `tele.goldenherd.com`) ya anotado por el
propietario, porque quien conoce el token puede fijar el webhook del bot y
recibir sus mensajes.

**Por qué no está corregido.** Regenerar el token y desplegar el Worker son
acciones sobre cuentas ajenas al repositorio, y borrar el secreto del historial
exige reescribirlo y hacer _force-push_ en todas las ramas. No se ha hecho ninguna
de las dos cosas.

**Pasos, en este orden.**

1. Regenerar el token del bot con @BotFather (`/revoke`).
2. Borrar el webhook ajeno: llamar a `deleteWebhook` con el token nuevo y
   comprobar con `getWebhookInfo` que el campo `url` queda vacío. El Worker ya
   llama a `deleteWebhook` cuando recibe un conflicto (409).
3. Cambiar la `APP_KEY` del Worker (por ejemplo `wrangler secret put APP_KEY`) y
   volver a desplegarlo.
4. Actualizar el secreto `VITE_TG_APP_KEY` en GitHub y en el `.env` local, y
   volver a compilar e instalar los APK: los ya instalados llevan la clave antigua.
5. Cerrar la alerta n.º 1 en _Security and analysis → Secret scanning alerts_.
6. Opcional, solo después de rotar: reescribir el historial (`git filter-repo`) y
   hacer _force-push_. Evita que el secreto siga en cada clonación, pero rompe los
   clones locales de quien trabaje en el repositorio.
7. Sustituir el token clásico de GitHub por uno _fine-grained_ limitado a este
   repositorio y retirar el clásico, que se ha compartido en texto plano.

## 3. Dependencias y herramienta

### 3.1 Actualizaciones (`aacc4c0`, `4968062`)

- 35 dependencias de producción y de desarrollo subidas a su versión minor o
  parche más reciente compatible (la lista exacta está en el diff de `package.json`
  del commit `aacc4c0`). `happy-dom` 21.0.4 cierra el aviso GHSA-834v-8h66-3h79.
- `stylelint` de ^17.16 a ^18.1.0 y `stylelint-config-standard` ^41.1.0, nueva
  dependencia directa: la versión 40 declara una regla que stylelint 18 ya no
  tiene y producía 292 errores de configuración.
- `vite-plugin-checker` de ^0.14.5 a ^1.1.0. La versión 1 ejecuta el comando de
  lint sin shell, así que el globo va entre comillas: `eslint "./src/**/*.{js,ts,vue}"`.
  Se añadieron los `.ts` para que el aviso en desarrollo cubra lo mismo que
  `npm run lint`.
- `engines.node`: `^22.22.2 || ^24.15.0 || >=26.0.0`. Es la intersección exacta de
  los `engines` de las 54 dependencias directas, comprobada contra las 174
  versiones estables publicadas de Node: acepta 41 y no discrepa con ninguna. Las
  LTS vigentes son 22.23.5, 24.22.3 y 26.13.1.

### 3.2 Lo que sigue bloqueado

- **TypeScript 7.** `typescript` permanece en 6.0.3 porque `typescript-eslint`
  8.74 exige `<6.1.0` (`vue-tsc` 3.3 acepta `>=5.0.0` y no es el obstáculo).
  Conviene revisarlo cuando `typescript-eslint` publique soporte para la 7.
- **`npm audit`: 7 avisos moderados** que quedan tras actualizar, todos en la
  cadena de desarrollo y compilación. No se resolvieron con las actualizaciones
  disponibles dentro del rango semver actual.
- **Depreciación de `glob` 11.1.0**, dependencia transitiva: no se puede cambiar
  desde este repositorio.

### 3.3 Iconos (`9dc6aa9`)

`lucide-vue-next` quedó depreciado en su versión 1.0.0; el paquete que mantiene
Lucide es `@lucide/vue`. `src/components/AppIcon.vue` es el único punto de
importación (40 iconos), así que el cambio es solo el origen del import: la API es
la misma y los nombres que importa el wrapper (`Home`, `Trash2`, `CircleAlert`)
siguen exportados sin depreciarse, aunque sean alias de `House`, `Trash` y
`CircleExclamationPoint`.

Se renderizaron los 40 iconos con los dos paquetes y se comparó el interior del
SVG: 34 idénticos y 6 con el dibujo cambiado — `ShoppingCart`, `BookOpen`,
`DollarSign`, `Calendar`, `CreditCard` y `Zap`. El dibujo cambia, pero el `viewBox`
(0 0 24 24) no, y la suite lo comprueba icono a icono.

## 4. Guarda de secretos (`4932d41`)

`tools/guarda-secretos.mjs` es un script sin dependencias que revisa lo preparado
para el commit y lo detiene si encuentra una credencial. El gancho `pre-commit` lo
ejecuta antes de `lint-staged`; `tests/guarda-secretos.test.js` pasa la misma
guarda por todos los archivos versionados, de modo que CI falla aunque se haya
saltado el gancho local.

Detecta formatos propios de cada proveedor (token de bot de Telegram, token de
GitHub, claves de AWS y de Google, Slack, Stripe, JWT, bloque de clave privada) y
literales largos asignados a constantes o claves con nombre de secreto (`APP_KEY`,
`SECRET`, `TOKEN`, `PASSWORD`, `API_KEY`). Nunca imprime el valor: solo archivo,
línea y tipo de hallazgo. Ejemplos, máscaras, variables de shell y binarios no se
marcan, y una línea de prueba con formato real se autoriza con el comentario
`guarda-secretos: permitir`.

Es un filtro de patrones: no sustituye al _push protection_ de GitHub (que está
activado) ni reconoce formatos desconocidos.

## 5. Tests

| Medida               | Antes   | Después | Umbral |
| -------------------- | ------- | ------- | ------ |
| Archivos de test     | 58      | 60      | —      |
| Tests                | 721     | 789     | —      |
| Sentencias cubiertas | —       | 83.76 % | 80 %   |
| Ramas cubiertas      | 71.33 % | 71.38 % | 64 %   |
| Funciones cubiertas  | —       | 80.12 % | 75 %   |
| Líneas cubiertas     | —       | 85.84 % | 82 %   |

- `tests/appicon.test.js` (43 casos) recorre los templates de `src/`, extrae los
  38 nombres de icono escritos en `<icon name=…>` (fijos y literales de `:name`)
  y comprueba que cada uno renderiza un `<svg>` con el `viewBox` correcto. Cubre
  además el tema claro/oscuro, los iconos de las recomendaciones, `size`, `color` y
  el comportamiento con un nombre desconocido. Un alias que se borre del wrapper
  ahora falla la suite en vez de dejar un hueco en pantalla.
- `tests/guarda-secretos.test.js` (25 casos): diez formatos detectados, diez
  falsos positivos descartados, numeración de línea, omisión de archivos ilegibles
  y el recorrido completo del repositorio (0 hallazgos).

## 6. Pendientes y recomendaciones

1. **🔴 Rotar las credenciales** de la sección 2. Es lo único que cierra el
   hallazgo; el resto de esta auditoría no lo mitiga.
2. **🟠 `main` está más de 150 commits por detrás** de la rama de trabajo y
   conserva la `APP_KEY` en su punta. Conviene abrir una PR y fusionar.
3. **🟠 Token de GitHub clásico y de ámbito amplio**: sustituirlo por uno
   _fine-grained_ limitado a este repositorio.
4. **🟡 `e2e-matrix.yml` nunca se ejecuta en su programación semanal**: los
   flujos programados solo corren en la rama por defecto. Al fusionar en `main` se
   activará solo.
5. **🟡 Dependabot: las actualizaciones de seguridad están desactivadas**;
   activarlas en _Settings → Code security_. El escaneo de secretos y el _push
   protection_ sí están activados.
6. **🟡 `.env` está versionado** aunque `.gitignore` lo ignora. Hoy solo contiene
   rutas de un entorno de desarrollo, sin secretos. No se ha tocado: borrarlo del
   repositorio puede romper el arranque local de quien lo use.
7. **🟡 `tools/worker/README.md` publica el identificador de cuenta de Cloudflare
   y el de un espacio KV.** No son credenciales, pero no hacen falta ahí.
8. **🟡 El punto de acceso `login` del Worker no muestra limitación de ritmo** en
   el código: la `APP_KEY` se puede intentar por fuerza bruta. Una regla de _rate
   limiting_ en Cloudflare lo cierra.

## 7. Límites de esta auditoría

- La CI de los commits A y B terminó en verde (ejecuciones 143 y 144, 6 de 6
  trabajos). Los commits C, D y este documento pasaron las cinco compuertas en
  local antes de subirse; su ejecución en CI no se había cerrado al redactarlo.
- No se evaluaron cambios de versión mayor más allá de los tres paquetes citados.
- No se tocó `main`, no se reescribió el historial y no se cambió ninguna
  configuración del repositorio.
