/**
 * Regresión del PIN en TODAS las operaciones sensibles.
 *
 * Bug encontrado en la ronda de navegador (E2E real, instalacion limpia):
 * el PIN solo se pedia en 2 sitios (anular item de venta y reparto), pero
 * las operaciones MAS destructivas lo bypassaban:
 *   - anularVenta COMPLETA (mas facil anular todo que un item)
 *   - eliminarCompra (borra lote + ajusta caja)
 *   - eliminarGasto (borra movimiento de caja)
 *   - registrarRetiro (saca dinero; el reparto si pedia, el retiro no)
 *   - borrarTodo (la mas destructiva de todas: solo pedia escribir BORRAR)
 *
 * Politica consistente: destruccion irreversible + salida de dinero = PIN.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { createPinia, setActivePinia } from 'pinia';
import { mount, flushPromises } from '@vue/test-utils';

import { db } from '../src/db';
import { useConfigStore } from '../src/stores/useConfigStore';
import { useUIStore } from '../src/stores/useUIStore';
import { useBackupStore } from '../src/stores/useBackupStore';
import { useProductosStore } from '../src/stores/useProductosStore';
import { useLotesStore } from '../src/stores/useLotesStore';
import { useVentasStore } from '../src/stores/useVentasStore';
import { useComprasStore } from '../src/stores/useComprasStore';
import { useGastosStore } from '../src/stores/useGastosStore';
import { useCapitalStore } from '../src/stores/useCapitalStore';
import { recargarStores } from '../src/stores/recarga';
import AppIcon from '../src/components/AppIcon.vue';
import VentasView from '../src/views/VentasView.vue';
import ComprasView from '../src/views/ComprasView.vue';
import GastosView from '../src/views/GastosView.vue';
import SociosView from '../src/views/SociosView.vue';

const PIN = '2580';

async function montar(componente) {
  const wrapper = mount(componente, {
    global: { components: { Icon: AppIcon }, stubs: { teleport: true } },
  });
  await flushPromises();
  return wrapper;
}

async function esperar(cond, ms = 3000) {
  const fin = Date.now() + ms;
  while (!cond() && Date.now() < fin) {
    await new Promise((r) => setTimeout(r, 25));
    await flushPromises();
  }
  return cond();
}

async function clickBoton(w, texto) {
  const btn = w.findAll('button').filter((b) => b.text().includes(texto));
  expect(btn.length).toBeGreaterThan(0);
  await btn[0].trigger('click');
  await flushPromises();
}

function activarPin() {
  const config = useConfigStore();
  config.cfg.pinActivo = true;
  // PIN plano (legacy): verificarPin lo compara directo
  config.cfg.pin = PIN;
  return config;
}

/** Acepta el prompt de PIN con el valor dado (como lo hace ModalPrompt). */
function aceptarPin(valor) {
  const ui = useUIStore();
  ui.prompt.value = valor;
  ui.okPrompt();
}

async function cargarTodo() {
  await useProductosStore().cargarProductos();
  await useLotesStore().cargarLotes();
  await useVentasStore().cargarVentas();
  await useComprasStore().cargarCompras();
  await useGastosStore().cargarGastos();
}

beforeEach(async () => {
  setActivePinia(createPinia());
  vi.restoreAllMocks();
  localStorage.clear();
  await Promise.all([
    db.productos.clear(),
    db.lotes.clear(),
    db.ventas.clear(),
    db.compras.clear(),
    db.gastos.clear(),
    db.movCaja.clear(),
    db.socios.clear(),
    db.distribuciones.clear(),
    db.capital.clear(),
    db.retiros.clear(),
    db.config.clear(),
  ]);
  const config = useConfigStore();
  config.cfg.periodoInicio = '2026-09-01T00:00:00.000Z';
  config.cfg.pinActivo = false;
  config.cfg.pin = '';
  await cargarTodo();
});

// ============================================================
// ANULAR VENTA COMPLETA (antes: SIN PIN — bug)
// ============================================================
describe('PIN: anular venta completa', () => {
  async function sembrarVenta() {
    await db.productos.put({ id: 'p1', nombre: 'Aceite', precio: 200, archivado: false, stockMinimo: 5 });
    await db.lotes.put({
      id: 'l1',
      productoId: 'p1',
      cantidadInicial: 10,
      cantidadVendida: 3,
      costo: 100,
      fecha: '2026-10-01T10:00:00.000Z',
    });
    await db.ventas.put({
      id: 'v1',
      fecha: '2026-10-10T14:30:00.000Z',
      items: [
        {
          productoId: 'p1',
          nombre: 'Aceite',
          cantidad: 3,
          unidad: '',
          precio: 200,
          costo: 300,
          ganancia: 300,
          lotesUsados: [{ loteId: 'l1', cantidad: 3 }],
        },
      ],
      total: 600,
      ganancia: 300,
    });
    await cargarTodo();
  }

  it('con PIN activo, anular la venta completa pide el PIN (antes bypass)', async () => {
    await sembrarVenta();
    activarPin();

    const w = await montar(VentasView);
    await clickBoton(w, 'Anular');
    await flushPromises();

    const ui = useUIStore();
    expect(ui.prompt.activo).toBe(true);
    expect(ui.prompt.type).toBe('password');
    // La confirmación de anulación NO llegó sin el PIN
    expect(ui.confirm.activo).toBe(false);
    expect((await db.ventas.get('v1')).anulada).toBeUndefined();
    w.unmount();
  });

  it('PIN incorrecto no anula; PIN correcto abre la confirmación y anula', async () => {
    await sembrarVenta();
    activarPin();

    const w = await montar(VentasView);
    await clickBoton(w, 'Anular');
    aceptarPin('0000');
    await flushPromises();
    // Sigue sin confirmación y sin anulación
    expect(useUIStore().confirm.activo).toBe(false);
    expect((await db.ventas.get('v1')).anulada).toBeUndefined();

    // Segunda oportunidad con el PIN correcto
    await clickBoton(w, 'Anular');
    aceptarPin(PIN);
    await flushPromises();
    const ui = useUIStore();
    expect(ui.confirm.activo).toBe(true);
    expect(ui.confirm.titulo).toBe('Anular venta');

    ui.okConfirm();
    await esperar(() => db.ventas.get('v1').then((v) => v?.anulada === true));
    expect((await db.ventas.get('v1')).anulada).toBe(true);
    // El stock se restauró: 10 - 3 + 3 = 10 disponibles
    expect((await db.lotes.get('l1')).cantidadVendida).toBe(0);
    w.unmount();
  });

  it('sin PIN activo la anulación va directa a la confirmación (UX intacta)', async () => {
    await sembrarVenta();

    const w = await montar(VentasView);
    await clickBoton(w, 'Anular');
    await flushPromises();

    const ui = useUIStore();
    expect(ui.prompt.activo).toBe(false);
    expect(ui.confirm.activo).toBe(true);
    if (ui.cancelConfirm) ui.cancelConfirm();
    else ui.confirm.activo = false;
    expect((await db.ventas.get('v1')).anulada).toBeUndefined();
    w.unmount();
  });
});

// ============================================================
// ELIMINAR COMPRA (antes: SIN PIN — bug)
// ============================================================
describe('PIN: eliminar compra', () => {
  async function sembrarCompra() {
    await db.productos.put({ id: 'p1', nombre: 'Malta', precio: 60, archivado: false, stockMinimo: 5 });
    await db.lotes.put({
      id: 'l1',
      productoId: 'p1',
      compraId: 'c1',
      cantidadInicial: 10,
      cantidadVendida: 0,
      costo: 40,
      fecha: '2026-10-01T10:00:00.000Z',
    });
    await db.compras.put({
      id: 'c1',
      fecha: '2026-10-02T10:00:00.000Z',
      productoId: 'p1',
      productoNombre: 'Malta',
      cantidad: 10,
      costo: 40,
      total: 400,
    });
    await cargarTodo();
  }

  it('con PIN activo, eliminar compra pide el PIN y cancelar no borra nada', async () => {
    await sembrarCompra();
    activarPin();

    const w = await montar(ComprasView);
    const btn = w.findAll('button').filter((b) => b.attributes('aria-label') === 'Eliminar');
    expect(btn.length).toBeGreaterThan(0);
    await btn[0].trigger('click');
    await flushPromises();

    const ui = useUIStore();
    expect(ui.prompt.activo).toBe(true);
    expect(ui.confirm.activo).toBe(false);
    expect(await db.compras.count()).toBe(1);

    ui.cancelPrompt();
    await flushPromises();
    expect(await db.compras.count()).toBe(1);
    expect(await db.lotes.count()).toBe(1);
    w.unmount();
  });

  it('PIN correcto desbloquea la eliminación de la compra', async () => {
    await sembrarCompra();
    activarPin();

    const w = await montar(ComprasView);
    const btn = w.findAll('button').filter((b) => b.attributes('aria-label') === 'Eliminar');
    await btn[0].trigger('click');
    aceptarPin(PIN);
    await flushPromises();

    const ui = useUIStore();
    expect(ui.confirm.activo).toBe(true);
    expect(ui.confirm.titulo).toBe('Eliminar compra');
    ui.okConfirm();
    await esperar(async () => (await db.compras.count()) === 0);
    expect(await db.compras.count()).toBe(0);
    expect(await db.lotes.count()).toBe(0);
    w.unmount();
  });
});

// ============================================================
// ELIMINAR GASTO (antes: SIN PIN — bug)
// ============================================================
describe('PIN: eliminar gasto', () => {
  it('con PIN activo, eliminar gasto pide el PIN; cancelar conserva el movimiento de caja', async () => {
    await db.gastos.put({
      id: 'g1',
      fecha: '2026-10-05T10:00:00.000Z',
      concepto: 'Electricidad',
      monto: 500,
      categoria: 'Servicios',
      movId: 'mc1',
    });
    await db.movCaja.put({
      id: 'mc1',
      fecha: '2026-10-05T10:00:00.000Z',
      tipo: 'gasto',
      monto: -500,
      concepto: 'Electricidad',
    });
    await cargarTodo();
    activarPin();

    const w = await montar(GastosView);
    const btn = w.findAll('button').filter((b) => b.attributes('aria-label') === 'Eliminar');
    expect(btn.length).toBeGreaterThan(0);
    await btn[0].trigger('click');
    await flushPromises();

    const ui = useUIStore();
    expect(ui.prompt.activo).toBe(true);
    expect(ui.confirm.activo).toBe(false);
    expect(await db.gastos.count()).toBe(1);

    ui.cancelPrompt();
    await flushPromises();
    expect(await db.gastos.count()).toBe(1);
    expect(await db.movCaja.count()).toBe(1);
    w.unmount();
  });
});

// ============================================================
// RETIRO DE SOCIO (antes: SIN PIN — bug; el reparto SÍ lo pedía)
// ============================================================
describe('PIN: retiro de socio', () => {
  it('con PIN activo, retirar pide el PIN antes de registrar', async () => {
    await db.socios.put({ id: 'so1', nombre: 'Yuliet', porcentaje: 100, aporte: 0, activo: true });
    await db.capital.put({ id: 'cap1', tipo: 'aporte', monto: 1000, fecha: '2026-10-01T10:00:00.000Z' });
    await db.ventas.put({
      id: 'v1',
      fecha: '2026-10-05T10:00:00.000Z',
      items: [
        {
          productoId: 'p1',
          nombre: 'X',
          cantidad: 1,
          unidad: '',
          precio: 100,
          costo: 40,
          ganancia: 60,
          lotesUsados: [],
        },
      ],
      total: 100,
      ganancia: 60,
    });
    await recargarStores('socios', 'capital', 'ventas', 'retiros');
    const capital = useCapitalStore();
    capital.retiroForm = { monto: '100', concepto: 'gastos casa', tipo: 'ganancia' };
    activarPin();

    const w = await montar(SociosView);
    const ui = useUIStore();
    ui.retiroAbierto = true;
    await flushPromises();

    // El botón Retirar DENTRO del modal (el otro solo lo abre)
    const btnRetirar = w.findAll('.modal button').filter((b) => b.text().trim() === 'Retirar');
    expect(btnRetirar.length).toBe(1);
    await btnRetirar[0].trigger('click');
    await flushPromises();

    expect(ui.prompt.activo).toBe(true);
    expect(await db.retiros.count()).toBe(0);

    ui.cancelPrompt();
    await flushPromises();
    expect(await db.retiros.count()).toBe(0);
    w.unmount();
  });
});

// ============================================================
// BORRAR TODOS LOS DATOS (antes: SIN PIN — el más destructivo)
// ============================================================
describe('PIN: borrar todos los datos', () => {
  it('con PIN activo, borrarTodo pide el PIN ANTES de las confirmaciones', async () => {
    await db.productos.put({ id: 'p1', nombre: 'X', precio: 1, archivado: false, stockMinimo: 0 });
    activarPin();

    const s = useBackupStore();
    s.borrarTodo();
    await flushPromises();

    const ui = useUIStore();
    expect(ui.prompt.activo).toBe(true);
    expect(ui.confirm.activo).toBe(false);
    expect(await db.productos.count()).toBe(1);

    // Cancelar el PIN no borra nada
    ui.cancelPrompt();
    await flushPromises();
    expect(await db.productos.count()).toBe(1);
  });

  it('con PIN correcto siguen las dobles confirmaciones (⚠ BORRAR TODO → escribir BORRAR)', async () => {
    await db.productos.put({ id: 'p1', nombre: 'X', precio: 1, archivado: false, stockMinimo: 0 });
    activarPin();

    const s = useBackupStore();
    s.borrarTodo();
    aceptarPin(PIN);
    await flushPromises();

    const ui = useUIStore();
    expect(ui.confirm.activo).toBe(true);
    expect(ui.confirm.titulo).toContain('BORRAR TODO');
    ui.okConfirm();
    await flushPromises();

    // Segunda barrera: escribir BORRAR
    expect(ui.prompt.activo).toBe(true);
    ui.prompt.value = 'BORRAR';
    ui.okPrompt();
    await esperar(async () => (await db.productos.count()) === 0);
    expect(await db.productos.count()).toBe(0);
  });

  it('sin PIN activo mantiene la doble confirmación original', async () => {
    await db.productos.put({ id: 'p1', nombre: 'X', precio: 1, archivado: false, stockMinimo: 0 });

    const s = useBackupStore();
    s.borrarTodo();
    await flushPromises();

    const ui = useUIStore();
    expect(ui.prompt.activo).toBe(false);
    expect(ui.confirm.activo).toBe(true);
    expect(await db.productos.count()).toBe(1);
  });
});
