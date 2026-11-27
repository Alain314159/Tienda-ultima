/**
 * Tests de comportamiento de componentes clave:
 *  - GlobalSearch.vue: búsqueda global con MiniSearch (fuzzy/prefijo, exclusiones, emisión de navegación)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

import { createPinia, setActivePinia } from 'pinia';
import VentasView from '../src/views/VentasView.vue';
import { useVentasStore } from '../src/stores/useVentasStore';
import { useConfigStore } from '../src/stores/useConfigStore';
import { useProductosStore } from '../src/stores/useProductosStore';
import GlobalSearch from '../src/components/GlobalSearch.vue';

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
    // MiniSearch se carga bajo demanda (import() dinámico): los microtask
    // flush no bastan — vi.waitFor sondea hasta que el índice se construye.
    // 'electricidad' tiene 12 letras: tolerancia ~2 ediciones
    await escribir(w, 'electicidad');
    await vi.waitFor(() => expect(w.text()).toContain('Servicios: Pago electricidad'), { timeout: 10000 });
  });

  it('mientras MiniSearch carga, la subcadena sigue funcionando (degradación suave)', async () => {
    const w = montarBusqueda(true);
    // Sin esperas: el módulo puede no estar aún, pero la búsqueda por
    // subcadena exacta debe devolver resultados igualmente
    await escribir(w, 'coca');
    expect(w.text()).toContain('Coca Cola 2L');
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

describe('VentasView.vue (regresión v-memo expansión)', () => {
  it('clic en el encabezado de una venta expande el detalle con botones de anulación por ítem', async () => {
    setActivePinia(createPinia());
    const ventasStore = useVentasStore();
    const configStore = useConfigStore();
    const productosStore = useProductosStore();

    configStore.cfg.periodoInicio = new Date(Date.now() - 30 * 86400000).toISOString();
    productosStore.productos = [{ id: 'p_1', nombre: 'A', precio: 25, archivado: false }];
    ventasStore.ventas = [
      {
        id: 'v_multi',
        fecha: new Date().toISOString(),
        items: [
          { productoId: 'p_1', nombre: 'A', cantidad: 3, precio: 25, costo: 45, ganancia: 30, lotesUsados: [] },
          { productoId: 'p_1', nombre: 'A', cantidad: 2, precio: 10, costo: 8, ganancia: 12, lotesUsados: [] },
        ],
        total: 95,
        ganancia: 42,
        anulada: false,
      },
    ];

    const wrapper = mount(VentasView, { global: { stubs: { teleport: true } } });
    await flushPromises();

    // El detalle NO está renderizado antes del clic (v-if)
    expect(wrapper.find('.venta-items-expand').exists()).toBe(false);

    // Clic en el encabezado de la venta
    const info = wrapper.findAll('.item .info')[0];
    expect(info).toBeTruthy();
    await info.trigger('click');
    await flushPromises();

    // REGRESIÓN v-memo: el item debe re-renderizarse y mostrar el detalle
    const expand = wrapper.find('.venta-items-expand');
    expect(expand.exists()).toBe(true);
    // Ambos ítems con su botón de anulación accesible
    const botones = expand.findAll('button');
    expect(botones.length).toBe(2);
    wrapper.unmount();
  });
});
