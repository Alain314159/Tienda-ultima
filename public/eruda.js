// Eruda: consola de depuración para el WebView.
// Se carga dinámicamente desde Ajustes cuando el usuario la activa.
// (Archivo externo para que la CSP pueda prohibir <script> inline.)
window.__loadEruda = function () {
  if (window.eruda) {
    try {
      window.eruda.init();
    } catch (e) {}
    return;
  }
  var sc = document.createElement('script');
  sc.src = 'https://cdn.jsdelivr.net/npm/eruda';
  sc.onload = function () {
    try {
      window.eruda.init();
    } catch (e) {}
  };
  document.head.appendChild(sc);
};
window.__unloadEruda = function () {
  if (window.eruda && window.eruda.destroy) {
    try {
      window.eruda.destroy();
    } catch (e) {}
  }
};
