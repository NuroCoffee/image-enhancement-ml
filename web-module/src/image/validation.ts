import { UserFacingError } from '../utils/errors';
import { detectImageFormat } from './fileSignature';
import type { ImageFormat } from './types';

export async function validateEncodedFile(file: Blob, maxFileBytes: number): Promise<ImageFormat> {
  if (file.size === 0) {
    throw new UserFacingError('Файл пуст.', 'EMPTY_FILE');
  }
  if (file.size > maxFileBytes) {
    throw new UserFacingError(
      `Размер файла превышает ${formatMegabytes(maxFileBytes)} МБ.`,
      'FILE_TOO_LARGE',
    );
  }
  const header = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  const format = detectImageFormat(header);
  if (!format) {
    throw new UserFacingError('Поддерживаются только JPG, PNG, HEIC и BMP.', 'UNSUPPORTED_FORMAT');
  }
  return format;
}

export function validateDimensions(width: number, height: number, maxPixels: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new UserFacingError('Некорректные размеры изображения.', 'INVALID_DIMENSIONS');
  }
  const pixels = width * height;
  if (!Number.isSafeInteger(pixels) || pixels > maxPixels) {
    throw new UserFacingError(
      `Разрешение ${width}×${height} превышает лимит ${formatMegapixels(maxPixels)} Мп.`,
      'TOO_MANY_PIXELS',
    );
  }
}

function formatMegabytes(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(0);
}

function formatMegapixels(pixels: number): string {
  return (pixels / 1_000_000).toFixed(0);
}
