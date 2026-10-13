/**
 * Store de Backup (Pinia).
 * Responsable único de exportar/importar/restaurar datos: JSON plano,
 * JSON cifrado (AES-256-GCM), respaldo automático local y red de
 * seguridad pre-import.
 */
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { db, P, genId, clean, fmt, fmtFH } from '../db.js';
import { TOAST } from '../constants.js';
import { toastMsg } from '../utils/toast.js';
import { useConfigStore } from './useConfigStore.js';
import { useUIStore } from './useUIStore.js';
import { useTelegramStore } from './useTelegramStore.js';
import { datosDeStores } from './exportar.js';
import { recargarStores, recargarTodoStores } from './recarga.js';
import { derivarClave, hashContenido } from '../services/backup.js';

export const useBackupStore = defineStore('backup', () => {
  const configStore = useConfigStore();
  const ui = useUIStore();
  const telegram = useTelegramStore();

  // ===== ESTADO =====
  const ultimoBackup = ref(null);
  const importPreview = ref(null);
  const preImportDisponible = ref(false);
  const preImportFecha = ref(null);
  const importFile = ref(null);
  let _backupFallos = 0;
  let _backupIntervalTimer = null;

  // ===== EXPORTAR =====
  function descargar(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function exportar() {
    const d = datosDeStores();
    descargar(
      new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' }),
      'respaldo-tienda-' + new Date().toISOString().split('T')[0] + '.json'
    );
    configStore.cfg.ultimoExport = new Date().toISOString();
    configStore.guardarCfg();
    toastMsg('Respaldo descargado');
  }

  async function exportarCifrado() {
    const pass = await ui.preguntar({
      titulo: 'Contraseña de cifrado',
      msg: 'Se guardara el respaldo cifrado con AES-256. Guarda la contraseña: si la pierdes, no se puede recuperar.',
      placeholder: 'Contraseña (min 6 caracteres)',
      type: 'password',
    });
    if (!pass || pass.length < 6) return toastMsg('Contrasena muy corta (min 6)', TOAST.BAD);
    try {
      const data = datosDeStores();
      const enc = new TextEncoder();
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const key = await derivarClave(pass, salt);
      const json = enc.encode(JSON.stringify(data));
      const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, json);
      const out = {
        version: 1,
        cifrado: true,
        salt: btoa(String.fromCharCode(...salt)),
        iv: btoa(String.fromCharCode(...iv)),
        data: btoa(String.fromCharCode(...new Uint8Array(cipher))),
      };
      descargar(
        new Blob([JSON.stringify(out)], { type: 'application/json' }),
        'respaldo-cifrado-' + new Date().toISOString().split('T')[0] + '.json'
      );
      toastMsg('Respaldo cifrado descargado');
    } catch (e) {
      toastMsg('Error cifrado: ' + e.message, TOAST.BAD);
    }
  }

  // ===== IMPORTAR =====
  function triggerImport() {
    const el = document.getElementById('impFile');
    if (el) el.click();
  }

  function onImportFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    importFile.value = file;
    e.target.value = '';
    const rd = new FileReader();
    rd.onload = async (ev) => {
      try {
        let d = JSON.parse(ev.target.result);
        // Si esta cifrado, pedir contrasena
        if (d.cifrado === true) {
          const pass = await ui.preguntar({
            titulo: 'Respaldo cifrado',
            msg: 'Este respaldo esta protegido. Ingresa la contrasena.',
            placeholder: 'Contrasena',
            type: 'password',
          });
          if (!pass) return toastMsg('Cancelado', TOAST.WARN);
          try {
            const salt = Uint8Array.from(atob(d.salt), (c) => c.charCodeAt(0));
            const iv = Uint8Array.from(atob(d.iv), (c) => c.charCodeAt(0));
            const cipher = Uint8Array.from(atob(d.data), (c) => c.charCodeAt(0));
            const key = await derivarClave(pass, salt);
            const json = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
            d = JSON.parse(new TextDecoder().decode(json));
          } catch (err) {
            return toastMsg('Contrasena incorrecta', TOAST.BAD);
          }
        }
        if (!d.productos && !d.ventas) throw new Error('Archivo invalido');

        const { usarStores, crearPreview } = await import('./importacion.js');
        importPreview.value = crearPreview(d, usarStores());

        let adv = '';
        const campos = importPreview.value.campos;
        const totalActual = campos.reduce((s, c) => s + importPreview.value.actuales[c.key], 0);
        const totalNuevo = campos.reduce((s, c) => s + importPreview.value.nuevos[c.key], 0);
        if (totalActual > 0 && totalNuevo === 0) {
          adv = '⚠ El archivo NO TIENE datos. Importar VACIARA la app.';
        } else if (totalActual > 0 && totalNuevo < totalActual * 0.3) {
          adv = '⚠ El archivo tiene MUCHOS MENOS datos que los actuales. Podrias perder informacion.';
        } else if (totalActual > 0) {
          adv = 'Se reemplazaran TODOS los datos actuales con los del archivo.';
        }

        ui.confirmar({ titulo: 'Importar datos', msg: adv, onOk: () => ejecutarImport() });
      } catch (err) {
        toastMsg('Error: ' + err.message, TOAST.BAD);
      }
    };
    rd.readAsText(file);
  }

  function ejecutarImport() {
    const file = importFile.value;
    if (!file) return;
    const rd = new FileReader();
    rd.onload = async (ev) => {
      try {
        const d = JSON.parse(ev.target.result);
        if (!d.productos && !d.ventas) throw new Error('Archivo invalido');

        // Guardar estado actual como red de seguridad
        try {
          const estadoActual = datosDeStores();
          await P(db.config, { key: 'preImportBackup', value: estadoActual, fecha: new Date().toISOString() });
          preImportDisponible.value = true;
          preImportFecha.value = new Date().toISOString();
          console.log('✅ Pre-import backup guardado');
        } catch (e) {
          console.error('pre-import backup', e);
        }

        await importarData(d);
        importPreview.value = null;
        ui.ajustesAbierto = false;
        toastMsg('Datos importados (puedes deshacer desde Ajustes)', TOAST.OK, 'Deshacer', () => {
          ui.ajustesAbierto = true;
        });
      } catch (e) {
        toastMsg('Error: ' + e.message, TOAST.BAD);
      }
    };
    rd.readAsText(file);
  }

  /** Valida el esquema de un archivo de respaldo. */
  function validarEsquema(d) {
    const errores = [];
    const avisos = [];
    if (!d || typeof d !== 'object') {
      return { ok: false, errores: ['El archivo no es un objeto valido'] };
    }
    if (!d.productos && !d.ventas) {
      errores.push('Falta productos y ventas (no parece un respaldo)');
    }
    const tablas = [
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
    ];
    tablas.forEach((t) => {
      if (d[t] !== undefined && !Array.isArray(d[t])) errores.push('"' + t + '" no es un array');
    });
    tablas.forEach((t) => {
      if (!Array.isArray(d[t])) return;
      const sinId = d[t].filter((x) => !x || typeof x !== 'object' || !x.id);
      if (sinId.length > 0) errores.push('"' + t + '": ' + sinId.length + ' item(s) sin id');
    });
    if (Array.isArray(d.ventas)) {
      const ventasMalas = d.ventas.filter((v) => v && v.items && !Array.isArray(v.items));
      if (ventasMalas.length > 0) errores.push(ventasMalas.length + ' venta(s) con items invalidos');
    }
    if (Array.isArray(d.lotes)) {
      const lotesMalos = d.lotes.filter((l) => l && (l.cantidadInicial === undefined || l.costo === undefined));
      if (lotesMalos.length > 0) avisos.push(lotesMalos.length + ' lote(s) sin cantidadInicial/costo');
    }
    const json = JSON.stringify(d);
    if (json.length > 50 * 1024 * 1024) errores.push('Archivo demasiado grande (>50MB)');
    if (d.version && d.version < 6) avisos.push('Respaldo de version antigua (v' + d.version + ')');
    return { ok: errores.length === 0, errores, avisos };
  }

  /** Reemplaza todos los datos con los del archivo (con rollback automático). */
  async function importarData(d) {
    const v = validarEsquema(d);
    if (!v.ok) throw new Error('Datos invalidos:\n· ' + v.errores.join('\n· '));
    if (v.avisos && v.avisos.length) console.warn('Import con avisos:', v.avisos);

    const tables = [
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
    ];
    // Snapshot antes por si falla
    const respaldo = {};
    try {
      for (const t of tables) respaldo[t] = await db.table(t).toArray();
    } catch (e) {
      console.warn('No pude tomar snapshot', e);
    }

    try {
      await db.transaction('rw', tables.concat(['config']), async () => {
        for (const t of tables) {
          await db.table(t).clear();
          if (Array.isArray(d[t])) await db.table(t).bulkPut(clean(d[t]));
        }
        if (d.cfg) await P(db.config, { key: 'cfg', value: d.cfg });
      });
    } catch (err) {
      try {
        await db.transaction('rw', tables, async () => {
          for (const t of tables) {
            await db.table(t).clear();
            if (respaldo[t] && respaldo[t].length) await db.table(t).bulkPut(respaldo[t]);
          }
        });
        throw new Error('Fallo la importacion (rollback aplicado): ' + err.message);
      } catch (rb) {
        throw new Error('Fallo la importacion Y el rollback: ' + err.message);
      }
    }
    if (d.cfg) configStore.cfg = { ...configStore.cfg, ...d.cfg };
    await recargarTodoStores();
  }

  async function onRestoreBackup(data) {
    try {
      await importarData(data);
      toastMsg('Backup restaurado');
    } catch (e) {
      toastMsg('Error restaurando: ' + e.message, TOAST.BAD);
    }
  }

  function restaurarBackupAuto() {
    if (!ultimoBackup.value) return;
    ui.confirmar({
      titulo: 'Restaurar backup',
      msg: '¿Reemplazar los datos con el backup automático del ' + fmtFH(ultimoBackup.value.fecha) + '?',
      onOk: async () => {
        await importarData(ultimoBackup.value.value);
        ui.ajustesAbierto = false;
        toastMsg('Backup restaurado');
      },
    });
  }

  // ===== BACKUP AUTOMÁTICO LOCAL =====
  async function backupAuto() {
    try {
      const data = datosDeStores();
      await P(db.config, { key: 'backupAuto', value: data, fecha: new Date().toISOString() });

      if (configStore.cfg.tgChatId && configStore.cfg.nombreTienda && configStore.cfg.tiendaConfigurada) {
        const { useProductosStore } = await import('./useProductosStore.js');
        const { useVentasStore } = await import('./useVentasStore.js');
        const { useComprasStore } = await import('./useComprasStore.js');
        const productosStore = useProductosStore();
        const ventasStore = useVentasStore();
        const comprasStore = useComprasStore();

        if (
          productosStore.productos.length === 0 &&
          ventasStore.ventas.length === 0 &&
          comprasStore.compras.length === 0
        ) {
          console.warn('backupAuto: base vacia, se omite subida a Telegram');
        } else {
          try {
            const hash = await hashContenido(JSON.stringify(data));
            if (configStore.cfg.tgUltimoHash !== hash) {
              // Limpiar TODOS los auto anteriores (pendientes, error, enviando)
              try {
                const viejos = await db.tgQueue.where('motivo').equals('auto').toArray();
                if (viejos.length > 0) await db.tgQueue.bulkDelete(viejos.map((x) => x.id));
              } catch (e) {}

              await telegram.tgEncolar(data, 'auto');
              telegram.tgProcesarCola().catch((e) => console.warn('backupAuto cola', e));
            }
          } catch (e) {
            console.warn('backupAuto telegram', e);
          }
        }
      }
    } catch (e) {
      _backupFallos++;
      console.error('backupAuto fallo (intento ' + _backupFallos + ')', e);
    }
  }

  /** Programa el backup automático cada 2h mientras la app esté abierta. */
  function iniciarBackupInterval() {
    if (_backupIntervalTimer) clearInterval(_backupIntervalTimer);
    _backupIntervalTimer = setInterval(
      () => {
        backupAuto().catch((e) => console.warn('backup interval', e));
      },
      2 * 60 * 60 * 1000
    );
  }

  function detenerBackupInterval() {
    if (_backupIntervalTimer) clearInterval(_backupIntervalTimer);
    _backupIntervalTimer = null;
  }

  // ===== PRE-IMPORT SAFETY NET =====
  async function cargarPreImportInfo() {
    try {
      const rec = await db.config.get('preImportBackup');
      if (rec && rec.value) {
        preImportDisponible.value = true;
        preImportFecha.value = rec.fecha || null;
      } else {
        preImportDisponible.value = false;
        preImportFecha.value = null;
      }
    } catch (e) {
      console.error('cargarPreImportInfo', e);
    }
  }

  async function restaurarPreImport() {
    try {
      const rec = await db.config.get('preImportBackup');
      if (!rec || !rec.value) return toastMsg('No hay respaldo previo', TOAST.WARN);
      ui.confirmar({
        titulo: 'Deshacer importación',
        msg: '¿Restaurar los datos de antes de la última importación (' + fmtFH(rec.fecha) + ')?',
        onOk: async () => {
          await importarData(rec.value);
          toastMsg('Datos restaurados');
        },
      });
    } catch (e) {
      toastMsg('Error: ' + e.message, TOAST.BAD);
    }
  }

  // ===== ZONA PELIGROSA =====
  function borrarTodo() {
    ui.confirmar({
      titulo: '⚠ BORRAR TODO',
      msg: 'Esto eliminara PERMANENTEMENTE todos los datos de la app. No se puede deshacer.',
      onOk: () => {
        ui.preguntar({
          titulo: 'Confirmacion final',
          msg: 'Escribe BORRAR (en mayusculas) para confirmar:',
          placeholder: 'BORRAR',
        }).then(async (v) => {
          if (v !== 'BORRAR') return toastMsg('Cancelado', TOAST.WARN);
          try {
            const tables = [
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
            ];
            await db.transaction('rw', tables.concat(['config']), async () => {
              for (const t of tables) await db.table(t).clear();
              await db.config.clear();
            });
            toastMsg('Todos los datos eliminados');
            setTimeout(() => location.reload(), 1200);
          } catch (e) {
            toastMsg('Error: ' + e.message, TOAST.BAD);
          }
        });
      },
    });
  }

  return {
    ultimoBackup,
    importPreview,
    preImportDisponible,
    preImportFecha,
    importFile,
    exportar,
    exportarCifrado,
    triggerImport,
    onImportFile,
    ejecutarImport,
    importarData,
    validarEsquema,
    onRestoreBackup,
    restaurarBackupAuto,
    restaurarPreImport,
    backupAuto,
    iniciarBackupInterval,
    detenerBackupInterval,
    cargarPreImportInfo,
    borrarTodo,
    descargar,
  };
});
