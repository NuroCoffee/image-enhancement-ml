export async function encodeCanvas(
  canvas: OffscreenCanvas,
  mimeType: 'image/jpeg' | 'image/png',
): Promise<Blob> {
  if (mimeType === 'image/png') {
    return canvas.convertToBlob({ type: 'image/png' });
  }

  // JPEG has no alpha. Composite transparent pixels onto white explicitly.
  const output = new OffscreenCanvas(canvas.width, canvas.height);
  const context = output.getContext('2d', { alpha: false });
  if (!context) throw new Error('2D canvas context is unavailable.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, output.width, output.height);
  context.drawImage(canvas, 0, 0);
  return output.convertToBlob({
    type: 'image/jpeg',
    quality: 1,
  });
}
