/**
 * Prueba de punta a punta del enlace por WiFi directo, en Chromium real.
 *
 * Abre dos "dispositivos" en la misma página, los conecta con WebRTC pasando
 * los códigos por QR de verdad (dibujados y leídos), sincroniza dos veces y
 * comprueba el resultado. No forma parte de la suite de cobertura: necesita el
 * Chromium de playwright y arranca un servidor de desarrollo.
 *
 * Es la única prueba que usa WebRTC de verdad (las de unidad usan un canal
 * simulado): aquí se vieron los tres fallos que impedían unirse a un enlace.
 *
 * Uso: npm run test:enlace            (con CHROMIUM_PATH se exige que arranque)
 */
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const server = await createServer({
  logLevel: 'error',
  server: { port: 5199, host: '127.0.0.1', strictPort: false },
  optimizeDeps: { include: ['qrcode', 'jsqr'] },
});
await server.listen();
const base = server.resolvedUrls.local[0];
let browser;
try {
  // Igual que smoke y functional: CHROMIUM_PATH apunta a un Chromium ya
  // instalado; sin él se usa el Chromium completo de playwright.
  browser = await chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: 'chromium' }),
    args: ['--allow-loopback-in-webrtc', '--disable-features=WebRtcHideLocalIpsWithMdns'],
  });
} catch (e) {
  const primera = String(e?.message ?? e).split('\n')[0];
  if (process.env.CHROMIUM_PATH) {
    console.log(`FALLA no se pudo iniciar el Chromium de CHROMIUM_PATH: ${primera}`);
    await server.close();
    process.exit(1);
  }
  console.log('SALTO: no se pudo iniciar Chromium (npx playwright-core install chromium).', primera);
  await server.close();
  process.exit(0);
}

const fallas = [];
const comprobar = (nombre, ok, detalle = '') => {
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${nombre}${detalle ? ` (${detalle})` : ''}`);
  if (!ok) fallas.push(nombre);
};

try {
  const page = await browser.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push(String(e)));
  await page.goto(`${base}tests/fixtures/sync-enlace.html`);
  await page.waitForFunction(() => Boolean(window.syncPrueba), null, { timeout: 30000 });

  const r = await page.evaluate(async () => {
    const S = window.syncPrueba;
    const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
    const A = new S.TiendaProDB('EnlaceRealA');
    const B = new S.TiendaProDB('EnlaceRealB');
    const ctxA = { db: A, seg: S.instalarSeguimiento(A, { dispositivo: 'dev_real_a' }) };
    const ctxB = { db: B, seg: S.instalarSeguimiento(B, { dispositivo: 'dev_real_b' }) };
    /** Direcciones de red que lleva un código: sin ellas los teléfonos no se encuentran. */
    const direcciones = (enlace) =>
      (enlace.pc.localDescription?.sdp ?? '').split('\r\n').filter((l) => l.startsWith('a=candidate')).length;
    try {
      await A.productos.bulkPut(Array.from({ length: 120 }, (_, i) => ({ id: 'p' + i, nombre: 'Producto ' + i, precio: i })));
      await B.productos.put({ id: 'solo_b', nombre: 'Solo en B' });

      // Como en la pantalla: B escanea la oferta, muestra su respuesta y se queda
      // esperando; solo después A escanea esa respuesta.
      const oferta = await S.crearOferta();
      const ofertaLeida = await S.porQr(oferta.codigo);
      const respuesta = await S.aceptarOferta(ofertaLeida);
      const respuestaLeida = await S.porQr(respuesta.codigo);
      const sesionB = S.sincronizarPorCanal(ctxB, respuesta.canal);
      sesionB.catch(() => undefined);
      await dormir(1500);
      await S.aceptarRespuesta(oferta, respuestaLeida);
      const r1a = await S.sincronizarPorCanal(ctxA, oferta.canal);
      const r1b = await sesionB;

      await B.productos.update('p3', { nombre: 'Cambiado en B' });
      await B.productos.put({ id: 'nuevo_b', nombre: 'Nuevo en B' });
      const o2 = await S.crearOferta();
      const r2 = await S.aceptarOferta(o2.codigo);
      await S.aceptarRespuesta(o2, r2.codigo);
      const [r2a, r2b] = await Promise.all([
        S.sincronizarPorCanal(ctxA, o2.canal),
        S.sincronizarPorCanal(ctxB, r2.canal),
      ]);

      return {
        ofertaLeida: ofertaLeida === oferta.codigo,
        respuestaLeida: respuestaLeida === respuesta.codigo,
        tamanoOferta: oferta.codigo.length,
        tamanoRespuesta: respuesta.codigo.length,
        direccionesOferta: direcciones(oferta),
        direccionesRespuesta: direcciones(respuesta),
        r1a,
        r1b,
        r2a,
        r2b,
        totalA: await A.productos.count(),
        totalB: await B.productos.count(),
        cambiado: (await A.productos.get('p3'))?.nombre,
        nuevo: Boolean(await A.productos.get('nuevo_b')),
      };
    } finally {
      await A.delete();
      await B.delete();
    }
  });

  comprobar('el QR de la oferta se lee igual', r.ofertaLeida, `${r.tamanoOferta} caracteres`);
  comprobar('el QR de la respuesta se lee igual', r.respuestaLeida, `${r.tamanoRespuesta} caracteres`);
  comprobar('los dos códigos caben en un QR', r.tamanoOferta < 4296 && r.tamanoRespuesta < 4296);
  comprobar('la oferta lleva la dirección del teléfono', r.direccionesOferta >= 1, `${r.direccionesOferta} direcciones`);
  comprobar('la respuesta lleva la dirección del teléfono', r.direccionesRespuesta >= 1, `${r.direccionesRespuesta} direcciones`);
  comprobar('el que se une recibe estando ya a la espera', r.r1b.aplicados === 120, `aplicados ${r.r1b.aplicados}`);
  comprobar('el que crea recibe la fila del otro', r.r1a.aplicados === 1, `aplicados ${r.r1a.aplicados}`);
  // 120 de A + «Solo en B» + «Nuevo en B» (creado antes del segundo enlace).
  comprobar('los dos quedan con los mismos 122 productos', r.totalA === 122 && r.totalB === 122, `${r.totalA}/${r.totalB}`);
  // B editó una fila y creó otra: eso y solo eso viaja; A no tenía nada nuevo.
  comprobar(
    'el segundo enlace solo envia lo nuevo',
    r.r2b.enviado === 2 && r.r2a.enviado === 0 && r.r2a.aplicados === 2,
    `B envia ${r.r2b.enviado}, A envia ${r.r2a.enviado}`
  );
  comprobar('el que crea recibe la edicion y la fila nueva del otro', r.cambiado === 'Cambiado en B' && r.nuevo);
  comprobar('sin errores en la pagina', errores.length === 0, errores.join(' | ').slice(0, 300));
} catch (e) {
  fallas.push('excepcion');
  console.log('FALLA excepcion:', e?.message ?? e);
} finally {
  await browser.close();
  await server.close();
}

console.log(fallas.length ? `RESULTADO: ${fallas.length} falha(s): ${fallas.join(', ')}` : 'RESULTADO: todo OK');
process.exit(fallas.length ? 1 : 0);
