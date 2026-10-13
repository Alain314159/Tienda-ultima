<template>
  <section v-if="sec === 'ventas'" class="fade-up">
    <div class="card">
      <div class="card-title">
        <icon name="cart" :size="18" :color="sec === 'ventas' ? '#2196F3' : mutColor"></icon> Nueva Venta
      </div>
      <div class="search">
        <input
          v-model="ventasStore.busqVenta"
          @input="ventasStore.setBusqVenta($event.target.value)"
          @focus="focusVenta = true"
          type="text"
          placeholder="Buscar producto por nombre o código..."
          autocomplete="off"
          @click="focusVenta = true"
          @keyup.enter="agregarPrimero"
        />
      </div>
      <div v-if="focusVenta" class="drop-static">
        <div class="drop-head">
          <span>{{ listaVenta.length }} resultado(s)</span>
          <button
            @click="
              focusVenta = false;
              busqVenta = '';
            "
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>
        <div v-if="listaVenta.length === 0" class="empty">Sin coincidencias (o sin stock)</div>
        <div
          v-for="p in ventasStore.listaVenta"
          :key="p.id"
          class="drop-item"
          @click="ventasStore.agregarCarrito(p)"
          @click.stop
        >
          <span>{{ p.nombre }}</span>
          <span style="color: var(--mut); white-space: nowrap"
            >Stock {{ fmtCant(stock(p.id)) }} {{ p.unidad || '' }} · {{ fmt(p.precio) }}</span
          >
        </div>
      </div>

      <div v-if="ventasStore.carrito.length" style="margin-top: 0.2rem">
        <div v-for="(it, i) in ventasStore.carrito" :key="i" class="cart-item">
          <div class="cart-top">
            <div class="nm">{{ it.nombre }}</div>
            <button class="del-btn" @click="ventasStore.carrito.splice(i, 1)" @click.stop aria-label="Quitar">
              <icon name="x" :size="14" color="#fff"></icon>
            </button>
          </div>
          <div class="cart-controls">
            <div class="cart-field">
              <label>Cantidad</label>
              <div class="qty-input">
                <button type="button" @click="ventasStore.cambiarCant(it, -1)" @click.stop>−</button>
                <input
                  :value="it.cant"
                  type="text"
                  inputmode="decimal"
                  @input="ventasStore.actualizarCantidadInput(it, $event.target.value)"
                  @blur="ventasStore.validarCant(it)"
                />
                <button type="button" @click="ventasStore.cambiarCant(it, 1)" @click.stop>+</button>
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
                @blur="validarPrecio(it)"
              />
            </div>
          </div>
          <div class="cart-total-line">
            <span
              >{{ fmt(it.precio) }} × {{ fmtCant(it.cant) }} =
              <b style="color: var(--pri)">{{ fmt(ventasStore.subTotalItem(it)) }}</b></span
            >
            <span class="pos">+{{ fmt(gananciaItem(it)) }}</span>
            <span
              class="cart-tag"
              :class="esPrecioEscalon(it) ? 'tag-esc' : 'tag-unit'"
              v-if="tieneEscalones(it.productoId)"
            >
              {{ esPrecioEscalon(it) ? 'Por cantidad' : 'Por unidad' }}
            </span>
          </div>
        </div>
        <div class="total-box">
          <span>TOTAL {{ fmt(ventasStore.totalCarrito) }}</span>
          <span>Gan. {{ fmt(ventasStore.gananciaCarrito) }}</span>
        </div>
        <button class="btn ok" @click="iniciarCobro()" :disabled="procesandoVenta">
          {{ procesandoVenta ? 'Procesando...' : 'Cobrar Venta' }}
        </button>
        <button class="btn ghost" @click="carrito = []">
          <icon name="trash" :size="14" :color="mutColor"></icon> Limpiar carrito
        </button>
      </div>
      <div
        v-if="!carrito.length && !focusVenta"
        class="det"
        style="text-align: center; font-size: 0.75rem; color: var(--mut); padding: 0.4rem 0"
      >
        Toca el buscador para agregar productos
      </div>
    </div>

    <div class="card">
      <div class="card-title">
        <icon name="list" :size="18" :color="sec === 'ventas' ? '#2196F3' : mutColor"></icon> Historial de Ventas
      </div>
      <div class="search">
        <input v-model="busqHist" type="text" placeholder="Buscar en historial..." />
      </div>
      <div v-if="ventasFiltradas.length === 0" class="empty">Sin ventas</div>

      <div v-if="ventasPorPeriodo.actual.length" class="hist-grupo">
        <div class="hist-head">
          <span class="badge ok">ACTUAL</span>
          <span class="hist-titulo">Periodo actual</span>
          <span class="hist-count">{{ ventasPorPeriodo.actual.length }}</span>
        </div>
        <div
          v-for="v in histVentasMostrados"
          :key="v.id"
          v-memo="[v.id, v.anulada, v.total, v.ganancia]"
          class="item"
          :class="{ anulada: v.anulada }"
          :id="'ref-' + v.id"
        >
          <div class="info" @click="toggleExpandirVenta(v.id)" style="cursor: pointer; flex: 1">
            <div class="nm">
              {{
                v.items.length > 1
                  ? v.items[0].nombre + ' +' + (v.items.length - 1) + ' más'
                  : v.items.map((x) => x.nombre + ' ×' + fmtCant(x.cantidad)).join(', ')
              }}
            </div>
            <div class="det">
              {{ fmtFH(v.fecha) }} · <b style="color: var(--pri)">{{ fmt(v.total) }}</b> ·
              <span class="pos">+{{ fmt(v.ganancia) }}</span>
            </div>
            <div
              v-if="ventaExpandida === v.id"
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
                <span>{{ it.nombre }} × {{ fmtCant(it.cantidad) }}</span>
                <div style="display: flex; gap: 0.4rem; align-items: center">
                  <span>{{ fmt(it.precio * it.cantidad) }}</span>
                  <button
                    v-if="!v.anulada && !it.anulado"
                    class="link-btn"
                    style="font-size: 0.7rem; padding: 0.2rem 0.3rem"
                    @click.stop="anularProductoEnVenta(v.id, idx)"
                  >
                    Anular
                  </button>
                  <span v-if="it.anulado" class="badge arch" style="font-size: 0.7rem">ANULADO</span>
                </div>
              </div>
            </div>
          </div>
          <div style="display: flex; flex-direction: column; gap: 0.4rem">
            <button v-if="!v.anulada" class="link-btn" @click="anularVenta(v.id)">Anular</button>
            <span v-else class="badge arch">ANULADA</span>
          </div>
        </div>
        <div v-if="histVentasHayMas" class="hist-mas">
          <button class="link-btn" @click="histMostrarMas()">
            Mostrar 20 mas ({{ histVentasRestantes }} restantes)
          </button>
        </div>
      </div>

      <div v-for="g in ventasPorPeriodo.cerrados" :key="g.cierre.id" class="hist-grupo hist-cerrado">
        <div class="hist-head hist-head-click" @click="histToggle(g.cierre.id)">
          <span class="badge arch">CERRADO</span>
          <span class="hist-titulo">{{ g.cierre.periodo }}</span>
          <span class="hist-count">{{ g.items.length }}</span>
          <span class="chev" :class="{ open: histAbierto(g.cierre.id) }">
            <icon name="chevron" :size="14" :color="mutColor"></icon>
          </span>
        </div>
        <div v-if="histAbierto(g.cierre.id)">
          <div v-for="v in histItemsMostrados(g.items)" :key="v.id" class="item" :class="{ anulada: v.anulada }">
            <div class="info" @click="toggleExpandirVenta(v.id)" style="cursor: pointer; flex: 1">
              <div class="nm">
                {{
                  v.items.length > 1
                    ? v.items[0].nombre + ' +' + (v.items.length - 1) + ' más'
                    : v.items.map((x) => x.nombre + ' ×' + fmtCant(x.cantidad)).join(', ')
                }}
              </div>
              <div class="det">
                {{ fmtFH(v.fecha) }} · <b style="color: var(--pri)">{{ fmt(v.total) }}</b> ·
                <span class="pos">+{{ fmt(v.ganancia) }}</span>
              </div>
              <div
                v-if="ventaExpandida === v.id"
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
                  <span>{{ it.nombre }} × {{ fmtCant(it.cantidad) }}</span>
                  <div style="display: flex; gap: 0.4rem; align-items: center">
                    <span>{{ fmt(it.precio * it.cantidad) }}</span>
                    <button
                      v-if="!v.anulada && !it.anulado"
                      class="link-btn"
                      style="font-size: 0.7rem; padding: 0.2rem 0.3rem"
                      @click.stop="anularProductoEnVenta(v.id, idx)"
                    >
                      Anular
                    </button>
                    <span v-if="it.anulado" class="badge arch" style="font-size: 0.7rem">ANULADO</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div v-if="histHayMas(g.items)" class="hist-mas">
            <button class="link-btn" @click="histMostrarMas()">
              Mostrar {{ Math.min(20, histVentasRestantes) }} mas
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ==================== COBRO MODAL ==================== -->
    <div v-if="ui.cobroAbierto" class="modal no-print">
      <div class="modal-box">
        <div class="modal-title"><icon name="check" :size="20"></icon> Cobrar Venta</div>
        <div class="cobro-modal">Total a Pagar: {{ fmt(cobroModal.total) }}</div>

        <button
          v-if="cfg.calcBilletesActiva"
          class="btn ghost"
          style="margin-bottom: 0.5rem; font-size: 0.8rem"
          @click="cobroModal.calcAbierta = !cobroModal.calcAbierta"
        >
          <icon name="dollar" :size="14" :color="mutColor"></icon>
          {{ cobroModal.calcAbierta ? 'Ocultar' : 'Mostrar' }} calculadora de billetes
        </button>

        <div v-if="cfg.calcBilletesActiva && cobroModal.calcAbierta" class="calc-billetes">
          <div v-for="d in denominaciones" :key="d" class="denom-row">
            <span class="denom-label">{{ fmt(d) }}</span>
            <input
              type="number"
              inputmode="numeric"
              min="0"
              step="1"
              v-model.number="cobroModal.billetes[d]"
              @input="calcBilletes"
              placeholder="0"
            />
            <span class="denom-sub">{{ fmt(d * (n(cobroModal.billetes[d]) || 0)) }}</span>
          </div>
          <div class="calc-total">
            <div class="row">
              <span>Total contado</span><b>{{ fmt(cobroModal.totalContado) }}</b>
            </div>
            <div v-if="cobroModal.falta > 0.01" class="row">
              <span>Falta</span><b class="neg">{{ fmt(cobroModal.falta) }}</b>
            </div>
            <div v-else-if="cobroModal.sobra > 0.01" class="row">
              <span>Vuelto</span><b class="pos">{{ fmt(cobroModal.sobra) }}</b>
            </div>
            <div v-else-if="cobroModal.totalContado > 0" class="row">
              <span>Estado</span><b class="pos">Exacto ✓</b>
            </div>
          </div>
        </div>

        <button class="btn ok" @click="procesarVenta" :disabled="procesandoVenta">
          {{ procesandoVenta ? 'Procesando...' : 'Confirmar Pago' }}
        </button>
        <button class="btn ghost" @click="ui.cobroAbierto = false">Cancelar</button>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, computed } from 'vue';
import { storeToRefs } from 'pinia';
import { n, fmt, fmtCant, fmtFH } from '../db.js';
import { useVentasStore } from '../stores/useVentasStore.js';
import { useProductosStore } from '../stores/useProductosStore.js';
import { useConfigStore } from '../stores/useConfigStore.js';
import { useUIStore } from '../stores/useUIStore.js';
import { useCobro } from '../composables/useCobro.js';
import { useHistorial } from '../composables/useHistorial.js';
import { TOAST } from '../constants.js';
import { toastMsg } from '../utils/toast.js';

const configStore = useConfigStore();
const ui = useUIStore();
const ventasStore = useVentasStore();
const productosStore = useProductosStore();

const { busqVenta, focusVenta, carrito, ventaExpandida, listaVenta } = storeToRefs(ventasStore);
const { gananciaItem, validarPrecio, esPrecioEscalon, toggleExpandirVenta } = ventasStore;
const { tieneEscalones, stock } = productosStore;

const sec = 'ventas';
const cfg = configStore.cfg;
const mutColor = computed(() => (configStore.tema === 'dark' ? '#94a3b8' : '#6b7280'));

// ===== BÚSQUEDA DEL HISTORIAL (local a la vista) =====
const busqHist = ref('');
const ventasFiltradas = computed(() => {
  const query = (busqHist.value || '').toLowerCase().trim();
  let list = ventasStore.ventas.slice().sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  if (query) list = list.filter((v) => v.items.some((i) => i.nombre.toLowerCase().includes(query)));
  return list;
});

// ===== HISTORIAL AGRUPADO POR PERIODOS =====
const hist = useHistorial(() => ventasFiltradas.value);
const ventasPorPeriodo = computed(() => hist.agruparActual());
const histVentasMostrados = computed(() => hist.itemsMostrados(ventasPorPeriodo.value.actual));
const histVentasHayMas = computed(() => hist.hayMas(ventasPorPeriodo.value.actual));
const histVentasRestantes = computed(() => hist.restantes(ventasPorPeriodo.value.actual));
const { itemsMostrados: histItemsMostrados, hayMas: histHayMas } = hist;
const histMostrarMas = () => hist.mostrarMas();
const histToggle = (id) => hist.toggle(id);
const histAbierto = (id) => hist.abierto(id);

// ===== CARRITO =====
function agregarPrimero() {
  if (listaVenta.value.length > 0) ventasStore.agregarCarrito(listaVenta.value[0]);
}

// ===== ANULACIONES (confirmación + PIN) =====
function anularProductoEnVenta(ventaId, itemIndex) {
  const v = ventasStore.ventas.find((x) => x.id === ventaId);
  if (!v || v.anulada) return;
  const item = v.items[itemIndex];
  if (!item) return;
  ui.pedirPin(() => {
    ui.confirmar({
      titulo: 'Anular producto',
      msg: `¿Anular "${item.nombre}" (${fmtCant(item.cantidad)} × ${fmt(item.precio)}) de esta venta? Se restaura el stock y se ajusta el total.`,
      onOk: async () => {
        try {
          await ventasStore.anularProductoEnVenta(ventaId, itemIndex);
          toastMsg('Producto anulado');
        } catch (e) {
          toastMsg(e.message, TOAST.BAD);
        }
      },
    });
  });
}

function anularVenta(id) {
  ui.confirmar({
    titulo: 'Anular venta',
    msg: '¿Anular esta venta por completo? Se restaura el stock de todos sus productos.',
    onOk: async () => {
      try {
        await ventasStore.anularVenta(id);
        toastMsg('Venta anulada');
      } catch (e) {
        toastMsg(e.message, TOAST.BAD);
      }
    },
  });
}

// ===== COBRO =====
const { cobroModal, denominaciones, procesandoVenta, iniciarCobro, calcBilletes, procesarVenta } = useCobro();
</script>
