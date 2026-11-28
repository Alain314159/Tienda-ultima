<script setup lang="ts">
/**
 * Compartir datos entre dos teléfonos por la WiFi, sin internet ni cuenta.
 *
 * Un teléfono crea el enlace y muestra un código; el otro lo escanea (o lo
 * pega) y responde con el suyo. Con los dos códigos se abre un canal cifrado
 * entre ambos y cada uno envía al otro lo que le falta.
 */
import { ref, computed, onBeforeUnmount, nextTick } from 'vue';
import { db, seguimiento } from '../db';
import { recargarTodoStores } from '../stores/recarga';
import { toastMsg } from '../utils/toast';
import { esCodigoEnlace, limpiarCodigo } from '../sync/codigo';
import { sincronizarPorCanal } from '../sync/enlace';
import { leerQr, qrACanvas } from '../sync/qr';
import { aceptarOferta, aceptarRespuesta, cerrarEnlace, crearOferta } from '../sync/webrtc';
import type { Enlace } from '../sync/webrtc';
import type { ProgresoSync } from '../sync/enlace';
import type { Descarte } from '../sync/tipos';

defineOptions({ name: 'SyncWifi' });

defineProps({ abierto: Boolean });
const emit = defineEmits(['cerrar']);

type Fase = 'inicio' | 'creando' | 'codigo' | 'escaneando' | 'pegar' | 'emparejar' | 'sincronizando' | 'listo' | 'error';

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
/** Código de oferta escaneado por quien se une, a la espera del emparejamiento. */
const codigoOfertaEscaneado = ref('');
/** La cámara no se pudo abrir: se ofrece pegar el código en su lugar. */
const camaraFallida = ref(false);
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

const pasoQr = computed(() =>
  rol.value === 'creador'
    ? '1. En el otro teléfono elige «Este teléfono se une» y escanea este código.'
    : '2. En el teléfono que creó el enlace elige «Escanear la respuesta» y escanea este código.'
);

function detenerCamara(): void {
  clearTimeout(temporizador);
  temporizador = undefined;
  for (const pista of flujo?.getTracks() ?? []) pista.stop();
  flujo = null;
}

function reiniciar(): void {
  intento++;
  detenerCamara();
  cerrarEnlace(enlace);
  enlace = null;
  codigoPropio.value = '';
  codigoDibujado.value = false;
  textoVisible.value = false;
  pegado.value = '';
  codigoCreador.value = '';
  codigoEmparejamiento.value = '';
  codigoOfertaEscaneado.value = '';
  error.value = '';
  fase.value = 'inicio';
}

function cerrar(): void {
  reiniciar();
  emit('cerrar');
}

function fallo(mensaje: string, e: unknown, sinCamara = false): void {
  if (e) console.error('[sync-wifi]', e);
  detenerCamara();
  camaraFallida.value = sinCamara;
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
    await mostrarCodigo(enlace.codigo);
  } catch (e) {
    fallo('No se pudo crear el enlace en este teléfono.', e);
  }
}

async function mostrarCodigo(codigo: string): Promise<void> {
  codigoPropio.value = codigo;
  codigoDibujado.value = false;
  fase.value = 'codigo';
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

async function abrirCamara(): Promise<void> {
  try {
    flujo = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    const v = video.value;
    if (!v) throw new Error('sin-video');
    v.srcObject = flujo;
    await v.play().catch(() => undefined);
    bucle();
  } catch (e) {
    fallo('No se pudo abrir la cámara. Pega el código en su lugar.', e, true);
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
  // Quien se une sigue mostrando su código hasta que el otro lo escanee.
  const creador = rol.value === 'creador';
  if (creador) fase.value = 'sincronizando';
  try {
    const r = await sincronizarPorCanal({ db, seg: seguimiento }, enlace.canal, {
      // El que se unió se queda esperando a que el otro teléfono escanee su código.
      esperaConexionMs: 300_000,
      // Autenticación de emparejamiento (1.7): el creador verifica el código
      // que muestra; quien se une envía el que escribió. Sin código no hay sync.
      auth:
        rol.value === 'creador'
          ? { esperado: codigoCreador.value }
          : { enviar: codigoEmparejamiento.value.trim() },
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
    const sinRespuesta = e instanceof Error && e.message === 'tiempo-agotado';
    const codigoMal = e instanceof Error && e.message === 'codigo-emparejamiento-incorrecto';
    fallo(
      codigoMal
        ? 'El código de emparejamiento no coincide. Revisa el código que muestra el teléfono que creó el enlace y vuelve a intentarlo.'
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
        Une este teléfono con otro que tenga la misma app en la misma red WiFi, sin internet ni cuenta. Cada uno envía
        al otro lo que le falta y gana el cambio más nuevo.
      </p>

      <template v-if="fase === 'inicio'">
        <button class="sync-boton" type="button" @click="iniciarCreador">Este teléfono crea el enlace</button>
        <button
          class="sync-boton sync-secundario"
          type="button"
          @click="
            rol = 'union';
            iniciarCamara();
          "
        >
          Este teléfono se une (escanea un código)
        </button>
      </template>

      <p v-else-if="fase === 'creando'" class="sync-estado">Creando el enlace…</p>

      <template v-else-if="fase === 'codigo'">
        <p class="sync-paso">{{ pasoQr }}</p>
        <div v-if="rol === 'creador' && codigoCreador" class="sync-codigo">
          <span class="sync-codigo-titulo">Código de emparejamiento</span>
          <span class="sync-codigo-numero">{{ codigoCreador }}</span>
          <span class="sync-codigo-ayuda">El otro teléfono debe escribir este código para conectar. Sin él, el enlace no se acepta.</span>
        </div>
        <canvas v-show="codigoDibujado" ref="lienzoQr" class="sync-qr" />
        <p v-if="!codigoDibujado" class="sync-aviso">
          El código no cabe en un QR: usa «Copiar código» y pégalo en el otro teléfono.
        </p>
        <p v-else-if="rol === 'union'" class="sync-estado">Esperando a que el otro teléfono escanee este código…</p>
        <button v-if="rol === 'creador'" class="sync-boton" type="button" @click="iniciarCamara">
          Escanear la respuesta
        </button>
        <button class="sync-boton sync-secundario" type="button" @click="copiar">Copiar código</button>
        <button class="sync-boton sync-secundario" type="button" @click="textoVisible = !textoVisible">
          {{ textoVisible ? 'Ocultar texto' : 'Ver código como texto' }}
        </button>
        <textarea v-if="textoVisible" class="sync-texto" :value="codigoPropio" rows="4" readonly @focus="seleccionar" />
        <button v-if="rol === 'creador'" class="sync-boton sync-secundario" type="button" @click="abrirPegar">
          Pegar la respuesta
        </button>
      </template>

      <template v-else-if="fase === 'escaneando'">
        <p class="sync-paso">
          {{
            rol === 'creador'
              ? 'Apunta al código que muestra el otro teléfono después de unirse.'
              : 'Apunta al código que creó el otro teléfono.'
          }}
        </p>
        <video ref="video" class="sync-video" autoplay playsinline muted />
        <button class="sync-boton sync-secundario" type="button" @click="abrirPegar">
          Pegar el código en vez de escanear
        </button>
      </template>

      <template v-else-if="fase === 'emparejar'">
        <p class="sync-paso">Escribe el código de 6 dígitos que muestra el teléfono que creó el enlace. Sin ese código no se puede conectar.</p>
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

.sync-video {
  width: 100%;
  aspect-ratio: 4 / 3;
  background: #000;
  border-radius: var(--r-sm);
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

@media (width >= 640px) {
  .sync-mascara {
    align-items: center;
  }

  .sync-panel {
    border-radius: var(--r-md);
  }
}
</style>
