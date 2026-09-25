<template>
  <Teleport to="body">
    <div v-if="visible" class="calc-overlay" @click.self="cerrar">
      <div class="calc-modal" role="dialog" aria-label="Calculadora">
        <div class="calc-header">
          <span class="calc-title">Calculadora</span>
          <button class="calc-close" @click="cerrar" aria-label="Cerrar">×</button>
        </div>

        <div class="calc-display" :class="{ 'calc-error': error }">
          <div class="calc-expr">{{ expresion || '0' }}</div>
          <div class="calc-preview" v-if="preview && preview !== expresion">{{ preview }}</div>
        </div>

        <div class="calc-history-head" @click="historialAbierto = !historialAbierto">
          <span>Historial ({{ historial.length }})</span>
          <span class="calc-chev" :class="{ open: historialAbierto }">▾</span>
        </div>
        <transition name="calc-slide">
          <div v-if="historialAbierto" class="calc-history">
            <div v-if="!historial.length" class="calc-history-empty">Sin operaciones aún</div>
            <div
              v-for="(h, i) in historial"
              :key="i"
              class="calc-history-item"
              @click="usarHistorial(h)"
            >
              <span class="calc-hist-expr">{{ h.expr }}</span>
              <span class="calc-hist-res">= {{ h.res }}</span>
            </div>
          </div>
        </transition>

        <div class="calc-grid">
          <button class="calc-btn fn" @click="limpiar">C</button>
          <button class="calc-btn fn" @click="borrar">←</button>
          <button class="calc-btn fn" @click="insertar('(')">(</button>
          <button class="calc-btn fn" @click="insertar(')')">)</button>
          <button class="calc-btn op" @click="insertar('÷')">÷</button>

          <button class="calc-btn" @click="insertar('7')">7</button>
          <button class="calc-btn" @click="insertar('8')">8</button>
          <button class="calc-btn" @click="insertar('9')">9</button>
          <button class="calc-btn fn" @click="raiz">√</button>
          <button class="calc-btn op" @click="insertar('×')">×</button>

          <button class="calc-btn" @click="insertar('4')">4</button>
          <button class="calc-btn" @click="insertar('5')">5</button>
          <button class="calc-btn" @click="insertar('6')">6</button>
          <button class="calc-btn fn" @click="insertar('%')">%</button>
          <button class="calc-btn op" @click="insertar('−')">−</button>

          <button class="calc-btn" @click="insertar('1')">1</button>
          <button class="calc-btn" @click="insertar('2')">2</button>
          <button class="calc-btn" @click="insertar('3')">3</button>
          <button class="calc-btn fn" @click="signo">±</button>
          <button class="calc-btn op" @click="insertar('+')">+</button>

          <button class="calc-btn span-2" @click="insertar('0')">0</button>
          <button class="calc-btn" @click="insertar('.')">.</button>
          <button class="calc-btn eq span-2" @click="calcular">=</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script>
export default {
  name: 'Calculator',
  props: {
    visible: { type: Boolean, default: false }
  },
  emits: ['close'],
  data() {
    return {
      expresion: '',
      preview: '',
      error: false,
      historial: [],
      historialAbierto: false
    };
  },
  watch: {
    visible(v) {
      if (v) {
        this.cargarEstado();
        this.actualizarPreview();
      } else {
        this.guardarEstado();
      }
    }
  },
  mounted() {
    window.addEventListener('keydown', this.onKey);
  },
  beforeUnmount() {
    window.removeEventListener('keydown', this.onKey);
  },
  methods: {
    cerrar() { this.$emit('close'); },

    onKey(e) {
      if (!this.visible) return;
      const k = e.key;
      if (k >= '0' && k <= '9') { this.insertar(k); e.preventDefault(); }
      else if (k === '.' || k === ',') { this.insertar('.'); e.preventDefault(); }
      else if (k === '+') { this.insertar('+'); e.preventDefault(); }
      else if (k === '-') { this.insertar('−'); e.preventDefault(); }
      else if (k === '*') { this.insertar('×'); e.preventDefault(); }
      else if (k === '/') { this.insertar('÷'); e.preventDefault(); }
      else if (k === '%') { this.insertar('%'); e.preventDefault(); }
      else if (k === '(' || k === ')') { this.insertar(k); e.preventDefault(); }
      else if (k === 'Enter' || k === '=') { this.calcular(); e.preventDefault(); }
      else if (k === 'Backspace') { this.borrar(); e.preventDefault(); }
      else if (k === 'Escape') { this.cerrar(); e.preventDefault(); }
      else if (k === 'Delete' || k === 'c' || k === 'C') { this.limpiar(); e.preventDefault(); }
    },

    insertar(ch) {
      this.error = false;
      const ops = ['+', '−', '×', '÷'];
      const last = this.expresion.slice(-1);
      if (ops.includes(ch) && ops.includes(last)) {
        this.expresion = this.expresion.slice(0, -1) + ch;
      } else if (ch === '.' && /\.\d*$/.test(this.expresion)) {
        return;
      } else {
        this.expresion += ch;
      }
      this.actualizarPreview();
    },

    borrar() {
      this.error = false;
      this.expresion = this.expresion.slice(0, -1);
      this.actualizarPreview();
    },

    limpiar() {
      this.expresion = '';
      this.preview = '';
      this.error = false;
    },

    signo() {
      if (!this.expresion) { this.expresion = '−'; return; }
      if (this.expresion.startsWith('−')) {
        this.expresion = this.expresion.slice(1);
      } else {
        this.expresion = '−' + this.expresion;
      }
      this.actualizarPreview();
    },

    raiz() {
      const r = this.evaluar(this.expresion);
      if (r === null || r < 0) { this.error = true; return; }
      this.expresion = this.formatear(Math.sqrt(r));
      this.actualizarPreview();
    },

    actualizarPreview() {
      const r = this.evaluar(this.expresion);
      if (r !== null && isFinite(r)) {
        this.preview = '= ' + this.formatear(r);
      } else {
        this.preview = '';
      }
    },

    formatear(n) {
      if (!isFinite(n)) return '∞';
      const r = Math.round(n * 1e10) / 1e10;
      return String(r);
    },

    evaluar(expr) {
      if (!expr || !expr.trim()) return null;
      let s = expr.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');

      // A ± B% → A ± (A * B / 100)   (ej: 500+10% = 550)
      s = s.replace(/(\d+\.?\d*)\s*([+\-])\s*(\d+\.?\d*)%/g, (m, a, op, b) => {
        return `(${a}) ${op} ((${a}) * (${b}) / 100)`;
      });
      // Resto de % → /100
      s = s.replace(/(\d+\.?\d*)%/g, '(($1)/100)');

      if (!/^[\d+\-*/(). ]+$/.test(s)) return null;
      try {
        // eslint-disable-next-line no-new-func
        const r = Function('"use strict"; return (' + s + ')')();
        return typeof r === 'number' ? r : null;
      } catch (e) {
        return null;
      }
    },

    calcular() {
      if (!this.expresion) return;
      const r = this.evaluar(this.expresion);
      if (r === null || !isFinite(r)) { this.error = true; return; }
      const res = this.formatear(r);
      const expr = this.expresion;
      this.historial.unshift({ expr, res });
      if (this.historial.length > 10) this.historial.pop();
      this.guardarEstado();
      this.expresion = res;
      this.preview = '';
      this.error = false;
    },

    usarHistorial(h) {
      this.expresion = h.res;
      this.actualizarPreview();
    },

    guardarEstado() {
      try {
        localStorage.setItem('calcPro', JSON.stringify({
          expresion: this.expresion,
          historial: this.historial.slice(0, 10)
        }));
      } catch (e) {}
    },

    cargarEstado() {
      try {
        const raw = localStorage.getItem('calcPro');
        if (!raw) return;
        const state = JSON.parse(raw);
        if (state && typeof state.expresion === 'string') this.expresion = state.expresion;
        if (Array.isArray(state.historial)) this.historial = state.historial.slice(0, 10);
      } catch (e) {}
    }
  }
};
</script>

<style scoped>
.calc-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,.55);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  z-index: 9999;
  display: flex; align-items: center; justify-content: center;
  padding: 1rem;
  animation: calc-fade .15s ease;
}
@keyframes calc-fade { from { opacity: 0; } to { opacity: 1; } }

.calc-modal {
  width: 100%; max-width: 360px;
  background: var(--card);
  border: 1px solid var(--brd);
  border-radius: 18px;
  box-shadow: 0 20px 60px rgba(0,0,0,.4);
  display: flex; flex-direction: column;
  overflow: hidden;
  animation: calc-pop .18s cubic-bezier(.2,.9,.3,1.3);
}
@keyframes calc-pop { from { transform: scale(.92); opacity: 0; } to { transform: scale(1); opacity: 1; } }

.calc-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: .75rem 1rem;
  border-bottom: 1px solid var(--brd);
}
.calc-title { font-weight: 700; font-size: .95rem; }
.calc-close {
  background: transparent; border: none;
  font-size: 1.6rem; line-height: 1;
  color: var(--mut); cursor: pointer;
  padding: 0 .25rem;
}
.calc-close:active { transform: scale(.9); }

.calc-display {
  padding: 1rem 1.1rem .75rem;
  text-align: right;
  min-height: 84px;
  display: flex; flex-direction: column; justify-content: flex-end;
  gap: .15rem;
  background: var(--bg);
}
.calc-expr {
  font-size: 1.6rem; font-weight: 600;
  word-break: break-all;
  font-variant-numeric: tabular-nums;
}
.calc-preview {
  font-size: .9rem; color: var(--mut);
  font-variant-numeric: tabular-nums;
}
.calc-error .calc-expr { color: var(--bad); }

.calc-history-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: .55rem 1.1rem;
  font-size: .78rem; color: var(--mut);
  border-top: 1px solid var(--brd);
  cursor: pointer; user-select: none;
}
.calc-history-head:active { background: rgba(255,255,255,.03); }
.calc-chev { transition: transform .2s; display: inline-block; }
.calc-chev.open { transform: rotate(180deg); }

.calc-history {
  max-height: 180px; overflow-y: auto;
  border-top: 1px solid var(--brd);
  background: var(--bg);
}
.calc-history-empty {
  padding: 1rem; text-align: center;
  font-size: .78rem; color: var(--mut);
}
.calc-history-item {
  padding: .5rem 1.1rem;
  border-bottom: 1px solid var(--brd);
  display: flex; justify-content: space-between; gap: 1rem;
  font-size: .82rem; cursor: pointer;
  font-variant-numeric: tabular-nums;
}
.calc-history-item:last-child { border-bottom: none; }
.calc-history-item:active { background: rgba(255,255,255,.05); }
.calc-hist-expr { color: var(--mut); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.calc-hist-res { font-weight: 700; color: var(--pri); }

.calc-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
  padding: 1rem;
}
.calc-btn {
  padding: .9rem .3rem;
  border-radius: 12px;
  border: 1px solid var(--brd);
  background: var(--card-2);
  color: inherit;
  font-size: 1.1rem; font-weight: 600;
  cursor: pointer;
  font-variant-numeric: tabular-nums;
  transition: transform .06s ease, background .15s ease;
  min-height: 52px;
}
.calc-btn:active { transform: scale(.95); background: rgba(255,255,255,.08); }
.calc-btn.fn { color: var(--pri); font-size: 1rem; }
.calc-btn.op { color: var(--pri); font-size: 1.15rem; }
.calc-btn.eq {
  background: var(--pri);
  color: #fff;
  border-color: var(--pri);
  font-size: 1.2rem;
}
.calc-btn.eq:active { filter: brightness(.9); }
.calc-btn.span-2 { grid-column: span 2; }

.calc-slide-enter-active, .calc-slide-leave-active { transition: max-height .22s ease, opacity .18s ease; overflow: hidden; }
.calc-slide-enter-from, .calc-slide-leave-to { max-height: 0; opacity: 0; }
.calc-slide-enter-to, .calc-slide-leave-from { max-height: 180px; opacity: 1; }
</style>
