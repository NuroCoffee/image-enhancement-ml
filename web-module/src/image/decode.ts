import { UserFacingError } from '../utils/errors';
import { decodeBmp } from './bmpDecoder';
import { decodeHeic } from './heicDecoder';
import type { DecodedImage, ImageFormat } from './types';

export async function decodeImage(
  file: Blob,
  format: ImageFormat,
  maxPixels = 15_000_000,
): Promise<DecodedImage> {
  try {
    if (format === 'bmp') {
      const imageData = decodeBmp(await file.arrayBuffer(), maxPixels);
      return imageDataResult(imageData);
    }
    if (format === 'heic') {
      const imageData = await decodeHeic(file);
      return imageDataResult(imageData);
    }

    const bitmap = await createImageBitmap(file, {
      imageOrientation: 'from-image',
      premultiplyAlpha: 'none',
      colorSpaceConversion: 'default',
    });
    return {
      width: bitmap.width,
      height: bitmap.height,
      source: bitmap,
      close: () => bitmap.close(),
    };
  } catch (error) {
    throw new UserFacingError('Не удалось декодировать изображение. Файл повреждён или не поддерживается.', 'DECODE_FAILED', {
      cause: error,
    });
  }
}

function imageDataResult(imageData: ImageData): DecodedImage {
  return {
    width: imageData.width,
    height: imageData.height,
    source: imageData,
    close: () => undefined,
  };
}
