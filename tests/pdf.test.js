/**
 * Tests del generador de PDF del cuadre (services/pdf.ts):
 * jsPDF/autoTable mockeados para verificar la ORQUESTACIÓN (responsabilidad
 * del módulo): portada, resumen, situación financiera, reparto entre socios,
 * página apaisada de detalle, footers con numeración y nombre de archivo.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const pdfState = vi.hoisted(() => ({ instancias: [], tablas: [] }));
const capState = vi.hoisted(() => ({ nativo: false, escritas: [] }));

// Capacitor moqueado: plataforma conmutable para probar la entrega del PDF
// en web (descarga del navegador) vs APK instalado (Filesystem → Documentos).
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => capState.nativo,
    getPlatform: () => (capState.nativo ? 'android' : 'web'),
  },
}));
vi.mock('@capacitor/filesystem', () => ({
  Filesystem: {
    writeFile: vi.fn(async (opts) => {
      capState.escritas.push(opts);
      return {};
    }),
  },
  Directory: { Documents: 'DOCUMENTS' },
}));

vi.mock('jspdf', () => ({
  jsPDF: class {
    constructor() {
      this.textos = [];
      this.paginas = [1];
      this.paginaActual = 1;
      this.setPages = [];
      this.savedName = null;
      pdfState.instancias.push(this);
    }
    internal = {
      pageSize: { getWidth: () => 595.28, getHeight: () => 841.89 },
      getNumberOfPages: () => this.paginas.length,
    };
    setFillColor() {}
    rect() {}
    setTextColor() {}
    setFontSize() {}
    setFont() {}
    text(str) {
      this.textos.push(String(str));
    }
    addPage() {
      this.paginas.push(this.paginas.length + 1);
    }
    setPage(p) {
      this.paginaActual = p;
      this.setPages.push(p);
    }
    save(nombre) {
      this.savedName = nombre;
    }
    output(type) {
      if (type === 'datauristring') return 'data:application/pdf;base64,JVBERi0xLjQK';
      return '';
    }
  },
}));

vi.mock('jspdf-autotable', () => ({
  default: (doc, opts) => {
    doc.lastAutoTable = { finalY: 120 };
    pdfState.tablas.push(opts);
  },
}));

import { generarPDFCuadre } from '../src/services/pdf';

/** Resultado mínimo con la forma que consume el PDF. */
function resultadoBase() {
  return {
    ingresos: 1000,
    cogs: 600,
    bruta: 400,
    mermas: 50,
    gastos: 150,
    neta: 200,
    margenB: '40.00',
    margenN: '20.00',
    numVentas: 10,
    cuadre: [
      {
        id: 'p_1',
        nombre: 'Prod A',
        compras: 10,
        costoCompra: 5,
        ventas: 8,
        precioVenta: 10,
        ingresos: 80,
        costo: 40,
        ganancia: 40,
        stockFinal: 2,
        valorInv: 10,
        subfilas: [
          {
            costo: 5,
            precio: 10,
            comprasCant: 10,
            cantVend: 8,
            ingresos: 80,
            costoVend: 40,
            ganancia: 40,
            stockActual: 2,
            valorActual: 10,
          },
        ],
      },
    ],
    totales: { compras: 10, ventas: 8, ingresos: 80, costo: 40, ganancia: 40, stockFinal: 2, valorInv: 10 },
    _fechaI: '2026-10-01',
    _fechaF: '2026-10-14',
  };
}

function ctxBase(socios = []) {
  return {
    nombreTienda: 'La Bodega',
    saldoCaja: 500,
    valorInventario: 300,
    capitalTotal: 700,
    gananciasAcumuladas: 120,
    gananciaDisponible: 60,
    patrimonioTotal: 720, // capital 700 + ganancias 120 - retiros 100
    retirosAcumulados: 100,
    gastosFueraCaja: 40,
    socios,
  };
}

beforeEach(() => {
  pdfState.instancias.length = 0;
  pdfState.tablas.length = 0;
  capState.nativo = false;
  capState.escritas.length = 0;
});

describe('generarPDFCuadre', () => {
  it('genera resumen + situación financiera y guarda con el nombre correcto', async () => {
    await generarPDFCuadre(resultadoBase(), ctxBase());

    expect(pdfState.instancias).toHaveLength(1);
    const doc = pdfState.instancias[0];
    expect(doc.savedName).toBe('cuadre-2026-10-01-2026-10-14.pdf');

    // Sin socios: resumen + situación en página 1, detalle en página 2
    expect(pdfState.tablas).toHaveLength(3);

    // Tabla 1: resumen con los 6 conceptos y márgenes
    const resumen = pdfState.tablas[0];
    expect(resumen.head).toEqual([['Concepto', 'Monto']]);
    expect(resumen.body.map((f) => f[0])).toEqual([
      'Ingresos por ventas',
      'Costo de lo vendido (COGS)',
      'GANANCIA BRUTA',
      'Gastos operativos',
      'Mermas',
      'GANANCIA NETA',
    ]);
    expect(resumen.body[2][1]).toBe('$400.00  (40.00%)');
    expect(resumen.body[5][1]).toBe('$200.00  (20.00%)');

    // Tabla 2: situación financiera con activos y patrimonio
    const situacion = pdfState.tablas[1];
    expect(situacion.body.map((f) => f[0])).toEqual([
      'Caja',
      'Valor del inventario',
      'ACTIVOS TOTALES',
      'Capital aportado',
      'Ganancias acumuladas',
      'Retiros acumulados',
      'PATRIMONIO NETO',
      'Disponible para retiro',
      'Gastos pagados fuera de caja',
    ]);
    expect(situacion.body[2][1]).toBe('$800.00'); // caja + inventario
    expect(situacion.body[6][1]).toBe('$720.00'); // capital + ganancias - retiros
    expect(situacion.body[5][1]).toBe('- $100.00'); // retiros con signo
    expect(situacion.body[8][1]).toBe('- $40.00'); // gastos fuera de caja

    // Portada: nombre de tienda y período
    expect(doc.textos).toContain('La Bodega');
    expect(doc.textos.some((t) => t.includes('2026-10-01 al 2026-10-14'))).toBe(true);
  });

  it('con socios activos añade la tabla de reparto con fila TOTAL', async () => {
    // El filtrado por activo lo hace useCuadre antes de llamar al PDF:
    // aquí entra solo lo que el renderer debe pintar.
    const socios = [
      { nombre: 'Ana', porcentaje: 60 },
      { nombre: 'Beto', porcentaje: 40 },
    ];
    await generarPDFCuadre(resultadoBase(), ctxBase(socios));

    expect(pdfState.tablas).toHaveLength(4); // resumen + situación + reparto + detalle
    const reparto = pdfState.tablas[2];
    expect(reparto.head).toEqual([['Socio', '% Participacion', 'Monto a recibir']]);
    expect(reparto.body).toEqual([
      ['Ana', '60.00%', '$120.00'], // 200 * 60%
      ['Beto', '40.00%', '$80.00'],
      ['TOTAL', '100.00%', '$200.00'],
    ]);
  });

  it('la página de detalle por producto es apaisada y termina en fila TOTAL', async () => {
    await generarPDFCuadre(resultadoBase(), ctxBase());

    const doc = pdfState.instancias[0];
    expect(doc.paginas.length).toBe(2); // retrato + detalle
    expect(doc.paginaActual).toBe(2); // addPage fue llamada

    const detalle = pdfState.tablas[pdfState.tablas.length - 1];
    expect(detalle.head[0][0]).toBe('Producto');
    // Fila del producto + subfila de lote + fila TOTAL
    expect(detalle.body).toHaveLength(3);
    expect(detalle.body[0][0].content).toBe('Prod A');
    expect(detalle.body[1][0].content).toContain('Lote 1');
    expect(detalle.body[2][0].content).toBe('TOTAL');
    expect(detalle.body[2][6].content).toBe('$40.00'); // ganancia total
  });

  it('pie de página en todas las páginas con numeración', async () => {
    await generarPDFCuadre(resultadoBase(), ctxBase([{ nombre: 'Ana', porcentaje: 100 }]));

    const doc = pdfState.instancias[0];
    // El footer recorre las 2 páginas (setPage por cada una)
    expect(doc.setPages).toEqual([1, 2]);
    expect(doc.textos).toContain('Pagina 1 de 2');
    expect(doc.textos).toContain('Pagina 2 de 2');
  });

  it('nombre de tienda vacío cae a "Tienda Pro"', async () => {
    await generarPDFCuadre(resultadoBase(), ctxBase());
    const doc2 = pdfState.instancias[0];
    expect(doc2.textos).toContain('La Bodega'); // sanity

    pdfState.instancias.length = 0;
    await generarPDFCuadre(resultadoBase(), { ...ctxBase(), nombreTienda: '' });
    expect(pdfState.instancias[0].textos).toContain('Tienda Pro');
  });
});

// ============================================================
// ENTREGA POR PLATAFORMA — APK instalado (Android WebView)
// doc.save() dispara una descarga blob: que el WebView ignora:
// en nativo el PDF debe escribirse con Filesystem en Documentos/.
// ============================================================
describe('generarPDFCuadre: entrega del archivo por plataforma', () => {
  it('en WEB: descarga del navegador (doc.save) y no escribe archivos', async () => {
    const destino = await generarPDFCuadre(resultadoBase(), ctxBase());

    expect(destino).toBe(null); // web: el toast dice "PDF generado"
    const doc = pdfState.instancias[0];
    expect(doc.savedName).toBe('cuadre-2026-10-01-2026-10-14.pdf');
    expect(capState.escritas).toHaveLength(0); // nunca Filesystem en web
  });

  it('en NATIVO (APK): escribe en Documentos/ con Filesystem y devuelve la ruta', async () => {
    capState.nativo = true;
    const destino = await generarPDFCuadre(resultadoBase(), ctxBase());

    // La ruta devuelta alimenta el toast ("PDF guardado en …")
    expect(destino).toBe('Documentos/cuadre-2026-10-01-2026-10-14.pdf');

    const doc = pdfState.instancias[0];
    expect(doc.savedName).toBe(null); // doc.save JAMAS en nativo (no hace nada)

    expect(capState.escritas).toHaveLength(1);
    const escritura = capState.escritas[0];
    expect(escritura.path).toBe('cuadre-2026-10-01-2026-10-14.pdf');
    expect(escritura.directory).toBe('DOCUMENTS');
    expect(escritura.recursive).toBe(true);
    // base64 del dataURI sin el prefijo "data:…;base64," (formato del plugin)
    expect(escritura.data).toBe('JVBERi0xLjQK');
  });
});
