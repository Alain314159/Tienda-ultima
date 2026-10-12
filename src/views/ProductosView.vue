<template>
  <section v-if="app.sec === 'productos'" class="fade-up">
    <div class="card">
      <div class="card-title">
        <icon name="tag" :size="18" :color="app.sec === 'productos' ? '#2196F3' : app.mutColor"></icon>
        {{ app.prodForm.editId ? 'Editar' : 'Agregar' }} Producto
      </div>
      <input v-model="app.prodForm.nombre" type="text" placeholder="Nombre del producto" />
      <div class="grid2">
        <input
          v-model="app.prodForm.precio"
          type="number"
          inputmode="decimal"
          step="0.01"
          placeholder="Precio base venta"
        />
        <input v-model="app.prodForm.stockMin" type="number" inputmode="decimal" step="0.1" placeholder="Stock mín." />
      </div>

      <textarea
        v-model="app.prodForm.nota"
        placeholder="Nota interna (opcional)"
        rows="2"
        style="resize: none; font-family: inherit; font-size: 0.85rem"
      ></textarea>

      <button class="btn pri" @click="app.guardarProducto()">
        {{ app.prodForm.editId ? 'Actualizar' : 'Guardar' }}
      </button>
      <button v-if="app.prodForm.editId" class="btn ghost" @click="app.resetProd()">Cancelar</button>
    </div>

    <div class="card">
      <div class="card-title">
        <icon name="tag" :size="18" :color="app.sec === 'productos' ? '#2196F3' : app.mutColor"></icon> Productos
      </div>
      <div class="search">
        <input
          :value="app.busqProd"
          @input="app.setBusq('busqProd', $event.target.value)"
          type="text"
          placeholder="Buscar..."
        />
      </div>
      <div style="text-align: right; margin-bottom: 0.4rem">
        <button
          class="btn ghost"
          style="width: auto; display: inline-block; padding: 0.3rem 0.7rem; font-size: 0.72rem"
          @click="app.mostrarArchivados = !app.mostrarArchivados"
        >
          {{ app.mostrarArchivados ? 'Ocultar archivados' : 'Ver archivados' }}
        </button>
      </div>
      <div
        v-if="app.filtroStock"
        class="info-box"
        style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem"
      >
        <span
          >Filtro: <b>{{ app.filtroStock === 'agotados' ? 'Agotados' : 'Stock bajo' }}</b></span
        >
        <button class="link-btn" @click="app.limpiarFiltroStock">Quitar filtro</button>
      </div>
      <div v-if="app.prodsFiltrados.length === 0" class="empty">Sin productos</div>
      <div
        v-for="p in app.prodsFiltrados"
        :key="p.id"
        v-memo="[
          p.id,
          p.nombre,
          p.precio,
          p.archivado,
          app.stockMap[p.id],
          app.badgeMap[p.id],
          app.prodExpandido[p.id],
        ]"
        class="prod-wrap"
        :id="'ref-' + p.id"
        :class="'prod-' + (app.badgeMap[p.id] || 'ok')"
      >
        <div
          class="item"
          :style="p.archivado ? 'opacity:.5' : ''"
          style="cursor: pointer"
          @click="app.prodExpandido[p.id] = !app.prodExpandido[p.id]"
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
              <span class="badge" :class="app.badgeStock(p)">{{ app.txtBadge(p) }}</span>
              <span class="stock-num">Stock: {{ app.formatStock(p.id, app.stock(p.id)) }}</span>
              <span style="color: var(--mut); font-size: 0.72rem">{{ app.fmt(p.precio) }}</span>
              <span v-if="app.lotesDeProducto(p.id).length" class="chev" :class="{ open: app.prodExpandido[p.id] }">
                <icon name="chevron" :size="14" :color="app.mutColor"></icon>
              </span>
            </div>
          </div>
          <div class="act-btns" @click.stop>
            <button class="icon-btn" @click="app.editarProducto(p.id)" aria-label="Editar">
              <icon name="edit" :size="15" :color="app.txtColor"></icon>
            </button>
            <button v-if="!p.archivado" class="icon-btn bad" @click="app.archivarProducto(p.id)" aria-label="Archivar">
              <icon name="trash" :size="15" color="#dc2626"></icon>
            </button>
            <button v-else class="icon-btn ok" @click="app.restaurarProducto(p.id)" aria-label="Restaurar">
              <icon name="refresh" :size="15" color="#16a34a"></icon>
            </button>
          </div>
        </div>
        <div v-if="app.prodExpandido[p.id]" class="prod-lotes">
          <div v-if="app.lotesDeProducto(p.id).length === 0" class="empty" style="padding: 0.6rem; font-size: 0.78rem">
            Sin lotes activos (stock 0)
          </div>
          <div v-for="l in app.lotesDeProducto(p.id)" :key="l.id" class="inv-lote">
            <span
              >{{ app.fmtFH(l.fecha) }} · Quedan
              {{ app.fmtCant(app.n(l.cantidadInicial) - app.n(l.cantidadVendida)) }}/{{
                app.fmtCant(l.cantidadInicial)
              }}
              {{ p.unidad || '' }}</span
            >
            <span
              >@{{ app.fmt(l.costo) }} =
              <b>{{ app.fmt((app.n(l.cantidadInicial) - app.n(l.cantidadVendida)) * l.costo) }}</b></span
            >
          </div>
          <div
            v-if="app.lotesDeProducto(p.id).length"
            class="det"
            style="font-size: 0.7rem; color: var(--mut); margin-top: 0.3rem; text-align: right"
          >
            Valor total: <b class="pos">{{ app.fmt(app.valorLotesProducto(p.id)) }}</b>
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
