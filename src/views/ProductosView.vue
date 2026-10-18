<template>
  <section v-if="sec === 'productos'" class="fade-up">
    <div class="card">
      <div class="card-title">
        <icon name="tag" :size="18" :color="sec === 'productos' ? '#2196F3' : mutColor"></icon>
        {{ prodForm.editId ? 'Editar' : 'Agregar' }} Producto
      </div>
      <input v-model="prodForm.nombre" type="text" placeholder="Nombre del producto" maxlength="120" />
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
      <input
        v-model="prodForm.unidad"
        type="text"
        placeholder="Unidad (opcional: und, kg, lt...)"
        maxlength="20"
        style="margin-bottom: 0.5rem"
      />

      <!-- Empaques: para comprar "1 caja = 24 unidades" -->
      <div class="prod-subform">
        <div class="prod-subform-title">
          <span>📦 Empaques (para compras)</span>
          <button type="button" class="link-btn" style="font-size: 0.72rem" @click="agregarEmpaque">+ Agregar</button>
        </div>
        <div v-if="!prodForm.empaques.length" class="det" style="font-size: 0.72rem; color: var(--mut)">
          Ej: "caja" = 24 unidades, "bandeja" = 30. Aparecen al registrar compras.
        </div>
        <div v-for="(e, i) in prodForm.empaques" :key="'emp' + i" class="prod-subform-row">
          <input v-model="e.nombre" type="text" placeholder="Nombre (caja...)" maxlength="40" />
          <input
            v-model="e.unidades"
            type="text"
            inputmode="decimal"
            placeholder="Unidades"
            @blur="e.unidades = String(n(e.unidades) || '')"
          />
          <button type="button" class="icon-btn bad" @click="quitarEmpaque(i)" aria-label="Quitar">
            <icon name="x" :size="14" color="#dc2626"></icon>
          </button>
        </div>
      </div>

      <!-- Precios escalonados: "desde 12 unidades, $X c/u" -->
      <div class="prod-subform">
        <div class="prod-subform-title">
          <span>🏷️ Precio por cantidad</span>
          <button type="button" class="link-btn" style="font-size: 0.72rem" @click="agregarEscalon">+ Agregar</button>
        </div>
        <div v-if="!prodForm.preciosEscalonados.length" class="det" style="font-size: 0.72rem; color: var(--mut)">
          Ej: desde 12 unidades a $85 c/u (precio mayorista). El precio base aplica por debajo.
        </div>
        <div v-for="(e, i) in prodForm.preciosEscalonados" :key="'esc' + i" class="prod-subform-row">
          <input
            v-model="e.min"
            type="text"
            inputmode="decimal"
            placeholder="Desde (cant)"
            @blur="e.min = String(n(e.min) || '')"
          />
          <input
            v-model="e.precio"
            type="text"
            inputmode="decimal"
            placeholder="Precio c/u"
            @blur="e.precio = String(n(e.precio) || '')"
          />
          <button type="button" class="icon-btn bad" @click="quitarEscalon(i)" aria-label="Quitar">
            <icon name="x" :size="14" color="#dc2626"></icon>
          </button>
        </div>
      </div>

      <textarea
        v-model="prodForm.nota"
        placeholder="Nota interna (opcional)"
        rows="2"
        maxlength="500"
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

<script setup lang="ts">
import { ref, computed } from 'vue';
import { storeToRefs } from 'pinia';
import { n } from '../utils/numero';
import { fmt, fmtCant, fmtFH } from '../utils/formato';
import { P } from '../utils/id';
import { db } from '../db';
import { useProductosStore } from '../stores/useProductosStore';
import { useLotesStore } from '../stores/useLotesStore';
import { useConfigStore } from '../stores/useConfigStore';
import { useUIStore } from '../stores/useUIStore';
import { recargarStores } from '../stores/recarga';
import { TOAST } from '../constants';
import { toastMsg } from '../utils/toast';

const configStore = useConfigStore();
const ui = useUIStore();
const productosStore = useProductosStore();
const lotesStore = useLotesStore();

const { busqProd, mostrarArchivados, filtroStock } = storeToRefs(productosStore);
const { stock, formatStock, badgeStock, txtBadge, limpiarFiltroStock } = productosStore;
const { lotesDeProducto, valorLotesProducto } = lotesStore;

const sec = 'productos';
const mutColor = computed(() => (configStore.tema === 'dark' ? '#94a3b8' : '#6b7280'));
const txtColor = computed(() => (configStore.tema === 'dark' ? '#f1f5f9' : '#111827'));

const prodsFiltrados = computed(() => productosStore.productosFiltrados);

// Mapa de badges por producto
const badgeMap = computed(() => {
  const map: Record<string, string> = {};
  const sm = lotesStore.stockMap as Record<string, number>;
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
const prodExpandido = ref<Record<string, boolean>>({});
const prodForm = ref<{
  editId: string;
  nombre: string;
  precio: string;
  stockMin: string;
  unidad: string;
  preciosEscalonados: { min: string; precio: string }[];
  empaques: { nombre: string; unidades: string }[];
  nota: string;
}>({
  editId: '',
  nombre: '',
  precio: '',
  stockMin: '5',
  unidad: '',
  preciosEscalonados: [],
  empaques: [],
  nota: '',
});

function resetProd() {
  prodForm.value = {
    editId: '',
    nombre: '',
    precio: '',
    stockMin: String(configStore.cfg.stockMinDefault ?? 5),
    unidad: '',
    preciosEscalonados: [],
    empaques: [],
    nota: '',
  };
}

function agregarEscalon() {
  prodForm.value.preciosEscalonados.push({ min: '', precio: '' });
}

function quitarEscalon(i: number) {
  prodForm.value.preciosEscalonados.splice(i, 1);
}

function agregarEmpaque() {
  prodForm.value.empaques.push({ nombre: '', unidades: '' });
}

function quitarEmpaque(i: number) {
  prodForm.value.empaques.splice(i, 1);
}

async function guardarProducto() {
  try {
    await productosStore.guardarProducto(prodForm.value);
    toastMsg(prodForm.value.editId ? 'Producto actualizado' : 'Producto guardado');
    resetProd();
  } catch (e) {
    toastMsg(e instanceof Error ? e.message : String(e), TOAST.BAD);
  }
}

function editarProducto(id: string) {
  const p = productosStore.productos.find((x) => x.id === id);
  if (!p) return;
  prodForm.value = {
    editId: id,
    nombre: p.nombre,
    precio: String(p.precio),
    stockMin: String(p.stockMinimo ?? 5),
    unidad: p.unidad || '',
    preciosEscalonados: (p.preciosEscalonados || []).map((e) => ({ min: String(e.min), precio: String(e.precio) })),
    empaques: (p.empaques || []).map((e) => ({ nombre: e.nombre, unidades: String(e.unidades) })),
    nota: p.nota || '',
  };
  window.scrollTo(0, 0);
}

function archivarProducto(id: string) {
  const p = productosStore.productos.find((x) => x.id === id);
  if (!p) return;
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

async function restaurarProducto(id: string) {
  const p = productosStore.productos.find((x) => x.id === id);
  if (!p) return;
  await P(db.productos, { ...p, archivado: false });
  await recargarStores('productos');
  toastMsg('Restaurado');
}
</script>
