<template>
  <section v-if="app.sec === 'ventas'" class="fade-up">
    <div class="card">
      <div class="card-title">
        <icon name="cart" :size="18" :color="app.sec === 'ventas' ? '#2196F3' : app.mutColor"></icon> Nueva Venta
      </div>
      <div class="search">
        <input
          v-model="app.ventasStore.busqVenta"
          @input="app.ventasStore.setBusqVenta($event.target.value)"
          @focus="app.focusVenta = true"
          type="text"
          placeholder="Buscar producto por nombre o código..."
          autocomplete="off"
          @click="app.focusVenta = true"
          @keyup.enter="app.agregarPrimero"
        />
      </div>
      <div v-if="app.focusVenta" class="drop-static">
        <div class="drop-head">
          <span>{{ app.listaVenta.length }} resultado(s)</span>
          <button
            @click="
              app.focusVenta = false;
              app.busqVenta = '';
            "
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>
        <div v-if="app.listaVenta.length === 0" class="empty">Sin coincidencias (o sin stock)</div>
        <div
          v-for="p in app.ventasStore.listaVenta"
          :key="p.id"
          class="drop-item"
          @click="app.ventasStore.agregarCarrito(p)"
          @click.stop
        >
          <span>{{ p.nombre }}</span>
          <span style="color: var(--mut); white-space: nowrap"
            >Stock {{ app.fmtCant(app.stock(p.id)) }} {{ p.unidad || '' }} · {{ app.fmt(p.precio) }}</span
          >
        </div>
      </div>

      <div v-if="app.ventasStore.carrito.length" style="margin-top: 0.2rem">
        <div v-for="(it, i) in app.ventasStore.carrito" :key="i" class="cart-item">
          <div class="cart-top">
            <div class="nm">{{ it.nombre }}</div>
            <button class="del-btn" @click="app.ventasStore.carrito.splice(i, 1)" @click.stop aria-label="Quitar">
              <icon name="x" :size="14" color="#fff"></icon>
            </button>
          </div>
          <div class="cart-controls">
            <div class="cart-field">
              <label>Cantidad</label>
              <div class="qty-input">
                <button type="button" @click="app.ventasStore.cambiarCant(it, -1)" @click.stop>−</button>
                <input
                  :value="it.cant"
                  type="text"
                  inputmode="decimal"
                  @input="app.ventasStore.actualizarCantidadInput(it, $event.target.value)"
                  @blur="app.ventasStore.validarCant(it)"
                />
                <button type="button" @click="app.ventasStore.cambiarCant(it, 1)" @click.stop>+</button>
              </div>
            </div>
            <div class="cart-field">
              <label>Precio</label>
              <input
                class="price-input"
                :value="it.precio"
                type="text"
                inputmode="decimal"
                @input="it.precio = $event.target.value"
                @blur="app.validarPrecio(it)"
              />
            </div>
          </div>
          <div class="cart-total-line">
            <span
              >{{ app.fmt(it.precio) }} × {{ app.fmtCant(it.cant) }} =
              <b style="color: var(--pri)">{{ app.fmt(app.ventasStore.subTotalItem(it)) }}</b></span
            >
            <span class="pos">+{{ app.fmt(app.gananciaItem(it)) }}</span>
            <span
              class="cart-tag"
              :class="app.esPrecioEscalon(it) ? 'tag-esc' : 'tag-unit'"
              v-if="app.tieneEscalones(it.productoId)"
            >
              {{ app.esPrecioEscalon(it) ? 'Por cantidad' : 'Por unidad' }}
            </span>
          </div>
        </div>
        <div class="total-box">
          <span>TOTAL {{ app.fmt(app.ventasStore.totalCarrito) }}</span>
          <span>Gan. {{ app.fmt(app.ventasStore.gananciaCarrito) }}</span>
        </div>
        <button class="btn ok" @click="app.iniciarCobro()" :disabled="app.procesandoVenta">
          {{ app.procesandoVenta ? 'Procesando...' : 'Cobrar Venta' }}
        </button>
        <button class="btn ghost" @click="app.carrito = []">
          <icon name="trash" :size="14" :color="app.mutColor"></icon> Limpiar carrito
        </button>
      </div>
      <div
        v-if="!app.carrito.length && !app.focusVenta"
        class="det"
        style="text-align: center; font-size: 0.75rem; color: var(--mut); padding: 0.4rem 0"
      >
        Toca el buscador para agregar productos
      </div>
    </div>

    <div class="card">
      <div class="card-title">
        <icon name="list" :size="18" :color="app.sec === 'ventas' ? '#2196F3' : app.mutColor"></icon> Historial de
        Ventas
      </div>
      <div class="search">
        <input
          :value="app.busqHist"
          @input="app.setBusq('busqHist', $event.target.value)"
          type="text"
          placeholder="Buscar en historial..."
        />
      </div>
      <div v-if="app.ventasFiltradas.length === 0" class="empty">Sin ventas</div>

      <div v-if="app.ventasPorPeriodo.actual.length" class="hist-grupo">
        <div class="hist-head">
          <span class="badge ok">ACTUAL</span>
          <span class="hist-titulo">Periodo actual</span>
          <span class="hist-count">{{ app.ventasPorPeriodo.actual.length }}</span>
        </div>
        <div
          v-for="v in app.ventasStore.histVentasMostrados"
          :key="v.id"
          v-memo="[v.id, v.anulada, v.total, v.ganancia]"
          class="item"
          :class="{ anulada: v.anulada }"
          :id="'ref-' + v.id"
        >
          <div class="info" @click="app.toggleExpandirVenta(v.id)" style="cursor: pointer; flex: 1">
            <div class="nm">
              {{
                v.items.length > 1
                  ? v.items[0].nombre + ' +' + (v.items.length - 1) + ' más'
                  : v.items.map((x) => x.nombre + ' ×' + app.fmtCant(x.cantidad)).join(', ')
              }}
            </div>
            <div class="det">
              {{ app.fmtFH(v.fecha) }} · <b style="color: var(--pri)">{{ app.fmt(v.total) }}</b> ·
              <span class="pos">+{{ app.fmt(v.ganancia) }}</span>
            </div>
            <div
              v-if="app.ventaExpandida === v.id"
              class="venta-items-expand"
              style="margin-top: 0.4rem; padding: 0.4rem; background: rgba(0, 0, 0, 0.05); border-radius: 0.4rem"
            >
              <div
                v-for="(it, idx) in v.items"
                :key="it.id"
                style="
                  display: flex;
                  justify-content: space-between;
                  padding: 0.2rem 0;
                  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
                "
              >
                <span>{{ it.nombre }} × {{ app.fmtCant(it.cantidad) }}</span>
                <div style="display: flex; gap: 0.4rem; align-items: center">
                  <span>{{ app.fmt(it.precio * it.cantidad) }}</span>
                  <button
                    v-if="!v.anulada && !it.anulado"
                    class="link-btn"
                    style="font-size: 0.7rem; padding: 0.2rem 0.3rem"
                    @click.stop="app.anularProductoEnVenta(v.id, idx)"
                  >
                    Anular
                  </button>
                  <span v-if="it.anulado" class="badge arch" style="font-size: 0.7rem">ANULADO</span>
                </div>
              </div>
            </div>
          </div>
          <div style="display: flex; flex-direction: column; gap: 0.4rem">
            <button v-if="!v.anulada" class="link-btn" @click="app.anularVenta(v.id)">Anular</button>
            <span v-else class="badge arch">ANULADA</span>
          </div>
        </div>
        <div v-if="app.histVentasHayMas" class="hist-mas">
          <button class="link-btn" @click="app.histMostrarMas('ventas')">
            Mostrar 20 mas ({{ app.histVentasRestantes }} restantes)
          </button>
        </div>
      </div>

      <div v-for="g in app.ventasPorPeriodo.cerrados" :key="g.cierre.id" class="hist-grupo hist-cerrado">
        <div class="hist-head hist-head-click" @click="app.histToggle('ventas', g.cierre.id)">
          <span class="badge arch">CERRADO</span>
          <span class="hist-titulo">{{ g.cierre.periodo }}</span>
          <span class="hist-count">{{ g.items.length }}</span>
          <span class="chev" :class="{ open: app.histAbierto('ventas', g.cierre.id) }">
            <icon name="chevron" :size="14" :color="app.mutColor"></icon>
          </span>
        </div>
        <div v-if="app.histAbierto('ventas', g.cierre.id)">
          <div
            v-for="v in app.histItemsMostrados(g.items, 'ventas')"
            :key="v.id"
            class="item"
            :class="{ anulada: v.anulada }"
          >
            <div class="info" @click="app.toggleExpandirVenta(v.id)" style="cursor: pointer; flex: 1">
              <div class="nm">
                {{
                  v.items.length > 1
                    ? v.items[0].nombre + ' +' + (v.items.length - 1) + ' más'
                    : v.items.map((x) => x.nombre + ' ×' + app.fmtCant(x.cantidad)).join(', ')
                }}
              </div>
              <div class="det">
                {{ app.fmtFH(v.fecha) }} · <b style="color: var(--pri)">{{ app.fmt(v.total) }}</b> ·
                <span class="pos">+{{ app.fmt(v.ganancia) }}</span>
              </div>
              <div
                v-if="app.ventaExpandida === v.id"
                class="venta-items-expand"
                style="margin-top: 0.4rem; padding: 0.4rem; background: rgba(0, 0, 0, 0.05); border-radius: 0.4rem"
              >
                <div
                  v-for="(it, idx) in v.items"
                  :key="it.id"
                  style="
                    display: flex;
                    justify-content: space-between;
                    padding: 0.2rem 0;
                    border-bottom: 1px solid rgba(0, 0, 0, 0.1);
                  "
                >
                  <span>{{ it.nombre }} × {{ app.fmtCant(it.cantidad) }}</span>
                  <div style="display: flex; gap: 0.4rem; align-items: center">
                    <span>{{ app.fmt(it.precio * it.cantidad) }}</span>
                    <button
                      v-if="!v.anulada && !it.anulado"
                      class="link-btn"
                      style="font-size: 0.7rem; padding: 0.2rem 0.3rem"
                      @click.stop="app.anularProductoEnVenta(v.id, idx)"
                    >
                      Anular
                    </button>
                    <span v-if="it.anulado" class="badge arch" style="font-size: 0.7rem">ANULADO</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div v-if="app.histHayMas(g.items, 'ventas')" class="hist-mas">
            <button class="link-btn" @click="app.histMostrarMas('ventas')">
              Mostrar {{ Math.min(20, app.histVentasRestantes) }} mas
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script>
import { useApp } from '../contexts/appContext.js';

export default {
  name: 'VentasView',
  setup() {
    const app = useApp();
    return { app };
  },
};
</script>
