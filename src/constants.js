// Constantes globales de Tienda Pro

export const TOAST = {
  OK: 'ok',
  WARN: 'warn',
  BAD: 'bad'
};

export const TIPO_ASIENTO = {
  VENTA: 'venta',
  COSTO: 'costo',
  COMPRA: 'compra',
  GASTO: 'gasto',
  MERMA: 'merma',
  RETIRO: 'retiro',
  APORTE: 'aporte',
  ARQUEO: 'arqueo',
  AJUSTE: 'ajuste',
  CIERRE: 'cierre',
  PAGO_PASIVO: 'pago_pasivo',
  AUDITORIA: 'auditoria',
  CAPITAL: 'capital'
};

export const CATEGORIAS_GASTO = [
  'Luz', 'Agua', 'Alquiler', 'Internet', 'Transporte',
  'Publicidad', 'Mantenimiento', 'Limpieza', 'Otros'
];

export const METODOS_PAGO = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'otro', label: 'Otro' }
];
