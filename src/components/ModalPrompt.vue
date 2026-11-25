<template>
  <DialogRoot :open="activo" @update:open="onOpenChange">
    <DialogPortal>
      <DialogOverlay class="modal no-print" />
      <DialogContent class="modal-box">
        <DialogTitle class="modal-title">{{ titulo }}</DialogTitle>
        <DialogDescription as="p" style="margin-bottom: 0.8rem; font-size: 0.9rem">
          {{ msg }}
        </DialogDescription>
        <input
          :value="value"
          @input="$emit('update:value', ($event.target as HTMLInputElement).value)"
          :type="type || 'text'"
          :placeholder="placeholder"
          @keyup.enter="$emit('ok', value)"
          autofocus
        />
        <div class="grid2" style="margin-top: 0.5rem">
          <button class="btn ok" @click="$emit('ok', value)">Aceptar</button>
          <button class="btn ghost" @click="$emit('cancelar')">Cancelar</button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<script setup lang="ts">
import { DialogRoot, DialogPortal, DialogOverlay, DialogContent, DialogTitle, DialogDescription } from 'reka-ui';

defineProps({
  activo: Boolean,
  titulo: { type: String, default: '' },
  msg: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  type: { type: String, default: 'text' },
  value: { type: String, default: '' },
});

const emit = defineEmits(['update:value', 'ok', 'cancelar']);

function onOpenChange(open: boolean) {
  if (!open) emit('cancelar');
}
</script>
