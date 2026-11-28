# Manual de usuario — Tienda Pro v6.0.0

Guía de uso de la app, sección por sección. Todo funciona sin internet: los datos se guardan en el teléfono y la sincronización (nube o WiFi) es opcional. Los importes se muestran en la moneda configurada y las fechas se interpretan en la hora local del teléfono.

La barra inferior tiene cuatro secciones fijas — **Inicio, Ventas, Compras, Inventario** — y el botón **Más**, que abre el resto, agrupado en tres grupos: **Tienda** (Productos, Gastos), **Finanzas y reportes** (Socios, Reportes) y **Sincronización y ajustes** (Compartir por WiFi, Nube y cuenta, Ajustes).

> **Consejo:** arriba de cada pantalla hay un icono de lupa para la búsqueda global (ver [Búsqueda global](#búsqueda-global)). El nombre de la tienda se cambia en **Ajustes**.

---

## Inicio (dashboard)

Es la primera pantalla al abrir la app. Muestra el estado del negocio para el período actual (desde la fecha de inicio del período configurada en Ajustes hasta hoy):

- **Efectivo en Caja:** saldo actual de la caja.
- **Valor de inventario:** lo que valen las existencias a costo.
- **Ventas y ganancia del período.**
- **Accesos rápidos:** justo debajo de las cuatro estadísticas, cuatro botones para lo más usado: **Nueva venta**, **Nueva compra**, **Nuevo gasto** y **Registrar arqueo**. Este último abre **Reportes** y baja directo a la tarjeta **Arqueo de Caja**.
- **Gráfico de ventas vs ganancia** de los últimos 6 meses.
- **Top productos:** los más rentables del período.
- **Anomalías:** avisos con nivel (baja / media / alta) cuando algo no cuadra — por ejemplo, muchos días sin cerrar el período, ventas con descuento alto o productos sin movimiento. Cada anomalía se puede descartar; las descartadas se pueden restaurar.
- **Recomendaciones:** sugerencias concretas (por ejemplo, cerrar el período para acumular la ganancia).

El período actual se reinicia al hacer un **cierre de período** (ver [Reportes](#reportes-y-contabilidad)).

## Ventas

**Ruta:** barra inferior → **Ventas**.

### Hacer una venta

1. Busca el producto por nombre o código en el buscador de arriba.
2. Toca el producto para añadirlo al carrito; ajusta la cantidad con los botones **+** / **−** o tocando la cantidad.
3. El precio de venta de cada ítem se puede editar tocándolo (por ejemplo, para aplicar un descuento puntual).
4. Revisa el total y toca **Cobrar**.
5. En el cobro, elige el método de pago (**efectivo, transferencia, tarjeta u otro**).
6. Si el cliente paga en efectivo, usa la **calculadora de billetes**: escribe cuántos billetes de cada denominación te entrega y la app calcula el total recibido y el **vuelto**. La calculadora se puede activar o desactivar en **Ajustes → Ventas** (Calculadora de billetes al cobrar).
7. Confirma el pago. La venta queda registrada y el stock se descuenta de inmediato.

### Costo real por FIFO

Cada venta descuenta del **lote más antiguo con stock disponible** (First In, First Out). Si compraste el mismo producto a dos precios distintos, la venta usa primero el lote barato y la ganancia se calcula con el costo real de cada lote. Ejemplo:

```
Compra 1: 10 kg a $5  (lote A)
Compra 2: 10 kg a $8  (lote B)

Venta: 15 kg a $12
→ 10 kg del lote A ($50) + 5 kg del lote B ($40)
→ Costo total: $90 · Ingreso: $180 · Ganancia: $90
```

La ganancia de cada venta se ve en el historial de ventas.

### Anular una venta

- En el historial, cada venta tiene el botón **Anular**: la venta queda marcada como anulada y **el stock vuelve** a los lotes de los que salió.
- También se puede anular **un solo producto** de una venta (botón junto al ítem): se devuelve solo esa cantidad al stock y se recalcula el total.
- Las ventas anuladas no cuentan en ventas ni en ganancia, pero quedan en el historial para consulta.

## Compras

**Ruta:** barra inferior → **Compras**.

### Registrar una compra

1. Toca **Nueva compra** (o el botón **+**).
2. Elige el producto (debe existir en el catálogo; si no, créalo primero en **Productos**).
3. Escribe la **cantidad** y el **costo unitario** de esta compra.
4. Guarda. La app crea automáticamente un **lote** con ese costo y esa cantidad, que queda disponible para vender.

Cada compra genera un lote nuevo, aunque sea del mismo producto: así cada lote conserva su costo real y el FIFO funciona.

### Editar o eliminar una compra

- **Editar:** toca el lápiz de la compra. Puedes cambiar cantidad y costo mientras el lote no tenga ventas. Si el lote ya se vendió en parte, la app no deja editar lo que afectaría a esas ventas.
- **Eliminar:** toca el icono de papelera. Solo se puede eliminar una compra **si su lote no tiene ninguna venta**. Si el lote ya tiene ventas, la app lo rechaza con el mensaje «El lote ya tiene ventas: no se puede eliminar la compra».

El historial de compras muestra todas las compras con su fecha, producto, cantidad y costo.

## Productos

**Ruta:** **Más → Productos**.

- **Crear un producto:** toca **+**, escribe el nombre, elige la **unidad de medida** (kg, lb, u, etc.) y el precio de venta. Opcionalmente, un código para buscarlo rápido.
- **Editar:** toca el lápiz del producto para cambiar nombre, unidad o precio. El precio nuevo aplica a las ventas futuras; las ya hechas no cambian.
- **Archivar:** el botón de archivar quita el producto de la lista y del buscador de ventas, sin borrar su historial. Solo se puede archivar un producto **sin stock** (stock = 0). Los archivados se ven con **Ver archivados**.
- **Stock bajo y agotado:** la lista marca los productos con poco stock o sin stock, y la app puede avisar con notificaciones (ver [Ajustes](#ajustes)).

> Un producto sin stock no se puede vender: en Ventas no aparece o aparece marcado como agotado.

## Inventario

**Ruta:** barra inferior → **Inventario**.

Muestra el stock real por producto y por lote, con el costo de cada lote y el valor total del inventario. Desde aquí se registran los **ajustes**:

### Ajustes (mermas y sobrantes)

1. Elige el producto.
2. Escribe la cantidad con signo: **negativa para una merma** (daño, robo, vencimiento) o **positiva para un sobrante** (encontraste más de lo que decía el sistema).
3. Elige el motivo: **Merma / Daño** u otro.
4. Para un sobrante, la app pide el **costo** con el que entra ese stock (si no lo sabes, usa el costo del último lote).
5. Guarda. El ajuste queda en el historial de «Últimos ajustes».

Las mermas restan valor al inventario y se descuentan de la ganancia en el período (aparecen como «mermas» en el cuadre y en el estado de resultados).

## Caja y arqueos

La caja vive en el **Inicio** (saldo) y en **Reportes** (arqueos y movimientos).

### Movimientos de caja

Todo lo que entra o sale de la caja queda registrado automáticamente: ventas en efectivo, gastos pagados en efectivo, aportes y retiros de capital, repartos a socios y pagos de pasivos. Cada movimiento guarda fecha, tipo, monto, concepto y método de pago. Si el saldo baja de cero, la app muestra una **alerta de caja negativa**.

### Arqueo

El arqueo compara lo que **debería** haber en caja (saldo del sistema) con lo que **hay físicamente**.

1. Ve a **Reportes**, tarjeta **Arqueo de Caja**, y toca **Registrar arqueo** (o usa el botón **Registrar arqueo** de los Accesos rápidos del Inicio, que te lleva directo ahí).
2. Escribe el dinero real que contaste en la caja.
3. La app calcula la diferencia: si falta dinero es un **faltante**, si sobra es un **sobrante**, y lo guarda con la fecha y una nota opcional.
4. El arqueo no cambia el saldo del sistema: solo deja constancia de la diferencia para revisarla después.

La app avisa con una notificación si llega la hora de arqueo y no hay arqueo registrado hoy.

## Socios y patrimonio

**Ruta:** **Más → Socios**.

Esta sección agrupa el capital de la tienda, los socios y los repartos.

### Capital y retiros

- **Aporte:** dinero que entra como capital de la tienda (inversión inicial o aportes posteriores). Se puede asociar a un socio.
- **Retiro:** sacar dinero de la tienda. Hay dos tipos:
  - **Retiro de ganancia:** saca de la ganancia disponible del período.
  - **Retiro de capital:** saca del capital aportado.
- La pantalla muestra el **capital disponible** y la **ganancia disponible** para retirar, y el **historial de capital** con todos los movimientos.

### Socios

1. Toca **Nuevo socio**, escribe el nombre, el aporte inicial y el **porcentaje de participación**.
2. Los porcentajes de todos los socios activos deberían sumar 100%. La app no te obliga, pero el reparto se calcula sobre los porcentajes que pongas.
3. Un socio se puede **eliminar**; sus movimientos quedan en el historial.

### Reparto de ganancia

1. Escribe el **monto a repartir** y un concepto (por ejemplo, «Reparto mensual»).
2. La app muestra en vivo cuánto le toca a cada socio según su porcentaje.
3. Toca **Repartir**. El reparto se registra como distribución, genera un retiro por cada socio y descuenta el dinero de la caja.

El **historial de distribuciones** muestra todos los repartos con fecha, monto total y detalle por socio.

## Gastos

**Ruta:** **Más → Gastos**.

1. Toca **Nuevo gasto**.
2. Elige la **categoría**: Luz, Agua, Alquiler, Internet, Transporte, Publicidad, Mantenimiento, Limpieza u Otros.
3. Escribe el concepto y el monto.
4. Elige el **método de pago**: efectivo, transferencia, tarjeta u otro.
5. Guarda. Si el pago es en efectivo, el gasto **descuenta de la caja** automáticamente.

Los gastos afectan a la **ganancia neta** del período. La pantalla muestra el total por categoría y el historial de gastos; cada gasto se puede editar o eliminar (al eliminarlo, la caja se ajusta).

## Reportes y contabilidad

**Ruta:** **Más → Reportes**.

La pantalla tiene cinco tarjetas, en este orden: **Cuadre por Período**, **Arqueo de Caja**, **Cerrar Período**, **Historial de Cierres** y **Libro Diario**.

### Período

Arriba, en la tarjeta de Cuadre por Período, se elige el período del reporte: **Hoy, 7d, Mes, Mes ant, Año, Periodo actual** (desde la fecha de inicio del período hasta hoy) o cualquiera de los **períodos cerrados** anteriores. Todo el reporte — resumen, cuadre, libro diario y balances — se recalcula para ese período.

### 1. Cuadre por Período

- **Resumen:** ventas, compras, gastos y ganancia neta del período.
- **Cuadre por producto:** tabla consolidada con lo vendido de cada producto, **con desglose por costo y precio** (subfilas por lote), para ver de dónde sale cada cifra.
- **Reparto entre socios:** cuánto le toca a cada socio de la ganancia neta del período, según su porcentaje.
- **Exportar PDF:** genera un PDF profesional con jsPDF: página 1 con el resumen financiero, la situación y el reparto de socios, y páginas siguientes con la tabla consolidada. Todas las páginas llevan pie.

### 2. Arqueo de Caja

Escribe el dinero real contado en caja y toca **Registrar arqueo**: la app calcula la diferencia contra el saldo del sistema (faltante o sobrante) y la guarda con fecha y nota opcional. Debajo quedan los **Últimos arqueos**. El detalle del arqueo está en [Caja y arqueos](#caja-y-arqueos).

### 3. Cerrar Período

1. En Reportes, tarjeta **Cerrar Período**, toca **Cerrar Período y Empezar Nuevo**.
2. La app calcula el resumen completo del período (ventas, compras, gastos, mermas, ganancia) y lo guarda como **cierre**.
3. El período actual se reinicia: la fecha de inicio pasa a ser hoy y las cifras del dashboard empiezan desde cero.
4. Los cierres quedan guardados y se pueden consultar en la tarjeta **Historial de Cierres** y eligiendo ese período en el Cuadre por Período.

> Cerrar el período no borra nada: ventas, compras y demás siguen en el historial. Solo marca el punto desde el que se cuentan las cifras del período actual.

### 4. Historial de Cierres

Lista los cierres anteriores con su período, ganancia, fecha de cierre y desglose (ventas, COGS, gastos y mermas).

### 5. Libro Diario

- **Balanza de comprobación:** muestra si el libro diario está balanceado (debe = haber). Si aparece «Descuadre», algo no cuadra y hay que revisarlo.
- **Balance general (estado de situación):** activos, pasivos y patrimonio del período, con la identidad deudores = acreedores.
- **Estado de resultados:** ingresos, costo de lo vendido, ganancia bruta, gastos, mermas y ganancia neta.
- **Flujo de caja:** entradas y salidas de efectivo detalladas.
- **Libro diario:** asientos automáticos de partida doble por cada movimiento (cada venta, compra, gasto, aporte o retiro genera su asiento). Los asientos **no se editan a mano**: se reconstruyen desde los datos. **Últimos asientos** muestra los 30 más recientes.
- **Diagnóstico:** compara la caja, el inventario y el resultado neto según el libro con los saldos del sistema.
- **Cuentas por pagar:** pasivos reales (deudas) con acreedor, monto y fecha de vencimiento, y su estado (pendiente o pagado).

## Búsqueda global

El icono de lupa (arriba de cada pantalla) abre la búsqueda en **toda la app**: productos, ventas, compras, gastos y demás. Tolera errores de tipeo (por ejemplo, encuentra «arroz» aunque escribas «aros»). Toca un resultado para ir directamente a ese registro. Se puede desactivar en **Ajustes → Apariencia → Búsqueda global**.

## Ajustes

**Ruta:** **Más → Ajustes**.

Los ajustes están agrupados así, en este orden:

### Tienda

- **Nombre de tienda:** se muestra en el encabezado y en los reportes.
- **Dirección (lista de precios):** texto que aparece en la lista de precios.
- **Teléfonos:** teléfonos de contacto de la tienda.
- **Grupo de WhatsApp:** enlace al grupo de WhatsApp de la tienda.

### Apariencia

- **Tamaño de letra:** de 1× a 2× (botones A− / A+).
- **Búsqueda global:** muestra u oculta el buscador global de la barra superior (ver [Búsqueda global](#búsqueda-global)).

### Seguridad

- **PIN operaciones sensibles:** actívalo y pon un PIN de **4 a 6 dígitos** para proteger las operaciones sensibles (ver [SEGURIDAD.md](SEGURIDAD.md)). Si ya hay un PIN, la app muestra «PIN configurado ✓»; escribir uno nuevo lo cambia y dejar el campo vacío lo conserva.

### Ventas

- **Calculadora de billetes al cobrar:** muestra el panel de denominaciones (10, 20, 50…) para contar el efectivo al cobrar.

### Notificaciones y alertas

- **Activar notificaciones:** avisan de stock bajo, hora de arqueo, anomalías críticas, cierre pendiente y respaldo pendiente. Si el dispositivo no las soporta, la app lo avisa (en iPhone hay que instalar la app como PWA).
- **Hora de arqueo:** la app avisa con una notificación si llega esa hora y no hay arqueo registrado hoy.
- **Probar notificación:** envía una notificación de prueba.
- **Alertas y umbrales avanzados** (desplegable): 8 umbrales — Cierre pendiente (días), Mermas por semana, Faltantes por mes, Sobrantes por mes, Días sin backup (por defecto 7 días), Días sin movimiento, Descuento máximo (%) y Stock mínimo default.

### Datos y respaldos

- **Exportar respaldo (JSON):** genera un archivo `.json` en texto plano con todos los datos.
- **Exportar respaldo cifrado:** genera un archivo `.json` cifrado con contraseña (ver [RESPALDOS.md](RESPALDOS.md)).
- **Importar datos:** restaura un respaldo desde un archivo.
- **Último backup auto:** muestra la fecha del último respaldo automático y el botón **Restaurar backup automático**.
- **Respaldo automático:** botón **Abrir** para ver y configurar el autosave.
- **Almacenamiento local:** uso de disco (cuánto llevas usado de la cuota), porcentaje y si el almacenamiento es persistente; en web, si no es persistente, hay un botón para solicitarlo.

### Actualizaciones

- **Buscar actualizaciones:** botón **Buscar**. Comprueba si hay una versión nueva y, si la hay, la descarga para aplicarla al reiniciar (ver abajo).

### Sistema

- **Estado del sistema:** botón **Abrir**. Muestra la versión instalada, la actualización pendiente si la hay, y los datos del paquete (ver [ACTUALIZACIONES.md](ACTUALIZACIONES.md)).
- Si otra pestaña de Tienda Pro está abierta, aparece un aviso para cerrarla y evitar conflictos de datos.

### Zona peligrosa

- **Borrar TODOS los datos:** elimina permanentemente productos, ventas, compras, gastos, socios, asientos, pasivos, etc. No se puede deshacer (ver [RESPALDOS.md](RESPALDOS.md)).

### Información

- **Versión 6.0 · Datos locales**, con los conteos de productos, ventas y compras.

### Actualizaciones

La app instalada (APK) se actualiza sola al abrirla con internet, sin reinstalarla. Si quieres comprobarlo a mano, usa **Ajustes → Actualizaciones → Buscar actualizaciones** o el botón **Buscar actualización ahora** de **Estado del sistema**. Lo que puede decirte:

- **«Ya tienes la última versión»:** no hay nada nuevo.
- **«Actualización lista: se aplicará al reiniciar»:** se descargó una versión nueva. Toca **Reiniciar ahora** (o cierra y abre la app) para aplicarla.
- **«Sin conexión: no se pudo comprobar»:** sin internet no se comprueba nada y la app sigue con su versión.
- **«En web, las actualizaciones llegan al recargar»:** estás en la versión del navegador; recarga la página.

En **Estado del sistema** se ve la **Versión instalada** y, si la hay, la **Actualización pendiente**. Los cambios que tocan lo nativo (permisos, icono, nombre) siguen exigiendo instalar un APK nuevo. Detalle completo en [ACTUALIZACIONES.md](ACTUALIZACIONES.md).
