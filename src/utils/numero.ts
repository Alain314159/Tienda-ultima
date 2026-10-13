/**
 * Utilidades numéricas de dinero y cantidades.
 *
 * n(): parsea a número, devuelve 0 si falla.
 * m(): redondea a 4 decimales para almacenar dinero internamente
 *      (los redondeos a 2 en cada operación acumulan errores de centavos).
 * q(): redondea a 4 decimales para cantidades (kg, gr, litros).
 */

export const n = (v: unknown): number => {
  const x = parseFloat(String(v));
  return isNaN(x) ? 0 : x;
};

export const m = (v: unknown): number => Math.round((n(v) + Number.EPSILON) * 10000) / 10000;

export const q = (v: unknown): number => Math.round((n(v) + Number.EPSILON) * 10000) / 10000;
