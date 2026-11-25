// Capa de abstraccion para la base de datos.
// Hoy envuelve Dexie. Manana puede envolver SQLite sin cambiar el resto del codigo.
//
// USO FUTURO (cuando migremos a SQLite):
//   Solo se cambia la implementacion interna, la API publica no cambia.
import { db } from '../db.js';

export const DbAdapter = {
  // Lectura
  async listar(tabla) {
    return await db.table(tabla).toArray();
  },
  async obtener(tabla, id) {
    return await db.table(tabla).get(id);
  },
  async contar(tabla) {
    return await db.table(tabla).count();
  },
  async filtrar(tabla, fn) {
    return await db.table(tabla).filter(fn).toArray();
  },

  // Escritura
  async crear(tabla, obj) {
    await db.table(tabla).add(obj);
    return obj;
  },
  async actualizar(tabla, id, cambios) {
    const existente = await db.table(tabla).get(id);
    if (!existente) return null;
    const actualizado = { ...existente, ...cambios };
    await db.table(tabla).put(actualizado);
    return actualizado;
  },
  async eliminar(tabla, id) {
    await db.table(tabla).delete(id);
  },

  // Bulk
  async bulkPut(tabla, items) {
    await db.table(tabla).bulkPut(items);
  },
  async bulkDelete(tabla, ids) {
    await db.table(tabla).bulkDelete(ids);
  },

  // Transacciones
  async transaccion(tablas, fn) {
    const t = Array.isArray(tablas) ? tablas : [tablas];
    return await db.transaction('rw', t.map(x => db.table(x)), fn);
  }
};
