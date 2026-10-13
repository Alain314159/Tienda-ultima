<template>
  <div v-if="abierto" class="modal no-print" @click.self="$emit('cerrar')">
    <div class="modal-box" @click.stop style="max-width: 520px">
      <div class="modal-title"><icon name="search" :size="20"></icon> Buscar</div>
      <input ref="input" v-model="q" type="text" placeholder="Productos, ventas, socios..." autofocus />
      <div v-if="!q" class="det" style="text-align: center; color: var(--mut); font-size: 0.78rem; padding: 0.4rem">
        Escribe para buscar en toda la app
      </div>
      <div v-else-if="resultados.length === 0" class="empty" style="padding: 1rem">Sin resultados</div>
      <div v-else style="max-height: 50vh; overflow-y: auto; margin-top: 0.4rem">
        <div
          v-for="(r, i) in resultados"
          :key="i"
          class="drop-item"
          @click="
            $emit('ir', r.sec, r.refId);
            q = '';
          "
        >
          <div style="flex: 1; min-width: 0">
            <div style="font-weight: 700; font-size: 0.85rem">{{ r.titulo }}</div>
            <div class="det" style="font-size: 0.7rem; color: var(--mut)">{{ r.detalle }}</div>
          </div>
          <span class="badge arch" style="font-size: 0.55rem">{{ r.tipo }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import MiniSearch from 'minisearch';

defineOptions({ name: 'GlobalSearch' });

interface ItemVenta {
  nombre: string;
}
interface Producto {
  id: string;
  nombre: string;
  archivado?: boolean;
}
interface Venta {
  id: string;
  anulada?: boolean;
  items: ItemVenta[];
  total: number;
}
interface Socio {
  id: string;
  nombre: string;
  porcentaje: number;
}
interface Gasto {
  id: string;
  concepto?: string;
  categoria?: string;
  monto: number;
}
interface EstadoBusqueda {
  productos?: Producto[];
  ventas?: Venta[];
  socios?: Socio[];
  gastos?: Gasto[];
  stockDe?: (pid: string) => number;
  formatMoney?: (v: unknown) => string;
}

const props = defineProps({ abierto: Boolean, state: Object });
const emit = defineEmits(['cerrar', 'ir']);

const q = ref('');
const input = ref<HTMLInputElement | null>(null);

const st = computed<EstadoBusqueda>(() => (props.state as EstadoBusqueda) || {});

// Opciones de búsqueda: prefijo ("coc" → "coca") + fuzzy ("cocacola" → "coca cola")
const OPCIONES = { fuzzy: 0.2, prefix: true };

// ===== Índices MiniSearch (se reconstruyen solo cuando cambia la data) =====
const idxProductos = computed(() => {
  const ms = new MiniSearch({ fields: ['nombre'] });
  ms.addAll(
    (st.value.productos || []).filter((p) => !p.archivado).map((p) => ({ id: p.id, nombre: String(p.nombre || '') }))
  );
  return ms;
});

const idxVentas = computed(() => {
  const ms = new MiniSearch({ fields: ['nombres'] });
  ms.addAll(
    (st.value.ventas || [])
      .filter((v) => !v.anulada)
      .map((v) => ({ id: v.id, nombres: v.items.map((it) => String(it.nombre || '')).join(' ') }))
  );
  return ms;
});

const idxSocios = computed(() => {
  const ms = new MiniSearch({ fields: ['nombre'] });
  ms.addAll((st.value.socios || []).map((s) => ({ id: s.id, nombre: String(s.nombre || '') })));
  return ms;
});

const idxGastos = computed(() => {
  const ms = new MiniSearch({ fields: ['concepto', 'categoria'] });
  ms.addAll(
    (st.value.gastos || []).map((g) => ({
      id: g.id,
      concepto: String(g.concepto || ''),
      categoria: String(g.categoria || ''),
    }))
  );
  return ms;
});

/** IDs que matchean por índice difuso O por subcadena (comportamiento previo). */
function idsEncontrados(ms: MiniSearch, docs: { id: string; texto: string }[], query: string): string[] {
  const ids: string[] = ms.search(query, OPCIONES).map((r) => String(r.id));
  for (const d of docs) {
    if (d.texto.toLowerCase().includes(query) && !ids.includes(d.id)) ids.push(d.id);
  }
  return ids;
}

const resultados = computed(() => {
  const query = q.value.toLowerCase().trim();
  if (!query || query.length < 2) return [];
  const s = st.value;
  const out: { tipo: string; titulo: string; detalle: string; sec: string; refId: string }[] = [];

  idsEncontrados(
    idxProductos.value,
    (s.productos || []).map((p) => ({ id: p.id, texto: String(p.nombre || '') })),
    query
  )
    .slice(0, 5)
    .forEach((id) => {
      const p = (s.productos || []).find((x) => x.id === id);
      if (!p) return;
      out.push({
        tipo: 'producto',
        titulo: p.nombre,
        detalle: 'Stock ' + (s.stockDe ? s.stockDe(p.id) : 0),
        sec: 'productos',
        refId: p.id,
      });
    });

  idsEncontrados(
    idxVentas.value,
    (s.ventas || [])
      .filter((v) => !v.anulada)
      .map((v) => ({ id: v.id, texto: v.items.map((x) => String(x.nombre || '')).join(' ') })),
    query
  )
    .slice(0, 5)
    .forEach((id) => {
      const v = (s.ventas || []).find((x) => x.id === id);
      if (!v) return;
      out.push({
        tipo: 'venta',
        titulo: v.items
          .map((x) => x.nombre)
          .join(', ')
          .slice(0, 50),
        detalle: s.formatMoney ? s.formatMoney(v.total) : String(v.total),
        sec: 'ventas',
        refId: v.id,
      });
    });

  idsEncontrados(
    idxSocios.value,
    (s.socios || []).map((x) => ({ id: x.id, texto: String(x.nombre || '') })),
    query
  )
    .slice(0, 3)
    .forEach((id) => {
      const socio = (s.socios || []).find((x) => x.id === id);
      if (!socio) return;
      out.push({
        tipo: 'socio',
        titulo: socio.nombre,
        detalle: socio.porcentaje + '%',
        sec: 'socios',
        refId: socio.id,
      });
    });

  idsEncontrados(
    idxGastos.value,
    (s.gastos || []).map((g) => ({
      id: g.id,
      texto: String(g.concepto || '') + ' ' + String(g.categoria || ''),
    })),
    query
  )
    .slice(0, 3)
    .forEach((id) => {
      const g = (s.gastos || []).find((x) => x.id === id);
      if (!g) return;
      out.push({
        tipo: 'gasto',
        titulo: (g.categoria || '') + ': ' + (g.concepto || ''),
        detalle: s.formatMoney ? s.formatMoney(g.monto) : String(g.monto),
        sec: 'gastos',
        refId: g.id,
      });
    });
  return out;
});

watch(
  () => props.abierto,
  (v) => {
    if (v) nextTick(() => input.value?.focus());
  }
);
</script>
