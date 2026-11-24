# Plan: cuentas, sincronización y compartición por WiFi (noviembre 2026)

Rama: `migracion-pinia-nueva` · Estado: decisión tomada; la implementación avanza
por pasos, cada uno con tests y commit propio.

## 1. Decisión en corto

- **Supabase sí**, como nube: cuentas, sincronización por filas y copias cifradas.
  La app sigue siendo local-first: sin conexión funciona igual que hasta ahora.
- **La sincronización la hacemos nosotros** (el registro más nuevo gana, y los
  borrados se registran en vez de desaparecer). Supabase no trae motor de
  sincronización propio y el mismo motor sirve para la nube y para el WiFi directo.
- **WiFi directo sin internet**: canal de datos WebRTC entre los dos teléfonos,
  emparejados con un código QR (o el mismo código copiado como texto).
- **Telegram pasa a opcional** y se retira cuando la nube esté validada en
  teléfonos reales. Con él desaparecen tres secretos: el token del bot, la
  `APP_KEY` del Worker y el propio Worker.

## 2. Cómo funciona hoy

- La base local es Dexie/IndexedDB (`src/db.ts`, versión 8, 17 tablas). Las claves
  ya son únicas entre dispositivos (`genId`: prefijo + tiempo en base 36 + 8
  caracteres aleatorios), así que no hay que migrar ningún identificador.
- No hay marca de tiempo de modificación por fila ni rastro de los borrados: un
  borrado es definitivo y invisible para cualquier otro dispositivo.
- Los respaldos nubeados van por `src/telegram.ts` a un Worker de Cloudflare
  (`tienda-proxy.…workers.dev`) con una `APP_KEY` incrustada en cada APK. El
  Worker guarda «cuentas» de nombre de tienda y contraseña y usa el chat de
  Telegram como almacén de archivos (`listBackups`, `sendDocument`, `getUpdates`).
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
   cada alta, modificación y borrado de las 16 tablas de datos, con marca de
   tiempo, dispositivo y número de secuencia. Los borrados dejan lápida.
3. **Motor de sincronización** (puro, sin transporte): exportar cambios desde un
   cursor y aplicar cambios remotos con la regla «gana (tiempo, dispositivo)
   mayor». Al aplicar lo remoto se salta el seguimiento, para que un cambio no
   rebote entre dispositivos.
4. **Transporte nube (Supabase).** Una tabla `registros` guarda cada fila como
   JSON con su dueño; RLS aísla a cada usuario; dos funciones SQL hacen el
   «empujar» y el «tirar» con la misma regla de conflicto. Secuencia del servidor
   como cursor.
5. **Transporte WiFi directo.** Código QR → canal de datos WebRTC → intercambio
   de cambios en lotes con acuse. Primera vez: estado completo; después, cambios
   desde el cursor propio de cada pareja.
6. **Cuentas.** Correo y contraseña en Supabase Auth. Si el proyecto no está
   configurado, la pantalla de cuenta lo dice y no estorba.

No se sincronizan `config` (ajustes y PIN del teléfono) ni `tgQueue` (cola local
de Telegram).

## 7. Qué se necesita para tomar el control total

1. **Cuenta de Supabase (plan gratis) y un token de acceso personal (`sbp_…`)**,
   entregado en un archivo, no pegado en el chat ni en el repositorio. Con él se
   crea el proyecto, se aplica el esquema y se configura la autenticación. Se
   revoca al terminar. Alternativa con menos alcance: URL del proyecto,
   contraseña de la base y claves `anon` y `service_role`.
2. **Dos teléfonos Android en la misma red WiFi** para probar el enlace directo:
   aquí no hay dispositivos ni SDK de Android.
3. **Valores por defecto** que se aplican salvo indicación contraria: plan gratis,
   cuentas de correo y contraseña sin confirmación por correo, Telegram opcional
   hasta validar la nube.
4. **Opcional**: proveedor de correo (Resend tiene capa gratis) para recuperar la
   contraseña. Sin él, la recuperación hay que hacerla a mano desde el panel.
5. **Rotar el token de Telegram** si al final se conserva esa opción.

## 8. Fuentes consultadas (2026-11-24)

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
- Librerías de QR: <https://github.com/ionic-team/capacitor-barcode-scanner>,
  <https://github.com/capawesome-team/capacitor-mlkit>,
  <https://www.nngroup.com/articles/qr-code-guidelines>
