/**
 * Composable de información de almacenamiento: persistencia
 * otorgada por el navegador y estimación de uso/cuota.
 */
import { ref, computed } from 'vue';
import { useVentasStore } from '../stores/useVentasStore';
import { useComprasStore } from '../stores/useComprasStore';
import { useProductosStore } from '../stores/useProductosStore';

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

  return { storagePersistente, storageInfo, pedirPersistenciaStorage, actualizarInfoStorage, fmtBytes, storageClase };
}
