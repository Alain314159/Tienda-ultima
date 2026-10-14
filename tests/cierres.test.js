/**
 * Tests de los TODOs contables conectados (cierre de período y caja):
 * - useAjustesStore.mermasPeriodo: solo salidas (cantidad < 0) del período
 * - useCierresStore.gananciaNetaPeriodo: bruta - gastos - mermas (sin retiros:
 *   ya los descuenta gananciaDisponible en capital)
 * - useCierresStore.comprasPeriodo: compras reales del período, anuladas fuera
 * - useCajaStore.saldoCaja: es un saldo ACUMULATIVO (todo el histórico de
 *   ventas/compras), no un total de período: el efectivo físico no se reinicia
 *   al cerrar períodos
 * - cerrarPeriodo: cierre completo con compras/mermas/cajaFinal/numVentas
 *   reales, persistencia y reinicio del período
 * - seguridad del ciclo de stores: caja → capital → cierres se inicializa
 *   sin errores instanciando caja primero
 */
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { createPinia, setActivePinia } from 'pinia';

import { db } from '../src/db';
// Instanciamos CAJA primero a propósito: ejercita el ciclo caja → capital →
// cierres en el orden más desfavorable y demuestra que no rompe.
import { useCajaStore } from '../src/stores/useCajaStore';
import { useCierresStore } from '../src/stores/useCierresStore';
import { useVentasStore } from '../src/stores/useVentasStore';
import { useComprasStore } from '../src/stores/useComprasStore';
import { useAjustesStore } from '../src/stores/useAjustesStore';
import { useGastosStore } from '../src/stores/useGastosStore';
import { useLotesStore } from '../src/stores/useLotesStore';
import { useConfigStore } from '../src/stores/useConfigStore';
import { useCapitalStore } from '../src/stores/useCapitalStore';

const HACE = (dias) => new Date(Date.now() - dias * 86400000).toISOString();
// Inicio de período fijo a nivel de módulo: determinista para las aserciones
// exactas de ISO y suficientemente atrás para incluir los datos sembrados.
const INI = new Date(Date.now() - 30 * 86400000).toISOString();
// Los datos se siembran AYER: quedan dentro del período viejo y, sobre todo,
// estrictamente ANTES del instante del cierre (evita el empate de milisegundos
// con periodoFin, que haría flotante la prueba).

/** Datos coherentes del período: venta 90 (ganancia 30, COGS 60),
 *  compra 100 vigente + 999 anulada + 200 fuera de período, gasto 8,
 *  merma 20 (ajuste -2) + ajuste positivo ignorado, lote con stock 4 x 10. */
function semillar() {
  const configStore = useConfigStore();
  const ventasStore = useVentasStore();
  const comprasStore = useComprasStore();
  const gastosStore = useGastosStore();
  const ajustesStore = useAjustesStore();
  const lotesStore = useLotesStore();

  configStore.cfg.capitalInicial = 100;
  configStore.cfg.periodoInicio = INI;

  ventasStore.ventas = [
    {
      id: 'v_1',
      fecha: HACE(1),
      items: [{ productoId: 'p_1', nombre: 'A', cantidad: 6, precio: 15, costo: 60, ganancia: 30, lotesUsados: [] }],
      total: 90,
      ganancia: 30,
      anulada: false,
    },
    { id: 'v_2', fecha: HACE(1), items: [], total: 500, ganancia: 100, anulada: true },
  ];
  comprasStore.compras = [
    { id: 'c_1', fecha: HACE(1), productoId: 'p_1', cantidad: 10, costo: 10, total: 100, anulada: false },
    { id: 'c_2', fecha: HACE(1), productoId: 'p_1', cantidad: 99, costo: 99, total: 999, anulada: true },
    { id: 'c_3', fecha: HACE(45), productoId: 'p_1', cantidad: 20, costo: 10, total: 200, anulada: false },
  ];
  gastosStore.gastos = [
    {
      id: 'g_1',
      fecha: HACE(1),
      monto: 8,
      categoria: 'varios',
      concepto: 'x',
      metodoPago: 'efectivo',
      saleDeCaja: true,
    },
  ];
  ajustesStore.ajustes = [
    { id: 'a_1', fecha: HACE(1), productoId: 'p_1', cantidad: -2, motivo: 'rotura', costoPerdida: 20 },
    { id: 'a_2', fecha: HACE(1), productoId: 'p_1', cantidad: 3, motivo: 'sobrante', costoPerdida: 5 },
  ];
  lotesStore.lotes = [
    { id: 'l_1', productoId: 'p_1', cantidadInicial: 4, cantidadVendida: 0, costo: 10, fecha: HACE(10) },
  ];
}

beforeEach(async () => {
  await Promise.all([db.cierres.clear(), db.config.clear()]);
  setActivePinia(createPinia());
  useCajaStore(); // ciclo desfavorable primero
});

describe('mermasPeriodo (useAjustesStore)', () => {
  it('suma costoPerdida solo de salidas dentro del período', () => {
    semillar();
    expect(useAjustesStore().mermasPeriodo).toBe(20);
  });

  it('excluye salidas fuera del período', () => {
    semillar();
    const ajustesStore = useAjustesStore();
    ajustesStore.ajustes.push({
      id: 'a_3',
      fecha: HACE(60),
      productoId: 'p_1',
      cantidad: -5,
      motivo: 'viejo',
      costoPerdida: 50,
    });
    expect(ajustesStore.mermasPeriodo).toBe(20);
  });
});

describe('getters de cierres conectados', () => {
  it('gananciaNetaPeriodo = bruta - gastos - mermas', () => {
    semillar();
    const cierres = useCierresStore();
    expect(cierres.gananciaNetaPeriodo).toBe(2); // 30 - 8 - 20
  });

  it('comprasPeriodo trae las compras reales y excluye anuladas', () => {
    semillar();
    expect(useCierresStore().comprasPeriodo).toBe(100);
  });

  it('margenPeriodo usa la ganancia neta real', () => {
    semillar();
    expect(useCierresStore().margenPeriodo).toBe('2.22'); // 2 / 90
  });

  it('saldoCaja es acumulativo: cuenta todo el histórico de ventas y compras', () => {
    semillar();
    // 100 (capital inicial) + 90 (ventas) - 300 (compras históricas: 100 vigente
    // + 200 vieja; la anulada no cuenta) = -110. La compra de hace 45 días salió
    // físicamente del cajón aunque pertenezca a un período anterior.
    expect(useCajaStore().saldoCaja).toBe(-110);
  });

  it('regresión crítica: cerrar el período NO resetea la caja (el efectivo sigue ahí)', async () => {
    semillar();
    const caja = useCajaStore();
    const antes = caja.saldoCaja;
    await useCierresStore().cerrarPeriodo();
    // La caja física no cambia por el hecho de cerrar el período contable
    expect(caja.saldoCaja).toBe(antes);
  });

  it('el arqueo cuadra contra la caja física tras un cierre de período', async () => {
    semillar();
    // Venta extra para tener caja positiva: 100 + 490 - 300 = 290
    const ventasStore = useVentasStore();
    ventasStore.ventas.push({
      id: 'v_3',
      fecha: HACE(1),
      items: [{ productoId: 'p_1', nombre: 'B', cantidad: 2, precio: 200, costo: 0, ganancia: 400, lotesUsados: [] }],
      total: 400,
      ganancia: 400,
      anulada: false,
    });

    const caja = useCajaStore();
    await useCierresStore().cerrarPeriodo();

    expect(caja.saldoCaja).toBe(290);
    // El dueño cuenta $290 físico: el arqueo no debe registrar ajuste
    const arqueo = await caja.hacerArqueo(290, 0);
    expect(arqueo.cajaSistema).toBe(290);
    expect(arqueo.faltanteSobrante).toBe(0);
    // Sin diferencia no se crea movimiento de ajuste
    expect(caja.movCaja).toHaveLength(0);
    // Y la caja sigue cuadrada tras el arqueo
    expect(caja.saldoCaja).toBe(290);
  });
});

describe('cerrarPeriodo: cierre contable completo', () => {
  it('registra el cierre con compras, mermas y cajaFinal reales', async () => {
    semillar();
    const cierres = useCierresStore();

    const cierre = await cierres.cerrarPeriodo();

    expect(cierre.id).toMatch(/^c_/);
    expect(cierre.ventas).toBe(90);
    expect(cierre.numVentas).toBe(1); // la anulada no cuenta
    expect(cierre.cogs).toBe(60);
    expect(cierre.gananciaBruta).toBe(30);
    expect(cierre.gastos).toBe(8);
    expect(cierre.mermas).toBe(20);
    expect(cierre.ganancia).toBe(2);
    expect(cierre.compras).toBe(100);
    expect(cierre.valorInventario).toBe(40);
    expect(cierre.cajaFinal).toBe(-110); // saldo acumulativo, ver test de caja
    expect(cierre.periodoInicio).toBe(INI); // el ISO se preservó exacto

    // Persistido y recargado
    const enDb = await db.cierres.toArray();
    expect(enDb).toHaveLength(1);
    expect(enDb[0].ganancia).toBe(2);

    // El período se reinicia: la config apunta al cierre
    expect(useConfigStore().cfg.periodoInicio).toBe(cierre.periodoFin);
    expect(cierres.ultimoCierre?.id).toBe(cierre.id);
    expect(cierres.diasDesdeUltimoCierre).toBe(0);
  });

  it('no deja cerrar dos veces en paralelo (_cerrando)', async () => {
    semillar();
    const cierres = useCierresStore();
    cierres._cerrando = true;
    await expect(cierres.cerrarPeriodo()).resolves.toBeUndefined();
    expect(await db.cierres.count()).toBe(0);
  });

  it('las ganancias acumuladas integran cierres + período actual', async () => {
    semillar();
    const cierres = useCierresStore();
    await cierres.cerrarPeriodo();

    // Tras el cierre el período nuevo está vacío: acumuladas = cierre (2)
    expect(useCapitalStore().gananciasAcumuladas).toBe(2);
  });
});
