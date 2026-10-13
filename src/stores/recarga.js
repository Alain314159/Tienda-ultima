/**
 * Dispatcher de recarga selectiva de stores por nombre de tabla.
 * Orquesta la sincronización stores ↔ IndexedDB tras operaciones
 * de escritura, sin acoplar a un componente concreto.
 */
import { useVentasStore } from './useVentasStore.js';
import { useLotesStore } from './useLotesStore.js';
import { useComprasStore } from './useComprasStore.js';
import { useProductosStore } from './useProductosStore.js';
import { useAjustesStore } from './useAjustesStore.js';
import { useCajaStore } from './useCajaStore.js';
import { useCapitalStore } from './useCapitalStore.js';
import { useGastosStore } from './useGastosStore.js';
import { useCierresStore } from './useCierresStore.js';

/**
 * Recarga solo los stores cuyas tablas cambiaron.
 * @param {...string} tables nombres de tabla: ventas, lotes, compras, productos,
 *   ajustes, cierres, capital, socios, distribuciones, retiros, gastos, movCaja, arqueos
 */
export async function recargarStores(...tables) {
  const map = {
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
    asientos: () => Promise.resolve(),
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
    'arqueos'
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
