<template>
  <div v-cloak :data-theme="cfg.tema">
    <!-- BANNERS -->
    <div v-if="!online" class="banner off no-print">Sin conexión — los datos se guardan localmente</div>
    <div v-if="hayUpdate" class="banner upd no-print" @click="aplicarUpdate">Nueva versión disponible — tocar para actualizar</div>

    <!-- HEADER -->
    <header class="header no-print">
      <h1><icon name="store" :size="20" color="#fff"></icon> {{ cfg.nombre || 'Tienda Pro' }}</h1>
      <div class="hacts">
        <button class="h-btn" @click="toggleTema()" aria-label="Cambiar tema">
          <icon :name="cfg.tema === 'dark' ? 'sun' : 'moon'" :size="18" color="#fff"></icon>
          <span>{{ cfg.tema === 'dark' ? 'Claro' : 'Oscuro' }}</span>
        </button>
        <button class="h-btn" @click="ajustesAbierto = true" aria-label="Ajustes">
          <icon name="settings" :size="18" color="#fff"></icon>
          <span>Ajustes</span>
        </button>
      </div>
    </header>

    <main>
      <!-- ==================== DASHBOARD ==================== -->
      <section v-show="sec === 'dashboard'" class="fade-up">
        <div class="balance azul">
          <div class="lbl"><icon name="wallet" :size="14" color="#fff"></icon> Efectivo en Caja</div>
          <div class="val">{{ fmt(saldoCaja) }}</div>
          <div class="sub">Inventario: {{ fmt(valorInventario) }} · Desde {{ fmtFecha(cfg.periodoInicio) }}</div>
        </div>

        <div v-if="productosBajoStock.length || productosAgotados.length" class="alert-box" @click="ir('inventario')">
          <icon name="alert" :size="16" color="#d97706"></icon>
          {{ productosAgotados.length }} agotado(s) · {{ productosBajoStock.length }} bajo(s)
        </div>

        <div class="grid2">
          <div class="stat">
            <div class="lbl"><icon name="trend" :size="13" :color="mutColor"></icon> Ventas</div>
            <div class="val" style="color:var(--pri)">{{ fmt(ventasPeriodo) }}</div>
          </div>
          <div class="stat">
            <div class="lbl"><icon name="dollar" :size="13" :color="mutColor"></icon> Ganancia</div>
            <div class="val pos">{{ fmt(gananciaNetaPeriodo) }}</div>
          </div>
          <div class="stat">
            <div class="lbl"><icon name="bag" :size="13" :color="mutColor"></icon> Compras</div>
            <div class="val neg">{{ fmt(comprasPeriodo) }}</div>
          </div>
          <div class="stat">
            <div class="lbl"><icon name="chart" :size="13" :color="mutColor"></icon> Margen</div>
            <div class="val" style="color:var(--pri)">{{ margenPeriodo }}%</div>
          </div>
        </div>

        <div class="card" style="margin-top:.8rem">
          <div class="card-title"><icon name="chart" :size="18" :color="sec === 'dashboard' ? '#2196F3' : mutColor"></icon> Ventas vs Ganancia (6 meses)</div>
          <div class="chart-wrap"><canvas id="chartVentas"></canvas></div>
        </div>

        <div class="card">
          <div class="card-title"><icon name="diamond" :size="18" :color="sec === 'dashboard' ? '#2196F3' : mutColor"></icon> Top rentables del mes</div>
          <div v-if="topRentables.length === 0" class="empty">Sin ventas este mes</div>
          <div v-for="(p, i) in topRentables" :key="p.id" class="row">
            <span>{{ i + 1 }}. {{ p.nombre }}</span>
            <span class="pos">{{ fmt(p.gan) }}</span>
          </div>
        </div>

        <div class="card">
          <div class="card-title"><icon name="zap" :size="18" :color="sec === 'dashboard' ? '#2196F3' : mutColor"></icon> Accesos rápidos</div>
          <div class="quick-grid">
            <button class="quick-btn" @click="ir('ventas')"><icon name="cart" :size="22"></icon>Nueva Venta</button>
            <button class="quick-btn" @click="ir('compras')"><icon name="bag" :size="22"></icon>Registrar Compra</button>
            <button class="quick-btn" @click="ir('caja')"><icon name="wallet" :size="22"></icon>Arqueo de Caja</button>
            <button class="quick-btn" @click="ir('inventario')"><icon name="package" :size="22"></icon>Ver Inventario</button>
          </div>
        </div>

        <div class="card">
          <div class="det" style="font-size:.78rem;color:var(--mut)">
            Última actividad: <b style="color:var(--txt)">{{ ultimaActividad }}</b>
          </div>
        </div>
      </section>

      <!-- ==================== VENTAS ==================== -->
      <section v-show="sec === 'ventas'" class="fade-up">
        <div class="card">
          <div class="card-title"><icon name="cart" :size="18" :color="sec === 'ventas' ? '#2196F3' : mutColor"></icon> Nueva Venta</div>
          <div class="search">
            <input v-model="busqVenta" type="text" placeholder="Buscar producto por nombre o código..."
              autocomplete="off" @focus="focusVenta = true" @click="focusVenta = true" @keyup.enter="agregarPrimero">
          </div>
          <div v-if="focusVenta" class="drop-static">
            <div class="drop-head">
              <span>{{ listaVenta.length }} resultado(s)</span>
              <button @click="focusVenta = false; busqVenta = ''" aria-label="Cerrar">×</button>
            </div>
            <div v-if="listaVenta.length === 0" class="empty">Sin coincidencias (o sin stock)</div>
            <div v-for="p in listaVenta" :key="p.id" class="drop-item" @click="agregarCarrito(p)">
              <span>{{ p.nombre }}</span>
              <span style="color:var(--mut);white-space:nowrap">Stock {{ fmtCant(stock(p.id)) }} {{ p.unidad || '' }} · {{ fmt(p.precio) }}</span>
            </div>
          </div>

          <div v-if="carrito.length" style="margin-top:.2rem">
            <div v-for="(it, i) in carrito" :key="i" class="cart-item">
              <div class="cart-top">
                <div class="nm">{{ it.nombre }}</div>
                <button class="del-btn" @click="carrito.splice(i, 1)" aria-label="Quitar">
                  <icon name="x" :size="14" color="#fff"></icon>
                </button>
              </div>
              <div class="qty-row">
                <label>Cant</label>
                <div class="qty-input">
                  <button @click="cambiarCant(it, -1)">−</button>
                  <input v-model="it.cant" type="text" inputmode="decimal" @blur="validarCant(it)">
                  <button @click="cambiarCant(it, 1)">+</button>
                </div>
                <label>Precio</label>
                <input class="price-input" v-model="it.precio" type="text" inputmode="decimal" @blur="validarPrecio(it)">
              </div>
              <div class="det" style="font-size:.72rem;color:var(--mut);margin-top:.3rem">
                {{ fmt(it.precio) }} × {{ fmtCant(it.cant) }} {{ it.unidad || '' }} =
                <b style="color:var(--pri)">{{ fmt(subTotalItem(it)) }}</b>
              </div>
            </div>
            <div class="total-box">
              <span>TOTAL {{ fmt(totalCarrito) }}</span>
              <span>Gan. {{ fmt(gananciaCarrito) }}</span>
            </div>
            <button class="btn ok" @click="iniciarCobro()" :disabled="procesandoVenta">
              <icon name="check" :size="16" color="#fff"></icon>
              {{ procesandoVenta ? 'Procesando...' : 'Cobrar Venta' }}
            </button>
            <button class="btn ghost" @click="carrito = []">
              <icon name="trash" :size="14" :color="mutColor"></icon> Limpiar carrito
            </button>
          </div>
          <div v-if="!carrito.length && !focusVenta" class="empty">Toca el buscador y agrega productos al carrito</div>
        </div>

        <div class="card">
          <div class="card-title"><icon name="list" :size="18" :color="sec === 'ventas' ? '#2196F3' : mutColor"></icon> Historial de Ventas</div>
          <div class="search"><input v-model="busqHist" type="text" placeholder="Buscar en historial..."></div>
          <div v-if="ventasFiltradas.length === 0" class="empty">Sin ventas</div>
          <div v-for="v in ventasFiltradas" :key="v.id" class="item" :class="{ anulada: v.anulada }">
            <div class="info">
              <div class="nm">{{ v.items.map(x => x.nombre + ' ×' + fmtCant(x.cantidad) + (x.unidad ? (' ' + x.unidad) : '')).join(', ') }}</div>
              <div class="det">{{ fmtFH(v.fecha) }} · <b style="color:var(--pri)">{{ fmt(v.total) }}</b> · <span class="pos">+{{ fmt(v.ganancia) }}</span></div>
            </div>
            <button v-if="!v.anulada" class="link-btn" @click="anularVenta(v.id)">Anular</button>
            <span v-else class="badge arch">ANULADA</span>
          </div>
        </div>
      </section>

      <!-- ==================== COMPRAS ==================== -->
      <section v-show="sec === 'compras'" class="fade-up">
        <div class="card">
          <div class="card-title"><icon name="bag" :size="18" :color="sec === 'compras' ? '#2196F3' : mutColor"></icon> Registrar Compra</div>
          <div v-if="!compraForm.productoId">
            <div class="search">
              <input v-model="busqCompra" type="text" placeholder="Buscar producto..."
                autocomplete="off" @focus="focusCompra = true" @click="focusCompra = true">
            </div>
            <div v-if="focusCompra" class="drop-static">
              <div class="drop-head">
                <span>{{ listaCompra.length }} resultado(s)</span>
                <button @click="focusCompra = false; busqCompra = ''" aria-label="Cerrar">×</button>
              </div>
              <div v-if="listaCompra.length === 0" class="empty">Sin coincidencias</div>
              <div v-for="p in listaCompra" :key="p.id" class="drop-item" @click="selCompra(p)">
                <span>{{ p.nombre }}</span>
                <span style="color:var(--mut)">Stock {{ fmtCant(stock(p.id)) }} {{ p.unidad || '' }}</span>
              </div>
            </div>
          </div>
          <div v-if="compraForm.productoId">
            <div class="row" style="border:none;padding:.2rem 0"><span>Producto</span><b>{{ compraForm.nombre }}</b></div>
            <div class="grid2">
              <input v-model="compraForm.cantidad" type="number" inputmode="decimal" step="0.001" placeholder="Cantidad">
              <input v-model="compraForm.costo" type="number" inputmode="decimal" step="0.01" placeholder="Costo unit.">
            </div>
            <div v-if="n(compraForm.cantidad) > 0 && n(compraForm.costo) >= 0"
              class="det neg" style="font-weight:800;font-size:.9rem;margin:.3rem 0">
              Total: {{ fmt(n(compraForm.cantidad) * n(compraForm.costo)) }}
            </div>
            <button class="btn pri" @click="guardarCompra()">
              <icon name="bag" :size="16" color="#fff"></icon>
              {{ compraForm.editId ? 'Actualizar' : 'Registrar Compra' }}
            </button>
            <button class="btn ghost" @click="resetCompra()">Cancelar</button>
          </div>
        </div>

        <div class="card">
          <div class="card-title"><icon name="list" :size="18" :color="sec === 'compras' ? '#2196F3' : mutColor"></icon> Historial de Compras</div>
          <div v-if="comprasOrdenadas.length === 0" class="empty">Sin compras</div>
          <div v-for="c in comprasOrdenadas" :key="c.id" class="item">
            <div class="info">
              <div class="nm"><icon name="bag" :size="14"></icon> {{ c.productoNombre }}</div>
              <div class="det">{{ fmtFH(c.fecha) }} · {{ fmtCant(c.cantidad) }} {{ c.unidad || '' }} × {{ fmt(c.costo) }}</div>
            </div>
            <div class="act-btns">
              <b class="neg">{{ fmt(c.total) }}</b>
              <template v-if="loteSinVentas(c.id)">
                <button class="icon-btn" @click="editarCompra(c.id)" aria-label="Editar">
                  <icon name="edit" :size="15" :color="txtColor"></icon>
                </button>
                <button class="icon-btn bad" @click="eliminarCompra(c.id)" aria-label="Eliminar">
                  <icon name="trash" :size="15" color="#dc2626"></icon>
                </button>
              </template>
              <span v-else class="lock" title="Con ventas: no editable">
                <icon name="lock" :size="15" :color="mutColor"></icon>
              </span>
            </div>
          </div>
        </div>
      </section>

      <!-- ==================== PRODUCTOS ==================== -->
      <section v-show="sec === 'productos'" class="fade-up">
        <div class="card">
          <div class="card-title"><icon name="tag" :size="18" :color="sec === 'productos' ? '#2196F3' : mutColor"></icon> {{ prodForm.editId ? 'Editar' : 'Agregar' }} Producto</div>
          <input v-model="prodForm.nombre" type="text" placeholder="Nombre del producto">
          <input v-model="prodForm.codigo" type="text" placeholder="Código (opcional)">
          <div class="grid2">
            <input v-model="prodForm.precio" type="number" inputmode="decimal" step="0.01" placeholder="Precio venta">
            <input v-model="prodForm.stockMin" type="number" inputmode="decimal" step="0.1" placeholder="Stock mín.">
          </div>
          <div class="info-box" style="margin-bottom:.5rem">
            Define la unidad de medida si vendes por peso/volumen (ej: kg, lb, gr, litro).
            Si es un paquete o unidad suelta, pon "u" o déjalo vacío.
          </div>
          <input v-model="prodForm.unidad" type="text" placeholder="Unidad (kg, lb, gr, u, paq)" list="unidades-list">
          <datalist id="unidades-list">
            <option value="u"></option><option value="kg"></option><option value="lb"></option>
            <option value="gr"></option><option value="litro"></option><option value="m"></option>
            <option value="caja"></option><option value="paq"></option>
          </datalist>
          <button class="btn pri" @click="guardarProducto()">
            <icon name="check" :size="16" color="#fff"></icon>
            {{ prodForm.editId ? 'Actualizar' : 'Guardar' }}
          </button>
          <button v-if="prodForm.editId" class="btn ghost" @click="resetProd()">Cancelar</button>
        </div>

        <div class="card">
          <div class="card-title"><icon name="tag" :size="18" :color="sec === 'productos' ? '#2196F3' : mutColor"></icon> Productos</div>
          <div class="search"><input v-model="busqProd" type="text" placeholder="Buscar..."></div>
          <div style="text-align:right;margin-bottom:.4rem">
            <button class="btn ghost" style="width:auto;display:inline-block;padding:.3rem .7rem;font-size:.72rem"
              @click="mostrarArchivados = !mostrarArchivados">
              {{ mostrarArchivados ? 'Ocultar archivados' : 'Ver archivados' }}
            </button>
          </div>
          <div v-if="prodsFiltrados.length === 0" class="empty">Sin productos</div>
          <div v-for="p in prodsFiltrados" :key="p.id" class="prod-wrap">
            <div class="item" :style="p.archivado ? 'opacity:.5' : ''" style="cursor:pointer"
              @click="prodExpandido[p.id] = !prodExpandido[p.id]">
              <div class="info">
                <div class="nm">
                  {{ p.nombre }}
                  <span v-if="p.codigo" style="color:var(--mut);font-weight:400;font-size:.72rem">({{ p.codigo }})</span>
                </div>
                <div class="stock-line">
                  <span class="badge" :class="badgeStock(p)">{{ txtBadge(p) }}</span>
                  <span class="stock-num">Stock: {{ fmtCant(stock(p.id)) }} {{ p.unidad || '' }}</span>
                  <span style="color:var(--mut);font-size:.72rem">{{ fmt(p.precio) }}</span>
                  <span v-if="lotesDeProducto(p.id).length" class="chev" :class="{ open: prodExpandido[p.id] }">
                    <icon name="chevron" :size="14" :color="mutColor"></icon>
                  </span>
                </div>
              </div>
              <div class="act-btns" @click.stop>
                <button class="icon-btn" @click="editarProducto(p.id)" aria-label="Editar">
                  <icon name="edit" :size="15" :color="txtColor"></icon>
                </button>
                <button v-if="!p.archivado" class="icon-btn bad" @click="archivarProducto(p.id)" aria-label="Archivar">
                  <icon name="trash" :size="15" color="#dc2626"></icon>
                </button>
                <button v-else class="icon-btn ok" @click="restaurarProducto(p.id)" aria-label="Restaurar">
                  <icon name="refresh" :size="15" color="#16a34a"></icon>
                </button>
              </div>
            </div>
            <div v-if="prodExpandido[p.id]" class="prod-lotes">
              <div v-if="lotesDeProducto(p.id).length === 0" class="empty" style="padding:.6rem;font-size:.78rem">
                Sin lotes activos (stock 0)
              </div>
              <div v-for="l in lotesDeProducto(p.id)" :key="l.id" class="inv-lote">
                <span>{{ fmtFH(l.fecha) }} · Quedan {{ fmtCant(n(l.cantidadInicial) - n(l.cantidadVendida)) }}/{{ fmtCant(l.cantidadInicial) }} {{ p.unidad || '' }}</span>
                <span>@{{ fmt(l.costo) }} = <b>{{ fmt((n(l.cantidadInicial) - n(l.cantidadVendida)) * l.costo) }}</b></span>
              </div>
              <div v-if="lotesDeProducto(p.id).length" class="det"
                style="font-size:.7rem;color:var(--mut);margin-top:.3rem;text-align:right">
                Valor total: <b class="pos">{{ fmt(valorLotesProducto(p.id)) }}</b>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ==================== INVENTARIO ==================== -->
      <section v-show="sec === 'inventario'" class="fade-up">
        <div class="balance verde">
          <div class="lbl"><icon name="package" :size="14" color="#fff"></icon> Valor del Inventario</div>
          <div class="val">{{ fmt(valorInventario) }}</div>
          <div class="sub">{{ fmtCant(unidadesTotal, true) }} unidades · {{ lotesActivos.length }} lotes</div>
        </div>

        <!-- NUEVO: Compartir existencia -->
        <div class="card" style="padding:.8rem">
          <button class="btn pri" @click="compartirExistencia()">
            <icon name="share" :size="16" color="#fff"></icon> Compartir existencia
          </button>
          <div style="font-size:.7rem;color:var(--mut);text-align:center;margin-top:.3rem">
            Envía la lista de productos y stock por WhatsApp, Telegram, etc.
          </div>
        </div>

        <div class="card">
          <div class="card-title"><icon name="alert" :size="18" :color="sec === 'inventario' ? '#2196F3' : '#d97706'"></icon> Merma / Ajuste</div>
          <select v-model="ajusteForm.productoId">
            <option value="">Seleccionar producto...</option>
            <option v-for="p in prodsActivos" :key="p.id" :value="p.id">
              {{ p.nombre }} (Stock: {{ fmtCant(stock(p.id)) }} {{ p.unidad || '' }})
            </option>
          </select>
          <div class="grid2">
            <input v-model="ajusteForm.cantidad" type="number" inputmode="decimal" step="0.001" placeholder="- merma / + sobrante">
            <select v-model="ajusteForm.motivo">
              <option value="">Motivo...</option>
              <option value="merma">Merma / Daño</option>
              <option value="vencimiento">Vencimiento</option>
              <option value="robo">Robo / Pérdida</option>
              <option value="error">Error de registro</option>
              <option value="sobrante">Sobrante en conteo</option>
            </select>
          </div>
          <input v-if="n(ajusteForm.cantidad) > 0" v-model="ajusteForm.costoSobrante"
            type="number" inputmode="decimal" step="0.01" placeholder="Costo unit. del sobrante">
          <button class="btn warn" @click="registrarAjuste()">
            <icon name="package" :size="16" color="#fff"></icon> Registrar Ajuste
          </button>
        </div>

        <div class="card">
          <div class="card-title"><icon name="package" :size="18" :color="sec === 'inventario' ? '#2196F3' : mutColor"></icon> Inventario por producto</div>
          <div v-if="invAgrupado.length === 0" class="empty">Sin inventario</div>
          <div v-for="g in invAgrupado" :key="g.id" class="inv-group">
            <div class="inv-head" @click="invExpandido[g.id] = !invExpandido[g.id]">
              <div>
                <div class="nm">{{ g.nombre }}</div>
                <div class="det">Stock {{ fmtCant(g.stockTotal) }} {{ g.unidad || '' }} · {{ fmt(g.valorTotal) }}</div>
              </div>
              <icon name="chevron" :size="18" :color="mutColor"
                :style="invExpandido[g.id] ? 'transform:rotate(180deg)' : ''"></icon>
            </div>
            <div v-if="invExpandido[g.id]" class="inv-lotes">
              <div v-for="l in g.lotes" :key="l.id" class="inv-lote">
                <span>{{ fmtFH(l.fecha) }} · {{ fmtCant(n(l.cantidadInicial) - n(l.cantidadVendida)) }}/{{ fmtCant(l.cantidadInicial) }} {{ g.unidad || '' }}</span>
                <span>@{{ fmt(l.costo) }} = <b>{{ fmt((n(l.cantidadInicial) - n(l.cantidadVendida)) * l.costo) }}</b></span>
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-title"><icon name="alert" :size="18" :color="sec === 'inventario' ? '#2196F3' : mutColor"></icon> Últimos ajustes</div>
          <div v-if="ajustesRecientes.length === 0" class="empty">Sin ajustes</div>
          <div v-for="a in ajustesRecientes" :key="a.id" class="item">
            <div class="info">
              <div class="nm">{{ a.productoNombre }}</div>
              <div class="det">{{ fmtFH(a.fecha) }} · {{ a.motivo }}</div>
            </div>
            <div class="act-btns">
              <b :class="a.cantidad > 0 ? 'pos' : 'neg'">{{ a.cantidad > 0 ? '+' : '' }}{{ fmtCant(a.cantidad) }}</b>
              <b class="neg">-{{ fmt(a.costoPerdida) }}</b>
            </div>
          </div>
        </div>
      </section>

      <!-- ==================== CAJA ==================== -->
      <section v-show="sec === 'caja'" class="fade-up">
        <div class="balance" :class="saldoCaja < 0 ? 'neg' : 'azul'">
          <div class="lbl"><icon name="wallet" :size="14" color="#fff"></icon> Saldo en Caja</div>
          <div class="val">{{ fmt(saldoCaja) }}</div>
          <div v-if="saldoCaja < 0" class="sub" style="font-weight:800">Caja en negativo</div>
        </div>

        <div class="info-box" style="margin-bottom:.8rem">
          El saldo de caja es <b>acumulativo</b> (incluye todo el historial).
          El cierre de período solo reinicia los contadores de ventas, compras y ganancia del dashboard.
        </div>

        <div class="card">
          <div class="card-title"><icon name="dollar" :size="18" :color="sec === 'caja' ? '#2196F3' : mutColor"></icon> Desglose</div>
          <div class="row"><span>Capital inicial</span><span class="pos">+{{ fmt(cfg.capitalInicial || 0) }}</span></div>
          <div class="row"><span>Aportes</span><span class="pos">+{{ fmt(aportesTotal) }}</span></div>
          <div class="row"><span>Ventas contado</span><span class="pos">+{{ fmt(ventasContadoTotal) }}</span></div>
          <div class="row"><span>Compras</span><span class="neg">-{{ fmt(comprasTotal) }}</span></div>
          <div class="row"><span>Retiros</span><span class="neg">-{{ fmt(retirosTotal) }}</span></div>
          <div class="row"><span>Ajustes arqueo</span>
            <span :class="arqueoNeto >= 0 ? 'pos' : 'neg'">{{ arqueoNeto >= 0 ? '+' : '' }}{{ fmt(arqueoNeto) }}</span>
          </div>
          <div class="row total"><span>= SALDO</span><span>{{ fmt(saldoCaja) }}</span></div>
        </div>

        <div class="card">
          <div class="card-title"><icon name="check" :size="18" :color="sec === 'caja' ? '#2196F3' : mutColor"></icon> Arqueo de Caja</div>
          <div class="info-box" style="margin-bottom:.6rem">
            Cuenta el dinero físico y escribe lo que tienes.
            Si es MENOR que el sistema = faltante; si es MAYOR = sobrante.
          </div>
          <div style="font-size:.82rem;color:var(--mut);margin-bottom:.4rem">
            El sistema dice: <b style="color:var(--txt)">{{ fmt(saldoCaja) }}</b>
          </div>
          <input v-model="arqueoForm.monto" type="number" inputmode="decimal" step="0.01"
            placeholder="Tú cuentas..." @input="calcArqueo">
          <input v-model="arqueoForm.nota" type="text" placeholder="Nota (opcional)">
          <div v-if="arqueoForm.monto !== ''" class="arqueo-prev" :class="arqueoPreview.class">
            Tú cuentas: {{ fmt(arqueoPreview.fisico) }} · Diferencia:
            <span v-if="Math.abs(arqueoPreview.diff) < 0.01">Cuadre perfecto ✓</span>
            <span v-else-if="arqueoPreview.diff > 0" class="pos">SOBRANTE +{{ fmt(arqueoPreview.diff) }}</span>
            <span v-else class="neg">FALTANTE -{{ fmt(arqueoPreview.diff) }}</span>
          </div>
          <button class="btn pri" @click="registrarArqueo()">
            <icon name="check" :size="16" color="#fff"></icon> Registrar Arqueo
          </button>
        </div>

        <div class="card">
          <div class="card-title"><icon name="list" :size="18" :color="sec === 'caja' ? '#2196F3' : mutColor"></icon> Movimientos recientes</div>
          <div v-if="movimientosRecientes.length === 0" class="empty">Sin movimientos</div>
          <div v-for="m in movimientosRecientes" :key="m.id" class="item">
            <div class="info">
              <div class="nm">{{ m.concepto }}</div>
              <div class="det">{{ fmtFH(m.fecha) }}</div>
            </div>
            <b :class="m.tipo === 'ingreso' ? 'pos' : 'neg'">{{ m.tipo === 'ingreso' ? '+' : '-' }}{{ fmt(m.monto) }}</b>
          </div>
        </div>
      </section>

      <!-- ==================== PATRIMONIO ==================== -->
      <section v-show="sec === 'patrimonio'" class="fade-up">
        <div class="balance morado">
          <div class="lbl"><icon name="dollar" :size="14" color="#fff"></icon> Patrimonio Total</div>
          <div class="val">{{ fmt(patrimonioTotal) }}</div>
          <div class="sub">Capital {{ fmt(capitalTotal) }} · Gan. acum. {{ fmt(gananciasAcumuladas) }}</div>
        </div>

        <div class="card">
          <div class="card-title"><icon name="chart" :size="18" :color="sec === 'patrimonio' ? '#2196F3' : mutColor"></icon> Resumen contable</div>
          <div class="row"><span>Capital inicial</span><span>{{ fmt(cfg.capitalInicial || 0) }}</span></div>
          <div class="row"><span>Aportes</span><span class="pos">+{{ fmt(aportesTotal) }}</span></div>
          <div class="row total"><span>= CAPITAL</span><span>{{ fmt(capitalTotal) }}</span></div>
          <div class="row" style="margin-top:.5rem"><span>Caja</span><span>{{ fmt(saldoCaja) }}</span></div>
          <div class="row"><span>Inventario</span><span>{{ fmt(valorInventario) }}</span></div>
          <div class="row total"><span>= ACTIVOS</span><span>{{ fmt(saldoCaja + valorInventario) }}</span></div>
          <div class="row" style="margin-top:.5rem"><span>Ganancia bruta</span><span>{{ fmt(gananciaBrutaPeriodo) }}</span></div>
          <div class="row"><span>Gastos operativos</span><span class="neg">-{{ fmt(gastosOpPeriodo) }}</span></div>
          <div class="row total"><span>= Ganancia neta (período)</span>
            <span :class="gananciaNetaPeriodo >= 0 ? 'pos' : 'neg'">{{ fmt(gananciaNetaPeriodo) }}</span>
          </div>
          <div class="row hl">
            <span>DISPONIBLE PARA RETIRO</span>
            <b :class="gananciaDisponible >= 0 ? 'pos' : 'neg'">{{ fmt(gananciaDisponible) }}</b>
          </div>
        </div>

        <div class="grid2">
          <button class="btn bad" @click="retiroAbierto = true">
            <icon name="dollar" :size="16" color="#fff"></icon> Retirar Ganancia
          </button>
          <button class="btn ok" @click="aporteAbierto = true">
            <icon name="plus" :size="16" color="#fff"></icon> Aportar Capital
          </button>
        </div>

        <div class="card">
          <div class="card-title"><icon name="dollar" :size="18" :color="sec === 'patrimonio' ? '#2196F3' : mutColor"></icon> Capital Inicial</div>
          <div style="font-size:.82rem;color:var(--mut);margin-bottom:.5rem">
            Actual: <b style="color:var(--txt)">{{ fmt(cfg.capitalInicial || 0) }}</b>
          </div>
          <input v-model="capInicialStr" type="number" inputmode="decimal" step="0.01" placeholder="Nuevo capital inicial">
          <button class="btn pri" @click="guardarCapInicial()">
            <icon name="check" :size="16" color="#fff"></icon> Guardar Capital Inicial
          </button>
        </div>

        <div class="card">
          <div class="card-title"><icon name="list" :size="18" :color="sec === 'patrimonio' ? '#2196F3' : mutColor"></icon> Historial</div>
          <div v-if="movPatrimonio.length === 0" class="empty">Sin movimientos</div>
          <div v-for="m in movPatrimonio" :key="m.id" class="item">
            <div class="info">
              <div class="nm">{{ m.tipo }}</div>
              <div class="det">{{ fmtFH(m.fecha) }}{{ m.nota ? ' · ' + m.nota : '' }}</div>
            </div>
            <b :class="m.tipo === 'Retiro' ? 'neg' : 'pos'">{{ m.tipo === 'Retiro' ? '-' : '+' }}{{ fmt(m.monto) }}</b>
          </div>
        </div>
      </section>

      <!-- ==================== REPORTES (CON CUADRE NUEVO) ==================== -->
      <section v-show="sec === 'reportes'" class="fade-up">
        <!-- Cerrar Período -->
        <div class="card">
          <div class="card-title"><icon name="calendar" :size="18" :color="sec === 'reportes' ? '#2196F3' : mutColor"></icon> Cerrar Período</div>
          <div class="info-box" style="margin-bottom:.6rem">
            Al cerrar, los contadores del inicio se reinician. El historial se conserva y la ganancia se acumula.
          </div>
          <div style="font-size:.82rem;color:var(--mut);margin-bottom:.5rem">
            Período actual: desde {{ fmtFecha(cfg.periodoInicio) }}
          </div>
          <div class="grid2" style="margin-bottom:.5rem">
            <div><span class="det">Ventas</span><div style="font-weight:800">{{ fmt(ventasPeriodo) }}</div></div>
            <div><span class="det">Compras</span><div style="font-weight:800" class="neg">{{ fmt(comprasPeriodo) }}</div></div>
          </div>
          <div style="font-size:.9rem;font-weight:800;margin-bottom:.6rem">
            Ganancia: <span :class="gananciaNetaPeriodo >= 0 ? 'pos' : 'neg'">{{ fmt(gananciaNetaPeriodo) }}</span>
          </div>
          <button class="btn warn" @click="cerrarPeriodo()">
            <icon name="calendar" :size="16" color="#fff"></icon> Cerrar Período y Empezar Nuevo
          </button>
        </div>

        <!-- Historial de Cierres -->
        <div class="card">
          <div class="card-title"><icon name="list" :size="18" :color="sec === 'reportes' ? '#2196F3' : mutColor"></icon> Historial de Cierres</div>
          <div v-if="cierres.length === 0" class="empty">Sin cierres</div>
          <div v-for="c in cierresOrdenados" :key="c.id" class="item">
            <div class="info">
              <div class="nm">{{ c.periodo }}</div>
              <div class="det">Cerrado {{ fmtFecha(c.fechaCierre) }} · Vtas {{ fmt(c.totalVentas) }} · Gan {{ fmt(c.ganancia) }}</div>
            </div>
          </div>
        </div>

        <!-- CUADRE POR PERÍODO (NUEVO - reemplaza Reporte viejo) -->
        <div class="card">
          <div class="card-title"><icon name="file" :size="18" :color="sec === 'reportes' ? '#2196F3' : mutColor"></icon> Cuadre por Período</div>
          <div class="grid2">
            <input v-model="rep.fechaInicio" type="date">
            <input v-model="rep.fechaFin" type="date">
          </div>
          <div class="grid2" style="margin-bottom:.5rem">
            <button class="btn ghost" style="margin-bottom:0;font-size:.72rem"
              @click="rep.fechaInicio = rep.fechaFin = new Date().toISOString().split('T')[0]">Hoy</button>
            <button class="btn ghost" style="margin-bottom:0;font-size:.72rem" @click="setMesActual()">Este mes</button>
          </div>
          <button class="btn ghost" style="margin-bottom:.5rem;font-size:.72rem" @click="setPeriodoActual()">
            Período actual (desde {{ fmtFecha(cfg.periodoInicio) }})
          </button>
          <button class="btn pri" @click="generarReporte()">
            <icon name="search" :size="16" color="#fff"></icon> Generar Cuadre
          </button>

          <!-- Resumen del cuadre -->
          <div v-if="rep.resultado" style="margin-top:.8rem">
            <div class="card-title" style="margin-top:0"><icon name="chart" :size="18"></icon> Resumen</div>
            <div class="row"><span>Ingresos</span><b class="pos">{{ fmt(rep.resultado.ingresos) }}</b></div>
            <div class="row"><span>Costos (COGS)</span><b class="neg">-{{ fmt(rep.resultado.cogs) }}</b></div>
            <div class="row"><span>Ganancia bruta</span><b>{{ fmt(rep.resultado.bruta) }} ({{ rep.resultado.margenB }}%)</b></div>
            <div class="row"><span>Mermas</span><b class="neg">-{{ fmt(rep.resultado.mermas) }}</b></div>
            <div class="row"><span>Gastos operativos</span><b class="neg">-{{ fmt(rep.resultado.gastos) }}</b></div>
            <div class="row total">
              <span>Ganancia neta</span>
              <span :class="rep.resultado.neta >= 0 ? 'pos' : 'neg'">{{ fmt(rep.resultado.neta) }} ({{ rep.resultado.margenN }}%)</span>
            </div>
            <div class="det" style="font-size:.75rem;color:var(--mut);margin-top:.3rem">
              Ventas realizadas: {{ rep.resultado.numVentas }}
            </div>
          </div>

          <!-- Tabla de cuadre por producto -->
          <div v-if="rep.resultado && rep.resultado.cuadre" style="margin-top:1rem">
            <div class="card-title"><icon name="package" :size="18"></icon> Cuadre por producto</div>
            <div style="overflow-x:auto">
              <table class="cuadre-table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Compras</th>
                    <th>Costo c/u</th>
                    <th>Ventas</th>
                    <th>Precio c/u</th>
                    
                    <th>Ingresos</th>
                    <th>Costo</th>
                    <th>Ganancia</th>
                    <th>Stock</th>
                    <th>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="r in rep.resultado.cuadre" :key="r.id">
                    <td>{{ r.nombre }}</td>
                    <td>{{ fmtCant(r.compras) }}</td>
                    <td>{{ fmt(r.costoCompra) }}</td>
                    <td>{{ fmtCant(r.ventas) }}</td>
                    <td>{{ fmt(r.precioVenta) }}</td>
                    
                    <td class="pos">{{ fmt(r.ingresos) }}</td>
                    <td class="neg">{{ fmt(r.costo) }}</td>
                    <td :class="r.ganancia >= 0 ? 'pos' : 'neg'"><b>{{ fmt(r.ganancia) }}</b></td>
                    <td>{{ fmtCant(r.stockFinal) }}</td>
                    <td>{{ fmt(r.valorInv) }}</td>
                  </tr>
                  <tr class="total-row">
                    <td>TOTAL</td>
                    <td>{{ fmtCant(rep.resultado.totales.compras) }}</td>
                    <td></td>
                    <td>{{ fmtCant(rep.resultado.totales.ventas) }}</td>
                    <td></td>
                    <td class="pos">{{ fmt(rep.resultado.totales.ingresos) }}</td>
                    <td class="neg">{{ fmt(rep.resultado.totales.costo) }}</td>
                    <td :class="rep.resultado.totales.ganancia >= 0 ? 'pos' : 'neg'">{{ fmt(rep.resultado.totales.ganancia) }}</td>
                    <td>{{ fmtCant(rep.resultado.totales.stockFinal) }}</td>
                    <td>{{ fmt(rep.resultado.totales.valorInv) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Botón PDF (reemplaza CSV y Compartir) -->
            <button class="btn ok" style="margin-top:.8rem" @click="generarPDFCuadre()">
              <icon name="file" :size="16" color="#fff"></icon> Exportar PDF
            </button>
          </div>
        </div>
      </section>
      <!-- ==================== SOCIOS ==================== -->
      <section v-show="sec === 'socios'" class="fade-up">
        <div class="balance morado">
          <div class="lbl"><icon name="users" :size="14" color="#fff"></icon> Socios activos</div>
          <div class="val">{{ sociosActivos.length }}</div>
          <div class="sub">Repartido: {{ fmt(totalDistribuido) }} · {{ sumaPorcentajes }}% en total</div>
        </div>
        <div class="card">
          <div class="card-title"><icon name="plus" :size="18" :color="sec === 'socios' ? '#2196F3' : mutColor"></icon> {{ socioForm.editId ? 'Editar' : 'Agregar' }} Socio</div>
          <input v-model="socioForm.nombre" type="text" placeholder="Nombre del socio">
          <div class="grid2">
            <input v-model="socioForm.porcentaje" type="number" inputmode="decimal" step="0.01" placeholder="% participacion">
            <input v-model="socioForm.aporte" type="number" inputmode="decimal" step="0.01" placeholder="Aporte inicial">
          </div>
          <div class="info-box" style="margin-bottom:.5rem">
            Suma actual: <b>{{ sumaPorcentajes }}%</b>
            <span v-if="Math.abs(sumaPorcentajes - 100) < 0.01"> OK</span>
            <span v-else style="color:var(--warn)"> (debe sumar 100%)</span>
          </div>
          <button class="btn pri" @click="guardarSocio()">
            <icon name="check" :size="16" color="#fff"></icon>
            {{ socioForm.editId ? 'Actualizar' : 'Agregar Socio' }}
          </button>
          <button v-if="socioForm.editId" class="btn ghost" @click="resetSocio()">Cancelar</button>
        </div>
        <div class="card">
          <div class="card-title"><icon name="users" :size="18" :color="sec === 'socios' ? '#2196F3' : mutColor"></icon> Socios</div>
          <div v-if="socios.length === 0" class="empty">Sin socios registrados</div>
          <div v-for="s in socios" :key="s.id" class="item">
            <div class="info">
              <div class="nm">{{ s.nombre }}</div>
              <div class="det">{{ n(s.porcentaje).toFixed(2) }}% · Aporte {{ fmt(s.aporte) }} · Recibido {{ fmt(totalPorSocio(s.id)) }}</div>
            </div>
            <div class="act-btns">
              <button class="icon-btn" @click="editarSocio(s.id)" aria-label="Editar">
                <icon name="edit" :size="15" :color="txtColor"></icon>
              </button>
              <button class="icon-btn bad" @click="eliminarSocio(s.id)" aria-label="Eliminar">
                <icon name="trash" :size="15" color="#dc2626"></icon>
              </button>
            </div>
          </div>
        </div>
        <div class="card">
          <div class="card-title"><icon name="dollar" :size="18" :color="sec === 'socios' ? '#2196F3' : mutColor"></icon> Repartir Ganancia</div>
          <div style="font-size:.82rem;color:var(--mut);margin-bottom:.5rem">
            Disponible: <b class="pos">{{ fmt(gananciaDisponible) }}</b>
          </div>
          <input v-model="repartoForm.monto" type="number" inputmode="decimal" step="0.01" placeholder="Monto a repartir">
          <input v-model="repartoForm.concepto" type="text" placeholder="Concepto (ej: Reparto mensual)">
          <div v-if="n(repartoForm.monto) > 0 && sociosActivos.length" class="info-box" style="margin-bottom:.5rem">
            <div v-for="s in sociosActivos" :key="s.id" style="display:flex;justify-content:space-between;padding:.15rem 0">
              <span>{{ s.nombre }} ({{ n(s.porcentaje).toFixed(2) }}%)</span>
              <b>{{ fmt(n(repartoForm.monto) * n(s.porcentaje) / 100) }}</b>
            </div>
          </div>
          <button class="btn ok" @click="repartirGanancia()">
            <icon name="check" :size="16" color="#fff"></icon> Repartir
          </button>
        </div>
        <div class="card">
          <div class="card-title"><icon name="list" :size="18" :color="sec === 'socios' ? '#2196F3' : mutColor"></icon> Historial de Distribuciones</div>
          <div v-if="distribucionesOrdenadas.length === 0" class="empty">Sin distribuciones</div>
          <div v-for="d in distribucionesOrdenadas" :key="d.id" class="item">
            <div class="info">
              <div class="nm">{{ d.socioNombre }}</div>
              <div class="det">{{ fmtFH(d.fecha) }} · {{ d.concepto }}</div>
            </div>
            <b class="pos">+{{ fmt(d.monto) }}</b>
          </div>
        </div>
      </section>

    </main>

    <!-- ==================== BOTTOM NAV ==================== -->
    <nav class="nav no-print">
      <button :class="{ activo: sec === 'dashboard' }" @click="ir('dashboard')">
        <icon name="home" :size="22" :color="sec === 'dashboard' ? '#2196F3' : '#6b7280'"></icon><span>Inicio</span>
      </button>
      <button :class="{ activo: sec === 'ventas' }" @click="ir('ventas')">
        <icon name="cart" :size="22" :color="sec === 'ventas' ? '#2196F3' : '#6b7280'"></icon><span>Ventas</span>
      </button>
      <button :class="{ activo: sec === 'compras' }" @click="ir('compras')">
        <icon name="bag" :size="22" :color="sec === 'compras' ? '#2196F3' : '#6b7280'"></icon><span>Compras</span>
      </button>
      <button :class="{ activo: sec === 'caja' }" @click="ir('caja')">
        <icon name="wallet" :size="22" :color="sec === 'caja' ? '#2196F3' : '#6b7280'"></icon><span>Caja</span>
      </button>
      <button :class="{ activo: masActivo }" @click="masAbierto = !masAbierto">
        <icon name="menu" :size="22" :color="masActivo ? '#2196F3' : '#6b7280'"></icon><span>Más</span>
      </button>
    </nav>

    <!-- MORE MENU SHEET -->
    <div v-if="masAbierto" class="overlay no-print" @click="masAbierto = false"></div>
    <div v-if="masAbierto" class="sheet no-print">
      <div class="handle"></div>
      <div class="sheet-grid">
        <button class="sheet-btn" :class="{ activo: sec === 'productos' }" @click="ir('productos')"><icon name="tag" :size="22"></icon>Productos</button>
        <button class="sheet-btn" :class="{ activo: sec === 'inventario' }" @click="ir('inventario')"><icon name="package" :size="22"></icon>Inventario</button>
        <button class="sheet-btn" :class="{ activo: sec === 'patrimonio' }" @click="ir('patrimonio')"><icon name="dollar" :size="22"></icon>Patrimonio</button>
        <button class="sheet-btn" :class="{ activo: sec === 'reportes' }" @click="ir('reportes')"><icon name="file" :size="22"></icon>Reportes</button>
        <button class="sheet-btn" :class="{ activo: sec === 'socios' }" @click="ir('socios')"><icon name="users" :size="22"></icon>Socios</button>
        <button class="sheet-btn" @click="ajustesAbierto = true"><icon name="settings" :size="22"></icon>Ajustes</button>
      </div>
    </div>

    <!-- ==================== SETTINGS MODAL ==================== -->
    <div v-if="ajustesAbierto" class="modal no-print">
      <div class="modal-box">
        <div class="modal-title"><icon name="settings" :size="20"></icon> Ajustes</div>

        <div class="set-group">Apariencia</div>
        <div class="set-row">
          <span class="lbl"><icon name="moon" :size="18"></icon> Modo oscuro</span>
          <label class="switch">
            <input type="checkbox" v-model="cfg.tema" true-value="dark" false-value="light" @change="toggleTema">
            <span class="slider"></span>
          </label>
        </div>
        <div class="set-row">
          <span class="lbl"><icon name="store" :size="18"></icon> Tienda</span>
          <input v-model="cfg.nombre" type="text" style="width:auto;flex:1;margin:0;padding:.4rem .6rem" @change="guardarCfg">
        </div>

        <div class="set-group">Seguridad</div>
        <div class="set-row">
          <span class="lbl"><icon name="lock" :size="18"></icon> PIN operaciones sensibles</span>
          <label class="switch">
            <input type="checkbox" v-model="cfg.pinActivo" @change="guardarCfg">
            <span class="slider"></span>
          </label>
        </div>
        <div v-if="cfg.pinActivo" style="margin-top:.3rem">
          <input v-model="cfg.pin" type="password" placeholder="PIN (4 dígitos)" maxlength="6" @change="guardarCfg">
        </div>

        <div class="set-group">Datos</div>
        <button class="btn pri" @click="exportar"><icon name="download" :size="16" color="#fff"></icon> Exportar respaldo</button>
        <button class="btn ghost" @click="triggerImport"><icon name="upload" :size="16" :color="mutColor"></icon> Importar datos</button>
        <input type="file" id="impFile" accept=".json" style="display:none" @change="onImportFile">
        <div v-if="ultimoBackup" style="font-size:.75rem;color:var(--mut);margin-top:.3rem">
          Último backup auto: {{ fmtFH(ultimoBackup.fecha) }}
          <button class="link-btn" @click="restaurarBackupAuto">Restaurar backup automático</button>
        </div>

        <div class="set-group">Información</div>
        <div style="font-size:.78rem;color:var(--mut)">
          Versión 6.0 · Datos locales<br>
          {{ productos.length }} productos · {{ ventas.length }} ventas · {{ compras.length }} compras
        </div>

        <button class="btn ghost" style="margin-top:.8rem" @click="ajustesAbierto = false">Cerrar</button>
      </div>
    </div>

    <!-- ==================== COBRO MODAL ==================== -->
    <div v-if="cobroModal.activo" class="modal no-print">
      <div class="modal-box">
        <div class="modal-title"><icon name="check" :size="20"></icon> Cobrar Venta</div>
        <div class="cobro-modal">Total a Pagar: {{ fmt(cobroModal.total) }}</div>
        <input v-model="cobroModal.recibido" type="number" inputmode="decimal" step="0.01"
          placeholder="Monto recibido" @input="calcVuelto" autofocus>
        <button class="btn ghost" style="margin-bottom:.5rem"
          @click="cobroModal.recibido = cobroModal.total; calcVuelto()">Pagar Exacto</button>
        <div v-if="cobroModal.vuelto > 0" class="cobro-vuelto">Vuelto: {{ fmt(cobroModal.vuelto) }}</div>
        <button class="btn ok" @click="procesarVenta" :disabled="procesandoVenta">
          <icon name="check" :size="16" color="#fff"></icon>
          {{ procesandoVenta ? 'Procesando...' : 'Confirmar Pago' }}
        </button>
        <button class="btn ghost" @click="cobroModal.activo = false">Cancelar</button>
      </div>
    </div>

    <!-- ==================== RETIRO MODAL ==================== -->
    <div v-if="retiroAbierto" class="modal no-print">
      <div class="modal-box">
        <div class="modal-title"><icon name="dollar" :size="20"></icon> Retirar Ganancia</div>
        <div style="font-size:.82rem;color:var(--mut);margin-bottom:.5rem">
          Disponible: <b class="pos">{{ fmt(gananciaDisponible) }}</b>
        </div>
        <input v-model="retiroForm.monto" type="number" inputmode="decimal" step="0.01" placeholder="Monto a retirar">
        <input v-model="retiroForm.concepto" type="text" placeholder="Concepto (obligatorio)">
        <div class="grid2">
          <button class="btn bad" @click="registrarRetiro">Retirar</button>
          <button class="btn ghost" @click="retiroAbierto = false">Cancelar</button>
        </div>
      </div>
    </div>

    <!-- ==================== APORTE MODAL ==================== -->
    <div v-if="aporteAbierto" class="modal no-print">
      <div class="modal-box">
        <div class="modal-title"><icon name="plus" :size="20"></icon> Aportar Capital</div>
        <input v-model="aporteForm.monto" type="number" inputmode="decimal" step="0.01" placeholder="Monto del aporte">
        <input v-model="aporteForm.nota" type="text" placeholder="Nota (opcional)">
        <div class="grid2">
          <button class="btn ok" @click="registrarAporte">Registrar Aporte</button>
          <button class="btn ghost" @click="aporteAbierto = false">Cancelar</button>
        </div>
      </div>
    </div>

    <!-- ==================== CONFIRM MODAL ==================== -->
    <div v-if="confirm.activo" class="modal no-print">
      <div class="modal-box">
        <div class="modal-title">{{ confirm.titulo }}</div>
        <p style="margin-bottom:1rem;font-size:.9rem">{{ confirm.msg }}</p>
        <div class="grid2">
          <button class="btn ok" @click="okConfirm">Confirmar</button>
          <button class="btn ghost" @click="confirm.activo = false">Cancelar</button>
        </div>
      </div>
    </div>

    <!-- ==================== PROMPT MODAL ==================== -->
    <div v-if="prompt.activo" class="modal no-print">
      <div class="modal-box">
        <div class="modal-title">{{ prompt.titulo }}</div>
        <p style="margin-bottom:.8rem;font-size:.9rem">{{ prompt.msg }}</p>
        <input v-model="prompt.value" :type="prompt.type || 'text'" :placeholder="prompt.placeholder"
          @keyup.enter="okPrompt" autofocus>
        <div class="grid2" style="margin-top:.5rem">
          <button class="btn ok" @click="okPrompt">Aceptar</button>
          <button class="btn ghost" @click="cancelPrompt">Cancelar</button>
        </div>
      </div>
    </div>

    <!-- ==================== TOAST ==================== -->
    <div class="toast" :class="[toast.type, { show: toast.show }]">
      {{ toast.msg }}
      <button v-if="toast.accionTxt" @click="toast.accionFn && toast.accionFn(); toast.show = false">{{ toast.accionTxt }}</button>
    </div>
  </div>
</template>
<script>
import { db, n, m, q, genId, clean, P, vib, fmt, fmtCant, fmtFecha, fmtFH, buildData } from './db.js';
import Chart from 'chart.js/auto';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// SVG paths para el componente icon
const PATHS = {
  store: '<path d="M3 9l1-5h16l1 5"></path><path d="M4 9v11h16V9"></path><path d="M9 22V12h6v10"></path>',
  home: '<path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline>',
  cart: '<circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.7 13.4a2 2 0 002 1.6h9.7a2 2 0 002-1.6L23 6H6"></path>',
  bag: '<path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 01-8 0"></path>',
  wallet: '<path d="M20 12V8H6a2 2 0 010-4h12v4"></path><path d="M4 6v12c0 1.1.9 2 2 2h14v-4"></path><path d="M18 12a2 2 0 000 4h4v-4z"></path>',
  tag: '<path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line>',
  package: '<line x1="16.5" y1="9.4" x2="7.5" y2="4.21"></line><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line>',
  dollar: '<line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"></path>',
  chart: '<line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line>',
  trend: '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line>',
  list: '<line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line>',
  file: '<path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline>',
  check: '<polyline points="20 6 9 17 4 12"></polyline>',
  x: '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>',
  trash: '<polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path>',
  edit: '<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"></path>',
  refresh: '<polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"></path>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>',
  menu: '<line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line>',
  settings: '<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"></path>',
  moon: '<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"></path>',
  sun: '<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0110 0v4"></path>',
  download: '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line>',
  upload: '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line>',
  alert: '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>',
  diamond: '<path d="M2.7 10.3a2.41 2.41 0 000 3.41l7.59 7.59a2.41 2.41 0 003.41 0l7.59-7.59a2.41 2.41 0 000-3.41L13.7 2.71a2.41 2.41 0 00-3.41 0z"></path>',
  chevron: '<polyline points="6 9 12 15 18 9"></polyline>',
  share: '<circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>',
  search: '<circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>',
  users: '<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 00-3-3.87"></path><path d="M16 3.13a4 4 0 010 7.75"></path>'
};

export default {
  name: 'App',

  components: {
    icon: {
      props: {
        name: String,
        size: { type: [Number, String], default: 22 },
        color: { type: String, default: '#2196F3' }
      },
      render() {
        const s = parseInt(this.size) || 22;
        return h('svg', {
          width: s, height: s, viewBox: '0 0 24 24', fill: 'none',
          stroke: this.color, 'stroke-width': 2,
          'stroke-linecap': 'round', 'stroke-linejoin': 'round',
          style: 'flex-shrink:0;vertical-align:middle;display:inline-block;',
          innerHTML: PATHS[this.name] || ''
        });
      }
    }
  },

  data() {
    return {
      online: navigator.onLine,
      hayUpdate: false,
      _swWaiting: null,
      _aplicando: false,
      cargando: true,
      sec: 'dashboard',
      masAbierto: false,
      ajustesAbierto: false,
      retiroAbierto: false,
      aporteAbierto: false,

      cfg: {
        nombre: 'Tienda Pro',
        tema: 'light',
        pin: '',
        pinActivo: false,
        capitalInicial: 0,
        periodoInicio: new Date().toISOString(),
        ultimoBackupAuto: null,
        ultimoExport: null
      },

      productos: [],
      lotes: [],
      ventas: [],
      compras: [],
      ajustes: [],
      arqueos: [],
      movCaja: [],
      cierres: [],
      capital: [],
      retiros: [],
      socios: [],
      distribuciones: [],

      prodExpandido: {},
      invExpandido: {},

      busqVenta: '',
      focusVenta: false,
      carrito: [],
      busqHist: '',

      busqCompra: '',
      focusCompra: false,
      compraForm: { editId: '', productoId: '', nombre: '', cantidad: '', costo: '', unidad: '' },

      prodForm: { editId: '', nombre: '', codigo: '', precio: '', stockMin: '5', unidad: '' },
      busqProd: '',
      mostrarArchivados: false,

      ajusteForm: { productoId: '', cantidad: '', motivo: '', costoSobrante: '' },
      arqueoForm: { monto: '', nota: '' },
      arqueoPreview: { fisico: 0, diff: 0, class: 'cuadre' },

      retiroForm: { monto: '', concepto: '' },
      aporteForm: { monto: '', nota: '' },
      socioForm: { editId: '', nombre: '', porcentaje: '', aporte: '' },
      repartoForm: { monto: '', concepto: '' },
      capInicialStr: '',

      rep: {
        fechaInicio: new Date().toISOString().split('T')[0],
        fechaFin: new Date().toISOString().split('T')[0],
        resultado: null
      },

      cobroModal: { activo: false, total: 0, recibido: '', vuelto: 0 },
      confirm: { activo: false, titulo: '', msg: '', onOk: null },
      prompt: { activo: false, titulo: '', msg: '', placeholder: '', type: 'text', value: '', onOk: null },
      toast: { show: false, msg: '', type: 'ok', accionTxt: '', accionFn: null, timer: null },

      ultimoBackup: null,
      procesandoVenta: false,
      importFile: null,
      _chart: null
    };
  },

  computed: {
    mutColor() { return this.cfg.tema === 'dark' ? '#94a3b8' : '#6b7280'; },
    txtColor() { return this.cfg.tema === 'dark' ? '#f1f5f9' : '#111827'; },
    masActivo() { return this.masAbierto || ['productos','inventario','patrimonio','reportes','socios'].includes(this.sec); },

    saldoCaja() {
      const ini = n(this.cfg.capitalInicial);
      const aportes = this.capital.reduce((s, x) => s + n(x.monto), 0);
      const retiros = this.retiros.reduce((s, x) => s + n(x.monto), 0);
      const ventasC = this.ventas.filter(v => !v.anulada).reduce((s, v) => s + n(v.total), 0);
      const compras = this.compras.filter(c => !c.anulada).reduce((s, c) => s + n(c.total), 0);
      const arq = this.movCaja.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + n(m.monto), 0)
        - this.movCaja.filter(m => m.tipo === 'egreso').reduce((s, m) => s + n(m.monto), 0);
      return m(ini + aportes + ventasC - compras - retiros + arq);
    },

    valorInventario() {
      return m(this.lotes.reduce((s, l) => s + ((n(l.cantidadInicial) - n(l.cantidadVendida)) * n(l.costo)), 0));
    },

    unidadesTotal() {
      return m(this.lotes.reduce((s, l) => s + (n(l.cantidadInicial) - n(l.cantidadVendida)), 0));
    },

    lotesActivos() {
      return this.lotes.filter(l => (n(l.cantidadInicial) - n(l.cantidadVendida)) > 0);
    },

    stockMap() {
      const map = {};
      this.productos.forEach(p => { map[p.id] = 0; });
      this.lotes.forEach(l => {
        if (map[l.productoId] !== undefined) {
          map[l.productoId] += (n(l.cantidadInicial) - n(l.cantidadVendida));
        }
      });
      return map;
    },

    prodsActivos() { return this.productos.filter(p => !p.archivado); },

    productosBajoStock() {
      return this.prodsActivos.filter(p => {
        const s = this.stock(p.id);
        return s > 0 && s <= n(p.stockMinimo);
      });
    },

    productosAgotados() {
      return this.prodsActivos.filter(p => this.stock(p.id) === 0);
    },

    ventasPeriodo() {
      const ini = new Date(this.cfg.periodoInicio);
      return m(this.ventas.filter(v => !v.anulada && new Date(v.fecha) >= ini).reduce((s, v) => s + n(v.total), 0));
    },

    comprasPeriodo() {
      const ini = new Date(this.cfg.periodoInicio);
      return m(this.compras.filter(c => !c.anulada && new Date(c.fecha) >= ini).reduce((s, c) => s + n(c.total), 0));
    },

    gananciaBrutaPeriodo() {
      const ini = new Date(this.cfg.periodoInicio);
      return m(this.ventas.filter(v => !v.anulada && new Date(v.fecha) >= ini).reduce((s, v) => s + n(v.ganancia), 0));
    },

    gastosOpPeriodo() {
      const ini = new Date(this.cfg.periodoInicio);
      return m(this.movCaja
        .filter(mv => mv.tipo === 'egreso' && mv.concepto && mv.concepto.toLowerCase().includes('gasto') && new Date(mv.fecha) >= ini)
        .reduce((s, mv) => s + n(mv.monto), 0));
    },

    gananciaNetaPeriodo() {
      const mermas = this.ajustes
        .filter(a => a.cantidad < 0 && new Date(a.fecha) >= new Date(this.cfg.periodoInicio))
        .reduce((s, a) => s + n(a.costoPerdida), 0);
      return m(this.gananciaBrutaPeriodo - this.gastosOpPeriodo - mermas);
    },

    margenPeriodo() {
      return this.ventasPeriodo > 0 ? ((this.gananciaNetaPeriodo / this.ventasPeriodo) * 100).toFixed(1) : '0.0';
    },

    totalCarrito() {
      return m(this.carrito.reduce((s, it) => s + (n(it.precio) * n(it.cant)), 0));
    },

    gananciaCarrito() {
      let gan = 0;
      for (const it of this.carrito) {
        const f = this.calcFIFO(it.productoId, n(it.cant));
        if (!f.error) gan += (n(it.precio) * n(it.cant)) - f.costoTotal;
      }
      return m(gan);
    },

    listaVenta() {
      const q = this.busqVenta.toLowerCase().trim();
      if (!q) return this.prodsActivos.filter(p => this.stock(p.id) > 0).slice(0, 20);
      return this.prodsActivos.filter(p =>
        this.stock(p.id) > 0 &&
        (p.nombre.toLowerCase().includes(q) || (p.codigo && p.codigo.toLowerCase().includes(q)))
      ).slice(0, 20);
    },

    listaCompra() {
      const q = this.busqCompra.toLowerCase().trim();
      if (!q) return this.prodsActivos.slice(0, 20);
      return this.prodsActivos.filter(p =>
        p.nombre.toLowerCase().includes(q) || (p.codigo && p.codigo.toLowerCase().includes(q))
      ).slice(0, 20);
    },

    prodsFiltrados() {
      let list = this.productos;
      if (!this.mostrarArchivados) list = list.filter(p => !p.archivado);
      const q = this.busqProd.toLowerCase().trim();
      if (q) list = list.filter(p => p.nombre.toLowerCase().includes(q) || (p.codigo && p.codigo.toLowerCase().includes(q)));
      return list.sort((a, b) => a.nombre.localeCompare(b.nombre));
    },

    ventasFiltradas() {
      let list = this.ventas.slice().sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
      const q = this.busqHist.toLowerCase().trim();
      if (q) list = list.filter(v => v.items.some(i => i.nombre.toLowerCase().includes(q)));
      return list.slice(0, 50);
    },

    comprasOrdenadas() {
      return this.compras.slice().sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    },

    invAgrupado() {
      return this.prodsActivos.map(p => {
        const lotes = this.lotesDeProducto(p.id);
        return {
          id: p.id,
          nombre: p.nombre,
          unidad: p.unidad,
          stockTotal: this.stock(p.id),
          valorTotal: this.valorLotesProducto(p.id),
          lotes
        };
      }).filter(g => g.stockTotal > 0 || g.lotes.length > 0)
        .sort((a, b) => a.nombre.localeCompare(b.nombre));
    },

    ajustesRecientes() {
      return this.ajustes.slice().sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).slice(0, 20);
    },

    movimientosRecientes() {
      return this.movCaja.slice().sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).slice(0, 30);
    },

    aportesTotal() { return m(this.capital.reduce((s, x) => s + n(x.monto), 0)); },
    retirosTotal() { return m(this.retiros.reduce((s, x) => s + n(x.monto), 0)); },
    capitalTotal() { return m(n(this.cfg.capitalInicial) + this.aportesTotal); },

    ventasContadoTotal() {
      return m(this.ventas.filter(v => !v.anulada).reduce((s, v) => s + n(v.total), 0));
    },

    comprasTotal() {
      return m(this.compras.filter(c => !c.anulada).reduce((s, c) => s + n(c.total), 0));
    },

    arqueoNeto() {
      return m(this.movCaja
        .filter(mv => mv.concepto && (mv.concepto.includes('Sobrante') || mv.concepto.includes('Faltante')))
        .reduce((s, mv) => s + (mv.tipo === 'ingreso' ? n(mv.monto) : -n(mv.monto)), 0));
    },

    patrimonioTotal() { return m(this.capitalTotal + this.gananciasAcumuladas); },

    gananciasAcumuladas() {
      return m(this.cierres.reduce((s, c) => s + n(c.ganancia), 0) + this.gananciaNetaPeriodo);
    },

    gananciaDisponible() { return m(this.gananciasAcumuladas - this.retirosTotal); },

    movPatrimonio() {
      const movs = [
        ...this.capital.map(x => ({ id: x.id, tipo: 'Aporte', fecha: x.fecha, monto: x.monto, nota: x.nota })),
        ...this.retiros.map(x => ({ id: x.id, tipo: 'Retiro', fecha: x.fecha, monto: x.monto, nota: x.concepto }))
      ];
      return movs.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    },

    cierresOrdenados() {
      return this.cierres.slice().sort((a, b) => new Date(b.fechaCierre) - new Date(a.fechaCierre));
    },

    sociosActivos() { return this.socios.filter(s => s.activo !== false); },
    sumaPorcentajes() { return m(this.sociosActivos.reduce((s, x) => s + n(x.porcentaje), 0)); },
    totalDistribuido() { return m(this.distribuciones.reduce((s, d) => s + n(d.monto), 0)); },
    distribucionesOrdenadas() { return this.distribuciones.slice().sort((a, b) => new Date(b.fecha) - new Date(a.fecha)); },

    topRentables() {
      const now = new Date();
      const iniMes = new Date(now.getFullYear(), now.getMonth(), 1);
      const map = {};
      this.ventas.filter(v => !v.anulada && new Date(v.fecha) >= iniMes).forEach(v => {
        v.items.forEach(it => {
          if (!map[it.productoId]) map[it.productoId] = { id: it.productoId, nombre: it.nombre, gan: 0 };
          map[it.productoId].gan += n(it.ganancia);
        });
      });
      return Object.values(map).sort((a, b) => b.gan - a.gan).slice(0, 5);
    },

    ultimaActividad() {
      const fechas = [
        ...this.ventas.map(v => v.fecha),
        ...this.compras.map(c => c.fecha),
        ...this.ajustes.map(a => a.fecha)
      ].filter(f => f).sort().reverse();
      return fechas.length ? fmtFH(fechas[0]) : 'Sin actividad';
    }
  },

  methods: {
    // ===== HELPERS =====
    fmt, fmtCant, fmtFecha, fmtFH, n, m,

    stock(pid) { return this.stockMap[pid] || 0; },

    badgeStock(p) {
      const s = this.stock(p.id);
      if (p.archivado) return 'arch';
      if (s === 0) return 'out';
      if (s <= n(p.stockMinimo)) return 'low';
      return 'ok';
    },

    txtBadge(p) {
      const s = this.stock(p.id);
      if (p.archivado) return 'ARCHIVADO';
      if (s === 0) return 'AGOTADO';
      if (s <= n(p.stockMinimo)) return 'BAJO';
      return 'OK';
    },

    lotesDeProducto(pid) {
      return this.lotes
        .filter(l => l.productoId === pid && (n(l.cantidadInicial) - n(l.cantidadVendida)) > 0)
        .sort((a, b) => new Date(a.fecha) - new Date(b.fecha) || (a.id < b.id ? -1 : 1));
    },

    valorLotesProducto(pid) {
      return m(this.lotesDeProducto(pid).reduce((s, l) => s + ((n(l.cantidadInicial) - n(l.cantidadVendida)) * n(l.costo)), 0));
    },

    toastMsg(msg, type = 'ok', accionTxt = '', accionFn = null) {
      clearTimeout(this.toast.timer);
      this.toast = { show: true, msg, type, accionTxt, accionFn, timer: null };
      vib(type === 'ok' ? 20 : 40);
      this.toast.timer = setTimeout(() => { this.toast.show = false; }, accionTxt ? 5000 : 3000);
    },

    toggleTema() {
      this.cfg.tema = this.cfg.tema === 'dark' ? 'light' : 'dark';
      try { document.documentElement.setAttribute('data-theme', this.cfg.tema); } catch (e) {}
      this.guardarCfg();
      if (this.sec === 'dashboard') this.$nextTick(() => requestAnimationFrame(() => this.renderChart()));
    },

    ir(s) {
      this.masAbierto = false;
      this.sec = s;
      try { history.pushState({ sec: s }, '', '#' + s); } catch (e) {}
    },

    // ===== VENTAS =====
    calcFIFO(pid, cant) {
      const lotes = this.lotes
        .filter(l => l.productoId === pid && (n(l.cantidadInicial) - n(l.cantidadVendida)) > 0)
        .sort((a, b) => new Date(a.fecha) - new Date(b.fecha) || (a.id < b.id ? -1 : 1));
      let rest = cant, total = 0, usados = [];
      for (const l of lotes) {
        if (rest <= 0) break;
        const disp = n(l.cantidadInicial) - n(l.cantidadVendida);
        const usar = Math.min(disp, rest);
        total = m(total + (usar * n(l.costo)));
        usados.push({ loteId: l.id, cantidad: usar, costo: l.costo });
        rest -= usar;
      }
      if (rest > 0.001) return { error: 'Stock insuficiente (faltan ' + rest.toFixed(3) + ')' };
      return { costoTotal: total, usados };
    },

    agregarCarrito(p) {
      const s = this.stock(p.id);
      if (s <= 0) return this.toastMsg('Sin stock', 'bad');
      const ex = this.carrito.find(i => i.productoId === p.id);
      if (ex) {
        if (n(ex.cant) < s) ex.cant = String(n(ex.cant) + 1);
        else return this.toastMsg('Stock máximo', 'warn');
      } else {
        this.carrito.push({ productoId: p.id, nombre: p.nombre, precio: String(p.precio), cant: '1', unidad: p.unidad || '' });
      }
      this.busqVenta = '';
      this.focusVenta = false;
    },

    agregarPrimero() {
      if (this.listaVenta.length > 0) this.agregarCarrito(this.listaVenta[0]);
    },

    cambiarCant(it, dir) {
      let val = n(it.cant) + dir;
      if (it.unidad && ['kg', 'lb', 'gr', 'litro', 'm'].includes(it.unidad)) {
        val = n(it.cant) + (dir * 0.5);
      }
      if (val > this.stock(it.productoId)) return this.toastMsg('Stock máximo alcanzado', 'warn');
      if (val < 0) val = 0;
      it.cant = String(val);
    },

    validarCant(it) {
      let val = n(it.cant);
      if (val > this.stock(it.productoId)) {
        val = this.stock(it.productoId);
        this.toastMsg('Cantidad ajustada al stock disponible', 'warn');
      }
      if (val < 0) val = 0;
      it.cant = String(val);
    },

    validarPrecio(it) { it.precio = String(n(it.precio)); },

    subTotalItem(it) { return m(n(it.precio) * n(it.cant)); },

    iniciarCobro() {
      const inv = this.carrito.filter(it => n(it.cant) <= 0);
      if (inv.length) return this.toastMsg('Todas las cantidades deben ser > 0', 'bad');
      this.cobroModal.total = this.totalCarrito;
      this.cobroModal.recibido = '';
      this.cobroModal.vuelto = 0;
      this.cobroModal.activo = true;
    },

    calcVuelto() {
      const rec = n(this.cobroModal.recibido);
      this.cobroModal.vuelto = rec > 0 ? m(rec - this.cobroModal.total) : 0;
    },

    async procesarVenta() {
      this.procesandoVenta = true;
      try {
        const items = []; let tot = 0, gan = 0, todos = [];
        for (const it of this.carrito) {
          const c = n(it.cant), pr = n(it.precio);
          const f = this.calcFIFO(it.productoId, c);
          if (f.error) throw new Error(f.error + ' en ' + it.nombre);
          const sub = pr * c;
          items.push({
            productoId: it.productoId, nombre: it.nombre, cantidad: c,
            unidad: it.unidad || '', precio: pr, costo: f.costoTotal,
            ganancia: sub - f.costoTotal, lotesUsados: f.usados
          });
          tot = m(tot + sub);
          gan = gan + (sub - f.costoTotal);
          todos.push(...f.usados);
        }
        const venta = { id: genId('v'), fecha: new Date().toISOString(), items, total: tot, ganancia: gan, anulada: false };

        await db.transaction('rw', db.ventas, db.lotes, async () => {
          await P(db.ventas, venta);
          const lotesActualizados = [];
          for (const u of todos) {
            const l = this.lotes.find(x => x.id === u.loteId);
            if (l) {
              l.cantidadVendida = q(n(l.cantidadVendida) + u.cantidad);
              lotesActualizados.push(l);
            }
          }
          if (lotesActualizados.length > 0) {
            await db.lotes.bulkPut(lotesActualizados.map(l => clean(l)));
          }
        });

        await this.recargar(['ventas', 'lotes']);
        this.carrito = [];
        localStorage.removeItem('carritoPro');
        this.cobroModal.activo = false;
        this.toastMsg('Venta exitosa: ' + fmt(tot));
      } catch (e) {
        this.toastMsg(e.message, 'bad');
      } finally {
        this.procesandoVenta = false;
      }
    },

    anularVenta(id) {
      const v = this.ventas.find(x => x.id === id);
      if (!v) return;
      this.pedirPin(() => {
        this.confirm = {
          activo: true, titulo: 'Anular venta',
          msg: '¿Anular venta por ' + fmt(v.total) + '? Se restaura el stock y se descuenta de caja.',
          onOk: async () => {
            try {
              await db.transaction('rw', db.ventas, db.lotes, async () => {
                await P(db.ventas, Object.assign({}, v, { anulada: true, fechaAnulacion: new Date().toISOString() }));
                const lotesActualizados = [];
                for (const it of v.items) {
                  if (!it.lotesUsados) continue;
                  for (const u of it.lotesUsados) {
                    const l = this.lotes.find(x => x.id === u.loteId);
                    if (l) {
                      l.cantidadVendida = Math.max(0, q(n(l.cantidadVendida) - u.cantidad));
                      lotesActualizados.push(l);
                    }
                  }
                }
                if (lotesActualizados.length > 0) {
                  await db.lotes.bulkPut(lotesActualizados.map(l => clean(l)));
                }
              });
              await this.recargar(['ventas', 'lotes']);
              this.toastMsg('Venta anulada');
            } catch (e) { this.toastMsg(e.message, 'bad'); }
          }
        };
      });
    },

    // ===== COMPRAS =====
    selCompra(p) {
      this.compraForm = { editId: '', productoId: p.id, nombre: p.nombre, cantidad: '', costo: '', unidad: p.unidad || '' };
      this.busqCompra = '';
      this.focusCompra = false;
    },

    resetCompra() {
      this.compraForm = { editId: '', productoId: '', nombre: '', cantidad: '', costo: '', unidad: '' };
    },

    loteSinVentas(cid) {
      const l = this.lotes.find(x => x.compraId === cid);
      return l ? n(l.cantidadVendida) === 0 : true;
    },

    editarCompra(id) {
      const c = this.compras.find(x => x.id === id);
      if (!c || !this.loteSinVentas(id)) return;
      this.compraForm = { editId: id, productoId: c.productoId, nombre: c.productoNombre, cantidad: String(c.cantidad), costo: String(c.costo), unidad: c.unidad || '' };
      window.scrollTo(0, 0);
    },

    eliminarCompra(id) {
      if (!this.loteSinVentas(id)) return;
      const c = this.compras.find(x => x.id === id);
      this.confirm = {
        activo: true, titulo: 'Eliminar compra',
        msg: '¿Eliminar compra de ' + c.productoNombre + '?',
        onOk: async () => {
          const l = this.lotes.find(x => x.compraId === id);
          await db.transaction('rw', db.compras, db.lotes, async () => {
            await db.compras.delete(id);
            if (l) await db.lotes.delete(l.id);
          });
          await this.recargar(['compras', 'lotes']);
          this.toastMsg('Compra eliminada');
        }
      };
    },

    async guardarCompra() {
      const f = this.compraForm;
      const cant = n(f.cantidad), costo = n(f.costo);
      if (!f.productoId) return this.toastMsg('Selecciona producto', 'bad');
      if (cant <= 0) return this.toastMsg('Cantidad debe ser > 0', 'bad');
      if (costo < 0) return this.toastMsg('Costo inválido', 'bad');
      const total = m(cant * costo);
      const ejecutar = async () => {
        try {
          if (f.editId) {
            const l = this.lotes.find(x => x.compraId === f.editId);
            if (l && n(l.cantidadVendida) > 0) return this.toastMsg('Lote con ventas: no editable', 'bad');
            const c = this.compras.find(x => x.id === f.editId);
            await db.transaction('rw', db.compras, db.lotes, async () => {
              await P(db.compras, Object.assign({}, c, {
                productoId: f.productoId, productoNombre: f.nombre,
                productoUnidad: f.unidad, cantidad: cant, costo, total, unidad: f.unidad
              }));
              if (l) await P(db.lotes, Object.assign({}, l, {
                productoId: f.productoId, productoNombre: f.nombre,
                productoUnidad: f.unidad, cantidadInicial: cant, costo
              }));
            });
          } else {
            const compra = {
              id: genId('c'), fecha: new Date().toISOString(),
              productoId: f.productoId, productoNombre: f.nombre,
              productoUnidad: f.unidad, cantidad: cant, costo,
              total, anulada: false, unidad: f.unidad
            };
            const lote = {
              id: genId('l'), compraId: compra.id,
              productoId: f.productoId, productoNombre: f.nombre,
              productoUnidad: f.unidad, cantidadInicial: cant,
              cantidadVendida: 0, costo, fecha: compra.fecha
            };
            await db.transaction('rw', db.compras, db.lotes, async () => {
              await P(db.compras, compra);
              await P(db.lotes, lote);
            });
          }
          await this.recargar(['compras', 'lotes']);
          this.resetCompra();
          this.toastMsg('Compra ' + fmt(total));
        } catch (e) { this.toastMsg(e.message, 'bad'); }
      };
      if (!f.editId && total > this.saldoCaja) {
        this.confirm = {
          activo: true, titulo: 'Caja insuficiente',
          msg: 'Cuesta ' + fmt(total) + ' pero hay ' + fmt(this.saldoCaja) + ' en caja. ¿Continuar?',
          onOk: ejecutar
        };
      } else ejecutar();
    },

    // ===== PRODUCTOS =====
    resetProd() {
      this.prodForm = { editId: '', nombre: '', codigo: '', precio: '', stockMin: '5', unidad: '' };
    },

    async guardarProducto() {
      const p = this.prodForm;
      const nombre = (p.nombre || '').trim();
      const precio = n(p.precio);
      const min = n(p.stockMin);
      const unidad = (p.unidad || '').trim();
      if (!nombre) return this.toastMsg('Nombre obligatorio', 'bad');
      if (precio <= 0) return this.toastMsg('Precio debe ser > 0', 'bad');
      const dup = this.productos.find(x => x.nombre.toLowerCase() === nombre.toLowerCase() && x.id !== p.editId && !x.archivado);
      if (dup) return this.toastMsg('Ya existe ese nombre', 'bad');
      if (p.editId) {
        const o = this.productos.find(x => x.id === p.editId);
        await P(db.productos, Object.assign({}, o, { nombre, codigo: (p.codigo || '').trim(), precio, stockMinimo: min, unidad }));
        this.toastMsg('Producto actualizado');
      } else {
        await P(db.productos, { id: genId('p'), nombre, codigo: (p.codigo || '').trim(), precio, stockMinimo: min, archivado: false, unidad });
        this.toastMsg('Producto agregado');
      }
      this.resetProd();
      await this.recargar(['productos']);
    },

    editarProducto(id) {
      const p = this.productos.find(x => x.id === id);
      if (!p) return;
      this.prodForm = { editId: id, nombre: p.nombre, codigo: p.codigo || '', precio: String(p.precio), stockMin: String(p.stockMinimo || 5), unidad: p.unidad || '' };
      window.scrollTo(0, 0);
    },

    archivarProducto(id) {
      const p = this.productos.find(x => x.id === id);
      if (this.stock(id) > 0) return this.toastMsg('No archivar con stock > 0', 'bad');
      this.confirm = {
        activo: true, titulo: 'Archivar producto',
        msg: '¿Archivar "' + p.nombre + '"?',
        onOk: async () => {
          await P(db.productos, Object.assign({}, p, { archivado: true }));
          await this.recargar(['productos']);
          this.toastMsg('Archivado');
        }
      };
    },

    async restaurarProducto(id) {
      const p = this.productos.find(x => x.id === id);
      await P(db.productos, Object.assign({}, p, { archivado: false }));
      await this.recargar(['productos']);
      this.toastMsg('Restaurado');
    },

    // ===== AJUSTES / MERMA =====
    async registrarAjuste() {
      const f = this.ajusteForm;
      const cant = n(f.cantidad);
      if (!f.productoId) return this.toastMsg('Selecciona producto', 'bad');
      if (cant === 0) return this.toastMsg('Cantidad no puede ser 0', 'bad');
      if (!f.motivo) return this.toastMsg('Selecciona motivo', 'bad');
      const prod = this.productos.find(p => p.id === f.productoId);
      if (cant < 0 && Math.abs(cant) > this.stock(f.productoId)) return this.toastMsg('Solo hay ' + this.stock(f.productoId), 'bad');
      if (cant < 0) {
        const res = this.calcFIFO(f.productoId, Math.abs(cant));
        if (res.error) return this.toastMsg(res.error, 'bad');
        const aj = { id: genId('a'), fecha: new Date().toISOString(), productoId: f.productoId, productoNombre: prod.nombre, cantidad: cant, motivo: f.motivo, costoPerdida: res.costoTotal, lotesUsados: res.usados };
        await db.transaction('rw', db.ajustes, db.lotes, async () => {
          await P(db.ajustes, aj);
          const lotesActualizados = [];
          for (const u of res.usados) {
            const l = this.lotes.find(x => x.id === u.loteId);
            if (l) {
              l.cantidadVendida = q(n(l.cantidadVendida) + u.cantidad);
              lotesActualizados.push(l);
            }
          }
          if (lotesActualizados.length > 0) await db.lotes.bulkPut(lotesActualizados.map(l => clean(l)));
        });
        await this.recargar(['ajustes', 'lotes']);
        this.toastMsg('Merma registrada · pérdida ' + fmt(res.costoPerdida));
      } else {
        const cs = n(f.costoSobrante);
        if (cs < 0) return this.toastMsg('Costo inválido', 'bad');
        const aj = { id: genId('a'), fecha: new Date().toISOString(), productoId: f.productoId, productoNombre: prod.nombre, cantidad: cant, motivo: f.motivo, costoPerdida: 0 };
        const lote = { id: genId('l'), compraId: 'aj-' + aj.id, productoId: f.productoId, productoNombre: prod.nombre, productoUnidad: prod.unidad || '', cantidadInicial: cant, cantidadVendida: 0, costo: cs, fecha: aj.fecha };
        await db.transaction('rw', db.ajustes, db.lotes, async () => {
          await P(db.ajustes, aj);
          await P(db.lotes, lote);
        });
        await this.recargar(['ajustes', 'lotes']);
        this.toastMsg('Sobrante registrado');
      }
      this.ajusteForm = { productoId: '', cantidad: '', motivo: '', costoSobrante: '' };
    },

    // ===== CAJA =====
    calcArqueo() {
      const fisico = n(this.arqueoForm.monto);
      const diff = m(fisico - this.saldoCaja);
      this.arqueoPreview = {
        fisico,
        diff,
        class: Math.abs(diff) < 0.01 ? 'cuadre' : (diff > 0 ? 'sobrante' : 'faltante')
      };
    },

    async registrarArqueo() {
      const monto = n(this.arqueoForm.monto);
      if (monto < 0 || this.arqueoForm.monto === '') return this.toastMsg('Monto inválido', 'bad');
      const diff = m(monto - this.saldoCaja);
      const arq = { id: genId('aq'), fecha: new Date().toISOString(), montoFisico: monto, saldoSistema: this.saldoCaja, diferencia: diff, nota: this.arqueoForm.nota };
      if (Math.abs(diff) > 0.01) {
        const mov = { id: genId('mc'), fecha: new Date().toISOString(), tipo: diff > 0 ? 'ingreso' : 'egreso', monto: Math.abs(diff), concepto: (diff > 0 ? 'Sobrante' : 'Faltante') + ' de arqueo', nota: this.arqueoForm.nota };
        await db.transaction('rw', db.arqueos, db.movCaja, async () => {
          await P(db.arqueos, arq);
          await P(db.movCaja, mov);
        });
        this.toastMsg((diff > 0 ? 'Sobrante ' : 'Faltante ') + fmt(Math.abs(diff)), diff > 0 ? 'warn' : 'bad');
      } else {
        await P(db.arqueos, arq);
        this.toastMsg('Cuadre perfecto');
      }
      this.arqueoForm = { monto: '', nota: '' };
      this.arqueoPreview = { fisico: 0, diff: 0, class: 'cuadre' };
      await this.recargar(['arqueos', 'movCaja']);
    },

    // ===== PATRIMONIO =====
    guardarCapInicial() {
      const val = n(this.capInicialStr);
      this.cfg.capitalInicial = val;
      this.guardarCfg();
      this.capInicialStr = '';
      this.toastMsg('Capital inicial guardado');
    },

    registrarRetiro() {
      const monto = n(this.retiroForm.monto);
      const c = (this.retiroForm.concepto || '').trim();
      if (monto <= 0) return this.toastMsg('Monto inválido', 'bad');
      if (!c) return this.toastMsg('Concepto obligatorio', 'bad');
      if (monto > this.gananciaDisponible + 0.01) return this.toastMsg('Máximo ' + fmt(this.gananciaDisponible), 'bad');
      this.pedirPin(async () => {
        await P(db.retiros, { id: genId('r'), fecha: new Date().toISOString(), monto, concepto: c });
        await this.recargar(['retiros']);
        this.retiroForm = { monto: '', concepto: '' };
        this.retiroAbierto = false;
        this.toastMsg('Retiro registrado');
      });
    },

    async registrarAporte() {
      const monto = n(this.aporteForm.monto);
      if (monto <= 0) return this.toastMsg('Monto inválido', 'bad');
      await P(db.capital, { id: genId('k'), fecha: new Date().toISOString(), monto, nota: this.aporteForm.nota || '' });
      await this.recargar(['capital']);
      this.aporteForm = { monto: '', nota: '' };
      this.aporteAbierto = false;
      this.toastMsg('Aporte registrado');
    },

    cerrarPeriodo() {
      this.pedirPin(() => {
        this.confirm = {
          activo: true, titulo: 'Cerrar período',
          msg: '¿Cerrar el período actual? Los contadores del inicio se reinician y la ganancia se acumula. Esta acción no se puede deshacer.',
          onOk: async () => {
            const c = {
              id: genId('z'),
              periodo: fmtFecha(this.cfg.periodoInicio) + ' - ' + fmtFecha(new Date().toISOString()),
              fechaCierre: new Date().toISOString(),
              totalVentas: this.ventasPeriodo,
              totalCompras: this.comprasPeriodo,
              ganancia: this.gananciaNetaPeriodo
            };
            this.cfg.periodoInicio = new Date().toISOString();
            await P(db.cierres, c);
            await this.guardarCfg();
            await this.recargar(['cierres']);
            this.toastMsg('Período cerrado');
          }
        };
      });
    },

    // ===== CUADRE / REPORTES (NUEVO) =====
    setMesActual() {
      const now = new Date();
      const inicio = new Date(now.getFullYear(), now.getMonth(), 1);
      this.rep.fechaInicio = inicio.toISOString().split('T')[0];
      this.rep.fechaFin = now.toISOString().split('T')[0];
    },

    setPeriodoActual() {
      this.rep.fechaInicio = this.cfg.periodoInicio.split('T')[0];
      this.rep.fechaFin = new Date().toISOString().split('T')[0];
    },

    generarReporte() {
      if (!this.rep.fechaInicio || !this.rep.fechaFin) return this.toastMsg('Selecciona fechas', 'bad');
      const i = new Date(this.rep.fechaInicio), f = new Date(this.rep.fechaFin);
      f.setHours(23, 59, 59);
      if (i > f) return this.toastMsg('Fecha inicio > fin', 'bad');

      const vp = this.ventas.filter(v => !v.anulada && new Date(v.fecha) >= i && new Date(v.fecha) <= f);
      const cp = this.compras.filter(c => new Date(c.fecha) >= i && new Date(c.fecha) <= f);
      const gp = this.ajustes.filter(a => a.cantidad < 0 && new Date(a.fecha) >= i && new Date(a.fecha) <= f);

      let gastosTotal = 0;
      try {
        gastosTotal = m(this.movCaja
          .filter(mv => mv.tipo === 'egreso' && mv.concepto && mv.concepto.toLowerCase().includes('gasto'))
          .filter(mv => new Date(mv.fecha) >= i && new Date(mv.fecha) <= f)
          .reduce((s, mv) => s + n(mv.monto), 0));
      } catch (e) {}

      const ing = m(vp.reduce((s, v) => s + n(v.total), 0));
      const cogs = m(vp.reduce((s, v) => s + v.items.reduce((ss, it) => ss + n(it.costo), 0), 0));
      const bruta = m(ing - cogs);
      const mermas = m(gp.reduce((s, a) => s + n(a.costoPerdida), 0));
      const neta = m(bruta - mermas - gastosTotal);

      const cuadre = this.productos.filter(p => !p.archivado).map(p => {
        const comprasProd = cp.filter(c => c.productoId === p.id);
        const ventasProdItems = vp.flatMap(v => v.items).filter(it => it.productoId === p.id);

        const comprasCant = m(comprasProd.reduce((s, c) => s + n(c.cantidad), 0));
        const comprasTotal = m(comprasProd.reduce((s, c) => s + n(c.total), 0));
        const costoCompra = comprasCant > 0 ? m(comprasTotal / comprasCant) : 0;

        const ventasCant = m(ventasProdItems.reduce((s, it) => s + n(it.cantidad), 0));
        const ingresos = m(ventasProdItems.reduce((s, it) => s + n(it.precio) * n(it.cantidad), 0));
        const costoVentaTotal = m(ventasProdItems.reduce((s, it) => s + n(it.costo), 0));
        const precioVenta = ventasCant > 0 ? m(ingresos / ventasCant) : 0;
        

        const stockFinal = this.stock(p.id);
        const costoRef = costoCompra || n(p.costo) || 0;
        const valorInv = m(stockFinal * costoRef);

        return {
          id: p.id, nombre: p.nombre,
          compras: comprasCant, costoCompra,
          ventas: ventasCant, precioVenta,
          ingresos, costo: costoVentaTotal,
          ganancia: m(ingresos - costoVentaTotal),
          stockFinal, valorInv
        };
      });

      const totales = cuadre.reduce((acc, r) => {
        acc.compras += r.compras;
        acc.ventas += r.ventas;
        acc.ingresos += r.ingresos;
        acc.costo += r.costo;
        acc.ganancia += r.ganancia;
        acc.stockFinal += r.stockFinal;
        acc.valorInv += r.valorInv;
        return acc;
      }, { compras: 0, ventas: 0, ingresos: 0, costo: 0, ganancia: 0, stockFinal: 0, valorInv: 0 });

      Object.keys(totales).forEach(k => totales[k] = m(totales[k]));

      this.rep.resultado = {
        ingresos: ing, cogs, bruta, mermas, gastos: gastosTotal,
        neta, numVentas: vp.length,
        margenB: ing > 0 ? ((bruta / ing) * 100).toFixed(1) : '0.0',
        margenN: ing > 0 ? ((neta / ing) * 100).toFixed(1) : '0.0',
        cuadre, totales,
        _fechaI: this.rep.fechaInicio,
        _fechaF: this.rep.fechaFin
      };
    },

    generarPDFCuadre() {
      const r = this.rep.resultado;
      if (!r) return;

      const doc = new jsPDF();

      doc.setFillColor(33, 150, 243);
      doc.rect(0, 0, 210, 25, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text(this.cfg.nombre || 'Tienda Pro', 14, 15);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text('Cuadre: ' + r._fechaI + ' al ' + r._fechaF, 14, 22);

      doc.setTextColor(0, 0, 0);
      autoTable(doc, {
        startY: 32,
        head: [['Resumen', 'Monto']],
        body: [
          ['Ingresos', fmt(r.ingresos)],
          ['Costos (COGS)', '- ' + fmt(r.cogs)],
          ['Ganancia bruta', fmt(r.bruta) + ' (' + r.margenB + '%)'],
          ['Mermas', '- ' + fmt(r.mermas)],
          ['Gastos operativos', '- ' + fmt(r.gastos)],
          ['Ganancia neta', fmt(r.neta) + ' (' + r.margenN + '%)']
        ],
        headStyles: { fillColor: [33, 150, 243], textColor: 255 },
        theme: 'striped'
      });

      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 8,
        head: [['Producto', 'Compras', 'Costo c/u', 'Ventas', 'Precio c/u', 'Ingresos', 'Costo', 'Ganancia', 'Stock', 'Valor']],
        body: r.cuadre.map(row => [
          row.nombre, fmtCant(row.compras), fmt(row.costoCompra),
          fmtCant(row.ventas), fmt(row.precioVenta), fmt(row.costoVenta),
          fmt(row.ingresos), fmt(row.costo), fmt(row.ganancia),
          fmtCant(row.stockFinal), fmt(row.valorInv)
        ]),
        foot: [[
          'TOTAL', fmtCant(r.totales.compras), '', fmtCant(r.totales.ventas), '', '',
          fmt(r.totales.ingresos), fmt(r.totales.costo), fmt(r.totales.ganancia),
          fmtCant(r.totales.stockFinal), fmt(r.totales.valorInv)
        ]],
        styles: { fontSize: 7, cellPadding: 1.5 },
        headStyles: { fillColor: [33, 150, 243], textColor: 255 },
        footStyles: { fillColor: [229, 231, 235], textColor: [17, 24, 39], fontStyle: 'bold' },
        columnStyles: {
          0: { cellWidth: 28 },
          1: { cellWidth: 14, halign: 'right' },
          2: { cellWidth: 16, halign: 'right' },
          3: { cellWidth: 14, halign: 'right' },
          4: { cellWidth: 16, halign: 'right' },
          
          5: { cellWidth: 18, halign: 'right' },
          6: { cellWidth: 16, halign: 'right' },
          7: { cellWidth: 18, halign: 'right' },
          8: { cellWidth: 14, halign: 'right' },
          9: { cellWidth: 18, halign: 'right' }
        }
      });

      const pageCount = doc.internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(120);
        doc.text('Generado: ' + fmtFH(new Date().toISOString()) + ' · Página ' + i + ' de ' + pageCount, 14, 290);
      }

      doc.save('cuadre-' + r._fechaI + '-' + r._fechaF + '.pdf');
      this.toastMsg('PDF generado');
    },

    // ===== SOCIOS =====
    totalPorSocio(sid) {
      return m(this.distribuciones.filter(d => d.socioId === sid).reduce((s, x) => s + n(x.monto), 0));
    },
    resetSocio() {
      this.socioForm = { editId: '', nombre: '', porcentaje: '', aporte: '' };
    },
    async guardarSocio() {
      const f = this.socioForm;
      const nombre = (f.nombre || '').trim();
      const pct = n(f.porcentaje);
      const aporte = n(f.aporte);
      if (!nombre) return this.toastMsg('Nombre obligatorio', 'bad');
      if (pct < 0 || pct > 100) return this.toastMsg('Porcentaje entre 0 y 100', 'bad');
      if (aporte < 0) return this.toastMsg('Aporte invalido', 'bad');
      const dup = this.socios.find(x => x.nombre.toLowerCase() === nombre.toLowerCase() && x.id !== f.editId);
      if (dup) return this.toastMsg('Ya existe ese socio', 'bad');
      if (f.editId) {
        const o = this.socios.find(x => x.id === f.editId);
        await P(db.socios, Object.assign({}, o, { nombre, porcentaje: pct, aporte }));
        this.toastMsg('Socio actualizado');
      } else {
        await P(db.socios, { id: genId('so'), nombre, porcentaje: pct, aporte, fecha: new Date().toISOString(), activo: true });
        this.toastMsg('Socio agregado');
      }
      this.resetSocio();
      await this.recargar(['socios']);
    },
    editarSocio(id) {
      const s = this.socios.find(x => x.id === id);
      if (!s) return;
      this.socioForm = { editId: id, nombre: s.nombre, porcentaje: String(s.porcentaje || ''), aporte: String(s.aporte || '') };
      window.scrollTo(0, 0);
    },
    eliminarSocio(id) {
      const s = this.socios.find(x => x.id === id);
      if (!s) return;
      this.confirm = {
        activo: true, titulo: 'Eliminar socio',
        msg: 'Eliminar a "' + s.nombre + '"? Las distribuciones previas se conservan.',
        onOk: async () => {
          await db.socios.delete(id);
          await this.recargar(['socios']);
          this.toastMsg('Socio eliminado');
        }
      };
    },
    repartirGanancia() {
      const monto = n(this.repartoForm.monto);
      const concepto = (this.repartoForm.concepto || '').trim() || 'Reparto de ganancia';
      if (monto <= 0) return this.toastMsg('Monto invalido', 'bad');
      if (!this.sociosActivos.length) return this.toastMsg('Sin socios activos', 'bad');
      if (monto > this.gananciaDisponible + 0.01) return this.toastMsg('Maximo ' + fmt(this.gananciaDisponible), 'bad');
      if (Math.abs(this.sumaPorcentajes - 100) > 0.01) return this.toastMsg('Los porcentajes deben sumar 100% (actual: ' + this.sumaPorcentajes + '%)', 'bad');
      this.pedirPin(async () => {
        try {
          const dists = this.sociosActivos.map(s => ({
            id: genId('di'),
            fecha: new Date().toISOString(),
            socioId: s.id,
            socioNombre: s.nombre,
            montoTotal: monto,
            monto: m(monto * n(s.porcentaje) / 100),
            porcentaje: n(s.porcentaje),
            concepto
          }));
          await db.transaction('rw', db.distribuciones, db.retiros, async () => {
            await db.distribuciones.bulkPut(dists.map(x => clean(x)));
            await P(db.retiros, {
              id: genId('r'),
              fecha: new Date().toISOString(),
              monto,
              concepto: 'Reparto a socios: ' + concepto,
              socios: dists.map(d => ({ socioId: d.socioId, nombre: d.socioNombre, monto: d.monto }))
            });
          });
          await this.recargar(['distribuciones', 'retiros']);
          this.repartoForm = { monto: '', concepto: '' };
          this.toastMsg('Repartido ' + fmt(monto));
        } catch (e) { this.toastMsg(e.message, 'bad'); }
      });
    },

    // ===== COMPARTIR EXISTENCIA (NUEVO) =====
    async compartirExistencia() {
      const lineas = this.productos
        .filter(p => !p.archivado)
        .map(p => p.nombre + ': ' + fmtCant(this.stock(p.id)));

      if (lineas.length === 0) return this.toastMsg('No hay productos', 'warn');

      const texto = (this.cfg.nombre || 'Tienda Pro') + '\nExistencia al ' + fmtFecha(new Date().toISOString()) + '\n\n' + lineas.join('\n');

      if (navigator.share) {
        try {
          await navigator.share({ title: 'Existencia', text: texto });
        } catch (e) { /* cancelado */ }
      } else {
        try {
          await navigator.clipboard.writeText(texto);
          this.toastMsg('Copiado al portapapeles');
        } catch (e) {
          this.toastMsg('No se pudo compartir', 'warn');
        }
      }
    },

    // ===== DATOS / BACKUP =====
    exportar() {
      const d = buildData(this);
      this.descargar(new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' }), 'respaldo-tienda-' + new Date().toISOString().split('T')[0] + '.json');
      this.cfg.ultimoExport = new Date().toISOString();
      this.guardarCfg();
      this.toastMsg('Respaldo descargado');
    },

    triggerImport() {
      const el = document.getElementById('impFile');
      if (el) el.click();
    },

    onImportFile(e) {
      const file = e.target.files[0];
      if (!file) return;
      this.importFile = file;
      e.target.value = '';
      this.confirm = { activo: true, titulo: 'Importar datos', msg: 'Esto REEMPLAZARÁ todos los datos actuales. ¿Continuar?', onOk: () => this.ejecutarImport() };
    },

    ejecutarImport() {
      const file = this.importFile;
      if (!file) return;
      const rd = new FileReader();
      rd.onload = async (ev) => {
        try {
          const d = JSON.parse(ev.target.result);
          if (!d.productos && !d.ventas) throw new Error('Archivo inválido');
          await this.importarData(d);
          this.ajustesAbierto = false;
          this.toastMsg('Datos importados');
        } catch (e) { this.toastMsg('Error: ' + e.message, 'bad'); }
      };
      rd.readAsText(file);
    },

    async importarData(d) {
      const tables = ['productos', 'lotes', 'ventas', 'compras', 'ajustes', 'arqueos', 'movCaja', 'cierres', 'capital', 'retiros', 'socios', 'distribuciones'];
      await db.transaction('rw', tables.concat(['config']), async () => {
        for (const t of tables) {
          await db.table(t).clear();
          if (Array.isArray(d[t])) await db.table(t).bulkPut(clean(d[t]));
        }
        if (d.cfg) await P(db.config, { key: 'cfg', value: d.cfg });
      });
      if (d.cfg) this.cfg = Object.assign({}, this.cfg, d.cfg);
      await this.recargarTodo();
    },

    async restaurarBackupAuto() {
      if (!this.ultimoBackup) return;
      this.confirm = {
        activo: true, titulo: 'Restaurar backup',
        msg: '¿Reemplazar los datos con el backup automático del ' + fmtFH(this.ultimoBackup.fecha) + '?',
        onOk: async () => {
          await this.importarData(this.ultimoBackup.value);
          this.ajustesAbierto = false;
          this.toastMsg('Backup restaurado');
        }
      };
    },

    descargar(blob, name) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
    },

    // ===== SEGURIDAD =====
    pedirPin(cb) {
      if (!this.cfg.pinActivo) { cb(); return; }
      this.prompt = {
        activo: true, titulo: 'PIN de seguridad', msg: 'Ingresa tu PIN',
        placeholder: '••••', type: 'password', value: '',
        onOk: v => { if (v === this.cfg.pin) cb(); else this.toastMsg('PIN incorrecto', 'bad'); }
      };
    },

    okConfirm() { const cb = this.confirm.onOk; this.confirm.activo = false; if (cb) cb(); },
    okPrompt() { const cb = this.prompt.onOk; const v = this.prompt.value; this.prompt.activo = false; if (cb) cb(v); },
    cancelPrompt() { this.prompt.activo = false; },

    // ===== PERSISTENCIA =====
    async guardarCfg() {
      try { await P(db.config, { key: 'cfg', value: this.cfg }); } catch (e) { console.error('guardarCfg', e); }
    },

    async recargar(what) {
      const map = {
        productos: () => db.productos.toArray(),
        lotes: () => db.lotes.toArray(),
        ventas: () => db.ventas.toArray(),
        compras: () => db.compras.toArray(),
        ajustes: () => db.ajustes.toArray(),
        arqueos: () => db.arqueos.toArray(),
        movCaja: () => db.movCaja.toArray(),
        cierres: () => db.cierres.toArray(),
        capital: () => db.capital.toArray(),
        retiros: () => db.retiros.toArray(),
        socios: () => db.socios.toArray(),
        distribuciones: () => db.distribuciones.toArray()
      };
      for (const w of what) this[w] = await map[w]();
    },

    async recargarTodo() {
      const r = await Promise.all([
        db.productos.toArray(), db.lotes.toArray(), db.ventas.toArray(),
        db.compras.toArray(), db.ajustes.toArray(), db.arqueos.toArray(),
        db.movCaja.toArray(), db.cierres.toArray(), db.capital.toArray(), db.retiros.toArray(),
        db.socios.toArray(), db.distribuciones.toArray()
      ]);
      ['productos', 'lotes', 'ventas', 'compras', 'ajustes', 'arqueos', 'movCaja', 'cierres', 'capital', 'retiros', 'socios', 'distribuciones'].forEach((k, i) => this[k] = r[i]);
    },

    // ===== CHART =====
    renderChart() {
      try {
        const cv = document.getElementById('chartVentas');
        if (!cv) return;
        if (this._chart) { try { this._chart.destroy(); } catch (e) {} this._chart = null; }
        const meses = [];
        const now = new Date();
        for (let i = 5; i >= 0; i--) {
          const f = new Date(now.getFullYear(), now.getMonth() - i, 1);
          meses.push({ m: f.getMonth(), y: f.getFullYear(), label: f.toLocaleDateString('es', { month: 'short' }), v: 0, g: 0 });
        }
        this.ventas.filter(x => !x.anulada).forEach(v => {
          const f = new Date(v.fecha);
          const me = meses.find(x => x.m === f.getMonth() && x.y === f.getFullYear());
          if (me) { me.v += n(v.total); me.g += n(v.ganancia); }
        });
        const dark = this.cfg.tema === 'dark';
        const txt = dark ? '#94a3b8' : '#6b7280', grid = dark ? '#334155' : '#e5e7eb';
        this._chart = new Chart(cv.getContext('2d'), {
          type: 'bar',
          data: {
            labels: meses.map(m => m.label),
            datasets: [
              { label: 'Ventas', data: meses.map(m => m.v), backgroundColor: '#2196F3', borderRadius: 4 },
              { label: 'Ganancia', data: meses.map(m => m.g), backgroundColor: '#16a34a', borderRadius: 4 }
            ]
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            animation: { duration: 500 },
            plugins: {
              legend: { position: 'bottom', labels: { color: txt, boxWidth: 12, font: { size: 10 } } },
              tooltip: { callbacks: { label: c => ' ' + c.dataset.label + ': ' + fmt(c.raw) } }
            },
            scales: {
              x: { ticks: { color: txt, font: { size: 9 } }, grid: { display: false } },
              y: { beginAtZero: true, ticks: { color: txt, font: { size: 9 }, callback: v => '$' + v.toLocaleString() }, grid: { color: grid } }
            }
          }
        });
      } catch (e) { console.error('renderChart', e); }
    },

    // ===== BACKUP AUTO =====
    async backupAuto() {
      try {
        const data = buildData(this);
        await P(db.config, { key: 'backupAuto', value: data, fecha: new Date().toISOString() });
      } catch (e) {}
    },

    aplicarUpdate() {
      if (this._swWaiting) {
        this._aplicando = true;
        try { this._swWaiting.postMessage('SKIP_WAITING'); } catch (e) {}
      }
    },

    // ===== INICIALIZACIÓN =====
    async inicializar() {
      try {
        const c = await db.config.get('cfg');
        if (c) this.cfg = Object.assign({}, this.cfg, c.value);
        else await this.guardarCfg();
        try { document.documentElement.setAttribute('data-theme', this.cfg.tema); } catch (e) {}
        this.capInicialStr = String(this.cfg.capitalInicial || '');
        await this.recargarTodo();
        const b = await db.config.get('backupAuto');
        if (b) this.ultimoBackup = b;
        const ahora = Date.now();
        if (!this.cfg.ultimoBackupAuto || (ahora - this.cfg.ultimoBackupAuto) > 86400000) {
          await this.backupAuto();
          this.cfg.ultimoBackupAuto = ahora;
          await this.guardarCfg();
          const b2 = await db.config.get('backupAuto');
          if (b2) this.ultimoBackup = b2;
        }
        const hash = location.hash.slice(1);
        const valid = ['dashboard', 'ventas', 'compras', 'productos', 'inventario', 'caja', 'patrimonio', 'reportes', 'socios'];
        if (valid.includes(hash)) this.sec = hash;
      } catch (e) {
        console.error(e);
        this.toastMsg('Error al cargar datos', 'bad');
      } finally {
        this.cargando = false;
        this.$nextTick(() => { if (this.sec === 'dashboard') requestAnimationFrame(() => this.renderChart()); });
      }
    }
  },

  watch: {
    carrito: {
      handler(val) {
        try { localStorage.setItem('carritoPro', JSON.stringify(val)); } catch (e) {}
      },
      deep: true
    },
    'cfg.tema'(t) {
      try { document.documentElement.setAttribute('data-theme', t); } catch (e) {}
      if (this.sec === 'dashboard') this.$nextTick(() => requestAnimationFrame(() => this.renderChart()));
    },
    sec(s) {
      if (s === 'dashboard') this.$nextTick(() => requestAnimationFrame(() => this.renderChart()));
    }
  },

  mounted() {
    this.inicializar();
    window.addEventListener('online', () => this.online = true);
    window.addEventListener('offline', () => this.online = false);
    window.addEventListener('popstate', e => { this.sec = (e.state && e.state.sec) || 'dashboard'; });
    window.addEventListener('resize', () => { if (this.sec === 'dashboard') this.renderChart(); });
  }
};

// Necesitamos h para el componente icon
import { h } from 'vue';
</script>
