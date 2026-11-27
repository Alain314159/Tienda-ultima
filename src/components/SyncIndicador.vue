<script setup lang="ts">
/**
 * Indicador de estado de la sincronización en la nube, junto al nombre
 * de la tienda en el header. Punto de color + texto corto; al tocarlo
 * abre la cuenta nube.
 *
 * Estados (sin conexión manda sobre todos, porque sin red no hay sync):
 * - Sin conexión (rojo): el navegador está offline.
 * - Al día (verde): sesión iniciada y última sync correcta reciente.
 * - Sincronizando… (amarillo): hay una vuelta en curso.
 * - Error de sync / Sin sincronizar (rojo): la última vuelta falló, o
 *   lleva más de 10 minutos sin una sync correcta.
 * - Sin sesión (gris): no hay cuenta de Google conectada.
 */
import { computed } from 'vue';
import { useNubeStore } from '../stores/useNubeStore';

const props = defineProps({ online: { type: Boolean, default: true } });
const emit = defineEmits(['abrir-cuenta']);

const nube = useNubeStore();

const estado = computed(() => {
  if (!props.online) return { clave: 'sin-conexion', texto: 'Sin conexión', clase: 'off' };
  switch (nube.estado) {
    case 'al-dia':
      return { clave: 'al-dia', texto: 'Al día', clase: 'ok' };
    case 'sincronizando':
      return { clave: 'sincronizando', texto: 'Sincronizando…', clase: 'sync' };
    case 'error':
      return { clave: 'error', texto: 'Error de sync', clase: 'off' };
    case 'sin-sincronizar':
      return { clave: 'sin-sincronizar', texto: 'Sin sincronizar', clase: 'off' };
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
