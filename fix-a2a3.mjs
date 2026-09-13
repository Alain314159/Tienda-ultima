import fs from 'fs';
const log = [];
const rep = (file, from, to, label) => {
  let s = fs.readFileSync(file, 'utf8');
  if (!s.includes(from)) { log.push('SKIP ' + label); return; }
  fs.writeFileSync(file, s.split(from).join(to));
  log.push('OK ' + label);
};

// ===== A2: redondeo a 4 decimales =====
rep('src/db.js',
`export const m = v => Math.round((n(v) + Number.EPSILON) * 100) / 100;`,
`export const m = v => Math.round((n(v) + Number.EPSILON) * 10000) / 10000;`,
'db m() a 4 decimales');

rep('src/db.js',
`export const q = v => Math.round((n(v) + Number.EPSILON) * 1000) / 1000;`,
`export const q = v => Math.round((n(v) + Number.EPSILON) * 10000) / 10000;`,
'db q() a 4 decimales');

rep('src/db.js',
`  return num % 1 === 0 ? String(num) : num.toFixed(3).replace(/\\.?0+$/, '');`,
`  return num % 1 === 0 ? String(num) : num.toFixed(4).replace(/\\.?0+$/, '');`,
'db fmtCant a 4 decimales');

// ===== A3: margenes con 2 decimales =====
rep('src/App.vue',
`    margenPeriodo() {
      return this.ventasPeriodo > 0 ? ((this.gananciaNetaPeriodo / this.ventasPeriodo) * 100).toFixed(1) : '0.0';
    },`,
`    margenPeriodo() {
      return this.ventasPeriodo > 0 ? ((this.gananciaNetaPeriodo / this.ventasPeriodo) * 100).toFixed(2) : '0.00';
    },`,
'margenPeriodo a 2 decimales');

rep('src/App.vue',
`        margenB: ing > 0 ? ((bruta / ing) * 100).toFixed(1) : '0.0',
        margenN: ing > 0 ? ((neta / ing) * 100).toFixed(1) : '0.0',`,
`        margenB: ing > 0 ? ((bruta / ing) * 100).toFixed(2) : '0.00',
        margenN: ing > 0 ? ((neta / ing) * 100).toFixed(2) : '0.00',`,
'margenes cuadre a 2 decimales');

console.log('\n=== RESULTADO ===');
log.forEach(l => console.log(l));
