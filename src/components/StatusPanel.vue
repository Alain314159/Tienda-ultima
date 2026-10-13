<template>
  <div class="modal no-print" @click.self="$emit('close')">
    <div class="modal-box" style="max-width: 560px; max-height: 85vh; overflow-y: auto">
      <div class="modal-title" style="display: flex; justify-content: space-between; align-items: center">
        <span><icon name="alert" :size="18" :color="mutColor"></icon> Estado del sistema</span>
        <button class="link-btn" @click="$emit('close')" style="font-size: 1.2rem; padding: 0 0.5rem">×</button>
      </div>

      <!-- ================================================ -->
      <!-- SECCION 1: ACTUALIZACIONES (CAPGO OTA)           -->
      <!-- ================================================ -->
      <div class="status-section">
        <div class="status-section-title">
          <icon name="refresh" :size="16" :color="'#2196F3'"></icon>
          Actualizaciones (OTA)
        </div>

        <div class="info-box" style="margin-bottom: 0.6rem">
          <div class="status-row">
            <span>Version instalada</span>
            <b>{{ otaActual.version || '—' }}</b>
          </div>
          <div class="status-row">
            <span>Bundle ID</span>
            <b style="font-size: 0.7rem">{{ otaActual.id || '—' }}</b>
          </div>
          <div class="status-row">
            <span>Version nativa</span>
            <b>{{ otaActual.native || '—' }}</b>
          </div>
          <div class="status-row" v-if="otaUltima">
            <span>Disponible en la nube</span>
            <b :style="{ color: otaUltima.version !== otaActual.version ? 'var(--ok)' : 'var(--mut)' }">
              {{ otaUltima.version }}
              <span v-if="otaUltima.version !== otaActual.version"> · nueva</span>
            </b>
          </div>
          <div class="status-row" v-if="otaCheck">
            <span>Ultima verificacion</span>
            <b style="font-size: 0.72rem">{{ otaCheck }}</b>
          </div>
        </div>

        <button class="btn pri" @click="verificarOTA" :disabled="otaBusy" style="width: 100%; margin-bottom: 0.5rem">
          {{ otaBusy ? 'Verificando...' : 'Buscar actualizacion ahora' }}
        </button>

        <div
          v-if="otaMsg"
          :style="{ color: otaMsgTipo === 'ok' ? 'var(--ok)' : 'var(--warn)', fontSize: '.75rem', textAlign: 'center' }"
        >
          {{ otaMsg }}
        </div>
      </div>

      <!-- ================================================ -->
      <!-- SECCION 2: GITHUB                                -->
      <!-- ================================================ -->
      <div class="status-section">
        <div class="status-section-title">
          <icon name="file" :size="16" :color="'#6e40c9'"></icon>
          Actividad en GitHub
        </div>

        <div v-if="ghError" class="info-box" style="background: rgb(239 68 68 / 10%); border-color: var(--bad)">
          <b style="color: var(--bad); font-size: 0.8rem">Error: {{ ghError }}</b>
        </div>

        <div v-else>
          <!-- Ultimo commit -->
          <div v-if="ghCommit" class="info-box" style="margin-bottom: 0.6rem">
            <div style="font-size: 0.7rem; color: var(--mut); margin-bottom: 0.3rem">ULTIMO COMMIT</div>
            <div style="font-weight: 700; font-size: 0.85rem; margin-bottom: 0.2rem">{{ ghCommit.msg }}</div>
            <div style="font-size: 0.72rem; color: var(--mut)">{{ ghCommit.hash }} · {{ ghCommit.date }}</div>
          </div>

          <!-- Workflows recientes -->
          <div v-if="ghRuns.length" style="margin-bottom: 0.6rem">
            <div style="font-size: 0.7rem; color: var(--mut); margin-bottom: 0.4rem">WORKFLOWS RECIENTES</div>
            <div
              v-for="r in ghRuns"
              :key="r.id"
              style="
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 0.4rem 0.6rem;
                border: 1px solid var(--brd);
                border-radius: 8px;
                margin-bottom: 0.3rem;
                font-size: 0.75rem;
              "
            >
              <div style="flex: 1; overflow: hidden">
                <div style="font-weight: 600; text-overflow: ellipsis; white-space: nowrap; overflow: hidden">
                  {{ r.name }}
                </div>
                <div style="color: var(--mut); font-size: 0.68rem">{{ r.date }}</div>
              </div>
              <span :class="'status-badge status-' + r.status">{{ r.statusLabel }}</span>
            </div>
          </div>

          <div v-if="ghLoading" style="text-align: center; font-size: 0.75rem; color: var(--mut); padding: 0.5rem">
            Cargando...
          </div>
        </div>

        <button class="btn ghost" @click="cargarGitHub" :disabled="ghLoading" style="width: 100%">
          {{ ghLoading ? 'Cargando...' : 'Refrescar GitHub' }}
        </button>
      </div>

      <!-- ================================================ -->
      <!-- SECCION 3: NOTIFICACIONES                        -->
      <!-- ================================================ -->
      <div class="status-section">
        <div class="status-section-title">
          <icon name="alert" :size="16" :color="'#f59e0b'"></icon>
          Notificaciones
        </div>

        <div class="info-box" style="margin-bottom: 0.6rem">
          <div class="status-row">
            <span>Permiso</span>
            <b :style="{ color: permisoColor }">{{ permisoTexto }}</b>
          </div>
          <div class="status-row">
            <span>Activas en Ajustes</span>
            <b :style="{ color: notifActivo ? 'var(--ok)' : 'var(--mut)' }">{{ notifActivo ? 'Sí' : 'No' }}</b>
          </div>
        </div>

        <button v-if="!notifPermitido" class="btn pri" @click="pedirNotif" style="width: 100%; margin-bottom: 0.5rem">
          Pedir permiso de notificaciones
        </button>
        <button v-else class="btn ghost" @click="probarNotif" style="width: 100%; margin-bottom: 0.5rem">
          Probar notificacion
        </button>

        <div v-if="notifMsg" :style="{ color: 'var(--ok)', fontSize: '.75rem', textAlign: 'center' }">
          {{ notifMsg }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { Capacitor } from '@capacitor/core';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { LocalNotifications } from '@capacitor/local-notifications';
import { useConfigStore } from '../stores/useConfigStore';

defineOptions({ name: 'StatusPanel' });

defineEmits(['close']);

// TODO: mover a variable de entorno (VITE_GITHUB_TOKEN) — no debe vivir en el codigo
const GITHUB_TOKEN = '';
const GITHUB_REPO = 'Alain314159/Tienda-ultima';

const configStore = useConfigStore();

// OTA
const otaActual = ref({ version: '', id: '', native: '' });
const otaUltima = ref<{ version: string } | null>(null);
const otaCheck = ref<string | null>(null);
const otaBusy = ref(false);
const otaMsg = ref('');
const otaMsgTipo = ref('ok');

// GitHub
const ghLoading = ref(false);
const ghError = ref('');
const ghCommit = ref<{ msg: string; hash: string; date: string } | null>(null);
const ghRuns = ref<{ id: number; name: string; date: string; status: string; statusLabel: string }[]>([]);

// Notif
const notifPermitido = ref(false);
const notifMsg = ref('');

const mutColor = computed(
  () => getComputedStyle(document.documentElement).getPropertyValue('--mut').trim() || '#64748B'
);
const notifActivo = computed(() => !!configStore.cfg.notifActivo);
const permisoColor = computed(() => (notifPermitido.value ? 'var(--ok)' : 'var(--warn)'));
const permisoTexto = computed(() => (notifPermitido.value ? 'Concedido' : 'No concedido'));

onMounted(async () => {
  await cargarOTA();
  await cargarGitHub();
  await checkNotif();
});

// ==========================================
// OTA
// ==========================================
async function cargarOTA() {
  try {
    if (!Capacitor.isNativePlatform()) {
      otaActual.value = { version: 'web', id: 'pwa', native: '—' };
      return;
    }
    const info = await CapacitorUpdater.current();
    otaActual.value = {
      version: (info.bundle && info.bundle.version) || '—',
      id: (info.bundle && info.bundle.id) || '—',
      native: info.native || '—',
    };
    try {
      const latest = await CapacitorUpdater.getLatest();
      if (latest && latest.version) otaUltima.value = { version: latest.version };
    } catch {
      /* sin conexion */
    }
  } catch (e) {
    console.warn('cargarOTA', e);
  }
}

async function verificarOTA() {
  otaBusy.value = true;
  otaMsg.value = '';
  try {
    if (!Capacitor.isNativePlatform()) {
      otaMsg.value = 'En web, las actualizaciones llegan al recargar';
      otaMsgTipo.value = 'warn';
      return;
    }
    const latest = await CapacitorUpdater.getLatest();
    otaUltima.value = { version: latest.version };
    const actual = otaActual.value.version;
    otaCheck.value = new Date().toLocaleString();
    if (latest.version === actual) {
      otaMsg.value = 'Ya tienes la ultima version';
      otaMsgTipo.value = 'ok';
    } else {
      otaMsg.value = 'Nueva version disponible: ' + latest.version + '. Cierra y abre la app.';
      otaMsgTipo.value = 'ok';
      try {
        const dl = await CapacitorUpdater.download({ url: String(latest.url), version: String(latest.version) });
        await CapacitorUpdater.set({ id: dl.id });
      } catch {
        otaMsg.value = 'Descarga iniciada. Se aplicara al reiniciar.';
      }
    }
  } catch (e) {
    otaMsg.value = 'Error: ' + (e instanceof Error && e.message ? e.message : 'sin conexion');
    otaMsgTipo.value = 'warn';
  } finally {
    otaBusy.value = false;
  }
}

// ==========================================
// GITHUB
// ==========================================
interface GhWorkflowRun {
  id: number;
  name: string;
  head_branch?: string | null;
  created_at: string;
  status: string;
  conclusion: string | null;
}

async function cargarGitHub() {
  ghLoading.value = true;
  ghError.value = '';
  try {
    if (!GITHUB_TOKEN) {
      ghError.value = 'Token de GitHub no configurado';
      return;
    }
    const headers = {
      Authorization: 'token ' + GITHUB_TOKEN,
      Accept: 'application/vnd.github+json',
    };

    // Commits
    const r1 = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/commits?per_page=1`, { headers });
    if (!r1.ok) throw new Error('GitHub commits: HTTP ' + r1.status);
    const commits = await r1.json();
    if (commits[0]) {
      ghCommit.value = {
        msg: commits[0].commit.message.split('\n')[0].slice(0, 80),
        hash: commits[0].sha.slice(0, 7),
        date: new Date(commits[0].commit.author.date).toLocaleString(),
      };
    }

    // Workflows
    const r2 = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/actions/runs?per_page=5`, { headers });
    if (!r2.ok) throw new Error('GitHub runs: HTTP ' + r2.status);
    const runs = await r2.json();
    ghRuns.value = (runs.workflow_runs || []).map((r: GhWorkflowRun) => ({
      id: r.id,
      name: r.name + ' · ' + (r.head_branch || ''),
      date: new Date(r.created_at).toLocaleString(),
      status: statusDeRun(r),
      statusLabel: labelDeRun(r),
    }));
  } catch (e) {
    ghError.value = e instanceof Error ? e.message : String(e);
  } finally {
    ghLoading.value = false;
  }
}

function statusDeRun(r: GhWorkflowRun) {
  if (r.status === 'in_progress' || r.status === 'queued') return 'run';
  if (r.conclusion === 'success') return 'ok';
  if (r.conclusion === 'failure') return 'bad';
  return 'warn';
}

function labelDeRun(r: GhWorkflowRun) {
  if (r.status === 'in_progress') return 'corriendo';
  if (r.status === 'queued') return 'en cola';
  if (r.conclusion === 'success') return 'OK';
  if (r.conclusion === 'failure') return 'fallo';
  return r.conclusion || r.status;
}

// ==========================================
// NOTIFICACIONES
// ==========================================
async function checkNotif() {
  try {
    if (Capacitor.isNativePlatform()) {
      const perm = await LocalNotifications.checkPermissions();
      notifPermitido.value = perm.display === 'granted';
    } else if ('Notification' in window) {
      notifPermitido.value = Notification.permission === 'granted';
    }
  } catch (e) {
    console.warn('checkNotif', e);
  }
}

async function pedirNotif() {
  notifMsg.value = '';
  try {
    if (Capacitor.isNativePlatform()) {
      const r = await LocalNotifications.requestPermissions();
      notifPermitido.value = r.display === 'granted';
      if (!notifPermitido.value) notifMsg.value = 'Permiso denegado';
    } else if ('Notification' in window) {
      const r = await Notification.requestPermission();
      notifPermitido.value = r === 'granted';
    }
    if (notifPermitido.value) {
      configStore.cfg.notifActivo = true;
      configStore.guardarCfg();
    }
  } catch (e) {
    notifMsg.value = 'Error: ' + (e instanceof Error ? e.message : String(e));
  }
}

async function probarNotif() {
  notifMsg.value = '';
  try {
    if (Capacitor.isNativePlatform()) {
      await LocalNotifications.schedule({
        notifications: [
          {
            id: 1,
            title: 'Prueba de notificacion',
            body: 'Si ves esto, las notificaciones funcionan',
            schedule: { at: new Date(Date.now() + 1000) },
          },
        ],
      });
    } else if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Prueba de notificacion', { body: 'Si ves esto, las notificaciones funcionan' });
    }
    notifMsg.value = 'Notificacion enviada';
  } catch (e) {
    notifMsg.value = 'Error: ' + (e instanceof Error ? e.message : String(e));
  }
}
</script>

<style scoped>
.status-section {
  padding: 1rem 0;
  border-bottom: 1px solid var(--brd);
}

.status-section:last-child {
  border-bottom: none;
}

.status-section-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
  font-weight: 700;
  margin-bottom: 0.7rem;
}

.status-row {
  display: flex;
  justify-content: space-between;
  padding: 0.3rem 0;
  font-size: 0.78rem;
  border-bottom: 1px solid var(--brd);
}

.status-row:last-child {
  border-bottom: none;
}

.status-row > span {
  color: var(--mut);
}

.status-badge {
  padding: 0.15rem 0.5rem;
  border-radius: 6px;
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  white-space: nowrap;
}

.status-ok {
  background: rgb(34 197 94 / 15%);
  color: var(--ok);
}

.status-bad {
  background: rgb(239 68 68 / 15%);
  color: var(--bad);
}

.status-run {
  background: rgb(245 158 11 / 15%);
  color: var(--warn);
}

.status-warn {
  background: rgb(100 116 139 / 15%);
  color: var(--mut);
}
</style>
