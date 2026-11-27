# Sincronización — Tienda Pro

Tienda Pro guarda todo en el teléfono y funciona sin internet. La sincronización es **opcional** y sirve para tener los mismos datos en varios teléfonos. Hay dos formas, que se pueden usar juntas o por separado:

| Vía | Para qué sirve | Necesita |
| --- | --- | --- |
| **Nube (Supabase)** | Mantener los teléfonos sincronizados aunque estén lejos | Internet y una cuenta de Google |
| **WiFi directo** | Pasar los datos de un teléfono a otro sin internet | Que los dos teléfonos estén en la misma red WiFi |

Las dos vías usan el mismo motor: cada cambio se registra con su fecha (`ts`) y el dispositivo que lo hizo, y al aplicar cambios remotos gana el más nuevo. Los detalles técnicos están en [PLAN-CUENTAS-Y-SINCRONIZACION.md](PLAN-CUENTAS-Y-SINCRONIZACION.md).

## Qué se sincroniza

Viajan **15 tablas**: productos, lotes, ventas, compras, ajustes, arqueos, movCaja, cierres, capital, retiros, socios, distribuciones, gastos, pasivos y auditorías.

## Qué NO viaja

- **Asientos (libro diario):** no se sincronizan porque cada teléfono los **reconstruye** desde ventas, compras, gastos y demás. El resultado es el mismo en todos los dispositivos.
- **Configuración (config):** nombre de la tienda, tema, PIN, umbrales y demás ajustes son **por teléfono** y no se copian. El PIN nunca sale del teléfono que lo tiene.
- **Registro de transporte (cambios, descartes, syncMeta):** son el registro interno de qué se envió y qué se recibió; no son datos del usuario.

## Resolución de conflictos

Si el mismo registro cambia en dos teléfonos antes de sincronizar, **gana el cambio más nuevo**. El orden se decide por `(ts, dispositivo)`: primero por la marca de tiempo del cambio y, si empatan, por el identificador del dispositivo (gana el mayor). La versión que pierde no se borra del todo: se guarda en una tabla interna (`descartes`) por si hace falta recuperarla.

Consecuencias prácticas:

- Si dos teléfonos editan el **mismo** producto a la vez, queda la edición más reciente y la otra se descarta (pero queda guardada en `descartes`).
- Si un teléfono **borra** un registro y otro lo **edita**, gana el cambio más nuevo: si el borrado es más nuevo, el registro se borra en todos; si la edición es más nueva, el registro vuelve.
- Los cambios en registros **distintos** nunca chocan: se mezclan sin problema.

## Nube (Supabase)

La nube es un proyecto de Supabase del dueño de la app (`chstqhjoizljlpgehdkn`). Los teléfonos no leen ni escriben la tabla directamente: usan tres funciones del servidor — `sync_empujar` (subir cambios), `sync_tirar` (bajar cambios) y `sync_latido` (comprobar que el servicio responde) — y solo se puede entrar con una sesión de Google válida.

### Entrar con Google

1. Abre **Más → Nube y cuenta**.
2. Toca **Entrar con Google** y elige tu cuenta de Google. Se abre el navegador, aceptas, y la app vuelve sola (enlace `tiendapro://auth`).
3. La pantalla muestra «Sesión iniciada como tu-correo@…» y el estado de la sincronización.

La primera sincronización envía el **estado completo** del teléfono a la nube. Después, solo viajan los cambios nuevos, en lotes de hasta 500 filas.

### Estado de sincronización

El indicador del encabezado muestra el estado:

| Indicador | Significado |
| --- | --- |
| Verde «Al día» | Sincronizado; la última sync fue hace menos de 10 minutos |
| Amarillo «Sincronizando…» | Hay una sincronización en curso |
| Rojo «Error de sync» | La última sync falló (toca el indicador para ver el error) |
| Gris «Sin sincronizar» | Tienes sesión pero aún no se ha sincronizado |
| Gris «Sin sesión» | No has entrado con Google |

Tocar el indicador abre **Nube y cuenta**.

### Sincronizar ahora

En **Nube y cuenta**, el botón **Sincronizar ahora** fuerza una vuelta completa (subir + bajar). La app también sincroniza sola cada cierto tiempo mientras esté abierta y haya internet.

### Cerrar sesión

El botón **Cerrar sesión** cierra la sesión de Google en ese teléfono. Los datos locales **no se borran**: la app sigue funcionando con lo que tiene y puedes volver a entrar cuando quieras.

### Si Google no está conectado

Si al entrar aparece el aviso «Google todavía no está conectado al proyecto de la nube», es que falta el paso del dueño de la cuenta de Supabase: ver [GUIA-CONECTAR-GOOGLE.md](GUIA-CONECTAR-GOOGLE.md).

## WiFi directo

Dos teléfonos en la **misma red WiFi** pueden sincronizarse sin internet y sin nube, por un canal WebRTC cifrado entre ellos. No hay servidores intermedios: el enlace se crea solo entre los dos teléfonos (sin STUN ni TURN, por eso no funciona fuera de la red local).

### Cómo se hace

1. En los dos teléfonos, abre **Más → Compartir por WiFi**.
2. En el primer teléfono, elige **«Este teléfono crea el enlace»**: aparece un código QR (y el código en texto).
3. En el segundo teléfono, elige **«Este teléfono se une»** y escanea el QR con la cámara. Si la cámara no se abre, toca **Pegar código** y pega el código en texto copiado del otro teléfono.
4. El segundo teléfono muestra ahora su propio código de respuesta: en el primer teléfono, toca **«Escanear la respuesta»** y escánalo (o pégalo).
5. Con los dos códigos intercambiados se abre el canal y empieza la sincronización. La pantalla muestra el progreso («conectando», «preparando», «enviando») y al final el resumen de lo aplicado.

### Limitaciones

- Los dos teléfonos deben estar en la **misma red WiFi** (misma casa, mismo router). No funciona con datos móviles ni con redes distintas.
- El código QR puede no caber si hay muchos datos pendientes: en ese caso usa **Copiar código** y pégalo en el otro teléfono.
- Si un código no se reconoce, la app avisa: pide al otro teléfono que genere el código de nuevo y copia el código **entero**, sin cortar caracteres.
- La sincronización por WiFi es puntual: se hace cuando tú la inicias, no es automática en segundo plano.
