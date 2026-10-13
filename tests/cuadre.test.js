/**
 * Tests del composable de cuadre (useCuadre):
 * - selectores de período (hoy/semana/mes anterior/año/cierre/mes/actual)
 * - generarReporte: P&G (ingresos, COGS, bruta, mermas, gastos, neta),
 *   subfilas por (producto, costo, precio), filas solo-stock, archivados,
 *   totales y márgenes
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('../src/utils/toast', () => ({ toastMsg: vi.fn() }));

import { useCuadre } from '../src/composables/useCuadre';
import { useConfigStore } from '../src/stores/useConfigStore';
import { useVentasStore } from '../src/stores/useVentasStore';
import { useComprasStore } from '../src/stores/useComprasStore';
import { useAjustesStore } from '../src/stores/useAjustesStore';
import { useGastosStore } from '../src/stores/useGastosStore';
import { useLotesStore } from '../src/stores/useLotesStore';
import { useProductosStore } from '../src/stores/useProductosStore';
import { toastMsg } from '../src/utils/toast';
import { TOAST } from '../src/constants';

const AHORA = () => new Date().toISOString();
const HACE = (dias) => new Date(Date.now() - dias * 86400000).toISOString();

/** Datos coherentes: P1 con lote costo 10 (quedan 4) y lote costo 12 (5 sin vender),
 *  venta de 6 x 15 con FIFO desde el lote 10, compra de 10 x 10 (total 100),
 *  gasto de 8, merma de 20. P2 archivado con stock, P3 archivado sin stock. */
function semillarDatos() {
  const productosStore = useProductosStore();
  const lotesStore = useLotesStore();
  const ventasStore = useVentasStore();
  const comprasStore = useComprasStore();
  const ajustesStore = useAjustesStore();
  const gastosStore = useGastosStore();

  productosStore.productos = [
    { id: 'p_1', nombre: 'Prod A', precio: 15, archivado: false },
    { id: 'p_2', nombre: 'Prod B (archivado)', precio: 7, archivado: true },
    { id: 'p_3', nombre: 'Prod C (archivado sin stock)', precio: 3, archivado: true },
  ];
  lotesStore.lotes = [
    { id: 'l_1', productoId: 'p_1', cantidadInicial: 10, cantidadVendida: 6, costo: 10, fecha: HACE(20) },
    { id: 'l_2', productoId: 'p_1', cantidadInicial: 5, cantidadVendida: 0, costo: 12, fecha: HACE(5) },
    { id: 'l_3', productoId: 'p_2', cantidadInicial: 3, cantidadVendida: 0, costo: 7, fecha: HACE(30) },
  ];
  ventasStore.ventas = [
    {
      id: 'v_1',
      fecha: AHORA(),
      items: [
        {
          productoId: 'p_1',
          nombre: 'Prod A',
          cantidad: 6,
          precio: 15,
          costo: 60,
          ganancia: 30,
          lotesUsados: [{ loteId: 'l_1', cantidad: 6, costo: 10 }],
        },
      ],
      total: 90,
      ganancia: 30,
      anulada: false,
    },
    { id: 'v_2', fecha: AHORA(), items: [], total: 500, ganancia: 100, anulada: true }, // excluida
  ];
  comprasStore.compras = [
    { id: 'c_1', fecha: AHORA(), productoId: 'p_1', cantidad: 10, costo: 10, total: 100 },
    { id: 'c_2', fecha: HACE(40), productoId: 'p_1', cantidad: 99, costo: 1, total: 99 }, // fuera de rango
  ];
  ajustesStore.ajustes = [
    { id: 'a_1', fecha: AHORA(), productoId: 'p_1', cantidad: -2, costoPerdida: 20, motivo: 'rotura' },
    { id: 'a_2', fecha: AHORA(), productoId: 'p_1', cantidad: 3, costoPerdida: 5, motivo: 'sobrante' }, // no es merma
  ];
  gastosStore.gastos = [
    {
      id: 'g_1',
      fecha: AHORA(),
      monto: 8,
      categoria: 'varios',
      concepto: 'x',
      metodoPago: 'efectivo',
      saleDeCaja: true,
    },
    {
      id: 'g_2',
      fecha: HACE(40),
      monto: 100,
      categoria: 'varios',
      concepto: 'viejo',
      metodoPago: 'efectivo',
      saleDeCaja: true,
    },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  setActivePinia(createPinia());
});

describe('selectores de período', () => {
  it('setHoy: rango completo del día actual', () => {
    const { rep, setHoy } = useCuadre();
    setHoy();
    expect(rep.periodoActivo).toBe('hoy');
    const hoy = new Date().toISOString().split('T')[0];
    expect(rep.fechaInicio).toBe(hoy);
    expect(rep.fechaFin).toBe(hoy);
    expect(new Date(rep.isoInicio).getHours()).toBe(0);
    expect(new Date(rep.isoFin).getHours()).toBe(23);
  });

  it('setSemana: últimos 7 días', () => {
    const { rep, setSemana } = useCuadre();
    setSemana();
    expect(rep.periodoActivo).toBe('semana');
    const dias = Math.round((new Date(rep.isoFin) - new Date(rep.isoInicio)) / 86400000);
    expect(dias).toBe(7);
  });

  it('setMesAnterior: primer a último día del mes previo', () => {
    const { rep, setMesAnterior } = useCuadre();
    setMesAnterior();
    expect(rep.periodoActivo).toBe('mes-ant');
    const ini = new Date(rep.isoInicio);
    const fin = new Date(rep.isoFin);
    const ahora = new Date();
    expect(ini.getDate()).toBe(1);
    expect(ini.getMonth()).toBe(ahora.getMonth() === 0 ? 11 : ahora.getMonth() - 1);
    expect(fin.getDate()).toBe(new Date(ahora.getFullYear(), ahora.getMonth(), 0).getDate());
    expect(fin.getHours()).toBe(23);
  });

  it('setAnio: desde el 1 de enero', () => {
    const { rep, setAnio } = useCuadre();
    setAnio();
    expect(rep.periodoActivo).toBe('anio');
    const ini = new Date(rep.isoInicio);
    expect(ini.getMonth()).toBe(0);
    expect(ini.getDate()).toBe(1);
  });

  it('setMesActual: deja iso null (usa solo fechas)', () => {
    const { rep, setMesActual } = useCuadre();
    setMesActual();
    expect(rep.periodoActivo).toBe('mes');
    expect(rep.isoInicio).toBeNull();
    expect(rep.isoFin).toBeNull();
    expect(new Date(rep.fechaInicio).getDate()).toBe(1);
  });

  it('setPeriodoActual: usa periodoInicio de la config', () => {
    const configStore = useConfigStore();
    configStore.cfg.periodoInicio = '2026-09-15T08:00:00.000Z';
    const { rep, setPeriodoActual } = useCuadre();
    setPeriodoActual();
    expect(rep.periodoActivo).toBe('actual');
    expect(rep.isoInicio).toBe('2026-09-15T08:00:00.000Z');
    expect(rep.fechaInicio).toBe('2026-09-15');
  });

  it('setPeriodoCierre: usa el período del cierre (con fallback a fechaCierre)', () => {
    const { rep, setPeriodoCierre } = useCuadre();
    setPeriodoCierre({
      id: 'cie_1',
      periodoInicio: '2026-08-01T00:00:00.000Z',
      periodoFin: '2026-08-31T23:59:59.000Z',
    });
    expect(rep.periodoActivo).toBe('cie_1');
    expect(rep.fechaInicio).toBe('2026-08-01');
    expect(rep.fechaFin).toBe('2026-08-31');

    // Fallback cuando el cierre no trae período propio
    setPeriodoCierre({ id: 'cie_2', fechaCierre: '2026-07-10T12:00:00.000Z' });
    expect(rep.fechaInicio).toBe('2026-07-10');
    expect(rep.fechaFin).toBe('2026-07-10');
  });
});

describe('generarReporte', () => {
  it('valida fechas ausentes e inicio > fin', () => {
    const { rep, generarReporte } = useCuadre();
    rep.fechaInicio = '';
    generarReporte();
    expect(toastMsg).toHaveBeenCalledWith('Selecciona fechas', TOAST.BAD);
    expect(rep.resultado).toBeNull();

    rep.fechaInicio = '2026-01-10';
    rep.fechaFin = '2026-01-01';
    generarReporte();
    expect(toastMsg).toHaveBeenCalledWith('Fecha inicio > fin', TOAST.BAD);
    expect(rep.resultado).toBeNull();
  });

  it('P&G completo con ventas anuladas y períodos excluidos', () => {
    semillarDatos();
    const { rep, setHoy, generarReporte } = useCuadre();
    setHoy();
    generarReporte();

    const r = rep.resultado;
    expect(r.numVentas).toBe(1); // la anulada no cuenta
    expect(r.ingresos).toBe(90);
    expect(r.cogs).toBe(60);
    expect(r.bruta).toBe(30);
    expect(r.mermas).toBe(20); // solo ajustes con cantidad < 0
    expect(r.gastos).toBe(8);
    expect(r.neta).toBe(2);
    expect(r.margenB).toBe('33.33');
    expect(r.margenN).toBe('2.22');
    expect(r._fechaI).toBe(new Date().toISOString().split('T')[0]);
  });

  it('subfilas por (costo, precio): fila vendida + fila solo-stock del costo 12', () => {
    semillarDatos();
    const { rep, setHoy, generarReporte } = useCuadre();
    setHoy();
    generarReporte();

    const p1 = rep.resultado.cuadre.find((x) => x.id === 'p_1');
    expect(p1.subfilas).toHaveLength(2);

    const vendida = p1.subfilas[0];
    expect(vendida.costo).toBe(10);
    expect(vendida.precio).toBe(15);
    expect(vendida.comprasCant).toBe(10); // la compra fuera de rango no cuenta
    expect(vendida.cantVend).toBe(6);
    expect(vendida.ingresos).toBe(90);
    expect(vendida.costoVend).toBe(60);
    expect(vendida.ganancia).toBe(30);
    expect(vendida.stockActual).toBe(4);
    expect(vendida.valorActual).toBe(40);

    const soloStock = p1.subfilas[1];
    expect(soloStock.costo).toBe(12);
    expect(soloStock.precio).toBeNull();
    expect(soloStock.cantVend).toBe(0);
    expect(soloStock.stockActual).toBe(5);
    expect(soloStock.valorActual).toBe(60);
  });

  it('fila por producto: promedios, stock final y valor', () => {
    semillarDatos();
    const { rep, setHoy, generarReporte } = useCuadre();
    setHoy();
    generarReporte();

    const p1 = rep.resultado.cuadre.find((x) => x.id === 'p_1');
    expect(p1.compras).toBe(10);
    expect(p1.costoCompra).toBe(10); // 100 / 10
    expect(p1.ventas).toBe(6);
    expect(p1.precioVenta).toBe(15); // 90 / 6
    expect(p1.ingresos).toBe(90);
    expect(p1.costo).toBe(60);
    expect(p1.ganancia).toBe(30);
    expect(p1.stockFinal).toBe(9); // 4 + 5
    expect(p1.valorInv).toBe(100); // 40 + 60
  });

  it('archivados: entra solo si le queda stock', () => {
    semillarDatos();
    const { rep, setHoy, generarReporte } = useCuadre();
    setHoy();
    generarReporte();

    const ids = rep.resultado.cuadre.map((x) => x.id);
    expect(ids).toContain('p_1');
    expect(ids).toContain('p_2'); // archivado con stock 3
    expect(ids).not.toContain('p_3'); // archivado sin stock

    const p2 = rep.resultado.cuadre.find((x) => x.id === 'p_2');
    expect(p2.stockFinal).toBe(3);
    expect(p2.valorInv).toBe(21);
  });

  it('totales agregados de todas las filas', () => {
    semillarDatos();
    const { rep, setHoy, generarReporte } = useCuadre();
    setHoy();
    generarReporte();

    expect(rep.resultado.totales).toEqual({
      compras: 10,
      ventas: 6,
      ingresos: 90,
      costo: 60,
      ganancia: 30,
      stockFinal: 12, // 9 + 3
      valorInv: 121, // 100 + 21
    });
  });

  it('toggleCuadreProducto alterna la fila expandida', () => {
    const { cuadreExpandido, toggleCuadreProducto } = useCuadre();
    expect(cuadreExpandido.value.p_1).toBeUndefined();
    toggleCuadreProducto('p_1');
    expect(cuadreExpandido.value.p_1).toBe(true);
    toggleCuadreProducto('p_1');
    expect(cuadreExpandido.value.p_1).toBe(false);
  });
});
