/**
 * Watchdog para operaciones asíncronas: rechaza si una promesa
 * tarda más de `timeoutMs` en resolverse.
 */
export function conWatchdog<T>(nombre: string, promesa: Promise<T>, timeoutMs = 15000) {
  const t0 = performance.now();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(
        new Error('Operacion "' + nombre + '" tardo mas de ' + timeoutMs / 1000 + 's. Puede haber quedado a medias.')
      );
    }, timeoutMs);
  });
  return Promise.race([promesa, timeout]).finally(() => {
    clearTimeout(timeoutId);
    const ms = Number((performance.now() - t0).toFixed(0));
    if (ms > 3000) console.warn('Watchdog: ' + nombre + ' tardo ' + ms + 'ms');
  });
}
