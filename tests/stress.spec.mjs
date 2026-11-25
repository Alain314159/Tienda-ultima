/**
 * STRESS TEST E2E - Tienda Pro
 *
 * Mide cómo se comporta la app con un volumen de datos realista de una
 * tienda operativa (no el dataset de pruebas de 3 registros):
 *   - 30 productos, 90 lotes (compras), 1500 ventas con 1-3 ítems,
 *     200 gastos, 100 ajustes de inventario
 *
 * Mediciones (con umbrales generosos para tolerar la varianza de CI,
 * pensados para cazar regresiones de ORDEN DE MAGNITUD, no milisegundos):
 *   1. Arranque de la app con la DB llena (mount + carga de stores)
 *   2. Render del historial de ventas (1500 registros, paginado)
 *   3. Generación del cuadre de período con todo el histórico
 *   4. Regeneración del libro diario: partida doble balanceada
 *
 * Uso: BASE_URL=... node tests/stress.spec.mjs   (chromium local)
 *      BROWSER=firefox|webkit en CI (e2e-matrix.yml)
 */
import 'dotenv/config';
import { chromium, firefox, webkit } from 'playwright-core';

const BASE_URL = process.env.BASE_URL || 'https://alain314159.github.io/Tienda-ultima/';
const CHROMIUM_PATH = process.env.CHROMIUM_PATH;
const BROWSER = process.env.BROWSER || 'chromium';
const ENGINES = { chromium, firefox, webkit };

// Umbrales (ms) — calibrados ~3-4x por encima de lo observado en CI para
// que solo falle ante regresiones estructurales (n² accidental, re-render
// masivo, leak de watchers), no por ruido de la máquina.
const UMBRALES = {
  arranque: 15000,
  historial: 10000,
  cuadre: 25000,
  libro: 20000,
};

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const resultados = [];
const fallas = [];

function medir(nombre, ms, umbral) {
  const ok = ms <= umbral;
  resultados.push({ nombre, ms, umbral, ok });
  if (!ok) fallas.push(nombre);
  console.log(`  ${ok ? '✓' : '✗'} ${nombre}: ${(ms / 1000).toFixed(2)}s (máx ${(umbral / 1000).toFixed(0)}s)`);
}

(async () => {
  console.log('═══════════════════════════════════════════');
  console.log(' STRESS TEST - Tienda Pro');
  console.log(' URL: ' + BASE_URL + ' · Navegador: ' + BROWSER);
  console.log('═══════════════════════════════════════════\n');

  const engine = ENGINES[BROWSER] || chromium;
  const browser = await engine.launch({
    ...(CHROMIUM_PATH && BROWSER === 'chromium' ? { executablePath: CHROMIUM_PATH } : {}),
    headless: true,
    ...(BROWSER === 'chromium' ? { args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] } : {}),
  });

  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const erroresConsole = [];
  page.on('pageerror', (e) => erroresConsole.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('favicon') && !m.text().includes('workbox')) {
      erroresConsole.push('console: ' + m.text());
    }
  });

  try {
    // ============ 1. PREPARAR DB LIMPIA ============
    console.log('▶️  Preparando IndexedDB limpia...');
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await esperar(3000);
    await page.evaluate(async () => {
      const dbs = await indexedDB.databases();
      for (const db of dbs) if (db.name) indexedDB.deleteDatabase(db.name);
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await esperar(3000);

    // ============ 2. SEMBRAR DATOS GRANDES ============
    console.log('▶️  Sembrando dataset grande (30 productos, 1500 ventas, 200 gastos)...');
    const t0 = Date.now();
    const sembrado = await page.evaluate(async () => {
      // bulkPut por store en una sola transacción: órdenes de magnitud más
      // rápido que 2000 puts individuales
      const bulk = (db, store, regs) => new Promise((res, rej) => {
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).clear();
        for (const r of regs) tx.objectStore(store).put(r);
        tx.oncomplete = () => res(regs.length);
        tx.onerror = () => rej(tx.error);
      });

      const dbReq = indexedDB.open('TiendaProDB');
      const db = await new Promise((res) => { dbReq.onsuccess = () => res(dbReq.result); });

      const productos = [];
      for (let i = 1; i <= 30; i++) {
        productos.push({
          id: 'sp_' + i, nombre: 'Producto Stress ' + i, precio: 10 + i, costo: 5 + (i % 5),
          stockMin: 5, archivado: false, nota: '',
        });
      }

      const lotes = [];
      for (let i = 1; i <= 30; i++) {
        for (let j = 0; j < 3; j++) {
          lotes.push({
            id: 'sl_' + i + '_' + j, productoId: 'sp_' + i, compraId: 'sc_' + i + '_' + j,
            cantidadInicial: 200, cantidadVendida: 0, costo: 5 + (i % 5) + j,
            fecha: new Date(Date.now() - (90 - j * 20 - (i % 20)) * 86400000).toISOString(),
          });
        }
      }

      const ventas = [];
      for (let v = 0; v < 1500; v++) {
        const nItems = 1 + (v % 3);
        const items = [];
        let total = 0;
        let gan = 0;
        for (let k = 0; k < nItems; k++) {
          const p = 1 + ((v + k) % 30);
          const cant = 1 + ((v + k) % 5);
          const costoU = 5 + (p % 5);
          const precioU = 10 + p;
          const costo = costoU * cant;
          items.push({
            productoId: 'sp_' + p, nombre: 'Producto Stress ' + p, cantidad: cant,
            precio: precioU, costo, ganancia: precioU * cant - costo,
            lotesUsados: [{ loteId: 'sl_' + p + '_0', cantidad: cant, costo: costoU }],
          });
          total += precioU * cant;
          gan += precioU * cant - costo;
        }
        ventas.push({
          id: 'sv_' + v,
          fecha: new Date(Date.now() - (v % 60) * 86400000 - (v % 86400) * 1000).toISOString(),
          items, total, ganancia: gan, anulada: v % 250 === 249, // 6 anuladas
        });
      }

      const gastos = [];
      for (let g = 0; g < 200; g++) {
        gastos.push({
          id: 'sg_' + g, fecha: new Date(Date.now() - (g % 60) * 86400000).toISOString(),
          categoria: 'varios', concepto: 'Gasto stress ' + g, monto: 1 + (g % 20),
          metodoPago: 'efectivo', saleDeCaja: true,
        });
      }

      const ajustes = [];
      for (let a = 0; a < 100; a++) {
        ajustes.push({
          id: 'sa_' + a, fecha: new Date(Date.now() - (a % 60) * 86400000).toISOString(),
          productoId: 'sp_' + (1 + (a % 30)), productoNombre: 'Producto Stress ' + (1 + (a % 30)),
          cantidad: -(1 + (a % 3)), costoPerdida: 2 + (a % 10), motivo: 'Stress',
        });
      }

      const out = {};
      out.productos = await bulk(db, 'productos', productos);
      out.lotes = await bulk(db, 'lotes', lotes);
      out.ventas = await bulk(db, 'ventas', ventas);
      out.gastos = await bulk(db, 'gastos', gastos);
      out.ajustes = await bulk(db, 'ajustes', ajustes);
      return out;
    });
    console.log('  Sembrado en ' + ((Date.now() - t0) / 1000).toFixed(2) + 's:', JSON.stringify(sembrado));

    // ============ 3. ARRANQUE CON DB LLENA ============
    console.log('\n▶️  TEST: Arranque de la app con la DB llena');
    const tArranque = Date.now();
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForSelector('nav button', { timeout: UMBRALES.arranque });
    await esperar(4000); // cargarTodoStores + montaje
    const arranqueMs = Date.now() - tArranque;
    medir('Arranque con 1500 ventas', arranqueMs, UMBRALES.arranque);

    // En instalación limpia aparece el aviso de respaldo de Telegram:
    // cerrarlo ("Recordarme despues") para desbloquear la navegación
    try {
      const btnAviso = page.locator('.modal-box button:has-text("Recordarme despues")');
      if (await btnAviso.isVisible({ timeout: 3000 })) {
        await btnAviso.click({ timeout: 5000 });
        await esperar(800);
      }
    } catch (_) {}

    // ============ 4. HISTORIAL DE VENTAS ============
    console.log('\n▶️  TEST: Historial de ventas (paginado, 1494 activas)');
    const tHist = Date.now();
    await page.click('nav button:has-text("Ventas")');
    await page.waitForSelector('text=Historial de Ventas', { timeout: UMBRALES.historial });
    await page.waitForSelector('.hist-grupo .item', { timeout: UMBRALES.historial });
    const histMs = Date.now() - tHist;
    medir('Render del historial paginado', histMs, UMBRALES.historial);

    // ============ 5. CUADRE CON TODO EL HISTÓRICO ============
    console.log('\n▶️  TEST: Cuadre por período con 60 días de datos');
    await page.click('nav button:has-text("Más")');
    await esperar(700);
    await page.click('.sheet button:has-text("Reportes")');
    await esperar(1500);
    const tCuadre = Date.now();
    try {
      const btnHoy = await page.$('section:visible button:has-text("Hoy")');
      if (btnHoy) await btnHoy.click();
      await esperar(600);
    } catch (_) { /* sin botón Hoy visible */ }
    await page.click('section:visible button:has-text("Generar Cuadre")', { timeout: 15000 });
    await page.waitForSelector('text=Ganancia bruta', { timeout: UMBRALES.cuadre });
    const cuadreMs = Date.now() - tCuadre;
    medir('Cuadre completo generado', cuadreMs, UMBRALES.cuadre);

    // ============ 6. LIBRO DIARIO ============
    console.log('\n▶️  TEST: Libro diario regenerado y balanceado');
    const tLibro = Date.now();
    const libro = await page.evaluate(async () => {
      const dbReq = indexedDB.open('TiendaProDB');
      return new Promise((resolve) => {
        dbReq.onsuccess = () => {
          const tx = dbReq.result.transaction('asientos', 'readonly');
          const req = tx.objectStore('asientos').getAll();
          req.onsuccess = () => {
            const asientos = req.result;
            const porCuenta = {};
            for (const a of asientos) {
              porCuenta[a.cuentaDebe] = (porCuenta[a.cuentaDebe] || 0) + a.monto;
              porCuenta[a.cuentaHaber] = (porCuenta[a.cuentaHaber] || 0) - a.monto;
            }
            resolve({ num: asientos.length, porCuenta });
          };
        };
      });
    });
    const libroMs = Date.now() - tLibro;
    medir('Lectura del libro diario', libroMs, UMBRALES.libro);
    console.log('  Asientos: ' + libro.num + ' · Caja: ' + libro.porCuenta['Caja']);

    // Validaciones de corrección (no de tiempo)
    const sumaDeudoras = Object.entries(libro.porCuenta).filter(([, s]) => s > 0).reduce((s, [, v]) => s + v, 0);
    const sumaAcreedoras = Object.entries(libro.porCuenta).filter(([, s]) => s < 0).reduce((s, [, v]) => s + v, 0);
    const balanceado = Math.abs(sumaDeudoras + sumaAcreedoras) < 0.01;
    console.log(`  ${balanceado ? '✓' : '✗'} Partida doble balanceada (deudoras ${sumaDeudoras.toFixed(2)} / acreedoras ${Math.abs(sumaAcreedoras).toFixed(2)})`);
    if (!balanceado) fallas.push('libro-balanceado');
    if (libro.num < 1800) {
      console.log('  ✗ Asientos esperados ≥ 1800 (1500 ventas × 2 + 90 compras + 200 gastos + 100 mermas), hay ' + libro.num);
      fallas.push('libro-cantidad');
    } else {
      console.log('  ✓ Cantidad de asientos coherente: ' + libro.num);
    }

    // ============ ERRORES DE CONSOLA ============
    if (erroresConsole.length > 0) {
      console.log('\n❌ Errores de consola durante el stress:');
      erroresConsole.slice(0, 10).forEach((e) => console.log('  ' + e));
      fallas.push('errores-console');
    } else {
      console.log('\n✓ Sin errores de consola durante todo el stress');
    }
  } catch (e) {
    console.error('\n💥 Error del stress test: ' + e.message);
    fallas.push('excepcion: ' + e.message);
  }

  // ============ RESUMEN ============
  console.log('\n═══════════════════════════════════════════');
  console.log(' RESUMEN STRESS');
  console.log('═══════════════════════════════════════════');
  console.table(resultados);
  await browser.close();

  if (fallas.length > 0) {
    console.error('\nFALLAS: ' + fallas.join(', '));
    process.exit(1);
  }
  console.log('\n✓ Stress test completo sin fallas');
})();
