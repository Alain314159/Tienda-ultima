<template>
  <section v-if="sec === 'compras'" class="fade-up">
    <div class="card">
      <h2 class="card-title">
        <icon name="bag" :size="18" :color="sec === 'compras' ? '#2196F3' : mutColor"></icon> Registrar Compra
      </h2>
      <div v-if="!compraForm.productoId">
        <div class="search">
          <label class="sr-only" for="busq-compra">Buscar producto para comprar</label>
          <input
            id="busq-compra"
            v-model="busqCompra"
            type="text"
            placeholder="Buscar producto..."
            autocomplete="off"
            @focus="focusCompra = true"
            @click="focusCompra = true"
          />
        </div>
        <div v-if="focusCompra" class="drop-static">
          <div class="drop-head">
            <span>{{ listaCompra.length }} resultado(s)</span>
            <button
              @click="
                focusCompra = false;
                busqCompra = '';
              "
              aria-label="Cerrar"
            >
              ×
            </button>
          </div>
          <div v-if="listaCompra.length === 0" class="empty">Sin coincidencias</div>
          <div v-for="p in listaCompra" :key="p.id" class="drop-item" @click="selCompra(p)">
            <span>{{ p.nombre }}</span>
            <span style="color: var(--mut)">Stock {{ fmtCant(productosStore.stock(p.id)) }} {{ p.unidad || '' }}</span>
          </div>
        </div>
      </div>
      <div v-if="compraForm.productoId">
        <div class="row" style="border: none; padding: 0.2rem 0">
          <span>Producto</span><b>{{ compraForm.nombre }}</b>
        </div>

        <div class="grid2">
          <div>
            <label class="fld-label" for="compra-cantidad">Cantidad</label>
            <input
              id="compra-cantidad"
              v-model="compraForm.cantidad"
              type="number"
              inputmode="decimal"
              step="0.001"
              placeholder="Cantidad"
            />
          </div>
          <div>
            <label class="fld-label" for="compra-costo">Costo</label>
            <input
              id="compra-costo"
              v-model="compraForm.costo"
              type="number"
              inputmode="decimal"
              step="0.01"
              placeholder="Costo por unidad"
            />
          </div>
        </div>

        <div v-if="n(compraForm.cantidad) > 0 && n(compraForm.costo) >= 0" class="compra-resumen">
          <div class="row" style="border: none; padding: 0.2rem 0">
            <span>Costo por unidad</span>
            <b>{{ fmt(compraCostoUnitarioFinal()) }}</b>
          </div>
          <div class="row total" style="border: none; padding: 0.3rem 0">
            <span>TOTAL</span>
            <b>{{ fmt(m(compraCantidadFinal() * compraCostoUnitarioFinal())) }}</b>
          </div>
        </div>
        <button class="btn pri" @click="guardarCompra()" :disabled="guardandoCompra">
          <icon name="bag" :size="16" color="#fff"></icon>
          {{ guardandoCompra ? 'Guardando…' : compraForm.editId ? 'Actualizar' : 'Registrar Compra' }}
        </button>
        <button class="btn ghost" @click="resetCompra()">Cancelar</button>
      </div>
    </div>

    <div class="card">
      <h2 class="card-title">
        <icon name="list" :size="18" :color="sec === 'compras' ? '#2196F3' : mutColor"></icon> Historial de Compras
      </h2>
      <div class="search">
        <label class="sr-only" for="busq-hist-compras">Buscar en el historial de compras</label>
        <input id="busq-hist-compras" v-model="busqHist" type="text" placeholder="Buscar en historial..." />
      </div>
      <div v-if="comprasFiltradas.length === 0" class="empty">Sin compras</div>

      <div v-if="comprasPorPeriodo.actual.length" class="hist-grupo">
        <div class="hist-head">
          <span class="badge ok">ACTUAL</span>
          <span class="hist-titulo">Periodo actual</span>
          <span class="hist-count">{{ comprasPorPeriodo.actual.length }}</span>
        </div>
        <div v-for="c in histComprasMostrados" :key="c.id" class="item" :id="'ref-' + c.id">
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
        <div v-if="histComprasHayMas" class="hist-mas">
          <button class="link-btn" @click="hist.mostrarMas()">
            Mostrar 20 mas ({{ histComprasRestantes }} restantes)
          </button>
        </div>
      </div>

      <div v-for="g in comprasPorPeriodo.cerrados" :key="g.cierre.id" class="hist-grupo hist-cerrado">
        <div class="hist-head hist-head-click" @click="hist.toggle(g.cierre.id)">
          <span class="badge arch">CERRADO</span>
          <span class="hist-titulo">{{ g.cierre.periodo }}</span>
          <span class="hist-count">{{ g.items.length }}</span>
          <span class="chev" :class="{ open: hist.abierto(g.cierre.id) }">
            <icon name="chevron" :size="14" :color="mutColor"></icon>
          </span>
        </div>
        <div v-if="hist.abierto(g.cierre.id)">
          <div v-for="c in hist.itemsMostrados(g.items)" :key="c.id" class="item">
            <div class="info">
              <div class="nm"><icon name="bag" :size="14"></icon> {{ c.productoNombre }}</div>
              <div class="det">{{ fmtFH(c.fecha) }} · {{ fmtCant(c.cantidad) }} × {{ fmt(c.costo) }}</div>
            </div>
            <b class="neg">{{ fmt(c.total) }}</b>
          </div>
          <div v-if="hist.hayMas(g.items)" class="hist-mas">
            <button class="link-btn" @click="hist.mostrarMas()">
              Mostrar {{ Math.min(20, histComprasRestantes) }} mas
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { n, m } from '../utils/numero';
import { fmt, fmtCant, fmtFH } from '../utils/formato';
import { P, genId } from '../utils/id';
import { db } from '../db';
import type { Producto } from '../types';
import { useComprasStore } from '../stores/useComprasStore';
import { useLotesStore } from '../stores/useLotesStore';
import { useProductosStore } from '../stores/useProductosStore';
import { useConfigStore } from '../stores/useConfigStore';
import { useCajaStore } from '../stores/useCajaStore';
import { useUIStore } from '../stores/useUIStore';
import { useHistorial } from '../composables/useHistorial';
import { recargarStores } from '../stores/recarga';
import { TOAST } from '../constants';
import { toastMsg } from '../utils/toast';

const configStore = useConfigStore();
const ui = useUIStore();
const comprasStore = useComprasStore();
const lotesStore = useLotesStore();
const productosStore = useProductosStore();
const cajaStore = useCajaStore();

const sec = 'compras';
// Carga perezosa (4.8): estas tablas ya vienen del arranque, así que esto
// es un no-op; existe para que la vista no dependa del orden de carga.
onMounted(() => {
  void Promise.all([
    comprasStore.asegurarCompras(),
    productosStore.asegurarProductos(),
    lotesStore.asegurarLotes(),
    cajaStore.asegurarMovCaja(),
  ]);
});
const mutColor = computed(() => (configStore.tema === 'dark' ? '#94a3b8' : '#6b7280'));
const txtColor = computed(() => (configStore.tema === 'dark' ? '#f1f5f9' : '#111827'));

// ===== FORMULARIO DE COMPRA (local a la vista) =====
const busqCompra = ref('');
const focusCompra = ref(false);
const compraForm = ref<{
  editId: string;
  productoId: string;
  nombre: string;
  cantidad: string;
  costo: string;
  unidad?: string;
}>({
  editId: '',
  productoId: '',
  nombre: '',
  cantidad: '',
  costo: '',
});

const listaCompra = computed(() => {
  const q = (busqCompra.value || '').toLowerCase().trim();
  const out: import('../types').Producto[] = [];
  for (const p of productosStore.prodsActivos) {
    if (
      q &&
      !(
        (p.nombre || '').toLowerCase().includes(q) ||
        String(p.codigo ?? '')
          .toLowerCase()
          .includes(q)
      )
    )
      continue;
    out.push(p);
    if (out.length >= 20) break;
  }
  return out;
});

function selCompra(p: Producto) {
  compraForm.value = {
    editId: '',
    productoId: p.id,
    nombre: p.nombre,
    cantidad: '',
    costo: '',
  };
  busqCompra.value = '';
  focusCompra.value = false;
}

function resetCompra() {
  compraForm.value = {
    editId: '',
    productoId: '',
    nombre: '',
    cantidad: '',
    costo: '',
  };
}

// Cantidad y costo se registran directos en unidades base (sin empaques)
function compraCantidadFinal() {
  return n(compraForm.value.cantidad);
}

function compraCostoUnitarioFinal() {
  return n(compraForm.value.costo);
}

// ===== BÚSQUEDA DEL HISTORIAL (local a la vista) =====
const busqHist = ref('');
const comprasFiltradas = computed(() => {
  const query = (busqHist.value || '').toLowerCase().trim();
  const list = comprasStore.comprasOrdenadas;
  if (!query) return list;
  return list.filter(
    (c) =>
      (c.productoNombre || '').toLowerCase().includes(query) ||
      fmtFH(c.fecha).toLowerCase().includes(query),
  );
});

// ===== HISTORIAL =====
const hist = useHistorial(() => comprasFiltradas.value);
const comprasPorPeriodo = computed(() => hist.agruparActual());
const histComprasMostrados = computed(() => hist.itemsMostrados(comprasPorPeriodo.value.actual));
const histComprasHayMas = computed(() => hist.hayMas(comprasPorPeriodo.value.actual));
const histComprasRestantes = computed(() => hist.restantes(comprasPorPeriodo.value.actual));

function loteSinVentas(cid: string) {
  const l = lotesStore.lotes.find((x) => x.compraId === cid);
  return l ? n(l.cantidadVendida) === 0 : true;
}

function editarCompra(id: string) {
  const c = comprasStore.compras.find((x) => x.id === id);
  if (!c || !loteSinVentas(id)) return;
  compraForm.value = {
    editId: id,
    productoId: c?.productoId || '',
    nombre: c?.productoNombre || '',
    cantidad: String(c?.cantidad || ''),
    costo: String(c?.costo || ''),
    unidad: c?.unidad || '',
  };
  window.scrollTo(0, 0);
}

function eliminarCompra(id: string) {
  if (!loteSinVentas(id)) return;
  const c = comprasStore.compras.find((x) => x.id === id);
  // Destructiva (borra compra+lote y ajusta caja): requiere PIN como el
  // resto de eliminaciones
  ui.pedirPin(() => {
    ui.confirmar({
      titulo: 'Eliminar compra',
      msg: '¿Eliminar compra de ' + (c?.productoNombre || '') + '?',
      onOk: async () => {
        try {
          await db.transaction('rw', db.compras, db.lotes, async () => {
            // Revalidación CONTRA LA BD dentro de la transacción: el check
            // reactivo (loteSinVentas) corrió antes del modal y una venta en
            // otra pestaña pudo consumir el lote mientras tanto → lotes
            // huérfanos referenciados por ventas con lotesUsados rotos
            const l = await db.lotes.where('compraId').equals(id).first();
            if (l && n(l.cantidadVendida) > 0)
              throw new Error('Esta compra ya tiene ventas registradas y no se puede eliminar');
            await db.compras.delete(id);
            if (l) await db.lotes.delete(l.id);
          });
          await recargarStores('compras', 'lotes', 'asientos');
          toastMsg('Compra eliminada');
        } catch (e) {
          toastMsg(e instanceof Error ? e.message : String(e), TOAST.BAD);
        }
      },
    });
  });
}

const guardandoCompra = ref(false);

async function guardarCompra() {
  const f = compraForm.value;
  const cantIngresada = n(f.cantidad);
  const costoIngresado = n(f.costo);
  if (!f.productoId) return toastMsg('Selecciona producto', TOAST.BAD);
  // isFinite: "1e999"/"Infinity" no son ≤ 0 y colaban (lote con costo ∞ crudo
  // → valoración ∞ y ganancia 0 en todas las ventas del lote)
  if (!isFinite(cantIngresada) || cantIngresada <= 0) return toastMsg('Cantidad debe ser > 0', TOAST.BAD);
  if (!isFinite(costoIngresado) || costoIngresado < 0) return toastMsg('Costo inválido', TOAST.BAD);

  // Cantidad y costo ya vienen en unidades base (sin conversión por empaque)
  const cant = m(cantIngresada);
  const costo = costoIngresado;
  const total = m(cant * costo);
  const prodSel = productosStore.productos.find((p) => p.id === f.productoId);
  const unidadProd = prodSel ? prodSel.unidad || '' : '';

  const ejecutar = async () => {
    if (guardandoCompra.value) return;
    guardandoCompra.value = true;
    try {
      if (f.editId) {
        await db.transaction('rw', db.compras, db.lotes, async () => {
          // Lectura FRESCA de compra y lote: validar contra el store reactivo
          // FUERA de la transacción permitía editar un lote ya vendido en
          // otra pestaña, y el spread del lote obsoleto PISABA su
          // cantidadVendida (stock inflado en silencio)
          const c = await db.compras.get(f.editId);
          if (!c) throw new Error('Esta compra ya no existe: pudo eliminarse en otro dispositivo. Vuelve a cargar la lista.');
          const l = await db.lotes.where('compraId').equals(f.editId).first();
          if (l && n(l.cantidadVendida) > 0)
            throw new Error('Este lote ya tiene ventas registradas, por eso no se puede editar la compra');
          await P(db.compras, {
            ...c,
            productoId: f.productoId,
            productoNombre: f.nombre,
            productoUnidad: unidadProd,
            cantidad: cant,
            costo,
            total,
            unidad: unidadProd,
          });
          if (l)
            await P(db.lotes, {
              ...l,
              productoId: f.productoId,
              productoNombre: f.nombre,
              productoUnidad: unidadProd,
              cantidadInicial: cant,
              costo,
            });
        });
      } else {
        const compra = {
          id: genId('c'),
          fecha: new Date().toISOString(),
          productoId: f.productoId,
          productoNombre: f.nombre,
          cantidad: cant,
          costo,
          total,
          anulada: false,
        };
        const lote = {
          id: genId('l'),
          compraId: compra.id,
          productoId: f.productoId,
          productoNombre: f.nombre,
          cantidadInicial: cant,
          cantidadVendida: 0,
          costo,
          fecha: compra.fecha,
        };
        await db.transaction('rw', db.compras, db.lotes, async () => {
          await P(db.compras, compra as import('../types').Compra);
          await P(db.lotes, lote);
        });
      }
      await recargarStores('compras', 'lotes', 'asientos');
      resetCompra();
      toastMsg(`Compra ${fmt(total)}`);
      try {
        if (window.Log) window.Log.evento('compra-guardada', { producto: f.nombre, cantidad: cant, costo, total });
      } catch {}
    } catch (e) {
      toastMsg(e instanceof Error ? e.message : String(e), TOAST.BAD);
      try {
        if (window.Log) window.Log.evento('compra-error', { mensaje: e instanceof Error ? e.message : String(e) });
      } catch {}
    } finally {
      guardandoCompra.value = false;
    }
  };

  if (!f.editId && total > cajaStore.saldoCaja) {
    ui.confirmar({
      titulo: 'Caja insuficiente',
      msg: 'Cuesta ' + fmt(total) + ' pero hay ' + fmt(cajaStore.saldoCaja) + ' en caja. ¿Continuar?',
      onOk: ejecutar,
    });
  } else ejecutar();
}
</script>
