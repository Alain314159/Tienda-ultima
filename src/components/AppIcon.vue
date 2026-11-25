<template>
  <svg viewBox="0 0 24 24" fill="none"
    :stroke="color" stroke-width="2"
    stroke-linecap="round" stroke-linejoin="round"
    :style="{ width: sRem, height: sRem, flexShrink: 0, verticalAlign: 'middle', display: 'inline-block' }"
    v-html="path"></svg>
</template>

<script>
import { PATHS } from '../icons.js';

export default {
  name: 'AppIcon',
  props: {
    name: String,
    size: { type: [Number, String], default: 22 },
    color: { type: String, default: '#2196F3' }
  },
  computed: {
    sRem() {
      const n = parseInt(this.size) || 22;
      return (n / 15) + 'rem';
    },
    path() { return PATHS[this.name] || ''; }
  }
};
</script>
