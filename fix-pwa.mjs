import fs from 'fs';
const APP = 'src/App.vue';
let s = fs.readFileSync(APP, 'utf8');
const log = [];
const apply = (from, to, label) => {
  if (!s.includes(from)) { log.push('SKIP ' + label); return; }
  s = s.split(from).join(to);
  log.push('OK ' + label);
};

apply(
`  mounted() {
    this.inicializar();
    window.addEventListener('online', () => this.online = true);`,
`  mounted() {
    this.inicializar();
    window.addEventListener('pwa:update', () => { this.hayUpdate = true; });
    window.addEventListener('online', () => this.online = true);`,
'PWA listener mounted');

apply(
`    aplicarUpdate() {
      if (this._swWaiting) {
        this._aplicando = true;
        try { this._swWaiting.postMessage('SKIP_WAITING'); } catch (e) {}
      }
    },`,
`    aplicarUpdate() {
      this._aplicando = true;
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistration().then(reg => {
          if (reg && reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          setTimeout(() => location.reload(), 500);
        }).catch(() => location.reload());
      } else {
        location.reload();
      }
    },`,
'aplicarUpdate recarga');

fs.writeFileSync(APP, s);
console.log('\n=== RESULTADO ===');
log.forEach(l => console.log(l));
