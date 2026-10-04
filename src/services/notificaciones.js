/**
 * Servicio de Notificaciones
 * Manejo centralizado de toast, alertas y notificaciones nativas
 */
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

// Estado del toast (para Vue)
let toastState = {
  show: false,
  msg: '',
  type: 'ok', // 'ok', 'bad', 'warn'
  duration: 3000
};

// Observadores del toast
const toastObservers = new Set();

export const Notificaciones = {
  // ===== TOAST =====
  
  /**
   * Muestra un toast de éxito
   */
  exito(mensaje, duracion = 3000) {
    this.mostrarToast(mensaje, 'ok', duracion);
  },
  
  /**
   * Muestra un toast de error
   */
  error(mensaje, duracion = 3000) {
    this.mostrarToast(mensaje, 'bad', duracion);
  },
  
  /**
   * Muestra un toast de advertencia
   */
  advertencia(mensaje, duracion = 3000) {
    this.mostrarToast(mensaje, 'warn', duracion);
  },
  
  /**
   * Muestra un toast genérico
   */
  mostrarToast(mensaje, tipo = 'ok', duracion = 3000) {
    toastState = { show: true, msg: mensaje, type: tipo, duration: duracion };
    
    // Notificar a los observadores (para Vue)
    toastObservers.forEach(observer => observer(toastState));
    
    // Auto-ocultar
    setTimeout(() => {
      toastState.show = false;
      toastObservers.forEach(observer => observer(toastState));
    }, duracion);
  },
  
  /**
   * Obtiene el estado actual del toast (para Vue)
   */
  get toast() {
    return toastState;
  },
  
  /**
   * Registra un observador del toast
   */
  observarToast(observer) {
    toastObservers.add(observer);
    return () => toastObservers.delete(observer);
  },
  
  // ===== NOTIFICACIONES NATIVAS (Capacitor) =====
  
  /**
   * Verifica si las notificaciones nativas están disponibles
   */
  get notificacionesDisponibles() {
    return Capacitor.isNative && LocalNotifications;
  },
  
  /**
   * Solicita permiso para notificaciones
   */
  async solicitarPermiso() {
    if (!this.notificacionesDisponibles) return false;
    
    try {
      const { granted } = await LocalNotifications.requestPermissions();
      return granted;
    } catch (e) {
      console.error('Error solicitando permiso de notificaciones:', e);
      return false;
    }
  },
  
  /**
   * Programa una notificación nativa
   */
  async notificar(titulo, cuerpo, datos = {}) {
    if (!this.notificacionesDisponibles) return;
    
    try {
      await LocalNotifications.schedule({
        notifications: [{
          title: titulo,
          body: cuerpo,
          id: Date.now(),
          schedule: { at: new Date(Date.now() + 1000) }, // En 1 segundo
          sound: 'default',
          data
        }]
      });
    } catch (e) {
      console.error('Error programando notificación:', e);
    }
  },
  
  /**
   * Programa notificación para stock bajo
   */
  async notificarStockBajo(productoNombre, cantidad) {
    this.notificar(
      'Stock Bajo',
      `${productoNombre} tiene solo ${cantidad} unidades`,
      { tipo: 'stock_bajo', producto: productoNombre }
    );
  },
  
  /**
   * Programa notificación para hora de arqueo
   */
  async notificarHoraArqueo() {
    this.notificar(
      'Hora de Arqueo',
      'Es hora de realizar el arqueo de caja',
      { tipo: 'arqueo' }
    );
  },
  
  /**
   * Programa notificación para cierre de período
   */
  async notificarCierrePeriodo(dias) {
    this.notificar(
      'Cierre de Período',
      `Faltan ${dias} días para el cierre de período`,
      { tipo: 'cierre_periodo', dias }
    );
  },
  
  // ===== NOTIFICACIONES WEB (Browser) =====
  
  /**
   * Muestra una notificación del navegador
   */
  async notificarWeb(titulo, opciones = {}) {
    if (!('Notification' in window)) return;
    
    try {
      const permiso = await Notification.requestPermission();
      if (permiso === 'granted') {
        new Notification(titulo, opciones);
      }
    } catch (e) {
      console.error('Error en notificación web:', e);
    }
  }
};

export default Notificaciones;
