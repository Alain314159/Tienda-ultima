<script setup lang="ts">
/**
 * Compartir datos entre dos teléfonos por la WiFi, sin internet ni cuenta.
 *
 * Un teléfono crea el enlace y muestra un código de 6 dígitos; el otro lo
 * escribe y el intercambio de oferta/respuesta WebRTC viaja por Supabase
 * Realtime Broadcast (solo la señalización; los datos siguen yendo directos
 * entre los teléfonos por WebRTC). Sin internet, el intercambio se hace con
 * el código QR, como antes. El código de texto (SDP) solo queda como último
 * recurso para copiar y pegar, nunca para dictar.
 */
import { ref, computed, onBeforeUnmount, nextTick } from 'vue';
import { db, seguimiento } from '../db';
import { recargarTodoStores } from '../stores/recarga';
import { toastMsg } from '../utils/toast';
import { esCodigoEnlace, limpiarCodigo } from '../sync/codigo';
import { sincronizarPorCanal } from '../sync/enlace';
import { canalSenalWifi } from '../sync/nube';
import { leerQr, qrACanvas } from '../sync/qr';
import {
  aceptarOferta,
  aceptarRespuesta,
  cerrarEnlace,
  crearOferta,
  esperarUnionPorSenal,
  unirseASala,
} from '../sync/webrtc';
import type { Enlace, SenalWifi } from '../sync/webrtc';
import type { ProgresoSync } from '../sync/enlace';
import type { Descarte } from '../sync/tipos';

defineOptions({ name: 'SyncWifi' });

defineProps({ abierto: Boolean });
const emit = defineEmits(['cerrar']);

type Fase =
  | 'inicio'
  | 'creando'
  | 'sala'
  | 'codigo'
  | 'escaneando'
  | 'pegar'
  | 'emparejar'
  | 'unirse'
  | 'sincronizando'
  | 'listo'
  | 'error';

const NOMBRES_TABLAS: Record<string, string> = {
  productos: 'Productos',
  lotes: 'Lotes',
  ventas: 'Ventas',
  compras: 'Compras',
  ajustes: 'Ajustes de stock',
  arqueos: 'Arqueos',
  movCaja: 'Movimientos de caja',
  cierres: 'Cierres de caja',
  capital: 'Aportes de capital',
  retiros: 'Retiros',
  socios: 'Socios',
  distribuciones: 'Distribuciones',
  gastos: 'Gastos',
  pasivos: 'Deudas',
  auditorias: 'Auditorías',
};

const fase = ref<Fase>('inicio');
const rol = ref<'creador' | 'union'>('creador');
const codigoPropio = ref('');
const codigoDibujado = ref(false);
const textoVisible = ref(false);
const pegado = ref('');
const error = ref('');
/** Código de emparejamiento (6 dígitos) que muestra el creador del enlace. */
const codigoCreador = ref('');
/** Código de emparejamiento que escribe quien se une. */
const codigoEmparejamiento = ref('');
/** Código de sala (6 dígitos) que escribe quien se une por código. Es el mismo que el de emparejamiento. */
const codigoSala = ref('');
/** Quien se une por código: ya se unió por la sala, no hay QR que mostrar. */
const unionPorCodigo = ref(false);
/** Aviso no fatal en la sala del creador (p. ej. sin señalización: queda el QR). */
const avisoSala = ref('');
/** En la pantalla de error, además de empezar de nuevo se ofrece escanear el QR. */
const accionError = ref<'' | 'escanear'>('');
/** Código de oferta escaneado por quien se une, a la espera del emparejamiento. */
const codigoOfertaEscaneado = ref('');
/** La cámara no se pudo abrir: se ofrece pegar el código en su lugar. */
const camaraFallida = ref(false);
/** La cámara trasera tiene linterna y se puede encender. */
const linternaDisponible = ref(false);
const linterna = ref(false);
const progreso = ref<ProgresoSync>({ fase: 'conectando', enviadas: 0, porEnviar: 0, recibidas: 0, porRecibir: 0 });
const resultado = ref({ enviado: 0, aplicados: 0, descartes: 0 });
const descartes = ref<Descarte[]>([]);
const video = ref<HTMLVideoElement | null>(null);
const lienzo = ref<HTMLCanvasElement | null>(null);
const lienzoQr = ref<HTMLCanvasElement | null>(null);

let enlace: Enlace | null = null;
let flujo: MediaStream | null = null;
let temporizador: ReturnType<typeof setTimeout> | undefined;
/** Número de intento: lo que llegue de una sincronización ya abandonada se ignora. */
let intento = 0;
/** Cancela la espera de la sala (creador) o la unión por código. */
let abortSala: AbortController | null = null;

const porcentaje = computed(() => {
  const p = progreso.value;
  const total = p.porEnviar + p.porRecibir || 1;
  return Math.round(((p.enviadas + p.recibidas) / total) * 100);
});

const textoProgreso = computed(() => {
  const p = progreso.value;
  if (p.fase === 'conectando') return 'Conectando con el otro teléfono…';
  if (p.fase === 'preparando') return 'Preparando los datos…';
  return `Enviados ${p.enviadas} de ${p.porEnviar} · Recibidos ${p.recibidas} de ${p.porRecibir}`;
});

function detenerCamara(): void {
  clearTimeout(temporizador);
  temporizador = undefined;
  for (const pista of flujo?.getTracks() ?? []) pista.stop();
  flujo = null;
  linterna.value = false;
  linternaDisponible.value = false;
}

function reiniciar(): void {
  intento++;
  abortSala?.abort();
  abortSala = null;
  detenerCamara();
  cerrarEnlace(enlace);
  enlace = null;
  codigoPropio.value = '';
  codigoDibujado.value = false;
  textoVisible.value = false;
  pegado.value = '';
  codigoCreador.value = '';
  codigoEmparejamiento.value = '';
  codigoSala.value = '';
  unionPorCodigo.value = false;
  avisoSala.value = '';
  accionError.value = '';
  codigoOfertaEscaneado.value = '';
  error.value = '';
  progreso.value = { fase: 'conectando', enviadas: 0, porEnviar: 0, recibidas: 0, porRecibir: 0 };
  fase.value = 'inicio';
}

function cerrar(): void {
  reiniciar();
  emit('cerrar');
}

function fallo(mensaje: string, e: unknown, sinCamara = false, accion: '' | 'escanear' = ''): void {
  if (e) console.error('[sync-wifi]', e);
  detenerCamara();
  camaraFallida.value = sinCamara;
  accionError.value = accion;
  error.value = mensaje;
  fase.value = 'error';
}

async function iniciarCreador(): Promise<void> {
  reiniciar();
  rol.value = 'creador';
  fase.value = 'creando';
  try {
    enlace = await crearOferta();
    codigoCreador.value = enlace.codigoEmparejamiento;
    await mostrarCodigo(enlace.codigo, 'sala');
    void esperarSala();
  } catch (e) {
    fallo('No se pudo crear el enlace en este teléfono.', e);
  }
}

/**
 * El creador espera a que otro teléfono se una a la sala con el código.
 * Si la señalización falla (sin internet, Realtime no disponible…), no es
 * un error fatal: la sala sigue ahí y el otro teléfono puede unirse con el
 * QR. Si ya se conectó por QR mientras tanto, no se inicia otra sync.
 */
async function esperarSala(): Promise<void> {
  const actual = intento;
  const enlaceActual = enlace;
  if (!enlaceActual) return;
  let senal: SenalWifi | null = null;
  try {
    senal = await canalSenalWifi(codigoCreador.value);
    if (actual !== intento) {
      senal.cerrar();
      return;
    }
    abortSala = new AbortController();
    await esperarUnionPorSenal(enlaceActual, senal, { abortar: abortSala.signal });
    if (actual !== intento || !enlace) return;
    if (fase.value === 'sincronizando' || fase.value === 'listo') return;
    await conectar();
  } catch (e) {
    if (actual !== intento) return;
    const mensaje = e instanceof Error ? e.message : '';
    if (mensaje === 'cancelado') return;
    if (fase.value !== 'sala') return;
    if (mensaje === 'sala-tiempo-agotado') {
      avisoSala.value =
        'Pasaron 5 minutos sin que nadie se uniera con el código. El código QR de abajo sigue funcionando, o crea el enlace de nuevo para obtener otro código.';
      return;
    }
    avisoSala.value =
      'Sin conexión al servicio de señalización: el otro teléfono puede unirse escaneando el código QR de abajo.';
    console.warn('[sync-wifi] señalización no disponible', e);
  }
}

function iniciarUnion(): void {
  reiniciar();
  rol.value = 'union';
  codigoSala.value = '';
  fase.value = 'unirse';
}

/**
 * Quien se une con el código de 6 dígitos que muestra el creador. El código
 * de la sala ES el código de emparejamiento: se usa también en el handshake
 * del canal, así que no hay que escribir otro.
 */
async function conectarPorCodigo(): Promise<void> {
  const codigo = codigoSala.value.trim();
  if (!/^\d{6}$/.test(codigo)) {
    error.value = 'Escribe el código de 6 dígitos que muestra el otro teléfono.';
    fase.value = 'error';
    return;
  }
  const actual = intento;
  rol.value = 'union';
  unionPorCodigo.value = true;
  codigoEmparejamiento.value = codigo;
  fase.value = 'sincronizando';
  progreso.value = { fase: 'conectando', enviadas: 0, porEnviar: 0, recibidas: 0, porRecibir: 0 };
  let unido = false;
  try {
    const senal = await canalSenalWifi(codigo);
    if (actual !== intento) {
      senal.cerrar();
      return;
    }
    abortSala = new AbortController();
    enlace = await unirseASala(senal, { abortar: abortSala.signal });
    unido = true;
    await conectar();
  } catch (e) {
    if (actual !== intento) return;
    // Si ya se había unido, el error viene de conectar(): ya mostró su
    // propio mensaje y no se pisa con uno genérico.
    if (unido) return;
    const mensaje = e instanceof Error ? e.message : '';
    if (mensaje === 'cancelado') return;
    fallo(
      mensaje === 'sala-no-encontrada'
        ? 'No hay ninguna sala con ese código. Revisa que el código esté bien escrito y que el otro teléfono ya haya creado el enlace. Si no tienes internet, escanea el código QR en su lugar.'
        : mensaje === 'senal-no-disponible'
          ? 'No se pudo conectar con el servicio de señalización. Revisa el internet y vuelve a intentarlo, o escanea el código QR.'
          : mensaje === 'codigo-invalido'
            ? 'La respuesta del otro teléfono no se pudo leer. Pídele que cree el enlace de nuevo.'
            : 'No se pudo conectar. Revisa que los dos teléfonos tengan internet y estén en la misma WiFi, y vuelve a intentarlo.',
      e,
      false,
      mensaje === 'sala-no-encontrada' || mensaje === 'senal-no-disponible' ? 'escanear' : ''
    );
  }
}

async function mostrarCodigo(codigo: string, destino: 'codigo' | 'sala' = 'codigo'): Promise<void> {
  codigoPropio.value = codigo;
  codigoDibujado.value = false;
  fase.value = destino;
  await nextTick();
  const lienzoQrActual = lienzoQr.value;
  if (lienzoQrActual)
    codigoDibujado.value = await qrACanvas(lienzoQrActual, codigo).then(
      () => true,
      () => false
    );
}

function iniciarCamara(): void {
  fase.value = 'escaneando';
  void abrirCamara();
}

/** Por qué no se pudo abrir la cámara, y qué hacer en cada caso. */
function mensajeCamara(e: unknown): string {
  if (e instanceof DOMException) {
    if (e.name === 'NotAllowedError' || e.name === 'SecurityError')
      return 'La cámara está bloqueada para la app. Actívala en Ajustes → Aplicaciones → Tienda Pro → Permisos → Cámara y vuelve a intentarlo. Mientras tanto puedes pegar el código.';
    if (e.name === 'NotFoundError' || e.name === 'OverconstrainedError')
      return 'No se encontró una cámara trasera en este teléfono. Pega el código en su lugar.';
    if (e.name === 'NotReadableError' || e.name === 'AbortError')
      return 'Otra aplicación está usando la cámara. Ciérrala y vuelve a intentarlo, o pega el código.';
  }
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia)
    return 'Este teléfono no permite abrir la cámara desde la app. Pega el código en su lugar.';
  return 'No se pudo abrir la cámara. Pega el código en su lugar.';
}

async function abrirCamara(): Promise<void> {
  try {
    flujo = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    // El vídeo a pantalla completa se monta al cambiar de fase.
    await nextTick();
    const v = video.value;
    if (!v) throw new Error('sin-video');
    v.srcObject = flujo;
    await v.play().catch(() => undefined);
    // Linterna: solo si la cámara trasera dice tenerla (WebView/Capacitor).
    const pista = flujo.getVideoTracks()[0];
    const capacidades = (pista?.getCapabilities?.() ?? {}) as { torch?: boolean };
    linternaDisponible.value = capacidades.torch === true;
    linterna.value = false;
    bucle();
  } catch (e) {
    fallo(mensajeCamara(e), e, true);
  }
}

async function alternarLinterna(): Promise<void> {
  const pista = flujo?.getVideoTracks()[0];
  if (!pista) return;
  try {
    await pista.applyConstraints({ advanced: [{ torch: !linterna.value }] } as unknown as MediaTrackConstraints);
    linterna.value = !linterna.value;
  } catch {
    toastMsg('Este teléfono no permite encender la linterna desde aquí');
  }
}

/** Lee la cámara varias veces por segundo hasta encontrar un código válido. */
function bucle(): void {
  temporizador = undefined;
  const v = video.value;
  const c = lienzo.value;
  if (fase.value !== 'escaneando' || !v || !c) return;
  if (v.readyState < 2 || v.videoWidth === 0) {
    temporizador = setTimeout(bucle, 200);
    return;
  }
  const ancho = Math.min(800, v.videoWidth);
  const alto = Math.round((ancho * v.videoHeight) / v.videoWidth);
  c.width = ancho;
  c.height = alto;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;
  ctx.drawImage(v, 0, 0, ancho, alto);
  leerQr(ctx.getImageData(0, 0, ancho, alto))
    .then((texto) => {
      const codigo = texto ? limpiarCodigo(texto) : '';
      if (esCodigoEnlace(codigo, rol.value === 'creador' ? 'respuesta' : 'oferta')) {
        detenerCamara();
        void alDetectar(codigo);
      } else if (fase.value === 'escaneando') temporizador = setTimeout(bucle, 250);
    })
    .catch(() => {
      if (fase.value === 'escaneando') temporizador = setTimeout(bucle, 300);
    });
}

async function alDetectar(codigo: string): Promise<void> {
  try {
    if (rol.value === 'creador') {
      if (!enlace) throw new Error('sin-enlace');
      await aceptarRespuesta(enlace, codigo);
      await conectar();
    } else {
      // Quien se une primero escribe el código de emparejamiento que
      // muestra el creador: sin él no se acepta el enlace (1.7).
      codigoOfertaEscaneado.value = codigo;
      codigoEmparejamiento.value = '';
      fase.value = 'emparejar';
    }
  } catch (e) {
    fallo(
      rol.value === 'creador'
        ? 'Ese no es el código de respuesta del otro teléfono.'
        : 'Ese código no es válido. Pide al otro teléfono que lo genere de nuevo.',
      e
    );
  }
}

/** Quien se une, tras escribir el código de emparejamiento del creador. */
async function conectarUnion(): Promise<void> {
  const codigo = codigoEmparejamiento.value.trim();
  if (!/^\d{6}$/.test(codigo)) {
    error.value = 'Escribe el código de 6 dígitos que muestra el otro teléfono.';
    fase.value = 'error';
    return;
  }
  try {
    enlace = await aceptarOferta(codigoOfertaEscaneado.value);
    await mostrarCodigo(enlace.codigo);
    // La sincronización ya queda esperando: empieza cuando el otro teléfono
    // escanee este código, mientras aquí se sigue mostrando.
    void conectar();
  } catch (e) {
    fallo('Ese código no es válido. Pide al otro teléfono que lo genere de nuevo.', e);
  }
}

function abrirPegar(): void {
  detenerCamara();
  pegado.value = '';
  fase.value = 'pegar';
}

async function conectarPegado(): Promise<void> {
  const codigo = limpiarCodigo(pegado.value);
  if (!esCodigoEnlace(codigo)) {
    fallo('Ese código no está completo. Cópialo entero desde el otro teléfono.', null);
    return;
  }
  await alDetectar(codigo);
}

async function conectar(): Promise<void> {
  if (!enlace) return;
  const actual = ++intento;
  // Quien se unió por QR sigue mostrando su código hasta que el otro lo
  // escanee; quien se unió por código y el creador ven el progreso.
  const creador = rol.value === 'creador';
  if (creador || unionPorCodigo.value) fase.value = 'sincronizando';
  try {
    const r = await sincronizarPorCanal({ db, seg: seguimiento }, enlace.canal, {
      // El que se unió se queda esperando a que el otro teléfono escanee su código.
      esperaConexionMs: 300_000,
      // Autenticación de emparejamiento (1.7): el creador verifica el código
      // que muestra; quien se une envía el que escribió. Sin código no hay sync.
      auth: rol.value === 'creador' ? { esperado: codigoCreador.value } : { enviar: codigoEmparejamiento.value.trim() },
      enProgreso: (p) => {
        if (actual !== intento) return;
        progreso.value = p;
        if (p.fase !== 'conectando') fase.value = 'sincronizando';
      },
    });
    if (actual !== intento) return;
    resultado.value = { enviado: r.enviado, aplicados: r.aplicados, descartes: r.descartes };
    // Las filas remotas inválidas van a `descartes` con motivo
    // 'remoto-invalido', pero no se ofrecen para restaurar: son datos
    // que nunca debieron aplicarse.
    descartes.value = (await db.descartes.orderBy('id').reverse().limit(30).toArray()).filter(
      (d) => d.motivo !== 'remoto-invalido'
    );
    await recargarTodoStores();
    toastMsg(`Teléfonos sincronizados: ${r.aplicados} cambios recibidos`);
    fase.value = 'listo';
  } catch (e) {
    if (actual !== intento) return;
    const mensaje = e instanceof Error ? e.message : '';
    const codigoMal = mensaje === 'codigo-emparejamiento-incorrecto';
    const webrtcFallo = mensaje === 'conexion-webrtc-fallida';
    const sinRespuesta = mensaje === 'tiempo-agotado';
    fallo(
      codigoMal
        ? 'El código de emparejamiento no coincide. Revisa el código que muestra el teléfono que creó el enlace y vuelve a intentarlo.'
        : webrtcFallo
          ? 'Los teléfonos no lograron verse en la red WiFi. Revisa que los dos estén en la misma red WiFi (mismo router) y que el router no tenga activado el «aislamiento de clientes» o «AP isolation». Acércalos al router y vuelve a intentarlo.'
          : sinRespuesta
            ? 'El otro teléfono tardó demasiado en conectarse. Revisa que los dos estén en la misma red WiFi y vuelve a intentarlo.'
            : 'El enlace se perdió. Acerca los teléfonos, revisa que estén en la misma WiFi y vuelve a intentarlo.',
      e
    );
  }
}

async function copiar(): Promise<void> {
  try {
    await navigator.clipboard.writeText(codigoPropio.value);
    toastMsg('Código copiado');
  } catch {
    textoVisible.value = true;
    toastMsg('No se pudo copiar solo: selecciónalo desde el texto');
  }
}

function seleccionar(e: Event): void {
  (e.target as HTMLTextAreaElement | null)?.select();
}

async function restaurar(d: Descarte): Promise<void> {
  const datos = d.datos as Record<string, unknown>;
  await db.table(d.tabla).put({ ...datos, id: d.registroId });
  await db.descartes.delete(d.id as number);
  await recargarTodoStores();
  descartes.value = await db.descartes.orderBy('id').reverse().limit(30).toArray();
  toastMsg('Versión restaurada');
}

onBeforeUnmount(() => {
  abortSala?.abort();
  detenerCamara();
  cerrarEnlace(enlace);
});
</script>

<template>
  <div v-if="abierto" class="sync-mascara" @click.self="cerrar">
    <div class="sync-panel" role="dialog" aria-modal="true" aria-label="Compartir datos por WiFi">
      <header class="sync-cab">
        <h2>Compartir por WiFi</h2>
        <button class="sync-cerrar" type="button" aria-label="Cerrar" @click="cerrar">×</button>
      </header>

      <p v-if="fase !== 'listo'" class="sync-ayuda">
        Une este teléfono con otro que tenga la misma app en la misma red WiFi. El teléfono que crea el enlace muestra
        un código de 6 dígitos y el otro solo tiene que escribirlo; sin internet, se usa el código QR.
      </p>

      <template v-if="fase === 'inicio'">
        <button class="sync-boton" type="button" @click="iniciarCreador">Este teléfono crea el enlace</button>
        <button class="sync-boton sync-secundario" type="button" @click="iniciarUnion">
          Este teléfono se une (escribe un código)
        </button>
      </template>

      <p v-else-if="fase === 'creando'" class="sync-estado">Creando el enlace…</p>

      <template v-else-if="fase === 'sala'">
        <p class="sync-paso">
          En el otro teléfono elige «Este teléfono se une» y escribe este código. No hace falta escanear nada.
        </p>
        <div class="sync-codigo">
          <span class="sync-codigo-titulo">Código de la sala</span>
          <span class="sync-codigo-numero">{{ codigoCreador }}</span>
          <span class="sync-codigo-ayuda">
            El otro teléfono debe escribir este código para conectar. Sin él, el enlace no se acepta.
          </span>
        </div>
        <p class="sync-estado">Esperando a que el otro teléfono se una…</p>
        <p v-if="avisoSala" class="sync-aviso">{{ avisoSala }}</p>
        <p class="sync-paso">Sin internet, el otro teléfono puede escanear este código en su lugar:</p>
        <canvas v-show="codigoDibujado" ref="lienzoQr" class="sync-qr" />
        <p v-if="!codigoDibujado" class="sync-aviso">
          El código no cabe en un QR: usa «Copiar código» y pégalo en el otro teléfono.
        </p>
        <button class="sync-boton" type="button" @click="iniciarCamara">Escanear la respuesta</button>
        <button class="sync-boton sync-secundario" type="button" @click="copiar">Copiar código</button>
        <button class="sync-boton sync-secundario" type="button" @click="textoVisible = !textoVisible">
          {{ textoVisible ? 'Ocultar texto' : 'Ver código como texto (último recurso)' }}
        </button>
        <textarea v-if="textoVisible" class="sync-texto" :value="codigoPropio" rows="4" readonly @focus="seleccionar" />
        <button class="sync-boton sync-secundario" type="button" @click="abrirPegar">Pegar la respuesta</button>
      </template>

      <template v-else-if="fase === 'codigo'">
        <p class="sync-paso">En el teléfono que creó el enlace elige «Escanear la respuesta» y escanea este código.</p>
        <canvas v-show="codigoDibujado" ref="lienzoQr" class="sync-qr" />
        <p v-if="!codigoDibujado" class="sync-aviso">
          El código no cabe en un QR: usa «Copiar código» y pégalo en el otro teléfono.
        </p>
        <p v-else class="sync-estado">Esperando a que el otro teléfono escanee este código…</p>
        <button class="sync-boton sync-secundario" type="button" @click="copiar">Copiar código</button>
        <button class="sync-boton sync-secundario" type="button" @click="textoVisible = !textoVisible">
          {{ textoVisible ? 'Ocultar texto' : 'Ver código como texto (último recurso)' }}
        </button>
        <textarea v-if="textoVisible" class="sync-texto" :value="codigoPropio" rows="4" readonly @focus="seleccionar" />
      </template>

      <template v-else-if="fase === 'escaneando'">
        <div class="sync-escaner">
          <video ref="video" class="sync-escaner-video" autoplay playsinline muted />
          <div class="sync-escaner-marco" aria-hidden="true"><i /><i /><i /><i /></div>
          <p class="sync-escaner-texto">
            {{
              rol === 'creador'
                ? 'Apunta al código que muestra el otro teléfono después de unirse.'
                : 'Apunta al código que creó el otro teléfono.'
            }}
          </p>
          <div class="sync-escaner-acciones">
            <button v-if="linternaDisponible" class="sync-escaner-boton" type="button" @click="alternarLinterna">
              {{ linterna ? 'Apagar linterna' : 'Encender linterna' }}
            </button>
            <button class="sync-escaner-boton" type="button" @click="abrirPegar">
              Pegar el código en vez de escanear
            </button>
            <button class="sync-escaner-boton" type="button" @click="reiniciar">Cancelar</button>
          </div>
        </div>
      </template>

      <template v-else-if="fase === 'unirse'">
        <p class="sync-paso">
          Escribe el código de 6 dígitos que muestra el teléfono que creó el enlace. Los dos teléfonos necesitan
          internet para conectar así; sin internet, escanea el código QR.
        </p>
        <input
          v-model="codigoSala"
          class="sync-codigo-input"
          type="text"
          inputmode="numeric"
          autocomplete="one-time-code"
          maxlength="6"
          placeholder="123456"
          aria-label="Código de la sala"
          @keyup.enter="conectarPorCodigo"
        />
        <button class="sync-boton" type="button" @click="conectarPorCodigo">Conectar con el código</button>
        <button class="sync-boton sync-secundario" type="button" @click="iniciarCamara">Escanear el código QR</button>
        <button class="sync-boton sync-secundario" type="button" @click="abrirPegar">Pegar el código</button>
        <button class="sync-boton sync-secundario" type="button" @click="reiniciar">Cancelar</button>
      </template>

      <template v-else-if="fase === 'emparejar'">
        <p class="sync-paso">
          Escribe el código de 6 dígitos que muestra el teléfono que creó el enlace. Sin ese código no se puede
          conectar.
        </p>
        <input
          v-model="codigoEmparejamiento"
          class="sync-codigo-input"
          type="text"
          inputmode="numeric"
          autocomplete="one-time-code"
          maxlength="6"
          placeholder="123456"
          aria-label="Código de emparejamiento"
          @keyup.enter="conectarUnion"
        />
        <button class="sync-boton" type="button" @click="conectarUnion">Conectar</button>
        <button class="sync-boton sync-secundario" type="button" @click="reiniciar">Cancelar</button>
      </template>

      <template v-else-if="fase === 'pegar'">
        <p class="sync-paso">Pega aquí el código del otro teléfono.</p>
        <textarea v-model="pegado" class="sync-texto" rows="5" placeholder="TP1…" />
        <button class="sync-boton" type="button" @click="conectarPegado">Conectar</button>
        <button class="sync-boton sync-secundario" type="button" @click="reiniciar">Cancelar</button>
      </template>

      <template v-else-if="fase === 'sincronizando'">
        <p class="sync-estado">{{ textoProgreso }}</p>
        <div class="sync-barra"><div class="sync-barra-lleno" :style="{ width: porcentaje + '%' }" /></div>
      </template>

      <template v-else-if="fase === 'listo'">
        <p class="sync-titulo">Teléfonos sincronizados</p>
        <ul class="sync-lista">
          <li>{{ resultado.aplicados }} cambios recibidos del otro teléfono.</li>
          <li>{{ resultado.enviado }} cambios enviados.</li>
        </ul>
        <template v-if="descartes.length">
          <p class="sync-paso">Versiones más antiguas que perdieron. Puedes volver a ponerlas:</p>
          <div v-for="d in descartes" :key="d.id" class="sync-descarte">
            <span>
              {{ NOMBRES_TABLAS[d.tabla] ?? d.tabla }} · {{ new Date(d.ts).toLocaleString() }} ·
              {{ d.motivo === 'borrado-remoto' ? 'se borró en el otro teléfono' : 'fue reemplazada por una más nueva' }}
            </span>
            <button type="button" @click="restaurar(d)">Restaurar</button>
          </div>
        </template>
        <button class="sync-boton" type="button" @click="cerrar">Listo</button>
      </template>

      <template v-else-if="fase === 'error'">
        <p class="sync-aviso">{{ error }}</p>
        <button v-if="camaraFallida" class="sync-boton" type="button" @click="abrirPegar">
          {{ rol === 'creador' ? 'Pegar la respuesta' : 'Pegar el código' }}
        </button>
        <button v-if="accionError === 'escanear'" class="sync-boton" type="button" @click="iniciarCamara">
          Escanear el código QR
        </button>
        <button class="sync-boton sync-secundario" type="button" @click="reiniciar">Empezar de nuevo</button>
      </template>

      <canvas ref="lienzo" class="sync-oculto" />
    </div>
  </div>
</template>

<style scoped>
.sync-mascara {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgb(0 0 0 / 55%);
}

.sync-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: min(100%, 520px);
  max-height: 92vh;
  padding: 16px 16px 24px;
  overflow-y: auto;
  color: var(--txt);
  background: var(--card);
  border-radius: var(--r-md) var(--r-md) 0 0;
}

.sync-cab {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.sync-cab h2 {
  margin: 0;
  font-size: 1.15rem;
}

.sync-cerrar {
  padding: 4px 10px;
  font-size: 1.6rem;
  line-height: 1;
  color: var(--mut);
  cursor: pointer;
  background: none;
  border: 0;
}

.sync-ayuda,
.sync-paso,
.sync-estado,
.sync-aviso,
.sync-titulo,
.sync-lista {
  margin: 0;
  font-size: 0.95rem;
  line-height: 1.5;
}

.sync-titulo {
  font-size: 1.05rem;
  font-weight: 600;
}

.sync-aviso {
  color: var(--bad);
}

.sync-lista {
  padding-left: 20px;
}

.sync-boton {
  padding: 12px 14px;
  font-size: 1rem;
  font-weight: 600;
  color: var(--bg);
  text-align: center;
  cursor: pointer;
  background: var(--pri);
  border: 1px solid var(--pri);
  border-radius: var(--r-sm);
}

.sync-secundario {
  font-weight: 500;
  color: var(--txt);
  background: transparent;
  border-color: var(--brd);
}

.sync-qr {
  align-self: center;
  width: min(78vw, 320px);
  height: min(78vw, 320px);
  background: #fff;
  border-radius: var(--r-sm);
}

.sync-oculto {
  display: none;
}

.sync-texto {
  width: 100%;
  padding: 8px;
  font-family: monospace;
  font-size: 0.8rem;
  color: var(--txt);
  word-break: break-all;
  background: var(--bg);
  border: 1px solid var(--brd);
  border-radius: var(--r-sm);
}

.sync-codigo {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 12px;
  background: var(--bg-2);
  border: 1px solid var(--brd);
  border-radius: var(--r-sm);
}

.sync-codigo-titulo {
  font-size: 0.85rem;
  font-weight: 600;
}

.sync-codigo-numero {
  font-family: monospace;
  font-size: 2rem;
  font-weight: 700;
  letter-spacing: 0.35em;
}

.sync-codigo-ayuda {
  font-size: 0.85rem;
  line-height: 1.4;
  color: var(--mut);
  text-align: center;
}

.sync-codigo-input {
  width: 100%;
  padding: 12px;
  font-family: monospace;
  font-size: 1.5rem;
  font-weight: 700;
  letter-spacing: 0.35em;
  text-align: center;
  color: var(--txt);
  background: var(--bg);
  border: 1px solid var(--brd);
  border-radius: var(--r-sm);
}

.sync-barra {
  height: 8px;
  overflow: hidden;
  background: var(--bg-2);
  border-radius: 999px;
}

.sync-barra-lleno {
  height: 100%;
  background: var(--ok);
  transition: width var(--tr);
}

.sync-descarte {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  font-size: 0.9rem;
  border-top: 1px solid var(--brd);
}

.sync-descarte button {
  padding: 6px 10px;
  color: var(--txt);
  white-space: nowrap;
  cursor: pointer;
  background: transparent;
  border: 1px solid var(--brd);
  border-radius: var(--r-sm);
}

/* Escáner a pantalla completa: la cámara ocupa toda la pantalla, con una
   guía en el centro y los botones abajo, como en otras apps. */
.sync-escaner {
  position: fixed;
  inset: 0;
  z-index: 120;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #000;
}

.sync-escaner-video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.sync-escaner-marco {
  position: relative;
  width: min(72vw, 340px);
  aspect-ratio: 1;
}

.sync-escaner-marco i {
  position: absolute;
  width: 36px;
  height: 36px;
  border: 4px solid #fff;
}

.sync-escaner-marco i:nth-child(1) {
  top: 0;
  left: 0;
  border-right: 0;
  border-bottom: 0;
  border-radius: 8px 0 0;
}

.sync-escaner-marco i:nth-child(2) {
  top: 0;
  right: 0;
  border-bottom: 0;
  border-left: 0;
  border-radius: 0 8px 0 0;
}

.sync-escaner-marco i:nth-child(3) {
  bottom: 0;
  left: 0;
  border-top: 0;
  border-right: 0;
  border-radius: 0 0 0 8px;
}

.sync-escaner-marco i:nth-child(4) {
  right: 0;
  bottom: 0;
  border-top: 0;
  border-left: 0;
  border-radius: 0 0 8px;
}

.sync-escaner-texto {
  position: relative;
  max-width: min(88vw, 420px);
  margin: 24px 16px 0;
  font-size: 1rem;
  line-height: 1.5;
  color: #fff;
  text-align: center;
  text-shadow: 0 1px 4px rgb(0 0 0 / 80%);
}

.sync-escaner-acciones {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px 16px calc(16px + env(safe-area-inset-bottom));
}

.sync-escaner-boton {
  padding: 12px 14px;
  font-size: 1rem;
  font-weight: 600;
  color: #fff;
  cursor: pointer;
  background: rgb(255 255 255 / 16%);
  border: 1px solid rgb(255 255 255 / 40%);
  border-radius: var(--r-sm);
}

@media (width >= 640px) {
  .sync-mascara {
    align-items: center;
  }

  .sync-panel {
    border-radius: var(--r-md);
  }
}
</style>
