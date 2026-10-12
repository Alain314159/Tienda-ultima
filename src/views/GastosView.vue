<template>
  <section v-if="app.sec === 'gastos'" class="fade-up">
    <div class="balance gastos-bal">
      <div class="lbl"><icon name="dollar" :size="14" color="#fff"></icon> Gastos del periodo</div>
      <div class="val">{{ app.fmt(app.gastosStore.gastosOpPeriodo) }}</div>
      <div class="sub">
        Acumulado: {{ app.fmt(app.gastosStore.gastosTotalAcumulado) }} · {{ app.gastos.length }} registro(s)
      </div>
    </div>

    <div class="card">
      <div class="card-title">
        <icon name="plus" :size="18" :color="app.sec === 'gastos' ? '#2196F3' : app.mutColor"></icon>
        {{ app.gastoForm.editId ? 'Editar' : 'Registrar' }} Gasto
      </div>
      <div class="grid2">
        <input v-model="app.gastoForm.fecha" type="date" />
        <select v-model="app.gastoForm.categoria">
          <option value="">Categoria...</option>
          <option v-for="c in app.CATEGORIAS_GASTO" :key="c" :value="c">{{ c }}</option>
        </select>
      </div>
      <input v-model="app.gastoForm.concepto" type="text" placeholder="Concepto (ej: Recibo de luz agosto)" />
      <div class="grid2">
        <input v-model="app.gastoForm.monto" type="number" inputmode="decimal" step="0.01" placeholder="Monto" />
        <select v-model="app.gastoForm.metodoPago">
          <option v-for="m in app.METODOS_PAGO" :key="m.value" :value="m.value">{{ m.label }}</option>
        </select>
      </div>
      <input v-model="app.gastoForm.nota" type="text" placeholder="Nota (opcional)" />
      <div class="set-row">
        <span class="lbl"><icon name="wallet" :size="18"></icon> Sale de caja</span>
        <label class="switch">
          <input type="checkbox" v-model="app.gastoForm.saleDeCaja" />
          <span class="slider"></span>
        </label>
      </div>
      <button class="btn warn" @click="app.guardarGasto()">
        {{ app.gastoForm.editId ? 'Actualizar' : 'Registrar Gasto' }}
      </button>
      <button v-if="app.gastoForm.editId" class="btn ghost" @click="app.resetGasto()">Cancelar</button>
    </div>

    <div class="card" v-if="app.gastosPorCategoria.length">
      <div class="card-title">
        <icon name="chart" :size="18" :color="app.sec === 'gastos' ? '#2196F3' : app.mutColor"></icon> Por categoria
        (acumulado)
      </div>
      <div v-for="g in app.gastosPorCategoria" :key="g.cat" class="row">
        <span>{{ g.cat }}</span>
        <b class="neg">{{ app.fmt(g.monto) }}</b>
      </div>
    </div>

    <div class="card">
      <div class="card-title">
        <icon name="list" :size="18" :color="app.sec === 'gastos' ? '#2196F3' : app.mutColor"></icon> Historial
      </div>
      <div v-if="app.gastosOrdenados.length === 0" class="empty">Sin gastos registrados</div>

      <div v-if="app.gastosPorPeriodo.actual.length" class="hist-grupo">
        <div class="hist-head">
          <span class="badge ok">ACTUAL</span>
          <span class="hist-titulo">Periodo actual</span>
          <span class="hist-count">{{ app.gastosPorPeriodo.actual.length }}</span>
        </div>
        <div v-for="g in app.histGastosMostrados" :key="g.id" class="item">
          <div class="info">
            <div class="nm">{{ g.categoria }} · {{ g.concepto }}</div>
            <div class="det">{{ app.fmtFH(g.fecha) }} · {{ g.saleDeCaja ? 'Caja' : 'Sin caja' }}</div>
          </div>
          <div class="act-btns">
            <b class="neg">-{{ app.fmt(g.monto) }}</b>
            <button class="icon-btn" @click="app.editarGasto(g.id)" aria-label="Editar">
              <icon name="edit" :size="15" :color="app.txtColor"></icon>
            </button>
            <button class="icon-btn bad" @click="app.eliminarGasto(g.id)" aria-label="Eliminar">
              <icon name="trash" :size="15" color="#dc2626"></icon>
            </button>
          </div>
        </div>
        <div v-if="app.histGastosHayMas" class="hist-mas">
          <button class="link-btn" @click="app.histMostrarMas('gastos')">
            Mostrar 20 mas ({{ app.histGastosRestantes }} restantes)
          </button>
        </div>
      </div>

      <div v-for="g in app.gastosPorPeriodo.cerrados" :key="g.cierre.id" class="hist-grupo hist-cerrado">
        <div class="hist-head hist-head-click" @click="app.histToggle('gastos', g.cierre.id)">
          <span class="badge arch">CERRADO</span>
          <span class="hist-titulo">{{ g.cierre.periodo }}</span>
          <span class="hist-count">{{ g.items.length }}</span>
          <span class="chev" :class="{ open: app.histAbierto('gastos', g.cierre.id) }">
            <icon name="chevron" :size="14" :color="app.mutColor"></icon>
          </span>
        </div>
        <div v-if="app.histAbierto('gastos', g.cierre.id)">
          <div v-for="g in app.histItemsMostrados(g.items, 'gastos')" :key="g.id" class="item">
            <div class="info">
              <div class="nm">{{ g.categoria }} · {{ g.concepto }}</div>
              <div class="det">{{ app.fmtFH(g.fecha) }}</div>
            </div>
            <b class="neg">-{{ app.fmt(g.monto) }}</b>
          </div>
          <div v-if="app.histHayMas(g.items, 'gastos')" class="hist-mas">
            <button class="link-btn" @click="app.histMostrarMas('gastos')">Mostrar 20 mas</button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { useApp } from '../contexts/appContext.js';

const app = useApp();
</script>
