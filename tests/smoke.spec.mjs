import 'dotenv/config';
import { chromium, firefox, webkit } from 'playwright-core';

const BASE_URL = process.env.BASE_URL || 'https://alain314159.github.io/Tienda-ultima/';
const CHROMIUM_PATH = process.env.CHROMIUM_PATH;
const BROWSER = process.env.BROWSER || 'chromium';
const ENGINES = { chromium, firefox, webkit };

const errors = [];
const warnings = [];
const logs = [];
const acciones = [];

// Excepción AMBIENTAL estrecha: 409 del proxy de Telegram. Un servicio de
// terceros (tele.goldenherd.com) pelea este bot re-registrando un webhook
// que rompe getUpdates ("can't use getUpdates while webhook is active").
// El Worker lo auto-sana (deleteWebhook + retry — ver tools/worker), pero
// hasta su redespliegue puede colarse un 409 puntual. NO AMPLIAR:
// el 401 (secret sin heredar) que este gate cazó el 2026-10-16 sigue
// siendo FATAL, igual que cualquier otro 4xx/5xx o console.error.
const perdonarTg409 = (lista) => {
  const tg409 = lista.filter((e) => e.tipo === 'http-409' && e.texto.includes('tienda-proxy')).length;
  if (!tg409) return lista;
  let perdonados = 0;
  const resto = lista.filter((e) => {
    if (e.tipo === 'http-409' && e.texto.includes('tienda-proxy')) return false;
    if (e.tipo === 'console.error' && /status of 409/.test(e.texto) && perdonados < tg409) {
      perdonados++;
      return false;
    }
    return true;
  });
  warnings.push({ tipo: 'http-409-tg', texto: tg409 + ' getUpdates 409 (webhook de tercero en el bot; el Worker lo auto-sana)' });
  console.log('  ⚠️  ' + tg409 + '× 409 del proxy TG perdonado (webhook de tercero re-registrado en el bot)');
  return resto;
};

const grabar = (nombre) => {
  acciones.push({ nombre, ts: new Date().toISOString() });
  console.log('▶️  ' + nombre);
};

const esperar = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log('═══════════════════════════════════════════');
  console.log(' SMOKE TEST - Tienda Pro');
  console.log(' URL: ' + BASE_URL);
  console.log('═══════════════════════════════════════════\n');

  // Multi-navegador: BROWSER=chromium|firefox|webkit (executablePath solo
  // si viene en env: los binarios de playwright-core instalados por CI se
  // autodetectan, CHROMIUM_PATH se mantiene para compatibilidad local)
  const engine = ENGINES[BROWSER] || chromium;
  const browser = await engine.launch({
    ...(CHROMIUM_PATH && BROWSER === 'chromium' ? { executablePath: CHROMIUM_PATH } : {}),
    headless: true,
    ...(BROWSER === 'chromium' ? { args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] } : {})
  });

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }
  });

  const page = await context.newPage();

  page.on('console', msg => {
    const log = { type: msg.type(), text: msg.text() };
    logs.push(log);
    if (msg.type() === 'error') {
      errors.push({ tipo: 'console.error', texto: msg.text() });
      console.log('  ❌ console.error: ' + msg.text());
    } else if (msg.type() === 'warning') {
      warnings.push({ tipo: 'console.warn', texto: msg.text() });
    }
  });

  page.on('pageerror', err => {
    errors.push({ tipo: 'pageerror', texto: err.message });
    console.log('  ❌ pageerror: ' + err.message);
  });

  page.on('requestfailed', req => {
    const url = req.url();
    if (url.includes('chrome-extension') || url.includes('devtools')) return;
    errors.push({ tipo: 'request-failed', texto: url });
    console.log('  ❌ request failed: ' + url);
  });

  page.on('response', res => {
    if (res.status() >= 400 && !res.url().includes('favicon')) {
      errors.push({ tipo: 'http-' + res.status(), texto: res.url() });
      console.log('  ⚠️  HTTP ' + res.status() + ': ' + res.url());
    }
  });

  try {
    grabar('Cargar pagina principal');
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await esperar(3000);

    grabar('Verificar app montada');
    const htmlApp = await page.content();
    if (htmlApp.length < 500) throw new Error('Contenido muy corto');
    console.log('  ✅ App montada (' + htmlApp.length + ' bytes)');

    grabar('Verificar header');
    const header = await page.$('.header');
    console.log(header ? '  ✅ Header visible' : '  ⚠️  Header no visible');

    grabar('Cerrar aviso inicial si existe');
    const btnAviso = await page.$('.modal-box.aviso-tienda button:has-text("Recordarme")') || await page.$('.aviso-tienda button');
    if (btnAviso) { await btnAviso.click(); await esperar(600); console.log('  ✅ Aviso inicial cerrado'); }
    else console.log('  ⚠️  Sin aviso inicial');

    grabar('Navegar a Ventas');
    await page.click('nav button:has-text("Ventas")');
    await esperar(800);
    console.log('  ✅ Seccion Ventas');

    grabar('Navegar a Compras');
    await page.click('nav button:has-text("Compras")');
    await esperar(800);
    console.log('  ✅ Seccion Compras');

    grabar('Navegar a Inventario');
    await page.click('nav button:has-text("Inventario")');
    await esperar(800);
    console.log('  ✅ Seccion Inventario');

    grabar('Abrir menu Mas');
    const masBtn = await page.$('nav button:has-text("Más")') || await page.$('nav button:has-text("Mas")');
    if (masBtn) {
      await masBtn.click();
      await esperar(800);
      const sheet = await page.$('.sheet');
      console.log(sheet ? '  ✅ Menu Mas abierto' : '  ⚠️  Menu no abrio');

      for (const sec of ['productos', 'gastos', 'socios', 'reportes']) {
        grabar('Navegar a ' + sec + ' desde sheet');
        if (!(await page.$('.sheet'))) { await masBtn.click(); await esperar(600); }
        const btn = await page.$('.sheet button:has-text("' + sec.charAt(0).toUpperCase() + sec.slice(1) + '")');
        if (btn) {
          await btn.click();
          await esperar(1200);
          console.log('  ✅ Seccion ' + sec);
        } else {
          console.log('  ⚠️  Boton ' + sec + ' no encontrado');
        }
      }
    } else {
      console.log('  ⚠️  Boton Mas no encontrado');
    }

    grabar('Abrir Ajustes desde header');
    const btnAjustes = await page.$('header button:has-text("Ajustes")');
    if (btnAjustes) {
      await btnAjustes.click();
      await esperar(1000);
      const modal = await page.$('.modal-box');
      console.log(modal ? '  ✅ Modal Ajustes abierto' : '  ⚠️  Modal no aparecio');
      // Cerrar con el boton "Cerrar" del modal (no Escape)
      const btnCerrar = await page.$('.modal-box button:has-text("Cerrar")');
      if (btnCerrar) {
        await btnCerrar.click();
        await esperar(600);
        console.log('  ✅ Modal cerrado');
      }
    }

    grabar('Ir a Inicio');
    await page.click('nav button:has-text("Inicio")');
    await esperar(1500);
    console.log('  ✅ Seccion Inicio');

    grabar('Verificar grafico');
    const canvas = await page.$('#chartVentas');
    console.log(canvas ? '  ✅ Canvas chart presente' : '  ⚠️  Chart no encontrado');

    grabar('Verificar stats del dashboard');
    const stats = await page.$$('.stat');
    console.log('  ✅ ' + stats.length + ' stat(s)');

    console.log('\n✅ FLUJO COMPLETADO');

  } catch (e) {
    errors.push({ tipo: 'flujo-roto', texto: e.message });
    console.log('\n❌ FLUJO INTERRUMPIDO: ' + e.message);
    try {
      await page.screenshot({ path: 'smoke-error.png', fullPage: true });
      console.log('  📷 Screenshot: ./smoke-error.png');
    } catch (_) {}
  } finally {
    await browser.close();

    console.log('\n═══════════════════════════════════════════');
    console.log(' RESUMEN');
    console.log('═══════════════════════════════════════════');
    const erroresFinales = perdonarTg409(errors);
    console.log(' Acciones: ' + acciones.length);
    console.log(' Logs: ' + logs.length);
    console.log(' Warnings: ' + warnings.length);
    console.log(' Errores: ' + erroresFinales.length);

    if (erroresFinales.length > 0) {
      console.log('\n--- ERRORES ---');
      erroresFinales.forEach((e, i) => console.log(' ' + (i + 1) + '. [' + e.tipo + '] ' + e.texto));
      process.exit(1);
    } else {
      console.log('\n🎉 TODO OK');
      process.exit(0);
    }
  }
})();
