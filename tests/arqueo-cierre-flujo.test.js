/**
 * Tests de arqueo con diferencia y de cierres encadenados (punto 6.2):
 * - hacerArqueo con SOBRANTE (diferencia positiva): movimiento de ingreso
 *   y la caja sube; con FALTANTE la caja baja; cajaSistema refleja el
 *   saldo real con ventas.
 * - cerrarPeriodo dos veces seguidas: el segundo cierre sale vacío sin
 *   romper nada; un arqueo con diferencia hecho antes del cierre se
 *   refleja en cajaFinal.
 *
 * Hueco que cubre: los tests existentes prueban el arqueo sin diferencia
 * (cierres.test.js) y el faltante (stores.test.js), pero no el sobrante
 * ni que el saldo de caja se corrija tras el ajuste, y tampoco cierres
 * consecutivos ni la interacción arqueo → cierre.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { createPinia, setActivePinia } from 'pinia';

import { db } from '../src/db';
import { useCajaStore } from '../src/stores/useCajaStore';
import { useCierresStore } from '../src/stores/useCierresStore';
import { useVentasStore } from '../src/stores/useVentasStore';
import { useConfigStore } from '../src/stores/useConfigStore';

const HACE = (dias) => new Date(Date.now() - dias * 86400000).toISOString();

beforeEach(async () => {
  await Promise.all([
    db.arqueos.clear(),
    db.movCaja.clear(),
    db.ventas.clear(),
    db.compras.clear(),
    db.gastos.clear(),
    db.ajustes.clear(),
    db.lotes.clear(),
    db.productos.clear(),
    db.cierres.clear(),
    db.config.clear(),
  ]);
  setActivePinia(createPinia());
});

describe('hacerArqueo con diferencia', () => {
  it('sobrante (+40): registra el arqueo, crea un INGRESO de 40 y la caja sube a 40', async () => {
    const caja = useCajaStore();
    expect(caja.saldoCaja).toBe(0);

    const arqueo = await caja.hacerArqueo(40, 40, 'Sobrante');

    expect(arqueo.cajaSistema).toBe(0);
    expect(arqueo.cajaFisica).toBe(40);
    expect(arqueo.faltanteSobrante).toBe(40);
    expect(caja.arqueos).toHaveLength(1);
    expect(await db.arqueos.count()).toBe(1);
    // Diferencia positiva → movimiento de ingreso por el sobrante
    expect(caja.movCaja).toHaveLength(1);
    expect(caja.movCaja[0].tipo).toBe('ingreso');
    expect(caja.movCaja[0].monto).toBe(40);
    expect(caja.movCaja[0].concepto).toContain('Ajuste por arqueo');
    // Y la caja queda cuadrada con lo contado
    expect(caja.saldoCaja).toBe(40);
  });

  it('faltante (-25) con caja previa de 500: EGRESO de 25 y la caja baja a 475', async () => {
    useConfigStore().cfg.capitalInicial = 500;
    const caja = useCajaStore();
    expect(caja.saldoCaja).toBe(500);

    const arqueo = await caja.hacerArqueo(475, -25, 'Faltante');

    expect(arqueo.cajaSistema).toBe(500);
    expect(arqueo.cajaFisica).toBe(475);
    expect(arqueo.faltanteSobrante).toBe(-25);
    expect(caja.movCaja).toHaveLength(1);
    expect(caja.movCaja[0].tipo).toBe('egreso');
    expect(caja.movCaja[0].monto).toBe(25);
    expect(caja.saldoCaja).toBe(475);
  });

  it('cajaSistema es el saldo real con ventas (100 inicial + 90 venta = 190)', async () => {
    useConfigStore().cfg.capitalInicial = 100;
    const ventas = useVentasStore();
    ventas.ventas = [
      {
        id: 'v_1',
        fecha: HACE(1),
        items: [],
        total: 90,
        ganancia: 30,
        anulada: false,
      },
    ];
    const caja = useCajaStore();
    expect(caja.saldoCaja).toBe(190);

    const arqueo = await caja.hacerArqueo(190, 0);
    expect(arqueo.cajaSistema).toBe(190);
    expect(arqueo.faltanteSobrante).toBe(0);
    expect(caja.movCaja).toHaveLength(0);
    expect(caja.saldoCaja).toBe(190);
  });

  it('dos arqueos seguidos acumulan sus ajustes en la caja', async () => {
    const caja = useCajaStore();
    await caja.hacerArqueo(40, 40, 'Sobrante');
    expect(caja.saldoCaja).toBe(40);
    await caja.hacerArqueo(30, -10, 'Faltante');
    expect(caja.saldoCaja).toBe(30);
    expect(caja.arqueos).toHaveLength(2);
    expect(caja.movCaja).toHaveLength(2);
  });
});

describe('cerrarPeriodo: cierres encadenados y arqueo previo', () => {
  function sembrarPeriodo() {
    useConfigStore().cfg.capitalInicial = 100;
    useConfigStore().cfg.periodoInicio = HACE(30);
    useVentasStore().ventas = [
      {
        id: 'v_1',
        fecha: HACE(1),
        items: [{ productoId: 'p_1', nombre: 'A', cantidad: 6, precio: 15, costo: 60, ganancia: 30 }],
        total: 90,
        ganancia: 30,
        anulada: false,
      },
    ];
  }

  it('segundo cierre consecutivo sale vacío (totales 0) sin romper el primero', async () => {
    sembrarPeriodo();
    const cierres = useCierresStore();

    const primero = await cierres.cerrarPeriodo();
    expect(primero.ventas).toBe(90);
    expect(primero.numVentas).toBe(1);
    expect(primero.cajaFinal).toBe(190);

    const segundo = await cierres.cerrarPeriodo();
    expect(segundo.ventas).toBe(0);
    expect(segundo.numVentas).toBe(0);
    expect(segundo.ganancia).toBe(0);
    expect(segundo.compras).toBe(0);
    // La caja física no se reinicia con el cierre
    expect(segundo.cajaFinal).toBe(190);
    expect(await db.cierres.count()).toBe(2);
    // El período avanza al segundo cierre y el primero queda intacto
    expect(useConfigStore().cfg.periodoInicio).toBe(segundo.periodoFin);
    expect((await db.cierres.get(primero.id)).ventas).toBe(90);
  });

  it('un arqueo con faltante hecho antes del cierre se refleja en cajaFinal', async () => {
    useConfigStore().cfg.capitalInicial = 500;
    const caja = useCajaStore();
    await caja.hacerArqueo(475, -25, 'Faltante');
    expect(caja.saldoCaja).toBe(475);

    const cierre = await useCierresStore().cerrarPeriodo();
    expect(cierre.ventas).toBe(0);
    expect(cierre.cajaFinal).toBe(475);
  });
});
