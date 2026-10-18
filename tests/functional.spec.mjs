import 'dotenv/config';
import { chromium, firefox, webkit } from 'playwright-core';
import { filtrarTg409 } from './lib/tg409.mjs';

const BASE_URL = process.env.BASE_URL || 'https://alain314159.github.io/Tienda-ultima/';
const CHROMIUM_PATH = process.env.CHROMIUM_PATH;
const BROWSER = process.env.BROWSER || 'chromium';
const ENGINES = { chromium, firefox, webkit };
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
    // filter(visible) evita matchear botones dentro de otros modales cerrados
    // (todos los .modal-box viven en el DOM aunque estén ocultos)
    const btn = page
      .locator('.modal-box button:has-text("' + textoBoton + '")')
      .filter({ visible: true })
      .first();
    await btn.waitFor({ state: 'visible', timeout: 3000 });
    await btn.click({ timeout: 5000 });
    await esperar(1500);
    return true;
  } catch (e) {
    try {
      const visibles = await page
        .locator('.modal-box')
        .filter({ visible: true })
        .allTextContents();
      // Solo es un problema si había un modal abierto que no se pudo confirmar
      if (visibles.length > 0) {
        console.log(
          '  ⚠ autoConfirmarModal falló (' + textoBoton + '): ' + String(e.message).split('\n')[0]
        );
        console.log(
          '  ⚠ modales visibles: ' + JSON.stringify(visibles.map((t) => t.replace(/\s+/g, ' ').slice(0, 120)))
        );
      }
    } catch (_) {}
    return false;
  }
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

  // Multi-navegador: BROWSER=chromium|firefox|webkit (executablePath solo
  // si viene en env: los binarios de playwright-core instalados por CI se
  // autodetectan, CHROMIUM_PATH se mantiene para compatibilidad local)
  const engine = ENGINES[BROWSER] || chromium;
  const browser = await engine.launch({
    ...(CHROMIUM_PATH && BROWSER === 'chromium' ? { executablePath: CHROMIUM_PATH } : {}),
    headless: true,
    ...(BROWSER === 'chromium' ? { args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] } : {})
  });

  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();

  page.on('pageerror', err => {
    errores.push('pageerror: ' + err.message);
    console.log('  ❌ pageerror: ' + err.message);
  });
  // 409 reales del proxy TG (webhook pirata): se cuentan aqui y solo se
  // perdonan los console.error emparejados al final (logica compartida
  // con smoke.spec.mjs en tests/lib/tg409.mjs). Todo lo demas es fatal.
  let http409Tg = 0;
  page.on('response', res => {
    if (res.status() === 409 && res.url().includes('tienda-proxy')) http409Tg++;
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

    // En instalación limpia aparece el aviso de configurar respaldo de Telegram:
    // cerrarlo ("Recordarme despues") para desbloquear la navegación
    try {
      const btnAviso = page.locator('.modal-box button:has-text("Recordarme despues")');
      if (await btnAviso.isVisible({ timeout: 3000 })) {
        await btnAviso.click({ timeout: 5000 });
        await esperar(800);
      }
    } catch (_) {}

    const appOk = (await page.content()).length > 500;
    check('App carga correctamente', appOk);

    // ============ PRODUCTO ============
    console.log('\n▶️  TEST: Crear producto');
    await page.click('nav button:has-text("Más")');
    await esperar(700);
    await page.click('.sheet button:has-text("Productos")');
    await esperar(1200);

    await page.fill('input[placeholder="Nombre del producto"]', 'Papa Test');
    await page.fill('input[placeholder="Precio base venta"]', '8');
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
    await page.fill('input[placeholder="Costo por unidad"]', '5');
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
      await cantInput.evaluate((el) => el.blur());
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

    // ============ LIBRO DIARIO ============
    console.log('\n▶️  TEST: Libro diario (partida doble)');
    const libro = await leerDB(page, 'asientos', arr => {
      const porCuenta = {};
      let totalDebe = 0;
      let totalHaber = 0;
      const tipos = {};
      arr.forEach(a => {
        porCuenta[a.cuentaDebe] = (porCuenta[a.cuentaDebe] || 0) + a.monto;
        porCuenta[a.cuentaHaber] = (porCuenta[a.cuentaHaber] || 0) - a.monto;
        totalDebe += a.monto;
        totalHaber += a.monto;
        tipos[a.refTipo] = (tipos[a.refTipo] || 0) + 1;
      });
      return { num: arr.length, porCuenta, totalDebe, totalHaber, tipos };
    });

    // ============ ASIENTOS ============
    console.log('\n▶️  TEST: Verificar libro diario (asientos automaticos)');
    check('Asientos generados > 0', libro.num > 0, 'num=' + libro.num);
    check('Asiento de compra', (libro.tipos.compra || 0) >= 1, JSON.stringify(libro.tipos));
    check('Asiento de venta', (libro.tipos.venta || 0) >= 1);
    check('Asiento de costo', (libro.tipos.costo || 0) >= 1);
    check('Asiento de gasto', (libro.tipos.gasto || 0) >= 1);

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
    console.log('  Esperado: 0 (cap) + $24 (venta) - $50 (compra) - $50 (gasto con espejo movCaja) = -$76');

    const caja = await page.evaluate(async () => {
      const dbReq = indexedDB.open('TiendaProDB');
      return new Promise(resolve => {
        dbReq.onsuccess = () => {
          const db = dbReq.result;
          const tx = db.transaction(['ventas', 'compras', 'gastos', 'capital', 'retiros', 'movCaja', 'config'], 'readonly');
          const out = { ventas: 0, compras: 0, capital: 0, retiros: 0, movCajaNeto: 0, capitalInicial: 0 };
          let pending = 6;
          const done = () => { pending--; if (!pending) resolve(out); };

          tx.objectStore('ventas').getAll().onsuccess = e => { out.ventas = e.target.result.filter(v => !v.anulada).reduce((s, v) => s + (v.total || 0), 0); done(); };
          tx.objectStore('compras').getAll().onsuccess = e => { out.compras = e.target.result.filter(c => !c.anulada).reduce((s, c) => s + (c.total || 0), 0); done(); };
          tx.objectStore('capital').getAll().onsuccess = e => { out.capital = e.target.result.reduce((s, x) => s + (x.monto || 0), 0); done(); };
          tx.objectStore('retiros').getAll().onsuccess = e => { out.retiros = e.target.result.reduce((s, x) => s + (x.monto || 0), 0); done(); };
          // El gasto con saleDeCaja ya descuenta vía su movCaja espejo: NO restarlo aparte (doble conteo)
          tx.objectStore('movCaja').getAll().onsuccess = e => { out.movCajaNeto = e.target.result.reduce((s, x) => s + (x.tipo === 'ingreso' ? x.monto : -x.monto), 0); done(); };
          tx.objectStore('config').get('cfg').onsuccess = e => { out.capitalInicial = e.target.result?.value?.capitalInicial || 0; done(); };
        };
      });
    });

    // Misma fórmula acumulativa que useCajaStore.saldoCaja
    const saldo = caja.capitalInicial + caja.ventas + caja.capital - caja.compras - caja.retiros + caja.movCajaNeto;
    console.log('  Detalle: ' + JSON.stringify(caja));
    check('Saldo en caja = -$76', igual(saldo, -76), 'saldo=$' + saldo);

    check('Libro diario generado', libro.num > 0, 'asientos=' + libro.num);
    check('Libro balanceado (Debe = Haber)', igual(libro.totalDebe, libro.totalHaber),
      'debe=' + libro.totalDebe + ' haber=' + libro.totalHaber);
    check('Cuenta Caja del libro = saldoCaja del sistema', igual(libro.porCuenta['Caja'] || 0, saldo),
      'libro=$' + (libro.porCuenta['Caja'] || 0));

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

    // ============ BALANCE GENERAL ============
    console.log('\n▶️  TEST: Balance general (estado de situacion)');
    const bgActivo = await page.$('text=TOTAL ACTIVO');
    check('Balance general renderizado', bgActivo);
    const bgPatri = await page.$('text=TOTAL PATRIMONIO');
    check('Totales de patrimonio presentes', bgPatri);

    // ============ RESUMEN ============
    console.log('\n═══════════════════════════════════════════');
    console.log(' RESUMEN');
    console.log('═══════════════════════════════════════════');
    const ok = checks.filter(c => c.ok).length;
    const total = checks.length;
    console.log(' Checks: ' + ok + '/' + total);
    const erroresFinales = filtrarTg409(errores, {
      extra409: http409Tg,
      avisar: (n) =>
        console.log('  ⚠️  ' + n + '× 409 del proxy TG perdonado (webhook de tercero re-registrado en el bot; el Worker lo auto-sana)'),
    });
    console.log(' Errores de ejecucion: ' + erroresFinales.length);

    if (erroresFinales.length > 0) {
      console.log('\n--- ERRORES ---');
      erroresFinales.forEach((e, i) => console.log(' ' + (i + 1) + '. ' + e));
    }

    if (ok === total && erroresFinales.length === 0) {
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
      await page.screenshot({ path: 'functional-error.png', fullPage: true });
      console.log('  📷 Screenshot: ./functional-error.png');
    } catch (_) {}
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
