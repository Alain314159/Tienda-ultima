# Preguntas frecuentes — Tienda Pro

## Uso diario

### ¿La app funciona sin internet?
Sí. Todo (ventas, compras, inventario, caja, reportes) funciona sin internet porque los datos viven en el teléfono. Internet solo hace falta para entrar con Google y sincronizar en la nube, y para instalar o actualizar la app. Si ves el chip rojo de «sin conexión» en el encabezado, la app sigue funcionando normal: solo indica que no hay red.

### ¿Cómo cambio el nombre de la tienda?
**Más → Ajustes → Nombre de la tienda**. Se muestra en el encabezado y en los reportes.

### ¿Cómo cambio el tema o el tamaño de la letra?
**Más → Ajustes**: interruptor de tema (claro/oscuro) y botones **A− / A+** para el tamaño de letra (de 1× a 2×).

### ¿Dónde está la sección de Nube o la de Compartir por WiFi?
En el botón **Más** de la barra inferior, en el grupo **Sistema**: «Nube y cuenta» y «Compartir por WiFi». Al abrirlas, la hoja de «Más» se cierra sola y el panel queda a la vista.

### Hice una venta y no aparece en el historial
Revisa que no esté filtrada: el historial muestra las ventas del período o del filtro activo. Si la venta se anuló por error, aparece marcada como anulada. Si de verdad no está, comprueba que no estés en otro teléfono sin sincronizar (ver [Sincronización](#sincronización)).

### ¿Puedo vender un producto sin stock?
No. Un producto sin stock no se puede añadir al carrito. Si el stock dice 0 pero debería haber, registra primero la compra o un ajuste de sobrante en **Inventario**.

### ¿Por qué no me deja eliminar una compra?
Solo se puede eliminar una compra si su lote **no tiene ninguna venta**. Si ya vendiste parte de ese lote, la app lo rechaza para no romper el FIFO ni la ganancia de esas ventas. Lo mismo al editar: no se puede cambiar lo que afectaría a ventas ya hechas.

### ¿Por qué no me deja archivar un producto?
Solo se puede archivar un producto **sin stock**. Vende o ajusta lo que queda y luego archívalo. Archivar no borra el historial del producto.

## Sincronización

### Creé un producto en un teléfono y no aparece en el otro
1. Comprueba que los dos teléfonos entraron con la **misma cuenta de Google** (en **Nube y cuenta** debe decir el mismo correo).
2. En el teléfono donde creaste el producto, toca **Sincronizar ahora**.
3. Espera unos segundos y en el otro teléfono toca **Sincronizar ahora**.
4. Mira el indicador del encabezado: si está en rojo («Error de sync»), tócalo para ver el error; lo más común es no tener internet en ese momento.
5. Si la nube sigue sin traerlo, usa **Compartir por WiFi** entre los dos teléfonos (misma red WiFi) como vía alternativa.

### La sincronización no avanza o da error
- Sin internet, la sync en la nube no puede subir ni bajar: espera a tener conexión; los cambios se guardan localmente y se envían cuando vuelva la red.
- Si el error persiste con internet, cierra la sesión en **Nube y cuenta** y vuelve a entrar con Google.
- Si aparece «Google todavía no está conectado al proyecto de la nube», falta el paso del dueño de la cuenta de Supabase (ver [GUIA-CONECTAR-GOOGLE.md](GUIA-CONECTAR-GOOGLE.md)).

### ¿La sync por WiFi no conecta?
- Los dos teléfonos deben estar en la **misma red WiFi** (mismo router). Con datos móviles o redes distintas no funciona.
- Para conectar con el código de 6 dígitos, los dos teléfonos necesitan **internet** (solo para el intercambio inicial; los datos van directos por la WiFi). Sin internet, usa el código QR.
- Si aparece «No hay ninguna sala con ese código», revisa que el código esté bien escrito y que el otro teléfono ya haya creado el enlace.
- Si aparece «Los teléfonos no lograron verse en la red WiFi», el router puede tener activado el «aislamiento de clientes» o «AP isolation»: desactívalo en los ajustes del router, o prueba con otro router o con el punto de acceso de un teléfono.
- Si la cámara no se abre, la app dice por qué: si está bloqueada, actívala en **Ajustes → Aplicaciones → Tienda Pro → Permisos → Cámara**; si otra app la está usando, ciérrala. Mientras tanto, toca **Pegar el código** y pega el código en texto copiado del otro teléfono.
- Copia el código **entero**, sin cortar caracteres. Si el QR no cabe, usa **Copiar código** y pégalo.
- Si un código no se reconoce, genera el código de nuevo en el otro teléfono.
- Recuerda el orden: un teléfono crea el enlace y muestra un código de 6 dígitos, y el otro lo escribe. Sin internet, el segundo escanea el QR y el primero escanea la respuesta del segundo.
- El código de texto largo ya no hay que dictarlo: solo queda como último recurso en **«Ver código como texto (último recurso)»**.

### Edité lo mismo en dos teléfonos: ¿cuál queda?
Queda la edición **más reciente** (gana por fecha del cambio y, si empatan, por dispositivo). La versión que pierde queda guardada en una tabla interna (`descartes`) por si hace falta recuperarla. Los cambios en registros distintos nunca chocan.

### ¿Se sincroniza el PIN?
No. El PIN, el tema, el nombre de la tienda y demás ajustes son **por teléfono** y no viajan. Tampoco viajan los asientos del libro diario: cada teléfono los reconstruye desde los datos, y el resultado es el mismo.

## Respaldos y datos

### ¿Cómo recupero mis datos si cambio de teléfono?
La vía rápida: en el teléfono viejo, **Ajustes → Exportar respaldo** (cifrado, recomendado), pasa el archivo al nuevo y en el nuevo toca **Importar respaldo**. También puedes entrar con Google en el nuevo y dejar que la nube baje los datos. Detalles en [RESPALDOS.md](RESPALDOS.md).

### Olvidé la contraseña del respaldo cifrado
No se puede recuperar: el respaldo está cifrado con AES-256-GCM y la clave sale de esa contraseña. Sin ella, el archivo no se puede abrir. Guarda la contraseña aparte del archivo.

### Olvidé el PIN
No hay recuperación del PIN desde la app. Tendrás que borrar los datos locales (Ajustes → Borrar todo) y restaurarlos desde un respaldo exportado. Por eso conviene tener un respaldo al día.

### ¿Dónde están mis datos? ¿Se borran si desinstalo?
Los datos viven en la base local del teléfono (IndexedDB). **Si desinstalas la app o borras los datos del navegador, se pierden** salvo que tengas un respaldo exportado o la copia en la nube. Exporta un respaldo antes de desinstalar o cambiar de teléfono.

### La app me avisa de que llevo días sin respaldo
Es el recordatorio de respaldo: si pasan más de 7 días (o el umbral que pongas en Ajustes) sin respaldo automático, exportación o sincronización, y hay datos que perder, la app avisa una vez al día. Exporta un respaldo o sincroniza para que el aviso desaparezca.

## Reportes y contabilidad

### La balanza dice «Descuadre»
El libro diario debería estar balanceado (debe = haber). Un descuadre indica un asiento incompleto o un dato inconsistente. Revisa los movimientos recientes del período; si el problema persiste tras un cierre, anota qué período y qué cifras no cuadran y revísalo con el dueño de la app. No edites asientos a mano: se reconstruyen desde los datos.

### El dashboard no cuadra con Reportes
Asegúrate de estar mirando el **mismo período** en los dos sitios: el dashboard usa el período actual (desde la fecha de inicio hasta hoy) y Reportes muestra el período que elijas arriba. Con «Período actual» seleccionado, ambos deben coincidir.

### ¿Cerrar el período borra mis datos?
No. El cierre solo guarda el resumen del período y reinicia la fecha de inicio para que las cifras del dashboard empiecen desde cero. Ventas, compras y demás siguen en el historial, y el cierre queda guardado para consultarlo en Reportes.

## Instalación y actualización

### ¿Cómo actualizo la app?
- **PWA:** se actualiza sola al abrirla con internet; si ves una versión vieja, cierra la app por completo y ábrela de nuevo.
- **APK:** descarga el APK nuevo desde GitHub Actions e instálalo encima: Android lo acepta solo si está firmado con la misma clave. Nunca desinstales la app vieja antes de instalar la nueva, porque perderías los datos locales.

### La app no se instala como PWA
Usa Chrome o Edge en Android (menú → «Instalar aplicación») o Safari en iPhone (Compartir → «Agregar a pantalla de inicio»). Si el navegador no ofrece instalar, abre la demo con internet y espera a que cargue por completo.

### ¿Puedo usar la app en dos teléfonos a la vez?
Sí: instala la app en los dos y usa la sincronización en la nube (con la misma cuenta de Google) o el WiFi directo. Cada teléfono guarda su copia local y el motor de sync mezcla los cambios.
