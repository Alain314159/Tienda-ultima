/**
 * Test funcional (Playwright, navegador real) de los flujos del punto 6.2:
 * anular una venta, arqueo de caja con sobrante, cierre de período y
 * restaurar un respaldo exportado.
 *
 * Recorre la app como un usuario: crea producto + compra + venta por la UI,
 * exporta el respaldo, hace el arqueo, anula la venta, cierra el período y
 * restaura el respaldo, verificando en cada paso la IndexedDB real.
 *
 * Uso local (en este VM):
 *   npm run build
 *   npx vite preview --port 4174 --strictPort
 *   BASE_URL=http://localhost:4174/Tienda-ultima/ node tests/flujos-anular-arqueo-cierre.spec.mjs
 * Sin BASE_URL apunta a la demo publicada, como functional.spec.mjs.
 */
import 'dotenv/config';
import { chromium } from 'playwright-core';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE_URL = process.env.BASE_URL || 'https://alain314159.github.io/Tienda-ultima/';
const CHROMIUM_PATH = process.env.CHROMIUM_PATH;
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

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
    const btn = page
      .locator('.modal-box button:has-text("' + textoBoton + '")')
      .filter({ visible: true })
      .first();
    await btn.waitFor({ state: 'visible', timeout: 5000 });
    await btn.click({ timeout: 5000 });
    await esperar(1500);
    return true;
  } catch (e) {
    console.log('  ⚠ autoConfirmarModal falló (' + textoBoton + '): ' + String(e.message).split('\n')[0]);
    return false;
  }
};

const clickVisible = async (page, selector) => {
  const btn = await page.locator(selector).filter({ visible: true }).first();
  await btn.click({ timeout: 10000 });
};

const leerDB = (page, store, fn) =>
  page.evaluate(
    async ({ store, fnStr }) => {
      const fn = eval('(' + fnStr + ')');
      const dbReq = indexedDB.open('TiendaProDB');
      return new Promise((resolve) => {
        dbReq.onsuccess = () => {
          const db = dbReq.result;
          const tx = db.transaction(store, 'readonly');
          const req = tx.objectStore(store).getAll();
          req.onsuccess = () => resolve(fn(req.result));
        };
      });
    },
    { store, fnStr: fn.toString() }
  );

const irAReportes = async (page) => {
  await page.click('nav button:has-text("Más")');
  await esperar(700);
  await page.click('.sheet button:has-text("Reportes")');
  await esperar(1200);
};

(async () => {
  console.log('═══════════════════════════════════════════');
  console.log(' TEST FUNCIONAL: anular / arqueo / cierre / restaurar');
  console.log(' URL: ' + BASE_URL);
  console.log('═══════════════════════════════════════════\n');

  const browser = await chromium.launch({
    ...(CHROMIUM_PATH ? { executablePath: CHROMIUM_PATH } : {}),
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();

  page.on('pageerror', (err) => {
    errores.push('pageerror: ' + err.message);
    console.log('  ❌ pageerror: ' + err.message);
  });
  page.on('console', (msg) => {
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
    check('App carga correctamente', (await page.content()).length > 500);

    // ============ PRODUCTO + COMPRA + VENTA (preparación, igual que functional.spec.mjs) ============
    console.log('\n▶️  TEST: Crear producto Papa Test');
    await page.click('nav button:has-text("Más")');
    await esperar(700);
    await page.click('.sheet button:has-text("Productos")');
    await esperar(1200);
    await page.fill('input[placeholder="Nombre del producto"]', 'Papa Test');
    await page.fill('input[placeholder="Precio de venta"]', '8');
    await page.fill('input[placeholder="Stock mín."]', '3');
    await clickVisible(page, 'section:visible button:has-text("Guardar")');
    await esperar(1500);
    check('Producto creado en DB', (await leerDB(page, 'productos', (arr) => arr.length)) === 1);

    console.log('\n▶️  TEST: Registrar compra de 10 a $5');
    await page.click('nav button:has-text("Compras")');
    await esperar(1200);
    await page.fill('input[placeholder="Buscar producto..."]', 'Papa');
    await esperar(1000);
    const dropItem = await page.$('.drop-item');
    if (dropItem) await dropItem.click();
    await esperar(800);
    await page.fill('input[placeholder="Cantidad"]', '10');
    await page.fill('input[placeholder="Costo por unidad"]', '5');
    await esperar(500);
    await clickVisible(page, 'section:visible button:has-text("Registrar Compra")');
    await esperar(800);
    await autoConfirmarModal(page, 'Confirmar');
    await esperar(1500);
    check('Compra registrada en DB', (await leerDB(page, 'compras', (arr) => arr.length)) === 1);

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
      await cantInput.evaluate((el) => el.blur());
      await esperar(600);
    }
    await clickVisible(page, 'section:visible button:has-text("Cobrar Venta")');
    await esperar(1200);
    const montoRecibido = await page.$('#cobro-recibido');
    if (montoRecibido) {
      await montoRecibido.fill('100');
      await esperar(500);
    }
    await clickVisible(page, '.modal-box button:has-text("Confirmar Pago")');
    await esperar(2500);
    await autoConfirmarModal(page, 'Confirmar');
    const ventaData = await leerDB(page, 'ventas', (arr) => {
      const activas = arr.filter((v) => !v.anulada);
      return { num: activas.length, total: activas.reduce((s, v) => s + (v.total || 0), 0) };
    });
    check('1 venta registrada ($24)', ventaData.num === 1 && igual(ventaData.total, 24), 'total=$' + ventaData.total);

    // ============ EXPORTAR RESPALDO (antes de anular/arqueo/cierre) ============
    console.log('\n▶️  TEST: Exportar respaldo JSON');
    await page.click('button[aria-label="Ajustes"]');
    await esperar(1200);
    const respaldoPath = path.join(os.tmpdir(), 'respaldo-e2e-' + Date.now() + '.json');
    const downloadPromise = page.waitForEvent('download', { timeout: 15000 });
    await clickVisible(page, 'button:has-text("Exportar respaldo (JSON)")');
    const download = await downloadPromise;
    await download.saveAs(respaldoPath);
    const respaldoStat = await fs.stat(respaldoPath);
    check('Respaldo exportado y descargado', respaldoStat.size > 100, respaldoPath);
    const respaldoJson = JSON.parse(await fs.readFile(respaldoPath, 'utf8'));
    check(
      'El respaldo trae la venta activa',
      respaldoJson.ventas.length === 1 && respaldoJson.ventas[0].total === 24 && !respaldoJson.ventas[0].anulada,
      'ventas=' + respaldoJson.ventas.length
    );
    // Cerrar Ajustes (botón «Cerrar» al final del modal)
    await clickVisible(page, '.modal button:has-text("Cerrar")');
    await esperar(800);

    // ============ ARQUEO CON SOBRANTE ============
    // Saldo del sistema: 0 inicial + 24 venta − 50 compra = −26.
    // Contado físico 0 → sobra 26 → ingreso de 26 y caja en 0.
    console.log('\n▶️  TEST: Arqueo con sobrante (físico 0, sistema −26)');
    await irAReportes(page);
    await page.fill('#arqueo-fisico', '0');
    await page.fill('#arqueo-nota', 'Prueba E2E');
    await esperar(500);
    await clickVisible(page, 'button:has-text("Registrar arqueo")');
    await autoConfirmarModal(page, 'Confirmar');
    await esperar(1500);
    const arqueoData = await leerDB(page, 'arqueos', (arr) => arr[0]);
    check('Arqueo registrado', !!arqueoData, JSON.stringify(arqueoData));
    check('Arqueo: sistema −26, físico 0, sobrante 26', arqueoData && igual(arqueoData.cajaSistema, -26) && igual(arqueoData.cajaFisica, 0) && igual(arqueoData.faltanteSobrante, 26), JSON.stringify(arqueoData));
    const movAjuste = await leerDB(page, 'movCaja', (arr) => arr.filter((m) => (m.concepto || '').includes('Ajuste por arqueo')));
    check('Ajuste por arqueo: 1 ingreso de 26', movAjuste.length === 1 && movAjuste[0].tipo === 'ingreso' && igual(movAjuste[0].monto, 26), JSON.stringify(movAjuste));

    // ============ ANULAR VENTA ============
    console.log('\n▶️  TEST: Anular la venta desde el historial');
    await page.click('nav button:has-text("Ventas")');
    await esperar(1200);
    const btnAnular = page.locator('.item:has-text("Papa Test") button:has-text("Anular")').first();
    await btnAnular.waitFor({ state: 'visible', timeout: 10000 });
    await btnAnular.click();
    await autoConfirmarModal(page, 'Confirmar');
    await esperar(1500);
    const ventaAnulada = await leerDB(page, 'ventas', (arr) => arr[0]);
    check('Venta marcada anulada con fechaAnulacion', !!ventaAnulada && ventaAnulada.anulada === true && !!ventaAnulada.fechaAnulacion, JSON.stringify(ventaAnulada));
    const stockTrasAnular = await leerDB(page, 'lotes', (arr) => arr.reduce((s, l) => s + (l.cantidadInicial - l.cantidadVendida), 0));
    check('Stock restaurado a 10 tras anular', igual(stockTrasAnular, 10), 'stock=' + stockTrasAnular);
    const ventasActivas = await leerDB(page, 'ventas', (arr) => arr.filter((v) => !v.anulada).length);
    check('Sin ventas activas tras anular', ventasActivas === 0);
    check('La UI muestra el badge ANULADA', (await page.content()).includes('ANULADA'));

    // ============ CERRAR PERÍODO ============
    console.log('\n▶️  TEST: Cerrar período');
    await irAReportes(page);
    await clickVisible(page, 'button:has-text("Cerrar Período y Empezar Nuevo")');
    await autoConfirmarModal(page, 'Confirmar');
    await esperar(2000);
    const cierre = await leerDB(page, 'cierres', (arr) => arr[0]);
    check('Cierre registrado', !!cierre, JSON.stringify(cierre));
    // La venta anulada no entra: ventas 0, numVentas 0. Caja: 0 + 0 − 50 + 26 = −24.
    check('Cierre excluye la venta anulada (ventas 0, numVentas 0)', !!cierre && cierre.ventas === 0 && cierre.numVentas === 0, JSON.stringify(cierre));
    check('Cierre cajaFinal = −24', !!cierre && igual(cierre.cajaFinal, -24), 'cajaFinal=' + (cierre && cierre.cajaFinal));
    check('Cierre con valor de inventario 50 (10 uds. × 5)', !!cierre && igual(cierre.valorInventario, 50), 'valorInventario=' + (cierre && cierre.valorInventario));

    // ============ RESTAURAR RESPALDO ============
    console.log('\n▶️  TEST: Crear producto basura y restaurar el respaldo exportado');
    await page.click('nav button:has-text("Más")');
    await esperar(700);
    await page.click('.sheet button:has-text("Productos")');
    await esperar(1200);
    await page.fill('input[placeholder="Nombre del producto"]', 'Basura Test');
    await page.fill('input[placeholder="Precio de venta"]', '1');
    await clickVisible(page, 'section:visible button:has-text("Guardar")');
    await esperar(1500);
    check('Producto basura creado (2 productos)', (await leerDB(page, 'productos', (arr) => arr.length)) === 2);

    await page.click('button[aria-label="Ajustes"]');
    await esperar(1200);
    await page.setInputFiles('#impFile', respaldoPath);
    await esperar(1500);
    await autoConfirmarModal(page, 'Confirmar');
    await esperar(2500);
    const productosTrasRestore = await leerDB(page, 'productos', (arr) => arr.map((p) => p.nombre));
    check('Restaurar: vuelve solo Papa Test (la basura desaparece)', productosTrasRestore.length === 1 && productosTrasRestore[0] === 'Papa Test', JSON.stringify(productosTrasRestore));
    const ventaTrasRestore = await leerDB(page, 'ventas', (arr) => arr[0]);
    check('Restaurar: la venta vuelve activa ($24)', !!ventaTrasRestore && !ventaTrasRestore.anulada && igual(ventaTrasRestore.total, 24), JSON.stringify(ventaTrasRestore));
    const stockTrasRestore = await leerDB(page, 'lotes', (arr) => arr.reduce((s, l) => s + (l.cantidadInicial - l.cantidadVendida), 0));
    check('Restaurar: stock vuelve a 7', igual(stockTrasRestore, 7), 'stock=' + stockTrasRestore);
    check('Restaurar: arqueos y cierres posteriores desaparecen', (await leerDB(page, 'arqueos', (arr) => arr.length)) === 0 && (await leerDB(page, 'cierres', (arr) => arr.length)) === 0);

    await fs.unlink(respaldoPath).catch(() => {});
  } catch (e) {
    errores.push('excepción: ' + (e && e.message ? e.message : String(e)));
    console.log('  ❌ excepción: ' + (e && e.stack ? e.stack : String(e)));
  } finally {
    await browser.close();
  }

  const ok = checks.filter((c) => c.ok).length;
  const total = checks.length;
  console.log('\n═══════════════════════════════════════════');
  console.log(' Resultado: ' + ok + '/' + total + ' checks OK');
  if (errores.length) {
    console.log(' Errores:');
    errores.forEach((e) => console.log('  - ' + e));
  }
  console.log('═══════════════════════════════════════════');
  process.exit(errores.length || ok !== total ? 1 : 0);
})();
