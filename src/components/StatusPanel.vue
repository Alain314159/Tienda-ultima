<template>
  <div class="modal no-print" @click.self="$emit('close')">
    <div class="modal-box" style="max-width:560px;max-height:85vh;overflow-y:auto">
      <div class="modal-title" style="display:flex;justify-content:space-between;align-items:center">
        <span><icon name="alert" :size="18" :color="mutColor"></icon> Estado del sistema</span>
        <button class="link-btn" @click="$emit('close')" style="font-size:1.2rem;padding:0 .5rem">×</button>
      </div>

      <!-- ================================================ -->
      <!-- SECCION 1: ACTUALIZACIONES (CAPGO OTA)           -->
      <!-- ================================================ -->
      <div class="status-section">
        <div class="status-section-title">
          <icon name="refresh" :size="16" :color="'#2196F3'"></icon>
          Actualizaciones (OTA)
        </div>

        <div class="info-box" style="margin-bottom:.6rem">
          <div class="status-row">
            <span>Version instalada</span>
            <b>{{ otaActual.version || '—' }}</b>
          </div>
          <div class="status-row">
            <span>Bundle ID</span>
            <b style="font-size:.7rem">{{ otaActual.id || '—' }}</b>
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
            <b style="font-size:.72rem">{{ otaCheck }}</b>
          </div>
        </div>

        <button class="btn pri" @click="verificarOTA" :disabled="otaBusy" style="width:100%;margin-bottom:.5rem">
          {{ otaBusy ? 'Verificando...' : 'Buscar actualizacion ahora' }}
        </button>

        <div v-if="otaMsg" :style="{ color: otaMsgTipo === 'ok' ? 'var(--ok)' : 'var(--warn)', fontSize: '.75rem', textAlign: 'center' }">
          {{ otaMsg }}
        </div>
      </div>

      <!-- ================================================ -->
      <!-- SECCION 2: GITHUB                                -->
      <!-- ================================================ -->
      <!-- SECCION GITHUB (deshabilitada) -->
      <div v-if="false" class="status-section">
        <div class="status-section-title">
          <icon name="file" :size="16" :color="'#6e40c9'"></icon>
          Actividad en GitHub
        </div>

        <div v-if="ghError" class="info-box" style="background:rgba(239,68,68,.1);border-color:var(--bad)">
          <b style="color:var(--bad);font-size:.8rem">Error: {{ ghError }}</b>
        </div>

        <div v-else>
          <!-- Ultimo commit -->
          <div v-if="ghCommit" class="info-box" style="margin-bottom:.6rem">
            <div style="font-size:.7rem;color:var(--mut);margin-bottom:.3rem">ULTIMO COMMIT</div>
            <div style="font-weight:700;font-size:.85rem;margin-bottom:.2rem">{{ ghCommit.msg }}</div>
            <div style="font-size:.72rem;color:var(--mut)">
              {{ ghCommit.hash }} · {{ ghCommit.date }}
            </div>
          </div>

          <!-- Workflows recientes -->
          <div v-if="ghRuns.length" style="margin-bottom:.6rem">
            <div style="font-size:.7rem;color:var(--mut);margin-bottom:.4rem">WORKFLOWS RECIENTES</div>
            <div v-for="r in ghRuns" :key="r.id"
              style="display:flex;justify-content:space-between;align-items:center;padding:.4rem .6rem;border:1px solid var(--brd);border-radius:8px;margin-bottom:.3rem;font-size:.75rem">
              <div style="flex:1;overflow:hidden">
                <div style="font-weight:600;text-overflow:ellipsis;white-space:nowrap;overflow:hidden">{{ r.name }}</div>
                <div style="color:var(--mut);font-size:.68rem">{{ r.date }}</div>
              </div>
              <span :class="'status-badge status-' + r.status">{{ r.statusLabel }}</span>
            </div>
          </div>

          <div v-if="ghLoading" style="text-align:center;font-size:.75rem;color:var(--mut);padding:.5rem">
            Cargando...
          </div>
        </div>

        <button class="btn ghost" @click="cargarGitHub" :disabled="ghLoading" style="width:100%">
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

        <div class="info-box" style="margin-bottom:.6rem">
          <div class="status-row">
            <span>Permiso</span>
            <b :style="{ color: permisoColor }">{{ permisoTexto }}</b>
          </div>
          <div class="status-row">
            <span>Activas en Ajustes</span>
            <b :style="{ color: notifActivo ? 'var(--ok)' : 'var(--mut)' }">{{ notifActivo ? 'Sí' : 'No' }}</b>
          </div>
        </div>

        <button v-if="!notifPermitido" class="btn pri" @click="pedirNotif" style="width:100%;margin-bottom:.5rem">
          Pedir permiso de notificaciones
        </button>
        <button v-else class="btn ghost" @click="probarNotif" style="width:100%;margin-bottom:.5rem">
          Probar notificacion
        </button>

        <div v-if="notifMsg" :style="{ color: 'var(--ok)', fontSize: '.75rem', textAlign: 'center' }">
          {{ notifMsg }}
        </div>
      </div>

    </div>
  </div>
</template>

<script>
import { Capacitor } from '@capacitor/core';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { LocalNotifications } from '@capacitor/local-notifications';

// ⚠️ REEMPLAZA ESTO CON TU TOKEN DE GITHUB
// Crear en: GitHub → Settings → Developer settings → Personal access tokens → Fine-grained
// Repository: Alain314159/Tienda-ultima
// Permissions: Actions: Read, Contents: Read
const GITHUB_TOKEN = '';
const GITHUB_REPO = 'Alain314159/Tienda-ultima';

export default {
  name: 'StatusPanel',
  emits: ['close'],
  data() {
    return {
      // OTA
      otaActual: { version: '', id: '', native: '' },
      otaUltima: null,
      otaCheck: null,
      otaBusy: false,
      otaMsg: '',
      otaMsgTipo: 'ok',

      // GitHub
      ghLoading: false,
      ghError: '',
      ghCommit: null,
      ghRuns: [],

      // Notif
      notifPermitido: false,
      notifActivo: false,
      notifMsg: ''
    };
  },
  computed: {
    mutColor() { return getComputedStyle(document.documentElement).getPropertyValue('--mut').trim() || '#64748B'; },
    permisoColor() {
      return this.notifPermitido ? 'var(--ok)' : 'var(--warn)';
    },
    permisoTexto() {
      return this.notifPermitido ? 'Concedido' : 'No concedido';
    }
  },
  async mounted() {
    await this.cargarOTA();
    // await this.cargarGitHub(); // deshabilitado: requiere Worker de Cloudflare
    await this.checkNotif();
  },
  methods: {
    // ==========================================
    // OTA
    // ==========================================
    async cargarOTA() {
      try {
        if (!Capacitor.isNativePlatform()) {
          this.otaActual = { version: 'web', id: 'pwa', native: '—' };
          return;
        }
        const info = await CapacitorUpdater.current();
        this.otaActual = {
          version: (info.bundle && info.bundle.version) || '—',
          id: (info.bundle && info.bundle.id) || '—',
          native: info.native || '—'
        };
        try {
          const latest = await CapacitorUpdater.getLatest();
          if (latest && latest.version) this.otaUltima = { version: latest.version };
        } catch (e) { /* sin conexion */ }
      } catch (e) {
        console.warn('cargarOTA', e);
      }
    },

    async verificarOTA() {
      this.otaBusy = true;
      this.otaMsg = '';
      try {
        if (!Capacitor.isNativePlatform()) {
          this.otaMsg = 'En web, las actualizaciones llegan al recargar';
          this.otaMsgTipo = 'warn';
          return;
        }
        const latest = await CapacitorUpdater.getLatest();
        this.otaUltima = { version: latest.version };
        const actual = this.otaActual.version;
        this.otaCheck = new Date().toLocaleString();
        if (latest.version === actual) {
          this.otaMsg = 'Ya tienes la ultima version';
          this.otaMsgTipo = 'ok';
        } else {
          this.otaMsg = 'Nueva version disponible: ' + latest.version + '. Cierra y abre la app.';
          this.otaMsgTipo = 'ok';
          try {
            const dl = await CapacitorUpdater.download({ url: latest.url, version: latest.version });
            await CapacitorUpdater.set({ id: dl.id });
          } catch (e) {
            this.otaMsg = 'Descarga iniciada. Se aplicara al reiniciar.';
          }
        }
      } catch (e) {
        this.otaMsg = 'Error: ' + (e.message || 'sin conexion');
        this.otaMsgTipo = 'warn';
      } finally {
        this.otaBusy = false;
      }
    },

    // ==========================================
    // GITHUB
    // ==========================================
    async cargarGitHub() {
      this.ghLoading = true;
      this.ghError = '';
      try {
        if (GITHUB_TOKEN === 'PEGA_TU_TOKEN_AQUI') {
          this.ghError = 'Token de GitHub no configurado';
          return;
        }
        const headers = {
          'Authorization': 'token ' + GITHUB_TOKEN,
          'Accept': 'application/vnd.github+json'
        };

        // Commits
        const r1 = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/commits?per_page=1`, { headers });
        if (!r1.ok) throw new Error('GitHub commits: HTTP ' + r1.status);
        const commits = await r1.json();
        if (commits[0]) {
          this.ghCommit = {
            msg: commits[0].commit.message.split('\n')[0].slice(0, 80),
            hash: commits[0].sha.slice(0, 7),
            date: new Date(commits[0].commit.author.date).toLocaleString()
          };
        }

        // Workflows
        const r2 = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/actions/runs?per_page=5`, { headers });
        if (!r2.ok) throw new Error('GitHub runs: HTTP ' + r2.status);
        const runs = await r2.json();
        this.ghRuns = (runs.workflow_runs || []).map(r => ({
          id: r.id,
          name: r.name + ' · ' + (r.head_branch || ''),
          date: new Date(r.created_at).toLocaleString(),
          status: this.statusDeRun(r),
          statusLabel: this.labelDeRun(r)
        }));
      } catch (e) {
        this.ghError = e.message || 'Error desconocido';
      } finally {
        this.ghLoading = false;
      }
    },

    statusDeRun(r) {
      if (r.status === 'in_progress' || r.status === 'queued') return 'run';
      if (r.conclusion === 'success') return 'ok';
      if (r.conclusion === 'failure') return 'bad';
      return 'warn';
    },

    labelDeRun(r) {
      if (r.status === 'in_progress') return 'corriendo';
      if (r.status === 'queued') return 'en cola';
      if (r.conclusion === 'success') return 'OK';
      if (r.conclusion === 'failure') return 'fallo';
      return r.conclusion || r.status;
    },

    // ==========================================
    // NOTIFICACIONES
    // ==========================================
    async checkNotif() {
      try {
        this.notifActivo = !!(window.__app && window.__app.cfg && window.__app.cfg.notifActivo);
        if (Capacitor.isNativePlatform()) {
          const perm = await LocalNotifications.checkPermissions();
          this.notifPermitido = perm.display === 'granted';
        } else if ('Notification' in window) {
          this.notifPermitido = Notification.permission === 'granted';
        }
      } catch (e) {
        console.warn('checkNotif', e);
      }
    },

    async pedirNotif() {
      this.notifMsg = '';
      try {
        if (Capacitor.isNativePlatform()) {
          const r = await LocalNotifications.requestPermissions();
          this.notifPermitido = r.display === 'granted';
          if (!this.notifPermitido) this.notifMsg = 'Permiso denegado';
        } else if ('Notification' in window) {
          const r = await Notification.requestPermission();
          this.notifPermitido = r === 'granted';
        }
        if (this.notifPermitido && window.__app) {
          window.__app.cfg.notifActivo = true;
          window.__app.guardarCfg && window.__app.guardarCfg();
          this.notifActivo = true;
        }
      } catch (e) {
        this.notifMsg = 'Error: ' + e.message;
      }
    },

    async probarNotif() {
      this.notifMsg = '';
      try {
        if (Capacitor.isNativePlatform()) {
          await LocalNotifications.schedule({
            notifications: [{
              id: 1,
              title: 'Prueba de notificacion',
              body: 'Si ves esto, las notificaciones funcionan',
              schedule: { at: new Date(Date.now() + 1000) }
            }]
          });
        } else if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('Prueba de notificacion', { body: 'Si ves esto, las notificaciones funcionan' });
        }
        this.notifMsg = 'Notificacion enviada';
      } catch (e) {
        this.notifMsg = 'Error: ' + e.message;
      }
    }
  }
};
</script>

<style scoped>
.status-section {
  padding: 1rem 0;
  border-bottom: 1px solid var(--brd);
}
.status-section:last-child { border-bottom: none; }

.status-section-title {
  display: flex;
  align-items: center;
  gap: .5rem;
  font-size: .85rem;
  font-weight: 700;
  margin-bottom: .7rem;
}

.status-row {
  display: flex;
  justify-content: space-between;
  padding: .3rem 0;
  font-size: .78rem;
  border-bottom: 1px solid var(--brd);
}
.status-row:last-child { border-bottom: none; }
.status-row > span { color: var(--mut); }

.status-badge {
  padding: .15rem .5rem;
  border-radius: 6px;
  font-size: .65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .5px;
  white-space: nowrap;
}
.status-ok { background: rgba(34,197,94,.15); color: var(--ok); }
.status-bad { background: rgba(239,68,68,.15); color: var(--bad); }
.status-run { background: rgba(245,158,11,.15); color: var(--warn); }
.status-warn { background: rgba(100,116,139,.15); color: var(--mut); }
</style>
