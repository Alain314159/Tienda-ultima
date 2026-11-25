<template>
  <div class="modal no-print" @click.self="$emit('close')">
    <div class="modal-box" style="max-width:520px">
      <div class="modal-title" style="display:flex;justify-content:space-between;align-items:center">
        <span><icon name="package" :size="18" :color="mutColor"></icon> Respaldo automático</span>
        <button class="link-btn" @click="$emit('close')" style="font-size:1.2rem;padding:0 .5rem">×</button>
      </div>

      <!-- Estado -->
      <div class="info-box" style="margin-bottom:.8rem">
        <div style="display:flex;justify-content:space-between;margin-bottom:.3rem">
          <span>Último backup</span>
          <b>{{ info.ultimo || 'Ninguno' }}</b>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:.3rem">
          <span>Archivos guardados</span>
          <b>{{ info.cantidad }}</b>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:.3rem">
          <span>Carpeta</span>
          <b style="font-size:.7rem">Documents/backups/</b>
        </div>
        <div v-if="esNativo" style="display:flex;justify-content:space-between;font-size:.7rem;color:var(--mut);margin-top:.4rem;border-top:1px solid var(--brd);padding-top:.4rem">
          <span>Se guarda en el almacenamiento privado de la app</span>
        </div>
        <div v-else style="font-size:.7rem;color:var(--warn);margin-top:.4rem;border-top:1px solid var(--brd);padding-top:.4rem">
          ⚠ En modo web, los backups se descargan como archivos
        </div>
      </div>

      <!-- Botones -->
      <div class="grid2" style="margin-bottom:.8rem">
        <button class="btn pri" @click="hacerBackupAhora" :disabled="guardando">
          {{ guardando ? 'Guardando...' : 'Backup ahora' }}
        </button>
        <button class="btn ghost" @click="cargarLista" :disabled="cargando">
          {{ cargando ? 'Cargando...' : 'Refrescar lista' }}
        </button>
      </div>

      <!-- Lista -->
      <div style="max-height:200px;overflow-y:auto;border:1px solid var(--brd);border-radius:8px;margin-bottom:.8rem">
        <div v-if="!archivos.length" style="padding:1rem;text-align:center;color:var(--mut);font-size:.8rem">
          Sin backups todavía
        </div>
        <div v-for="a in archivos" :key="a.name"
          style="display:flex;justify-content:space-between;align-items:center;padding:.5rem .7rem;border-bottom:1px solid var(--brd);font-size:.78rem">
          <span>{{ a.name }}</span>
          <button class="link-btn" @click="restaurar(a.name)" :disabled="restaurando" style="font-size:.72rem">
            Restaurar
          </button>
        </div>
      </div>

      <!-- Restaurar último -->
      <button class="btn warn" @click="restaurarUltimo" :disabled="!archivos.length || restaurando" style="width:100%">
        {{ restaurando ? 'Restaurando...' : 'Restaurar el más reciente' }}
      </button>

      <!-- Mensajes -->
      <div v-if="msg" :style="{ color: msgTipo === 'error' ? 'var(--bad)' : 'var(--ok)', fontSize: '.78rem', marginTop: '.6rem', textAlign: 'center' }">
        {{ msg }}
      </div>
    </div>
  </div>
</template>

<script>
import { BackupFolder } from '../services/backupFolder.js';
import { esNativo } from '../services/platform.js';
import { buildData } from '../db.js';
import { Autosave } from '../services/autosave.js';

export default {
  name: 'BackupPanel',
  emits: ['close', 'restore'],
  data() {
    return {
      info: { cantidad: 0, ultimo: null },
      archivos: [],
      cargando: false,
      guardando: false,
      restaurando: false,
      msg: '',
      msgTipo: 'ok'
    };
  },
  computed: {
    esNativo() { return esNativo(); },
    mutColor() { return getComputedStyle(document.documentElement).getPropertyValue('--mut').trim() || '#64748B'; }
  },
  mounted() {
    this.cargarLista();
  },
  methods: {
    async cargarLista() {
      this.cargando = true;
      try {
        this.info = await BackupFolder.info();
        this.archivos = await BackupFolder.listar();
      } catch (e) {
        this.msg = 'Error cargando lista: ' + e.message;
        this.msgTipo = 'error';
      } finally {
        this.cargando = false;
      }
    },

    async hacerBackupAhora() {
      this.guardando = true;
      this.msg = '';
      try {
        const app = window.__app;
        if (!app) throw new Error('App no disponible');
        const data = buildData(app);
        const nombre = await BackupFolder.guardar(data, null);
        await BackupFolder.rotar(30);
        this.msg = 'Backup creado: ' + nombre;
        this.msgTipo = 'ok';
        await this.cargarLista();
      } catch (e) {
        this.msg = 'Error: ' + e.message;
        this.msgTipo = 'error';
      } finally {
        this.guardando = false;
      }
    },

    async restaurarUltimo() {
      if (!this.archivos.length) return;
      await this.restaurar(this.archivos[0].name);
    },

    async restaurar(nombre) {
      if (!confirm('¿Restaurar el backup "' + nombre + '"?\nSe reemplazarán TODOS los datos actuales.')) return;
      this.restaurando = true;
      this.msg = '';
      try {
        const data = await BackupFolder.leer(nombre);
        if (!data) throw new Error('No se pudo leer el archivo');
        this.$emit('restore', data);
        this.msg = 'Backup restaurado correctamente';
        this.msgTipo = 'ok';
      } catch (e) {
        this.msg = 'Error: ' + e.message;
        this.msgTipo = 'error';
      } finally {
        this.restaurando = false;
      }
    }
  }
};
</script>
