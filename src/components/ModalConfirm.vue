<template>
  <AlertDialogRoot :open="activo" @update:open="onOpenChange">
    <AlertDialogPortal>
      <AlertDialogOverlay class="modal no-print" />
      <AlertDialogContent class="modal-box">
        <AlertDialogTitle class="modal-title">{{ titulo }}</AlertDialogTitle>
        <AlertDialogDescription as="p" style="margin-bottom: 1rem; font-size: 0.9rem; white-space: pre-line">
          {{ msg }}
        </AlertDialogDescription>
        <div class="grid2">
          <button class="btn ok" @click="$emit('ok')">Confirmar</button>
          <button class="btn ghost" @click="$emit('cancelar')">Cancelar</button>
        </div>
      </AlertDialogContent>
    </AlertDialogPortal>
  </AlertDialogRoot>
</template>

<script setup lang="ts">
import {
  AlertDialogRoot,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
} from 'reka-ui';

defineProps({
  activo: Boolean,
  titulo: { type: String, default: '' },
  msg: { type: String, default: '' },
});

const emit = defineEmits(['ok', 'cancelar']);

// reka-ui cierra el dialogo con Escape/click-fuera -> lo tratamos como cancelar
function onOpenChange(open: boolean) {
  if (!open) emit('cancelar');
}
</script>
