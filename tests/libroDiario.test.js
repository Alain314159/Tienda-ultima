/**
 * Tests del libro diario de partida doble (services/libroDiario.ts):
 * - generarAsientos: pureza, un asiento por evento, partida doble equilibrada
 * - balanzaDeComprobacion: sumas por cuenta y saldos
 * - regenerarAsientos: persistencia e idempotencia (mismo estado => mismos asientos)
 * - Diagnóstico contable: los saldos del libro CUADRAN con los del sistema
 *   (caja, inventario y resultado neto histórico)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { createPinia, setActivePinia } from 'pinia';

import { db } from '../src/db';
import {
  generarAsientos,
  balanzaDeComprobacion,
  sumaDebe,
  balanceGeneral,
  regenerarAsientos,
  CUENTAS,
} from '../src/services/libroDiario';
import { useCajaStore } from '../src/stores/useCajaStore';
import { useVentasStore } from '../src/stores/useVentasStore';
import { useComprasStore } from '../src/stores/useComprasStore';
import { useGastosStore } from '../src/stores/useGastosStore';
import { useAjustesStore } from '../src/stores/useAjustesStore';
import { useLotesStore } from '../src/stores/useLotesStore';
import { useConfigStore } from '../src/stores/useConfigStore';
import { useCapitalStore } from '../src/stores/useCapitalStore';
import { useCierresStore } from '../src/stores/useCierresStore';

const HACE = (dias) => new Date(Date.now() - dias * 86400000).toISOString();

/**
 * Fixture contablemente coherente (las mismas invariantes que mantiene la app):
 * - capital inicial 100
 * - compra 10 x $10 = 100 (lote 10 unidades, costo 10)
 * - venta 6 x $15 = 90 con COGS 60 (lote queda cantidadVendida 6)
 * - gasto 8 pagado de caja CON su espejo movCaja (movId enlazado)
 * - merma de 2 unidades (costoPerdida 20; lote queda cantidadVendida 8)
 * - ajuste de arqueo: egreso 3 SIN gasto asociado
 * - retiro de ganancia 1
 */
function datosCoherentes() {
  return {
    capitalInicial: 100,
    ventas: [
      {
        id: 'v_1',
        fecha: HACE(1),
        items: [{ productoId: 'p_1', nombre: 'A', cantidad: 6, precio: 15, costo: 60, ganancia: 30, lotesUsados: [] }],
        total: 90,
        ganancia: 30,
        anulada: false,
      },
    ],
    compras: [
      {
        id: 'c_1',
        fecha: HACE(2),
        productoId: 'p_1',
        productoNombre: 'A',
        cantidad: 10,
        costo: 10,
        total: 100,
        anulada: false,
      },
    ],
    gastos: [
      {
        id: 'g_1',
        fecha: HACE(1),
        categoria: 'Luz',
        concepto: 'Recibo',
        monto: 8,
        metodoPago: 'efectivo',
        saleDeCaja: true,
        movId: 'mc_1',
      },
      {
        id: 'g_2',
        fecha: HACE(1),
        categoria: 'Internet',
        concepto: 'Transferido',
        monto: 5,
        metodoPago: 'transferencia',
        saleDeCaja: false,
      },
    ],
    capital: [{ id: 'k_1', fecha: HACE(3), monto: 50, nota: 'aporte' }],
    retiros: [{ id: 'r_1', fecha: HACE(1), monto: 1, concepto: 'premio', tipoRetiro: 'ganancia' }],
    movCaja: [
      { id: 'mc_1', fecha: HACE(1), tipo: 'egreso', monto: 8, concepto: 'Gasto: Recibo', metodoPago: 'efectivo' },
    ],
    ajustes: [
      {
        id: 'a_1',
        fecha: HACE(1),
        productoId: 'p_1',
        productoNombre: 'A',
        cantidad: -2,
        motivo: 'rotura',
        costoPerdida: 20,
      },
    ],
    lotes: [
      {
        id: 'l_1',
        compraId: undefined,
        productoId: 'p_1',
        cantidadInicial: 10,
        cantidadVendida: 8,
        costo: 10,
        fecha: HACE(2),
      },
    ],
  };
}

describe('generarAsientos (puro)', () => {
  it('genera un asiento por cada evento con partida doble equilibrada', () => {
    const asientos = generarAsientos(datosCoherentes());
    // capitalInicial + aporte + compra + venta + costo + gasto x2 + retiro = 8
    // (la merma NO entra: su costoPerdida es 20 > 0... sí entra: son 9)
    expect(asientos).toHaveLength(9);
    for (const a of asientos) {
      expect(a.monto).toBeGreaterThan(0);
      expect(a.cuentaDebe).not.toBe(a.cuentaHaber);
    }
  });

  it('el libro siempre balancea: suma de cargos === suma de abonos', () => {
    const asientos = generarAsientos(datosCoherentes());
    const bal = balanzaDeComprobacion(asientos);
    const totalDebe = bal.reduce((s, f) => s + f.debe, 0);
    const totalHaber = bal.reduce((s, f) => s + f.haber, 0);
    expect(Math.abs(totalDebe - totalHaber)).toBeLessThan(0.01);
    expect(sumaDebe(asientos)).toBeCloseTo(totalDebe, 2);
  });

  it('la venta genera asiento de ingreso y de costo por separado', () => {
    const asientos = generarAsientos(datosCoherentes());
    const venta = asientos.find((a) => a.refTipo === 'venta');
    const costo = asientos.find((a) => a.refTipo === 'costo');
    expect(venta.monto).toBe(90);
    expect(venta.cuentaDebe).toBe(CUENTAS.CAJA);
    expect(venta.cuentaHaber).toBe(CUENTAS.INGRESOS);
    expect(costo.monto).toBe(60);
    expect(costo.cuentaDebe).toBe(CUENTAS.COSTO);
    expect(costo.cuentaHaber).toBe(CUENTAS.INVENTARIO);
  });

  it('el gasto fuera de caja NO descuenta la cuenta Caja', () => {
    const asientos = generarAsientos(datosCoherentes());
    const fuera = asientos.find((a) => a.id === 'gasto:g_2');
    expect(fuera.cuentaHaber).toBe(CUENTAS.FUERA_CAJA);
    const enCaja = asientos.find((a) => a.id === 'gasto:g_1');
    expect(enCaja.cuentaHaber).toBe(CUENTAS.CAJA);
  });

  it('el movCaja espejo de un gasto NO genera ajuste doble', () => {
    const asientos = generarAsientos(datosCoherentes());
    // mc_1 es el espejo de g_1: no debe aparecer como ajusteCaja
    expect(asientos.find((a) => a.refId === 'mc_1')).toBeUndefined();
  });

  it('las ventas y compras anuladas quedan fuera del libro', () => {
    const d = datosCoherentes();
    d.ventas.push({ id: 'v_2', fecha: HACE(1), items: [], total: 999, ganancia: 1, anulada: true });
    d.compras.push({ id: 'c_2', fecha: HACE(1), productoId: 'p_1', cantidad: 1, costo: 1, total: 1, anulada: true });
    const asientos = generarAsientos(d);
    expect(asientos.find((a) => a.refId === 'v_2')).toBeUndefined();
    expect(asientos.find((a) => a.refId === 'c_2')).toBeUndefined();
  });

  it('es determinista: mismo estado => mismos IDs y orden', () => {
    const a1 = generarAsientos(datosCoherentes());
    const a2 = generarAsientos(datosCoherentes());
    expect(a1.map((x) => x.id)).toEqual(a2.map((x) => x.id));
  });

  it('el sobrante se valora desde su lote origen (aj-<id>)', () => {
    const d = datosCoherentes();
    d.ajustes.push({
      id: 'a_2',
      fecha: HACE(1),
      productoId: 'p_1',
      productoNombre: 'A',
      cantidad: 3,
      motivo: 'hallado',
      costoPerdida: 0,
    });
    d.lotes.push({
      id: 'l_2',
      compraId: 'aj-a_2',
      productoId: 'p_1',
      cantidadInicial: 3,
      cantidadVendida: 0,
      costo: 4,
      fecha: HACE(1),
    });
    const asientos = generarAsientos(d);
    const sobrante = asientos.find((a) => a.refTipo === 'sobrante');
    expect(sobrante.monto).toBe(12); // 3 x 4
    expect(sobrante.cuentaDebe).toBe(CUENTAS.INVENTARIO);
  });
});

describe('balanzaDeComprobacion', () => {
  it('calcula saldos por cuenta con el signo correcto', () => {
    const asientos = generarAsientos(datosCoherentes());
    const saldo = (cuenta) => balanzaDeComprobacion(asientos).find((f) => f.cuenta === cuenta)?.saldo;
    // Caja: +100 ini +50 aporte +90 venta -100 compra -8 gasto -1 retiro = 131
    expect(saldo(CUENTAS.CAJA)).toBe(131);
    // Inventario: +100 compra -60 costo -20 merma = 20
    expect(saldo(CUENTAS.INVENTARIO)).toBe(20);
    // Capital (acreedor): -100 ini -50 aporte = -150
    expect(saldo(CUENTAS.CAPITAL)).toBe(-150);
    // Resultado: -90 ingresos +60 costo +13 gastos +20 mermas = +3 neto cargado
    expect(saldo(CUENTAS.INGRESOS)).toBe(-90);
  });
});

describe('regenerarAsientos + diagnóstico contra el sistema', () => {
  beforeEach(async () => {
    await Promise.all([
      db.ventas.clear(),
      db.compras.clear(),
      db.gastos.clear(),
      db.capital.clear(),
      db.retiros.clear(),
      db.movCaja.clear(),
      db.ajustes.clear(),
      db.lotes.clear(),
      db.asientos.clear(),
      db.config.clear(),
      db.cierres.clear(),
    ]);
    setActivePinia(createPinia());
  });

  it('persiste el libro y los saldos cuadran con los getters del sistema', async () => {
    const d = datosCoherentes();

    // Sembrar la DB con el mismo estado (más el ajuste de arqueo suelto)
    await db.ventas.bulkPut(d.ventas);
    await db.compras.bulkPut(d.compras);
    await db.gastos.bulkPut(d.gastos);
    await db.capital.bulkPut(d.capital);
    await db.retiros.bulkPut(d.retiros);
    await db.movCaja.bulkPut([
      ...d.movCaja,
      { id: 'mc_2', fecha: HACE(1), tipo: 'egreso', monto: 3, concepto: 'Ajuste por arqueo' },
    ]);
    await db.ajustes.bulkPut(d.ajustes);
    await db.lotes.bulkPut(d.lotes);
    await db.config.put({ key: 'cfg', value: { capitalInicial: 100, periodoInicio: HACE(30) } });

    const total = await regenerarAsientos();
    expect(total).toBe(10); // 9 del fixture + el ajuste de arqueo suelto

    // Sembrar los stores con el mismo estado y cruzar saldos
    const configStore = useConfigStore();
    configStore.cfg.capitalInicial = 100;
    configStore.cfg.periodoInicio = HACE(30);
    const ventasStore = useVentasStore();
    ventasStore.ventas = d.ventas;
    const comprasStore = useComprasStore();
    comprasStore.compras = d.compras;
    const gastosStore = useGastosStore();
    gastosStore.gastos = d.gastos;
    const capitalStore = useCapitalStore();
    capitalStore.capital = d.capital;
    capitalStore.retiros = d.retiros;
    const cajaStore = useCajaStore();
    cajaStore.movCaja = [
      ...d.movCaja,
      { id: 'mc_2', fecha: HACE(1), tipo: 'egreso', monto: 3, concepto: 'Ajuste por arqueo' },
    ];
    const ajustesStore = useAjustesStore();
    ajustesStore.ajustes = d.ajustes;
    const lotesStore = useLotesStore();
    lotesStore.lotes = d.lotes;

    const asientos = await db.asientos.toArray();
    const bal = balanzaDeComprobacion(asientos);
    const saldo = (cuenta) => bal.find((f) => f.cuenta === cuenta)?.saldo || 0;

    // Caja del libro: 131 - 3 (ajuste arqueo) = 128
    // saldoCaja del sistema: 100 + 50 + 90 - 100 - 1 + (-3) - 8 = 128 ✓
    expect(saldo(CUENTAS.CAJA)).toBeCloseTo(128, 2);
    expect(cajaStore.saldoCaja).toBe(128);

    // Inventario del libro vs valorización de lotes: 20
    expect(saldo(CUENTAS.INVENTARIO)).toBe(20);
    expect(lotesStore.valorInventario).toBe(20);

    // Resultado neto histórico del libro: 90 - 60 - 13 - 20 = -3
    // (el gasto fuera de caja también es gasto contable)
    const resultadoLibro =
      -saldo(CUENTAS.INGRESOS) - saldo(CUENTAS.COSTO) - saldo(CUENTAS.GASTOS) - saldo(CUENTAS.MERMAS);
    expect(resultadoLibro).toBe(-3);
    // El sistema: ganancia bruta 30 - gastos 13 - mermas 20 = -3
    expect(useCierresStore().gananciaNetaPeriodo).toBe(-3);
  });

  it('es idempotente: regenerar dos veces produce el mismo libro', async () => {
    const d = datosCoherentes();
    await db.ventas.bulkPut(d.ventas);
    await db.config.put({ key: 'cfg', value: { capitalInicial: 100 } });

    await regenerarAsientos();
    const primera = (await db.asientos.toArray()).map((x) => x.id).sort();
    await regenerarAsientos();
    const segunda = (await db.asientos.toArray()).map((x) => x.id).sort();
    expect(segunda).toEqual(primera);
  });

  it('balance general (puro): identidad contable con todos los tipos de asiento', () => {
    // Semilla con arqueo de caja (mc_2, egreso 3): como el 'persiste el libro'
    const d = datosCoherentes();
    const asientos = generarAsientos({
      ...d,
      movCaja: [...d.movCaja, { id: 'mc_2', fecha: HACE(1), tipo: 'egreso', monto: 3, concepto: 'Ajuste por arqueo' }],
    });
    const bg = balanceGeneral(asientos);

    // Activo: caja (100+50+90-100-8-1-3=128) + inventario (100-60-20=20) = 148
    expect(bg.caja).toBeCloseTo(128, 2);
    expect(bg.inventario).toBe(20);
    expect(bg.totalActivo).toBeCloseTo(148, 2);

    // Patrimonio: capital 150 + resultado integral -6 - retiros ganancia 1 + fuera de caja 5 = 148
    // resultado integral = 90 - 60 - 13 - 20 (merma) - 3 (faltante de arqueo) = -6
    expect(bg.capital).toBe(150);
    expect(bg.resultado).toBeCloseTo(-6, 2);
    expect(bg.retirosGanancia).toBe(1);
    expect(bg.fueraCaja).toBe(5);
    expect(bg.totalPatrimonio).toBeCloseTo(148, 2);

    expect(bg.cuadra).toBe(true);
  });

  it('con estado vacío el libro queda vacío y sin errores', async () => {
    const total = await regenerarAsientos();
    expect(total).toBe(0);
    expect(await db.asientos.count()).toBe(0);
  });
});
