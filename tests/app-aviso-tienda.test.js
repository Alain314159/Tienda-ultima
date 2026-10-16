/**
 * El CARTEL DE TELEGRAM del primer arranque ("Configura tu respaldo").
 *
 * El dueño lo reportó como fricción real: al abrir la app por primera vez
 * sale un modal bloqueante sobre el bot de Telegram y hay que cerrarlo
 * para poder usar la app. Estos tests fijan su contrato:
 *   1. Aparece SOLO en primer arranque (tienda sin configurar)
 *   2. BLOQUEA la app mientras está abierto (overlay modal)
 *   3. "Recordarme despues" lo pospone 3 días (no reaparece al recargar)
 *   4. "No volver a mostrar" lo descarta para siempre
 *   5. "Configurar ahora" abre Ajustes
 *   6. Con la tienda ya configurada nunca aparece
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { createPinia, setActivePinia } from 'pinia';
import { createApp, h } from 'vue';

import { db } from '../src/db';
import router from '../src/router/index';
import { useConfigStore } from '../src/stores/useConfigStore';
import { useUIStore } from '../src/stores/useUIStore';
import AppIcon from '../src/components/AppIcon.vue';
import App from '../src/App.vue';

async function montarApp() {
  const errores = [];
  const app = createApp({ render: () => h(App) });
  const pinia = createPinia();
  app.use(pinia);
  app.use(router);
  app.component('Icon', AppIcon);
  app.config.errorHandler = (e) => errores.push('ERROR_HANDLER: ' + (e && e.message));

  const contenedor = document.createElement('div');
  contenedor.id = 'app-' + Math.random().toString(36).slice(2, 8);
  document.body.appendChild(contenedor);
  app.mount(contenedor);
  // La inicialización (BD + stores + cartel con delay de 800ms) necesita aire
  await new Promise((r) => setTimeout(r, 1800));
  return { app, contenedor, errores };
}

function cartel(contenedor) {
  return contenedor.querySelector('.modal .aviso-tienda');
}

function botonesCartel(contenedor) {
  const box = cartel(contenedor);
  if (!box) return [];
  return [...box.querySelectorAll('button')].map((b) => b.textContent.trim());
}

beforeEach(async () => {
  setActivePinia(createPinia());
  vi.restoreAllMocks();
  localStorage.clear();
  window.requestIdleCallback = (cb) => setTimeout(cb, 0);
  if (!window.matchMedia) {
    window.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} });
  }
  // Config limpia = primer arranque
  await db.config.clear();
});

describe('Aviso de Telegram del primer arranque', () => {
  it('aparece en el primer arranque y bloquea la app (overlay modal)', async () => {
    const { contenedor, errores } = await montarApp();

    // El cartel está presente y es un modal (cubre toda la pantalla)
    await vi.waitFor(() => expect(cartel(contenedor)).toBeTruthy());
    const aviso = cartel(contenedor);
    expect(aviso.textContent).toContain('Configura tu respaldo');
    expect(aviso.textContent).toContain('@mibot_backup_bot');

    // Los 3 caminos de cierre existen
    const textos = botonesCartel(contenedor);
    expect(textos).toContain('Configurar ahora');
    expect(textos).toContain('Recordarme despues');
    expect(textos).toContain('No volver a mostrar');

    // Bloqueo: el overlay del modal tapa el contenido (clase modal)
    expect(aviso.closest('.modal')).toBeTruthy();
    expect(errores).toEqual([]);
  });

  it('"Recordarme despues" cierra el cartel y fija el snooze de 3 días', async () => {
    const { contenedor } = await montarApp();
    await vi.waitFor(() => expect(cartel(contenedor)).toBeTruthy());

    const btn = [...cartel(contenedor).querySelectorAll('button')].find((b) =>
      b.textContent.includes('Recordarme despues')
    );
    btn.click();
    await new Promise((r) => setTimeout(r, 300));

    // Cartel cerrado
    expect(cartel(contenedor)).toBeNull();

    // Snooze persistido: ~3 días hacia el futuro
    const config = useConfigStore();
    const hasta = Number(config.cfg.avisoTiendaSnoozeHasta);
    expect(hasta).toBeGreaterThan(Date.now() + 2.9 * 24 * 60 * 60 * 1000);
    expect(hasta).toBeLessThan(Date.now() + 3.1 * 24 * 60 * 60 * 1000);
  });

  it('"No volver a mostrar" lo descarta para siempre (persistido)', async () => {
    const { contenedor } = await montarApp();
    await vi.waitFor(() => expect(cartel(contenedor)).toBeTruthy());

    const btn = [...cartel(contenedor).querySelectorAll('button')].find((b) =>
      b.textContent.includes('No volver a mostrar')
    );
    btn.click();
    await new Promise((r) => setTimeout(r, 300));

    expect(cartel(contenedor)).toBeNull();
    const config = useConfigStore();
    expect(config.cfg.avisoTiendaDescartado).toBe(true);
  });

  it('"Configurar ahora" abre Ajustes y cierra el cartel', async () => {
    const { contenedor } = await montarApp();
    await vi.waitFor(() => expect(cartel(contenedor)).toBeTruthy());

    const btn = [...cartel(contenedor).querySelectorAll('button')].find((b) =>
      b.textContent.includes('Configurar ahora')
    );
    btn.click();
    await new Promise((r) => setTimeout(r, 300));

    expect(cartel(contenedor)).toBeNull();
    const ui = useUIStore();
    expect(ui.ajustesAbierto).toBe(true);
  });

  it('con la tienda ya configurada NO aparece (dueño existente)', async () => {
    // Pre-configurar como lo haría un dueño que ya pasó el onboarding
    const config = useConfigStore();
    config.cfg.tiendaConfigurada = true;
    await config.guardarCfg();

    const { contenedor } = await montarApp();
    await new Promise((r) => setTimeout(r, 1500));
    expect(cartel(contenedor)).toBeNull();
  });

  it('con snooze activo no reaparece al "recargar" (remontar)', async () => {
    const config = useConfigStore();
    config.cfg.avisoTiendaSnoozeHasta = Date.now() + 3 * 24 * 60 * 60 * 1000;
    config.cfg.avisoTiendaDescartado = false;
    await config.guardarCfg();

    const { contenedor } = await montarApp();
    await new Promise((r) => setTimeout(r, 1500));
    expect(cartel(contenedor)).toBeNull();
  });
});
