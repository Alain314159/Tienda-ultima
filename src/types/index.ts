/**
 * Tipos de dominio de Tienda Pro.
 * Reflejan los registros persistidos en IndexedDB (Dexie).
 */

export interface Escalon {
  min: string | number;
  precio: string | number;
}

export interface Empaque {
  nombre: string;
  unidades: string | number;
}

export interface Producto {
  id: string;
  nombre: string;
  precio: number | string;
  stockMinimo?: number | string;
  codigo?: string;
  unidad?: string;
  nota?: string;
  archivado?: boolean;
  fechaCreacion?: string;
  preciosEscalonados?: Escalon[];
  empaques?: Empaque[];
}

export interface LoteUsado {
  loteId: string;
  cantidad: number;
  costo: number;
}

/** Item del carrito de venta en curso. */
export interface ItemCarrito {
  productoId: string;
  nombre: string;
  cant: number | string;
  precio: number | string;
  unidad?: string;
}

export interface ItemVenta {
  productoId: string;
  nombre: string;
  cantidad: number;
  unidad?: string;
  precio: number;
  costo: number;
  ganancia: number;
  lotesUsados?: LoteUsado[];
  anulado?: boolean;
}

export interface Venta {
  id: string;
  fecha: string;
  items: ItemVenta[];
  total: number;
  ganancia: number;
  anulada?: boolean;
  fechaAnulacion?: string;
}

export interface EmpaqueInfo {
  nombre: string;
  unidades: number;
  cantidad: number;
}

export interface Compra {
  id: string;
  fecha: string;
  productoId: string;
  productoNombre?: string;
  productoUnidad?: string;
  cantidad: number;
  costo: number;
  total: number;
  unidad?: string;
  anulada?: boolean;
  fechaAnulacion?: string;
  empaqueInfo?: EmpaqueInfo | null;
}

export interface Lote {
  id: string;
  compraId?: string;
  productoId: string;
  productoNombre?: string;
  productoUnidad?: string;
  cantidadInicial: number;
  cantidadVendida: number;
  costo: number;
  fecha: string;
  nota?: string;
  empaqueInfo?: EmpaqueInfo | null;
}

export interface Ajuste {
  id: string;
  fecha: string;
  productoId: string;
  productoNombre: string;
  cantidad: number;
  motivo: string;
  costoPerdida: number;
  lotesUsados?: LoteUsado[];
}

export interface Gasto {
  id: string;
  fecha: string;
  categoria: string;
  concepto: string;
  monto: number;
  nota?: string;
  metodoPago: string;
  saleDeCaja: boolean;
  movId?: string | null;
  migrado?: boolean;
}

export interface MovCaja {
  id: string;
  fecha: string;
  tipo: 'ingreso' | 'egreso';
  monto: number;
  concepto: string;
  nota?: string;
  metodoPago?: string;
}

/** Tipo de evento de origen de un asiento del libro diario. */
export type RefTipoAsiento =
  'capitalInicial' | 'aporte' | 'compra' | 'venta' | 'costo' | 'gasto' | 'retiro' | 'ajusteCaja' | 'merma' | 'sobrante';

/** Partida del libro diario: cargo a cuentaDebe y abono a cuentaHaber. */
export interface Asiento {
  id: string;
  fecha: string;
  refTipo: RefTipoAsiento;
  refId: string;
  concepto: string;
  cuentaDebe: string;
  cuentaHaber: string;
  monto: number;
}

export interface Arqueo {
  id: string;
  fecha: string;
  [key: string]: unknown;
}

export interface Socio {
  id: string;
  nombre: string;
  porcentaje: number;
  aporte: number;
  fecha?: string | null;
  activo?: boolean;
}

export interface MovCapital {
  id: string;
  fecha: string;
  monto: number;
  nota?: string;
  socioId?: string | null;
  tipo?: string;
}

export interface Retiro {
  id: string;
  fecha: string;
  monto: number;
  concepto: string;
  tipoRetiro?: string;
  socios?: { socioId: string; nombre: string; monto: number }[];
}

export interface Distribucion {
  id: string;
  fecha: string;
  socioId?: string;
  socioNombre?: string;
  montoTotal?: number;
  monto: number;
  porcentaje?: number;
  concepto: string;
  detalles?: { socioId: string; socioNombre: string; porcentaje: number; monto: number }[];
}

export interface Cierre {
  id: string;
  periodo: string;
  fechaCierre?: string;
  fecha?: string;
  periodoInicio?: string;
  periodoFin?: string;
  ganancia: number;
  totalVentas?: number;
  cogs?: number;
  gastos?: number;
  mermas?: number;
  numVentas?: number;
  ventas?: number;
  compras?: number;
  gananciaBruta?: number;
  valorInventario?: number;
  cajaFinal?: number;
}

export interface Config {
  nombre: string;
  tema: 'light' | 'dark';
  fontScale: number;
  pin: string;
  pinActivo: boolean;
  capitalInicial: number;
  periodoInicio: string;
  calcActiva: boolean;
  busquedaGlobalActiva: boolean;
  calcBilletesActiva: boolean;
  notifActivo: boolean;
  horaArqueo: string;
  umbralDiasCierre: number;
  umbralMermasSemana: number;
  umbralFaltantesMes: number;
  umbralSobrantesMes: number;
  umbralBackupDias: number;
  umbralSinMovimientoDias: number;
  umbralDescuentoPct: number;
  stockMinDefault: number;
  anomaliasDescartadas: string[];
  productosAvisados: string[];
  tgAutoBackup: boolean;
  tgUltimoBackup: string | null;
  tgUltimoHash: string;
  tgFallosConsecutivos: number;
  tgMantenerN: number;
  tgToken: string;
  tgChatId: string;
  nombreTienda: string;
  tiendaConfigurada: boolean;
  tgNombre: string;
  tgCarpetaActiva?: boolean;
  tgCarpetaNombre?: string;
  avisoTiendaDescartado: boolean;
  /** Epoch-ms hasta el que el aviso de configuración queda pospuesto ("Recordarme después") */
  avisoTiendaSnoozeHasta?: number;
  tutorialVisto: boolean;
  mostrarSplash: boolean;
  graficoVista: string;
  graficoProdPeriodo: string;
  graficoProdTipo: string;
  safeMode: boolean;
  ultimoExport?: string;
  ultimoBackupAuto?: number;
  ultimaNotifStock?: string;
  ultimaNotifArqueo?: string;
  ultimaNotifCriticas?: string;
  ultimaNotifCierre?: string;
  ultimaNotifBackupFail?: string;
  [key: string]: unknown;
}

export interface Respaldo {
  version: number;
  fecha: string;
  cfg: Config;
  productos: Producto[];
  lotes: Lote[];
  ventas: Venta[];
  compras: Compra[];
  ajustes: Ajuste[];
  arqueos: Arqueo[];
  movCaja: MovCaja[];
  cierres: Cierre[];
  capital: MovCapital[];
  retiros: Retiro[];
  socios: Socio[];
  distribuciones: Distribucion[];
  gastos: Gasto[];
  asientos: unknown[];
  pasivos: unknown[];
  auditorias: unknown[];
  cifrado?: boolean;
  salt?: string;
  iv?: string;
  data?: string;
}

export interface ItemCola {
  id: string;
  ts: string;
  estado: string;
  intentos: number;
  motivo: string;
  datos: Respaldo;
  ultimoError?: string;
}

export interface Recomendacion {
  clave: string;
  peso?: number;
  nivel: 'urgente' | 'atencion' | 'oportunidad' | 'info';
  titulo: string;
  detalle: string;
  icono: string;
  sec?: string | null;
  refId?: string;
}

export interface SubfilaCuadre {
  costo: number;
  precio: number | null;
  comprasCant: number;
  cantVend: number;
  ingresos: number;
  costoVend: number;
  ganancia: number;
  stockActual: number;
  valorActual: number;
}

export interface FilaCuadre {
  id: string;
  nombre: string;
  compras: number;
  costoCompra: number;
  ventas: number;
  precioVenta: number;
  ingresos: number;
  costo: number;
  ganancia: number;
  stockFinal: number;
  valorInv: number;
  subfilas: SubfilaCuadre[];
}

export interface ResultadoCuadre {
  ingresos: number;
  cogs: number;
  bruta: number;
  mermas: number;
  gastos: number;
  neta: number;
  numVentas: number;
  margenB: string;
  margenN: string;
  cuadre: FilaCuadre[];
  totales: {
    compras: number;
    ventas: number;
    ingresos: number;
    costo: number;
    ganancia: number;
    stockFinal: number;
    valorInv: number;
  };
  _fechaI: string;
  _fechaF: string;
}
