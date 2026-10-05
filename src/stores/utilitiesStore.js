import { defineStore } from 'pinia';

export const useUtilitiesStore = defineStore('utilities', () => {
  const n = (v) => {
    const x = Number.parseFloat(v);
    return Number.isFinite(x) ? x : 0;
  };

  const m = (v) => Math.round((n(v) + Number.EPSILON) * 10000) / 10000;
  const multiplicar = (a, b) => m(n(a) * n(b));

  const fmt = (v) => {
    try {
      return '$' + n(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } catch (e) {
      return '$0.00';
    }
  };

  const fmtCant = (v, fixed = 4) => {
    const num = Number.parseFloat(v);
    if (!Number.isFinite(num)) return '0';
    return Number(num).toFixed(fixed).replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1');
  };

  const fmtFecha = (iso) => {
    try {
      const d = new Date(iso);
      return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getFullYear()).slice(2);
    } catch (e) {
      return '';
    }
  };

  const fmtFH = (iso) => {
    try {
      const d = new Date(iso);
      return fmtFecha(iso) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    } catch (e) {
      return '';
    }
  };

  const porcentaje = (valor, pct) => m((n(valor) * n(pct)) / 100);
  const porcentajeInverso = (parte, total) => {
    if (n(total) === 0) return 0;
    return m((n(parte) / n(total)) * 100);
  };

  const redondear = (valor) => m(valor);
  const sumar = (...vals) => m(vals.reduce((sum, v) => sum + n(v), 0));
  const restar = (a, b) => m(n(a) - n(b));
  const dividir = (a, b) => (n(b) === 0 ? 0 : m(n(a) / n(b)));

  const estaEntre = (fecha, inicio, fin) => {
    const f = new Date(fecha).getTime();
    const i = new Date(inicio).getTime();
    const e = new Date(fin).getTime();
    return f >= i && f <= e;
  };

  return {
    n,
    m,
    multiplicar,
    redondear,
    sumar,
    restar,
    dividir,
    porcentaje,
    porcentajeInverso,
    fmt,
    fmtCant,
    fmtFecha,
    fmtFH,
    estaEntre,
  };
});
