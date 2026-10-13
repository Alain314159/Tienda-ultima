/**
 * Store de Telegram (Pinia).
 * Responsable único de la comunicación con el bot: registro/login de tienda,
 * backups en la nube (subida, listado, restauración, borrado, rotación)
 * y la cola de envíos pendientes cuando no hay conexión.
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { n } from '../utils/numero';
import { fmtFH } from '../utils/formato';
import { P, genId } from '../utils/id';
import { db } from '../db';
import { TOAST } from '../constants';
import { toastMsg } from '../utils/toast';
import { useConfigStore } from './useConfigStore';
import { useUIStore } from './useUIStore';
import { comprimirGzip, descomprimirGzip, hashContenido, guardarEnCarpeta } from '../services/backup';
import {
  tgCheckName,
  tgRegister,
  tgLogin,
  tgStatus,
  tgGetUpdates,
  tgListBackups,
  tgSendDocument,
  tgGetFile,
  tgFileUrl,
  tgDeleteMessage,
  tgDetectarChatId,
} from '../telegram';
import type { Respaldo } from '../types';

/** Ítem de la lista de backups de Telegram. */
interface TgBackupInfo {
  messageId: number;
  fecha: string;
  fileSize: number;
  fileName: string;
  fileId: string;
}

export const useTelegramStore = defineStore('telegram', () => {
  const configStore = useConfigStore();
  const ui = useUIStore();

  // ===== ESTADO =====
  const tgEstado = ref('sin-config');
  const tgBackups = ref<TgBackupInfo[]>([]);
  const tgCargando = ref(false);
  const tgProgreso = ref('');
  const tgColaPendiente = ref(0);

  // Registro / login de tienda
  const mtForm = ref({ nombre: '', password: '', password2: '', modo: 'register', loginNombre: '', loginPassword: '' });
  const mtCheck = ref({ estado: 'idle', motivo: '', verificando: false });
  const mtProcesando = ref(false);

  // Timers internos
  let _tgColaTimer: ReturnType<typeof setInterval> | null = null;
  let _tgPollTimer: ReturnType<typeof setInterval> | null = null;
  let _tgProcesandoCola = false;

  // ===== GETTERS =====
  const puedoRegistrar = computed(
    () =>
      mtForm.value.nombre.length >= 3 &&
      mtCheck.value.estado === 'ok' &&
      mtForm.value.password.length >= 6 &&
      mtForm.value.password === mtForm.value.password2 &&
      !mtProcesando.value
  );

  const tgProcesandoCola = computed(() => _tgProcesandoCola);

  // El token ya no vive en el cliente: todo pasa por el Worker (proxy).
  function tgTokenActual() {
    return configStore.cfg.tgChatId ? 'proxy' : '';
  }

  // ===== REGISTRO / LOGIN DE TIENDA =====
  async function verificarNombreTienda() {
    const nombre = (mtForm.value.nombre || '').toLowerCase().trim();
    if (!nombre || nombre.length < 3) return;
    mtCheck.value = { estado: 'verificando', motivo: '', verificando: true };
    try {
      const r = await tgCheckName(nombre);
      if (r.disponible) mtCheck.value = { estado: 'ok', motivo: '', verificando: false };
      else mtCheck.value = { estado: 'ocupado', motivo: r.motivo || 'Nombre ya en uso', verificando: false };
    } catch (e) {
      mtCheck.value = { estado: 'error', motivo: e instanceof Error ? e.message : String(e), verificando: false };
    }
  }

  async function registrarTienda() {
    if (!puedoRegistrar.value) return;
    if (!configStore.cfg.tgChatId) return toastMsg('Primero conecta el bot con /start', TOAST.BAD);
    mtProcesando.value = true;
    try {
      const r = await tgRegister(
        mtForm.value.nombre.toLowerCase().trim(),
        mtForm.value.password,
        configStore.cfg.tgChatId
      );
      configStore.cfg.nombreTienda = r.nombre;
      configStore.cfg.tiendaConfigurada = true;
      configStore.cfg.tgAutoBackup = true;
      await configStore.guardarCfg();
      mtForm.value = { nombre: '', password: '', password2: '', modo: 'register', loginNombre: '', loginPassword: '' };
      mtCheck.value = { estado: 'idle', motivo: '', verificando: false };
      toastMsg('Tienda registrada correctamente');
      await tgListar();
    } catch (e) {
      toastMsg(e instanceof Error ? e.message : String(e), TOAST.BAD);
    } finally {
      mtProcesando.value = false;
    }
  }

  async function loginTienda() {
    if (!mtForm.value.loginNombre || !mtForm.value.loginPassword) return;
    if (!configStore.cfg.tgChatId) return toastMsg('Primero conecta el bot con /start', TOAST.BAD);
    mtProcesando.value = true;
    try {
      const r = await tgLogin(
        mtForm.value.loginNombre.toLowerCase().trim(),
        mtForm.value.loginPassword,
        configStore.cfg.tgChatId
      );
      configStore.cfg.nombreTienda = r.nombre;
      configStore.cfg.tiendaConfigurada = true;
      configStore.cfg.tgAutoBackup = true;
      await configStore.guardarCfg();
      mtForm.value = { nombre: '', password: '', password2: '', modo: 'register', loginNombre: '', loginPassword: '' };
      toastMsg('Sesion iniciada');
      await tgListar();
    } catch (e) {
      toastMsg(e instanceof Error ? e.message : String(e), TOAST.BAD);
    } finally {
      mtProcesando.value = false;
    }
  }

  async function tgCargarEstadoTienda() {
    if (!configStore.cfg.tgChatId) return;
    try {
      const r = await tgStatus(configStore.cfg.tgChatId);
      if (r.nombre) {
        configStore.cfg.nombreTienda = r.nombre;
        configStore.cfg.tiendaConfigurada = true;
        await configStore.guardarCfg();
      }
    } catch {
      /* silencioso */
    }
  }

  // ===== BACKUPS EN TELEGRAM =====
  async function tgBackupAhora(datos: Respaldo) {
    if (!configStore.cfg.tiendaConfigurada || !configStore.cfg.nombreTienda) {
      return toastMsg('Configura un nombre de tienda antes de hacer backups', TOAST.BAD);
    }
    try {
      await tgEnviarDatos(datos, 'manual', true);
    } catch {
      await tgEncolar(datos, 'manual');
      toastMsg('Sin conexion. Backup en cola.', TOAST.WARN);
    }
  }

  async function tgEnviarDatos(datos: Respaldo, motivo: string, mostrarToast: boolean) {
    const token = tgTokenActual();
    const chatId = configStore.cfg.tgChatId;
    if (!token || !chatId) throw new Error('Sin conexion a Telegram');

    tgCargando.value = true;
    tgProgreso.value = 'Preparando...';
    try {
      // 1. Serializar
      const json = JSON.stringify(datos);
      const hash = await hashContenido(json);

      // 2. Si es auto y el hash no cambio, saltar
      if (motivo === 'auto' && configStore.cfg.tgUltimoHash === hash) {
        tgProgreso.value = 'Sin cambios';
        return { ok: true, saltado: true };
      }

      // 3. Comprimir
      tgProgreso.value = 'Comprimiendo...';
      const blobSinComprimir = new Blob([json], { type: 'application/json' });
      const gz = await comprimirGzip(blobSinComprimir);

      // 4. Fecha del backup
      const fecha = new Date().toISOString();

      // 5. Resumen para caption
      const resumen =
        datos.productos.length +
        ' prod · ' +
        datos.ventas.length +
        ' ventas · ' +
        datos.compras.length +
        ' compras · ' +
        (blobSinComprimir.size / 1024).toFixed(1) +
        ' KB';

      // 6. Enviar a Telegram
      tgProgreso.value = 'Subiendo a Telegram...';
      await tgSendDocument(chatId, configStore.cfg.nombreTienda, gz, 'Backup · ' + resumen);

      // 7. Guardar en carpeta del telefono (si esta configurada)
      if (configStore.cfg.tgCarpetaActiva) {
        tgProgreso.value = 'Guardando en carpeta...';
        const nombreLocal = 'tienda-backup-' + fecha.split('T')[0] + '.json.gz';
        const okCarpeta = await guardarEnCarpeta(nombreLocal, gz);
        if (!okCarpeta && mostrarToast) {
          toastMsg('Telegram OK, pero fallo guardar en carpeta', TOAST.WARN);
        }
      }

      // 8. Actualizar cfg
      configStore.cfg.tgUltimoBackup = fecha;
      configStore.cfg.tgUltimoHash = hash;
      await configStore.guardarCfg();

      // 9. Rotación: borrar backups viejos si hay más de N
      tgProgreso.value = 'Rotando...';
      try {
        await tgListar();
        await tgRotarViejos();
      } catch {}

      tgProgreso.value = '';
      if (mostrarToast) {
        toastMsg('Backup OK · ' + (gz.size / 1024).toFixed(1) + ' KB comprimido');
      }
      return { ok: true, size: gz.size };
    } finally {
      tgCargando.value = false;
      tgProgreso.value = '';
    }
  }

  async function tgListar() {
    const token = tgTokenActual();
    if (!token) return;
    if (!configStore.cfg.tiendaConfigurada || !configStore.cfg.nombreTienda) {
      return toastMsg('Configura un nombre de tienda primero', TOAST.WARN);
    }
    tgCargando.value = true;
    try {
      tgBackups.value = await tgListBackups(configStore.cfg.tgChatId, configStore.cfg.nombreTienda);
      toastMsg(tgBackups.value.length + ' backup(s) encontrado(s)');
    } catch (e) {
      toastMsg('Error: ' + (e instanceof Error ? e.message : String(e)), TOAST.BAD);
    } finally {
      tgCargando.value = false;
    }
  }

  function tgRestaurar(bk: TgBackupInfo, importarData: (d: Respaldo) => Promise<void>) {
    const token = tgTokenActual();
    if (!token) return;
    ui.confirmar({
      titulo: 'Restaurar backup',
      msg:
        'Restaurar el backup del ' +
        fmtFH(bk.fecha) +
        ' (' +
        (bk.fileSize / 1024).toFixed(1) +
        ' KB)?\n\nLos datos actuales seran REEMPLAZADOS.',
      onOk: async () => {
        tgCargando.value = true;
        tgProgreso.value = 'Descargando...';
        try {
          const file = await tgGetFile(bk.fileId);
          const url = tgFileUrl(file.file_path);
          const r = await fetch(url);
          const blob = await r.blob();
          let txt;
          if (bk.fileName.endsWith('.gz')) {
            tgProgreso.value = 'Descomprimiendo...';
            const descomprimido = await descomprimirGzip(blob);
            txt = await descomprimido.text();
          } else {
            txt = await blob.text();
          }
          tgProgreso.value = 'Importando...';
          const d = JSON.parse(txt);
          if (!d.productos && !d.ventas) throw new Error('Archivo invalido');
          await importarData(d);
          toastMsg('Backup restaurado (' + fmtFH(bk.fecha) + ')');
        } catch (e) {
          toastMsg('Error: ' + (e instanceof Error ? e.message : String(e)), TOAST.BAD);
        } finally {
          tgCargando.value = false;
          tgProgreso.value = '';
        }
      },
    });
  }

  function tgEliminar(bk: TgBackupInfo) {
    const token = tgTokenActual();
    const chatId = configStore.cfg.tgChatId;
    if (!token || !chatId) return;
    ui.confirmar({
      titulo: 'Eliminar backup',
      msg: 'Eliminar el backup del ' + fmtFH(bk.fecha) + ' de Telegram?',
      onOk: async () => {
        try {
          await tgDeleteMessage(chatId, bk.messageId);
          tgBackups.value = tgBackups.value.filter((x) => x.messageId !== bk.messageId);
          toastMsg('Backup eliminado');
        } catch (e) {
          toastMsg('Error: ' + (e instanceof Error ? e.message : String(e)), TOAST.BAD);
        }
      },
    });
  }

  function tgDesconectar() {
    ui.confirmar({
      titulo: 'Desconectar Telegram',
      msg: 'Se borrara el token y el chat_id guardados. Los backups en Telegram no se tocan.',
      onOk: async () => {
        configStore.cfg.tgToken = '';
        configStore.cfg.tgChatId = '';
        configStore.cfg.tgNombre = '';
        configStore.cfg.tgAutoBackup = false;
        configStore.cfg.nombreTienda = '';
        configStore.cfg.tiendaConfigurada = false;
        await configStore.guardarCfg();
        tgEstado.value = 'sin-config';
        tgBackups.value = [];
        toastMsg('Desconectado');
      },
    });
  }

  async function tgAutoDetectarChat() {
    const token = tgTokenActual();
    if (!token) return false;
    if (configStore.cfg.tgChatId) return true;
    try {
      const updates = await tgGetUpdates();
      const chat = tgDetectarChatId(updates);
      if (chat) {
        configStore.cfg.tgChatId = String(chat.chatId);
        configStore.cfg.tgNombre = chat.nombre || chat.username || 'Usuario';
        configStore.cfg.tgAutoBackup = true;
        await configStore.guardarCfg();
        tgEstado.value = 'conectado';
        try {
          await tgCargarEstadoTienda();
        } catch {}
        toastMsg('Telegram conectado: ' + configStore.cfg.tgNombre);
        return true;
      }
      tgEstado.value = 'esperando-start';
      return false;
    } catch (e) {
      console.warn('tgAutoDetectarChat', e);
      tgEstado.value = 'error';
      return false;
    }
  }

  async function tgAutoBackupCheck(getDatos: () => unknown) {
    // 1. Procesar cola pendiente primero
    try {
      await tgProcesarCola();
    } catch {}
    // 2. Auto-backup si esta activo
    if (!configStore.cfg.tgAutoBackup) return;
    if (!configStore.cfg.tgChatId) return;
    if (!configStore.cfg.tiendaConfigurada || !configStore.cfg.nombreTienda) return;
    const ult = configStore.cfg.tgUltimoBackup ? new Date(configStore.cfg.tgUltimoBackup).getTime() : 0;
    const horas = (Date.now() - ult) / 3600000;
    if (horas >= 24) {
      const datos = (getDatos as () => import('../types').Respaldo)();
      try {
        await tgEnviarDatos(datos, 'auto', false);
        if (configStore.cfg.tgFallosConsecutivos > 0) {
          configStore.cfg.tgFallosConsecutivos = 0;
          await configStore.guardarCfg();
        }
      } catch (e) {
        configStore.cfg.tgFallosConsecutivos = (configStore.cfg.tgFallosConsecutivos || 0) + 1;
        await configStore.guardarCfg();
        await tgEncolar(datos, 'auto');
        console.warn(
          'Auto-backup fallo (' + configStore.cfg.tgFallosConsecutivos + ' consecutivos):',
          e instanceof Error ? e.message : String(e)
        );
      }
    }
  }

  function iniciarTgPoll() {
    if (_tgPollTimer) return;
    _tgPollTimer = setInterval(async () => {
      if (configStore.cfg.tgChatId) {
        if (_tgPollTimer) clearInterval(_tgPollTimer);
        _tgPollTimer = null;
        return;
      }
      await tgAutoDetectarChat();
    }, 5000);
  }

  function detenerTgPoll() {
    if (_tgPollTimer) {
      clearInterval(_tgPollTimer);
      _tgPollTimer = null;
    }
  }

  // ===== COLA DE BACKUPS =====
  async function tgEncolar(datos: Respaldo, motivo: string) {
    // ANTI-ACUMULACION: solo puede haber UN backup 'auto' en cola.
    if (motivo === 'auto' || !motivo) {
      try {
        const viejos = await db.tgQueue.where('motivo').equals('auto').toArray();
        if (viejos.length > 0) {
          await db.tgQueue.bulkDelete(viejos.map((x) => x.id));
          console.log('[tg] Limpiados ' + viejos.length + ' backups auto viejos');
        }
      } catch (e) {
        console.warn('tg limpiar viejos', e);
      }
    }
    const id = genId('tq');
    await P(db.tgQueue, {
      id,
      ts: new Date().toISOString(),
      estado: 'pendiente',
      intentos: 0,
      motivo: motivo || 'auto',
      datos,
    });
    await tgActualizarCola();
    return id;
  }

  async function tgActualizarCola() {
    try {
      const items = await db.tgQueue.toArray();
      tgColaPendiente.value = items.filter((x) => x.estado === 'pendiente' || x.estado === 'error').length;
    } catch {
      tgColaPendiente.value = 0;
    }
  }

  async function tgProcesarCola() {
    if (_tgProcesandoCola) return;
    if (!configStore.cfg.tgChatId) return;
    _tgProcesandoCola = true;
    try {
      // Limpieza previa: si hay varios 'auto', dejar solo el mas reciente
      const todos = await db.tgQueue.toArray();
      const autos = todos
        .filter((x) => x.motivo === 'auto')
        .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
      if (autos.length > 1) {
        const borrar = autos.slice(1).map((x) => x.id);
        await db.tgQueue.bulkDelete(borrar);
        console.log('[tg] Cola limpiada: ' + borrar.length + ' auto viejos descartados');
      }

      // Procesar pendientes + errores reintentables
      const items = await db.tgQueue
        .filter((x) => x.estado === 'pendiente' || (x.estado === 'error' && (x.intentos || 0) < 5))
        .toArray();

      // Ordenar: manuales primero, auto ultimo
      items.sort((a, b) => {
        const ma = a.motivo === 'auto' ? 1 : 0;
        const mb = b.motivo === 'auto' ? 1 : 0;
        if (ma !== mb) return ma - mb;
        return new Date(a.ts).getTime() - new Date(b.ts).getTime();
      });

      for (const item of items) {
        if (item.intentos >= 5) {
          await P(db.tgQueue, { ...item, estado: 'fallido' });
          continue;
        }
        try {
          await P(db.tgQueue, { ...item, estado: 'enviando' });
          await tgEnviarDatos(item.datos, item.motivo, false);
          await db.tgQueue.delete(item.id);
        } catch (e) {
          await P(db.tgQueue, {
            ...item,
            estado: 'error',
            intentos: (item.intentos || 0) + 1,
            ultimoError: e instanceof Error ? e.message : String(e),
          });
        }
      }
      await tgActualizarCola();
    } finally {
      _tgProcesandoCola = false;
    }
  }

  // ===== ROTACIÓN =====
  async function tgRotarViejos() {
    const mantener = n(configStore.cfg.tgMantenerN) || 10;
    if (tgBackups.value.length <= mantener) return 0;
    const sobrantes = tgBackups.value.slice(mantener);
    const chatId = configStore.cfg.tgChatId;
    let borrados = 0;
    for (const bk of sobrantes) {
      try {
        await tgDeleteMessage(chatId, bk.messageId);
        borrados++;
      } catch {}
    }
    if (borrados > 0) {
      tgBackups.value = tgBackups.value.slice(0, mantener);
      console.log('Telegram: ' + borrados + ' backups viejos eliminados');
    }
    return borrados;
  }

  // ===== TIMERS DE FONDO =====
  function iniciarTimers(_getDatos?: () => unknown) {
    const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 200));
    idle(() => {
      _tgColaTimer = setInterval(() => tgProcesarCola(), 5 * 60 * 1000);
    });
    window.addEventListener('online', () => {
      setTimeout(() => tgProcesarCola(), 1000);
    });
    void _getDatos;
  }

  function detenerTimers() {
    if (_tgColaTimer) clearInterval(_tgColaTimer);
    _tgColaTimer = null;
    detenerTgPoll();
  }

  // Estado inicial según cfg
  function sincronizarEstado() {
    if (configStore.cfg.tgChatId) tgEstado.value = 'conectado';
    else tgEstado.value = 'esperando-start';
  }

  return {
    tgEstado,
    tgBackups,
    tgCargando,
    tgProgreso,
    tgColaPendiente,
    mtForm,
    mtCheck,
    mtProcesando,
    puedoRegistrar,
    tgProcesandoCola,
    tgTokenActual,
    verificarNombreTienda,
    registrarTienda,
    loginTienda,
    tgCargarEstadoTienda,
    tgBackupAhora,
    tgEnviarDatos,
    tgListar,
    tgRestaurar,
    tgEliminar,
    tgDesconectar,
    tgAutoDetectarChat,
    tgAutoBackupCheck,
    iniciarTgPoll,
    detenerTgPoll,
    tgEncolar,
    tgActualizarCola,
    tgProcesarCola,
    tgRotarViejos,
    iniciarTimers,
    detenerTimers,
    sincronizarEstado,
  };
});
