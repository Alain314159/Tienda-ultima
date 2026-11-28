<template>
  <section v-if="sec === 'inventario'" class="fade-up">
    <div class="balance verde">
      <div class="lbl"><icon name="package" :size="14" color="#fff"></icon> Valor del Inventario</div>
      <div class="val">{{ fmt(valorInventario) }}</div>
      <div class="sub">{{ fmtCant(unidadesTotal) }} unidades · {{ lotesActivos.length }} lotes</div>
      <div style="margin-top: 0.75rem; display: flex; gap: 0.4rem; justify-content: center; flex-wrap: wrap">
        <button
          @click="ui.shareSheetAbierto = true"
          style="
            background: rgb(255 255 255 / 22%);
            border: none;
            color: #fff;
            border-radius: 99px;
            min-height: 2.75rem;
            padding: 0.65rem 1.1rem;
            font-size: 0.78rem;
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
      <h2 class="card-title">
        <icon name="alert" :size="18" :color="sec === 'inventario' ? '#2196F3' : '#d97706'"></icon> Merma / Ajuste
      </h2>
      <label class="fld-label" for="ajuste-producto">Producto</label>
      <select id="ajuste-producto" v-model="ajusteForm.productoId">
        <option value="">Seleccionar producto...</option>
        <option v-for="p in prodsActivos" :key="p.id" :value="p.id">
          {{ p.nombre }} (Stock: {{ fmtCant(productosStore.stock(p.id)) }} {{ p.unidad || '' }})
        </option>
      </select>
      <div class="grid2">
        <div>
          <label class="fld-label" for="ajuste-cantidad">Cantidad (− merma / + sobrante)</label>
          <input
            id="ajuste-cantidad"
            v-model="ajusteForm.cantidad"
            type="number"
            inputmode="decimal"
            step="0.001"
            placeholder="- merma / + sobrante"
          />
        </div>
        <div>
          <label class="fld-label" for="ajuste-motivo">Motivo</label>
          <select id="ajuste-motivo" v-model="ajusteForm.motivo">
            <option value="">Motivo...</option>
            <option value="merma">Merma / Daño</option>
            <option value="vencimiento">Vencimiento</option>
            <option value="robo">Robo / Pérdida</option>
            <option value="error">Error de registro</option>
            <option value="sobrante">Sobrante en conteo</option>
          </select>
        </div>
      </div>
      <label v-if="n(ajusteForm.cantidad) > 0" class="fld-label" for="ajuste-costo">Costo unitario del sobrante</label>
      <input
        v-if="n(ajusteForm.cantidad) > 0"
        id="ajuste-costo"
        v-model="ajusteForm.costoSobrante"
        type="number"
        inputmode="decimal"
        step="0.01"
        placeholder="Costo unit. del sobrante"
      />
      <button class="btn warn" @click="registrarAjuste()" :disabled="guardandoAjuste">
        <icon name="package" :size="16" color="#fff"></icon>
        {{ guardandoAjuste ? 'Registrando…' : 'Registrar Ajuste' }}
      </button>
    </div>

    <div class="card">
      <h2 class="card-title">
        <icon name="package" :size="18" :color="sec === 'inventario' ? '#2196F3' : mutColor"></icon> Inventario por
        producto
      </h2>
      <div v-if="invAgrupado.length === 0" class="empty">Sin inventario</div>
      <div v-for="g in invAgrupado" :key="g.id" class="inv-group" :id="'ref-' + g.id">
        <div class="inv-head" @click="invExpandido[g.id] = !invExpandido[g.id]">
          <div>
            <div class="nm">{{ g.nombre }}</div>
            <div class="det">Stock {{ formatStock(g.id, g.stockTotal) }} · {{ fmt(g.valorTotal) }}</div>
          </div>
          <icon
            name="chevron"
            :size="18"
            :color="mutColor"
            :style="invExpandido[g.id] ? 'transform:rotate(180deg)' : ''"
          ></icon>
        </div>
        <div v-if="invExpandido[g.id]" class="inv-lotes">
          <div v-for="l in g.lotes" :key="l.id" class="inv-lote">
            <span
              >{{ fmtFH(l.fecha) }} · {{ fmtCant(n(l.cantidadInicial) - n(l.cantidadVendida)) }}/{{
                fmtCant(l.cantidadInicial)
              }}
              {{ g.unidad || '' }}</span
            >
            <span
              >@{{ fmt(l.costo) }} = <b>{{ fmt((n(l.cantidadInicial) - n(l.cantidadVendida)) * l.costo) }}</b></span
            >
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <h2 class="card-title">
        <icon name="alert" :size="18" :color="sec === 'inventario' ? '#2196F3' : mutColor"></icon> Últimos ajustes
      </h2>
      <div v-if="ajustesRecientes.length === 0" class="empty">Sin ajustes</div>
      <div v-for="a in ajustesRecientes" :key="a.id" class="item">
        <div class="info">
          <div class="nm">{{ a.productoNombre }}</div>
          <div class="det">{{ fmtFH(a.fecha) }} · {{ a.motivo }}</div>
        </div>
        <div class="act-btns">
          <b :class="a.cantidad > 0 ? 'pos' : 'neg'">{{ a.cantidad > 0 ? '+' : '' }}{{ fmtCant(a.cantidad) }}</b>
          <b class="neg">-{{ fmt(a.costoPerdida) }}</b>
        </div>
      </div>
    </div>

    <!-- SHARE SHEET -->
    <div v-if="ui.shareSheetAbierto" class="overlay no-print" @click="ui.shareSheetAbierto = false"></div>
    <div v-if="ui.shareSheetAbierto" class="sheet no-print">
      <div class="handle"></div>
      <div class="sheet-group" style="margin-top: 0">Compartir lista</div>
      <div class="sheet-grid" style="grid-template-columns: 1fr 1fr 1fr">
        <button
          class="sheet-btn"
          style="flex-direction: column; text-align: center; gap: 0.3rem"
          @click="
            ui.shareSheetAbierto = false;
            compartirPrecios();
          "
        >
          <icon name="tag" :size="22"></icon>
          <span style="font-size: 0.72rem">Precios</span>
        </button>
        <button
          class="sheet-btn"
          style="flex-direction: column; text-align: center; gap: 0.3rem"
          @click="
            ui.shareSheetAbierto = false;
            copiarPrecios();
          "
        >
          <icon name="file" :size="22"></icon>
          <span style="font-size: 0.72rem">Copiar</span>
        </button>
        <button
          class="sheet-btn"
          style="flex-direction: column; text-align: center; gap: 0.3rem"
          @click="
            ui.shareSheetAbierto = false;
            compartirExistencia();
          "
        >
          <icon name="package" :size="22"></icon>
          <span style="font-size: 0.72rem">Existencia</span>
        </button>
      </div>
      <div
        style="
          font-size: 0.72rem;
          color: var(--mut);
          text-align: center;
          margin-top: 0.85rem;
          line-height: 1.6;
          padding: 0 0.5rem;
        "
      >
        <b>Precios:</b> lista con nombres y precios<br />
        <b>Copiar:</b> lo mismo al portapapeles sin salir de la app<br />
        <b>Existencia:</b> solo nombres y stock actual
      </div>
      <button class="btn ghost" style="margin-top: 0.85rem" @click="ui.shareSheetAbierto = false">Cerrar</button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { n, m } from '../utils/numero';
import { fmt, fmtCant, fmtFH } from '../utils/formato';
import { P, genId } from '../utils/id';
import { db } from '../db';
import { aplicarLotesEnBD } from '../services/fifo';
import { useProductosStore } from '../stores/useProductosStore';
import { useLotesStore } from '../stores/useLotesStore';
import { useAjustesStore } from '../stores/useAjustesStore';
import { useConfigStore } from '../stores/useConfigStore';
import { useUIStore } from '../stores/useUIStore';
import { useCompartir } from '../composables/useCompartir';
import { recargarStores } from '../stores/recarga';
import { TOAST } from '../constants';
import { toastMsg } from '../utils/toast';

const configStore = useConfigStore();
const ui = useUIStore();
const productosStore = useProductosStore();
const lotesStore = useLotesStore();
const ajustesStore = useAjustesStore();

const sec = 'inventario';
// Carga perezosa (4.8): estas tablas ya vienen del arranque, así que esto
// es un no-op; existe para que la vista no dependa del orden de carga.
onMounted(() => {
  void Promise.all([
    productosStore.asegurarProductos(),
    lotesStore.asegurarLotes(),
    ajustesStore.asegurarAjustes(),
  ]);
});
const mutColor = computed(() => (configStore.tema === 'dark' ? '#94a3b8' : '#6b7280'));

// ===== CATÁLOGO =====
const prodsActivos = computed(() => productosStore.prodsActivos);
const { formatStock } = productosStore;

// ===== RESUMEN =====
const valorInventario = computed(() => lotesStore.valorInventario);
const lotesActivos = computed(() => lotesStore.lotesActivos);
const unidadesTotal = computed(() => {
  let u = 0;
  for (const l of lotesStore.lotes) u += n(l.cantidadInicial) - n(l.cantidadVendida);
  return m(u);
});

// ===== COMPARTIR =====
const { compartirExistencia, compartirPrecios, copiarPrecios } = useCompartir();

// ===== MERMA / AJUSTE =====
const ajusteForm = ref({ productoId: '', cantidad: '', motivo: '', costoSobrante: '' });
const guardandoAjuste = ref(false);

const MOTIVOS_AJUSTE: Record<string, string> = {
  merma: 'Merma / Daño',
  vencimiento: 'Vencimiento',
  robo: 'Robo / Pérdida',
  error: 'Error de registro',
  sobrante: 'Sobrante en conteo',
};

/**
 * Registra el ajuste PREVIA confirmación (MEJORAS 2.4): muestra cantidad,
 * motivo y qué lotes se consumen antes de escribir en BD, porque una
 * cantidad o motivo equivocado borra stock y valor real sin barrera.
 */
async function registrarAjuste() {
  const f = ajusteForm.value;
  const cant = n(f.cantidad);
  if (!f.productoId) return toastMsg('Selecciona producto', TOAST.BAD);
  // isFinite: "1e999" creaba un lote con cantidadInicial = ∞ crudo → stock
  // infinito vendible (merma negativa ya estaba protegida por el clamp)
  if (!isFinite(cant) || cant === 0) return toastMsg('Cantidad no puede ser 0 (ni infinita)', TOAST.BAD);
  if (!f.motivo) return toastMsg('Selecciona motivo', TOAST.BAD);
  const prod = productosStore.productos.find((p) => p.id === f.productoId);
  if (cant < 0 && Math.abs(cant) > productosStore.stock(f.productoId))
    return toastMsg(
      'Solo quedan ' + fmtCant(productosStore.stock(f.productoId)) + ' unidades en stock de este producto',
      TOAST.BAD
    );

  const motivoTxt = MOTIVOS_AJUSTE[f.motivo] || f.motivo;
  let detalle = '';
  if (cant < 0) {
    // Vista previa FIFO: qué lotes se consumen (se recalcula dentro de la
    // transacción; aquí solo es para mostrarlo antes de confirmar).
    const res = lotesStore.calcFIFO(f.productoId, Math.abs(cant));
    if (res.error) return toastMsg(res.error, TOAST.BAD);
    const lineas = res.lotesUsados.map((u) => {
      const lote = lotesStore.lotes.find((l) => l.id === u.loteId);
      return (
        '• Lote del ' +
        fmtFH(lote?.fecha || '') +
        ': ' +
        fmtCant(u.cantidad) +
        ' und @ ' +
        fmt(u.costo) +
        ' = ' +
        fmt(m(u.cantidad * u.costo))
      );
    });
    detalle =
      'Se descontarán ' +
      fmtCant(Math.abs(cant)) +
      ' und de "' +
      (prod?.nombre || '') +
      '" (' +
      motivoTxt +
      '), con una pérdida de ' +
      fmt(res.costoTotal) +
      '.\n\nLotes que se consumen (FIFO):\n' +
      lineas.join('\n');
  } else {
    const cs = n(f.costoSobrante);
    if (!isFinite(cs) || cs < 0) return toastMsg('Costo inválido', TOAST.BAD);
    detalle =
      'Se agregarán ' +
      fmtCant(cant) +
      ' und de "' +
      (prod?.nombre || '') +
      '" (' +
      motivoTxt +
      ') como sobrante, con costo unitario ' +
      fmt(cs) +
      ' (se crea un lote nuevo).';
  }

  ui.confirmar({
    titulo: 'Confirmar ajuste de inventario',
    msg: detalle + '\n\n¿Registrar este ajuste?',
    onOk: () => void ejecutarAjuste(),
  });
}

async function ejecutarAjuste() {
  if (guardandoAjuste.value) return;
  guardandoAjuste.value = true;
  try {
    await registrarAjusteEnBD();
    ajusteForm.value = { productoId: '', cantidad: '', motivo: '', costoSobrante: '' };
  } catch (e) {
    toastMsg(e instanceof Error ? e.message : String(e), TOAST.BAD);
  } finally {
    guardandoAjuste.value = false;
  }
}

async function registrarAjusteEnBD() {
  const f = ajusteForm.value;
  const cant = n(f.cantidad);
  const prod = productosStore.productos.find((p) => p.id === f.productoId);
  if (cant < 0) {
    // Recalcular FIFO aquí (el stock pudo cambiar mientras el usuario
    // leía la confirmación); la transacción valida la sobreventa.
    const res = lotesStore.calcFIFO(f.productoId, Math.abs(cant));
    if (res.error) throw new Error(res.error);
    const aj = {
      id: genId('a'),
      fecha: new Date().toISOString(),
      productoId: f.productoId,
      productoNombre: prod?.nombre || '',
      cantidad: cant,
      motivo: f.motivo,
      costoPerdida: res.costoTotal,
      lotesUsados: res.lotesUsados,
    };
    await db
      .transaction('rw', db.ajustes, db.lotes, async () => {
        await P(db.ajustes, aj);
        // Consumo con lectura FRESCA de la BD + validación de sobreventa
        // (antes: lote reactivo obsoleto → bulkPut pisaba ventas de otra
        // pestaña; una venta entre el check y la transacción pasaba de largo)
        await aplicarLotesEnBD(res.lotesUsados, 1);
      })
      .catch(async (e) => {
        // La BD revirtió: resincronizar por si el store quedó desfasado
        await recargarStores('lotes').catch(() => {});
        throw e;
      });
    await recargarStores('ajustes', 'lotes', 'asientos');
    toastMsg('Merma registrada · pérdida ' + fmt(res.costoTotal));
  } else {
    const cs = n(f.costoSobrante);
    if (!isFinite(cs) || cs < 0) throw new Error('Costo inválido: debe ser 0 o mayor');
    const aj = {
      id: genId('a'),
      fecha: new Date().toISOString(),
      productoId: f.productoId,
      productoNombre: prod?.nombre || '',
      cantidad: cant,
      motivo: f.motivo,
      costoPerdida: 0,
    };
    const lote = {
      id: genId('l'),
      compraId: 'aj-' + aj.id,
      productoId: f.productoId,
      productoNombre: prod?.nombre || '',
      productoUnidad: prod?.unidad || '',
      cantidadInicial: cant,
      cantidadVendida: 0,
      costo: cs,
      fecha: aj.fecha,
    };
    await db.transaction('rw', db.ajustes, db.lotes, async () => {
      await P(db.ajustes, aj);
      await P(db.lotes, lote);
    });
    await recargarStores('ajustes', 'lotes', 'asientos');
    toastMsg('Sobrante registrado');
  }
}

// ===== INVENTARIO AGRUPADO =====
const invExpandido = ref<Record<string, boolean>>({});
const invAgrupado = computed(() => {
  return (
    productosStore.prodsActivos
      .map((p) => {
        const lts = lotesStore.lotesDeProducto(p.id);
        return {
          id: p.id,
          nombre: p.nombre,
          unidad: p.unidad,
          stockTotal: productosStore.stock(p.id),
          valorTotal: lotesStore.valorLotesProducto ? lotesStore.valorLotesProducto(p.id) : 0,
          lotes: lts,
        };
      })
      .filter((g) => g.stockTotal > 0 || g.lotes.length > 0)
      // (nombre || ''): producto inyectado sin nombre mataba el sort (y con el
      // errorHandler global de main.ts, pantalla en blanco SILENCIOSA)
      .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''))
  );
});

const ajustesRecientes = computed(() => ajustesStore.ajustesRecientes);
</script>
