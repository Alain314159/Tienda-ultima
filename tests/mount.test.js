/**
 * Test de montaje de la aplicación completa.
 * Verifica que App.vue (shell) y las 8 vistas rendericen sin errores
 * de runtime (bindings no definidos en templates, etc.).
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { createApp, h } from 'vue';
import { createPinia } from 'pinia';

// Silenciar ruido externo (logger, PWA, autosave)
vi.mock('../src/services/logger.js', () => ({ Log: { init: async () => {}, evento: () => {} } }));
vi.mock('../src/services/autosave.js', () => ({
  Autosave: { init: async () => {}, verificarAlArrancar: async () => {}, notificarOperacion: () => {} },
}));
vi.mock('virtual:pwa-register', () => ({ registerSW: () => {} }), { virtual: true });

import App from '../src/App.vue';
import router from '../src/router/index';
import AppIcon from '../src/components/AppIcon.vue';

/** Monta la app y devuelve errores de Vue capturados. */
async function montarApp() {
  const errores = [];
  const warn = console.warn;
  const err = console.error;
  console.warn = (...args) => {
    const msg = String(args[0] || '');
    if (msg.includes('[Vue warn]')) errores.push(args.join(' '));
  };
  console.error = (...args) => {
    errores.push(args.join(' '));
  };

  const app = createApp({ render: () => h(App) });
  const pinia = createPinia();
  app.use(pinia);
  app.use(router);
  app.component('Icon', AppIcon);
  app.config.errorHandler = (e) => errores.push('ERROR_HANDLER: ' + (e && e.message));

  const contenedor = document.createElement('div');
  contenedor.id = 'app';
  document.body.appendChild(contenedor);
  app.mount(contenedor);

  // Esperar a que resuelva la inicialización asíncrona
  await new Promise((r) => setTimeout(r, 500));

  console.warn = warn;
  console.error = err;
  return { app, contenedor, errores };
}

const VISTAS = ['dashboard', 'ventas', 'compras', 'productos', 'inventario', 'socios', 'gastos', 'reportes'];

describe('Montaje de la app', () => {
  beforeAll(() => {
    // Chart.js y jsPDF usan canvas; stub mínimo
    window.requestIdleCallback = (cb) => setTimeout(cb, 0);
    if (!window.matchMedia) {
      window.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} });
    }
  });

  it('renderiza el shell sin warnings de bindings no definidos', async () => {
    const { contenedor, errores } = await montarApp();
    const html = contenedor.innerHTML;
    expect(html).toContain('Tienda Pro');
    expect(html.length).toBeGreaterThan(2000);
    const graves = errores.filter((e) => e.includes('Vue warn') || e.includes('ERROR_HANDLER'));
    expect(graves).toEqual([]);
  });

  it.each(VISTAS)('renderiza la vista %s sin errores', async (vista) => {
    const { contenedor, errores } = await montarApp();
    await router.push({ name: vista });
    await router.isReady();
    await new Promise((r) => setTimeout(r, 200));
    const html = contenedor.innerHTML;
    expect(html.length).toBeGreaterThan(500);
    const graves = errores.filter((e) => e.includes('Vue warn') || e.includes('ERROR_HANDLER'));
    expect(graves).toEqual([]);
  });
});

// ============================================================
// SHEET MÁS: abrir Nube y WiFi debe cerrar el sheet
// (antes el sheet quedaba abierto con z-index 95 por encima de los
// paneles, z-index 90, y tapaba "Nube y cuenta" y "Compartir por WiFi")
// ============================================================
describe('Sheet Más cierra al abrir Nube y WiFi', () => {
  async function abrirSheet(contenedor) {
    const { nextTick } = await import('vue');
    const mas = [...contenedor.querySelectorAll('nav button')].find((b) =>
      b.textContent.trim().includes('Más'),
    );
    expect(mas).toBeTruthy();
    mas.click();
    await nextTick();
    await new Promise((r) => setTimeout(r, 50));
    expect(contenedor.querySelector('.sheet')).toBeTruthy();
  }

  async function abrirDesdeSheet(contenedor, textoBoton, textoPanel) {
    const { nextTick } = await import('vue');
    await abrirSheet(contenedor);
    const btn = [...contenedor.querySelectorAll('.sheet-btn')].find((b) =>
      b.textContent.includes(textoBoton),
    );
    expect(btn).toBeTruthy();
    btn.click();
    await nextTick();
    await new Promise((r) => setTimeout(r, 50));
    // El sheet ya no debe tapar nada
    expect(contenedor.querySelector('.sheet')).toBeNull();
    // Y el panel pedido debe estar visible
    expect(contenedor.innerHTML).toContain(textoPanel);
  }

  it('Nube y cuenta cierra el sheet y muestra su panel', async () => {
    const { app, contenedor, errores } = await montarApp();
    await abrirDesdeSheet(contenedor, 'Nube y cuenta', 'Nube y cuenta');
    const graves = errores.filter((e) => e.includes('Vue warn') || e.includes('ERROR_HANDLER'));
    expect(graves).toEqual([]);
    app.unmount();
    contenedor.remove();
  });

  it('Compartir por WiFi cierra el sheet y muestra su panel', async () => {
    const { app, contenedor, errores } = await montarApp();
    await abrirDesdeSheet(contenedor, 'Compartir por WiFi', 'Compartir por WiFi');
    const graves = errores.filter((e) => e.includes('Vue warn') || e.includes('ERROR_HANDLER'));
    expect(graves).toEqual([]);
    app.unmount();
    contenedor.remove();
  });
});
