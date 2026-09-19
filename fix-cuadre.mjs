import fs from 'fs';
const APP='src/App.vue';
const CSS='src/styles.css';
const log=[];
let s=fs.readFileSync(APP,'utf8');
const rep=(a,b,l)=>{if(!s.includes(a)){log.push('SKIP '+l);return false;}s=s.split(a).join(b);log.push('OK '+l);return true;};

// 1. state
rep(`      rep: {
        fechaInicio: new Date().toISOString().split('T')[0],
        fechaFin: new Date().toISOString().split('T')[0],
        resultado: null
      },`,
`      rep: {
        fechaInicio: new Date().toISOString().split('T')[0],
        fechaFin: new Date().toISOString().split('T')[0],
        isoInicio: null,
        isoFin: null,
        resultado: null
      },`,'1 state');

// 2. setMesActual + setHoy
rep(`    setMesActual() {
      const now = new Date();
      const inicio = new Date(now.getFullYear(), now.getMonth(), 1);
      this.rep.fechaInicio = inicio.toISOString().split('T')[0];
      this.rep.fechaFin = now.toISOString().split('T')[0];
    },`,
`    setHoy() {
      this.rep.fechaInicio = this.rep.fechaFin = new Date().toISOString().split('T')[0];
      this.rep.isoInicio = null;
      this.rep.isoFin = null;
    },

    setMesActual() {
      const now = new Date();
      const inicio = new Date(now.getFullYear(), now.getMonth(), 1);
      this.rep.fechaInicio = inicio.toISOString().split('T')[0];
      this.rep.fechaFin = now.toISOString().split('T')[0];
      this.rep.isoInicio = null;
      this.rep.isoFin = null;
    },`,'2 setHoy/Mes');

// 3. setPeriodoActual
rep(`    setPeriodoActual() {
      this.rep.fechaInicio = this.cfg.periodoInicio.split('T')[0];
      this.rep.fechaFin = new Date().toISOString().split('T')[0];
    },`,
`    setPeriodoActual() {
      this.rep.fechaInicio = this.cfg.periodoInicio.split('T')[0];
      this.rep.fechaFin = new Date().toISOString().split('T')[0];
      this.rep.isoInicio = this.cfg.periodoInicio;
      this.rep.isoFin = new Date().toISOString();
    },`,'3 setPeriodoActual');

// 4. Reemplazar generarReporte completo
const startIdx = s.indexOf('    generarReporte() {');
const endIdx = s.indexOf('    generarPDFCuadre() {');
if (startIdx < 0 || endIdx < 0) { console.log('❌ No encontré generarReporte'); process.exit(1); }
const nuevoGR = `    generarReporte() {
      if (!this.rep.fechaInicio || !this.rep.fechaFin) return this.toastMsg('Selecciona fechas', 'bad');
      const i = this.rep.isoInicio ? new Date(this.rep.isoInicio) : new Date(this.rep.fechaInicio);
      const f = this.rep.isoFin ? new Date(this.rep.isoFin) : new Date(this.rep.fechaFin);
      if (!this.rep.isoFin) f.setHours(23, 59, 59, 999);
      if (i > f) return this.toastMsg('Fecha inicio > fin', 'bad');

      const vp = this.ventas.filter(v => !v.anulada && new Date(v.fecha) >= i && new Date(v.fecha) <= f);
      const cp = this.compras.filter(c => new Date(c.fecha) >= i && new Date(c.fecha) <= f);
      const gp = this.ajustes.filter(a => a.cantidad < 0 && new Date(a.fecha) >= i && new Date(a.fecha) <= f);

      let gastosTotal = 0;
      try {
        gastosTotal = m(this.movCaja
          .filter(mv => mv.tipo === 'egreso' && mv.concepto && mv.concepto.toLowerCase().includes('gasto'))
          .filter(mv => new Date(mv.fecha) >= i && new Date(mv.fecha) <= f)
          .reduce((s, mv) => s + n(mv.monto), 0));
      } catch (e) {}

      const ing = m(vp.reduce((s, v) => s + n(v.total), 0));
      const cogs = m(vp.reduce((s, v) => s + v.items.reduce((ss, it) => ss + n(it.costo), 0), 0));
      const bruta = m(ing - cogs);
      const mermas = m(gp.reduce((s, a) => s + n(a.costoPerdida), 0));
      const neta = m(bruta - mermas - gastosTotal);

      // Agrupar ventas por (producto, costo, precio)
      const ventasPorClave = {};
      vp.forEach(v => {
        v.items.forEach(it => {
          if (!it.lotesUsados) return;
          it.lotesUsados.forEach(u => {
            const costo = n(u.costo), precio = n(it.precio);
            const key = it.productoId + '|' + costo + '|' + precio;
            if (!ventasPorClave[key]) ventasPorClave[key] = { productoId: it.productoId, costo, precio, cantVend: 0, ingresos: 0, costoTotal: 0 };
            ventasPorClave[key].cantVend += n(u.cantidad);
            ventasPorClave[key].ingresos += n(it.precio) * n(u.cantidad);
            ventasPorClave[key].costoTotal += n(u.costo) * n(u.cantidad);
          });
        });
      });

      // Compras por (producto, costo)
      const comprasPorProdCosto = {};
      cp.forEach(c => {
        const key = c.productoId + '|' + n(c.costo);
        if (!comprasPorProdCosto[key]) comprasPorProdCosto[key] = { cant: 0, total: 0 };
        comprasPorProdCosto[key].cant += n(c.cantidad);
        comprasPorProdCosto[key].total += n(c.total);
      });

      // Stock actual por (producto, costo)
      const stockPorProdCosto = {};
      this.lotes.forEach(l => {
        const key = l.productoId + '|' + n(l.costo);
        const disp = n(l.cantidadInicial) - n(l.cantidadVendida);
        if (!stockPorProdCosto[key]) stockPorProdCosto[key] = 0;
        stockPorProdCosto[key] += disp;
      });

      const cuadre = this.productos.filter(p => !p.archivado).map(p => {
        const prodId = p.id;
        const claves = new Set();
        Object.keys(ventasPorClave).forEach(k => {
          if (ventasPorClave[k].productoId === prodId) claves.add(ventasPorClave[k].costo + '|' + ventasPorClave[k].precio);
        });
        Object.keys(stockPorProdCosto).forEach(k => {
          if (!k.startsWith(prodId + '|')) return;
          const costo = n(k.split('|')[1]);
          const stock = stockPorProdCosto[k];
          let tieneFila = false;
          claves.forEach(ck => { if (n(ck.split('|')[0]) === costo) tieneFila = true; });
          if (!tieneFila && stock > 0) claves.add(costo + '|stock');
        });

        const subfilas = [];
        claves.forEach(ck => {
          const partes = ck.split('|');
          const costo = n(partes[0]);
          const precio = partes[1] === 'stock' ? null : n(partes[1]);
          const v = ventasPorClave[prodId + '|' + costo + '|' + precio] || { cantVend: 0, ingresos: 0, costoTotal: 0 };
          const c = comprasPorProdCosto[prodId + '|' + costo] || { cant: 0, total: 0 };
          const stock = stockPorProdCosto[prodId + '|' + costo] || 0;
          subfilas.push({
            costo, precio,
            comprasCant: m(c.cant),
            cantVend: m(v.cantVend),
            ingresos: m(v.ingresos),
            costoVend: m(v.costoTotal),
            ganancia: m(v.ingresos - v.costoTotal),
            stockActual: q(stock),
            valorActual: m(stock * costo)
          });
        });
        subfilas.sort((a, b) => {
          if (a.costo !== b.costo) return a.costo - b.costo;
          if (a.precio === null && b.precio !== null) return 1;
          if (a.precio !== null && b.precio === null) return -1;
          return (a.precio || 0) - (b.precio || 0);
        });

        const comprasProdCant = m(Object.keys(comprasPorProdCosto).filter(k => k.startsWith(prodId + '|')).reduce((s, k) => s + comprasPorProdCosto[k].cant, 0));
        const comprasProdTotal = m(Object.keys(comprasPorProdCosto).filter(k => k.startsWith(prodId + '|')).reduce((s, k) => s + comprasPorProdCosto[k].total, 0));
        const ventasProdCant = m(subfilas.reduce((s, f) => s + f.cantVend, 0));
        const ingresosProd = m(subfilas.reduce((s, f) => s + f.ingresos, 0));
        const costoProdVend = m(subfilas.reduce((s, f) => s + f.costoVend, 0));
        const stockProd = q(subfilas.reduce((s, f) => s + f.stockActual, 0));
        const valorProd = m(subfilas.reduce((s, f) => s + f.valorActual, 0));

        return {
          id: p.id, nombre: p.nombre,
          compras: comprasProdCant,
          costoCompra: comprasProdCant > 0 ? m(comprasProdTotal / comprasProdCant) : 0,
          ventas: ventasProdCant,
          precioVenta: ventasProdCant > 0 ? m(ingresosProd / ventasProdCant) : 0,
          ingresos: ingresosProd,
          costo: costoProdVend,
          ganancia: m(ingresosProd - costoProdVend),
          stockFinal: stockProd,
          valorInv: valorProd,
          subfilas
        };
      });

      const totales = cuadre.reduce((acc, r) => {
        acc.compras += r.compras; acc.ventas += r.ventas; acc.ingresos += r.ingresos;
        acc.costo += r.costo; acc.ganancia += r.ganancia;
        acc.stockFinal += r.stockFinal; acc.valorInv += r.valorInv;
        return acc;
      }, { compras: 0, ventas: 0, ingresos: 0, costo: 0, ganancia: 0, stockFinal: 0, valorInv: 0 });
      Object.keys(totales).forEach(k => totales[k] = m(totales[k]));

      this.rep.resultado = {
        ingresos: ing, cogs, bruta, mermas, gastos: gastosTotal,
        neta, numVentas: vp.length,
        margenB: ing > 0 ? ((bruta / ing) * 100).toFixed(2) : '0.00',
        margenN: ing > 0 ? ((neta / ing) * 100).toFixed(2) : '0.00',
        cuadre, totales,
        _fechaI: this.rep.fechaInicio,
        _fechaF: this.rep.fechaFin
      };
    },

`;
s = s.slice(0, startIdx) + nuevoGR + s.slice(endIdx);
log.push('OK 4 generarReporte nuevo');

// 5. Reemplazar thead
rep(`                  <tr>
                    <th>Producto</th>
                    <th>Compras</th>
                    <th>Costo c/u</th>
                    <th>Ventas</th>
                    <th>Precio c/u</th>
                    
                    <th>Ingresos</th>
                    <th>Costo</th>
                    <th>Ganancia</th>
                    <th>Stock</th>
                    <th>Valor</th>
                  </tr>`,
`                  <tr>
                    <th>Producto</th>
                    <th>Detalle</th>
                    <th>Compras</th>
                    <th>Costo c/u</th>
                    <th>Ventas</th>
                    <th>Precio c/u</th>
                    <th>Ingresos</th>
                    <th>Costo</th>
                    <th>Ganancia</th>
                    <th>Stock</th>
                    <th>Valor</th>
                  </tr>`,'5 thead');

// 6. Reemplazar tbody
const tbodyStart = s.indexOf('                <tbody>');
const tbodyEnd = s.indexOf('                </tbody>', tbodyStart);
if (tbodyStart < 0 || tbodyEnd < 0) { console.log('❌ tbody'); process.exit(1); }
const nuevoTbody = `                <tbody>
                  <template v-for="r in rep.resultado.cuadre" :key="r.id">
                    <tr class="product-row">
                      <td><b>{{ r.nombre }}</b></td>
                      <td class="det-cell">—</td>
                      <td>{{ fmtCant(r.compras) }}</td>
                      <td>{{ fmt(r.costoCompra) }}</td>
                      <td>{{ fmtCant(r.ventas) }}</td>
                      <td>{{ fmt(r.precioVenta) }}</td>
                      <td class="pos">{{ fmt(r.ingresos) }}</td>
                      <td class="neg">{{ fmt(r.costo) }}</td>
                      <td :class="r.ganancia >= 0 ? 'pos' : 'neg'"><b>{{ fmt(r.ganancia) }}</b></td>
                      <td>{{ fmtCant(r.stockFinal) }}</td>
                      <td>{{ fmt(r.valorInv) }}</td>
                    </tr>
                    <tr v-for="(sf, i) in r.subfilas" :key="r.id + '_' + i" class="sub-row">
                      <td></td>
                      <td class="det-cell">↳ {{ fmt(sf.costo) }}{{ sf.precio !== null ? ' → ' + fmt(sf.precio) : ' (sin ventas)' }}</td>
                      <td>{{ sf.comprasCant ? fmtCant(sf.comprasCant) : '—' }}</td>
                      <td>{{ fmt(sf.costo) }}</td>
                      <td>{{ sf.cantVend ? fmtCant(sf.cantVend) : '—' }}</td>
                      <td>{{ sf.precio !== null ? fmt(sf.precio) : '—' }}</td>
                      <td class="pos">{{ sf.ingresos ? fmt(sf.ingresos) : '—' }}</td>
                      <td class="neg">{{ sf.costoVend ? fmt(sf.costoVend) : '—' }}</td>
                      <td :class="sf.ganancia >= 0 ? 'pos' : 'neg'">{{ sf.ganancia ? fmt(sf.ganancia) : '—' }}</td>
                      <td>{{ fmtCant(sf.stockActual) }}</td>
                      <td>{{ fmt(sf.valorActual) }}</td>
                    </tr>
                  </template>
                  <tr class="total-row">
                    <td>TOTAL</td>
                    <td></td>
                    <td>{{ fmtCant(rep.resultado.totales.compras) }}</td>
                    <td></td>
                    <td>{{ fmtCant(rep.resultado.totales.ventas) }}</td>
                    <td></td>
                    <td class="pos">{{ fmt(rep.resultado.totales.ingresos) }}</td>
                    <td class="neg">{{ fmt(rep.resultado.totales.costo) }}</td>
                    <td :class="rep.resultado.totales.ganancia >= 0 ? 'pos' : 'neg'">{{ fmt(rep.resultado.totales.ganancia) }}</td>
                    <td>{{ fmtCant(rep.resultado.totales.stockFinal) }}</td>
                    <td>{{ fmt(rep.resultado.totales.valorInv) }}</td>
                  </tr>
                </tbody>`;
s = s.slice(0, tbodyStart) + nuevoTbody + s.slice(tbodyEnd + '                </tbody>'.length);
log.push('OK 6 tbody');

// 7. Botón Hoy
rep(`@click="rep.fechaInicio = rep.fechaFin = new Date().toISOString().split('T')[0]">Hoy</button>`,
`@click="setHoy()">Hoy</button>`,'7 boton Hoy');

fs.writeFileSync(APP,s);

// 8. CSS
let c = fs.readFileSync(CSS,'utf8');
if (!c.includes('.cuadre-table tr.product-row')) {
  c += '\n\n/* ===== CUADRE: FILA PRODUCTO / SUB-FILA DETALLE ===== */\n';
  c += '.cuadre-table tr.product-row { background: rgba(33,150,243,.08); }\n';
  c += '.cuadre-table tr.product-row td { font-weight: 700; }\n';
  c += '.cuadre-table tr.sub-row { font-size: .68rem; color: var(--mut); background: rgba(33,150,243,.02); }\n';
  c += '.cuadre-table tr.sub-row td:first-child { padding-left: 1.2rem; }\n';
  c += '.cuadre-table .det-cell { text-align: left; }\n';
  c += '.cuadre-table tr.sub-row .det-cell { color: var(--pri); font-weight: 600; }\n';
  fs.writeFileSync(CSS,c);
  log.push('OK 8 CSS');
} else log.push('SKIP 8 CSS ya existe');

console.log('\n=== RESULTADO ===');
log.forEach(l => console.log(l));
