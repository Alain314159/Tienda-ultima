/**
 * Store de Backup (Pinia).
 * Responsable único de exportar/importar/restaurar datos: JSON plano,
 * JSON cifrado (AES-256-GCM), respaldo automático local y red de
 * seguridad pre-import.
 */
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { fmtFH } from '../utils/formato';
import { hoyLocal } from '../utils/fecha';
import { n } from '../utils/numero';
import { P, clean } from '../utils/id';
import { db } from '../db';
import { TOAST } from '../constants';
import { toastMsg } from '../utils/toast';
import { esNativo } from '../services/platform';
import { useConfigStore } from './useConfigStore';
import { useUIStore } from './useUIStore';
import { datosDeStores } from './exportar';
import { recargarTodoStores } from './recarga';
import { derivarClave, aBase64, desdeBase64, leerArchivoRespaldo } from '../services/backup';
import type { Config, Respaldo } from '../types';

// ============================================================
// Seguridad de importación (1.2 / 1.9)
// ============================================================

/**
 * Iteraciones PBKDF2 mínimas y máximas aceptadas al importar un respaldo
 * cifrado. Las controla el archivo: con `iter: 1` la fuerza bruta sería
 * trivial, y con un valor absurdo el teléfono se quedaría colgado
 * derivando la clave. Los respaldos propios usan 600k (v2) o 100k (v1).
 */
export const MIN_ITERACIONES_RESPALDO = 100000;
export const MAX_ITERACIONES_RESPALDO = 2_000_000;

/** ¿Son aceptables las iteraciones PBKDF2 que declara el archivo? */
export function validarIteracionesKdf(iter: unknown): { ok: true } | { ok: false; error: string } {
  if (typeof iter !== 'number' || !Number.isFinite(iter) || !Number.isInteger(iter)) {
    return { ok: false, error: 'El respaldo no declara iteraciones PBKDF2 válidas' };
  }
  if (iter < MIN_ITERACIONES_RESPALDO) {
    return {
      ok: false,
      error: `Respaldo con parámetros de cifrado débiles (${iter} iteraciones; mínimo ${MIN_ITERACIONES_RESPALDO})`,
    };
  }
  if (iter > MAX_ITERACIONES_RESPALDO) {
    return { ok: false, error: `Respaldo con iteraciones PBKDF2 excesivas (${iter})` };
  }
  return { ok: true };
}

// --- Límite de intentos de contraseña del respaldo cifrado ---
// Vive en el módulo (no en el store): el archivo se vuelve a elegir con
// cada reintento y el contador debe sobrevivir entre elecciones. Tras 5
// contraseñas fallidas hay que esperar 1 minuto antes de probar otra vez.
export const MAX_INTENTOS_CLAVE_RESPALDO = 5;
const ESPERA_CLAVE_RESPALDO_MS = 60_000;
let _intentosClave = 0;
let _bloqueoClaveHasta = 0;

/** ¿Se puede probar otra contraseña ahora mismo? */
export function puedeIntentarClave(): { ok: boolean; esperaMs: number } {
  const esperaMs = Math.max(0, _bloqueoClaveHasta - Date.now());
  return { ok: esperaMs === 0, esperaMs };
}

/** Registra una contraseña fallida; al 5.º fallo activa la espera. */
export function registrarClaveFallida(): void {
  _intentosClave += 1;
  if (_intentosClave >= MAX_INTENTOS_CLAVE_RESPALDO) {
    _bloqueoClaveHasta = Date.now() + ESPERA_CLAVE_RESPALDO_MS;
  }
}

/** Un descifrado correcto (o un archivo nuevo) resetea el contador. */
export function reiniciarIntentosClave(): void {
  _intentosClave = 0;
  _bloqueoClaveHasta = 0;
}

/** Intentos de contraseña que quedan antes de la espera. */
export function intentosClaveRestantes(): number {
  return Math.max(0, MAX_INTENTOS_CLAVE_RESPALDO - _intentosClave);
}

// --- Saneado de cfg al importar ---
// La importación NUNCA toca `pin` ni `pinActivo`: un archivo manipulado no
// puede fijar un PIN conocido ni desactivar el PIN. El resto de campos se
// valida uno a uno (tipo y rango); lo inválido se ignora con aviso y nunca
// rompe la importación de los datos.
const CFG_TEXTO: Record<string, number> = {
  nombre: 120,
  nombreTienda: 120,
  contactoDireccion: 500,
  contactoTelefonos: 200,
  contactoGrupoWa: 500,
};
const CFG_NUMERO_MIN0: Record<string, number | null> = {
  capitalInicial: null,
  umbralDiasCierre: 3650,
  umbralMermasSemana: 365,
  umbralFaltantesMes: 365,
  umbralSobrantesMes: 365,
  umbralBackupDias: 3650,
  umbralSinMovimientoDias: 3650,
  stockMinDefault: 100000,
  ultimoBackupAuto: null,
};
const CFG_BOOLEANO = [
  'busquedaGlobalActiva',
  'calcBilletesActiva',
  'notifActivo',
  'tutorialVisto',
  'mostrarSplash',
  'safeMode',
];
const CFG_FECHA_ISO = [
  'periodoInicio',
  'ultimoExport',
  'ultimaNotifStock',
  'ultimaNotifArqueo',
  'ultimaNotifCriticas',
  'ultimaNotifCierre',
  'ultimaNotifRespaldo',
  'ultimaNotifBackupFail',
];
const CFG_ARREGLO_TEXTO = ['anomaliasDescartadas', 'productosAvisados'];
const CFG_ENUM: Record<string, string[]> = {
  tema: ['light', 'dark'],
  graficoVista: ['dia', 'semana', 'mes'],
  graficoProdPeriodo: ['dia', 'semana', 'mes'],
  graficoProdTipo: ['vendidos', 'margen'],
};

/**
 * Sanea la `cfg` de un respaldo: devuelve solo los campos válidos (sin
 * `pin` ni `pinActivo`, que nunca se importan) y los avisos de lo ignorado.
 */
export function sanearCfgImportada(cfg: unknown): { cfg: Partial<Config>; avisos: string[] } {
  const limpia: Partial<Config> = {};
  const avisos: string[] = [];
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) {
    return { cfg: limpia, avisos };
  }
  const entrada = cfg as Record<string, unknown>;
  // El PIN no se importa jamás, ni siquiera para avisar: no hay nada que
  // decidir, el PIN local se conserva siempre.
  if ('pin' in entrada || 'pinActivo' in entrada) {
    avisos.push('El PIN del respaldo se ignoró (se conserva el PIN de este teléfono)');
  }
  const fechaValida = (v: unknown): v is string => typeof v === 'string' && !isNaN(new Date(v).getTime());
  for (const [clave, valor] of Object.entries(entrada)) {
    if (clave === 'pin' || clave === 'pinActivo') continue;
    if (clave in CFG_TEXTO) {
      if (typeof valor === 'string' && valor.length <= CFG_TEXTO[clave]) {
        (limpia as Record<string, unknown>)[clave] = valor;
      } else avisos.push(`Ajuste "${clave}" ignorado (texto no válido)`);
    } else if (clave === 'fontScale') {
      if (typeof valor === 'number' && isFinite(valor) && valor >= 1 && valor <= 2) {
        limpia.fontScale = valor;
      } else avisos.push('Ajuste "fontScale" ignorado (debe ser entre 1 y 2)');
    } else if (clave === 'umbralDescuentoPct') {
      if (typeof valor === 'number' && isFinite(valor) && valor >= 0 && valor <= 100) {
        limpia.umbralDescuentoPct = valor;
      } else avisos.push('Ajuste "umbralDescuentoPct" ignorado (debe ser entre 0 y 100)');
    } else if (clave in CFG_NUMERO_MIN0) {
      const tope = CFG_NUMERO_MIN0[clave];
      if (typeof valor === 'number' && isFinite(valor) && valor >= 0 && (tope === null || valor <= tope)) {
        (limpia as Record<string, unknown>)[clave] = valor;
      } else avisos.push(`Ajuste "${clave}" ignorado (número no válido)`);
    } else if (CFG_BOOLEANO.includes(clave)) {
      if (typeof valor === 'boolean') {
        (limpia as Record<string, unknown>)[clave] = valor;
      } else avisos.push(`Ajuste "${clave}" ignorado (debe ser sí/no)`);
    } else if (CFG_FECHA_ISO.includes(clave)) {
      if (fechaValida(valor)) {
        (limpia as Record<string, unknown>)[clave] = valor;
      } else avisos.push(`Ajuste "${clave}" ignorado (fecha no válida)`);
    } else if (clave === 'horaArqueo') {
      if (typeof valor === 'string' && (valor === '' || /^([01]\d|2[0-3]):[0-5]\d$/.test(valor))) {
        limpia.horaArqueo = valor;
      } else avisos.push('Ajuste "horaArqueo" ignorado (debe ser HH:MM)');
    } else if (CFG_ARREGLO_TEXTO.includes(clave)) {
      if (Array.isArray(valor) && valor.every((x) => typeof x === 'string')) {
        (limpia as Record<string, unknown>)[clave] = valor;
      } else avisos.push(`Ajuste "${clave}" ignorado (debe ser una lista de textos)`);
    } else if (clave in CFG_ENUM) {
      if (typeof valor === 'string' && CFG_ENUM[clave].includes(valor)) {
        (limpia as Record<string, unknown>)[clave] = valor;
      } else avisos.push(`Ajuste "${clave}" ignorado (valor no válido)`);
    } else {
      avisos.push(`Ajuste "${clave}" ignorado (desconocido)`);
    }
  }
  return { cfg: limpia, avisos };
}

/** Tablas de datos incluidas en un respaldo. Asientos NO viaja: se reconstruye
 * localmente desde las tablas de origen (ver exportar.ts). */
type TablaDatos =
  | 'productos'
  | 'lotes'
  | 'ventas'
  | 'compras'
  | 'ajustes'
  | 'arqueos'
  | 'movCaja'
  | 'cierres'
  | 'capital'
  | 'retiros'
  | 'socios'
  | 'distribuciones'
  | 'gastos'
  | 'pasivos'
  | 'auditorias';

export const useBackupStore = defineStore('backup', () => {
  const configStore = useConfigStore();
  const ui = useUIStore();

  // ===== ESTADO =====
  const ultimoBackup = ref<{ fecha: string; value: unknown } | null>(null);
  interface PreviewImportacion {
    archivo: Respaldo;
    campos: { key: string; label: string }[];
    actuales: Record<string, number>;
    nuevos: Record<string, number>;
    fechaArchivo: string | null;
    tiendaArchivo: string;
  }
  const importPreview = ref<PreviewImportacion | null>(null);
  const preImportDisponible = ref(false);
  const preImportFecha = ref<string | null>(null);
  const importFile = ref<File | null>(null);
  // Estados de carga de exportar/importar (2.9): los botones de Ajustes
  // muestran «Exportando…» / «Importando…» y se deshabilitan mientras dura
  // la operación. Viven en el store (no en el componente) porque la
  // importación cruza el diálogo de confirmación: el componente no puede
  // saber cuándo termina el trabajo real.
  const exportando = ref(false);
  const importando = ref(false);
  // Datos del respaldo YA parseados (y descifrados si aplicaba) durante la
  // previsualización. ejecutarImport usa ESTE objeto en vez de re-leer el
  // archivo: re-leer rompía los respaldos cifrados (el sobre no tiene
  // productos/ventas y saltaba "Archivo invalido" aunque la contraseña
  // fuera correcta) y duplicaba la lógica de gzip/cifrado.
  let _datosImport: Respaldo | null = null;
  let _backupFallos = 0;
  let _backupIntervalTimer: ReturnType<typeof setInterval> | null = null;

  // ===== EXPORTAR =====
  function descargar(blob: Blob, name: string) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  /**
   * Entrega un archivo de texto al usuario según la plataforma:
   * - Web: descarga del navegador (blob + <a download>). Devuelve null.
   * - Nativo (Android WebView): la descarga de blob: NO funciona — el
   *   WebView no tiene gestor de descargas para ese esquema. Se escribe
   *   directamente en Documents/ con el plugin Filesystem y devuelve la
   *   ruta usada (para que el toast le diga al usuario dónde quedó).
   */
  async function entregarArchivoTexto(
    contenido: string,
    nombre: string,
    tipo = 'application/json'
  ): Promise<string | null> {
    if (!esNativo()) {
      descargar(new Blob([contenido], { type: tipo }), nombre);
      return null;
    }
    const b64 = aBase64(new TextEncoder().encode(contenido));
    await Filesystem.writeFile({
      path: nombre,
      data: b64,
      directory: Directory.Documents,
      recursive: true,
    });
    return 'Documentos/' + nombre;
  }

  /** Exporta un respaldo JSON plano. Devuelve una promesa para que la UI pueda mostrar el estado de carga. */
  async function exportar() {
    if (exportando.value) return;
    exportando.value = true;
    try {
      const d = await datosDeStores();
      const destino = await entregarArchivoTexto(
        JSON.stringify(d, null, 2),
        'respaldo-tienda-' + hoyLocal() + '.json'
      );
      toastMsg(destino ? 'Respaldo guardado en ' + destino : 'Respaldo descargado');
      // Solo cuenta si el export terminó bien (antes se marcaba al lanzar).
      configStore.cfg.ultimoExport = new Date().toISOString();
      configStore.guardarCfg();
    } catch (e) {
      toastMsg('Error exportando: ' + (e instanceof Error ? e.message : String(e)), TOAST.BAD);
    } finally {
      exportando.value = false;
    }
  }

  async function exportarCifrado() {
    if (exportando.value) return;
    const pass = await ui.preguntar({
      titulo: 'Contraseña de cifrado',
      msg: 'Se guardara el respaldo cifrado con AES-256. Guarda la contraseña: si la pierdes, no se puede recuperar.',
      placeholder: 'Contraseña (min 6 caracteres)',
      type: 'password',
    });
    if (!pass || pass.length < 6) return toastMsg('Contrasena muy corta (min 6)', TOAST.BAD);
    exportando.value = true;
    try {
      const data = await datosDeStores();
      const enc = new TextEncoder();
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const iv = crypto.getRandomValues(new Uint8Array(12));
      // 600k iteraciones (OWASP 2023+ para PBKDF2-SHA256); el sobre declara
      // las suyas para que importadores futuros puedan bajar el coste.
      const ITER = 600000;
      const key = await derivarClave(pass, salt, ITER);
      const json = enc.encode(JSON.stringify(data));
      const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, json);
      const out = {
        version: 2,
        cifrado: true,
        kdf: { algo: 'PBKDF2-SHA256', iter: ITER },
        salt: aBase64(salt),
        iv: aBase64(iv),
        // Base64 por trozos: el spread ...bytes desbordaba la pila con >64KB
        data: aBase64(new Uint8Array(cipher)),
      };
      const destino = await entregarArchivoTexto(JSON.stringify(out), 'respaldo-cifrado-' + hoyLocal() + '.json');
      toastMsg(destino ? 'Respaldo cifrado guardado en ' + destino : 'Respaldo cifrado descargado');
      // Un export cifrado también es un respaldo manual: cuenta para el
      // recordatorio de backups igual que el export plano.
      configStore.cfg.ultimoExport = new Date().toISOString();
      configStore.guardarCfg();
    } catch (e) {
      toastMsg('Error cifrado: ' + (e instanceof Error ? e.message : String(e)), TOAST.BAD);
    } finally {
      exportando.value = false;
    }
  }

  // ===== IMPORTAR =====
  function triggerImport() {
    const el = document.getElementById('impFile');
    if (el) el.click();
  }

  function onImportFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    importFile.value = file;
    (e.target as HTMLInputElement).value = '';
    // Estado de carga (2.9): cubre leer, descifrar y validar el archivo.
    // Al mostrarse el diálogo de confirmación se apaga: ahí decide el
    // usuario y la app no está trabajando. La escritura real vuelve a
    // encenderlo dentro de importarData.
    importando.value = true;
    void (async () => {
      try {
        // Acepta JSON plano, .json.gz y los .json que son gzip por dentro
        // (export de versiones pre-migración) — detección por magic bytes
        let d = (await leerArchivoRespaldo(file)) as Record<string, unknown>;
        // Si esta cifrado, pedir contrasena (con límite de intentos)
        if (d.cifrado === true) {
          // Las iteraciones las declara el archivo: sin mínimo, `iter: 1`
          // haría trivial la fuerza bruta (1.9). v1 usaba 100k y no lo
          // declaraba; v2+ lo declara.
          const iter = (d.kdf as { iter?: number } | undefined)?.iter ?? 100000;
          const iterOk = validarIteracionesKdf(iter);
          if (!iterOk.ok) return toastMsg(iterOk.error, TOAST.BAD);
          const puede = puedeIntentarClave();
          if (!puede.ok) {
            return toastMsg(
              'Demasiados intentos con la contraseña. Espera ' +
                Math.ceil(puede.esperaMs / 1000) +
                ' s antes de probar otra vez.',
              TOAST.BAD
            );
          }
          let descifrado: Record<string, unknown> | null = null;
          // Hasta 5 intentos por archivo: cada fallo avisa cuántos quedan y
          // al 5.º se bloquea 1 minuto (el contador sobrevive a elegir el
          // archivo de nuevo). Cancelar no cuenta como intento.
          for (;;) {
            const pass = await ui.preguntar({
              titulo: 'Respaldo cifrado',
              msg: 'Este respaldo esta protegido. Ingresa la contrasena.',
              placeholder: 'Contrasena',
              type: 'password',
            });
            if (!pass) return toastMsg('Cancelado', TOAST.WARN);
            try {
              const salt = desdeBase64(String(d.salt));
              const iv = desdeBase64(String(d.iv));
              const cipher = desdeBase64(String(d.data));
              const key = await derivarClave(pass, salt, iter);
              const json = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
              descifrado = JSON.parse(new TextDecoder().decode(json));
              reiniciarIntentosClave();
              break;
            } catch {
              registrarClaveFallida();
              const restantes = intentosClaveRestantes();
              if (restantes <= 0) {
                return toastMsg(
                  'Contrasena incorrecta. Demasiados intentos: espera 1 minuto antes de probar otra vez.',
                  TOAST.BAD
                );
              }
              toastMsg(`Contrasena incorrecta (quedan ${restantes} intentos)`, TOAST.BAD);
            }
          }
          if (!descifrado) return toastMsg('No se pudo descifrar el respaldo', TOAST.BAD);
          d = descifrado;
        }
        if (!d.productos && !d.ventas) throw new Error('Archivo invalido');
        // Validación profunda ANTES de la preview: un archivo editado a mano
        // con negativos/strings/fechas hostiles ni siquiera se ofrece a
        // importar (antes el modal salía y el rechazo llegaba al confirmar)
        const val = validarEsquema(d as unknown as Respaldo);
        if (!val.ok) return toastMsg('Archivo con datos invalidos:\n· ' + val.errores.join('\n· '), TOAST.BAD);
        if (val.avisos && val.avisos.length) console.warn('Import con avisos:', val.avisos);
        _datosImport = d as unknown as Respaldo;

        const { usarStores, crearPreview, tablasAusentes } = await import('./importacion.js');
        importPreview.value = crearPreview(d as unknown as Respaldo, usarStores());

        let adv = '';
        const preview = importPreview.value;
        if (!preview) return;
        const campos = preview.campos;
        const totalActual = campos.reduce((s, c) => s + preview.actuales[c.key], 0);
        const totalNuevo = campos.reduce((s, c) => s + preview.nuevos[c.key], 0);
        if (totalActual > 0 && totalNuevo === 0) {
          adv = '⚠ El archivo NO TIENE datos. Importar VACIARA la app.';
        } else if (totalActual > 0 && totalNuevo < totalActual * 0.3) {
          adv = '⚠ El archivo tiene MUCHOS MENOS datos que los actuales. Podrias perder informacion.';
        } else if (totalActual > 0) {
          adv = 'Se reemplazaran TODOS los datos actuales con los del archivo.';
        }
        // #53 red-team: un archivo RECORTADO a mano (p.ej. solo productos) sin
        // esta clave no mostraba aviso alguno — el import borraba ventas/
        // compras/gastos con un "se reemplazarán todos los datos" genérico.
        // Un [] explícito sí es una decisión; una clave ausente, un recorte.
        const ausentes = tablasAusentes(d as unknown as Record<string, unknown>);
        if (ausentes.length > 0) {
          adv =
            '⚠ El archivo NO trae: ' +
            ausentes.join(', ') +
            '.\nEsas tablas quedarán VACÍAS al importar.' +
            (adv ? '\n\n' + adv : '');
        }
        // Ajustes del respaldo que se ignorarán (p. ej. el PIN, que nunca se
        // importa, o campos con valores no válidos): se avisa antes de confirmar.
        if (val.avisos && val.avisos.length) {
          adv += (adv ? '\n\n' : '') + 'Ajustes ignorados:\n· ' + val.avisos.join('\n· ');
        }

        ui.confirmar({ titulo: 'Importar datos', msg: adv, onOk: () => ejecutarImport() });
      } catch (err) {
        toastMsg('Error: ' + (err instanceof Error ? err.message : String(err)), TOAST.BAD);
      } finally {
        importando.value = false;
      }
    })();
  }

  async function ejecutarImport() {
    // Usa el objeto YA parseado (y descifrado) de la previsualización:
    // re-leer el archivo aquí rompía los respaldos cifrados (el sobre no
    // pasa el check de productos/ventas) y duplicaba la lógica de gzip.
    const d = _datosImport;
    if (!d) return toastMsg('No hay datos para importar', TOAST.WARN);
    try {
      // Guardar estado actual como red de seguridad
      try {
        const estadoActual = await datosDeStores();
        await P(db.config, { key: 'preImportBackup', value: estadoActual, fecha: new Date().toISOString() });
        preImportDisponible.value = true;
        preImportFecha.value = new Date().toISOString();
        console.log('✅ Pre-import backup guardado');
      } catch (e) {
        console.error('pre-import backup', e);
      }

      await importarData(d);
      _datosImport = null;
      importPreview.value = null;
      ui.ajustesAbierto = false;
      toastMsg('Datos importados (puedes deshacer desde Ajustes)', TOAST.OK, 'Deshacer', () => {
        ui.ajustesAbierto = true;
      });
    } catch (e) {
      toastMsg('Error: ' + (e instanceof Error ? e.message : String(e)), TOAST.BAD);
    }
  }

  /** Valida el esquema de un archivo de respaldo. */
  function validarEsquema(d: Respaldo) {
    const errores: string[] = [];
    const avisos: string[] = [];
    if (!d || typeof d !== 'object' || Array.isArray(d)) {
      // Array.isArray: un array también es typeof 'object' y escapaba del
      // check, produciendo errores confusos aguas abajo
      return { ok: false, errores: ['El archivo no es un objeto valido'] };
    }
    if (!d.productos && !d.ventas) {
      errores.push('Falta productos y ventas (no parece un respaldo)');
    }
    if (d.cfg !== undefined && (typeof d.cfg !== 'object' || d.cfg === null || Array.isArray(d.cfg))) {
      errores.push('"cfg" no es un objeto');
    }
    // La cfg se sanea campo a campo al importar (1.2): aquí solo se avisa
    // de lo que se ignorará, sin romper la importación de los datos.
    if (d.cfg !== undefined && typeof d.cfg === 'object' && d.cfg !== null && !Array.isArray(d.cfg)) {
      const { avisos: avisosCfg } = sanearCfgImportada(d.cfg);
      avisos.push(...avisosCfg);
    }
    const tablas: TablaDatos[] = [
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
      'pasivos',
      'auditorias',
    ];
    tablas.forEach((t) => {
      if (d[t] !== undefined && !Array.isArray(d[t])) errores.push('"' + t + '" no es un array');
    });
    tablas.forEach((t) => {
      if (!Array.isArray(d[t])) return;
      // unknown[] (pasivos/auditorias) no tiene .id en el tipo: leer como registro
      const arr = d[t] as unknown as Record<string, unknown>[];
      const sinId = arr.filter((x) => !x || typeof x !== 'object' || !x.id);
      if (sinId.length > 0) errores.push('"' + t + '": ' + sinId.length + ' item(s) sin id');
    });
    // --- IDs duplicados (#4 red-team): bulkPut es last-wins — un respaldo
    // editado a mano (o un copy-paste) con la misma clave dos veces perdía
    // registros EN SILENCIO al importar, sin error ni aviso
    tablas.forEach((t) => {
      if (!Array.isArray(d[t])) return;
      const vistos = new Set();
      let dups = 0;
      for (const x of d[t] as unknown as Record<string, unknown>[]) {
        if (!x || typeof x !== 'object' || !x.id) continue;
        if (vistos.has(x.id)) dups++;
        else vistos.add(x.id);
      }
      if (dups > 0) errores.push(dups + ' registro(s) con id duplicado en "' + t + '"');
    });
    if (Array.isArray(d.ventas)) {
      // items es OBLIGATORIO y array: antes solo se validaba si existía, y una
      // venta SIN items colaba la validación → v.items.length reventaba el
      // render de VentasView en CADA arranque (pantalla en blanco permanente)
      const ventasMalas = d.ventas.filter((v) => !v || !Array.isArray(v.items));
      if (ventasMalas.length > 0) errores.push(ventasMalas.length + ' venta(s) con items invalidos');
      // Números no finitos: se serializan como null en JSON y al restaurar
      // valen 0 → descuadre asimétrico silencioso entre respaldo y restauración
      const noFinitas = d.ventas.filter(
        (v) =>
          v &&
          Array.isArray(v.items) &&
          v.items.some(
            (i) => (i && !isFinite(n(i.precio))) || (i && !isFinite(n(i.cantidad))) || (i && !isFinite(n(i.costo)))
          )
      );
      if (noFinitas.length > 0) errores.push(noFinitas.length + ' venta(s) con montos no finitos');
    }
    if (Array.isArray(d.lotes)) {
      const lotesMalos = d.lotes.filter((l) => l && (l.cantidadInicial === undefined || l.costo === undefined));
      if (lotesMalos.length > 0) avisos.push(lotesMalos.length + ' lote(s) sin cantidadInicial/costo');
      const lotesInfinitos = d.lotes.filter(
        (l) => l && (!isFinite(n(l.cantidadInicial)) || !isFinite(n(l.costo)) || !isFinite(n(l.cantidadVendida)))
      );
      if (lotesInfinitos.length > 0) errores.push(lotesInfinitos.length + ' lote(s) con cantidades/costos no finitos');
    }

    // ===== Ronda 3 red-team: respaldo editado a mano / datos hostiles =====
    // La vía UI bloquea todo esto (schemas + isFinite + formularios), pero un
    // archivo editado a mano lo colaba por el import y corrompía la
    // contabilidad EN SILENCIO (ganancias infladas, caja negativa, vistas
    // muertas). La integridad se protege RUIDOSO: se rechaza el archivo y se
    // dice exactamente qué trae.

    /** true si el valor es un número finito NEGATIVO (undefined/null → false). */
    const esNegativo = (x: unknown) => isFinite(n(x)) && n(x) < 0;
    /** true si hay fecha presente pero no parsea ('' o 'garbage' → true). */
    const fechaMala = (x: unknown) =>
      x !== undefined && x !== null && isNaN(new Date(x as string | number | Date).getTime());
    /**
     * true si la fecha parsea pero está fuera del rango plausible de la app
     * (#7/#28 red-team): una venta del año 9999 o un lote de 1969 pasaban la
     * validación (solo se miraba NaN) y quedaban mal agrupadas PARA SIEMPRE:
     * inflan el período actual, que ya nunca cierra. 2000–2100 cubre con
     * holgura la vida real del negocio (app creada en 2025).
     */
    const fechaExtrema = (x: unknown) => {
      if (x === undefined || x === null || x === '') return false;
      const t = new Date(x as string | number | Date).getTime();
      if (isNaN(t)) return false; // ya lo reporta fechaMala
      const anio = new Date(t).getUTCFullYear();
      return anio < 2000 || anio > 2100;
    };
    /** Registros con campo fecha inválido en una tabla (0 si la tabla no viene). */
    const conFechaMala = (tabla: TablaDatos, campo = 'fecha') => {
      const arr = d[tabla];
      if (!Array.isArray(arr)) return 0;
      return arr.filter((x) => x && typeof x === 'object' && fechaMala((x as Record<string, unknown>)[campo])).length;
    };
    const pushFecha = (tabla: TablaDatos, total: number, campo = 'fecha') => {
      if (total > 0) errores.push(total + ' registro(s) de "' + tabla + '" con ' + campo + ' inválida');
    };
    /** Registros con campo fecha fuera del rango 2000–2100 en una tabla. */
    const conFechaExtrema = (tabla: TablaDatos, campo = 'fecha') => {
      const arr = d[tabla];
      if (!Array.isArray(arr)) return 0;
      return arr.filter((x) => x && typeof x === 'object' && fechaExtrema((x as Record<string, unknown>)[campo]))
        .length;
    };
    const pushFechaExtrema = (tabla: TablaDatos, total: number, campo = 'fecha') => {
      if (total > 0)
        errores.push(total + ' registro(s) de "' + tabla + '" con ' + campo + ' fuera de rango (año <2000 o >2100)');
    };

    // --- Montos NEGATIVOS (contable) ---
    if (Array.isArray(d.ventas)) {
      const itemsNeg = d.ventas.filter(
        (v) =>
          v &&
          Array.isArray(v.items) &&
          v.items.some((i) => i && (esNegativo(i.precio) || esNegativo(i.cantidad) || esNegativo(i.costo)))
      );
      if (itemsNeg.length > 0) errores.push(itemsNeg.length + ' venta(s) con precio/cantidad/costo negativos');
      const totalNeg = d.ventas.filter((v) => v && esNegativo(v.total));
      if (totalNeg.length > 0) errores.push(totalNeg.length + ' venta(s) con total negativo');
    }
    if (Array.isArray(d.lotes)) {
      const lotesNeg = d.lotes.filter(
        (l) => l && (esNegativo(l.costo) || esNegativo(l.cantidadInicial) || esNegativo(l.cantidadVendida))
      );
      if (lotesNeg.length > 0) errores.push(lotesNeg.length + ' lote(s) con costo/cantidades negativos');
    }
    if (Array.isArray(d.compras)) {
      const malas = d.compras.filter(
        (c) => c && (esNegativo(c.cantidad) || esNegativo(c.costo) || esNegativo(c.total))
      );
      if (malas.length > 0) errores.push(malas.length + ' compra(s) con cantidad/costo/total negativos');
    }
    if (Array.isArray(d.gastos)) {
      const malos = d.gastos.filter((g) => g && esNegativo(g.monto));
      if (malos.length > 0) errores.push(malos.length + ' gasto(s) con monto negativo');
    }
    if (Array.isArray(d.socios)) {
      const malos = d.socios.filter(
        (s) => s && (esNegativo(s.aporte) || esNegativo(s.porcentaje) || n(s.porcentaje) > 100)
      );
      if (malos.length > 0) errores.push(malos.length + ' socio(s) con aporte/porcentaje inválidos');
    }
    const montosCapital = ['capital', 'retiros', 'distribuciones'] as TablaDatos[];
    montosCapital.forEach((t) => {
      if (!Array.isArray(d[t])) return;
      const malos = (d[t] as Record<string, unknown>[]).filter((x) => x && esNegativo(x.monto));
      if (malos.length > 0) errores.push(malos.length + ' registro(s) de "' + t + '" con monto negativo');
    });
    // NOTA: ajuste.cantidad negativo es LEGÍTIMO (merma −/sobrante +).

    // --- Strings OBLIGATORIAS (sin ellas revientan sorts/búsquedas/render) ---
    const sinNombreProductos = Array.isArray(d.productos)
      ? d.productos.filter((p) => !p || !String(p.nombre || '').trim())
      : [];
    if (sinNombreProductos.length > 0) errores.push(sinNombreProductos.length + ' producto(s) sin nombre');
    const sinNombreSocios = Array.isArray(d.socios) ? d.socios.filter((s) => !s || !String(s.nombre || '').trim()) : [];
    if (sinNombreSocios.length > 0) errores.push(sinNombreSocios.length + ' socio(s) sin nombre');
    if (Array.isArray(d.ventas)) {
      const sinNombreItems = d.ventas.filter(
        (v) => v && Array.isArray(v.items) && v.items.some((i) => i && !String(i.nombre || '').trim())
      );
      if (sinNombreItems.length > 0) errores.push(sinNombreItems.length + ' venta(s) con ítems sin nombre');
    }
    if (Array.isArray(d.productos)) {
      const codigosMalos = d.productos.filter((p) => p && p.codigo !== undefined && typeof p.codigo !== 'string');
      if (codigosMalos.length > 0) errores.push(codigosMalos.length + ' producto(s) con código no-string');
    }

    // --- FECHAS inválidas (agrupación/períodos dependen de ellas) ---
    if (Array.isArray(d.ventas)) {
      const sinFecha = d.ventas.filter(
        (v) => v && (v.fecha === undefined || v.fecha === null || String(v.fecha) === '')
      );
      if (sinFecha.length > 0) errores.push(sinFecha.length + ' venta(s) sin fecha');
      pushFecha('ventas', conFechaMala('ventas'));
    }
    (
      [
        'compras',
        'gastos',
        'lotes',
        'ajustes',
        'movCaja',
        'capital',
        'retiros',
        'socios',
        'distribuciones',
        'arqueos',
        'pasivos',
      ] as TablaDatos[]
    ).forEach((t) => pushFecha(t, conFechaMala(t)));
    // Auditorías: su fecha es fechaInicio, no fecha.
    if (Array.isArray(d.auditorias)) {
      const malas = d.auditorias.filter(
        (a) => a && typeof a === 'object' && fechaMala((a as Record<string, unknown>).fechaInicio)
      );
      if (malas.length > 0) errores.push(malas.length + ' registro(s) de "auditorias" con fechaInicio inválida');
    }
    // Fechas extremas: mismo recorrido que las inválidas
    if (Array.isArray(d.ventas)) pushFechaExtrema('ventas', conFechaExtrema('ventas'));
    (
      [
        'compras',
        'gastos',
        'lotes',
        'ajustes',
        'movCaja',
        'capital',
        'retiros',
        'socios',
        'distribuciones',
        'arqueos',
        'pasivos',
      ] as TablaDatos[]
    ).forEach((t) => pushFechaExtrema(t, conFechaExtrema(t)));
    if (Array.isArray(d.auditorias)) {
      const extremos = d.auditorias.filter(
        (a) => a && typeof a === 'object' && fechaExtrema((a as Record<string, unknown>).fechaInicio)
      );
      if (extremos.length > 0)
        errores.push(
          extremos.length + ' registro(s) de "auditorias" con fechaInicio fuera de rango (año <2000 o >2100)'
        );
    }
    if (Array.isArray(d.cierres)) {
      const malos = d.cierres.filter(
        (c) =>
          c && (fechaMala(c.fechaCierre) || fechaMala(c.periodoInicio) || fechaMala(c.periodoFin) || fechaMala(c.fecha))
      );
      if (malos.length > 0) errores.push(malos.length + ' cierre(s) con fechas inválidas');
      const extremos = d.cierres.filter(
        (c) =>
          c &&
          (fechaExtrema(c.fechaCierre) ||
            fechaExtrema(c.periodoInicio) ||
            fechaExtrema(c.periodoFin) ||
            fechaExtrema(c.fecha))
      );
      if (extremos.length > 0)
        errores.push(extremos.length + ' cierre(s) con fechas fuera de rango (año <2000 o >2100)');
    }

    const json = JSON.stringify(d);
    if (json.length > 50 * 1024 * 1024) errores.push('Archivo demasiado grande (>50MB)');
    if (d.version && d.version < 6) avisos.push('Respaldo de version antigua (v' + d.version + ')');
    return { ok: errores.length === 0, errores, avisos };
  }

  /** Reemplaza todos los datos con los del archivo (con rollback automático). */
  async function importarData(d: Respaldo) {
    const v = validarEsquema(d);
    if (!v.ok) throw new Error('Datos invalidos:\n· ' + v.errores.join('\n· '));
    if (v.avisos && v.avisos.length) console.warn('Import con avisos:', v.avisos);

    // Estado de carga (2.9): cubre la escritura de la importación, venga
    // de un archivo, del backup automático o de deshacer la importación.
    importando.value = true;
    try {
      const tables: TablaDatos[] = [
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
        'pasivos',
        'auditorias',
      ];
      // Snapshot antes por si falla
      const respaldo: Record<string, unknown[]> = {};
      try {
        for (const t of tables) respaldo[t] = await db.table(t).toArray();
      } catch (e) {
        console.warn('No pude tomar snapshot', e);
      }

      try {
        // La cfg del archivo se sanea campo a campo y NUNCA trae pin ni
        // pinActivo: el PIN de este teléfono se conserva siempre (1.2).
        const { cfg: cfgSaneada, avisos: avisosCfg } = d.cfg
          ? sanearCfgImportada(d.cfg)
          : { cfg: {}, avisos: [] as string[] };
        if (avisosCfg.length) console.warn('Import: ajustes ignorados:', avisosCfg);
        const cfgFinal = { ...configStore.cfg, ...cfgSaneada };
        await db.transaction('rw', [...tables, 'config'], async () => {
          for (const t of tables) {
            await db.table(t).clear();
            if (Array.isArray(d[t])) await db.table(t).bulkPut(clean(d[t]));
          }
          if (d.cfg) await P(db.config, { key: 'cfg', value: cfgFinal });
        });
        // Object.assign IN-PLACE (no spread): mantener vivas las referencias capturadas
        if (d.cfg) Object.assign(configStore.cfg, cfgSaneada);
      } catch (err) {
        try {
          await db.transaction('rw', tables, async () => {
            for (const t of tables) {
              await db.table(t).clear();
              if (respaldo[t] && respaldo[t].length) await db.table(t).bulkPut(respaldo[t]);
            }
          });
          throw new Error(
            'Fallo la importacion (rollback aplicado): ' + (err instanceof Error ? err.message : String(err))
          );
        } catch {
          throw new Error('Fallo la importacion Y el rollback: ' + (err instanceof Error ? err.message : String(err)));
        }
      }
      // La cfg ya se fusionó (saneada, sin PIN) dentro de la transacción.
      await recargarTodoStores();
    } finally {
      importando.value = false;
    }
  }

  async function onRestoreBackup(data: Respaldo) {
    try {
      await importarData(data);
      toastMsg('Backup restaurado');
    } catch (e) {
      toastMsg('Error restaurando: ' + (e instanceof Error ? e.message : String(e)), TOAST.BAD);
    }
  }

  function restaurarBackupAuto() {
    if (!ultimoBackup.value) return;
    ui.confirmar({
      titulo: 'Restaurar backup',
      msg: '¿Reemplazar los datos con el backup automático del ' + fmtFH(ultimoBackup.value?.fecha || '') + '?',
      onOk: async () => {
        if (ultimoBackup.value) await importarData(ultimoBackup.value.value as Respaldo);
        ui.ajustesAbierto = false;
        toastMsg('Backup restaurado');
      },
    });
  }

  // ===== BACKUP AUTOMÁTICO LOCAL =====
  async function backupAuto() {
    try {
      const data = await datosDeStores();
      await P(db.config, { key: 'backupAuto', value: data, fecha: new Date().toISOString() });
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
        msg: '¿Restaurar los datos de antes de la última importación (' + fmtFH(rec.fecha || '') + ')?',
        onOk: async () => {
          await importarData(rec.value as Respaldo);
          toastMsg('Datos restaurados');
        },
      });
    } catch (e) {
      toastMsg('Error: ' + (e instanceof Error ? e.message : String(e)), TOAST.BAD);
    }
  }

  // ===== ZONA PELIGROSA =====
  function borrarTodo() {
    // La operación MÁS destructiva de la app: si hay PIN activo se pide
    // ANTES de las confirmaciones (antes solo pedía escribir BORRAR)
    ui.pedirPin(() => {
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
              toastMsg('Error: ' + (e instanceof Error ? e.message : String(e)), TOAST.BAD);
            }
          });
        },
      });
    });
  }

  return {
    ultimoBackup,
    importPreview,
    preImportDisponible,
    preImportFecha,
    importFile,
    exportando,
    importando,
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
