# Plan: cuentas, sincronización y compartición por WiFi (noviembre 2026)

> **Nota:** documento de diseño de noviembre 2026. Algunas secciones conservan el diseño con Telegram, retirado el 2026-11-27; su sección 9 ya marca el retiro como hecho. La documentación vigente está en [README.md](README.md).

Rama: `migracion-pinia-nueva` · Estado: decisión tomada; la implementación avanza
por pasos, cada uno con tests y commit propio.

## 1. Decisión en corto

- **Supabase sí**, como nube: cuentas con Google, sincronización por filas y copias cifradas.
  La app sigue siendo local-first: sin conexión funciona igual que hasta ahora.
- **La sincronización la hacemos nosotros** (el registro más nuevo gana, y los
  borrados se registran en vez de desaparecer). Supabase no trae motor de
  sincronización propio y el mismo motor sirve para la nube y para el WiFi directo.
- **WiFi directo sin internet**: canal de datos WebRTC entre los dos teléfonos,
  emparejados con un código QR (o el mismo código copiado como texto).
- **Telegram retirado el 2026-11-27.** La sincronización en la nube
  (Supabase) y por WiFi, más el backup local, sustituyen el respaldo por
  Telegram. Con él desaparecen tres secretos: el token del bot, la
  `APP_KEY` del Worker y el propio Worker.

## 2. Cómo funciona hoy

- La base local es Dexie/IndexedDB (`src/db.ts`, versión 8, 17 tablas). Las claves
  ya son únicas entre dispositivos (`genId`: prefijo + tiempo en base 36 + 8
  caracteres aleatorios), así que no hay que migrar ningún identificador.
- No hay marca de tiempo de modificación por fila ni rastro de los borrados: un
  borrado es definitivo y invisible para cualquier otro dispositivo.
- Los respaldos fuera del dispositivo van por la sincronización en la nube
  (Supabase) y por WiFi directo. El respaldo por Telegram (antes en
  `src/telegram.ts`, con un Worker de Cloudflare como proxy) se retiró el
  2026-11-27; ver §9.
- Restaurar un respaldo reemplaza los datos (`src/stores/importacion.ts`): no hay
  combinación entre lo que hay en el teléfono y lo que trae el archivo.
- Problemas de este diseño: depende de Telegram y de internet; la `APP_KEY` y el
  token del bot se filtraron (hallazgo P0 de la auditoría de noviembre); el
  `login` del Worker no limita el ritmo de intentos; y restaurar sobre datos más
  nuevos los pisa.

## 3. Supabase: encaje (hechos verificados el 2026-11-24)

| Aspecto                 | Dato                                                                                                                                           | Fuente                                                                                                 |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Plan gratis             | 500 MB de base de datos, 1 GB de archivos (50 MB por archivo), 50 000 usuarios activos/mes, 5 GB de salida, 2 proyectos activos                | <https://supabase.com/pricing>                                                                         |
| Pausa por inactividad   | Un proyecto gratis se pausa tras 1 semana sin consultas; se reanuda a mano y los datos se conservan hasta 1 año                                | <https://supabase.com/docs/guides/platform/free-project-pausing>                                       |
| Cuentas con contraseña  | Funciona con la confirmación por correo desactivada y sin enviar ningún correo                                                                 | <https://supabase.com/docs/guides/auth/auth-email-templates>                                           |
| Correo integrado        | 2 correos por hora; para producción pide SMTP propio (Resend, SES, Brevo…)                                                                     | <https://supabase.com/docs/guides/auth/rate-limits>, <https://supabase.com/docs/guides/auth/auth-smtp> |
| Varios dispositivos     | Sesiones activas ilimitadas por usuario                                                                                                        | <https://supabase.com/docs/guides/auth/sessions>                                                       |
| Sesiones                | Token de acceso de 1 hora; el de refresco se usa una vez y no caduca                                                                           | idem                                                                                                   |
| Librería cliente        | `@supabase/supabase-js` 2.119.2 (2026-11-19)                                                                                                   | <https://github.com/supabase/supabase-js/releases>                                                     |
| Motor de sincronización | No hay uno propio; PowerSync y Electric son socios de terceros con su propia capa                                                              | <https://supabase.com/blog/triplit-joins-supabase>                                                     |
| Control por API         | Token de acceso `sbp_…` contra `api.supabase.com`: crear proyecto, ejecutar SQL, cambiar la configuración de autenticación, gestionar secretos | <https://supabase.com/docs/reference/api/introduction>                                                 |
| Conexión IPv4           | El pooler compartido `aws-<n>-<región>.pooler.supabase.com` (5432 o 6543) es solo IPv4                                                         | <https://supabase.com/docs/guides/database/connecting-to-postgres>                                     |

## 4. Alternativas descartadas

- **PocketBase**: MIT, pero solo autoalojado, y su repositorio de GitHub quedó
  archivado el 2026-10-26. Exige un servidor: contra la regla de «gratis y sin tu
  intervención».
- **Appwrite Cloud**: gratis hasta 75 000 usuarios, 2 GB y 5 GB de ancho de banda;
  al pasar el límite el proyecto se congela.
- **Cloudflare Workers + D1**: 5 GB y 100 000 escrituras/día gratis; desde el
  2026-09-01 las consultas por encima del límite fallan. No encontramos un acceso
  con cuenta gestionado: habría que escribirlo entero.
- **PowerSync / ElectricSQL**: sincronización hecha, pero sobre su propio cliente
  (SQLite en la app) o solo lectura. Obligaría a sustituir Dexie.

## 5. Riesgos y cómo se mitigan

| Riesgo                                                                     | Mitigación                                                                                                                                                                        |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| El proyecto gratis se pausa si la tienda cierra una semana                 | La app sigue funcionando sin conexión y avisa de «cuenta en pausa»; se reanuda desde el panel o por API                                                                           |
| Un teléfono con el reloj adelantado gana todos los conflictos              | Reloj lógico: cada dispositivo usa siempre «ahora» o «último visto + 1», el mayor de los dos                                                                                      |
| Un teléfono con una copia vieja se conecta por primera vez y pisa lo nuevo | Lo que existía antes del seguimiento se envía con tiempo 0 (edad desconocida): pierde cualquier conflicto contra la nube. La versión descartada se guarda en la tabla `descartes` |
| Un borrado viaja y borra datos nuevos en el otro teléfono                  | Solo gana el borrado si es más nuevo que el último cambio de la fila en el dispositivo que lo recibe                                                                              |
| WebRTC dentro del WebView de Android                                       | No se puede probar aquí: requiere la prueba con dos teléfonos reales (sección 8)                                                                                                  |
| El punto de acceso aísla a los clientes entre sí                           | Ningún diseño lo resuelve; se documenta y se ofrece el código por texto como alternativa                                                                                          |
| Android 17 exigirá `ACCESS_LOCAL_NETWORK`                                  | Con objetivo SDK 36 el acceso a la red local es implícito; se añade el permiso cuando se suba el objetivo a 37                                                                    |

## 6. Arquitectura

1. **La base local sigue siendo la fuente de verdad.** Lecturas y escrituras no
   cambian.
2. **Seguimiento de cambios.** Una tabla nueva `cambios` (esquema 9) registra
   cada alta, modificación y borrado de las 15 tablas de datos, con marca de
   tiempo, dispositivo y número de secuencia. Los borrados dejan lápida.
3. **Motor de sincronización** (puro, sin transporte): exportar cambios desde un
   cursor y aplicar cambios remotos con la regla «gana (tiempo, dispositivo)
   mayor». Al aplicar lo remoto se salta el seguimiento, para que un cambio no
   rebote entre dispositivos.
4. **Transporte nube (Supabase).** Una tabla `sync_registros` guarda cada fila
   como JSON con su dueño. Nadie la lee ni la escribe directamente: dos
   funciones SQL (`sync_empujar` / `sync_tirar`) lo hacen para el usuario en
   sesión y aplican allí la misma regla de conflicto. Una secuencia del
   servidor sirve de punto de lectura.
5. **Transporte WiFi directo.** Código QR → canal de datos WebRTC → intercambio
   de cambios en lotes con acuse. Primera vez: estado completo; después, cambios
   desde el cursor propio de cada pareja.
6. **Cuentas: solo con Google** (Supabase Auth, proveedor Google). No hay
   correo ni contraseña: ese acceso está apagado en el proyecto. En la app
   instalada, Google se abre en el navegador del teléfono y vuelve por un
   enlace profundo (`tiendapro://auth`). Si Google todavía no está conectado
   al proyecto, la pantalla de cuenta lo dice y no estorba.
7. **Que el proyecto no se pause.** El plan gratis pausa el proyecto tras una
   semana con pocas peticiones. Un flujo de GitHub
   (`supabase-keepalive.yml`) hace varias peticiones diarias a `sync_latido`
   y renueva la actividad del repositorio cada 45 días, porque GitHub apaga
   los horarios de los repositorios públicos que llevan 60 días sin actividad.

No se sincronizan `config` (ajustes y PIN del teléfono) ni `tgQueue` (cola local
de Telegram).

## 7. Qué se necesita para tomar el control total

1. **Cuenta de Supabase (plan gratis) y un token de acceso personal**,
   entregado en un archivo, no pegado en el chat ni en el repositorio. Con él
   se prepara el proyecto, se aplica el esquema y se configura la
   autenticación. Se revoca al terminar. Ya usado: se reutilizó el proyecto
   existente «Gestion-tienda-pro» en vez de crear otro.
2. **ID de cliente y secreto de Google**: se crean en Google Cloud Console
   (pantalla de permisos más un ID de cliente de tipo «aplicación web» con la
   dirección de regreso del proyecto) y solo los puede crear el dueño de la
   cuenta de Google. La guía paso a paso está en `docs/GUIA-CONECTAR-GOOGLE.md`.
3. **Dos teléfonos Android** para probar el enlace directo por WiFi y el
   acceso con Google: aquí no hay dispositivos ni SDK de Android.
4. **Rotar el token de Telegram** si al final se conserva esa opción.

## 8. Fuentes consultadas (2026-11-24 y 2026-11-25)

- Supabase: <https://supabase.com/pricing>,
  <https://supabase.com/docs/guides/platform/free-project-pausing>,
  <https://supabase.com/docs/guides/auth/auth-email-templates>,
  <https://supabase.com/docs/guides/auth/rate-limits>,
  <https://supabase.com/docs/guides/auth/auth-smtp>,
  <https://supabase.com/docs/guides/auth/sessions>,
  <https://supabase.com/docs/guides/auth/native-mobile-deep-linking>,
  <https://supabase.com/docs/guides/storage/uploads/file-limits>,
  <https://supabase.com/docs/reference/api/introduction>,
  <https://supabase.com/docs/guides/database/connecting-to-postgres>,
  <https://github.com/supabase/supabase-js/releases>,
  <https://supabase.com/blog/triplit-joins-supabase>
- Alternativas: <https://github.com/pocketbase/pocketbase>,
  <https://appwrite.io/blog/post/introducing-appwrite-cloud-start-plan>,
  <https://developers.cloudflare.com/workers/platform/pricing>,
  <https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement>,
  <https://powersync.com/pricing>, <https://electric.ax/pricing>
- Android y WebView: <https://developer.android.com/privacy-and-security/local-network-permission>,
  <https://developer.android.com/about/versions/17/behavior-changes-17>,
  <https://developer.android.com/reference/android/webkit/WebChromeClient>,
  <https://developer.android.com/reference/android/net/nsd/NsdManager>
- Web y Capacitor: <https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/connect-src>,
  <https://developer.mozilla.org/en-US/docs/Web/Security/Mixed_content>,
  <https://www.w3.org/TR/CSP3/>, <https://capacitorjs.com/docs/config>,
  <https://capacitorjs.com/docs/apis/http>
- GitHub Actions (25 de noviembre): <https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows>
  (el horario solo corre desde la rama principal, y se apaga a los 60 días sin actividad
  en un repositorio público). Supabase, pausa de proyectos (25 de noviembre):
  <https://supabase.com/docs/guides/platform/free-project-pausing>
  (una semana con pocas peticiones; unas pocas al día basta; se reanuda desde el panel).
- Librerías de QR: <https://github.com/ionic-team/capacitor-barcode-scanner>,
  <https://github.com/capawesome-team/capacitor-mlkit>,
  <https://www.nngroup.com/articles/qr-code-guidelines>

## 9. Estado de la implementación (25 de noviembre de 2026; actualizado el 27 de noviembre de 2026)

Hecho, con pruebas automáticas:

- **Registro de cambios** (`src/sync/seguimiento.ts`, esquema versión 9): toda escritura en las 15 tablas sincronizables deja su entrada en `cambios`, también dentro de transacciones y en operaciones masivas; los borrados dejan lápida. La marca lógica salta por encima de cualquier marca remota vista.
- **Motor de sincronización** (`src/sync/motor.ts`): exportar estado completo o cambios desde un cursor, y aplicar filas remotas con la regla «gana la más nueva»; la versión que pierde queda en `descartes`; lo anterior al seguimiento viaja con marca 0 y nunca pisa un cambio real.
- **Enlace por WiFi directo** (`src/sync/webrtc.ts`, `enlace.ts`, `codigo.ts`, `qr.ts`): canal de datos WebRTC sin servidores (solo red local), señalización por QR o copiar y pegar, SDP comprimido en base45, lotes confirmados, la segunda vez solo viaja lo nuevo. El 25 de noviembre la prueba en Chromium real (`npm run test:enlace`, hoy también en CI) destapó cuatro fallos que las pruebas de unidad no veían, ya corregidos: el que se unía esperaba un canal que solo aparece cuando ya está conectado; los códigos salían antes de reunir las direcciones de red del teléfono; la pantalla del que se unía no arrancaba la sincronización; y el punto guardado se leía bajo el identificador propio en vez del del otro, así que cada enlace pedía todo (el saludo va ahora en dos pasos: `hola` y `pide`).
- **Panel «Compartir por WiFi»** (`src/components/SyncWifi.vue`, entrada en el menú «Más»): guía los dos pasos, muestra el progreso y permite restaurar versiones que perdieron. Permiso de cámara declarado en el manifiesto de Android para leer el QR.
- **Nube con Supabase** (`supabase/migrations/0001_sync_nube.sql`, `src/sync/nube.ts`): una tabla `sync_registros` guarda cada fila como JSON con su dueño; nadie la lee ni la escribe directamente, solo a través de `sync_empujar` y `sync_tirar`, que aplican en el servidor la misma regla «gana la más nueva». La app sube lo que nació en el teléfono o llegó por WiFi (no devuelve lo que bajó de la nube) y baja por ventanas de 500 desde un punto de lectura guardado; dos vueltas a la vez se unen en una.
- **Panel «Nube y cuenta»** (`src/components/CuentaNube.vue`, entrada en el menú «Más»): entrar con Google, ver el estado, sincronizar ahora y cerrar sesión. Sincroniza sola al abrir, al volver a primer plano y cada 30 segundos.
- **Acceso solo con Google**: el enlace profundo `tiendapro://auth` está declarado en el manifiesto de Android y es la dirección de regreso del proyecto; el plugin del navegador está registrado en el proyecto Android; el acceso con correo y clave está apagado en el proyecto.
- **Que el proyecto no se pause** (`.github/workflows/supabase-keepalive.yml`): cuatro carreras al día, tres peticiones cada una a `sync_latido`; además un commit vacío en la rama `keepalive` cada 45 días. El horario solo corre con el archivo en la rama principal, así que también está en `main`.
- **Telegram retirado (27 de noviembre de 2026):** se eliminaron `src/telegram.ts`, `src/stores/useTelegramStore.ts`, `tools/worker/` entero, la tabla `tgQueue` (esquema versión 10) y toda la UI y los tests de Telegram. El respaldo fuera del dispositivo es ahora la sincronización en la nube (Supabase) y por WiFi, más el backup local y el export/import. Queda pendiente, fuera del repo, borrar el secret `VITE_TG_APP_KEY` en GitHub, borrar el Worker en Cloudflare y revocar el token del bot.
- Pruebas: `tests/sync-seguimiento`, `sync-motor`, `sync-codigo`, `sync-enlace` (40 casos), `tests/sync-nube` (6 casos: no devolver lo bajado, aislamiento entre cuentas, conflicto, borrado, relevo de WiFi a la nube, vueltas concurrentes) y `npm run test:enlace`, que conecta dos bases en un Chromium real pasando los códigos por QR.

Comprobado contra el proyecto real el 25 de noviembre, con dos usuarios de prueba que se borraron al terminar (15 comprobaciones): el latido anónimo llega; sin sesión la nube no entrega nada (401); la tabla no se puede leer directamente ni con sesión (403); subida y bajada con versiones crecientes; una cuenta no ve los datos de otra; una versión más antigua no pisa la buena y una más nueva sí se acepta; solo viaja lo posterior al punto de lectura; un lote con una tabla que no viaja se rechaza entero y no cambia nada; un borrado viaja como lápida; el acceso por correo y clave queda apagado.

Pendiente (por este orden):

1. **Conectar Google al proyecto.** Hace falta el ID de cliente y el secreto de Google, que solo los puede crear el dueño de la cuenta de Google (guía: `docs/GUIA-CONECTAR-GOOGLE.md`). Hasta entonces el botón «Entrar con Google» avisa de que falta ese paso.
2. Probar en dos teléfonos Android reales: el enlace WiFi (alcance del QR en pantalla, permiso de cámara y conexión en la red local), el acceso con Google completo (navegador y regreso por el enlace profundo) y que un cambio hecho en un teléfono llega al otro. Hasta hacerlo se considera sin verificar en dispositivo.
3. Vista general de `descartes` (hoy solo se ven al terminar un enlace).
4. ~~Retirar el bot de Telegram cuando la nube esté validada.~~ **Hecho el 2026-11-27** (ver arriba).

Limitaciones conocidas:

- Los datos que ya existían antes del registro de cambios no tienen fecha: viajan con marca 0 y pierden contra cualquier edición posterior; la copia antigua queda en `descartes`.
- Importar o restaurar un respaldo cuenta como cambio nuevo: lo importado gana en los demás dispositivos, y lo que el respaldo no incluía se borra también allí (siempre con copia en `descartes`).
- El que se une espera cinco minutos a que el otro teléfono escanee su código; después hay que empezar de nuevo.
- Los respaldos por archivo no incluyen `cambios` ni `descartes`.
- Al entrar con una cuenta en un teléfono que ya tiene datos, los datos del teléfono se unen con los de esa cuenta: no se borran ni se reemplazan por los de la nube.
- El regreso del acceso con Google solo funciona en la app instalada; en un navegador de escritorio no hay aplicación a la que volver.
- El anti-pausa depende de GitHub: si el repositorio pasara 60 días sin actividad, GitHub apaga el horario. Un proyecto pausado se reanuda desde el panel de Supabase y conserva sus datos.
