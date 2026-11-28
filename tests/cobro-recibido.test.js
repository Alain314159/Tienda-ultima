/**
 * Tests de la validación del dinero recibido en el cobro (MEJORAS 2.2 y 2.5):
 * - Confirmar Pago exige siempre un dinero recibido válido (> 0).
 * - Si falta dinero, pide confirmación explícita antes de procesar.
 * - Atajos: «Monto exacto» y «+1» por denominación alimentan el recibido.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('../src/utils/toast', () => ({ toastMsg: vi.fn() }));

import { db } from '../src/db';
import { useCobro } from '../src/composables/useCobro';
import { useUIStore } from '../src/stores/useUIStore';
import { useVentasStore } from '../src/stores/useVentasStore';
import { useLotesStore } from '../src/stores/useLotesStore';
import { useProductosStore } from '../src/stores/useProductosStore';
import { toastMsg } from '../src/utils/toast';
import { TOAST } from '../src/constants';

async function limpiarDb() {
  await Promise.all([db.productos.clear(), db.lotes.clear(), db.ventas.clear(), db.config.clear()]);
}

async function semillar() {
  await db.productos.put({ id: 'p_1', nombre: 'Refresco', precio: 15, archivado: false });
  await db.lotes.put({
    id: 'l_1',
    productoId: 'p_1',
    cantidadInicial: 10,
    cantidadVendida: 0,
    costo: 10,
    fecha: new Date().toISOString(),
  });
  await useProductosStore().cargarProductos();
  await useLotesStore().cargarLotes();
  const ventas = useVentasStore();
  ventas.carrito = [{ productoId: 'p_1', nombre: 'Refresco', cant: 2, precio: 15, unidad: 'u' }];
}

async function esperar(cond, ms = 3000) {
  const fin = Date.now() + ms;
  while (!cond() && Date.now() < fin) {
    await new Promise((r) => setTimeout(r, 25));
  }
  return cond();
}

beforeEach(async () => {
  vi.clearAllMocks();
  localStorage.clear();
  await limpiarDb();
  setActivePinia(createPinia());
});

describe('confirmarPago valida el dinero recibido SIEMPRE', () => {
  it('sin recibido no procesa la venta y avisa qué falta', async () => {
    await semillar();
    const { iniciarCobro, confirmarPago, cobroModal } = useCobro();
    iniciarCobro();
    expect(cobroModal.total).toBe(30);
    expect(cobroModal.recibido).toBe('');

    confirmarPago();

    expect(toastMsg).toHaveBeenCalledWith(expect.stringContaining('cuánto dinero recibiste'), TOAST.BAD);
    expect(await db.ventas.count()).toBe(0);
    expect(useUIStore().cobroAbierto).toBe(true);
    expect(useVentasStore().carrito).toHaveLength(1);
  });

  it('recibido 0 o no numérico tampoco confirma', async () => {
    await semillar();
    const { iniciarCobro, confirmarPago, cobroModal } = useCobro();
    iniciarCobro();
    cobroModal.recibido = '0';
    confirmarPago();
    expect(await db.ventas.count()).toBe(0);

    cobroModal.recibido = 'abc';
    confirmarPago();
    expect(await db.ventas.count()).toBe(0);
    expect(toastMsg).toHaveBeenCalledWith(expect.stringContaining('cuánto dinero recibiste'), TOAST.BAD);
  });

  it('recibido menor que el total pide confirmación de falta y no vende hasta aceptar', async () => {
    await semillar();
    const { iniciarCobro, confirmarPago, cobroModal } = useCobro();
    iniciarCobro();
    cobroModal.recibido = '20';
    cobroModal.falta = 10;

    confirmarPago();

    const ui = useUIStore();
    expect(ui.confirm.activo).toBe(true);
    expect(ui.confirm.titulo).toContain('Falta dinero');
    expect(ui.confirm.msg).toContain('faltan');
    expect(await db.ventas.count()).toBe(0);

    ui.confirm.onOk?.();
    await esperar(() => useVentasStore().ventas.length === 1);
    expect((await db.ventas.toArray())[0].total).toBe(30);
  });

  it('recibido igual o mayor que el total vende directo, sin confirmación', async () => {
    await semillar();
    const { iniciarCobro, confirmarPago, cobroModal } = useCobro();
    iniciarCobro();
    cobroModal.recibido = '50';

    confirmarPago();

    expect(useUIStore().confirm.activo).toBe(false);
    await esperar(() => useVentasStore().ventas.length === 1);
    expect((await db.ventas.toArray())[0].total).toBe(30);
    expect(useUIStore().cobroAbierto).toBe(false);
  });
});

describe('atajos de la calculadora de billetes', () => {
  it('montoExacto pone recibido = total y deja falta/sobra en 0', async () => {
    const { cobroModal, montoExacto, actualizarRecibido } = useCobro();
    cobroModal.total = 250;
    cobroModal.recibido = '100';
    actualizarRecibido();
    expect(cobroModal.falta).toBe(150);

    montoExacto();

    expect(cobroModal.recibido).toBe('250');
    expect(cobroModal.falta).toBe(0);
    expect(cobroModal.sobra).toBe(0);
  });

  it('sumarBillete suma +1 en la denominación y alimenta el recibido', async () => {
    const { cobroModal, sumarBillete } = useCobro();
    cobroModal.total = 1000;

    sumarBillete(500);
    sumarBillete(500);
    sumarBillete(100);

    expect(cobroModal.billetes[500]).toBe(2);
    expect(cobroModal.billetes[100]).toBe(1);
    expect(cobroModal.totalContado).toBe(1100);
    expect(cobroModal.recibido).toBe('1100');
    expect(cobroModal.sobra).toBe(100);
    expect(cobroModal.falta).toBe(0);
  });

  it('actualizarRecibido calcula falta y vuelto contra el total', async () => {
    const { cobroModal, actualizarRecibido } = useCobro();
    cobroModal.total = 500;

    cobroModal.recibido = '300';
    actualizarRecibido();
    expect(cobroModal.falta).toBe(200);
    expect(cobroModal.sobra).toBe(0);

    cobroModal.recibido = '700';
    actualizarRecibido();
    expect(cobroModal.falta).toBe(0);
    expect(cobroModal.sobra).toBe(200);
  });

  it('calcBilletes rellena el recibido con el total contado', async () => {
    const { cobroModal, calcBilletes } = useCobro();
    cobroModal.total = 1000;
    cobroModal.billetes = { 500: 2, 100: 1 };

    calcBilletes();

    expect(cobroModal.totalContado).toBe(1100);
    expect(cobroModal.recibido).toBe('1100');
    expect(cobroModal.sobra).toBe(100);
  });

  it('iniciarCobro deja el recibido vacío para la nueva venta', async () => {
    await semillar();
    const { iniciarCobro, cobroModal } = useCobro();
    cobroModal.recibido = '999';
    iniciarCobro();
    expect(cobroModal.recibido).toBe('');
    expect(cobroModal.falta).toBe(0);
    expect(cobroModal.sobra).toBe(0);
  });
});
