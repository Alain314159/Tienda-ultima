<script setup lang="ts">
/**
 * Nube y cuenta: entrar con Google, ver el estado y forzar la sincronización.
 *
 * La sync automática ya no vive aquí (3.1): el temporizador de fondo está en
 * useNubeStore y lo arranca App.vue, así que sincroniza aunque el panel esté
 * cerrado. Aquí queda el estado, el botón manual y el regreso a primer plano.
 * Cerrar sesión abre una confirmación con dos opciones: conservar los datos
 * locales o borrarlos. Borrarlos pide el PIN (si está activo) y solo con el
 * PIN correcto se borran y se cierra la sesión (1.10): antes, tras pasar el
 * PIN de entrada, un toque accidental en el botón rojo vaciaba la IndexedDB
 * del teléfono sin más barrera.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { db, seguimiento } from '../db';
import { recargarTodoStores } from '../stores/recarga';
import { useNubeStore } from '../stores/useNubeStore';
import { useUIStore } from '../stores/useUIStore';
import { toastMsg } from '../utils/toast';
import { TOAST } from '../constants';
import { Log } from '../services/logger';
import {
  alVolverDeGoogle,
  salirDeNube,
  sesionNube,
  entrarConGoogle,
  googleListo,
} from '../sync/nube';

defineOptions({ name: 'CuentaNube' });

defineProps({ abierto: Boolean });
const emit = defineEmits(['cerrar']);

// La sesión y el estado de sync viven en el store compartido para que el
// indicador del header los lea sin duplicar lógica; aquí solo queda el
// texto local y el diálogo de cierre de sesión.
const nube = useNubeStore();
const ui = useUIStore();
const sesion = computed(() => (nube.sesionCorreo ? { correo: nube.sesionCorreo } : null));
const ocupado = ref(false);
const aviso = ref('');
const resumen = computed(() => nube.ultimoResumen);
const confirmandoSalida = ref(false);
const ultima = computed(() => (nube.ultimaSync ? new Date(nube.ultimaSync) : null));

const textoUltima = computed(() => (ultima.value ? ultima.value.toLocaleTimeString() : 'aún no'));

/** Una vuelta de sincronización manual. Silenciosa salvo si hay novedades o falla. */
async function sincronizar(): Promise<void> {
  if (ocupado.value || !sesion.value) return;
  ocupado.value = true;
  aviso.value = '';
  try {
    const ok = await nube.sincronizarAhora({ origen: 'manual' });
    if (!ok && nube.ultimoError) {
      aviso.value = 'No se pudo sincronizar con la nube. Revisa la conexión a internet.';
    }
  } catch (e) {
    aviso.value = 'No se pudo sincronizar con la nube. Revisa la conexión a internet.';
    Log.error('CuentaNube: sincronización manual falló', e);
  } finally {
    ocupado.value = false;
  }
}

async function entrar(): Promise<void> {
  ocupado.value = true;
  aviso.value = '';
  try {
    if (!(await googleListo())) {
      aviso.value =
        'Google todavía no está conectado al proyecto de la nube. Falta un paso del dueño de la cuenta de Supabase.';
      return;
    }
    await entrarConGoogle();
  } catch (e) {
    aviso.value = 'No se pudo abrir el acceso con Google.';
    Log.error('CuentaNube: entrar con Google falló', e);
  } finally {
    ocupado.value = false;
  }
}

/** Primer toque a «Cerrar sesión»: abre la confirmación. El PIN se pide al elegir borrar los datos, que es lo destructivo (1.10). */
function pedirSalir(): void {
  confirmandoSalida.value = true;
}

/**
 * «Cerrar sesión y borrar los datos locales»: pide el PIN con el patrón
 * habitual (`ui.pedirPin`, como anular una venta o borrar todos los datos)
 * y solo con el PIN correcto borra y cierra la sesión. Cancelar o fallar el
 * PIN no borra nada. Sin PIN activo `pedirPin` ejecuta directo.
 */
function pedirBorrarDatos(): void {
  ui.pedirPin(() => {
    void salir(true);
  });
}

async function salir(borrarDatos: boolean): Promise<void> {
  ocupado.value = true;
  confirmandoSalida.value = false;
  try {
    await salirDeNube({ db, seg: seguimiento }, { borrarDatosLocales: borrarDatos });
    nube.setSesion(null);
    nube.ultimoResumen = '';
    if (borrarDatos) {
      // La BD quedó vacía: recargar los stores para que la UI no siga
      // mostrando los datos borrados.
      await recargarTodoStores();
      toastMsg('Sesión cerrada y datos locales borrados', TOAST.WARN);
    } else {
      toastMsg('Sesión cerrada. Los datos quedan en este teléfono.');
    }
  } catch (e) {
    aviso.value = 'No se pudo cerrar la sesión.';
    Log.error('CuentaNube: cerrar sesión falló', e);
  } finally {
    ocupado.value = false;
  }
}

function alCambiarVisibilidad(): void {
  if (document.visibilityState === 'visible') void nube.sincronizarAhora({ origen: 'fondo' });
}

let quitarEnlace: (() => void) | undefined;

onMounted(async () => {
  await nube.cargarUltimaSync();
  // App.vue ya restaura la sesión al arrancar; si el panel se abre antes
  // de que termine (o la sesión quedó pendiente por falta de red), se
  // intenta aquí para no mostrar «Sin sesión» con una sesión guardada.
  if (!nube.sesionCorreo && !nube.sesionPendiente) {
    try {
      const s = await sesionNube();
      nube.setSesion(s?.correo ?? null);
    } catch (e) {
      Log.warn('CuentaNube: no se pudo leer la sesión al abrir el panel', e);
    }
  }
  quitarEnlace = alVolverDeGoogle((s) => {
    nube.setSesion(s?.correo ?? null);
    toastMsg('Sesión iniciada con Google');
    void nube.sincronizarAhora({ origen: 'manual' });
  });
  void nube.sincronizarAhora({ origen: 'fondo' });
  document.addEventListener('visibilitychange', alCambiarVisibilidad);
});

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', alCambiarVisibilidad);
  quitarEnlace?.();
});
</script>

<template>
  <div v-if="abierto" class="nube-mascara" @click.self="$emit('cerrar')">
    <div class="nube-panel" role="dialog" aria-modal="true" aria-label="Nube y cuenta">
      <header class="nube-cab">
        <h2>Nube y cuenta</h2>
        <button class="nube-cerrar" type="button" aria-label="Cerrar" @click="$emit('cerrar')">×</button>
      </header>

      <template v-if="!sesion">
        <p class="nube-texto">
          Entra con Google para guardar una copia en la nube y tener los mismos datos en todos tus teléfonos. Lo que ya
          está en este teléfono no se pierde: se une con lo de la cuenta.
        </p>
        <button class="nube-boton" type="button" :disabled="ocupado" @click="entrar">Entrar con Google</button>
      </template>

      <template v-else-if="!confirmandoSalida">
        <p class="nube-texto">
          Sesión iniciada como <strong>{{ sesion.correo ?? 'usuario de Google' }}</strong>.
        </p>
        <p class="nube-texto">La sincronización es automática. Última: {{ textoUltima }}.</p>
        <p v-if="resumen" class="nube-texto">{{ resumen }}</p>
        <button class="nube-boton" type="button" :disabled="ocupado" @click="sincronizar">
          {{ ocupado ? 'Sincronizando…' : 'Sincronizar ahora' }}
        </button>
        <button class="nube-boton nube-secundario" type="button" :disabled="ocupado" @click="pedirSalir">
          Cerrar sesión
        </button>
      </template>

      <template v-else>
        <p class="nube-texto"><strong>¿Cerrar la sesión de {{ sesion.correo ?? 'Google' }}?</strong></p>
        <p class="nube-texto">
          Si borras los datos locales, este teléfono quedará vacío y la próxima cuenta descargará solo lo suyo desde la
          nube. Si los conservas, seguirán en este teléfono y se mezclarán con la siguiente cuenta.
        </p>
        <button class="nube-boton" type="button" :disabled="ocupado" @click="salir(false)">
          Cerrar sesión y conservar los datos
        </button>
        <button class="nube-boton nube-peligro" type="button" :disabled="ocupado" @click="pedirBorrarDatos">
          Cerrar sesión y borrar los datos locales
        </button>
        <button class="nube-boton nube-secundario" type="button" :disabled="ocupado" @click="confirmandoSalida = false">
          Cancelar
        </button>
      </template>

      <p v-if="aviso" class="nube-aviso">{{ aviso }}</p>
    </div>
  </div>
</template>

<style scoped>
.nube-mascara {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgb(0 0 0 / 55%);
}

.nube-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: min(100%, 520px);
  padding: 16px 16px 24px;
  color: var(--txt);
  background: var(--card);
  border-radius: var(--r-md) var(--r-md) 0 0;
}

.nube-cab {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.nube-cab h2 {
  margin: 0;
  font-size: 1.15rem;
}

.nube-cerrar {
  padding: 4px 10px;
  font-size: 1.6rem;
  line-height: 1;
  color: var(--mut);
  cursor: pointer;
  background: none;
  border: 0;
}

.nube-texto,
.nube-aviso {
  margin: 0;
  font-size: 0.95rem;
  line-height: 1.5;
}

.nube-aviso {
  color: var(--bad);
}

.nube-boton {
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

.nube-boton:disabled {
  cursor: default;
  opacity: 0.6;
}

.nube-secundario {
  font-weight: 500;
  color: var(--txt);
  background: transparent;
  border-color: var(--brd);
}

.nube-peligro {
  color: #fff;
  background: var(--bad);
  border-color: var(--bad);
}

@media (width >= 640px) {
  .nube-mascara {
    align-items: center;
  }

  .nube-panel {
    border-radius: var(--r-md);
  }
}
</style>
