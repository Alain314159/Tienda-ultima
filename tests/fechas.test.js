/**
 * Tests de fechas locales y de los bugs contables cazados en la auditoría
 * post-"sin bugs" (los que sobrevivieron a 10 ciclos de pulido):
 *
 * 1. ZONA HORARIA (TZ=America/Havana, la del dueño): el parse
 *    `new Date('YYYY-MM-DD')` es medianoche UTC → en Cuba el cuadre por
 *    fechas manuales perdía el ÚLTIMO día entero del rango e incluía horas
 *    de la tarde del día anterior. Suite de regresión con la TZ real.
 * 2. SOCIOS: el aporte inicial es un hecho contable (Caja↔Capital) —
 *    eliminar el socio ya no lo borra del balance (la caja no cambia).
 * 3. LIBRO DIARIO: gastos de respaldos viejos cuyo movCaja espejo no trae
 *    movId ya no se restan dos veces de la caja del libro.
 * 4. RESYNC: si la transacción de anulación falla, los lotes en memoria
 *    se recargan (la UI no muestra un stock restaurado que no existe).
 */
import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('../src/utils/toast', () => ({ toastMsg: vi.fn() }));

import { fechaLocal, hoyLocal, diaLocal } from '../src/utils/fecha';
import { generarAsientos } from '../src/services/libroDiario';
import { db } from '../src/db';
import { useConfigStore } from '../src/stores/useConfigStore';
import { useVentasStore } from '../src/stores/useVentasStore';
import { useCapitalStore } from '../src/stores/useCapitalStore';
import { useCajaStore } from '../src/stores/useCajaStore';
import { useLotesStore } from '../src/stores/useLotesStore';

const TZ_ORIGINAL = process.env.TZ;

async function limpiarDb() {
  await Promise.all([
    db.socios.clear(),
    db.capital.clear(),
    db.ventas.clear(),
    db.lotes.clear(),
    db.gastos.clear(),
    db.movCaja.clear(),
    db.asientos.clear(),
    db.config.clear(),
  ]);
}

beforeEach(async () => {
  vi.clearAllMocks();
  setActivePinia(createPinia());
  await limpiarDb();
});

// ============================================================================
// 1) HELPERS DE FECHA — contrato básico (cualquiera que sea la TZ del runner)
// ============================================================================
describe('utils/fecha', () => {
  it('diaLocal: medianoche local y fin del día local del mismo día', () => {
    const ini = diaLocal('2026-10-15');
    expect(ini.getFullYear()).toBe(2026);
    expect(ini.getMonth()).toBe(9);
    expect(ini.getDate()).toBe(15);
    expect(ini.getHours()).toBe(0);
    expect(ini.getMinutes()).toBe(0);

    const fin = diaLocal('2026-10-15', true);
    expect(fin.getDate()).toBe(15); // MISMO día local: en Cuba caía en el 14
    expect(fin.getHours()).toBe(23);
    expect(fin.getMinutes()).toBe(59);
    expect(fin.getMilliseconds()).toBe(999);
  });

  it('diaLocal: basura devuelve centinelas estables (no NaN)', () => {
    expect(diaLocal('').getTime()).toBe(0);
    expect(diaLocal('no-es-fecha').getTime()).toBe(0);
    expect(isNaN(diaLocal('x', true).getTime())).toBe(false);
  });

  it('fechaLocal: fecha local de un momento (no la UTC)', () => {
    // 2026-10-15T02:00Z: en UTC es día 15, en Havana (UTC-4) es 14/10 22:00
    process.env.TZ = 'UTC';
    const utc = fechaLocal('2026-10-15T02:00:00.000Z');
    process.env.TZ = 'America/Havana';
    const hav = fechaLocal('2026-10-15T02:00:00.000Z');
    process.env.TZ = TZ_ORIGINAL;
    expect(utc).toBe('2026-10-15');
    expect(hav).toBe('2026-10-14');
  });

  it('hoyLocal: formato YYYY-MM-DD del día en curso', () => {
    expect(hoyLocal()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(hoyLocal()).toBe(fechaLocal(new Date()));
  });
});

// ============================================================================
// 2) REGRESIÓN TZ AMERICA/HAVANA — el bug del cuadre que perdía un día
// ============================================================================
describe('TZ America/Havana (regresión del cuadre desplazado)', () => {
  beforeAll(() => {
    process.env.TZ = 'America/Havana'; // la TZ real del dueño
  });
  afterAll(() => {
    process.env.TZ = TZ_ORIGINAL;
  });

  it('diaLocal parsea el input como día de La Habana, no UTC', () => {
    // Medianoche del 15/10 en Havana (CDT, UTC-4) = 15/10 04:00Z.
    // El código viejo (new Date('2026-10-15')) daba 15/10 00:00Z = 14/10 20:00 habana.
    expect(diaLocal('2026-10-15').getTime()).toBe(Date.UTC(2026, 9, 15, 4));
    // Fin del día: 15/10 23:59:59.999 CDT = 16/10 03:59:59.999Z
    expect(diaLocal('2026-10-15', true).getTime()).toBe(Date.UTC(2026, 9, 16, 3, 59, 59, 999));
  });

  it('hoyLocal por la noche habanera no devuelve "mañana"', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-15T02:30:00.000Z')); // 14/10 22:30 en Havana
    expect(hoyLocal()).toBe('2026-10-14');
    vi.useRealTimers();
  });

  it('cuadre manual [10→15 oct] incluye la venta del mediodía local del 15', async () => {
    const { useCuadre } = await import('../src/composables/useCuadre');
    const ventasStore = useVentasStore();
    // La app guarda los gastos/ventas con fecha local-mediodía: 15/10 12:00
    // Havana = 15/10 16:00Z. Con el parse UTC viejo el fin del rango caía en
    // 14/10 23:59 habana → esta venta quedaba FUERA del cuadre.
    ventasStore.ventas = [
      {
        id: 'v_tz',
        fecha: '2026-10-15T16:00:00.000Z',
        items: [{ productoId: 'p', nombre: 'X', cantidad: 1, precio: 10, costo: 4, ganancia: 6 }],
        total: 10,
        ganancia: 6,
        anulada: false,
      },
      {
        id: 'v_vieja',
        fecha: '2026-10-09T16:00:00.000Z', // 9/10 mediodía habana: fuera del rango
        items: [{ productoId: 'p', nombre: 'X', cantidad: 1, precio: 99, costo: 1, ganancia: 98 }],
        total: 99,
        ganancia: 98,
        anulada: false,
      },
    ];
    const { rep, generarReporte } = useCuadre();
    rep.fechaInicio = '2026-10-10';
    rep.fechaFin = '2026-10-15';
    rep.isoInicio = null;
    rep.isoFin = null;
    generarReporte();

    expect(rep.resultado.numVentas).toBe(1);
    expect(rep.resultado.ingresos).toBe(10);
    expect(rep.resultado.cogs).toBe(4);
  });

  it('setSemana por la noche habanera no muestra "mañana" ni pierde la mañana del primer día', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-15T02:30:00.000Z')); // 14/10 22:30 Havana
    const { useCuadre } = await import('../src/composables/useCuadre');
    const { rep, setSemana } = useCuadre();
    setSemana();
    expect(rep.fechaFin).toBe('2026-10-14'); // hoy LOCAL, no el 15 UTC
    expect(rep.fechaInicio).toBe('2026-10-07'); // 7 días locales atrás
    expect(diaLocal(rep.fechaInicio).getHours()).toBe(0); // medianoche: la mañana cuenta
    vi.useRealTimers();
  });
});

// ============================================================================
// 3) SOCIOS — el aporte no puede desaparecer del balance
// ============================================================================
describe('eliminarSocio conserva el aporte (caja intacta)', () => {
  it('crea el movimiento de capital y saldoCaja no cambia', async () => {
    const configStore = useConfigStore();
    const capitalStore = useCapitalStore();
    const cajaStore = useCajaStore();

    configStore.cfg.capitalInicial = 1000;
    // regenerarAsientos lee la cfg de la BD, no del store: persistirla
    await db.config.put({ key: 'cfg', value: { capitalInicial: 1000 } });
    await db.socios.put({ id: 'so_1', nombre: 'Ana', porcentaje: 50, aporte: 5000, activo: true });
    await capitalStore.cargarSocios();

    // Caja con el aporte de Ana dentro
    const cajaAntes = cajaStore.saldoCaja;
    expect(cajaAntes).toBe(6000);

    const aporteDevuelto = await capitalStore.eliminarSocio('so_1');
    expect(aporteDevuelto).toBe(5000);

    // El socio se fue, su dinero NO: mismo balance, mismo saldo de caja
    expect(capitalStore.socios.length).toBe(0);
    expect(capitalStore.capitalTotal).toBe(6000);
    expect(cajaStore.saldoCaja).toBe(6000);

    // Materializado como movimiento de capital con nota explicativa
    const movs = await db.capital.toArray();
    expect(movs).toHaveLength(1);
    expect(movs[0].monto).toBe(5000);
    expect(movs[0].nota).toContain('Ana');

    // El libro diario (regenerado por eliminarSocio) sigue cuadrando la caja:
    // capitalInicial 1000 + aporte conservado 5000 = 6000 en Caja
    const asientos = await db.asientos.toArray();
    const cajaAsientos = asientos.reduce(
      (s, a) => s + (a.cuentaDebe === 'Caja' ? a.monto : 0) - (a.cuentaHaber === 'Caja' ? a.monto : 0),
      0
    );
    expect(cajaAsientos).toBe(6000);
  });

  it('socio sin aporte se elimina limpio (sin movimiento espurio)', async () => {
    const capitalStore = useCapitalStore();
    await db.socios.put({ id: 'so_2', nombre: 'Beto', porcentaje: 10, aporte: 0, activo: true });
    await capitalStore.cargarSocios();

    const aporte = await capitalStore.eliminarSocio('so_2');
    expect(aporte).toBe(0);
    expect(await db.capital.count()).toBe(0);
    expect(capitalStore.socios.length).toBe(0);
  });

  it('socio inexistente lanza error', async () => {
    const capitalStore = useCapitalStore();
    await expect(capitalStore.eliminarSocio('no-existe')).rejects.toThrow(/no encontrado/i);
  });
});

// ============================================================================
// 4) LIBRO DIARIO — espejos de gasto sin movId (respaldos viejos)
// ============================================================================
describe('libro diario: gastos viejos sin movId no se restan dos veces', () => {
  it('movCaja espejo sin enlace se excluye por concepto', () => {
    const datos = {
      capitalInicial: 100,
      ventas: [],
      compras: [],
      gastos: [
        {
          id: 'g_1',
          fecha: '2026-01-05T16:00:00.000Z',
          monto: 30,
          categoria: 'luz',
          concepto: 'recibo',
          saleDeCaja: true,
          // SIN movId: así venían los respaldos pre-migración
        },
      ],
      capital: [],
      retiros: [],
      movCaja: [
        // Espejo del gasto (concepto con el prefijo que la app siempre usó)
        { id: 'mc_1', fecha: '2026-01-05T16:00:00.000Z', tipo: 'egreso', monto: 30, concepto: 'Gasto: luz - recibo' },
        // Ajuste de arqueo: SÍ debe contabilizarse
        {
          id: 'mc_2',
          fecha: '2026-01-06T16:00:00.000Z',
          tipo: 'ingreso',
          monto: 5,
          concepto: 'Ajuste por arqueo: sobrante',
        },
      ],
      ajustes: [],
      lotes: [],
      socios: [],
    };
    const asientos = generarAsientos(datos);
    const ids = asientos.map((a) => a.id);

    expect(ids).toContain('gasto:g_1'); // el gasto, UNA vez
    expect(ids).not.toContain('ajusteCaja:mc_1'); // su espejo, NUNCA como ajuste
    expect(ids).toContain('ajusteCaja:mc_2'); // el arqueo sí entra

    // La caja del libro: 100 inicial - 30 gasto + 5 arqueo = 75 (no 45)
    const caja = asientos.reduce(
      (s, a) => s + (a.cuentaDebe === 'Caja' ? a.monto : 0) - (a.cuentaHaber === 'Caja' ? a.monto : 0),
      0
    );
    expect(caja).toBe(75);
  });

  it('gasto con movId enlazado sigue excluyendo el espejo (comportamiento previo)', () => {
    const datos = {
      capitalInicial: 0,
      ventas: [],
      compras: [],
      gastos: [
        {
          id: 'g_2',
          fecha: '2026-02-01T16:00:00.000Z',
          monto: 8,
          categoria: 'a',
          concepto: 'b',
          saleDeCaja: true,
          movId: 'mc_x',
        },
      ],
      capital: [],
      retiros: [],
      movCaja: [{ id: 'mc_x', fecha: '2026-02-01T16:00:00.000Z', tipo: 'egreso', monto: 8, concepto: 'Gasto: a - b' }],
      ajustes: [],
      lotes: [],
      socios: [],
    };
    const ids = generarAsientos(datos).map((a) => a.id);
    expect(ids).toContain('gasto:g_2');
    expect(ids).not.toContain('ajusteCaja:mc_x');
  });
});

// ============================================================================
// 5) RESYNC — fallo de transacción no deja stock sucio en memoria
// ============================================================================
describe('anularVenta: resync de lotes si la transacción falla', () => {
  it('recarga ventas y lotes antes de propagar el error', async () => {
    const ventasStore = useVentasStore();
    const lotesStore = useLotesStore();

    // Estado "en memoria" con datos; la BD real está vacía (limpiarDb)
    lotesStore.lotes = [
      { id: 'l_1', productoId: 'p_1', cantidadInicial: 10, cantidadVendida: 4, costo: 10, fecha: '2026-01-01' },
    ];
    ventasStore.ventas = [
      {
        id: 'v_1',
        fecha: '2026-10-01T16:00:00.000Z',
        items: [
          {
            productoId: 'p_1',
            nombre: 'X',
            cantidad: 4,
            precio: 15,
            costo: 40,
            ganancia: 20,
            lotesUsados: [{ loteId: 'l_1', cantidad: 4, costo: 10 }],
          },
        ],
        total: 60,
        ganancia: 20,
        anulada: false,
      },
    ];

    // La transacción revienta (p.ej. cuota de IndexedDB): la BD manda, no la
    // memoria. Sin resync, la UI seguiría mostrando el stock/ventas de arriba.
    const tx = vi.spyOn(db, 'transaction').mockRejectedValueOnce(new Error('quota excedida'));

    await expect(ventasStore.anularVenta('v_1')).rejects.toThrow('quota excedida');

    // El catch resincronizó ambos stores desde la BD (vacía tras limpiarDb)
    expect(ventasStore.ventas).toHaveLength(0);
    expect(lotesStore.lotes).toHaveLength(0);
    tx.mockRestore();
  });
});
