/**
 * Contratos del Worker proxy de Telegram (bug del dueño 2026-10-17:
 * "el backups de Telegram no se suben").
 *
 * Causa raíz: el Worker en producción NO permite el origen del APK.
 * El WebView de Capacitor sirve la app desde https://localhost
 * (androidScheme https) y toda llamada cross-origin con X-App-Key dispara
 * preflight CORS → 403 "Forbidden origin" → sendDocument NUNCA llega a
 * ejecutarse desde la app instalada. (El PWA/navegador sí funcionaba por
 * estar alain314159.github.io en la lista).
 *
 * Estos tests fijan el contrato del CÓDIGO que hay que desplegar: el
 * worker.js del repo Y la copia embebida en deploy-v3.mjs (el script que
 * realmente sube el Worker) deben permitir los orígenes nativos. Si se
 * desincronizan, el despliegue sube una versión vieja y el bug vuelve.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const RAIZ = resolve(__dirname, '..');
const worker = readFileSync(resolve(RAIZ, 'tools', 'worker', 'worker.js'), 'utf8');
const deploy = readFileSync(resolve(RAIZ, 'tools', 'worker', 'deploy-v3.mjs'), 'utf8');
const telegram = readFileSync(resolve(RAIZ, 'src', 'telegram.ts'), 'utf8');

const ORIGENES_NATIVE = ['https://localhost', 'capacitor://localhost'];

describe('Worker proxy: orígenes del APK permitidos (CORS)', () => {
  for (const origen of ORIGENES_NATIVE) {
    it(`worker.js permite el origen nativo ${origen}`, () => {
      expect(worker).toContain(`'${origen}'`);
    });
    it(`deploy-v3.mjs (copia desplegada) también permite ${origen}`, () => {
      expect(deploy).toContain(`'${origen}'`);
    });
  }

  it('los orígenes web históricos siguen permitidos (PWA + dev)', () => {
    for (const o of ['https://alain314159.github.io', 'http://localhost:5173', 'http://localhost:4173']) {
      expect(worker).toContain(`'${o}'`);
      expect(deploy).toContain(`'${o}'`);
    }
  });

  it('la app sigue mandando X-App-Key en TODAS las rutas (el gate real de seguridad)', () => {
    // proxyHeaders() es la única puerta de salida: si el gate se quitara,
    // permitir orígenes localhost abriría el proxy a cualquiera.
    expect(telegram).toContain("'X-App-Key': TG_APP_KEY");
  });

  it('sendDocument del worker reenvía el documento a Telegram con el nombre prefijado', () => {
    // El contrato de la subida: renombra a tienda-backup-<nombre>-... para
    // que listBackups pueda filtrar por tienda (multi-tenant).
    expect(worker).toContain('/api/tg/sendDocument');
    expect(worker).toContain("tienda-backup-' + nombre + '-'");
  });
});
