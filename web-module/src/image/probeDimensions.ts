import type { ImageFormat } from './types';

export interface ImageDimensions {
  width: number;
  height: number;
}

const JPEG_PROBE_LIMIT = 1024 * 1024;
const SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3,
  0xc5, 0xc6, 0xc7,
  0xc9, 0xca, 0xcb,
  0xcd, 0xce, 0xcf,
]);

export async function probeEncodedDimensions(
  file: Blob,
  format: ImageFormat,
): Promise<ImageDimensions | null> {
  if (format === 'png') {
    const bytes = new Uint8Array(await file.slice(0, 24).arrayBuffer());
    if (bytes.length < 24) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: view.getUint32(16, false), height: view.getUint32(20, false) };
  }

  if (format === 'bmp') {
    const bytes = new Uint8Array(await file.slice(0, 26).arrayBuffer());
    if (bytes.length < 26) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return {
      width: view.getInt32(18, true),
      height: Math.abs(view.getInt32(22, true)),
    };
  }

  if (format === 'jpeg') {
    const bytes = new Uint8Array(
      await file.slice(0, Math.min(file.size, JPEG_PROBE_LIMIT)).arrayBuffer(),
    );
    return probeJpegDimensions(bytes);
  }

  // HEIC dimensions are obtained from libheif during decode.
  return null;
}

export function probeJpegDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;

  while (offset + 3 < bytes.length) {
    while (offset < bytes.length && bytes[offset] !== 0xff) offset += 1;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) return null;

    const marker = bytes[offset++];
    if (marker === 0xd9 || marker === 0xda) return null;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 1 >= bytes.length) return null;

    const segmentLength = (bytes[offset] << 8) | bytes[offset + 1];
    if (segmentLength < 2 || offset + segmentLength > bytes.length) return null;
    if (SOF_MARKERS.has(marker)) {
      if (segmentLength < 7) return null;
      const height = (bytes[offset + 3] << 8) | bytes[offset + 4];
      const width = (bytes[offset + 5] << 8) | bytes[offset + 6];
      return { width, height };
    }
    offset += segmentLength;
  }
  return null;
}
