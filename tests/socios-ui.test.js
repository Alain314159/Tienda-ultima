/**
 * Tests PROFUNDOS de SociosView + useCapitalStore — Área 4 de la campaña
 * de cobertura profunda (80-90% de la app).
 *
 * El patrimonio: socios (aporte inicial intocable), reparto de ganancia,
 * retiros (ganancia/capital), aportes adicionales, migración de aportes
 * viejos sin socio e historiales. Todo por el DOM real.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { createPinia, setActivePinia } from 'pinia';
import { mount, flushPromises } from '@vue/test-utils';
import { toast } from 'vue-sonner';

import { db } from '../src/db';
import { useCapitalStore } from '../src/stores/useCapitalStore';
import { useConfigStore } from '../src/stores/useConfigStore';
import { useUIStore } from '../src/stores/useUIStore';
import { useVentasStore } from '../src/stores/useVentasStore';
import AppIcon from '../src/components/AppIcon.vue';
import SociosView from '../src/views/SociosView.vue';

const PERIODO_INI = '2026-09-01T00:00:00.000Z';

async function montar() {
  const wrapper = mount(SociosView, {
    global: { components: { Icon: AppIcon }, stubs: { teleport: true } },
  });
  await flushPromises();
  return wrapper;
}

async function esperar(cond, ms = 3000) {
  const fin = Date.now() + ms;
  while (!cond() && Date.now() < fin) {
    await new Promise((r) => setTimeout(r, 25));
    await flushPromises();
  }
  return cond();
}

async function cargarCapital() {
  const c = useCapitalStore();
  await Promise.all([c.cargarCapital(), c.cargarSocios(), c.cargarDistribuciones(), c.cargarRetiros()]);
}

async function clickBoton(w, texto) {
  const btn = w.findAll('button').filter((b) => b.text().includes(texto));
  expect(btn.length).toBeGreaterThan(0);
  await btn[0].trigger('click');
  await flushPromises();
}

/** Click por texto EXACTO dentro del modal abierto (evita los toggles
 * Ganancia/Capital, que alternan a clase 'ghost' y colaban con .btn.ghost). */
async function clickEnModal(w, textoExacto) {
  const btn = w.findAll('.modal button').filter((b) => b.text().trim() === textoExacto);
  expect(btn.length).toBeGreaterThan(0);
  await btn[0].trigger('click');
  await flushPromises();
}

/** Siembra ganancia del período (base de gananciaDisponible). */
async function sembrarGanancia(ganancia) {
  await db.ventas.put({
    id: 'vg1',
    fecha: '2026-10-05T12:00:00.000Z',
    items: [
      { productoId: 'px', nombre: 'X', cantidad: 1, unidad: '', precio: ganancia, costo: 0, ganancia, lotesUsados: [] },
    ],
    total: ganancia,
    ganancia,
    anulada: false,
  });
  await useVentasStore().cargarVentas();
}

beforeEach(async () => {
  setActivePinia(createPinia());
  vi.restoreAllMocks();
  await Promise.all([
    db.socios.clear(),
    db.capital.clear(),
    db.distribuciones.clear(),
    db.retiros.clear(),
    db.ventas.clear(),
    db.gastos.clear(),
    db.cierres.clear(),
    db.config.clear(),
  ]);
  const config = useConfigStore();
  config.cfg.periodoInicio = PERIODO_INI;
  config.cfg.capitalInicial = 1000;
  await cargarCapital();
});

// ============================================================
// FORMULARIO DE SOCIO
// ============================================================
describe('SociosView: alta/edición de socios', () => {
  it('crea socio con aporte inicial: aportesTotal lo incluye y la lista lo muestra', async () => {
    vi.spyOn(toast, 'success').mockImplementation(() => {});
    const w = await montar();
    await w.find('input[placeholder="Nombre del socio"]').setValue('Yuliet');
    await w.find('input[placeholder="% participacion"]').setValue('75');
    await w.find('input[placeholder="Aporte inicial"]').setValue('500');
    await clickBoton(w, 'Agregar Socio');

    await esperar(() => useCapitalStore().socios.length === 1);
    const s = (await db.socios.toArray())[0];
    expect(s.nombre).toBe('Yuliet');
    expect(s.porcentaje).toBe(75);
    expect(s.aporte).toBe(500);
    expect(s.activo).toBe(true);

    // El aporte inicial entra al patrimonio
    expect(useCapitalStore().aportesTotal).toBe(500);
    expect(w.text()).toContain('Yuliet');
    expect(w.text()).toContain('75.00%');
    expect(w.text()).toContain('Aporte inicial $500.00');
    w.unmount();
  });

  it('validaciones: nombre, porcentaje fuera de rango, aporte negativo, duplicado', async () => {
    const errSpy = vi.spyOn(toast, 'error').mockImplementation(() => {});
    const w = await montar();

    await clickBoton(w, 'Agregar Socio'); // sin nombre
    await w.find('input[placeholder="Nombre del socio"]').setValue('Yuliet');
    await w.find('input[placeholder="% participacion"]').setValue('150');
    await clickBoton(w, 'Agregar Socio');
    await w.find('input[placeholder="% participacion"]').setValue('-5');
    await clickBoton(w, 'Agregar Socio');
    await w.find('input[placeholder="% participacion"]').setValue('1e999');
    await clickBoton(w, 'Agregar Socio');
    await w.find('input[placeholder="% participacion"]').setValue('50');
    await w.find('input[placeholder="Aporte inicial"]').setValue('-10');
    await clickBoton(w, 'Agregar Socio'); // aporte negativo
    expect(errSpy).toHaveBeenCalledTimes(5);
    expect(await db.socios.count()).toBe(0);

    // Aporte Infinity también rechazado
    await w.find('input[placeholder="Aporte inicial"]').setValue('1e999');
    await clickBoton(w, 'Agregar Socio');
    expect(errSpy).toHaveBeenCalledTimes(6);
    expect(await db.socios.count()).toBe(0);

    // Duplicado (insensible a mayúsculas)
    await w.find('input[placeholder="Aporte inicial"]').setValue('100');
    await clickBoton(w, 'Agregar Socio');
    await esperar(() => useCapitalStore().socios.length === 1);
    await w.find('input[placeholder="Nombre del socio"]').setValue('YULIET');
    await w.find('input[placeholder="% participacion"]').setValue('100');
    await clickBoton(w, 'Agregar Socio');
    expect(errSpy).toHaveBeenCalledWith('Ya existe ese socio', expect.anything());
    expect(await db.socios.count()).toBe(1);
    w.unmount();
  });

  it('editar: nombre y porcentaje cambian; el aporte inicial está bloqueado', async () => {
    vi.spyOn(toast, 'success').mockImplementation(() => {});
    const errSpy = vi.spyOn(toast, 'error').mockImplementation(() => {});
    await db.socios.put({ id: 'so1', nombre: 'Yuliet', porcentaje: 75, aporte: 500, activo: true });
    await cargarCapital();

    const w = await montar();
    await w.find('button[aria-label="Editar"]').trigger('click');
    await flushPromises();
    expect(w.find('input[placeholder="Nombre del socio"]').element.value).toBe('Yuliet');

    // Cambiar el aporte inicial: bloqueado (es un hecho contable)
    await w.find('input[placeholder="Aporte inicial"]').setValue('999');
    await clickBoton(w, 'Actualizar');
    expect(errSpy).toHaveBeenCalled();
    expect((await db.socios.get('so1')).aporte).toBe(500);

    // Cambiar nombre y porcentaje: permitido
    await w.find('input[placeholder="Nombre del socio"]').setValue('Yuliet Cruz');
    await w.find('input[placeholder="Aporte inicial"]').setValue('500');
    await w.find('input[placeholder="% participacion"]').setValue('60');
    await clickBoton(w, 'Actualizar');
    await esperar(() => useCapitalStore().socios[0]?.nombre === 'Yuliet Cruz');
    const s = await db.socios.get('so1');
    expect(s.nombre).toBe('Yuliet Cruz');
    expect(s.porcentaje).toBe(60);
    w.unmount();
  });

  it('eliminar socio CON aporte: caja intacta, aporte materializado como capital', async () => {
    vi.spyOn(toast, 'success').mockImplementation(() => {});
    await db.socios.put({ id: 'so1', nombre: 'Yuliet', porcentaje: 100, aporte: 500, activo: true });
    await db.distribuciones.put({
      id: 'd1',
      fecha: '2026-10-01T10:00:00.000Z',
      socioId: 'so1',
      socioNombre: 'Yuliet',
      montoTotal: 100,
      monto: 100,
      porcentaje: 100,
      concepto: 'Reparto previo',
    });
    await cargarCapital();

    const w = await montar();
    await w.find('button[aria-label="Eliminar"]').trigger('click');
    await flushPromises();
    // El mensaje explica que el aporte queda en el negocio
    expect(useUIStore().confirm.msg).toContain('500.00');
    expect(useUIStore().confirm.msg).toContain('la caja NO cambia');
    useUIStore().okConfirm();
    await esperar(() => useCapitalStore().socios.length === 0);

    expect(await db.socios.count()).toBe(0);
    // El aporte quedó materializado como movimiento de capital (caja intacta)
    const caps = await db.capital.toArray();
    expect(caps.length).toBe(1);
    expect(caps[0].monto).toBe(500);
    expect(caps[0].nota).toBeTruthy();
    expect(useCapitalStore().aportesTotal).toBe(500);
    // La distribución previa se conserva
    expect(await db.distribuciones.count()).toBe(1);
    w.unmount();
  });

  it('suma de porcentajes: OK al 100%, aviso cuando no', async () => {
    await db.socios.bulkPut([
      { id: 'so1', nombre: 'A', porcentaje: 75, aporte: 0, activo: true },
      { id: 'so2', nombre: 'B', porcentaje: 20, aporte: 0, activo: true },
    ]);
    await cargarCapital();

    const w = await montar();
    expect(w.text()).toContain('95%');
    expect(w.text()).toContain('debe sumar 100%');

    await db.socios.put({ id: 'so2', nombre: 'B', porcentaje: 25, aporte: 0, activo: true });
    await cargarCapital();
    await esperar(() => useCapitalStore().sumaPorcentajes === 100);
    expect(w.text()).toContain('OK');
    w.unmount();
  });
});

// ============================================================
// REPARTO DE GANANCIA
// ============================================================
describe('SociosView: reparto de ganancia', () => {
  beforeEach(async () => {
    await db.socios.bulkPut([
      { id: 'so1', nombre: 'Yuliet', porcentaje: 75, aporte: 500, activo: true },
      { id: 'so2', nombre: 'Eliezer', porcentaje: 25, aporte: 200, activo: true },
    ]);
    await sembrarGanancia(1000);
    await cargarCapital();
  });

  it('preview del reparto por socio antes de ejecutar', async () => {
    const w = await montar();
    await w.find('input[placeholder="Monto a repartir"]').setValue('200');
    await flushPromises();
    expect(w.text()).toContain('Yuliet (75.00%)');
    expect(w.text()).toContain('$150.00');
    expect(w.text()).toContain('Eliezer (25.00%)');
    expect(w.text()).toContain('$50.00');
    w.unmount();
  });

  it('reparto feliz: distribuciones exactas, retiro espejo, disponible baja', async () => {
    vi.spyOn(toast, 'success').mockImplementation(() => {});
    vi.spyOn(toast, 'error').mockImplementation(() => {});
    const w = await montar();
    await w.find('input[placeholder="Monto a repartir"]').setValue('200');
    await w.find('input[placeholder="Concepto (ej: Reparto mensual)"]').setValue('Octubre');
    await clickBoton(w, 'Repartir');

    await esperar(() => useCapitalStore().distribuciones.length === 2);

    const dists = await db.distribuciones.toArray();
    const porYuliet = dists.find((d) => d.socioId === 'so1');
    const porEliezer = dists.find((d) => d.socioId === 'so2');
    expect(porYuliet.monto).toBe(150);
    expect(porEliezer.monto).toBe(50);
    expect(porYuliet.concepto).toBe('Octubre');

    // El retiro espejo baja la ganancia disponible
    const retiros = await db.retiros.toArray();
    expect(retiros.length).toBe(1);
    expect(retiros[0].monto).toBe(200);
    expect(retiros[0].concepto).toContain('Reparto a socios');
    await esperar(() => useCapitalStore().gananciaDisponible === 800);

    // Historial visible + form reseteado
    expect(w.text()).toContain('+$150.00');
    expect(w.text()).toContain('+$50.00');
    expect(w.find('input[placeholder="Monto a repartir"]').element.value).toBe('');
    w.unmount();
  });

  it('validaciones del reparto: monto, disponible y porcentajes', async () => {
    const errSpy = vi.spyOn(toast, 'error').mockImplementation(() => {});
    const w = await montar();

    await clickBoton(w, 'Repartir'); // monto 0
    await w.find('input[placeholder="Monto a repartir"]').setValue('5000');
    await clickBoton(w, 'Repartir'); // > disponible (1000)
    expect(errSpy).toHaveBeenCalledTimes(2);
    expect(await db.distribuciones.count()).toBe(0);

    // Porcentajes que no suman 100
    await db.socios.put({ id: 'so2', nombre: 'Eliezer', porcentaje: 30, aporte: 200, activo: true });
    await cargarCapital();
    await w.find('input[placeholder="Monto a repartir"]').setValue('100');
    await clickBoton(w, 'Repartir');
    expect(errSpy).toHaveBeenCalledTimes(3);
    expect(await db.distribuciones.count()).toBe(0);
    w.unmount();
  });

  it('con PIN activo, repartir pide el PIN antes de tocar la BD', async () => {
    const config = useConfigStore();
    config.cfg.pinActivo = true;
    config.cfg.pin = '1234';

    const w = await montar();
    await w.find('input[placeholder="Monto a repartir"]').setValue('100');
    await clickBoton(w, 'Repartir');
    await flushPromises();

    const ui = useUIStore();
    expect(ui.prompt.activo).toBe(true);
    expect(await db.distribuciones.count()).toBe(0);
    ui.cancelPrompt();
    await flushPromises();
    expect(await db.distribuciones.count()).toBe(0);
    w.unmount();
  });
});

// ============================================================
// RETIROS Y APORTES (modales)
// ============================================================
describe('SociosView: retiros y aportes', () => {
  beforeEach(async () => {
    await db.socios.put({ id: 'so1', nombre: 'Yuliet', porcentaje: 100, aporte: 500, activo: true });
    await sembrarGanancia(1000);
    await cargarCapital();
  });

  it('retiro de ganancia por el modal: valida, registra y cierra', async () => {
    vi.spyOn(toast, 'success').mockImplementation(() => {});
    const errSpy = vi.spyOn(toast, 'error').mockImplementation(() => {});
    const w = await montar();
    await clickBoton(w, 'Retirar');

    expect(w.text()).toContain('Ganancia disponible');
    expect(w.text()).toContain('$1,000.00');

    // Sin concepto: rechazado (el botón confirmar vive DENTRO del modal:
    // el que abre el modal también dice "Retirar" y hay que desambiguar)
    await w.find('input[placeholder="Monto a retirar"]').setValue('100');
    await w.find('.modal .btn.bad').trigger('click');
    await flushPromises();
    expect(errSpy).toHaveBeenCalledWith('Concepto obligatorio', expect.anything());
    expect(await db.retiros.count()).toBe(0);

    // Excede disponible: rechazado
    await w.find('input[placeholder="Concepto (obligatorio)"]').setValue('Gasto personal');
    await w.find('input[placeholder="Monto a retirar"]').setValue('5000');
    await w.find('.modal .btn.bad').trigger('click');
    await flushPromises();
    expect(errSpy).toHaveBeenCalledTimes(2);
    expect(await db.retiros.count()).toBe(0);

    // Monto válido
    await w.find('input[placeholder="Monto a retirar"]').setValue('300');
    await w.find('.modal .btn.bad').trigger('click');
    await esperar(() => useCapitalStore().retiros.length === 1);

    const r = (await db.retiros.toArray())[0];
    expect(r.monto).toBe(300);
    expect(r.tipoRetiro).toBe('ganancia');
    expect(useCapitalStore().gananciaDisponible).toBe(700);
    expect(useUIStore().retiroAbierto).toBe(false);
    // Historial de capital lo muestra en negativo (render tras el reload)
    await esperar(() => w.text().includes('-$300.00'));
    w.unmount();
  });

  it('retiro de capital muestra el capital disponible (inicial + aportes)', async () => {
    vi.spyOn(toast, 'success').mockImplementation(() => {});
    const w = await montar();
    await clickBoton(w, 'Retirar');
    await clickBoton(w, 'Capital');
    expect(w.text()).toContain('Capital disponible');
    expect(w.text()).toContain('$1,500.00'); // 1000 inicial + 500 aporte socio

    await w.find('input[placeholder="Monto a retirar"]').setValue('200');
    await w.find('input[placeholder="Concepto (obligatorio)"]').setValue('Devolución');
    await w.find('.modal .btn.bad').trigger('click');
    await esperar(() => useCapitalStore().retiros.length === 1);
    expect((await db.retiros.toArray())[0].tipoRetiro).toBe('capital');
    w.unmount();
  });

  it('aporte adicional asignado a un socio (y el general sin socio)', async () => {
    vi.spyOn(toast, 'success').mockImplementation(() => {});
    const w = await montar();
    await clickBoton(w, 'Aportar');

    await w.find('input[placeholder="Monto del aporte"]').setValue('250');
    await w.find('input[placeholder="Nota (opcional)"]').setValue('inyección extra');
    await w
      .findAll('select')
      .filter((s) => s.findAll('option').length > 1)[0]
      .setValue('so1');
    await clickBoton(w, 'Registrar Aporte');
    await esperar(() => useCapitalStore().capital.length === 1);

    const cap = (await db.capital.toArray())[0];
    expect(cap.monto).toBe(250);
    expect(cap.socioId).toBe('so1');
    expect(cap.nota).toBe('inyección extra');
    expect(useUIStore().aporteAbierto).toBe(false);
    // Aportes extra del socio visibles en la lista
    expect(w.text()).toContain('Aportes extra $250.00');
    w.unmount();
  });

  it('aporte con monto Infinity rechazado sin escribir', async () => {
    const errSpy = vi.spyOn(toast, 'error').mockImplementation(() => {});
    const w = await montar();
    await clickBoton(w, 'Aportar');
    await w.find('input[placeholder="Monto del aporte"]').setValue('1e999');
    await clickBoton(w, 'Registrar Aporte');
    expect(errSpy).toHaveBeenCalled();
    expect(await db.capital.count()).toBe(0);
    expect(useUIStore().aporteAbierto).toBe(true); // modal sigue abierto
    w.unmount();
  });

  it('cancelar retiro y aporte no escribe nada', async () => {
    const w = await montar();
    await clickBoton(w, 'Retirar');
    await w.find('input[placeholder="Monto a retirar"]').setValue('100');
    await clickEnModal(w, 'Cancelar');
    expect(useUIStore().retiroAbierto).toBe(false);

    await clickBoton(w, 'Aportar');
    await w.find('input[placeholder="Monto del aporte"]').setValue('100');
    await clickEnModal(w, 'Cancelar');
    expect(useUIStore().aporteAbierto).toBe(false);
    expect(await db.retiros.count()).toBe(0);
    expect(await db.capital.count()).toBe(0);
    w.unmount();
  });
});

// ============================================================
// APORTES SIN ASIGNAR (migración del módulo viejo)
// ============================================================
describe('SociosView: aportes sin asignar', () => {
  it('aportes viejos sin socio: card visible, asignación masiva con confirmación', async () => {
    vi.spyOn(toast, 'success').mockImplementation(() => {});
    const errSpy = vi.spyOn(toast, 'error').mockImplementation(() => {});
    await db.socios.put({ id: 'so1', nombre: 'Yuliet', porcentaje: 100, aporte: 0, activo: true });
    await db.capital.bulkPut([
      { id: 'c1', fecha: '2026-01-10T10:00:00.000Z', monto: 300, nota: 'aporte viejo', socioId: null },
      { id: 'c2', fecha: '2026-02-10T10:00:00.000Z', monto: 200, nota: 'otro', socioId: null },
    ]);
    await cargarCapital();

    const w = await montar();
    expect(w.text()).toContain('Aportes sin asignar');
    expect(w.text()).toContain('2 aporte(s)');
    expect(w.text()).toContain('$500.00');

    // Sin elegir socio: rechazado
    await clickBoton(w, 'Asignar a este socio');
    expect(errSpy).toHaveBeenCalledWith('Elige un socio primero', expect.anything());

    // Elegir y confirmar
    await w.find('select').setValue('so1');
    await clickBoton(w, 'Asignar a este socio');
    expect(useUIStore().confirm.msg).toContain('2 aporte(s)');
    useUIStore().okConfirm();
    await esperar(() => (useCapitalStore().capital || []).every((c) => c.socioId === 'so1'));

    const caps = await db.capital.toArray();
    expect(caps.every((c) => c.socioId === 'so1')).toBe(true);
    // La card desaparece
    await esperar(() => !w.text().includes('Aportes sin asignar'));
    w.unmount();
  });

  it('sin aportes huérfanos la card no existe', async () => {
    const w = await montar();
    expect(w.text()).not.toContain('Aportes sin asignar');
    w.unmount();
  });
});
