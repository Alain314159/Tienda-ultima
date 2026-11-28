/**
 * Regresión de la estructura de AjustesModal tras la reorganización
 * (Tienda / Apariencia / Seguridad / Ventas / Notificaciones y alertas /
 * Datos y respaldos / Actualizaciones / Sistema / Zona peligrosa / Información).
 *
 * Cada test localiza una sección por su encabezado `.set-group` y recorre
 * sus hermanos siguientes hasta el próximo grupo: así se comprueba que cada
 * opción vive dentro del grupo que le toca y no en otro.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { createPinia, setActivePinia } from 'pinia';
import { mount, flushPromises } from '@vue/test-utils';

import { db } from '../src/db';
import { useConfigStore } from '../src/stores/useConfigStore';
import { useUIStore } from '../src/stores/useUIStore';
import AppIcon from '../src/components/AppIcon.vue';
import AjustesModal from '../src/components/AjustesModal.vue';

beforeEach(async () => {
  setActivePinia(createPinia());
  localStorage.clear();
  // happy-dom no trae Notification: sin esto la fila "Activar notificaciones"
  // no se renderiza (v-if="soportaNotif") y el aviso de no soportado sí.
  window.Notification = Object.assign(vi.fn(), {
    permission: 'granted',
    requestPermission: vi.fn().mockResolvedValue('granted'),
  });
  await Promise.all([
    db.productos.clear(),
    db.lotes.clear(),
    db.ventas.clear(),
    db.compras.clear(),
    db.cierres.clear(),
    db.movCaja.clear(),
    db.config.clear(),
  ]);
  const config = useConfigStore();
  config.cfg.periodoInicio = '2026-09-01T00:00:00.000Z';
});

function montarAjustes(props = {}) {
  const { umbralesAbierto, ...propsVue } = props;
  const ui = useUIStore();
  ui.ajustesAbierto = true;
  if (umbralesAbierto) ui.umbralesAbierto = true;
  return mount(AjustesModal, {
    props: { otraPestana: false, ...propsVue },
    global: { components: { Icon: AppIcon }, stubs: { teleport: true } },
  });
}

/** Texto de la sección que empieza en el `.set-group` con ese título. */
function textoSeccion(w, titulo) {
  const grupos = w.findAll('.set-group');
  const inicio = grupos.find((g) => g.text().trim() === titulo);
  expect(inicio, `no existe el grupo "${titulo}"`).toBeDefined();
  let texto = '';
  let el = inicio.element.nextElementSibling;
  while (el && !el.classList.contains('set-group')) {
    texto += ' ' + (el.textContent || '');
    el = el.nextElementSibling;
  }
  return texto;
}

const UMBRALES = [
  'Cierre pendiente (días)',
  'Mermas por semana',
  'Faltantes por mes',
  'Sobrantes por mes',
  'Días sin backup',
  'Días sin movimiento',
  'Descuento máximo (%)',
  'Stock mínimo default',
];

describe('AjustesModal: estructura reorganizada', () => {
  it('los diez grupos aparecen en el orden nuevo y no quedan los viejos', () => {
    const w = montarAjustes();
    const grupos = w.findAll('.set-group').map((g) => g.text().trim());
    expect(grupos).toEqual([
      'Tienda',
      'Apariencia',
      'Seguridad',
      'Ventas',
      'Notificaciones y alertas',
      'Datos y respaldos',
      'Actualizaciones',
      'Sistema',
      'Zona peligrosa',
      'Información',
    ]);
    expect(w.text()).not.toContain('Personalizacion');
    expect(w.text()).not.toContain('Avanzado');
    w.unmount();
  });

  it('Tienda contiene nombre, dirección, teléfonos y grupo de WhatsApp', () => {
    const w = montarAjustes();
    const t = textoSeccion(w, 'Tienda');
    expect(t).toContain('Nombre de tienda');
    expect(t).toContain('Dirección (lista de precios)');
    expect(t).toContain('Teléfonos');
    expect(t).toContain('Grupo de WhatsApp');
    w.unmount();
  });

  it('Apariencia contiene tamaño de letra y búsqueda global, con sus ayudas', () => {
    const w = montarAjustes();
    const t = textoSeccion(w, 'Apariencia');
    expect(t).toContain('Tamaño de letra');
    expect(t).toContain('Aumenta o reduce el tamaño de todas las letras');
    expect(t).toContain('Búsqueda global');
    expect(t).toContain('Muestra u oculta el buscador global');
    w.unmount();
  });

  it('Seguridad contiene el PIN de operaciones sensibles', () => {
    const w = montarAjustes();
    const t = textoSeccion(w, 'Seguridad');
    expect(t).toContain('PIN operaciones sensibles');
    w.unmount();
  });

  it('Ventas contiene solo la calculadora de billetes; los umbrales no están aquí', () => {
    const w = montarAjustes({ umbralesAbierto: true });
    const t = textoSeccion(w, 'Ventas');
    expect(t).toContain('Calculadora de billetes al cobrar');
    expect(t).toContain('Muestra un panel de denominaciones');
    expect(t).not.toContain('Alertas y umbrales avanzados');
    w.unmount();
  });

  it('Notificaciones y alertas contiene activar, hora, probar y los 8 umbrales', async () => {
    const w = montarAjustes({ umbralesAbierto: true });
    await flushPromises();
    const t = textoSeccion(w, 'Notificaciones y alertas');
    expect(t).toContain('Activar notificaciones');
    expect(t).toContain('Hora de arqueo');
    expect(t).toContain('Probar notificación');
    expect(t).toContain('Alertas y umbrales avanzados');
    for (const u of UMBRALES) expect(t).toContain(u);
    w.unmount();
  });

  it('los umbrales siguen plegados por defecto', () => {
    const w = montarAjustes();
    const t = w.text();
    expect(t).toContain('Alertas y umbrales avanzados');
    for (const u of UMBRALES) expect(t).not.toContain(u);
    w.unmount();
  });

  it('Datos y respaldos contiene exportar, importar, respaldo automático y almacenamiento', () => {
    const w = montarAjustes();
    const t = textoSeccion(w, 'Datos y respaldos');
    expect(t).toContain('Exportar respaldo (JSON)');
    expect(t).toContain('Exportar respaldo cifrado');
    expect(t).toContain('Importar datos');
    expect(t).toContain('Respaldo automático');
    expect(t).toContain('Almacenamiento local');
    expect(t).toContain('Uso de disco');
    w.unmount();
  });

  it('"Respaldo automático" está en Datos y respaldos y NO en Sistema ni Actualizaciones', () => {
    const w = montarAjustes();
    expect(textoSeccion(w, 'Datos y respaldos')).toContain('Respaldo automático');
    expect(textoSeccion(w, 'Sistema')).not.toContain('Respaldo automático');
    expect(textoSeccion(w, 'Actualizaciones')).not.toContain('Respaldo automático');
    // Solo aparece una vez en todo el modal
    expect(w.text().match(/Respaldo automático/g)).toHaveLength(1);
    w.unmount();
  });

  it('Actualizaciones contiene Buscar actualizaciones y Sistema el Estado del sistema', () => {
    const w = montarAjustes();
    expect(textoSeccion(w, 'Actualizaciones')).toContain('Buscar actualizaciones');
    expect(textoSeccion(w, 'Actualizaciones')).toContain('Comprueba si hay una versión nueva');
    expect(textoSeccion(w, 'Actualizaciones')).not.toContain('Estado del sistema');
    expect(textoSeccion(w, 'Sistema')).toContain('Estado del sistema');
    expect(textoSeccion(w, 'Sistema')).not.toContain('Buscar actualizaciones');
    w.unmount();
  });

  it('Zona peligrosa contiene Borrar TODOS los datos', () => {
    const w = montarAjustes();
    const t = textoSeccion(w, 'Zona peligrosa');
    expect(t).toContain('Borrar TODOS los datos');
    expect(t).toContain('Elimina permanentemente');
    w.unmount();
  });

  it('Información es un set-group con la versión y los conteos', () => {
    const w = montarAjustes();
    const t = textoSeccion(w, 'Información');
    expect(t).toContain('Versión 6.0');
    expect(t).toContain('Datos locales');
    expect(t).toContain('productos');
    expect(t).toContain('ventas');
    expect(t).toContain('compras');
    // Ya no es una fila normal: no hay un .set-row con ese título
    const filasInfo = w.findAll('.set-row').filter((r) => r.text().includes('Información'));
    expect(filasInfo.length).toBe(0);
    w.unmount();
  });

  it('el aviso de otra pestaña va justo antes de Zona peligrosa (y solo si hay otra)', () => {
    const w = montarAjustes({ otraPestana: true });
    const t = w.text();
    const iAviso = t.indexOf('Otra pestaña de Tienda Pro');
    const iSistema = t.indexOf('Sistema');
    const iZona = t.indexOf('Zona peligrosa');
    expect(iAviso).toBeGreaterThan(-1);
    expect(iAviso).toBeGreaterThan(iSistema);
    expect(iAviso).toBeLessThan(iZona);
    w.unmount();

    const w2 = montarAjustes({ otraPestana: false });
    expect(w2.text()).not.toContain('Otra pestaña de Tienda Pro');
    w2.unmount();
  });

  it('el botón Cerrar sigue al final', () => {
    const w = montarAjustes();
    const botones = w.findAll('button').map((b) => b.text().trim());
    expect(botones[botones.length - 1]).toBe('Cerrar');
    w.unmount();
  });
});
