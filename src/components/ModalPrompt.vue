<template>
  <DialogRoot :open="activo" @update:open="onOpenChange">
    <DialogPortal>
      <DialogOverlay class="modal no-print" />
      <DialogContent class="modal-box">
        <DialogTitle class="modal-title">{{ titulo }}</DialogTitle>
        <DialogDescription as="p" style="margin-bottom: 0.8rem; font-size: 0.9rem">
          {{ msg }}
        </DialogDescription>
        <!-- 5.3: etiqueta asociada + teclado numérico al pedir el PIN
             (inputmode numeric) y autocomplete current-password para que el
             gestor de contraseñas pueda rellenarlo. -->
        <label class="fld-label" for="modal-prompt-input">{{ titulo }}</label>
        <input
          id="modal-prompt-input"
          :value="value"
          @input="$emit('update:value', ($event.target as HTMLInputElement).value)"
          :type="type || 'text'"
          :placeholder="placeholder"
          :inputmode="esPin ? 'numeric' : undefined"
          :autocomplete="type === 'password' ? 'current-password' : 'off'"
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
import { computed } from 'vue';
import { DialogRoot, DialogPortal, DialogOverlay, DialogContent, DialogTitle, DialogDescription } from 'reka-ui';

const props = defineProps({
  activo: Boolean,
  titulo: { type: String, default: '' },
  msg: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  type: { type: String, default: 'text' },
  value: { type: String, default: '' },
});

const emit = defineEmits(['update:value', 'ok', 'cancelar']);

/** El PIN es el único prompt con este título (lo pone pedirPin en
 * useUIStore): solo a él le toca el teclado numérico. */
const esPin = computed(() => props.titulo === 'PIN de seguridad');

function onOpenChange(open: boolean) {
  if (!open) emit('cancelar');
}
</script>
