/**
 * Schemas Zod para validación de formularios y datos.
 * Vivien en módulos puros → usables desde stores, servicios y componentes.
 *
 * CONTRATO NUMÉRICO (auditoría red-team): todo número de dinero/cantidad que
 * entra por un formulario debe ser FINITO. `z.coerce.number()` acepta
 * `Infinity` (parseFloat("1e999")) y `.positive()`/`.nonnegative()` lo dejan
 * pasar: un precio ∞ colaba como total $0 (m() sanitiza a 0) con mercancía
 * saliendo de verdad, y un costo ∞ envenenaba la valoración FIFO. Por eso
 * TODOS los campos numéricos llevan `.finite()` con mensaje propio.
 */
import { z, type ZodType } from 'zod';

/** Número finito (rechaza NaN/Infinity con mensaje de formulario). */
const numeroFin = (msg: string) => z.coerce.number().finite(msg);

// ===== PRODUCTO =====
export const productoSchema = z.object({
  nombre: z.string().trim().min(1, 'Nombre obligatorio').max(120, 'Nombre demasiado largo'),
  precio: numeroFin('Precio debe ser un número válido').positive('Precio debe ser > 0'),
  stockMin: numeroFin('Stock mín. inválido').nonnegative().default(5),
  nota: z.string().max(500, 'Nota demasiado larga').optional().default(''),
  unidad: z.string().trim().max(20, 'Unidad demasiado larga').optional().default(''),
  preciosEscalonados: z
    .array(
      z.object({
        // Un escalón arranca en ≥1 unidad: "desde 0" es el precio base, no un escalón
        min: numeroFin('Mínimo del escalón inválido').min(1, 'Mínimo del escalón ≥ 1'),
        precio: numeroFin('Precio del escalón inválido').positive('Precio del escalón debe ser > 0'),
      })
    )
    .optional()
    .default([]),
  empaques: z
    .array(
      z.object({
        nombre: z.string().trim().min(1, 'Nombre del empaque obligatorio').max(40, 'Nombre demasiado largo'),
        // "caja = 0 unidades" rompe la matemática de compra (divide por mult)
        unidades: numeroFin('Unidades del empaque inválidas').positive('Unidades del empaque > 0'),
      })
    )
    .optional()
    .default([]),
});

// ===== COMPRA =====
export const compraSchema = z.object({
  productoId: z.string().min(1, 'Selecciona producto'),
  cantidad: numeroFin('Cantidad inválida').positive('Cantidad debe ser > 0'),
  costo: numeroFin('Costo inválido').nonnegative('Costo inválido'),
});

// ===== GASTO =====
export const gastoSchema = z.object({
  categoria: z.string().min(1, 'Categoría obligatoria'),
  concepto: z.string().min(1, 'Concepto obligatorio'),
  monto: numeroFin('Monto inválido').positive('Monto debe ser > 0'),
});

// ===== SOCIO =====
export const socioSchema = z.object({
  nombre: z.string().trim().min(1, 'Nombre obligatorio').max(80, 'Nombre demasiado largo'),
  porcentaje: numeroFin('Porcentaje inválido').min(0).max(100, 'Porcentaje entre 0 y 100'),
  aporte: numeroFin('Aporte inválido').nonnegative('Aporte inválido'),
});

// ===== RETIRO / APORTE =====
export const retiroSchema = z.object({
  monto: numeroFin('Monto inválido').positive('Monto inválido'),
  concepto: z.string().optional().default(''),
});

/**
 * Helper: valida con un schema y devuelve {ok, data?, error?}
 */
export function validar<T>(schema: ZodType<T>, datos: unknown): { ok: true; data: T } | { ok: false; error: string } {
  const r = schema.safeParse(datos);
  if (r.success) return { ok: true, data: r.data };
  return { ok: false, error: r.error.issues[0].message };
}
