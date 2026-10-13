/**
 * Utilidades de importación: construye el resumen previsualizable
 * de un archivo de respaldo antes de reemplazar los datos.
 */
import { useProductosStore } from './useProductosStore.js';
import { useLotesStore } from './useLotesStore.js';
import { useVentasStore } from './useVentasStore.js';
import { useComprasStore } from './useComprasStore.js';
import { useGastosStore } from './useGastosStore.js';
import { useCapitalStore } from './useCapitalStore.js';

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
export function crearPreview(d, actuales) {
  const campos = [
    { key: 'productos', label: 'Productos' },
    { key: 'lotes', label: 'Lotes' },
    { key: 'ventas', label: 'Ventas' },
    { key: 'compras', label: 'Compras' },
    { key: 'gastos', label: 'Gastos' },
    { key: 'socios', label: 'Socios' },
    { key: 'asientos', label: 'Asientos' },
    { key: 'pasivos', label: 'Pasivos' },
  ];
  const nuevos = {};
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
