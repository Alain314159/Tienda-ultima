<template>
  <section v-if="activo" class="fade-up">
    <div class="balance verde">
      <div class="lbl"><icon name="package" :size="14" color="#fff"></icon> Caja 2 · Ganancia disponible</div>
      <div class="val">{{ fmt(stats.gananciaDisponible) }}</div>
      <div class="sub">
        Invertido: {{ fmt(stats.invertidoActual) }} · Ganancia acumulada: {{ fmt(stats.gananciaAcumulada) }}
      </div>
    </div>

    <!-- Resumen -->
    <div class="card">
      <div class="card-title"><icon name="chart" :size="18" :color="secActiva ? '#2196F3' : mutColor"></icon> Resumen</div>
      <div class="info-box" style="font-size:.78rem">
        <div style="display:flex;justify-content:space-between;margin-bottom:.3rem">
          <span>Productos en caja 2</span>
          <b>{{ productosCaja2.length }}</b>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:.3rem">
          <span>Total invertido (a costo)</span>
          <b>{{ fmt(stats.invertidoActual) }}</b>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:.3rem">
          <span>Ganancia acumulada</span>
          <b class="pos">{{ fmt(stats.gananciaAcumulada) }}</b>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:.3rem">
          <span>Ya retirado</span>
          <b>{{ fmt(stats.totalRetirado) }}</b>
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

    <!-- Acciones -->
    <div class="card">
      <div class="card-title"><icon name="plus" :size="18" :color="secActiva ? '#2196F3' : mutColor"></icon> Acciones</div>
      <div class="grid2">
        <button class="btn pri" style="margin:0;font-size:.78rem;padding:.6rem" @click="irA('productos')">
          <icon name="tag" :size="14" color="#fff"></icon> Crear producto caja 2
        </button>
        <button class="btn ghost" style="margin:0;font-size:.78rem;padding:.6rem" @click="abrirCompra">
          <icon name="bag" :size="14" :color="mutColor"></icon> Comprar mercancía
        </button>
      </div>
      <div style="font-size:.68rem;color:var(--mut);margin-top:.5rem">
        Los productos de caja 2 se crean en la sección Productos marcando "Pertenece a Caja 2".
        Las compras salen de Caja 1 automáticamente.
      </div>
    </div>

    <!-- Ventas caja 2 -->
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

    <!-- Historial de retiros -->
    <div v-if="retiros.length > 0" class="card">
      <div class="card-title"><icon name="download" :size="18" :color="secActiva ? '#2196F3' : mutColor"></icon> Retiros de ganancia</div>
      <div v-for="r in retiros.slice(0, 20)" :key="r.id" class="item" style="padding:.5rem 0">
        <div class="info">
          <div class="nm" style="font-size:.82rem">{{ fmt(r.monto) }}</div>
          <div class="det" style="font-size:.68rem">{{ fmtFH(r.fecha) }}<span v-if="r.nota"> · {{ r.nota }}</span></div>
        </div>
      </div>
    </div>

    <!-- Modal retiro -->
    <div v-if="retiroAbierto" class="modal no-print" @click.self="retiroAbierto = false">
      <div class="modal-box">
        <div class="modal-title"><icon name="download" :size="20"></icon> Retirar ganancia de caja 2</div>
        <div style="font-size:.78rem;color:var(--mut);margin-bottom:.4rem">
          Disponible: <b class="pos">{{ fmt(stats.gananciaDisponible) }}</b>
        </div>
        <input v-model="retiroMonto" type="number" inputmode="decimal" step="0.01" placeholder="Monto a retirar">
        <input v-model="retiroNota" type="text" placeholder="Nota (opcional)" maxlength="60">
        <div style="font-size:.68rem;color:var(--mut);margin-top:.4rem">
          El monto pasa de caja 2 a caja 1 como ingreso.
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
import { db, genId, n, m, fmt, fmtCant, fmtFH, clean, P } from '../db.js';

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
      retiroNota: ''
    };
  },
  computed: {
    mutColor() { return getComputedStyle(document.documentElement).getPropertyValue('--mut').trim() || '#64748B'; },
    productosCaja2() { return this.productos.filter(p => p.caja2 && !p.archivado); },
    ventasCaja2() {
      return this.ventas.filter(v => v.caja2 && !v.anulada).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    },
    retiros() {
      return this.caja2_mov.filter(m => m.tipo === 'retiro').sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    },
    stats() {
      let gananciaAcumulada = 0;
      let costoVendido = 0;
      let invertidoActual = 0;
      let totalVentas = 0;
      let totalCompras = 0;
      let totalRetirado = 0;
      const pidsCaja2 = new Set(this.productos.filter(p => p.caja2).map(p => p.id));

      for (const v of this.ventas) {
        if (v.anulada || !v.caja2) continue;
        totalVentas += n(v.total);
        gananciaAcumulada += n(v.ganancia);
        costoVendido += (n(v.total) - n(v.ganancia));
      }

      for (const c of this.compras) {
        if (c.anulada || !c.caja2) continue;
        totalCompras += n(c.total);
      }

      for (const mv of this.caja2_mov) {
        if (mv.tipo === 'retiro') totalRetirado += n(mv.monto);
      }

      for (const l of this.lotes) {
        if (!pidsCaja2.has(l.productoId)) continue;
        const disp = n(l.cantidadInicial) - n(l.cantidadVendida);
        if (disp > 0) invertidoActual += disp * n(l.costo);
      }

      return {
        totalVentas: m(totalVentas),
        totalCompras: m(totalCompras),
        costoVendido: m(costoVendido),
        gananciaAcumulada: m(gananciaAcumulada),
        invertidoActual: m(invertidoActual),
        totalRetirado: m(totalRetirado),
        gananciaDisponible: m(gananciaAcumulada - totalRetirado)
      };
    },
    retiroValido() {
      const v = n(this.retiroMonto);
      return v > 0 && v <= this.stats.gananciaDisponible + 0.001;
    }
  },
  watch: {
    activo(v) { if (v) this.cargar(); }
  },
  methods: {
    fmt, fmtCant, fmtFH,

    async cargar() {
      try {
        this.productos = await db.productos.toArray();
        this.ventas = await db.ventas.toArray();
        this.compras = await db.compras.toArray();
        this.lotes = await db.lotes.toArray();
        this.caja2_mov = await db.caja2_mov.toArray();
      } catch (e) {
        console.warn('cargar caja2', e);
      }
    },

    irA(sec) { this.$emit('ir', sec); },

    abrirCompra() {
      this.$emit('ir', 'compras');
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
        // Registrar retiro
        await P(db.caja2_mov, {
          id: genId('c2'),
          tipo: 'retiro',
          monto,
          fecha: new Date().toISOString(),
          nota: this.retiroNota.trim()
        });

        // Registrar ingreso en movCaja (caja 1)
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
      } catch (e) {
        console.error('retiro caja2', e);
      }
    }
  }
};
</script>
