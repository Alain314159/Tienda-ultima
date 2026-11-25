/**
 * Utilidades de importación: construye el resumen previsualizable
 * de un archivo de respaldo antes de reemplazar los datos.
 */
import { useProductosStore } from './useProductosStore';
import { useLotesStore } from './useLotesStore';
import { useVentasStore } from './useVentasStore';
import { useComprasStore } from './useComprasStore';
import { useGastosStore } from './useGastosStore';
import { useCapitalStore } from './useCapitalStore';
import type { Respaldo } from '../types';

/**
 * Tablas de DATOS cuyo borrado duele: si la CLAVE no viene en el respaldo
 * (recorte a mano, export viejo parcial), importar BORRA lo que haya en la
 * app para esas tablas. Devuelve las ausentes para avisar ANTES de pisar.
 *
 * Ojo: un `[]` explícito es una decisión ("no traigo ventas"), una clave
 * ausente suele ser un archivo recortado sin darse cuenta — por eso solo
 * cuentan las ausentes.
 */
const TABLAS_DATOS = [
  'productos',
  'lotes',
  'ventas',
  'compras',
  'ajustes',
  'arqueos',
  'movCaja',
  'cierres',
  'capital',
  'retiros',
  'socios',
  'distribuciones',
  'gastos',
] as const;

export function tablasAusentes(d: Record<string, unknown> | undefined | null): string[] {
  if (!d || typeof d !== 'object') return [];
  return TABLAS_DATOS.filter((t) => d[t] === undefined);
}

/** Conteos actuales por tabla (según stores). */
export function usarStores() {
  return {
    productos: useProductosStore().productos.length,
    lotes: useLotesStore().lotes.length,
    ventas: useVentasStore().ventas.length,
    compras: useComprasStore().compras.length,
    gastos: useGastosStore().gastos.length,
    socios: useCapitalStore().socios.length,
  };
}

/** Construye la estructura de previsualización de importación. */
export function crearPreview(d: Respaldo, actuales: ReturnType<typeof usarStores>) {
  const campos: {
    key: 'productos' | 'lotes' | 'ventas' | 'compras' | 'gastos' | 'socios' | 'asientos' | 'pasivos';
    label: string;
  }[] = [
    { key: 'productos', label: 'Productos' },
    { key: 'lotes', label: 'Lotes' },
    { key: 'ventas', label: 'Ventas' },
    { key: 'compras', label: 'Compras' },
    { key: 'gastos', label: 'Gastos' },
    { key: 'socios', label: 'Socios' },
    { key: 'asientos', label: 'Asientos' },
    { key: 'pasivos', label: 'Pasivos' },
  ];
  const nuevos: Record<string, number> = {};
  campos.forEach((c) => {
    nuevos[c.key] = (d[c.key] || []).length;
  });
  return {
    archivo: d,
    campos,
    actuales,
    nuevos,
    fechaArchivo: d.fecha || null,
    tiendaArchivo: (d.cfg && d.cfg.nombre) || '(sin nombre)',
  };
}
