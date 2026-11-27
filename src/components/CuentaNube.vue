<script setup lang="ts">
/**
 * Nube y cuenta: entrar con Google, ver el estado y forzar la sincronización.
 * También lleva el ritmo automático: al abrir, al volver a primer plano y cada
 * 30 segundos (cada vuelta solo mueve lo que haya cambiado).
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { db, seguimiento } from '../db';
import { recargarTodoStores } from '../stores/recarga';
import { useNubeStore } from '../stores/useNubeStore';
import { toastMsg } from '../utils/toast';
import {
  alVolverDeGoogle,
  clienteNubeDe,
  entrarConGoogle,
  googleListo,
  salirDeNube,
  sesionNube,
  sincronizarNube,
  supabase,
} from '../sync/nube';
import type { SesionNube } from '../sync/nube';

defineOptions({ name: 'CuentaNube' });

defineProps({ abierto: Boolean });
const emit = defineEmits(['cerrar']);

const sesion = ref<SesionNube | null>(null);
const ocupado = ref(false);
const aviso = ref('');
const resumen = ref('');
// El estado de sync vive en el store compartido para que el indicador del
// header lo lea sin duplicar lógica; aquí solo queda el texto local.
const nube = useNubeStore();
const ultima = computed(() => (nube.ultimaSync ? new Date(nube.ultimaSync) : null));

let temporizador: ReturnType<typeof setInterval> | undefined;
let quitarEnlace: (() => void) | undefined;

const textoUltima = computed(() => (ultima.value ? ultima.value.toLocaleTimeString() : 'aún no'));

/** Una vuelta de sincronización. Silenciosa salvo si hay novedades o falla. */
async function sincronizar(): Promise<void> {
  if (ocupado.value || !sesion.value) return;
  ocupado.value = true;
  aviso.value = '';
  nube.marcarInicio();
  try {
    const r = await sincronizarNube({ db, seg: seguimiento }, clienteNubeDe(await supabase()));
    if (r.tablas.length) await recargarTodoStores();
    await nube.marcarExito();
    resumen.value = `${r.enviado} enviados · ${r.aplicados} recibidos${r.descartes ? ` · ${r.descartes} guardados en versiones que perdieron` : ''}`;
  } catch (e) {
    aviso.value = 'No se pudo sincronizar con la nube. Revisa la conexión a internet.';
    nube.marcarError('No se pudo sincronizar con la nube.');
    console.error('[nube]', e);
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
    console.error('[nube]', e);
  } finally {
    ocupado.value = false;
  }
}

async function salir(): Promise<void> {
  ocupado.value = true;
  try {
    await salirDeNube({ db, seg: seguimiento });
    sesion.value = null;
    nube.setSesion(null);
    resumen.value = '';
  } catch (e) {
    aviso.value = 'No se pudo cerrar la sesión.';
    console.error('[nube]', e);
  } finally {
    ocupado.value = false;
  }
}

function alCambiarVisibilidad(): void {
  if (document.visibilityState === 'visible') void sincronizar();
}

onMounted(async () => {
  await nube.cargarUltimaSync();
  sesion.value = await sesionNube();
  nube.setSesion(sesion.value?.correo ?? null);
  quitarEnlace = alVolverDeGoogle((s) => {
    sesion.value = s;
    nube.setSesion(s?.correo ?? null);
    toastMsg('Sesión iniciada con Google');
    void sincronizar();
  });
  void sincronizar();
  temporizador = setInterval(() => void sincronizar(), 30_000);
  document.addEventListener('visibilitychange', alCambiarVisibilidad);
});

onBeforeUnmount(() => {
  clearInterval(temporizador);
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

      <template v-else>
        <p class="nube-texto">
          Sesión iniciada como <strong>{{ sesion.correo ?? 'usuario de Google' }}</strong>.
        </p>
        <p class="nube-texto">La sincronización es automática. Última: {{ textoUltima }}.</p>
        <p v-if="resumen" class="nube-texto">{{ resumen }}</p>
        <button class="nube-boton" type="button" :disabled="ocupado" @click="sincronizar">
          {{ ocupado ? 'Sincronizando…' : 'Sincronizar ahora' }}
        </button>
        <button class="nube-boton nube-secundario" type="button" :disabled="ocupado" @click="salir">
          Cerrar sesión
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

@media (width >= 640px) {
  .nube-mascara {
    align-items: center;
  }

  .nube-panel {
    border-radius: var(--r-md);
  }
}
</style>
