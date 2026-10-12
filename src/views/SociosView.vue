<template>
  <section v-if="app.sec === 'socios'" class="fade-up">
    <div class="balance morado">
      <div class="lbl"><icon name="users" :size="14" color="#fff"></icon> Socios activos</div>
      <div class="val">{{ app.sociosActivos.length }}</div>
      <div class="sub">Repartido: {{ app.fmt(app.totalDistribuido) }} · {{ app.sumaPorcentajes }}% en total</div>
    </div>
    <div class="card">
      <div class="card-title">
        <icon name="plus" :size="18" :color="app.sec === 'socios' ? '#2196F3' : app.mutColor"></icon>
        {{ app.socioForm.editId ? 'Editar' : 'Agregar' }} Socio
      </div>
      <input v-model="app.socioForm.nombre" type="text" placeholder="Nombre del socio" />
      <div class="grid2">
        <input
          v-model="app.socioForm.porcentaje"
          type="number"
          inputmode="decimal"
          step="0.01"
          placeholder="% participacion"
        />
        <input
          v-model="app.socioForm.aporte"
          type="number"
          inputmode="decimal"
          step="0.01"
          placeholder="Aporte inicial"
        />
      </div>
      <div class="info-box" style="margin-bottom: 0.5rem">
        Suma actual: <b>{{ app.sumaPorcentajes }}%</b>
        <span v-if="Math.abs(app.sumaPorcentajes - 100) < 0.01"> OK</span>
        <span v-else style="color: var(--warn)"> (debe sumar 100%)</span>
      </div>
      <button class="btn pri" @click="app.guardarSocio()">
        {{ app.socioForm.editId ? 'Actualizar' : 'Agregar Socio' }}
      </button>
      <button v-if="app.socioForm.editId" class="btn ghost" @click="app.resetSocio()">Cancelar</button>
    </div>
    <div class="card">
      <div class="card-title">
        <icon name="users" :size="18" :color="app.sec === 'socios' ? '#2196F3' : app.mutColor"></icon> Socios
      </div>
      <div v-if="app.socios.length === 0" class="empty">Sin socios registrados</div>
      <div v-for="s in app.socios" :key="s.id" class="item">
        <div class="info">
          <div class="nm">{{ s.nombre }}</div>
          <div class="det">
            {{ app.n(s.porcentaje).toFixed(2) }}% · Aporte inicial {{ app.fmt(s.aporte) }} · Aportes extra
            {{ app.fmt(app.totalAportesSocio(s.id)) }} · Recibido {{ app.fmt(app.totalPorSocio(s.id)) }}
          </div>
        </div>
        <div class="act-btns">
          <button class="icon-btn" @click="app.editarSocio(s.id)" aria-label="Editar">
            <icon name="edit" :size="15" :color="app.txtColor"></icon>
          </button>
          <button class="icon-btn bad" @click="app.eliminarSocio(s.id)" aria-label="Eliminar">
            <icon name="trash" :size="15" color="#dc2626"></icon>
          </button>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-title">
        <icon name="dollar" :size="18" :color="app.sec === 'socios' ? '#2196F3' : app.mutColor"></icon> Movimientos de
        dinero
      </div>
      <div style="font-size: 0.82rem; color: var(--mut); margin-bottom: 0.7rem">
        Disponible para retiro: <b class="pos">{{ app.fmt(app.capitalStore.gananciaDisponible) }}</b>
      </div>

      <div class="sheet-group" style="margin-top: 0">Repartir ganancia entre socios</div>
      <input
        v-model="app.repartoForm.monto"
        type="number"
        inputmode="decimal"
        step="0.01"
        placeholder="Monto a repartir"
      />
      <input v-model="app.repartoForm.concepto" type="text" placeholder="Concepto (ej: Reparto mensual)" />
      <div
        v-if="app.n(app.repartoForm.monto) > 0 && app.sociosActivos.length"
        class="info-box"
        style="margin-bottom: 0.5rem"
      >
        <div
          v-for="s in app.sociosActivos"
          :key="s.id"
          style="display: flex; justify-content: space-between; padding: 0.15rem 0"
        >
          <span>{{ s.nombre }} ({{ app.n(s.porcentaje).toFixed(2) }}%)</span>
          <b>{{ app.fmt((app.n(app.repartoForm.monto) * app.n(s.porcentaje)) / 100) }}</b>
        </div>
      </div>
      <button class="btn ok" @click="app.repartirGanancia()">Repartir</button>

      <div class="sheet-group" style="margin-top: 1rem">Otros movimientos</div>
      <div class="grid2">
        <button class="btn bad" style="margin: 0" @click="app.retiroAbierto = true">
          <icon name="dollar" :size="16" color="#fff"></icon> Retirar
        </button>
        <button class="btn ok" style="margin: 0" @click="app.aporteAbierto = true">
          <icon name="plus" :size="16" color="#fff"></icon> Aportar
        </button>
      </div>

      <div class="info-box" style="margin-top: 0.75rem; margin-bottom: 0; font-size: 0.72rem; line-height: 1.6">
        <b>Repartir:</b> divide la ganancia entre socios según su %.<br />
        <b>Retirar:</b> saca dinero para ti sin repartir.<br />
        <b>Aportar:</b> mete dinero extra a la tienda.
      </div>
    </div>

    <div v-if="app.aportesSinSocio.length" class="card" style="border: 2px solid var(--warn)">
      <div class="card-title"><icon name="alert" :size="18" :color="'#d97706'"></icon> Aportes sin asignar</div>
      <div class="info-box" style="background: rgba(217, 119, 6, 0.1); color: var(--warn)">
        Tienes <b>{{ app.aportesSinSocio.length }}</b> aporte(s) por <b>{{ app.fmt(app.aportesSinSocioTotal) }}</b> que
        no estan asignados a ningun socio (son de antes de crear el modulo de socios).
      </div>
      <select v-model="app.migrarSocioId">
        <option value="">Elegir socio...</option>
        <option v-for="s in app.sociosActivos" :key="s.id" :value="s.id">{{ s.nombre }}</option>
      </select>
      <button class="btn warn" @click="app.asignarAportesViejos()">Asignar a este socio</button>
    </div>

    <div class="card">
      <div class="card-title">
        <icon name="list" :size="18" :color="app.sec === 'socios' ? '#2196F3' : app.mutColor"></icon> Historial de
        capital
      </div>
      <div v-if="app.movPatrimonio.length === 0" class="empty">Sin movimientos</div>
      <div v-for="m in app.movPatrimonio" :key="m.id" class="item">
        <div class="info">
          <div class="nm">{{ m.tipo }}</div>
          <div class="det">{{ app.fmtFH(m.fecha) }}{{ m.nota ? ' · ' + m.nota : '' }}</div>
        </div>
        <b :class="m.tipo === 'Retiro' ? 'neg' : 'pos'">{{ m.tipo === 'Retiro' ? '-' : '+' }}{{ app.fmt(m.monto) }}</b>
      </div>
    </div>

    <div class="card">
      <div class="card-title">
        <icon name="list" :size="18" :color="app.sec === 'socios' ? '#2196F3' : app.mutColor"></icon> Historial de
        Distribuciones
      </div>
      <div v-if="app.distribucionesOrdenadas.length === 0" class="empty">Sin distribuciones</div>
      <div v-for="d in app.distribucionesOrdenadas" :key="d.id" class="item">
        <div class="info">
          <div class="nm">{{ d.socioNombre }}</div>
          <div class="det">{{ app.fmtFH(d.fecha) }} · {{ d.concepto }}</div>
        </div>
        <b class="pos">+{{ app.fmt(d.monto) }}</b>
      </div>
    </div>
  </section>
</template>

<script setup>
import { useApp } from '../contexts/appContext.js';

const app = useApp();
</script>
