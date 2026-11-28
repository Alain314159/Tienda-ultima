# Respaldos — Tienda Pro

Un respaldo es una copia de todos los datos de la tienda que puedes guardar fuera de la app y restaurar después. Hay tres mecanismos, de más automático a más manual:

| Mecanismo | Cuándo se hace | Dónde queda |
| --- | --- | --- |
| **Autosave** | Solo, cada 10 operaciones, al salir de la app y al arrancar | Carpeta local de respaldos del teléfono |
| **Exportar respaldo** | Cuando tú lo pides, en Ajustes | Archivo `.json` que tú guardas donde quieras |
| **Exportar respaldo cifrado** | Cuando tú lo pides, en Ajustes | Archivo `.json` cifrado, protegido con contraseña |

Además, la app avisa si pasan más de 7 días (configurable en Ajustes) sin respaldo, exportación o sincronización, siempre que haya datos que perder.

## Autosave (respaldo automático)

El autosave guarda una copia local sin que tengas que hacer nada:

- Se dispara **cada 10 operaciones** (ventas, compras, gastos…), **al salir de la app** o pasar a segundo plano, y **al arrancar** si hubo cambios desde el último respaldo.
- Solo guarda si los datos **cambiaron** desde el último autosave (compara un hash del contenido), para no gastar batería ni almacenamiento.
- Guarda las copias en una carpeta local y **rota hasta 30**: cuando hay más de 30, borra las más antiguas.
- En Android, el autosave usa la carpeta de archivos de la app (Capacitor Filesystem); en web, el almacenamiento local del navegador.

### Restaurar el último backup automático

En **Ajustes → Datos y respaldos**, debajo de «Último backup auto», toca **Restaurar backup automático**. La app restaura esa copia. Es la forma más rápida de recuperar los datos si algo salió mal y no tienes un archivo exportado.

## Exportar un respaldo

En **Ajustes → Datos y respaldos** hay dos botones:

- **Exportar respaldo (JSON):** genera un archivo `.json` en texto plano con todos los datos. Guárdalo en un lugar seguro (otra carpeta del teléfono, una nube personal, un correo a ti mismo). Cualquiera que tenga ese archivo puede leer tus datos: no lo compartas.
- **Exportar respaldo cifrado:** genera un archivo `.json` cifrado con **AES-256-GCM**; la clave se deriva de la contraseña que elijas con **PBKDF2 de 600.000 iteraciones**. Es la opción recomendada si el archivo va a salir del teléfono (correo, nube, memoria USB). Sin la contraseña no se puede abrir: **si la olvidas, el respaldo no se puede recuperar**.

En Android, la exportación usa el diálogo de compartir/guardar del sistema; en web, descarga el archivo.

## Qué incluye un respaldo

El formato de respaldo es la **versión 10** e incluye:

- Configuración de la app (`cfg`): nombre de la tienda, tema, umbrales, etc.
- **Todas las tablas de datos:** productos, lotes, ventas, compras, ajustes, arqueos, movCaja, cierres, capital, retiros, socios, distribuciones, gastos, **pasivos** y **auditorías**.
- Los **asientos** del libro diario se exportan vacíos a propósito: al restaurar, la app los **reconstruye** desde las tablas fuente y quedan igual que antes.

Lo que **no** incluye (y por qué):

- **El registro de sincronización (cambios, descartes, syncMeta):** es el registro de transporte, no datos del usuario. Después de restaurar, el motor de sync vuelve a enviar el **estado completo** la primera vez que el teléfono se une a la cuenta, y los cambios nuevos se registran desde el estado restaurado.

## Importar un respaldo

1. En **Ajustes → Datos y respaldos**, toca **Importar datos** y elige el archivo.
2. La app lee el archivo y muestra una **vista previa**: qué trae el respaldo y qué datos hay ahora, para que compares antes de aceptar.
3. Si el respaldo es cifrado, te pide la **contraseña**.
4. Al confirmar, la app guarda primero una **copia de seguridad de tus datos actuales** (por si te arrepientes) y luego sustituye los datos por los del respaldo.
5. Si algo sale mal, puedes volver atrás con **Restaurar copia pre-importación**.

La importación acepta estos formatos:

- `.json` plano (exportación actual).
- `.json` con gzip por dentro (exportaciones de versiones anteriores a la migración; el nombre decía `.json` pero el contenido era gzip).
- `.json` cifrado (exportación cifrada actual).

El importador valida el esquema del archivo antes de tocar tus datos y rechaza archivos que no sean un respaldo válido o que superen el límite de 256 MB de JSON expandido.

## Restaurar después de un cambio de teléfono

1. En el teléfono viejo, **exporta un respaldo** (cifrado, recomendado) y pásalo al teléfono nuevo.
2. En el teléfono nuevo, instala la app e **importa el respaldo** como se explica arriba.
3. Si usas la nube, también puedes entrar con Google en el teléfono nuevo y dejar que la sincronización baje los datos; el respaldo importado es la vía más rápida y no necesita internet.

## Borrar todos los datos

En **Ajustes → Zona peligrosa**, el botón **Borrar TODOS los datos** elimina todos los datos locales de la app. Es irreversible salvo que tengas un respaldo exportado. La app pide confirmación antes de hacerlo.
