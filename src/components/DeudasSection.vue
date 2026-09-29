<template>
  <section v-if="activo" class="fade-up">
    <div class="balance morado">
      <div class="lbl"><icon name="dollar" :size="14" color="#fff"></icon> Balance de deudas</div>
      <div class="val" :class="balanceNeto >= 0 ? '' : 'neg'">{{ fmt(balanceNeto) }}</div>
      <div class="sub">
        Me deben: {{ fmt(totalCobrar) }} · Debo: {{ fmt(totalPagar) }}
      </div>
    </div>

    <!-- Tabs -->
    <div class="card">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.3rem;margin-bottom:.7rem">
        <button class="btn" :class="tab === 'cobrar' ? 'pri' : 'ghost'" style="margin:0" @click="tab = 'cobrar'">
          <icon name="download" :size="14" :color="tab === 'cobrar' ? '#fff' : mutColor"></icon> Por cobrar
        </button>
        <button class="btn" :class="tab === 'pagar' ? 'pri' : 'ghost'" style="margin:0" @click="tab = 'pagar'">
          <icon name="upload" :size="14" :color="tab === 'pagar' ? '#fff' : mutColor"></icon> Por pagar
        </button>
      </div>

      <button class="btn ok" style="width:100%" @click="abrirFormNueva">
        <icon name="plus" :size="16" color="#fff"></icon>
        Nueva deuda {{ tab === 'cobrar' ? 'por cobrar' : 'por pagar' }}
      </button>
    </div>

    <!-- Lista -->
    <div class="card">
      <div class="card-title">
        <icon name="list" :size="18" :color="secActiva ? '#2196F3' : mutColor"></icon>
        {{ tab === 'cobrar' ? 'Personas que te deben' : 'Personas a las que debes' }}
        <span style="margin-left:auto;font-size:.75rem;color:var(--mut)">{{ filtradas.length }}</span>
      </div>

      <div v-if="filtradas.length === 0" class="empty">
        No hay deudas {{ tab === 'cobrar' ? 'por cobrar' : 'por pagar' }}
      </div>

      <div v-for="d in filtradas" :key="d.id" class="item" style="flex-direction:column;align-items:stretch;gap:.4rem">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:.5rem">
          <div style="flex:1;min-width:0">
            <div class="nm" style="display:flex;align-items:center;gap:.4rem">
              <span style="width:32px;height:32px;border-radius:50%;background:var(--pri);color:#fff;display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:.85rem;flex-shrink:0">{{ inicial(d.personaNombre) }}</span>
              {{ d.personaNombre }}
            </div>
            <div class="det" style="font-size:.75rem;margin-top:.2rem">{{ d.concepto }}</div>
            <div class="det" style="font-size:.68rem;color:var(--mut)">
              {{ fmtFecha(d.fecha) }} · {{ d.pagos.length }} pago(s)
            </div>
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div :class="d.tipo === 'cobrar' ? 'pos' : 'neg'" style="font-weight:800;font-size:1rem">{{ fmt(saldo(d)) }}</div>
            <div style="font-size:.65rem;color:var(--mut)">de {{ fmt(d.montoTotal) }}</div>
          </div>
        </div>

        <!-- Barra de progreso -->
        <div style="width:100%;height:6px;background:var(--bg);border-radius:3px;overflow:hidden">
          <div :style="{ width: porcentajePagado(d) + '%', height: '100%', background: 'var(--pri)', transition: 'width .3s' }"></div>
        </div>

        <div style="display:flex;gap:.3rem;flex-wrap:wrap">
          <button class="btn pri" style="flex:1;margin:0;font-size:.72rem;padding:.45rem" @click="abrirPago(d)">
            <icon name="check" :size="12" color="#fff"></icon> Registrar pago
          </button>
          <button class="icon-btn" @click="verDetalle(d)" aria-label="Detalle">
            <icon name="list" :size="14" :color="txtColor"></icon>
          </button>
          <button class="icon-btn" @click="editar(d)" aria-label="Editar">
            <icon name="edit" :size="14" :color="txtColor"></icon>
          </button>
          <button class="icon-btn bad" @click="condonar(d)" aria-label="Condonar">
            <icon name="trash" :size="14" color="#dc2626"></icon>
          </button>
        </div>
      </div>
    </div>

    <!-- Form nueva deuda -->
    <div v-if="formAbierto" class="modal no-print" @click.self="cerrarForm">
      <div class="modal-box">
        <div class="modal-title">
          <icon name="plus" :size="20"></icon>
          {{ form.editId ? 'Editar' : 'Nueva' }} deuda {{ form.tipo === 'cobrar' ? 'por cobrar' : 'por pagar' }}
        </div>

        <div style="font-size:.78rem;color:var(--mut);margin-bottom:.4rem">Persona *</div>
        <select v-model="form.personaId" style="font-size:.9rem">
          <option value="">Seleccionar...</option>
          <option v-for="p in personasFiltradas" :key="p.id" :value="p.id">{{ p.nombre }}</option>
        </select>
        <div v-if="personasFiltradas.length === 0" class="info-box" style="font-size:.75rem;background:rgba(245,158,11,.1);border-color:var(--warn)">
          No hay {{ form.tipo === 'cobrar' ? 'clientes' : 'proveedores' }}. Creá uno en la sección Personas.
        </div>

        <div style="font-size:.78rem;color:var(--mut);margin:.5rem 0 .4rem">Concepto *</div>
        <input v-model="form.concepto" type="text" placeholder="Ej: Préstamo, mercancía, etc" maxlength="80">

        <div style="font-size:.78rem;color:var(--mut);margin:.5rem 0 .4rem">Monto *</div>
        <input v-model="form.monto" type="number" inputmode="decimal" step="0.01" placeholder="0.00">

        <div style="font-size:.78rem;color:var(--mut);margin:.5rem 0 .4rem">Origen</div>
        <div class="grid2">
          <button class="btn" :class="form.origen === 'efectivo' ? 'pri' : 'ghost'" style="margin:0;font-size:.78rem;padding:.55rem" @click="form.origen = 'efectivo'">
            <icon name="dollar" :size="14" :color="form.origen === 'efectivo' ? '#fff' : mutColor"></icon> Efectivo
          </button>
          <button class="btn" :class="form.origen === 'producto' ? 'pri' : 'ghost'" style="margin:0;font-size:.78rem;padding:.55rem" @click="form.origen = 'producto'">
            <icon name="package" :size="14" :color="form.origen === 'producto' ? '#fff' : mutColor"></icon> Producto
          </button>
        </div>
        <div style="font-size:.68rem;color:var(--mut);margin-top:.3rem">
          <template v-if="form.origen === 'efectivo'">Afecta la caja al {{ form.tipo === 'cobrar' ? 'prestar' : 'recibir' }}</template>
          <template v-else>No afecta caja (ya se movió por fiado o compra)</template>
        </div>

        <div style="font-size:.78rem;color:var(--mut);margin:.5rem 0 .4rem">Nota (opcional)</div>
        <textarea v-model="form.nota" placeholder="Detalles..." rows="2" style="resize:none;font-family:inherit;font-size:.85rem"></textarea>

        <div class="grid2" style="margin-top:.7rem">
          <button class="btn ok" @click="guardarForm" :disabled="!puedoGuardar">
            {{ form.editId ? 'Actualizar' : 'Guardar' }}
          </button>
          <button class="btn ghost" @click="cerrarForm">Cancelar</button>
        </div>
      </div>
    </div>

    <!-- Modal pago -->
    <div v-if="pagoAbierto" class="modal no-print" @click.self="pagoAbierto = null">
      <div class="modal-box">
        <div class="modal-title"><icon name="check" :size="20"></icon> Registrar pago</div>

        <div class="info-box" style="margin-bottom:.7rem">
          <div style="display:flex;justify-content:space-between;font-size:.82rem">
            <span>{{ pagoAbierto.personaNombre }}</span>
            <b :class="pagoAbierto.tipo === 'cobrar' ? 'pos' : 'neg'">Saldo: {{ fmt(saldo(pagoAbierto)) }}</b>
          </div>
          <div style="font-size:.72rem;color:var(--mut);margin-top:.3rem">{{ pagoAbierto.concepto }}</div>
        </div>

        <div style="font-size:.78rem;color:var(--mut);margin-bottom:.4rem">Monto del pago *</div>
        <input v-model="pagoMonto" type="number" inputmode="decimal" step="0.01" placeholder="0.00">

        <div style="font-size:.78rem;color:var(--mut);margin:.5rem 0 .4rem">Nota (opcional)</div>
        <input v-model="pagoNota" type="text" placeholder="Ej: pago parcial" maxlength="60">

        <div class="grid2" style="margin-top:.7rem">
          <button class="btn ok" @click="guardarPago" :disabled="!pagoValido">Confirmar pago</button>
          <button class="btn ghost" @click="pagoAbierto = null">Cancelar</button>
        </div>
      </div>
    </div>

    <!-- Modal detalle -->
    <div v-if="detalle" class="modal no-print" @click.self="detalle = null">
      <div class="modal-box">
        <div class="modal-title"><icon name="list" :size="20"></icon> Historial</div>
        <div style="font-size:.82rem;margin-bottom:.6rem">{{ detalle.personaNombre }} · {{ detalle.concepto }}</div>
        <div style="font-size:.75rem;color:var(--mut);margin-bottom:.4rem">Total: {{ fmt(detalle.montoTotal) }} · Saldo: {{ fmt(saldo(detalle)) }}</div>

        <div v-if="!detalle.pagos || detalle.pagos.length === 0" class="empty">Sin pagos aún</div>
        <div v-for="(p, i) in detalle.pagos" :key="i" class="item" style="padding:.5rem 0">
          <div class="info">
            <div class="nm" style="font-size:.85rem">{{ fmt(p.monto) }}</div>
            <div class="det" style="font-size:.7rem">{{ fmtFH(p.fecha) }}<span v-if="p.nota"> · {{ p.nota }}</span></div>
          </div>
        </div>

        <button class="btn ghost" style="margin-top:.5rem;width:100%" @click="detalle = null">Cerrar</button>
      </div>
    </div>
  </section>
</template>

<script>
import { db, genId, clean, P, n, m, fmt, fmtFecha, fmtFH } from '../db.js';
import { TOAST } from '../constants.js';

export default {
  name: 'DeudasSection',
  props: {
    activo: { type: Boolean, default: false },
    secActiva: { type: Boolean, default: false }
  },
  data() {
    return {
      deudas: [],
      personas: [],
      tab: 'cobrar',
      formAbierto: false,
      form: { editId: '', tipo: 'cobrar', personaId: '', concepto: '', monto: '', origen: 'efectivo', nota: '' },
      pagoAbierto: null,
      pagoMonto: '',
      pagoNota: '',
      detalle: null
    };
  },
  computed: {
    mutColor() { return getComputedStyle(document.documentElement).getPropertyValue('--mut').trim() || '#64748B'; },
    txtColor() { return getComputedStyle(document.documentElement).getPropertyValue('--txt').trim() || '#000'; },
    filtradas() {
      return this.deudas.filter(d => d.tipo === this.tab && d.estado === 'pendiente')
        .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    },
    personasFiltradas() {
      const rol = this.form.tipo === 'cobrar' ? 'cliente' : 'proveedor';
      return this.personas.filter(p => p.roles && p.roles.includes(rol) && !p.archivado)
        .sort((a, b) => a.nombre.localeCompare(b.nombre));
    },
    totalCobrar() {
      return m(this.deudas.filter(d => d.tipo === 'cobrar' && d.estado === 'pendiente').reduce((s, d) => s + this.saldo(d), 0));
    },
    totalPagar() {
      return m(this.deudas.filter(d => d.tipo === 'pagar' && d.estado === 'pendiente').reduce((s, d) => s + this.saldo(d), 0));
    },
    balanceNeto() { return m(this.totalCobrar - this.totalPagar); },
    puedoGuardar() {
      return this.form.personaId && this.form.concepto.trim().length >= 2 && n(this.form.monto) > 0;
    },
    pagoValido() {
      if (!this.pagoAbierto) return false;
      const v = n(this.pagoMonto);
      return v > 0 && v <= this.saldo(this.pagoAbierto) + 0.001;
    }
  },
  watch: {
    activo(v) { if (v) this.cargar(); }
  },
  methods: {
    fmt, fmtFecha, fmtFH,
    inicial(nombre) { return (nombre || '?').trim().charAt(0).toUpperCase(); },
    saldo(d) { return m(n(d.montoTotal) - n(d.montoPagado)); },
    porcentajePagado(d) {
      const t = n(d.montoTotal);
      return t > 0 ? Math.min(100, (n(d.montoPagado) / t) * 100) : 0;
    },

    async cargar() {
      try {
        this.deudas = await db.deudas.toArray();
        this.personas = await db.personas.filter(p => !p.archivado).toArray();
      } catch (e) {
        console.warn('cargar deudas', e);
        this.deudas = [];
        this.personas = [];
      }
    },

    abrirFormNueva() {
      this.form = { editId: '', tipo: this.tab, personaId: '', concepto: '', monto: '', origen: 'efectivo', nota: '' };
      this.formAbierto = true;
    },

    cerrarForm() {
      this.formAbierto = false;
      this.form = { editId: '', tipo: 'cobrar', personaId: '', concepto: '', monto: '', origen: 'efectivo', nota: '' };
    },

    async guardarForm() {
      const persona = this.personas.find(p => p.id === this.form.personaId);
      if (!persona) return;
      const monto = m(n(this.form.monto));
      if (monto <= 0) return;

      const data = {
        id: this.form.editId || genId('d'),
        tipo: this.form.tipo,
        origen: this.form.origen,
        personaId: persona.id,
        personaNombre: persona.nombre,
        concepto: this.form.concepto.trim(),
        montoTotal: monto,
        montoPagado: this.form.editId ? (this.deudas.find(d => d.id === this.form.editId) || {}).montoPagado || 0 : 0,
        pagos: this.form.editId ? (this.deudas.find(d => d.id === this.form.editId) || {}).pagos || [] : [],
        fecha: this.form.editId ? (this.deudas.find(d => d.id === this.form.editId) || {}).fecha || new Date().toISOString() : new Date().toISOString(),
        nota: this.form.nota.trim(),
        estado: 'pendiente'
      };

      try {
        await P(db.deudas, data);

        // Afectar caja si origen = efectivo
        if (this.form.origen === 'efectivo' && !this.form.editId) {
          const esIngreso = data.tipo === 'pagar';
          await P(db.movCaja, {
            id: genId('mc'),
            fecha: new Date().toISOString(),
            tipo: esIngreso ? 'ingreso' : 'egreso',
            monto,
            concepto: (esIngreso ? 'Deuda recibida: ' : 'Préstamo: ') + persona.nombre + ' - ' + data.concepto,
            deudaId: data.id
          });
          await this.$root.recargar && this.$root.recargar(['movCaja']);
        }

        this.cerrarForm();
        await this.cargar();
        if (this.$root.toastMsg) this.$root.toastMsg('Deuda guardada');
      } catch (e) {
        console.error('guardar deuda', e);
      }
    },

    editar(d) {
      this.form = {
        editId: d.id,
        tipo: d.tipo,
        personaId: d.personaId,
        concepto: d.concepto,
        monto: String(d.montoTotal),
        origen: d.origen || 'efectivo',
        nota: d.nota || ''
      };
      this.formAbierto = true;
    },

    abrirPago(d) {
      this.pagoAbierto = d;
      this.pagoMonto = String(this.saldo(d));
      this.pagoNota = '';
    },

    async guardarPago() {
      if (!this.pagoValido) return;
      const d = this.pagoAbierto;
      const monto = m(n(this.pagoMonto));

      const pagos = [...(d.pagos || []), { fecha: new Date().toISOString(), monto, nota: this.pagoNota.trim() }];
      const nuevoPagado = m(n(d.montoPagado) + monto);
      const nuevoEstado = nuevoPagado >= d.montoTotal - 0.001 ? 'saldada' : 'pendiente';

      try {
        await P(db.deudas, { ...d, montoPagado: nuevoPagado, pagos, estado: nuevoEstado });

        // Afectar caja
        const esIngreso = d.tipo === 'cobrar';
        await P(db.movCaja, {
          id: genId('mc'),
          fecha: new Date().toISOString(),
          tipo: esIngreso ? 'ingreso' : 'egreso',
          monto,
          concepto: (esIngreso ? 'Cobro deuda: ' : 'Pago deuda: ') + d.personaNombre + ' - ' + d.concepto,
          deudaId: d.id
        });

        this.pagoAbierto = null;
        await this.cargar();
        if (this.$root.recargar) await this.$root.recargar(['movCaja']);
        if (this.$root.toastMsg) this.$root.toastMsg(nuevoEstado === 'saldada' ? 'Deuda saldada' : 'Pago registrado');
      } catch (e) {
        console.error('guardar pago', e);
      }
    },

    verDetalle(d) { this.detalle = d; },

    async condonar(d) {
      if (!confirm('¿Condonar la deuda de ' + d.personaNombre + ' por ' + this.fmt(this.saldo(d)) + '?\nSe registrará como ' + (d.tipo === 'cobrar' ? 'pérdida' : 'ganancia') + '.')) return;
      try {
        const saldoActual = this.saldo(d);
        // Registrar condonación
        const pagos = [...(d.pagos || []), { fecha: new Date().toISOString(), monto: saldoActual, nota: 'CONDONADA', condonada: true }];
        await P(db.deudas, { ...d, montoPagado: d.montoTotal, pagos, estado: 'condonada' });

        // Si es "cobrar" → pérdida (gasto). Si es "pagar" → ganancia (ingreso)
        if (d.tipo === 'cobrar') {
          await P(db.gastos, {
            id: genId('g'),
            fecha: new Date().toISOString(),
            categoria: 'Incobrable',
            concepto: 'Deuda condonada: ' + d.personaNombre + ' - ' + d.concepto,
            monto: saldoActual,
            nota: '',
            metodoPago: 'otro',
            saleDeCaja: false,
            movId: null,
            deudaId: d.id
          });
        } else {
          await P(db.movCaja, {
            id: genId('mc'),
            fecha: new Date().toISOString(),
            tipo: 'ingreso',
            monto: saldoActual,
            concepto: 'Deuda condonada: ' + d.personaNombre + ' - ' + d.concepto,
            deudaId: d.id
          });
        }

        await this.cargar();
        if (this.$root.recargar) await this.$root.recargar(['gastos', 'movCaja']);
        if (this.$root.toastMsg) this.$root.toastMsg('Deuda condonada');
      } catch (e) {
        console.error('condonar', e);
      }
    }
  }
};
</script>
