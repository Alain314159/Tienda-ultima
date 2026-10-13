/**
 * Composable de compartir: lista de precios (WhatsApp-ready),
 * copiar al portapapeles y existencia de inventario.
 */
import { n, m } from '../utils/numero';
import { fmt, fmtCant, fmtFecha } from '../utils/formato';
import { TOAST } from '../constants';
import { toastMsg } from '../utils/toast';
import { useUIStore } from '../stores/useUIStore';
import { useConfigStore } from '../stores/useConfigStore';
import { useProductosStore } from '../stores/useProductosStore';

export function useCompartir() {
  const ui = useUIStore();
  const configStore = useConfigStore();
  const productosStore = useProductosStore();

  async function compartirExistencia() {
    const lineas = productosStore.productos
      .filter((p) => !p.archivado)
      .map((p) => p.nombre + ': ' + fmtCant(productosStore.stock(p.id)));

    if (lineas.length === 0) return toastMsg('No hay productos', TOAST.WARN);

    const texto =
      (configStore.cfg.nombre || 'Tienda Pro') +
      '\nExistencia al ' +
      fmtFecha(new Date().toISOString()) +
      '\n\n' +
      lineas.join('\n');

    if (navigator.share) {
      try {
        await navigator.share({ title: 'Existencia', text: texto });
      } catch {
        /* cancelado */
      }
    } else {
      try {
        await navigator.clipboard.writeText(texto);
        toastMsg('Copiado al portapapeles');
      } catch {
        toastMsg('No se pudo compartir', TOAST.WARN);
      }
    }
  }

  function generarTextoPrecios() {
    const nombre = configStore.cfg.nombre || 'Tienda Pro';
    const fecha = fmtFecha(new Date().toISOString());
    const prods = productosStore.prodsActivos.slice().sort((a, b) => a.nombre.localeCompare(b.nombre));
    if (prods.length === 0) return null;

    const lineas: string[] = [];
    lineas.push('🛒 *' + nombre.toUpperCase() + '*');
    lineas.push('_Lista de precios · ' + fecha + '_');
    lineas.push('');

    prods.forEach((p) => {
      const precioBase = n(p.precio);

      // Linea 1: nombre en negrita
      lineas.push('✔️ *' + p.nombre + '*');

      // Linea 2: precio base
      const partes: string[] = ['$' + fmt(precioBase).replace('$', '') + ' c/u'];

      // Escalones
      if (p.preciosEscalonados && p.preciosEscalonados.length) {
        const esc = p.preciosEscalonados.slice().sort((a, b) => n(a.min) - n(b.min));
        esc.forEach((e) => {
          partes.push('Mín. ' + e.min + ': ' + fmt(e.precio));
        });
      }

      lineas.push('   ' + partes.join(' · '));

      // Linea 3 (opcional): empaques
      if (p.empaques && p.empaques.length) {
        p.empaques.forEach((e) => {
          const total = m(precioBase * n(e.unidades));
          lineas.push('   📦 ' + e.nombre + ' x' + e.unidades + ': ' + fmt(total));
        });
      }

      lineas.push('');
    });

    lineas.push('📍 Calle 27 #41, entre Manuel Angulo y Adel Calderón. Rpto 26 de Julio.');
    lineas.push('📞 58154333 · 56763562 · 51438680 · 50102979');
    lineas.push('☎️ 24429628');
    lineas.push('');
    lineas.push('💬 *Únete a nuestro grupo:*');
    lineas.push('https://chat.whatsapp.com/I9U92wF5PmV7XGsvqbsfQm');

    return lineas.join('\n');
  }

  async function compartirPrecios() {
    const texto = generarTextoPrecios();
    if (!texto) return toastMsg('No hay productos para compartir', TOAST.WARN);

    // Preview antes de compartir
    ui.confirmar({
      titulo: 'Compartir precios',
      msg: 'Se compartira la lista de precios de ' + productosStore.prodsActivos.length + ' producto(s). ¿Continuar?',
      onOk: async () => {
        try {
          if (navigator.share) {
            await navigator.share({ title: 'Lista de precios', text: texto });
            toastMsg('Compartido');
          } else {
            await navigator.clipboard.writeText(texto);
            toastMsg('Copiado al portapapeles');
          }
        } catch (e) {
          if (!(e instanceof Error) || e.name !== 'AbortError') {
            // Fallback a clipboard
            try {
              await navigator.clipboard.writeText(texto);
              toastMsg('Copiado al portapapeles');
            } catch {
              toastMsg('No se pudo compartir', TOAST.BAD);
            }
          }
        }
      },
    });
  }

  async function copiarPrecios() {
    const texto = generarTextoPrecios();
    if (!texto) return toastMsg('No hay productos para copiar', TOAST.WARN);
    try {
      await navigator.clipboard.writeText(texto);
      toastMsg('Lista copiada al portapapeles');
    } catch {
      toastMsg('No se pudo copiar', TOAST.BAD);
    }
  }

  return { compartirExistencia, generarTextoPrecios, compartirPrecios, copiarPrecios };
}
