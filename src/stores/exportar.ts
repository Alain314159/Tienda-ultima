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
import { db } from '../db';
import { clean } from '../utils/id';

/**
 * Construye el objeto de datos completo leyendo directamente de los stores Pinia
 * (y de Dexie para pasivos y auditorías, que no tienen store propio).
 * Equivalente al antiguo buildData(vm) pero sin depender de la instancia de App.
 *
 * Es async porque pasivos y auditorías se leen de IndexedDB.
 *
 * NOTA — asientos NO se exportan (van como []): el libro diario se
 * reconstruye localmente desde las tablas de origen (ventas, compras,
 * gastos, capital...) al recargar los stores, así que un respaldo no
 * necesita guardarlos y no puede quedar inconsistente con ellos.
 *
 * NOTA — cambios y descartes (tablas de sync) TAMPOCO viajan: son el
 * registro de transporte, no datos del usuario. Sus entradas se
 * interpretan contra los cursores por dispositivo de syncMeta (que no
 * se exporta), así que restaurar el registro sin sus cursores es
 * inconsistente: unas entradas nunca se reenviarían y otras reenviarían
 * operaciones viejas (incluidas lápidas de borrado) contra una nube que
 * ya avanzó. La regla (ts, dispositivo) protege en casi todos los
 * casos, pero el contrato seguro es: el respaldo son solo datos; tras
 * restaurar, el motor reenvía el estado completo la primera vez que el
 * dispositivo se une a una cuenta y las mutaciones nuevas se registran
 * desde el estado restaurado.
 */
export async function datosDeStores() {
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

  const [pasivos, auditorias] = await Promise.all([db.pasivos.toArray(), db.auditorias.toArray()]);

  // El PIN NUNCA viaja en un respaldo: ni el hash ni el flag. Un respaldo
  // importado jamás cambia el PIN del teléfono que lo recibe (1.2), y un
  // archivo plano perdido no expone ni siquiera el hash para fuerza bruta
  // offline (1.11). El export cifrado tampoco lo necesita: al importar, el
  // PIN local se conserva tal cual.
  const { pin: _pin, pinActivo: _pinActivo, ...cfgSinPin } = configStore.cfg;

  return clean({
    version: 11,
    fecha: new Date().toISOString(),
    cfg: cfgSinPin,
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
    pasivos,
    auditorias,
  });
}
