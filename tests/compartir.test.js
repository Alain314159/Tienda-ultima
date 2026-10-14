/**
 * Tests de useCompartir (lista de precios / existencia) — antes 6.2% cubierto.
 * Cubre: formato WhatsApp (negritas, escalones, empaques), contacto ahora
 * editable por cfg (regresión: estaba hardcodeado), orden alfabético,
 * archivados excluidos, share/clipboard con fallback.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { createPinia, setActivePinia } from 'pinia';

import { db } from '../src/db';
import { useCompartir } from '../src/composables/useCompartir';
import { useProductosStore } from '../src/stores/useProductosStore';
import { useLotesStore } from '../src/stores/useLotesStore';
import { useConfigStore } from '../src/stores/useConfigStore';

function mockClipboard(write, { sinShare = false } = {}) {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: write }, configurable: true });
  Object.defineProperty(navigator, 'share', { value: sinShare ? undefined : vi.fn(), configurable: true });
}

beforeEach(async () => {
  setActivePinia(createPinia());
  await Promise.all([db.productos.clear(), db.lotes.clear(), db.config.clear()]);
});

async function sembrar(productos) {
  const p = useProductosStore();
  for (const prod of productos) await db.productos.put(prod);
  await p.cargarProductos();
  return p;
}

describe('generarTextoPrecios', () => {
  it('arma la lista con nombre, fecha, precios y escalones ordenados', async () => {
    await sembrar([
      {
        id: 'p1',
        nombre: 'Refresco',
        precio: 25,
        preciosEscalonados: [
          { min: 12, precio: 22 },
          { min: 6, precio: 23 },
        ],
      },
      { id: 'p2', nombre: 'Aceite', precio: 120 },
    ]);
    const { generarTextoPrecios } = useCompartir();
    const texto = generarTextoPrecios();
    expect(texto).toContain('🛒 *TIENDA PRO*');
    expect(texto).toContain('_Lista de precios · ');
    // orden alfabético: Aceite antes que Refresco
    expect(texto.indexOf('*Aceite*')).toBeLessThan(texto.indexOf('*Refresco*'));
    // escalones ordenados por mínimo ascendente
    const i6 = texto.indexOf('Mín. 6');
    const i12 = texto.indexOf('Mín. 12');
    expect(i6).toBeGreaterThan(-1);
    expect(i6).toBeLessThan(i12);
    expect(texto).toContain('$25.00 c/u');
  });

  it('incluye el costo de empaques (precio × unidades)', async () => {
    await sembrar([
      { id: 'p1', nombre: 'Cerveza', precio: 120, empaques: [{ nombre: 'Caja', unidades: 24 }] },
    ]);
    const { generarTextoPrecios } = useCompartir();
    const texto = generarTextoPrecios();
    expect(texto).toContain('📦 Caja x24');
    expect(texto).toContain('$2,880.00');
  });

  it('el contacto sale de la cfg, no del código (regresión hardcodeo)', async () => {
    const config = useConfigStore();
    config.cfg.nombre = 'La Esquina';
    config.cfg.contactoDireccion = 'Av. Reforma 123';
    config.cfg.contactoTelefonos = '555-1234';
    config.cfg.contactoGrupoWa = 'https://chat.whatsapp.com/xyz';
    await sembrar([{ id: 'p1', nombre: 'Pan', precio: 10 }]);
    const { generarTextoPrecios } = useCompartir();
    const texto = generarTextoPrecios();
    expect(texto).toContain('📍 Av. Reforma 123');
    expect(texto).toContain('📞 555-1234');
    expect(texto).toContain('https://chat.whatsapp.com/xyz');
    expect(texto).toContain('*LA ESQUINA*');
    // sin contacto configurado no se imprimen las líneas
    config.cfg.contactoDireccion = '';
    config.cfg.contactoTelefonos = '';
    config.cfg.contactoGrupoWa = '';
    const texto2 = generarTextoPrecios();
    expect(texto2).not.toContain('📍');
    expect(texto2).not.toContain('📞');
  });

  it('sin productos devuelve null', async () => {
    const { generarTextoPrecios } = useCompartir();
    expect(generarTextoPrecios()).toBeNull();
  });

  it('excluye archivados', async () => {
    await sembrar([
      { id: 'p1', nombre: 'Visible', precio: 10 },
      { id: 'p2', nombre: 'Viejo', precio: 10, archivado: true },
    ]);
    const { generarTextoPrecios } = useCompartir();
    const texto = generarTextoPrecios();
    expect(texto).toContain('Visible');
    expect(texto).not.toContain('Viejo');
  });
});

describe('compartir/copiar', () => {
  it('copiarPrecios usa el portapapeles', async () => {
    await sembrar([{ id: 'p1', nombre: 'Pan', precio: 10 }]);
    const write = vi.fn().mockResolvedValue(undefined);
    mockClipboard(write);
    const { copiarPrecios } = useCompartir();
    await copiarPrecios();
    expect(write).toHaveBeenCalled();
    expect(String(write.mock.calls[0][0])).toContain('*Pan*');
  });

  it('compartirExistencia lista nombre: stock de cada producto activo', async () => {
    const p = await sembrar([{ id: 'p1', nombre: 'Pan', precio: 10 }, { id: 'p2', nombre: 'Viejo', archivado: true }]);
    const lotes = useLotesStore();
    await db.lotes.put({ id: 'l1', productoId: 'p1', cantidadInicial: 7, cantidadVendida: 2, costo: 5 });
    await lotes.cargarLotes();
    const write = vi.fn().mockResolvedValue(undefined);
    mockClipboard(write, { sinShare: true });
    const { compartirExistencia } = useCompartir();
    await compartirExistencia();
    const texto = String(write.mock.calls[0][0]);
    expect(texto).toContain('Pan: 5');
    expect(texto).not.toContain('Viejo');
  });

  it('compartirExistencia avisa si no hay productos', async () => {
    mockClipboard(vi.fn().mockResolvedValue(undefined), { sinShare: true });
    const { compartirExistencia } = useCompartir();
    // no lanza; solo toast de aviso
    await expect(compartirExistencia()).resolves.toBeUndefined();
  });
});
