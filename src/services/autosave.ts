import { BackupFolder, esErrorCuota } from './backupFolder';
import { Storage } from './storage';
import { hashContenido } from './hash';
import { esNativo } from './platform';
import { App as CapApp } from '@capacitor/app';
import { Log } from './logger';
import { TOAST } from '../constants';
import { toastMsg } from '../utils/toast';

const OPS_PARA_BACKUP = 10;
const KEY_HASH = 'autosave_ultimoHash';
const KEY_ULTIMO = 'autosave_ultimaFecha';
/** No avisar del mismo fallo más de una vez por hora: el autosave reintenta solo. */
const AVISO_FALLO_CADA_MS = 60 * 60 * 1000;

let _contadorOps = 0;
let _ultimoHash: string | null = null;
let _initDone = false;
let _guardando = false;
/** Un guardado pedido mientras otro estaba en curso: se reintenta al terminar (1.4). */
let _pendiente = false;
let _ultimoAvisoFallo = 0;
let _getDataFn: (() => unknown | Promise<unknown>) | null = null;

export const Autosave = {
  async init({ getData }: { getData: () => unknown | Promise<unknown> }) {
    if (_initDone) return;
    _initDone = true;
    _getDataFn = getData as () => unknown | Promise<unknown>;

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

  async _forzarGuardado(motivo: string) {
    if (_guardando) {
      // Antes se descartaba sin más: el cambio quedaba sin respaldar hasta
      // el próximo disparo. Ahora queda pendiente y se guarda al terminar.
      _pendiente = true;
      return;
    }
    await this._guardarSiCambio(motivo, true);
  },

  async _guardarSiCambio(motivo: string, forzar = false) {
    if (_guardando) {
      _pendiente = true;
      return;
    }
    if (!_getDataFn) return;
    _guardando = true;
    try {
      // datosDeStores es async (pasivos/auditorías se leen de IndexedDB):
      // sin await, JSON.stringify recibiría la Promise y el autosave
      // guardaría '{}' con el hash siempre igual.
      const data = await _getDataFn();
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
      // 1.4: antes el fallo solo quedaba en console.error y el usuario se
      // enteraba al perder los datos. Ahora hay aviso visible (con
      // moderación: como mucho uno por hora) y queda en el log.
      Log.error('Autosave: guardado fallido (' + motivo + ')', e);
      const ahora = Date.now();
      if (ahora - _ultimoAvisoFallo > AVISO_FALLO_CADA_MS) {
        _ultimoAvisoFallo = ahora;
        try {
          if (esErrorCuota(e)) {
            toastMsg(
              'Queda poco espacio en el teléfono: el respaldo automático no se guardó. Exporta un respaldo y libera espacio.',
              TOAST.BAD
            );
          } else {
            toastMsg('No se pudo guardar el respaldo automático. Se reintentará solo.', TOAST.WARN);
          }
        } catch (e2) {
          Log.warn('Autosave: no se pudo mostrar el aviso de fallo', e2);
        }
      }
      // El próximo disparo (10 operaciones o salida de la app) lo reintenta.
    } finally {
      _guardando = false;
      if (_pendiente) {
        _pendiente = false;
        await this._guardarSiCambio('reintento-pendiente', true);
      }
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
      ultimaFecha: await Storage.get(KEY_ULTIMO),
    };
  },

  // Para probar manualmente
  async forzarBackupManual() {
    await this._guardarSiCambio('manual', true);
  },
};
