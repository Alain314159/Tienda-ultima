/**
 * Tests del indicador de sync del header (SyncIndicador.vue + useNubeStore):
 * cada estado muestra su texto y color, sin conexión manda sobre todos y
 * tocarlo abre la cuenta nube.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { createPinia, setActivePinia } from 'pinia';
import { mount, flushPromises } from '@vue/test-utils';

import SyncIndicador from '../src/components/SyncIndicador.vue';
import { useNubeStore } from '../src/stores/useNubeStore';

function montar(props = {}) {
  return mount(SyncIndicador, { props: { online: true, ...props } });
}

beforeEach(() => {
  setActivePinia(createPinia());
});

describe('SyncIndicador: estados', () => {
  it('sin sesión: gris "Sin sesión" cuando no hay cuenta', () => {
    const w = montar();
    expect(w.attributes('data-estado')).toBe('sin-sesion');
    expect(w.text()).toContain('Sin sesión');
    expect(w.classes()).toContain('sync-idle');
  });

  it('al día: verde cuando la última sync correcta es reciente', async () => {
    const nube = useNubeStore();
    nube.setSesion('dueño@example.com');
    await nube.marcarExito();
    const w = montar();
    await flushPromises();
    expect(w.attributes('data-estado')).toBe('al-dia');
    expect(w.text()).toContain('Al día');
    expect(w.classes()).toContain('sync-ok');
  });

  it('sincronizando: amarillo mientras hay una vuelta en curso', () => {
    const nube = useNubeStore();
    nube.setSesion('dueño@example.com');
    nube.marcarInicio();
    const w = montar();
    expect(w.attributes('data-estado')).toBe('sincronizando');
    expect(w.text()).toContain('Sincronizando');
    expect(w.classes()).toContain('sync-sync');
  });

  it('error: rojo cuando la última vuelta falló', () => {
    const nube = useNubeStore();
    nube.setSesion('dueño@example.com');
    nube.marcarError('sin red');
    const w = montar();
    expect(w.attributes('data-estado')).toBe('error');
    expect(w.text()).toContain('Error de sync');
    expect(w.classes()).toContain('sync-off');
  });

  it('sin sincronizar: rojo cuando la última sync correcta es vieja', () => {
    const nube = useNubeStore();
    nube.setSesion('dueño@example.com');
    nube.ultimaSync = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const w = montar();
    expect(w.attributes('data-estado')).toBe('sin-sincronizar');
    expect(w.text()).toContain('Sin sincronizar');
    expect(w.classes()).toContain('sync-off');
  });

  it('sin sesión pero con sync vieja: sigue siendo "Sin sesión"', () => {
    const nube = useNubeStore();
    nube.ultimaSync = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const w = montar();
    expect(w.attributes('data-estado')).toBe('sin-sesion');
  });

  it('sin conexión: rojo "Sin conexión" aunque haya sesión y sync al día', async () => {
    const nube = useNubeStore();
    nube.setSesion('dueño@example.com');
    await nube.marcarExito();
    const w = montar({ online: false });
    expect(w.attributes('data-estado')).toBe('sin-conexion');
    expect(w.text()).toContain('Sin conexión');
    expect(w.classes()).toContain('sync-off');
  });

  it('tocarlo emite abrir-cuenta', async () => {
    const w = montar();
    await w.trigger('click');
    expect(w.emitted('abrir-cuenta')).toHaveLength(1);
  });
});

describe('useNubeStore: persistencia de la última sync', () => {
  it('marcarExito guarda la fecha en db.config y cargarUltimaSync la lee', async () => {
    const { db } = await import('../src/db');
    const nube = useNubeStore();
    nube.setSesion('dueño@example.com');
    await nube.marcarExito();
    const rec = await db.config.get('ultimaSyncNube');
    expect(rec?.value).toBe(nube.ultimaSync);

    // Simular recarga: store nuevo, misma BD
    setActivePinia(createPinia());
    const nube2 = useNubeStore();
    expect(nube2.ultimaSync).toBeNull();
    await nube2.cargarUltimaSync();
    expect(nube2.ultimaSync).toBe(rec.value);
  });
});
