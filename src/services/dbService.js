/**
 * Servicio de Base de Datos
 * Operaciones complejas y transacciones con IndexedDB
 */
import { db, P, clean } from '../db';

export const DB = {
  // ===== TRANSACCIONES COMPLEJAS =====
  
  /**
   * Anula una venta completa y restaura el stock
   */
  async anularVentaCompleta(ventaId, lotes) {
    return db.transaction('rw', db.ventas, db.lotes, async () => {
      const venta = await db.ventas.get(ventaId);
      if (!venta) throw new Error('Venta no encontrada');
      
      // Anular venta
      await P(db.ventas, { 
        ...venta, 
        anulada: true, 
        fechaAnulacion: new Date().toISOString() 
      });
      
      // Restaurar stock
      const lotesActualizados = [];
      for (const it of venta.items) {
        if (!it.lotesUsados) continue;
        for (const u of it.lotesUsados) {
          const l = lotes.find(x => x.id === u.loteId);
          if (l) {
            l.cantidadVendida = Math.max(0, n(l.cantidadVendida) - u.cantidad);
            lotesActualizados.push(clean(l));
          }
        }
      }
      
      if (lotesActualizados.length > 0) {
        await db.lotes.bulkPut(lotesActualizados);
      }
    });
  },

  /**
   * Anula un producto individual en una venta
   */
  async anularProductoEnVenta(ventaId, itemIndex, lotes) {
    return db.transaction('rw', db.ventas, db.lotes, async () => {
      const venta = await db.ventas.get(ventaId);
      if (!venta || venta.anulada) throw new Error('Venta no válida');
      
      const item = venta.items[itemIndex];
      if (!item) throw new Error('Producto no encontrado');
      
      // Marcar producto como anulado
      const itemsActualizados = venta.items.map((it, idx) => 
        idx === itemIndex ? { ...it, anulado: true } : it
      );
      
      // Recalcular totales
      const nuevoTotal = itemsActualizados.reduce((s, it) => 
        s + (it.anulado ? 0 : n(it.precio) * n(it.cantidad)), 0);
      const nuevaGanancia = itemsActualizados.reduce((s, it) => 
        s + (it.anulado ? 0 : n(it.ganancia)), 0);
      
      // Actualizar venta
      await P(db.ventas, { 
        ...venta, 
        items: itemsActualizados,
        total: nuevoTotal,
        ganancia: nuevaGanancia
      });
      
      // Restaurar stock del producto anulado
      if (item.lotesUsados) {
        const lotesActualizados = [];
        for (const u of item.lotesUsados) {
          const l = lotes.find(x => x.id === u.loteId);
          if (l) {
            l.cantidadVendida = Math.max(0, n(l.cantidadVendida) - u.cantidad);
            lotesActualizados.push(clean(l));
          }
        }
        if (lotesActualizados.length > 0) {
          await db.lotes.bulkPut(lotesActualizados);
        }
      }
    });
  },

  /**
   * Registra una venta completa con actualización de lotes
   */
  async registrarVentaCompleta(venta, carrito, lotes) {
    return db.transaction('rw', db.ventas, db.lotes, async () => {
      // Guardar venta
      await P(db.ventas, venta);
      
      // Actualizar lotes (incrementar cantidadVendida)
      const lotesActualizados = [];
      for (const it of carrito) {
        const f = this.calcFIFO(it.productoId, n(it.cant), lotes);
        for (const u of f.lotesUsados) {
          const l = lotes.find(x => x.id === u.loteId);
          if (l) {
            l.cantidadVendida = n(l.cantidadVendida) + u.cantidad;
            lotesActualizados.push(clean(l));
          }
        }
      }
      
      if (lotesActualizados.length > 0) {
        await db.lotes.bulkPut(lotesActualizados);
      }
    });
  },

  // ===== OPERACIONES BATCH =====
  
  /**
   * Actualización batch de cualquier tabla
   */
  async batchUpdate(tableName, updates) {
    if (!db[tableName]) {
      throw new Error(`Tabla ${tableName} no existe`);
    }
    await db[tableName].bulkPut(updates.map(clean));
  },

  /**
   * Eliminación batch
   */
  async batchDelete(tableName, ids) {
    if (!db[tableName]) {
      throw new Error(`Tabla ${tableName} no existe`);
    }
    await db[tableName].bulkDelete(ids);
  },

  // ===== CONSULTAS COMPLEJAS =====
  
  /**
   * Obtiene ventas con sus productos expandidos
   */
  async getVentasConProductos() {
    const ventas = await db.ventas.toArray();
    const productos = await db.productos.toArray();
    
    return ventas.map(v => ({
      ...v,
      productoNombre: productos.find(p => p.id === v.productoId)?.nombre || 'Desconocido'
    }));
  },

  /**
   * Obtiene el historial completo para reportes
   */
  async getHistorialCompleto(fechaInicio, fechaFin) {
    const [ventas, compras, gastos, ajustes] = await Promise.all([
      db.ventas.where('fecha').between(fechaInicio, fechaFin).toArray(),
      db.compras.where('fecha').between(fechaInicio, fechaFin).toArray(),
      db.gastos.where('fecha').between(fechaInicio, fechaFin).toArray(),
      db.ajustes.where('fecha').between(fechaInicio, fechaFin).toArray()
    ]);
    
    return { ventas, compras, gastos, ajustes };
  },

  // ===== ESTADÍSTICAS =====
  
  /**
   * Obtiene estadísticas generales
   */
  async getEstadisticas(periodoInicio) {
    const ini = new Date(periodoInicio);
    
    const [ventas, compras, gastos] = await Promise.all([
      db.ventas.filter(v => !v.anulada && new Date(v.fecha) >= ini).toArray(),
      db.compras.filter(c => !c.anulada && new Date(c.fecha) >= ini).toArray(),
      db.gastos.filter(g => new Date(g.fecha) >= ini).toArray()
    ]);
    
    return {
      ventas: {
        total: m(ventas.reduce((s, v) => s + n(v.total), 0)),
        cantidad: ventas.length,
        ganancia: m(ventas.reduce((s, v) => s + n(v.ganancia), 0))
      },
      compras: {
        total: m(compras.reduce((s, c) => s + n(c.total), 0)),
        cantidad: compras.length
      },
      gastos: {
        total: m(gastos.reduce((s, g) => s + n(g.monto), 0)),
        cantidad: gastos.length
      }
    };
  }
};

// Importar calcFIFO desde fifo.js
import { calcFIFO } from './fifo';
DB.calcFIFO = calcFIFO;

export default DB;
