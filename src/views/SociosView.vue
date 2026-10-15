<template>
  <section v-if="sec === 'socios'" class="fade-up">
    <div class="balance morado">
      <div class="lbl"><icon name="users" :size="14" color="#fff"></icon> Socios activos</div>
      <div class="val">{{ sociosActivos.length }}</div>
      <div class="sub">Repartido: {{ fmt(totalDistribuido) }} · {{ sumaPorcentajes }}% en total</div>
    </div>
    <div class="card">
      <div class="card-title">
        <icon name="plus" :size="18" :color="sec === 'socios' ? '#2196F3' : mutColor"></icon>
        {{ socioForm.editId ? 'Editar' : 'Agregar' }} Socio
      </div>
      <input v-model="socioForm.nombre" type="text" maxlength="80" placeholder="Nombre del socio" />
      <div class="grid2">
        <input
          v-model="socioForm.porcentaje"
          type="number"
          inputmode="decimal"
          step="0.01"
          placeholder="% participacion"
        />
        <input v-model="socioForm.aporte" type="number" inputmode="decimal" step="0.01" placeholder="Aporte inicial" />
      </div>
      <div class="info-box" style="margin-bottom: 0.5rem">
        Suma actual: <b>{{ sumaPorcentajes }}%</b>
        <span v-if="Math.abs(sumaPorcentajes - 100) < 0.01"> OK</span>
        <span v-else style="color: var(--warn)"> (debe sumar 100%)</span>
      </div>
      <button class="btn pri" @click="guardarSocio()">
        {{ socioForm.editId ? 'Actualizar' : 'Agregar Socio' }}
      </button>
      <button v-if="socioForm.editId" class="btn ghost" @click="resetSocio()">Cancelar</button>
    </div>
    <div class="card">
      <div class="card-title">
        <icon name="users" :size="18" :color="sec === 'socios' ? '#2196F3' : mutColor"></icon> Socios
      </div>
      <div v-if="socios.length === 0" class="empty">Sin socios registrados</div>
      <div v-for="s in socios" :key="s.id" class="item">
        <div class="info">
          <div class="nm">{{ s.nombre }}</div>
          <div class="det">
            {{ n(s.porcentaje).toFixed(2) }}% · Aporte inicial {{ fmt(s.aporte) }} · Aportes extra
            {{ fmt(totalAportesSocio(s.id)) }} · Recibido {{ fmt(totalPorSocio(s.id)) }}
          </div>
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
      <div class="card-title">
        <icon name="dollar" :size="18" :color="sec === 'socios' ? '#2196F3' : mutColor"></icon> Movimientos de dinero
      </div>
      <div style="font-size: 0.82rem; color: var(--mut); margin-bottom: 0.7rem">
        Disponible para retiro: <b class="pos">{{ fmt(capitalStore.gananciaDisponible) }}</b>
      </div>

      <div class="sheet-group" style="margin-top: 0">Repartir ganancia entre socios</div>
      <input v-model="repartoForm.monto" type="number" inputmode="decimal" step="0.01" placeholder="Monto a repartir" />
      <input v-model="repartoForm.concepto" type="text" maxlength="120" placeholder="Concepto (ej: Reparto mensual)" />
      <div v-if="n(repartoForm.monto) > 0 && sociosActivos.length" class="info-box" style="margin-bottom: 0.5rem">
        <div
          v-for="s in sociosActivos"
          :key="s.id"
          style="display: flex; justify-content: space-between; padding: 0.15rem 0"
        >
          <span>{{ s.nombre }} ({{ n(s.porcentaje).toFixed(2) }}%)</span>
          <b>{{ fmt((n(repartoForm.monto) * n(s.porcentaje)) / 100) }}</b>
        </div>
      </div>
      <button class="btn ok" @click="repartirGanancia()">Repartir</button>

      <div class="sheet-group" style="margin-top: 1rem">Otros movimientos</div>
      <div class="grid2">
        <button class="btn bad" style="margin: 0" @click="ui.retiroAbierto = true">
          <icon name="dollar" :size="16" color="#fff"></icon> Retirar
        </button>
        <button class="btn ok" style="margin: 0" @click="ui.aporteAbierto = true">
          <icon name="plus" :size="16" color="#fff"></icon> Aportar
        </button>
      </div>

      <div class="info-box" style="margin-top: 0.75rem; margin-bottom: 0; font-size: 0.72rem; line-height: 1.6">
        <b>Repartir:</b> divide la ganancia entre socios según su %.<br />
        <b>Retirar:</b> saca dinero para ti sin repartir.<br />
        <b>Aportar:</b> mete dinero extra a la tienda.
      </div>
    </div>

    <div v-if="aportesSinSocio.length" class="card" style="border: 2px solid var(--warn)">
      <div class="card-title"><icon name="alert" :size="18" :color="'#d97706'"></icon> Aportes sin asignar</div>
      <div class="info-box" style="background: rgb(217 119 6 / 10%); color: var(--warn)">
        Tienes <b>{{ aportesSinSocio.length }}</b> aporte(s) por <b>{{ fmt(aportesSinSocioTotal) }}</b> que no estan
        asignados a ningun socio (son de antes de crear el modulo de socios).
      </div>
      <select v-model="migrarSocioId">
        <option value="">Elegir socio...</option>
        <option v-for="s in sociosActivos" :key="s.id" :value="s.id">{{ s.nombre }}</option>
      </select>
      <button class="btn warn" @click="asignarAportesViejos()">Asignar a este socio</button>
    </div>

    <div class="card">
      <div class="card-title">
        <icon name="list" :size="18" :color="sec === 'socios' ? '#2196F3' : mutColor"></icon> Historial de capital
      </div>
      <div v-if="movPatrimonio.length === 0" class="empty">Sin movimientos</div>
      <div v-for="mv in movPatrimonio" :key="mv.id" class="item">
        <div class="info">
          <div class="nm">{{ mv.tipo }}</div>
          <div class="det">{{ fmtFH(mv.fecha) }}{{ mv.nota ? ' · ' + mv.nota : '' }}</div>
        </div>
        <b :class="mv.tipo === 'Retiro' ? 'neg' : 'pos'">{{ mv.tipo === 'Retiro' ? '-' : '+' }}{{ fmt(mv.monto) }}</b>
      </div>
    </div>

    <div class="card">
      <div class="card-title">
        <icon name="list" :size="18" :color="sec === 'socios' ? '#2196F3' : mutColor"></icon> Historial de
        Distribuciones
      </div>
      <div v-if="distribucionesOrdenadas.length === 0" class="empty">Sin distribuciones</div>
      <div v-for="d in distribucionesOrdenadas" :key="d.id" class="item">
        <div class="info">
          <div class="nm">{{ d.socioNombre }}</div>
          <div class="det">{{ fmtFH(d.fecha) }} · {{ d.concepto }}</div>
        </div>
        <b class="pos">+{{ fmt(d.monto) }}</b>
      </div>
    </div>

    <!-- ==================== RETIRO MODAL ==================== -->
    <div v-if="ui.retiroAbierto" class="modal no-print">
      <div class="modal-box">
        <div class="modal-title"><icon name="dollar" :size="20"></icon> Retirar</div>
        <div class="grid2" style="margin-bottom: 0.5rem">
          <button
            class="btn"
            :class="capitalStore.retiroForm.tipo === 'ganancia' ? 'pri' : 'ghost'"
            style="margin: 0"
            @click="capitalStore.retiroForm.tipo = 'ganancia'"
          >
            Ganancia
          </button>
          <button
            class="btn"
            :class="capitalStore.retiroForm.tipo === 'capital' ? 'pri' : 'ghost'"
            style="margin: 0"
            @click="capitalStore.retiroForm.tipo = 'capital'"
          >
            Capital
          </button>
        </div>
        <div style="font-size: 0.82rem; color: var(--mut); margin-bottom: 0.5rem">
          <template v-if="capitalStore.retiroForm.tipo === 'capital'">
            Capital disponible: <b class="pos">{{ fmt(capitalStore.capitalDisponible) }}</b>
          </template>
          <template v-else>
            Ganancia disponible: <b class="pos">{{ fmt(capitalStore.gananciaDisponible) }}</b>
          </template>
        </div>
        <input
          v-model="capitalStore.retiroForm.monto"
          type="number"
          inputmode="decimal"
          step="0.01"
          placeholder="Monto a retirar"
        />
        <input v-model="capitalStore.retiroForm.concepto" type="text" placeholder="Concepto (obligatorio)" />
        <div class="grid2">
          <button class="btn bad" @click="registrarRetiro">Retirar</button>
          <button class="btn ghost" @click="ui.retiroAbierto = false">Cancelar</button>
        </div>
      </div>
    </div>

    <!-- ==================== APORTE MODAL ==================== -->
    <div v-if="ui.aporteAbierto" class="modal no-print">
      <div class="modal-box">
        <div class="modal-title"><icon name="plus" :size="20"></icon> Aportar Capital</div>
        <input
          v-model="capitalStore.aporteForm.monto"
          type="number"
          inputmode="decimal"
          step="0.01"
          placeholder="Monto del aporte"
        />
        <input v-model="capitalStore.aporteForm.nota" type="text" placeholder="Nota (opcional)" />
        <select v-model="capitalStore.aporteForm.socioId">
          <option value="">Sin asignar (capital general)</option>
          <option v-for="s in sociosActivos" :key="s.id" :value="s.id">{{ s.nombre }}</option>
        </select>
        <div class="grid2">
          <button class="btn ok" @click="registrarAporte">Registrar Aporte</button>
          <button class="btn ghost" @click="ui.aporteAbierto = false">Cancelar</button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { n, m } from '../utils/numero';
import { fmt, fmtFH } from '../utils/formato';
import { P, genId, clean } from '../utils/id';
import { db } from '../db';
import { useCapitalStore } from '../stores/useCapitalStore';
import { useConfigStore } from '../stores/useConfigStore';
import { useUIStore } from '../stores/useUIStore';
import { recargarStores } from '../stores/recarga';
import { TOAST } from '../constants';
import { toastMsg } from '../utils/toast';

const configStore = useConfigStore();
const ui = useUIStore();
const capitalStore = useCapitalStore();

const sec = 'socios';
const mutColor = computed(() => (configStore.tema === 'dark' ? '#94a3b8' : '#6b7280'));
const txtColor = computed(() => (configStore.tema === 'dark' ? '#f1f5f9' : '#111827'));

// ===== GETTERS =====
const socios = computed(() => capitalStore.socios);
const sociosActivos = computed(() => capitalStore.sociosActivos);
const sumaPorcentajes = computed(() => capitalStore.sumaPorcentajes);
const totalDistribuido = computed(() => capitalStore.totalDistribuido);
const distribucionesOrdenadas = computed(() =>
  capitalStore.distribuciones.slice().sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
);
const movPatrimonio = computed(() => capitalStore.movPatrimonio);

function totalAportesSocio(sid: string) {
  return m(capitalStore.capital.filter((x) => x.socioId === sid).reduce((s, x) => s + n(x.monto), 0));
}

function totalPorSocio(sid: string) {
  return m(capitalStore.distribuciones.filter((d) => d.socioId === sid).reduce((s, x) => s + n(x.monto), 0));
}

// Aportes sin socio (previos al modulo de socios)
const aportesSinSocio = computed(() => capitalStore.capital.filter((x) => !x.socioId));
const aportesSinSocioTotal = computed(() => m(aportesSinSocio.value.reduce((s, x) => s + n(x.monto), 0)));
const migrarSocioId = ref('');

function asignarAportesViejos() {
  const sid = migrarSocioId.value;
  if (!sid) return toastMsg('Elige un socio primero', TOAST.BAD);
  const sinAsignar = aportesSinSocio.value;
  if (!sinAsignar.length) return toastMsg('No hay aportes sin asignar', TOAST.WARN);
  const socio = capitalStore.socios.find((x) => x.id === sid);
  if (!socio) return;
  const total = aportesSinSocioTotal.value;
  ui.confirmar({
    titulo: 'Asignar aportes',
    msg: 'Asignar ' + sinAsignar.length + ' aporte(s) por ' + fmt(total) + ' a ' + socio.nombre + '?',
    onOk: async () => {
      try {
        const actualizados = sinAsignar.map((x) => ({ ...x, socioId: sid }));
        await db.capital.bulkPut(actualizados.map((x) => clean(x)));
        await recargarStores('capital');
        migrarSocioId.value = '';
        toastMsg(`Asignados ${actualizados.length} aportes`);
      } catch (e) {
        toastMsg('Error: ' + (e instanceof Error ? e.message : String(e)), TOAST.BAD);
      }
    },
  });
}

// ===== FORMULARIO DE SOCIO (local a la vista) =====
const socioForm = ref({ editId: '', nombre: '', porcentaje: '', aporte: '' });

function resetSocio() {
  socioForm.value = { editId: '', nombre: '', porcentaje: '', aporte: '' };
}

async function guardarSocio() {
  const f = socioForm.value;
  const nombre = (f.nombre || '').trim();
  const pct = n(f.porcentaje);
  const aporte = n(f.aporte);
  if (!nombre) return toastMsg('Nombre obligatorio', TOAST.BAD);
  if (pct < 0 || pct > 100) return toastMsg('Porcentaje entre 0 y 100', TOAST.BAD);
  if (aporte < 0) return toastMsg('Aporte invalido', TOAST.BAD);
  const dup = capitalStore.socios.find(
    (x) => (x.nombre || '').toLowerCase() === nombre.toLowerCase() && x.id !== f.editId
  );
  if (dup) return toastMsg('Ya existe ese socio', TOAST.BAD);
  if (f.editId) {
    const o = capitalStore.socios.find((x) => x.id === f.editId);
    // El aporte inicial es un hecho contable (Caja↔Capital): editarlo movería
    // el saldo de caja sin que entre o salga un peso. Para ajustar capital
    // existe "Aporte adicional" (o un retiro de capital).
    if (o && Math.abs(n(o.aporte) - aporte) > 0.009)
      return toastMsg(
        'El aporte inicial no se puede editar (afecta la caja). Registra un aporte adicional o elimina y crea el socio de nuevo.',
        TOAST.BAD
      );
    await P(db.socios, { ...o, nombre, porcentaje: pct, aporte });
    toastMsg('Socio actualizado');
  } else {
    await P(db.socios, {
      id: genId('so'),
      nombre,
      porcentaje: pct,
      aporte,
      fecha: new Date().toISOString(),
      activo: true,
    });
    toastMsg('Socio agregado');
  }
  resetSocio();
  await recargarStores('socios');
}

function editarSocio(id: string) {
  const s = capitalStore.socios.find((x) => x.id === id);
  if (!s) return;
  socioForm.value = {
    editId: id,
    nombre: s.nombre,
    porcentaje: String(s.porcentaje || ''),
    aporte: String(s.aporte || ''),
  };
  window.scrollTo(0, 0);
}

function eliminarSocio(id: string) {
  const s = capitalStore.socios.find((x) => x.id === id);
  if (!s) return;
  const aporte = n(s.aporte);
  ui.confirmar({
    titulo: 'Eliminar socio',
    msg:
      aporte > 0
        ? 'Eliminar a "' +
          s.nombre +
          '"? Su aporte de ' +
          fmt(aporte) +
          ' queda en el negocio como capital (la caja NO cambia). Las distribuciones previas se conservan.'
        : 'Eliminar a "' + s.nombre + '"? Las distribuciones previas se conservan.',
    onOk: async () => {
      try {
        // El store conserva el aporte como movimiento de capital (caja intacta)
        await capitalStore.eliminarSocio(id);
        toastMsg('Socio eliminado');
      } catch (e) {
        toastMsg('Error: ' + (e instanceof Error ? e.message : String(e)), TOAST.BAD);
      }
    },
  });
}

// ===== REPARTO DE GANANCIA =====
const repartoForm = ref({ monto: '', concepto: '' });

function repartirGanancia() {
  const monto = n(repartoForm.value.monto);
  const concepto = (repartoForm.value.concepto || '').trim() || 'Reparto de ganancia';
  if (monto <= 0) return toastMsg('Monto invalido', TOAST.BAD);
  if (!sociosActivos.value.length) return toastMsg('Sin socios activos', TOAST.BAD);
  if (monto > capitalStore.gananciaDisponible + 0.01)
    return toastMsg('Maximo ' + fmt(capitalStore.gananciaDisponible), TOAST.BAD);
  if (Math.abs(sumaPorcentajes.value - 100) > 0.01)
    return toastMsg('Los porcentajes deben sumar 100% (actual: ' + sumaPorcentajes.value + '%)', TOAST.BAD);
  ui.pedirPin(async () => {
    try {
      const dists = sociosActivos.value.map((s) => ({
        id: genId('di'),
        fecha: new Date().toISOString(),
        socioId: s.id,
        socioNombre: s.nombre,
        montoTotal: monto,
        monto: m((monto * n(s.porcentaje)) / 100),
        porcentaje: n(s.porcentaje),
        concepto,
      }));
      await db.transaction('rw', db.distribuciones, db.retiros, async () => {
        await db.distribuciones.bulkPut(dists.map((x) => clean(x)));
        await P(db.retiros, {
          id: genId('r'),
          fecha: new Date().toISOString(),
          monto,
          concepto: 'Reparto a socios: ' + concepto,
          socios: dists.map((d) => ({ socioId: d.socioId, nombre: d.socioNombre, monto: d.monto })),
        });
      });
      await recargarStores('distribuciones', 'retiros', 'asientos');
      repartoForm.value = { monto: '', concepto: '' };
      toastMsg(`Repartido ${fmt(monto)}`);
    } catch (e) {
      toastMsg(e instanceof Error ? e.message : String(e), TOAST.BAD);
    }
  });
}

// ===== RETIRO / APORTE (modales locales, estado en capitalStore) =====
async function registrarRetiro() {
  try {
    await capitalStore.registrarRetiro();
    ui.retiroAbierto = false;
    toastMsg('Retiro registrado');
  } catch (e) {
    toastMsg(e instanceof Error ? e.message : String(e), TOAST.BAD);
  }
}

async function registrarAporte() {
  try {
    await capitalStore.registrarAporte();
    ui.aporteAbierto = false;
    toastMsg('Aporte registrado');
  } catch (e) {
    toastMsg(e instanceof Error ? e.message : String(e), TOAST.BAD);
  }
}
</script>
