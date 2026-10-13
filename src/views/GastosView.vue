<template>
  <section v-if="sec === 'gastos'" class="fade-up">
    <div class="balance gastos-bal">
      <div class="lbl"><icon name="dollar" :size="14" color="#fff"></icon> Gastos del periodo</div>
      <div class="val">{{ fmt(gastosStore.gastosOpPeriodo) }}</div>
      <div class="sub">Acumulado: {{ fmt(gastosStore.gastosTotalAcumulado) }} · {{ gastos.length }} registro(s)</div>
    </div>

    <div class="card">
      <div class="card-title">
        <icon name="plus" :size="18" :color="sec === 'gastos' ? '#2196F3' : mutColor"></icon>
        {{ gastoForm.editId ? 'Editar' : 'Registrar' }} Gasto
      </div>
      <div class="grid2">
        <input v-model="gastoForm.fecha" type="date" />
        <select v-model="gastoForm.categoria">
          <option value="">Categoria...</option>
          <option v-for="c in CATEGORIAS_GASTO" :key="c" :value="c">{{ c }}</option>
        </select>
      </div>
      <input v-model="gastoForm.concepto" type="text" placeholder="Concepto (ej: Recibo de luz agosto)" />
      <div class="grid2">
        <input v-model="gastoForm.monto" type="number" inputmode="decimal" step="0.01" placeholder="Monto" />
        <select v-model="gastoForm.metodoPago">
          <option v-for="mp in METODOS_PAGO" :key="mp.value" :value="mp.value">{{ mp.label }}</option>
        </select>
      </div>
      <input v-model="gastoForm.nota" type="text" placeholder="Nota (opcional)" />
      <div class="set-row">
        <span class="lbl"><icon name="wallet" :size="18"></icon> Sale de caja</span>
        <label class="switch">
          <input type="checkbox" v-model="gastoForm.saleDeCaja" />
          <span class="slider"></span>
        </label>
      </div>
      <button class="btn warn" @click="guardarGasto()">
        {{ gastoForm.editId ? 'Actualizar' : 'Registrar Gasto' }}
      </button>
      <button v-if="gastoForm.editId" class="btn ghost" @click="resetGasto()">Cancelar</button>
    </div>

    <div class="card" v-if="gastosPorCategoria.length">
      <div class="card-title">
        <icon name="chart" :size="18" :color="sec === 'gastos' ? '#2196F3' : mutColor"></icon> Por categoria (acumulado)
      </div>
      <div v-for="g in gastosPorCategoria" :key="g.cat" class="row">
        <span>{{ g.cat }}</span>
        <b class="neg">{{ fmt(g.monto) }}</b>
      </div>
    </div>

    <div class="card">
      <div class="card-title">
        <icon name="list" :size="18" :color="sec === 'gastos' ? '#2196F3' : mutColor"></icon> Historial
      </div>
      <div v-if="gastosOrdenados.length === 0" class="empty">Sin gastos registrados</div>

      <div v-if="gastosPorPeriodo.actual.length" class="hist-grupo">
        <div class="hist-head">
          <span class="badge ok">ACTUAL</span>
          <span class="hist-titulo">Periodo actual</span>
          <span class="hist-count">{{ gastosPorPeriodo.actual.length }}</span>
        </div>
        <div v-for="g in histGastosMostrados" :key="g.id" class="item">
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
        <div v-if="histGastosHayMas" class="hist-mas">
          <button class="link-btn" @click="hist.mostrarMas()">
            Mostrar 20 mas ({{ histGastosRestantes }} restantes)
          </button>
        </div>
      </div>

      <div v-for="g in gastosPorPeriodo.cerrados" :key="g.cierre.id" class="hist-grupo hist-cerrado">
        <div class="hist-head hist-head-click" @click="hist.toggle(g.cierre.id)">
          <span class="badge arch">CERRADO</span>
          <span class="hist-titulo">{{ g.cierre.periodo }}</span>
          <span class="hist-count">{{ g.items.length }}</span>
          <span class="chev" :class="{ open: hist.abierto(g.cierre.id) }">
            <icon name="chevron" :size="14" :color="mutColor"></icon>
          </span>
        </div>
        <div v-if="hist.abierto(g.cierre.id)">
          <div v-for="g in hist.itemsMostrados(g.items)" :key="g.id" class="item">
            <div class="info">
              <div class="nm">{{ g.categoria }} · {{ g.concepto }}</div>
              <div class="det">{{ fmtFH(g.fecha) }}</div>
            </div>
            <b class="neg">-{{ fmt(g.monto) }}</b>
          </div>
          <div v-if="hist.hayMas(g.items)" class="hist-mas">
            <button class="link-btn" @click="hist.mostrarMas()">Mostrar 20 mas</button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, computed } from 'vue';
import { db, P, n, genId, fmt, fmtFH } from '../db.js';
import { useGastosStore } from '../stores/useGastosStore.js';
import { useConfigStore } from '../stores/useConfigStore.js';
import { useUIStore } from '../stores/useUIStore.js';
import { useHistorial } from '../composables/useHistorial.js';
import { recargarStores } from '../stores/recarga.js';
import { TOAST, CATEGORIAS_GASTO, METODOS_PAGO } from '../constants.js';
import { toastMsg } from '../utils/toast.js';

const configStore = useConfigStore();
const ui = useUIStore();
const gastosStore = useGastosStore();

const sec = 'gastos';
const mutColor = computed(() => (configStore.tema === 'dark' ? '#94a3b8' : '#6b7280'));
const txtColor = computed(() => (configStore.tema === 'dark' ? '#f1f5f9' : '#111827'));

// ===== FORMULARIO DE GASTO (local a la vista) =====
const gastoForm = ref({
  editId: '',
  fecha: new Date().toISOString().split('T')[0],
  categoria: '',
  concepto: '',
  monto: '',
  nota: '',
  metodoPago: 'efectivo',
  saleDeCaja: true,
});

function resetGasto() {
  gastoForm.value = {
    editId: '',
    fecha: new Date().toISOString().split('T')[0],
    categoria: '',
    concepto: '',
    monto: '',
    nota: '',
    metodoPago: 'efectivo',
    saleDeCaja: true,
  };
}

async function guardarGasto() {
  const f = gastoForm.value;
  const categoria = (f.categoria || '').trim();
  const concepto = (f.concepto || '').trim();
  const monto = n(f.monto);
  const fechaISO = f.fecha ? new Date(f.fecha + 'T12:00:00').toISOString() : new Date().toISOString();
  if (!categoria) return toastMsg('Categoria obligatoria', TOAST.BAD);
  if (!concepto) return toastMsg('Concepto obligatorio', TOAST.BAD);
  if (monto <= 0) return toastMsg('Monto debe ser > 0', TOAST.BAD);

  if (f.editId) {
    const o = gastosStore.gastos.find((x) => x.id === f.editId);
    if (!o) return;
    await db.transaction('rw', db.gastos, db.movCaja, async () => {
      let movId = o.movId || null;
      if (f.saleDeCaja && movId) {
        await P(db.movCaja, {
          id: movId,
          fecha: fechaISO,
          tipo: 'egreso',
          monto,
          concepto: 'Gasto: ' + categoria + ' - ' + concepto,
          nota: f.nota || '',
        });
      } else if (f.saleDeCaja && !movId) {
        movId = genId('mc');
        await P(db.movCaja, {
          id: movId,
          fecha: fechaISO,
          tipo: 'egreso',
          monto,
          concepto: 'Gasto: ' + categoria + ' - ' + concepto,
          nota: f.nota || '',
        });
      } else if (!f.saleDeCaja && movId) {
        await db.movCaja.delete(movId);
        movId = null;
      }
      await P(db.gastos, {
        id: o.id,
        fecha: fechaISO,
        categoria,
        concepto,
        monto,
        nota: f.nota || '',
        metodoPago: f.metodoPago,
        saleDeCaja: !!f.saleDeCaja,
        movId,
      });
    });
    toastMsg('Gasto actualizado');
  } else {
    const id = genId('g');
    let movId = null;
    await db.transaction('rw', db.gastos, db.movCaja, async () => {
      if (f.saleDeCaja) {
        movId = genId('mc');
        await P(db.movCaja, {
          id: movId,
          fecha: fechaISO,
          tipo: 'egreso',
          monto,
          concepto: 'Gasto: ' + categoria + ' - ' + concepto,
          nota: f.nota || '',
        });
      }
      await P(db.gastos, {
        id,
        fecha: fechaISO,
        categoria,
        concepto,
        monto,
        nota: f.nota || '',
        metodoPago: f.metodoPago,
        saleDeCaja: !!f.saleDeCaja,
        movId,
      });
    });
    toastMsg(`Gasto registrado: ${fmt(monto)}`);
  }
  resetGasto();
  await recargarStores('gastos', 'movCaja');
}

function editarGasto(id) {
  const g = gastosStore.gastos.find((x) => x.id === id);
  if (!g) return;
  gastoForm.value = {
    editId: g.id,
    fecha: g.fecha ? g.fecha.split('T')[0] : new Date().toISOString().split('T')[0],
    categoria: g.categoria || '',
    concepto: g.concepto || '',
    monto: String(g.monto || ''),
    nota: g.nota || '',
    metodoPago: g.metodoPago || 'efectivo',
    saleDeCaja: g.saleDeCaja !== false,
  };
  window.scrollTo(0, 0);
}

function eliminarGasto(id) {
  const g = gastosStore.gastos.find((x) => x.id === id);
  if (!g) return;
  ui.confirmar({
    titulo: 'Eliminar gasto',
    msg: 'Eliminar "' + g.concepto + '" por ' + fmt(g.monto) + '?',
    onOk: async () => {
      await db.transaction('rw', db.gastos, db.movCaja, async () => {
        await db.gastos.delete(id);
        if (g.movId) await db.movCaja.delete(g.movId);
      });
      await recargarStores('gastos', 'movCaja', 'asientos');
      toastMsg('Gasto eliminado');
    },
  });
}

// ===== HISTORIAL =====
const gastos = computed(() => gastosStore.gastos);
const gastosOrdenados = computed(() => gastosStore.gastosOrdenados);
const gastosPorCategoria = computed(() => gastosStore.gastosPorCategoria);

const hist = useHistorial(() => gastosOrdenados.value);
const gastosPorPeriodo = computed(() => hist.agruparActual());
const histGastosMostrados = computed(() => hist.itemsMostrados(gastosPorPeriodo.value.actual));
const histGastosHayMas = computed(() => hist.hayMas(gastosPorPeriodo.value.actual));
const histGastosRestantes = computed(() => hist.restantes(gastosPorPeriodo.value.actual));
</script>
