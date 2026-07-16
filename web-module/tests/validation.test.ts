import { describe, expect, it } from 'vitest';
import { detectImageFormat } from '../src/image/fileSignature';
import { validateEncodedFile, validateDimensions } from '../src/image/validation';

describe('image validation', () => {
  it('detects supported signatures', () => {
    expect(detectImageFormat(new Uint8Array([0xff, 0xd8, 0xff]))).toBe('jpeg');
    expect(detectImageFormat(new Uint8Array([0x42, 0x4d]))).toBe('bmp');
    expect(detectImageFormat(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('png');
  });

  it('rejects a file larger than the limit', async () => {
    const blob = new Blob([new Uint8Array(10)]);
    await expect(validateEncodedFile(blob, 5)).rejects.toThrow(/превышает/i);
  });

  it('rejects an image above the pixel limit', () => {
    expect(() => validateDimensions(5000, 4000, 15_000_000)).toThrow(/превышает/i);
  });
});
