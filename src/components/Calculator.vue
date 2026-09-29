<template>
  <Teleport to="body">
    <div v-if="visible" class="calc-overlay" @click.self="cerrar">
      <div class="calc-modal" role="dialog" aria-label="Calculadora">
        <div class="calc-header">
          <span class="calc-title">Calculadora</span>
          <button class="calc-close" @click="cerrar" aria-label="Cerrar">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div class="calc-display" :class="{ 'calc-error': error }">
          <div class="calc-expr">{{ expresion || '0' }}</div>
          <div class="calc-preview" v-if="preview && preview !== expresion">{{ preview }}</div>
        </div>

        <div class="calc-history-head" @click="historialAbierto = !historialAbierto">
          <span>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M3 12a9 9 0 1 0 3-6.7L3 8"></path>
              <path d="M3 3v5h5"></path>
            </svg>
            Historial
            <span class="calc-hist-count">{{ historial.length }}</span>
          </span>
          <span class="calc-chev" :class="{ open: historialAbierto }">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </span>
        </div>

        <transition name="calc-slide">
          <div v-if="historialAbierto" class="calc-history">
            <div v-if="!historial.length" class="calc-history-empty">
              Sin operaciones aún
            </div>
            <div
              v-for="(h, i) in historial"
              :key="i"
              class="calc-history-item"
              @click="usarHistorial(h)"
            >
              <span class="calc-hist-expr">{{ h.expr }}</span>
              <span class="calc-hist-res">{{ h.res }}</span>
            </div>
          </div>
        </transition>

        <div class="calc-grid">
          <!-- Fila 1: funciones -->
          <button class="calc-btn fn" @click="limpiar" title="Limpiar todo">AC</button>
          <button class="calc-btn fn" @click="borrar" title="Borrar">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"></path>
              <line x1="18" y1="9" x2="12" y2="15"></line>
              <line x1="12" y1="9" x2="18" y2="15"></line>
            </svg>
          </button>
          <button class="calc-btn fn" @click="insertar('%')" title="Porcentaje">%</button>
          <button class="calc-btn fn" @click="raiz" title="Raíz cuadrada">√</button>
          <button class="calc-btn op" @click="insertar('÷')" title="Dividir">÷</button>

          <!-- Fila 2 -->
          <button class="calc-btn num" @click="insertar('7')">7</button>
          <button class="calc-btn num" @click="insertar('8')">8</button>
          <button class="calc-btn num" @click="insertar('9')">9</button>
          <button class="calc-btn fn" @click="insertar('(')" title="Paréntesis">(</button>
          <button class="calc-btn op" @click="insertar('×')" title="Multiplicar">×</button>

          <!-- Fila 3 -->
          <button class="calc-btn num" @click="insertar('4')">4</button>
          <button class="calc-btn num" @click="insertar('5')">5</button>
          <button class="calc-btn num" @click="insertar('6')">6</button>
          <button class="calc-btn fn" @click="insertar(')')" title="Paréntesis">)</button>
          <button class="calc-btn op" @click="insertar('−')" title="Restar">−</button>

          <!-- Fila 4 -->
          <button class="calc-btn num" @click="insertar('1')">1</button>
          <button class="calc-btn num" @click="insertar('2')">2</button>
          <button class="calc-btn num" @click="insertar('3')">3</button>
          <button class="calc-btn fn" @click="signo" title="Cambiar signo">±</button>
          <button class="calc-btn op" @click="insertar('+')" title="Sumar">+</button>

          <!-- Fila 5 -->
          <button class="calc-btn num span-2" @click="insertar('0')">0</button>
          <button class="calc-btn num" @click="insertar('.')">,</button>
          <button class="calc-btn eq span-2" @click="calcular" title="Igual">
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <line x1="6" y1="10" x2="18" y2="10"></line>
              <line x1="6" y1="14" x2="18" y2="14"></line>
            </svg>
          </button>
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

      // A ± B% → A ± (A * B / 100)
      s = s.replace(/(\d+\.?\d*)\s*([+\-])\s*(\d+\.?\d*)%/g, (m, a, op, b) => {
        return `(${a}) ${op} ((${a}) * (${b}) / 100)`;
      });
      s = s.replace(/(\d+\.?\d*)%/g, '(($1)/100)');

      if (!/^[\d+\-*/(). ]+$/.test(s)) return null;
      try {
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
      if (this.historial.length > 20) this.historial.pop();
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
          historial: this.historial.slice(0, 20)
        }));
      } catch (e) {}
    },

    cargarEstado() {
      try {
        const raw = localStorage.getItem('calcPro');
        if (!raw) return;
        const state = JSON.parse(raw);
        if (state && typeof state.expresion === 'string') this.expresion = state.expresion;
        if (Array.isArray(state.historial)) this.historial = state.historial.slice(0, 20);
      } catch (e) {}
    }
  }
};
</script>

<style scoped>
.calc-overlay {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  animation: calc-fade .18s ease;
}

@keyframes calc-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}

.calc-modal {
  width: 100%;
  max-width: 380px;
  background: var(--card);
  border: 1px solid var(--brd);
  border-radius: 20px;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255,255,255,0.03) inset;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: calc-pop .22s cubic-bezier(.2, .9, .3, 1.2);
}

@keyframes calc-pop {
  from { transform: scale(.94); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

.calc-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: .85rem 1.1rem;
  border-bottom: 1px solid var(--brd);
}

.calc-title {
  font-weight: 700;
  font-size: .95rem;
  letter-spacing: .2px;
}

.calc-close {
  background: transparent;
  border: none;
  color: var(--mut);
  cursor: pointer;
  padding: .3rem;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all .15s ease;
}

.calc-close:hover { color: var(--txt); background: rgba(255,255,255,.05); }
.calc-close:active { transform: scale(.9); }

.calc-display {
  padding: 1.5rem 1.2rem 1.2rem;
  text-align: right;
  min-height: 110px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: .35rem;
  background: var(--bg);
  transition: background .2s ease;
}

.calc-display.calc-error { background: rgba(239, 68, 68, 0.08); }

.calc-expr {
  font-size: 2rem;
  font-weight: 600;
  word-break: break-all;
  font-variant-numeric: tabular-nums;
  letter-spacing: -.5px;
  line-height: 1.15;
}

.calc-preview {
  font-size: 1rem;
  color: var(--mut);
  font-variant-numeric: tabular-nums;
  letter-spacing: .2px;
}

.calc-error .calc-expr { color: var(--bad); }

.calc-history-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: .55rem 1.1rem;
  font-size: .78rem;
  color: var(--mut);
  border-top: 1px solid var(--brd);
  cursor: pointer;
  user-select: none;
  transition: background .15s ease;
}

.calc-history-head:hover { background: rgba(255,255,255,.03); }

.calc-history-head > span:first-child {
  display: flex;
  align-items: center;
  gap: .35rem;
  font-weight: 600;
  letter-spacing: .2px;
}

.calc-hist-count {
  background: var(--brd);
  color: var(--mut);
  padding: .05rem .4rem;
  border-radius: 10px;
  font-size: .68rem;
  font-weight: 700;
  min-width: 1.2rem;
  text-align: center;
}

.calc-chev {
  transition: transform .2s ease;
  display: inline-flex;
  color: var(--mut);
}

.calc-chev.open { transform: rotate(180deg); }

.calc-history {
  max-height: 180px;
  overflow-y: auto;
  border-top: 1px solid var(--brd);
  background: var(--bg);
}

.calc-history-empty {
  padding: 1.2rem;
  text-align: center;
  font-size: .78rem;
  color: var(--mut);
}

.calc-history-item {
  padding: .55rem 1.1rem;
  border-bottom: 1px solid var(--brd);
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  font-size: .82rem;
  cursor: pointer;
  font-variant-numeric: tabular-nums;
  transition: background .15s ease;
}

.calc-history-item:last-child { border-bottom: none; }
.calc-history-item:hover { background: rgba(255,255,255,.04); }
.calc-history-item:active { background: rgba(255,255,255,.07); }

.calc-hist-expr {
  color: var(--mut);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.calc-hist-res { font-weight: 700; color: var(--pri); }

.calc-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
  padding: 1.1rem;
  background: var(--card);
}

.calc-btn {
  padding: .9rem .3rem;
  border-radius: 14px;
  border: 1px solid var(--brd);
  background: var(--card-2);
  color: var(--txt);
  font-size: 1.15rem;
  font-weight: 600;
  cursor: pointer;
  font-variant-numeric: tabular-nums;
  transition: transform .06s ease, background .12s ease, border-color .12s ease;
  min-height: 54px;
  display: flex;
  align-items: center;
  justify-content: center;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}

.calc-btn:active {
  transform: scale(.94);
  background: rgba(255, 255, 255, 0.08);
}

/* Numeros: neutros */
.calc-btn.num {
  background: var(--card);
  border-color: var(--brd);
  font-weight: 600;
  font-size: 1.2rem;
}

.calc-btn.num:active { background: rgba(255,255,255,.1); }

/* Funciones: sutiles, secundarios */
.calc-btn.fn {
  color: var(--pri);
  background: transparent;
  border-color: var(--brd);
  font-size: 1rem;
  font-weight: 700;
}

.calc-btn.fn:active { background: rgba(33, 150, 243, 0.12); }

/* Operadores: destacados, color primario suave */
.calc-btn.op {
  color: var(--pri);
  background: rgba(33, 150, 243, 0.08);
  border-color: rgba(33, 150, 243, 0.25);
  font-size: 1.35rem;
  font-weight: 700;
}

.calc-btn.op:active {
  background: rgba(33, 150, 243, 0.18);
  transform: scale(.94);
}

/* Igual: accion principal, solido */
.calc-btn.eq {
  background: var(--pri);
  color: #fff;
  border-color: var(--pri);
  box-shadow: 0 4px 14px rgba(33, 150, 243, 0.35);
}

.calc-btn.eq:active {
  filter: brightness(.92);
  transform: scale(.94);
}

.calc-btn.span-2 { grid-column: span 2; }

.calc-slide-enter-active,
.calc-slide-leave-active {
  transition: max-height .22s ease, opacity .18s ease;
  overflow: hidden;
}

.calc-slide-enter-from,
.calc-slide-leave-to { max-height: 0; opacity: 0; }

.calc-slide-enter-to,
.calc-slide-leave-from { max-height: 180px; opacity: 1; }
</style>
