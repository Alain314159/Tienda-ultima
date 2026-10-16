/**
 * Tests PROFUNDOS de la UI transversal — Área 10 de la campaña de cobertura
 * profunda (80-90% de la app): StatusPanel, modales reka-ui, sheet Más,
 * navegación inferior, skeletons, notificaciones periódicas y el logger.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { createPinia, setActivePinia } from 'pinia';
import { mount, flushPromises } from '@vue/test-utils';
import { toast } from 'vue-sonner';

import { db } from '../src/db';
import { useConfigStore } from '../src/stores/useConfigStore';
import { useUIStore } from '../src/stores/useUIStore';
import AppIcon from '../src/components/AppIcon.vue';

const mockCheckPerms = vi.fn();
const mockRequestPerms = vi.fn();
const mockSchedule = vi.fn();
const mockUpdaterCurrent = vi.fn();
const mockUpdaterLatest = vi.fn();

vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    checkPermissions: (...a) => mockCheckPerms(...a),
    requestPermissions: (...a) => mockRequestPerms(...a),
    schedule: (...a) => mockSchedule(...a),
  },
}));
vi.mock('reka-ui', () => {
  const passthrough = (nombre) => ({ name: nombre, props: ['open'], template: '<div><slot /></div>' });
  // Los Root respetan :open (reka-ui no renderiza el contenido cerrado)
  const raiz = (nombre) => ({ name: nombre, props: ['open'], template: '<div v-if="open"><slot /></div>' });
  return {
    AlertDialogRoot: raiz('AlertDialogRoot'),
    AlertDialogPortal: passthrough('AlertDialogPortal'),
    AlertDialogOverlay: passthrough('AlertDialogOverlay'),
    AlertDialogContent: passthrough('AlertDialogContent'),
    AlertDialogTitle: passthrough('AlertDialogTitle'),
    AlertDialogDescription: passthrough('AlertDialogDescription'),
    DialogRoot: raiz('DialogRoot'),
    DialogPortal: passthrough('DialogPortal'),
    DialogOverlay: passthrough('DialogOverlay'),
    DialogContent: passthrough('DialogContent'),
    DialogTitle: passthrough('DialogTitle'),
    DialogDescription: passthrough('DialogDescription'),
  };
});

vi.mock('@capgo/capacitor-updater', () => ({
  CapacitorUpdater: {
    current: (...a) => mockUpdaterCurrent(...a),
    getLatest: (...a) => mockUpdaterLatest(...a),
    download: vi.fn(),
    set: vi.fn(),
  },
}));

async function montar(componente, props = {}) {
  return mount(componente, {
    props,
    global: { components: { Icon: AppIcon }, stubs: { teleport: true } },
  });
}

beforeEach(async () => {
  setActivePinia(createPinia());
  vi.restoreAllMocks();
  mockCheckPerms.mockReset().mockResolvedValue({ display: 'granted' });
  mockRequestPerms.mockReset().mockResolvedValue({ display: 'granted' });
  mockSchedule.mockReset().mockResolvedValue(undefined);
  mockUpdaterCurrent.mockReset();
  mockUpdaterLatest.mockReset();
  vi.spyOn(toast, 'success').mockImplementation(() => {});
  vi.spyOn(toast, 'warning').mockImplementation(() => {});
  vi.spyOn(toast, 'error').mockImplementation(() => {});
  await Promise.all([db.config.clear(), db.productos.clear(), db.lotes.clear(), db.arqueos.clear(), db.cierres.clear(), db.ventas.clear()]);
});

// ============================================================
// MODALES (reka-ui) — confirmación y prompt
// ============================================================
describe('ModalConfirm', () => {
  it('muestra título y mensaje; Confirmar emite ok, Cancelar emite cancelar', async () => {
    const { default: ModalConfirm } = await import('../src/components/ModalConfirm.vue');
    const w = await montar(ModalConfirm, { activo: true, titulo: '¿Seguro?', msg: 'Línea 1\nLínea 2' });
    expect(w.text()).toContain('¿Seguro?');
    expect(w.text()).toContain('Línea 1');

    await w.findAll('button').filter((b) => b.text() === 'Confirmar')[0].trigger('click');
    expect(w.emitted('ok')).toHaveLength(1);

    await w.findAll('button').filter((b) => b.text() === 'Cancelar')[0].trigger('click');
    expect(w.emitted('cancelar')).toHaveLength(1);
    w.unmount();
  });

  it('cerrado no renderiza el contenido', async () => {
    const { default: ModalConfirm } = await import('../src/components/ModalConfirm.vue');
    const w = await montar(ModalConfirm, { activo: false, titulo: 'Oculto', msg: 'x' });
    expect(w.text()).not.toContain('Oculto');
    w.unmount();
  });
});

describe('ModalPrompt', () => {
  it('input editable: update:value, Aceptar con el valor y Enter', async () => {
    const { default: ModalPrompt } = await import('../src/components/ModalPrompt.vue');
    const w = await montar(ModalPrompt, { activo: true, titulo: 'PIN', placeholder: '••••', value: '' });
    const input = w.find('input');
    // El input está cableado: escribir emite update:value
    await input.setValue('1234');
    expect(w.emitted('update:value')).toBeTruthy();

    // El padre actualiza el prop (v-model) y Aceptar lo lleva tal cual
    await w.setProps({ value: '1234' });
    expect(input.element.value).toBe('1234');
    await w.findAll('button').filter((b) => b.text() === 'Aceptar')[0].trigger('click');
    expect(w.emitted('ok')).toHaveLength(1);
    expect(w.emitted('ok')[0]).toEqual(['1234']);

    // Enter también confirma con el valor actual
    await w.setProps({ value: '99' });
    await input.trigger('keyup.enter');
    const oks = w.emitted('ok');
    expect(oks[oks.length - 1]).toEqual(['99']);
    w.unmount();
  });

  it('Cancelar emite cancelar', async () => {
    const { default: ModalPrompt } = await import('../src/components/ModalPrompt.vue');
    const w = await montar(ModalPrompt, { activo: true, titulo: 'X' });
    await w.findAll('button').filter((b) => b.text() === 'Cancelar')[0].trigger('click');
    expect(w.emitted('cancelar')).toHaveLength(1);
    w.unmount();
  });
});

// ============================================================
// SHEET MÁS + BOTTOM NAV + SKELETON
// ============================================================
describe('SheetMas', () => {
  it('cerrado no muestra el sheet; abierto navega y abre ajustes', async () => {
    const { default: SheetMas } = await import('../src/components/SheetMas.vue');
    let w = await montar(SheetMas, { abierto: false, sec: 'dashboard' });
    expect(w.find('.sheet').exists()).toBe(false);

    w = await montar(SheetMas, { abierto: true, sec: 'productos' });
    const activos = w.findAll('.sheet-btn.activo');
    expect(activos.length).toBe(1);
    expect(activos[0].text()).toContain('Productos');

    await w.findAll('.sheet-btn').filter((b) => b.text().includes('Gastos'))[0].trigger('click');
    expect(w.emitted('ir')).toEqual([['gastos']]);
    await w.findAll('.sheet-btn').filter((b) => b.text().includes('Ajustes'))[0].trigger('click');
    expect(w.emitted('abrir-ajustes')).toHaveLength(1);
    // Overlay cierra
    await w.find('.overlay').trigger('click');
    expect(w.emitted('cerrar')).toHaveLength(1);
    w.unmount();
  });
});

describe('BottomNav', () => {
  it('cinco botones, sección activa resaltada, ir y toggle-mas emitidos', async () => {
    const { default: BottomNav } = await import('../src/components/BottomNav.vue');
    const w = await montar(BottomNav, { sec: 'ventas', masActivo: false, anomaliasCriticas: 2 });
    const btns = w.findAll('button');
    expect(btns.length).toBe(5);
    expect(btns[1].classes()).toContain('activo');
    expect(btns[0].classes()).not.toContain('activo');
    // Punto rojo de anomalías críticas en Inicio
    expect(btns[0].find('.nav-dot').exists()).toBe(true);
    expect(btns[4].find('.nav-dot').exists()).toBe(false);

    await btns[3].trigger('click');
    expect(w.emitted('ir')).toEqual([['inventario']]);
    await btns[4].trigger('click');
    expect(w.emitted('toggle-mas')).toHaveLength(1);
    w.unmount();
  });
});

describe('SkeletonLoader', () => {
  it('renderiza las filas con anchos del patrón cíclico', async () => {
    const { default: SkeletonLoader } = await import('../src/components/SkeletonLoader.vue');
    const w = await montar(SkeletonLoader, { rows: 8 });
    const lineas = w.findAll('.skeleton-line');
    expect(lineas.length).toBe(8);
    // Patrón [100, 85, 90, 70, 95, 80] cíclico
    expect(lineas[0].attributes('style')).toContain('width: 100%');
    expect(lineas[5].attributes('style')).toContain('width: 80%');
    expect(lineas[6].attributes('style')).toContain('width: 100%'); // séptima = patrón[0]
    w.unmount();
  });

  it('por defecto 5 filas', async () => {
    const { default: SkeletonLoader } = await import('../src/components/SkeletonLoader.vue');
    const w = await montar(SkeletonLoader, {});
    expect(w.findAll('.skeleton-line').length).toBe(5);
    w.unmount();
  });
});

// ============================================================
// STATUS PANEL (modo web)
// ============================================================
describe('StatusPanel (web)', () => {
  it('OTA en web, GitHub sin token avisa, y el botón × emite close', async () => {
    const { default: StatusPanel } = await import('../src/components/StatusPanel.vue');
    const w = await montar(StatusPanel, {});
    await flushPromises();
    await new Promise((r) => setTimeout(r, 50));
    await flushPromises();

    const txt = w.text();
    expect(txt).toContain('Estado del sistema');
    // OTA: en web la "versión" es web/pwa
    expect(txt).toContain('web');
    // GitHub sin token (VITE_GITHUB_TOKEN vacío en tests)
    expect(txt).toContain('Token de GitHub no configurado');

    // Buscar actualización en web → mensaje informativo
    const btnOta = w.findAll('button').filter((b) => b.text().includes('Buscar actualizacion'))[0];
    await btnOta.trigger('click');
    await flushPromises();
    expect(w.text()).toContain('En web, las actualizaciones llegan al recargar');

    // Cerrar
    await w.find('.modal-title .link-btn').trigger('click');
    expect(w.emitted('close')).toHaveLength(1);
    w.unmount();
  });
});

// ============================================================
// NOTIFICACIONES PERIÓDICAS
// ============================================================
describe('useNotificacionesStore: chequeos periódicos', () => {
  it('sin notifActivo no hace nada; activo marca el día y no repite', async () => {
    global.Notification = { permission: 'granted' };
    const { useNotificacionesStore } = await import('../src/stores/useNotificacionesStore');
    const { useProductosStore } = await import('../src/stores/useProductosStore');
    const s = useNotificacionesStore();

    // Apagado: nada
    await s.chequearNotificaciones();
    expect(useConfigStore().cfg.ultimaNotifStock).toBeFalsy();

    // Encendido con productos en alerta (1 agotado) + permiso concedido
    const config = useConfigStore();
    config.cfg.notifActivo = true;
    await db.productos.put({ id: 'p1', nombre: 'Agotado', precio: 10, archivado: false, stockMinimo: 5 });
    await useProductosStore().cargarProductos();
    await s.chequearNotificaciones();
    const hoy = new Date().toISOString().slice(0, 10);
    expect(config.cfg.ultimaNotifStock.slice(0, 10)).toBe(hoy.slice(0, 10));

    // Segunda pasada el MISMO día: no duplica (marcador ya puesto)
    const valor = config.cfg.ultimaNotifStock;
    await s.chequearNotificaciones();
    expect(config.cfg.ultimaNotifStock).toBe(valor);
    delete global.Notification;
  });

  it('arqueo pendiente tras la hora configurada (y no antes)', async () => {
    global.Notification = { permission: 'granted' };
    const { useNotificacionesStore } = await import('../src/stores/useNotificacionesStore');
    const config = useConfigStore();
    config.cfg.notifActivo = true;
    config.cfg.horaArqueo = '23:58'; // aún no llegó (cualquier run razonable)
    const s = useNotificacionesStore();
    await s.chequearNotificaciones();
    expect(config.cfg.ultimaNotifArqueo || '').toBe('');

    config.cfg.horaArqueo = '00:01'; // ya pasó
    await s.chequearNotificaciones();
    expect(config.cfg.ultimaNotifArqueo).not.toBe('');
    // Con arqueo registrado hoy: no avisa de nuevo
    config.cfg.ultimaNotifArqueo = '';
    const { useCajaStore } = await import('../src/stores/useCajaStore');
    await db.arqueos.put({ id: 'a1', fecha: new Date().toISOString(), cajaFisica: 0, cajaSistema: 0, faltanteSobrante: 0 });
    await useCajaStore().cargarArqueos();
    await s.chequearNotificaciones();
    expect(config.cfg.ultimaNotifArqueo).toBe('');
    delete global.Notification;
  });
});

// ============================================================
// LOGGER — captura de consola y eventos
// ============================================================
describe('services/logger: init captura consola y evento registra', () => {
  afterEach(async () => {
    const { Log } = await import('../src/services/logger');
    Log.restaurar?.();
  });

  it('init + captura de consola + evento: todo resuelve sin romper nada', async () => {
    const { Log } = await import('../src/services/logger');
    await Log.init();
    // La consola sigue siendo llamable (los wrappers agregan al buffer y
    // delegan en los originales)
    expect(() => console.warn('prueba warn')).not.toThrow();
    expect(() => console.error('prueba error')).not.toThrow();
    expect(() => console.log('prueba log')).not.toThrow();
    // Eventos con y sin payload (fire-and-forget síncrono)
    expect(() => Log.evento('test-evento', { dato: 1 })).not.toThrow();
    expect(() => Log.evento('test-sin-payload')).not.toThrow();
  });
});
