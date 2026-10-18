/**
 * Excepción AMBIENTAL estrecha: 409 del proxy de Telegram.
 *
 * Un servicio de terceros (tele.goldenherd.com) pelea este bot
 * re-registrando un webhook que rompe getUpdates ("can't use getUpdates
 * while webhook is active"). El Worker lo auto-sana (deleteWebhook +
 * retry — ver tools/worker), pero hasta su redespliegue puede colarse
 * un 409 puntual que Chromium reporta como console.error
 * ("Failed to load resource: the server responded with a status of 409").
 *
 * Compartido por smoke.spec.mjs y functional.spec.mjs para que la
 * tolerancia NO se desincronice entre suites (lección de worker.js vs
 * deploy-v3.mjs). NO AMPLIAR: el 401 (secret sin heredar) que este gate
 * cazó el 2026-10-16 sigue siendo FATAL, igual que cualquier otro
 * 4xx/5xx, console.error o pageerror.
 *
 * Contrato:
 * - Un console.error solo se perdona si HUBO un 409 real del proxy
 *   (objeto http-409 en la lista —smoke— o contador extra409 —functional—).
 * - Se perdonan como máximo tantos console.error como 409 reales hubo.
 * - Los http-409 del proxy se retiran de la lista (son el mismo evento).
 */

export const esConsola409 = (texto) => /status of 409/.test(String(texto));

export const esHttp409Tg = (e) =>
  !!e && typeof e === 'object' && e.tipo === 'http-409' && String(e.texto).includes('tienda-proxy');

/**
 * Filtra la lista de errores perdonando únicamente los 409 del proxy TG.
 * Acepta listas mixtas:
 * - objetos {tipo, texto} (smoke: http-* y console.error)
 * - strings (functional: 'console.error: ...', 'P12: ...', 'pageerror: ...')
 * `extra409`: 409s reales del proxy contados por fuera (functional usa un
 * listener de respuestas y no mete los http-* en la lista).
 * `avisar(n)`: callback opcional para loguear/registrar el warning.
 * Devuelve la lista filtrada (nueva).
 */
export function filtrarTg409(errores, { extra409 = 0, avisar } = {}) {
  const tg409 = errores.filter(esHttp409Tg).length + extra409;
  if (!tg409) return errores;
  let perdonados = 0;
  const resto = errores.filter((e) => {
    if (esHttp409Tg(e)) return false;
    const texto = typeof e === 'string' ? e : e.texto;
    if (esConsola409(texto) && perdonados < tg409) {
      perdonados++;
      return false;
    }
    return true;
  });
  if (avisar) avisar(tg409);
  return resto;
}
