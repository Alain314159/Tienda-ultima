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
  const abs = Math.abs(y);
  // Épsilon relativo a la magnitud: cota del error de representación de x*factor.
  const eps = Number.EPSILON * abs * 2;
  const frac = abs % 1;
  // Solo se corrige lo pegado a la mitad exacta (0.49999… es un 0.5 mal
  // representado): se lleva a 0.5 y el redondeo half-away-from-zero (convención
  // contable) decide. La corrección es segura mientras eps < 0.25: por debajo
  // de ese umbral un "entero mal representado" (frac ≈ 0) nunca puede colarse
  // en la ventana de la mitad, y el error de ida y vuelta (x→m(x)→m(m(x)),
  // ≤ 2·eps) queda por debajo de 0.5, garantizando idempotencia.
  // Con |x| ≳ 5.6e10 la malla de 4 decimales pierde precisión frente a la
  // representación double y con |x| ≳ 1.1e11 deja de ser idempotente por
  // física de coma flotante (2·eps ≥ 0.5): mil veces el dominio de la app.
  const corregir = eps < 0.25 && Math.abs(frac - 0.5) <= eps;
  const absCorregido = corregir ? Math.floor(abs) + 0.5 : abs;
  // "+ 0" normaliza el -0 que produce round(0) * signo negativo
  return (Math.round(absCorregido) * Math.sign(y)) / factor + 0;
}

export const m = (v: unknown): number => redondear(v, 4);

export const q = (v: unknown): number => redondear(v, 4);
