<script setup lang="ts">
/**
 * Indicador de estado de la sincronización en la nube, junto al nombre
 * de la tienda en el header. Punto de color + texto corto; al tocarlo
 * abre la cuenta nube.
 *
 * Rojo SOLO ante un error real de sync (3.3). «Sin conexión» y «sin
 * sincronizar» son estados neutros (ámbar/gris, sin alarma): con internet
 * intermitente lo normal es pasar ratos sin sync y los datos viven en el
 * teléfono; el rojo permanente enseñaba a ignorarlo justo cuando apareciera
 * un error real.
 *
 * Estados:
 * - Sin conexión (ámbar): el navegador está offline.
 * - Al día (verde): sesión iniciada y última sync correcta reciente.
 * - Sincronizando… (amarillo): hay una vuelta en curso.
 * - Error de sync (rojo): la última vuelta falló de verdad.
 * - Sin sincronizar (ámbar): sesión iniciada pero sin sync correcta
 *   reciente (más de un día) o aún ninguna.
 * - Reconectando… (ámbar): la sesión no se pudo comprobar (sin red al
 *   arrancar); se reintenta sola, sin cerrar la sesión.
 * - Sin sesión (gris): no hay cuenta de Google conectada.
 */
import { computed } from 'vue';
import { useNubeStore } from '../stores/useNubeStore';

const props = defineProps({ online: { type: Boolean, default: true } });
const emit = defineEmits(['abrir-cuenta']);

const nube = useNubeStore();

const estado = computed(() => {
  if (!props.online) return { clave: 'sin-conexion', texto: 'Sin conexión', clase: 'warn' };
  switch (nube.estado) {
    case 'al-dia':
      return { clave: 'al-dia', texto: 'Al día', clase: 'ok' };
    case 'sincronizando':
      return { clave: 'sincronizando', texto: 'Sincronizando…', clase: 'sync' };
    case 'error':
      return { clave: 'error', texto: 'Error de sync', clase: 'off' };
    case 'sin-sincronizar':
      return { clave: 'sin-sincronizar', texto: 'Sin sincronizar', clase: 'warn' };
    case 'sesion-pendiente':
      return { clave: 'sesion-pendiente', texto: 'Reconectando…', clase: 'warn' };
    default:
      return { clave: 'sin-sesion', texto: 'Sin sesión', clase: 'idle' };
  }
});
</script>

<template>
  <button
    type="button"
    class="sync-ind"
    :class="'sync-' + estado.clase"
    :data-estado="estado.clave"
    :aria-label="'Sincronización: ' + estado.texto + '. Abrir cuenta nube.'"
    @click="emit('abrir-cuenta')"
  >
    <span class="sync-dot" aria-hidden="true"></span>
    <span class="sync-txt">{{ estado.texto }}</span>
  </button>
</template>

<style scoped>
/* Estado neutro de aviso (sin conexión / sin sync reciente / reconectando):
 * ámbar, sin la alarma del rojo (.sync-off de styles.css, solo para error). */
.sync-warn {
  background: rgb(245 158 11 / 35%);
}

.sync-warn .sync-dot {
  background: #fbbf24;
}
</style>
