<template>
  <section v-if="sec === 'productos'" class="fade-up">
    <div class="card">
      <div class="card-title">
        <icon name="tag" :size="18" :color="sec === 'productos' ? '#2196F3' : mutColor"></icon>
        {{ prodForm.editId ? 'Editar' : 'Agregar' }} Producto
      </div>
      <input v-model="prodForm.nombre" type="text" placeholder="Nombre del producto" />
      <div class="grid2">
        <input
          v-model="prodForm.precio"
          type="number"
          inputmode="decimal"
          step="0.01"
          placeholder="Precio base venta"
        />
        <input v-model="prodForm.stockMin" type="number" inputmode="decimal" step="0.1" placeholder="Stock mín." />
      </div>

      <textarea
        v-model="prodForm.nota"
        placeholder="Nota interna (opcional)"
        rows="2"
        style="resize: none; font-family: inherit; font-size: 0.85rem"
      ></textarea>

      <button class="btn pri" @click="guardarProducto()">
        {{ prodForm.editId ? 'Actualizar' : 'Guardar' }}
      </button>
      <button v-if="prodForm.editId" class="btn ghost" @click="resetProd()">Cancelar</button>
    </div>

    <div class="card">
      <div class="card-title">
        <icon name="tag" :size="18" :color="sec === 'productos' ? '#2196F3' : mutColor"></icon> Productos
      </div>
      <div class="search">
        <input v-model="busqProd" type="text" placeholder="Buscar..." />
      </div>
      <div style="text-align: right; margin-bottom: 0.4rem">
        <button
          class="btn ghost"
          style="width: auto; display: inline-block; padding: 0.3rem 0.7rem; font-size: 0.72rem"
          @click="mostrarArchivados = !mostrarArchivados"
        >
          {{ mostrarArchivados ? 'Ocultar archivados' : 'Ver archivados' }}
        </button>
      </div>
      <div
        v-if="filtroStock"
        class="info-box"
        style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem"
      >
        <span
          >Filtro: <b>{{ filtroStock === 'agotados' ? 'Agotados' : 'Stock bajo' }}</b></span
        >
        <button class="link-btn" @click="limpiarFiltroStock">Quitar filtro</button>
      </div>
      <div v-if="prodsFiltrados.length === 0" class="empty">Sin productos</div>
      <div
        v-for="p in prodsFiltrados"
        :key="p.id"
        v-memo="[p.id, p.nombre, p.precio, p.archivado, stockMap[p.id], badgeMap[p.id], prodExpandido[p.id]]"
        class="prod-wrap"
        :id="'ref-' + p.id"
        :class="'prod-' + (badgeMap[p.id] || 'ok')"
      >
        <div
          class="item"
          :style="p.archivado ? 'opacity:.5' : ''"
          style="cursor: pointer"
          @click="prodExpandido[p.id] = !prodExpandido[p.id]"
        >
          <div class="info">
            <div class="nm">
              {{ p.nombre }}
            </div>
            <div
              v-if="p.nota"
              class="det"
              style="font-size: 0.72rem; font-style: italic; color: var(--mut); margin-top: 0.15rem"
            >
              📝 {{ p.nota }}
            </div>
            <div class="stock-line">
              <span class="badge" :class="badgeStock(p)">{{ txtBadge(p) }}</span>
              <span class="stock-num">Stock: {{ formatStock(p.id, stock(p.id)) }}</span>
              <span style="color: var(--mut); font-size: 0.72rem">{{ fmt(p.precio) }}</span>
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
          <div v-if="lotesDeProducto(p.id).length === 0" class="empty" style="padding: 0.6rem; font-size: 0.78rem">
            Sin lotes activos (stock 0)
          </div>
          <div v-for="l in lotesDeProducto(p.id)" :key="l.id" class="inv-lote">
            <span
              >{{ fmtFH(l.fecha) }} · Quedan {{ fmtCant(n(l.cantidadInicial) - n(l.cantidadVendida)) }}/{{
                fmtCant(l.cantidadInicial)
              }}
              {{ p.unidad || '' }}</span
            >
            <span
              >@{{ fmt(l.costo) }} = <b>{{ fmt((n(l.cantidadInicial) - n(l.cantidadVendida)) * l.costo) }}</b></span
            >
          </div>
          <div
            v-if="lotesDeProducto(p.id).length"
            class="det"
            style="font-size: 0.7rem; color: var(--mut); margin-top: 0.3rem; text-align: right"
          >
            Valor total: <b class="pos">{{ fmt(valorLotesProducto(p.id)) }}</b>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, computed } from 'vue';
import { storeToRefs } from 'pinia';
import { db, P, n, fmt, fmtCant, fmtFH } from '../db.js';
import { useProductosStore } from '../stores/useProductosStore.js';
import { useLotesStore } from '../stores/useLotesStore.js';
import { useConfigStore } from '../stores/useConfigStore.js';
import { useUIStore } from '../stores/useUIStore.js';
import { recargarStores } from '../stores/recarga.js';
import { TOAST } from '../constants.js';
import { toastMsg } from '../utils/toast.js';

const configStore = useConfigStore();
const ui = useUIStore();
const productosStore = useProductosStore();
const lotesStore = useLotesStore();

const { busqProd, mostrarArchivados, filtroStock } = storeToRefs(productosStore);
const { stock, formatStock, badgeStock, txtBadge, limpiarFiltroStock } = productosStore;
const { lotesDeProducto, valorLotesProducto, stockMap } = lotesStore;

const sec = 'productos';
const mutColor = computed(() => (configStore.tema === 'dark' ? '#94a3b8' : '#6b7280'));
const txtColor = computed(() => (configStore.tema === 'dark' ? '#f1f5f9' : '#111827'));

const prodsFiltrados = computed(() => productosStore.productosFiltrados);

// Mapa de badges por producto
const badgeMap = computed(() => {
  const map = {};
  const sm = lotesStore.stockMap;
  for (const p of productosStore.productos) {
    const s = sm[p.id] || 0;
    let b;
    if (p.archivado) b = 'arch';
    else if (s === 0) b = 'out';
    else if (s <= Number(p.stockMinimo)) b = 'low';
    else b = 'ok';
    map[p.id] = b;
  }
  return map;
});

// ===== FORMULARIO DE PRODUCTO (local a la vista) =====
const prodExpandido = ref({});
const prodForm = ref({
  editId: '',
  nombre: '',
  precio: '',
  stockMin: '5',
  preciosEscalonados: [],
  empaques: [],
  nota: '',
});

function resetProd() {
  prodForm.value = {
    editId: '',
    nombre: '',
    precio: '',
    stockMin: String(configStore.cfg.stockMinDefault || 5),
    preciosEscalonados: [],
    empaques: [],
    nota: '',
  };
}

function agregarEscalon() {
  if (!prodForm.value.preciosEscalonados) prodForm.value.preciosEscalonados = [];
  prodForm.value.preciosEscalonados.push({ min: '', precio: '' });
}

function quitarEscalon(i) {
  prodForm.value.preciosEscalonados.splice(i, 1);
}

function agregarEmpaque() {
  if (!prodForm.value.empaques) prodForm.value.empaques = [];
  prodForm.value.empaques.push({ nombre: '', unidades: '' });
}

function quitarEmpaque(i) {
  prodForm.value.empaques.splice(i, 1);
}

async function guardarProducto() {
  try {
    await productosStore.guardarProducto(prodForm.value);
    toastMsg(prodForm.value.editId ? 'Producto actualizado' : 'Producto guardado');
    resetProd();
  } catch (e) {
    toastMsg(e.message, TOAST.BAD);
  }
}

function editarProducto(id) {
  const p = productosStore.productos.find((x) => x.id === id);
  if (!p) return;
  prodForm.value = {
    editId: id,
    nombre: p.nombre,
    precio: String(p.precio),
    stockMin: String(p.stockMinimo || 5),
    preciosEscalonados: (p.preciosEscalonados || []).map((e) => ({ min: String(e.min), precio: String(e.precio) })),
    empaques: (p.empaques || []).map((e) => ({ nombre: e.nombre, unidades: String(e.unidades) })),
    nota: p.nota || '',
  };
  window.scrollTo(0, 0);
}

function archivarProducto(id) {
  const p = productosStore.productos.find((x) => x.id === id);
  if (productosStore.stock(id) > 0) return toastMsg('No archivar con stock > 0', TOAST.BAD);
  ui.confirmar({
    titulo: 'Archivar producto',
    msg: '¿Archivar "' + p.nombre + '"?',
    onOk: async () => {
      await P(db.productos, { ...p, archivado: true });
      await recargarStores('productos');
      toastMsg('Archivado');
    },
  });
}

async function restaurarProducto(id) {
  const p = productosStore.productos.find((x) => x.id === id);
  await P(db.productos, { ...p, archivado: false });
  await recargarStores('productos');
  toastMsg('Restaurado');
}
</script>
