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

/**
 * Watchdog con verificación posterior: como el `Promise.race` de
 * `conWatchdog`, pero al expirar el timeout NO da la operación por
 * perdida sin más: primero llama a `verificarGuardado()` (por ejemplo,
 * buscar la venta por su id en la BD). Si la operación sí se guardó,
 * resuelve como éxito para que el usuario no vuelva a cobrarla; si no
 * se guardó, rechaza con el error de timeout habitual.
 *
 * La transacción Dexie sigue corriendo tras el timeout y puede terminar
 * guardándose: sin esta comprobación el usuario veía «puede haber quedado
 * a medias» y cobraba la misma venta dos veces (MEJORAS 1.3).
 *
 * Resuelve `undefined` cuando la operación se confirmó por verificación
 * (no hay valor que devolver: la promesa original nunca resolvió a
 * tiempo). Un rechazo tardío de la promesa original se traga aquí para
 * no dejar un rechazo sin manejar.
 */
export function conWatchdogVerificado<T>(
  nombre: string,
  promesa: Promise<T>,
  verificarGuardado: () => Promise<boolean>,
  timeoutMs = 15000
): Promise<T | undefined> {
  promesa.catch(() => {});
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<undefined>((resolve, reject) => {
    timeoutId = setTimeout(() => {
      void verificarGuardado()
        .then((guardado) => {
          if (guardado) {
            console.warn('Watchdog: ' + nombre + ' tardo mas de ' + timeoutMs / 1000 + 's pero se confirmó guardada.');
            resolve(undefined);
          } else {
            reject(
              new Error(
                'Operacion "' + nombre + '" tardo mas de ' + timeoutMs / 1000 + 's. Puede haber quedado a medias.'
              )
            );
          }
        })
        .catch(() => {
          reject(
            new Error(
              'Operacion "' + nombre + '" tardo mas de ' + timeoutMs / 1000 + 's. Puede haber quedado a medias.'
            )
          );
        });
    }, timeoutMs);
  });
  return Promise.race([promesa, timeout]).finally(() => {
    clearTimeout(timeoutId);
  });
}
