import { describe, expect, it } from 'vitest';
import { decodeBmp } from '../src/image/bmpDecoder';

describe('decodeBmp', () => {
  it('decodes a 1x1 24-bit BMP pixel', () => {
    const bytes = new Uint8Array(58);
    const view = new DataView(bytes.buffer);
    view.setUint16(0, 0x4d42, true);
    view.setUint32(2, bytes.length, true);
    view.setUint32(10, 54, true);
    view.setUint32(14, 40, true);
    view.setInt32(18, 1, true);
    view.setInt32(22, 1, true);
    view.setUint16(26, 1, true);
    view.setUint16(28, 24, true);
    view.setUint32(30, 0, true);
    bytes.set([30, 20, 10, 0], 54); // BGR + padding

    const result = decodeBmp(bytes.buffer);
    expect(result.width).toBe(1);
    expect(result.height).toBe(1);
    expect(Array.from(result.data)).toEqual([10, 20, 30, 255]);
  });
});
