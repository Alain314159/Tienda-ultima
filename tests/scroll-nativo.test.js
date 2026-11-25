/**
 * Contratos NATIVOS del scroll en el APK (bug del dueño 2026-10-17:
 * "a veces el scroll se queda pegado, me deja subir pero no bajar").
 *
 * Causas raíz corregidas (dos mecanismos independientes documentados del
 * WebView de Android):
 *
 * 1. `html { scroll-behavior: smooth }` GLOBAL: cada navegación de ruta
 *    (router → top:0) y cada scrollTo(0,0) tras guardar disparaba una
 *    animación de scroll en el compositor; si el dedo la interrumpía, el
 *    scroll quedaba pillado (sube, no baja) hasta el siguiente reflow.
 *    Los scrolls suaves INTENCIONALES siguen existiendo: pasan
 *    behavior:'smooth' explícito (utils/navegacion.ts).
 *
 * 2. MainActivity SIN windowSoftInputMode: Android resolvía con
 *    adjustPan → al abrir el teclado el sistema PANEABA la ventana y al
 *    cerrarla el contenido quedaba inalcanzable por abajo. adjustResize
 *    redimensiona el WebView (el documento se reflowa y el scroll sigue
 *    disponible con el teclado abierto).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const RAIZ = resolve(__dirname, '..');
const styles = readFileSync(resolve(RAIZ, 'src', 'styles.css'), 'utf8');
const manifest = readFileSync(resolve(RAIZ, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'), 'utf8');

/** Quita comentarios CSS y bloques de comentario para inspeccionar reglas. */
function sinComentarios(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('Scroll nativo (APK): contratos anti-pillado', () => {
  it('styles.css NO declara scroll-behavior: smooth en html (causa del scroll pillado)', () => {
    const css = sinComentarios(styles);
    // La regla global prohibida: el selector html con scroll-behavior
    expect(/html\s*{[^}]*scroll-behavior\s*:\s*smooth/i.test(css)).toBe(false);
    // Defensiva extra: ningún selector con scroll-behavior: smooth fuera de
    // un contexto explícitamente acotado. Hoy NO hay ninguno permitido: si
    // alguien lo necesita, que sea via behavior:'smooth' en JS.
    expect(/scroll-behavior\s*:\s*smooth/i.test(css)).toBe(false);
  });

  it('AndroidManifest: MainActivity declara windowSoftInputMode="adjustResize"', () => {
    expect(manifest).toContain('android:windowSoftInputMode="adjustResize"');
    // Y está en el <activity> correcto (MainActivity), no en otro lado
    const activity = manifest.slice(manifest.indexOf('<activity'), manifest.indexOf('</activity>'));
    expect(activity).toContain('.MainActivity');
    expect(activity).toContain('android:windowSoftInputMode="adjustResize"');
  });

  it('el pull-to-refresh casero no llama preventDefault (scroll nativo intacto)', () => {
    const gestos = readFileSync(resolve(RAIZ, 'src', 'composables', 'useGestos.ts'), 'utf8');
    expect(gestos).not.toContain('preventDefault');
    // y los listeners de touch siguen passive en el shell (no bloquean el
    // hilo de scroll del compositor)
    const app = readFileSync(resolve(RAIZ, 'src', 'App.vue'), 'utf8');
    expect(app).toContain('@touchstart.passive');
    expect(app).toContain('@touchmove.passive');
  });
});
