/**
 * Tests de comportamiento de componentes clave:
 *  - Calculator.vue: UI de la calculadora (display, preview, historial, AC, error)
 *  - GlobalSearch.vue: búsqueda global con MiniSearch (fuzzy/prefijo, exclusiones, emisión de navegación)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

import Calculator from '../src/components/Calculator.vue';
import GlobalSearch from '../src/components/GlobalSearch.vue';

// ===== helpers =====
function montarCalc(visible = true) {
  return mount(Calculator, {
    props: { visible },
    global: { stubs: { Teleport: true } },
  });
}

function pulsar(wrapper, titulo) {
  const btn = wrapper.findAll('button').find((b) => b.attributes('title') === titulo);
  if (!btn) throw new Error('Botón no encontrado: ' + titulo);
  return btn.trigger('click');
}

async function teclas(wrapper, texto) {
  for (const ch of texto) {
    const btn = wrapper.findAll('button').find((b) => b.text() === ch);
    if (!btn) throw new Error('Tecla no encontrada: ' + ch);
    await btn.trigger('click');
  }
}

async function esperarResultado() {
  // mathjs carga como chunk dinámico: varias microtasks + un tick
  await flushPromises();
  await new Promise((r) => setTimeout(r, 30));
  await flushPromises();
}

// ===== Calculator.vue =====
describe('Calculator.vue', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('muestra overlay solo cuando visible', () => {
    const oculta = montarCalc(false);
    expect(oculta.find('.calc-modal').exists()).toBe(false);

    const visible = montarCalc(true);
    expect(visible.find('.calc-modal').exists()).toBe(true);
  });

  it('el display muestra 0 con expresión vacía y construye expresiones con los botones', async () => {
    const w = montarCalc(true);
    expect(w.find('.calc-expr').text()).toBe('0');

    await teclas(w, '12');
    const btnSuma = w.findAll('button').find((b) => b.attributes('title') === 'Sumar');
    await btnSuma.trigger('click');
    expect(w.find('.calc-expr').text()).toBe('12+');
  });

  it('no encadena operadores consecutivos (el último reemplaza)', async () => {
    const w = montarCalc(true);
    await teclas(w, '5+');
    const btnMul = w.findAll('button').find((b) => b.attributes('title') === 'Multiplicar');
    await btnMul.trigger('click');
    expect(w.find('.calc-expr').text()).toBe('5×');
  });

  it('calcular() evalúa con mathjs y muestra el resultado', async () => {
    const w = montarCalc(true);
    await teclas(w, '2');
    const btnSuma = w.findAll('button').find((b) => b.attributes('title') === 'Sumar');
    await btnSuma.trigger('click');
    await teclas(w, '3');
    await pulsar(w, 'Igual');
    await esperarResultado();
    expect(w.find('.calc-expr').text()).toBe('5');
  });

  it('porcentaje relacional: 100 + 10% = 110', async () => {
    const w = montarCalc(true);
    await teclas(w, '100');
    const btnSuma = w.findAll('button').find((b) => b.attributes('title') === 'Sumar');
    await btnSuma.trigger('click');
    await teclas(w, '10');
    await pulsar(w, 'Porcentaje');
    await pulsar(w, 'Igual');
    await esperarResultado();
    expect(w.find('.calc-expr').text()).toBe('110');
  });

  it('preview en vivo muestra = resultado parcial mientras se escribe', async () => {
    const w = montarCalc(true);
    await teclas(w, '7');
    const btnMul = w.findAll('button').find((b) => b.attributes('title') === 'Multiplicar');
    await btnMul.trigger('click');
    await teclas(w, '6');
    await esperarResultado();
    expect(w.find('.calc-preview').text()).toBe('= 42');
  });

  it('AC limpia expresión y preview', async () => {
    const w = montarCalc(true);
    await teclas(w, '91');
    const btnSuma = w.findAll('button').find((b) => b.attributes('title') === 'Sumar');
    await btnSuma.trigger('click');
    await teclas(w, '1');
    await pulsar(w, 'Limpiar todo');
    expect(w.find('.calc-expr').text()).toBe('0');
    expect(w.find('.calc-preview').exists()).toBe(false);
  });

  it('expresión inválida marca estado de error sin crashear', async () => {
    const w = montarCalc(true);
    await teclas(w, '5');
    const btnSuma = w.findAll('button').find((b) => b.attributes('title') === 'Sumar');
    await btnSuma.trigger('click');
    await pulsar(w, 'Igual');
    await esperarResultado();
    expect(w.find('.calc-display').classes()).toContain('calc-error');
  });

  it('el historial registra operaciones y al pulsar una entrada reutiliza su resultado', async () => {
    const w = montarCalc(true);
    await teclas(w, '8');
    const btnMul = w.findAll('button').find((b) => b.attributes('title') === 'Multiplicar');
    await btnMul.trigger('click');
    await teclas(w, '8');
    await pulsar(w, 'Igual');
    await esperarResultado();
    expect(w.find('.calc-hist-count').text()).toBe('1');

    // abrir historial y pulsar la entrada
    await w.find('.calc-history-head').trigger('click');
    await esperarResultado();
    const item = w.find('.calc-history-item');
    expect(item.exists()).toBe(true);
    expect(item.find('.calc-hist-res').text()).toBe('64');
    await item.trigger('click');
    expect(w.find('.calc-expr').text()).toBe('64');
  });

  it('cerrar emite close', async () => {
    const w = montarCalc(true);
    await w.find('.calc-close').trigger('click');
    expect(w.emitted('close')).toHaveLength(1);
  });

  it('persiste estado en localStorage al cerrarse (visible -> false)', async () => {
    const w = montarCalc(true);
    await teclas(w, '3');
    const btnSuma = w.findAll('button').find((b) => b.attributes('title') === 'Sumar');
    await btnSuma.trigger('click');
    await teclas(w, '4');
    await w.setProps({ visible: false });
    const raw = localStorage.getItem('calcPro');
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw).expresion).toBe('3+4');
  });
});

// ===== GlobalSearch.vue =====
function estadoBase() {
  return {
    productos: [
      { id: 'p1', nombre: 'Coca Cola 2L' },
      { id: 'p2', nombre: 'Pan de molde' },
      { id: 'p3', nombre: 'Leche entera' },
      { id: 'pX', nombre: 'Coca zero', archivado: true },
    ],
    ventas: [
      { id: 'v1', items: [{ nombre: 'Coca Cola 2L' }, { nombre: 'Pan de molde' }], total: 250 },
      { id: 'v2', items: [{ nombre: 'Leche entera' }], total: 90, anulada: true },
    ],
    socios: [{ id: 's1', nombre: 'Maria Lopez', porcentaje: 50 }],
    gastos: [{ id: 'g1', concepto: 'Pago electricidad', categoria: 'Servicios', monto: 1200 }],
    stockDe: () => 12,
    formatMoney: (v) => '$' + Number(v).toFixed(2),
  };
}

function montarBusqueda(abierto = true, state = estadoBase()) {
  return mount(GlobalSearch, { props: { abierto, state } });
}

async function escribir(wrapper, texto) {
  await wrapper.find('input').setValue(texto);
}

describe('GlobalSearch.vue', () => {
  it('renderiza solo cuando abierto', () => {
    expect(montarBusqueda(false).find('.modal-box').exists()).toBe(false);
    expect(montarBusqueda(true).find('.modal-box').exists()).toBe(true);
  });

  it('sin query muestra la ayuda; con menos de 2 caracteres no busca', async () => {
    const w = montarBusqueda(true);
    expect(w.text()).toContain('Escribe para buscar');

    await escribir(w, 'c');
    expect(w.findAll('.drop-item')).toHaveLength(0);
    expect(w.text()).toContain('Sin resultados');
  });

  it('encuentra productos por prefijo y muestra stock formateado', async () => {
    const w = montarBusqueda(true);
    await escribir(w, 'coc');
    const items = w.findAll('.drop-item');
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(w.text()).toContain('Coca Cola 2L');
    expect(w.text()).toContain('Stock 12');
    // el archivado no aparece
    expect(w.text()).not.toContain('Coca zero');
  });

  it('búsqueda difusa tolera un error de tipeo (fuzzy de MiniSearch)', async () => {
    const w = montarBusqueda(true);
    // 'electricidad' tiene 12 letras: tolerancia ~2 ediciones
    await escribir(w, 'electicidad');
    expect(w.text()).toContain('Servicios: Pago electricidad');
  });

  it('subcadena también matchea (comportamiento previo preservado)', async () => {
    const w = montarBusqueda(true);
    await escribir(w, 'molde');
    expect(w.text()).toContain('Pan de molde');
  });

  it('las ventas anuladas quedan excluidas de los resultados', async () => {
    const w = montarBusqueda(true);
    await escribir(w, 'leche');
    const texto = w.text();
    // el producto "Leche entera" sí aparece
    expect(texto).toContain('Leche entera');
    // pero la venta anulada v2 (que contenía leche) no debe listarse como venta
    const tipos = w.findAll('.badge').map((b) => b.text());
    expect(tipos).not.toContain('venta');
  });

  it('los resultados emiten ir con sección y refId al pulsarlos', async () => {
    const w = montarBusqueda(true);
    await escribir(w, 'coc');
    const item = w.findAll('.drop-item')[0];
    await item.trigger('click');
    const eventos = w.emitted('ir');
    expect(eventos).toBeTruthy();
    const [sec, refId] = eventos[0];
    expect(sec).toBe('productos');
    expect(refId).toBe('p1');
    // limpia el query tras navegar
    expect(w.find('input').element.value).toBe('');
  });

  it('gastos y socios también son encontrables', async () => {
    const w = montarBusqueda(true);
    await escribir(w, 'electricidad');
    expect(w.text()).toContain('Servicios: Pago electricidad');

    await escribir(w, 'maria');
    expect(w.text()).toContain('Maria Lopez');
    expect(w.text()).toContain('50%');
  });

  it('cerrar emite cerrar al pulsar fuera del modal-box', async () => {
    const w = montarBusqueda(true);
    await w.find('.modal').trigger('click');
    expect(w.emitted('cerrar')).toHaveLength(1);
  });
});
