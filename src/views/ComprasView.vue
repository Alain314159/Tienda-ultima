<template>
  <section v-if="app.sec === 'compras'" class="fade-up">
    <div class="card">
      <div class="card-title">
        <icon name="bag" :size="18" :color="app.sec === 'compras' ? '#2196F3' : app.mutColor"></icon> Registrar Compra
      </div>
      <div v-if="!app.compraForm.productoId">
        <div class="search">
          <input
            :value="app.busqCompra"
            @input="app.setBusq('busqCompra', $event.target.value)"
            type="text"
            placeholder="Buscar producto..."
            autocomplete="off"
            @focus="app.focusCompra = true"
            @click="app.focusCompra = true"
          />
        </div>
        <div v-if="app.focusCompra" class="drop-static">
          <div class="drop-head">
            <span>{{ app.listaCompra.length }} resultado(s)</span>
            <button
              @click="
                app.focusCompra = false;
                app.busqCompra = '';
              "
              aria-label="Cerrar"
            >
              ×
            </button>
          </div>
          <div v-if="app.listaCompra.length === 0" class="empty">Sin coincidencias</div>
          <div v-for="p in app.listaCompra" :key="p.id" class="drop-item" @click="app.selCompra(p)">
            <span>{{ p.nombre }}</span>
            <span style="color: var(--mut)">Stock {{ app.fmtCant(app.stock(p.id)) }} {{ p.unidad || '' }}</span>
          </div>
        </div>
      </div>
      <div v-if="app.compraForm.productoId">
        <div class="row" style="border: none; padding: 0.2rem 0">
          <span>Producto</span><b>{{ app.compraForm.nombre }}</b>
        </div>

        <div v-if="app.empaquesCompraActual.length" style="margin-bottom: 0.55rem">
          <label style="font-size: 0.75rem; color: var(--mut); font-weight: 700; display: block; margin-bottom: 0.3rem"
            >Empaque</label
          >
          <select v-model="app.compraForm.empaqueSel">
            <option value="">Por unidad (sin empaque)</option>
            <option v-for="e in app.empaquesCompraActual" :key="e.nombre" :value="e.nombre">
              {{ e.nombre }} ({{ e.unidades }} und)
            </option>
          </select>
        </div>

        <div class="grid2">
          <input
            v-model="app.compraForm.cantidad"
            type="number"
            inputmode="decimal"
            step="0.001"
            :placeholder="app.compraForm.empaqueSel ? 'Cant. empaques' : 'Cantidad'"
          />
          <input
            v-model="app.compraForm.costo"
            type="number"
            inputmode="decimal"
            step="0.01"
            :placeholder="app.compraForm.costoPorEmpaque ? 'Costo por empaque' : 'Costo por unidad'"
          />
        </div>

        <div v-if="app.compraForm.empaqueSel" class="set-row" style="margin-bottom: 0.4rem">
          <span class="lbl" style="font-size: 0.78rem">El costo ingresado es por empaque completo</span>
          <label class="switch">
            <input type="checkbox" v-model="app.compraForm.costoPorEmpaque" />
            <span class="slider"></span>
          </label>
        </div>

        <div v-if="app.n(app.compraForm.cantidad) > 0 && app.n(app.compraForm.costo) >= 0" class="compra-resumen">
          <div v-if="app.compraForm.empaqueSel" class="row" style="border: none; padding: 0.2rem 0">
            <span
              >{{ app.compraForm.cantidad }} {{ app.compraForm.empaqueSel
              }}{{ app.n(app.compraForm.cantidad) > 1 ? 's' : '' }}</span
            >
            <b>= {{ app.fmtCant(app.compraCantidadFinal()) }} und</b>
          </div>
          <div class="row" style="border: none; padding: 0.2rem 0">
            <span>Costo por unidad base</span>
            <b>{{ app.fmt(app.compraCostoUnitarioFinal()) }}</b>
          </div>
          <div class="row total" style="border: none; padding: 0.3rem 0">
            <span>TOTAL</span>
            <b>{{ app.fmt(app.m(app.compraCantidadFinal() * app.compraCostoUnitarioFinal())) }}</b>
          </div>
        </div>
        <button class="btn pri" @click="app.guardarCompra()">
          <icon name="bag" :size="16" color="#fff"></icon>
          {{ app.compraForm.editId ? 'Actualizar' : 'Registrar Compra' }}
        </button>
        <button class="btn ghost" @click="app.resetCompra()">Cancelar</button>
      </div>
    </div>

    <div class="card">
      <div class="card-title">
        <icon name="list" :size="18" :color="app.sec === 'compras' ? '#2196F3' : app.mutColor"></icon> Historial de
        Compras
      </div>
      <div v-if="app.comprasOrdenadas.length === 0" class="empty">Sin compras</div>

      <div v-if="app.comprasPorPeriodo.actual.length" class="hist-grupo">
        <div class="hist-head">
          <span class="badge ok">ACTUAL</span>
          <span class="hist-titulo">Periodo actual</span>
          <span class="hist-count">{{ app.comprasPorPeriodo.actual.length }}</span>
        </div>
        <div v-for="c in app.histComprasMostrados" :key="c.id" class="item" :id="'ref-' + c.id">
          <div class="info">
            <div class="nm"><icon name="bag" :size="14"></icon> {{ c.productoNombre }}</div>
            <div class="det">{{ app.fmtFH(c.fecha) }} · {{ app.fmtCant(c.cantidad) }} × {{ app.fmt(c.costo) }}</div>
          </div>
          <div class="act-btns">
            <b class="neg">{{ app.fmt(c.total) }}</b>
            <template v-if="app.loteSinVentas(c.id)">
              <button class="icon-btn" @click="app.editarCompra(c.id)" aria-label="Editar">
                <icon name="edit" :size="15" :color="app.txtColor"></icon>
              </button>
              <button class="icon-btn bad" @click="app.eliminarCompra(c.id)" aria-label="Eliminar">
                <icon name="trash" :size="15" color="#dc2626"></icon>
              </button>
            </template>
            <span v-else class="lock"><icon name="lock" :size="15" :color="app.mutColor"></icon></span>
          </div>
        </div>
        <div v-if="app.histComprasHayMas" class="hist-mas">
          <button class="link-btn" @click="app.histMostrarMas('compras')">
            Mostrar 20 mas ({{ app.histComprasRestantes }} restantes)
          </button>
        </div>
      </div>

      <div v-for="g in app.comprasPorPeriodo.cerrados" :key="g.cierre.id" class="hist-grupo hist-cerrado">
        <div class="hist-head hist-head-click" @click="app.histToggle('compras', g.cierre.id)">
          <span class="badge arch">CERRADO</span>
          <span class="hist-titulo">{{ g.cierre.periodo }}</span>
          <span class="hist-count">{{ g.items.length }}</span>
          <span class="chev" :class="{ open: app.histAbierto('compras', g.cierre.id) }">
            <icon name="chevron" :size="14" :color="app.mutColor"></icon>
          </span>
        </div>
        <div v-if="app.histAbierto('compras', g.cierre.id)">
          <div v-for="c in app.histItemsMostrados(g.items, 'compras')" :key="c.id" class="item">
            <div class="info">
              <div class="nm"><icon name="bag" :size="14"></icon> {{ c.productoNombre }}</div>
              <div class="det">{{ app.fmtFH(c.fecha) }} · {{ app.fmtCant(c.cantidad) }} × {{ app.fmt(c.costo) }}</div>
            </div>
            <b class="neg">{{ app.fmt(c.total) }}</b>
          </div>
          <div v-if="app.histHayMas(g.items, 'compras')" class="hist-mas">
            <button class="link-btn" @click="app.histMostrarMas('compras')">
              Mostrar {{ Math.min(20, app.histComprasRestantes) }} mas
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script>
import { useApp } from '../contexts/appContext.js';

export default {
  name: 'ComprasView',
  setup() {
    const app = useApp();
    return { app };
  },
};
</script>
