/**
 * Instantánea consolidada de todos los stores para exportar/respaldar.
 * Fuente única de verdad para buildData(): nadie debe depender de window.__app.
 */
import { useConfigStore } from './useConfigStore';
import { useProductosStore } from './useProductosStore';
import { useLotesStore } from './useLotesStore';
import { useVentasStore } from './useVentasStore';
import { useComprasStore } from './useComprasStore';
import { useAjustesStore } from './useAjustesStore';
import { useCajaStore } from './useCajaStore';
import { useCapitalStore } from './useCapitalStore';
import { useGastosStore } from './useGastosStore';
import { useCierresStore } from './useCierresStore';
import { clean } from '../utils/id';

/**
 * Construye el objeto de datos completo leyendo directamente de los stores Pinia.
 * Equivalente al antiguo buildData(vm) pero sin depender de la instancia de App.
 */
export function datosDeStores() {
  const configStore = useConfigStore();
  const productosStore = useProductosStore();
  const lotesStore = useLotesStore();
  const ventasStore = useVentasStore();
  const comprasStore = useComprasStore();
  const ajustesStore = useAjustesStore();
  const cajaStore = useCajaStore();
  const capitalStore = useCapitalStore();
  const gastosStore = useGastosStore();
  const cierresStore = useCierresStore();

  return clean({
    version: 9,
    fecha: new Date().toISOString(),
    cfg: configStore.cfg,
    productos: productosStore.productos,
    lotes: lotesStore.lotes,
    ventas: ventasStore.ventas,
    compras: comprasStore.compras,
    ajustes: ajustesStore.ajustes,
    arqueos: cajaStore.arqueos,
    movCaja: cajaStore.movCaja,
    cierres: cierresStore.cierres,
    capital: capitalStore.capital,
    retiros: capitalStore.retiros,
    socios: capitalStore.socios,
    distribuciones: capitalStore.distribuciones,
    gastos: gastosStore.gastos,
    asientos: [],
    pasivos: [],
    auditorias: [],
  });
}
