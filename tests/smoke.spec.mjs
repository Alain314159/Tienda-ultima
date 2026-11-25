import 'dotenv/config';
import { chromium } from 'playwright-core';

const BASE_URL = process.env.BASE_URL || 'https://alain314159.github.io/Tienda-ultima/';
const CHROMIUM_PATH = process.env.CHROMIUM_PATH;

const errors = [];
const warnings = [];
const logs = [];
const acciones = [];

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

  const browser = await chromium.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
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

    grabar('Navegar a Ventas');
    await page.click('nav button:has-text("Ventas")');
    await esperar(800);
    console.log('  ✅ Seccion Ventas');

    grabar('Navegar a Compras');
    await page.click('nav button:has-text("Compras")');
    await esperar(800);
    console.log('  ✅ Seccion Compras');

    grabar('Navegar a Caja');
    await page.click('nav button:has-text("Caja")');
    await esperar(800);
    console.log('  ✅ Seccion Caja');

    grabar('Abrir menu Mas');
    const masBtn = await page.$('nav button:has-text("Más")') || await page.$('nav button:has-text("Mas")');
    if (masBtn) {
      await masBtn.click();
      await esperar(800);
      const sheet = await page.$('.sheet');
      console.log(sheet ? '  ✅ Menu Mas abierto' : '  ⚠️  Menu no abrio');
    } else {
      console.log('  ⚠️  Boton Mas no encontrado');
    }

    grabar('Navegar a Contabilidad desde sheet');
    const btnContab = await page.$('.sheet button:has-text("Contabilidad")');
    if (btnContab) {
      await btnContab.click();
      await esperar(1500);
      console.log('  ✅ Sheet cerro y navego a Contabilidad');
    } else {
      console.log('  ⚠️  Boton Contabilidad no encontrado');
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
    console.log(' Acciones: ' + acciones.length);
    console.log(' Logs: ' + logs.length);
    console.log(' Warnings: ' + warnings.length);
    console.log(' Errores: ' + errors.length);

    if (errors.length > 0) {
      console.log('\n--- ERRORES ---');
      errors.forEach((e, i) => console.log(' ' + (i + 1) + '. [' + e.tipo + '] ' + e.texto));
      process.exit(1);
    } else {
      console.log('\n🎉 TODO OK');
      process.exit(0);
    }
  }
})();
