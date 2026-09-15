<template>
  <div v-if="activo" class="onb-overlay" @click="overlayClick">
    <!-- Spotlight en el elemento a resaltar -->
    <div v-if="pasoActual && pasoActual.target && targetRect" class="onb-spotlight"
      :style="spotlightStyle"></div>

    <!-- Card del tutorial -->
    <div class="onb-card" :class="cardPosition" :style="cardStyle" @click.stop>
      <div class="onb-header">
        <div class="onb-progress">
          <div class="onb-progress-bar" :style="{ width: progressPct + '%' }"></div>
        </div>
        <button class="onb-skip" @click="saltar">Saltar</button>
      </div>

      <div class="onb-icon">
        <icon :name="pasoActual.icono || 'zap'" :size="28" :color="'#fff'"></icon>
      </div>

      <div class="onb-title">{{ pasoActual.titulo }}</div>
      <div class="onb-text" v-html="pasoActual.texto"></div>

      <div v-if="pasoActual.bullets && pasoActual.bullets.length" class="onb-bullets">
        <div v-for="(b, i) in pasoActual.bullets" :key="i" class="onb-bullet">
          <span class="onb-dot"></span>
          <span v-html="b"></span>
        </div>
      </div>

      <div class="onb-actions">
        <button v-if="!esPrimero" class="btn ghost" style="flex:1;margin:0" @click="anterior">Atras</button>
        <button class="btn pri" style="flex:2;margin:0" @click="siguiente">
          {{ esUltimo ? 'Empezar a usar' : 'Siguiente' }}
        </button>
      </div>

      <div class="onb-step-label">
        Paso {{ paso + 1 }} de {{ pasos.length }}
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'Onboarding',
  props: {
    activo: { type: Boolean, default: false },
    pasos: { type: Array, required: true }
  },
  emits: ['cerrar', 'ir', 'accion'],
  data() {
    return {
      paso: 0,
      targetRect: null,
      _resizeTimer: null
    };
  },
  computed: {
    pasoActual() { return this.pasos[this.paso] || {}; },
    esPrimero() { return this.paso === 0; },
    esUltimo() { return this.paso === this.pasos.length - 1; },
    progressPct() { return ((this.paso + 1) / this.pasos.length) * 100; },
    cardPosition() {
      if (!this.targetRect) return 'onb-center';
      const screenH = window.innerHeight;
      const midY = this.targetRect.top + this.targetRect.height / 2;
      return midY > screenH / 2 ? 'onb-top' : 'onb-bottom';
    },
    spotlightStyle() {
      if (!this.targetRect) return {};
      const pad = 8;
      return {
        top: (this.targetRect.top - pad) + 'px',
        left: (this.targetRect.left - pad) + 'px',
        width: (this.targetRect.width + pad * 2) + 'px',
        height: (this.targetRect.height + pad * 2) + 'px'
      };
    },
    cardStyle() {
      if (!this.targetRect) return {};
      const screenH = window.innerHeight;
      const midY = this.targetRect.top + this.targetRect.height / 2;
      if (midY > screenH / 2) {
        return { bottom: (screenH - this.targetRect.top + 20) + 'px' };
      }
      return { top: (this.targetRect.bottom + 20) + 'px' };
    }
  },
  watch: {
    activo(v) {
      if (v) { this.paso = 0; this.actualizarTarget(); }
    },
    paso() { this.actualizarTarget(); }
  },
  methods: {
    overlayClick() {
      // No cerrar al click afuera para evitar saltarse pasos
    },
    siguiente() {
      if (this.esUltimo) return this.cerrar();
      this.paso++;
      this.$nextTick(() => {
        this.ejecutarAccionPaso();
      });
    },
    anterior() {
      if (this.paso > 0) {
        this.paso--;
        this.$nextTick(() => this.ejecutarAccionPaso());
      }
    },
    ejecutarAccionPaso() {
      const p = this.pasoActual;
      if (p.sec) this.$emit('ir', p.sec);
      if (p.accion) this.$emit('accion', p.accion);
      setTimeout(() => this.actualizarTarget(), 400);
    },
    actualizarTarget() {
      const p = this.pasoActual;
      if (!p || !p.target) { this.targetRect = null; return; }
      try {
        const el = document.querySelector(p.target);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setTimeout(() => {
            const rect = el.getBoundingClientRect();
            this.targetRect = { top: rect.top, left: rect.left, width: rect.width, height: rect.height, bottom: rect.bottom };
          }, 350);
        } else {
          this.targetRect = null;
        }
      } catch (e) { this.targetRect = null; }
    },
    saltar() {
      this.cerrar();
    },
    cerrar() {
      this.$emit('cerrar');
    }
  },
  mounted() {
    window.addEventListener('resize', () => {
      clearTimeout(this._resizeTimer);
      this._resizeTimer = setTimeout(() => this.actualizarTarget(), 200);
    });
  }
};
</script>
