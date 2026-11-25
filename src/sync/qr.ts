/**
 * QR de enlace: dibujar y leer. Las librerías se cargan solo cuando se usan,
 * para no pesar en el arranque de la app.
 */

/** Píxeles RGBA de una imagen, como los entrega un canvas. */
export interface ImagenQr {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Dibuja el código en un canvas. Rechaza si el texto no cabe en un QR. */
export async function qrACanvas(lienzo: HTMLCanvasElement, texto: string): Promise<void> {
  const { toCanvas } = await import('qrcode');
  await new Promise<void>((resolver, rechazar) => {
    toCanvas(lienzo, texto, { errorCorrectionLevel: 'L', margin: 1, width: 320 }, (e: Error | null | undefined) => {
      if (e) rechazar(e);
      else resolver();
    });
  });
}

/** Lee el texto de un QR en una imagen, o null si no hay ninguno. */
export async function leerQr(imagen: ImagenQr): Promise<string | null> {
  const jsQR = (await import('jsqr')).default;
  const leido = jsQR(imagen.data, imagen.width, imagen.height, { inversionAttempts: 'dontInvert' });
  return leido ? leido.data : null;
}
