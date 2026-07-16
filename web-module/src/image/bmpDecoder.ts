import { UserFacingError } from '../utils/errors';

const BI_RGB = 0;

export function decodeBmp(buffer: ArrayBuffer, maxPixels = 15_000_000): ImageData {
  const view = new DataView(buffer);
  if (view.byteLength < 54 || view.getUint16(0, true) !== 0x4d42) {
    throw new UserFacingError('Повреждённый BMP-файл.', 'BMP_INVALID_HEADER');
  }

  const pixelOffset = view.getUint32(10, true);
  const dibSize = view.getUint32(14, true);
  if (dibSize < 40 || view.byteLength < 14 + dibSize) {
    throw new UserFacingError('Поддерживается BMP с DIB-заголовком BITMAPINFOHEADER или новее.', 'BMP_DIB');
  }

  const width = view.getInt32(18, true);
  const signedHeight = view.getInt32(22, true);
  const planes = view.getUint16(26, true);
  const bitsPerPixel = view.getUint16(28, true);
  const compression = view.getUint32(30, true);

  if (width <= 0 || signedHeight === 0 || planes !== 1) {
    throw new UserFacingError('Некорректные размеры BMP.', 'BMP_DIMENSIONS');
  }
  if (bitsPerPixel !== 24 && bitsPerPixel !== 32) {
    throw new UserFacingError('Поддерживаются только 24-bit и 32-bit BMP.', 'BMP_BIT_DEPTH');
  }
  if (compression !== BI_RGB) {
    throw new UserFacingError('Сжатые BMP не поддерживаются.', 'BMP_COMPRESSION');
  }

  const height = Math.abs(signedHeight);
  const pixels = width * height;
  if (!Number.isSafeInteger(pixels) || pixels > maxPixels) {
    throw new UserFacingError('Разрешение BMP превышает допустимый лимит.', 'BMP_TOO_MANY_PIXELS');
  }
  const topDown = signedHeight < 0;
  const rowStride = Math.floor((bitsPerPixel * width + 31) / 32) * 4;
  const requiredBytes = pixelOffset + rowStride * height;
  if (requiredBytes > view.byteLength) {
    throw new UserFacingError('BMP обрезан или повреждён.', 'BMP_TRUNCATED');
  }

  const rgba = new Uint8ClampedArray(width * height * 4);
  let hasMeaningfulAlpha = false;
  for (let outputY = 0; outputY < height; outputY += 1) {
    const sourceY = topDown ? outputY : height - 1 - outputY;
    const rowStart = pixelOffset + sourceY * rowStride;
    for (let x = 0; x < width; x += 1) {
      const source = rowStart + x * (bitsPerPixel / 8);
      const target = (outputY * width + x) * 4;
      rgba[target] = view.getUint8(source + 2);
      rgba[target + 1] = view.getUint8(source + 1);
      rgba[target + 2] = view.getUint8(source);
      const alpha = bitsPerPixel === 32 ? view.getUint8(source + 3) : 255;
      rgba[target + 3] = alpha;
      if (bitsPerPixel === 32 && alpha !== 0) hasMeaningfulAlpha = true;
    }
  }

  // In many BI_RGB 32-bit files the fourth byte is reserved and filled with zero.
  if (bitsPerPixel === 32 && !hasMeaningfulAlpha) {
    for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
  }

  return new ImageData(rgba, width, height);
}
