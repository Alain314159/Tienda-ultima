/**
 * Composable de gestos táctiles.
 *
 * - Swipe horizontal entre secciones: delegado a VueUse `useSwipe`
 *   (librería ya instalada; listeners, umbral y dirección gestionados).
 * - Pull-to-refresh: implementación propia (~60 líneas) — no existe
 *   librería mantenida que lo cubra sin traer un framework UI completo
 *   (pulltorefresh-js está abandonado; Vant/Ionic son frameworks enteros).
 *
 * Se crea una sola vez en App.vue (shell).
 */
import { ref, type Ref } from 'vue';
import { useSwipe } from '@vueuse/core';
import type { Router } from 'vue-router';
import { useUIStore } from '../stores/useUIStore';
import { recargarTodoStores } from '../stores/recarga';
import { toastMsg } from '../utils/toast';

// Secciones navegables con swipe horizontal
const SECCIONES_SWIPE = ['dashboard', 'ventas', 'compras', 'inventario'];

/**
 * @param router router de la app
 * @param secActual getter de la sección/ruta actual
 * @param target ref del elemento <main> sobre el que se escuchan los gestos
 */
export function useGestos(router: Router, secActual: () => string, target: Ref<HTMLElement | null>) {
  const ui = useUIStore();

  const pullDist = ref(0);
  const refrescando = ref(false);

  let _pullStartY = 0;
  let _pulling = false;
  let _swipeStartTime = 0;
  let _inicioEnInput = false;

  // ===== SWIPE HORIZONTAL (VueUse useSwipe, umbral 30px) =====
  const { isSwiping, direction, lengthX, lengthY } = useSwipe(target, {
    threshold: 30,
    onSwipeStart: (e: TouchEvent) => {
      _swipeStartTime = Date.now();
      const t = e.target as HTMLElement | null;
      _inicioEnInput =
        !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    },
    onSwipeEnd: () => {
      if (_inicioEnInput || _gestoBloqueado()) return;
      const dx = Math.abs(lengthX.value);
      const dy = Math.abs(lengthY.value);
      // Compromiso original: >80px, horizontal dominante (1.5x) y <1s
      if (dx > 80 && dx > dy * 1.5 && Date.now() - _swipeStartTime < 1000) {
        if (direction.value === 'left') irSeccionSiguiente();
        else if (direction.value === 'right') irSeccionAnterior();
      }
    },
  });

  function _gestoBloqueado() {
    return (
      ui.ajustesAbierto ||
      ui.masAbierto ||
      ui.cobroAbierto ||
      ui.confirm.activo ||
      ui.prompt.activo ||
      ui.retiroAbierto ||
      ui.aporteAbierto ||
      ui.shareSheetAbierto
    );
  }

  // ===== PULL-TO-REFRESH (propio) =====
  async function onPullRefresh() {
    if (refrescando.value) return;
    refrescando.value = true;
    try {
      await recargarTodoStores();
    } catch {}
    setTimeout(() => {
      refrescando.value = false;
      pullDist.value = 0;
    }, 500);
    toastMsg('Datos actualizados');
  }

  function onTouchStart(e: TouchEvent) {
    if (_gestoBloqueado()) return;
    const el = e.target as HTMLElement | null;
    const esInput =
      !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
    if (esInput) return;

    if (window.scrollY <= 0) {
      _pullStartY = e.touches[0].clientY;
      _pulling = true;
    }
  }

  function onTouchMove(e: TouchEvent) {
    // Un swipe horizontal activo (VueUse) cancela el pull
    if (isSwiping.value && (direction.value === 'left' || direction.value === 'right')) {
      _pulling = false;
      pullDist.value = 0;
      return;
    }
    if (_pulling) {
      const dy = e.touches[0].clientY - _pullStartY;
      if (dy > 0) pullDist.value = Math.min(dy, 90);
    }
  }

  function onTouchEnd() {
    if (_pulling) {
      if (pullDist.value >= 70) onPullRefresh();
      _pulling = false;
      setTimeout(() => {
        pullDist.value = 0;
      }, 300);
    }
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
