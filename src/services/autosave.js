import { BackupFolder } from './backupFolder.js';
import { Storage } from './storage.js';
import { hashContenido } from './hash.js';
import { esNativo } from './platform.js';
import { App as CapApp } from '@capacitor/app';

const OPS_PARA_BACKUP = 10;
const KEY_HASH = 'autosave_ultimoHash';
const KEY_ULTIMO = 'autosave_ultimaFecha';

let _contadorOps = 0;
let _ultimoHash = null;
let _initDone = false;
let _guardando = false;
let _getDataFn = null;

export const Autosave = {
  async init({ getData }) {
    if (_initDone) return;
    _initDone = true;
    _getDataFn = getData;

    // Cargar estado previo
    _ultimoHash = await Storage.get(KEY_HASH);

    // Detectar salida de la app
    if (esNativo()) {
      CapApp.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) this._forzarGuardado('app-background');
      });
    }
    // En web: visibilitychange
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') this._forzarGuardado('page-hidden');
      });
    }
    // beforeunload en web (por si acaso)
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        this._forzarGuardado('beforeunload');
      });
    }
  },

  notificarOperacion() {
    _contadorOps++;
    if (_contadorOps >= OPS_PARA_BACKUP) {
      this._guardarSiCambio('contador-' + _contadorOps);
    }
  },

  async _forzarGuardado(motivo) {
    if (_guardando) return;
    await this._guardarSiCambio(motivo, true);
  },

  async _guardarSiCambio(motivo, forzar = false) {
    if (_guardando || !_getDataFn) return;
    _guardando = true;
    try {
      const data = _getDataFn();
      const json = JSON.stringify(data);
      const hash = await hashContenido(json);

      if (!forzar && hash === _ultimoHash) {
        return; // sin cambios, no gastar I/O
      }

      const nombre = await BackupFolder.guardar(data);
      await BackupFolder.rotar(30);
      _ultimoHash = hash;
      _contadorOps = 0;
      await Storage.set(KEY_HASH, hash);
      await Storage.set(KEY_ULTIMO, new Date().toISOString());
      console.log(`[Autosave] Backup "${nombre}" (${motivo})`);
    } catch (e) {
      console.error('[Autosave]', motivo, e);
    } finally {
      _guardando = false;
    }
  },

  // Llamar al arrancar la app: si hay cambios desde el ultimo backup, guardar
  async verificarAlArrancar() {
    await this._guardarSiCambio('arranque');
  },

  async info() {
    return {
      contadorActual: _contadorOps,
      opsParaBackup: OPS_PARA_BACKUP,
      ultimoHash: _ultimoHash,
      ultimaFecha: await Storage.get(KEY_ULTIMO)
    };
  },

  // Para probar manualmente
  async forzarBackupManual() {
    await this._guardarSiCambio('manual', true);
  }
};
