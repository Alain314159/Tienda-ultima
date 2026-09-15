<template>
  <div v-if="activo" class="onb-overlay">
    <!-- Spotlight -->
    <div v-if="targetRect" class="onb-spotlight" :style="spotlightStyle"></div>

    <!-- Card -->
    <div class="onb-card" :style="cardStyle" @click.stop>
      <div class="onb-header">
        <div class="onb-progress">
          <div class="onb-progress-bar" :style="{ width: progressPct + '%' }"></div>
        </div>
        <button class="onb-skip" @click="saltar">Saltar</button>
      </div>

      <div class="onb-icon">
        <icon :name="pasoActual.icono || 'zap'" :size="26" :color="'#fff'"></icon>
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
        PASO {{ paso + 1 }} DE {{ pasos.length }}
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
  emits: ['cerrar', 'ir'],
  data() {
    return {
      paso: 0,
      targetRect: null,
      _tick: 0
    };
  },
  computed: {
    pasoActual() { return this.pasos[this.paso] || {}; },
    esPrimero() { return this.paso === 0; },
    esUltimo() { return this.paso === this.pasos.length - 1; },
    progressPct() { return ((this.paso + 1) / this.pasos.length) * 100; },
    spotlightStyle() {
      if (!this.targetRect) return { display: 'none' };
      const pad = 6;
      return {
        top: (this.targetRect.top - pad) + 'px',
        left: (this.targetRect.left - pad) + 'px',
        width: (this.targetRect.width + pad * 2) + 'px',
        height: (this.targetRect.height + pad * 2) + 'px'
      };
    },
    cardStyle() {
      const screenH = window.innerHeight;
      const screenW = window.innerWidth;
      const cardW = Math.min(420, screenW - 24);
      const base = {
        width: cardW + 'px',
        left: '50%',
        transform: 'translateX(-50%)',
        maxHeight: '75vh'
      };
      if (!this.targetRect) {
        return Object.assign({}, base, { top: '50%', marginTop: '-200px' });
      }
      const targetMidY = this.targetRect.top + this.targetRect.height / 2;
      const margin = 16;
      if (targetMidY < screenH / 2) {
        // Target arriba -> card abajo
        const top = Math.min(this.targetRect.bottom + margin, screenH - 200);
        return Object.assign({}, base, { top: top + 'px' });
      } else {
        // Target abajo -> card arriba
        const bottom = Math.max(screenH - this.targetRect.top + margin, 100);
        return Object.assign({}, base, { bottom: bottom + 'px', top: 'auto' });
      }
    }
  },
  watch: {
    activo(v) {
      if (v) { this.paso = 0; this.$nextTick(() => this.actualizarTarget()); }
    },
    paso() { this.$nextTick(() => this.actualizarTarget()); }
  },
  methods: {
    siguiente() {
      if (this.esUltimo) return this.cerrar();
      const p = this.pasoActual;
      // Navegar primero, luego avanzar
      if (p.irAntes && p.irAntes.length) {
        p.irAntes.forEach(sec => this.$emit('ir', sec));
      }
      this.paso++;
      const sig = this.pasos[this.paso];
      // Navegar a la seccion del siguiente paso
      if (sig && sig.sec) this.$emit('ir', sig.sec);
    },
    anterior() {
      if (this.paso <= 0) return;
      this.paso--;
      const ant = this.pasos[this.paso];
      if (ant && ant.sec) this.$emit('ir', ant.sec);
    },
    actualizarTarget() {
      const p = this.pasoActual;
      if (!p || !p.target) {
        this.targetRect = null;
        return;
      }
      let intentos = 0;
      const buscar = () => {
        intentos++;
        const el = document.querySelector(p.target);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.height > 0 && rect.width > 0) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => {
              const r2 = el.getBoundingClientRect();
              this.targetRect = {
                top: r2.top, left: r2.left,
                width: r2.width, height: r2.height, bottom: r2.bottom
              };
            }, 350);
            return;
          }
        }
        if (intentos < 8) setTimeout(buscar, 150);
        else this.targetRect = null;
      };
      buscar();
    },
    saltar() { this.cerrar(); },
    cerrar() { this.$emit('cerrar'); }
  },
  mounted() {
    this._onResize = () => {
      clearTimeout(this._rt);
      this._rt = setTimeout(() => this.actualizarTarget(), 200);
    };
    window.addEventListener('resize', this._onResize);
  },
  beforeUnmount() {
    window.removeEventListener('resize', this._onResize);
  }
};
</script>
