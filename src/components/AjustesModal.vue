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
        <span class="lbl"><icon name="calculator" :size="18"></icon> Boton de calculadora</span>
        <label class="switch">
          <input
            type="checkbox"
            :checked="configStore.calcActiva !== false"
            @change="
              cfg.calcActiva = $event.target.checked;
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
              cfg.busquedaGlobalActiva = $event.target.checked;
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
        <input v-model="cfg.pin" type="password" placeholder="PIN (4 dígitos)" maxlength="6" @change="guardarCfg" />
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
      <input type="file" id="impFile" accept=".json" style="display: none" @change="backup.onImportFile" />
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
            El navegador no borrara tus datos automaticamente. Tus backups de Telegram siguen siendo tu red de
            seguridad.
          </span>
          <span v-else>
            ⚠ El navegador puede borrar los datos si el dispositivo se queda sin espacio o no abres la app por mucho
            tiempo. <b>Activa los backups de Telegram</b> para tener un respaldo.
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
        style="background: rgba(220, 38, 38, 0.1); color: var(--bad); border-color: var(--bad); font-size: 0.75rem"
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

      <div class="set-group">Backup en Telegram</div>

      <div v-if="!cfg.tgChatId">
        <div class="info-box" style="font-size: 0.75rem">
          Abre Telegram, busca <b>@mibot_backup_bot</b> y envíale <b>/start</b>. La app lo detecta automáticamente.
        </div>
        <div
          v-if="tg.tgEstado === 'esperando-start' || tg.tgEstado === 'sin-config'"
          class="info-box"
          style="background: rgba(59, 130, 246, 0.08); border-color: var(--pri); font-size: 0.78rem"
        >
          <b>Esperando conexión...</b>
          <div style="margin-top: 0.5rem; display: flex; align-items: center; gap: 0.4rem">
            <div class="tg-loading-dot"></div>
            <span style="font-size: 0.72rem; color: var(--mut)">Buscando chat...</span>
          </div>
        </div>
        <div
          v-else-if="tg.tgEstado === 'error'"
          class="info-box"
          style="background: rgba(239, 68, 68, 0.1); color: var(--bad); border-color: var(--bad); font-size: 0.78rem"
        >
          Error de conexión. Verifica que el bot esté activo.
        </div>
        <button class="btn ghost" style="font-size: 0.72rem" @click="tg.tgAutoDetectarChat">
          <icon name="refresh" :size="14" :color="mutColor"></icon> Buscar ahora
        </button>
      </div>

      <div v-else-if="!cfg.tiendaConfigurada">
        <div class="tg-conectado" style="background: rgba(59, 130, 246, 0.06); border-color: rgba(59, 130, 246, 0.2)">
          <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.6rem">
            <div class="tg-dot" style="background: #3b82f6"></div>
            <span style="font-size: 0.8rem"><b>Chat conectado:</b> {{ cfg.tgNombre }}</span>
          </div>
          <div style="font-size: 0.72rem; color: var(--mut); line-height: 1.6">
            Falta asignarle un nombre único a esta tienda. Con el nombre y una contraseña podrás guardar backups
            identificados y recuperarlos desde cualquier dispositivo.
          </div>
        </div>

        <div style="font-size: 0.78rem; font-weight: 800; margin: 0.7rem 0 0.4rem">Registrar nueva tienda</div>
        <input
          v-model="tg.mtForm.nombre"
          type="text"
          placeholder="Nombre único (ej: tienda-central)"
          maxlength="40"
          style="font-size: 14px"
        />
        <div
          v-if="tg.mtCheck.estado === 'ok'"
          class="info-box"
          style="background: rgba(34, 197, 94, 0.1); color: var(--ok-d); border-color: var(--ok); font-size: 0.72rem"
        >
          ✓ Nombre disponible
        </div>
        <div
          v-else-if="tg.mtCheck.estado === 'ocupado' || tg.mtCheck.estado === 'error'"
          class="info-box"
          style="background: rgba(239, 68, 68, 0.1); color: var(--bad); border-color: var(--bad); font-size: 0.72rem"
        >
          ✗ {{ tg.mtCheck.motivo || 'Nombre no disponible' }}
        </div>
        <button
          class="btn ghost"
          style="font-size: 0.72rem; padding: 0.5rem"
          @click="tg.verificarNombreTienda"
          :disabled="tg.mtCheck.verificando || tg.mtForm.nombre.length < 3"
        >
          {{ tg.mtCheck.verificando ? 'Verificando...' : 'Verificar disponibilidad' }}
        </button>

        <div style="font-size: 0.78rem; font-weight: 800; margin: 1rem 0 0.4rem">Contraseña de respaldo</div>
        <input v-model="tg.mtForm.password" type="password" placeholder="Mínimo 6 caracteres" style="font-size: 14px" />
        <input v-model="tg.mtForm.password2" type="password" placeholder="Repetir contraseña" style="font-size: 14px" />
        <div
          v-if="tg.mtForm.password && tg.mtForm.password.length < 6"
          class="info-box"
          style="background: rgba(239, 68, 68, 0.1); color: var(--bad); border-color: var(--bad); font-size: 0.72rem"
        >
          La contraseña es muy corta
        </div>
        <div
          v-else-if="tg.mtForm.password && tg.mtForm.password2 && tg.mtForm.password !== tg.mtForm.password2"
          class="info-box"
          style="background: rgba(239, 68, 68, 0.1); color: var(--bad); border-color: var(--bad); font-size: 0.72rem"
        >
          Las contraseñas no coinciden
        </div>

        <div
          class="info-box"
          style="
            background: rgba(245, 158, 11, 0.1);
            color: var(--warn-d);
            border-color: var(--warn);
            font-size: 0.72rem;
            margin-top: 0.4rem;
          "
        >
          ⚠ <b>Guarda esta contraseña.</b> Si pierdes el celular, la necesitarás para recuperar tus backups.
        </div>

        <button class="btn pri" style="margin-top: 0.5rem" :disabled="!tg.puedoRegistrar" @click="tg.registrarTienda">
          {{ tg.mtProcesando ? 'Registrando...' : 'Registrar Tienda' }}
        </button>

        <div style="font-size: 0.72rem; color: var(--mut); text-align: center; margin-top: 0.8rem">
          ¿Ya tienes un nombre registrado?
          <button class="link-btn" @click="tg.mtForm.modo = tg.mtForm.modo === 'login' ? 'register' : 'login'">
            {{ tg.mtForm.modo === 'login' ? 'Registrar nueva' : 'Iniciar sesión' }}
          </button>
        </div>

        <div
          v-if="tg.mtForm.modo === 'login'"
          style="margin-top: 0.8rem; padding-top: 0.8rem; border-top: 1px dashed var(--brd)"
        >
          <div style="font-size: 0.78rem; font-weight: 800; margin-bottom: 0.4rem">Iniciar sesión</div>
          <input v-model="tg.mtForm.loginNombre" type="text" placeholder="Nombre de tienda" style="font-size: 14px" />
          <input v-model="tg.mtForm.loginPassword" type="password" placeholder="Contraseña" style="font-size: 14px" />
          <button
            class="btn ok"
            @click="tg.loginTienda"
            :disabled="!tg.mtForm.loginNombre || !tg.mtForm.loginPassword || tg.mtProcesando"
          >
            {{ tg.mtProcesando ? 'Entrando...' : 'Entrar' }}
          </button>
        </div>
      </div>

      <div v-else>
        <div class="tg-conectado">
          <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem">
            <div class="tg-dot"></div>
            <span style="font-size: 0.8rem"><b>Tienda:</b> {{ cfg.nombreTienda }}</span>
          </div>
          <div style="font-size: 0.72rem; color: var(--mut); margin-bottom: 0.6rem">
            Chat: {{ cfg.tgNombre }} · Último backup: {{ cfg.tgUltimoBackup ? fmtFH(cfg.tgUltimoBackup) : 'nunca' }}
            <span v-if="tg.tgColaPendiente > 0" style="color: var(--warn); font-weight: 700">
              · {{ tg.tgColaPendiente }} en cola</span
            >
          </div>

          <div v-if="tg.tgProgreso" class="tg-progreso">
            <div class="tg-spinner"></div>
            <span>{{ tg.tgProgreso }}</span>
          </div>

          <div class="set-row">
            <span class="lbl" style="font-size: 0.78rem">Backup automático (cada 24h)</span>
            <label class="switch">
              <input type="checkbox" v-model="cfg.tgAutoBackup" @change="guardarCfg" />
              <span class="slider"></span>
            </label>
          </div>

          <div class="grid2" style="margin-top: 0.6rem">
            <button
              class="btn pri"
              style="margin: 0; font-size: 0.75rem; padding: 0.6rem"
              :disabled="tg.tgCargando"
              @click="hacerBackupAhora"
            >
              <icon name="upload" :size="14" color="#fff"></icon> Backup ahora
            </button>
            <button
              class="btn ghost"
              style="margin: 0; font-size: 0.75rem; padding: 0.6rem"
              :disabled="tg.tgCargando"
              @click="tg.tgListar"
            >
              <icon name="refresh" :size="14" :color="mutColor"></icon> Ver backups
            </button>
          </div>
          <button
            v-if="tg.tgColaPendiente > 0"
            class="btn warn"
            style="margin-top: 0.5rem; font-size: 0.72rem"
            @click="tg.tgProcesarCola"
          >
            Procesar {{ tg.tgColaPendiente }} en cola
          </button>
          <button class="btn ghost" style="margin-top: 0.5rem; font-size: 0.72rem" @click="tg.tgDesconectar">
            Desconectar Telegram
          </button>
        </div>

        <div v-if="tg.tgBackups.length" class="tg-lista">
          <div style="font-size: 0.75rem; font-weight: 800; margin-bottom: 0.4rem; color: var(--pri)">
            Backups disponibles
          </div>
          <div v-for="bk in tg.tgBackups.slice(0, 10)" :key="bk.messageId" class="tg-bk">
            <div style="flex: 1; min-width: 0">
              <div style="font-size: 0.78rem; font-weight: 700">{{ fmtFH(bk.fecha) }}</div>
              <div style="font-size: 0.68rem; color: var(--mut)">{{ (bk.fileSize / 1024).toFixed(1) }} KB</div>
            </div>
            <button class="icon-btn ok" @click="tg.tgRestaurar(bk, backup.importarData)" aria-label="Restaurar">
              <icon name="download" :size="14" color="#16a34a"></icon>
            </button>
            <button class="icon-btn bad" @click="tg.tgEliminar(bk)" aria-label="Eliminar">
              <icon name="trash" :size="14" color="#dc2626"></icon>
            </button>
          </div>
        </div>
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
          background: rgba(245, 158, 11, 0.12);
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

<script setup>
import { computed, watch, onMounted } from 'vue';
import { Capacitor } from '@capacitor/core';
import { fmtFH } from '../db.js';
import { useConfigStore } from '../stores/useConfigStore.js';
import { useProductosStore } from '../stores/useProductosStore.js';
import { useVentasStore } from '../stores/useVentasStore.js';
import { useComprasStore } from '../stores/useComprasStore.js';
import { useUIStore } from '../stores/useUIStore.js';
import { useTelegramStore } from '../stores/useTelegramStore.js';
import { useBackupStore } from '../stores/useBackupStore.js';
import { useNotificacionesStore } from '../stores/useNotificacionesStore.js';
import { useInsightsStore } from '../stores/useInsightsStore.js';
import { useStorageInfo } from '../composables/useStorageInfo.js';
import { datosDeStores } from '../stores/exportar.js';

defineOptions({ name: 'AjustesModal' });

const props = defineProps({
  otraPestana: { type: Boolean, default: false },
});

const configStore = useConfigStore();
const ui = useUIStore();
const tg = useTelegramStore();
const backup = useBackupStore();
const notificaciones = useNotificacionesStore();
const productosStore = useProductosStore();
const ventasStore = useVentasStore();
const comprasStore = useComprasStore();

const cfg = configStore.cfg;
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

function cambiarEscalaFont(delta) {
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
  } catch (e) {}
}

// ===== NOTIFICACIONES =====
const { pedirPermisoNotif, desactivarNotif, probarNotif } = notificaciones;

// ===== TELEGRAM =====
async function hacerBackupAhora() {
  await tg.tgBackupAhora(datosDeStores());
}
</script>
