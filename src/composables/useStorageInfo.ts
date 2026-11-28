/**
 * Composable de información de almacenamiento: persistencia
 * otorgada por el navegador y estimación de uso/cuota.
 */
import { ref, computed } from 'vue';
import { useVentasStore } from '../stores/useVentasStore';
import { useComprasStore } from '../stores/useComprasStore';
import { useProductosStore } from '../stores/useProductosStore';
import { Log } from '../services/logger';
import { TOAST } from '../constants';
import { toastMsg } from '../utils/toast';

/** A partir de este uso se avisa (1.5): antes solo cambiaba un color en Ajustes. */
export const UMBRAL_ESPACIO_AVISO_PCT = 80;
/** A partir de aquí el aviso es urgente: las escrituras están a punto de fallar. */
export const UMBRAL_ESPACIO_CRITICO_PCT = 90;
const CLAVE_AVISO_ESPACIO = 'avisoEspacioFecha';

export function useStorageInfo() {
  const ventasStore = useVentasStore();
  const comprasStore = useComprasStore();
  const productosStore = useProductosStore();

  const storagePersistente = ref(false);
  const storageInfo = ref({ uso: 0, cuota: 0, porcentaje: 0 });

  async function pedirPersistenciaStorage() {
    try {
      if (!navigator.storage || !navigator.storage.persist) {
        console.warn('storage.persist no soportado');
        return false;
      }
      const ya = await navigator.storage.persisted();
      if (ya) {
        storagePersistente.value = true;
        console.log('Storage ya es persistente');
        return true;
      }
      // Solo pedir si el usuario ya tiene datos (evita pedirlo en primera visita)
      if (ventasStore.ventas.length + comprasStore.compras.length + productosStore.productos.length < 3) {
        console.log('Poco contenido, se pedira persistencia mas tarde');
        return false;
      }
      const ok = await navigator.storage.persist();
      storagePersistente.value = ok;
      if (ok) console.log('✅ Persistencia de storage concedida');
      else console.warn('⚠ Persistencia denegada por el navegador');
      return ok;
    } catch (e) {
      console.error('pedirPersistenciaStorage', e);
      return false;
    }
  }

  async function actualizarInfoStorage() {
    try {
      if (navigator.storage && navigator.storage.estimate) {
        const est = await navigator.storage.estimate();
        storageInfo.value = {
          uso: est.usage ?? 0,
          cuota: est.quota ?? 0,
          porcentaje: est.quota ? Number((((est.usage ?? 0) / est.quota) * 100).toFixed(2)) : 0,
        };
      }
      if (navigator.storage && navigator.storage.persisted) {
        storagePersistente.value = await navigator.storage.persisted();
      }
    } catch (e) {
      console.error('actualizarInfoStorage', e);
    }
  }

  function fmtBytes(b: number) {
    if (!b) return '0 B';
    const u = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let v = b;
    while (v >= 1024 && i < u.length - 1) {
      v /= 1024;
      i++;
    }
    return v.toFixed(i === 0 ? 0 : 1) + ' ' + u[i];
  }

  const storageClase = computed(() => {
    if (storageInfo.value.porcentaje >= 80) return 'bad';
    if (storageInfo.value.porcentaje >= 50) return 'warn';
    return 'ok';
  });

  /**
   * Avisa antes de que sea tarde (1.5): si el almacenamiento está al 80% o
   * más, toast claro («queda poco espacio, exporta un respaldo»). Como
   * mucho una vez al día, para no molestar cada vez que se abre la app.
   * Devuelve true si hay poco espacio (haya avisado o no).
   */
  async function avisarSiPocoEspacio(): Promise<boolean> {
    await actualizarInfoStorage();
    const pct = storageInfo.value.porcentaje;
    if (!storageInfo.value.cuota || pct < UMBRAL_ESPACIO_AVISO_PCT) return false;
    const hoy = new Date().toISOString().slice(0, 10);
    try {
      if (localStorage.getItem(CLAVE_AVISO_ESPACIO) === hoy) return true;
    } catch (e) {
      Log.warn('useStorageInfo: no se pudo leer la fecha del último aviso de espacio', e);
    }
    try {
      localStorage.setItem(CLAVE_AVISO_ESPACIO, hoy);
    } catch (e) {
      Log.warn('useStorageInfo: no se pudo guardar la fecha del aviso de espacio', e);
    }
    try {
      if (pct >= UMBRAL_ESPACIO_CRITICO_PCT) {
        toastMsg(
          'Queda muy poco espacio en el teléfono (' + pct + '% usado). Exporta un respaldo y libera espacio: las ventas pueden dejar de guardarse.',
          TOAST.BAD
        );
      } else {
        toastMsg(
          'El almacenamiento está al ' + pct + '%. Exporta un respaldo por si acaso.',
          TOAST.WARN
        );
      }
    } catch (e) {
      Log.warn('useStorageInfo: no se pudo mostrar el aviso de poco espacio', e);
    }
    return true;
  }

  return {
    storagePersistente,
    storageInfo,
    pedirPersistenciaStorage,
    actualizarInfoStorage,
    avisarSiPocoEspacio,
    fmtBytes,
    storageClase,
  };
}
