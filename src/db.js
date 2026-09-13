import Dexie from 'dexie';

export const db = new Dexie('TiendaProDB');

db.version(1).stores({
  productos: 'id, nombre, archivado',
  lotes: 'id, productoId, compraId, fecha',
  ventas: 'id, fecha, anulada',
  compras: 'id, productoId, fecha',
  ajustes: 'id, productoId, fecha',
  arqueos: 'id, fecha',
  movCaja: 'id, fecha, tipo',
  cierres: 'id, fechaCierre',
  capital: 'id, fecha',
  retiros: 'id, fecha',
  socios: 'id, nombre, aporte, porcentaje, fecha, activo',
  distribuciones: 'id, fecha, montoTotal, socioId, monto, concepto',
  config: 'key'
});

// Version 2: agrega gastos operativos
db.version(2).stores({
  productos: 'id, nombre, archivado',
  lotes: 'id, productoId, compraId, fecha',
  ventas: 'id, fecha, anulada',
  compras: 'id, productoId, fecha',
  ajustes: 'id, productoId, fecha',
  arqueos: 'id, fecha',
  movCaja: 'id, fecha, tipo',
  cierres: 'id, fechaCierre',
  capital: 'id, fecha',
  retiros: 'id, fecha',
  socios: 'id, nombre, aporte, porcentaje, fecha, activo',
  distribuciones: 'id, fecha, montoTotal, socioId, monto, concepto',
  gastos: 'id, fecha, categoria',
  config: 'key'
});

// Exponer db en window para debugging (útil con Eruda/F12)
if (typeof window !== 'undefined') window.db = db;

// Helpers numéricos
export const n = v => { const x = parseFloat(v); return isNaN(x) ? 0 : x; };
export const m = v => Math.round((n(v) + Number.EPSILON) * 10000) / 10000;
export const q = v => Math.round((n(v) + Number.EPSILON) * 10000) / 10000;

// ID único
export const genId = prefix => prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// Limpiar objeto (eliminar undefined)
export const clean = obj => JSON.parse(JSON.stringify(obj));

// Put helper
export const P = (table, obj) => table.put(clean(obj));

// Vibración
export const vib = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch(e){} };

// Formateadores
export function fmt(v) {
  try {
    return '$' + n(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } catch(e) {
    return '$0.00';
  }
}

export function fmtCant(v) {
  const num = parseFloat(v);
  if (isNaN(num)) return '0';
  return num % 1 === 0 ? String(num) : num.toFixed(4).replace(/\.?0+$/, '');
}

export function fmtFecha(iso) {
  try {
    const d = new Date(iso);
    return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getFullYear()).slice(2);
  } catch (e) {
    return '';
  }
}

export function fmtFH(iso) {
  try {
    const d = new Date(iso);
    return fmtFecha(iso) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  } catch (e) {
    return '';
  }
}

// Exportar datos completos
export function buildData(state) {
  return clean({
    version: 7,
    fecha: new Date().toISOString(),
    cfg: state.cfg,
    productos: state.productos,
    lotes: state.lotes,
    ventas: state.ventas,
    compras: state.compras,
    ajustes: state.ajustes,
    arqueos: state.arqueos,
    movCaja: state.movCaja,
    cierres: state.cierres,
    capital: state.capital,
    retiros: state.retiros,
    socios: state.socios,
    distribuciones: state.distribuciones,
    gastos: state.gastos
  });
}
