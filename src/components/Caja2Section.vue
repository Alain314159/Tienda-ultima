<template>
  <section v-if="activo" class="fade-up">
    <div class="balance verde">
      <div class="lbl"><icon name="package" :size="14" color="#fff"></icon> Caja 2 · Ganancia disponible</div>
      <div class="val">{{ fmt(stats.gananciaDisponible) }}</div>
      <div class="sub">
        Invertido: {{ fmt(stats.invertidoActual) }} · Acumulada: {{ fmt(stats.gananciaAcumulada) }}
      </div>
    </div>

    <div class="card">
      <div class="card-title"><icon name="chart" :size="18" :color="secActiva ? '#2196F3' : mutColor"></icon> Resumen</div>
      <div class="info-box" style="font-size:.78rem">
        <div style="display:flex;justify-content:space-between;margin-bottom:.3rem">
          <span>Productos en caja 2</span><b>{{ productosCaja2.length }}</b>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:.3rem">
          <span>Invertido (a costo)</span><b>{{ fmt(stats.invertidoActual) }}</b>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:.3rem">
          <span>Ganancia acumulada</span><b class="pos">{{ fmt(stats.gananciaAcumulada) }}</b>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:.3rem">
          <span>Ya retirado</span><b>{{ fmt(stats.totalRetirado) }}</b>
        </div>
        <div style="display:flex;justify-content:space-between;padding-top:.3rem;border-top:1px solid var(--brd)">
          <span><b>Disponible para retirar</b></span>
          <b class="pos">{{ fmt(stats.gananciaDisponible) }}</b>
        </div>
      </div>
      <button class="btn ok" style="width:100%;margin-top:.6rem" @click="abrirRetiro" :disabled="stats.gananciaDisponible <= 0.01">
        <icon name="download" :size="16" color="#fff"></icon> Retirar ganancia a caja 1
      </button>
    </div>

    <div class="card">
      <div class="card-title"><icon name="plus" :size="18" :color="secActiva ? '#2196F3' : mutColor"></icon> Acciones</div>
      <button class="btn pri" style="width:100%;margin-bottom:.5rem" @click="abrirVenta" :disabled="productosConStock.length === 0">
        <icon name="cart" :size="16" color="#fff"></icon> Vender producto de caja 2
      </button>
      <div class="grid2">
        <button class="btn ghost" style="margin:0;font-size:.75rem;padding:.6rem" @click="irA('productos')">
          <icon name="tag" :size="14" :color="mutColor"></icon> Crear producto
        </button>
        <button class="btn ghost" style="margin:0;font-size:.75rem;padding:.6rem" @click="irA('compras')">
          <icon name="bag" :size="14" :color="mutColor"></icon> Comprar mercancía
        </button>
      </div>
      <div v-if="productosCaja2.length === 0" class="info-box" style="margin-top:.5rem;background:rgba(245,158,11,.1);border-color:var(--warn);font-size:.72rem">
        Aún no hay productos de Caja 2. Creá uno en Productos y activá "Pertenece a Caja 2".
      </div>
    </div>

    <div class="card">
      <div class="card-title">
        <icon name="list" :size="18" :color="secActiva ? '#2196F3' : mutColor"></icon>
        Ventas de caja 2
        <span style="margin-left:auto;font-size:.72rem;color:var(--mut)">{{ ventasCaja2.length }}</span>
      </div>
      <div v-if="ventasCaja2.length === 0" class="empty">Sin ventas aún</div>
      <div v-for="v in ventasCaja2.slice(0, 30)" :key="v.id" class="item" style="padding:.5rem 0">
        <div class="info">
          <div class="nm" style="font-size:.82rem">
            <span v-for="(it, i) in v.items" :key="i">
              {{ it.nombre }} × {{ fmtCant(it.cantidad) }}<span v-if="i < v.items.length - 1">, </span>
            </span>
          </div>
          <div class="det" style="font-size:.68rem">{{ fmtFH(v.fecha) }}</div>
        </div>
        <div style="text-align:right;font-size:.78rem">
          <div style="font-weight:800">{{ fmt(v.total) }}</div>
          <div class="pos" style="font-size:.68rem">+{{ fmt(v.ganancia) }}</div>
        </div>
      </div>
    </div>

    <div v-if="retiros.length > 0" class="card">
      <div class="card-title"><icon name="download" :size="18" :color="secActiva ? '#2196F3' : mutColor"></icon> Retiros de ganancia</div>
      <div v-for="r in retiros.slice(0, 20)" :key="r.id" class="item" style="padding:.5rem 0">
        <div class="info">
          <div class="nm" style="font-size:.82rem">{{ fmt(r.monto) }}</div>
          <div class="det" style="font-size:.68rem">{{ fmtFH(r.fecha) }}<span v-if="r.nota"> · {{ r.nota }}</span></div>
        </div>
      </div>
    </div>

    <!-- ============ MODAL: VENTA RÁPIDA ============ -->
    <div v-if="ventaAbierto" class="modal no-print" @click.self="cerrarVenta">
      <div class="modal-box">
        <div class="modal-title"><icon name="cart" :size="20"></icon> Vender producto de Caja 2</div>

        <div style="font-size:.78rem;color:var(--mut);margin-bottom:.4rem">Producto *</div>
        <select v-model="ventaForm.productoId" style="font-size:.9rem">
          <option value="">Seleccionar...</option>
          <option v-for="p in productosConStock" :key="p.id" :value="p.id">
            {{ p.nombre }} · Stock: {{ stockDe(p.id) }} · ${{ n(p.precio).toFixed(2) }}
          </option>
        </select>

        <div style="font-size:.78rem;color:var(--mut);margin:.5rem 0 .4rem">Cantidad *</div>
        <input v-model="ventaForm.cantidad" type="number" inputmode="decimal" step="0.01" placeholder="1">

        <div style="font-size:.78rem;color:var(--mut);margin:.5rem 0 .4rem">Precio unitario *</div>
        <input v-model="ventaForm.precio" type="number" inputmode="decimal" step="0.01" placeholder="0.00">

        <div v-if="ventaError" class="info-box" style="margin-top:.5rem;background:rgba(239,68,68,.1);border-color:var(--bad);color:var(--bad);font-size:.75rem">
          {{ ventaError }}
        </div>

        <div v-if="ventaForm.productoId && n(ventaForm.cantidad) > 0" class="info-box" style="margin-top:.5rem;font-size:.78rem">
          <div style="display:flex;justify-content:space-between">
            <span>Total:</span>
            <b>{{ fmt(n(ventaForm.cantidad) * n(ventaForm.precio)) }}</b>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:.72rem;color:var(--mut);margin-top:.2rem">
            <span>Costo (FIFO):</span>
            <span>{{ fmt(costoFIFOEstimado) }}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:.72rem;color:var(--ok);margin-top:.2rem">
            <span>Ganancia estimada:</span>
            <span>{{ fmt(gananciaEstimada) }}</span>
          </div>
        </div>

        <div class="grid2" style="margin-top:.7rem">
          <button class="btn ok" @click="confirmarVenta" :disabled="!ventaValida">Vender</button>
          <button class="btn ghost" @click="cerrarVenta">Cancelar</button>
        </div>
      </div>
    </div>

    <!-- Modal retiro -->
    <div v-if="retiroAbierto" class="modal no-print" @click.self="retiroAbierto = false">
      <div class="modal-box">
        <div class="modal-title"><icon name="download" :size="20"></icon> Retirar ganancia</div>
        <div style="font-size:.78rem;color:var(--mut);margin-bottom:.4rem">
          Disponible: <b class="pos">{{ fmt(stats.gananciaDisponible) }}</b>
        </div>
        <input v-model="retiroMonto" type="number" inputmode="decimal" step="0.01" placeholder="Monto">
        <input v-model="retiroNota" type="text" placeholder="Nota (opcional)" maxlength="60">
        <div style="font-size:.68rem;color:var(--mut);margin-top:.4rem">
          El monto pasa a Caja 1 como ingreso.
        </div>
        <div class="grid2" style="margin-top:.7rem">
          <button class="btn ok" @click="confirmarRetiro" :disabled="!retiroValido">Confirmar</button>
          <button class="btn ghost" @click="retiroAbierto = false">Cancelar</button>
        </div>
      </div>
    </div>
  </section>
</template>

<script>
import { db, genId, n, m, q, fmt, fmtCant, fmtFH, clean, P } from '../db.js';

export default {
  name: 'Caja2Section',
  props: {
    activo: { type: Boolean, default: false },
    secActiva: { type: Boolean, default: false }
  },
  emits: ['ir'],
  data() {
    return {
      productos: [],
      ventas: [],
      compras: [],
      lotes: [],
      caja2_mov: [],
      retiroAbierto: false,
      retiroMonto: '',
      retiroNota: '',
      ventaAbierto: false,
      ventaForm: { productoId: '', cantidad: '1', precio: '' },
      ventaError: ''
    };
  },
  computed: {
    mutColor() { return getComputedStyle(document.documentElement).getPropertyValue('--mut').trim() || '#64748B'; },
    productosCaja2() { return this.productos.filter(p => p.caja2 && !p.archivado); },
    productosConStock() { return this.productosCaja2.filter(p => this.stockDe(p.id) > 0.001); },
    ventasCaja2() { return this.ventas.filter(v => v.caja2 && !v.anulada).sort((a, b) => new Date(b.fecha) - new Date(a.fecha)); },
    retiros() { return this.caja2_mov.filter(m => m.tipo === 'retiro').sort((a, b) => new Date(b.fecha) - new Date(a.fecha)); },
    stats() {
      let gananciaAcumulada = 0, costoVendido = 0, invertidoActual = 0, totalRetirado = 0;
      const pidsCaja2 = new Set(this.productos.filter(p => p.caja2).map(p => p.id));
      for (const v of this.ventas) {
        if (v.anulada || !v.caja2) continue;
        gananciaAcumulada += n(v.ganancia);
        costoVendido += (n(v.total) - n(v.ganancia));
      }
      for (const mv of this.caja2_mov) if (mv.tipo === 'retiro') totalRetirado += n(mv.monto);
      for (const l of this.lotes) {
        if (!pidsCaja2.has(l.productoId)) continue;
        const disp = n(l.cantidadInicial) - n(l.cantidadVendida);
        if (disp > 0) invertidoActual += disp * n(l.costo);
      }
      return {
        gananciaAcumulada: m(gananciaAcumulada),
        invertidoActual: m(invertidoActual),
        costoVendido: m(costoVendido),
        totalRetirado: m(totalRetirado),
        gananciaDisponible: m(gananciaAcumulada - totalRetirado)
      };
    },
    retiroValido() {
      const v = n(this.retiroMonto);
      return v > 0 && v <= this.stats.gananciaDisponible + 0.001;
    },
    ventaValida() {
      return this.ventaForm.productoId && n(this.ventaForm.cantidad) > 0 && n(this.ventaForm.precio) > 0;
    },
    costoFIFOEstimado() {
      if (!this.ventaForm.productoId) return 0;
      const cant = n(this.ventaForm.cantidad);
      if (cant <= 0) return 0;
      return this.calcularCostoFIFO(this.ventaForm.productoId, cant).total;
    },
    gananciaEstimada() {
      const total = n(this.ventaForm.cantidad) * n(this.ventaForm.precio);
      return m(total - this.costoFIFOEstimado);
    }
  },
  watch: {
    activo(v) { if (v) this.cargar(); }
  },
  methods: {
    fmt, fmtCant, fmtFH, n,

    async cargar() {
      try {
        this.productos = await db.productos.toArray();
        this.ventas = await db.ventas.toArray();
        this.compras = await db.compras.toArray();
        this.lotes = await db.lotes.toArray();
        this.caja2_mov = await db.caja2_mov.toArray();
      } catch (e) { console.warn('cargar caja2', e); }
    },

    irA(sec) { this.$emit('ir', sec); },

    stockDe(pid) {
      return q(this.lotes.filter(l => l.productoId === pid)
        .reduce((s, l) => s + (n(l.cantidadInicial) - n(l.cantidadVendida)), 0));
    },

    calcularCostoFIFO(pid, cant) {
      const lotes = this.lotes
        .filter(l => l.productoId === pid && (n(l.cantidadInicial) - n(l.cantidadVendida)) > 0)
        .sort((a, b) => new Date(a.fecha) - new Date(b.fecha) || (a.id < b.id ? -1 : 1));
      let rest = cant, total = 0, usados = [];
      for (const l of lotes) {
        if (rest <= 0.001) break;
        const disp = n(l.cantidadInicial) - n(l.cantidadVendida);
        if (disp <= 0) continue;
        const usar = Math.min(disp, rest);
        total = m(total + (usar * n(l.costo)));
        usados.push({ loteId: l.id, cantidad: usar, costo: l.costo, loteObj: l });
        rest -= usar;
      }
      return { total, usados, error: rest > 0.001 ? 'Stock insuficiente' : null };
    },

    abrirVenta() {
      this.ventaForm = { productoId: '', cantidad: '1', precio: '' };
      this.ventaError = '';
      this.ventaAbierto = true;
    },

    cerrarVenta() {
      this.ventaAbierto = false;
      this.ventaForm = { productoId: '', cantidad: '1', precio: '' };
      this.ventaError = '';
    },

    // Al cambiar producto, prellenar precio
    setProducto(pid) {
      const p = this.productos.find(x => x.id === pid);
      if (p && !this.ventaForm.precio) this.ventaForm.precio = String(p.precio || '');
    },

    async confirmarVenta() {
      this.ventaError = '';
      if (!this.ventaValida) return;
      const pid = this.ventaForm.productoId;
      const cant = n(this.ventaForm.cantidad);
      const precio = n(this.ventaForm.precio);
      const prod = this.productos.find(p => p.id === pid);
      if (!prod) { this.ventaError = 'Producto no encontrado'; return; }
      if (!prod.caja2) { this.ventaError = 'Producto no es de Caja 2'; return; }

      const stock = this.stockDe(pid);
      if (cant > stock + 0.001) {
        this.ventaError = 'Stock insuficiente. Hay ' + stock;
        return;
      }

      const costo = this.calcularCostoFIFO(pid, cant);
      if (costo.error) { this.ventaError = costo.error; return; }

      const total = m(cant * precio);
      const ganancia = m(total - costo.total);

      const venta = {
        id: genId('v'),
        fecha: new Date().toISOString(),
        items: [{
          productoId: pid,
          nombre: prod.nombre,
          cantidad: cant,
          precio,
          costo: costo.total,
          ganancia,
          lotesUsados: costo.usados.map(u => ({ loteId: u.loteId, cantidad: u.cantidad, costo: u.costo }))
        }],
        total,
        ganancia,
        anulada: false,
        caja2: true
      };

      try {
        await db.transaction('rw', db.ventas, db.lotes, async () => {
          await P(db.ventas, venta);
          for (const u of costo.usados) {
            const nuevoVendido = q(n(u.loteObj.cantidadVendida) + u.cantidad);
            await P(db.lotes, { ...u.loteObj, cantidadVendida: nuevoVendido });
          }
        });

        this.cerrarVenta();
        await this.cargar();
        if (this.$root.recargar) await this.$root.recargar(['ventas', 'lotes']);
        if (this.$root.toastMsg) this.$root.toastMsg('Vendido: ' + fmt(total) + ' · Ganancia: ' + fmt(ganancia));
      } catch (e) {
        console.error('venta caja2', e);
        this.ventaError = 'Error: ' + e.message;
      }
    },

    abrirRetiro() {
      this.retiroMonto = String(this.stats.gananciaDisponible);
      this.retiroNota = '';
      this.retiroAbierto = true;
    },

    async confirmarRetiro() {
      if (!this.retiroValido) return;
      const monto = m(n(this.retiroMonto));
      try {
        await P(db.caja2_mov, {
          id: genId('c2'),
          tipo: 'retiro',
          monto,
          fecha: new Date().toISOString(),
          nota: this.retiroNota.trim()
        });
        await P(db.movCaja, {
          id: genId('mc'),
          fecha: new Date().toISOString(),
          tipo: 'ingreso',
          monto,
          concepto: 'Retiro de ganancia caja 2' + (this.retiroNota.trim() ? ': ' + this.retiroNota.trim() : '')
        });
        this.retiroAbierto = false;
        await this.cargar();
        if (this.$root.recargar) await this.$root.recargar(['movCaja', 'caja2_mov']);
        if (this.$root.toastMsg) this.$root.toastMsg('Retirado: ' + fmt(monto));
      } catch (e) { console.error('retiro caja2', e); }
    }
  }
};
</script>
