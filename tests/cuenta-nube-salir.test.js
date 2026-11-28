/**
 * Cerrar sesión con borrado de datos locales (1.10).
 *
 * Agujero que cierra: el PIN se pedía al entrar al diálogo de confirmación,
 * pero una vez dentro el botón rojo «Cerrar sesión y borrar los datos
 * locales» borraba la IndexedDB con un solo toque accidental. Ahora el PIN
 * protege la acción destructiva en sí: tocar «Cerrar sesión» solo abre el
 * diálogo que advierte del borrado, y borrar pide el PIN (patrón habitual
 * `ui.pedirPin`, como anular una venta o borrar todos los datos).
 *
 * `salirDeNube` está mockeado (la real hace `signOut` contra Supabase, sin
 * red en tests): aquí se comprueba que el componente solo la llama con
 * `borrarDatosLocales: true` tras el PIN correcto. Que el borrado real
 * vacíe las tablas y conserve la configuración se comprueba aparte con la
 * `borrarDatosLocales` real.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { createPinia, setActivePinia } from 'pinia';
import { mount, flushPromises } from '@vue/test-utils';

import { db, seguimiento } from '../src/db';
import { useConfigStore } from '../src/stores/useConfigStore';
import { useUIStore } from '../src/stores/useUIStore';
import { useNubeStore } from '../src/stores/useNubeStore';
import CuentaNube from '../src/components/CuentaNube.vue';
import { salirDeNube, borrarDatosLocales } from '../src/sync/nube';

vi.mock('../src/sync/nube', async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    salirDeNube: vi.fn(async () => {}),
    sesionNube: vi.fn(async () => null),
    entrarConGoogle: vi.fn(async () => {}),
    googleListo: vi.fn(async () => true),
    alVolverDeGoogle: vi.fn(() => () => {}),
  };
});
vi.mock('../src/stores/recarga', () => ({ recargarTodoStores: vi.fn(async () => {}) }));

const PIN = '2580';
let w;

async function esperar(cond, ms = 3000) {
  const fin = Date.now() + ms;
  while (!cond() && Date.now() < fin) {
    await new Promise((r) => setTimeout(r, 25));
    await flushPromises();
  }
  return cond();
}

async function clickBoton(texto) {
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
}

/** Acepta el prompt de PIN con el valor dado (como lo hace ModalPrompt). */
function aceptarPin(valor) {
  const ui = useUIStore();
  ui.prompt.value = valor;
  ui.okPrompt();
}

/** Monta el panel con sesión iniciada y un producto sembrado (para probar que no se borra). */
async function montarConSesion() {
  await db.productos.put({ id: 'p1', nombre: 'Aceite', precio: 200, archivado: false, stockMinimo: 5 });
  w = mount(CuentaNube, { props: { abierto: true }, global: { stubs: { teleport: true } } });
  await flushPromises();
  useNubeStore().setSesion('dueño@example.com');
  await flushPromises();
  return w;
}

beforeEach(async () => {
  setActivePinia(createPinia());
  vi.restoreAllMocks();
  salirDeNube.mockClear();
  localStorage.clear();
  await Promise.all([db.productos.clear(), db.ventas.clear(), db.config.clear()]);
  const config = useConfigStore();
  config.cfg.pinActivo = false;
  config.cfg.pin = '';
});

afterEach(() => {
  w?.unmount();
  w = undefined;
});

// ============================================================
// EL DIÁLOGO: «Cerrar sesión» solo abre la confirmación
// ============================================================
describe('CuentaNube: cerrar sesión abre el diálogo sin borrar', () => {
  it('con PIN activo, tocar «Cerrar sesión» muestra la advertencia sin pedir el PIN todavía', async () => {
    activarPin();
    await montarConSesion();

    await clickBoton('Cerrar sesión');

    const ui = useUIStore();
    expect(ui.prompt.activo).toBe(false);
    expect(salirDeNube).not.toHaveBeenCalled();
    // La advertencia y las dos opciones están visibles
    expect(w.text()).toContain('Si borras los datos locales');
    expect(w.findAll('button').filter((b) => b.text().includes('borrar los datos locales')).length).toBe(1);
    expect(w.findAll('button').filter((b) => b.text().includes('conservar los datos')).length).toBe(1);
    expect(await db.productos.count()).toBe(1);
  });

  it('cancelar el diálogo no borra nada ni cierra la sesión', async () => {
    activarPin();
    await montarConSesion();

    await clickBoton('Cerrar sesión');
    await clickBoton('Cancelar');

    expect(salirDeNube).not.toHaveBeenCalled();
    expect(useNubeStore().sesionCorreo).toBe('dueño@example.com');
    expect(await db.productos.count()).toBe(1);
    // Vuelve a la vista de sesión (el botón «Cerrar sesión» sigue ahí)
    expect(w.findAll('button').filter((b) => b.text().trim() === 'Cerrar sesión').length).toBe(1);
  });
});

// ============================================================
// BORRAR CON PIN: solo el PIN correcto borra y cierra
// ============================================================
describe('CuentaNube: borrar datos locales con PIN', () => {
  it('borrar pide el PIN; con el PIN correcto borra y cierra la sesión', async () => {
    activarPin();
    await montarConSesion();

    await clickBoton('Cerrar sesión');
    await clickBoton('borrar los datos locales');

    // El PIN se pide ANTES de borrar: nada borrado todavía
    const ui = useUIStore();
    expect(ui.prompt.activo).toBe(true);
    expect(ui.prompt.type).toBe('password');
    expect(salirDeNube).not.toHaveBeenCalled();
    expect(await db.productos.count()).toBe(1);

    aceptarPin(PIN);
    await esperar(() => salirDeNube.mock.calls.length > 0);

    expect(salirDeNube).toHaveBeenCalledWith(expect.anything(), { borrarDatosLocales: true });
    expect(useNubeStore().sesionCorreo).toBeNull();
  });

  it('PIN incorrecto no borra nada; reintentarlo con el PIN correcto sí borra', async () => {
    activarPin();
    await montarConSesion();

    await clickBoton('Cerrar sesión');
    await clickBoton('borrar los datos locales');
    aceptarPin('0000');
    await flushPromises();

    expect(salirDeNube).not.toHaveBeenCalled();
    expect(useNubeStore().sesionCorreo).toBe('dueño@example.com');
    expect(await db.productos.count()).toBe(1);

    // Segunda oportunidad con el PIN correcto (el diálogo sigue abierto)
    await clickBoton('borrar los datos locales');
    aceptarPin(PIN);
    await esperar(() => salirDeNube.mock.calls.length > 0);
    expect(salirDeNube).toHaveBeenCalledWith(expect.anything(), { borrarDatosLocales: true });
  });

  it('cancelar el PIN no borra nada y el diálogo sigue abierto', async () => {
    activarPin();
    await montarConSesion();

    await clickBoton('Cerrar sesión');
    await clickBoton('borrar los datos locales');
    expect(useUIStore().prompt.activo).toBe(true);

    useUIStore().cancelPrompt();
    await flushPromises();

    expect(salirDeNube).not.toHaveBeenCalled();
    expect(useNubeStore().sesionCorreo).toBe('dueño@example.com');
    expect(await db.productos.count()).toBe(1);
    // El diálogo de confirmación sigue ahí para elegir de nuevo
    expect(w.findAll('button').filter((b) => b.text().includes('borrar los datos locales')).length).toBe(1);
  });

  it('sin PIN activo, borrar va directo tras el diálogo (sin prompt)', async () => {
    await montarConSesion();

    await clickBoton('Cerrar sesión');
    await clickBoton('borrar los datos locales');
    await esperar(() => salirDeNube.mock.calls.length > 0);

    expect(useUIStore().prompt.activo).toBe(false);
    expect(salirDeNube).toHaveBeenCalledWith(expect.anything(), { borrarDatosLocales: true });
    expect(useNubeStore().sesionCorreo).toBeNull();
  });

  it('conservar los datos cierra la sesión sin borrar (no pide PIN: no es destructivo)', async () => {
    activarPin();
    await montarConSesion();

    await clickBoton('Cerrar sesión');
    await clickBoton('conservar los datos');
    await esperar(() => salirDeNube.mock.calls.length > 0);

    expect(useUIStore().prompt.activo).toBe(false);
    expect(salirDeNube).toHaveBeenCalledWith(expect.anything(), { borrarDatosLocales: false });
    expect(useNubeStore().sesionCorreo).toBeNull();
    expect(await db.productos.count()).toBe(1);
  });
});

// ============================================================
// BORRADO REAL: borrarDatosLocales vacía datos, conserva config
// ============================================================
describe('borrarDatosLocales: el borrado real', () => {
  it('vacía las tablas de datos y conserva la configuración (PIN)', async () => {
    await db.productos.put({ id: 'p1', nombre: 'Aceite', precio: 200, archivado: false, stockMinimo: 5 });
    await db.ventas.put({
      id: 'v1',
      fecha: '2026-10-10T14:30:00.000Z',
      items: [],
      total: 0,
      ganancia: 0,
    });
    await db.config.put({ key: 'pinActivo', value: true });
    await db.config.put({ key: 'preImportBackup', value: 'respaldo-viejo' });

    await borrarDatosLocales({ db, seg: seguimiento });

    expect(await db.productos.count()).toBe(0);
    expect(await db.ventas.count()).toBe(0);
    expect(await db.config.get('pinActivo')).toEqual({ key: 'pinActivo', value: true });
    expect(await db.config.get('preImportBackup')).toBeUndefined();
  });
});
