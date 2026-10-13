/**
 * Composable de historial paginado por períodos.
 * Agrupa registros en "período actual" y "períodos cerrados",
 * con paginación incremental y filas expandibles.
 * Cada vista (ventas/compras/gastos) crea su propia instancia.
 */
import { reactive, ref } from 'vue';
import { useConfigStore } from '../stores/useConfigStore';
import { useCierresStore } from '../stores/useCierresStore';
import type { Cierre } from '../types';

const POR_PAGINA = 20;

/**
 * @param {() => Array} getItems getter de los registros (p.ej. () => ventasStore.ventas)
 */
export function useHistorial<T extends { id: string; fecha: string }>(getItems: () => T[]) {
  const configStore = useConfigStore();
  const cierresStore = useCierresStore();

  const historial = reactive<{
    pagina: number;
    abiertos: Record<string, boolean>;
  }>({
    pagina: 1,
    abiertos: {},
  });
  const porPagina = ref(POR_PAGINA);

  let _agrupCache: { sig: string; data: { actual: T[]; cerrados: { cierre: Cierre; items: T[] }[] } } | null = null;

  /**
   * Agrupa registros por período (actual + cerrados).
   * @param {Array} items
   * @param {string} keyFecha campo de fecha
   */
  function agrupar(items: T[], keyFecha: 'fecha' = 'fecha') {
    const sig =
      items.length +
      '|' +
      (items[0]?.id || '') +
      '|' +
      (items[items.length - 1]?.id || '') +
      '|' +
      configStore.cfg.periodoInicio +
      '|' +
      cierresStore.cierres.length +
      '|' +
      keyFecha;
    if (_agrupCache && _agrupCache.sig === sig) return _agrupCache.data;

    const cierresProc = cierresStore.cierres.map((c) => ({
      cierre: c,
      ci: new Date(c.periodoInicio || c.fechaCierre || '').getTime(),
      cf: new Date(c.periodoFin || c.fechaCierre || '').getTime(),
    }));
    const ini = new Date(configStore.cfg.periodoInicio).getTime();
    const actual: T[] = [];
    const cerradosMap: Record<string, { cierre: Cierre; items: T[] }> = {};
    const cerrados: { cierre: Cierre; items: T[] }[] = [];
    const sinCierre: T[] = [];

    for (const it of items) {
      const f = new Date(it[keyFecha]).getTime();
      if (f >= ini) {
        actual.push(it);
        continue;
      }
      let match: Cierre | null = null;
      for (const cp of cierresProc) {
        if (f >= cp.ci && f < cp.cf) {
          match = cp.cierre;
          break;
        }
      }
      if (match) {
        let grupo = cerradosMap[match.id];
        if (!grupo) {
          grupo = { cierre: match, items: [] };
          cerradosMap[match.id] = grupo;
          cerrados.push(grupo);
        }
        grupo.items.push(it);
      } else {
        sinCierre.push(it);
      }
    }

    if (sinCierre.length) {
      const cierreAntiguos: Cierre = {
        id: '__antiguos__',
        periodo: 'Anteriores al primer cierre',
        fechaCierre: '',
        ganancia: 0,
      };
      cerrados.push({ cierre: cierreAntiguos, items: sinCierre });
    }
    cerrados.sort((a, b) => {
      const fa = a.cierre.fechaCierre ? new Date(a.cierre.fechaCierre).getTime() : 0;
      const fb = b.cierre.fechaCierre ? new Date(b.cierre.fechaCierre).getTime() : 0;
      return fb - fa;
    });

    const data = { actual, cerrados };
    _agrupCache = { sig, data };
    return data;
  }

  /** Agrupa los registros actuales del getter. */
  function agruparActual() {
    return agrupar(getItems(), 'fecha');
  }

  function itemsMostrados(items: T[]) {
    return items.slice(0, historial.pagina * porPagina.value);
  }

  function hayMas(items: T[]) {
    return items.length > historial.pagina * porPagina.value;
  }

  function restantes(items: T[]) {
    return Math.max(0, items.length - historial.pagina * porPagina.value);
  }

  function mostrarMas() {
    historial.pagina++;
  }

  function toggle(id: string) {
    historial.abiertos[id] = !historial.abiertos[id];
  }

  function abierto(id: string) {
    return !!historial.abiertos[id];
  }

  function reset() {
    historial.pagina = 1;
    historial.abiertos = {};
    _agrupCache = null;
  }

  return {
    historial,
    porPagina,
    agrupar,
    agruparActual,
    itemsMostrados,
    hayMas,
    restantes,
    mostrarMas,
    toggle,
    abierto,
    reset,
  };
}
