/**
 * Servicio de Validaciones - Lógica de negocio centralizada
 */
import { n } from '../db';

export const Validaciones = {
  // ===== PRODUCTOS =====
  
  /**
   * Valida si hay stock suficiente para una cantidad
   */
  tieneStock(stockActual, cantidad) {
    return stockActual >= n(cantidad);
  },
  
  /**
   * Valida si un producto existe
   */
  existeProducto(productoId, productos) {
    return productos.some(p => p.id === productoId);
  },
  
  /**
   * Valida si un producto está activo (no archivado)
   */
  productoActivo(producto, mostrarArchivados = false) {
    return mostrarArchivados || !producto.archivado;
  },
  
  // ===== VENTAS =====
  
  /**
   * Valida si se puede vender (hay suficiente en caja)
   */
  puedeVender(total, saldoCaja) {
    return total <= saldoCaja + 0.01; // Pequeño margen para floating point
  },
  
  /**
   * Valida si una venta puede ser anulada
   */
  puedeAnularVenta(venta) {
    return venta && !venta.anulada;
  },
  
  /**
   * Valida si un producto en venta puede ser anulado
   */
  puedeAnularProductoEnVenta(venta, item) {
    return venta && !venta.anulada && item && !item.anulado;
  },
  
  // ===== FINANCIERO =====
  
  /**
   * Valida si un monto es válido (positivo y número)
   */
  montoValido(monto) {
    if (monto === undefined || monto === null || monto === '') return false;
    const num = n(monto);
    return num > 0 && !isNaN(num);
  },
  
  /**
   * Valida si un monto no excede un máximo
   */
  montoDentroLimite(monto, max) {
    return n(monto) <= n(max) + 0.01;
  },
  
  /**
   * Valida si un retiro es válido
   */
  retiroValido(monto, disponible, tipo) {
    return this.montoValido(monto) && this.montoDentroLimite(monto, disponible);
  },
  
  // ===== CAJA =====
  
  /**
   * Valida si la caja tiene saldo negativo
   */
  cajaNegativa(saldo) {
    return n(saldo) < 0;
  },
  
  /**
   * Valida si se puede hacer un arqueo
   */
  puedeArquear(saldoCaja, cajaFisica) {
    // Se puede arquear siempre, pero advertir si hay diferencia
    return true;
  },
  
  // ===== PRODUCTOS (VALIDACIONES DE DATOS) =====
  
  /**
   * Valida un precio
   */
  precioValido(precio) {
    return this.montoValido(precio);
  },
  
  /**
   * Valida una cantidad
   */
  cantidadValida(cantidad) {
    const num = n(cantidad);
    return num > 0 && !isNaN(num);
  },
  
  /**
   * Valida un nombre de producto
   */
  nombreValido(nombre) {
    return nombre && nombre.trim().length >= 2 && nombre.trim().length <= 100;
  },
  
  // ===== USUARIO =====
  
  /**
   * Valida un PIN
   */
  pinValido(pin) {
    return pin && pin.length >= 4 && pin.length <= 6 && /^\d+$/.test(pin);
  },
  
  /**
   * Valida si el PIN está activo
   */
  pinActivo(pinActivo) {
    return pinActivo === true;
  }
};

export default Validaciones;
