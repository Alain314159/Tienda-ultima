<template>
  <div v-cloak :data-theme="cfg.tema">
    <!-- MULTI-TAB WARNING -->
    <div v-if="_otraPestana" class="multi-tab-warn no-print">
      <div style="flex:1">
        <b>⚠ App abierta en otra pestaña</b><br>
        <span style="font-size:.72rem">Tenerla abierta en dos lugares puede causar problemas. Cierra la otra.</span>
      </div>
      <button class="btn ghost" style="width:auto;margin:0;padding:.4rem .7rem;font-size:.72rem" @click="_otraPestana = false">OK</button>
    </div>

    <!-- SAFE MODE BANNER -->
    <div v-if="safeMode" class="safe-mode-banner no-print">
      <div style="flex:1">
        <b>Modo seguro activado</b><br>
        <span style="font-size:.72rem">La app fallo al iniciar varias veces. Algunas funciones estan deshabilitadas.</span>
      </div>
      <button class="btn ghost" style="width:auto;margin:0;padding:.4rem .7rem;font-size:.72rem" @click="salirSafeMode">Reintentar</button>
    </div>

    <!-- SPLASH -->
    <div v-if="splashVisible" class="splash-screen">
      <div class="splash-logo">
        <icon name="store" :size="48" color="#fff"></icon>
      </div>
      <div class="splash-title">{{ cfg.nombre || 'Tienda Pro' }}</div>
      <div class="splash-spinner"></div>
    </div>

    <!-- PULL TO REFRESH INDICATOR -->
    <div v-if="pullDist > 0 || refrescando" class="pull-indicator" :style="{ transform: 'translateY(' + Math.min(pullDist, 70) + 'px)' }">
      <div class="pull-spinner" :class="{ spin: refrescando || pullDist >= 70 }"></div>
      <span>{{ refrescando ? 'Actualizando...' : (pullDist >= 70 ? 'Suelta para actualizar' : 'Desliza para actualizar') }}</span>
    </div>

    <!-- BANNERS -->
    <div v-if="!online" class="banner off no-print">
      <icon name="alert" :size="14" color="#fff"></icon>
      Sin conexion — los datos se guardan localmente
    </div>
    <div v-if="hayUpdate" class="banner upd no-print" @click="aplicarUpdate">Nueva versión disponible — tocar para actualizar</div>

    <!-- HEADER -->
    <header class="header no-print">
      <h1><icon name="store" :size="20" color="#fff"></icon> {{ cfg.nombre || 'Tienda Pro' }}</h1>
      <div class="hacts">
        <button class="h-btn" @click="busquedaGlobalAbierta = true" aria-label="Buscar">
          <icon name="search" :size="18" color="#fff"></icon>
        </button>
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

    <main @touchstart.passive="onTouchStart" @touchmove.passive="onTouchMove" @touchend="onTouchEnd">
      <!-- ==================== DASHBOARD ==================== -->
      <section v-if="sec === 'dashboard'" class="fade-up">
        <div class="balance azul">
          <div class="lbl"><icon name="wallet" :size="14" color="#fff"></icon> Efectivo en Caja</div>
          <div class="val">{{ fmt(saldoCaja) }}</div>
          <div class="sub">Inventario: {{ fmt(valorInventario) }} · Desde {{ fmtFecha(cfg.periodoInicio) }}</div>
        </div>

        <div v-if="productosBajoStock.length || productosAgotados.length" class="alert-box-stock">
          <div v-if="productosAgotados.length" class="alert-chip alert-out" @click="irAStock('agotados')">
            <icon name="alert" :size="14" color="#fff"></icon>
            <b>{{ productosAgotados.length }}</b> agotado(s)
          </div>
          <div v-if="productosBajoStock.length" class="alert-chip alert-low" @click="irAStock('bajos')">
            <icon name="alert" :size="14" color="#fff"></icon>
            <b>{{ productosBajoStock.length }}</b> bajo(s)
          </div>
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
            <button class="quick-btn" @click="ir('contabilidad')"><icon name="wallet" :size="22"></icon>Arqueo de Caja</button>
            <button class="quick-btn" @click="ir('contabilidad')"><icon name="chart" :size="22"></icon>Contabilidad</button>
            <button class="quick-btn" @click="ir('inventario')"><icon name="package" :size="22"></icon>Inventario</button>
          </div>
        </div>

        <div class="card insights-card" v-if="insights.length">
          <div class="card-title">
            <icon name="zap" :size="18" :color="'#7C3AED'"></icon>
            Consejos de Tienda Pro
          </div>
          <div v-for="(ins, i) in insights" :key="i"
            class="insight-row"
            :class="'insight-' + ins.tipo"
            @click="ir(ins.sec)">
            <div class="insight-icon">
              <icon :name="ins.icono" :size="16" :color="ins.tipo === 'bad' ? '#DC2626' : ins.tipo === 'warn' ? '#D97706' : ins.tipo === 'ok' ? '#16A34A' : '#7C3AED'"></icon>
            </div>
            <div class="insight-body">
              <div class="insight-title">{{ ins.titulo }}</div>
              <div class="insight-detail">{{ ins.detalle }}</div>
            </div>
            <icon name="chevron" :size="14" :color="mutColor" style="transform:rotate(-90deg);flex-shrink:0"></icon>
          </div>
        </div>

        <div class="card" v-if="anomalias.length">
          <div class="card-title">
            <icon name="alert" :size="18" :color="anomaliasCriticas > 0 ? '#dc2626' : '#d97706'"></icon>
            Anomalias ({{ anomalias.length }})
            <span v-if="anomaliasCriticas > 0" class="badge out" style="margin-left:auto">{{ anomaliasCriticas }} criticas</span>
          </div>
          <div v-for="(a, i) in anomalias.slice(0, 5)" :key="i" class="item anomalia-item">
            <div class="info" style="cursor:pointer" @click="ir(a.sec, a.refId)">
              <div class="nm">
                <span class="badge" :class="a.nivel === 'alta' ? 'out' : (a.nivel === 'media' ? 'low' : 'arch')" style="margin-right:.3rem">{{ a.nivel.toUpperCase() }}</span>
                {{ a.titulo }}
              </div>
              <div class="det">{{ a.detalle }}</div>
            </div>
            <button class="icon-btn" @click.stop="descartarAnomalia(a.clave)" aria-label="Descartar" title="Descartar">
              <icon name="x" :size="14" :color="mutColor"></icon>
            </button>
          </div>
          <div v-if="anomalias.length > 5" class="det" style="text-align:center;margin-top:.4rem;font-size:.72rem;color:var(--mut)">
            + {{ anomalias.length - 5 }} mas
          </div>
          <div style="display:flex;justify-content:center;gap:1rem;margin-top:.5rem;flex-wrap:wrap">
            <button v-if="anomalias.length > 1" class="link-btn" @click="descartarTodasAnomalias">Descartar todas</button>
            <button v-if="cfg.anomaliasDescartadas && cfg.anomaliasDescartadas.length" class="link-btn" @click="restaurarAnomalias">
              Restaurar {{ cfg.anomaliasDescartadas.length }} descartada(s)
            </button>
          </div>
        </div>

      </section>

      <!-- ==================== VENTAS ==================== -->
      <section v-if="sec === 'ventas'" class="fade-up">
        <div class="card">
          <div class="card-title"><icon name="cart" :size="18" :color="sec === 'ventas' ? '#2196F3' : mutColor"></icon> Nueva Venta</div>
          <div class="search">
            <input :value="busqVenta" @input="setBusq('busqVenta', $event.target.value)" type="text" placeholder="Buscar producto por nombre o código..."
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
              <div class="cart-controls">
                <div class="cart-field">
                  <label>Cantidad</label>
                  <div class="qty-input">
                    <button type="button" @click="cambiarCant(it, -1)">−</button>
                    <input :value="it.cant" type="text" inputmode="decimal" @input="actualizarCantidadInput(it, $event.target.value)" @blur="validarCant(it)">
                    <button type="button" @click="cambiarCant(it, 1)">+</button>
                  </div>
                </div>
                <div class="cart-field">
                  <label>Precio</label>
                  <input class="price-input" :value="it.precio" type="text" inputmode="decimal" @input="it.precio = $event.target.value" @blur="validarPrecio(it)">
                </div>
              </div>
              <div class="cart-total-line">
                <span>{{ fmt(it.precio) }} × {{ fmtCant(it.cant) }} = <b style="color:var(--pri)">{{ fmt(subTotalItem(it)) }}</b></span>
                <span class="cart-tag" :class="esPrecioEscalon(it) ? 'tag-esc' : 'tag-unit'" v-if="tieneEscalones(it.productoId)">
                  {{ esPrecioEscalon(it) ? 'Por cantidad' : 'Por unidad' }}
                </span>
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
          <div v-if="!carrito.length && !focusVenta" class="det" style="text-align:center;font-size:.75rem;color:var(--mut);padding:.4rem 0">
            Toca el buscador para agregar productos
          </div>
        </div>

        <div class="card">
          <div class="card-title"><icon name="list" :size="18" :color="sec === 'ventas' ? '#2196F3' : mutColor"></icon> Historial de Ventas</div>
          <div class="search"><input :value="busqHist" @input="setBusq('busqHist', $event.target.value)" type="text" placeholder="Buscar en historial..."></div>
          <div v-if="ventasFiltradas.length === 0" class="empty">Sin ventas</div>

          <div v-if="ventasPorPeriodo.actual.length" class="hist-grupo">
            <div class="hist-head">
              <span class="badge ok">ACTUAL</span>
              <span class="hist-titulo">Periodo actual</span>
              <span class="hist-count">{{ ventasPorPeriodo.actual.length }}</span>
            </div>
            <div v-for="v in histItemsMostrados(ventasPorPeriodo.actual, 'ventas')" :key="v.id" v-memo="[v.id, v.anulada, v.total, v.ganancia]" class="item" :class="{ anulada: v.anulada }" :id="'ref-' + v.id">
              <div class="info">
                <div class="nm">{{ v.items.map(x => x.nombre + ' ×' + fmtCant(x.cantidad)).join(', ') }}</div>
                <div class="det">{{ fmtFH(v.fecha) }} · <b style="color:var(--pri)">{{ fmt(v.total) }}</b> · <span class="pos">+{{ fmt(v.ganancia) }}</span></div>
              </div>
              <button v-if="!v.anulada" class="link-btn" @click="anularVenta(v.id)">Anular</button>
              <span v-else class="badge arch">ANULADA</span>
            </div>
            <div v-if="histHayMas(ventasPorPeriodo.actual, 'ventas')" class="hist-mas">
              <button class="link-btn" @click="histMostrarMas('ventas')">Mostrar 20 mas ({{ histRestantes(ventasPorPeriodo.actual, 'ventas') }} restantes)</button>
            </div>
          </div>

          <div v-for="g in ventasPorPeriodo.cerrados" :key="g.cierre.id" class="hist-grupo hist-cerrado">
            <div class="hist-head hist-head-click" @click="histToggle('ventas', g.cierre.id)">
              <span class="badge arch">CERRADO</span>
              <span class="hist-titulo">{{ g.cierre.periodo }}</span>
              <span class="hist-count">{{ g.items.length }}</span>
              <span class="chev" :class="{ open: histAbierto('ventas', g.cierre.id) }">
                <icon name="chevron" :size="14" :color="mutColor"></icon>
              </span>
            </div>
            <div v-if="histAbierto('ventas', g.cierre.id)">
              <div v-for="v in histItemsMostrados(g.items, 'ventas')" :key="v.id" class="item" :class="{ anulada: v.anulada }">
                <div class="info">
                  <div class="nm">{{ v.items.map(x => x.nombre + ' ×' + fmtCant(x.cantidad)).join(', ') }}</div>
                  <div class="det">{{ fmtFH(v.fecha) }} · <b style="color:var(--pri)">{{ fmt(v.total) }}</b> · <span class="pos">+{{ fmt(v.ganancia) }}</span></div>
                </div>
              </div>
              <div v-if="histHayMas(g.items, 'ventas')" class="hist-mas">
                <button class="link-btn" @click="histMostrarMas('ventas')">Mostrar 20 mas</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ==================== COMPRAS ==================== -->
      <section v-if="sec === 'compras'" class="fade-up">
        <div class="card">
          <div class="card-title"><icon name="bag" :size="18" :color="sec === 'compras' ? '#2196F3' : mutColor"></icon> Registrar Compra</div>
          <div v-if="!compraForm.productoId">
            <div class="search">
              <input :value="busqCompra" @input="setBusq('busqCompra', $event.target.value)" type="text" placeholder="Buscar producto..."
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

            <div v-if="empaquesCompraActual.length" style="margin-bottom:.55rem">
              <label style="font-size:.75rem;color:var(--mut);font-weight:700;display:block;margin-bottom:.3rem">Empaque</label>
              <select v-model="compraForm.empaqueSel">
                <option value="">Por unidad (sin empaque)</option>
                <option v-for="e in empaquesCompraActual" :key="e.nombre" :value="e.nombre">{{ e.nombre }} ({{ e.unidades }} und)</option>
              </select>
            </div>

            <div class="grid2">
              <input v-model="compraForm.cantidad" type="number" inputmode="decimal" step="0.001"
                :placeholder="compraForm.empaqueSel ? 'Cant. empaques' : 'Cantidad'">
              <input v-model="compraForm.costo" type="number" inputmode="decimal" step="0.01"
                :placeholder="compraForm.costoPorEmpaque ? 'Costo por empaque' : 'Costo por unidad'">
            </div>

            <div v-if="compraForm.empaqueSel" class="set-row" style="margin-bottom:.4rem">
              <span class="lbl" style="font-size:.78rem">El costo ingresado es por empaque completo</span>
              <label class="switch">
                <input type="checkbox" v-model="compraForm.costoPorEmpaque">
                <span class="slider"></span>
              </label>
            </div>

            <div v-if="n(compraForm.cantidad) > 0 && n(compraForm.costo) >= 0" class="compra-resumen">
              <div v-if="compraForm.empaqueSel" class="row" style="border:none;padding:.2rem 0">
                <span>{{ compraForm.cantidad }} {{ compraForm.empaqueSel }}{{ n(compraForm.cantidad) > 1 ? 's' : '' }}</span>
                <b>= {{ fmtCant(compraCantidadFinal()) }} und</b>
              </div>
              <div class="row" style="border:none;padding:.2rem 0">
                <span>Costo por unidad base</span>
                <b>{{ fmt(compraCostoUnitarioFinal()) }}</b>
              </div>
              <div class="row total" style="border:none;padding:.3rem 0">
                <span>TOTAL</span>
                <b>{{ fmt(m(compraCantidadFinal() * compraCostoUnitarioFinal())) }}</b>
              </div>
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

          <div v-if="comprasPorPeriodo.actual.length" class="hist-grupo">
            <div class="hist-head">
              <span class="badge ok">ACTUAL</span>
              <span class="hist-titulo">Periodo actual</span>
              <span class="hist-count">{{ comprasPorPeriodo.actual.length }}</span>
            </div>
            <div v-for="c in histItemsMostrados(comprasPorPeriodo.actual, 'compras')" :key="c.id" class="item" :id="'ref-' + c.id">
              <div class="info">
                <div class="nm"><icon name="bag" :size="14"></icon> {{ c.productoNombre }}</div>
                <div class="det">{{ fmtFH(c.fecha) }} · {{ fmtCant(c.cantidad) }} × {{ fmt(c.costo) }}</div>
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
                <span v-else class="lock"><icon name="lock" :size="15" :color="mutColor"></icon></span>
              </div>
            </div>
            <div v-if="histHayMas(comprasPorPeriodo.actual, 'compras')" class="hist-mas">
              <button class="link-btn" @click="histMostrarMas('compras')">Mostrar 20 mas ({{ histRestantes(comprasPorPeriodo.actual, 'compras') }} restantes)</button>
            </div>
          </div>

          <div v-for="g in comprasPorPeriodo.cerrados" :key="g.cierre.id" class="hist-grupo hist-cerrado">
            <div class="hist-head hist-head-click" @click="histToggle('compras', g.cierre.id)">
              <span class="badge arch">CERRADO</span>
              <span class="hist-titulo">{{ g.cierre.periodo }}</span>
              <span class="hist-count">{{ g.items.length }}</span>
              <span class="chev" :class="{ open: histAbierto('compras', g.cierre.id) }">
                <icon name="chevron" :size="14" :color="mutColor"></icon>
              </span>
            </div>
            <div v-if="histAbierto('compras', g.cierre.id)">
              <div v-for="c in histItemsMostrados(g.items, 'compras')" :key="c.id" class="item">
                <div class="info">
                  <div class="nm"><icon name="bag" :size="14"></icon> {{ c.productoNombre }}</div>
                  <div class="det">{{ fmtFH(c.fecha) }} · {{ fmtCant(c.cantidad) }} × {{ fmt(c.costo) }}</div>
                </div>
                <b class="neg">{{ fmt(c.total) }}</b>
              </div>
              <div v-if="histHayMas(g.items, 'compras')" class="hist-mas">
                <button class="link-btn" @click="histMostrarMas('compras')">Mostrar 20 mas</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ==================== PRODUCTOS ==================== -->
      <section v-if="sec === 'productos'" class="fade-up">
        <div class="card">
          <div class="card-title"><icon name="tag" :size="18" :color="sec === 'productos' ? '#2196F3' : mutColor"></icon> {{ prodForm.editId ? 'Editar' : 'Agregar' }} Producto</div>
          <input v-model="prodForm.nombre" type="text" placeholder="Nombre del producto">
          <div class="grid2">
            <input v-model="prodForm.precio" type="number" inputmode="decimal" step="0.01" placeholder="Precio base venta">
            <input v-model="prodForm.stockMin" type="number" inputmode="decimal" step="0.1" placeholder="Stock mín.">
          </div>

          <div class="escalones-box">
            <div class="escalones-header">
              <span>Precios por cantidad (opcional)</span>
              <button class="link-btn" @click.prevent="agregarEscalon()">+ Agregar</button>
            </div>
            <div v-if="!prodForm.preciosEscalonados || !prodForm.preciosEscalonados.length" class="det" style="font-size:.72rem;color:var(--mut);padding:.4rem 0">
              Sin escalones. Se usa el precio base para cualquier cantidad.
            </div>
            <div v-for="(e, i) in prodForm.preciosEscalonados" :key="i" class="escalon-row">
              <span class="escalon-lbl">Desde</span>
              <input v-model="e.min" type="number" inputmode="numeric" step="1" placeholder="Cant.">
              <span class="escalon-lbl">a</span>
              <input v-model="e.precio" type="number" inputmode="decimal" step="0.01" placeholder="Precio">
              <button class="icon-btn bad" @click.prevent="quitarEscalon(i)" aria-label="Quitar">
                <icon name="x" :size="14" color="#dc2626"></icon>
              </button>
            </div>
          </div>

          <textarea v-model="prodForm.nota" placeholder="Nota interna (opcional)" rows="2"
            style="resize:none;font-family:inherit;font-size:.85rem"></textarea>

          <div class="escalones-box">
            <div class="escalones-header">
              <span>Empaques (opcional)</span>
              <button class="link-btn" @click.prevent="agregarEmpaque()">+ Agregar</button>
            </div>
            <div class="info-box" style="margin:.3rem 0 .5rem;font-size:.7rem">
              Ej: "Saco" de 40 unidades. Se usara al comprar y para mostrar el stock.
            </div>
            <div v-if="!prodForm.empaques || !prodForm.empaques.length" class="det" style="font-size:.72rem;color:var(--mut);padding:.2rem 0">
              Sin empaques definidos.
            </div>
            <div v-for="(e, i) in prodForm.empaques" :key="i" class="empaque-row">
              <input v-model="e.nombre" type="text" placeholder="Nombre (saco, caja)">
              <input v-model="e.unidades" type="number" inputmode="numeric" step="1" placeholder="Unidades">
              <button class="icon-btn bad" @click.prevent="quitarEmpaque(i)" aria-label="Quitar">
                <icon name="x" :size="14" color="#dc2626"></icon>
              </button>
            </div>
          </div>
          <button class="btn pri" @click="guardarProducto()">
            <icon name="check" :size="16" color="#fff"></icon>
            {{ prodForm.editId ? 'Actualizar' : 'Guardar' }}
          </button>
          <button v-if="prodForm.editId" class="btn ghost" @click="resetProd()">Cancelar</button>
        </div>

        <div class="card">
          <div class="card-title"><icon name="tag" :size="18" :color="sec === 'productos' ? '#2196F3' : mutColor"></icon> Productos</div>
          <div class="search"><input :value="busqProd" @input="setBusq('busqProd', $event.target.value)" type="text" placeholder="Buscar..."></div>
          <div style="text-align:right;margin-bottom:.4rem">
            <button class="btn ghost" style="width:auto;display:inline-block;padding:.3rem .7rem;font-size:.72rem"
              @click="mostrarArchivados = !mostrarArchivados">
              {{ mostrarArchivados ? 'Ocultar archivados' : 'Ver archivados' }}
            </button>
          </div>
          <div v-if="filtroStock" class="info-box" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">
            <span>Filtro: <b>{{ filtroStock === 'agotados' ? 'Agotados' : 'Stock bajo' }}</b></span>
            <button class="link-btn" @click="limpiarFiltroStock">Quitar filtro</button>
          </div>
          <div v-if="prodsFiltrados.length === 0" class="empty">Sin productos</div>
          <div v-for="p in prodsFiltrados" :key="p.id" v-memo="[p.id, p.nombre, p.precio, p.archivado, stock(p.id), prodExpandido[p.id]]" class="prod-wrap" :id="'ref-' + p.id" :class="'prod-' + badgeStock(p)">
            <div class="item" :style="p.archivado ? 'opacity:.5' : ''" style="cursor:pointer"
              @click="prodExpandido[p.id] = !prodExpandido[p.id]">
              <div class="info">
                <div class="nm">
                  {{ p.nombre }}
                </div>
                <div v-if="p.nota" class="det" style="font-size:.72rem;font-style:italic;color:var(--mut);margin-top:.15rem">📝 {{ p.nota }}</div>
                <div class="stock-line">
                  <span class="badge" :class="badgeStock(p)">{{ txtBadge(p) }}</span>
                  <span class="stock-num">Stock: {{ formatStock(p.id, stock(p.id)) }}</span>
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
      <section v-if="sec === 'inventario'" class="fade-up">
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
          <div v-for="g in invAgrupado" :key="g.id" class="inv-group" :id="'ref-' + g.id">
            <div class="inv-head" @click="invExpandido[g.id] = !invExpandido[g.id]">
              <div>
                <div class="nm">{{ g.nombre }}</div>
                <div class="det">Stock {{ formatStock(g.id, g.stockTotal) }} · {{ fmt(g.valorTotal) }}</div>
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


      <!-- ==================== PATRIMONIO ==================== -->
      <section v-if="sec === 'patrimonio'" class="fade-up">
        <div class="balance morado">
          <div class="lbl"><icon name="dollar" :size="14" color="#fff"></icon> Patrimonio Total</div>
          <div class="val">{{ fmt(patrimonioTotal) }}</div>
          <div class="sub">Capital {{ fmt(capitalTotal) }} · Gan. acum. {{ fmt(gananciasAcumuladas) }}</div>
        </div>

        <div class="info-box">
          El detalle contable completo esta en <b>Contabilidad</b>. La gestion de capital, aportes y retiros esta en <b>Socios</b>.
        </div>
      </section>

      <!-- ==================== REPORTES (CON CUADRE NUEVO) ==================== -->
      <section v-if="sec === 'reportes'" class="fade-up">
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
            <input v-model="rep.fechaInicio" type="date" @input="rep.isoInicio = null; rep.isoFin = null; rep.periodoActivo = null">
            <input v-model="rep.fechaFin" type="date" @input="rep.isoInicio = null; rep.isoFin = null; rep.periodoActivo = null">
          </div>
          <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:.35rem;margin-bottom:.5rem">
            <button class="btn" :class="rep.periodoActivo === 'hoy' ? 'pri' : 'ghost'" style="margin:0;padding:.5rem .2rem;font-size:.65rem" @click="setHoy()">Hoy</button>
            <button class="btn" :class="rep.periodoActivo === 'semana' ? 'pri' : 'ghost'" style="margin:0;padding:.5rem .2rem;font-size:.65rem" @click="setSemana()">7d</button>
            <button class="btn" :class="rep.periodoActivo === 'mes' ? 'pri' : 'ghost'" style="margin:0;padding:.5rem .2rem;font-size:.65rem" @click="setMesActual()">Mes</button>
            <button class="btn" :class="rep.periodoActivo === 'mes-ant' ? 'pri' : 'ghost'" style="margin:0;padding:.5rem .2rem;font-size:.65rem" @click="setMesAnterior()">Mes ant</button>
            <button class="btn" :class="rep.periodoActivo === 'anio' ? 'pri' : 'ghost'" style="margin:0;padding:.5rem .2rem;font-size:.65rem" @click="setAnio()">Año</button>
          </div>
          <button class="btn" :class="rep.periodoActivo === 'actual' ? 'pri' : 'ghost'" style="margin-bottom:.5rem;font-size:.72rem" @click="setPeriodoActual()">
            Periodo actual (desde {{ fmtFecha(cfg.periodoInicio) }})
          </button>
          <div v-if="cierresOrdenados.length" style="margin-bottom:.7rem">
            <div class="det" style="font-size:.72rem;color:var(--mut);margin-bottom:.35rem">Periodos cerrados anteriores:</div>
            <div style="display:flex;flex-wrap:wrap;gap:.4rem">
              <button v-for="c in cierresOrdenados.slice(0, 6)" :key="c.id"
                class="btn" :class="rep.periodoActivo === c.id ? 'pri' : 'ghost'"
                style="width:auto;padding:.35rem .7rem;font-size:.68rem;margin:0"
                @click="setPeriodoCierre(c)">
                {{ c.periodo }}
              </button>
            </div>
          </div>
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
                  <template v-for="r in rep.resultado.cuadre" :key="r.id">
                    <tr class="product-row" style="cursor:pointer" @click="r.subfilas.length > 1 ? toggleCuadreProducto(r.id) : null">
                      <td>
                        <span v-if="r.subfilas.length > 1" class="chev" :class="{ open: cuadreExpandido[r.id] }" style="margin-right:.3rem;display:inline-flex">
                          <icon name="chevron" :size="12" :color="mutColor"></icon>
                        </span>
                        <b>{{ r.nombre }}</b>
                        <span v-if="r.subfilas.length > 1" class="badge-lotes">{{ r.subfilas.length }} lotes</span>
                      </td>
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
                    <tr v-if="r.subfilas.length > 1 && cuadreExpandido[r.id]" v-for="(sf, i) in r.subfilas" :key="r.id + '_' + i" class="sub-row">
                      <td class="sub-lote-cell">
                        <span class="sub-arrow">└</span>
                        <span class="sub-num">Lote {{ i + 1 }}</span>
                        <span class="sub-fechas">{{ fmt(sf.costo) }}<span v-if="sf.precio !== null"> → {{ fmt(sf.precio) }}</span><span v-else class="sub-sin-venta"> · sin ventas</span></span>
                      </td>
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
      <section v-if="sec === 'socios'" class="fade-up">
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
              <div class="det">{{ n(s.porcentaje).toFixed(2) }}% · Aporte inicial {{ fmt(s.aporte) }} · Aportes extra {{ fmt(totalAportesSocio(s.id)) }} · Recibido {{ fmt(totalPorSocio(s.id)) }}</div>
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

        <div class="card" style="background:rgba(59,130,246,.06);border-color:rgba(59,130,246,.2)">
          <div style="font-size:.78rem;color:var(--txt-2);line-height:1.55">
            <b>Diferencia:</b> "Repartir" divide la ganancia entre socios por su %.
            "Retirar" saca dinero para ti sin repartir. "Aportar" mete dinero extra.
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
          <div class="card-title"><icon name="dollar" :size="18" :color="sec === 'socios' ? '#2196F3' : mutColor"></icon> Capital Inicial</div>
          <div style="font-size:.82rem;color:var(--mut);margin-bottom:.5rem">
            Actual: <b style="color:var(--txt)">{{ fmt(cfg.capitalInicial || 0) }}</b>
          </div>
          <input v-model="capInicialStr" type="number" inputmode="decimal" step="0.01" placeholder="Nuevo capital inicial">
          <button class="btn pri" @click="guardarCapInicial()">
            <icon name="check" :size="16" color="#fff"></icon> Guardar Capital Inicial
          </button>
        </div>

        <div v-if="aportesSinSocio.length" class="card" style="border:2px solid var(--warn)">
          <div class="card-title"><icon name="alert" :size="18" :color="'#d97706'"></icon> Aportes sin asignar</div>
          <div class="info-box" style="background:rgba(217,119,6,.1);color:var(--warn)">
            Tienes <b>{{ aportesSinSocio.length }}</b> aporte(s) por <b>{{ fmt(aportesSinSocioTotal) }}</b> que no estan asignados a ningun socio (son de antes de crear el modulo de socios).
          </div>
          <select v-model="migrarSocioId">
            <option value="">Elegir socio...</option>
            <option v-for="s in sociosActivos" :key="s.id" :value="s.id">{{ s.nombre }}</option>
          </select>
          <button class="btn warn" @click="asignarAportesViejos()">
            <icon name="check" :size="16" color="#fff"></icon> Asignar a este socio
          </button>
        </div>

        <div class="card">
          <div class="card-title"><icon name="list" :size="18" :color="sec === 'socios' ? '#2196F3' : mutColor"></icon> Historial de capital</div>
          <div v-if="movPatrimonio.length === 0" class="empty">Sin movimientos</div>
          <div v-for="m in movPatrimonio" :key="m.id" class="item">
            <div class="info">
              <div class="nm">{{ m.tipo }}</div>
              <div class="det">{{ fmtFH(m.fecha) }}{{ m.nota ? ' · ' + m.nota : '' }}</div>
            </div>
            <b :class="m.tipo === 'Retiro' ? 'neg' : 'pos'">{{ m.tipo === 'Retiro' ? '-' : '+' }}{{ fmt(m.monto) }}</b>
          </div>
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
      <section v-if="sec === 'gastos'" class="fade-up">
        <div class="balance gastos-bal">
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

          <div v-if="gastosPorPeriodo.actual.length" class="hist-grupo">
            <div class="hist-head">
              <span class="badge ok">ACTUAL</span>
              <span class="hist-titulo">Periodo actual</span>
              <span class="hist-count">{{ gastosPorPeriodo.actual.length }}</span>
            </div>
            <div v-for="g in histItemsMostrados(gastosPorPeriodo.actual, 'gastos')" :key="g.id" class="item">
              <div class="info">
                <div class="nm">{{ g.categoria }} · {{ g.concepto }}</div>
                <div class="det">{{ fmtFH(g.fecha) }} · {{ g.saleDeCaja ? 'Caja' : 'Sin caja' }}</div>
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
            <div v-if="histHayMas(gastosPorPeriodo.actual, 'gastos')" class="hist-mas">
              <button class="link-btn" @click="histMostrarMas('gastos')">Mostrar 20 mas ({{ histRestantes(gastosPorPeriodo.actual, 'gastos') }} restantes)</button>
            </div>
          </div>

          <div v-for="g in gastosPorPeriodo.cerrados" :key="g.cierre.id" class="hist-grupo hist-cerrado">
            <div class="hist-head hist-head-click" @click="histToggle('gastos', g.cierre.id)">
              <span class="badge arch">CERRADO</span>
              <span class="hist-titulo">{{ g.cierre.periodo }}</span>
              <span class="hist-count">{{ g.items.length }}</span>
              <span class="chev" :class="{ open: histAbierto('gastos', g.cierre.id) }">
                <icon name="chevron" :size="14" :color="mutColor"></icon>
              </span>
            </div>
            <div v-if="histAbierto('gastos', g.cierre.id)">
              <div v-for="g in histItemsMostrados(g.items, 'gastos')" :key="g.id" class="item">
                <div class="info">
                  <div class="nm">{{ g.categoria }} · {{ g.concepto }}</div>
                  <div class="det">{{ fmtFH(g.fecha) }}</div>
                </div>
                <b class="neg">-{{ fmt(g.monto) }}</b>
              </div>
              <div v-if="histHayMas(g.items, 'gastos')" class="hist-mas">
                <button class="link-btn" @click="histMostrarMas('gastos')">Mostrar 20 mas</button>
              </div>
            </div>
          </div>
        </div>
      </section>
      <!-- ==================== CONTABILIDAD ==================== -->
      <section v-if="sec === 'contabilidad'" class="fade-up">
        <!-- RESUMEN PRINCIPAL -->
        <div class="balance azul">
          <div class="lbl"><icon name="chart" :size="14" color="#fff"></icon> Resultado del periodo</div>
          <div class="val" :style="gananciaNetaPeriodo >= 0 ? '' : 'color:#fca5a5'">{{ fmt(gananciaNetaPeriodo) }}</div>
          <div class="sub">Margen neto: {{ margenNetoPct }}% · Margen bruto: {{ margenBrutoPct }}%</div>
        </div>

        <!-- KPIs PRINCIPALES -->
        <div class="grid2" style="margin-bottom:.85rem">
          <div class="stat">
            <div class="lbl"><icon name="trend" :size="12" :color="mutColor"></icon> Ingresos</div>
            <div class="val" style="color:var(--pri)">{{ fmt(ventasContadoTotal) }}</div>
          </div>
          <div class="stat">
            <div class="lbl"><icon name="chart" :size="12" :color="mutColor"></icon> COGS</div>
            <div class="val neg">{{ fmt(m(ventasContadoTotal - gananciaBrutaPeriodo)) }}</div>
          </div>
          <div class="stat">
            <div class="lbl"><icon name="dollar" :size="12" :color="mutColor"></icon> Caja</div>
            <div class="val" :style="saldoCaja >= 0 ? 'color:var(--ok-d)' : 'color:var(--bad)'">{{ fmt(saldoCaja) }}</div>
          </div>
          <div class="stat">
            <div class="lbl"><icon name="package" :size="12" :color="mutColor"></icon> Inventario</div>
            <div class="val" style="color:var(--pri)">{{ fmt(valorInventario) }}</div>
          </div>
        </div>

        <!-- POSICION FINANCIERA -->
        <div class="card" style="background:linear-gradient(135deg,rgba(59,130,246,.06) 0%,rgba(59,130,246,.02) 100%);border-color:rgba(59,130,246,.15)">
          <div class="card-title"><icon name="dollar" :size="18" :color="'#3B82F6'"></icon> Posicion financiera</div>
          <div class="row"><span>Activos (Caja + Inventario)</span><b class="pos">{{ fmt(activosTotal) }}</b></div>
          <div class="row"><span>Pasivos (deudas)</span><b :class="pasivosTotalReal > 0 ? 'neg' : ''">{{ fmt(pasivosTotalReal) }}</b></div>
          <div class="row total"><span>= PATRIMONIO NETO</span><span>{{ fmt(activosTotal - pasivosTotalReal) }}</span></div>
        </div>

        <!-- AVISO: desgloses mas abajo -->
        <div class="info-box" style="text-align:center;font-size:.75rem;margin-bottom:.85rem">
          ↓ Desgloses detallados ↓
        </div>

        <div class="card">
          <div class="card-title"><icon name="chart" :size="18" :color="sec === 'contabilidad' ? '#2196F3' : mutColor"></icon> Resumen contable</div>
          <div class="row"><span>Capital inicial</span><span>{{ fmt(cfg.capitalInicial || 0) }}</span></div>
          <div class="row"><span>Aportes</span><span class="pos">+{{ fmt(aportesTotal) }}</span></div>
          <div class="row total"><span>= CAPITAL</span><span>{{ fmt(capitalTotal) }}</span></div>
          <div class="row" style="margin-top:.5rem"><span>Caja</span><span>{{ fmt(saldoCaja) }}</span></div>
          <div class="row"><span>Inventario</span><span>{{ fmt(valorInventario) }}</span></div>
          <div class="row total"><span>= ACTIVOS</span><span>{{ fmt(saldoCaja + valorInventario) }}</span></div>
          <div class="row" style="margin-top:.5rem"><span>Ganancia bruta</span><span>{{ fmt(gananciaBrutaPeriodo) }}</span></div>
          <div class="row"><span>Gastos operativos</span><span class="neg">-{{ fmt(gastosOpPeriodo) }}</span></div>
          <div class="row total"><span>= Ganancia neta (periodo)</span>
            <span :class="gananciaNetaPeriodo >= 0 ? 'pos' : 'neg'">{{ fmt(gananciaNetaPeriodo) }}</span>
          </div>
          <div class="row hl">
            <span>DISPONIBLE PARA RETIRO</span>
            <b :class="gananciaDisponible >= 0 ? 'pos' : 'neg'">{{ fmt(gananciaDisponible) }}</b>
          </div>
        </div>

        <div class="card contab-card">
          <div class="card-title contab-toggle" @click="toggleContab('situacion')">
            <icon name="chart" :size="18" :color="sec === 'contabilidad' ? '#2196F3' : mutColor"></icon>
            Balance de situacion
            <span class="chev" :class="{ open: contabExpandido.situacion }" style="margin-left:auto">
              <icon name="chevron" :size="16" :color="mutColor"></icon>
            </span>
          </div>
          <div v-if="contabExpandido.situacion">
          <div class="row"><span>Activos (Caja + Inventario)</span><b class="pos">{{ fmt(activosTotal) }}</b></div>
          <div class="row" style="padding-left:1rem;font-size:.78rem"><span>Caja</span><span>{{ fmt(saldoCaja) }}</span></div>
          <div class="row" style="padding-left:1rem;font-size:.78rem"><span>Inventario</span><span>{{ fmt(valorInventario) }}</span></div>
          <div class="row"><span>Pasivos</span><b>{{ fmt(pasivosTotalReal) }}</b></div>
          <div class="row total"><span>= ACTIVO NETO</span><span>{{ fmt(activosTotal - pasivosTotalReal) }}</span></div>
          <div class="row" style="margin-top:.5rem"><span>Capital</span><span class="pos">{{ fmt(capitalTotal) }}</span></div>
          <div class="row"><span>Ganancias acumuladas</span><span class="pos">{{ fmt(gananciasAcumuladas) }}</span></div>
          <div class="row"><span>Retiros</span><span class="neg">-{{ fmt(retirosTotal) }}</span></div>
          <div class="row total"><span>= PATRIMONIO</span><span>{{ fmt(patrimonioTotal - retirosTotal + 0) }}</span></div>
          </div>
        </div>

        <div class="card contab-card">
          <div class="card-title contab-toggle" @click="toggleContab('resultados')">
            <icon name="file" :size="18" :color="sec === 'contabilidad' ? '#2196F3' : mutColor"></icon>
            Estado de resultados
            <span class="chev" :class="{ open: contabExpandido.resultados }" style="margin-left:auto">
              <icon name="chevron" :size="16" :color="mutColor"></icon>
            </span>
          </div>
          <div v-if="contabExpandido.resultados">
          <div class="row"><span>Ingresos por ventas</span><b class="pos">{{ fmt(ventasContadoTotal) }}</b></div>
          <div class="row"><span>(-) Costo de lo vendido</span><b class="neg">{{ fmt(-1 * m(ventasContadoTotal - gananciaBrutaPeriodo)) }}</b></div>
          <div class="row total"><span>= GANANCIA BRUTA</span><span>{{ fmt(gananciaBrutaPeriodo) }} <span style="font-weight:400;font-size:.78rem">({{ margenBrutoPct }}%)</span></span></div>
          <div class="row" style="margin-top:.5rem"><span>(-) Gastos operativos</span><span class="neg">-{{ fmt(gastosOpPeriodo) }}</span></div>
          <div class="row"><span>(-) Mermas</span><span class="neg">-{{ fmt(this.ajustes.filter(a => a.cantidad < 0 && new Date(a.fecha) >= new Date(cfg.periodoInicio)).reduce((s,a) => s + n(a.costoPerdida), 0)) }}</span></div>
          <div class="row total"><span>= GANANCIA NETA</span>
            <span :class="gananciaNetaPeriodo >= 0 ? 'pos' : 'neg'">{{ fmt(gananciaNetaPeriodo) }} <span style="font-weight:400;font-size:.78rem">({{ margenNetoPct }}%)</span></span>
          </div>
          </div>
        </div>

        <div class="card contab-card">
          <div class="card-title contab-toggle" @click="toggleContab('balance')">
            <icon name="dollar" :size="18" :color="sec === 'contabilidad' ? '#2196F3' : mutColor"></icon>
            Balance general
            <span class="chev" :class="{ open: contabExpandido.balance }" style="margin-left:auto">
              <icon name="chevron" :size="16" :color="mutColor"></icon>
            </span>
          </div>
          <div v-if="contabExpandido.balance">
          <div class="info-box" style="margin-bottom:.6rem;font-size:.72rem">
            Activo = Pasivo + Patrimonio
          </div>
          <div class="row" style="font-weight:800;color:var(--pri)"><span>ACTIVOS</span><span>{{ fmt(activosTotal) }}</span></div>
          <div class="row" style="padding-left:1rem;font-size:.78rem"><span>Caja</span><span>{{ fmt(saldoCaja) }}</span></div>
          <div class="row" style="padding-left:1rem;font-size:.78rem"><span>Inventario</span><span>{{ fmt(valorInventario) }}</span></div>
          <div class="row" style="font-weight:800;color:var(--pri);margin-top:.5rem"><span>PASIVOS</span><span class="neg">{{ fmt(pasivosTotalReal) }}</span></div>
          <div v-if="pasivosActivos.length === 0" class="row" style="padding-left:1rem;font-size:.78rem;color:var(--mut)"><span>Sin deudas activas</span><span>{{ fmt(0) }}</span></div>
          <div v-for="p in pasivosActivos" :key="p.id" class="row" style="padding-left:1rem;font-size:.78rem">
            <span>{{ p.acreedor }}{{ p.vencimiento && new Date(p.vencimiento) < new Date() ? ' ⚠ vencido' : '' }}</span>
            <span class="neg">{{ fmt(p.monto) }}</span>
          </div>
          <div class="row" style="font-weight:800;color:var(--pri);margin-top:.5rem"><span>PATRIMONIO</span><span>{{ fmt(capitalTotal + gananciasAcumuladas - retirosTotal) }}</span></div>
          <div class="row" style="padding-left:1rem;font-size:.78rem"><span>Capital inicial</span><span>{{ fmt(cfg.capitalInicial || 0) }}</span></div>
          <div v-if="aportesTotal > 0" class="row" style="padding-left:1rem;font-size:.78rem"><span>Aportes</span><span>{{ fmt(aportesTotal) }}</span></div>
          <template v-for="s in sociosActivos" :key="'ap_' + s.id">
            <div v-if="totalAportesSocio(s.id) > 0" class="row" style="padding-left:2rem;font-size:.72rem;color:var(--mut)">
              <span>· {{ s.nombre }}</span><span>{{ fmt(totalAportesSocio(s.id)) }}</span>
            </div>
          </template>
          <div v-if="aportesSinSocioTotal > 0" class="row" style="padding-left:2rem;font-size:.72rem;color:var(--mut)">
            <span>· Sin asignar</span><span>{{ fmt(aportesSinSocioTotal) }}</span>
          </div>
          <div class="row" style="padding-left:1rem;font-size:.78rem"><span>Ganancias acumuladas</span><span>{{ fmt(gananciasAcumuladas) }}</span></div>
          <div class="row" style="padding-left:1rem;font-size:.78rem"><span>Retiros</span><span class="neg">-{{ fmt(retirosTotal) }}</span></div>
          <div class="row total"><span>= PASIVO + PATRIMONIO</span><span>{{ fmt(pasivosTotalReal + capitalTotal + gananciasAcumuladas - retirosTotal) }}</span></div>
          <div class="row" :class="Math.abs(activosTotal - (pasivosTotal + capitalTotal + gananciasAcumuladas - retirosTotal)) < 0.01 ? 'pos' : 'neg'">
            <span>Cuadre contable</span>
            <b>{{ Math.abs(activosTotal - (pasivosTotalReal + capitalTotal + gananciasAcumuladas - retirosTotal)) < 0.01 ? 'OK: Cuadra' : 'DESCUADRE: ' + fmt(activosTotal - (pasivosTotalReal + capitalTotal + gananciasAcumuladas - retirosTotal)) }}</b>
          </div>
          </div>
        </div>

        <div class="card contab-card">
          <div class="card-title contab-toggle" @click="toggleContab('flujo')">
            <icon name="wallet" :size="18" :color="sec === 'contabilidad' ? '#2196F3' : mutColor"></icon>
            Flujo de caja
            <span class="chev" :class="{ open: contabExpandido.flujo }" style="margin-left:auto">
              <icon name="chevron" :size="16" :color="mutColor"></icon>
            </span>
          </div>
          <div v-if="contabExpandido.flujo">
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
          <div class="card-title"><icon name="credit-card" :size="18" :color="sec === 'contabilidad' ? '#2196F3' : mutColor"></icon> Cuentas por pagar ({{ pasivosActivos.length }})</div>
          <div class="row total">
            <span>Deuda activa</span>
            <span class="neg">{{ fmt(pasivosTotalReal) }}</span>
          </div>
          <div v-if="pasivosVencidos.length" class="alert-box" style="margin:.5rem 0">
            <icon name="alert" :size="14" color="#d97706"></icon>
            {{ pasivosVencidos.length }} deuda(s) vencida(s)
          </div>

          <div style="margin-top:.6rem;border-top:1px solid var(--brd);padding-top:.6rem">
            <div style="font-size:.78rem;font-weight:800;color:var(--pri);margin-bottom:.4rem">{{ pasivoForm.editId ? 'Editar' : 'Nueva' }} deuda</div>
            <input v-model="pasivoForm.acreedor" type="text" placeholder="Acreedor (proveedor, banco, persona)">
            <input v-model="pasivoForm.concepto" type="text" placeholder="Concepto (ej: compra a credito)">
            <div class="grid2">
              <input v-model="pasivoForm.monto" type="number" inputmode="decimal" step="0.01" placeholder="Monto">
              <input v-model="pasivoForm.fecha" type="date">
            </div>
            <input v-model="pasivoForm.vencimiento" type="date" placeholder="Vencimiento (opcional)">
            <input v-model="pasivoForm.nota" type="text" placeholder="Nota (opcional)">
            <button class="btn warn" @click="guardarPasivo()">
              <icon name="check" :size="16" color="#fff"></icon>
              {{ pasivoForm.editId ? 'Actualizar' : 'Registrar deuda' }}
            </button>
            <button v-if="pasivoForm.editId" class="btn ghost" @click="resetPasivo()">Cancelar</button>
          </div>

          <div v-if="pasivosActivos.length" style="margin-top:.8rem">
            <div style="font-size:.78rem;font-weight:800;color:var(--pri);margin-bottom:.4rem">Deudas activas</div>
            <div v-for="p in pasivosActivos" :key="p.id" class="item" style="flex-direction:column;align-items:stretch;gap:.3rem">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:.5rem">
                <div class="nm">{{ p.acreedor }}</div>
                <b class="neg">{{ fmt(p.monto) }}</b>
              </div>
              <div class="det" style="font-size:.72rem">
                {{ p.concepto }} · {{ fmtFecha(p.fecha) }}
                <span v-if="p.vencimiento" :style="new Date(p.vencimiento) < new Date() ? 'color:var(--bad);font-weight:700' : ''">
                  · Vence {{ fmtFecha(p.vencimiento) }}
                </span>
              </div>
              <div class="act-btns" style="justify-content:flex-end">
                <button class="btn ok" style="width:auto;padding:.3rem .7rem;font-size:.72rem;margin:0" @click="pagarPasivo(p.id)">
                  <icon name="check" :size="12" color="#fff"></icon> Pagar
                </button>
                <button class="icon-btn" @click="editarPasivo(p.id)" aria-label="Editar">
                  <icon name="edit" :size="14" :color="txtColor"></icon>
                </button>
                <button class="icon-btn bad" @click="eliminarPasivo(p.id)" aria-label="Eliminar">
                  <icon name="trash" :size="14" color="#dc2626"></icon>
                </button>
              </div>
            </div>
          </div>

          <div v-if="pasivos.filter(p => p.pagado).length" style="margin-top:.8rem">
            <div style="font-size:.78rem;font-weight:800;color:var(--mut);margin-bottom:.4rem">Pagadas recientemente</div>
            <div v-for="p in pasivos.filter(x => x.pagado).slice(0, 5)" :key="p.id" class="item" style="opacity:.6">
              <div class="info">
                <div class="nm">{{ p.acreedor }}</div>
                <div class="det">Pagada {{ fmtFecha(p.fechaPago || p.fecha) }}</div>
              </div>
              <b>{{ fmt(p.monto) }}</b>
            </div>
          </div>
        </div>

        <div class="card contab-card">
          <div class="card-title contab-toggle" @click="toggleContab('libro')">
            <icon name="file" :size="18" :color="sec === 'contabilidad' ? '#2196F3' : mutColor"></icon>
            Libro diario ({{ asientosFiltrados.length }})
            <span class="chev" :class="{ open: contabExpandido.libro }" style="margin-left:auto">
              <icon name="chevron" :size="16" :color="mutColor"></icon>
            </span>
          </div>
          <div v-if="contabExpandido.libro">
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
        </div>
      </section>

      <!-- ==================== AUDITORIA ==================== -->
      <section v-if="sec === 'auditoria'" class="fade-up">
        <div v-if="!auditActiva" class="balance morado">
          <div class="lbl"><icon name="check" :size="14" color="#fff"></icon> Auditoria fisica</div>
          <div v-if="ultimaAuditoria" class="val" :class="ultimaAuditoria.resumen.totalDif >= 0 ? '' : ''">{{ fmt(ultimaAuditoria.resumen.totalDif) }}</div>
          <div v-else class="val">Sin auditorias</div>
          <div v-if="ultimaAuditoria" class="sub">Ultima: hace {{ auditDiasDesde }} dia(s) · {{ ultimaAuditoria.resumen.totalContados || ultimaAuditoria.inventario.items.length }} productos</div>
          <div v-else class="sub">Nunca has hecho una auditoria</div>
        </div>

        <!-- SIN AUDITORIA ACTIVA -->
        <div v-if="!auditActiva">
          <div class="card">
            <div class="card-title"><icon name="check" :size="18" :color="sec === 'auditoria' ? '#2196F3' : mutColor"></icon> Iniciar auditoria</div>
            <div class="info-box" style="margin-bottom:.5rem">
              Une arqueo de caja + conteo de inventario en un solo flujo. Al cerrar se registran los ajustes automaticamente.
            </div>
            <button class="btn pri" @click="iniciarAuditoria()">
              <icon name="plus" :size="16" color="#fff"></icon> Nueva auditoria
            </button>
          </div>

          <div class="card" v-if="auditoriasOrdenadas.length">
            <div class="card-title"><icon name="list" :size="18" :color="sec === 'auditoria' ? '#2196F3' : mutColor"></icon> Historial</div>
            <div v-for="a in auditoriasOrdenadas" :key="a.id" class="audit-hist">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <b>{{ fmtFH(a.fechaFin) }}</b>
                <b :class="a.resumen.totalDif >= 0 ? 'pos' : 'neg'">{{ fmt(a.resumen.totalDif) }}</b>
              </div>
              <div class="det" style="font-size:.72rem;color:var(--mut);margin-top:.2rem">
                Caja: {{ fmt(a.caja.diferencia) }} · Inv: {{ fmt(a.resumen.difInventarioCosto) }} · {{ a.inventario.items.filter(x => x.activo).length }} contados
              </div>
            </div>
          </div>
        </div>

        <!-- AUDITORIA ACTIVA -->
        <div v-else>
          <div class="audit-steps">
            <div class="audit-step" :class="{ activo: auditForm.paso === 1, done: auditForm.paso > 1 }">
              <span class="audit-step-num">1</span> Caja
            </div>
            <div class="audit-step" :class="{ activo: auditForm.paso === 2, done: auditForm.paso > 2 }">
              <span class="audit-step-num">2</span> Inventario
            </div>
            <div class="audit-step" :class="{ activo: auditForm.paso === 3 }">
              <span class="audit-step-num">3</span> Resumen
            </div>
          </div>

          <!-- PASO 1: CAJA -->
          <div v-if="auditForm.paso === 1" class="card">
            <div class="card-title"><icon name="wallet" :size="18"></icon> Paso 1 · Arqueo de caja</div>
            <div class="row"><span>Sistema dice</span><b>{{ fmt(saldoCaja) }}</b></div>
            <input v-model="auditForm.cajaContada" type="number" inputmode="decimal" step="0.01" placeholder="Monto contado fisicamente">
            <div v-if="auditForm.cajaContada !== ''" class="arqueo-prev" :class="Math.abs(n(auditForm.cajaContada) - saldoCaja) < 0.01 ? 'cuadre' : (n(auditForm.cajaContada) > saldoCaja ? 'sobrante' : 'faltante')">
              Diferencia: <b>{{ fmt(n(auditForm.cajaContada) - saldoCaja) }}</b>
              <span v-if="Math.abs(n(auditForm.cajaContada) - saldoCaja) < 0.01"> (exacto ✓)</span>
            </div>
            <input v-model="auditForm.cajaNota" type="text" placeholder="Nota (opcional)">
            <div class="grid2">
              <button class="btn ghost" @click="cancelarAuditoria()">Cancelar</button>
              <button class="btn pri" @click="auditSiguientePaso()">Siguiente →</button>
            </div>
          </div>

          <!-- PASO 2: INVENTARIO -->
          <div v-if="auditForm.paso === 2" class="card">
            <div class="card-title"><icon name="package" :size="18"></icon> Paso 2 · Conteo de inventario</div>
            <div class="info-box" style="margin-bottom:.5rem">
              Deja vacio lo que no cuentes. Solo se ajustaran los productos donde pongas cantidad.
            </div>
            <div class="grid2" style="margin-bottom:.5rem">
              <button class="btn ghost" style="margin-bottom:0;font-size:.72rem" @click="marcarTodoIgual">
                <icon name="check" :size="12" :color="mutColor"></icon> Todo igual
              </button>
              <button class="btn ghost" style="margin-bottom:0;font-size:.72rem" @click="limpiarConteos">
                <icon name="x" :size="12" :color="mutColor"></icon> Limpiar
              </button>
            </div>
            <div class="audit-lista">
              <div v-for="item in auditConteoActual" :key="item.productoId" class="audit-item" :class="{ 'audit-con-dif': item.activo && item.dif !== 0 }">
                <div style="flex:1;min-width:0">
                  <div class="nm" style="font-size:.85rem;font-weight:700">{{ item.nombre }}</div>
                  <div class="det" style="font-size:.7rem;color:var(--mut)">Sistema: {{ fmtCant(item.sistema) }}</div>
                </div>
                <input type="number" inputmode="decimal" step="0.01" class="audit-input"
                  :value="auditForm.conteos[item.productoId]?.contado ?? ''"
                  @input="setAuditConteo(item.productoId, $event.target.value)"
                  placeholder="contado">
                <div class="audit-dif" v-if="item.activo" :class="item.dif > 0 ? 'pos' : (item.dif < 0 ? 'neg' : '')">
                  {{ item.dif > 0 ? '+' : '' }}{{ item.dif }}
                </div>
                <div class="audit-dif" v-else style="width:2.5rem"></div>
              </div>
            </div>
            <div class="grid2" style="margin-top:.6rem">
              <button class="btn ghost" @click="auditPasoAnterior()">← Atras</button>
              <button class="btn pri" @click="auditSiguientePaso()">Resumen →</button>
            </div>
          </div>

          <!-- PASO 3: RESUMEN -->
          <div v-if="auditForm.paso === 3 && auditResumen" class="card">
            <div class="card-title"><icon name="chart" :size="18"></icon> Paso 3 · Resumen</div>
            <div class="row"><span>Caja sistema</span><span>{{ fmt(auditResumen.cajaSistema) }}</span></div>
            <div class="row"><span>Caja contada</span><span>{{ fmt(auditResumen.cajaContada) }}</span></div>
            <div class="row"><span>Diferencia caja</span><b :class="auditResumen.difCaja >= 0 ? 'pos' : 'neg'">{{ fmt(auditResumen.difCaja) }}</b></div>
            <div class="row" style="margin-top:.4rem"><span>Productos contados</span><span>{{ auditResumen.totalContados }} / {{ auditResumen.totalProductos }}</span></div>
            <div class="row"><span>Diferencia inventario (costo)</span><b :class="auditResumen.difInventarioCosto >= 0 ? 'pos' : 'neg'">{{ fmt(auditResumen.difInventarioCosto) }}</b></div>
            <div class="row total"><span>= DIFERENCIA TOTAL</span><span :class="auditResumen.totalDif >= 0 ? 'pos' : 'neg'">{{ fmt(auditResumen.totalDif) }}</span></div>

            <div v-if="auditResumen.conteo.filter(x => x.dif !== 0).length" style="margin-top:.6rem">
              <div class="card-title" style="margin-top:0;font-size:.85rem"><icon name="alert" :size="14"></icon> Ajustes a aplicar</div>
              <div v-for="c in auditResumen.conteo.filter(x => x.dif !== 0)" :key="c.productoId" class="row" style="font-size:.78rem">
                <span>{{ c.nombre }}</span>
                <b :class="c.dif > 0 ? 'pos' : 'neg'">{{ c.dif > 0 ? '+' : '' }}{{ c.dif }} und ({{ fmt(c.costoDif) }})</b>
              </div>
            </div>

            <div class="grid2" style="margin-top:.6rem">
              <button class="btn ghost" @click="auditPasoAnterior()">← Atras</button>
              <button class="btn ok" @click="cerrarAuditoria()">
                <icon name="check" :size="16" color="#fff"></icon> Cerrar auditoria
              </button>
            </div>
          </div>
        </div>
      </section>

    </main>

    <!-- ==================== BOTTOM NAV ==================== -->
    <BottomNav
      :sec="sec"
      :mas-activo="masActivo"
      :anomalias-criticas="anomaliasCriticas"
      @ir="ir"
      @toggle-mas="masAbierto = !masAbierto"
    />

    <!-- MORE MENU SHEET -->
    <SheetMas
      :abierto="masAbierto"
      :sec="sec"
      @cerrar="masAbierto = false"
      @ir="ir"
      @abrir-ajustes="masAbierto = false; ajustesAbierto = true"
    />

    <!-- ==================== SETTINGS MODAL ==================== -->
    <div v-if="ajustesAbierto" class="modal no-print" @click.self="ajustesAbierto = false">
      <div class="modal-box" @click.stop>
        <div class="modal-title"><icon name="settings" :size="20"></icon> Ajustes</div>

        <div class="set-group">Interfaz</div>
        <div class="set-row">
          <span class="lbl"><icon name="list" :size="18"></icon> Modo compacto</span>
          <label class="switch">
            <input type="checkbox" v-model="cfg.modoCompacto" @change="aplicarModoCompacto">
            <span class="slider"></span>
          </label>
        </div>
        <div style="font-size:.72rem;color:var(--mut);margin-bottom:.6rem">
          Reduce el espaciado para ver mas informacion en pantalla.
        </div>

        <div class="set-group">Tienda</div>
        <div class="set-row">
          <span class="lbl"><icon name="store" :size="18"></icon> Nombre de tienda</span>
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

        <div class="set-group" style="cursor:pointer;display:flex;justify-content:space-between;align-items:center" @click="umbralesAbierto = !umbralesAbierto">
          <span>Alertas y umbrales</span>
          <icon name="chevron" :size="14" :color="mutColor" :style="umbralesAbierto ? 'transform:rotate(180deg)' : ''"></icon>
        </div>
        <div v-if="umbralesAbierto">
          <div class="set-row">
            <span class="lbl">Cierre pendiente (dias)</span>
            <input v-model.number="cfg.umbralDiasCierre" type="number" min="1" style="width:5rem;margin:0;padding:.3rem .5rem" @change="guardarCfg">
          </div>
          <div class="set-row">
            <span class="lbl">Mermas por semana</span>
            <input v-model.number="cfg.umbralMermasSemana" type="number" min="1" style="width:5rem;margin:0;padding:.3rem .5rem" @change="guardarCfg">
          </div>
          <div class="set-row">
            <span class="lbl">Faltantes por mes</span>
            <input v-model.number="cfg.umbralFaltantesMes" type="number" min="1" style="width:5rem;margin:0;padding:.3rem .5rem" @change="guardarCfg">
          </div>
          <div class="set-row">
            <span class="lbl">Sobrantes por mes</span>
            <input v-model.number="cfg.umbralSobrantesMes" type="number" min="1" style="width:5rem;margin:0;padding:.3rem .5rem" @change="guardarCfg">
          </div>
          <div class="set-row">
            <span class="lbl">Dias sin backup</span>
            <input v-model.number="cfg.umbralBackupDias" type="number" min="1" style="width:5rem;margin:0;padding:.3rem .5rem" @change="guardarCfg">
          </div>
          <div class="set-row">
            <span class="lbl">Dias sin movimiento</span>
            <input v-model.number="cfg.umbralSinMovimientoDias" type="number" min="7" style="width:5rem;margin:0;padding:.3rem .5rem" @change="guardarCfg">
          </div>
          <div class="set-row">
            <span class="lbl">Descuento maximo (%)</span>
            <input v-model.number="cfg.umbralDescuentoPct" type="number" min="0" max="100" style="width:5rem;margin:0;padding:.3rem .5rem" @change="guardarCfg">
          </div>
          <div class="set-row">
            <span class="lbl">Stock minimo default</span>
            <input v-model.number="cfg.stockMinDefault" type="number" min="0" style="width:5rem;margin:0;padding:.3rem .5rem" @change="guardarCfg">
          </div>
        </div>

        <div class="set-group">Datos</div>
        <button class="btn pri" @click="exportar"><icon name="download" :size="16" color="#fff"></icon> Exportar respaldo (JSON)</button>
        <button class="btn pri" @click="exportarCifrado" style="background:linear-gradient(135deg,#7C3AED 0%,#5B21B6 100%)">
          <icon name="lock" :size="16" color="#fff"></icon> Exportar respaldo cifrado
        </button>
        <button class="btn ghost" @click="triggerImport"><icon name="upload" :size="16" :color="mutColor"></icon> Importar datos</button>
        <input type="file" id="impFile" accept=".json" style="display:none" @change="onImportFile">
        <div v-if="ultimoBackup" style="font-size:.75rem;color:var(--mut);margin-top:.3rem">
          Último backup auto: {{ fmtFH(ultimoBackup.fecha) }}
          <button class="link-btn" @click="restaurarBackupAuto">Restaurar backup automático</button>
        </div>

        <div class="set-group">Notificaciones</div>
        <div v-if="!soportaNotif" class="info-box" style="background:rgba(220,38,38,.1);color:var(--bad);border-color:var(--bad);font-size:.75rem">
          Este dispositivo no soporta notificaciones del sistema. En iPhone necesitas instalar la app como PWA (Compartir > Agregar a pantalla de inicio).
        </div>
        <div class="set-row" v-if="soportaNotif">
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

        <div class="set-group">Ventas</div>
        <div class="set-row">
          <span class="lbl"><icon name="dollar" :size="18"></icon> Calculadora de billetes al cobrar</span>
          <label class="switch">
            <input type="checkbox" v-model="cfg.calcBilletesActiva" @change="guardarCfg">
            <span class="slider"></span>
          </label>
        </div>
        <div style="font-size:.72rem;color:var(--mut);margin-top:.2rem;margin-bottom:.5rem">
          Muestra un panel de denominaciones (10, 20, 50...) para contar el efectivo al cobrar.
        </div>

        <div class="set-group">Backup en Telegram</div>
        <div class="info-box" style="font-size:.72rem">
          Guarda tus respaldos en Telegram (ilimitado, gratis). Crea un bot con <b>@BotFather</b>, pega el token abajo, abrelo en Telegram y envia <b>/start</b>.
        </div>
        <div v-if="tgEstado === 'conectado'" class="tg-conectado">
          <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.5rem">
            <div class="tg-dot"></div>
            <span style="font-size:.8rem"><b>Conectado:</b> {{ cfg.tgNombre || cfg.tgChatId }}</span>
          </div>
          <div style="font-size:.72rem;color:var(--mut);margin-bottom:.6rem">
            Ultimo backup: {{ cfg.tgUltimoBackup ? fmtFH(cfg.tgUltimoBackup) : 'nunca' }}
            <span v-if="tgColaPendiente > 0" style="color:var(--warn);font-weight:700"> · {{ tgColaPendiente }} en cola</span>
          </div>

          <div v-if="tgProgreso" class="tg-progreso">
            <div class="tg-spinner"></div>
            <span>{{ tgProgreso }}</span>
          </div>

          <div class="set-row">
            <span class="lbl" style="font-size:.78rem">Backup automatico (cada 24h)</span>
            <label class="switch">
              <input type="checkbox" v-model="cfg.tgAutoBackup" @change="guardarCfg">
              <span class="slider"></span>
            </label>
          </div>

          <div class="set-row">
            <span class="lbl" style="font-size:.78rem">Mantener ultimos</span>
            <input v-model.number="cfg.tgMantenerN" type="number" min="1" max="100" style="width:4rem;margin:0;padding:.3rem .5rem;text-align:center" @change="guardarCfg">
          </div>

          <div class="tg-seccion">
            <div style="font-size:.78rem;font-weight:800;color:var(--pri);margin-bottom:.4rem">Guardar en carpeta del telefono</div>
            <div v-if="cfg.tgCarpetaActiva" style="font-size:.72rem;color:var(--ok);margin-bottom:.4rem">
              <b>Carpeta:</b> {{ cfg.tgCarpetaNombre }}
            </div>
            <div v-else style="font-size:.72rem;color:var(--mut);margin-bottom:.4rem">
              Sin carpeta configurada. Se guardara solo en Telegram.
            </div>
            <div class="grid2">
              <button class="btn ghost" style="margin:0;font-size:.72rem;padding:.5rem" @click="elegirCarpeta">
                <icon name="download" :size="12" :color="mutColor"></icon> {{ cfg.tgCarpetaActiva ? 'Cambiar' : 'Elegir carpeta' }}
              </button>
              <button v-if="cfg.tgCarpetaActiva" class="btn ghost" style="margin:0;font-size:.72rem;padding:.5rem" @click="quitarCarpeta">
                Quitar
              </button>
            </div>
          </div>

          <div class="grid2" style="margin-top:.6rem">
            <button class="btn pri" style="margin:0;font-size:.75rem;padding:.6rem" :disabled="tgCargando" @click="tgBackupAhora">
              <icon name="upload" :size="14" color="#fff"></icon> Backup ahora
            </button>
            <button class="btn ghost" style="margin:0;font-size:.75rem;padding:.6rem" :disabled="tgCargando" @click="tgListar">
              <icon name="refresh" :size="14" :color="mutColor"></icon> Ver backups
            </button>
          </div>
          <button v-if="tgColaPendiente > 0" class="btn warn" style="margin-top:.5rem;font-size:.72rem" @click="tgProcesarCola">
            Procesar {{ tgColaPendiente }} en cola
          </button>
          <button class="btn ghost" style="margin-top:.5rem;font-size:.72rem" @click="tgDesconectar">
            Desconectar Telegram
          </button>

          <div v-if="tgBackups.length" class="tg-lista">
            <div style="font-size:.75rem;font-weight:800;margin-bottom:.4rem;color:var(--pri)">Backups disponibles</div>
            <div v-for="bk in tgBackups.slice(0, 10)" :key="bk.messageId" class="tg-bk">
              <div style="flex:1;min-width:0">
                <div style="font-size:.78rem;font-weight:700">{{ fmtFH(bk.fecha) }}</div>
                <div style="font-size:.68rem;color:var(--mut)">{{ (bk.fileSize/1024).toFixed(1) }} KB</div>
              </div>
              <button class="icon-btn ok" @click="tgRestaurar(bk)" aria-label="Restaurar">
                <icon name="download" :size="14" color="#16a34a"></icon>
              </button>
              <button class="icon-btn bad" @click="tgEliminar(bk)" aria-label="Eliminar">
                <icon name="trash" :size="14" color="#dc2626"></icon>
              </button>
            </div>
          </div>
        </div>

        <div v-else>
          <div v-if="tgEstado === 'esperando-start'" class="info-box" style="background:rgba(59,130,246,.08);border-color:var(--pri);font-size:.78rem">
            <b>Esperando conexion...</b><br>
            Abre Telegram, busca el bot y enviale <b>/start</b>. La app lo detecta automaticamente en 5 segundos.
            <div style="margin-top:.5rem;display:flex;align-items:center;gap:.4rem">
              <div class="tg-loading-dot"></div>
              <span style="font-size:.72rem;color:var(--mut)">Buscando chat...</span>
            </div>
          </div>
          <div v-else-if="tgEstado === 'error'" class="info-box" style="background:rgba(239,68,68,.1);color:var(--bad);border-color:var(--bad);font-size:.78rem">
            Error de conexion. Verifica que el bot este activo.
          </div>
          <button class="btn ghost" style="font-size:.72rem" @click="tgAutoDetectarChat">
            <icon name="refresh" :size="14" :color="mutColor"></icon> Buscar ahora
          </button>
        </div>

        <div class="set-group" style="color:var(--bad)">Zona peligrosa</div>
        <button class="btn bad" @click="borrarTodo()">
          <icon name="trash" :size="16" color="#fff"></icon> Borrar TODOS los datos
        </button>
        <div style="font-size:.72rem;color:var(--mut);margin-top:.2rem;margin-bottom:.5rem">
          Elimina permanentemente productos, ventas, compras, gastos, socios, asientos, pasivos, etc. No se puede deshacer.
        </div>

        <div class="set-group">Ayuda</div>
        <div class="set-row">
          <span class="lbl"><icon name="zap" :size="18"></icon> Ver tutorial de nuevo</span>
          <button class="btn ghost" style="width:auto;margin:0;padding:.4rem .8rem;font-size:.75rem" @click="repetirTutorial">Repetir</button>
        </div>

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

        <button v-if="cfg.calcBilletesActiva" class="btn ghost" style="margin-bottom:.5rem;font-size:.8rem"
          @click="cobroModal.calcAbierta = !cobroModal.calcAbierta">
          <icon name="dollar" :size="14" :color="mutColor"></icon>
          {{ cobroModal.calcAbierta ? 'Ocultar' : 'Mostrar' }} calculadora de billetes
        </button>

        <div v-if="cfg.calcBilletesActiva && cobroModal.calcAbierta" class="calc-billetes">
          <div v-for="d in denominaciones" :key="d" class="denom-row">
            <span class="denom-label">{{ fmt(d) }}</span>
            <input type="number" inputmode="numeric" min="0" step="1"
              v-model.number="cobroModal.billetes[d]" @input="calcBilletes" placeholder="0">
            <span class="denom-sub">{{ fmt(d * (n(cobroModal.billetes[d]) || 0)) }}</span>
          </div>
          <div class="calc-total">
            <div class="row"><span>Total contado</span><b>{{ fmt(cobroModal.totalContado) }}</b></div>
            <div v-if="cobroModal.falta > 0.01" class="row"><span>Falta</span><b class="neg">{{ fmt(cobroModal.falta) }}</b></div>
            <div v-else-if="cobroModal.sobra > 0.01" class="row"><span>Vuelto</span><b class="pos">{{ fmt(cobroModal.sobra) }}</b></div>
            <div v-else-if="cobroModal.totalContado > 0" class="row"><span>Estado</span><b class="pos">Exacto ✓</b></div>
          </div>
        </div>

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
        <select v-model="aporteForm.socioId">
          <option value="">Sin asignar (capital general)</option>
          <option v-for="s in sociosActivos" :key="s.id" :value="s.id">{{ s.nombre }}</option>
        </select>
        <div class="grid2">
          <button class="btn ok" @click="registrarAporte">Registrar Aporte</button>
          <button class="btn ghost" @click="aporteAbierto = false">Cancelar</button>
        </div>
      </div>
    </div>

    <!-- CONFIRM MODAL -->
    <ModalConfirm
      :activo="confirm.activo"
      :titulo="confirm.titulo"
      :msg="confirm.msg"
      @ok="okConfirm"
      @cancelar="confirm.activo = false"
    />

    <!-- PROMPT MODAL -->
    <ModalPrompt
      :activo="prompt.activo"
      :titulo="prompt.titulo"
      :msg="prompt.msg"
      :placeholder="prompt.placeholder"
      :type="prompt.type"
      :value="prompt.value"
      @update:value="prompt.value = $event"
      @ok="okPrompt"
      @cancelar="cancelPrompt"
    />

    <!-- GLOBAL SEARCH -->
    <GlobalSearch
      :abierto="busquedaGlobalAbierta"
      :state="{ productos, ventas, socios, gastos, stockDe: stock, formatMoney: fmt }"
      @cerrar="busquedaGlobalAbierta = false"
      @ir="(sec, refId) => { busquedaGlobalAbierta = false; ir(sec, refId); }"
    />

    <!-- ONBOARDING -->
    <Onboarding
      :activo="tutorialActivo"
      :pasos="pasosTutorial()"
      @cerrar="cerrarTutorial"
      @ir="onTutorialIr"
      @accion="onTutorialAccion"
    />

    <!-- TOAST -->
    <AppToast :toast="toast" @accion="toast.accionFn && toast.accionFn(); toast.show = false" />
  </div>
</template>
<script>
import { db, n, m, q, genId, clean, P, vib, fmt, fmtCant, fmtFecha, fmtFH, buildData } from './db.js';
import BottomNav from './components/BottomNav.vue';
import { generarInsights } from './insights.js';
import { tgGetMe, tgGetUpdates, tgSendDocument, tgGetFile, tgFileUrl, tgDeleteMessage, tgDetectarChatId, tgExtraerBackups, TOKEN_DEFAULT } from './telegram.js';
import GlobalSearch from './components/GlobalSearch.vue';
import Onboarding from './components/Onboarding.vue';
import SheetMas from './components/SheetMas.vue';
import ModalConfirm from './components/ModalConfirm.vue';
import ModalPrompt from './components/ModalPrompt.vue';
import AppToast from './components/AppToast.vue';
// Chart.js se carga dinamicamente en renderChart()
// jsPDF se carga dinamicamente al exportar PDF

// SVG paths para el componente icon


export default {
  name: 'App',
  components: { BottomNav, SheetMas, ModalConfirm, ModalPrompt, AppToast, GlobalSearch, Onboarding },


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
        stockMinDefault: 5,
        anomaliasDescartadas: [],
        calcBilletesActiva: false,
        tgToken: '',
        tgChatId: '',
        tgNombre: '',
        tgAutoBackup: false,
        tgUltimoBackup: null,
        tgUltimoHash: '',
        tgMantenerN: 10,
        tgCarpetaActiva: false,
        tgCarpetaNombre: '',
        modoCompacto: false,
        tutorialVisto: false,
        mostrarSplash: true
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
      pasivos: [],
      auditorias: [],
      auditActiva: null,
      auditForm: { cajaContada: '', cajaNota: '', paso: 1, conteos: {} },
      filtroAsientoInicio: new Date().toISOString().split('T')[0],
      filtroAsientoFin: new Date().toISOString().split('T')[0],
      filtroAsientoCuenta: '',
      filtroAsientoTipo: '',
      pasivoForm: { editId: '', acreedor: '', concepto: '', monto: '', fecha: new Date().toISOString().split('T')[0], vencimiento: '', nota: '' },
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
        FALTANTES: 'Faltantes de arqueo',
        PASIVOS: 'Cuentas por pagar',
        PAGO_PASIVOS: 'Pago de deudas',
        RESULTADO: 'Resultado del ejercicio',
        GANANCIAS_ACUM: 'Ganancias acumuladas',
        SOBRANTES_INV: 'Sobrantes de inventario'
      },

      prodExpandido: {},
      invExpandido: {},
      cuadreExpandido: {},
      _highlightTimer: null,
      filtroStock: null,
      contabExpandido: {
        situacion: false,
        resultados: false,
        balance: false,
        flujo: false,
        libro: false,
        cierres: false,
        pasivos: false
      },
      busquedaGlobalAbierta: false,
      splashVisible: true,
      safeMode: false,
      tutorialActivo: false,
      _tabId: null,
      tgEstado: 'sin-config',
      tgBackups: [],
      tgCargando: false,
      tgProgreso: '',
      tgColaPendiente: 0,
      _carpetaHandle: null,
      _pullStartY: 0,
      _pulling: false,
      pullDist: 0,
      refrescando: false,
      importPreview: null,

      busqVenta: '',
      focusVenta: false,
      carrito: [],
      busqHist: '',

      busqCompra: '',
      focusCompra: false,
      compraForm: { editId: '', productoId: '', nombre: '', cantidad: '', costo: '', empaqueSel: '', costoPorEmpaque: false },

      prodForm: { editId: '', nombre: '', precio: '', stockMin: '5', preciosEscalonados: [], empaques: [], nota: '' },
      busqProd: '',
      mostrarArchivados: false,

      ajusteForm: { productoId: '', cantidad: '', motivo: '', costoSobrante: '' },
      arqueoForm: { monto: '', nota: '' },
      arqueoPreview: { fisico: 0, diff: 0, class: 'cuadre' },

      retiroForm: { monto: '', concepto: '' },
      aporteForm: { monto: '', nota: '', socioId: '' },
      migrarSocioId: '',
      socioForm: { editId: '', nombre: '', porcentaje: '', aporte: '' },
      repartoForm: { monto: '', concepto: '' },
      gastoForm: { editId: '', fecha: new Date().toISOString().split('T')[0], categoria: '', concepto: '', monto: '', nota: '', metodoPago: 'efectivo', saleDeCaja: true },
      capInicialStr: '',

      rep: {
        fechaInicio: new Date().toISOString().split('T')[0],
        fechaFin: new Date().toISOString().split('T')[0],
        isoInicio: null,
        isoFin: null,
        resultado: null,
        periodoActivo: null
      },

      cobroModal: { activo: false, total: 0, calcAbierta: false, billetes: {}, totalContado: 0, falta: 0, sobra: 0 },
      denominaciones: [10, 20, 50, 100, 200, 500, 1000, 2000, 5000],
      confirm: { activo: false, titulo: '', msg: '', onOk: null },
      prompt: { activo: false, titulo: '', msg: '', placeholder: '', type: 'text', value: '', onOk: null },
      toast: { show: false, msg: '', type: 'ok', accionTxt: '', accionFn: null, timer: null },

      ultimoBackup: null,
      procesandoVenta: false,
      importFile: null,
      _chart: null,
      _notifTimer: null,
      _fifoCache: {},
      _stockMapCache: null,
      _anomaliasCache: null,
      _topRentCache: null,
      _invAgrCache: null,
      _busqTimers: {},
      umbralesAbierto: false,
      notifAvanzadoAbierto: false,
      porPagina: 20,
      historial: {
        ventas: { pagina: 1, abiertos: {} },
        compras: { pagina: 1, abiertos: {} },
        gastos: { pagina: 1, abiertos: {} },
        caja: { pagina: 1, abiertos: {} },
        ajustes: { pagina: 1, abiertos: {} },
        distribuciones: { pagina: 1, abiertos: {} },
        asientos: { pagina: 1, abiertos: {} }
      }
    };
  },

  computed: {
    soportaNotif() {
      return typeof window !== 'undefined' && 'Notification' in window;
    },

    mutColor() { return this.cfg.tema === 'dark' ? '#94a3b8' : '#6b7280'; },
    txtColor() { return this.cfg.tema === 'dark' ? '#f1f5f9' : '#111827'; },
    masActivo() { return this.masAbierto || ['productos','reportes','socios','gastos','contabilidad','auditoria'].includes(this.sec); },

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
      const cached = this._stockMapCache;
      if (cached && cached._vLotes === this.lotes && cached._vProds === this.productos) return cached.data;
      const map = {};
      this.productos.forEach(p => { map[p.id] = 0; });
      this.lotes.forEach(l => {
        if (map[l.productoId] !== undefined) {
          map[l.productoId] += (n(l.cantidadInicial) - n(l.cantidadVendida));
        }
      });
      this._stockMapCache = { _vLotes: this.lotes, _vProds: this.productos, data: map };
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
        if (!f.error) gan = m(gan + ((n(it.precio) * n(it.cant)) - f.costoTotal));
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
      if (this.filtroStock === 'agotados') list = list.filter(p => this.stock(p.id) === 0);
      else if (this.filtroStock === 'bajos') list = list.filter(p => { const st = this.stock(p.id); return st > 0 && st <= n(p.stockMinimo); });
      const q = this.busqProd.toLowerCase().trim();
      if (q) list = list.filter(p => p.nombre.toLowerCase().includes(q));
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
      const sig = this.prodsActivos.length + '|' + this.lotes.length + '|' + this.lotes[0]?.id + '|' + this.lotes[this.lotes.length-1]?.id;
      if (this._invAgrCache && this._invAgrCache.sig === sig) return this._invAgrCache.data;
      const result = this.prodsActivos.map(p => {
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
      this._invAgrCache = { sig, data: result };
      return result;
    },

    ventasPorPeriodo() {
      return this.agruparHistorial(this.ventasFiltradas, 'fecha');
    },

    comprasPorPeriodo() {
      return this.agruparHistorial(this.comprasOrdenadas, 'fecha');
    },

    gastosPorPeriodo() {
      return this.agruparHistorial(this.gastosOrdenados, 'fecha');
    },

    cajaPorPeriodo() {
      return this.agruparHistorial(this.movimientosRecientes, 'fecha');
    },

    ajustesPorPeriodo() {
      return this.agruparHistorial(this.ajustesRecientes, 'fecha');
    },

    distribucionesPorPeriodo() {
      return this.agruparHistorial(this.distribucionesOrdenadas, 'fecha');
    },

    asientosPorPeriodo() {
      return this.agruparHistorial(this.asientosFiltrados, 'fecha');
    },

    ajustesRecientes() {
      return this.ajustes.slice().sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).slice(0, 20);
    },

    activosTotal() { return m(this.saldoCaja + this.valorInventario); },

    pasivosActivos() {
      return this.pasivos.filter(p => !p.pagado);
    },

    pasivosTotalReal() {
      return m(this.pasivosActivos.reduce((s, p) => s + n(p.monto), 0));
    },

    pasivosPagadosTotal() {
      return m(this.pasivos.filter(p => p.pagado).reduce((s, p) => s + n(p.monto), 0));
    },

    pasivosOrdenados() {
      return this.pasivos.slice().sort((a, b) => {
        if (a.pagado !== b.pagado) return a.pagado ? 1 : -1;
        return new Date(a.fecha) - new Date(b.fecha);
      });
    },

    pasivosVencidos() {
      const ahora = new Date();
      return this.pasivosActivos.filter(p => p.vencimiento && new Date(p.vencimiento) < ahora);
    },

    flujoEntradas() {
      const capitalIni = n(this.cfg.capitalInicial);
      const ventas = m(this.ventas.filter(v => !v.anulada).reduce((s,v) => s + n(v.total), 0));
      const aportes = this.aportesTotal;
      const sobrantes = m(this.movCaja.filter(mv => mv.tipo === 'ingreso' && mv.concepto && mv.concepto.includes('Sobrante')).reduce((s,mv) => s + n(mv.monto), 0));
      return m(capitalIni + ventas + aportes + sobrantes);
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
    aportesSinSocio() { return this.capital.filter(x => !x.socioId); },
    aportesSinSocioTotal() { return m(this.aportesSinSocio.reduce((s, x) => s + n(x.monto), 0)); },
    sumaPorcentajes() { return m(this.sociosActivos.reduce((s, x) => s + n(x.porcentaje), 0)); },
    totalDistribuido() { return m(this.distribuciones.reduce((s, d) => s + n(d.monto), 0)); },
    distribucionesOrdenadas() { return this.distribuciones.slice().sort((a, b) => new Date(b.fecha) - new Date(a.fecha)); },

    topRentables() {
      const sig = this.ventas.length + '|' + this.ventas[0]?.id;
      if (this._topRentCache && this._topRentCache.sig === sig) return this._topRentCache.data;
      const now = new Date();
      const iniMes = new Date(now.getFullYear(), now.getMonth(), 1);
      const map = {};
      this.ventas.filter(v => !v.anulada && new Date(v.fecha) >= iniMes).forEach(v => {
        v.items.forEach(it => {
          if (!map[it.productoId]) map[it.productoId] = { id: it.productoId, nombre: it.nombre, gan: 0 };
          map[it.productoId].gan += n(it.ganancia);
        });
      });
      const result = Object.values(map).sort((a, b) => b.gan - a.gan).slice(0, 5);
      this._topRentCache = { sig, data: result };
      return result;
    },

    insights() {
      try {
        return generarInsights({
          ventas: this.ventas, compras: this.compras, gastos: this.gastos,
          ajustes: this.ajustes, productos: this.productos, lotes: this.lotes,
          cierres: this.cierres, movCaja: this.movCaja,
          saldoCaja: this.saldoCaja, cfg: this.cfg,
          formatMoney: fmt, formatNum: fmtCant,
          stockDe: (pid) => this.stock(pid)
        });
      } catch (e) { console.error('insights', e); return []; }
    },

    anomalias() {
      const sig = [
        this.ventas.length, this.compras.length, this.ajustes.length, this.lotes.length,
        this.gastos.length, this.movCaja.length, this.cierres.length, this.pasivos.length,
        this.asientos.length, this.productos.length, this.saldoCaja, this.gananciaNetaPeriodo,
        JSON.stringify(this.cfg.anomaliasDescartadas || [])
      ].join('|');
      const cached = this._anomaliasCache;
      if (cached && cached.sig === sig) return cached.data;

      const out = [];
      const ahora = new Date();
      const hace7d = new Date(ahora.getTime() - 7 * 86400000);
      const hace30d = new Date(ahora.getTime() - 30 * 86400000);
      const umbralSinMov = new Date(ahora.getTime() - n(this.cfg.umbralSinMovimientoDias || 60) * 86400000);
      const descartadas = this.cfg.anomaliasDescartadas || [];
      const add = (obj) => { if (!descartadas.includes(obj.clave)) out.push(obj); };

      // 1. Caja negativa
      if (this.saldoCaja < -0.01) {
        const nivel = this.saldoCaja < -1000 ? 'alta' : 'media';
        add({ nivel, icono: 'alert', titulo: 'Caja en negativo', detalle: fmt(this.saldoCaja), sec: 'caja', clave: 'caja-negativa' });
      }

      // 2. Ventas bajo costo
      const ventasBajoCosto = this.ventas.filter(v => !v.anulada && new Date(v.fecha) >= hace30d)
        .flatMap(v => v.items.filter(it => n(it.ganancia) < -0.01).map(it => ({ venta: v, item: it })));
      if (ventasBajoCosto.length > 0) {
        const totalPerdido = m(ventasBajoCosto.reduce((s, x) => s + n(x.item.ganancia), 0));
        add({ nivel: 'alta', icono: 'trend', titulo: ventasBajoCosto.length + ' venta(s) bajo costo', detalle: 'Perdida: ' + fmt(totalPerdido), sec: 'ventas', clave: 'ventas-bajo-costo-' + ventasBajoCosto.length });
      }

      // 3. Stock negativo
      const stockNeg = this.productos.filter(p => !p.archivado && this.stock(p.id) < -0.001);
      if (stockNeg.length > 0) {
        stockNeg.forEach(p => {
          add({ nivel: 'alta', icono: 'package', titulo: p.nombre + ': stock negativo', detalle: 'Stock actual: ' + fmtCant(this.stock(p.id)), sec: 'productos', refId: p.id, clave: 'stock-neg-' + p.id });
        });
      }

      // 4. Mermas frecuentes
      const mermasSemana = {};
      this.ajustes.filter(a => a.cantidad < 0 && new Date(a.fecha) >= hace7d).forEach(a => {
        mermasSemana[a.productoId] = (mermasSemana[a.productoId] || 0) + 1;
      });
      Object.keys(mermasSemana).forEach(pid => {
        if (mermasSemana[pid] >= n(this.cfg.umbralMermasSemana || 3)) {
          const p = this.productos.find(x => x.id === pid);
          add({ nivel: 'media', icono: 'alert', titulo: (p ? p.nombre : 'Producto') + ': mermas frecuentes', detalle: mermasSemana[pid] + ' mermas en 7 dias', sec: 'productos', refId: pid, clave: 'mermas-frec-' + pid });
        }
      });

      // 5. Faltantes repetidos
      const faltantes = this.movCaja.filter(mv => mv.concepto && mv.concepto.includes('Faltante') && new Date(mv.fecha) >= hace30d);
      if (faltantes.length >= n(this.cfg.umbralFaltantesMes || 3)) {
        const total = m(faltantes.reduce((s, f) => s + n(f.monto), 0));
        add({ nivel: 'media', icono: 'wallet', titulo: faltantes.length + ' faltantes de caja en 30 dias', detalle: 'Total: ' + fmt(total), sec: 'caja', clave: 'faltantes-' + faltantes.length });
      }

      // 6. Compras con costo elevado
      this.productos.filter(p => !p.archivado).forEach(p => {
        const comprasProd = this.compras.filter(c => c.productoId === p.id && !c.anulada).sort((a,b) => new Date(b.fecha) - new Date(a.fecha));
        if (comprasProd.length < 3) return;
        const ult = n(comprasProd[0].costo);
        const ultFecha = new Date(comprasProd[0].fecha);
        if (ultFecha < hace30d) return;
        const previas = comprasProd.slice(1, 6);
        const prom = previas.reduce((s, c) => s + n(c.costo), 0) / previas.length;
        if (prom > 0.01 && ult > prom * 1.3) {
          add({ nivel: 'baja', icono: 'bag', titulo: p.nombre + ': compra ' + ((ult/prom - 1) * 100).toFixed(0) + '% mas caro', detalle: fmt(ult) + ' vs ' + fmt(prom) + ' promedio', sec: 'compras', refId: comprasProd[0].id, clave: 'compra-cara-' + comprasProd[0].id });
        }
      });

      // 7. Ventas anuladas recientes
      const anuladas30 = this.ventas.filter(v => v.anulada && v.fechaAnulacion && new Date(v.fechaAnulacion) >= hace30d);
      if (anuladas30.length >= 5) {
        add({ nivel: 'baja', icono: 'x', titulo: anuladas30.length + ' ventas anuladas en 30 dias', detalle: 'Revisar historial', sec: 'ventas', clave: 'anuladas-' + anuladas30.length });
      }

      // 8. Productos sin movimiento con stock
      const sinMov = this.productos.filter(p => {
        if (p.archivado) return false;
        const stock = this.stock(p.id);
        if (stock <= 0) return false;
        const fechaCompra = p.fechaCreacion ? new Date(p.fechaCreacion) : null;
        if (fechaCompra && fechaCompra > umbralSinMov) return false;
        const ventasRecientes = this.ventas.some(v => !v.anulada && new Date(v.fecha) >= umbralSinMov && v.items.some(it => it.productoId === p.id));
        return !ventasRecientes;
      });
      sinMov.forEach(p => {
        add({ nivel: 'baja', icono: 'package', titulo: p.nombre + ': sin movimiento', detalle: 'Stock ' + fmtCant(this.stock(p.id)) + ', sin ventas en ' + (this.cfg.umbralSinMovimientoDias || 60) + ' dias', sec: 'productos', refId: p.id, clave: 'sin-mov-' + p.id });
      });

      // 9. Cierre pendiente
      const ultimoCierre = this.cierres.length > 0 ? Math.max(...this.cierres.map(c => new Date(c.fechaCierre).getTime())) : new Date(this.cfg.periodoInicio).getTime();
      const diasSinCierre = Math.floor((ahora.getTime() - ultimoCierre) / 86400000);
      if (diasSinCierre >= n(this.cfg.umbralDiasCierre || 30)) {
        add({ nivel: 'media', icono: 'calendar', titulo: 'Cierre pendiente', detalle: diasSinCierre + ' dias sin cerrar periodo', sec: 'reportes', clave: 'cierre-pendiente' });
      }

      // N2. Ganancia del periodo negativa o muy baja
      if (this.ventasPeriodo > 100 && this.gananciaNetaPeriodo < 0) {
        add({ nivel: 'alta', icono: 'trend', titulo: 'Ganancia neta negativa', detalle: 'Periodo actual: ' + fmt(this.gananciaNetaPeriodo), sec: 'contabilidad', clave: 'ganancia-neg-periodo' });
      } else if (this.ventasPeriodo > 100 && this.margenPeriodo < 3) {
        add({ nivel: 'media', icono: 'trend', titulo: 'Margen neto muy bajo', detalle: 'Margen: ' + this.margenPeriodo + '%', sec: 'contabilidad', clave: 'margen-bajo-periodo' });
      }

      // N3. Mermas por valor alto
      const mermasValorAlto = m(this.ajustes.filter(a => a.cantidad < 0 && new Date(a.fecha) >= hace30d).reduce((s, a) => s + n(a.costoPerdida), 0));
      if (mermasValorAlto > 0 && this.ventasPeriodo > 0) {
        const pctMermas = (mermasValorAlto / this.ventasPeriodo) * 100;
        if (pctMermas > 5) {
          add({ nivel: 'media', icono: 'alert', titulo: 'Mermas elevadas', detalle: fmt(mermasValorAlto) + ' (' + pctMermas.toFixed(1) + '% de ventas)', sec: 'inventario', clave: 'mermas-valor-alto' });
        }
      }

      // N4. Descuadre contable
      const cuadreDebe = this.balanzaPorCuenta.reduce((s, b) => s + b.debe, 0);
      const cuadreHaber = this.balanzaPorCuenta.reduce((s, b) => s + b.haber, 0);
      if (Math.abs(cuadreDebe - cuadreHaber) > 0.01 && this.asientos.length > 0) {
        add({ nivel: 'alta', icono: 'alert', titulo: 'Descuadre en libro diario', detalle: 'Debe: ' + fmt(cuadreDebe) + ' · Haber: ' + fmt(cuadreHaber), sec: 'contabilidad', clave: 'descuadre-libro' });
      }

      // N5. Productos con muchas ventas anuladas
      const anuladasPorProd = {};
      this.ventas.filter(v => v.anulada && v.fechaAnulacion && new Date(v.fechaAnulacion) >= hace30d).forEach(v => {
        v.items.forEach(it => {
          anuladasPorProd[it.productoId] = (anuladasPorProd[it.productoId] || 0) + 1;
        });
      });
      Object.keys(anuladasPorProd).forEach(pid => {
        if (anuladasPorProd[pid] >= 3) {
          const p = this.productos.find(x => x.id === pid);
          add({ nivel: 'baja', icono: 'x', titulo: (p ? p.nombre : 'Producto') + ': ventas anuladas frecuentes', detalle: anuladasPorProd[pid] + ' anulaciones en 30 dias', sec: 'ventas', clave: 'anuladas-prod-' + pid });
        }
      });

      // 10. Backup viejos
      if (this.ultimoBackup && this.ultimoBackup.fecha) {
        const diasSinBackup = Math.floor((ahora.getTime() - new Date(this.ultimoBackup.fecha).getTime()) / 86400000);
        if (diasSinBackup >= n(this.cfg.umbralBackupDias || 7)) {
          add({ nivel: 'baja', icono: 'download', titulo: 'Backup antiguo', detalle: diasSinBackup + ' dias desde el ultimo backup', sec: 'ajustes', clave: 'backup-viejo' });
        }
      }

      // 11. Descuentos altos (venta muy por debajo del precio de lista)
      const umbralDesc = n(this.cfg.umbralDescuentoPct || 20);
      if (umbralDesc > 0) {
        const descAltos = [];
        this.ventas.filter(v => !v.anulada && new Date(v.fecha) >= hace30d).forEach(v => {
          v.items.forEach(it => {
            const prod = this.productos.find(p => p.id === it.productoId);
            if (!prod || !prod.precio || n(prod.precio) <= 0) return;
            if (n(it.precio) <= 0) return;
            const pctDesc = ((n(prod.precio) - n(it.precio)) / n(prod.precio)) * 100;
            if (pctDesc >= umbralDesc && n(it.cantidad) > 0) descAltos.push({ venta: v, item: it, pct: pctDesc });
          });
        });
        if (descAltos.length > 0) {
          add({ nivel: 'media', icono: 'trend', titulo: descAltos.length + ' venta(s) con descuento > ' + umbralDesc + '%', detalle: 'Revisar precios aplicados', sec: 'ventas', clave: 'descuentos-' + descAltos.length });
        }
      }

      // 12. Sobrantes repetidos de caja
      const sobrantes = this.movCaja.filter(mv => mv.concepto && mv.concepto.includes('Sobrante') && new Date(mv.fecha) >= hace30d);
      if (sobrantes.length >= n(this.cfg.umbralSobrantesMes || 3)) {
        const total = m(sobrantes.reduce((s, f) => s + n(f.monto), 0));
        add({ nivel: 'media', icono: 'wallet', titulo: sobrantes.length + ' sobrantes de caja en 30 dias', detalle: 'Total: ' + fmt(total), sec: 'caja', clave: 'sobrantes-' + sobrantes.length });
      }

      // 13. Movimientos raros de inventario (subidas sin compra)
      this.productos.filter(p => !p.archivado).forEach(p => {
        const lotesProd = this.lotes.filter(l => l.productoId === p.id);
        const comprasProd = this.compras.filter(c => c.productoId === p.id && !c.anulada);
        // Si hay lotes pero no hay compras, o hay lotes manuales (ajustes con cantidad > 0)
        const lotesSinCompra = lotesProd.filter(l => !l.compraId || l.compraId.startsWith('aj-'));
        if (lotesSinCompra.length > 0 && comprasProd.length === 0 && this.stock(p.id) > 3) {
          add({ nivel: 'baja', icono: 'package', titulo: p.nombre + ': stock sin compra registrada', detalle: lotesSinCompra.length + ' lote(s) por ajuste', sec: 'productos', refId: p.id, clave: 'stock-sin-compra-' + p.id });
        }
      });

      const orden = { alta: 0, media: 1, baja: 2 };
      const result = out.sort((a, b) => orden[a.nivel] - orden[b.nivel]);
      this._anomaliasCache = { sig, data: result };
      return result;
    },

    anomaliasCriticas() {
      return this.anomalias.filter(a => a.nivel === 'alta').length;
    },

    lotesPorProducto() {
      const map = {};
      this.lotes.forEach(l => {
        if (!map[l.productoId]) map[l.productoId] = new Set();
        map[l.productoId].add(n(l.costo));
      });
      const out = {};
      Object.keys(map).forEach(k => { out[k] = map[k].size; });
      return out;
    },

    auditoriasOrdenadas() { return this.auditorias.slice().sort((a,b) => new Date(b.fechaInicio) - new Date(a.fechaInicio)); },
    ultimaAuditoria() { return this.auditoriasOrdenadas.find(a => a.estado === 'cerrada') || null; },
    auditDiasDesde() {
      if (!this.ultimaAuditoria) return null;
      return Math.floor((Date.now() - new Date(this.ultimaAuditoria.fechaFin).getTime()) / 86400000);
    },
    auditConteoActual() {
      if (!this.auditActiva) return [];
      const conteos = this.auditForm.conteos || {};
      return this.prodsActivos.map(p => {
        const c = conteos[p.id] || {};
        const sistema = m(this.stock(p.id));
        const contado = c.contado !== '' && c.contado !== undefined && c.contado !== null ? n(c.contado) : null;
        const dif = contado !== null ? m(contado - sistema) : 0;
        const costoUnit = this.costoPromProducto(p.id);
        return {
          productoId: p.id,
          nombre: p.nombre,
          sistema,
          contado,
          dif,
          costoUnit,
          costoDif: m(dif * costoUnit),
          activo: contado !== null
        };
      });
    },
    auditResumen() {
      if (!this.auditActiva) return null;
      const cajaSistema = this.saldoCaja;
      const cajaContada = this.auditForm.cajaContada !== '' ? n(this.auditForm.cajaContada) : null;
      const difCaja = cajaContada !== null ? m(cajaContada - cajaSistema) : 0;
      const conteo = this.auditConteoActual.filter(x => x.activo);
      const difInventarioCosto = m(conteo.reduce((s, x) => s + x.costoDif, 0));
      return {
        cajaSistema,
        cajaContada,
        difCaja,
        conteo,
        totalContados: conteo.length,
        totalProductos: this.prodsActivos.length,
        difInventarioCosto,
        totalDif: m(difCaja + difInventarioCosto)
      };
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

    async conWatchdog(nombre, promesa, timeoutMs = 15000) {
      const t0 = performance.now();
      let timeoutId;
      const timeout = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error('Operacion "' + nombre + '" tardo mas de ' + (timeoutMs / 1000) + 's. Puede haber quedado a medias.'));
        }, timeoutMs);
      });
      try {
        const res = await Promise.race([promesa, timeout]);
        const ms = (performance.now() - t0).toFixed(0);
        if (ms > 3000) console.warn('Watchdog: ' + nombre + ' tardo ' + ms + 'ms');
        return res;
      } finally {
        clearTimeout(timeoutId);
      }
    },

    toastMsg(msg, type = 'ok', accionTxt = '', accionFn = null) {
      clearTimeout(this.toast.timer);
      this.toast = { show: true, msg, type, accionTxt, accionFn, timer: null };
      vib(type === 'ok' ? 20 : 40);
      this.toast.timer = setTimeout(() => { this.toast.show = false; }, accionTxt ? 5000 : 3000);
    },

    async onPullRefresh() {
      if (this.refrescando) return;
      this.refrescando = true;
      try { await this.recargarTodo(); } catch (e) {}
      setTimeout(() => { this.refrescando = false; this.pullDist = 0; }, 500);
      this.toastMsg('Datos actualizados');
    },

    onTouchStart(e) {
      if (window.scrollY > 0) return;
      this._pullStartY = e.touches[0].clientY;
      this._pulling = true;
    },

    onTouchMove(e) {
      if (!this._pulling) return;
      const dy = e.touches[0].clientY - this._pullStartY;
      if (dy > 0) this.pullDist = Math.min(dy, 90);
    },

    onTouchEnd() {
      if (!this._pulling) return;
      if (this.pullDist >= 70) this.onPullRefresh();
      this._pulling = false;
      setTimeout(() => { this.pullDist = 0; }, 300);
    },

    async salirSafeMode() {
      this.confirm = {
        activo: true,
        titulo: 'Salir de modo seguro',
        msg: 'Se reintentara arrancar normalmente. Si falla de nuevo, vuelve a modo seguro.',
        onOk: async () => {
          try { await P(db.config, { key: 'safeModeCounter', value: 0 }); } catch (e) {}
          location.reload();
        }
      };
    },

    aplicarModoCompacto() {
      this.guardarCfg();
      try { document.documentElement.setAttribute('data-compact', this.cfg.modoCompacto ? '1' : '0'); } catch (e) {}
    },

    toggleTema() {
      this.cfg.tema = this.cfg.tema === 'dark' ? 'light' : 'dark';
      try { document.documentElement.setAttribute('data-theme', this.cfg.tema); } catch (e) {}
      this.guardarCfg();
      if (this.sec === 'dashboard') this.$nextTick(() => requestAnimationFrame(() => this.renderChart()));
    },

    irAStock(filtro) {
      this.filtroStock = filtro;
      this.ir('productos');
      this.$nextTick(() => {
        setTimeout(() => {
          try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { window.scrollTo(0, 0); }
        }, 100);
      });
    },

    limpiarFiltroStock() {
      this.filtroStock = null;
    },

    setBusq(campo, valor) {
      if (this._busqTimers[campo]) clearTimeout(this._busqTimers[campo]);
      const target = campo;
      const v = valor;
      this._busqTimers[campo] = setTimeout(() => {
        this[target] = v;
      }, 150);
    },

    ir(s, refId) {
      this.masAbierto = false;
      this.sec = s;
      try { history.pushState({ sec: s }, '', '#' + s); } catch (e) {}
      if (refId) {
        this.$nextTick(() => {
          setTimeout(() => {
            const el = document.getElementById('ref-' + refId);
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              el.classList.add('highlight-flash');
              clearTimeout(this._highlightTimer);
              this._highlightTimer = setTimeout(() => el.classList.remove('highlight-flash'), 3000);
            }
          }, 400);
        });
      }
    },

    descartarTodasAnomalias() {
      const claves = this.anomalias.map(a => a.clave);
      if (!claves.length) return;
      if (!this.cfg.anomaliasDescartadas) this.cfg.anomaliasDescartadas = [];
      claves.forEach(k => {
        if (!this.cfg.anomaliasDescartadas.includes(k)) this.cfg.anomaliasDescartadas.push(k);
      });
      this.guardarCfg();
      this.toastMsg(claves.length + ' anomalia(s) descartada(s)');
    },

    descartarAnomalia(clave) {
      if (!this.cfg.anomaliasDescartadas) this.cfg.anomaliasDescartadas = [];
      if (!this.cfg.anomaliasDescartadas.includes(clave)) {
        this.cfg.anomaliasDescartadas.push(clave);
        this.guardarCfg();
        this.toastMsg('Anomalia descartada');
      }
    },

    restaurarAnomalias() {
      this.cfg.anomaliasDescartadas = [];
      this.guardarCfg();
      this.toastMsg('Anomalias restauradas');
    },

    // ===== TUTORIAL =====
    pasosTutorial() {
      const nombre = this.cfg.nombre || 'tu tienda';
      return [
        {
          titulo: 'Bienvenido a Tienda Pro',
          icono: 'store',
          texto: 'Te voy a mostrar <b>todo lo que puedes hacer</b> en menos de 2 minutos. Es rapido y puedes saltarlo cuando quieras.',
          bullets: [
            'Ventas, compras e inventario',
            'Caja, contabilidad y socios',
            'Backup automatico en Telegram',
            'Reportes y auditorias'
          ]
        },
        {
          titulo: 'Inicio - Tu centro de mando',
          icono: 'home',
          sec: 'dashboard',
          target: '.balance.azul',
          texto: 'Aqui ves <b>el dinero en caja, ventas del dia, ganancia y todo de un vistazo</b>. Los consejos de Tienda Pro te avisan que hacer.'
        },
        {
          titulo: 'Bara inferior - Navegacion',
          icono: 'menu',
          target: '.nav',
          texto: 'Desde abajo llegas a todas partes. Toca cada boton para ver:',
          bullets: [
            '<b>Inicio</b> - resumen y consejos',
            '<b>Ventas</b> - cobrar y ver historial',
            '<b>Compras</b> - mercancia que entra',
            '<b>Inventario</b> - que tienes y cuanto vale',
            '<b>Mas</b> - todo lo demas'
          ]
        },
        {
          titulo: 'Empieza por aqui: tus datos',
          icono: 'store',
          sec: 'socios',
          target: 'section:not([style*="display: none"]) .card-title',
          texto: 'Antes de vender, configura lo basico. Toca <b>Ajustes</b> (arriba) y pon:',
          bullets: [
            '<b>Nombre de la tienda</b> - como quieres que aparezca',
            '<b>Capital inicial</b> - el dinero con el que empiezas',
            '<b>PIN</b> - para proteger operaciones sensibles'
          ]
        },
        {
          titulo: 'Crea tus productos',
          icono: 'tag',
          sec: 'productos',
          target: 'section:not([style*="display: none"]) input[placeholder="Nombre del producto"]',
          texto: 'Todo empieza con los productos. Toca <b>Mas → Productos</b> y agrega cada producto con su precio de venta. Puedes agregar <b>precios por cantidad</b> y <b>empaques</b> (sacos, cajas).'
        },
        {
          titulo: 'Registra tus compras',
          icono: 'bag',
          sec: 'compras',
          target: 'nav button, .card:first-child',
          texto: 'Cuando compres mercancia, registrala aqui. La app calcula el <b>costo promedio</b> y crea los lotes automaticamente. Si compraste el mismo producto a precios distintos, cada lote respeta su costo.'
        },
        {
          titulo: 'Haz tu primera venta',
          icono: 'cart',
          sec: 'ventas',
          target: 'section:not([style*="display: none"]) .search input',
          texto: 'Busca el producto, pon la cantidad, ajusta el precio si hace falta y toca <b>Cobrar Venta</b>. La app calcula la ganancia real usando FIFO (respeta cada lote).'
        },
        {
          titulo: 'Tus gastos del dia',
          icono: 'dollar',
          sec: 'gastos',
          target: 'section:not([style*="display: none"]) .card-title',
          texto: 'Luz, agua, alquiler, transporte... cada gasto afecta tu ganancia neta. Se descuenta automaticamente de la caja si marcas "Sale de caja".'
        },
        {
          titulo: 'Contabilidad completa',
          icono: 'chart',
          sec: 'contabilidad',
          target: 'section:not([style*="display: none"]) .balance',
          texto: 'Todo lo que paso en tu negocio queda registrado. <b>Resumen arriba, detalles abajo</b>. Puedes exportar todo a PDF para contabilidad.'
        },
        {
          titulo: 'Socios y reparto',
          icono: 'users',
          sec: 'socios',
          target: 'section:not([style*="display: none"]) .balance',
          texto: 'Si tienes socios, agregalos con su <b>% de participacion</b>. Al cerrar el mes, la app divide la ganancia automaticamente.'
        },
        {
          titulo: 'Auditoria fisica',
          icono: 'check',
          sec: 'auditoria',
          target: 'section:not([style*="display: none"]) .balance, section:not([style*="display: none"]) .card',
          texto: 'Cada cierto tiempo, cuenta el dinero y los productos fisicos. La app te dice si <b>cuadra, sobra o falta</b>. Los ajustes se registran solos.'
        },
        {
          titulo: 'Backup en Telegram',
          icono: 'lock',
          accion: 'abrir-ajustes',
          target: '.modal-box',
          texto: 'Tu informacion se respalda automaticamente en <b>Telegram</b> cada 24h. Los respaldos quedan cifrados y disponibles desde cualquier dispositivo.'
        },
        {
          titulo: 'Listo para empezar',
          icono: 'diamond',
          sec: 'dashboard',
          target: '.nav',
          texto: 'Eso es todo. Ya puedes usar <b>' + nombre + '</b> como un profesional.',
          bullets: [
            'Agrega productos primero',
            'Registra compras y ventas',
            'Haz una auditoria cada mes',
            'Revisa los consejos en Inicio'
          ]
        }
      ];
    },

    iniciarTutorial() {
      this.tutorialActivo = true;
    },

    cerrarTutorial() {
      this.tutorialActivo = false;
      this.cfg.tutorialVisto = true;
      this.guardarCfg();
      this.toastMsg('Tutorial completado');
    },

    repetirTutorial() {
      this.ajustesAbierto = false;
      setTimeout(() => this.iniciarTutorial(), 300);
    },

    onTutorialAccion(accion) {
      if (accion === 'abrir-ajustes') {
        this.ajustesAbierto = true;
        this.$nextTick(() => {
          // El Onboarding refrescara el target
        });
      }
    },

    onTutorialIr(sec) {
      this.ir(sec);
    },

    toggleContab(seccion) {
      this.contabExpandido[seccion] = !this.contabExpandido[seccion];
    },

    toggleCuadreProducto(id) {
      this.cuadreExpandido[id] = !this.cuadreExpandido[id];
    },

    // ===== HISTORIAL PAGINADO POR PERIODOS =====
    agruparHistorial(items, keyFecha = 'fecha') {
      const ini = new Date(this.cfg.periodoInicio);
      const actual = [];
      const cerrados = [];
      const sinCierre = [];

      items.forEach(it => {
        const f = new Date(it[keyFecha]);
        if (f >= ini) {
          actual.push(it);
          return;
        }
        const cierre = this.cierres.find(c => {
          const ci = new Date(c.periodoInicio || c.fechaCierre);
          const cf = new Date(c.periodoFin || c.fechaCierre);
          return f >= ci && f < cf;
        });
        if (cierre) {
          let grupo = cerrados.find(g => g.cierre.id === cierre.id);
          if (!grupo) { grupo = { cierre, items: [] }; cerrados.push(grupo); }
          grupo.items.push(it);
        } else {
          sinCierre.push(it);
        }
      });

      if (sinCierre.length) {
        cerrados.push({ cierre: { id: '__antiguos__', periodo: 'Anteriores al primer cierre', fechaCierre: null }, items: sinCierre });
      }

      cerrados.sort((a, b) => {
        const fa = a.cierre.fechaCierre ? new Date(a.cierre.fechaCierre).getTime() : 0;
        const fb = b.cierre.fechaCierre ? new Date(b.cierre.fechaCierre).getTime() : 0;
        return fb - fa;
      });

      return { actual, cerrados };
    },

    histPag(key) {
      if (!this.historial[key]) this.historial[key] = { pagina: 1, abiertos: {} };
      return this.historial[key];
    },

    histItemsMostrados(items, key) {
      const h = this.histPag(key);
      return items.slice(0, h.pagina * this.porPagina);
    },

    histHayMas(items, key) {
      const h = this.histPag(key);
      return items.length > h.pagina * this.porPagina;
    },

    histRestantes(items, key) {
      const h = this.histPag(key);
      return Math.max(0, items.length - h.pagina * this.porPagina);
    },

    histMostrarMas(key) {
      this.histPag(key).pagina++;
    },

    histMostrarMenos(key) {
      this.histPag(key).pagina = 1;
    },

    histToggle(key, id) {
      const h = this.histPag(key);
      h.abiertos[id] = !h.abiertos[id];
    },

    histAbierto(key, id) {
      const h = this.histPag(key);
      return !!h.abiertos[id];
    },

    // ===== VENTAS =====
    calcFIFO(pid, cant) {
      const key = pid + '|' + q(cant);
      const cached = this._fifoCache[key];
      if (cached) return cached;
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
      let result;
      if (rest > 0.001) result = { error: 'Stock insuficiente (faltan ' + rest.toFixed(3) + ')' };
      else result = { costoTotal: total, usados };
      this._fifoCache[key] = result;
      return result;
    },

    invalidarFifoCache() {
      this._fifoCache = {};
    },

    agregarCarrito(p) {
      const s = this.stock(p.id);
      if (s <= 0) return this.toastMsg('Sin stock', 'bad');
      const ex = this.carrito.find(i => i.productoId === p.id);
      if (ex) {
        if (n(ex.cant) < s) ex.cant = String(n(ex.cant) + 1);
        else return this.toastMsg('Stock máximo', 'warn');
      } else {
        const precioInicial = this.precioParaCantidad(p.id, 1);
        this.carrito.push({ productoId: p.id, nombre: p.nombre, precio: String(precioInicial), cant: '1' });
      }
      this.busqVenta = '';
      this.focusVenta = false;
    },

    agregarPrimero() {
      if (this.listaVenta.length > 0) this.agregarCarrito(this.listaVenta[0]);
    },

    cambiarCant(it, dir) {
      let val = n(it.cant) + dir;
      if (val > this.stock(it.productoId)) return this.toastMsg('Stock maximo alcanzado', 'warn');
      if (val < 0) val = 0;
      it.cant = String(val);
      this.recalcularPrecio(it);
      this.$forceUpdate();
    },

    actualizarCantidadInput(it, valor) {
      it.cant = String(valor);
      this.recalcularPrecio(it);
    },

    tieneEscalones(pid) {
      const p = this.productos.find(x => x.id === pid);
      return !!(p && p.preciosEscalonados && p.preciosEscalonados.length);
    },

    esPrecioEscalon(it) {
      const p = this.productos.find(x => x.id === it.productoId);
      if (!p || !p.preciosEscalonados || !p.preciosEscalonados.length) return false;
      const base = n(p.precio);
      const actual = n(it.precio);
      return Math.abs(actual - base) > 0.001;
    },

    recalcularPrecio(it) {
      const prod = this.productos.find(x => x.id === it.productoId);
      if (!prod || !prod.preciosEscalonados || !prod.preciosEscalonados.length) return;
      const nuevo = this.precioParaCantidad(it.productoId, n(it.cant));
      if (n(it.precio) !== nuevo) {
        it.precio = String(nuevo);
        it._precioAuto = true;
      }
    },

    validarCant(it) {
      let val = n(it.cant);
      if (val > this.stock(it.productoId)) {
        val = this.stock(it.productoId);
        this.toastMsg('Cantidad ajustada al stock disponible', 'warn');
      }
      if (val < 0) val = 0;
      it.cant = String(val);
      this.recalcularPrecio(it);
      this.$forceUpdate();
    },

    validarPrecio(it) {
      it.precio = String(n(it.precio));
      it._precioManual = true;
    },

    subTotalItem(it) { return m(n(it.precio) * n(it.cant)); },

    // Formato de stock usando empaques
    formatStock(prodId, cant) {
      const p = this.productos.find(x => x.id === prodId);
      if (!p || !p.empaques || !p.empaques.length) return fmtCant(cant);
      const emps = p.empaques.slice().sort((a, b) => b.unidades - a.unidades);
      let rest = Math.floor(Math.abs(cant));
      const partes = [];
      for (const e of emps) {
        const u = Math.floor(e.unidades);
        if (u <= 0) continue;
        const cantEmp = Math.floor(rest / u);
        if (cantEmp > 0) {
          partes.push(cantEmp + ' ' + e.nombre + (cantEmp > 1 ? 's' : ''));
          rest -= cantEmp * u;
        }
      }
      if (rest > 0) partes.push(rest + ' und');
      if (partes.length === 0) return '0';
      return partes.join(' + ');
    },

    precioParaCantidad(prodId, cant) {
      const p = this.productos.find(x => x.id === prodId);
      if (!p) return 0;
      const escalones = (p.preciosEscalonados || []).slice().sort((a, b) => a.min - b.min);
      let precio = n(p.precio);
      for (const e of escalones) {
        if (cant >= n(e.min)) precio = n(e.precio);
        else break;
      }
      return precio;
    },

    iniciarCobro() {
      const inv = this.carrito.filter(it => n(it.cant) <= 0);
      if (inv.length) return this.toastMsg('Todas las cantidades deben ser > 0', 'bad');

      // Detectar ventas con perdida
      const conPerdida = [];
      for (const it of this.carrito) {
        const f = this.calcFIFO(it.productoId, n(it.cant));
        if (f.error) continue;
        const ingreso = n(it.precio) * n(it.cant);
        if (ingreso < f.costoTotal - 0.01) {
          conPerdida.push({ nombre: it.nombre, ingreso, costo: f.costoTotal, perdida: f.costoTotal - ingreso });
        }
      }

      const abrirCobro = () => {
        this.cobroModal.total = this.totalCarrito;
        this.cobroModal.calcAbierta = false;
        this.cobroModal.billetes = {};
        this.cobroModal.totalContado = 0;
        this.cobroModal.falta = 0;
        this.cobroModal.sobra = 0;
        this.cobroModal.activo = true;
      };

      if (conPerdida.length > 0) {
        const totalPerdida = m(conPerdida.reduce((s, x) => s + x.perdida, 0));
        const lista = conPerdida.map(x => '• ' + x.nombre + ': pierdes ' + fmt(x.perdida)).join('\n');
        this.confirm = {
          activo: true,
          titulo: '⚠ Venta con perdida',
          msg: conPerdida.length + ' producto(s) se venden por debajo del costo. Perdida total: ' + fmt(totalPerdida) + '.\n\n' + lista + '\n\n¿Continuar?',
          onOk: abrirCobro
        };
        return;
      }
      abrirCobro();
    },

    calcBilletes() {
      const contado = this.denominaciones.reduce((s, d) => s + d * (n(this.cobroModal.billetes[d]) || 0), 0);
      this.cobroModal.totalContado = m(contado);
      const diff = m(contado - this.cobroModal.total);
      this.cobroModal.falta = diff < 0 ? Math.abs(diff) : 0;
      this.cobroModal.sobra = diff > 0 ? diff : 0;
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
            ganancia: m(sub - f.costoTotal), lotesUsados: f.usados
          });
          tot = m(tot + sub);
          gan = m(gan + (sub - f.costoTotal));
          todos.push(...f.usados);
        }
        const venta = { id: genId('v'), fecha: new Date().toISOString(), items, total: tot, ganancia: gan, anulada: false };

        await this.conWatchdog('venta', db.transaction('rw', db.ventas, db.lotes, async () => {
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
        }));

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
      this.compraForm = { editId: '', productoId: p.id, nombre: p.nombre, cantidad: '', costo: '', empaqueSel: '', costoPorEmpaque: false };
      this.busqCompra = '';
      this.focusCompra = false;
    },

    resetCompra() {
      this.compraForm = { editId: '', productoId: '', nombre: '', cantidad: '', costo: '', empaqueSel: '', costoPorEmpaque: false };
    },

    // Empaques del producto actual en compra
    empaquesCompraActual() {
      const p = this.productos.find(x => x.id === this.compraForm.productoId);
      return (p && p.empaques) || [];
    },

    // Multiplicador segun empaque seleccionado
    multiplicadorEmpaque() {
      if (!this.compraForm.empaqueSel) return 1;
      const emp = this.empaquesCompraActual.find(e => e.nombre === this.compraForm.empaqueSel);
      return emp ? n(emp.unidades) : 1;
    },

    // Cantidad final (en unidades base) y costo unitario final
    compraCantidadFinal() {
      const mult = this.multiplicadorEmpaque();
      return n(this.compraForm.cantidad) * mult;
    },

    compraCostoUnitarioFinal() {
      const costo = n(this.compraForm.costo);
      if (!this.compraForm.costoPorEmpaque) return costo;
      const mult = this.multiplicadorEmpaque();
      return mult > 0 ? m(costo / mult) : costo;
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
          await db.transaction('rw', db.compras, db.lotes, db.asientos, async () => {
            await db.compras.delete(id);
            if (l) await db.lotes.delete(l.id);
            const as = this.asientos.filter(a => a.refTipo === 'compra' && a.refId === id);
            if (as.length > 0) await db.asientos.bulkDelete(as.map(a => a.id));
          });
          await this.recargar(['compras', 'lotes', 'asientos']);
          this.toastMsg('Compra eliminada');
        }
      };
    },

    async guardarCompra() {
      const f = this.compraForm;
      const cantIngresada = n(f.cantidad), costoIngresado = n(f.costo);
      if (!f.productoId) return this.toastMsg('Selecciona producto', 'bad');
      if (cantIngresada <= 0) return this.toastMsg('Cantidad debe ser > 0', 'bad');
      if (costoIngresado < 0) return this.toastMsg('Costo inválido', 'bad');

      // Convertir a unidades base
      const mult = this.multiplicadorEmpaque();
      const cant = m(cantIngresada * mult);
      const costo = f.costoPorEmpaque ? (mult > 0 ? m(costoIngresado / mult) : costoIngresado) : costoIngresado;
      const total = m(cant * costo);
      const empaqueInfo = f.empaqueSel ? { nombre: f.empaqueSel, unidades: mult, cantidad: cantIngresada } : null;
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
              cantidad: cant, costo, total, anulada: false,
              empaqueInfo
            };
            const lote = {
              id: genId('l'), compraId: compra.id,
              productoId: f.productoId, productoNombre: f.nombre,
              cantidadInicial: cant, cantidadVendida: 0,
              costo, fecha: compra.fecha, empaqueInfo
            };
            await db.transaction('rw', db.compras, db.lotes, async () => {
              await P(db.compras, compra);
              await P(db.lotes, lote);
            });
          }
          await this.recargar(['compras', 'lotes']);
          const compraGuardada = f.editId
            ? this.compras.find(x => x.id === f.editId)
            : this.compras.slice().sort((a,b) => new Date(b.fecha) - new Date(a.fecha))[0];
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
      this.prodForm = { editId: '', nombre: '', precio: '', stockMin: String(this.cfg.stockMinDefault || 5), preciosEscalonados: [], empaques: [], nota: '' };
    },

    agregarEscalon() {
      if (!this.prodForm.preciosEscalonados) this.prodForm.preciosEscalonados = [];
      this.prodForm.preciosEscalonados.push({ min: '', precio: '' });
    },

    quitarEscalon(i) {
      this.prodForm.preciosEscalonados.splice(i, 1);
    },

    agregarEmpaque() {
      if (!this.prodForm.empaques) this.prodForm.empaques = [];
      this.prodForm.empaques.push({ nombre: '', unidades: '' });
    },

    quitarEmpaque(i) {
      this.prodForm.empaques.splice(i, 1);
    },

    async guardarProducto() {
      const p = this.prodForm;
      const nombre = (p.nombre || '').trim();
      const precio = n(p.precio);
      const min = n(p.stockMin);
      if (!nombre) return this.toastMsg('Nombre obligatorio', 'bad');
      if (precio <= 0) return this.toastMsg('Precio debe ser > 0', 'bad');
      const dup = this.productos.find(x => x.nombre.toLowerCase() === nombre.toLowerCase() && x.id !== p.editId && !x.archivado);
      if (dup) return this.toastMsg('Ya existe ese nombre', 'bad');

      // Validar y normalizar escalones
      const escalones = (p.preciosEscalonados || [])
        .filter(e => n(e.min) > 0 && n(e.precio) > 0)
        .map(e => ({ min: n(e.min), precio: n(e.precio) }))
        .sort((a, b) => a.min - b.min);

      const empaques = (p.empaques || [])
        .filter(e => (e.nombre || '').trim() && n(e.unidades) > 0)
        .map(e => ({ nombre: e.nombre.trim(), unidades: Math.floor(n(e.unidades)) }));
      const nota = (p.nota || '').trim();

      if (p.editId) {
        const o = this.productos.find(x => x.id === p.editId);
        await P(db.productos, Object.assign({}, o, { nombre, precio, stockMinimo: min, preciosEscalonados: escalones, empaques, nota }));
        this.toastMsg('Producto actualizado');
      } else {
        await P(db.productos, { id: genId('p'), nombre, precio, stockMinimo: min, archivado: false, preciosEscalonados: escalones, empaques, nota });
        this.toastMsg('Producto agregado');
      }
      this.resetProd();
      await this.recargar(['productos']);
    },

    editarProducto(id) {
      const p = this.productos.find(x => x.id === id);
      if (!p) return;
      this.prodForm = {
        editId: id, nombre: p.nombre, precio: String(p.precio),
        stockMin: String(p.stockMinimo || 5),
        preciosEscalonados: (p.preciosEscalonados || []).map(e => ({ min: String(e.min), precio: String(e.precio) })),
        empaques: (p.empaques || []).map(e => ({ nombre: e.nombre, unidades: String(e.unidades) })),
        nota: p.nota || ''
      };
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
        await db.transaction('rw', db.ajustes, db.lotes, db.asientos, async () => {
          await P(db.ajustes, aj);
          await P(db.lotes, lote);
          if (cs > 0) {
            const asSob = this.crearAsientoObj(aj.fecha, 'Sobrante inventario ' + prod.nombre, this.CUENTAS.INVENTARIO, this.CUENTAS.SOBRANTES_INV, m(cant * cs), 'ajuste', aj.id);
            await P(db.asientos, asSob);
          }
        });
        await this.recargar(['ajustes', 'lotes', 'asientos']);
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
    async guardarCapInicial() {
      const val = n(this.capInicialStr);
      const anterior = n(this.cfg.capitalInicial);
      const diff = m(val - anterior);
      if (Math.abs(diff) < 0.01) {
        this.capInicialStr = '';
        return this.toastMsg('Sin cambios');
      }
      const C = this.CUENTAS;
      const fecha = new Date().toISOString();
      this.cfg.capitalInicial = val;
      try {
        await db.transaction('rw', db.asientos, db.config, async () => {
          await P(db.config, { key: 'cfg', value: this.cfg });
          if (diff > 0) {
            await P(db.asientos, this.crearAsientoObj(fecha, 'Ajuste capital inicial', C.CAJA, C.CAPITAL, diff, 'capital', 'cap_' + Date.now()));
          } else {
            await P(db.asientos, this.crearAsientoObj(fecha, 'Ajuste capital inicial', C.CAPITAL, C.CAJA, Math.abs(diff), 'capital', 'cap_' + Date.now()));
          }
        });
        await this.recargar(['asientos']);
      } catch (e) { console.error('guardarCapInicial', e); }
      this.capInicialStr = '';
      this.toastMsg('Capital inicial: ' + fmt(val));
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
      await P(db.capital, { id: genId('k'), fecha: new Date().toISOString(), monto, nota: this.aporteForm.nota || '', socioId: this.aporteForm.socioId || null });
      await this.recargar(['capital']);
      const kGuardado = this.capital.slice().sort((a,b) => new Date(b.fecha) - new Date(a.fecha))[0];
      if (kGuardado) { await this.recrearAsientoAporte(kGuardado); await this.recargar(['asientos']); }
      this.aporteForm = { monto: '', nota: '', socioId: '' };
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
            const C = this.CUENTAS;
            await db.transaction('rw', db.cierres, db.asientos, async () => {
              await P(db.cierres, c);
              const asientos = [];
              const desc = 'Cierre ' + fmtFecha(i.toISOString()) + ' - ' + fmtFecha(f.toISOString());

              // 1. Cerrar Ventas
              if (totVentas > 0.01) {
                asientos.push(this.crearAsientoObj(f.toISOString(), desc + ' | Cerrar Ventas', C.VENTAS, C.RESULTADO, totVentas, 'cierre', c.id));
              }
              // 2. Cerrar Costo de ventas
              if (cogs > 0.01) {
                asientos.push(this.crearAsientoObj(f.toISOString(), desc + ' | Cerrar Costo ventas', C.RESULTADO, C.COSTO_VENTAS, cogs, 'cierre', c.id));
              }
              // 3. Cerrar Gastos
              if (totGastos > 0.01) {
                asientos.push(this.crearAsientoObj(f.toISOString(), desc + ' | Cerrar Gastos', C.RESULTADO, C.GASTOS, totGastos, 'cierre', c.id));
              }
              // 4. Cerrar Mermas
              if (totMermas > 0.01) {
                asientos.push(this.crearAsientoObj(f.toISOString(), desc + ' | Cerrar Mermas', C.RESULTADO, C.MERMAS, totMermas, 'cierre', c.id));
              }
              // 5. Transferir resultado a Ganancias acumuladas
              if (Math.abs(neta) > 0.01) {
                if (neta > 0) {
                  asientos.push(this.crearAsientoObj(f.toISOString(), desc + ' | Resultado a Ganancias', C.RESULTADO, C.GANANCIAS_ACUM, neta, 'cierre', c.id));
                } else {
                  asientos.push(this.crearAsientoObj(f.toISOString(), desc + ' | Perdida a Ganancias', C.GANANCIAS_ACUM, C.RESULTADO, Math.abs(neta), 'cierre', c.id));
                }
              }

              if (asientos.length) await db.asientos.bulkPut(asientos.map(x => clean(x)));
            });
            await this.guardarCfg();
            await this.recargar(['cierres', 'asientos']);
            this.toastMsg('Período cerrado · Resultado ' + fmt(neta));
          }
        };
      });
    },

    // ===== CUADRE / REPORTES (NUEVO) =====
    setSemana() {
      const now = new Date();
      const ini = new Date(now);
      ini.setDate(now.getDate() - 7);
      this.rep.fechaInicio = ini.toISOString().split('T')[0];
      this.rep.fechaFin = now.toISOString().split('T')[0];
      this.rep.isoInicio = ini.toISOString();
      this.rep.isoFin = now.toISOString();
      this.rep.periodoActivo = 'semana';
    },

    setMesAnterior() {
      const now = new Date();
      const ini = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const fin = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      this.rep.fechaInicio = ini.toISOString().split('T')[0];
      this.rep.fechaFin = fin.toISOString().split('T')[0];
      this.rep.isoInicio = ini.toISOString();
      this.rep.isoFin = fin.toISOString();
      this.rep.periodoActivo = 'mes-ant';
    },

    setAnio() {
      const now = new Date();
      const ini = new Date(now.getFullYear(), 0, 1);
      this.rep.fechaInicio = ini.toISOString().split('T')[0];
      this.rep.fechaFin = now.toISOString().split('T')[0];
      this.rep.isoInicio = ini.toISOString();
      this.rep.isoFin = now.toISOString();
      this.rep.periodoActivo = 'anio';
    },

    setHoy() {
      this.rep.fechaInicio = this.rep.fechaFin = new Date().toISOString().split('T')[0];
      this.rep.isoInicio = null;
      this.rep.isoFin = null;
      this.rep.periodoActivo = 'hoy';
    },

    setPeriodoCierre(c) {
      const ini = new Date(c.periodoInicio || c.fechaCierre);
      const fin = new Date(c.periodoFin || c.fechaCierre);
      this.rep.fechaInicio = ini.toISOString().split('T')[0];
      this.rep.fechaFin = fin.toISOString().split('T')[0];
      this.rep.isoInicio = ini.toISOString();
      this.rep.isoFin = fin.toISOString();
      this.rep.periodoActivo = c.id;
    },

    setMesActual() {
      const now = new Date();
      const inicio = new Date(now.getFullYear(), now.getMonth(), 1);
      this.rep.fechaInicio = inicio.toISOString().split('T')[0];
      this.rep.fechaFin = now.toISOString().split('T')[0];
      this.rep.isoInicio = null;
      this.rep.isoFin = null;
      this.rep.periodoActivo = 'mes';
    },

    setPeriodoActual() {
      this.rep.fechaInicio = this.cfg.periodoInicio.split('T')[0];
      this.rep.fechaFin = new Date().toISOString().split('T')[0];
      this.rep.isoInicio = this.cfg.periodoInicio;
      this.rep.isoFin = new Date().toISOString();
      this.rep.periodoActivo = 'actual';
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

      const cuadre = this.productos.filter(p => !p.archivado || this.stock(p.id) > 0).map(p => {
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

    async generarPDFCuadre() {
      const r = this.rep.resultado;
      if (!r) return;
      this.toastMsg('Generando PDF...');
      const { jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');

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
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Resumen financiero', 14, 35);

      const rowHighlight = (label) => {
        if (label === 'GANANCIA BRUTA') return { fontStyle: 'bold', fillColor: [230, 240, 255] };
        if (label === 'GANANCIA NETA') return { fontStyle: 'bold', fillColor: [220, 252, 231] };
        return null;
      };

      autoTable(doc, {
        startY: 38,
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
        margin: { left: 14, right: 158 },
        columnStyles: { 0: { cellWidth: 78 }, 1: { cellWidth: 47, halign: 'right' } },
        didParseCell: (data) => {
          if (data.section !== 'body') return;
          const label = data.row.raw[0];
          const hl = rowHighlight(label);
          if (hl) Object.assign(data.cell.styles, hl);
        }
      });

      // --- Situación financiera (a la derecha) ---
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59);
      doc.text('Situacion financiera', 155, 35);

      autoTable(doc, {
        startY: 38,
        head: [['Concepto', 'Monto']],
        body: [
          ['Caja', fmt(this.saldoCaja)],
          ['Valor del inventario', fmt(this.valorInventario)],
          ['ACTIVOS TOTALES', fmt(this.saldoCaja + this.valorInventario)],
          ['Capital', fmt(this.capitalTotal)],
          ['Ganancias acumuladas', fmt(this.gananciasAcumuladas)],
          ['PATRIMONIO', fmt(this.patrimonioTotal)],
          ['Disponible para retiro', fmt(this.gananciaDisponible)]
        ],
        theme: 'grid',
        headStyles: { fillColor: [33, 150, 243], textColor: 255, fontStyle: 'bold', fontSize: 10 },
        styles: { fontSize: 10, cellPadding: 3 },
        margin: { left: 155, right: 14 },
        columnStyles: { 0: { cellWidth: 78 }, 1: { cellWidth: 47, halign: 'right' } },
        didParseCell: (data) => {
          if (data.section !== 'body') return;
          const label = data.row.raw[0];
          if (label === 'ACTIVOS TOTALES' || label === 'PATRIMONIO') {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [230, 240, 255];
          }
        }
      });

      // --- Reparto entre socios (abajo a la izquierda) ---
      if (this.sociosActivos.length > 0) {
        const y = doc.lastAutoTable.finalY + 8;
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 41, 59);
        doc.text('Reparto entre socios', 14, y);

        const socioRows = this.sociosActivos.map(sc => [
          sc.nombre,
          n(sc.porcentaje).toFixed(2) + '%',
          fmt(r.neta * n(sc.porcentaje) / 100)
        ]);
        socioRows.push(['TOTAL', '100.00%', fmt(r.neta)]);

        autoTable(doc, {
          startY: y + 3,
          head: [['Socio', '% Participacion', 'Monto a recibir']],
          body: socioRows,
          theme: 'grid',
          headStyles: { fillColor: [124, 58, 237], textColor: 255, fontStyle: 'bold', fontSize: 10 },
          styles: { fontSize: 10, cellPadding: 3 },
          margin: { left: 14, right: 158 },
          columnStyles: { 0: { cellWidth: 55 }, 1: { cellWidth: 32, halign: 'center' }, 2: { cellWidth: 38, halign: 'right' } },
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
      doc.addPage('a4', 'landscape');
      doc.setFillColor(33, 150, 243);
      doc.rect(0, 0, PW, 16, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Detalle por producto', 14, 11);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text((this.cfg.nombre || '') + '  ·  ' + r._fechaI + ' al ' + r._fechaF, PW - 14, 11, { align: 'right' });

      const PFILL = [235, 244, 255];
      const TFILL = [229, 231, 235];

      const bodyRows = [];
      r.cuadre.forEach(row => {
        bodyRows.push([
          { content: row.nombre, styles: { fontStyle: 'bold', fillColor: PFILL } },
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
        row.subfilas.forEach((sf, si) => {
          bodyRows.push([
            { content: '     Lote ' + (si + 1) + ': ' + fmt(sf.costo) + (sf.precio !== null ? ' -> ' + fmt(sf.precio) : ' (sin ventas)'), styles: { fontSize: 8, textColor: [33, 150, 243] } },
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
        startY: 20,
        head: [['Producto', 'Compras', 'Costo u.', 'Ventas', 'Precio u.', 'Ingresos', 'Costo', 'Ganancia', 'Stock', 'Valor']],
        body: bodyRows,
        styles: { fontSize: 8.5, cellPadding: 1.8, overflow: 'linebreak' },
        headStyles: { fillColor: [33, 150, 243], textColor: 255, fontSize: 8.5, fontStyle: 'bold' },
        columnStyles: {
          0: { cellWidth: 65 },
          1: { cellWidth: 18, halign: 'right' },
          2: { cellWidth: 21, halign: 'right' },
          3: { cellWidth: 18, halign: 'right' },
          4: { cellWidth: 21, halign: 'right' },
          5: { cellWidth: 24, halign: 'right' },
          6: { cellWidth: 21, halign: 'right' },
          7: { cellWidth: 24, halign: 'right' },
          8: { cellWidth: 17, halign: 'right' },
          9: { cellWidth: 22, halign: 'right' }
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
    aportesDeSocio(sid) {
      return this.capital.filter(x => x.socioId === sid);
    },
    totalAportesSocio(sid) {
      return m(this.aportesDeSocio(sid).reduce((s, x) => s + n(x.monto), 0));
    },
    asignarAportesViejos() {
      const sid = this.migrarSocioId;
      if (!sid) return this.toastMsg('Elige un socio primero', 'bad');
      const sinAsignar = this.aportesSinSocio;
      if (!sinAsignar.length) return this.toastMsg('No hay aportes sin asignar', 'warn');
      const socio = this.socios.find(x => x.id === sid);
      if (!socio) return;
      const total = this.aportesSinSocioTotal;
      this.confirm = {
        activo: true,
        titulo: 'Asignar aportes',
        msg: 'Asignar ' + sinAsignar.length + ' aporte(s) por ' + fmt(total) + ' a ' + socio.nombre + '?',
        onOk: async () => {
          try {
            const actualizados = sinAsignar.map(x => Object.assign({}, x, { socioId: sid }));
            await db.capital.bulkPut(actualizados.map(x => clean(x)));
            await this.recargar(['capital']);
            this.migrarSocioId = '';
            this.toastMsg('Asignados ' + actualizados.length + ' aportes');
          } catch (e) { this.toastMsg('Error: ' + e.message, 'bad'); }
        }
      };
    },
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

    // ===== PASIVOS =====
    resetPasivo() {
      this.pasivoForm = { editId: '', acreedor: '', concepto: '', monto: '', fecha: new Date().toISOString().split('T')[0], vencimiento: '', nota: '' };
    },

    async guardarPasivo() {
      const f = this.pasivoForm;
      const acreedor = (f.acreedor || '').trim();
      const concepto = (f.concepto || '').trim();
      const monto = n(f.monto);
      if (!acreedor) return this.toastMsg('Acreedor obligatorio', 'bad');
      if (!concepto) return this.toastMsg('Concepto obligatorio', 'bad');
      if (monto <= 0) return this.toastMsg('Monto debe ser > 0', 'bad');

      const fechaISO = f.fecha ? new Date(f.fecha + 'T12:00:00').toISOString() : new Date().toISOString();
      const vencISO = f.vencimiento ? new Date(f.vencimiento + 'T12:00:00').toISOString() : null;

      if (f.editId) {
        const o = this.pasivos.find(x => x.id === f.editId);
        if (!o) return;
        await P(db.pasivos, Object.assign({}, o, { acreedor, concepto, monto, fecha: fechaISO, vencimiento: vencISO, nota: f.nota || '' }));
        this.toastMsg('Pasivo actualizado');
      } else {
        await P(db.pasivos, { id: genId('pv'), acreedor, concepto, monto, fecha: fechaISO, vencimiento: vencISO, nota: f.nota || '', pagado: false });
        this.toastMsg('Pasivo registrado: ' + fmt(monto));
      }
      this.resetPasivo();
      await this.recargar(['pasivos']);
    },

    editarPasivo(id) {
      const p = this.pasivos.find(x => x.id === id);
      if (!p) return;
      this.pasivoForm = {
        editId: p.id,
        acreedor: p.acreedor || '',
        concepto: p.concepto || '',
        monto: String(p.monto || ''),
        fecha: p.fecha ? p.fecha.split('T')[0] : new Date().toISOString().split('T')[0],
        vencimiento: p.vencimiento ? p.vencimiento.split('T')[0] : '',
        nota: p.nota || ''
      };
      window.scrollTo(0, 0);
    },

    eliminarPasivo(id) {
      const p = this.pasivos.find(x => x.id === id);
      if (!p) return;
      this.confirm = {
        activo: true, titulo: 'Eliminar pasivo',
        msg: 'Eliminar deuda con "' + p.acreedor + '" por ' + fmt(p.monto) + '?',
        onOk: async () => {
          await db.pasivos.delete(id);
          await this.recargar(['pasivos']);
          this.toastMsg('Pasivo eliminado');
        }
      };
    },

    pagarPasivo(id) {
      const p = this.pasivos.find(x => x.id === id);
      if (!p || p.pagado) return;
      this.confirm = {
        activo: true, titulo: 'Pagar deuda',
        msg: 'Pagar ' + fmt(p.monto) + ' a "' + p.acreedor + '"? Se registrara un gasto y saldra de caja.',
        onOk: async () => {
          try {
            const ahora = new Date().toISOString();
            const movId = genId('mc');
            await db.transaction('rw', db.pasivos, db.movCaja, db.asientos, async () => {
              await P(db.pasivos, Object.assign({}, p, { pagado: true, fechaPago: ahora, movPagoId: movId }));
              await P(db.movCaja, {
                id: movId,
                fecha: ahora,
                tipo: 'egreso',
                monto: n(p.monto),
                concepto: 'Pago deuda: ' + p.acreedor + ' - ' + p.concepto,
                nota: p.nota || ''
              });
              const as = this.crearAsientoObj(ahora, 'Pago deuda ' + p.acreedor, this.CUENTAS.PASIVOS, this.CUENTAS.CAJA, n(p.monto), 'pago_pasivo', p.id);
              await P(db.asientos, as);
            });
            await this.recargar(['pasivos', 'movCaja', 'asientos']);
            this.toastMsg('Deuda pagada: ' + fmt(p.monto));
          } catch (e) { this.toastMsg('Error: ' + e.message, 'bad'); }
        }
      };
    },

    borrarTodo() {
      this.confirm = {
        activo: true,
        titulo: '⚠ BORRAR TODO',
        msg: 'Esto eliminara PERMANENTEMENTE todos los datos de la app. No se puede deshacer.',
        onOk: () => {
          this.prompt = {
            activo: true,
            titulo: 'Confirmacion final',
            msg: 'Escribe BORRAR (en mayusculas) para confirmar:',
            placeholder: 'BORRAR',
            type: 'text',
            value: '',
            onOk: async (v) => {
              if (v !== 'BORRAR') return this.toastMsg('Cancelado', 'warn');
              try {
                const tables = ['productos','lotes','ventas','compras','ajustes','arqueos','movCaja','cierres','capital','retiros','socios','distribuciones','gastos','asientos','pasivos'];
                await db.transaction('rw', tables.concat(['config']), async () => {
                  for (const t of tables) await db.table(t).clear();
                  await db.config.clear();
                });
                this.toastMsg('Todos los datos eliminados');
                setTimeout(() => location.reload(), 1200);
              } catch (e) { this.toastMsg('Error: ' + e.message, 'bad'); }
            }
          };
        }
      };
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
    async enviarNotif(titulo, cuerpo) {
      try {
        if (!('Notification' in window)) return { ok: false, motivo: 'sin-soporte' };
        if (Notification.permission !== 'granted') return { ok: false, motivo: 'sin-permiso' };
        const opts = {
          body: cuerpo,
          icon: '/Tienda-ultima/icons/icon-192.png',
          badge: '/Tienda-ultima/icons/icon-192.png',
          tag: 'tienda-' + Date.now()
        };
        // Intentar con ServiceWorker primero (requerido en Chrome movil)
        if ('serviceWorker' in navigator) {
          try {
            const reg = await navigator.serviceWorker.ready;
            if (reg && reg.showNotification) {
              await reg.showNotification(titulo, opts);
              return { ok: true, via: 'sw' };
            }
          } catch (e) { /* sigue con fallback */ }
        }
        // Fallback a constructor (escritorio)
        try {
          new Notification(titulo, opts);
          return { ok: true, via: 'constructor' };
        } catch (e2) {
          return { ok: false, motivo: 'constructor-bloqueado', error: e2.message };
        }
      } catch (e) {
        console.error('enviarNotif', e);
        return { ok: false, motivo: 'error', error: e.message };
      }
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

    async probarNotif() {
      if (!('Notification' in window)) {
        return this.toastMsg('Este dispositivo no soporta notificaciones', 'bad');
      }
      if (Notification.permission !== 'granted') {
        return this.toastMsg('Primero activa las notificaciones', 'warn');
      }
      const r = await this.enviarNotif('Tienda Pro', 'Esta es una notificacion de prueba');
      if (r && r.ok) {
        this.toastMsg('Notificacion enviada (' + r.via + ')');
      } else {
        const m = r ? (r.motivo || 'desconocido') : 'error';
        this.toastMsg('Fallo: ' + m + ' - revisa permisos del navegador', 'bad');
      }
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

    // ===== AUDITORIA =====
    costoPromProducto(pid) {
      const lotes = this.lotes.filter(l => l.productoId === pid && (n(l.cantidadInicial) - n(l.cantidadVendida)) > 0);
      const tot = lotes.reduce((s, l) => s + (n(l.cantidadInicial) - n(l.cantidadVendida)), 0);
      if (tot <= 0) return 0;
      const val = lotes.reduce((s, l) => s + (n(l.cantidadInicial) - n(l.cantidadVendida)) * n(l.costo), 0);
      return m(val / tot);
    },

    iniciarAuditoria() {
      this.auditForm = { cajaContada: '', cajaNota: '', paso: 1, conteos: {} };
      this.auditActiva = {
        id: genId('aud'),
        fechaInicio: new Date().toISOString(),
        estado: 'en_progreso',
        caja: null,
        inventario: null,
        resumen: null
      };
      this.toastMsg('Auditoria iniciada');
    },

    cancelarAuditoria() {
      this.confirm = {
        activo: true, titulo: 'Cancelar auditoria',
        msg: 'Se descartara el progreso actual. Continuar?',
        onOk: () => {
          this.auditActiva = null;
          this.auditForm = { cajaContada: '', cajaNota: '', paso: 1, conteos: {} };
          this.toastMsg('Auditoria cancelada');
        }
      };
    },

    auditSiguientePaso() {
      if (this.auditForm.paso === 1) {
        if (this.auditForm.cajaContada === '') return this.toastMsg('Escribe el monto contado', 'bad');
        this.auditForm.paso = 2;
      } else if (this.auditForm.paso === 2) {
        this.auditForm.paso = 3;
      }
    },

    auditPasoAnterior() {
      if (this.auditForm.paso > 1) this.auditForm.paso--;
    },

    setAuditConteo(pid, val) {
      if (!this.auditForm.conteos[pid]) this.auditForm.conteos[pid] = {};
      this.auditForm.conteos[pid].contado = val;
    },

    limpiarConteo(pid) {
      if (this.auditForm.conteos[pid]) {
        this.auditForm.conteos[pid].contado = '';
      }
    },

    marcarTodoIgual() {
      this.prodsActivos.forEach(p => {
        if (!this.auditForm.conteos[p.id]) this.auditForm.conteos[p.id] = {};
        this.auditForm.conteos[p.id].contado = m(this.stock(p.id));
      });
      this.toastMsg('Todos marcados como igual al sistema');
    },

    limpiarConteos() {
      this.auditForm.conteos = {};
      this.toastMsg('Conteos limpiados');
    },

    async cerrarAuditoria() {
      if (!this.auditActiva) return;
      const r = this.auditResumen;
      if (!r) return;
      const difCaja = r.difCaja;
      const conteoAjustes = r.conteo.filter(x => x.dif !== 0);
      const totalDif = r.totalDif;

      const listado = [];
      if (Math.abs(difCaja) > 0.01) listado.push('Caja: ' + fmt(difCaja));
      conteoAjustes.forEach(x => listado.push(x.nombre + ': ' + x.dif + ' und (' + fmt(x.costoDif) + ')'));
      if (!listado.length) listado.push('Sin diferencias');

      this.confirm = {
        activo: true,
        titulo: 'Cerrar auditoria',
        msg: 'Diferencia total: ' + fmt(totalDif) + '\n\n' + listado.join('\n') + '\n\nSe generaran ajustes automaticos. Continuar?',
        onOk: async () => {
          try {
            const ahora = new Date().toISOString();
            const auditId = this.auditActiva.id;
            const C = this.CUENTAS;
            const asientos = [];
            const ajustesNuevos = [];
            const movCajaNuevos = [];

            // 1. Ajuste de caja
            if (Math.abs(difCaja) > 0.01) {
              const movId = genId('mc');
              if (difCaja > 0) {
                movCajaNuevos.push({ id: movId, fecha: ahora, tipo: 'ingreso', monto: difCaja, concepto: 'Sobrante de auditoria', nota: this.auditForm.cajaNota || '' });
                asientos.push(this.crearAsientoObj(ahora, 'Auditoria | Sobrante caja', C.CAJA, C.SOBRANTES, difCaja, 'auditoria', auditId));
              } else {
                movCajaNuevos.push({ id: movId, fecha: ahora, tipo: 'egreso', monto: Math.abs(difCaja), concepto: 'Faltante de auditoria', nota: this.auditForm.cajaNota || '' });
                asientos.push(this.crearAsientoObj(ahora, 'Auditoria | Faltante caja', C.FALTANTES, C.CAJA, Math.abs(difCaja), 'auditoria', auditId));
              }
            }

            // 2. Ajustes de inventario
            for (const item of conteoAjustes) {
              const ajId = genId('a');
              if (item.dif < 0) {
                // Faltante: usar FIFO para calcular el costo real
                const res = this.calcFIFO(item.productoId, Math.abs(item.dif));
                if (!res.error) {
                  ajustesNuevos.push({
                    id: ajId,
                    fecha: ahora,
                    productoId: item.productoId,
                    productoNombre: item.nombre,
                    cantidad: item.dif,
                    motivo: 'auditoria',
                    costoPerdida: res.costoTotal,
                    lotesUsados: res.usados,
                    auditoriaId: auditId
                  });
                  asientos.push(this.crearAsientoObj(ahora, 'Auditoria | Faltante ' + item.nombre, C.MERMAS, C.INVENTARIO, res.costoTotal, 'auditoria', auditId));
                  // Aplicar al lote
                  for (const u of res.usados) {
                    const l = this.lotes.find(x => x.id === u.loteId);
                    if (l) {
                      l.cantidadVendida = q(n(l.cantidadVendida) + u.cantidad);
                      await P(db.lotes, clean(l));
                    }
                  }
                }
              } else {
                // Sobrante
                const cs = item.costoUnit || 0;
                const ajObj = {
                  id: ajId, fecha: ahora, productoId: item.productoId, productoNombre: item.nombre,
                  cantidad: item.dif, motivo: 'auditoria', costoPerdida: 0, auditoriaId: auditId
                };
                ajustesNuevos.push(ajObj);
                const loteId = genId('l');
                await P(db.lotes, clean({
                  id: loteId, compraId: 'aud-' + ajId, productoId: item.productoId,
                  productoNombre: item.nombre, cantidadInicial: item.dif, cantidadVendida: 0,
                  costo: cs, fecha: ahora
                }));
                if (cs > 0) {
                  asientos.push(this.crearAsientoObj(ahora, 'Auditoria | Sobrante ' + item.nombre, C.INVENTARIO, C.SOBRANTES_INV, m(item.dif * cs), 'auditoria', auditId));
                }
              }
            }

            // Guardar todo
            await db.transaction('rw', db.auditorias, db.ajustes, db.movCaja, db.asientos, async () => {
              if (ajustesNuevos.length) await db.ajustes.bulkPut(ajustesNuevos.map(x => clean(x)));
              if (movCajaNuevos.length) await db.movCaja.bulkPut(movCajaNuevos.map(x => clean(x)));
              if (asientos.length) await db.asientos.bulkPut(asientos.map(x => clean(x)));
              await P(db.auditorias, clean({
                id: auditId,
                fechaInicio: this.auditActiva.fechaInicio,
                fechaFin: ahora,
                estado: 'cerrada',
                caja: { sistema: r.cajaSistema, contado: r.cajaContada, diferencia: difCaja, nota: this.auditForm.cajaNota },
                inventario: { items: r.conteo, conteoCompleto: r.totalContados === r.totalProductos },
                resumen: { difCaja, difInventarioCosto: r.difInventarioCosto, totalDif }
              }));
            });

            await this.recargar(['auditorias', 'ajustes', 'movCaja', 'asientos', 'lotes']);
            this.auditActiva = null;
            this.auditForm = { cajaContada: '', cajaNota: '', paso: 1, conteos: {} };
            this.toastMsg('Auditoria cerrada · Dif ' + fmt(totalDif));
          } catch (e) { this.toastMsg('Error: ' + e.message, 'bad'); }
        }
      };
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
          await db.transaction('rw', db.gastos, db.movCaja, db.asientos, async () => {
            await db.gastos.delete(id);
            if (g.movId) await db.movCaja.delete(g.movId);
            const as = this.asientos.filter(a => a.refTipo === 'gasto' && a.refId === id);
            if (as.length > 0) await db.asientos.bulkDelete(as.map(a => a.id));
          });
          await this.recargar(['gastos', 'movCaja', 'asientos']);
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
      const rd = new FileReader();
      rd.onload = async (ev) => {
        try {
          let d = JSON.parse(ev.target.result);
          // Si esta cifrado, pedir contraseña
          if (d.cifrado === true) {
            const pass = await new Promise((resolve) => {
              this.prompt = {
                activo: true, titulo: 'Respaldo cifrado',
                msg: 'Este respaldo esta protegido. Ingresa la contrasena.',
                placeholder: 'Contrasena', type: 'password', value: '',
                onOk: (v) => resolve(v || '')
              };
            });
            if (!pass) return this.toastMsg('Cancelado', 'warn');
            try {
              const salt = Uint8Array.from(atob(d.salt), c => c.charCodeAt(0));
              const iv = Uint8Array.from(atob(d.iv), c => c.charCodeAt(0));
              const cipher = Uint8Array.from(atob(d.data), c => c.charCodeAt(0));
              const key = await this._derivarClave(pass, salt);
              const json = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
              d = JSON.parse(new TextDecoder().decode(json));
            } catch (err) {
              return this.toastMsg('Contrasena incorrecta', 'bad');
            }
          }
          if (!d.productos && !d.ventas) throw new Error('Archivo invalido');
          const campos = [
            { key: 'productos', label: 'Productos' },
            { key: 'lotes', label: 'Lotes' },
            { key: 'ventas', label: 'Ventas' },
            { key: 'compras', label: 'Compras' },
            { key: 'gastos', label: 'Gastos' },
            { key: 'socios', label: 'Socios' },
            { key: 'asientos', label: 'Asientos' },
            { key: 'pasivos', label: 'Pasivos' }
          ];
          const actuales = {
            productos: this.productos.length, lotes: this.lotes.length, ventas: this.ventas.length,
            compras: this.compras.length, gastos: this.gastos.length, socios: this.socios.length,
            asientos: this.asientos.length, pasivos: this.pasivos.length
          };
          const nuevos = {};
          campos.forEach(c => { nuevos[c.key] = (d[c.key] || []).length; });

          this.importPreview = {
            archivo: d,
            campos,
            actuales,
            nuevos,
            fechaArchivo: d.fecha || null,
            tiendaArchivo: (d.cfg && d.cfg.nombre) || '(sin nombre)'
          };

          const totalActual = campos.reduce((s2, c) => s2 + actuales[c.key], 0);
          const totalNuevo = campos.reduce((s2, c) => s2 + nuevos[c.key], 0);

          let adv = '';
          if (totalActual > 0 && totalNuevo === 0) {
            adv = '⚠ El archivo NO TIENE datos. Importar VACIARA la app.';
          } else if (totalActual > 0 && totalNuevo < totalActual * 0.3) {
            adv = '⚠ El archivo tiene MUCHOS MENOS datos que los actuales. Podrias perder informacion.';
          } else if (totalActual > 0) {
            adv = 'Se reemplazaran TODOS los datos actuales con los del archivo.';
          }

          this.confirm = {
            activo: true,
            titulo: 'Importar datos',
            msg: adv,
            onOk: () => this.ejecutarImport()
          };
        } catch (err) { this.toastMsg('Error: ' + err.message, 'bad'); }
      };
      rd.readAsText(file);
    },

    ejecutarImport() {
      const file = this.importFile;
      if (!file) return;
      const rd = new FileReader();
      rd.onload = async (ev) => {
        try {
          const d = JSON.parse(ev.target.result);
          if (!d.productos && !d.ventas) throw new Error('Archivo invalido');
          await this.importarData(d);
          this.importPreview = null;
          this.ajustesAbierto = false;
          this.toastMsg('Datos importados');
        } catch (e) { this.toastMsg('Error: ' + e.message, 'bad'); }
      };
      rd.readAsText(file);
    },

    cancelarImport() {
      this.importPreview = null;
      this.importFile = null;
    },

    validarEsquema(d) {
      const errores = [];
      const avisos = [];
      // Debe ser objeto
      if (!d || typeof d !== 'object') {
        return { ok: false, errores: ['El archivo no es un objeto valido'] };
      }
      // Debe tener al menos productos o ventas
      if (!d.productos && !d.ventas) {
        errores.push('Falta productos y ventas (no parece un respaldo)');
      }
      // Arrays deben ser arrays
      const tablas = ['productos','lotes','ventas','compras','ajustes','arqueos','movCaja','cierres','capital','retiros','socios','distribuciones','gastos','asientos','pasivos','auditorias'];
      tablas.forEach(t => {
        if (d[t] !== undefined && !Array.isArray(d[t])) {
          errores.push('"' + t + '" no es un array');
        }
      });
      // Cada item debe tener id
      tablas.forEach(t => {
        if (!Array.isArray(d[t])) return;
        const sinId = d[t].filter(x => !x || typeof x !== 'object' || !x.id);
        if (sinId.length > 0) {
          errores.push('"' + t + '": ' + sinId.length + ' item(s) sin id');
        }
      });
      // Ventas deben tener items array
      if (Array.isArray(d.ventas)) {
        const ventasMalas = d.ventas.filter(v => v && v.items && !Array.isArray(v.items));
        if (ventasMalas.length > 0) errores.push(ventasMalas.length + ' venta(s) con items invalidos');
      }
      // Lotes deben tener cantidadInicial
      if (Array.isArray(d.lotes)) {
        const lotesMalos = d.lotes.filter(l => l && (l.cantidadInicial === undefined || l.costo === undefined));
        if (lotesMalos.length > 0) avisos.push(lotesMalos.length + ' lote(s) sin cantidadInicial/costo');
      }
      // Tamaño razonable
      const json = JSON.stringify(d);
      if (json.length > 50 * 1024 * 1024) {
        errores.push('Archivo demasiado grande (>50MB)');
      }
      // Version
      if (d.version && d.version < 6) avisos.push('Respaldo de version antigua (v' + d.version + ')');
      return { ok: errores.length === 0, errores, avisos };
    },

    async importarData(d) {
      // Validar primero
      const v = this.validarEsquema(d);
      if (!v.ok) {
        throw new Error('Datos invalidos:\n· ' + v.errores.join('\n· '));
      }
      if (v.avisos && v.avisos.length) {
        console.warn('Import con avisos:', v.avisos);
      }

      const tables = ['productos', 'lotes', 'ventas', 'compras', 'ajustes', 'arqueos', 'movCaja', 'cierres', 'capital', 'retiros', 'socios', 'distribuciones', 'gastos', 'asientos', 'pasivos', 'auditorias'];
      // Snapshot antes por si falla
      const respaldo = {};
      try {
        for (const t of tables) respaldo[t] = await db.table(t).toArray();
      } catch (e) { console.warn('No pude tomar snapshot', e); }

      try {
        await db.transaction('rw', tables.concat(['config']), async () => {
          for (const t of tables) {
            await db.table(t).clear();
            if (Array.isArray(d[t])) await db.table(t).bulkPut(clean(d[t]));
          }
          if (d.cfg) await P(db.config, { key: 'cfg', value: d.cfg });
        });
      } catch (err) {
        // Rollback manual desde snapshot
        try {
          await db.transaction('rw', tables, async () => {
            for (const t of tables) {
              await db.table(t).clear();
              if (respaldo[t] && respaldo[t].length) await db.table(t).bulkPut(respaldo[t]);
            }
          });
          throw new Error('Fallo la importacion (rollback aplicado): ' + err.message);
        } catch (rb) {
          throw new Error('Fallo la importacion Y el rollback: ' + err.message);
        }
      }
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

    // ===== CIFRADO =====
    async _derivarClave(password, salt) {
      const enc = new TextEncoder();
      const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveKey']);
      return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
        keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
      );
    },

    async exportarCifrado() {
      const pass = await new Promise((resolve) => {
        this.prompt = {
          activo: true, titulo: 'Contraseña de cifrado',
          msg: 'Se guardara el respaldo cifrado con AES-256. Guarda la contraseña: si la pierdes, no se puede recuperar.',
          placeholder: 'Contraseña (min 6 caracteres)', type: 'password', value: '',
          onOk: (v) => resolve(v || '')
        };
      });
      if (!pass || pass.length < 6) return this.toastMsg('Contrasena muy corta (min 6)', 'bad');
      try {
        const data = buildData(this);
        const enc = new TextEncoder();
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const key = await this._derivarClave(pass, salt);
        const json = enc.encode(JSON.stringify(data));
        const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, json);
        const out = {
          version: 1,
          cifrado: true,
          salt: btoa(String.fromCharCode(...salt)),
          iv: btoa(String.fromCharCode(...iv)),
          data: btoa(String.fromCharCode(...new Uint8Array(cipher)))
        };
        this.descargar(
          new Blob([JSON.stringify(out)], { type: 'application/json' }),
          'respaldo-cifrado-' + new Date().toISOString().split('T')[0] + '.json'
        );
        this.toastMsg('Respaldo cifrado descargado');
      } catch (e) {
        this.toastMsg('Error cifrado: ' + e.message, 'bad');
      }
    },

    // ===== TELEGRAM BACKUP =====
    tgTokenActual() {
      return (this.cfg.tgToken || '').trim() || TOKEN_DEFAULT || '';
    },

    async tgVerificar() {
      const token = this.tgTokenActual();
      if (!token) return this.toastMsg('Falta el token del bot', 'bad');
      this.tgCargando = true;
      try {
        const me = await tgGetMe(token);
        const updates = await tgGetUpdates(token);
        const chat = tgDetectarChatId(updates);
        if (!chat) {
          this.tgEstado = 'sin-chat';
          this.toastMsg('Bot OK (@' + me.username + '). Abre Telegram, busca el bot y envia /start', 'warn');
          return;
        }
        this.cfg.tgChatId = String(chat.chatId);
        this.cfg.tgNombre = chat.nombre || chat.username || 'Usuario';
        await this.guardarCfg();
        this.tgEstado = 'conectado';
        this.toastMsg('Conectado a Telegram: ' + this.cfg.tgNombre);
      } catch (e) {
        this.tgEstado = 'error';
        this.toastMsg('Error: ' + e.message, 'bad');
      } finally {
        this.tgCargando = false;
      }
    },

    async tgBackupAhora() {
      const data = buildData(this);
      try {
        await this.tgEnviarDatos(data, 'manual', true);
      } catch (e) {
        await this.tgEncolar(data, 'manual');
        this.toastMsg('Sin conexion. Backup en cola.', 'warn');
      }
    },

    async tgEnviarDatos(data, motivo, mostrarToast) {
      const token = this.tgTokenActual();
      const chatId = this.cfg.tgChatId;
      if (!token || !chatId) throw new Error('Sin conexion a Telegram');

      this.tgCargando = true;
      this.tgProgreso = 'Preparando...';
      try {
        // 1. Serializar
        const json = JSON.stringify(data);
        const hash = await this.hashContenido(json);

        // 2. Si es auto y el hash no cambio, saltar
        if (motivo === 'auto' && this.cfg.tgUltimoHash === hash) {
          this.tgProgreso = 'Sin cambios';
          return { ok: true, saltado: true };
        }

        // 3. Comprimir
        this.tgProgreso = 'Comprimiendo...';
        const blobSinComprimir = new Blob([json], { type: 'application/json' });
        const gz = await this.comprimirGzip(blobSinComprimir);

        // 4. Nombre
        const fecha = new Date().toISOString();
        const fileName = 'tienda-backup-' + fecha.split('T')[0] + '-' + Date.now().toString(36) + '.json.gz';

        // 5. Resumen para caption
        const resumen = data.productos.length + ' prod · ' + data.ventas.length + ' ventas · ' +
                        data.compras.length + ' compras · ' + (blobSinComprimir.size / 1024).toFixed(1) + ' KB';

        // 6. Enviar a Telegram
        this.tgProgreso = 'Subiendo a Telegram...';
        await tgSendDocument(token, chatId, gz, fileName, 'Backup · ' + resumen);

        // 7. Guardar en carpeta del teléfono (si esta configurada)
        if (this.cfg.tgCarpetaActiva) {
          this.tgProgreso = 'Guardando en carpeta...';
          const nombreLocal = 'tienda-backup-' + fecha.split('T')[0] + '.json.gz';
          const okCarpeta = await this.guardarEnCarpeta(nombreLocal, gz);
          if (!okCarpeta && mostrarToast) {
            this.toastMsg('Telegram OK, pero fallo guardar en carpeta', 'warn');
          }
        }

        // 8. Actualizar cfg
        this.cfg.tgUltimoBackup = fecha;
        this.cfg.tgUltimoHash = hash;
        await this.guardarCfg();

        // 9. Rotación: borrar backups viejos si hay más de N
        this.tgProgreso = 'Rotando...';
        try {
          await this.tgListar();
          await this.tgRotarViejos();
        } catch (e) {}

        this.tgProgreso = '';
        if (mostrarToast) {
          this.toastMsg('Backup OK · ' + (gz.size / 1024).toFixed(1) + ' KB comprimido');
        }
        return { ok: true, size: gz.size };
      } finally {
        this.tgCargando = false;
        this.tgProgreso = '';
      }
    },

    async tgListar() {
      const token = this.tgTokenActual();
      if (!token) return;
      this.tgCargando = true;
      try {
        const updates = await tgGetUpdates(token);
        this.tgBackups = tgExtraerBackups(updates);
        this.toastMsg(this.tgBackups.length + ' backup(s) encontrado(s)');
      } catch (e) {
        this.toastMsg('Error: ' + e.message, 'bad');
      } finally {
        this.tgCargando = false;
      }
    },

    async tgRestaurar(bk) {
      const token = this.tgTokenActual();
      if (!token) return;
      this.confirm = {
        activo: true,
        titulo: 'Restaurar backup',
        msg: 'Restaurar el backup del ' + fmtFH(bk.fecha) + ' (' + (bk.fileSize / 1024).toFixed(1) + ' KB)?\n\nLos datos actuales seran REEMPLAZADOS.',
        onOk: async () => {
          this.tgCargando = true;
          this.tgProgreso = 'Descargando...';
          try {
            const file = await tgGetFile(token, bk.fileId);
            const url = tgFileUrl(token, file.file_path);
            const r = await fetch(url);
            const blob = await r.blob();
            let txt;
            // Si termina en .gz, descomprimir
            if (bk.fileName.endsWith('.gz')) {
              this.tgProgreso = 'Descomprimiendo...';
              const descomprimido = await this.descomprimirGzip(blob);
              txt = await descomprimido.text();
            } else {
              txt = await blob.text();
            }
            this.tgProgreso = 'Importando...';
            const d = JSON.parse(txt);
            if (!d.productos && !d.ventas) throw new Error('Archivo invalido');
            await this.importarData(d);
            this.toastMsg('Backup restaurado (' + fmtFH(bk.fecha) + ')');
          } catch (e) {
            this.toastMsg('Error: ' + e.message, 'bad');
          } finally {
            this.tgCargando = false;
            this.tgProgreso = '';
          }
        }
      };
    },

    async tgEliminar(bk) {
      const token = this.tgTokenActual();
      const chatId = this.cfg.tgChatId;
      if (!token || !chatId) return;
      this.confirm = {
        activo: true,
        titulo: 'Eliminar backup',
        msg: 'Eliminar el backup del ' + fmtFH(bk.fecha) + ' de Telegram?',
        onOk: async () => {
          try {
            await tgDeleteMessage(token, chatId, bk.messageId);
            this.tgBackups = this.tgBackups.filter(x => x.messageId !== bk.messageId);
            this.toastMsg('Backup eliminado');
          } catch (e) {
            this.toastMsg('Error: ' + e.message, 'bad');
          }
        }
      };
    },

    tgDesconectar() {
      this.confirm = {
        activo: true,
        titulo: 'Desconectar Telegram',
        msg: 'Se borrara el token y el chat_id guardados. Los backups en Telegram no se tocan.',
        onOk: async () => {
          this.cfg.tgToken = '';
          this.cfg.tgChatId = '';
          this.cfg.tgNombre = '';
          this.cfg.tgAutoBackup = false;
          await this.guardarCfg();
          this.tgEstado = 'sin-config';
          this.tgBackups = [];
          this.toastMsg('Desconectado');
        }
      };
    },

    async tgAutoDetectarChat() {
      const token = this.tgTokenActual();
      if (!token) return false;
      if (this.cfg.tgChatId) return true;
      try {
        const updates = await tgGetUpdates(token);
        const chat = tgDetectarChatId(updates);
        if (chat) {
          this.cfg.tgChatId = String(chat.chatId);
          this.cfg.tgNombre = chat.nombre || chat.username || 'Usuario';
          this.cfg.tgAutoBackup = true;
          await this.guardarCfg();
          this.tgEstado = 'conectado';
          console.log('Telegram: chat auto-detectado', chat);
          this.toastMsg('Telegram conectado: ' + this.cfg.tgNombre);
          return true;
        }
        this.tgEstado = 'esperando-start';
        return false;
      } catch (e) {
        console.warn('tgAutoDetectarChat', e);
        this.tgEstado = 'error';
        return false;
      }
    },

    async tgAutoBackupCheck() {
      // 1. Procesar cola pendiente primero
      try { await this.tgProcesarCola(); } catch (e) {}
      // 2. Auto-backup si esta activo
      if (!this.cfg.tgAutoBackup) return;
      if (!this.cfg.tgChatId) return;
      const ult = this.cfg.tgUltimoBackup ? new Date(this.cfg.tgUltimoBackup).getTime() : 0;
      const horas = (Date.now() - ult) / 3600000;
      if (horas >= 24) {
        const data = buildData(this);
        try {
          await this.tgEnviarDatos(data, 'auto', false);
        } catch (e) {
          // Si falla, encolar
          await this.tgEncolar(data, 'auto');
        }
      }
    },

    async tgEncolarAhora() {
      const data = buildData(this);
      await this.tgEncolar(data, 'manual-offline');
      this.toastMsg('Backup guardado en cola (se enviara al recuperar conexion)');
    },

    _tgPollTimer: null,
    iniciarTgPoll() {
      if (this._tgPollTimer) return;
      this._tgPollTimer = setInterval(async () => {
        if (this.cfg.tgChatId) { clearInterval(this._tgPollTimer); this._tgPollTimer = null; return; }
        await this.tgAutoDetectarChat();
      }, 5000);
    },

    // ===== HELPER: compresión gzip =====
    async comprimirGzip(blob) {
      if (typeof CompressionStream === 'undefined') return blob;
      try {
        const cs = new CompressionStream('gzip');
        const stream = blob.stream().pipeThrough(cs);
        return new Blob([await new Response(stream).arrayBuffer()], { type: 'application/gzip' });
      } catch (e) { return blob; }
    },

    async descomprimirGzip(blob) {
      if (typeof DecompressionStream === 'undefined') return blob;
      try {
        const ds = new DecompressionStream('gzip');
        const stream = blob.stream().pipeThrough(ds);
        return new Blob([await new Response(stream).arrayBuffer()], { type: 'application/json' });
      } catch (e) { return blob; }
    },

    async hashContenido(texto) {
      try {
        const enc = new TextEncoder().encode(texto);
        const buf = await crypto.subtle.digest('SHA-256', enc);
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
      } catch (e) { return String(texto.length); }
    },

    // ===== COLA DE BACKUPS =====
    async tgEncolar(datos, motivo) {
      const id = genId('tq');
      await P(db.tgQueue, {
        id,
        ts: new Date().toISOString(),
        estado: 'pendiente',
        intentos: 0,
        motivo: motivo || 'auto',
        datos
      });
      await this.tgActualizarCola();
      return id;
    },

    async tgActualizarCola() {
      try {
        const items = await db.tgQueue.toArray();
        this.tgColaPendiente = items.filter(x => x.estado === 'pendiente' || x.estado === 'error').length;
      } catch (e) { this.tgColaPendiente = 0; }
    },

    async tgProcesarCola() {
      if (this.tgProcesandoCola) return;
      if (!this.cfg.tgChatId) return;
      this.tgProcesandoCola = true;
      try {
        const items = await db.tgQueue.filter(x => x.estado === 'pendiente' || (x.estado === 'error' && (x.intentos || 0) < 5)).toArray();
        for (const item of items) {
          if (item.intentos >= 5) {
            await P(db.tgQueue, Object.assign({}, item, { estado: 'fallido' }));
            continue;
          }
          try {
            await P(db.tgQueue, Object.assign({}, item, { estado: 'enviando' }));
            await this.tgEnviarDatos(item.datos, item.motivo, false);
            await db.tgQueue.delete(item.id);
          } catch (e) {
            await P(db.tgQueue, Object.assign({}, item, {
              estado: 'error',
              intentos: (item.intentos || 0) + 1,
              ultimoError: e.message
            }));
          }
        }
        await this.tgActualizarCola();
      } finally {
        this.tgProcesandoCola = false;
      }
    },

    // ===== ROTACIÓN =====
    async tgRotarViejos() {
      const mantener = n(this.cfg.tgMantenerN) || 10;
      if (this.tgBackups.length <= mantener) return 0;
      const sobrantes = this.tgBackups.slice(mantener);
      const token = this.tgTokenActual();
      const chatId = this.cfg.tgChatId;
      let borrados = 0;
      for (const bk of sobrantes) {
        try {
          await tgDeleteMessage(token, chatId, bk.messageId);
          borrados++;
        } catch (e) {}
      }
      if (borrados > 0) {
        this.tgBackups = this.tgBackups.slice(0, mantener);
        console.log('Telegram: ' + borrados + ' backups viejos eliminados');
      }
      return borrados;
    },

    // ===== GUARDAR EN CARPETA DEL TELÉFONO =====
    async elegirCarpeta() {
      if (typeof window.showDirectoryPicker !== 'function') {
        this.toastMsg('Tu navegador no soporta elegir carpeta. Se usara Descargas.', 'warn');
        this.cfg.tgCarpetaActiva = false;
        return;
      }
      try {
        const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
        // Guardar handle en IndexedDB
        await P(db.config, { key: 'carpetaHandle', value: await this.serializarHandle(handle), nombre: handle.name });
        this._carpetaHandle = handle;
        this.cfg.tgCarpetaActiva = true;
        this.cfg.tgCarpetaNombre = handle.name;
        await this.guardarCfg();
        this.toastMsg('Carpeta: ' + handle.name);
      } catch (e) {
        if (e.name !== 'AbortError') this.toastMsg('Error: ' + e.message, 'bad');
      }
    },

    async serializarHandle(handle) {
      // No se puede serializar directo, pero IndexedDB lo soporta nativamente
      return handle;
    },

    async guardarEnCarpeta(fileName, contenidoBlob) {
      // 1. Verificar handle guardado
      if (!this._carpetaHandle) {
        try {
          const rec = await db.config.get('carpetaHandle');
          if (rec && rec.value) this._carpetaHandle = rec.value;
        } catch (e) {}
      }
      if (!this._carpetaHandle) return false;
      // 2. Verificar permiso
      try {
        const perm = await this._carpetaHandle.queryPermission({ mode: 'readwrite' });
        if (perm !== 'granted') {
          const req = await this._carpetaHandle.requestPermission({ mode: 'readwrite' });
          if (req !== 'granted') return false;
        }
      } catch (e) { return false; }
      // 3. Escribir archivo
      try {
        const fh = await this._carpetaHandle.getFileHandle(fileName, { create: true });
        const w = await fh.createWritable();
        await w.write(contenidoBlob);
        await w.close();
        return true;
      } catch (e) {
        console.error('guardarEnCarpeta', e);
        return false;
      }
    },

    async quitarCarpeta() {
      this._carpetaHandle = null;
      this.cfg.tgCarpetaActiva = false;
      this.cfg.tgCarpetaNombre = '';
      try { await db.config.delete('carpetaHandle'); } catch (e) {}
      await this.guardarCfg();
      this.toastMsg('Carpeta desconectada');
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
        asientos: () => db.asientos.toArray(),
        pasivos: () => db.pasivos.toArray(),
        auditorias: () => db.auditorias.toArray()
      };
      for (const w of what) this[w] = await map[w]();
      this._stockMapCache = null;
      this._anomaliasCache = null;
      this._topRentCache = null;
      this._invAgrCache = null;
    },

    async recargarTodo() {
      const t = performance.now();
      const tables = ['productos','lotes','ventas','compras','ajustes','arqueos','movCaja','cierres','capital','retiros','socios','distribuciones','gastos','asientos','pasivos','auditorias'];
      let r;
      await db.transaction('r', tables.map(tb => db.table(tb)), async () => {
        r = await Promise.all(tables.map(tb => db.table(tb).toArray()));
      });
      tables.forEach((k, i) => this[tables[i]] = r[i]);
      this.invalidarFifoCache();
      this._stockMapCache = null;
      this._anomaliasCache = null;
      this._topRentCache = null;
      this._invAgrCache = null;
      const ms = (performance.now() - t).toFixed(1);
      if (ms > 100) console.log('recargarTodo: ' + ms + 'ms');
    },

    // ===== CHART =====
    async renderChart() {
      try {
        const cv = document.getElementById('chartVentas');
        if (!cv) return;
        if (this._chart) { try { this._chart.destroy(); } catch (e) {} this._chart = null; }
        const { default: Chart } = await import('chart.js/auto');
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
      const _t0 = performance.now();
      // Deteccion multi-pestana
      try {
        this._tabId = genId('tab');
        if (typeof BroadcastChannel !== 'undefined') {
          this._bc = new BroadcastChannel('tienda-pro');
          this._bc.onmessage = (e) => {
            if (e.data && e.data.tipo === 'hello' && e.data.tabId !== this._tabId) {
              // Otra pestaña existe, avisar
              this._otraPestana = true;
              this._bc.postMessage({ tipo: 'existe', tabId: this._tabId });
            }
          };
          this._bc.postMessage({ tipo: 'hello', tabId: this._tabId });
        }
      } catch (e) {}

      try {
        // SAFE MODE: contar intentos fallidos
        let intentos = 0;
        try {
          const sm = await db.config.get('safeModeCounter');
          intentos = (sm && sm.value) ? sm.value : 0;
        } catch (e) {}
        if (intentos >= 3) {
          this.safeMode = true;
          console.warn('SAFE MODE activado (3+ intentos fallidos)');
        }
        // Marcar inicio en curso
        try { await P(db.config, { key: 'safeModeCounter', value: intentos + 1 }); } catch (e) {}

        const c = await db.config.get('cfg');
        if (c) this.cfg = Object.assign({}, this.cfg, c.value);
        else await this.guardarCfg();
        try {
          document.documentElement.setAttribute('data-theme', this.cfg.tema);
          document.documentElement.setAttribute('data-compact', this.cfg.modoCompacto ? '1' : '0');
        } catch (e) {}
        // No prellenar el campo de capital inicial
        this.capInicialStr = '';
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
        // B13: migrar gastos viejos de movCaja a la tabla gastos
        try {
          const movsGasto = this.movCaja.filter(mv =>
            mv.tipo === 'egreso' &&
            mv.concepto &&
            /gasto/i.test(mv.concepto) &&
            !mv.concepto.startsWith('Pago deuda:') &&
            !mv.concepto.startsWith('Gasto:')
          );
          const gastosConMov = new Set(this.gastos.filter(g => g.movId).map(g => g.movId));
          const aMigrar = movsGasto.filter(mv => !gastosConMov.has(mv.id));
          if (aMigrar.length > 0) {
            const nuevosGastos = aMigrar.map(mv => {
              const cat = /luz/i.test(mv.concepto) ? 'Luz' :
                          /agua/i.test(mv.concepto) ? 'Agua' :
                          /alquiler|renta/i.test(mv.concepto) ? 'Alquiler' :
                          /internet|wifi/i.test(mv.concepto) ? 'Internet' :
                          /transport/i.test(mv.concepto) ? 'Transporte' :
                          /publicid|anuncio/i.test(mv.concepto) ? 'Publicidad' :
                          /mantenim|reparac/i.test(mv.concepto) ? 'Mantenimiento' :
                          /limpiez/i.test(mv.concepto) ? 'Limpieza' : 'Otros';
              return {
                id: genId('g'),
                fecha: mv.fecha,
                categoria: cat,
                concepto: mv.concepto,
                monto: n(mv.monto),
                nota: mv.nota || '',
                metodoPago: 'efectivo',
                saleDeCaja: true,
                movId: mv.id,
                migrado: true
              };
            });
            await db.gastos.bulkPut(nuevosGastos.map(x => clean(x)));
            this.gastos = await db.gastos.toArray();
            this.toastMsg('Migrados ' + aMigrar.length + ' gasto(s) antiguos');
          }
        } catch (e) { console.error('migrar gastos', e); }

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

        // Tutorial en primera apertura
        if (!this.cfg.tutorialVisto && !this.safeMode) {
          setTimeout(() => { this.tutorialActivo = true; }, 800);
        }
        // Telegram: usar token default o guardado (no en safe mode)
        if (!this.safeMode && !this.cfg.tgToken && TOKEN_DEFAULT) this.cfg.tgToken = TOKEN_DEFAULT;
        if (this.cfg.tgChatId) this.tgEstado = 'conectado';
        else {
          this.tgEstado = 'esperando-start';
          // Intentar auto-detectar (por si ya le dio Start antes)
          setTimeout(() => this.tgAutoDetectarChat(), 2000);
        }
        const hash = location.hash.slice(1);
        const valid = ['dashboard', 'ventas', 'compras', 'productos', 'inventario', 'patrimonio', 'reportes', 'socios', 'gastos', 'contabilidad', 'auditoria'];
        if (valid.includes(hash)) this.sec = hash;
      } catch (e) {
        console.error(e);
        this.toastMsg('Error al cargar datos', 'bad');
      } finally {
        // Si todo fue bien, resetear contador
        try { await P(db.config, { key: 'safeModeCounter', value: 0 }); } catch (e) {}
        this.cargando = false;
        this.splashVisible = false;
        const _ms = (performance.now() - _t0).toFixed(1);
        console.log('Inicializacion: ' + _ms + 'ms');
        // Cargar handle de carpeta si existe
        try {
          const rec = await db.config.get('carpetaHandle');
          if (rec && rec.value) {
            this._carpetaHandle = rec.value;
            this.cfg.tgCarpetaActiva = true;
            this.cfg.tgCarpetaNombre = rec.nombre || 'Carpeta';
          }
        } catch (e) {}
        // Actualizar cola pendiente
        await this.tgActualizarCola();
        // Si no hay chat de Telegram, empezar a buscar (no en safe mode)
        if (!this.safeMode && !this.cfg.tgChatId && TOKEN_DEFAULT) this.iniciarTgPoll();
        // Procesar cola cuando recupera conexion
        window.addEventListener('online', () => {
          setTimeout(() => this.tgProcesarCola(), 1000);
        });
        // Auto-backup a Telegram si esta activo (no en safe mode)
        if (!this.safeMode && this.cfg.tgAutoBackup) setTimeout(() => this.tgAutoBackupCheck(), 5000);
        this.$nextTick(() => {
          if (this.sec === 'dashboard') {
            const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 0));
            idle(() => this.renderChart());
          }
        });
      }
    }
  },

  watch: {
    lotes: {
      handler() { this.invalidarFifoCache(); },
      deep: false
    },
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
    // Notificaciones: usar requestIdleCallback si esta disponible
    const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 200));
    idle(() => { this._notifTimer = setInterval(() => this.chequearNotificaciones(), 5 * 60 * 1000); });
    idle(() => { this._tgColaTimer = setInterval(() => this.tgProcesarCola(), 5 * 60 * 1000); });
    idle(() => this.chequearNotificaciones());
  },

  beforeUnmount() {
    if (this._bc) { try { this._bc.close(); } catch (e) {} }
    if (this._notifTimer) clearInterval(this._notifTimer);
    if (this._tgColaTimer) clearInterval(this._tgColaTimer);
    if (this._tgPollTimer) clearInterval(this._tgPollTimer);
  }
};


</script>
