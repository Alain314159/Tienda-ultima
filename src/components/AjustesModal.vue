<template>
  <div v-if="ui.ajustesAbierto" class="modal no-print" @click.self="ui.ajustesAbierto = false">
    <div class="modal-box" @click.stop>
      <div class="modal-title"><icon name="settings" :size="20"></icon> Ajustes</div>

      <div class="set-group">Personalizacion</div>
      <div class="set-row">
        <span class="lbl"><icon name="list" :size="18"></icon> Tamaño de letra</span>
        <div style="display: flex; align-items: center; gap: 0.4rem">
          <button class="font-scale-btn" :disabled="cfg.fontScale <= 1" @click="cambiarEscalaFont(-1)">A−</button>
          <span class="font-scale-val"
            >{{ Number(cfg.fontScale).toFixed(2).replace(/0+$/, '').replace(/\.$/, '') }}×</span
          >
          <button class="font-scale-btn" :disabled="cfg.fontScale >= 2" @click="cambiarEscalaFont(1)">A+</button>
        </div>
      </div>
      <div style="font-size: 0.72rem; color: var(--mut); margin-bottom: 0.6rem">
        Aumenta o reduce el tamaño de todas las letras de la app (1× a 2×).
      </div>

      <div class="set-row">
        <span class="lbl"><icon name="store" :size="18"></icon> Nombre de tienda</span>
        <input
          v-model="cfg.nombre"
          type="text"
          style="width: auto; flex: 1; margin: 0; padding: 0.4rem 0.6rem"
          @change="guardarCfg"
        />
      </div>
      <div class="set-row">
        <span class="lbl"><icon name="map-pin" :size="18"></icon> Dirección (lista de precios)</span>
        <input
          v-model="cfg.contactoDireccion"
          type="text"
          placeholder="Calle y número"
          style="width: auto; flex: 1; margin: 0; padding: 0.4rem 0.6rem"
          @change="guardarCfg"
        />
      </div>
      <div class="set-row">
        <span class="lbl"><icon name="phone" :size="18"></icon> Teléfonos</span>
        <input
          v-model="cfg.contactoTelefonos"
          type="text"
          placeholder="58154333 · 56763562"
          style="width: auto; flex: 1; margin: 0; padding: 0.4rem 0.6rem"
          @change="guardarCfg"
        />
      </div>
      <div class="set-row">
        <span class="lbl"><icon name="message-circle" :size="18"></icon> Grupo de WhatsApp</span>
        <input
          v-model="cfg.contactoGrupoWa"
          type="text"
          placeholder="https://chat.whatsapp.com/..."
          style="width: auto; flex: 1; margin: 0; padding: 0.4rem 0.6rem"
          @change="guardarCfg"
        />
      </div>

      <div class="set-row">
        <span class="lbl"><icon name="calculator" :size="18"></icon> Boton de calculadora</span>
        <label class="switch">
          <input
            type="checkbox"
            :checked="configStore.calcActiva !== false"
            @change="
              cfg.calcActiva = ($event.target as HTMLInputElement).checked;
              guardarCfg();
            "
          />
          <span class="slider"></span>
        </label>
      </div>
      <div style="font-size: 0.72rem; color: var(--mut); margin-top: 0.2rem; margin-bottom: 0.5rem">
        Muestra u oculta el icono de calculadora en la barra superior.
      </div>
      <div class="set-row">
        <span class="lbl"><icon name="search" :size="18"></icon> Busqueda global</span>
        <label class="switch">
          <input
            type="checkbox"
            :checked="configStore.busquedaGlobalActiva !== false"
            @change="
              cfg.busquedaGlobalActiva = ($event.target as HTMLInputElement).checked;
              guardarCfg();
            "
          />
          <span class="slider"></span>
        </label>
      </div>
      <div style="font-size: 0.72rem; color: var(--mut); margin-top: 0.2rem; margin-bottom: 0.5rem">
        Muestra u oculta el buscador global en la barra superior.
      </div>
      <div class="set-group">Seguridad</div>
      <div class="set-row">
        <span class="lbl"><icon name="lock" :size="18"></icon> PIN operaciones sensibles</span>
        <label class="switch">
          <input type="checkbox" v-model="cfg.pinActivo" @change="guardarCfg" />
          <span class="slider"></span>
        </label>
      </div>
      <div v-if="cfg.pinActivo" style="margin-top: 0.3rem">
        <!-- Nunca bindear cfg.pin directo: ahí vive el HASH pbkdf2 (83 chars).
             El campo es solo para escribir un PIN NUEVO; vacío = conservar el
             actual. Antes: el hash colaba al input (maxlength=6 lo hacía
             ineditable y editarlo a medias corrompía el PIN guardado). -->
        <input
          v-model="pinNuevo"
          type="password"
          :placeholder="pinGuardado ? 'Nuevo PIN (vacío = sin cambio)' : 'PIN (4 dígitos)'"
          maxlength="6"
          inputmode="numeric"
          @change="guardarPinNuevo"
        />
        <div v-if="pinGuardado" style="font-size: 0.68rem; opacity: 0.65; margin-top: 0.15rem">PIN configurado ✓</div>
      </div>

      <div class="set-group">Datos y respaldos</div>
      <button class="btn pri" @click="backup.exportar">
        <icon name="download" :size="16" color="#fff"></icon> Exportar respaldo (JSON)
      </button>
      <button
        class="btn pri"
        @click="backup.exportarCifrado"
        style="background: linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)"
      >
        <icon name="lock" :size="16" color="#fff"></icon> Exportar respaldo cifrado
      </button>
      <button class="btn ghost" @click="backup.triggerImport">
        <icon name="upload" :size="16" :color="mutColor"></icon> Importar datos
      </button>
      <!-- accept ampliado: los respaldos históricos incluyen .json.gz (carpeta
           de backups automáticos) y .json con gzip por dentro (pre-migración) -->
      <input
        type="file"
        id="impFile"
        accept=".json,.gz,application/json,application/gzip"
        style="display: none"
        @change="backup.onImportFile"
      />
      <div v-if="backup.ultimoBackup" style="font-size: 0.75rem; color: var(--mut); margin-top: 0.3rem">
        Último backup auto: {{ fmtFH(backup.ultimoBackup.fecha) }}
        <button class="link-btn" @click="backup.restaurarBackupAuto">Restaurar backup automático</button>
      </div>

      <div class="set-row" style="padding-top: 0.6rem; border-top: 1px solid var(--brd); margin-top: 0.6rem">
        <span class="lbl"><icon name="package" :size="18"></icon> Almacenamiento local</span>
      </div>
      <div
        style="
          background: var(--bg);
          border-radius: var(--r-sm);
          padding: 0.7rem;
          margin-bottom: 0.6rem;
          font-size: 0.78rem;
        "
      >
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.3rem">
          <span style="color: var(--mut); font-weight: 700">Uso de disco</span>
          <span :class="'storage-badge ' + storageClase">
            {{ fmtBytes(storageInfo.uso) }} / {{ fmtBytes(storageInfo.cuota) }}
          </span>
        </div>
        <div class="storage-bar">
          <div
            class="storage-bar-fill"
            :class="storageClase"
            :style="{ width: Math.min(storageInfo.porcentaje, 100) + '%' }"
          ></div>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.35rem">
          <span style="color: var(--mut); font-size: 0.72rem"> {{ storageInfo.porcentaje }}% usado </span>
          <span :class="'storage-badge ' + (storagePersistente ? 'ok' : 'warn')">
            {{ storagePersistente ? '✓ Persistente' : '⚠ Best-effort' }}
          </span>
        </div>
        <div style="font-size: 0.7rem; color: var(--mut); margin-top: 0.5rem; line-height: 1.5">
          <span v-if="esNativoApp">
            Almacenamiento persistente por defecto. Android no borra los datos de apps instaladas.
          </span>
          <span v-else-if="storagePersistente">
            El navegador no borrara tus datos automaticamente. La sincronización en la nube y el backup local
            siguen siendo tu red de seguridad.
          </span>
          <span v-else>
            ⚠ El navegador puede borrar los datos si el dispositivo se queda sin espacio o no abres la app por mucho
            tiempo. <b>Activa la sincronización en la nube</b> para tener un respaldo fuera del dispositivo.
          </span>
        </div>
        <button
          v-if="!esNativoApp && !storagePersistente"
          class="btn ghost"
          style="width: auto; margin: 0.5rem 0 0; padding: 0.4rem 0.8rem; font-size: 0.72rem"
          @click="pedirPersistenciaStorage"
        >
          <icon name="lock" :size="12" :color="mutColor"></icon> Solicitar almacenamiento persistente
        </button>
      </div>

      <div class="set-group">Notificaciones y alertas</div>
      <div
        v-if="!soportaNotif"
        class="info-box"
        style="background: rgb(220 38 38 / 10%); color: var(--bad); border-color: var(--bad); font-size: 0.75rem"
      >
        Este dispositivo no soporta notificaciones del sistema. En iPhone necesitas instalar la app como PWA (Compartir
        > Agregar a pantalla de inicio).
      </div>
      <div class="set-row" v-if="soportaNotif">
        <span class="lbl"><icon name="alert" :size="18"></icon> Activar notificaciones</span>
        <label class="switch">
          <input
            type="checkbox"
            :checked="cfg.notifActivo"
            @change="cfg.notifActivo ? desactivarNotif() : pedirPermisoNotif()"
          />
          <span class="slider"></span>
        </label>
      </div>
      <div class="set-row">
        <span class="lbl"><icon name="calendar" :size="18"></icon> Hora de arqueo</span>
        <input
          v-model="cfg.horaArqueo"
          type="time"
          style="width: auto; margin: 0; padding: 0.3rem 0.5rem"
          @change="guardarCfg"
        />
      </div>
      <button class="btn ghost" style="margin-top: 0.3rem; font-size: 0.78rem" @click="probarNotif">
        Probar notificacion
      </button>

      <div class="set-group">Ventas</div>
      <div class="set-row">
        <span class="lbl"><icon name="dollar" :size="18"></icon> Calculadora de billetes al cobrar</span>
        <label class="switch">
          <input type="checkbox" v-model="cfg.calcBilletesActiva" @change="guardarCfg" />
          <span class="slider"></span>
        </label>
      </div>
      <div style="font-size: 0.72rem; color: var(--mut); margin-top: 0.2rem; margin-bottom: 0.5rem">
        Muestra un panel de denominaciones (10, 20, 50...) para contar el efectivo al cobrar.
      </div>

      <div
        class="set-row"
        style="cursor: pointer; padding-top: 0.6rem; border-top: 1px solid var(--brd); margin-top: 0.6rem"
        @click="ui.umbralesAbierto = !ui.umbralesAbierto"
      >
        <span class="lbl"><icon name="alert" :size="18"></icon> Alertas y umbrales avanzados</span>
        <icon
          name="chevron"
          :size="14"
          :color="mutColor"
          :style="ui.umbralesAbierto ? 'transform:rotate(180deg)' : ''"
        ></icon>
      </div>
      <div v-if="ui.umbralesAbierto">
        <div class="set-row">
          <span class="lbl">Cierre pendiente (dias)</span>
          <input
            v-model.number="cfg.umbralDiasCierre"
            type="number"
            min="1"
            style="width: 5rem; margin: 0; padding: 0.3rem 0.5rem"
            @change="guardarCfg"
          />
        </div>
        <div class="set-row">
          <span class="lbl">Mermas por semana</span>
          <input
            v-model.number="cfg.umbralMermasSemana"
            type="number"
            min="1"
            style="width: 5rem; margin: 0; padding: 0.3rem 0.5rem"
            @change="guardarCfg"
          />
        </div>
        <div class="set-row">
          <span class="lbl">Faltantes por mes</span>
          <input
            v-model.number="cfg.umbralFaltantesMes"
            type="number"
            min="1"
            style="width: 5rem; margin: 0; padding: 0.3rem 0.5rem"
            @change="guardarCfg"
          />
        </div>
        <div class="set-row">
          <span class="lbl">Sobrantes por mes</span>
          <input
            v-model.number="cfg.umbralSobrantesMes"
            type="number"
            min="1"
            style="width: 5rem; margin: 0; padding: 0.3rem 0.5rem"
            @change="guardarCfg"
          />
        </div>
        <div class="set-row">
          <span class="lbl">Dias sin backup</span>
          <input
            v-model.number="cfg.umbralBackupDias"
            type="number"
            min="1"
            style="width: 5rem; margin: 0; padding: 0.3rem 0.5rem"
            @change="guardarCfg"
          />
        </div>
        <div class="set-row">
          <span class="lbl">Dias sin movimiento</span>
          <input
            v-model.number="cfg.umbralSinMovimientoDias"
            type="number"
            min="7"
            style="width: 5rem; margin: 0; padding: 0.3rem 0.5rem"
            @change="guardarCfg"
          />
        </div>
        <div class="set-row">
          <span class="lbl">Descuento maximo (%)</span>
          <input
            v-model.number="cfg.umbralDescuentoPct"
            type="number"
            min="0"
            max="100"
            style="width: 5rem; margin: 0; padding: 0.3rem 0.5rem"
            @change="guardarCfg"
          />
        </div>
        <div class="set-row">
          <span class="lbl">Stock minimo default</span>
          <input
            v-model.number="cfg.stockMinDefault"
            type="number"
            min="0"
            style="width: 5rem; margin: 0; padding: 0.3rem 0.5rem"
            @change="guardarCfg"
          />
        </div>
      </div>

      <div class="set-group" style="color: var(--bad)">Zona peligrosa</div>
      <button class="btn bad" @click="backup.borrarTodo()">
        <icon name="trash" :size="16" color="#fff"></icon> Borrar TODOS los datos
      </button>
      <div style="font-size: 0.72rem; color: var(--mut); margin-top: 0.2rem; margin-bottom: 0.5rem">
        Elimina permanentemente productos, ventas, compras, gastos, socios, asientos, pasivos, etc. No se puede
        deshacer.
      </div>

      <div
        v-if="otraPestana"
        class="set-row"
        style="
          background: rgb(245 158 11 / 12%);
          border: 1px solid var(--warn);
          border-radius: 8px;
          padding: 0.6rem;
          margin: 0.5rem 0;
        "
      >
        <span class="lbl" style="color: var(--warn-d)"
          ><icon name="alert" :size="18"></icon> Otra pestaña de Tienda Pro esta abierta. Cierrala para evitar
          conflictos de datos.</span
        >
      </div>
      <div class="set-group">Avanzado</div>
      <div class="set-row">
        <span class="lbl"><icon name="alert" :size="18"></icon> Estado del sistema</span>
        <button
          class="btn ghost"
          style="width: auto; margin: 0; padding: 0.4rem 0.7rem; font-size: 0.72rem"
          @click="ui.statusPanelAbierto = true"
        >
          Abrir
        </button>
      </div>
      <div class="set-row">
        <span class="lbl"><icon name="package" :size="18"></icon> Respaldo automático</span>
        <button
          class="btn ghost"
          style="width: auto; margin: 0; padding: 0.4rem 0.7rem; font-size: 0.72rem"
          @click="ui.backupPanelAbierto = true"
        >
          Abrir
        </button>
      </div>

      <div class="set-row" style="padding-top: 0.6rem; border-top: 1px solid var(--brd); margin-top: 0.6rem">
        <span class="lbl"><icon name="info" :size="18"></icon> Informacion</span>
      </div>
      <div style="font-size: 0.78rem; color: var(--mut)">
        Versión 6.0 · Datos locales<br />
        {{ productosStore.productos.length }} productos · {{ ventasStore.ventas.length }} ventas ·
        {{ comprasStore.compras.length }} compras
      </div>

      <button class="btn ghost" style="margin-top: 0.8rem" @click="ui.ajustesAbierto = false">Cerrar</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue';
import { Capacitor } from '@capacitor/core';
import { fmtFH } from '../utils/formato';
import { useConfigStore } from '../stores/useConfigStore';
import { useProductosStore } from '../stores/useProductosStore';
import { useVentasStore } from '../stores/useVentasStore';
import { useComprasStore } from '../stores/useComprasStore';
import { useUIStore } from '../stores/useUIStore';
import { useBackupStore } from '../stores/useBackupStore';
import { useNotificacionesStore } from '../stores/useNotificacionesStore';
import { useStorageInfo } from '../composables/useStorageInfo';

defineOptions({ name: 'AjustesModal' });

defineProps({
  otraPestana: { type: Boolean, default: false },
});

const configStore = useConfigStore();
const ui = useUIStore();
const backup = useBackupStore();
const notificaciones = useNotificacionesStore();
const productosStore = useProductosStore();
const ventasStore = useVentasStore();
const comprasStore = useComprasStore();

const cfg = configStore.cfg;

// ===== PIN: el input escribe un PIN NUEVO, nunca el hash guardado =====
const pinNuevo = ref('');
const pinGuardado = computed(() => Boolean(cfg.pin));
async function guardarPinNuevo() {
  const v = pinNuevo.value.trim();
  // vacío = conservar el PIN actual (no tocar cfg.pin)
  if (!v) return;
  cfg.pin = v;
  pinNuevo.value = '';
  await configStore.guardarCfg(); // hashea antes de persistir
}
const mutColor = computed(() => (configStore.tema === 'dark' ? '#94a3b8' : '#6b7280'));
const esNativoApp = computed(() => Capacitor.isNativePlatform());
const soportaNotif = computed(() => notificaciones.soportaNotif);

// ===== ALMACENAMIENTO =====
const { storagePersistente, storageInfo, pedirPersistenciaStorage, actualizarInfoStorage, fmtBytes, storageClase } =
  useStorageInfo();

onMounted(actualizarInfoStorage);
watch(
  () => ui.ajustesAbierto,
  (v) => {
    if (v) actualizarInfoStorage();
  }
);

// ===== CONFIG =====
function guardarCfg() {
  return configStore.guardarCfg();
}

function cambiarEscalaFont(delta: number) {
  const opciones = [1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.75, 2];
  let idx = opciones.indexOf(Number(cfg.fontScale));
  if (idx < 0) {
    idx = opciones.reduce(
      (best, v, i) =>
        Math.abs(v - Number(cfg.fontScale)) < Math.abs(opciones[best] - Number(cfg.fontScale)) ? i : best,
      0
    );
  }
  idx += delta;
  if (idx < 0) idx = 0;
  if (idx >= opciones.length) idx = opciones.length - 1;
  cfg.fontScale = opciones[idx];
  aplicarEscalaFont();
  guardarCfg();
}

function aplicarEscalaFont() {
  const val = Number(cfg.fontScale) || 1;
  try {
    document.documentElement.style.setProperty('--font-scale', String(val));
  } catch {}
}

// ===== NOTIFICACIONES =====
const { pedirPermisoNotif, desactivarNotif, probarNotif } = notificaciones;

</script>
