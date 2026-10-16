/**
 * Tests PROFUNDOS de GastosView + useGastosStore — Área 1 de la campaña
 * de cobertura profunda (80-90% de la app).
 *
 * La vista tiene implementación PROPIA de guardar/editar/eliminar (NO delega
 * en el store): estos tests ejercen el camino REAL por el DOM — el mismo que
 * usa el dueño. El espejo contable en movCaja es parte del contrato: un gasto
 * que sale de caja DEBE nacer y morir con su espejo, o el saldo descuadra.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { createPinia, setActivePinia } from 'pinia';
import { mount, flushPromises } from '@vue/test-utils';
import { toast } from 'vue-sonner';

import { db } from '../src/db';
import { useGastosStore } from '../src/stores/useGastosStore';
import { useConfigStore } from '../src/stores/useConfigStore';
import { useCajaStore } from '../src/stores/useCajaStore';
import { useCierresStore } from '../src/stores/useCierresStore';
import { useUIStore } from '../src/stores/useUIStore';
import { fechaLocal } from '../src/utils/fecha';
import AppIcon from '../src/components/AppIcon.vue';
import GastosView from '../src/views/GastosView.vue';

const PERIODO_INI = '2026-09-01T00:00:00.000Z';

async function montar() {
  const wrapper = mount(GastosView, {
    global: { components: { Icon: AppIcon }, stubs: { teleport: true } },
  });
  await flushPromises();
  return wrapper;
}

/** Llena el formulario de gasto por el DOM (camino real del usuario). */
async function llenarForm(w, o = {}) {
  if (o.fecha !== undefined) await w.find('input[type="date"]').setValue(o.fecha);
  if (o.categoria !== undefined) await w.findAll('select')[0].setValue(o.categoria);
  if (o.concepto !== undefined) await w.find('input[placeholder^="Concepto"]').setValue(o.concepto);
  if (o.monto !== undefined) await w.find('input[placeholder="Monto"]').setValue(o.monto);
  if (o.nota !== undefined) await w.find('input[placeholder^="Nota"]').setValue(o.nota);
  if (o.metodoPago !== undefined) await w.findAll('select')[1].setValue(o.metodoPago);
  if (o.saleDeCaja !== undefined) await w.find('input[type="checkbox"]').setValue(o.saleDeCaja);
}

/**
 * Click en guardar y espera a que la operación se asiente: la transacción
 * Dexie + las recargas de stores encadenadas (recargarStores → regenerarAsientos)
 * resuelven DESPUÉS del flushPromises estándar. cond: predicado sincrónico sobre
 * estado reactivo (stores); si se omite, colchón fijo para aserciones negativas.
 */
async function clickGuardar(w, cond) {
  await w.find('button.btn.warn').trigger('click');
  if (cond) {
    const fin = Date.now() + 3000;
    while (!cond() && Date.now() < fin) {
      await new Promise((r) => setTimeout(r, 25));
      await flushPromises();
    }
  } else {
    await new Promise((r) => setTimeout(r, 200));
    await flushPromises();
  }
}

/** Siembra un gasto con espejo coherente (como lo haría la vista). */
async function sembrarGasto(g) {
  await db.transaction('rw', db.gastos, db.movCaja, async () => {
    await db.gastos.put(g);
    if (g.saleDeCaja && g.movId) {
      await db.movCaja.put({
        id: g.movId,
        fecha: g.fecha,
        tipo: 'egreso',
        monto: g.monto,
        concepto: 'Gasto: ' + g.categoria + ' - ' + g.concepto,
        nota: g.nota || '',
      });
    }
  });
}

beforeEach(async () => {
  setActivePinia(createPinia());
  vi.restoreAllMocks();
  await Promise.all([
    db.gastos.clear(),
    db.movCaja.clear(),
    db.config.clear(),
    db.cierres.clear(),
    db.asientos.clear(),
  ]);
  const config = useConfigStore();
  config.cfg.periodoInicio = PERIODO_INI;
  config.cfg.capitalInicial = 1000;
  await useGastosStore().cargarGastos();
  await useCajaStore().cargarMovCaja();
  await useCierresStore().cargarCierres();
});

// ============================================================
// VALIDACIÓN DE FRONTERA — el camino REAL (la vista, no el store)
// ============================================================
describe('GastosView: validación del formulario real', () => {
  it('SONDA: monto "1e999" (Infinity) NO se guarda — la caja no puede irse a -∞', async () => {
    const w = await montar();
    const errSpy = vi.spyOn(toast, 'error').mockImplementation(() => {});
    await llenarForm(w, { categoria: 'Luz', concepto: 'Luz', monto: '1e999' });
    await clickGuardar(w);
    expect(errSpy).toHaveBeenCalled();
    expect(await db.gastos.count()).toBe(0);
    expect(await db.movCaja.count()).toBe(0);
    w.unmount();
  });

  it('monto 0 y monto negativo rechazados sin escribir nada', async () => {
    const w = await montar();
    const errSpy = vi.spyOn(toast, 'error').mockImplementation(() => {});
    await llenarForm(w, { categoria: 'Luz', concepto: 'Luz', monto: '0' });
    await clickGuardar(w);
    await llenarForm(w, { categoria: 'Luz', concepto: 'Luz', monto: '-50' });
    await clickGuardar(w);
    expect(errSpy).toHaveBeenCalledTimes(2);
    expect(await db.gastos.count()).toBe(0);
    expect(await db.movCaja.count()).toBe(0);
    w.unmount();
  });

  it('categoría y concepto obligatorios', async () => {
    const w = await montar();
    const errSpy = vi.spyOn(toast, 'error').mockImplementation(() => {});
    await llenarForm(w, { concepto: 'Luz', monto: '10' }); // sin categoria
    await clickGuardar(w);
    // (el early-return NO limpia el formulario: hay que vaciar a mano)
    await llenarForm(w, { categoria: 'Luz', concepto: '', monto: '10' }); // sin concepto
    await clickGuardar(w);
    expect(errSpy).toHaveBeenCalledTimes(2);
    expect(await db.gastos.count()).toBe(0);
    w.unmount();
  });
});

// ============================================================
// REGISTRAR — happy path con espejo contable
// ============================================================
describe('GastosView: registrar gasto', () => {
  it('saleDeCaja crea el espejo movCaja y resta del saldo de caja', async () => {
    const okSpy = vi.spyOn(toast, 'success').mockImplementation(() => {});
    const w = await montar();
    await llenarForm(w, {
      fecha: '2026-10-05',
      categoria: 'Luz',
      concepto: 'Recibo de luz',
      monto: '85.5',
      nota: 'octubre',
      metodoPago: 'efectivo',
      saleDeCaja: true,
    });
    await clickGuardar(w, () => useGastosStore().gastos.length === 1);

    const gastos = await db.gastos.toArray();
    expect(gastos.length).toBe(1);
    const g = gastos[0];
    expect(g.monto).toBe(85.5);
    expect(g.concepto).toBe('Recibo de luz');
    expect(g.categoria).toBe('Luz');
    expect(g.saleDeCaja).toBe(true);
    expect(g.movId).toBeTruthy();

    // El día elegido en el formulario es el día guardado (contrato local)
    expect(fechaLocal(g.fecha)).toBe('2026-10-05');

    const movs = await db.movCaja.toArray();
    expect(movs.length).toBe(1);
    expect(movs[0].tipo).toBe('egreso');
    expect(movs[0].monto).toBe(85.5);
    expect(movs[0].concepto).toBe('Gasto: Luz - Recibo de luz');
    expect(movs[0].id).toBe(g.movId);

    // Stores recargados por la vista + caja restando el espejo
    expect(useGastosStore().gastos.length).toBe(1);
    const caja = useCajaStore();
    expect(caja.movCaja.length).toBe(1);
    expect(caja.saldoCaja).toBe(914.5);

    // Formulario reseteado tras guardar
    expect(w.find('input[placeholder^="Concepto"]').element.value).toBe('');
    expect(okSpy).toHaveBeenCalled();
    w.unmount();
  });

  it('sin saleDeCaja NO crea espejo (gasto administrativo)', async () => {
    vi.spyOn(toast, 'success').mockImplementation(() => {});
    const w = await montar();
    await llenarForm(w, {
      categoria: 'Otros',
      concepto: 'Onat',
      monto: '200',
      saleDeCaja: false,
    });
    await clickGuardar(w, () => useGastosStore().gastos.length === 1);

    const gastos = await db.gastos.toArray();
    expect(gastos.length).toBe(1);
    expect(gastos[0].saleDeCaja).toBe(false);
    expect(gastos[0].movId).toBeNull();
    expect(await db.movCaja.count()).toBe(0);
    expect(useCajaStore().saldoCaja).toBe(1000); // caja intacta
    w.unmount();
  });

  it('gasto del período actual suma a gastosOpPeriodo y al acumulado', async () => {
    vi.spyOn(toast, 'success').mockImplementation(() => {});
    const w = await montar();
    await llenarForm(w, { categoria: 'Luz', concepto: 'Luz', monto: '30', saleDeCaja: false });
    await clickGuardar(w, () => useGastosStore().gastos.length === 1);
    const s = useGastosStore();
    expect(s.gastosOpPeriodo).toBe(30);
    expect(s.gastosTotalAcumulado).toBe(30);
    w.unmount();
  });
});

// ============================================================
// EDITAR — el espejo sigue vivo y coherente
// ============================================================
describe('GastosView: editar gasto', () => {
  it('cambiar el monto actualiza el espejo con el MISMO movId', async () => {
    vi.spyOn(toast, 'success').mockImplementation(() => {});
    await sembrarGasto({
      id: 'g1',
      fecha: '2026-10-01T12:00:00.000Z',
      categoria: 'Luz',
      concepto: 'Luz',
      monto: 50,
      nota: '',
      metodoPago: 'efectivo',
      saleDeCaja: true,
      movId: 'mc1',
    });
    await useGastosStore().cargarGastos();
    await useCajaStore().cargarMovCaja();

    const w = await montar();
    await w.find('button[aria-label="Editar"]').trigger('click');
    await flushPromises();

    // Prefill del formulario
    expect(w.find('input[placeholder^="Concepto"]').element.value).toBe('Luz');
    expect(w.find('input[placeholder="Monto"]').element.value).toBe('50');
    expect(w.find('button.btn.warn').text()).toContain('Actualizar');

    await llenarForm(w, { monto: '70' });
    await clickGuardar(w, () => useGastosStore().gastos[0]?.monto === 70);

    const g = await db.gastos.get('g1');
    expect(g.monto).toBe(70);
    expect(g.movId).toBe('mc1'); // mismo espejo, no uno nuevo
    const movs = await db.movCaja.toArray();
    expect(movs.length).toBe(1);
    expect(movs[0].monto).toBe(70);
    expect(movs[0].id).toBe('mc1');
    expect(useCajaStore().saldoCaja).toBe(930);
    w.unmount();
  });

  it('desactivar saleDeCaja borra el espejo (la caja recupera el dinero)', async () => {
    vi.spyOn(toast, 'success').mockImplementation(() => {});
    await sembrarGasto({
      id: 'g1',
      fecha: '2026-10-01T12:00:00.000Z',
      categoria: 'Luz',
      concepto: 'Luz',
      monto: 50,
      nota: '',
      metodoPago: 'efectivo',
      saleDeCaja: true,
      movId: 'mc1',
    });
    await useGastosStore().cargarGastos();
    await useCajaStore().cargarMovCaja();

    const w = await montar();
    await w.find('button[aria-label="Editar"]').trigger('click');
    await flushPromises();
    await llenarForm(w, { saleDeCaja: false });
    await clickGuardar(w, () => useCajaStore().movCaja.length === 0);

    const g = await db.gastos.get('g1');
    expect(g.saleDeCaja).toBe(false);
    expect(g.movId).toBeNull();
    expect(await db.movCaja.count()).toBe(0);
    expect(useCajaStore().saldoCaja).toBe(1000);
    w.unmount();
  });

  it('activar saleDeCaja cuando no tenía crea el espejo por primera vez', async () => {
    vi.spyOn(toast, 'success').mockImplementation(() => {});
    await sembrarGasto({
      id: 'g1',
      fecha: '2026-10-01T12:00:00.000Z',
      categoria: 'Otros',
      concepto: 'Onat',
      monto: 200,
      nota: '',
      metodoPago: 'efectivo',
      saleDeCaja: false,
      movId: null,
    });
    await useGastosStore().cargarGastos();

    const w = await montar();
    await w.find('button[aria-label="Editar"]').trigger('click');
    await flushPromises();
    await llenarForm(w, { saleDeCaja: true });
    await clickGuardar(w, () => useCajaStore().movCaja.length === 1);

    const g = await db.gastos.get('g1');
    expect(g.saleDeCaja).toBe(true);
    expect(g.movId).toBeTruthy();
    const movs = await db.movCaja.toArray();
    expect(movs.length).toBe(1);
    expect(movs[0].monto).toBe(200);
    expect(useCajaStore().saldoCaja).toBe(800);
    w.unmount();
  });

  it('cancelar la edición restaura el formulario vacío', async () => {
    await sembrarGasto({
      id: 'g1',
      fecha: '2026-10-01T12:00:00.000Z',
      categoria: 'Luz',
      concepto: 'Luz',
      monto: 50,
      nota: '',
      metodoPago: 'efectivo',
      saleDeCaja: false,
      movId: null,
    });
    await useGastosStore().cargarGastos();
    const w = await montar();
    await w.find('button[aria-label="Editar"]').trigger('click');
    await flushPromises();
    await w.find('button.btn.ghost').trigger('click');
    await flushPromises();
    expect(w.find('button.btn.warn').text()).toContain('Registrar');
    expect(w.find('input[placeholder^="Concepto"]').element.value).toBe('');
    w.unmount();
  });
});

// ============================================================
// ELIMINAR — gasto y espejo mueren juntos
// ============================================================
describe('GastosView: eliminar gasto', () => {
  it('elimina gasto Y espejo en la misma transacción (caja íntegra)', async () => {
    vi.spyOn(toast, 'success').mockImplementation(() => {});
    await sembrarGasto({
      id: 'g1',
      fecha: '2026-10-01T12:00:00.000Z',
      categoria: 'Luz',
      concepto: 'Luz',
      monto: 50,
      nota: '',
      metodoPago: 'efectivo',
      saleDeCaja: true,
      movId: 'mc1',
    });
    await useGastosStore().cargarGastos();
    await useCajaStore().cargarMovCaja();

    const w = await montar();
    await w.find('button[aria-label="Eliminar"]').trigger('click');
    await flushPromises();
    useUIStore().okConfirm(); // ejecuta el onOk real
    await clickGuardar(w, () => useGastosStore().gastos.length === 0);

    expect(await db.gastos.count()).toBe(0);
    expect(await db.movCaja.count()).toBe(0);
    expect(useCajaStore().saldoCaja).toBe(1000);
    expect(useGastosStore().gastos.length).toBe(0);
    w.unmount();
  });
});

// ============================================================
// HISTORIAL — agrupación por períodos y paginación
// ============================================================
describe('GastosView: historial por períodos', () => {
  it('agrupa en ACTUAL / CERRADO (colapsable) / Anteriores al primer cierre', async () => {
    await db.cierres.put({
      id: 'c1',
      periodo: 'Ago 2026',
      periodoInicio: '2026-08-01T00:00:00.000Z',
      periodoFin: '2026-09-01T00:00:00.000Z',
      fechaCierre: '2026-09-01T20:00:00.000Z',
      ganancia: 500,
    });
    await useCierresStore().cargarCierres();
    await db.gastos.bulkPut([
      {
        id: 'gA',
        fecha: '2026-10-02T12:00:00.000Z',
        categoria: 'Luz',
        concepto: 'Luz actual',
        monto: 10,
        saleDeCaja: false,
      },
      {
        id: 'gB',
        fecha: '2026-08-15T12:00:00.000Z',
        categoria: 'Luz',
        concepto: 'Luz agosto',
        monto: 20,
        saleDeCaja: false,
      },
      {
        id: 'gC',
        fecha: '2026-05-01T12:00:00.000Z',
        categoria: 'Luz',
        concepto: 'Luz antigua',
        monto: 30,
        saleDeCaja: false,
      },
    ]);
    await useGastosStore().cargarGastos();

    const w = await montar();
    const txt = w.text();
    expect(txt).toContain('Periodo actual');
    expect(txt).toContain('Ago 2026');
    expect(txt).toContain('Anteriores al primer cierre');
    expect(txt).toContain('Luz actual');

    // El grupo cerrado nace COLAPSADO: su contenido no se ve
    expect(txt).not.toContain('Luz agosto');
    expect(txt).not.toContain('Luz antigua');

    // Expandir el cierre muestra sus gastos
    await w.find('.hist-head-click').trigger('click');
    await flushPromises();
    expect(w.text()).toContain('Luz agosto');

    // El grupo de antiguos también es expandible
    const heads = w.findAll('.hist-head-click');
    await heads[heads.length - 1].trigger('click');
    await flushPromises();
    expect(w.text()).toContain('Luz antigua');
    w.unmount();
  });

  it('paginación: 25 gastos → 20 visibles + "Mostrar 20 mas (5 restantes)"', async () => {
    const gastos = [];
    for (let i = 0; i < 25; i++) {
      gastos.push({
        id: 'gp' + i,
        fecha: new Date(Date.UTC(2026, 9, 1 + Math.floor(i / 2), 12)).toISOString(),
        categoria: 'Luz',
        concepto: 'Gasto numero ' + i,
        monto: 1,
        saleDeCaja: false,
      });
    }
    await db.gastos.bulkPut(gastos);
    await useGastosStore().cargarGastos();

    const w = await montar();
    expect(w.findAll('.item').length).toBe(20);
    expect(w.text()).toContain('Mostrar 20 mas');
    expect(w.text()).toContain('5 restantes');

    await w.find('.hist-mas button').trigger('click');
    await flushPromises();
    expect(w.findAll('.item').length).toBe(25);
    expect(w.find('.hist-mas').exists()).toBe(false);
    w.unmount();
  });
});

// ============================================================
// STORE — computeds puros
// ============================================================
describe('useGastosStore: computeds', () => {
  it('gastosOrdenados: el más reciente primero', async () => {
    await db.gastos.bulkPut([
      { id: 'a', fecha: '2026-10-01T12:00:00.000Z', concepto: 'A', monto: 1, categoria: 'X' },
      { id: 'b', fecha: '2026-10-05T12:00:00.000Z', concepto: 'B', monto: 2, categoria: 'X' },
      { id: 'c', fecha: '2026-10-03T12:00:00.000Z', concepto: 'C', monto: 3, categoria: 'X' },
    ]);
    const s = useGastosStore();
    await s.cargarGastos();
    expect(s.gastosOrdenados.map((g) => g.id)).toEqual(['b', 'c', 'a']);
  });

  it('gastosPorCategoria: agrega, ordena desc y usa "Sin categoría"', async () => {
    await db.gastos.bulkPut([
      { id: 'a', fecha: '2026-10-01T12:00:00.000Z', concepto: 'A', monto: 10, categoria: 'Luz' },
      { id: 'b', fecha: '2026-10-02T12:00:00.000Z', concepto: 'B', monto: 25, categoria: 'Luz' },
      { id: 'c', fecha: '2026-10-03T12:00:00.000Z', concepto: 'C', monto: 5, categoria: '' },
      { id: 'd', fecha: '2026-10-04T12:00:00.000Z', concepto: 'D', monto: 15, categoria: 'Otros' },
    ]);
    const s = useGastosStore();
    await s.cargarGastos();
    expect(s.gastosPorCategoria).toEqual([
      { cat: 'Luz', monto: 35 },
      { cat: 'Otros', monto: 15 },
      { cat: 'Sin categoría', monto: 5 },
    ]);
  });

  it('gastosOpPeriodo: incluye el gasto exactamente en periodoInicio (borde >=)', async () => {
    await db.gastos.bulkPut([
      { id: 'borde', fecha: PERIODO_INI, concepto: 'Borde', monto: 7, categoria: 'X' },
      { id: 'antes', fecha: '2026-08-31T23:59:59.999Z', concepto: 'Antes', monto: 99, categoria: 'X' },
    ]);
    const s = useGastosStore();
    await s.cargarGastos();
    expect(s.gastosOpPeriodo).toBe(7);
    expect(s.gastosTotalAcumulado).toBe(106);
  });
});
