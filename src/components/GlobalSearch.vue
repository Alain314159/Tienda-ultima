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

<script setup>
import { ref, computed, watch, nextTick } from 'vue';

defineOptions({ name: 'GlobalSearch' });

const props = defineProps({ abierto: Boolean, state: Object });
const emit = defineEmits(['cerrar', 'ir']);

const q = ref('');
const input = ref(null);

const resultados = computed(() => {
  const query = q.value.toLowerCase().trim();
  if (!query || query.length < 2) return [];
  const st = props.state || {};
  const out = [];
  (st.productos || [])
    .filter((p) => !p.archivado && p.nombre.toLowerCase().includes(query))
    .slice(0, 5)
    .forEach((p) =>
      out.push({
        tipo: 'producto',
        titulo: p.nombre,
        detalle: 'Stock ' + st.stockDe(p.id),
        sec: 'productos',
        refId: p.id,
      })
    );
  (st.ventas || [])
    .filter((v) => !v.anulada && v.items.some((it) => it.nombre.toLowerCase().includes(query)))
    .slice(0, 5)
    .forEach((v) =>
      out.push({
        tipo: 'venta',
        titulo: v.items
          .map((x) => x.nombre)
          .join(', ')
          .slice(0, 50),
        detalle: st.formatMoney(v.total),
        sec: 'ventas',
        refId: v.id,
      })
    );
  (st.socios || [])
    .filter((s) => s.nombre.toLowerCase().includes(query))
    .slice(0, 3)
    .forEach((s) =>
      out.push({ tipo: 'socio', titulo: s.nombre, detalle: s.porcentaje + '%', sec: 'socios', refId: s.id })
    );
  (st.gastos || [])
    .filter(
      (g) => (g.concepto || '').toLowerCase().includes(query) || (g.categoria || '').toLowerCase().includes(query)
    )
    .slice(0, 3)
    .forEach((g) =>
      out.push({
        tipo: 'gasto',
        titulo: g.categoria + ': ' + g.concepto,
        detalle: st.formatMoney(g.monto),
        sec: 'gastos',
        refId: g.id,
      })
    );
  return out;
});

watch(
  () => props.abierto,
  (v) => {
    if (v) nextTick(() => input.value?.focus());
  }
);
</script>
