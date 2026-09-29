<template>
  <section v-if="activo" class="fade-up">
    <div class="balance rojo">
      <div class="lbl"><icon name="cart" :size="14" color="#fff"></icon> Fiados pendientes</div>
      <div class="val">{{ fmt(totalPendiente) }}</div>
      <div class="sub">
        {{ pendientes.length }} fiado(s) · Ganancia pendiente: {{ fmt(gananciaPendiente) }}
      </div>
    </div>

    <!-- Tabs -->
    <div class="card">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:.3rem;margin-bottom:.7rem">
        <button class="btn" :class="tab === 'pendiente' ? 'pri' : 'ghost'" style="margin:0;font-size:.72rem;padding:.5rem" @click="tab = 'pendiente'">Pendientes</button>
        <button class="btn" :class="tab === 'saldado' ? 'pri' : 'ghost'" style="margin:0;font-size:.72rem;padding:.5rem" @click="tab = 'saldado'">Saldados</button>
        <button class="btn" :class="tab === 'condonado' ? 'pri' : 'ghost'" style="margin:0;font-size:.72rem;padding:.5rem" @click="tab = 'condonado'">Condonados</button>
      </div>

      <button class="btn ok" style="width:100%" @click="abrirFormNuevo">
        <icon name="plus" :size="16" color="#fff"></icon> Nuevo fiado
      </button>
    </div>

    <!-- Lista -->
    <div class="card">
      <div class="card-title">
        <icon name="list" :size="18" :color="secActiva ? '#2196F3' : mutColor"></icon>
        Fiados {{ tab === 'pendiente' ? 'pendientes' : tab === 'saldado' ? 'saldados' : 'condonados' }}
        <span style="margin-left:auto;font-size:.75rem;color:var(--mut)">{{ filtrados.length }}</span>
      </div>

      <div v-if="filtrados.length === 0" class="empty">
        No hay fiados {{ tab }}
      </div>

      <div v-for="f in filtrados" :key="f.id" class="item" style="flex-direction:column;align-items:stretch;gap:.4rem">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:.5rem">
          <div style="flex:1;min-width:0">
            <div class="nm" style="display:flex;align-items:center;gap:.4rem">
              <span style="width:32px;height:32px;border-radius:50%;background:var(--bad);color:#fff;display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:.85rem;flex-shrink:0">{{ inicial(f.clienteNombre) }}</span>
              {{ f.clienteNombre }}
            </div>
            <div class="det" style="font-size:.72rem;margin-top:.2rem">
              {{ f.items.length }} producto(s) · {{ fmtFecha(f.fecha) }}
            </div>
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div :class="saldo(f) > 0 ? 'neg' : 'pos'" style="font-weight:800;font-size:1rem">{{ fmt(saldo(f)) }}</div>
            <div style="font-size:.65rem;color:var(--mut)">de {{ fmt(f.totalFiado) }}</div>
          </div>
        </div>

        <!-- Barra progreso -->
        <div style="width:100%;height:6px;background:var(--bg);border-radius:3px;overflow:hidden">
          <div :style="{ width: porcentajePagado(f) + '%', height: '100%', background: 'var(--pri)', transition: 'width .3s' }"></div>
        </div>

        <div v-if="tab === 'pendiente'" style="display:flex;gap:.3rem;flex-wrap:wrap">
          <button class="btn pri" style="flex:1;margin:0;font-size:.72rem;padding:.45rem" @click="abrirPago(f)">
            <icon name="check" :size="12" color="#fff"></icon> Cobrar
          </button>
          <button class="icon-btn" @click="detalle = f" aria-label="Detalle">
            <icon name="list" :size="14" :color="txtColor"></icon>
          </button>
          <button class="icon-btn bad" @click="condonar(f)" aria-label="Condonar">
            <icon name="trash" :size="14" color="#dc2626"></icon>
          </button>
        </div>
        <div v-else style="display:flex;gap:.3rem">
          <button class="btn ghost" style="flex:1;margin:0;font-size:.72rem;padding:.45rem" @click="detalle = f">
            Ver historial
          </button>
        </div>
      </div>
    </div>

    <!-- Modal nuevo fiado -->
    <div v-if="formAbierto" class="modal no-print" @click.self="cerrarForm">
      <div class="modal-box" style="max-width:520px;max-height:85vh;overflow-y:auto">
        <div class="modal-title"><icon name="cart" :size="20"></icon> Nuevo fiado</div>

        <div style="font-size:.78rem;color:var(--mut);margin-bottom:.4rem">Cliente *</div>
        <select v-model="form.clienteId" style="font-size:.9rem">
          <option value="">Seleccionar...</option>
          <option v-for="c in clientes" :key="c.id" :value="c.id">{{ c.nombre }}</option>
        </select>
        <div v-if="clientes.length === 0" class="info-box" style="font-size:.75rem;background:rgba(245,158,11,.1);border-color:var(--warn)">
          No hay clientes. Creá uno en Personas.
        </div>

        <div style="font-size:.78rem;color:var(--mut);margin:.7rem 0 .4rem">Productos fiados</div>

        <div style="display:flex;gap:.3rem;margin-bottom:.5rem">
          <select v-model="productoSeleccionado" style="flex:1;font-size:.85rem">
            <option value="">+ Agregar producto...</option>
            <option v-for="p in productosActivos" :key="p.id" :value="p.id">
              {{ p.nombre }} (Stock: {{ formatStock(p.id) }})
            </option>
          </select>
          <button class="btn pri" style="width:auto;margin:0;padding:.5rem .8rem" @click="agregarProducto" :disabled="!productoSeleccionado">
            +
          </button>
        </div>

        <div v-if="form.items.length === 0" class="empty" style="padding:.8rem;font-size:.78rem">
          Sin productos. Agregá uno arriba.
        </div>

        <div v-for="(it, i) in form.items" :key="i"
          style="display:grid;grid-template-columns:1fr auto auto auto;gap:.3rem;align-items:center;padding:.4rem 0;border-bottom:1px solid var(--brd)">
          <div style="font-size:.78rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ it.nombre }}</div>
          <input v-model="it.cant" type="number" inputmode="decimal" step="0.01" style="width:60px;margin:0;padding:.3rem;font-size:.78rem;text-align:center">
          <input v-model="it.precio" type="number" inputmode="decimal" step="0.01" style="width:75px;margin:0;padding:.3rem;font-size:.78rem;text-align:center">
          <button class="icon-btn bad" @click="form.items.splice(i, 1)" style="width:auto;padding:.3rem">
            <icon name="x" :size="12" color="#dc2626"></icon>
          </button>
        </div>

        <div v-if="form.items.length > 0" class="info-box" style="margin-top:.5rem;font-size:.8rem">
          <div style="display:flex;justify-content:space-between">
            <span>Total a fiar:</span>
            <b>{{ fmt(totalForm) }}</b>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:.75rem;color:var(--mut);margin-top:.2rem">
            <span>Ganancia estimada:</span>
            <span>{{ fmt(gananciaEstimada) }}</span>
          </div>
        </div>

        <div v-if="errorForm" class="info-box" style="margin-top:.5rem;background:rgba(239,68,68,.1);border-color:var(--bad);font-size:.75rem;color:var(--bad)">
          {{ errorForm }}
        </div>

        <div class="grid2" style="margin-top:.7rem">
          <button class="btn ok" @click="guardarFiado" :disabled="!puedoGuardar">
            Confirmar fiado
          </button>
          <button class="btn ghost" @click="cerrarForm">Cancelar</button>
        </div>
      </div>
    </div>

    <!-- Modal cobro -->
    <div v-if="pagoAbierto" class="modal no-print" @click.self="pagoAbierto = null">
      <div class="modal-box" style="max-height:85vh;overflow-y:auto">
        <div class="modal-title"><icon name="check" :size="20"></icon> Cobrar fiado</div>

        <div class="info-box" style="margin-bottom:.6rem">
          <div style="display:flex;justify-content:space-between;font-size:.85rem">
            <span>{{ pagoAbierto.clienteNombre }}</span>
            <b class="neg">Saldo: {{ fmt(saldo(pagoAbierto)) }}</b>
          </div>
        </div>

        <!-- Modo de cobro -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:.3rem;margin-bottom:.6rem">
          <button class="btn" :class="modoCobro === 'total' ? 'pri' : 'ghost'" style="margin:0;font-size:.75rem" @click="modoCobro = 'total'">
            <icon name="dollar" :size="14" :color="modoCobro === 'total' ? '#fff' : mutColor"></icon> Por monto
          </button>
          <button class="btn" :class="modoCobro === 'producto' ? 'pri' : 'ghost'" style="margin:0;font-size:.75rem" @click="modoCobro = 'producto'">
            <icon name="package" :size="14" :color="modoCobro === 'producto' ? '#fff' : mutColor"></icon> Por producto
          </button>
        </div>

        <!-- Modo total -->
        <template v-if="modoCobro === 'total'">
          <div style="font-size:.78rem;color:var(--mut);margin-bottom:.4rem">Monto cobrado</div>
          <input v-model="pagoMonto" type="number" inputmode="decimal" step="0.01" placeholder="0.00">
          <div style="font-size:.7rem;color:var(--mut);margin-top:.3rem">
            Máximo: {{ fmt(saldo(pagoAbierto)) }}
          </div>
        </template>

        <!-- Modo producto -->
        <template v-else>
          <div style="font-size:.78rem;color:var(--mut);margin-bottom:.4rem">Marcá los productos que se pagan</div>
          <div v-for="(it, i) in pagoAbierto.items" :key="i"
            style="display:flex;justify-content:space-between;align-items:center;padding:.5rem 0;border-bottom:1px solid var(--brd);font-size:.78rem">
            <div style="flex:1">
              <div>{{ it.nombre }}</div>
              <div style="font-size:.68rem;color:var(--mut)">
                {{ it.cantidad }} × {{ fmt(it.precio) }} = {{ fmt(it.cantidad * it.precio) }}
                <span v-if="it.pagado" style="color:var(--ok)"> · pagado</span>
              </div>
            </div>
            <input type="checkbox" :checked="it.pagado" @change="toggleProductoPagado(i)" style="width:auto;margin:0">
          </div>
          <div v-if="itemsSeleccionados.length > 0" class="info-box" style="margin-top:.5rem">
            <div style="display:flex;justify-content:space-between">
              <span>Total a cobrar:</span>
              <b>{{ fmt(montoItemsSeleccionados) }}</b>
            </div>
          </div>
        </template>

        <div style="font-size:.78rem;color:var(--mut);margin:.5rem 0 .4rem">Nota (opcional)</div>
        <input v-model="pagoNota" type="text" placeholder="Ej: pago parcial" maxlength="60">

        <div class="grid2" style="margin-top:.7rem">
          <button class="btn ok" @click="guardarCobro" :disabled="!pagoValido">Confirmar cobro</button>
          <button class="btn ghost" @click="pagoAbierto = null">Cancelar</button>
        </div>
      </div>
    </div>

    <!-- Modal detalle -->
    <div v-if="detalle" class="modal no-print" @click.self="detalle = null">
      <div class="modal-box" style="max-height:85vh;overflow-y:auto">
        <div class="modal-title"><icon name="list" :size="20"></icon> Detalle del fiado</div>
        <div style="font-size:.85rem;margin-bottom:.6rem">
          <b>{{ detalle.clienteNombre }}</b>
          <div style="font-size:.72rem;color:var(--mut)">{{ fmtFH(detalle.fecha) }}</div>
        </div>

        <div class="info-box" style="margin-bottom:.6rem;font-size:.78rem">
          <div style="display:flex;justify-content:space-between"><span>Total fiado:</span><b>{{ fmt(detalle.totalFiado) }}</b></div>
          <div style="display:flex;justify-content:space-between"><span>Pagado:</span><b class="pos">{{ fmt(detalle.totalPagado) }}</b></div>
          <div style="display:flex;justify-content:space-between"><span>Saldo:</span><b class="neg">{{ fmt(saldo(detalle)) }}</b></div>
          <div style="display:flex;justify-content:space-between;margin-top:.3rem;padding-top:.3rem;border-top:1px solid var(--brd)"><span>Ganancia cobrada:</span><b>{{ fmt(detalle.gananciaCobrada || 0) }}</b></div>
        </div>

        <div style="font-size:.78rem;font-weight:800;margin-bottom:.4rem">Productos</div>
        <div v-for="(it, i) in detalle.items" :key="i"
          style="display:flex;justify-content:space-between;padding:.4rem 0;border-bottom:1px solid var(--brd);font-size:.78rem">
          <div>
            <div>{{ it.nombre }}</div>
            <div style="font-size:.68rem;color:var(--mut)">{{ it.cantidad }} × {{ fmt(it.precio) }}</div>
          </div>
          <div style="text-align:right">
            <div>{{ fmt(it.cantidad * it.precio) }}</div>
            <div v-if="it.pagado" style="font-size:.68rem;color:var(--ok)">✓ pagado</div>
          </div>
        </div>

        <div v-if="detalle.pagos && detalle.pagos.length" style="margin-top:.7rem">
          <div style="font-size:.78rem;font-weight:800;margin-bottom:.4rem">Pagos</div>
          <div v-for="(p, i) in detalle.pagos" :key="i" class="item" style="padding:.5rem 0">
            <div class="info">
              <div class="nm" style="font-size:.85rem">{{ fmt(p.monto) }}</div>
              <div class="det" style="font-size:.68rem">{{ fmtFH(p.fecha) }}<span v-if="p.nota"> · {{ p.nota }}</span></div>
            </div>
          </div>
        </div>

        <button class="btn ghost" style="margin-top:.5rem;width:100%" @click="detalle = null">Cerrar</button>
      </div>
    </div>
  </section>
</template>

<script>
import { db, genId, clean, P, n, m, fmt, fmtCant, fmtFecha, fmtFH } from '../db.js';
import { TOAST } from '../constants.js';

export default {
  name: 'FiadosSection',
  props: {
    activo: { type: Boolean, default: false },
    secActiva: { type: Boolean, default: false }
  },
  data() {
    return {
      fiados: [],
      personas: [],
      productos: [],
      lotes: [],
      tab: 'pendiente',
      formAbierto: false,
      form: { clienteId: '', items: [] },
      productoSeleccionado: '',
      errorForm: '',
      pagoAbierto: null,
      modoCobro: 'total',
      pagoMonto: '',
      pagoNota: '',
      detalle: null
    };
  },
  computed: {
    mutColor() { return getComputedStyle(document.documentElement).getPropertyValue('--mut').trim() || '#64748B'; },
    txtColor() { return getComputedStyle(document.documentElement).getPropertyValue('--txt').trim() || '#000'; },
    clientes() {
      return this.personas.filter(p => p.roles && p.roles.includes('cliente') && !p.archivado)
        .sort((a, b) => a.nombre.localeCompare(b.nombre));
    },
    productosActivos() {
      return this.productos.filter(p => !p.archivado).sort((a, b) => a.nombre.localeCompare(b.nombre));
    },
    pendientes() { return this.fiados.filter(f => f.estado === 'pendiente'); },
    filtrados() { return this.fiados.filter(f => f.estado === this.tab).sort((a, b) => new Date(b.fecha) - new Date(a.fecha)); },
    totalPendiente() { return m(this.pendientes.reduce((s, f) => s + this.saldo(f), 0)); },
    gananciaPendiente() {
      return m(this.pendientes.reduce((s, f) => {
        const pend = this.saldo(f) / f.totalFiado;
        return s + ((f.gananciaTotal || 0) - (f.gananciaCobrada || 0));
      }, 0));
    },
    totalForm() {
      return m(this.form.items.reduce((s, it) => s + (n(it.cantidad) * n(it.precio)), 0));
    },
    gananciaEstimada() {
      // Estimación rápida: 30% asumido si no tenemos costo
      let gan = 0;
      for (const it of this.form.items) {
        const costo = n(it.costoEstimado) || 0;
        gan += (n(it.precio) - costo) * n(it.cantidad);
      }
      return m(gan);
    },
    puedoGuardar() {
      return this.form.clienteId && this.form.items.length > 0 && this.totalForm > 0;
    },
    itemsSeleccionados() {
      if (!this.pagoAbierto || !this.pagoAbierto.items) return [];
      return this.pagoAbierto.items.filter(it => it._sel);
    },
    montoItemsSeleccionados() {
      return m(this.itemsSeleccionados.reduce((s, it) => s + (it.cantidad * it.precio), 0));
    },
    pagoValido() {
      if (!this.pagoAbierto) return false;
      if (this.modoCobro === 'total') {
        const v = n(this.pagoMonto);
        return v > 0 && v <= this.saldo(this.pagoAbierto) + 0.001;
      } else {
        return this.itemsSeleccionados.length > 0;
      }
    }
  },
  watch: {
    activo(v) { if (v) this.cargar(); }
  },
  methods: {
    fmt, fmtFecha, fmtFH, fmtCant,
    inicial(nombre) { return (nombre || '?').trim().charAt(0).toUpperCase(); },
    saldo(f) { return m(n(f.totalFiado) - n(f.totalPagado)); },
    porcentajePagado(f) {
      const t = n(f.totalFiado);
      return t > 0 ? Math.min(100, (n(f.totalPagado) / t) * 100) : 0;
    },

    async cargar() {
      try {
        this.fiados = await db.fiados.toArray();
        this.personas = await db.personas.filter(p => !p.archivado).toArray();
        this.productos = await db.productos.filter(p => !p.archivado).toArray();
        this.lotes = await db.lotes.toArray();
      } catch (e) {
        console.warn('cargar fiados', e);
      }
    },

    stockDe(pid) {
      return this.lotes.filter(l => l.productoId === pid)
        .reduce((s, l) => s + (n(l.cantidadInicial) - n(l.cantidadVendida)), 0);
    },

    formatStock(pid) {
      const s = this.stockDe(pid);
      return Number.isInteger(s) ? String(s) : s.toFixed(2);
    },

    abrirFormNuevo() {
      this.form = { clienteId: '', items: [] };
      this.productoSeleccionado = '';
      this.errorForm = '';
      this.formAbierto = true;
    },

    cerrarForm() {
      this.formAbierto = false;
      this.form = { clienteId: '', items: [] };
      this.productoSeleccionado = '';
      this.errorForm = '';
    },

    agregarProducto() {
      const pid = this.productoSeleccionado;
      if (!pid) return;
      const p = this.productos.find(x => x.id === pid);
      if (!p) return;

      const stock = this.stockDe(pid);
      if (stock <= 0) { this.errorForm = 'Sin stock: ' + p.nombre; return; }

      const yaEnForm = this.form.items.find(it => it.productoId === pid);
      if (yaEnForm) { yaEnForm.cantidad = String(n(yaEnForm.cantidad) + 1); }
      else {
        this.form.items.push({
          productoId: pid,
          nombre: p.nombre,
          cantidad: '1',
          precio: String(p.precio || 0),
          costoEstimado: this.costoPromedio(pid)
        });
      }
      this.productoSeleccionado = '';
      this.errorForm = '';
    },

    costoPromedio(pid) {
      const lotes = this.lotes.filter(l => l.productoId === pid);
      let totalCosto = 0, totalCant = 0;
      for (const l of lotes) {
        const disp = n(l.cantidadInicial) - n(l.cantidadVendida);
        if (disp > 0) { totalCosto += disp * n(l.costo); totalCant += disp; }
      }
      return totalCant > 0 ? m(totalCosto / totalCant) : 0;
    },

    async guardarFiado() {
      this.errorForm = '';
      if (!this.form.clienteId) { this.errorForm = 'Seleccioná un cliente'; return; }
      if (this.form.items.length === 0) { this.errorForm = 'Agregá al menos un producto'; return; }

      const cliente = this.personas.find(p => p.id === this.form.clienteId);
      if (!cliente) { this.errorForm = 'Cliente no encontrado'; return; }

      // Verificar stock
      for (const it of this.form.items) {
        const stock = this.stockDe(it.productoId);
        if (n(it.cantidad) > stock + 0.001) {
          this.errorForm = 'Sin stock suficiente: ' + it.nombre + ' (hay ' + this.formatStock(it.productoId) + ')';
          return;
        }
      }

      // Calcular items con costo real (FIFO simplificado: costo promedio)
      const itemsFiados = [];
      let total = 0, gananciaTotal = 0;
      const lotesAfectados = [];

      for (const it of this.form.items) {
        const cant = n(it.cantidad);
        const precio = n(it.precio);
        const costoProm = this.costoPromedio(it.productoId);
        const costoTotal = m(cant * costoProm);
        const ganancia = m((precio * cant) - costoTotal);
        total = m(total + (precio * cant));
        gananciaTotal = m(gananciaTotal + ganancia);

        itemsFiados.push({
          productoId: it.productoId,
          nombre: it.nombre,
          cantidad: cant,
          precio,
          costo: costoTotal,
          ganancia,
          pagado: false
        });

        // Marcar lotes a descontar (FIFO real)
        let rest = cant;
        const lotesProd = this.lotes
          .filter(l => l.productoId === it.productoId)
          .sort((a, b) => new Date(a.fecha) - new Date(b.fecha) || (a.id < b.id ? -1 : 1));
        for (const l of lotesProd) {
          if (rest <= 0.001) break;
          const disp = n(l.cantidadInicial) - n(l.cantidadVendida);
          if (disp <= 0) continue;
          const usar = Math.min(disp, rest);
          lotesAfectados.push({ loteId: l.id, cantidad: usar, loteOriginal: l });
          rest -= usar;
        }
      }

      const venta = {
        id: genId('v'),
        fecha: new Date().toISOString(),
        items: itemsFiados.map(it => ({
          productoId: it.productoId,
          nombre: it.nombre,
          cantidad: it.cantidad,
          precio: it.precio,
          costo: it.costo,
          ganancia: it.ganancia,
          lotesUsados: []
        })),
        total,
        ganancia: gananciaTotal,
        anulada: false,
        fiado: true,
        clienteId: cliente.id,
        clienteNombre: cliente.nombre
      };

      const fiado = {
        id: genId('f'),
        ventaId: venta.id,
        clienteId: cliente.id,
        clienteNombre: cliente.nombre,
        items: itemsFiados,
        totalFiado: total,
        totalPagado: 0,
        gananciaTotal,
        gananciaCobrada: 0,
        pagos: [],
        fecha: venta.fecha,
        estado: 'pendiente'
      };

      try {
        await db.transaction('rw', db.ventas, db.lotes, db.fiados, async () => {
          await P(db.ventas, venta);
          await P(db.fiados, fiado);
          for (const la of lotesAfectados) {
            await P(db.lotes, { ...la.loteOriginal, cantidadVendida: m(n(la.loteOriginal.cantidadVendida) + la.cantidad) });
          }
        });

        this.cerrarForm();
        await this.cargar();
        if (this.$root.recargar) await this.$root.recargar(['ventas', 'lotes']);
        if (this.$root.toastMsg) this.$root.toastMsg('Fiado registrado: ' + fmt(total));
      } catch (e) {
        console.error('guardar fiado', e);
        this.errorForm = 'Error: ' + e.message;
      }
    },

    abrirPago(f) {
      // Clonar para no modificar directo
      const copia = JSON.parse(JSON.stringify(f));
      copia.items = copia.items.map(it => ({ ...it, _sel: false }));
      this.pagoAbierto = copia;
      this.modoCobro = 'total';
      this.pagoMonto = String(this.saldo(f));
      this.pagoNota = '';
    },

    toggleProductoPagado(i) {
      const it = this.pagoAbierto.items[i];
      if (!it || it.pagado) return;
      it._sel = !it._sel;
    },

    async guardarCobro() {
      if (!this.pagoValido) return;
      const f = this.pagoAbierto;

      let monto = 0;
      let gananciaCobrar = 0;
      const itemsActualizados = JSON.parse(JSON.stringify(f.items));

      if (this.modoCobro === 'total') {
        monto = m(n(this.pagoMonto));
        // Ganancia proporcional al monto
        const proporcion = monto / f.totalFiado;
        gananciaCobrar = m((f.gananciaTotal || 0) * proporcion);
        // Marcar items como pagados si el saldo llega a 0
        if (monto >= this.saldo(f) - 0.001) {
          itemsActualizados.forEach(it => it.pagado = true);
        }
      } else {
        // Modo producto
        for (let i = 0; i < itemsActualizados.length; i++) {
          const it = itemsActualizados[i];
          if (it._sel && !it.pagado) {
            monto = m(monto + (it.cantidad * it.precio));
            gananciaCobrar = m(gananciaCobrar + (it.ganancia || 0));
            it.pagado = true;
          }
        }
      }

      // Limpiar _sel
      itemsActualizados.forEach(it => delete it._sel);

      const pagos = [...(f.pagos || []), { fecha: new Date().toISOString(), monto, nota: this.pagoNota.trim() }];
      const nuevoPagado = m(n(f.totalPagado) + monto);
      const nuevaGananciaCobrada = m((f.gananciaCobrada || 0) + gananciaCobrar);
      const nuevoEstado = nuevoPagado >= f.totalFiado - 0.001 ? 'saldado' : 'pendiente';

      try {
        await P(db.fiados, {
          id: f.id,
          ventaId: f.ventaId,
          clienteId: f.clienteId,
          clienteNombre: f.clienteNombre,
          items: itemsActualizados,
          totalFiado: f.totalFiado,
          totalPagado: nuevoPagado,
          gananciaTotal: f.gananciaTotal,
          gananciaCobrada: nuevaGananciaCobrada,
          pagos,
          fecha: f.fecha,
          estado: nuevoEstado
        });

        // Registrar ingreso en caja
        await P(db.movCaja, {
          id: genId('mc'),
          fecha: new Date().toISOString(),
          tipo: 'ingreso',
          monto,
          concepto: 'Cobro fiado: ' + f.clienteNombre,
          fiadoId: f.id
        });

        this.pagoAbierto = null;
        await this.cargar();
        if (this.$root.recargar) await this.$root.recargar(['movCaja']);
        if (this.$root.toastMsg) this.$root.toastMsg(nuevoEstado === 'saldado' ? 'Fiado saldado: ' + fmt(monto) : 'Pago registrado: ' + fmt(monto));
      } catch (e) {
        console.error('guardar cobro', e);
      }
    },

    async condonar(f) {
      if (!confirm('¿Condonar el fiado de ' + f.clienteNombre + ' por ' + this.fmt(this.saldo(f)) + '?\nSe registrará como pérdida.')) return;
      const saldo = this.saldo(f);
      try {
        const pagos = [...(f.pagos || []), { fecha: new Date().toISOString(), monto: saldo, nota: 'CONDONADO', condonado: true }];
        await P(db.fiados, { ...f, totalPagado: f.totalFiado, pagos, estado: 'condonado' });

        await P(db.gastos, {
          id: genId('g'),
          fecha: new Date().toISOString(),
          categoria: 'Fiados incobrables',
          concepto: 'Fiado condonado: ' + f.clienteNombre,
          monto: saldo,
          nota: '',
          metodoPago: 'otro',
          saleDeCaja: false,
          movId: null,
          fiadoId: f.id
        });

        await this.cargar();
        if (this.$root.recargar) await this.$root.recargar(['gastos']);
        if (this.$root.toastMsg) this.$root.toastMsg('Fiado condonado');
      } catch (e) {
        console.error('condonar fiado', e);
      }
    }
  }
};
</script>
