# Sincronización — Tienda Pro

Tienda Pro guarda todo en el teléfono y funciona sin internet. La sincronización es **opcional** y sirve para tener los mismos datos en varios teléfonos. Hay dos formas, que se pueden usar juntas o por separado:

| Vía                 | Para qué sirve                                          | Necesita                                                                                       |
| ------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **Nube (Supabase)** | Mantener los teléfonos sincronizados aunque estén lejos | Internet y una cuenta de Google                                                                |
| **WiFi directo**    | Pasar los datos de un teléfono a otro sin internet      | Que los dos teléfonos estén en la misma red WiFi (y con internet si se conectan con el código) |

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

| Indicador                 | Significado                                                |
| ------------------------- | ---------------------------------------------------------- |
| Verde «Al día»            | Sincronizado; la última sync fue hace menos de 10 minutos  |
| Amarillo «Sincronizando…» | Hay una sincronización en curso                            |
| Rojo «Error de sync»      | La última sync falló (toca el indicador para ver el error) |
| Gris «Sin sincronizar»    | Tienes sesión pero aún no se ha sincronizado               |
| Gris «Sin sesión»         | No has entrado con Google                                  |

Tocar el indicador abre **Nube y cuenta**.

### Sincronizar ahora

En **Nube y cuenta**, el botón **Sincronizar ahora** fuerza una vuelta completa (subir + bajar). La app también sincroniza sola cada cierto tiempo mientras esté abierta y haya internet.

### Cerrar sesión

El botón **Cerrar sesión** cierra la sesión de Google en ese teléfono. Los datos locales **no se borran**: la app sigue funcionando con lo que tiene y puedes volver a entrar cuando quieras.

### Si Google no está conectado

Si al entrar aparece el aviso «Google todavía no está conectado al proyecto de la nube», es que falta el paso del dueño de la cuenta de Supabase: ver [GUIA-CONECTAR-GOOGLE.md](GUIA-CONECTAR-GOOGLE.md).

## WiFi directo

Dos teléfonos en la **misma red WiFi** pueden sincronizarse sin internet y sin nube, por un canal WebRTC cifrado entre ellos. Los datos van directos de un teléfono al otro; no hay servidores intermedios por donde pasen los datos. Solo el intercambio inicial puede pasar por Supabase (cuando se conectan con el código) y un servidor STUN público ayuda a que los teléfonos se vean en redes complicadas: por el STUN no pasa ningún dato de la tienda, solo la pregunta «¿cuál es mi dirección?».

### Cómo se hace (con código)

1. En los dos teléfonos, abre **Más → Compartir por WiFi**.
2. En el primer teléfono, elige **«Este teléfono crea el enlace»**: aparece un código de **6 dígitos** (el código de la sala, que es también el código de emparejamiento).
3. En el segundo teléfono, elige **«Este teléfono se une»**, escribe el código de 6 dígitos y toca **Conectar con el código**.
4. Con el código, el intercambio de la oferta y la respuesta viaja por Supabase Realtime Broadcast (solo la señalización; los datos siguen yendo directos por WiFi). La pantalla muestra el progreso («conectando», «preparando», «enviando») y al final el resumen de lo aplicado.

Para conectar con el código, los dos teléfonos necesitan **internet** (para la señalización). Los datos de la tienda no pasan por internet: van directos por la WiFi.

### Cómo se hace sin internet (con QR)

Si no hay internet, el intercambio se hace con el código QR, como antes:

1. En el primer teléfono, elige **«Este teléfono crea el enlace»**: aparece el código de 6 dígitos y, debajo, el código QR.
2. En el segundo teléfono, elige **«Este teléfono se une»** y toca **Escanear el código QR**: la cámara se abre a pantalla completa, con una guía en el centro. Apunta al QR del primer teléfono.
3. El segundo teléfono muestra ahora su propio código de respuesta: en el primer teléfono, toca **«Escanear la respuesta»** y escánalo.
4. Con los dos códigos intercambiados se abre el canal y empieza la sincronización.

El código de texto largo (el que se copia y pega) solo queda como último recurso: en la pantalla del código, **«Ver código como texto (último recurso)»**. Nunca hay que dictarlo: es demasiado largo y se corta con facilidad.

### El código de 6 dígitos

El código de la sala es el mismo código de emparejamiento de siempre: sin él no se acepta el enlace, y por el canal solo viaja su huella, no el código. La sala caduca a los 5 minutos sin que nadie se una; si caduca, crea el enlace de nuevo para obtener otro código. Si alguien adivina el código mientras la sala está abierta podría unirse, igual que si fotografía el QR: por eso el código solo se muestra en persona y la sala dura poco.

### Si no conecta

- Los dos teléfonos deben estar en la **misma red WiFi** (misma casa, mismo router). Con datos móviles o redes distintas no funciona.
- Si aparece «Los teléfonos no lograron verse en la red WiFi», el router puede tener activado el «aislamiento de clientes» o «AP isolation»: desactívalo en los ajustes del router, o prueba con otro router o con el punto de acceso de un teléfono.
- Si aparece «No hay ninguna sala con ese código», revisa que el código esté bien escrito y que el otro teléfono ya haya creado el enlace. También puede ser que no haya internet: en ese caso usa el QR.
- Si la cámara no se abre, la app dice por qué: si está bloqueada, actívala en **Ajustes → Aplicaciones → Tienda Pro → Permisos → Cámara**; si otra app la está usando, ciérrala. Mientras tanto, toca **Pegar el código** y pega el código en texto copiado del otro teléfono.
- Si un código no se reconoce, la app avisa: pide al otro teléfono que genere el código de nuevo y copia el código **entero**, sin cortar caracteres.
- La sincronización por WiFi es puntual: se hace cuando tú la inicias, no es automática en segundo plano.

### Limitaciones

- Los dos teléfonos deben estar en la **misma red WiFi** (misma casa, mismo router). No funciona con datos móviles ni con redes distintas.
- Para conectar con el código hace falta internet en los dos teléfonos (solo para el intercambio inicial). Sin internet, usa el QR.
- El código QR puede no caber si hay muchos datos pendientes: en ese caso usa **Copiar código** y pégalo en el otro teléfono.
- La sincronización por WiFi es puntual: se hace cuando tú la inicias, no es automática en segundo plano.
