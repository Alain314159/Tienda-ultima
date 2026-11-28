/**
 * Dispatcher de recarga selectiva de stores por nombre de tabla.
 * Orquesta la sincronización stores ↔ IndexedDB tras operaciones
 * de escritura, sin acoplar a un componente concreto.
 *
 * Carga perezosa (4.8): hay dos conjuntos distintos y no deben confundirse.
 *
 * - ARRANQUE (`cargarInicioStores`): solo lo que el Dashboard necesita para
 *   sus totales, que se calculan sobre el historial completo en memoria:
 *   config, productos, lotes, ventas, compras, ajustes, gastos, movCaja,
 *   capital, retiros, socios y cierres. El saldo de caja es acumulativo
 *   (ventas/compras de todo el histórico), la ganancia disponible suma los
 *   cierres + la ganancia neta del período (ventas − gastos − mermas) y el
 *   stock/alertas leen productos + lotes: sin esas tablas el Dashboard
 *   mostraría ceros. Hacer perezosas ESTAS tablas exigiría reescribir los
 *   getters como agregados Dexie en vez de `toArray()` + reduce, y queda
 *   fuera de esta oleada (ver docs/MEJORAS-PENDIENTES.md 4.8).
 * - DIFERIDO: `arqueos` (solo Reportes y el aviso de arqueo) y
 *   `distribuciones` (solo SociosView) NO se cargan al arrancar: cada vista
 *   las asegura con `asegurarStores()` al entrar, y `datosDeStores()` las
 *   asegura antes de fotografiar (un respaldo con `[]` las borraría al
 *   restaurar: la importación hace `clear()` + `bulkPut()` por tabla).
 *   `asientos` tampoco se carga al arrancar: ReportesView ya lo leía en su
 *   `onMounted`, y sigue igual.
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
import { useConfigStore } from './useConfigStore';
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

/**
 * Asegura que las tablas indicadas estén cargadas, sin recargar las que
 * ya lo están. Es la vía de carga bajo demanda: cada vista asegura sus
 * tablas al entrar (`onMounted`) y el arranque asegura solo su conjunto.
 * A diferencia de `recargarStores`, llamar dos veces seguidas no re-lee
 * la BD: la segunda es un no-op (y las llamadas concurrentes comparten
 * la misma promesa).
 */
export async function asegurarStores(...tables: string[]) {
  const map: Record<string, () => Promise<void>> = {
    cfg: () => useConfigStore().asegurarCfg(),
    ventas: () => useVentasStore().asegurarVentas(),
    lotes: () => useLotesStore().asegurarLotes(),
    compras: () => useComprasStore().asegurarCompras(),
    productos: () => useProductosStore().asegurarProductos(),
    ajustes: () => useAjustesStore().asegurarAjustes(),
    cierres: () => useCierresStore().asegurarCierres(),
    capital: () => useCapitalStore().asegurarCapital(),
    socios: () => useCapitalStore().asegurarSocios(),
    distribuciones: () => useCapitalStore().asegurarDistribuciones(),
    retiros: () => useCapitalStore().asegurarRetiros(),
    gastos: () => useGastosStore().asegurarGastos(),
    movCaja: () => useCajaStore().asegurarMovCaja(),
    arqueos: () => useCajaStore().asegurarArqueos(),
    // El libro diario se reconstruye completo desde las tablas fuente
    asientos: () => regenerarAsientos().then(() => undefined),
  };
  await Promise.all(tables.filter((t) => map[t]).map((t) => map[t]()));
}

/**
 * Carga inicial de arranque: solo el conjunto que el Dashboard necesita
 * (ver el comentario del módulo). `arqueos` y `distribuciones` quedan
 * fuera a propósito: se cargan al entrar a su vista.
 */
export async function cargarInicioStores() {
  await asegurarStores(
    'cfg',
    'productos',
    'lotes',
    'ventas',
    'compras',
    'ajustes',
    'gastos',
    'movCaja',
    'capital',
    'retiros',
    'socios',
    'cierres'
  );
}

/**
 * Carga inicial de todos los stores (incluye cfg). Recarga FORZADA de
 * todas las tablas: no es la vía de arranque (ver `cargarInicioStores`),
 * sino la de restaurar/sincronizar, donde los datos en memoria pueden
 * estar obsoletos y hay que re-leerlos sí o sí.
 */
export async function cargarTodoStores() {
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
