import fs from 'fs';
const APP = 'src/App.vue';
let s = fs.readFileSync(APP, 'utf8');
const log = [];
const rep = (from, to, label) => {
  if (!s.includes(from)) { log.push('SKIP ' + label); return; }
  s = s.split(from).join(to);
  log.push('OK ' + label);
};

// 1. cfg: nuevos umbrales
rep(`        umbralSinMovimientoDias: 60
      },`,
`        umbralSinMovimientoDias: 60,
        umbralDescuentoPct: 20,
        umbralSobrantesMes: 2,
        stockMinDefault: 5
      },`,
'cfg umbrales nuevos');

// 2. prodForm: usar stockMinDefault
rep(`      prodForm: { editId: '', nombre: '', codigo: '', precio: '', stockMin: '5', unidad: '' },`,
`      prodForm: { editId: '', nombre: '', codigo: '', precio: '', stockMin: '5', unidad: '' },`,
'noop prodForm');

// 3. resetProd: usar stockMinDefault
rep(`    resetProd() {
      this.prodForm = { editId: '', nombre: '', codigo: '', precio: '', stockMin: '5', unidad: '' };
    },`,
`    resetProd() {
      this.prodForm = { editId: '', nombre: '', codigo: '', precio: '', stockMin: String(this.cfg.stockMinDefault || 5), unidad: '' };
    },`,
'resetProd usa stockMinDefault');

// 4. Anomalias ampliadas: insertar 3 nuevos chequeos antes del "const orden ="
rep(`      const orden = { alta: 0, media: 1, baja: 2 };
      return out.sort((a, b) => orden[a.nivel] - orden[b.nivel]);`,
`      // 11. Descuentos altos (venta muy por debajo del precio de lista)
      const umbralDesc = n(this.cfg.umbralDescuentoPct || 20);
      if (umbralDesc > 0) {
        const descAltos = [];
        this.ventas.filter(v => !v.anulada && new Date(v.fecha) >= hace30d).forEach(v => {
          v.items.forEach(it => {
            const prod = this.productos.find(p => p.id === it.productoId);
            if (!prod || !prod.precio) return;
            const pctDesc = ((n(prod.precio) - n(it.precio)) / n(prod.precio)) * 100;
            if (pctDesc >= umbralDesc) descAltos.push({ venta: v, item: it, pct: pctDesc });
          });
        });
        if (descAltos.length > 0) {
          out.push({ nivel: 'media', icono: 'trend', titulo: descAltos.length + ' venta(s) con descuento > ' + umbralDesc + '%', detalle: 'Revisar precios aplicados', sec: 'ventas' });
        }
      }

      // 12. Sobrantes repetidos de caja
      const sobrantes = this.movCaja.filter(mv => mv.concepto && mv.concepto.includes('Sobrante') && new Date(mv.fecha) >= hace30d);
      if (sobrantes.length >= n(this.cfg.umbralSobrantesMes || 2)) {
        const total = m(sobrantes.reduce((s, f) => s + n(f.monto), 0));
        out.push({ nivel: 'media', icono: 'wallet', titulo: sobrantes.length + ' sobrantes de caja en 30 dias', detalle: 'Total: ' + fmt(total), sec: 'caja' });
      }

      // 13. Movimientos raros de inventario (subidas sin compra)
      this.productos.filter(p => !p.archivado).forEach(p => {
        const lotesProd = this.lotes.filter(l => l.productoId === p.id);
        const comprasProd = this.compras.filter(c => c.productoId === p.id && !c.anulada);
        // Si hay lotes pero no hay compras, o hay lotes manuales (ajustes con cantidad > 0)
        const lotesSinCompra = lotesProd.filter(l => !l.compraId || l.compraId.startsWith('aj-'));
        if (lotesSinCompra.length > 0 && comprasProd.length === 0 && this.stock(p.id) > 0) {
          out.push({ nivel: 'baja', icono: 'package', titulo: p.nombre + ': stock sin compra registrada', detalle: lotesSinCompra.length + ' lote(s) por ajuste', sec: 'inventario' });
        }
      });

      const orden = { alta: 0, media: 1, baja: 2 };
      return out.sort((a, b) => orden[a.nivel] - orden[b.nivel]);`,
'anomalias ampliadas');

// 5. Ajustes: nuevos campos
rep(`        <div class="set-row">
          <span class="lbl">Dias sin movimiento producto</span>
          <input v-model.number="cfg.umbralSinMovimientoDias" type="number" min="7" style="width:5rem;margin:0;padding:.3rem .5rem" @change="guardarCfg">
        </div>`,
`        <div class="set-row">
          <span class="lbl">Dias sin movimiento producto</span>
          <input v-model.number="cfg.umbralSinMovimientoDias" type="number" min="7" style="width:5rem;margin:0;padding:.3rem .5rem" @change="guardarCfg">
        </div>
        <div class="set-row">
          <span class="lbl">Descuento maximo (%)</span>
          <input v-model.number="cfg.umbralDescuentoPct" type="number" min="0" max="100" style="width:5rem;margin:0;padding:.3rem .5rem" @change="guardarCfg">
        </div>
        <div class="set-row">
          <span class="lbl">Sobrantes por mes (alerta)</span>
          <input v-model.number="cfg.umbralSobrantesMes" type="number" min="1" style="width:5rem;margin:0;padding:.3rem .5rem" @change="guardarCfg">
        </div>
        <div class="set-row">
          <span class="lbl">Stock minimo por defecto</span>
          <input v-model.number="cfg.stockMinDefault" type="number" min="0" style="width:5rem;margin:0;padding:.3rem .5rem" @change="guardarCfg">
        </div>`,
'ajustes nuevos umbrales');

fs.writeFileSync(APP, s);
console.log('\n=== RESULTADO ===');
log.forEach(l => console.log(l));
