# Seguridad — Tienda Pro

## Resumen

- **Los datos viven en tu teléfono** (IndexedDB). Sin tu acción, no salen de él.
- **No hay anuncios, rastreadores ni analítica.**
- **PIN** de 4 a 6 dígitos para proteger operaciones sensibles, guardado como hash (nunca en claro).
- **Respaldos cifrados** con AES-256-GCM y contraseña elegida por ti.
- **Sincronización cifrada:** la nube usa HTTPS y la sesión de Google; el WiFi directo usa un canal WebRTC cifrado entre los dos teléfonos.

Los informes completos de auditoría están en [AUDITORIA-2026-10.md](AUDITORIA-2026-10.md) y [AUDITORIA-2026-11.md](AUDITORIA-2026-11.md).

## PIN de seguridad

El PIN protege las operaciones sensibles (por ejemplo, borrar todos los datos o restaurar respaldos).

- Se activa en **Más → Ajustes → Seguridad → PIN operaciones sensibles** y es un PIN de **4 a 6 dígitos**.
- El PIN **nunca se guarda en claro**: se guarda su hash con **PBKDF2-SHA256, 600.000 iteraciones y sal aleatoria de 16 bytes**, en el formato `pbkdf2$<iteraciones>$<sal>$<hash>`. Cada vez que lo escribes, la app deriva el hash y lo compara.
- Si ya tienes un PIN viejo guardado en claro de una versión anterior, la app lo convierte a hash la primera vez que se guarda la configuración.
- El PIN es **por teléfono**: no se sincroniza con la nube ni con el WiFi. Cada teléfono tiene el suyo.
- Si olvidas el PIN, no hay forma de recuperarlo desde la app: habría que borrar los datos locales (y restaurarlos desde un respaldo). Guarda el PIN en un lugar seguro.

## Respaldos cifrados

El respaldo cifrado usa **AES-256-GCM** (cifrado autenticado: si el archivo se altera, la app lo detecta y no lo abre). La clave se deriva de tu contraseña con **PBKDF2 de 600.000 iteraciones** y una sal aleatoria.

- La contraseña solo la conoces tú: ni la app ni nadie más puede abrir el archivo sin ella.
- Si olvidas la contraseña del respaldo cifrado, **el respaldo no se puede recuperar**. Anótala aparte del archivo.
- El respaldo plano (sin cifrar) se puede leer con cualquier editor de texto: no lo compartas ni lo subas a sitios públicos.

## Qué datos salen del teléfono

| Destino | Qué sale | Cuándo |
| --- | --- | --- |
| **Nube (Supabase)** | Las 15 tablas sincronizables (ver [SINCRONIZACION.md](SINCRONIZACION.md)) | Solo si entras con Google y sincronizas |
| **Otro teléfono (WiFi)** | Las mismas 15 tablas | Solo cuando tú inicias «Compartir por WiFi» |
| **Archivo de respaldo** | Todos los datos (formato v10) | Solo cuando tú exportas |
| **Google** | Tu correo electrónico, solo para confirmar quién eres | Solo al entrar con Google |

Lo que **nunca** sale del teléfono:

- El **PIN** y su hash.
- La **configuración** (nombre de la tienda, tema, umbrales).
- Los **asientos** del libro diario (se reconstruyen en cada teléfono).
- El **registro de sincronización** interno (cambios, descartes, cursores).

## Cuentas y sesiones

- La única cuenta que usa la app es tu **cuenta de Google**, y solo para la sincronización en la nube. La app no tiene cuentas propias ni contraseñas propias.
- La sesión de Google usa el flujo estándar de OAuth 2.0 de Supabase: la app recibe un token de sesión y nunca ve tu contraseña de Google.
- Al **cerrar sesión** en **Nube y cuenta**, la sesión se cierra en ese teléfono; tus datos locales quedan intactos.
- El proyecto de Supabase solo acepta el inicio de sesión con Google; el acceso por correo y contraseña está desactivado.

## Permisos

La app pide solo los permisos que necesita para lo que tú le pidas:

| Permiso | Para qué |
| --- | --- |
| **Cámara** | Escanear el código QR al sincronizar por WiFi. Si no la das, puedes pegar el código en texto. |
| **Notificaciones** | Avisos de stock bajo, arqueo, anomalías, cierre y respaldo pendiente. Se activan en Ajustes. |
| **Archivos / almacenamiento** | Guardar y leer los respaldos (exportar/importar) y el autosave local. |
| **Internet** | Solo para la sincronización en la nube. Sin internet, la app funciona igual con los datos locales. |

En Android, los permisos se piden en el momento en que se necesitan, no todos al instalar.

## El repositorio es público

El código de Tienda Pro es público en GitHub. Por eso:

- **Nunca** hay claves, tokens ni contraseñas dentro del repo. Las claves del APK y de los servicios viven como *secrets* de GitHub Actions, nunca en el código.
- El archivo `.env` **no debe** estar en el repositorio: si alguna vez aparece, hay que quitarlo del seguimiento y rotar las claves que contenga.
- Si encuentras un secreto en el repo, avisa al dueño y no lo compartas.
