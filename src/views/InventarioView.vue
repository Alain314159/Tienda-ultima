<template>
  <section v-if="app.sec === 'inventario'" class="fade-up">
    <div class="balance verde">
      <div class="lbl"><icon name="package" :size="14" color="#fff"></icon> Valor del Inventario</div>
      <div class="val">{{ app.fmt(app.valorInventario) }}</div>
      <div class="sub">{{ app.fmtCant(app.unidadesTotal, true) }} unidades · {{ app.lotesActivos.length }} lotes</div>
      <div style="margin-top: 0.75rem; display: flex; gap: 0.4rem; justify-content: center; flex-wrap: wrap">
        <button
          @click="app.shareSheetAbierto = true"
          style="
            background: rgba(255, 255, 255, 0.22);
            border: none;
            color: #fff;
            border-radius: 99px;
            padding: 0.45rem 1rem;
            font-size: 0.72rem;
            font-weight: 800;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 0.35rem;
            letter-spacing: 0.02em;
          "
        >
          <icon name="share" :size="12" color="#fff"></icon> Compartir lista
        </button>
      </div>
    </div>

    <div class="card">
      <div class="card-title">
        <icon name="alert" :size="18" :color="app.sec === 'inventario' ? '#2196F3' : '#d97706'"></icon> Merma / Ajuste
      </div>
      <select v-model="app.ajusteForm.productoId">
        <option value="">Seleccionar producto...</option>
        <option v-for="p in app.prodsActivos" :key="p.id" :value="p.id">
          {{ p.nombre }} (Stock: {{ app.fmtCant(app.productosStore.stock(p.id)) }} {{ p.unidad || '' }})
        </option>
      </select>
      <div class="grid2">
        <input
          v-model="app.ajusteForm.cantidad"
          type="number"
          inputmode="decimal"
          step="0.001"
          placeholder="- merma / + sobrante"
        />
        <select v-model="app.ajusteForm.motivo">
          <option value="">Motivo...</option>
          <option value="merma">Merma / Daño</option>
          <option value="vencimiento">Vencimiento</option>
          <option value="robo">Robo / Pérdida</option>
          <option value="error">Error de registro</option>
          <option value="sobrante">Sobrante en conteo</option>
        </select>
      </div>
      <input
        v-if="app.n(app.ajusteForm.cantidad) > 0"
        v-model="app.ajusteForm.costoSobrante"
        type="number"
        inputmode="decimal"
        step="0.01"
        placeholder="Costo unit. del sobrante"
      />
      <button class="btn warn" @click="app.registrarAjuste()">
        <icon name="package" :size="16" color="#fff"></icon> Registrar Ajuste
      </button>
    </div>

    <div class="card">
      <div class="card-title">
        <icon name="package" :size="18" :color="app.sec === 'inventario' ? '#2196F3' : app.mutColor"></icon> Inventario
        por producto
      </div>
      <div v-if="app.invAgrupado.length === 0" class="empty">Sin inventario</div>
      <div v-for="g in app.invAgrupado" :key="g.id" class="inv-group" :id="'ref-' + g.id">
        <div class="inv-head" @click="app.invExpandido[g.id] = !app.invExpandido[g.id]">
          <div>
            <div class="nm">{{ g.nombre }}</div>
            <div class="det">Stock {{ app.formatStock(g.id, g.stockTotal) }} · {{ app.fmt(g.valorTotal) }}</div>
          </div>
          <icon
            name="chevron"
            :size="18"
            :color="app.mutColor"
            :style="app.invExpandido[g.id] ? 'transform:rotate(180deg)' : ''"
          ></icon>
        </div>
        <div v-if="app.invExpandido[g.id]" class="inv-lotes">
          <div v-for="l in g.lotes" :key="l.id" class="inv-lote">
            <span
              >{{ app.fmtFH(l.fecha) }} · {{ app.fmtCant(app.n(l.cantidadInicial) - app.n(l.cantidadVendida)) }}/{{
                app.fmtCant(l.cantidadInicial)
              }}
              {{ g.unidad || '' }}</span
            >
            <span
              >@{{ app.fmt(l.costo) }} =
              <b>{{ app.fmt((app.n(l.cantidadInicial) - app.n(l.cantidadVendida)) * l.costo) }}</b></span
            >
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">
        <icon name="alert" :size="18" :color="app.sec === 'inventario' ? '#2196F3' : app.mutColor"></icon> Últimos
        ajustes
      </div>
      <div v-if="app.ajustesRecientes.length === 0" class="empty">Sin ajustes</div>
      <div v-for="a in app.ajustesRecientes" :key="a.id" class="item">
        <div class="info">
          <div class="nm">{{ a.productoNombre }}</div>
          <div class="det">{{ app.fmtFH(a.fecha) }} · {{ a.motivo }}</div>
        </div>
        <div class="act-btns">
          <b :class="a.cantidad > 0 ? 'pos' : 'neg'">{{ a.cantidad > 0 ? '+' : '' }}{{ app.fmtCant(a.cantidad) }}</b>
          <b class="neg">-{{ app.fmt(a.costoPerdida) }}</b>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { useApp } from '../contexts/appContext.js';

const app = useApp();
</script>
