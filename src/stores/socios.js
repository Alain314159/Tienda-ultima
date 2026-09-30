import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { db, n, m, genId, P } from '../db.js';

export const useSociosStore = defineStore('socios', () => {
  const socios = ref([]);
  const distribuciones = ref([]);

  const activos = computed(() => socios.value.filter(s => s.activo !== false));

  const sumaPorcentajes = computed(() =>
    m(activos.value.reduce((s, x) => s + n(x.porcentaje), 0))
  );

  const totalDistribuido = computed(() =>
    m(distribuciones.value.reduce((s, d) => s + n(d.monto), 0))
  );

  async function cargar() {
    socios.value = await db.socios.toArray();
    distribuciones.value = await db.distribuciones.toArray();
  }

  async function agregar(socio) {
    const nuevo = {
      id: socio.id || genId('s'),
      nombre: socio.nombre,
      porcentaje: n(socio.porcentaje),
      aporte: n(socio.aporte),
      activo: true,
      fecha: new Date().toISOString()
    };
    await P(db.socios, nuevo);
    socios.value.push(nuevo);
    return nuevo;
  }

  async function actualizar(id, cambios) {
    const idx = socios.value.findIndex(s => s.id === id);
    if (idx < 0) return null;
    const actualizado = { ...socios.value[idx], ...cambios };
    await P(db.socios, actualizado);
    socios.value[idx] = actualizado;
    return actualizado;
  }

  return {
    socios, distribuciones,
    activos, sumaPorcentajes, totalDistribuido,
    cargar, agregar, actualizar
  };
});
