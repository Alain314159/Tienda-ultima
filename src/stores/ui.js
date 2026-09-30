import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useUiStore = defineStore('ui', () => {
  const seccion = ref('dashboard');
  const ajustesAbierto = ref(false);
  const masAbierto = ref(false);
  const calcAbierto = ref(false);
  const backupPanelAbierto = ref(false);
  const statusPanelAbierto = ref(false);
  const busquedaGlobalAbierta = ref(false);
  const busqVenta = ref('');
  const busqCompra = ref('');
  const busqProd = ref('');
  const busqHist = ref('');
  const cargando = ref(true);

  function ir(sec) {
    seccion.value = sec;
    masAbierto.value = false;
    try { history.pushState({ sec }, '', '#' + sec); } catch (e) {}
  }

  function cerrarTodo() {
    ajustesAbierto.value = false;
    masAbierto.value = false;
    calcAbierto.value = false;
    backupPanelAbierto.value = false;
    statusPanelAbierto.value = false;
    busquedaGlobalAbierta.value = false;
  }

  return {
    seccion, ajustesAbierto, masAbierto, calcAbierto,
    backupPanelAbierto, statusPanelAbierto, busquedaGlobalAbierta,
    busqVenta, busqCompra, busqProd, busqHist, cargando,
    ir, cerrarTodo
  };
});
