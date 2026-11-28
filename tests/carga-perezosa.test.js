/**
 * Tests de carga perezosa (4.8).
 *
 * - Al arrancar (`cargarInicioStores`) solo se tocan las tablas que el
 *   Dashboard necesita para sus totales; `arqueos` y `distribuciones`
 *   quedan sin cargar (sus flags `cargado` en falso y sus arrays vacíos).
 * - Al entrar a una vista, `asegurarX()` carga su tabla; la segunda llamada
 *   es un no-op (no re-lee la BD) y `cargarX()` sigue siendo recarga forzada.
 * - `datosDeStores()` (autosave/respaldo) asegura las tablas diferidas
 *   antes de fotografiar: un respaldo con `arqueos: []` las borraría al
 *   restaurar (la importación hace `clear()` + `bulkPut()` por tabla).
 * - Montar SociosView carga las distribuciones y muestra el indicador
 *   mientras tanto; montar ReportesView carga los arqueos.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { createPinia, setActivePinia } from 'pinia';
import { mount, flushPromises } from '@vue/test-utils';

vi.mock('reka-ui', () => {
  const passthrough = (nombre) => ({ name: nombre, props: ['open'], template: '<div><slot /></div>' });
  const raiz = (nombre) => ({ name: nombre, props: ['open'], template: '<div v-if="open"><slot /></div>' });
  return {
    DialogRoot: raiz('DialogRoot'),
    DialogPortal: passthrough('DialogPortal'),
    DialogOverlay: passthrough('DialogOverlay'),
    DialogContent: passthrough('DialogContent'),
    DialogTitle: passthrough('DialogTitle'),
    DialogDescription: passthrough('DialogDescription'),
  };
});

import { db } from '../src/db';
import { useCajaStore } from '../src/stores/useCajaStore';
import { useCapitalStore } from '../src/stores/useCapitalStore';
import { useProductosStore } from '../src/stores/useProductosStore';
import { useVentasStore } from '../src/stores/useVentasStore';
import { cargarInicioStores, asegurarStores } from '../src/stores/recarga';
import { datosDeStores } from '../src/stores/exportar';
import AppIcon from '../src/components/AppIcon.vue';
import SociosView from '../src/views/SociosView.vue';
import ReportesView from '../src/views/ReportesView.vue';

const TABLAS = [
  'productos',
  'lotes',
  'ventas',
  'compras',
  'ajustes',
  'arqueos',
  'movCaja',
  'cierres',
  'capital',
  'retiros',
  'socios',
  'distribuciones',
  'gastos',
  'asientos',
  'pasivos',
  'auditorias',
  'config',
  'cambios',
  'descartes',
  'syncMeta',
];

const AHORA = new Date().toISOString();

async function semillarBD() {
  await db.productos.put({ id: 'p_1', nombre: 'Arroz', precio: 100, stockMinimo: 1, archivado: false });
  await db.lotes.put({ id: 'l_1', productoId: 'p_1', cantidadInicial: 10, cantidadVendida: 0, costo: 50, fecha: AHORA });
  await db.ventas.put({ id: 'v_1', fecha: AHORA, items: [], total: 200, ganancia: 100, anulada: false });
  await db.arqueos.put({ id: 'arq_1', fecha: AHORA, cajaSistema: 200, cajaFisica: 200, faltanteSobrante: 0, nota: '' });
  await db.distribuciones.put({
    id: 'di_1',
    fecha: AHORA,
    socioId: 's_1',
    socioNombre: 'Ana',
    montoTotal: 50,
    monto: 50,
    porcentaje: 100,
    concepto: 'Reparto',
  });
  await db.socios.put({ id: 's_1', nombre: 'Ana', porcentaje: 100, aporte: 0, activo: true });
}

beforeEach(async () => {
  await Promise.all(TABLAS.map((t) => db.table(t).clear()));
  setActivePinia(createPinia());
});

describe('cargarInicioStores (arranque)', () => {
  it('carga el conjunto del Dashboard y deja fuera arqueos y distribuciones', async () => {
    await semillarBD();
    await cargarInicioStores();

    const productos = useProductosStore();
    const ventas = useVentasStore();
    const caja = useCajaStore();
    const capital = useCapitalStore();

    expect(productos.productos).toHaveLength(1);
    expect(productos.cargado).toBe(true);
    expect(ventas.ventas).toHaveLength(1);
    expect(ventas.cargado).toBe(true);

    // Diferidas: ni leídas (arrays vacíos) ni marcadas como cargadas.
    expect(caja.arqueos).toHaveLength(0);
    expect(caja.arqueosCargado).toBe(false);
    expect(capital.distribuciones).toHaveLength(0);
    expect(capital.distribucionesCargado).toBe(false);
    // ...mientras sus compañeras de store sí vienen del arranque.
    expect(capital.socios).toHaveLength(1);
    expect(capital.sociosCargado).toBe(true);
  });

  it('es idempotente: la segunda llamada no re-lee la BD', async () => {
    await semillarBD();
    await cargarInicioStores();
    // Fila nueva escrita directo en la BD tras el arranque.
    await db.productos.put({ id: 'p_2', nombre: 'Frijoles', precio: 80, stockMinimo: 1, archivado: false });
    await cargarInicioStores();
    // Sigue el snapshot del arranque: no se re-leyó.
    expect(useProductosStore().productos).toHaveLength(1);
  });
});

describe('asegurarX (carga bajo demanda)', () => {
  it('carga la tabla diferida al pedirla y la segunda vez es un no-op', async () => {
    await semillarBD();
    const caja = useCajaStore();

    await caja.asegurarArqueos();
    expect(caja.arqueos).toHaveLength(1);
    expect(caja.arqueosCargado).toBe(true);

    await db.arqueos.put({ id: 'arq_2', fecha: AHORA, cajaSistema: 0, cajaFisica: 0, faltanteSobrante: 0, nota: '' });
    await caja.asegurarArqueos();
    expect(caja.arqueos).toHaveLength(1); // no re-leyó

    // La recarga forzada sí trae la fila nueva (las escrituras la usan).
    await caja.cargarArqueos();
    expect(caja.arqueos).toHaveLength(2);
  });

  it('las llamadas concurrentes comparten una sola lectura', async () => {
    await semillarBD();
    const capital = useCapitalStore();
    const espia = vi.spyOn(db.distribuciones, 'toArray');
    await Promise.all([
      capital.asegurarDistribuciones(),
      capital.asegurarDistribuciones(),
      asegurarStores('distribuciones'),
    ]);
    expect(capital.distribuciones).toHaveLength(1);
    expect(espia).toHaveBeenCalledTimes(1);
    espia.mockRestore();
  });

  it('asegurarStores ignora nombres desconocidos sin romper', async () => {
    await expect(asegurarStores('noExiste', 'ventas')).resolves.toBeUndefined();
  });
});

describe('datosDeStores (respaldo/autosave)', () => {
  it('incluye arqueos y distribuciones aunque el arranque no las cargó', async () => {
    await semillarBD();
    await cargarInicioStores();
    expect(useCajaStore().arqueos).toHaveLength(0);
    expect(useCapitalStore().distribuciones).toHaveLength(0);

    const data = await datosDeStores();
    expect(data.arqueos).toHaveLength(1);
    expect(data.distribuciones).toHaveLength(1);
    // Y de paso quedan cargadas en memoria para el resto de la sesión.
    expect(useCajaStore().arqueosCargado).toBe(true);
    expect(useCapitalStore().distribucionesCargado).toBe(true);
  });
});

describe('vistas (carga al entrar)', () => {
  it('SociosView carga las distribuciones al montar', async () => {
    await semillarBD();
    await cargarInicioStores();
    expect(useCapitalStore().distribuciones).toHaveLength(0);

    const w = mount(SociosView, { global: { components: { Icon: AppIcon }, stubs: { teleport: true } } });
    await flushPromises();
    await flushPromises();
    expect(useCapitalStore().distribuciones).toHaveLength(1);
    expect(useCapitalStore().distribucionesCargado).toBe(true);
    expect(w.text()).toContain('Repartido:');
    w.unmount();
  });

  it('ReportesView carga los arqueos al montar', async () => {
    await semillarBD();
    await cargarInicioStores();
    expect(useCajaStore().arqueos).toHaveLength(0);

    const w = mount(ReportesView, { global: { components: { Icon: AppIcon }, stubs: { teleport: true } } });
    await flushPromises();
    await flushPromises();
    expect(useCajaStore().arqueos).toHaveLength(1);
    expect(useCajaStore().arqueosCargado).toBe(true);
    w.unmount();
  });
});
