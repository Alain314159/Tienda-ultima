/**
 * AppIcon.vue: wrapper global de iconos sobre @lucide/vue.
 *  - todo nombre de icono escrito en los templates existe y renderiza un <svg>
 *    (un alias desconocido se renderiza vacío y sin error: por eso se comprueba)
 *  - los nombres dinámicos conocidos (tema claro/oscuro, recomendaciones)
 *  - size y color se aplican; un nombre desconocido no rompe el render
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import AppIcon from '../src/components/AppIcon.vue';

// Vitest arranca en la raiz del proyecto; import.meta.url no es una URL file: alli.
const RAIZ = join(process.cwd(), 'src');

function fuentes(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) out.push(...fuentes(ruta));
    else if (e.name.endsWith('.vue') || e.name.endsWith('.ts')) out.push([ruta, readFileSync(ruta, 'utf8')]);
  }
  return out;
}

/** Nombres fijos en `<icon name="x">` y literales entre comillas simples en `:name="..."`. */
function nombresEnTemplates() {
  const fijos = new Set();
  for (const [ruta, texto] of fuentes(RAIZ)) {
    if (!ruta.endsWith('.vue')) continue;
    for (const tag of texto.matchAll(/<icon\b[^>]*>/g)) {
      for (const m of tag[0].matchAll(/name="([^"]*)"/g)) {
        // En una condicion ternaria solo son nombres de icono los literales que van
        // despues del "?" (los de la condicion son valores de comparacion).
        const expr = m[1].includes('?') ? m[1].slice(m[1].indexOf('?') + 1) : m[1];
        const literales = [...expr.matchAll(/'([^']+)'/g)].map((l) => l[1]);
        if (literales.length) literales.forEach((x) => fijos.add(x));
        else if (/^[a-z0-9-]+$/i.test(m[1])) fijos.add(m[1]);
      }
    }
  }
  return [...fijos].sort();
}

function montar(props) {
  return mount(AppIcon, { props }).find('svg');
}

describe('AppIcon.vue', () => {
  const nombres = nombresEnTemplates();

  it('el escaneo de templates encuentra nombres de icono', () => {
    expect(nombres.length).toBeGreaterThan(30);
    expect(nombres).toContain('store');
  });

  it.each(nombres)('el nombre "%s" de los templates renderiza un <svg>', (name) => {
    const svg = montar({ name });
    expect(svg.exists(), `el icono "${name}" no existe en AppIcon`).toBe(true);
    expect(svg.attributes('viewBox')).toBe('0 0 24 24');
  });

  it('sun y moon (tema claro/oscuro) y los iconos de las recomendaciones existen', () => {
    const dinamicos = new Set(['sun', 'moon']);
    for (const [, texto] of fuentes(RAIZ)) {
      for (const m of texto.matchAll(/\bicono:\s*["']([^"']+)["']/g)) dinamicos.add(m[1]);
    }
    for (const name of dinamicos) {
      expect(montar({ name }).exists(), `el icono "${name}" no existe en AppIcon`).toBe(true);
    }
  });

  it('size: 22 por defecto -> 1.467rem; número y cadena; inválido vuelve al valor por defecto', () => {
    const estilo = (props) => montar(props).attributes('style') || '';
    expect(estilo({ name: 'store' })).toMatch(/width:\s*1\.4666\w*rem/);
    expect(estilo({ name: 'store', size: 30 })).toMatch(/width:\s*2rem/);
    expect(estilo({ name: 'store', size: '18' })).toMatch(/width:\s*1\.2rem/);
    expect(estilo({ name: 'store', size: 'abc' })).toMatch(/width:\s*1\.4666\w*rem/);
    expect(estilo({ name: 'store', size: 30 })).toMatch(/height:\s*2rem/);
    expect(estilo({ name: 'store', size: 30 })).toMatch(/flex-shrink:\s*0/);
  });

  it('color llega como stroke (por defecto #2196F3)', () => {
    expect(montar({ name: 'store' }).attributes('stroke')).toBe('#2196F3');
    expect(montar({ name: 'store', color: 'tomato' }).attributes('stroke')).toBe('tomato');
  });

  it('un nombre desconocido no rompe el render y no dibuja nada', () => {
    const w = mount(AppIcon, { props: { name: 'no-existe' } });
    expect(w.find('svg').exists()).toBe(false);
    expect(w.html()).toBe('');
  });
});
