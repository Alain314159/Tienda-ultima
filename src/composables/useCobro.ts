/**
 * Composable de cobro de venta: modal de cobro con conteo de billetes
 * y proceso transaccional de la venta (FIFO + lotes).
 * Instanciado por VentasView.
 */
import { ref, reactive } from 'vue';
import { n, m, q } from '../utils/numero';
import { fmt } from '../utils/formato';
import { P, genId, clean } from '../utils/id';
import { db } from '../db';
import { TOAST } from '../constants';
import { toastMsg } from '../utils/toast';
import { conWatchdog } from '../utils/watchdog';
import { useUIStore } from '../stores/useUIStore';
import { useVentasStore } from '../stores/useVentasStore';
import { useLotesStore } from '../stores/useLotesStore';
import { recargarStores } from '../stores/recarga';
import { useNotificacionesStore } from '../stores/useNotificacionesStore';

const DENOMINACIONES = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000];

export function useCobro() {
  const ui = useUIStore();
  const ventasStore = useVentasStore();
  const lotesStore = useLotesStore();
  const notificaciones = useNotificacionesStore();

  const cobroModal = reactive({
    total: 0,
    calcAbierta: false,
    billetes: {},
    totalContado: 0,
    falta: 0,
    sobra: 0,
  });
  const denominaciones = DENOMINACIONES;
  const procesandoVenta = ref(false);

  function iniciarCobro() {
    const inv = ventasStore.carrito.filter((it) => n(it.cant) <= 0);
    if (inv.length) return toastMsg('Todas las cantidades deben ser > 0', TOAST.BAD);

    // Detectar ventas con perdida
    const conPerdida: { nombre: string; ingreso: number; costo: number; perdida: number }[] = [];
    for (const it of ventasStore.carrito) {
      const f = lotesStore.calcFIFO(it.productoId, n(it.cant));
      if (f.error) continue;
      const ingreso = n(it.precio) * n(it.cant);
      if (ingreso < f.costoTotal - 0.01) {
        conPerdida.push({ nombre: it.nombre, ingreso, costo: f.costoTotal, perdida: f.costoTotal - ingreso });
      }
    }

    const abrirCobro = () => {
      cobroModal.total = ventasStore.totalCarrito;
      cobroModal.calcAbierta = false;
      cobroModal.billetes = {};
      cobroModal.totalContado = 0;
      cobroModal.falta = 0;
      cobroModal.sobra = 0;
      ui.cobroAbierto = true;
    };

    if (conPerdida.length > 0) {
      const totalPerdida = m(conPerdida.reduce((s, x) => s + x.perdida, 0));
      const lista = conPerdida.map((x) => '• ' + x.nombre + ': pierdes ' + fmt(x.perdida)).join('\n');
      ui.confirmar({
        titulo: '⚠ Venta con perdida',
        msg:
          conPerdida.length +
          ' producto(s) se venden por debajo del costo. Perdida total: ' +
          fmt(totalPerdida) +
          '.\n\n' +
          lista +
          '\n\n¿Continuar?',
        onOk: abrirCobro,
      });
      return;
    }
    abrirCobro();
  }

  function calcBilletes() {
    const contado = denominaciones.reduce((s, d) => s + d * (n(cobroModal.billetes[d]) || 0), 0);
    cobroModal.totalContado = m(contado);
    const diff = m(contado - cobroModal.total);
    cobroModal.falta = diff < 0 ? Math.abs(diff) : 0;
    cobroModal.sobra = diff > 0 ? diff : 0;
  }

  async function procesarVenta() {
    procesandoVenta.value = true;
    try {
      const items: import('../types').ItemVenta[] = [];
      let tot = 0;
      let gan = 0;
      const todos: import('../types').LoteUsado[] = [];
      for (const it of ventasStore.carrito) {
        const c = n(it.cant);
        const pr = n(it.precio);
        const f = lotesStore.calcFIFO(it.productoId, c);
        if (f.error) throw new Error(f.error + ' en ' + it.nombre);
        const sub = pr * c;
        items.push({
          productoId: it.productoId,
          nombre: it.nombre,
          cantidad: c,
          unidad: it.unidad || '',
          precio: pr,
          costo: f.costoTotal,
          ganancia: m(sub - f.costoTotal),
          lotesUsados: f.lotesUsados,
        });
        tot = m(tot + sub);
        gan = m(gan + (sub - f.costoTotal));
        todos.push(...f.lotesUsados);
      }
      const venta = {
        id: genId('v'),
        fecha: new Date().toISOString(),
        items,
        total: tot,
        ganancia: gan,
        anulada: false,
      };

      await conWatchdog(
        'venta',
        db.transaction('rw', db.ventas, db.lotes, async () => {
          await P(db.ventas, venta);
          const lotesActualizados: import('../types').Lote[] = [];
          for (const u of todos) {
            const l = lotesStore.lotes.find((x) => x.id === u.loteId);
            if (l) {
              l.cantidadVendida = q(n(l.cantidadVendida) + u.cantidad);
              lotesActualizados.push(l);
            }
          }
          if (lotesActualizados.length > 0) {
            await db.lotes.bulkPut(lotesActualizados.map((l) => clean(l)));
          }
        })
      );

      await recargarStores('ventas', 'lotes');

      // Liberar la UI de inmediato (evita "Procesando..." si una
      // notificacion se queda colgada por red lenta o SW no listo)
      ventasStore.carrito = [];
      localStorage.removeItem('carritoPro');
      ui.cobroAbierto = false;
      procesandoVenta.value = false;
      toastMsg(`Venta exitosa: ${fmt(tot)}`);
      try {
        if (window.Log)
          window.Log.evento('venta-guardada', { id: venta.id, items: items.length, total: tot, ganancia: gan });
      } catch {}

      // Notificaciones en background: sin await
      notificaciones.chequearAgotados().catch((e) => console.warn('chequearAgotados', e));
    } catch (e) {
      toastMsg(e.message, TOAST.BAD);
      try {
        if (window.Log)
          window.Log.evento('venta-error', {
            mensaje: e.message,
            stack: e.stack && e.stack.split('\n').slice(0, 3).join(' | '),
          });
      } catch {}
    } finally {
      procesandoVenta.value = false;
    }
  }

  function cerrarCobro() {
    ui.cobroAbierto = false;
  }

  return { cobroModal, denominaciones, procesandoVenta, iniciarCobro, calcBilletes, procesarVenta, cerrarCobro };
}
