/**
 * Utilidades de navegación entre secciones con scroll + highlight
 * del elemento destino (ref-<id>).
 */

/**
 * Navega a una sección y (opcionalmente) hace scroll + highlight
 * al elemento `ref-<refId>`.
 * @param {import('vue-router').Router} router
 * @param {string} s nombre de la ruta/sección
 * @param {string} [refId] id del elemento a resaltar
 */
export function ir(router: import('vue-router').Router, s: string, refId?: string) {
  if (router.currentRoute.value.name !== s) {
    try {
      router.push({ name: s });
    } catch {}
  }
  if (refId) {
    setTimeout(() => {
      const el = document.getElementById('ref-' + refId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('highlight-flash');
        setTimeout(() => el.classList.remove('highlight-flash'), 3000);
      }
    }, 400);
  }
}
