/**
 * Evaluador de expresiones de la calculadora.
 *
 * Parser propio (descenso recursivo): sin `eval`, sin `new Function`, sin
 * dependencias — compatible con CSP estrictas (sin 'unsafe-eval') y con
 * WebView corporativas. Sustituye al antiguo `Function('return ...')` y
 * después a mathjs, cuyo compilador usaba `new Function` por dentro y era
 * bloqueado por la CSP en Firefox (console.error + calculadora rota).
 *
 * Sintaxis soportada (pre-transformación propia):
 *   A + B%  →  A + (A * B / 100)     (porcentaje relacional)
 *   A - B%  →  A - (A * B / 100)
 *   N%      →  N / 100                (porcentaje suelto)
 * Símbolos × ÷ − normalizados a * / -. Potencia asociativa por la derecha
 * (2^3^2 = 512), unarios +/- (5×−2, -2^2 = -4).
 */

const esDigito = (c: string): boolean => c >= '0' && c <= '9';

interface Token {
  tipo: 'num' | 'op' | 'par';
  v: string | number;
}

function tokenizar(s: string): Token[] | null {
  const toks: Token[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === ' ') {
      i++;
      continue;
    }
    if (esDigito(c) || c === '.') {
      let j = i;
      while (j < s.length && (esDigito(s[j]) || s[j] === '.')) j++;
      const num = Number(s.slice(i, j));
      if (!isFinite(num)) return null;
      toks.push({ tipo: 'num', v: num });
      i = j;
      continue;
    }
    if ('+-*/^'.includes(c)) {
      toks.push({ tipo: 'op', v: c });
      i++;
      continue;
    }
    if (c === '(' || c === ')') {
      toks.push({ tipo: 'par', v: c });
      i++;
      continue;
    }
    return null;
  }
  return toks;
}

/**
 * Parser de descenso recursivo. Devuelve NaN ante cualquier estructura
 * inválida (operador colgando, paréntesis sin cerrar, tokens sobrantes).
 */
function parsear(toks: Token[]): number {
  let pos = 0;
  const ver = (): Token | undefined => toks[pos];
  const tomar = (): Token | undefined => toks[pos++];

  function atom(): number {
    const t = tomar();
    if (!t) return NaN;
    if (t.tipo === 'num') return t.v as number;
    if (t.tipo === 'par' && t.v === '(') {
      const v = expr();
      const cierra = tomar();
      if (!cierra || cierra.tipo !== 'par' || cierra.v !== ')') return NaN;
      return v;
    }
    return NaN;
  }

  function power(): number {
    const base = atom();
    const t = ver();
    if (t && t.tipo === 'op' && t.v === '^') {
      tomar();
      // Asociativo por la derecha; el exponente admite unarios (2^-1)
      return Math.pow(base, unary());
    }
    return base;
  }

  function unary(): number {
    const t = ver();
    if (t && t.tipo === 'op' && (t.v === '-' || t.v === '+')) {
      tomar();
      const v = unary();
      return t.v === '-' ? -v : v;
    }
    return power();
  }

  function term(): number {
    let v = unary();
    for (;;) {
      const t = ver();
      if (!t || t.tipo !== 'op' || (t.v !== '*' && t.v !== '/')) break;
      tomar();
      const d = unary();
      v = t.v === '*' ? v * d : v / d;
    }
    return v;
  }

  function expr(): number {
    let v = term();
    for (;;) {
      const t = ver();
      if (!t || t.tipo !== 'op' || (t.v !== '+' && t.v !== '-')) break;
      tomar();
      const d = term();
      v = t.v === '+' ? v + d : v - d;
    }
    return v;
  }

  const resultado = expr();
  // Tokens sin consumir (p.ej. "2))((") → inválido
  if (pos !== toks.length) return NaN;
  return resultado;
}

/** Pre-transformaciones de sintaxis propia (porcentajes) + símbolos unicode. */
function normalizar(expr: string): string {
  let s = expr.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');

  // A ± B% → A ± (A * B / 100) — porcentaje relacional (100 + 10% = 110)
  s = s.replace(/(\d+\.?\d*)\s*([+\-])\s*(\d+\.?\d*)%/g, (_m, a, op, b) => {
    return `(${a}) ${op} ((${a}) * (${b}) / 100)`;
  });
  // N% suelto → fracción (50% → 0.5)
  s = s.replace(/(\d+\.?\d*)%/g, '(($1)/100)');
  return s;
}

/**
 * Evalúa una expresión de forma síncrona.
 * Devuelve `null` si la expresión está vacía, es inválida, o produce un
 * resultado no numérico (NaN).
 */
export function evaluar(expr: string): number | null {
  if (!expr || !expr.trim()) return null;

  const s = normalizar(expr);

  // Lista blanca de defensa en profundidad (anti-inyección: nada fuera de
  // dígitos, operadores aritméticos, paréntesis, punto y espacio).
  if (!/^[\d+\-*/^(). ]+$/.test(s)) return null;

  const toks = tokenizar(s);
  if (!toks || toks.length === 0) return null;

  const r = parsear(toks);
  return typeof r === 'number' && !isNaN(r) ? r : null;
}

/**
 * Mantenido por compatibilidad con la UI (el botón "=" y la raíz esperan
 * promesa): el parser propio es síncrono y siempre está disponible.
 */
export async function evaluarAsync(expr: string): Promise<number | null> {
  return evaluar(expr);
}

/** Antes cargaba mathjs bajo demanda; hoy es un no-op idempotente. */
export function precargarEvaluador(): Promise<void> {
  return Promise.resolve();
}
