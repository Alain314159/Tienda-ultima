<template>
  <div class="skeleton-wrap">
    <div v-for="i in rows" :key="i" class="skeleton-line" :style="{ width: ancho(i) + '%' }"></div>
  </div>
</template>

<script>
export default {
  name: 'SkeletonLoader',
  props: { rows: { type: Number, default: 5 } },
  methods: {
    ancho(i) {
      const patrones = [100, 85, 90, 70, 95, 80];
      return patrones[(i - 1) % patrones.length];
    }
  }
};
</script>
