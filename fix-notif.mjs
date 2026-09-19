import fs from 'fs';
const APP = 'src/App.vue';
let s = fs.readFileSync(APP, 'utf8');
const log = [];
const rep = (from, to, label) => {
  if (!s.includes(from)) { log.push('SKIP ' + label); return; }
  s = s.split(from).join(to);
  log.push('OK ' + label);
};

// ===== D1. cfg: campos notificaciones =====
rep(`        umbralDiasCierre: 30,`,
`        notifActivo: false,
        horaArqueo: '',
        ultimaNotifStock: null,
        ultimaNotifArqueo: null,
        ultimaNotifCriticas: null,
        ultimaNotifCierre: null,
        umbralDiasCierre: 30,`,
'cfg notif');

// ===== D2. data: timer =====
rep(`      importFile: null,
      _chart: null`,
`      importFile: null,
      _chart: null,
      _notifTimer: null`,
'data notifTimer');

// ===== D3. methods: notificaciones =====
rep(`    // ===== LIBRO DIARIO =====`,
`    // ===== NOTIFICACIONES =====
    enviarNotif(titulo, cuerpo) {
      try {
        if (!('Notification' in window)) return;
        if (Notification.permission !== 'granted') return;
        new Notification(titulo, {
          body: cuerpo,
          icon: '/Tienda-ultima/icons/icon-192.png',
          badge: '/Tienda-ultima/icons/icon-192.png',
          tag: 'tienda-' + Date.now()
        });
      } catch (e) { console.error('enviarNotif', e); }
    },

    async pedirPermisoNotif() {
      if (!('Notification' in window)) {
        this.toastMsg('Este dispositivo no soporta notificaciones', 'warn');
        return;
      }
      if (Notification.permission === 'granted') {
        this.cfg.notifActivo = true;
        await this.guardarCfg();
        this.toastMsg('Notificaciones activadas');
        return;
      }
      try {
        const perm = await Notification.requestPermission();
        if (perm === 'granted') {
          this.cfg.notifActivo = true;
          await this.guardarCfg();
          this.enviarNotif('Tienda Pro', 'Notificaciones activadas');
          this.toastMsg('Notificaciones activadas');
        } else {
          this.toastMsg('Permiso denegado', 'bad');
        }
      } catch (e) { this.toastMsg('Error: ' + e.message, 'bad'); }
    },

    async desactivarNotif() {
      this.cfg.notifActivo = false;
      await this.guardarCfg();
      this.toastMsg('Notificaciones desactivadas');
    },

    probarNotif() {
      if (!('Notification' in window) || Notification.permission !== 'granted') {
        this.toastMsg('Primero activa las notificaciones', 'warn');
        return;
      }
      this.enviarNotif('Tienda Pro', 'Esta es una notificacion de prueba');
      this.toastMsg('Notificacion enviada');
    },

    async chequearNotificaciones() {
      if (!this.cfg.notifActivo) return;
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      const ahora = new Date();
      const hoy = ahora.toISOString().split('T')[0];
      let cambio = false;

      // 1. Stock bajo
      const bajo = this.productosAgotados.length + this.productosBajoStock.length;
      if (bajo > 0 && this.cfg.ultimaNotifStock !== hoy) {
        this.enviarNotif('Stock bajo', bajo + ' producto(s) en alerta');
        this.cfg.ultimaNotifStock = hoy;
        cambio = true;
      }

      // 2. Hora de arqueo
      if (this.cfg.horaArqueo) {
        const partes = this.cfg.horaArqueo.split(':');
        const hh = parseInt(partes[0]) || 0;
        const mm = parseInt(partes[1]) || 0;
        const horaArq = new Date();
        horaArq.setHours(hh, mm, 0, 0);
        if (ahora >= horaArq) {
          const hayArqueoHoy = this.arqueos.some(a => a.fecha && a.fecha.split('T')[0] === hoy);
          if (!hayArqueoHoy && this.cfg.ultimaNotifArqueo !== hoy) {
            this.enviarNotif('Arqueo pendiente', 'No hay arqueo registrado hoy');
            this.cfg.ultimaNotifArqueo = hoy;
            cambio = true;
          }
        }
      }

      // 3. Anomalias criticas
      const criticas = this.anomaliasCriticas;
      if (criticas > 0 && this.cfg.ultimaNotifCriticas !== hoy) {
        this.enviarNotif('Anomalias criticas', criticas + ' problema(s) urgente(s)');
        this.cfg.ultimaNotifCriticas = hoy;
        cambio = true;
      }

      // 4. Cierre pendiente
      const ultimoCierre = this.cierres.length > 0 ? Math.max(...this.cierres.map(c => new Date(c.fechaCierre).getTime())) : new Date(this.cfg.periodoInicio).getTime();
      const dias = Math.floor((ahora.getTime() - ultimoCierre) / 86400000);
      if (dias >= n(this.cfg.umbralDiasCierre || 30) && this.cfg.ultimaNotifCierre !== hoy) {
        this.enviarNotif('Cierre pendiente', dias + ' dias sin cerrar periodo');
        this.cfg.ultimaNotifCierre = hoy;
        cambio = true;
      }

      if (cambio) await this.guardarCfg();
    },

    // ===== LIBRO DIARIO =====`,
'methods notif');

// ===== D4. Ajustes: seccion Notificaciones =====
rep(`        <div class="set-group">Información</div>`,
`        <div class="set-group">Notificaciones</div>
        <div class="set-row">
          <span class="lbl"><icon name="alert" :size="18"></icon> Activar notificaciones</span>
          <label class="switch">
            <input type="checkbox" :checked="cfg.notifActivo" @change="cfg.notifActivo ? desactivarNotif() : pedirPermisoNotif()">
            <span class="slider"></span>
          </label>
        </div>
        <div class="set-row">
          <span class="lbl"><icon name="calendar" :size="18"></icon> Hora de arqueo</span>
          <input v-model="cfg.horaArqueo" type="time" style="width:auto;margin:0;padding:.3rem .5rem" @change="guardarCfg">
        </div>
        <button class="btn ghost" style="margin-top:.3rem;font-size:.78rem" @click="probarNotif">
          <icon name="check" :size="14" :color="mutColor"></icon> Probar notificacion
        </button>

        <div class="set-group">Información</div>`,
'ajustes notif');

// ===== E1. Sheet: reordenar =====
rep(`      <div class="sheet-grid">
        <button class="sheet-btn" :class="{ activo: sec === 'productos' }" @click="ir('productos')"><icon name="tag" :size="22"></icon>Productos</button>
        <button class="sheet-btn" :class="{ activo: sec === 'inventario' }" @click="ir('inventario')"><icon name="package" :size="22"></icon>Inventario</button>
        <button class="sheet-btn" :class="{ activo: sec === 'patrimonio' }" @click="ir('patrimonio')"><icon name="dollar" :size="22"></icon>Patrimonio</button>
        <button class="sheet-btn" :class="{ activo: sec === 'reportes' }" @click="ir('reportes')"><icon name="file" :size="22"></icon>Reportes</button>
        <button class="sheet-btn" :class="{ activo: sec === 'socios' }" @click="ir('socios')"><icon name="users" :size="22"></icon>Socios</button>
        <button class="sheet-btn" :class="{ activo: sec === 'gastos' }" @click="ir('gastos')"><icon name="dollar" :size="22"></icon>Gastos</button>
        <button class="sheet-btn" :class="{ activo: sec === 'contabilidad' }" @click="ir('contabilidad')"><icon name="chart" :size="22"></icon>Contabilidad</button>
        <button class="sheet-btn" @click="ajustesAbierto = true"><icon name="settings" :size="22"></icon>Ajustes</button>
      </div>`,
`      <div class="sheet-group">Operaciones</div>
      <div class="sheet-grid">
        <button class="sheet-btn" :class="{ activo: sec === 'productos' }" @click="ir('productos')"><icon name="tag" :size="22"></icon>Productos</button>
        <button class="sheet-btn" :class="{ activo: sec === 'inventario' }" @click="ir('inventario')"><icon name="package" :size="22"></icon>Inventario</button>
        <button class="sheet-btn" :class="{ activo: sec === 'compras' }" @click="ir('compras')"><icon name="bag" :size="22"></icon>Compras</button>
        <button class="sheet-btn" :class="{ activo: sec === 'gastos' }" @click="ir('gastos')"><icon name="dollar" :size="22"></icon>Gastos</button>
      </div>

      <div class="sheet-group">Finanzas y reportes</div>
      <div class="sheet-grid">
        <button class="sheet-btn" :class="{ activo: sec === 'contabilidad' }" @click="ir('contabilidad')"><icon name="chart" :size="22"></icon>Contabilidad</button>
        <button class="sheet-btn" :class="{ activo: sec === 'socios' }" @click="ir('socios')"><icon name="users" :size="22"></icon>Socios</button>
        <button class="sheet-btn" :class="{ activo: sec === 'patrimonio' }" @click="ir('patrimonio')"><icon name="dollar" :size="22"></icon>Patrimonio</button>
        <button class="sheet-btn" :class="{ activo: sec === 'reportes' }" @click="ir('reportes')"><icon name="file" :size="22"></icon>Reportes</button>
      </div>

      <div class="sheet-group">Sistema</div>
      <div class="sheet-grid">
        <button class="sheet-btn" style="grid-column:1/-1" @click="ajustesAbierto = true"><icon name="settings" :size="22"></icon>Ajustes</button>
      </div>`,
'sheet reordenado');

// ===== E2. Accesos rapidos: agregar gastos y contabilidad =====
rep(`          <div class="quick-grid">
            <button class="quick-btn" @click="ir('ventas')"><icon name="cart" :size="22"></icon>Nueva Venta</button>
            <button class="quick-btn" @click="ir('compras')"><icon name="bag" :size="22"></icon>Registrar Compra</button>
            <button class="quick-btn" @click="ir('caja')"><icon name="wallet" :size="22"></icon>Arqueo de Caja</button>
            <button class="quick-btn" @click="ir('inventario')"><icon name="package" :size="22"></icon>Ver Inventario</button>
          </div>`,
`          <div class="quick-grid">
            <button class="quick-btn" @click="ir('ventas')"><icon name="cart" :size="22"></icon>Nueva Venta</button>
            <button class="quick-btn" @click="ir('compras')"><icon name="bag" :size="22"></icon>Registrar Compra</button>
            <button class="quick-btn" @click="ir('gastos')"><icon name="dollar" :size="22"></icon>Registrar Gasto</button>
            <button class="quick-btn" @click="ir('caja')"><icon name="wallet" :size="22"></icon>Arqueo de Caja</button>
            <button class="quick-btn" @click="ir('contabilidad')"><icon name="chart" :size="22"></icon>Contabilidad</button>
            <button class="quick-btn" @click="ir('inventario')"><icon name="package" :size="22"></icon>Inventario</button>
          </div>`,
'accesos rapidos');

// ===== D5. mounted: arrancar chequearNotificaciones =====
rep(`    window.addEventListener('resize', () => { if (this.sec === 'dashboard') this.renderChart(); });
  }
};`,
`    window.addEventListener('resize', () => { if (this.sec === 'dashboard') this.renderChart(); });
    this._notifTimer = setInterval(() => this.chequearNotificaciones(), 5 * 60 * 1000);
    setTimeout(() => this.chequearNotificaciones(), 3000);
  },

  beforeUnmount() {
    if (this._notifTimer) clearInterval(this._notifTimer);
  }
};`,
'mounted + beforeUnmount');

fs.writeFileSync(APP, s);
console.log('\n=== RESULTADO ===');
log.forEach(l => console.log(l));
