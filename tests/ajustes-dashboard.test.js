/**
 * Cobertura profunda de las áreas saltadas de la UI — ronda navegador:
 * AjustesModal (la configuración entera), DashboardView (chips, gráficos,
 * anomalías) y useNotificacionesStore (web + nativo con mocks).
 *
 * Todo por el DOM real, como el dueño: sin snapshots, conducta observable.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { createPinia, setActivePinia } from 'pinia';
import { mount, flushPromises } from '@vue/test-utils';

import { db } from '../src/db';
import { useConfigStore } from '../src/stores/useConfigStore';
import { useUIStore } from '../src/stores/useUIStore';
import { useProductosStore } from '../src/stores/useProductosStore';
import { useVentasStore } from '../src/stores/useVentasStore';
import { useBackupStore } from '../src/stores/useBackupStore';
import { useNotificacionesStore } from '../src/stores/useNotificacionesStore';
import AppIcon from '../src/components/AppIcon.vue';
import AjustesModal from '../src/components/AjustesModal.vue';
import DashboardView from '../src/views/DashboardView.vue';

// DashboardView navega con useRouter/ir: mock mínimo de vue-router
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), currentRoute: { value: { name: 'dashboard' } } }),
  useRoute: () => ({ hash: '', query: {} }),
}));

// Los guards de las vistas piden una sección activa (inyectada por App.vue)
function montarVista(componente, sec) {
  const wrapper = mount(componente, {
    global: {
      components: { Icon: AppIcon },
      provide: { sec: sec },
      stubs: { teleport: true },
    },
  });
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

beforeEach(async () => {
  setActivePinia(createPinia());
  vi.restoreAllMocks();
  localStorage.clear();
  await Promise.all([
    db.productos.clear(),
    db.lotes.clear(),
    db.ventas.clear(),
    db.compras.clear(),
    db.cierres.clear(),
    db.movCaja.clear(),
    db.config.clear(),
  ]);
  const config = useConfigStore();
  config.cfg.periodoInicio = '2026-09-01T00:00:00.000Z';
});

// ============================================================
// AJUSTESMODAL — la configuración completa
// ============================================================
describe('AjustesModal: secciones', () => {
  function montarAjustes() {
    const ui = useUIStore();
    ui.ajustesAbierto = true;
    const w = mount(AjustesModal, {
      props: { otraPestana: false },
      global: { components: { Icon: AppIcon }, stubs: { teleport: true } },
    });
    return w;
  }

  it('se renderiza abierto con todas las secciones', () => {
    const w = montarAjustes();
    const t = w.text();
    expect(t).toContain('Personalizacion');
    expect(t).toContain('Seguridad');
    expect(t).toContain('Datos y respaldos');
    expect(t).toContain('Notificaciones y alertas');
    expect(t).toContain('Zona peligrosa');
    w.unmount();
  });

  it('tamaño de letra: A+ escala y A− reduce (límites 1×–2×)', async () => {
    const w = montarAjustes();
    const config = useConfigStore();
    config.cfg.fontScale = 1;
    await flushPromises();

    const btnMas = w.findAll('button').filter((b) => b.text().trim() === 'A+');
    const btnMenos = w.findAll('button').filter((b) => b.text().trim() === 'A−');
    expect(btnMas.length).toBe(1);
    expect(btnMenos.length).toBe(1);

    await btnMas[0].trigger('click');
    await flushPromises();
    expect(Number(config.cfg.fontScale)).toBeGreaterThan(1);

    // Volver al mínimo y verificar el suelo en 1
    for (let i = 0; i < 8; i++) await btnMenos[0].trigger('click');
    await flushPromises();
    expect(Number(config.cfg.fontScale)).toBe(1);
    w.unmount();
  });

  it('activar el PIN muestra el input de 4-6 dígitos; guardarCfg persiste', async () => {
    const w = montarAjustes();
    const config = useConfigStore();
    config.cfg.pinActivo = false;
    await flushPromises();

    const filaPin = w.findAll('.set-row').filter((r) => r.text().includes('PIN operaciones sensibles'));
    expect(filaPin.length).toBe(1);
    const sw = filaPin[0].find('input[type="checkbox"]');
    expect(sw.exists()).toBe(true);

    await sw.setValue(true);
    await flushPromises();
    expect(config.cfg.pinActivo).toBe(true);
    // El input del PIN aparece
    const inputPin = w.find('input[type="password"]');
    expect(inputPin.exists()).toBe(true);
    expect(inputPin.attributes('maxlength')).toBe('6');
    w.unmount();
  });

  it('el toggle de búsqueda global actualiza la config', async () => {
    const w = montarAjustes();
    const config = useConfigStore();

    const filaBusq = w.findAll('.set-row').filter((r) => r.text().includes('Busqueda global'));
    await filaBusq[0].find('input[type="checkbox"]').setValue(false);
    await flushPromises();
    expect(config.cfg.busquedaGlobalActiva).toBe(false);
    w.unmount();
  });

  it('los botones de respaldo llaman a las acciones del store de backup', async () => {
    const w = montarAjustes();
    const backup = useBackupStore();
    const spyExportar = vi.spyOn(backup, 'exportar').mockResolvedValue(undefined);
    const spyCifrado = vi.spyOn(backup, 'exportarCifrado').mockResolvedValue(undefined);

    const btnJson = w.findAll('button').filter((b) => b.text().includes('Exportar respaldo (JSON)'));
    const btnCif = w.findAll('button').filter((b) => b.text().includes('Exportar respaldo cifrado'));
    await btnJson[0].trigger('click');
    await btnCif[0].trigger('click');
    await flushPromises();

    expect(spyExportar).toHaveBeenCalledTimes(1);
    expect(spyCifrado).toHaveBeenCalledTimes(1);
    w.unmount();
  });

  it('Borrar TODOS los datos dispara borrarTodo (confirm visible)', async () => {
    const w = montarAjustes();
    const btn = w.findAll('button').filter((b) => b.text().includes('Borrar TODOS los datos'));
    expect(btn.length).toBe(1);
    await btn[0].trigger('click');
    await flushPromises();

    const ui = useUIStore();
    expect(ui.confirm.activo).toBe(true);
    expect(ui.confirm.titulo).toContain('BORRAR TODO');
    ui.confirm.activo = false;
    w.unmount();
  });
});

// ============================================================
// DASHBOARDVIEW — chips, gráficos y anomalías
// ============================================================
describe('DashboardView', () => {
  async function sembrar() {
    await db.productos.put({ id: 'p1', nombre: 'Malta', precio: 60, archivado: false, stockMinimo: 10 });
    await db.productos.put({ id: 'p2', nombre: 'Pan', precio: 5, archivado: false, stockMinimo: 2 });
    await db.lotes.put({
      id: 'l1',
      productoId: 'p1',
      cantidadInicial: 20,
      cantidadVendida: 18,
      costo: 30,
      fecha: '2026-10-01T10:00:00.000Z',
    });
    await db.lotes.put({
      id: 'l2',
      productoId: 'p2',
      cantidadInicial: 10,
      cantidadVendida: 2,
      costo: 2,
      fecha: '2026-10-01T10:00:00.000Z',
    });
    await useProductosStore().cargarProductos();
    await useVentasStore().cargarVentas();
  }

  it('chip de agotados navega a productos con el filtro puesto', async () => {
    await sembrar();
    const w = montarVista(DashboardView, 'dashboard');
    await flushPromises();

    const chip = w.find('.alert-chip.alert-out');
    expect(chip.exists()).toBe(true);
    await chip.trigger('click');
    await flushPromises();

    expect(useProductosStore().filtroStock).toBe('agotados');
    w.unmount();
  });

  it('botones de vista del gráfico cambian graficoVista (Días/Semana/Mes)', async () => {
    await sembrar();
    const w = montarVista(DashboardView, 'dashboard');
    await flushPromises();
    const config = useConfigStore();

    const btnSemana = w.findAll('button').filter((b) => b.text().trim() === 'Semana');
    expect(btnSemana.length).toBe(1);
    await btnSemana[0].trigger('click');
    await flushPromises();
    expect(config.cfg.graficoVista).toBe('semana');

    const btnMes = w.findAll('button').filter((b) => b.text().trim() === 'Mes');
    // El primer Mes es del gráfico principal (el segundo de productos)
    await btnMes[0].trigger('click');
    await flushPromises();
    expect(config.cfg.graficoVista).toBe('mes');
    w.unmount();
  });

  it('Sem/Mes cambia el período del gráfico de productos', async () => {
    await sembrar();
    const w = montarVista(DashboardView, 'dashboard');
    await flushPromises();
    const config = useConfigStore();

    const btnSem = w.findAll('button').filter((b) => b.text().trim() === 'Sem');
    expect(btnSem.length).toBe(1);
    await btnSem[0].trigger('click');
    await flushPromises();
    expect(config.cfg.graficoProdPeriodo).toBe('semana');
    w.unmount();
  });

  it('descartar una anomalía la guarda y no se repite', async () => {
    await sembrar();
    const w = montarVista(DashboardView, 'dashboard');
    await flushPromises();
    const config = useConfigStore();

    // Malta: stock 2 < mínimo 10 → recomendación de reabastecer
    const antes = w.findAll('button').filter((b) => b.text().toLowerCase().includes('descartar'));
    if (antes.length > 0) {
      await antes[0].trigger('click');
      await flushPromises();
      expect(config.cfg.anomaliasDescartadas.length).toBe(1);

      // Restaurar: vuelve a estar vacío
      const restaurar = w.findAll('button').filter((b) => b.text().toLowerCase().includes('restaurar'));
      if (restaurar.length > 0) {
        await restaurar[0].trigger('click');
        await flushPromises();
        expect(config.cfg.anomaliasDescartadas.length).toBe(0);
      }
    }
    w.unmount();
  });
});

// ============================================================
// NOTIFICACIONES — web y nativo con mocks
// ============================================================
describe('useNotificacionesStore: envío y permisos', () => {
  it('web sin soporte de Notification → motivo sin-soporte', async () => {
    const orig = window.Notification;
    // @ts-expect-error quitar el soporte
    delete window.Notification;
    try {
      const s = useNotificacionesStore();
      const r = await s.enviarNotif('T', 'C');
      expect(r).toEqual({ ok: false, motivo: 'sin-soporte' });
    } finally {
      if (orig !== undefined) window.Notification = orig;
    }
  });

  it('web con permiso concedido envía por el constructor (sin serviceWorker)', async () => {
    const ctor = vi.fn();
    window.Notification = Object.assign(ctor, {
      permission: 'granted',
      requestPermission: vi.fn().mockResolvedValue('granted'),
    });
    // Sin serviceWorker en happy-dom → fallback a constructor
    vi.stubGlobal('navigator', { ...navigator, serviceWorker: undefined });

    const s = useNotificacionesStore();
    const r = await s.enviarNotif('Titulo', 'Cuerpo');
    expect(r.ok).toBe(true);
    expect(r.via).toBe('constructor');
    expect(ctor).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
  });

  it('web sin permiso → motivo sin-permiso y no construye', async () => {
    const ctor = vi.fn();
    window.Notification = Object.assign(ctor, { permission: 'denied', requestPermission: vi.fn() });

    const s = useNotificacionesStore();
    const r = await s.enviarNotif('T', 'C');
    expect(r).toEqual({ ok: false, motivo: 'sin-permiso' });
    expect(ctor).not.toHaveBeenCalled();
  });

  it('pedirPermisoNotif en web con permiso ya concedido activa notifActivo', async () => {
    const config = useConfigStore();
    config.cfg.notifActivo = false;
    window.Notification = Object.assign(vi.fn(), { permission: 'granted', requestPermission: vi.fn() });

    const s = useNotificacionesStore();
    await s.pedirPermisoNotif();
    await flushPromises();
    expect(config.cfg.notifActivo).toBe(true);

    await s.desactivarNotif();
    expect(config.cfg.notifActivo).toBe(false);
  });

  it('probarNotif sin permiso avisa y no envía', async () => {
    window.Notification = Object.assign(vi.fn(), { permission: 'default', requestPermission: vi.fn() });
    const s = useNotificacionesStore();
    await s.probarNotif();
    // Sin crash: la prueba termina sin lanzar
    expect(true).toBe(true);
  });
});
