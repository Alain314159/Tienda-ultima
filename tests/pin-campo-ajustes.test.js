/**
 * Regresión del bug del campo PIN en Ajustes (hallado con navegador real):
 *
 * El input bindeaba v-model="cfg.pin" — pero cfg.pin guarda el HASH pbkdf2
 * (83 chars) tras el primer guardado:
 *   1. El hash colaba al campo: 83 puntos en un input maxlength=6.
 *   2. Editar el PIN era imposible (maxlength bloqueaba el teclado).
 *   3. PEOR: borrar el hash A MEDIAS y guardar corrompía el PIN para
 *      siempre (esPinHasheado daba true → se persistía el hash mutilado
 *      → ni el PIN viejo ni el nuevo verificaban).
 *
 * Contrato nuevo del campo:
 *   - El input SIEMPRE está vacío al abrir Ajustes (nunca muestra el hash).
 *   - Escribir y cambiar → guarda el nuevo PIN (hasheado) y limpia el campo.
 *   - Vacío + change → NO toca el PIN guardado.
 *   - El hint "PIN configurado ✓" aparece solo cuando hay PIN.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { createPinia, setActivePinia } from 'pinia';
import { mount, flushPromises } from '@vue/test-utils';

import { db } from '../src/db';
import { useConfigStore } from '../src/stores/useConfigStore';
import { useUIStore } from '../src/stores/useUIStore';
import { esPinHasheado, verificarPin } from '../src/services/pin';
import AppIcon from '../src/components/AppIcon.vue';
import AjustesModal from '../src/components/AjustesModal.vue';

async function limpiarDB() {
  await Promise.all(db.tables.map((t) => t.clear()));
}

function montar() {
  useUIStore().ajustesAbierto = true;
  return mount(AjustesModal, {
    props: { otraPestana: false },
    global: { components: { Icon: AppIcon }, stubs: { teleport: true } },
  });
}

/** El input de PIN (solo existe con pinActivo) */
function inputPin(w) {
  return w.findAll('input').find((i) => i.attributes('type') === 'password');
}

/** PBKDF2 (600k iteraciones) es async real: flushPromises no alcanza. */
async function esperarHash(cfgStore, ms = 3000) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    if (esPinHasheado(cfgStore.cfg.pin)) return;
    await new Promise((r) => setTimeout(r, 25));
  }
}

describe('AjustesModal: campo PIN nunca expone ni corrompe el hash', () => {
  beforeEach(async () => {
    limpiarDB();
    setActivePinia(createPinia());
    await flushPromises();
  });

  it('el campo arranca VACÍO aunque haya un PIN (hash) guardado', async () => {
    const cfgStore = useConfigStore();
    await cfgStore.cargarCfg();
    cfgStore.cfg.pinActivo = true;
    cfgStore.cfg.pin = '1234';
    await cfgStore.guardarCfg(); // hashea
    expect(esPinHasheado(cfgStore.cfg.pin)).toBe(true);

    const w = montar();
    await flushPromises();

    const inp = inputPin(w);
    expect(inp).toBeDefined();
    // EL BUG: el campo mostraba el hash de 83 chars
    expect(inp.element.value).toBe('');
    // el hash sigue intacto en el store
    expect(esPinHasheado(cfgStore.cfg.pin)).toBe(true);
    w.unmount();
  });

  it('escribir un PIN nuevo lo guarda hasheado y limpia el campo', async () => {
    const cfgStore = useConfigStore();
    await cfgStore.cargarCfg();
    cfgStore.cfg.pinActivo = true;
    await cfgStore.guardarCfg();

    const w = montar();
    await flushPromises();

    const inp = inputPin(w);
    await inp.setValue('5678');
    await inp.trigger('change');
    await esperarHash(cfgStore);

    // guardado hasheado, no en claro
    expect(esPinHasheado(cfgStore.cfg.pin)).toBe(true);
    expect(cfgStore.cfg.pin).not.toContain('5678');
    // el campo se limpia tras guardar
    expect(inp.element.value).toBe('');
    // y el PIN NUEVO verifica contra el hash guardado
    expect(await verificarPin('5678', cfgStore.cfg.pin)).toBe(true);
    w.unmount();
  });

  it('change con campo VACÍO conserva el PIN existente', async () => {
    const cfgStore = useConfigStore();
    await cfgStore.cargarCfg();
    cfgStore.cfg.pinActivo = true;
    cfgStore.cfg.pin = '1234';
    await cfgStore.guardarCfg();
    const hashAntes = cfgStore.cfg.pin;

    const w = montar();
    await flushPromises();

    const inp = inputPin(w);
    await inp.setValue('');
    await inp.trigger('change');
    await flushPromises();

    expect(cfgStore.cfg.pin).toBe(hashAntes);
    expect(await verificarPin('1234', cfgStore.cfg.pin)).toBe(true);
    w.unmount();
  });

  it('cambiar el PIN dos veces: el segundo reemplaza al primero', async () => {
    const cfgStore = useConfigStore();
    await cfgStore.cargarCfg();
    cfgStore.cfg.pinActivo = true;
    await cfgStore.guardarCfg();

    const w = montar();
    await flushPromises();

    let inp = inputPin(w);
    await inp.setValue('1111');
    await inp.trigger('change');
    await esperarHash(cfgStore);

    inp = inputPin(w);
    await inp.setValue('2222');
    await inp.trigger('change');
    await esperarHash(cfgStore);

    expect(await verificarPin('2222', cfgStore.cfg.pin)).toBe(true);
    expect(await verificarPin('1111', cfgStore.cfg.pin)).toBe(false);
    w.unmount();
  });

  it('desactivar el toggle no pide ni corrompe el PIN', async () => {
    const cfgStore = useConfigStore();
    await cfgStore.cargarCfg();
    cfgStore.cfg.pinActivo = true;
    cfgStore.cfg.pin = '1234';
    await cfgStore.guardarCfg();
    const hash = cfgStore.cfg.pin;

    const w = montar();
    await flushPromises();

    // apagar el switch
    const sw = w
      .findAll('input[type=checkbox]')
      .find((c) => c.element.closest('.set-row')?.textContent?.includes('PIN'));
    await sw.setValue(false);
    await flushPromises();

    expect(cfgStore.cfg.pinActivo).toBe(false);
    // el hash se conserva: reactivar debe revivir el mismo PIN
    expect(cfgStore.cfg.pin).toBe(hash);
    w.unmount();
  });

  it('hint "PIN configurado" visible solo cuando existe PIN', async () => {
    const cfgStore = useConfigStore();
    await cfgStore.cargarCfg();
    cfgStore.cfg.pinActivo = true;
    await cfgStore.guardarCfg();

    const w = montar();
    await flushPromises();
    expect(w.text()).not.toContain('PIN configurado');

    const inp = inputPin(w);
    await inp.setValue('9999');
    await inp.trigger('change');
    await flushPromises();

    expect(w.text()).toContain('PIN configurado');
    w.unmount();
  });
});
