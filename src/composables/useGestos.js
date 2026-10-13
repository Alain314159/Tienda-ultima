/**
 * Composable de gestos táctiles: swipe horizontal entre secciones
 * y pull-to-refresh. Se crea una sola vez en App.vue (shell).
 */
import { ref } from 'vue';
import { useUIStore } from '../stores/useUIStore.js';
import { recargarTodoStores } from '../stores/recarga.js';
import { toastMsg } from '../utils/toast.js';

// Secciones navegables con swipe horizontal
const SECCIONES_SWIPE = ['dashboard', 'ventas', 'compras', 'inventario'];

/**
 * @param {import('vue-router').Router} router
 * @param {() => string} secActual getter de la sección/ruta actual
 */
export function useGestos(router, secActual) {
  const ui = useUIStore();

  const pullDist = ref(0);
  const refrescando = ref(false);

  let _pullStartY = 0;
  let _pulling = false;
  let _swipeStartX = null;
  let _swipeStartY = null;
  let _swipeStartTime = 0;
  let _swipeActivo = false;

  async function onPullRefresh() {
    if (refrescando.value) return;
    refrescando.value = true;
    try {
      await recargarTodoStores();
    } catch (e) {}
    setTimeout(() => {
      refrescando.value = false;
      pullDist.value = 0;
    }, 500);
    toastMsg('Datos actualizados');
  }

  function onTouchStart(e) {
    const hayModal =
      ui.ajustesAbierto ||
      ui.masAbierto ||
      ui.cobroAbierto ||
      ui.confirm.activo ||
      ui.prompt.activo ||
      ui.retiroAbierto ||
      ui.aporteAbierto ||
      ui.shareSheetAbierto;

    const target = e.target;
    const esInput =
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable);

    if (hayModal || esInput) {
      _swipeStartX = null;
      return;
    }

    const t = e.touches[0];

    if (window.scrollY <= 0) {
      _pullStartY = t.clientY;
      _pulling = true;
    }

    _swipeStartX = t.clientX;
    _swipeStartY = t.clientY;
    _swipeStartTime = Date.now();
    _swipeActivo = false;
  }

  function onTouchMove(e) {
    const t = e.touches[0];

    if (_swipeStartX !== null) {
      const dx = t.clientX - _swipeStartX;
      const dy = t.clientY - _swipeStartY;
      if (Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        _swipeActivo = true;
        _pulling = false;
        pullDist.value = 0;
      }
    }

    if (_pulling && !_swipeActivo) {
      const dy = t.clientY - _pullStartY;
      if (dy > 0) pullDist.value = Math.min(dy, 90);
    }
  }

  function onTouchEnd(e) {
    if (_swipeActivo && _swipeStartX !== null && e.changedTouches && e.changedTouches.length > 0) {
      const t = e.changedTouches[0];
      const dx = t.clientX - _swipeStartX;
      const tiempo = Date.now() - _swipeStartTime;
      const umbral = 80;

      if (Math.abs(dx) > umbral && tiempo < 1000) {
        if (dx < 0) irSeccionSiguiente();
        else irSeccionAnterior();
      }
    }

    if (_pulling) {
      if (pullDist.value >= 70) onPullRefresh();
      _pulling = false;
      setTimeout(() => {
        pullDist.value = 0;
      }, 300);
    }

    _swipeStartX = null;
    _swipeStartY = null;
    _swipeStartTime = 0;
    _swipeActivo = false;
  }

  function irSeccionSiguiente() {
    const idx = SECCIONES_SWIPE.indexOf(secActual());
    if (idx < 0 || idx >= SECCIONES_SWIPE.length - 1) return;
    router.push({ name: SECCIONES_SWIPE[idx + 1] });
  }

  function irSeccionAnterior() {
    const idx = SECCIONES_SWIPE.indexOf(secActual());
    if (idx <= 0) return;
    router.push({ name: SECCIONES_SWIPE[idx - 1] });
  }

  return {
    pullDist,
    refrescando,
    onPullRefresh,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    irSeccionSiguiente,
    irSeccionAnterior,
  };
}
