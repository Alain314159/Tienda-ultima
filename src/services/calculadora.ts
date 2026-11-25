/**
 * Evaluador de expresiones de la calculadora.
 *
 * Sustituye el antiguo `Function('"use strict"; return (...)')()` por
 * mathjs/number (parser propio, sandboxed, sin eval ni new Function —
 * compatible con CSP estrictas de Play Store / WebView corporativas).
 *
 * El chunk de mathjs se carga bajo demanda (code-splitting): la primera
 * evaluación encolará la carga; `evaluar` devolverá `null` hasta que
 * esté disponible (mismo contrato que una expresión aún inválida).
 *
 * Sintaxis soportada (pre-transformación propia, mathjs no la trae):
 *   A + B%  →  A + (A * B / 100)     (porcentaje relacional)
 *   A - B%  →  A - (A * B / 100)
 *   N%      →  N / 100                (porcentaje suelto)
 * Símbolos × ÷ − normalizados a * / -.
 */
import type { MathJsInstance } from 'mathjs';

let _math: MathJsInstance | null = null;
let _cargando: Promise<void> | null = null;

/** Carga mathjs/number (una sola vez) con solo las dependencias necesarias. */
export function precargarEvaluador(): Promise<void> {
  if (_math) return Promise.resolve();
  if (!_cargando) {
    _cargando = import('mathjs/number')
      .then(
        ({
          create,
          evaluateDependencies,
          addDependencies,
          subtractDependencies,
          multiplyDependencies,
          divideDependencies,
          unaryMinusDependencies,
          powDependencies,
          sqrtDependencies,
        }) => {
          _math = create({
            ...evaluateDependencies,
            ...addDependencies,
            ...subtractDependencies,
            ...multiplyDependencies,
            ...divideDependencies,
            ...unaryMinusDependencies,
            ...powDependencies,
            ...sqrtDependencies,
          }) as MathJsInstance;
        }
      )
      .catch((e) => {
        _cargando = null; // permite reintentar en el siguiente uso
        console.error('calculadora: no se pudo cargar mathjs', e);
      });
  }
  return _cargando;
}

/**
 * Evalúa una expresión de forma síncrona.
 * Devuelve `null` si la expresión está vacía, es inválida, o mathjs
 * aún no ha terminado de cargar (llamar `precargarEvaluador` antes).
 */
export function evaluar(expr: string): number | null {
  if (!expr || !expr.trim()) return null;
  if (!_math) return null;

  let s = expr.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');

  // A ± B% → A ± (A * B / 100) — porcentaje relacional (100 + 10% = 110)
  s = s.replace(/(\d+\.?\d*)\s*([+\-])\s*(\d+\.?\d*)%/g, (_m, a, op, b) => {
    return `(${a}) ${op} ((${a}) * (${b}) / 100)`;
  });
  // N% suelto → fracción (50% → 0.5)
  s = s.replace(/(\d+\.?\d*)%/g, '(($1)/100)');

  // Lista blanca de defensa en profundidad (mathjs ya es sandboxed).
  if (!/^[\d+\-*/^(). ]+$/.test(s)) return null;

  try {
    const r = _math.evaluate(s);
    return typeof r === 'number' ? r : null;
  } catch {
    return null;
  }
}

/** Evalúa garantizando que mathjs ya está cargado (para "=" y raíz). */
export async function evaluarAsync(expr: string): Promise<number | null> {
  await precargarEvaluador();
  return evaluar(expr);
}
