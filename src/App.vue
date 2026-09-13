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
            <button class="quick-btn" @click="ir('gastos')"><icon name="dollar" :size="22"></icon>Registrar Gasto</button>
            <button class="quick-btn" @click="ir('caja')"><icon name="wallet" :size="22"></icon>Arqueo de Caja</button>
            <button class="quick-btn" @click="ir('contabilidad')"><icon name="chart" :size="22"></icon>Contabilidad</button>
            <button class="quick-btn" @click="ir('inventario')"><icon name="package" :size="22"></icon>Inventario</button>
          </div>
        </div>

        <div class="card" v-if="anomalias.length">
          <div class="card-title">
            <icon name="alert" :size="18" :color="anomaliasCriticas > 0 ? '#dc2626' : '#d97706'"></icon>
            Anomalias ({{ anomalias.length }})
            <span v-if="anomaliasCriticas > 0" class="badge out" style="margin-left:auto">{{ anomaliasCriticas }} criticas</span>
          </div>
          <div v-for="(a, i) in anomalias.slice(0, 5)" :key="i" class="item" style="cursor:pointer" @click="ir(a.sec)">
            <div class="info">
              <div class="nm">
                <span class="badge" :class="a.nivel === 'alta' ? 'out' : (a.nivel === 'media' ? 'low' : 'arch')" style="margin-right:.3rem">{{ a.nivel.toUpperCase() }}</span>
                {{ a.titulo }}
              </div>
              <div class="det">{{ a.detalle }}</div>
            </div>
            <icon name="chevron" :size="14" :color="mutColor" style="transform:rotate(-90deg)"></icon>
          </div>
          <div v-if="anomalias.length > 5" class="det" style="text-align:center;margin-top:.4rem;font-size:.72rem;color:var(--mut)">
            + {{ anomalias.length - 5 }} mas
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
          <div v-for="c in cierresOrdenados" :key="c.id" class="item" style="flex-direction:column;align-items:stretch;gap:.3rem">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:.5rem">
              <div class="nm">{{ c.periodo }}</div>
              <b :class="c.ganancia >= 0 ? 'pos' : 'neg'">{{ fmt(c.ganancia) }}</b>
            </div>
            <div class="det" style="font-size:.72rem">
              Cerrado {{ fmtFecha(c.fechaCierre) }}
              <span v-if="c.numVentas !== undefined"> · {{ c.numVentas }} venta(s)</span>
            </div>
            <div v-if="c.cogs !== undefined" style="display:grid;grid-template-columns:1fr 1fr;gap:.2rem;font-size:.7rem;margin-top:.2rem">
              <div style="color:var(--mut)">Ventas: <b style="color:var(--ok)">{{ fmt(c.totalVentas) }}</b></div>
              <div style="color:var(--mut)">COGS: <b style="color:var(--bad)">-{{ fmt(c.cogs) }}</b></div>
              <div style="color:var(--mut)">Gastos: <b style="color:var(--bad)">-{{ fmt(c.gastos) }}</b></div>
              <div style="color:var(--mut)">Mermas: <b style="color:var(--bad)">-{{ fmt(c.mermas) }}</b></div>
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
              @click="setHoy()">Hoy</button>
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
                    <th>Detalle</th>
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
                  <template v-for="r in rep.resultado.cuadre" :key="r.id">
                    <tr class="product-row">
                      <td><b>{{ r.nombre }}</b></td>
                      <td class="det-cell">—</td>
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
                    <tr v-for="(sf, i) in r.subfilas" :key="r.id + '_' + i" class="sub-row">
                      <td></td>
                      <td class="det-cell">↳ {{ fmt(sf.costo) }}{{ sf.precio !== null ? ' → ' + fmt(sf.precio) : ' (sin ventas)' }}</td>
                      <td>{{ sf.comprasCant ? fmtCant(sf.comprasCant) : '—' }}</td>
                      <td>{{ fmt(sf.costo) }}</td>
                      <td>{{ sf.cantVend ? fmtCant(sf.cantVend) : '—' }}</td>
                      <td>{{ sf.precio !== null ? fmt(sf.precio) : '—' }}</td>
                      <td class="pos">{{ sf.ingresos ? fmt(sf.ingresos) : '—' }}</td>
                      <td class="neg">{{ sf.costoVend ? fmt(sf.costoVend) : '—' }}</td>
                      <td :class="sf.ganancia >= 0 ? 'pos' : 'neg'">{{ sf.ganancia ? fmt(sf.ganancia) : '—' }}</td>
                      <td>{{ fmtCant(sf.stockActual) }}</td>
                      <td>{{ fmt(sf.valorActual) }}</td>
                    </tr>
                  </template>
                  <tr class="total-row">
                    <td>TOTAL</td>
                    <td></td>
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

            <!-- Reparto entre socios -->
            <div v-if="sociosActivos.length" style="margin-top:1.2rem">
              <div class="card-title"><icon name="users" :size="18"></icon> Reparto entre socios</div>
              <div class="info-box" style="margin-bottom:.5rem">
                Ganancia neta del periodo: <b>{{ fmt(rep.resultado.neta) }}</b>
              </div>
              <div v-for="s in sociosActivos" :key="s.id" class="row">
                <span>{{ s.nombre }} ({{ n(s.porcentaje).toFixed(2) }}%)</span>
                <b :class="(rep.resultado.neta * n(s.porcentaje) / 100) >= 0 ? 'pos' : 'neg'">
                  {{ fmt(rep.resultado.neta * n(s.porcentaje) / 100) }}
                </b>
              </div>
            </div>
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
      <!-- ==================== GASTOS ==================== -->
      <section v-show="sec === 'gastos'" class="fade-up">
        <div class="balance neg">
          <div class="lbl"><icon name="dollar" :size="14" color="#fff"></icon> Gastos del periodo</div>
          <div class="val">{{ fmt(gastosOpPeriodo) }}</div>
          <div class="sub">Acumulado: {{ fmt(gastosTotalAcumulado) }} · {{ gastos.length }} registro(s)</div>
        </div>

        <div class="card">
          <div class="card-title"><icon name="plus" :size="18" :color="sec === 'gastos' ? '#2196F3' : mutColor"></icon> {{ gastoForm.editId ? 'Editar' : 'Registrar' }} Gasto</div>
          <div class="grid2">
            <input v-model="gastoForm.fecha" type="date">
            <select v-model="gastoForm.categoria">
              <option value="">Categoria...</option>
              <option value="Luz">Luz</option>
              <option value="Agua">Agua</option>
              <option value="Alquiler">Alquiler</option>
              <option value="Internet">Internet</option>
              <option value="Transporte">Transporte</option>
              <option value="Publicidad">Publicidad</option>
              <option value="Mantenimiento">Mantenimiento</option>
              <option value="Limpieza">Limpieza</option>
              <option value="Otros">Otros</option>
            </select>
          </div>
          <input v-model="gastoForm.concepto" type="text" placeholder="Concepto (ej: Recibo de luz agosto)">
          <div class="grid2">
            <input v-model="gastoForm.monto" type="number" inputmode="decimal" step="0.01" placeholder="Monto">
            <select v-model="gastoForm.metodoPago">
              <option value="efectivo">Efectivo</option>
              <option value="transferencia">Transferencia</option>
              <option value="tarjeta">Tarjeta</option>
              <option value="otro">Otro</option>
            </select>
          </div>
          <input v-model="gastoForm.nota" type="text" placeholder="Nota (opcional)">
          <div class="set-row">
            <span class="lbl"><icon name="wallet" :size="18"></icon> Sale de caja</span>
            <label class="switch">
              <input type="checkbox" v-model="gastoForm.saleDeCaja">
              <span class="slider"></span>
            </label>
          </div>
          <button class="btn warn" @click="guardarGasto()">
            <icon name="check" :size="16" color="#fff"></icon>
            {{ gastoForm.editId ? 'Actualizar' : 'Registrar Gasto' }}
          </button>
          <button v-if="gastoForm.editId" class="btn ghost" @click="resetGasto()">Cancelar</button>
        </div>

        <div class="card" v-if="gastosPorCategoria.length">
          <div class="card-title"><icon name="chart" :size="18" :color="sec === 'gastos' ? '#2196F3' : mutColor"></icon> Por categoria (acumulado)</div>
          <div v-for="g in gastosPorCategoria" :key="g.cat" class="row">
            <span>{{ g.cat }}</span>
            <b class="neg">{{ fmt(g.monto) }}</b>
          </div>
        </div>

        <div class="card">
          <div class="card-title"><icon name="list" :size="18" :color="sec === 'gastos' ? '#2196F3' : mutColor"></icon> Historial</div>
          <div v-if="gastosOrdenados.length === 0" class="empty">Sin gastos registrados</div>
          <div v-for="g in gastosOrdenados" :key="g.id" class="item">
            <div class="info">
              <div class="nm">{{ g.categoria }} · {{ g.concepto }}</div>
              <div class="det">{{ fmtFH(g.fecha) }} · {{ g.metodoPago || 'efectivo' }}{{ g.saleDeCaja ? ' · Caja' : ' · Sin caja' }}{{ g.nota ? ' · ' + g.nota : '' }}</div>
            </div>
            <div class="act-btns">
              <b class="neg">-{{ fmt(g.monto) }}</b>
              <button class="icon-btn" @click="editarGasto(g.id)" aria-label="Editar">
                <icon name="edit" :size="15" :color="txtColor"></icon>
              </button>
              <button class="icon-btn bad" @click="eliminarGasto(g.id)" aria-label="Eliminar">
                <icon name="trash" :size="15" color="#dc2626"></icon>
              </button>
            </div>
          </div>
        </div>
      </section>
      <!-- ==================== CONTABILIDAD ==================== -->
      <section v-show="sec === 'contabilidad'" class="fade-up">
        <div class="balance azul">
          <div class="lbl"><icon name="chart" :size="14" color="#fff"></icon> Resultado del periodo</div>
          <div class="val" :style="gananciaNetaPeriodo >= 0 ? '' : 'color:#fca5a5'">{{ fmt(gananciaNetaPeriodo) }}</div>
          <div class="sub">Margen neto: {{ margenNetoPct }}% · Margen bruto: {{ margenBrutoPct }}%</div>
        </div>

        <div class="card">
          <div class="card-title"><icon name="chart" :size="18" :color="sec === 'contabilidad' ? '#2196F3' : mutColor"></icon> Balance de situacion</div>
          <div class="row"><span>Activos (Caja + Inventario)</span><b class="pos">{{ fmt(activosTotal) }}</b></div>
          <div class="row" style="padding-left:1rem;font-size:.78rem"><span>Caja</span><span>{{ fmt(saldoCaja) }}</span></div>
          <div class="row" style="padding-left:1rem;font-size:.78rem"><span>Inventario</span><span>{{ fmt(valorInventario) }}</span></div>
          <div class="row"><span>Pasivos</span><b>{{ fmt(pasivosTotal) }}</b></div>
          <div class="row total"><span>= ACTIVO NETO</span><span>{{ fmt(activosTotal - pasivosTotal) }}</span></div>
          <div class="row" style="margin-top:.5rem"><span>Capital</span><span class="pos">{{ fmt(capitalTotal) }}</span></div>
          <div class="row"><span>Ganancias acumuladas</span><span class="pos">{{ fmt(gananciasAcumuladas) }}</span></div>
          <div class="row"><span>Retiros</span><span class="neg">-{{ fmt(retirosTotal) }}</span></div>
          <div class="row total"><span>= PATRIMONIO</span><span>{{ fmt(patrimonioTotal - retirosTotal + 0) }}</span></div>
        </div>

        <div class="card">
          <div class="card-title"><icon name="file" :size="18" :color="sec === 'contabilidad' ? '#2196F3' : mutColor"></icon> Estado de resultados</div>
          <div class="row"><span>Ingresos por ventas</span><b class="pos">{{ fmt(ventasContadoTotal) }}</b></div>
          <div class="row"><span>(-) Costo de lo vendido</span><b class="neg">{{ fmt(-1 * m(ventasContadoTotal - gananciaBrutaPeriodo)) }}</b></div>
          <div class="row total"><span>= GANANCIA BRUTA</span><span>{{ fmt(gananciaBrutaPeriodo) }} <span style="font-weight:400;font-size:.78rem">({{ margenBrutoPct }}%)</span></span></div>
          <div class="row" style="margin-top:.5rem"><span>(-) Gastos operativos</span><span class="neg">-{{ fmt(gastosOpPeriodo) }}</span></div>
          <div class="row"><span>(-) Mermas</span><span class="neg">-{{ fmt(this.ajustes.filter(a => a.cantidad < 0 && new Date(a.fecha) >= new Date(cfg.periodoInicio)).reduce((s,a) => s + n(a.costoPerdida), 0)) }}</span></div>
          <div class="row total"><span>= GANANCIA NETA</span>
            <span :class="gananciaNetaPeriodo >= 0 ? 'pos' : 'neg'">{{ fmt(gananciaNetaPeriodo) }} <span style="font-weight:400;font-size:.78rem">({{ margenNetoPct }}%)</span></span>
          </div>
        </div>

        <div class="card">
          <div class="card-title"><icon name="dollar" :size="18" :color="sec === 'contabilidad' ? '#2196F3' : mutColor"></icon> Balance general</div>
          <div class="info-box" style="margin-bottom:.6rem;font-size:.72rem">
            Activo = Pasivo + Patrimonio
          </div>
          <div class="row" style="font-weight:800;color:var(--pri)"><span>ACTIVOS</span><span>{{ fmt(activosTotal) }}</span></div>
          <div class="row" style="padding-left:1rem;font-size:.78rem"><span>Caja</span><span>{{ fmt(saldoCaja) }}</span></div>
          <div class="row" style="padding-left:1rem;font-size:.78rem"><span>Inventario</span><span>{{ fmt(valorInventario) }}</span></div>
          <div class="row" style="font-weight:800;color:var(--pri);margin-top:.5rem"><span>PASIVOS</span><span>{{ fmt(pasivosTotal) }}</span></div>
          <div class="row" style="padding-left:1rem;font-size:.78rem"><span>Sin deudas registradas</span><span>{{ fmt(0) }}</span></div>
          <div class="row" style="font-weight:800;color:var(--pri);margin-top:.5rem"><span>PATRIMONIO</span><span>{{ fmt(capitalTotal + gananciasAcumuladas - retirosTotal) }}</span></div>
          <div class="row" style="padding-left:1rem;font-size:.78rem"><span>Capital</span><span>{{ fmt(capitalTotal) }}</span></div>
          <div class="row" style="padding-left:1rem;font-size:.78rem"><span>Ganancias acumuladas</span><span>{{ fmt(gananciasAcumuladas) }}</span></div>
          <div class="row" style="padding-left:1rem;font-size:.78rem"><span>Retiros</span><span class="neg">-{{ fmt(retirosTotal) }}</span></div>
          <div class="row total"><span>= PASIVO + PATRIMONIO</span><span>{{ fmt(pasivosTotal + capitalTotal + gananciasAcumuladas - retirosTotal) }}</span></div>
        </div>

        <div class="card">
          <div class="card-title"><icon name="wallet" :size="18" :color="sec === 'contabilidad' ? '#2196F3' : mutColor"></icon> Flujo de caja</div>
          <div class="row" style="font-weight:800;color:var(--ok)"><span>ENTRADAS</span><span>+{{ fmt(flujoEntradas) }}</span></div>
          <div class="row" style="padding-left:1rem;font-size:.78rem"><span>Ventas al contado</span><span>{{ fmt(ventasContadoTotal) }}</span></div>
          <div class="row" style="padding-left:1rem;font-size:.78rem"><span>Aportes de capital</span><span>{{ fmt(aportesTotal) }}</span></div>
          <div class="row" style="padding-left:1rem;font-size:.78rem"><span>Sobrantes de arqueo</span><span>{{ fmt(this.movCaja.filter(mv => mv.tipo === 'ingreso' && mv.concepto && mv.concepto.includes('Sobrante')).reduce((s,mv) => s + n(mv.monto), 0)) }}</span></div>
          <div class="row" style="font-weight:800;color:var(--bad);margin-top:.5rem"><span>SALIDAS</span><span>-{{ fmt(flujoSalidas) }}</span></div>
          <div class="row" style="padding-left:1rem;font-size:.78rem"><span>Compras de mercancia</span><span>{{ fmt(comprasTotal) }}</span></div>
          <div class="row" style="padding-left:1rem;font-size:.78rem"><span>Gastos operativos</span><span>{{ fmt(gastosTotalAcumulado) }}</span></div>
          <div class="row" style="padding-left:1rem;font-size:.78rem"><span>Retiros</span><span>{{ fmt(retirosTotal) }}</span></div>
          <div class="row" style="padding-left:1rem;font-size:.78rem"><span>Faltantes de arqueo</span><span>{{ fmt(this.movCaja.filter(mv => mv.tipo === 'egreso' && mv.concepto && mv.concepto.includes('Faltante')).reduce((s,mv) => s + n(mv.monto), 0)) }}</span></div>
          <div class="row total"><span>= FLUJO NETO</span>
            <span :class="flujoNeto >= 0 ? 'pos' : 'neg'">{{ fmt(flujoNeto) }}</span>
          </div>
        </div>

        <div class="card">
          <div class="card-title"><icon name="calendar" :size="18" :color="sec === 'contabilidad' ? '#2196F3' : mutColor"></icon> Cierres contables</div>
          <div style="font-size:.82rem;color:var(--mut);margin-bottom:.5rem">
            Periodo actual: desde {{ fmtFecha(cfg.periodoInicio) }}
          </div>
          <div class="row"><span>Ventas acumuladas</span><b>{{ fmt(ventasPeriodo) }}</b></div>
          <div class="row"><span>Ganancia del periodo</span>
            <b :class="gananciaNetaPeriodo >= 0 ? 'pos' : 'neg'">{{ fmt(gananciaNetaPeriodo) }}</b>
          </div>
          <div class="row"><span>Cierres registrados</span><b>{{ cierres.length }}</b></div>
          <button class="btn warn" style="margin-top:.5rem" @click="ir('reportes')">
            <icon name="calendar" :size="16" color="#fff"></icon> Ir a cerrar periodo
          </button>
        </div>

        <div class="card">
          <div class="card-title"><icon name="list" :size="18" :color="sec === 'contabilidad' ? '#2196F3' : mutColor"></icon> Historial de cierres</div>
          <div v-if="cierres.length === 0" class="empty">Sin cierres registrados</div>
          <div v-for="c in cierresOrdenados" :key="c.id" class="item" style="flex-direction:column;align-items:stretch;gap:.3rem">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:.5rem">
              <div class="nm">{{ c.periodo }}</div>
              <b :class="c.ganancia >= 0 ? 'pos' : 'neg'">{{ fmt(c.ganancia) }}</b>
            </div>
            <div class="det" style="font-size:.72rem">
              Cerrado {{ fmtFecha(c.fechaCierre) }}
              <span v-if="c.numVentas !== undefined"> · {{ c.numVentas }} venta(s)</span>
            </div>
            <div v-if="c.cogs !== undefined" style="display:grid;grid-template-columns:1fr 1fr;gap:.2rem;font-size:.7rem;margin-top:.2rem">
              <div style="color:var(--mut)">Ventas: <b style="color:var(--ok)">{{ fmt(c.totalVentas) }}</b></div>
              <div style="color:var(--mut)">COGS: <b style="color:var(--bad)">-{{ fmt(c.cogs) }}</b></div>
              <div style="color:var(--mut)">Gastos: <b style="color:var(--bad)">-{{ fmt(c.gastos) }}</b></div>
              <div style="color:var(--mut)">Mermas: <b style="color:var(--bad)">-{{ fmt(c.mermas) }}</b></div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-title"><icon name="file" :size="18" :color="sec === 'contabilidad' ? '#2196F3' : mutColor"></icon> Libro diario ({{ asientosFiltrados.length }})</div>
          <div class="grid2" style="margin-bottom:.5rem">
            <input v-model="filtroAsientoInicio" type="date">
            <input v-model="filtroAsientoFin" type="date">
          </div>
          <div class="grid2" style="margin-bottom:.5rem">
            <button class="btn ghost" style="margin-bottom:0;font-size:.72rem" @click="filtroAsientoInicio = filtroAsientoFin = new Date().toISOString().split('T')[0]">Hoy</button>
            <button class="btn ghost" style="margin-bottom:0;font-size:.72rem" @click="setMesAsientos()">Este mes</button>
          </div>
          <div class="grid2" style="margin-bottom:.5rem">
            <select v-model="filtroAsientoCuenta" style="font-size:.75rem">
              <option value="">Todas las cuentas</option>
              <option v-for="c in cuentasLista" :key="c" :value="c">{{ c }}</option>
            </select>
            <select v-model="filtroAsientoTipo" style="font-size:.75rem">
              <option value="">Todos los tipos</option>
              <option value="venta">Ventas</option>
              <option value="costo">Costo venta</option>
              <option value="compra">Compras</option>
              <option value="gasto">Gastos</option>
              <option value="merma">Mermas</option>
              <option value="retiro">Retiros</option>
              <option value="aporte">Aportes</option>
              <option value="arqueo">Arqueos</option>
            </select>
          </div>
          <button class="btn warn" style="margin-bottom:.5rem;font-size:.72rem" @click="regenerarAsientos()">
            <icon name="refresh" :size="14" color="#fff"></icon> Regenerar todos los asientos
          </button>

          <div v-if="asientosFiltrados.length === 0" class="empty">Sin asientos en el rango</div>
          <div v-else style="overflow-x:auto">
            <table class="cuadre-table" style="font-size:.7rem">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th style="text-align:left">Descripcion</th>
                  <th style="text-align:left">Debe</th>
                  <th style="text-align:left">Haber</th>
                  <th>Monto</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="a in asientosFiltrados" :key="a.id">
                  <td>{{ fmtFecha(a.fecha) }}</td>
                  <td style="text-align:left">{{ a.descripcion }}</td>
                  <td class="pos" style="text-align:left;font-size:.68rem">{{ a.cuentaDebe }}</td>
                  <td class="neg" style="text-align:left;font-size:.68rem">{{ a.cuentaHaber }}</td>
                  <td>{{ fmt(a.monto) }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div v-if="balanzaPorCuenta.length" style="margin-top:1rem">
            <div class="card-title" style="margin-top:0"><icon name="chart" :size="18"></icon> Balanza de comprobacion</div>
            <div class="row" style="font-weight:800;font-size:.78rem"><span>Cuenta</span><span style="display:flex;gap:1.5rem"><span>Debe</span><span>Haber</span></span></div>
            <div v-for="b in balanzaPorCuenta" :key="b.cuenta" class="row" style="font-size:.72rem">
              <span>{{ b.cuenta }}</span>
              <span style="display:flex;gap:1.5rem"><span class="pos">{{ fmt(b.debe) }}</span><span class="neg">{{ fmt(b.haber) }}</span></span>
            </div>
            <div class="row total">
              <span>TOTALES</span>
              <span style="display:flex;gap:1.5rem"><span>{{ fmt(totalDebe) }}</span><span>{{ fmt(totalHaber) }}</span></span>
            </div>
            <div class="det" style="font-size:.7rem;text-align:center;margin-top:.3rem"
              :style="Math.abs(totalDebe - totalHaber) < 0.01 ? 'color:var(--ok)' : 'color:var(--bad)'">
              {{ Math.abs(totalDebe - totalHaber) < 0.01 ? 'OK: Cuadra' : 'DESCUADRE: ' + fmt(Math.abs(totalDebe - totalHaber)) }}
            </div>
          </div>
        </div>

      </section>

    </main>

    <!-- ==================== BOTTOM NAV ==================== -->
    <nav class="nav no-print">
      <button :class="{ activo: sec === 'dashboard' }" @click="ir('dashboard')" style="position:relative">
        <icon name="home" :size="22" :color="sec === 'dashboard' ? '#2196F3' : '#6b7280'"></icon><span>Inicio</span>
        <span v-if="anomaliasCriticas > 0" class="nav-dot"></span>
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
      <div class="sheet-group">Operaciones</div>
      <div class="sheet-grid">
        <button class="sheet-btn" :class="{ activo: sec === 'productos' }" @click="ir('productos')"><icon name="tag" :size="22"></icon>Productos</button>
        <button class="sheet-btn" :class="{ activo: sec === 'inventario' }" @click="ir('inventario')"><icon name="package" :size="22"></icon>Inventario</button>
        <button class="sheet-btn" :class="{ activo: sec === 'compras' }" @click="ir('compras')"><icon name="bag" :size="22"></icon>Compras</button>
        <button class="sheet-btn" :class="{ activo: sec === 'gastos' }" @click="ir('gastos')"><icon name="dollar" :size="22"></icon>Gastos</button>
      </div>

      <div class="sheet-group">Finanzas y reportes</div>
      <div class="sheet-grid">
        <button class="sheet-btn" :class="{ activo: sec === 'contabilidad' }" @click="ir('contabilidad')"><icon name="chart" :size="22"></icon>Contabilidad</button>
        <button class="sheet-btn" :class="{ activo: sec === 'socios' }" @click="ir('socios')"><icon name="users" :size="22"></icon>Socios</button>
        <button class="sheet-btn" :class="{ activo: sec === 'patrimonio' }" @click="ir('patrimonio')"><icon name="dollar" :size="22"></icon>Patrimonio</button>
        <button class="sheet-btn" :class="{ activo: sec === 'reportes' }" @click="ir('reportes')"><icon name="file" :size="22"></icon>Reportes</button>
      </div>

      <div class="sheet-group">Sistema</div>
      <div class="sheet-grid">
        <button class="sheet-btn" style="grid-column:1/-1" @click="ajustesAbierto = true"><icon name="settings" :size="22"></icon>Ajustes</button>
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

        <div class="set-group">Alertas y umbrales</div>
        <div class="set-row">
          <span class="lbl">Dias para cierre pendiente</span>
          <input v-model.number="cfg.umbralDiasCierre" type="number" min="1" style="width:5rem;margin:0;padding:.3rem .5rem" @change="guardarCfg">
        </div>
        <div class="set-row">
          <span class="lbl">Mermas por semana (alerta)</span>
          <input v-model.number="cfg.umbralMermasSemana" type="number" min="1" style="width:5rem;margin:0;padding:.3rem .5rem" @change="guardarCfg">
        </div>
        <div class="set-row">
          <span class="lbl">Faltantes por mes (alerta)</span>
          <input v-model.number="cfg.umbralFaltantesMes" type="number" min="1" style="width:5rem;margin:0;padding:.3rem .5rem" @change="guardarCfg">
        </div>
        <div class="set-row">
          <span class="lbl">Dias sin backup (alerta)</span>
          <input v-model.number="cfg.umbralBackupDias" type="number" min="1" style="width:5rem;margin:0;padding:.3rem .5rem" @change="guardarCfg">
        </div>
        <div class="set-row">
          <span class="lbl">Dias sin movimiento producto</span>
          <input v-model.number="cfg.umbralSinMovimientoDias" type="number" min="7" style="width:5rem;margin:0;padding:.3rem .5rem" @change="guardarCfg">
        </div>
        <div class="set-row">
          <span class="lbl">Descuento maximo (%)</span>
          <input v-model.number="cfg.umbralDescuentoPct" type="number" min="0" max="100" style="width:5rem;margin:0;padding:.3rem .5rem" @change="guardarCfg">
        </div>
        <div class="set-row">
          <span class="lbl">Sobrantes por mes (alerta)</span>
          <input v-model.number="cfg.umbralSobrantesMes" type="number" min="1" style="width:5rem;margin:0;padding:.3rem .5rem" @change="guardarCfg">
        </div>
        <div class="set-row">
          <span class="lbl">Stock minimo por defecto</span>
          <input v-model.number="cfg.stockMinDefault" type="number" min="0" style="width:5rem;margin:0;padding:.3rem .5rem" @change="guardarCfg">
        </div>

        <div class="set-group">Datos</div>
        <button class="btn pri" @click="exportar"><icon name="download" :size="16" color="#fff"></icon> Exportar respaldo</button>
        <button class="btn ghost" @click="triggerImport"><icon name="upload" :size="16" :color="mutColor"></icon> Importar datos</button>
        <input type="file" id="impFile" accept=".json" style="display:none" @change="onImportFile">
        <div v-if="ultimoBackup" style="font-size:.75rem;color:var(--mut);margin-top:.3rem">
          Último backup auto: {{ fmtFH(ultimoBackup.fecha) }}
          <button class="link-btn" @click="restaurarBackupAuto">Restaurar backup automático</button>
        </div>

        <div class="set-group">Notificaciones</div>
        <div class="set-row">
          <span class="lbl"><icon name="alert" :size="18"></icon> Activar notificaciones</span>
          <label class="switch">
            <input type="checkbox" :checked="cfg.notifActivo" @change="cfg.notifActivo ? desactivarNotif() : pedirPermisoNotif()">
            <span class="slider"></span>
          </label>
        </div>
        <div class="set-row">
          <span class="lbl"><icon name="calendar" :size="18"></icon> Hora de arqueo</span>
          <input v-model="cfg.horaArqueo" type="time" style="width:auto;margin:0;padding:.3rem .5rem" @change="guardarCfg">
        </div>
        <button class="btn ghost" style="margin-top:.3rem;font-size:.78rem" @click="probarNotif">
          <icon name="check" :size="14" :color="mutColor"></icon> Probar notificacion
        </button>

        <div class="set-group">Avanzado</div>
        <div class="set-row">
          <span class="lbl"><icon name="settings" :size="18"></icon> Consola de desarrollo</span>
          <label class="switch">
            <input type="checkbox" v-model="cfg.erudaActivo" @change="toggleEruda">
            <span class="slider"></span>
          </label>
        </div>
        <div style="font-size:.72rem;color:var(--mut);margin-top:.2rem">
          Activa la consola Eruda para depurar. Dejalo desactivado si no la necesitas.
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
        ultimoExport: null,
        notifActivo: false,
        erudaActivo: false,
        horaArqueo: '',
        ultimaNotifStock: null,
        ultimaNotifArqueo: null,
        ultimaNotifCriticas: null,
        ultimaNotifCierre: null,
        umbralDiasCierre: 30,
        umbralMermasSemana: 3,
        umbralFaltantesMes: 2,
        umbralBackupDias: 7,
        umbralSinMovimientoDias: 60,
        umbralDescuentoPct: 20,
        umbralSobrantesMes: 2,
        stockMinDefault: 5
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
      gastos: [],
      asientos: [],
      filtroAsientoInicio: new Date().toISOString().split('T')[0],
      filtroAsientoFin: new Date().toISOString().split('T')[0],
      filtroAsientoCuenta: '',
      filtroAsientoTipo: '',
      CUENTAS: {
        CAJA: 'Caja',
        INVENTARIO: 'Inventario',
        VENTAS: 'Ventas',
        COSTO_VENTAS: 'Costo de ventas',
        GASTOS: 'Gastos operativos',
        MERMAS: 'Mermas',
        RETIROS: 'Retiros',
        CAPITAL: 'Capital',
        APORTES: 'Aportes',
        SOBRANTES: 'Sobrantes de arqueo',
        FALTANTES: 'Faltantes de arqueo'
      },

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
      gastoForm: { editId: '', fecha: new Date().toISOString().split('T')[0], categoria: '', concepto: '', monto: '', nota: '', metodoPago: 'efectivo', saleDeCaja: true },
      capInicialStr: '',

      rep: {
        fechaInicio: new Date().toISOString().split('T')[0],
        fechaFin: new Date().toISOString().split('T')[0],
        isoInicio: null,
        isoFin: null,
        resultado: null
      },

      cobroModal: { activo: false, total: 0, recibido: '', vuelto: 0 },
      confirm: { activo: false, titulo: '', msg: '', onOk: null },
      prompt: { activo: false, titulo: '', msg: '', placeholder: '', type: 'text', value: '', onOk: null },
      toast: { show: false, msg: '', type: 'ok', accionTxt: '', accionFn: null, timer: null },

      ultimoBackup: null,
      procesandoVenta: false,
      importFile: null,
      _chart: null,
      _notifTimer: null
    };
  },

  computed: {
    mutColor() { return this.cfg.tema === 'dark' ? '#94a3b8' : '#6b7280'; },
    txtColor() { return this.cfg.tema === 'dark' ? '#f1f5f9' : '#111827'; },
    masActivo() { return this.masAbierto || ['productos','inventario','patrimonio','reportes','socios','gastos','contabilidad'].includes(this.sec); },

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
      return m(this.gastos
        .filter(g => new Date(g.fecha) >= ini)
        .reduce((s, g) => s + n(g.monto), 0));
    },

    gastosOrdenados() {
      return this.gastos.slice().sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    },

    gastosTotalAcumulado() {
      return m(this.gastos.reduce((s, g) => s + n(g.monto), 0));
    },

    gastosPorCategoria() {
      const map = {};
      this.gastos.forEach(g => {
        const c = g.categoria || 'Sin categoria';
        if (!map[c]) map[c] = 0;
        map[c] += n(g.monto);
      });
      return Object.keys(map).map(k => ({ cat: k, monto: m(map[k]) })).sort((a, b) => b.monto - a.monto);
    },

    gananciaNetaPeriodo() {
      const mermas = this.ajustes
        .filter(a => a.cantidad < 0 && new Date(a.fecha) >= new Date(this.cfg.periodoInicio))
        .reduce((s, a) => s + n(a.costoPerdida), 0);
      return m(this.gananciaBrutaPeriodo - this.gastosOpPeriodo - mermas);
    },

    margenPeriodo() {
      return this.ventasPeriodo > 0 ? ((this.gananciaNetaPeriodo / this.ventasPeriodo) * 100).toFixed(2) : '0.00';
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

    activosTotal() { return m(this.saldoCaja + this.valorInventario); },

    pasivosTotal() { return 0; },

    flujoEntradas() {
      const ventas = m(this.ventas.filter(v => !v.anulada).reduce((s,v) => s + n(v.total), 0));
      const aportes = this.aportesTotal;
      const sobrantes = m(this.movCaja.filter(mv => mv.tipo === 'ingreso' && mv.concepto && mv.concepto.includes('Sobrante')).reduce((s,mv) => s + n(mv.monto), 0));
      return m(ventas + aportes + sobrantes);
    },

    flujoSalidas() {
      const compras = m(this.compras.filter(c => !c.anulada).reduce((s,c) => s + n(c.total), 0));
      const gastos = m(this.gastos.reduce((s,g) => s + n(g.monto), 0));
      const retiros = this.retirosTotal;
      const faltantes = m(this.movCaja.filter(mv => mv.tipo === 'egreso' && mv.concepto && mv.concepto.includes('Faltante')).reduce((s,mv) => s + n(mv.monto), 0));
      return m(compras + gastos + retiros + faltantes);
    },

    flujoNeto() { return m(this.flujoEntradas - this.flujoSalidas); },

    margenBrutoPct() {
      const ing = this.ventasContadoTotal;
      return ing > 0 ? ((this.gananciaBrutaPeriodo / ing) * 100).toFixed(2) : '0.00';
    },

    margenNetoPct() {
      const ing = this.ventasContadoTotal;
      return ing > 0 ? ((this.gananciaNetaPeriodo / ing) * 100).toFixed(2) : '0.00';
    },

    cuentasLista() {
      const set = {};
      this.asientos.forEach(a => { set[a.cuentaDebe] = 1; set[a.cuentaHaber] = 1; });
      return Object.keys(set).sort();
    },

    asientosFiltrados() {
      let list = this.asientos.slice().sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
      if (this.filtroAsientoInicio) {
        const i = new Date(this.filtroAsientoInicio);
        list = list.filter(a => new Date(a.fecha) >= i);
      }
      if (this.filtroAsientoFin) {
        const f = new Date(this.filtroAsientoFin);
        f.setHours(23, 59, 59, 999);
        list = list.filter(a => new Date(a.fecha) <= f);
      }
      if (this.filtroAsientoCuenta) {
        list = list.filter(a => a.cuentaDebe === this.filtroAsientoCuenta || a.cuentaHaber === this.filtroAsientoCuenta);
      }
      if (this.filtroAsientoTipo) {
        list = list.filter(a => a.refTipo === this.filtroAsientoTipo);
      }
      return list;
    },

    balanzaPorCuenta() {
      const map = {};
      this.asientosFiltrados.forEach(a => {
        if (!map[a.cuentaDebe]) map[a.cuentaDebe] = { cuenta: a.cuentaDebe, debe: 0, haber: 0 };
        if (!map[a.cuentaHaber]) map[a.cuentaHaber] = { cuenta: a.cuentaHaber, debe: 0, haber: 0 };
        map[a.cuentaDebe].debe += n(a.monto);
        map[a.cuentaHaber].haber += n(a.monto);
      });
      return Object.values(map).sort((a, b) => a.cuenta.localeCompare(b.cuenta));
    },

    totalDebe() { return m(this.balanzaPorCuenta.reduce((s, b) => s + b.debe, 0)); },
    totalHaber() { return m(this.balanzaPorCuenta.reduce((s, b) => s + b.haber, 0)); },

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

    anomalias() {
      const out = [];
      const ahora = new Date();
      const hace7d = new Date(ahora.getTime() - 7 * 86400000);
      const hace30d = new Date(ahora.getTime() - 30 * 86400000);
      const umbralSinMov = new Date(ahora.getTime() - n(this.cfg.umbralSinMovimientoDias || 60) * 86400000);

      // 1. Caja negativa
      if (this.saldoCaja < -0.01) {
        out.push({ nivel: 'alta', icono: 'alert', titulo: 'Caja en negativo', detalle: fmt(this.saldoCaja), sec: 'caja' });
      }

      // 2. Ventas bajo costo
      const ventasBajoCosto = this.ventas.filter(v => !v.anulada && new Date(v.fecha) >= hace30d)
        .flatMap(v => v.items.filter(it => it.ganancia < 0).map(it => ({ venta: v, item: it })));
      if (ventasBajoCosto.length > 0) {
        const totalPerdido = m(ventasBajoCosto.reduce((s, x) => s + n(x.item.ganancia), 0));
        out.push({ nivel: 'alta', icono: 'trend', titulo: ventasBajoCosto.length + ' venta(s) bajo costo', detalle: 'Perdida: ' + fmt(totalPerdido), sec: 'ventas' });
      }

      // 3. Stock negativo
      const stockNeg = this.productos.filter(p => !p.archivado && this.stock(p.id) < -0.001);
      if (stockNeg.length > 0) {
        out.push({ nivel: 'alta', icono: 'package', titulo: stockNeg.length + ' producto(s) con stock negativo', detalle: stockNeg.slice(0,3).map(p => p.nombre).join(', '), sec: 'inventario' });
      }

      // 4. Mermas frecuentes
      const mermasSemana = {};
      this.ajustes.filter(a => a.cantidad < 0 && new Date(a.fecha) >= hace7d).forEach(a => {
        mermasSemana[a.productoId] = (mermasSemana[a.productoId] || 0) + 1;
      });
      Object.keys(mermasSemana).forEach(pid => {
        if (mermasSemana[pid] >= n(this.cfg.umbralMermasSemana || 3)) {
          const p = this.productos.find(x => x.id === pid);
          out.push({ nivel: 'media', icono: 'alert', titulo: (p ? p.nombre : 'Producto') + ': mermas frecuentes', detalle: mermasSemana[pid] + ' mermas en 7 dias', sec: 'inventario' });
        }
      });

      // 5. Faltantes repetidos
      const faltantes = this.movCaja.filter(mv => mv.concepto && mv.concepto.includes('Faltante') && new Date(mv.fecha) >= hace30d);
      if (faltantes.length >= n(this.cfg.umbralFaltantesMes || 2)) {
        const total = m(faltantes.reduce((s, f) => s + n(f.monto), 0));
        out.push({ nivel: 'media', icono: 'wallet', titulo: faltantes.length + ' faltantes de caja en 30 dias', detalle: 'Total: ' + fmt(total), sec: 'caja' });
      }

      // 6. Compras con costo elevado
      this.productos.filter(p => !p.archivado).forEach(p => {
        const comprasProd = this.compras.filter(c => c.productoId === p.id).sort((a,b) => new Date(b.fecha) - new Date(a.fecha));
        if (comprasProd.length < 2) return;
        const ult = n(comprasProd[0].costo);
        const prom = comprasProd.slice(1, 6).reduce((s, c) => s + n(c.costo), 0) / Math.min(comprasProd.length - 1, 5);
        if (prom > 0 && ult > prom * 1.5) {
          out.push({ nivel: 'baja', icono: 'bag', titulo: p.nombre + ': compra ' + ((ult/prom - 1) * 100).toFixed(0) + '% mas caro', detalle: fmt(ult) + ' vs ' + fmt(prom) + ' promedio', sec: 'compras' });
        }
      });

      // 7. Ventas anuladas recientes
      const anuladas30 = this.ventas.filter(v => v.anulada && v.fechaAnulacion && new Date(v.fechaAnulacion) >= hace30d);
      if (anuladas30.length > 3) {
        out.push({ nivel: 'baja', icono: 'x', titulo: anuladas30.length + ' ventas anuladas en 30 dias', detalle: 'Revisar historial', sec: 'ventas' });
      }

      // 8. Productos sin movimiento con stock
      const sinMov = this.productos.filter(p => !p.archivado && this.stock(p.id) > 0 && !this.ventas.some(v => !v.anulada && new Date(v.fecha) >= umbralSinMov && v.items.some(it => it.productoId === p.id)));
      if (sinMov.length > 0) {
        out.push({ nivel: 'baja', icono: 'package', titulo: sinMov.length + ' producto(s) sin movimiento', detalle: 'Con stock, sin ventas en ' + (this.cfg.umbralSinMovimientoDias || 60) + ' dias', sec: 'inventario' });
      }

      // 9. Cierre pendiente
      const ultimoCierre = this.cierres.length > 0 ? Math.max(...this.cierres.map(c => new Date(c.fechaCierre).getTime())) : new Date(this.cfg.periodoInicio).getTime();
      const diasSinCierre = Math.floor((ahora.getTime() - ultimoCierre) / 86400000);
      if (diasSinCierre >= n(this.cfg.umbralDiasCierre || 30)) {
        out.push({ nivel: 'media', icono: 'calendar', titulo: 'Cierre pendiente', detalle: diasSinCierre + ' dias sin cerrar periodo', sec: 'reportes' });
      }

      // 10. Backup viejos
      if (this.ultimoBackup && this.ultimoBackup.fecha) {
        const diasSinBackup = Math.floor((ahora.getTime() - new Date(this.ultimoBackup.fecha).getTime()) / 86400000);
        if (diasSinBackup >= n(this.cfg.umbralBackupDias || 7)) {
          out.push({ nivel: 'baja', icono: 'download', titulo: 'Backup antiguo', detalle: diasSinBackup + ' dias desde el ultimo backup', sec: 'ajustes' });
        }
      }

      // 11. Descuentos altos (venta muy por debajo del precio de lista)
      const umbralDesc = n(this.cfg.umbralDescuentoPct || 20);
      if (umbralDesc > 0) {
        const descAltos = [];
        this.ventas.filter(v => !v.anulada && new Date(v.fecha) >= hace30d).forEach(v => {
          v.items.forEach(it => {
            const prod = this.productos.find(p => p.id === it.productoId);
            if (!prod || !prod.precio) return;
            const pctDesc = ((n(prod.precio) - n(it.precio)) / n(prod.precio)) * 100;
            if (pctDesc >= umbralDesc) descAltos.push({ venta: v, item: it, pct: pctDesc });
          });
        });
        if (descAltos.length > 0) {
          out.push({ nivel: 'media', icono: 'trend', titulo: descAltos.length + ' venta(s) con descuento > ' + umbralDesc + '%', detalle: 'Revisar precios aplicados', sec: 'ventas' });
        }
      }

      // 12. Sobrantes repetidos de caja
      const sobrantes = this.movCaja.filter(mv => mv.concepto && mv.concepto.includes('Sobrante') && new Date(mv.fecha) >= hace30d);
      if (sobrantes.length >= n(this.cfg.umbralSobrantesMes || 2)) {
        const total = m(sobrantes.reduce((s, f) => s + n(f.monto), 0));
        out.push({ nivel: 'media', icono: 'wallet', titulo: sobrantes.length + ' sobrantes de caja en 30 dias', detalle: 'Total: ' + fmt(total), sec: 'caja' });
      }

      // 13. Movimientos raros de inventario (subidas sin compra)
      this.productos.filter(p => !p.archivado).forEach(p => {
        const lotesProd = this.lotes.filter(l => l.productoId === p.id);
        const comprasProd = this.compras.filter(c => c.productoId === p.id && !c.anulada);
        // Si hay lotes pero no hay compras, o hay lotes manuales (ajustes con cantidad > 0)
        const lotesSinCompra = lotesProd.filter(l => !l.compraId || l.compraId.startsWith('aj-'));
        if (lotesSinCompra.length > 0 && comprasProd.length === 0 && this.stock(p.id) > 0) {
          out.push({ nivel: 'baja', icono: 'package', titulo: p.nombre + ': stock sin compra registrada', detalle: lotesSinCompra.length + ' lote(s) por ajuste', sec: 'inventario' });
        }
      });

      const orden = { alta: 0, media: 1, baja: 2 };
      return out.sort((a, b) => orden[a.nivel] - orden[b.nivel]);
    },

    anomaliasCriticas() {
      return this.anomalias.filter(a => a.nivel === 'alta').length;
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
        await this.recrearAsientoVenta(venta);
        await this.recargar(['asientos']);
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
              await this.recrearAsientoVenta(Object.assign({}, v, { anulada: true }));
              await this.recargar(['asientos']);
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
          const compraGuardada = this.compras.find(x => x.id === (f.editId || this.compras[0].id));
          if (compraGuardada) { await this.recrearAsientoCompra(compraGuardada); await this.recargar(['asientos']); }
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
      this.prodForm = { editId: '', nombre: '', codigo: '', precio: '', stockMin: String(this.cfg.stockMinDefault || 5), unidad: '' };
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
        const mermaGuardada = this.ajustes.slice().sort((a,b) => new Date(b.fecha) - new Date(a.fecha))[0];
        if (mermaGuardada) { await this.recrearAsientoMerma(mermaGuardada); await this.recargar(['asientos']); }
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
      const arqGuardado = this.arqueos.slice().sort((a,b) => new Date(b.fecha) - new Date(a.fecha))[0];
      if (arqGuardado) { await this.recrearAsientoArqueo(arqGuardado); await this.recargar(['asientos']); }
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
        const rGuardado = this.retiros.slice().sort((a,b) => new Date(b.fecha) - new Date(a.fecha))[0];
        if (rGuardado) { await this.recrearAsientoRetiro(rGuardado); await this.recargar(['asientos']); }
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
      const kGuardado = this.capital.slice().sort((a,b) => new Date(b.fecha) - new Date(a.fecha))[0];
      if (kGuardado) { await this.recrearAsientoAporte(kGuardado); await this.recargar(['asientos']); }
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
            const i = new Date(this.cfg.periodoInicio);
            const f = new Date();
            const ventasRango = this.ventas.filter(v => !v.anulada && new Date(v.fecha) >= i && new Date(v.fecha) <= f);
            const comprasRango = this.compras.filter(c => !c.anulada && new Date(c.fecha) >= i && new Date(c.fecha) <= f);
            const gastosRango = this.gastos.filter(g => new Date(g.fecha) >= i && new Date(g.fecha) <= f);
            const mermasRango = this.ajustes.filter(a => a.cantidad < 0 && new Date(a.fecha) >= i && new Date(a.fecha) <= f);

            const totVentas = m(ventasRango.reduce((s, v) => s + n(v.total), 0));
            const cogs = m(ventasRango.reduce((s, v) => s + v.items.reduce((ss, it) => ss + n(it.costo), 0), 0));
            const bruta = m(totVentas - cogs);
            const totGastos = m(gastosRango.reduce((s, g) => s + n(g.monto), 0));
            const totMermas = m(mermasRango.reduce((s, a) => s + n(a.costoPerdida), 0));
            const neta = m(bruta - totGastos - totMermas);

            const c = {
              id: genId('z'),
              periodo: fmtFecha(i.toISOString()) + ' - ' + fmtFecha(f.toISOString()),
              fechaCierre: f.toISOString(),
              periodoInicio: i.toISOString(),
              periodoFin: f.toISOString(),
              totalVentas: totVentas,
              totalCompras: m(comprasRango.reduce((s, c2) => s + n(c2.total), 0)),
              cogs,
              bruta,
              gastos: totGastos,
              mermas: totMermas,
              ganancia: neta,
              numVentas: ventasRango.length,
              numCompras: comprasRango.length,
              numGastos: gastosRango.length,
              numMermas: mermasRango.length,
              cajaAlCierre: this.saldoCaja,
              inventarioAlCierre: this.valorInventario,
              capitalAlCierre: this.capitalTotal,
              cerrado: true
            };
            this.cfg.periodoInicio = f.toISOString();
            await P(db.cierres, c);
            await this.guardarCfg();
            await this.recargar(['cierres']);
            this.toastMsg('Período cerrado · Ganancia ' + fmt(neta));
          }
        };
      });
    },

    // ===== CUADRE / REPORTES (NUEVO) =====
    setHoy() {
      this.rep.fechaInicio = this.rep.fechaFin = new Date().toISOString().split('T')[0];
      this.rep.isoInicio = null;
      this.rep.isoFin = null;
    },

    setMesActual() {
      const now = new Date();
      const inicio = new Date(now.getFullYear(), now.getMonth(), 1);
      this.rep.fechaInicio = inicio.toISOString().split('T')[0];
      this.rep.fechaFin = now.toISOString().split('T')[0];
      this.rep.isoInicio = null;
      this.rep.isoFin = null;
    },

    setPeriodoActual() {
      this.rep.fechaInicio = this.cfg.periodoInicio.split('T')[0];
      this.rep.fechaFin = new Date().toISOString().split('T')[0];
      this.rep.isoInicio = this.cfg.periodoInicio;
      this.rep.isoFin = new Date().toISOString();
    },

    generarReporte() {
      if (!this.rep.fechaInicio || !this.rep.fechaFin) return this.toastMsg('Selecciona fechas', 'bad');
      const i = this.rep.isoInicio ? new Date(this.rep.isoInicio) : new Date(this.rep.fechaInicio);
      const f = this.rep.isoFin ? new Date(this.rep.isoFin) : new Date(this.rep.fechaFin);
      if (!this.rep.isoFin) f.setHours(23, 59, 59, 999);
      if (i > f) return this.toastMsg('Fecha inicio > fin', 'bad');

      const vp = this.ventas.filter(v => !v.anulada && new Date(v.fecha) >= i && new Date(v.fecha) <= f);
      const cp = this.compras.filter(c => new Date(c.fecha) >= i && new Date(c.fecha) <= f);
      const gp = this.ajustes.filter(a => a.cantidad < 0 && new Date(a.fecha) >= i && new Date(a.fecha) <= f);

      const gastosTotal = m(this.gastos
        .filter(g => new Date(g.fecha) >= i && new Date(g.fecha) <= f)
        .reduce((s, g) => s + n(g.monto), 0));

      const ing = m(vp.reduce((s, v) => s + n(v.total), 0));
      const cogs = m(vp.reduce((s, v) => s + v.items.reduce((ss, it) => ss + n(it.costo), 0), 0));
      const bruta = m(ing - cogs);
      const mermas = m(gp.reduce((s, a) => s + n(a.costoPerdida), 0));
      const neta = m(bruta - mermas - gastosTotal);

      // Agrupar ventas por (producto, costo, precio)
      const ventasPorClave = {};
      vp.forEach(v => {
        v.items.forEach(it => {
          if (!it.lotesUsados) return;
          it.lotesUsados.forEach(u => {
            const costo = n(u.costo), precio = n(it.precio);
            const key = it.productoId + '|' + costo + '|' + precio;
            if (!ventasPorClave[key]) ventasPorClave[key] = { productoId: it.productoId, costo, precio, cantVend: 0, ingresos: 0, costoTotal: 0 };
            ventasPorClave[key].cantVend += n(u.cantidad);
            ventasPorClave[key].ingresos += n(it.precio) * n(u.cantidad);
            ventasPorClave[key].costoTotal += n(u.costo) * n(u.cantidad);
          });
        });
      });

      // Compras por (producto, costo)
      const comprasPorProdCosto = {};
      cp.forEach(c => {
        const key = c.productoId + '|' + n(c.costo);
        if (!comprasPorProdCosto[key]) comprasPorProdCosto[key] = { cant: 0, total: 0 };
        comprasPorProdCosto[key].cant += n(c.cantidad);
        comprasPorProdCosto[key].total += n(c.total);
      });

      // Stock actual por (producto, costo)
      const stockPorProdCosto = {};
      this.lotes.forEach(l => {
        const key = l.productoId + '|' + n(l.costo);
        const disp = n(l.cantidadInicial) - n(l.cantidadVendida);
        if (!stockPorProdCosto[key]) stockPorProdCosto[key] = 0;
        stockPorProdCosto[key] += disp;
      });

      const cuadre = this.productos.filter(p => !p.archivado).map(p => {
        const prodId = p.id;
        const claves = new Set();
        Object.keys(ventasPorClave).forEach(k => {
          if (ventasPorClave[k].productoId === prodId) claves.add(ventasPorClave[k].costo + '|' + ventasPorClave[k].precio);
        });
        Object.keys(stockPorProdCosto).forEach(k => {
          if (!k.startsWith(prodId + '|')) return;
          const costo = n(k.split('|')[1]);
          const stock = stockPorProdCosto[k];
          let tieneFila = false;
          claves.forEach(ck => { if (n(ck.split('|')[0]) === costo) tieneFila = true; });
          if (!tieneFila && stock > 0) claves.add(costo + '|stock');
        });

        const subfilas = [];
        claves.forEach(ck => {
          const partes = ck.split('|');
          const costo = n(partes[0]);
          const precio = partes[1] === 'stock' ? null : n(partes[1]);
          const v = ventasPorClave[prodId + '|' + costo + '|' + precio] || { cantVend: 0, ingresos: 0, costoTotal: 0 };
          const c = comprasPorProdCosto[prodId + '|' + costo] || { cant: 0, total: 0 };
          const stock = stockPorProdCosto[prodId + '|' + costo] || 0;
          subfilas.push({
            costo, precio,
            comprasCant: m(c.cant),
            cantVend: m(v.cantVend),
            ingresos: m(v.ingresos),
            costoVend: m(v.costoTotal),
            ganancia: m(v.ingresos - v.costoTotal),
            stockActual: q(stock),
            valorActual: m(stock * costo)
          });
        });
        subfilas.sort((a, b) => {
          if (a.costo !== b.costo) return a.costo - b.costo;
          if (a.precio === null && b.precio !== null) return 1;
          if (a.precio !== null && b.precio === null) return -1;
          return (a.precio || 0) - (b.precio || 0);
        });

        const comprasProdCant = m(Object.keys(comprasPorProdCosto).filter(k => k.startsWith(prodId + '|')).reduce((s, k) => s + comprasPorProdCosto[k].cant, 0));
        const comprasProdTotal = m(Object.keys(comprasPorProdCosto).filter(k => k.startsWith(prodId + '|')).reduce((s, k) => s + comprasPorProdCosto[k].total, 0));
        const ventasProdCant = m(subfilas.reduce((s, f) => s + f.cantVend, 0));
        const ingresosProd = m(subfilas.reduce((s, f) => s + f.ingresos, 0));
        const costoProdVend = m(subfilas.reduce((s, f) => s + f.costoVend, 0));
        const stockProd = q(subfilas.reduce((s, f) => s + f.stockActual, 0));
        const valorProd = m(subfilas.reduce((s, f) => s + f.valorActual, 0));

        return {
          id: p.id, nombre: p.nombre,
          compras: comprasProdCant,
          costoCompra: comprasProdCant > 0 ? m(comprasProdTotal / comprasProdCant) : 0,
          ventas: ventasProdCant,
          precioVenta: ventasProdCant > 0 ? m(ingresosProd / ventasProdCant) : 0,
          ingresos: ingresosProd,
          costo: costoProdVend,
          ganancia: m(ingresosProd - costoProdVend),
          stockFinal: stockProd,
          valorInv: valorProd,
          subfilas
        };
      });

      const totales = cuadre.reduce((acc, r) => {
        acc.compras += r.compras; acc.ventas += r.ventas; acc.ingresos += r.ingresos;
        acc.costo += r.costo; acc.ganancia += r.ganancia;
        acc.stockFinal += r.stockFinal; acc.valorInv += r.valorInv;
        return acc;
      }, { compras: 0, ventas: 0, ingresos: 0, costo: 0, ganancia: 0, stockFinal: 0, valorInv: 0 });
      Object.keys(totales).forEach(k => totales[k] = m(totales[k]));

      this.rep.resultado = {
        ingresos: ing, cogs, bruta, mermas, gastos: gastosTotal,
        neta, numVentas: vp.length,
        margenB: ing > 0 ? ((bruta / ing) * 100).toFixed(2) : '0.00',
        margenN: ing > 0 ? ((neta / ing) * 100).toFixed(2) : '0.00',
        cuadre, totales,
        _fechaI: this.rep.fechaInicio,
        _fechaF: this.rep.fechaFin
      };
    },

    generarPDFCuadre() {
      const r = this.rep.resultado;
      if (!r) return;

      const doc = new jsPDF();
      const PW = doc.internal.pageSize.getWidth();
      const PH = doc.internal.pageSize.getHeight();
      const generadoTxt = fmtFH(new Date().toISOString());

      // ============ PÁGINA 1: RESUMEN ============
      doc.setFillColor(33, 150, 243);
      doc.rect(0, 0, PW, 30, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text(this.cfg.nombre || 'Tienda Pro', 14, 14);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text('Cuadre por periodo', 14, 21);
      doc.setFontSize(8);
      doc.text('Periodo: ' + r._fechaI + ' al ' + r._fechaF, 14, 27);
      doc.text('Generado: ' + generadoTxt, PW - 14, 27, { align: 'right' });

      // --- Resumen financiero ---
      doc.setTextColor(30, 41, 59);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text('Resumen financiero', 14, 44);

      const rowHighlight = (label) => {
        if (label === 'GANANCIA BRUTA') return { fontStyle: 'bold', fillColor: [230, 240, 255] };
        if (label === 'GANANCIA NETA') return { fontStyle: 'bold', fillColor: [220, 252, 231] };
        return null;
      };

      autoTable(doc, {
        startY: 48,
        head: [['Concepto', 'Monto']],
        body: [
          ['Ingresos por ventas', fmt(r.ingresos)],
          ['Costo de lo vendido (COGS)', '- ' + fmt(r.cogs)],
          ['GANANCIA BRUTA', fmt(r.bruta) + '  (' + r.margenB + '%)'],
          ['Gastos operativos', '- ' + fmt(r.gastos)],
          ['Mermas', '- ' + fmt(r.mermas)],
          ['GANANCIA NETA', fmt(r.neta) + '  (' + r.margenN + '%)']
        ],
        theme: 'grid',
        headStyles: { fillColor: [33, 150, 243], textColor: 255, fontStyle: 'bold', fontSize: 10 },
        styles: { fontSize: 10, cellPadding: 3 },
        columnStyles: { 0: { cellWidth: 120 }, 1: { cellWidth: 76, halign: 'right' } },
        didParseCell: (data) => {
          if (data.section !== 'body') return;
          const label = data.row.raw[0];
          const hl = rowHighlight(label);
          if (hl) Object.assign(data.cell.styles, hl);
        }
      });

      // --- Situación financiera ---
      let y = doc.lastAutoTable.finalY + 10;
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59);
      doc.text('Situacion financiera', 14, y);

      autoTable(doc, {
        startY: y + 4,
        head: [['Concepto', 'Monto']],
        body: [
          ['Caja (efectivo disponible)', fmt(this.saldoCaja)],
          ['Valor del inventario', fmt(this.valorInventario)],
          ['ACTIVOS TOTALES', fmt(this.saldoCaja + this.valorInventario)],
          ['Capital (inicial + aportes)', fmt(this.capitalTotal)],
          ['Ganancias acumuladas', fmt(this.gananciasAcumuladas)],
          ['PATRIMONIO', fmt(this.patrimonioTotal)],
          ['Disponible para retiro', fmt(this.gananciaDisponible)]
        ],
        theme: 'grid',
        headStyles: { fillColor: [33, 150, 243], textColor: 255, fontStyle: 'bold', fontSize: 10 },
        styles: { fontSize: 10, cellPadding: 3 },
        columnStyles: { 0: { cellWidth: 120 }, 1: { cellWidth: 76, halign: 'right' } },
        didParseCell: (data) => {
          if (data.section !== 'body') return;
          const label = data.row.raw[0];
          if (label === 'ACTIVOS TOTALES' || label === 'PATRIMONIO') {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [230, 240, 255];
          }
        }
      });

      // --- Reparto entre socios ---
      if (this.sociosActivos.length > 0) {
        y = doc.lastAutoTable.finalY + 10;
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.text('Reparto entre socios', 14, y);

        const socioRows = this.sociosActivos.map(sc => [
          sc.nombre,
          n(sc.porcentaje).toFixed(2) + '%',
          fmt(r.neta * n(sc.porcentaje) / 100)
        ]);
        socioRows.push(['TOTAL', '100.00%', fmt(r.neta)]);

        autoTable(doc, {
          startY: y + 4,
          head: [['Socio', '% Participacion', 'Monto a recibir']],
          body: socioRows,
          theme: 'grid',
          headStyles: { fillColor: [124, 58, 237], textColor: 255, fontStyle: 'bold', fontSize: 10 },
          styles: { fontSize: 10, cellPadding: 3 },
          columnStyles: { 0: { cellWidth: 90 }, 1: { cellWidth: 50, halign: 'center' }, 2: { cellWidth: 56, halign: 'right' } },
          didParseCell: (data) => {
            if (data.section !== 'body') return;
            if (data.row.raw[0] === 'TOTAL') {
              data.cell.styles.fontStyle = 'bold';
              data.cell.styles.fillColor = [240, 235, 255];
            }
          }
        });
      }

      // ============ PÁGINA 2+: TABLA POR PRODUCTO ============
      doc.addPage();
      doc.setFillColor(33, 150, 243);
      doc.rect(0, 0, PW, 20, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Detalle por producto', 14, 13);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text((this.cfg.nombre || '') + '  ·  ' + r._fechaI + ' al ' + r._fechaF, PW - 14, 13, { align: 'right' });

      const PFILL = [235, 244, 255];
      const TFILL = [229, 231, 235];

      const bodyRows = [];
      r.cuadre.forEach(row => {
        bodyRows.push([
          { content: row.nombre, styles: { fontStyle: 'bold', fillColor: PFILL } },
          { content: '', styles: { fillColor: PFILL } },
          { content: fmtCant(row.compras), styles: { halign: 'right', fillColor: PFILL } },
          { content: fmt(row.costoCompra), styles: { halign: 'right', fillColor: PFILL } },
          { content: fmtCant(row.ventas), styles: { halign: 'right', fillColor: PFILL } },
          { content: fmt(row.precioVenta), styles: { halign: 'right', fillColor: PFILL } },
          { content: fmt(row.ingresos), styles: { halign: 'right', fillColor: PFILL } },
          { content: fmt(row.costo), styles: { halign: 'right', fillColor: PFILL } },
          { content: fmt(row.ganancia), styles: { halign: 'right', fontStyle: 'bold', fillColor: PFILL } },
          { content: fmtCant(row.stockFinal), styles: { halign: 'right', fillColor: PFILL } },
          { content: fmt(row.valorInv), styles: { halign: 'right', fillColor: PFILL } }
        ]);
        row.subfilas.forEach(sf => {
          bodyRows.push([
            { content: '', styles: { fontSize: 7 } },
            { content: '  -> ' + fmt(sf.costo) + (sf.precio !== null ? ' -> ' + fmt(sf.precio) : ' (sin ventas)'), styles: { fontSize: 7, textColor: [33, 150, 243] } },
            { content: sf.comprasCant ? fmtCant(sf.comprasCant) : '-', styles: { halign: 'right', fontSize: 7 } },
            { content: fmt(sf.costo), styles: { halign: 'right', fontSize: 7 } },
            { content: sf.cantVend ? fmtCant(sf.cantVend) : '-', styles: { halign: 'right', fontSize: 7 } },
            { content: sf.precio !== null ? fmt(sf.precio) : '-', styles: { halign: 'right', fontSize: 7 } },
            { content: sf.ingresos ? fmt(sf.ingresos) : '-', styles: { halign: 'right', fontSize: 7 } },
            { content: sf.costoVend ? fmt(sf.costoVend) : '-', styles: { halign: 'right', fontSize: 7 } },
            { content: sf.ganancia ? fmt(sf.ganancia) : '-', styles: { halign: 'right', fontSize: 7 } },
            { content: fmtCant(sf.stockActual), styles: { halign: 'right', fontSize: 7 } },
            { content: fmt(sf.valorActual), styles: { halign: 'right', fontSize: 7 } }
          ]);
        });
      });

      bodyRows.push([
        { content: 'TOTAL', styles: { fontStyle: 'bold', fillColor: TFILL } },
        { content: '', styles: { fillColor: TFILL } },
        { content: fmtCant(r.totales.compras), styles: { halign: 'right', fontStyle: 'bold', fillColor: TFILL } },
        { content: '', styles: { fillColor: TFILL } },
        { content: fmtCant(r.totales.ventas), styles: { halign: 'right', fontStyle: 'bold', fillColor: TFILL } },
        { content: '', styles: { fillColor: TFILL } },
        { content: fmt(r.totales.ingresos), styles: { halign: 'right', fontStyle: 'bold', fillColor: TFILL } },
        { content: fmt(r.totales.costo), styles: { halign: 'right', fontStyle: 'bold', fillColor: TFILL } },
        { content: fmt(r.totales.ganancia), styles: { halign: 'right', fontStyle: 'bold', fillColor: TFILL } },
        { content: fmtCant(r.totales.stockFinal), styles: { halign: 'right', fontStyle: 'bold', fillColor: TFILL } },
        { content: fmt(r.totales.valorInv), styles: { halign: 'right', fontStyle: 'bold', fillColor: TFILL } }
      ]);

      autoTable(doc, {
        startY: 26,
        head: [['Producto', 'Detalle', 'Compras', 'Costo u.', 'Ventas', 'Precio u.', 'Ingresos', 'Costo', 'Ganancia', 'Stock', 'Valor']],
        body: bodyRows,
        styles: { fontSize: 8, cellPadding: 1.5, overflow: 'linebreak' },
        headStyles: { fillColor: [33, 150, 243], textColor: 255, fontSize: 8, fontStyle: 'bold' },
        columnStyles: {
          0: { cellWidth: 28 },
          1: { cellWidth: 26, textColor: [100, 100, 100] },
          2: { cellWidth: 13, halign: 'right' },
          3: { cellWidth: 15, halign: 'right' },
          4: { cellWidth: 13, halign: 'right' },
          5: { cellWidth: 15, halign: 'right' },
          6: { cellWidth: 17, halign: 'right' },
          7: { cellWidth: 14, halign: 'right' },
          8: { cellWidth: 17, halign: 'right' },
          9: { cellWidth: 12, halign: 'right' },
          10: { cellWidth: 15, halign: 'right' }
        },
        margin: { left: 10, right: 10 }
      });

      // ============ FOOTER EN TODAS LAS PÁGINAS ============
      const totalPages = doc.internal.getNumberOfPages();
      for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        doc.setFontSize(7);
        doc.setTextColor(150);
        doc.text((this.cfg.nombre || 'Tienda Pro') + '  ·  Generado ' + generadoTxt, 10, PH - 6);
        doc.text('Pagina ' + p + ' de ' + totalPages, PW - 10, PH - 6, { align: 'right' });
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

    // ===== ERUDA =====
    toggleEruda() {
      try {
        if (this.cfg.erudaActivo) {
          if (window.__loadEruda) window.__loadEruda();
          else {
            const sc = document.createElement('script');
            sc.src = 'https://cdn.jsdelivr.net/npm/eruda';
            sc.onload = () => { try { window.eruda.init(); } catch(e){} };
            document.head.appendChild(sc);
          }
          this.toastMsg('Consola activada');
        } else {
          if (window.__unloadEruda) window.__unloadEruda();
          this.toastMsg('Consola desactivada');
        }
        this.guardarCfg();
      } catch (e) { console.error('toggleEruda', e); }
    },

    // ===== NOTIFICACIONES =====
    enviarNotif(titulo, cuerpo) {
      try {
        if (!('Notification' in window)) return;
        if (Notification.permission !== 'granted') return;
        new Notification(titulo, {
          body: cuerpo,
          icon: '/Tienda-ultima/icons/icon-192.png',
          badge: '/Tienda-ultima/icons/icon-192.png',
          tag: 'tienda-' + Date.now()
        });
      } catch (e) { console.error('enviarNotif', e); }
    },

    async pedirPermisoNotif() {
      if (!('Notification' in window)) {
        this.toastMsg('Este dispositivo no soporta notificaciones', 'warn');
        return;
      }
      if (Notification.permission === 'granted') {
        this.cfg.notifActivo = true;
        await this.guardarCfg();
        this.toastMsg('Notificaciones activadas');
        return;
      }
      try {
        const perm = await Notification.requestPermission();
        if (perm === 'granted') {
          this.cfg.notifActivo = true;
          await this.guardarCfg();
          this.enviarNotif('Tienda Pro', 'Notificaciones activadas');
          this.toastMsg('Notificaciones activadas');
        } else {
          this.toastMsg('Permiso denegado', 'bad');
        }
      } catch (e) { this.toastMsg('Error: ' + e.message, 'bad'); }
    },

    async desactivarNotif() {
      this.cfg.notifActivo = false;
      await this.guardarCfg();
      this.toastMsg('Notificaciones desactivadas');
    },

    probarNotif() {
      if (!('Notification' in window) || Notification.permission !== 'granted') {
        this.toastMsg('Primero activa las notificaciones', 'warn');
        return;
      }
      this.enviarNotif('Tienda Pro', 'Esta es una notificacion de prueba');
      this.toastMsg('Notificacion enviada');
    },

    async chequearNotificaciones() {
      if (!this.cfg.notifActivo) return;
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      const ahora = new Date();
      const hoy = ahora.toISOString().split('T')[0];
      let cambio = false;

      // 1. Stock bajo
      const bajo = this.productosAgotados.length + this.productosBajoStock.length;
      if (bajo > 0 && this.cfg.ultimaNotifStock !== hoy) {
        this.enviarNotif('Stock bajo', bajo + ' producto(s) en alerta');
        this.cfg.ultimaNotifStock = hoy;
        cambio = true;
      }

      // 2. Hora de arqueo
      if (this.cfg.horaArqueo) {
        const partes = this.cfg.horaArqueo.split(':');
        const hh = parseInt(partes[0]) || 0;
        const mm = parseInt(partes[1]) || 0;
        const horaArq = new Date();
        horaArq.setHours(hh, mm, 0, 0);
        if (ahora >= horaArq) {
          const hayArqueoHoy = this.arqueos.some(a => a.fecha && a.fecha.split('T')[0] === hoy);
          if (!hayArqueoHoy && this.cfg.ultimaNotifArqueo !== hoy) {
            this.enviarNotif('Arqueo pendiente', 'No hay arqueo registrado hoy');
            this.cfg.ultimaNotifArqueo = hoy;
            cambio = true;
          }
        }
      }

      // 3. Anomalias criticas
      const criticas = this.anomaliasCriticas;
      if (criticas > 0 && this.cfg.ultimaNotifCriticas !== hoy) {
        this.enviarNotif('Anomalias criticas', criticas + ' problema(s) urgente(s)');
        this.cfg.ultimaNotifCriticas = hoy;
        cambio = true;
      }

      // 4. Cierre pendiente
      const ultimoCierre = this.cierres.length > 0 ? Math.max(...this.cierres.map(c => new Date(c.fechaCierre).getTime())) : new Date(this.cfg.periodoInicio).getTime();
      const dias = Math.floor((ahora.getTime() - ultimoCierre) / 86400000);
      if (dias >= n(this.cfg.umbralDiasCierre || 30) && this.cfg.ultimaNotifCierre !== hoy) {
        this.enviarNotif('Cierre pendiente', dias + ' dias sin cerrar periodo');
        this.cfg.ultimaNotifCierre = hoy;
        cambio = true;
      }

      if (cambio) await this.guardarCfg();
    },

    // ===== LIBRO DIARIO =====
    setMesAsientos() {
      const now = new Date();
      const inicio = new Date(now.getFullYear(), now.getMonth(), 1);
      this.filtroAsientoInicio = inicio.toISOString().split('T')[0];
      this.filtroAsientoFin = now.toISOString().split('T')[0];
    },

    crearAsientoObj(fecha, descripcion, cuentaDebe, cuentaHaber, monto, refTipo, refId) {
      return {
        id: genId('as'),
        fecha,
        descripcion,
        cuentaDebe,
        cuentaHaber,
        monto: m(monto),
        refTipo,
        refId
      };
    },

    async borrarAsientosDe(refTipo, refId) {
      const existentes = this.asientos.filter(a => a.refTipo === refTipo && a.refId === refId);
      if (existentes.length === 0) return;
      await db.asientos.bulkDelete(existentes.map(a => a.id));
    },

    async recrearAsientoVenta(v) {
      const C = this.CUENTAS;
      await this.borrarAsientosDe('venta', v.id);
      await this.borrarAsientosDe('costo', v.id);
      if (v.anulada) return;
      const asientos = [this.crearAsientoObj(v.fecha, 'Venta #' + v.id.slice(-6), C.CAJA, C.VENTAS, n(v.total), 'venta', v.id)];
      const cogs = m(v.items.reduce((sum, it) => sum + n(it.costo), 0));
      if (cogs > 0) {
        asientos.push(this.crearAsientoObj(v.fecha, 'Costo venta #' + v.id.slice(-6), C.COSTO_VENTAS, C.INVENTARIO, cogs, 'costo', v.id));
      }
      await db.asientos.bulkPut(asientos.map(a => clean(a)));
    },

    async recrearAsientoCompra(c) {
      const C = this.CUENTAS;
      await this.borrarAsientosDe('compra', c.id);
      if (c.anulada) return;
      const as = this.crearAsientoObj(c.fecha, 'Compra ' + (c.productoNombre || '') + ' #' + c.id.slice(-6), C.INVENTARIO, C.CAJA, n(c.total), 'compra', c.id);
      await P(db.asientos, as);
    },

    async recrearAsientoGasto(g) {
      const C = this.CUENTAS;
      await this.borrarAsientosDe('gasto', g.id);
      if (g.saleDeCaja === false) return;
      const as = this.crearAsientoObj(g.fecha, 'Gasto ' + g.categoria + ': ' + g.concepto, C.GASTOS, C.CAJA, n(g.monto), 'gasto', g.id);
      await P(db.asientos, as);
    },

    async recrearAsientoMerma(a) {
      const C = this.CUENTAS;
      await this.borrarAsientosDe('merma', a.id);
      if (n(a.cantidad) >= 0) return;
      const as = this.crearAsientoObj(a.fecha, 'Merma ' + (a.productoNombre || ''), C.MERMAS, C.INVENTARIO, n(a.costoPerdida), 'merma', a.id);
      await P(db.asientos, as);
    },

    async recrearAsientoRetiro(r) {
      const C = this.CUENTAS;
      await this.borrarAsientosDe('retiro', r.id);
      const as = this.crearAsientoObj(r.fecha, 'Retiro: ' + (r.concepto || ''), C.RETIROS, C.CAJA, n(r.monto), 'retiro', r.id);
      await P(db.asientos, as);
    },

    async recrearAsientoAporte(k) {
      const C = this.CUENTAS;
      await this.borrarAsientosDe('aporte', k.id);
      const as = this.crearAsientoObj(k.fecha, 'Aporte: ' + (k.nota || ''), C.CAJA, C.APORTES, n(k.monto), 'aporte', k.id);
      await P(db.asientos, as);
    },

    async recrearAsientoArqueo(a) {
      const C = this.CUENTAS;
      await this.borrarAsientosDe('arqueo', a.id);
      const diff = n(a.diferencia);
      if (Math.abs(diff) < 0.01) return;
      let as;
      if (diff > 0) {
        as = this.crearAsientoObj(a.fecha, 'Sobrante de arqueo', C.CAJA, C.SOBRANTES, diff, 'arqueo', a.id);
      } else {
        as = this.crearAsientoObj(a.fecha, 'Faltante de arqueo', C.FALTANTES, C.CAJA, Math.abs(diff), 'arqueo', a.id);
      }
      await P(db.asientos, as);
    },

    regenerarAsientos() {
      this.confirm = {
        activo: true, titulo: 'Regenerar asientos',
        msg: 'Esto borrara TODOS los asientos actuales y los reconstruira desde cero. Continuar?',
        onOk: async () => {
          try {
            await db.asientos.clear();
            const C = this.CUENTAS;
            const nuevos = [];

            this.ventas.filter(v => !v.anulada).forEach(v => {
              nuevos.push(this.crearAsientoObj(v.fecha, 'Venta #' + v.id.slice(-6), C.CAJA, C.VENTAS, n(v.total), 'venta', v.id));
              const cogs = m(v.items.reduce((sum, it) => sum + n(it.costo), 0));
              if (cogs > 0) {
                nuevos.push(this.crearAsientoObj(v.fecha, 'Costo venta #' + v.id.slice(-6), C.COSTO_VENTAS, C.INVENTARIO, cogs, 'costo', v.id));
              }
            });

            this.compras.filter(c => !c.anulada).forEach(c => {
              nuevos.push(this.crearAsientoObj(c.fecha, 'Compra ' + (c.productoNombre || '') + ' #' + c.id.slice(-6), C.INVENTARIO, C.CAJA, n(c.total), 'compra', c.id));
            });

            this.gastos.forEach(g => {
              if (g.saleDeCaja === false) return;
              nuevos.push(this.crearAsientoObj(g.fecha, 'Gasto ' + g.categoria + ': ' + g.concepto, C.GASTOS, C.CAJA, n(g.monto), 'gasto', g.id));
            });

            this.ajustes.filter(a => n(a.cantidad) < 0).forEach(a => {
              nuevos.push(this.crearAsientoObj(a.fecha, 'Merma ' + (a.productoNombre || ''), C.MERMAS, C.INVENTARIO, n(a.costoPerdida), 'merma', a.id));
            });

            this.retiros.forEach(r => {
              nuevos.push(this.crearAsientoObj(r.fecha, 'Retiro: ' + (r.concepto || ''), C.RETIROS, C.CAJA, n(r.monto), 'retiro', r.id));
            });

            this.capital.forEach(k => {
              nuevos.push(this.crearAsientoObj(k.fecha, 'Aporte: ' + (k.nota || ''), C.CAJA, C.APORTES, n(k.monto), 'aporte', k.id));
            });

            this.arqueos.forEach(a => {
              const diff = n(a.diferencia);
              if (Math.abs(diff) < 0.01) return;
              if (diff > 0) {
                nuevos.push(this.crearAsientoObj(a.fecha, 'Sobrante de arqueo', C.CAJA, C.SOBRANTES, diff, 'arqueo', a.id));
              } else {
                nuevos.push(this.crearAsientoObj(a.fecha, 'Faltante de arqueo', C.FALTANTES, C.CAJA, Math.abs(diff), 'arqueo', a.id));
              }
            });

            if (nuevos.length > 0) {
              await db.asientos.bulkPut(nuevos.map(x => clean(x)));
            }
            await this.recargar(['asientos']);
            this.toastMsg('Asientos regenerados: ' + nuevos.length);
          } catch (e) {
            this.toastMsg('Error: ' + e.message, 'bad');
          }
        }
      };
    },

    // ===== GASTOS =====
    resetGasto() {
      this.gastoForm = { editId: '', fecha: new Date().toISOString().split('T')[0], categoria: '', concepto: '', monto: '', nota: '', metodoPago: 'efectivo', saleDeCaja: true };
    },

    async guardarGasto() {
      const f = this.gastoForm;
      const categoria = (f.categoria || '').trim();
      const concepto = (f.concepto || '').trim();
      const monto = n(f.monto);
      const fechaISO = f.fecha ? new Date(f.fecha + 'T12:00:00').toISOString() : new Date().toISOString();
      if (!categoria) return this.toastMsg('Categoria obligatoria', 'bad');
      if (!concepto) return this.toastMsg('Concepto obligatorio', 'bad');
      if (monto <= 0) return this.toastMsg('Monto debe ser > 0', 'bad');

      if (f.editId) {
        const o = this.gastos.find(x => x.id === f.editId);
        if (!o) return;
        await db.transaction('rw', db.gastos, db.movCaja, async () => {
          let movId = o.movId || null;
          if (f.saleDeCaja && movId) {
            await P(db.movCaja, { id: movId, fecha: fechaISO, tipo: 'egreso', monto, concepto: 'Gasto: ' + categoria + ' - ' + concepto, nota: f.nota || '' });
          } else if (f.saleDeCaja && !movId) {
            movId = genId('mc');
            await P(db.movCaja, { id: movId, fecha: fechaISO, tipo: 'egreso', monto, concepto: 'Gasto: ' + categoria + ' - ' + concepto, nota: f.nota || '' });
          } else if (!f.saleDeCaja && movId) {
            await db.movCaja.delete(movId);
            movId = null;
          }
          await P(db.gastos, { id: o.id, fecha: fechaISO, categoria, concepto, monto, nota: f.nota || '', metodoPago: f.metodoPago, saleDeCaja: !!f.saleDeCaja, movId });
        });
        this.toastMsg('Gasto actualizado');
      } else {
        const id = genId('g');
        let movId = null;
        await db.transaction('rw', db.gastos, db.movCaja, async () => {
          if (f.saleDeCaja) {
            movId = genId('mc');
            await P(db.movCaja, { id: movId, fecha: fechaISO, tipo: 'egreso', monto, concepto: 'Gasto: ' + categoria + ' - ' + concepto, nota: f.nota || '' });
          }
          await P(db.gastos, { id, fecha: fechaISO, categoria, concepto, monto, nota: f.nota || '', metodoPago: f.metodoPago, saleDeCaja: !!f.saleDeCaja, movId });
        });
        this.toastMsg('Gasto registrado: ' + fmt(monto));
      }
      this.resetGasto();
      await this.recargar(['gastos', 'movCaja']);
      const gs = this.gastos.slice().sort((a,b) => new Date(b.fecha) - new Date(a.fecha))[0];
      if (gs && (!f.editId || gs.id === f.editId)) { await this.recrearAsientoGasto(gs); await this.recargar(['asientos']); }
    },

    editarGasto(id) {
      const g = this.gastos.find(x => x.id === id);
      if (!g) return;
      this.gastoForm = {
        editId: g.id,
        fecha: g.fecha ? g.fecha.split('T')[0] : new Date().toISOString().split('T')[0],
        categoria: g.categoria || '',
        concepto: g.concepto || '',
        monto: String(g.monto || ''),
        nota: g.nota || '',
        metodoPago: g.metodoPago || 'efectivo',
        saleDeCaja: g.saleDeCaja !== false
      };
      window.scrollTo(0, 0);
    },

    eliminarGasto(id) {
      const g = this.gastos.find(x => x.id === id);
      if (!g) return;
      this.confirm = {
        activo: true, titulo: 'Eliminar gasto',
        msg: 'Eliminar "' + g.concepto + '" por ' + fmt(g.monto) + '?',
        onOk: async () => {
          await db.transaction('rw', db.gastos, db.movCaja, async () => {
            await db.gastos.delete(id);
            if (g.movId) await db.movCaja.delete(g.movId);
          });
          await this.recargar(['gastos', 'movCaja']);
          this.toastMsg('Gasto eliminado');
        }
      };
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
      const tables = ['productos', 'lotes', 'ventas', 'compras', 'ajustes', 'arqueos', 'movCaja', 'cierres', 'capital', 'retiros', 'socios', 'distribuciones', 'gastos', 'asientos'];
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
        distribuciones: () => db.distribuciones.toArray(),
        gastos: () => db.gastos.toArray(),
        asientos: () => db.asientos.toArray()
      };
      for (const w of what) this[w] = await map[w]();
    },

    async recargarTodo() {
      const r = await Promise.all([
        db.productos.toArray(), db.lotes.toArray(), db.ventas.toArray(),
        db.compras.toArray(), db.ajustes.toArray(), db.arqueos.toArray(),
        db.movCaja.toArray(), db.cierres.toArray(), db.capital.toArray(), db.retiros.toArray(),
        db.socios.toArray(), db.distribuciones.toArray(), db.gastos.toArray(),
        db.asientos.toArray()
      ]);
      ['productos', 'lotes', 'ventas', 'compras', 'ajustes', 'arqueos', 'movCaja', 'cierres', 'capital', 'retiros', 'socios', 'distribuciones', 'gastos', 'asientos'].forEach((k, i) => this[k] = r[i]);
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
      this._aplicando = true;
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistration().then(reg => {
          if (reg && reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          setTimeout(() => location.reload(), 500);
        }).catch(() => location.reload());
      } else {
        location.reload();
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
        if (this.asientos.length === 0 && (this.ventas.length > 0 || this.compras.length > 0 || this.gastos.length > 0)) {
          try {
            const C = this.CUENTAS;
            const nuevos = [];
            this.ventas.filter(v => !v.anulada).forEach(v => {
              nuevos.push(this.crearAsientoObj(v.fecha, 'Venta #' + v.id.slice(-6), C.CAJA, C.VENTAS, n(v.total), 'venta', v.id));
              const cogs = m(v.items.reduce((sum, it) => sum + n(it.costo), 0));
              if (cogs > 0) nuevos.push(this.crearAsientoObj(v.fecha, 'Costo venta #' + v.id.slice(-6), C.COSTO_VENTAS, C.INVENTARIO, cogs, 'costo', v.id));
            });
            this.compras.filter(c => !c.anulada).forEach(c => {
              nuevos.push(this.crearAsientoObj(c.fecha, 'Compra ' + (c.productoNombre || '') + ' #' + c.id.slice(-6), C.INVENTARIO, C.CAJA, n(c.total), 'compra', c.id));
            });
            this.gastos.forEach(g => {
              if (g.saleDeCaja === false) return;
              nuevos.push(this.crearAsientoObj(g.fecha, 'Gasto ' + g.categoria + ': ' + g.concepto, C.GASTOS, C.CAJA, n(g.monto), 'gasto', g.id));
            });
            this.ajustes.filter(a => n(a.cantidad) < 0).forEach(a => {
              nuevos.push(this.crearAsientoObj(a.fecha, 'Merma ' + (a.productoNombre || ''), C.MERMAS, C.INVENTARIO, n(a.costoPerdida), 'merma', a.id));
            });
            this.retiros.forEach(r => {
              nuevos.push(this.crearAsientoObj(r.fecha, 'Retiro: ' + (r.concepto || ''), C.RETIROS, C.CAJA, n(r.monto), 'retiro', r.id));
            });
            this.capital.forEach(k => {
              nuevos.push(this.crearAsientoObj(k.fecha, 'Aporte: ' + (k.nota || ''), C.CAJA, C.APORTES, n(k.monto), 'aporte', k.id));
            });
            this.arqueos.forEach(a => {
              const diff = n(a.diferencia);
              if (Math.abs(diff) < 0.01) return;
              if (diff > 0) nuevos.push(this.crearAsientoObj(a.fecha, 'Sobrante de arqueo', C.CAJA, C.SOBRANTES, diff, 'arqueo', a.id));
              else nuevos.push(this.crearAsientoObj(a.fecha, 'Faltante de arqueo', C.FALTANTES, C.CAJA, Math.abs(diff), 'arqueo', a.id));
            });
            if (nuevos.length > 0) {
              await db.asientos.bulkPut(nuevos.map(x => clean(x)));
              await this.recargar(['asientos']);
            }
          } catch (e) { console.error('auto asientos', e); }
        }

        const hash = location.hash.slice(1);
        const valid = ['dashboard', 'ventas', 'compras', 'productos', 'inventario', 'caja', 'patrimonio', 'reportes', 'socios', 'gastos', 'contabilidad'];
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
    window.addEventListener('pwa:update', () => { this.hayUpdate = true; });
    window.addEventListener('online', () => this.online = true);
    window.addEventListener('offline', () => this.online = false);
    window.addEventListener('popstate', e => { this.sec = (e.state && e.state.sec) || 'dashboard'; });
    window.addEventListener('resize', () => { if (this.sec === 'dashboard') this.renderChart(); });
    this._notifTimer = setInterval(() => this.chequearNotificaciones(), 5 * 60 * 1000);
    setTimeout(() => this.chequearNotificaciones(), 3000);
  },

  beforeUnmount() {
    if (this._notifTimer) clearInterval(this._notifTimer);
  }
};

// Necesitamos h para el componente icon
import { h } from 'vue';
</script>
