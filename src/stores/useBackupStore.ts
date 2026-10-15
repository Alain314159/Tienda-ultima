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
import { useTelegramStore } from './useTelegramStore';
import { datosDeStores } from './exportar';
import { recargarTodoStores } from './recarga';
import { derivarClave, hashContenido, aBase64, desdeBase64, leerArchivoRespaldo } from '../services/backup';
import type { Respaldo } from '../types';

/** Tablas de datos incluidas en un respaldo (excluye asientos/pasivos/auditorias). */
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
  | 'gastos';

export const useBackupStore = defineStore('backup', () => {
  const configStore = useConfigStore();
  const ui = useUIStore();
  const telegram = useTelegramStore();

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

  function exportar() {
    const d = datosDeStores();
    void (async () => {
      try {
        const destino = await entregarArchivoTexto(
          JSON.stringify(d, null, 2),
          'respaldo-tienda-' + hoyLocal() + '.json'
        );
        toastMsg(destino ? 'Respaldo guardado en ' + destino : 'Respaldo descargado');
      } catch (e) {
        toastMsg('Error exportando: ' + (e instanceof Error ? e.message : String(e)), TOAST.BAD);
      }
    })();
    configStore.cfg.ultimoExport = new Date().toISOString();
    configStore.guardarCfg();
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
    } catch (e) {
      toastMsg('Error cifrado: ' + (e instanceof Error ? e.message : String(e)), TOAST.BAD);
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
    void (async () => {
      try {
        // Acepta JSON plano, .json.gz y los .json que son gzip por dentro
        // (export de versiones pre-migración) — detección por magic bytes
        let d = (await leerArchivoRespaldo(file)) as Record<string, unknown>;
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
            const salt = desdeBase64(String(d.salt));
            const iv = desdeBase64(String(d.iv));
            const cipher = desdeBase64(String(d.data));
            // v1 usaba 100k iteraciones y no lo declaraba; v2+ lo declara
            const iter = (d.kdf as { iter?: number } | undefined)?.iter || 100000;
            const key = await derivarClave(pass, salt, iter);
            const json = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
            d = JSON.parse(new TextDecoder().decode(json));
          } catch {
            return toastMsg('Contrasena incorrecta', TOAST.BAD);
          }
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

        ui.confirmar({ titulo: 'Importar datos', msg: adv, onOk: () => ejecutarImport() });
      } catch (err) {
        toastMsg('Error: ' + (err instanceof Error ? err.message : String(err)), TOAST.BAD);
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
        const estadoActual = datosDeStores();
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
    ];
    tablas.forEach((t) => {
      if (d[t] !== undefined && !Array.isArray(d[t])) errores.push('"' + t + '" no es un array');
    });
    tablas.forEach((t) => {
      if (!Array.isArray(d[t])) return;
      const sinId = d[t].filter((x) => !x || typeof x !== 'object' || !x.id);
      if (sinId.length > 0) errores.push('"' + t + '": ' + sinId.length + ' item(s) sin id');
    });
    // --- IDs duplicados (#4 red-team): bulkPut es last-wins — un respaldo
    // editado a mano (o un copy-paste) con la misma clave dos veces perdía
    // registros EN SILENCIO al importar, sin error ni aviso
    tablas.forEach((t) => {
      if (!Array.isArray(d[t])) return;
      const vistos = new Set();
      let dups = 0;
      for (const x of d[t]) {
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
      ] as TablaDatos[]
    ).forEach((t) => pushFecha(t, conFechaMala(t)));
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
      ] as TablaDatos[]
    ).forEach((t) => pushFechaExtrema(t, conFechaExtrema(t)));
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
    ];
    // Snapshot antes por si falla
    const respaldo: Record<string, unknown[]> = {};
    try {
      for (const t of tables) respaldo[t] = await db.table(t).toArray();
    } catch (e) {
      console.warn('No pude tomar snapshot', e);
    }

    try {
      await db.transaction('rw', [...tables, 'config'], async () => {
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
        throw new Error(
          'Fallo la importacion (rollback aplicado): ' + (err instanceof Error ? err.message : String(err))
        );
      } catch {
        throw new Error('Fallo la importacion Y el rollback: ' + (err instanceof Error ? err.message : String(err)));
      }
    }
    // Object.assign IN-PLACE (no spread): mantener vivas las referencias capturadas
    if (d.cfg) Object.assign(configStore.cfg, d.cfg);
    await recargarTodoStores();
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
              } catch {}

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
