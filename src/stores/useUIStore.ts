/**
 * Store de UI global (Pinia).
 * Centraliza el estado de modales/paneles, los diálogos de confirmación,
 * el prompt y la verificación de PIN. Un único responsable de la UI global:
 * cualquier vista o main.js puede abrir/cerrar sin depender de App.vue.
 */
import { defineStore } from 'pinia';
import { ref, reactive, computed, watch } from 'vue';
import { useConfigStore } from './useConfigStore';
import { TOAST } from '../constants';
import { toastMsg } from '../utils/toast';

export const useUIStore = defineStore('ui', () => {
  // ===== MODALES / PANELES =====
  const ajustesAbierto = ref(false);
  const masAbierto = ref(false);
  const retiroAbierto = ref(false);
  const aporteAbierto = ref(false);
  const shareSheetAbierto = ref(false);
  const busquedaGlobalAbierta = ref(false);
  const calcAbierto = ref(false);
  const backupPanelAbierto = ref(false);
  const statusPanelAbierto = ref(false);
  const umbralesAbierto = ref(false);
  const cobroAbierto = ref(false);

  // ===== DIÁLOGOS =====
  const confirm = reactive<{ activo: boolean; titulo: string; msg: string; onOk: (() => void) | null }>({
    activo: false,
    titulo: '',
    msg: '',
    onOk: null,
  });
  const prompt = reactive<{
    activo: boolean;
    titulo: string;
    msg: string;
    placeholder: string;
    type: string;
    value: string;
    onOk: ((v: string) => void) | null;
  }>({ activo: false, titulo: '', msg: '', placeholder: '', type: 'text', value: '', onOk: null });

  // ===== SCROLL LOCK =====
  const hayModalAbierto = computed(
    () =>
      ajustesAbierto.value ||
      masAbierto.value ||
      cobroAbierto.value ||
      confirm.activo ||
      prompt.activo ||
      retiroAbierto.value ||
      aporteAbierto.value
  );

  watch(hayModalAbierto, () => actualizarScrollLock());

  function actualizarScrollLock() {
    try {
      if (hayModalAbierto.value) {
        document.body.style.overflow = 'hidden';
        document.body.style.position = 'fixed';
        document.body.style.width = '100%';
      } else {
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.width = '';
      }
    } catch {}
  }

  // ===== API DE CONFIRMACIÓN =====
  /**
   * Abre el diálogo de confirmación.
   * @param {{ titulo: string, msg: string, onOk: Function }} opts
   */
  function confirmar(opts: { titulo?: string; msg?: string; onOk?: () => void }) {
    Object.assign(confirm, { activo: true, titulo: opts.titulo || '', msg: opts.msg || '', onOk: opts.onOk || null });
  }

  function okConfirm() {
    const cb = confirm.onOk;
    confirm.activo = false;
    if (cb) cb();
  }

  // ===== API DE PROMPT =====
  /**
   * Abre un prompt y devuelve una Promise que resuelve con el valor
   * ingresado (o null si se cancela).
   * @param {{ titulo: string, msg?: string, placeholder?: string, type?: string }} opts
   * @returns {Promise<string|null>}
   */
  function preguntar(
    opts: { titulo?: string; msg?: string; placeholder?: string; type?: string; value?: string } = {}
  ): Promise<string | null> {
    return new Promise((resolve) => {
      Object.assign(prompt, {
        activo: true,
        titulo: opts.titulo || '',
        msg: opts.msg || '',
        placeholder: opts.placeholder || '',
        type: opts.type || 'text',
        value: opts.value || '',
        onOk: (v) => resolve(v ?? null),
      });
    });
  }

  function okPrompt() {
    const cb = prompt.onOk;
    const v = prompt.value;
    prompt.activo = false;
    if (cb) cb(v);
  }

  function cancelPrompt() {
    prompt.activo = false;
  }

  // ===== PIN DE SEGURIDAD =====
  /**
   * Ejecuta `cb` tras verificar el PIN (si está activo en configuración).
   * @param {Function} cb
   */
  function pedirPin(cb: () => void) {
    const configStore = useConfigStore();
    if (!configStore.cfg.pinActivo) {
      cb();
      return;
    }
    Object.assign(prompt, {
      activo: true,
      titulo: 'PIN de seguridad',
      msg: 'Ingresa tu PIN',
      placeholder: '••••',
      type: 'password',
      value: '',
      onOk: (v) => {
        if (v === configStore.cfg.pin) cb();
        else toastMsg('PIN incorrecto', TOAST.BAD);
      },
    });
  }

  return {
    // estado
    ajustesAbierto,
    masAbierto,
    retiroAbierto,
    aporteAbierto,
    shareSheetAbierto,
    busquedaGlobalAbierta,
    calcAbierto,
    backupPanelAbierto,
    statusPanelAbierto,
    umbralesAbierto,
    cobroAbierto,
    confirm,
    prompt,
    hayModalAbierto,
    // acciones
    confirmar,
    okConfirm,
    preguntar,
    okPrompt,
    cancelPrompt,
    pedirPin,
    actualizarScrollLock,
  };
});
