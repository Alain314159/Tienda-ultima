/**
 * Tests del debounce del recálculo de avisos (4.3, segunda mitad):
 * `useInsightsStore` ya no recalcula `generarRecomendaciones()` en cada
 * cambio de los 9 stores de los que depende, sino una vez por ventana
 * de debounce (250 ms) y como mucho cada 1 s en ráfagas continuas
 * (maxWait). El punto rojo y la lista del Dashboard leen el mismo
 * `ref`, así que el resultado visible es idéntico, solo llega con
 * retraso.
 *
 * - Muchos cambios seguidos provocan UN solo recálculo (se cuenta con
 *   un mock de `generarRecomendaciones` que delega en el real).
 * - El recálculo NO ocurre de inmediato tras un cambio, sino tras la
 *   pausa; y en una ráfaga continua ocurre por maxWait sin esperar
 *   a que pare.
 * - Tras asentarse, la lista es exactamente la del cálculo directo
 *   (mismas reglas, mismo filtro de descartadas, mismo corte a 8).
 *
 * Temporizadores REALES (nada de `vi.useFakeTimers`: congela
 * fake-indexeddb, ver 6.1) y fechas relativas a "ahora", para no
 * depender del día/hora en que corre la suite. Las esperas usan los
 * valores exportados por el store, no números mágicos duplicados.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { generarRecomendaciones } from '../src/insights';
import { fmt, fmtCant } from '../src/utils/formato';

vi.mock('../src/insights', async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    generarRecomendaciones: vi.fn((...args) => real.generarRecomendaciones(...args)),
  };
});

// El mock debe estar arriba (hoisted) antes de importar el store.
import {
  useInsightsStore,
  INSIGHTS_DEBOUNCE_MS,
  INSIGHTS_MAX_WAIT_MS,
} from '../src/stores/useInsightsStore';
import { useVentasStore } from '../src/stores/useVentasStore';
import { useProductosStore } from '../src/stores/useProductosStore';
import { useComprasStore } from '../src/stores/useComprasStore';
import { useConfigStore } from '../src/stores/useConfigStore';
import { useCajaStore } from '../src/stores/useCajaStore';
import { useLotesStore } from '../src/stores/useLotesStore';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Margen holgado sobre el debounce para que el runner no dé falsos
// negativos en máquinas lentas; sigue siendo mucho menor que maxWait.
const ASENTAR_MS = INSIGHTS_DEBOUNCE_MS + 250;

// Venta de hoy con un ítem bajo costo: dispara 'ventas-bajo-costo-N'
// (urgente) sin depender de productos, lotes ni saldos.
const ventaBajoCosto = (id) => ({
  id,
  fecha: new Date().toISOString(),
  total: 80,
  ganancia: -10,
  anulada: false,
  items: [{ productoId: 'p1', nombre: 'A', cantidad: 1, precio: 80, costo: 90, ganancia: -10 }],
});

const claves = (insights) => insights.recomendaciones.map((r) => r.clave);

function montarStores() {
  setActivePinia(createPinia());
  const insights = useInsightsStore();
  const ventas = useVentasStore();
  const productos = useProductosStore();
  const compras = useComprasStore();
  const config = useConfigStore();
  const caja = useCajaStore();
  const lotes = useLotesStore();
  return { insights, ventas, productos, compras, config, caja, lotes };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(async () => {
  // Dejar que expire cualquier ventana de debounce pendiente del test,
  // para que no recalcule sobre los stores viejos durante el siguiente.
  await sleep(ASENTAR_MS);
});

describe('insights: debounce del recálculo', () => {
  it('un cambio no recalcula de inmediato: el aviso aparece tras la pausa', async () => {
    const { insights, ventas } = montarStores();

    ventas.ventas.push(ventaBajoCosto('v1'));

    // Sin pausa todavía: la lista sigue siendo la anterior (sin aviso).
    expect(claves(insights)).not.toContain('ventas-bajo-costo-1');
    expect(insights.recomendacionesUrgentes).toBe(0);

    await sleep(ASENTAR_MS);

    // Tras la pausa: el mismo aviso que daba el computed síncrono.
    expect(claves(insights)).toContain('ventas-bajo-costo-1');
    expect(insights.recomendacionesUrgentes).toBe(1);
  });

  it('10 cambios seguidos provocan un solo recálculo', async () => {
    const { insights, ventas } = montarStores();
    const llamadasAlCrear = generarRecomendaciones.mock.calls.length;
    expect(llamadasAlCrear).toBe(1); // el cálculo síncrono inicial

    for (let i = 0; i < 10; i++) ventas.ventas.push(ventaBajoCosto('v' + i));

    await sleep(ASENTAR_MS);

    expect(generarRecomendaciones.mock.calls.length).toBe(llamadasAlCrear + 1);
    expect(claves(insights)).toContain('ventas-bajo-costo-10');
    expect(insights.recomendacionesUrgentes).toBe(1);
  });

  it('en una ráfaga continua el aviso se actualiza por maxWait, sin esperar a que pare', async () => {
    const { insights, ventas } = montarStores();
    let n = 0;
    ventas.ventas.push(ventaBajoCosto('m' + n++));
    const intervalo = setInterval(() => ventas.ventas.push(ventaBajoCosto('m' + n++)), 100);
    try {
      // La ráfaga sigue (el intervalo no para) y ya pasó maxWait: el
      // punto rojo tiene que haberse actualizado durante la ráfaga.
      await sleep(INSIGHTS_MAX_WAIT_MS + 300);
      expect(ventas.ventas.length).toBeGreaterThan(5); // la ráfaga sigue
      expect(claves(insights).some((c) => c.startsWith('ventas-bajo-costo-'))).toBe(true);
      expect(insights.recomendacionesUrgentes).toBe(1);
    } finally {
      clearInterval(intervalo);
    }

    // Al parar, el último recálculo deja el conteo exacto final.
    await sleep(ASENTAR_MS);
    expect(claves(insights)).toContain('ventas-bajo-costo-' + ventas.ventas.length);
  });

  it('tras asentarse, la lista es idéntica al cálculo directo (mismas reglas)', async () => {
    const { insights, ventas, productos, compras, config, caja, lotes } = montarStores();
    const hoy = new Date();
    const hace = (dias) => new Date(hoy.getTime() - dias * 86400000).toISOString();

    productos.productos = [
      { id: 'p1', nombre: 'A', precio: 100, archivado: false },
      { id: 'p2', nombre: 'B', precio: 50, archivado: false },
    ];
    ventas.ventas = [
      ventaBajoCosto('v-bajo'),
      // Descuento del 30% sobre p1 (umbral 20%).
      {
        id: 'v-desc',
        fecha: hace(1),
        total: 70,
        ganancia: 20,
        anulada: false,
        items: [{ productoId: 'p1', nombre: 'A', cantidad: 1, precio: 70, costo: 50, ganancia: 20 }],
      },
      // Ventas del mes para el top producto (p1 gana más).
      {
        id: 'v-top',
        fecha: hace(3),
        total: 100,
        ganancia: 30,
        anulada: false,
        items: [{ productoId: 'p1', nombre: 'A', cantidad: 1, precio: 100, costo: 70, ganancia: 30 }],
      },
    ];
    compras.compras = [
      { id: 'c1', productoId: 'p2', costo: 10, fecha: hace(4), anulada: false },
      { id: 'c2', productoId: 'p2', costo: 10, fecha: hace(6), anulada: false },
      { id: 'c3', productoId: 'p2', costo: 10, fecha: hace(9), anulada: false },
      // Última compra de p2 un 50% más cara que el promedio previo.
      { id: 'c4', productoId: 'p2', costo: 15, fecha: hace(1), anulada: false },
    ];

    await sleep(ASENTAR_MS);

    const estado = {
      ventas: ventas.ventas,
      compras: compras.compras,
      gastos: [],
      ajustes: [],
      productos: productos.productos,
      lotes: lotes.lotes,
      cierres: [],
      movCaja: caja.movCaja,
      saldoCaja: caja.saldoCaja,
      cfg: config.cfg,
      formatMoney: fmt,
      formatNum: fmtCant,
      stockDe: (pid) => productos.stock(pid),
    };
    const descartadas = config.cfg.anomaliasDescartadas || [];
    const esperado = generarRecomendaciones(estado)
      .filter((r) => !descartadas.includes(r.clave))
      .slice(0, 8);

    expect(insights.recomendaciones).toEqual(esperado);
    expect(claves(insights)).toContain('ventas-bajo-costo-1');
    expect(claves(insights)).toContain('compra-cara-c4');
    expect(claves(insights)).toContain('top-prod');
  });

  it('descartar una anomalía también llega con debounce (cfg es fuente del watch)', async () => {
    const { insights, ventas, config } = montarStores();
    ventas.ventas.push(ventaBajoCosto('v1'));
    await sleep(ASENTAR_MS);
    expect(claves(insights)).toContain('ventas-bajo-costo-1');

    config.cfg.anomaliasDescartadas.push('ventas-bajo-costo-1');

    // Todavía visible hasta que corre el recálculo con debounce.
    expect(claves(insights)).toContain('ventas-bajo-costo-1');
    await sleep(ASENTAR_MS);
    expect(claves(insights)).not.toContain('ventas-bajo-costo-1');
    expect(insights.recomendacionesUrgentes).toBe(0);
  });
});
