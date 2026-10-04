/**
 * Servicio de Fechas - Manejo centralizado de fechas
 */

const DATE_OPTIONS = { year: 'numeric', month: 'short', day: 'numeric' };
const TIME_OPTIONS = { hour: '2-digit', minute: '2-digit' };

export const Fechas = {
  // ===== FORMATOS =====
  
  /**
   * Formato corto: "15 sep"
   */
  formatoCorto(fecha) {
    if (!fecha) return '';
    return new Date(fecha).toLocaleDateString('es-ES', DATE_OPTIONS);
  },
  
  /**
   * Formato largo: "15 de septiembre de 2024"
   */
  formatoLargo(fecha) {
    if (!fecha) return '';
    return new Date(fecha).toLocaleDateString('es-ES', { 
      year: 'numeric', month: 'long', day: 'numeric' 
    });
  },
  
  /**
   * Formato fecha-hora: "15 sep, 14:30"
   */
  formatoFechaHora(fecha) {
    if (!fecha) return '';
    const date = new Date(fecha);
    return date.toLocaleDateString('es-ES', DATE_OPTIONS) + 
           ', ' + 
           date.toLocaleTimeString('es-ES', TIME_OPTIONS);
  },
  
  /**
   * Formato para display: "15/09/2024"
   */
  formatoDisplay(fecha) {
    if (!fecha) return '';
    const d = new Date(fecha);
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
  },
  
  // ===== COMPARACIONES =====
  
  /**
   * Verifica si una fecha está dentro de un período
   */
  estaEnPeriodo(fecha, periodoInicio, periodoFin = new Date().toISOString()) {
    if (!fecha) return false;
    const f = new Date(fecha);
    const ini = new Date(periodoInicio);
    const fin = new Date(periodoFin);
    return f >= ini && f <= fin;
  },
  
  /**
   * Verifica si una fecha es hoy
   */
  esHoy(fecha) {
    if (!fecha) return false;
    const f = new Date(fecha);
    const hoy = new Date();
    return f.getDate() === hoy.getDate() && 
           f.getMonth() === hoy.getMonth() && 
           f.getFullYear() === hoy.getFullYear();
  },
  
  /**
   * Verifica si una fecha es de esta semana
   */
  esEstaSemana(fecha) {
    if (!fecha) return false;
    const f = new Date(fecha);
    const hoy = new Date();
    const inicioSemana = new Date(hoy);
    inicioSemana.setDate(hoy.getDate() - hoy.getDay());
    const finSemana = new Date(inicioSemana);
    finSemana.setDate(inicioSemana.getDate() + 6);
    return f >= inicioSemana && f <= finSemana;
  },
  
  // ===== UTILIDADES =====
  
  /**
   * Fecha actual en ISO
   */
  hoy() {
    return new Date().toISOString();
  },
  
  /**
   * Inicio del día (00:00:00)
   */
  inicioDelDia(fecha = new Date().toISOString()) {
    const d = new Date(fecha);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  },
  
  /**
   * Fin del día (23:59:59)
   */
  finDelDia(fecha = new Date().toISOString()) {
    const d = new Date(fecha);
    d.setHours(23, 59, 59, 999);
    return d.toISOString();
  },
  
  /**
   * Diferencia en días entre dos fechas
   */
  diasEntre(fecha1, fecha2) {
    const d1 = new Date(fecha1);
    const d2 = new Date(fecha2);
    return Math.floor((d2 - d1) / (1000 * 60 * 60 * 24));
  },
  
  /**
   * Verifica si una fecha es válida
   */
  esValida(fecha) {
    if (!fecha) return false;
    const d = new Date(fecha);
    return !isNaN(d.getTime());
  }
};

export default Fechas;
