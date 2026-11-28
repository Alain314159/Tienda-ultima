/**
 * Store de Notificaciones (Pinia).
 * Responsable único de las notificaciones nativas (web y Capacitor)
 * y de los chequeos periódicos: stock bajo, arqueo pendiente,
 * anomalías críticas y cierre pendiente.
 */
import { defineStore } from 'pinia';
import { computed } from 'vue';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { n } from '../utils/numero';
import { hoyLocal, fechaLocal } from '../utils/fecha';
import { vib } from '../utils/formato';
import { TOAST } from '../constants';
import { toastMsg } from '../utils/toast';
import { useConfigStore } from './useConfigStore';
import { useProductosStore } from './useProductosStore';
import { useCajaStore } from './useCajaStore';
import { useCierresStore } from './useCierresStore';
import { useInsightsStore } from './useInsightsStore';
import { useNubeStore } from './useNubeStore';
import { CLAVE_ENVIADO } from '../sync/nube';
import { P } from '../utils/id';
import { Log } from '../services/logger';
import { db } from '../db';
import type { Producto } from '../types';
import { inicioDiaLocal } from '../utils/fecha';

export const useNotificacionesStore = defineStore('notificaciones', () => {
  const configStore = useConfigStore();
  const productosStore = useProductosStore();
  const cajaStore = useCajaStore();
  const cierresStore = useCierresStore();

  let _notifTimer: ReturnType<typeof setInterval> | null = null;

  const soportaNotif = computed(() => {
    if (Capacitor.isNativePlatform()) return true;
    return typeof window !== 'undefined' && 'Notification' in window;
  });

  // ===== ENVÍO =====
  async function enviarNotif(titulo: string, cuerpo: string) {
    try {
      // NATIVO: usar LocalNotifications
      if (Capacitor.isNativePlatform()) {
        const perm = await LocalNotifications.checkPermissions();
        if (perm.display !== 'granted') return { ok: false, motivo: 'sin-permiso' };
        await LocalNotifications.schedule({
          notifications: [
            {
              id: Math.floor(Math.random() * 100000),
              title: titulo,
              body: cuerpo,
              schedule: { at: new Date(Date.now() + 100) },
              smallIcon: 'ic_stat_notif',
              iconColor: '#2196F3',
            },
          ],
        });
        return { ok: true, via: 'native' };
      }

      // WEB: Web Notification API
      if (!('Notification' in window)) return { ok: false, motivo: 'sin-soporte' };
      if (Notification.permission !== 'granted') return { ok: false, motivo: 'sin-permiso' };
      const opts = {
        body: cuerpo,
        icon: '/Tienda-ultima/icons/icon-192.png',
        badge: '/Tienda-ultima/icons/icon-192.png',
        tag: 'tienda-' + Date.now(),
      };
      const conTimeout = <T>(promesa: Promise<T>, ms: number) =>
        Promise.race([promesa, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
      if ('serviceWorker' in navigator) {
        try {
          const reg = await conTimeout(navigator.serviceWorker.ready, 3000);
          if (reg && reg.showNotification) {
            await conTimeout(reg.showNotification(titulo, opts), 3000);
            return { ok: true, via: 'sw' };
          }
        } catch {
          /* fallback */
        }
      }
      try {
        new Notification(titulo, opts);
        return { ok: true, via: 'constructor' };
      } catch (e2) {
        return { ok: false, motivo: 'constructor-bloqueado', error: e2 instanceof Error ? e2.message : String(e2) };
      }
    } catch (e) {
      console.error('enviarNotif', e);
      return { ok: false, motivo: 'error', error: e instanceof Error ? e.message : String(e) };
    }
  }

  // ===== PERMISOS =====
  async function pedirPermisoNotif() {
    // NATIVO
    if (Capacitor.isNativePlatform()) {
      try {
        const perm = await LocalNotifications.requestPermissions();
        if (perm.display === 'granted') {
          configStore.cfg.notifActivo = true;
          await configStore.guardarCfg();
          await enviarNotif('Tienda Pro', 'Notificaciones activadas');
          toastMsg('Notificaciones activadas');
        } else {
          configStore.cfg.notifActivo = false;
          await configStore.guardarCfg();
          toastMsg('Permiso denegado', TOAST.BAD);
        }
      } catch (e) {
        toastMsg('Error: ' + (e instanceof Error ? e.message : String(e)), TOAST.BAD);
      }
      return;
    }

    // WEB
    if (!('Notification' in window)) {
      return toastMsg('Este dispositivo no soporta notificaciones', TOAST.WARN);
    }
    if (Notification.permission === 'granted') {
      configStore.cfg.notifActivo = true;
      await configStore.guardarCfg();
      return toastMsg('Notificaciones activadas');
    }
    try {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        configStore.cfg.notifActivo = true;
        await configStore.guardarCfg();
        enviarNotif('Tienda Pro', 'Notificaciones activadas');
        toastMsg('Notificaciones activadas');
      } else {
        toastMsg('Permiso denegado', TOAST.BAD);
      }
    } catch (e) {
      toastMsg('Error: ' + (e instanceof Error ? e.message : String(e)), TOAST.BAD);
    }
  }

  async function desactivarNotif() {
    configStore.cfg.notifActivo = false;
    await configStore.guardarCfg();
    toastMsg('Notificaciones desactivadas');
  }

  async function probarNotif() {
    if (Capacitor.isNativePlatform()) {
      const perm = await LocalNotifications.checkPermissions();
      if (perm.display !== 'granted') {
        return toastMsg('Primero activa las notificaciones', TOAST.WARN);
      }
      const r = await enviarNotif('Tienda Pro', 'Esta es una notificacion de prueba');
      if (r && r.ok) toastMsg('Notificacion enviada (' + r.via + ')');
      else toastMsg('Fallo: ' + (r ? r.motivo : 'error'), TOAST.BAD);
      return;
    }

    if (!('Notification' in window)) {
      return toastMsg('Este dispositivo no soporta notificaciones', TOAST.BAD);
    }
    if (Notification.permission !== 'granted') {
      return toastMsg('Primero activa las notificaciones', TOAST.WARN);
    }
    const r = await enviarNotif('Tienda Pro', 'Esta es una notificacion de prueba');
    if (r && r.ok) {
      toastMsg('Notificacion enviada (' + r.via + ')');
    } else {
      const motivo = r ? r.motivo || 'desconocido' : 'error';
      toastMsg('Fallo: ' + motivo + ' - revisa permisos del navegador', TOAST.BAD);
    }
  }

  // ===== CHEQUEOS PERIÓDICOS =====
  async function chequearNotificaciones() {
    if (!configStore.cfg.notifActivo) return;
    if (!Capacitor.isNativePlatform()) {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
    }
    const ahora = new Date();
    const hoy = hoyLocal();
    let cambio = false;

    // 1. Stock bajo
    const bajo = productosStore.productosAgotados.length + productosStore.productosBajoStock.length;
    if (bajo > 0 && configStore.cfg.ultimaNotifStock !== hoy) {
      enviarNotif('Stock bajo', bajo + ' producto(s) en alerta');
      configStore.cfg.ultimaNotifStock = hoy;
      cambio = true;
    }

    // 2. Hora de arqueo
    if (configStore.cfg.horaArqueo) {
      const partes = configStore.cfg.horaArqueo.split(':');
      const hh = parseInt(partes[0]) || 0;
      const mm = parseInt(partes[1]) || 0;
      const horaArq = new Date();
      horaArq.setHours(hh, mm, 0, 0);
      if (ahora >= horaArq) {
        // Carga perezosa (4.8): los arqueos no se cargan al arrancar; sin
        // asegurarlos aquí, `hayArqueoHoy` sería falso siempre y el aviso
        // sonaría aunque el arqueo de hoy ya esté registrado.
        await cajaStore.asegurarArqueos();
        const hayArqueoHoy = cajaStore.arqueos.some((a) => a.fecha && fechaLocal(a.fecha) === hoy);
        if (!hayArqueoHoy && configStore.cfg.ultimaNotifArqueo !== hoy) {
          enviarNotif('Arqueo pendiente', 'No hay arqueo registrado hoy');
          configStore.cfg.ultimaNotifArqueo = hoy;
          cambio = true;
        }
      }
    }

    // 3. Anomalias criticas
    const insights = useInsightsStore();
    const criticas = insights.recomendacionesUrgentes;
    if (criticas > 0 && configStore.cfg.ultimaNotifCriticas !== hoy) {
      enviarNotif('Anomalias criticas', criticas + ' problema(s) urgente(s)');
      configStore.cfg.ultimaNotifCriticas = hoy;
      cambio = true;
    }

    // 4. Cierre pendiente
    const ultimoCierre =
      cierresStore.cierres.length > 0
        ? Math.max(...cierresStore.cierres.map((c) => new Date(c.fechaCierre || c.fecha || '').getTime()))
        : inicioDiaLocal(configStore.cfg.periodoInicio).getTime();
    const dias = Math.floor((ahora.getTime() - ultimoCierre) / 86400000);
    if (dias >= n(configStore.cfg.umbralDiasCierre || 30) && configStore.cfg.ultimaNotifCierre !== hoy) {
      enviarNotif('Cierre pendiente', dias + ' dias sin cerrar periodo');
      configStore.cfg.ultimaNotifCierre = hoy;
      cambio = true;
    }

    // 5. Respaldo pendiente: más días que umbralBackupDias (def. 7) sin
    // respaldo válido. Vale el backup local automático (db.config
    // 'backupAuto', con su fecha), un export manual (cfg.ultimoExport)
    // o una sincronización correcta con la nube ('ultimaSyncNube').
    // Como el resto de avisos del store: como mucho una vez al día
    // (marca en cfg.ultimaNotifRespaldo) y solo si hay datos que perder.
    const umbralRespaldo = n(configStore.cfg.umbralBackupDias || 7);
    let ultimaFechaRespaldo: number | null = null;
    try {
      const recBackup = await db.config.get('backupAuto');
      const recSync = await db.config.get('ultimaSyncNube');
      const fechas = [
        recBackup?.fecha,
        typeof recSync?.value === 'string' ? recSync.value : null,
        configStore.cfg.ultimoExport,
      ]
        .map((f) => (f ? new Date(f as string).getTime() : NaN))
        .filter((t) => !isNaN(t));
      if (fechas.length) ultimaFechaRespaldo = Math.max(...fechas);
    } catch (e) {
      console.warn('chequearNotificaciones: no se pudo leer la fecha del último respaldo', e);
    }
    const diasSinRespaldo =
      ultimaFechaRespaldo === null
        ? Infinity
        : Math.floor((ahora.getTime() - ultimaFechaRespaldo) / 86400000);
    const hayDatos = productosStore.productos.length > 0;
    if (hayDatos && diasSinRespaldo > umbralRespaldo && configStore.cfg.ultimaNotifRespaldo !== hoy) {
      const textoDias = ultimaFechaRespaldo === null ? 'nunca' : diasSinRespaldo + ' días';
      enviarNotif(
        'Respaldo pendiente',
        'Llevas ' + textoDias + ' sin respaldo: exporta o sincroniza con la nube'
      );
      configStore.cfg.ultimaNotifRespaldo = hoy;
      cambio = true;
    }

    // 6. Sync pendiente (3.7): hay cambios sin subir (la tabla `cambios`
    // va por delante del cursor de subida) y lleva al menos un día sin una
    // sync correcta con la nube. Solo con sesión activa: sin sesión el
    // remedio es entrar con Google, no un aviso. Como el resto: como mucho
    // una vez al día (marca en db.config 'ultimaNotifSyncPendiente').
    try {
      const nube = useNubeStore();
      if (nube.sesionCorreo) {
        const enviado = (await db.syncMeta.get(CLAVE_ENVIADO))?.value;
        const ultimoCambio = await db.cambios.orderBy('id').last();
        const hayPendientes =
          !!ultimoCambio && (typeof enviado !== 'number' || (ultimoCambio.id ?? 0) > enviado);
        if (hayPendientes) {
          const recSync = await db.config.get('ultimaSyncNube');
          const ultimaSyncMs =
            recSync && typeof recSync.value === 'string' ? new Date(recSync.value).getTime() : NaN;
          const diasSinSync = isNaN(ultimaSyncMs) ? Infinity : Math.floor((ahora.getTime() - ultimaSyncMs) / 86400000);
          const avisado = (await db.config.get('ultimaNotifSyncPendiente'))?.value;
          if (diasSinSync >= 1 && avisado !== hoy) {
            enviarNotif(
              'Sincronización pendiente',
              'Tienes cambios sin subir a la nube desde hace ' +
                (diasSinSync === Infinity ? 'más de un día' : diasSinSync + (diasSinSync === 1 ? ' día' : ' días')) +
                '. Abre «Nube y cuenta» para sincronizar.'
            );
            await P(db.config, { key: 'ultimaNotifSyncPendiente', value: hoy });
          }
        }
      }
    } catch (e) {
      Log.warn('chequearNotificaciones: no se pudo comprobar la sync pendiente', e);
    }

    // 7. Deuda vencida (3.7): pasivos con vencimiento pasado y no pagados.
    // Como el resto: como mucho una vez al día (marca en db.config
    // 'ultimaNotifDeudaVencida').
    try {
      const pasivos = await db.table('pasivos').toArray();
      const vencidas = pasivos.filter((p) => {
        const pas = p as Record<string, unknown>;
        if (pas.pagado) return false;
        const v = pas.vencimiento;
        if (typeof v !== 'string' || !v) return false;
        return v.slice(0, 10) < hoy;
      });
      if (vencidas.length > 0) {
        const avisado = (await db.config.get('ultimaNotifDeudaVencida'))?.value;
        if (avisado !== hoy) {
          enviarNotif(
            'Deuda vencida',
            vencidas.length === 1
              ? 'Tienes 1 deuda con el vencimiento pasado'
              : 'Tienes ' + vencidas.length + ' deudas con el vencimiento pasado'
          );
          await P(db.config, { key: 'ultimaNotifDeudaVencida', value: hoy });
        }
      }
    } catch (e) {
      Log.warn('chequearNotificaciones: no se pudieron comprobar las deudas vencidas', e);
    }

    if (cambio) await configStore.guardarCfg();
  }

  // ===== ALERTAS DE AGOTADOS =====
  async function chequearAgotados() {
    try {
      const avisados = new Set(configStore.cfg.productosAvisados || []);
      const nuevosAgotados: import('../types').Producto[] = [];
      const recuperados: import('../types').Producto[] = [];

      productosStore.prodsActivos.forEach((p) => {
        const stockActual = productosStore.stock(p.id);
        const yaAvisado = avisados.has(p.id);

        if (stockActual <= 0 && !yaAvisado) {
          avisados.add(p.id);
          nuevosAgotados.push(p);
        } else if (stockActual > 0 && yaAvisado) {
          avisados.delete(p.id);
          recuperados.push(p);
        }
      });

      if (nuevosAgotados.length === 0 && recuperados.length === 0) return;

      configStore.cfg.productosAvisados = Array.from(avisados);
      await configStore.guardarCfg();

      for (const p of nuevosAgotados) {
        try {
          await notificarAgotado(p);
        } catch (e) {
          console.warn('notificarAgotado fallo', e);
        }
      }

      if (recuperados.length > 0) {
        toastMsg('✅ ' + recuperados.length + ' producto(s) volvieron al stock', TOAST.OK);
      }
    } catch (e) {
      console.error('chequearAgotados', e);
    }
  }

  async function notificarAgotado(prod: Producto) {
    const nombre = prod.nombre;

    // 1. Notificacion del sistema (con timeout interno, nunca bloquea).
    //    Guard por plataforma: en el WebView de Android no existe
    //    window.Notification (la via nativa es LocalNotifications, que
    //    enviarNotif elige solo) — sin este check los agotados JAMAS
    //    notificaban en la app instalada.
    if (Capacitor.isNativePlatform() || ('Notification' in window && Notification.permission === 'granted')) {
      await enviarNotif('⚠ Producto agotado', nombre + ' — quedó en 0');
    }

    // 2. Vibracion
    try {
      vib([200, 100, 200]);
    } catch {}

    // 3. Toast con accion
    try {
      const texto = '⚠️ *AGOTADO:* ' + nombre + '\n\nYa no tenemos disponible este producto. Vuelve pronto.';
      const urlWA = 'https://wa.me/?text=' + encodeURIComponent(texto);
      toastMsg('⚠ ' + nombre + ' se agotó', TOAST.WARN, 'Avisar al grupo', () => {
        window.open(urlWA, '_blank');
      });
    } catch (e) {
      console.warn('chequearAgotados', e);
    }
  }

  // ===== TIMERS =====
  function iniciarChequeos() {
    const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 200));
    idle(() => {
      _notifTimer = setInterval(() => chequearNotificaciones(), 5 * 60 * 1000);
    });
    idle(() => chequearNotificaciones());
  }

  function detenerChequeos() {
    if (_notifTimer) clearInterval(_notifTimer);
    _notifTimer = null;
  }

  return {
    soportaNotif,
    enviarNotif,
    pedirPermisoNotif,
    desactivarNotif,
    probarNotif,
    chequearNotificaciones,
    chequearAgotados,
    notificarAgotado,
    iniciarChequeos,
    detenerChequeos,
  };
});
