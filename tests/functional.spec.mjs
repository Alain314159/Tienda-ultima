import 'dotenv/config';
import { chromium } from 'playwright-core';

const BASE_URL = process.env.BASE_URL || 'https://alain314159.github.io/Tienda-ultima/';
const CHROMIUM_PATH = process.env.CHROMIUM_PATH;
const esperar = (ms) => new Promise(r => setTimeout(r, ms));

const checks = [];
const errores = [];
let paso = 0;

const check = (nombre, cond, detalle = '') => {
  paso++;
  const ok = !!cond;
  checks.push({ paso, nombre, ok, detalle });
  console.log((ok ? '  ✅ ' : '  ❌ ') + 'P' + paso + '. ' + nombre + (detalle ? ' — ' + detalle : ''));
  if (!ok) errores.push('P' + paso + ': ' + nombre + ' ' + detalle);
};

const igual = (a, b, tol = 0.01) => Math.abs(a - b) < tol;

const autoConfirmarModal = async (page, textoBoton = 'Confirmar') => {
  await esperar(600);
  try {
    const btn = page.locator('.modal-box button:has-text("' + textoBoton + '")').first();
    if (await btn.isVisible({ timeout: 1500 })) {
      await btn.click({ timeout: 5000 });
      await esperar(1500);
      return true;
    }
  } catch (_) {}
  return false;
};

const clickVisible = async (page, selector) => {
  const btn = await page.locator(selector).filter({ visible: true }).first();
  await btn.click({ timeout: 10000 });
};

const leerDB = (page, store, fn) => page.evaluate(async ({ store, fnStr }) => {
  const fn = eval('(' + fnStr + ')');
  const dbReq = indexedDB.open('TiendaProDB');
  return new Promise(resolve => {
    dbReq.onsuccess = () => {
      const db = dbReq.result;
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => resolve(fn(req.result));
    };
  });
}, { store, fnStr: fn.toString() });

(async () => {
  console.log('═══════════════════════════════════════════');
  console.log(' TEST FUNCIONAL - Tienda Pro');
  console.log(' URL: ' + BASE_URL);
  console.log('═══════════════════════════════════════════\n');

  const browser = await chromium.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
  });

  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();

  page.on('pageerror', err => {
    errores.push('pageerror: ' + err.message);
    console.log('  ❌ pageerror: ' + err.message);
  });
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const t = msg.text();
      if (t.includes('favicon') || t.includes('workbox')) return;
      errores.push('console.error: ' + t);
      console.log('  ❌ console.error: ' + t);
    }
  });

  try {
    console.log('\n▶️  Cargando app...');
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await esperar(3500);

    console.log('\n▶️  Limpiando IndexedDB para test limpio...');
    await page.evaluate(async () => {
      const dbs = await indexedDB.databases();
      for (const db of dbs) {
        if (db.name) indexedDB.deleteDatabase(db.name);
      }
    });
    await esperar(500);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await esperar(3500);

    const appOk = (await page.content()).length > 500;
    check('App carga correctamente', appOk);

    // ============ PRODUCTO ============
    console.log('\n▶️  TEST: Crear producto');
    await page.click('nav button:has-text("Más")');
    await esperar(700);
    await page.click('.sheet button:has-text("Productos")');
    await esperar(1200);

    await page.fill('input[placeholder="Nombre del producto"]', 'Papa Test');
    await page.fill('input[placeholder="Precio venta"]', '8');
    await page.fill('input[placeholder="Stock mín."]', '3');
    await clickVisible(page, 'section:visible button:has-text("Guardar")');
    await esperar(1500);

    const numProd = await leerDB(page, 'productos', arr => arr.length);
    check('Producto creado en DB', numProd === 1, 'count=' + numProd);

    // ============ COMPRA ============
    console.log('\n▶️  TEST: Registrar compra de 10 a $5');
    await page.click('nav button:has-text("Compras")');
    await esperar(1200);

    await page.fill('input[placeholder="Buscar producto..."]', 'Papa');
    await esperar(1000);
    const dropItem = await page.$('.drop-item');
    if (dropItem) await dropItem.click();
    await esperar(800);

    await page.fill('input[placeholder="Cantidad"]', '10');
    await page.fill('input[placeholder="Costo unit."]', '5');
    await esperar(500);
    await clickVisible(page, 'section:visible button:has-text("Registrar Compra")');
    await esperar(800);
    await autoConfirmarModal(page, 'Confirmar');
    await esperar(1500);

    const compras = await leerDB(page, 'compras', arr => arr.length);
    check('Compra registrada en DB', compras === 1, 'count=' + compras);

    const lotes = await leerDB(page, 'lotes', arr => arr.length);
    check('Lote creado', lotes === 1, 'count=' + lotes);

    // ============ VENTA ============
    console.log('\n▶️  TEST: Registrar venta de 3 a $8');
    await page.click('nav button:has-text("Ventas")');
    await esperar(1200);

    await page.fill('input[placeholder="Buscar producto por nombre o código..."]', 'Papa');
    await esperar(1000);
    const dropVenta = await page.$('.drop-item');
    if (dropVenta) await dropVenta.click();
    await esperar(800);

    const cantInput = await page.$('.cart-item .qty-input input');
    if (cantInput) {
      await cantInput.fill('3');
      await cantInput.blur();
      await esperar(600);
    }

    await clickVisible(page, 'section:visible button:has-text("Cobrar Venta")');
    await esperar(1200);

    const montoRecibido = await page.$('input[placeholder="Monto recibido"]');
    if (montoRecibido) {
      await montoRecibido.fill('100');
      await esperar(500);
    }
    await clickVisible(page, '.modal-box button:has-text("Confirmar Pago")');
    await esperar(2500);
    await autoConfirmarModal(page, 'Confirmar');

    const ventaData = await leerDB(page, 'ventas', arr => {
      const activas = arr.filter(v => !v.anulada);
      return {
        num: activas.length,
        total: activas.reduce((s, v) => s + (v.total || 0), 0),
        ganancia: activas.reduce((s, v) => s + (v.ganancia || 0), 0)
      };
    });

    check('1 venta registrada', ventaData.num === 1, 'num=' + ventaData.num);
    check('Total venta = $24', igual(ventaData.total, 24), 'total=$' + ventaData.total);
    check('Ganancia venta = $9', igual(ventaData.ganancia, 9), 'ganancia=$' + ventaData.ganancia);

    // ============ STOCK ============
    console.log('\n▶️  TEST: Verificar stock tras venta');
    const stockData = await leerDB(page, 'lotes', arr => {
      return arr.reduce((s, l) => s + (l.cantidadInicial - l.cantidadVendida), 0);
    });
    check('Stock final = 7', igual(stockData, 7), 'stock=' + stockData);

    // ============ GASTO ============
    console.log('\n▶️  TEST: Registrar gasto de $50');
    await page.click('nav button:has-text("Más")');
    await esperar(700);
    await page.click('.sheet button:has-text("Gastos")');
    await esperar(1200);

    const selectCat = await page.$('select');
    if (selectCat) await selectCat.selectOption('Luz');
    await page.fill('input[placeholder*="Concepto"]', 'Recibo prueba');
    await page.fill('input[placeholder="Monto"]', '50');
    await clickVisible(page, 'section:visible button:has-text("Registrar Gasto")');
    await esperar(800);
    await autoConfirmarModal(page, 'Confirmar');
    await esperar(1500);

    const gastosCount = await leerDB(page, 'gastos', arr => arr.length);
    check('1 gasto registrado', gastosCount === 1, 'count=' + gastosCount);

    // ============ ASIENTOS ============
    console.log('\n▶️  TEST: Verificar libro diario (asientos automaticos)');
    const asientosData = await leerDB(page, 'asientos', arr => {
      const tipos = {};
      arr.forEach(a => { tipos[a.refTipo] = (tipos[a.refTipo] || 0) + 1; });
      return { num: arr.length, tipos };
    });

    check('Asientos generados > 0', asientosData.num > 0, 'num=' + asientosData.num);
    check('Asiento de compra', (asientosData.tipos.compra || 0) >= 1, JSON.stringify(asientosData.tipos));
    check('Asiento de venta', (asientosData.tipos.venta || 0) >= 1);
    check('Asiento de costo', (asientosData.tipos.costo || 0) >= 1);
    check('Asiento de gasto', (asientosData.tipos.gasto || 0) >= 1);

    // ============ SOCIO ============
    console.log('\n▶️  TEST: Crear socio 100%');
    await page.click('nav button:has-text("Más")');
    await esperar(700);
    await page.click('.sheet button:has-text("Socios")');
    await esperar(1200);

    await page.fill('input[placeholder="Nombre del socio"]', 'Socio Test');
    await page.fill('input[placeholder="% participacion"]', '100');
    await page.fill('input[placeholder="Aporte inicial"]', '0');
    await clickVisible(page, 'section:visible button:has-text("Agregar Socio")');
    await esperar(800);
    await autoConfirmarModal(page, 'Confirmar');
    await esperar(1200);

    const sociosCount = await leerDB(page, 'socios', arr => arr.length);
    check('1 socio creado', sociosCount === 1, 'count=' + sociosCount);

    // ============ SALDO EN CAJA ============
    console.log('\n▶️  TEST: Saldo en caja');
    console.log('  Esperado: 0 (cap) + $24 (venta) - $50 (compra) - $50 (gasto) = -$76');

    const caja = await page.evaluate(async () => {
      const dbReq = indexedDB.open('TiendaProDB');
      return new Promise(resolve => {
        dbReq.onsuccess = () => {
          const db = dbReq.result;
          const tx = db.transaction(['ventas', 'compras', 'gastos', 'capital', 'retiros', 'movCaja', 'config'], 'readonly');
          const out = { ventas: 0, compras: 0, gastos: 0, capital: 0, retiros: 0, arqueo: 0, capitalInicial: 0 };
          let pending = 7;
          const done = () => { pending--; if (!pending) resolve(out); };

          tx.objectStore('ventas').getAll().onsuccess = e => { out.ventas = e.target.result.filter(v => !v.anulada).reduce((s, v) => s + (v.total || 0), 0); done(); };
          tx.objectStore('compras').getAll().onsuccess = e => { out.compras = e.target.result.filter(c => !c.anulada).reduce((s, c) => s + (c.total || 0), 0); done(); };
          tx.objectStore('gastos').getAll().onsuccess = e => { out.gastos = e.target.result.filter(g => g.saleDeCaja !== false).reduce((s, g) => s + (g.monto || 0), 0); done(); };
          tx.objectStore('capital').getAll().onsuccess = e => { out.capital = e.target.result.reduce((s, x) => s + (x.monto || 0), 0); done(); };
          tx.objectStore('retiros').getAll().onsuccess = e => { out.retiros = e.target.result.reduce((s, x) => s + (x.monto || 0), 0); done(); };
          tx.objectStore('movCaja').getAll().onsuccess = e => { out.arqueo = e.target.result.reduce((s, x) => s + (x.tipo === 'ingreso' ? x.monto : -x.monto), 0); done(); };
          tx.objectStore('config').get('cfg').onsuccess = e => { out.capitalInicial = e.target.result?.value?.capitalInicial || 0; done(); };
        };
      });
    });

    const saldo = caja.capitalInicial + caja.ventas + caja.capital - caja.compras - caja.retiros + caja.arqueo - caja.gastos;
    console.log('  Detalle: ' + JSON.stringify(caja));
    check('Saldo en caja = -$76', igual(saldo, -76), 'saldo=$' + saldo);

    // ============ CUADRE ============
    console.log('\n▶️  TEST: Generar cuadre');
    await page.click('nav button:has-text("Más")');
    await esperar(700);
    await page.click('.sheet button:has-text("Reportes")');
    await esperar(1200);

    try { await clickVisible(page, 'section:visible button:has-text("Hoy")'); await esperar(600); } catch (_) {}
    await clickVisible(page, 'section:visible button:has-text("Generar Cuadre")');
    await esperar(2500);

    const cuadreOk = await page.$('text=Ganancia bruta');
    check('Cuadre se genero correctamente', cuadreOk);

    // ============ RESUMEN ============
    console.log('\n═══════════════════════════════════════════');
    console.log(' RESUMEN');
    console.log('═══════════════════════════════════════════');
    const ok = checks.filter(c => c.ok).length;
    const total = checks.length;
    console.log(' Checks: ' + ok + '/' + total);
    console.log(' Errores de ejecucion: ' + errores.length);

    if (errores.length > 0) {
      console.log('\n--- ERRORES ---');
      errores.forEach((e, i) => console.log(' ' + (i + 1) + '. ' + e));
    }

    if (ok === total && errores.length === 0) {
      console.log('\n🎉 TODOS LOS CHECKS PASARON');
      process.exit(0);
    } else {
      console.log('\n⚠️  ' + (total - ok) + ' CHECK(S) FALLIDO(S)');
      process.exit(1);
    }

  } catch (e) {
    console.log('\n❌ EXCEPCION: ' + e.message);
    errores.push('excepcion: ' + e.message);
    try {
      await page.screenshot({ path: '/data/data/com.termux/files/home/functional-error.png', fullPage: true });
      console.log('  📷 Screenshot: ~/functional-error.png');
    } catch (_) {}
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
