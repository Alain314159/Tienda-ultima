/**
 * Schemas Zod para validación de formularios y datos.
 * Vivien en módulos puros → usables desde stores, servicios y componentes.
 */
import { z, type ZodType } from 'zod';

// ===== PRODUCTO =====
export const productoSchema = z.object({
  nombre: z.string().trim().min(1, 'Nombre obligatorio'),
  precio: z.coerce.number().positive('Precio debe ser > 0'),
  stockMin: z.coerce.number().nonnegative().default(5),
  nota: z.string().optional().default(''),
  preciosEscalonados: z
    .array(z.object({ min: z.coerce.number(), precio: z.coerce.number() }))
    .optional()
    .default([]),
  empaques: z
    .array(z.object({ nombre: z.string(), unidades: z.coerce.number() }))
    .optional()
    .default([]),
});

// ===== COMPRA =====
export const compraSchema = z.object({
  productoId: z.string().min(1, 'Selecciona producto'),
  cantidad: z.coerce.number().positive('Cantidad debe ser > 0'),
  costo: z.coerce.number().nonnegative('Costo inválido'),
});

// ===== GASTO =====
export const gastoSchema = z.object({
  categoria: z.string().min(1, 'Categoría obligatoria'),
  concepto: z.string().min(1, 'Concepto obligatorio'),
  monto: z.coerce.number().positive('Monto debe ser > 0'),
});

// ===== SOCIO =====
export const socioSchema = z.object({
  nombre: z.string().trim().min(1, 'Nombre obligatorio'),
  porcentaje: z.coerce.number().min(0).max(100, 'Porcentaje entre 0 y 100'),
  aporte: z.coerce.number().nonnegative('Aporte inválido'),
});

// ===== RETIRO / APORTE =====
export const retiroSchema = z.object({
  monto: z.coerce.number().positive('Monto inválido'),
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
