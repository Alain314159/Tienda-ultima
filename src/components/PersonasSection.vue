<template>
  <section v-if="activo" class="fade-up">
    <div class="balance morado">
      <div class="lbl"><icon name="users" :size="14" color="#fff"></icon> Personas</div>
      <div class="val">{{ filtrados.length }}</div>
      <div class="sub">
        {{ totalClientes }} cliente(s) · {{ totalProveedores }} proveedor(es)
      </div>
    </div>

    <!-- Formulario -->
    <div class="card">
      <div class="card-title">
        <icon name="plus" :size="18" :color="secActiva ? '#2196F3' : mutColor"></icon>
        {{ form.editId ? 'Editar' : 'Agregar' }} persona
      </div>

      <input v-model="form.nombre" type="text" placeholder="Nombre (obligatorio) *" maxlength="60">
      <input v-model="form.telefono" type="tel" placeholder="Teléfono (opcional)" maxlength="20">

      <div style="font-size:.75rem;color:var(--mut);margin:.5rem 0 .3rem">Rol:</div>
      <div class="grid2">
        <button class="btn" :class="form.rolCliente ? 'pri' : 'ghost'" style="margin:0;font-size:.78rem;padding:.6rem" @click="form.rolCliente = !form.rolCliente">
          <icon name="cart" :size="14" :color="form.rolCliente ? '#fff' : mutColor"></icon> Cliente
        </button>
        <button class="btn" :class="form.rolProveedor ? 'pri' : 'ghost'" style="margin:0;font-size:.78rem;padding:.6rem" @click="form.rolProveedor = !form.rolProveedor">
          <icon name="bag" :size="14" :color="form.rolProveedor ? '#fff' : mutColor"></icon> Proveedor
        </button>
      </div>

      <textarea v-model="form.nota" placeholder="Nota (opcional)" rows="2" style="margin-top:.5rem;resize:none;font-family:inherit;font-size:.85rem"></textarea>

      <button class="btn pri" style="margin-top:.6rem" @click="guardar" :disabled="!puedoGuardar">
        <icon name="check" :size="16" color="#fff"></icon> {{ form.editId ? 'Actualizar' : 'Guardar' }}
      </button>
      <button v-if="form.editId" class="btn ghost" style="margin-top:.4rem" @click="resetForm">Cancelar</button>
    </div>

    <!-- Lista -->
    <div class="card">
      <div class="card-title"><icon name="list" :size="18" :color="secActiva ? '#2196F3' : mutColor"></icon> Personas</div>

      <div class="search"><input :value="busq" @input="busq = $event.target.value" type="text" placeholder="Buscar..."></div>

      <!-- Filtro por rol -->
      <div class="grid3" style="display:grid;grid-template-columns:repeat(3,1fr);gap:.3rem;margin-bottom:.6rem">
        <button class="btn" :class="filtroRol === 'todos' ? 'pri' : 'ghost'" style="margin:0;font-size:.7rem;padding:.5rem" @click="filtroRol = 'todos'">Todos</button>
        <button class="btn" :class="filtroRol === 'cliente' ? 'pri' : 'ghost'" style="margin:0;font-size:.7rem;padding:.5rem" @click="filtroRol = 'cliente'">Clientes</button>
        <button class="btn" :class="filtroRol === 'proveedor' ? 'pri' : 'ghost'" style="margin:0;font-size:.7rem;padding:.5rem" @click="filtroRol = 'proveedor'">Proveedores</button>
      </div>

      <div v-if="filtrados.length === 0" class="empty">Sin personas</div>

      <div v-for="p in filtrados" :key="p.id" class="item">
        <div class="info">
          <div class="nm">
            {{ p.nombre }}
            <span v-if="p.roles.includes('cliente')" class="badge" style="background:rgba(33,150,243,.15);color:#2196F3;font-size:.65rem;margin-left:.3rem">Cliente</span>
            <span v-if="p.roles.includes('proveedor')" class="badge" style="background:rgba(168,85,247,.15);color:#a855f7;font-size:.65rem;margin-left:.3rem">Proveedor</span>
          </div>
          <div class="det" v-if="p.telefono" style="font-size:.75rem">{{ p.telefono }}</div>
          <div class="det" v-if="p.nota" style="font-size:.7rem;font-style:italic;color:var(--mut)">{{ p.nota }}</div>
        </div>
        <div class="act-btns">
          <button class="icon-btn" @click="editar(p.id)" aria-label="Editar">
            <icon name="edit" :size="15" :color="txtColor"></icon>
          </button>
          <button class="icon-btn bad" @click="archivar(p.id)" aria-label="Archivar">
            <icon name="trash" :size="15" color="#dc2626"></icon>
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<script>
import { db, genId, clean, P } from '../db.js';
import { TOAST } from '../constants.js';

export default {
  name: 'PersonasSection',
  props: {
    activo: { type: Boolean, default: false },
    secActiva: { type: Boolean, default: false }
  },
  emits: ['ir'],
  data() {
    return {
      personas: [],
      busq: '',
      filtroRol: 'todos',
      form: { editId: '', nombre: '', telefono: '', nota: '', rolCliente: true, rolProveedor: false }
    };
  },
  computed: {
    mutColor() { return getComputedStyle(document.documentElement).getPropertyValue('--mut').trim() || '#64748B'; },
    txtColor() { return getComputedStyle(document.documentElement).getPropertyValue('--txt').trim() || '#000'; },
    totalClientes() { return this.personas.filter(p => p.roles && p.roles.includes('cliente')).length; },
    totalProveedores() { return this.personas.filter(p => p.roles && p.roles.includes('proveedor')).length; },
    puedoGuardar() { return this.form.nombre.trim().length >= 2 && (this.form.rolCliente || this.form.rolProveedor); },
    filtrados() {
      let list = this.personas;
      if (this.filtroRol !== 'todos') list = list.filter(p => p.roles && p.roles.includes(this.filtroRol));
      const q = this.busq.toLowerCase().trim();
      if (q) list = list.filter(p => p.nombre.toLowerCase().includes(q) || (p.telefono && p.telefono.includes(q)));
      return list.sort((a, b) => a.nombre.localeCompare(b.nombre));
    }
  },
  watch: {
    activo(v) { if (v) this.cargar(); }
  },
  methods: {
    async cargar() {
      try {
        this.personas = await db.personas.filter(p => !p.archivado).toArray();
      } catch (e) {
        console.warn('cargar personas', e);
        this.personas = [];
      }
    },

    async guardar() {
      const nombre = this.form.nombre.trim();
      if (!nombre) return;
      const roles = [];
      if (this.form.rolCliente) roles.push('cliente');
      if (this.form.rolProveedor) roles.push('proveedor');
      if (!roles.length) return;

      const data = {
        id: this.form.editId || genId('p'),
        nombre,
        telefono: this.form.telefono.trim(),
        nota: this.form.nota.trim(),
        roles,
        archivado: false,
        creado: this.form.editId ? undefined : new Date().toISOString()
      };
      // Limpiar undefined
      Object.keys(data).forEach(k => data[k] === undefined && delete data[k]);

      try {
        await P(db.personas, data);
        this.resetForm();
        await this.cargar();
        // Notificar al App principal
        if (this.$root && this.$root.toastMsg) this.$root.toastMsg('Persona guardada');
        else if (this.$root) console.log('Guardada');
      } catch (e) {
        console.error('guardar persona', e);
      }
    },

    resetForm() {
      this.form = { editId: '', nombre: '', telefono: '', nota: '', rolCliente: true, rolProveedor: false };
    },

    editar(id) {
      const p = this.personas.find(x => x.id === id);
      if (!p) return;
      this.form = {
        editId: p.id,
        nombre: p.nombre || '',
        telefono: p.telefono || '',
        nota: p.nota || '',
        rolCliente: p.roles && p.roles.includes('cliente'),
        rolProveedor: p.roles && p.roles.includes('proveedor')
      };
      window.scrollTo(0, 0);
    },

    async archivar(id) {
      const p = this.personas.find(x => x.id === id);
      if (!p) return;
      // TODO: verificar si tiene deudas
      try {
        await P(db.personas, { ...p, archivado: true });
        await this.cargar();
      } catch (e) {
        console.error('archivar persona', e);
      }
    }
  }
};
</script>
