/**
 * Utilidades numéricas de dinero y cantidades.
 *
 * n(): parsea a número, devuelve 0 si falla.
 * m(): redondea a 4 decimales para almacenar dinero internamente
 *      (los redondeos a 2 en cada operación acumulan errores de centavos).
 * q(): redondea a 4 decimales para cantidades (kg, gr, litros).
 *
 * El redondeo es half-away-from-zero (convención contable: 0.00005 → 0.0001,
 * -0.00005 → -0.0001) con un épsilon relativo a la magnitud del valor, que
 * neutraliza la representación binaria de coma flotante también en cifras
 * grandes (donde sumar Number.EPSILON fijo no tiene efecto).
 */

export const n = (v: unknown): number => {
  const x = parseFloat(String(v));
  return isNaN(x) ? 0 : x;
};

function redondear(v: unknown, decimales: number): number {
  const x = n(v);
  if (!isFinite(x)) return 0;
  const factor = 10 ** decimales;
  const y = x * factor;
  // Épsilon positivo sobre el valor absoluto: corrige 1.00005 almacenado
  // como 1.00049999... y garantiza que los "exactamente mitad" (0.5)
  // redondeen lejos de cero en ambos signos (convención contable).
  const eps = Number.EPSILON * Math.abs(y) * 2;
  // "+ 0" normaliza el -0 que produce round(0) * signo negativo
  return (Math.round(Math.abs(y) + eps) * Math.sign(y)) / factor + 0;
}

export const m = (v: unknown): number => redondear(v, 4);

export const q = (v: unknown): number => redondear(v, 4);
