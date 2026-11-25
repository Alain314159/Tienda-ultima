<template>
  <div class="modal no-print" @click.self="$emit('close')">
    <div class="modal-box" style="max-width: 520px">
      <div class="modal-title" style="display: flex; justify-content: space-between; align-items: center">
        <span><icon name="package" :size="18" :color="mutColor"></icon> Respaldo automático</span>
        <button class="link-btn" @click="$emit('close')" style="font-size: 1.2rem; padding: 0 0.5rem">×</button>
      </div>

      <!-- Estado -->
      <div class="info-box" style="margin-bottom: 0.8rem">
        <div style="display: flex; justify-content: space-between; margin-bottom: 0.3rem">
          <span>Último backup</span>
          <b>{{ info.ultimo || 'Ninguno' }}</b>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 0.3rem">
          <span>Archivos guardados</span>
          <b>{{ info.cantidad }}</b>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 0.3rem">
          <span>Carpeta</span>
          <b style="font-size: 0.7rem">Documents/backups/</b>
        </div>
        <div
          v-if="esNativo"
          style="
            display: flex;
            justify-content: space-between;
            font-size: 0.7rem;
            color: var(--mut);
            margin-top: 0.4rem;
            border-top: 1px solid var(--brd);
            padding-top: 0.4rem;
          "
        >
          <span>Se guarda en el almacenamiento privado de la app</span>
        </div>
        <div
          v-else
          style="
            font-size: 0.7rem;
            color: var(--warn);
            margin-top: 0.4rem;
            border-top: 1px solid var(--brd);
            padding-top: 0.4rem;
          "
        >
          ⚠ En modo web, los backups se descargan como archivos
        </div>
      </div>

      <!-- Botones -->
      <div class="grid2" style="margin-bottom: 0.8rem">
        <button class="btn pri" @click="hacerBackupAhora" :disabled="guardando">
          {{ guardando ? 'Guardando...' : 'Backup ahora' }}
        </button>
        <button class="btn ghost" @click="cargarLista" :disabled="cargando">
          {{ cargando ? 'Cargando...' : 'Refrescar lista' }}
        </button>
      </div>

      <!-- Lista -->
      <div
        style="
          max-height: 200px;
          overflow-y: auto;
          border: 1px solid var(--brd);
          border-radius: 8px;
          margin-bottom: 0.8rem;
        "
      >
        <div v-if="!archivos.length" style="padding: 1rem; text-align: center; color: var(--mut); font-size: 0.8rem">
          Sin backups todavía
        </div>
        <div
          v-for="a in archivos"
          :key="a.name"
          style="
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0.5rem 0.7rem;
            border-bottom: 1px solid var(--brd);
            font-size: 0.78rem;
          "
        >
          <span>{{ a.name }}</span>
          <button class="link-btn" @click="restaurar(a.name)" :disabled="restaurando" style="font-size: 0.72rem">
            Restaurar
          </button>
        </div>
      </div>

      <!-- Restaurar último -->
      <button class="btn warn" @click="restaurarUltimo" :disabled="!archivos.length || restaurando" style="width: 100%">
        {{ restaurando ? 'Restaurando...' : 'Restaurar el más reciente' }}
      </button>

      <!-- Mensajes -->
      <div
        v-if="msg"
        :style="{
          color: msgTipo === 'error' ? 'var(--bad)' : 'var(--ok)',
          fontSize: '.78rem',
          marginTop: '.6rem',
          textAlign: 'center',
        }"
      >
        {{ msg }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { BackupFolder } from '../services/backupFolder';
import { esNativo as esNativoFn } from '../services/platform';
import { datosDeStores } from '../stores/exportar';
import { useUIStore } from '../stores/useUIStore';

defineOptions({ name: 'BackupPanel' });

const emit = defineEmits(['close', 'restore']);
const ui = useUIStore();

const info = ref<{ cantidad: number; ultimo: string | null }>({ cantidad: 0, ultimo: null });
const archivos = ref<{ name: string }[]>([]);
const cargando = ref(false);
const guardando = ref(false);
const restaurando = ref(false);
const msg = ref('');
const msgTipo = ref('ok');

const esNativo = computed(() => esNativoFn());
const mutColor = computed(
  () => getComputedStyle(document.documentElement).getPropertyValue('--mut').trim() || '#64748B'
);

onMounted(() => cargarLista());

async function cargarLista() {
  cargando.value = true;
  try {
    info.value = await BackupFolder.info();
    archivos.value = await BackupFolder.listar();
  } catch (e) {
    msg.value = 'Error cargando lista: ' + (e instanceof Error ? e.message : String(e));
    msgTipo.value = 'error';
  } finally {
    cargando.value = false;
  }
}

async function hacerBackupAhora() {
  guardando.value = true;
  msg.value = '';
  try {
    const data = datosDeStores();
    const nombre = await BackupFolder.guardar(data, null);
    await BackupFolder.rotar(30);
    msg.value = 'Backup creado: ' + nombre;
    msgTipo.value = 'ok';
    await cargarLista();
  } catch (e) {
    msg.value = 'Error: ' + (e instanceof Error ? e.message : String(e));
    msgTipo.value = 'error';
  } finally {
    guardando.value = false;
  }
}

async function restaurarUltimo() {
  if (!archivos.value.length) return;
  await restaurar(archivos.value[0].name);
}

async function restaurar(nombre: string) {
  // confirm() nativo bloquea el hilo, no existe en WebView de Capacitor y
  // es incompatible con tests/E2E — usar el modal propio de la app
  ui.confirmar({
    titulo: 'Restaurar backup',
    msg: `¿Restaurar el backup "${nombre}"?\nSe reemplazarán TODOS los datos actuales.`,
    onOk: async () => {
      restaurando.value = true;
      msg.value = '';
      try {
        const data = await BackupFolder.leer(nombre);
        if (!data) throw new Error('No se pudo leer el archivo');
        emit('restore', data);
        msg.value = 'Backup restaurado correctamente';
        msgTipo.value = 'ok';
      } catch (e) {
        msg.value = 'Error: ' + (e instanceof Error ? e.message : String(e));
        msgTipo.value = 'error';
      } finally {
        restaurando.value = false;
      }
    },
  });
}
</script>
