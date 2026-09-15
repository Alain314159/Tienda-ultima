<template>
  <div class="toast" :class="[toast.type, { show: toast.show }]">
    <icon v-if="icono" :name="icono" :size="16" :color="'#fff'"></icon>
    <span>{{ toast.msg }}</span>
    <button v-if="toast.accionTxt" @click="$emit('accion')">{{ toast.accionTxt }}</button>
  </div>
</template>

<script>
export default {
  name: 'AppToast',
  props: { toast: { type: Object, required: true } },
  emits: ['accion'],
  computed: {
    icono() {
      const t = this.toast.type;
      if (t === 'ok') return 'check';
      if (t === 'bad') return 'alert';
      if (t === 'warn') return 'alert';
      return 'check';
    }
  }
};
</script>
