<template>
  <svg
    viewBox="0 0 24 24"
    fill="none"
    :stroke="color"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    :style="{ width: sRem, height: sRem, flexShrink: 0, verticalAlign: 'middle', display: 'inline-block' }"
    v-html="path"
  ></svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { PATHS } from '../icons';

defineOptions({ name: 'AppIcon' });

const props = defineProps({
  name: { type: String, default: '' },
  size: { type: [Number, String], default: 22 },
  color: { type: String, default: '#2196F3' },
});

const sRem = computed(() => (parseInt(String(props.size)) || 22) / 15 + 'rem');
const path = computed(() => PATHS[props.name] || '');
</script>
