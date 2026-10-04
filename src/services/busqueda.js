/**
 * Servicio de Búsqueda y Filtro
 * Lógica centralizada para búsqueda en listas
 */
import { n } from '../db';

export const Busqueda = {
  // ===== BÚSQUEDA DE PRODUCTOS =====
  
  /**
   * Busca productos por término
   * @param {string} termino - Término de búsqueda
   * @param {Array} productos - Lista de productos
   * @param {boolean} incluirArchivados - Si se incluyen productos archivados
   * @param {Object} stockMap - Mapa de stock por producto
   * @returns {Array} Productos filtrados
   */
  buscarProductos(termino, productos, incluirArchivados = false, stockMap = {}) {
    const q = termino.toLowerCase().trim();
    
    return productos.filter(p => {
      // Filtrar archivados
      if (!incluirArchivados && p.archivado) return false;
      
      // Filtrar sin stock (si no se incluyen archivados)
      if ((stockMap[p.id] || 0) <= 0 && !incluirArchivados) return false;
      
      // Filtrar por término
      if (q && !(p.nombre.toLowerCase().includes(q) || (p.codigo?.toLowerCase().includes(q)))) {
        return false;
      }
      
      return true;
    });
  },
  
  // ===== BÚSQUEDA DE VENTAS =====
  
  /**
   * Filtra ventas por período
   * @param {Array} ventas - Lista de ventas
   * @param {string} periodoInicio - Fecha de inicio del período
   * @returns {Object} { actual: [], cerrados: [] }
   */
  filtrarVentasPorPeriodo(ventas, periodoInicio) {
    const ini = new Date(periodoInicio);
    
    return {
      actual: ventas.filter(v => !v.anulada && new Date(v.fecha) >= ini),
      cerrados: ventas.filter(v => v.anulada || new Date(v.fecha) < ini)
    };
  },
  
  /**
   * Agrupa ventas por cierre
   * @param {Array} ventas - Lista de ventas
   * @param {Array} cierres - Lista de cierres
   * @returns {Array} Array de grupos { cierre, items: [] }
   */
  agruparVentasPorCierre(ventas, cierres) {
    if (cierres.length === 0) {
      return [{ cierre: null, items: ventas }];
    }
    
    return cierres.map(cierre => ({
      cierre,
      items: ventas.filter(v => {
        const fechaVenta = new Date(v.fecha);
        const inicio = new Date(cierre.periodoInicio);
        const fin = new Date(cierre.periodoFin);
        return fechaVenta >= inicio && fechaVenta <= fin;
      })
    }));
  },
  
  // ===== BÚSQUEDA DE COMPRAS =====
  
  /**
   * Filtra compras por período
   */
  filtrarComprasPorPeriodo(compras, periodoInicio) {
    const ini = new Date(periodoInicio);
    
    return {
      actual: compras.filter(c => !c.anulada && new Date(c.fecha) >= ini),
      cerrados: compras.filter(c => c.anulada || new Date(c.fecha) < ini)
    };
  },
  
  // ===== BÚSQUEDA GENÉRICA =====
  
  /**
   * Búsqueda genérica en cualquier lista
   * @param {Array} items - Lista de items
   * @param {string} termino - Término de búsqueda
   * @param {Function} extractor - Función para extraer el texto a buscar
   * @returns {Array} Items filtrados
   */
  buscar(items, termino, extractor = (item) => item.nombre || item.concepto || '') {
    const q = termino.toLowerCase().trim();
    
    if (!q) return items;
    
    return items.filter(item => {
      const texto = extractor(item);
      return texto.toLowerCase().includes(q);
    });
  },
  
  // ===== PAGINACIÓN =====
  
  /**
   * Obtiene una página de items
   * @param {Array} items - Lista completa
   * @param {number} pagina - Número de página (0-indexed)
   * @param {number} tamanoPagina - Items por página
   * @returns {Object} { pagina: [], totalPaginas, totalItems }
   */
  paginar(items, pagina = 0, tamanoPagina = 20) {
    const totalItems = items.length;
    const totalPaginas = Math.ceil(totalItems / tamanoPagina);
    const inicio = pagina * tamanoPagina;
    const fin = inicio + tamanoPagina;
    
    return {
      pagina: items.slice(inicio, fin),
      totalPaginas,
      totalItems,
      paginaActual: pagina,
      hayMas: fin < totalItems
    };
  },
  
  // ===== ORDENAMIENTO =====
  
  /**
   * Ordena items por fecha (más reciente primero)
   */
  ordenarPorFechaReciente(items) {
    return items.slice().sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  },
  
  /**
   * Ordena items por fecha (más antiguo primero)
   */
  ordenarPorFechaAntigua(items) {
    return items.slice().sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  },
  
  /**
   * Ordena items por nombre
   */
  ordenarPorNombre(items, campo = 'nombre') {
    return items.slice().sort((a, b) => {
      const aNombre = a[campo] || '';
      const bNombre = b[campo] || '';
      return aNombre.localeCompare(bNombre);
    });
  },
  
  /**
   * Ordena items por monto (mayor primero)
   */
  ordenarPorMonto(items, campo = 'total') {
    return items.slice().sort((a, b) => n(b[campo]) - n(a[campo]));
  }
};

export default Busqueda;
