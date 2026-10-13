<template>
  <Teleport to="body">
    <div v-if="visible" class="calc-overlay" @click.self="cerrar">
      <div class="calc-modal" role="dialog" aria-label="Calculadora">
        <div class="calc-header">
          <span class="calc-title">Calculadora</span>
          <button class="calc-close" @click="cerrar" aria-label="Cerrar">
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            >
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
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            >
              <path d="M3 12a9 9 0 1 0 3-6.7L3 8"></path>
              <path d="M3 3v5h5"></path>
            </svg>
            Historial
            <span class="calc-hist-count">{{ historial.length }}</span>
          </span>
          <span class="calc-chev" :class="{ open: historialAbierto }">
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            >
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </span>
        </div>

        <transition name="calc-slide">
          <div v-if="historialAbierto" class="calc-history">
            <div v-if="!historial.length" class="calc-history-empty">Sin operaciones aún</div>
            <div v-for="(h, i) in historial" :key="i" class="calc-history-item" @click="usarHistorial(h)">
              <span class="calc-hist-expr">{{ h.expr }}</span>
              <span class="calc-hist-res">{{ h.res }}</span>
            </div>
          </div>
        </transition>

        <div class="calc-grid">
          <!-- Fila 1: funciones -->
          <button class="calc-btn fn" @click="limpiar" title="Limpiar todo">AC</button>
          <button class="calc-btn fn" @click="borrar" title="Borrar">
            <svg
              viewBox="0 0 24 24"
              width="22"
              height="22"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            >
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
            <svg
              viewBox="0 0 24 24"
              width="26"
              height="26"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
            >
              <line x1="6" y1="10" x2="18" y2="10"></line>
              <line x1="6" y1="14" x2="18" y2="14"></line>
            </svg>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { evaluar, evaluarAsync, precargarEvaluador } from '../services/calculadora';

defineOptions({ name: 'Calculator' });

const props = defineProps({
  visible: { type: Boolean, default: false },
});
const emit = defineEmits(['close']);

const expresion = ref('');
const preview = ref('');
const error = ref(false);
const historial = ref<{ expr: string; res: string }[]>([]);
const historialAbierto = ref(false);

watch(
  () => props.visible,
  (v) => {
    if (v) {
      precargarEvaluador(); // code-splitting: mathjs listo antes del primer "="
      cargarEstado();
      actualizarPreview();
    } else {
      guardarEstado();
    }
  }
);

onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));

function cerrar() {
  emit('close');
}

function onKey(e) {
  if (!props.visible) return;
  const k = e.key;
  if (k >= '0' && k <= '9') {
    insertar(k);
    e.preventDefault();
  } else if (k === '.' || k === ',') {
    insertar('.');
    e.preventDefault();
  } else if (k === '+') {
    insertar('+');
    e.preventDefault();
  } else if (k === '-') {
    insertar('−');
    e.preventDefault();
  } else if (k === '*') {
    insertar('×');
    e.preventDefault();
  } else if (k === '/') {
    insertar('÷');
    e.preventDefault();
  } else if (k === '%') {
    insertar('%');
    e.preventDefault();
  } else if (k === '(' || k === ')') {
    insertar(k);
    e.preventDefault();
  } else if (k === 'Enter' || k === '=') {
    calcular();
    e.preventDefault();
  } else if (k === 'Backspace') {
    borrar();
    e.preventDefault();
  } else if (k === 'Escape') {
    cerrar();
    e.preventDefault();
  } else if (k === 'Delete' || k === 'c' || k === 'C') {
    limpiar();
    e.preventDefault();
  }
}

function insertar(ch) {
  error.value = false;
  const ops = ['+', '−', '×', '÷'];
  const last = expresion.value.slice(-1);
  if (ops.includes(ch) && ops.includes(last)) {
    expresion.value = expresion.value.slice(0, -1) + ch;
  } else if (ch === '.' && /\.\d*$/.test(expresion.value)) {
    return;
  } else {
    expresion.value += ch;
  }
  actualizarPreview();
}

function borrar() {
  error.value = false;
  expresion.value = expresion.value.slice(0, -1);
  actualizarPreview();
}

function limpiar() {
  expresion.value = '';
  preview.value = '';
  error.value = false;
}

function signo() {
  if (!expresion.value) {
    expresion.value = '−';
    return;
  }
  if (expresion.value.startsWith('−')) {
    expresion.value = expresion.value.slice(1);
  } else {
    expresion.value = '−' + expresion.value;
  }
  actualizarPreview();
}

async function raiz() {
  const r = await evaluarAsync(expresion.value);
  if (r === null || r < 0) {
    error.value = true;
    return;
  }
  expresion.value = formatear(Math.sqrt(r));
  actualizarPreview();
}

function actualizarPreview() {
  const r = evaluar(expresion.value);
  if (r !== null && isFinite(r)) {
    preview.value = '= ' + formatear(r);
  } else {
    preview.value = '';
  }
}

function formatear(n) {
  if (!isFinite(n)) return '∞';
  const r = Math.round(n * 1e10) / 1e10;
  return String(r);
}

function calcular() {
  if (!expresion.value) return;
  evaluarAsync(expresion.value).then((r) => {
    if (r === null || !isFinite(r)) {
      error.value = true;
      return;
    }
    const res = formatear(r);
    const expr = expresion.value;
    historial.value.unshift({ expr, res });
    if (historial.value.length > 20) historial.value.pop();
    guardarEstado();
    expresion.value = res;
    preview.value = '';
    error.value = false;
  });
}

function usarHistorial(h: { expr: string; res: string }) {
  expresion.value = h.res;
  actualizarPreview();
}

function guardarEstado() {
  try {
    localStorage.setItem(
      'calcPro',
      JSON.stringify({
        expresion: expresion.value,
        historial: historial.value.slice(0, 20),
      })
    );
  } catch {}
}

function cargarEstado() {
  try {
    const raw = localStorage.getItem('calcPro');
    if (!raw) return;
    const state = JSON.parse(raw);
    if (state && typeof state.expresion === 'string') expresion.value = state.expresion;
    if (Array.isArray(state.historial)) historial.value = state.historial.slice(0, 20);
  } catch {}
}
</script>

<style scoped>
.calc-overlay {
  position: fixed;
  inset: 0;
  background: rgb(0 0 0 / 60%);
  backdrop-filter: blur(6px);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  animation: calc-fade 0.18s ease;
}

@keyframes calc-fade {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

.calc-modal {
  width: 100%;
  max-width: 380px;
  background: var(--card);
  border: 1px solid var(--brd);
  border-radius: 20px;
  box-shadow:
    0 24px 80px rgb(0 0 0 / 50%),
    0 0 0 1px rgb(255 255 255 / 3%) inset;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: calc-pop 0.22s cubic-bezier(0.2, 0.9, 0.3, 1.2);
}

@keyframes calc-pop {
  from {
    transform: scale(0.94);
    opacity: 0;
  }

  to {
    transform: scale(1);
    opacity: 1;
  }
}

.calc-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.85rem 1.1rem;
  border-bottom: 1px solid var(--brd);
}

.calc-title {
  font-weight: 700;
  font-size: 0.95rem;
  letter-spacing: 0.2px;
}

.calc-close {
  background: transparent;
  border: none;
  color: var(--mut);
  cursor: pointer;
  padding: 0.3rem;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.calc-close:hover {
  color: var(--txt);
  background: rgb(255 255 255 / 5%);
}

.calc-close:active {
  transform: scale(0.9);
}

.calc-display {
  padding: 1.5rem 1.2rem 1.2rem;
  text-align: right;
  min-height: 110px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 0.35rem;
  background: var(--bg);
  transition: background 0.2s ease;
}

.calc-display.calc-error {
  background: rgb(239 68 68 / 8%);
}

.calc-expr {
  font-size: 2rem;
  font-weight: 600;
  word-break: break-all;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.5px;
  line-height: 1.15;
}

.calc-preview {
  font-size: 1rem;
  color: var(--mut);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.2px;
}

.calc-error .calc-expr {
  color: var(--bad);
}

.calc-history-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.55rem 1.1rem;
  font-size: 0.78rem;
  color: var(--mut);
  border-top: 1px solid var(--brd);
  cursor: pointer;
  user-select: none;
  transition: background 0.15s ease;
}

.calc-history-head:hover {
  background: rgb(255 255 255 / 3%);
}

.calc-history-head > span:first-child {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-weight: 600;
  letter-spacing: 0.2px;
}

.calc-hist-count {
  background: var(--brd);
  color: var(--mut);
  padding: 0.05rem 0.4rem;
  border-radius: 10px;
  font-size: 0.68rem;
  font-weight: 700;
  min-width: 1.2rem;
  text-align: center;
}

.calc-chev {
  transition: transform 0.2s ease;
  display: inline-flex;
  color: var(--mut);
}

.calc-chev.open {
  transform: rotate(180deg);
}

.calc-history {
  max-height: 180px;
  overflow-y: auto;
  border-top: 1px solid var(--brd);
  background: var(--bg);
}

.calc-history-empty {
  padding: 1.2rem;
  text-align: center;
  font-size: 0.78rem;
  color: var(--mut);
}

.calc-history-item {
  padding: 0.55rem 1.1rem;
  border-bottom: 1px solid var(--brd);
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  font-size: 0.82rem;
  cursor: pointer;
  font-variant-numeric: tabular-nums;
  transition: background 0.15s ease;
}

.calc-history-item:last-child {
  border-bottom: none;
}

.calc-history-item:hover {
  background: rgb(255 255 255 / 4%);
}

.calc-history-item:active {
  background: rgb(255 255 255 / 7%);
}

.calc-hist-expr {
  color: var(--mut);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.calc-hist-res {
  font-weight: 700;
  color: var(--pri);
}

.calc-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
  padding: 1.1rem;
  background: var(--card);
}

.calc-btn {
  padding: 0.9rem 0.3rem;
  border-radius: 14px;
  border: 1px solid var(--brd);
  background: var(--card-2);
  color: var(--txt);
  font-size: 1.15rem;
  font-weight: 600;
  cursor: pointer;
  font-variant-numeric: tabular-nums;
  transition:
    transform 0.06s ease,
    background 0.12s ease,
    border-color 0.12s ease;
  min-height: 54px;
  display: flex;
  align-items: center;
  justify-content: center;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}

.calc-btn:active {
  transform: scale(0.94);
  background: rgb(255 255 255 / 8%);
}

/* Numeros: neutros */
.calc-btn.num {
  background: var(--card);
  border-color: var(--brd);
  font-weight: 600;
  font-size: 1.2rem;
}

.calc-btn.num:active {
  background: rgb(255 255 255 / 10%);
}

/* Funciones: sutiles, secundarios */
.calc-btn.fn {
  color: var(--pri);
  background: transparent;
  border-color: var(--brd);
  font-size: 1rem;
  font-weight: 700;
}

.calc-btn.fn:active {
  background: rgb(33 150 243 / 12%);
}

/* Operadores: destacados, color primario suave */
.calc-btn.op {
  color: var(--pri);
  background: rgb(33 150 243 / 8%);
  border-color: rgb(33 150 243 / 25%);
  font-size: 1.35rem;
  font-weight: 700;
}

.calc-btn.op:active {
  background: rgb(33 150 243 / 18%);
  transform: scale(0.94);
}

/* Igual: accion principal, solido */
.calc-btn.eq {
  background: var(--pri);
  color: #fff;
  border-color: var(--pri);
  box-shadow: 0 4px 14px rgb(33 150 243 / 35%);
}

.calc-btn.eq:active {
  filter: brightness(0.92);
  transform: scale(0.94);
}

.calc-btn.span-2 {
  grid-column: span 2;
}

.calc-slide-enter-active,
.calc-slide-leave-active {
  transition:
    max-height 0.22s ease,
    opacity 0.18s ease;
  overflow: hidden;
}

.calc-slide-enter-from,
.calc-slide-leave-to {
  max-height: 0;
  opacity: 0;
}

.calc-slide-enter-to,
.calc-slide-leave-from {
  max-height: 180px;
  opacity: 1;
}
</style>
