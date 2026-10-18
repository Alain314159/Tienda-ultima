/**
 * Contrato: el APK debe poder hablar con el Worker proxy de Telegram
 * SIN depender de que el Worker desplegado acepte el origen del WebView.
 *
 * Contexto (2026-10-19): el Worker en producción es una versión vieja
 * cuya lista ALLOWED_ORIGINS NO incluye 'https://localhost' (el origen
 * por defecto del WebView de Capacitor con androidScheme https) → toda
 * llamada cross-origin con X-App-Key dispara preflight CORS → 403
 * "Forbidden origin" → los backups de Telegram no se suben desde la
 * app instalada. No hay credenciales de Cloudflare en el entorno de
 * desarrollo para redesplegar el Worker, así que la solución elegida es
 * del LADO DEL CLIENTE y no requiere redespliegue:
 *
 * `plugins.CapacitorHttp.enabled = true` hace que el bridge nativo de
 * Capacitor parchee window.fetch/XMLHttpRequest en Android:
 *   - POST (sendDocument, JSON): request nativo OkHttp — SIN cabecera
 *     Origin y SIN preflight CORS (verificado con curl contra el Worker
 *     desplegado: sin Origin responde 200).
 *   - GET (getUpdates/getMe/getFile/descargas): URL interceptor
 *     `/_capacitor_http_interceptor_?u=` que el WebViewLocalServer
 *     resuelve de forma nativa (mismo origen para el WebView → sin CORS).
 *   - FormData con File (backup .gz): convertFormData → base64 +
 *     fileName → multipart nativo.
 *   - Requests al propio origen (assets) pasan por el fetch original.
 *
 * IMPORTANTE: NO cambiar `server.hostname` — cambiar el hostname cambia
 * el ORIGEN del WebView y reparticiona IndexedDB/localStorage: el dueño
 * perdería TODOS los datos locales de la app instalada (ventas, cierres,
 * configuración). El origen debe seguir siendo https://localhost.
 *
 * En web (PWA/navegador) el parche NO se activa (solo existe
 * androidBridge en nativo): comportamiento web intacto.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const RAIZ = resolve(__dirname, '..');
const capCfg = JSON.parse(readFileSync(resolve(RAIZ, 'capacitor.config.json'), 'utf8'));
const worker = readFileSync(resolve(RAIZ, 'tools', 'worker', 'worker.js'), 'utf8');
const telegram = readFileSync(resolve(RAIZ, 'src', 'telegram.ts'), 'utf8');

describe('APK: CapacitorHttp nativo (backups TG sin CORS, sin perder datos)', () => {
  it('plugins.CapacitorHttp.enabled = true (fetch parcheado en nativo)', () => {
    expect(capCfg.plugins?.CapacitorHttp?.enabled).toBe(true);
  });

  it('server.hostname NO se toca: el origen sigue siendo https://localhost (IndexedDB intacto)', () => {
    // Cambiar el hostname reparticionaría el almacenamiento del WebView
    // y el dueño vería la app "vacía" tras actualizar. Prohibido.
    expect(capCfg.server?.hostname).toBeUndefined();
    expect(capCfg.server?.androidScheme).toBe('https');
  });

  it('la app sube backups con FormData + File (soportado por convertFormData del bridge)', () => {
    // tgSendDocument hace form.append('document', blob, 'backup.json.gz'):
    // con filename, la entrada es un File → base64File nativo.
    expect(telegram).toContain("form.append('document', blob, 'backup.json.gz')");
    expect(telegram).toContain('proxyHeaders()');
  });

  it('el worker del repo TAMBIÉN acepta https://localhost (por si se redespliega)', () => {
    // Doble seguro: si el dueño redespliega el Worker nuevo, el APK
    // funciona tanto con el parche nativo como desde el PWA.
    expect(worker).toContain("'https://localhost'");
  });

  it('X-App-Key sigue gatingando cada llamada (el parche no es puerta abierta)', () => {
    expect(telegram).toContain("'X-App-Key': TG_APP_KEY");
  });
});
