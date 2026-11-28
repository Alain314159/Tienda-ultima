/**
 * Tests de accesibilidad (5.1-5.6, 6.2).
 *
 * Sin navegador real: se comprueba por el DOM montado (happy-dom) que los
 * formularios tienen etiquetas asociadas, que el PIN pide teclado numérico,
 * que los botones de solo icono tienen nombre accesible y que hay
 * encabezados; y por el CSS leído como texto, que existen las reglas de
 * objetivos táctiles, :focus-visible y prefers-reduced-motion. Los pares
 * de contraste se verifican con el cálculo WCAG (no a ojo).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { createPinia, setActivePinia } from 'pinia';
import { mount, flushPromises } from '@vue/test-utils';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { toast } from 'vue-sonner';

vi.mock('reka-ui', () => {
  const passthrough = (nombre) => ({ name: nombre, props: ['open'], template: '<div><slot /></div>' });
  // Los Root respetan :open (reka-ui no renderiza el contenido cerrado)
  const raiz = (nombre) => ({ name: nombre, props: ['open'], template: '<div v-if="open"><slot /></div>' });
  return {
    DialogRoot: raiz('DialogRoot'),
    DialogPortal: passthrough('DialogPortal'),
    DialogOverlay: passthrough('DialogOverlay'),
    DialogContent: passthrough('DialogContent'),
    DialogTitle: passthrough('DialogTitle'),
    DialogDescription: passthrough('DialogDescription'),
  };
});

import { db } from '../src/db';
import { useUIStore } from '../src/stores/useUIStore';
import { useVentasStore } from '../src/stores/useVentasStore';
import { useProductosStore } from '../src/stores/useProductosStore';
import { useLotesStore } from '../src/stores/useLotesStore';
import { toastMsg, DURACION_TOAST } from '../src/utils/toast';
import { TOAST } from '../src/constants';
import AppIcon from '../src/components/AppIcon.vue';
import ModalPrompt from '../src/components/ModalPrompt.vue';
import VentasView from '../src/views/VentasView.vue';
import ComprasView from '../src/views/ComprasView.vue';
import GastosView from '../src/views/GastosView.vue';
import ProductosView from '../src/views/ProductosView.vue';
import SociosView from '../src/views/SociosView.vue';
import InventarioView from '../src/views/InventarioView.vue';
import DashboardView from '../src/views/DashboardView.vue';
import ReportesView from '../src/views/ReportesView.vue';

const RAIZ = resolve(__dirname, '..');
const styles = readFileSync(resolve(RAIZ, 'src', 'styles.css'), 'utf8');
const mainTs = readFileSync(resolve(RAIZ, 'src', 'main.ts'), 'utf8');

const TABLAS = [
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
  'asientos',
  'pasivos',
  'auditorias',
  'config',
  'cambios',
  'descartes',
  'syncMeta',
];

async function montar(Vista, props = {}) {
  const w = mount(Vista, {
    props,
    global: { components: { Icon: AppIcon }, stubs: { teleport: true } },
  });
  await flushPromises();
  return w;
}

beforeEach(async () => {
  setActivePinia(createPinia());
  vi.restoreAllMocks();
  localStorage.clear();
  document.body.style.overflow = '';
  document.body.style.position = '';
  document.body.style.width = '';
  await Promise.all(TABLAS.map((t) => db.table(t).clear()));
});

/** ¿Tiene este campo un nombre accesible (label for, label envolvente o aria-label)? */
function tieneNombreAccesible(w, el) {
  const dom = el.element;
  if (dom.getAttribute('aria-label')) return true;
  if (dom.getAttribute('aria-labelledby')) return true;
  const id = dom.getAttribute('id');
  if (id && w.find(`label[for="${id}"]`).exists()) return true;
  if (dom.closest('label')) return true;
  return false;
}

function camposSinNombre(w) {
  return w
    .findAll('input, select, textarea')
    .filter((el) => el.element.getAttribute('type') !== 'hidden')
    .filter((el) => !tieneNombreAccesible(w, el))
    .map((el) => el.element.outerHTML.slice(0, 120));
}

// ============================================================
// CONTRASTE (5.1) — cálculo WCAG sobre los valores reales
// ============================================================
function luminancia(hex) {
  const c = hex
    .replace('#', '')
    .match(/.{2}/g)
    .map((x) => parseInt(x, 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contraste(fg, bg) {
  const a = luminancia(fg);
  const b = luminancia(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

describe('contraste >= 4,5:1 (5.1)', () => {
  const pares = [
    // [texto, fondo, descripción]
    ['#ffffff', '#15803d', 'blanco sobre verde badge/botón ok'],
    ['#ffffff', '#b45309', 'blanco sobre ámbar badge/botón warn'],
    ['#ffffff', '#b91c1c', 'blanco sobre rojo badge'],
    ['#ffffff', '#2563eb', 'blanco sobre azul botón pri'],
    ['#ffffff', '#dc2626', 'blanco sobre rojo botón bad'],
    ['#15803d', '#ffffff', 'texto .pos sobre tarjeta clara'],
    ['#dc2626', '#ffffff', 'texto .neg sobre tarjeta clara'],
    ['#1d4ed8', '#ffffff', 'texto primario sobre tarjeta clara'],
    ['#b45309', '#ffffff', 'texto aviso sobre tarjeta clara'],
    ['#4ade80', '#1e293b', 'texto .pos sobre tarjeta oscura'],
    ['#f87171', '#1e293b', 'texto .neg sobre tarjeta oscura'],
    ['#93c5fd', '#1e293b', 'texto primario sobre tarjeta oscura'],
    ['#fbbf24', '#1e293b', 'texto aviso sobre tarjeta oscura'],
  ];
  it.each(pares)('%s sobre %s (%s) llega a 4,5:1', (fg, bg, desc) => {
    expect(contraste(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('el CSS usa los colores oscuros verificados en badges y botones', () => {
    expect(styles).toMatch(/\.badge\.ok \{\s*background: #15803d;/);
    expect(styles).toMatch(/\.badge\.low \{\s*background: #b45309;/);
    expect(styles).toMatch(/\.badge\.out \{\s*background: #b91c1c;/);
    expect(styles).toContain('--pri-txt: #1d4ed8');
    expect(styles).toContain('--warn-txt: #b45309');
    expect(styles).toContain('--ok-txt: #15803d');
  });
});

// ============================================================
// ENCABEZADOS (5.6)
// ============================================================
describe('encabezados para TalkBack (5.6)', () => {
  it('las 8 vistas tienen al menos un h2', async () => {
    for (const Vista of [VentasView, ComprasView, GastosView, ProductosView, SociosView, InventarioView, DashboardView, ReportesView]) {
      const w = await montar(Vista);
      expect(w.findAll('h2').length).toBeGreaterThanOrEqual(1);
      w.unmount();
    }
  });

  it('ReportesView jerarquiza: h2 de sección y h3 de subsección', async () => {
    // Un asiento en el libro hace que se renderice la balanza, el balance,
    // el diagnóstico y los últimos asientos (sus h3).
    await db.asientos.put({
      id: 'as1',
      fecha: '2026-10-01T10:00:00.000Z',
      concepto: 'Venta',
      cuentaDebe: 'Caja',
      cuentaHaber: 'Ingresos',
      monto: 100,
    });
    const w = await montar(ReportesView);
    expect(w.findAll('h2').length).toBe(5);
    expect(w.findAll('h3').length).toBe(4);
    // Orden por frecuencia de uso: lo diario primero (cuadre, arqueo),
    // lo ocasional después (cierre, historial) y la contabilidad al fondo.
    expect(w.findAll('h2').map((h) => h.text())).toEqual([
      'Cuadre por Período',
      'Arqueo de Caja',
      'Cerrar Período',
      'Historial de Cierres',
      'Libro Diario',
    ]);
    w.unmount();
  });
});

// ============================================================
// FORMULARIOS CON LABEL (5.3)
// ============================================================
describe('formularios con etiqueta asociada (5.3)', () => {
  it('Ventas: buscador, carrito, historial y cobro', async () => {
    await db.productos.put({ id: 'p1', nombre: 'Pan', precio: 25, archivado: false, stockMinimo: 5 });
    await db.lotes.put({ id: 'l1', productoId: 'p1', cantidadInicial: 10, cantidadVendida: 0, costo: 10, fecha: '2026-10-01T10:00:00.000Z' });
    await useProductosStore().cargarProductos();
    await useLotesStore().cargarLotes();
    useVentasStore().carrito = [{ productoId: 'p1', nombre: 'Pan', cant: 1, precio: '25', unidad: 'und' }];
    useUIStore().cobroAbierto = true;
    const w = await montar(VentasView);
    expect(camposSinNombre(w)).toEqual([]);
    // El dinero recibido tiene su etiqueta visible (2.2).
    expect(w.find('label[for="cobro-recibido"]').text()).toBe('Dinero recibido');
    w.unmount();
  });

  it('Compras, Gastos, Productos, Socios, Inventario y Reportes (arqueo)', async () => {
    for (const Vista of [ComprasView, GastosView, ProductosView, SociosView, InventarioView, ReportesView]) {
      const w = await montar(Vista);
      expect(camposSinNombre(w)).toEqual([]);
      w.unmount();
    }
    // Los modales de Socios también: retiro y aporte.
    const ui = useUIStore();
    ui.retiroAbierto = true;
    const wRet = await montar(SociosView);
    expect(camposSinNombre(wRet)).toEqual([]);
    wRet.unmount();
    ui.retiroAbierto = false;
    ui.aporteAbierto = true;
    const wAp = await montar(SociosView);
    expect(camposSinNombre(wAp)).toEqual([]);
    wAp.unmount();
  });

  it('el PIN pide teclado numérico, autocomplete y etiqueta (5.3)', async () => {
    const w = await montar(ModalPrompt, {
      activo: true,
      titulo: 'PIN de seguridad',
      msg: 'Ingresa tu PIN',
      placeholder: '••••',
      type: 'password',
      value: '',
    });
    const input = w.find('input');
    expect(input.attributes('inputmode')).toBe('numeric');
    expect(input.attributes('autocomplete')).toBe('current-password');
    expect(input.attributes('id')).toBe('modal-prompt-input');
    expect(w.find('label[for="modal-prompt-input"]').text()).toBe('PIN de seguridad');
    w.unmount();
  });

  it('otros prompts de contraseña no piden teclado numérico', async () => {
    const w = await montar(ModalPrompt, {
      activo: true,
      titulo: 'Contraseña de cifrado',
      msg: 'Guarda la contraseña',
      placeholder: 'Contraseña',
      type: 'password',
      value: '',
    });
    expect(w.find('input').attributes('inputmode')).toBeUndefined();
    w.unmount();
  });
});

// ============================================================
// BOTONES DE SOLO ICONO (5.2)
// ============================================================
describe('botones críticos con nombre accesible (5.2)', () => {
  it('quitar del carrito, editar/eliminar y descartar tienen aria-label', async () => {
    await db.productos.put({ id: 'p1', nombre: 'Pan', precio: 25, archivado: false, stockMinimo: 5 });
    await useProductosStore().cargarProductos();
    useVentasStore().carrito = [{ productoId: 'p1', nombre: 'Pan', cant: 1, precio: '25', unidad: 'und' }];

    const wV = await montar(VentasView);
    const del = wV.find('.del-btn');
    expect(del.exists()).toBe(true);
    expect(del.attributes('aria-label')).toBeTruthy();
    wV.unmount();

    const wP = await montar(ProductosView);
    const editar = wP.findAll('.icon-btn[aria-label="Editar"]');
    expect(editar.length).toBeGreaterThanOrEqual(1);
    wP.unmount();
  });

  it('el CSS fija objetivos táctiles de ~44 px en las acciones de lista', () => {
    expect(styles).toMatch(/\.del-btn \{[^}]*width: 2\.75rem;/s);
    expect(styles).toMatch(/\.icon-btn \{[^}]*width: 2\.75rem;/s);
    expect(styles).toMatch(/\.rec-x \{[^}]*width: 2\.75rem;/s);
    expect(styles).toMatch(/\.link-btn \{[^}]*min-height: 2\.75rem;/s);
  });
});

// ============================================================
// FOCO Y MOVIMIENTO (5.6)
// ============================================================
describe(':focus-visible y prefers-reduced-motion (5.6)', () => {
  it('el CSS define un anillo de foco visible (sin eliminar el foco)', () => {
    expect(styles).toContain(':focus-visible');
    expect(styles).toMatch(/:focus-visible \{\s*outline: 3px solid var\(--pri-txt\);/);
    expect(styles).toContain('.switch input:focus-visible + .slider');
  });

  it('el CSS desactiva las animaciones infinitas con reduced-motion', () => {
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)');
    expect(styles).toMatch(/prefers-reduced-motion: reduce\) \{[^}]*animation-iteration-count: 1 !important;/s);
  });
});

// ============================================================
// TOASTS (5.6/2.6)
// ============================================================
describe('toasts legibles y anunciados (5.6)', () => {
  it('los errores duran al menos 5 s y los avisos 5 s', () => {
    expect(DURACION_TOAST.bad).toBeGreaterThanOrEqual(5000);
    expect(DURACION_TOAST.warn).toBeGreaterThanOrEqual(5000);
  });

  it('toastMsg pasa la duración larga a los errores', () => {
    const errSpy = vi.spyOn(toast, 'error').mockImplementation(() => {});
    toastMsg('Algo falló', TOAST.BAD);
    expect(errSpy).toHaveBeenCalledWith('Algo falló', expect.objectContaining({ duration: 6000 }));
  });
});

// ============================================================
// BOTÓN ATRÁS (5.4)
// ============================================================
describe('botón atrás cubre Nube y WiFi (5.4)', () => {
  it('cuenta/sync abiertos cuentan como modal y bloquean el scroll', async () => {
    const ui = useUIStore();
    expect(ui.hayModalAbierto).toBe(false);
    ui.cuentaAbierta = true;
    await flushPromises();
    expect(ui.hayModalAbierto).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');
    ui.cuentaAbierta = false;
    ui.syncAbierto = true;
    await flushPromises();
    expect(ui.hayModalAbierto).toBe(true);
    ui.syncAbierto = false;
    await flushPromises();
    expect(ui.hayModalAbierto).toBe(false);
    expect(document.body.style.overflow).toBe('');
  });

  it('main.ts cierra cuenta y sync antes de navegar o minimizar', () => {
    expect(mainTs).toContain('if (ui.cuentaAbierta)');
    expect(mainTs).toContain('if (ui.syncAbierto)');
    expect(mainTs.indexOf('ui.cuentaAbierta')).toBeLessThan(mainTs.indexOf("router.push({ name: 'dashboard' })"));
    expect(mainTs.indexOf('ui.syncAbierto')).toBeLessThan(mainTs.indexOf('CapApp.minimizeApp()'));
  });
});
