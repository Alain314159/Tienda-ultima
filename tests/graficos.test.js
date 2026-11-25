/**
 * Tests del composable de gráficos (useGraficos):
 * - datosVentas: buckets día (14) / semana (8) / mes (6), asignación de
 *   ventas al bucket correcto y exclusión de anuladas
 * - topProductos: top 6 por cantidad o margen, filtro de período y anuladas
 * - setters que persisten en config (con no-op si el valor no cambia)
 *
 * Reloj fijado en 2026-10-14T12:00 para que los bordes de período sean
 * deterministas (semana = 8-14 oct, mes = octubre).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { createPinia, setActivePinia } from 'pinia';

import { useGraficos } from '../src/composables/useGraficos';
import { useConfigStore } from '../src/stores/useConfigStore';
import { useVentasStore } from '../src/stores/useVentasStore';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T12:00:00'));
  setActivePinia(createPinia());
});

afterEach(() => {
  vi.useRealTimers();
});

function venta(id, fecha, items, total, ganancia, anulada = false) {
  return { id, fecha, items, total, ganancia, anulada };
}

function item(productoId, nombre, cantidad, precio, ganancia) {
  return { productoId, nombre, cantidad, precio, ganancia, costo: precio * cantidad - ganancia };
}

describe('datosVentas: buckets por vista', () => {
  it('vista mes: 6 buckets mensuales y la venta de hoy cae en el último', () => {
    const configStore = useConfigStore();
    configStore.cfg.graficoVista = 'mes';
    const ventas = useVentasStore();
    ventas.ventas = [
      venta('v_1', new Date().toISOString(), [], 150, 40),
      venta('v_2', new Date().toISOString(), [], 50, 10, true), // anulada
    ];

    const { datosVentas } = useGraficos();
    const data = datosVentas();

    expect(data).toHaveLength(6);
    expect(data.map((b) => b.tipo)).toEqual(Array(6).fill('mes'));
    const ultimo = data[5];
    expect(ultimo.v).toBe(150); // la anulada no suma
    expect(ultimo.g).toBe(40);
    // Los buckets anteriores están vacíos
    expect(data.slice(0, 5).every((b) => b.v === 0 && b.g === 0)).toBe(true);
  });

  it('vista dia: 14 buckets diarios, hoy es el último', () => {
    const configStore = useConfigStore();
    configStore.cfg.graficoVista = 'dia';
    const ventas = useVentasStore();
    const hace3d = new Date(Date.now() - 3 * 86400000).toISOString();
    ventas.ventas = [venta('v_1', new Date().toISOString(), [], 100, 25), venta('v_2', hace3d, [], 200, 50)];

    const { datosVentas } = useGraficos();
    const data = datosVentas();

    expect(data).toHaveLength(14);
    expect(data.every((b) => b.tipo === 'dia')).toBe(true);
    expect(data[13].v).toBe(100);
    expect(data[13].g).toBe(25);
    expect(data[10].v).toBe(200); // hace 3 días
    expect(data[10].g).toBe(50);
  });

  it('vista semana: 8 buckets semanales cubriendo hoy', () => {
    const configStore = useConfigStore();
    configStore.cfg.graficoVista = 'semana';
    const ventas = useVentasStore();
    ventas.ventas = [venta('v_1', new Date().toISOString(), [], 80, 20)];

    const { datosVentas } = useGraficos();
    const data = datosVentas();

    expect(data).toHaveLength(8);
    expect(data[7].v).toBe(80);
    expect(data[7].g).toBe(20);
  });

  it('venta fuera de todos los buckets no rompe ni cuenta', () => {
    const configStore = useConfigStore();
    configStore.cfg.graficoVista = 'dia';
    const ventas = useVentasStore();
    ventas.ventas = [venta('v_vieja', '2020-01-01T00:00:00.000Z', [], 999, 99)];

    const { datosVentas } = useGraficos();
    const data = datosVentas();
    expect(data.reduce((s, b) => s + b.v, 0)).toBe(0);
  });
});

describe('topProductos', () => {
  function semillarVentas() {
    const ventas = useVentasStore();
    const ahora = new Date().toISOString();
    const hace10d = new Date(Date.now() - 10 * 86400000).toISOString();
    const items = [];
    // 7 productos: cantidades 1..7, ganancias decrecientes para diferenciar rankings
    for (let i = 1; i <= 7; i++) {
      items.push(item('p_' + i, 'Prod ' + i, i, 10, 8 - i));
    }
    ventas.ventas = [
      venta('v_1', ahora, items, 0, 0),
      venta('v_2', hace10d, [item('p_viejo', 'Viejo', 100, 10, 5)], 0, 0), // fuera de la semana
      venta('v_3', ahora, [item('p_anul', 'Anulado', 100, 10, 5)], 0, 0, true),
    ];
  }

  it('top 6 por cantidad (vendidos), excluye anuladas y respeta el período', () => {
    semillarVentas();
    const configStore = useConfigStore();
    configStore.cfg.graficoProdPeriodo = 'semana';
    configStore.cfg.graficoProdTipo = 'vendidos';

    const { topProductos } = useGraficos();
    const top = topProductos();

    expect(top).toHaveLength(6);
    expect(top[0].id).toBe('p_7'); // el más vendido dentro de la semana
    expect(top.map((x) => x.id)).not.toContain('p_viejo'); // fuera del período
    expect(top.map((x) => x.id)).not.toContain('p_anul'); // anulada
  });

  it('con período mes, la venta de hace 10 días sí entra (14 de octubre)', () => {
    semillarVentas();
    const configStore = useConfigStore();
    configStore.cfg.graficoProdPeriodo = 'mes';
    configStore.cfg.graficoProdTipo = 'vendidos';

    const { topProductos } = useGraficos();
    const top = topProductos();

    expect(top[0].id).toBe('p_viejo'); // 100 unidades el 4 de octubre
  });

  it('orden por margen prioriza ganancia sobre cantidad', () => {
    semillarVentas();
    const configStore = useConfigStore();
    configStore.cfg.graficoProdPeriodo = 'semana';
    configStore.cfg.graficoProdTipo = 'margen';

    const { topProductos } = useGraficos();
    const top = topProductos();

    expect(top[0].id).toBe('p_1'); // ganancia 7, el mayor del período
    const ganancias = top.map((x) => x.ganancia);
    expect(ganancias).toEqual([...ganancias].sort((a, b) => b - a));
  });

  it('agrega cantidades, ingresos y ganancias del mismo producto en varias ventas', () => {
    const ventas = useVentasStore();
    const ahora = new Date().toISOString();
    ventas.ventas = [
      venta('v_1', ahora, [item('p_1', 'A', 2, 10, 6)], 0, 0),
      venta('v_2', ahora, [item('p_1', 'A', 3, 10, 9)], 0, 0),
    ];

    const { topProductos } = useGraficos();
    const [p] = topProductos();

    expect(p.cantidad).toBe(5);
    expect(p.ganancia).toBe(15);
    expect(p.ingresos).toBe(50);
  });
});

describe('setters con persistencia', () => {
  it('setGraficoVista cambia la cfg y persiste; no-op si es el mismo valor', () => {
    const configStore = useConfigStore();
    configStore.cfg.graficoVista = 'mes';
    const spy = vi.spyOn(configStore, 'guardarCfg');

    const { setGraficoVista } = useGraficos();
    setGraficoVista('semana');
    expect(configStore.cfg.graficoVista).toBe('semana');
    expect(spy).toHaveBeenCalledTimes(1);

    setGraficoVista('semana'); // mismo valor: no persiste de nuevo
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('setGraficoProdTipo y setGraficoProdPeriodo persisten', () => {
    const configStore = useConfigStore();
    const { setGraficoProdTipo, setGraficoProdPeriodo } = useGraficos();

    setGraficoProdTipo('margen');
    expect(configStore.cfg.graficoProdTipo).toBe('margen');

    setGraficoProdPeriodo('semana');
    expect(configStore.cfg.graficoProdPeriodo).toBe('semana');
  });
});
