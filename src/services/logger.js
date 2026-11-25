import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { esNativo } from './platform.js';

const CARPETA = 'logs';
const MAX_DIAS = 7;
const FLUSH_CADA_MS = 5000;
const FLUSH_CADA_LINEAS = 30;
const MAX_BUFFER = 500;

let _buffer = [];
let _timerFlush = null;
let _activo = false;
let _silencioso = false; // evita loops infinitos
let _initDone = false;
let _originalConsole = null;

// ============================================================
// Serializacion segura (evita circular, funciones, etc.)
// ============================================================
function serializar(valor, depth = 0) {
  if (depth > 3) return '[max depth]';
  if (valor === null) return 'null';
  if (valor === undefined) return 'undefined';
  const t = typeof valor;
  if (t === 'string') return valor;
  if (t === 'number' || t === 'boolean') return String(valor);
  if (t === 'function') return '[Function ' + (valor.name || 'anon') + ']';
  if (valor instanceof Error) {
    return valor.name + ': ' + valor.message + (valor.stack ? '\n' + valor.stack.split('\n').slice(0, 5).join('\n') : '');
  }
  if (Array.isArray(valor)) {
    if (valor.length > 20) return '[Array(' + valor.length + ')] ' + valor.slice(0, 20).map(v => serializar(v, depth + 1)).join(', ') + '...';
    return '[' + valor.map(v => serializar(v, depth + 1)).join(', ') + ']';
  }
  if (t === 'object') {
    const keys = Object.keys(valor).slice(0, 15);
    const partes = keys.map(k => {
      try { return k + ': ' + serializar(valor[k], depth + 1); }
      catch { return k + ': [error]'; }
    });
    if (Object.keys(valor).length > 15) partes.push('...');
    return '{' + partes.join(', ') + '}';
  }
  return String(valor);
}

function formatearArgs(args) {
  return Array.from(args).map(a => serializar(a)).join(' ');
}

function timestamp() {
  const d = new Date();
  const p = (n, l = 2) => String(n).padStart(l, '0');
  return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()) + '.' + p(d.getMilliseconds(), 3);
}

function fechaISO() {
  return new Date().toISOString().slice(0, 10);
}

// ============================================================
// Escritura
// ============================================================
async function escribirLineas(lineas) {
  if (!lineas.length) return;
  const texto = lineas.join('\n') + '\n';

  if (!esNativo()) {
    // Web: guardar en localStorage (limitado pero util para debug)
    try {
      const key = 'log_' + fechaISO();
      const prev = localStorage.getItem(key) || '';
      const nuevo = (prev + texto).slice(-500000); // max ~500KB por dia
      localStorage.setItem(key, nuevo);
    } catch (e) { /* silencioso */ }
    return;
  }

  // Nativo: escribir a archivo
  try {
    const fecha = fechaISO();
    const path = `${CARPETA}/app-${fecha}.log`;
    // Intentar append
    try {
      const actual = await Filesystem.readFile({ path, directory: Directory.Documents, encoding: Encoding.UTF8 });
      const contenido = (typeof actual.data === 'string' ? actual.data : '') + texto;
      await Filesystem.writeFile({ path, data: contenido, directory: Directory.Documents, encoding: Encoding.UTF8, recursive: true });
    } catch (e) {
      // No existe, crear
      await Filesystem.writeFile({ path, data: texto, directory: Directory.Documents, encoding: Encoding.UTF8, recursive: true });
    }
  } catch (e) {
    // Ultimo recurso: silencioso
  }
}

async function flush() {
  if (_silencioso || !_buffer.length) return;
  _silencioso = true;
  try {
    const lineas = _buffer.slice();
    _buffer = [];
    await escribirLineas(lineas);
  } catch (e) {
    // no hacer nada
  } finally {
    _silencioso = false;
  }
}

function agendarFlush() {
  if (_timerFlush) return;
  _timerFlush = setTimeout(() => {
    _timerFlush = null;
    flush();
  }, FLUSH_CADA_MS);
}

function agregar(nivel, mensaje) {
  if (!_activo) return;
  if (_buffer.length >= MAX_BUFFER) _buffer.shift(); // descartar el mas viejo
  _buffer.push('[' + timestamp() + '] [' + nivel + '] ' + mensaje);
  if (_buffer.length >= FLUSH_CADA_LINEAS) {
    flush();
  } else {
    agendarFlush();
  }
}

// ============================================================
// API publica
// ============================================================
export const Log = {
  async init() {
    if (_initDone) return;
    _initDone = true;
    _activo = true;

    // 1. Capturar console
    _originalConsole = {
      log: console.log,
      warn: console.warn,
      error: console.error,
      info: console.info
    };
    const self = this;
    console.log = (...args) => {
      _originalConsole.log.apply(console, args);
      agregar('LOG', formatearArgs(args));
    };
    console.info = (...args) => {
      _originalConsole.info.apply(console, args);
      agregar('INFO', formatearArgs(args));
    };
    console.warn = (...args) => {
      _originalConsole.warn.apply(console, args);
      agregar('WARN', formatearArgs(args));
    };
    console.error = (...args) => {
      _originalConsole.error.apply(console, args);
      agregar('ERROR', formatearArgs(args));
    };

    // 2. Capturar errores globales
    window.addEventListener('error', (e) => {
      agregar('FATAL', (e.message || 'error') + ' @ ' + (e.filename || '?') + ':' + (e.lineno || '?') + ':' + (e.colno || '?'));
    });

    // 3. Capturar promesas rechazadas
    window.addEventListener('unhandledrejection', (e) => {
      const r = e.reason;
      agregar('REJECT', r && r.message ? r.message : serializar(r));
    });

    // 4. Flush al salir
    if (esNativo()) {
      const { App: CapApp } = await import('@capacitor/app');
      CapApp.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) flush();
      });
    }
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
    window.addEventListener('beforeunload', () => flush());

    // 5. Encabezado
    agregar('INIT', 'Logger iniciado · plataforma=' + (esNativo() ? 'nativo' : 'web') + ' · ' + new Date().toISOString());

    // 6. Rotacion silenciosa
    setTimeout(() => this.rotar().catch(() => {}), 3000);
  },

  // Evento del negocio (ej: venta guardada, error en transaccion)
  evento(tipo, data) {
    agregar('EVENT', tipo + (data ? ' · ' + serializar(data) : ''));
  },

  // Log manual
  info(msg, data) { agregar('INFO', msg + (data ? ' · ' + serializar(data) : '')); },
  warn(msg, data) { agregar('WARN', msg + (data ? ' · ' + serializar(data) : '')); },
  error(msg, data) { agregar('ERROR', msg + (data ? ' · ' + serializar(data) : '')); },

  // Forzar escritura inmediata
  async flush() { await flush(); },

  // Listar archivos de log disponibles
  async listar() {
    if (!esNativo()) {
      const archivos = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('log_')) archivos.push({ name: k.replace('log_', '') + '.log', size: (localStorage.getItem(k) || '').length });
      }
      return archivos.sort((a, b) => b.name.localeCompare(a.name));
    }
    try {
      const r = await Filesystem.readdir({ path: CARPETA, directory: Directory.Documents });
      return (r.files || []).filter(f => f.name.endsWith('.log')).sort((a, b) => b.name.localeCompare(a.name));
    } catch (e) { return []; }
  },

  // Leer el contenido de un archivo de log
  async leer(nombre) {
    if (!esNativo()) {
      return localStorage.getItem('log_' + nombre.replace('.log', '')) || '';
    }
    try {
      const r = await Filesystem.readFile({ path: `${CARPETA}/${nombre}`, directory: Directory.Documents, encoding: Encoding.UTF8 });
      return typeof r.data === 'string' ? r.data : '';
    } catch (e) { return ''; }
  },

  // Borrar logs viejos
  async rotar(dias = MAX_DIAS) {
    if (!esNativo()) {
      const limite = new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith('log_') && k.replace('log_', '') < limite) localStorage.removeItem(k);
      }
      return;
    }
    try {
      const r = await Filesystem.readdir({ path: CARPETA, directory: Directory.Documents });
      const limite = new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);
      for (const f of (r.files || [])) {
        const m = f.name.match(/app-(\d{4}-\d{2}-\d{2})\.log/);
        if (m && m[1] < limite) {
          try { await Filesystem.deleteFile({ path: `${CARPETA}/${f.name}`, directory: Directory.Documents }); } catch (e) {}
        }
      }
    } catch (e) {}
  },

  // Para probar desde la UI
  async info() {
    const archivos = await this.listar();
    return {
      activo: _activo,
      buffer: _buffer.length,
      archivos,
      plataforma: esNativo() ? 'nativo' : 'web'
    };
  },

  // Desactivar (por si molesta)
  desactivar() { _activo = false; },
  activar() { _activo = true; }
};

export default Log;
