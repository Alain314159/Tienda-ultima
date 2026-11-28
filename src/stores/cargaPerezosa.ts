/**
 * Carga perezosa por tabla (4.8).
 *
 * Cada store de datos expone, por cada tabla que lee con `toArray()`:
 * - `cargado`: ref que indica si la tabla ya está en memoria.
 * - `asegurarX()`: carga la tabla SOLO si aún no está cargada; las
 *   llamadas concurrentes comparten la misma promesa (un solo `toArray()`).
 * - `cargarX()`: recarga forzada, como antes (la usan las escrituras y la
 *   sync para refrescar tras un cambio); marca la tabla como cargada.
 *
 * La carga que falla NO marca la tabla como cargada (los `cargarX` tragan
 * el error y no llaman a `marcarCargado()`), así que el próximo
 * `asegurarX()` lo reintenta en vez de dejar la vista vacía para siempre.
 */
import { ref, type Ref } from 'vue';

export interface CargaPerezosa {
  cargado: Ref<boolean>;
  asegurar: () => Promise<void>;
  marcarCargado: () => void;
}

export function crearCargaPerezosa(cargar: () => Promise<void>): CargaPerezosa {
  const cargado = ref(false);
  let enCurso: Promise<void> | null = null;

  async function asegurar(): Promise<void> {
    if (cargado.value) return;
    if (!enCurso) enCurso = cargar().finally(() => {
      enCurso = null;
    });
    await enCurso;
  }

  function marcarCargado(): void {
    cargado.value = true;
  }

  return { cargado, asegurar, marcarCargado };
}
