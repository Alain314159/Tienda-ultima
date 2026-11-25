/**
 * Dispatcher de recarga selectiva de stores por nombre de tabla.
 * Orquesta la sincronización stores ↔ IndexedDB tras operaciones
 * de escritura, sin acoplar a un componente concreto.
 */
import { useVentasStore } from './useVentasStore';
import { useLotesStore } from './useLotesStore';
import { useComprasStore } from './useComprasStore';
import { useProductosStore } from './useProductosStore';
import { useAjustesStore } from './useAjustesStore';
import { useCajaStore } from './useCajaStore';
import { useCapitalStore } from './useCapitalStore';
import { useGastosStore } from './useGastosStore';
import { useCierresStore } from './useCierresStore';
import { regenerarAsientos } from '../services/libroDiario';

/**
 * Recarga solo los stores cuyas tablas cambiaron.
 * @param {...string} tables nombres de tabla: ventas, lotes, compras, productos,
 *   ajustes, cierres, capital, socios, distribuciones, retiros, gastos, movCaja, arqueos
 */
export async function recargarStores(...tables: string[]) {
  const map: Record<string, () => Promise<void>> = {
    ventas: () => useVentasStore().cargarVentas(),
    lotes: () => useLotesStore().cargarLotes(),
    compras: () => useComprasStore().cargarCompras(),
    productos: () => useProductosStore().cargarProductos(),
    ajustes: () => useAjustesStore().cargarAjustes(),
    cierres: () => useCierresStore().cargarCierres(),
    capital: () => useCapitalStore().cargarCapital(),
    socios: () => useCapitalStore().cargarSocios(),
    distribuciones: () => useCapitalStore().cargarDistribuciones(),
    retiros: () => useCapitalStore().cargarRetiros(),
    gastos: () => useGastosStore().cargarGastos(),
    movCaja: () => useCajaStore().cargarMovCaja(),
    arqueos: () => useCajaStore().cargarArqueos(),
    // El libro diario se reconstruye completo desde las tablas fuente
    asientos: () => regenerarAsientos().then(() => undefined),
  };
  await Promise.all(tables.filter((t) => map[t]).map((t) => map[t]()));
}

/** Recarga todos los stores de datos. */
export function recargarTodoStores() {
  return recargarStores(
    'ventas',
    'lotes',
    'compras',
    'productos',
    'ajustes',
    'cierres',
    'capital',
    'socios',
    'distribuciones',
    'retiros',
    'gastos',
    'movCaja',
    'arqueos',
    'asientos'
  );
}

/** Carga inicial de todos los stores (incluye cfg). */
export async function cargarTodoStores() {
  const { useConfigStore } = await import('./useConfigStore.js');
  await Promise.all([
    useConfigStore().cargarCfg(),
    useLotesStore().cargarLotes(),
    useVentasStore().cargarVentas(),
    useComprasStore().cargarCompras(),
    useAjustesStore().cargarAjustes(),
    useCajaStore().cargarTodo(),
    useCapitalStore().cargarTodo(),
    useGastosStore().cargarGastos(),
    useCierresStore().cargarTodo(),
    useProductosStore().cargarProductos(),
  ]);
}
