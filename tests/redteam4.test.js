/**
 * Ronda 4 de ataque red-team (lista de la IA): SINCRONIZACIÓN DE CAPITAL +
 * FRONTERAS DEL IMPORT RESTANTES.
 *
 * Vectores ejecutados:
 *  - #16   TOCTOU en retiros y reparto: la validación "monto > disponible"
 *          y "porcentajes = 100" se hace contra el store reactivo (snapshot
 *          viejo) FUERA de la transacción. Dos pestañas (o un respaldo
 *          restaurado a mitad) sobregriran ganancia / reparten mal.
 *  - #4    Respaldo con IDs duplicados: bulkPut es last-wins — un archivo
 *          editado a mano con la misma venta dos veces pierde un registro
 *          EN SILENCIO al importar (validarEsquema no mira unicidad).
 *  - #7/#28/#31-import  Fechas extremas (año 9999 / 1969): pasan la
 *          validación (solo se mira NaN) y quedan mal agrupadas para
 *          siempre: inflan el período actual que nunca cierra.
 *
 * Pins de inmunidad (deben seguir verdes — demuestran defensas existentes):
 *  - #67   Regex-injection en búsquedas: todas usan .includes(), no RegExp.
 *  - #21   Precisión flotante: m() redondea a centavos en cada escalón.
 *  - #33   Carrito con 1000 ítems: totalCarrito no degrada.
 *  - #43   Import masivo: validarEsquema con 20k productos en tiempo razonable.
 *
 * Metodología (idéntica a ronda 3): la sonda se escribe ANTES de los fixes
 * con el comportamiento CORRECTO esperado; los tests en rojo confirman el
 * ataque. La "otra pestaña" se simula escribiendo directo a la BD después
 * de que el store cargó su snapshot (el store queda obsoleto).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { createPinia, setActivePinia } from 'pinia';
import { mount, flushPromises } from '@vue/test-utils';

import { db } from '../src/db';
import { m } from '../src/utils/numero';
import { useBackupStore } from '../src/stores/useBackupStore';
import { useCapitalStore } from '../src/stores/useCapitalStore';
import { useCierresStore } from '../src/stores/useCierresStore';
import { useVentasStore } from '../src/stores/useVentasStore';
import SociosView from '../src/views/SociosView.vue';

beforeEach(async () => {
  setActivePinia(createPinia());
  await Promise.all(db.tables.map((t) => t.clear()));
});

/** Respaldo mínimo pero COMPLETO y sano (todos los checks en verde). */
function respaldoSano() {
  const hoy = new Date().toISOString();
  return {
    version: 10,
    fecha: hoy,
    cfg: { nombre: 'Tienda Prueba', periodoInicio: hoy },
    productos: [
      { id: 'p1', nombre: 'Leche', precio: 5, stockMinimo: 3 },
      { id: 'p2', nombre: 'Pan', precio: 2 },
    ],
    lotes: [{ id: 'l1', productoId: 'p1', cantidadInicial: 100, cantidadVendida: 10, costo: 2, fecha: hoy }],
    ventas: [
      {
        id: 'v1',
        fecha: hoy,
        items: [{ productoId: 'p1', nombre: 'Leche', cantidad: 2, precio: 5, costo: 2, ganancia: 6 }],
        total: 10,
        ganancia: 6,
      },
    ],
    compras: [{ id: 'c1', fecha: hoy, productoId: 'p1', cantidad: 100, costo: 2, total: 200 }],
    ajustes: [],
    arqueos: [],
    movCaja: [],
    cierres: [],
    capital: [{ id: 'k1', fecha: hoy, monto: 500, nota: 'inicial' }],
    retiros: [],
    socios: [{ id: 's1', nombre: 'Ana', porcentaje: 100, aporte: 500, activo: true }],
    distribuciones: [],
    gastos: [
      {
        id: 'g1',
        fecha: hoy,
        categoria: 'Servicios',
        concepto: 'Luz',
        monto: 85,
        metodoPago: 'efectivo',
        saleDeCaja: true,
      },
    ],
  };
}

/** Siembra un cierre con 1000 de ganancia y carga los stores (snapshot). */
async function sembrarGanancia1000() {
  const hoy = new Date().toISOString();
  await db.cierres.put({
    id: 'c1',
    periodo: 'Período sembrado',
    periodoInicio: new Date(Date.now() - 86400000).toISOString(),
    periodoFin: hoy,
    fecha: hoy,
    ganancia: 1000,
  });
  const cierres = useCierresStore();
  await cierres.cargarCierres();
  const capital = useCapitalStore();
  await capital.cargarRetiros();
  return capital;
}

// ============================================================
// 1. TOCTOU EN RETIROS (#16): validación fuera de la transacción
// ============================================================
describe('red-team 4: retiro contra snapshot viejo (#16)', () => {
  it('el retiro se re-valida con retiros FRESCOS dentro de la transacción', async () => {
    const capital = await sembrarGanancia1000();
    // El store cree que hay 1000 disponibles (snapshot limpio)
    expect(capital.gananciaDisponible).toBe(1000);

    // "OTRA PESTAÑA" retira 900 escribiendo directo a la BD:
    // el store de esta pestaña NO se entera
    await db.retiros.put({
      id: 'r_ext',
      fecha: new Date().toISOString(),
      monto: 900,
      concepto: 'retiro de la otra pestaña',
      tipoRetiro: 'ganancia',
    });

    // Esta pestaña intenta retirar 800 contra el snapshot viejo:
    // disponible REAL = 1000 - 900 = 100 → debe RECHAZAR
    capital.retiroForm = { monto: '800', concepto: 'ataque', tipo: 'ganancia' };
    await expect(capital.registrarRetiro()).rejects.toThrow(/[Mm][áa]ximo/);

    // Y la BD no registra el retiro atacante
    const retiros = await db.retiros.toArray();
    expect(retiros.filter((r) => r.concepto === 'ataque').length).toBe(0);
  });

  it('el retiro legítimo dentro del disponible sigue funcionando', async () => {
    const capital = await sembrarGanancia1000();
    capital.retiroForm = { monto: '400', concepto: 'legítimo', tipo: 'ganancia' };
    await capital.registrarRetiro();
    const retiros = await db.retiros.toArray();
    expect(retiros.length).toBe(1);
    expect(retiros[0].monto).toBe(400);
  });
});

// ============================================================
// 2. TOCTOU EN REPARTO (#16): porcentajes y disponible viejos
// ============================================================
describe('red-team 4: reparto contra snapshot viejo (#16)', () => {
  async function sembrarSocios() {
    const hoy = new Date().toISOString();
    await db.socios.bulkPut([
      { id: 'sA', nombre: 'Ana', porcentaje: 50, aporte: 100, activo: true, fecha: hoy },
      { id: 'sB', nombre: 'Beto', porcentaje: 50, aporte: 100, activo: true, fecha: hoy },
    ]);
    const capital = await sembrarGanancia1000();
    await capital.cargarSocios();
    return capital;
  }

  it('el reparto se re-valida con retiros FRESCOS dentro de la transacción', async () => {
    await sembrarSocios();
    // "OTRA PESTAÑA" ya retiró 900 de ganancia (BD, store obsoleto)
    await db.retiros.put({
      id: 'r_ext',
      fecha: new Date().toISOString(),
      monto: 900,
      concepto: 'retiro de la otra pestaña',
      tipoRetiro: 'ganancia',
    });

    const wrapper = mount(SociosView, { global: { stubs: { teleport: true } } });
    const inputs = wrapper.findAll('input');
    const monto = inputs.find((i) => i.attributes('placeholder') === 'Monto a repartir');
    const concepto = inputs.find((i) => i.attributes('placeholder') === 'Concepto (ej: Reparto mensual)');
    await monto.setValue('800');
    await concepto.setValue('ataque');
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Repartir')
      .trigger('click');
    await flushPromises();
    await new Promise((r) => setTimeout(r, 50));

    // El reparto atacante NO se materializa: disponible real = 100
    const dists = await db.distribuciones.toArray();
    expect(dists.filter((d) => d.concepto === 'ataque').length).toBe(0);
    const retiros = await db.retiros.toArray();
    expect(retiros.filter((r) => r.concepto === 'Reparto a socios: ataque').length).toBe(0);
    wrapper.unmount();
  });

  it('el reparto usa porcentajes FRESCOS de los socios', async () => {
    const capital = await sembrarSocios();
    // El snapshot del store dice 50/50...
    expect(capital.sumaPorcentajes).toBe(100);
    // ...pero "OTRA PESTAÑA" editó a 60/40 en la BD
    await db.socios.put({ id: 'sB', nombre: 'Beto', porcentaje: 40, aporte: 100, activo: true });
    await db.socios.put({ id: 'sA', nombre: 'Ana', porcentaje: 60, aporte: 100, activo: true });

    const wrapper = mount(SociosView, { global: { stubs: { teleport: true } } });
    const inputs = wrapper.findAll('input');
    await inputs.find((i) => i.attributes('placeholder') === 'Monto a repartir').setValue('200');
    await inputs.find((i) => i.attributes('placeholder') === 'Concepto (ej: Reparto mensual)').setValue('fresco');
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Repartir')
      .trigger('click');
    await flushPromises();
    await new Promise((r) => setTimeout(r, 50));

    // El reparto respeta los porcentajes reales (60/40), no el snapshot
    const dists = await db.distribuciones.toArray();
    expect(dists.length).toBe(2);
    const ana = dists.find((d) => d.socioId === 'sA');
    const beto = dists.find((d) => d.socioId === 'sB');
    expect(ana.monto).toBe(120); // 60% de 200
    expect(beto.monto).toBe(80); // 40% de 200
    wrapper.unmount();
  });

  it('porcentajes que ya no suman 100 en la BD se rechazan dentro de la transacción', async () => {
    await sembrarSocios();
    // "OTRA PESTAÑA" dejó los porcentajes en 50+70=120 (snapshot dice 100)
    await db.socios.put({ id: 'sB', nombre: 'Beto', porcentaje: 70, aporte: 100, activo: true });

    const wrapper = mount(SociosView, { global: { stubs: { teleport: true } } });
    const inputs = wrapper.findAll('input');
    await inputs.find((i) => i.attributes('placeholder') === 'Monto a repartir').setValue('200');
    await inputs.find((i) => i.attributes('placeholder') === 'Concepto (ej: Reparto mensual)').setValue('roto');
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Repartir')
      .trigger('click');
    await flushPromises();
    await new Promise((r) => setTimeout(r, 50));

    const dists = await db.distribuciones.toArray();
    expect(dists.filter((d) => d.concepto === 'roto').length).toBe(0);
    wrapper.unmount();
  });
});

// ============================================================
// 3. IDs DUPLICADOS EN EL RESPALDO (#4): pérdida silenciosa
// ============================================================
describe('red-team 4: respaldo con IDs duplicados (#4)', () => {
  it('validarEsquema rechaza ids duplicados por tabla', () => {
    const d = respaldoSano();
    // La misma venta (id v1) dos veces: bulkPut es last-wins → una se pierde
    d.ventas.push({ ...d.ventas[0] });
    const v = useBackupStore().validarEsquema(d);
    expect(v.ok).toBe(false);
    expect(v.errores.join(' ')).toMatch(/duplicad/i);
  });

  it('duplicados en productos también se rechazan', () => {
    const d = respaldoSano();
    d.productos.push({ ...d.productos[0] });
    const v = useBackupStore().validarEsquema(d);
    expect(v.ok).toBe(false);
    expect(v.errores.join(' ')).toMatch(/duplicad/i);
  });

  it('el respaldo sano (sin duplicados) sigue pasando', () => {
    const v = useBackupStore().validarEsquema(respaldoSano());
    expect(v.ok).toBe(true);
    expect(v.errores).toEqual([]);
  });
});

// ============================================================
// 4. FECHAS EXTREMAS EN EL RESPALDO (#7/#28/#31-import)
// ============================================================
describe('red-team 4: fechas extremas por import (#7/#28)', () => {
  it('venta del año 9999 se rechaza (inflaría el período para siempre)', () => {
    const d = respaldoSano();
    d.ventas[0].fecha = '9999-12-31T00:00:00.000Z';
    const v = useBackupStore().validarEsquema(d);
    expect(v.ok).toBe(false);
    expect(v.errores.join(' ')).toMatch(/rango|a[ñn]o|fecha/i);
  });

  it('lote de 1969 (pre-app) se rechaza', () => {
    const d = respaldoSano();
    d.lotes[0].fecha = '1969-07-20T00:00:00.000Z';
    const v = useBackupStore().validarEsquema(d);
    expect(v.ok).toBe(false);
    expect(v.errores.join(' ')).toMatch(/rango|a[ñn]o|fecha/i);
  });

  it('cierre con periodoFin en el año 2101 se rechaza', () => {
    const d = respaldoSano();
    d.cierres = [
      {
        id: 'c9',
        periodo: 'x',
        periodoInicio: '2101-01-01T00:00:00.000Z',
        periodoFin: '2101-02-01T00:00:00.000Z',
        fecha: '2101-02-01T00:00:00.000Z',
        ganancia: 5,
      },
    ];
    const v = useBackupStore().validarEsquema(d);
    expect(v.ok).toBe(false);
  });

  it('las fechas normales (2020..2100) siguen pasando', () => {
    const d = respaldoSano();
    d.ventas[0].fecha = '2021-06-15T12:00:00.000Z';
    d.lotes[0].fecha = '2020-01-01T00:00:00.000Z';
    const v = useBackupStore().validarEsquema(d);
    expect(v.ok).toBe(true);
    expect(v.errores).toEqual([]);
  });
});

// ============================================================
// 5. PINS DE INMUNIDAD (#67/#21/#33/#43)
// ============================================================
describe('red-team 4: pins de inmunidad', () => {
  it('#67 una búsqueda de 10k puntos regex NO cuelga la vista (includes, no RegExp)', async () => {
    const hoy = new Date().toISOString();
    await db.ventas.put({
      id: 'v1',
      fecha: hoy,
      items: [{ productoId: 'p1', nombre: 'Leche', cantidad: 2, precio: 5, costo: 2, ganancia: 6 }],
      total: 10,
      ganancia: 6,
    });
    const ventas = useVentasStore();
    await ventas.cargarVentas();

    const bomba = '.*'.repeat(5000); // 10k chars de regex catastrófica
    const t0 = Date.now();
    ventas.busqVenta = bomba;
    expect(() => ventas.ventasFiltradas).not.toThrow();
    const ms = Date.now() - t0;
    expect(ms).toBeLessThan(1000); // includes() es O(n·m): lineal, no exponencial
    expect(ventas.ventasFiltradas.length).toBe(0);
  });

  it('#21 m() neutraliza la precisión flotante en cada escalón', () => {
    expect(m(0.1 + 0.2)).toBe(0.3);
    let tot = 0;
    for (let i = 0; i < 10; i++) tot = m(tot + 0.1);
    expect(tot).toBe(1);
  });

  it('#33 carrito con 1000 ítems: totalCarrito exacto y sin degradación', async () => {
    const ventas = useVentasStore();
    ventas.carrito = Array.from({ length: 1000 }, (_, i) => ({
      productoId: 'p' + i,
      nombre: 'Prod ' + i,
      cant: 2,
      precio: 3.5,
    }));
    const t0 = Date.now();
    const total = ventas.totalCarrito;
    const ms = Date.now() - t0;
    expect(total).toBe(7000);
    expect(ms).toBeLessThan(2000);
  });

  it('#43 validarEsquema con 20k productos termina en tiempo razonable', () => {
    const d = respaldoSano();
    d.productos = Array.from({ length: 20000 }, (_, i) => ({
      id: 'px' + i,
      nombre: 'Producto ' + i,
      precio: 5,
    }));
    const t0 = Date.now();
    const v = useBackupStore().validarEsquema(d);
    const ms = Date.now() - t0;
    expect(v.ok).toBe(true);
    expect(ms).toBeLessThan(5000);
  });
});
