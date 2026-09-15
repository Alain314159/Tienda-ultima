<template>
  <div>
    <div v-if="abierto" class="overlay no-print" @click="$emit('cerrar')"></div>
    <div v-if="abierto" class="sheet no-print">
      <div class="handle"></div>

      <div class="sheet-group">Operaciones</div>
      <div class="sheet-grid">
        <button class="sheet-btn" :class="{ activo: sec === 'productos' }" @click="$emit('ir', 'productos')">
          <icon name="tag" :size="22"></icon>Productos
        </button>
        <button class="sheet-btn" :class="{ activo: sec === 'caja' }" @click="$emit('ir', 'caja')">
          <icon name="wallet" :size="22"></icon>Caja
        </button>
        <button class="sheet-btn" :class="{ activo: sec === 'gastos' }" @click="$emit('ir', 'gastos')">
          <icon name="dollar" :size="22"></icon>Gastos
        </button>
      </div>

      <div class="sheet-group">Finanzas y reportes</div>
      <div class="sheet-grid">
        <button class="sheet-btn" :class="{ activo: sec === 'contabilidad' }" @click="$emit('ir', 'contabilidad')">
          <icon name="chart" :size="22"></icon>Contabilidad
        </button>
        <button class="sheet-btn" :class="{ activo: sec === 'auditoria' }" @click="$emit('ir', 'auditoria')">
          <icon name="check" :size="22"></icon>Auditoria
        </button>
        <button class="sheet-btn" :class="{ activo: sec === 'socios' }" @click="$emit('ir', 'socios')">
          <icon name="users" :size="22"></icon>Socios
        </button>
        <button class="sheet-btn" :class="{ activo: sec === 'reportes' }" @click="$emit('ir', 'reportes')">
          <icon name="file" :size="22"></icon>Reportes
        </button>
      </div>

      <div class="sheet-group">Sistema</div>
      <div class="sheet-grid">
        <button class="sheet-btn" style="grid-column:1/-1" @click="$emit('abrir-ajustes')">
          <icon name="settings" :size="22"></icon>Ajustes
        </button>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'SheetMas',
  props: {
    abierto: { type: Boolean, default: false },
    sec: { type: String, required: true }
  },
  emits: ['cerrar', 'ir', 'abrir-ajustes']
};
</script>
