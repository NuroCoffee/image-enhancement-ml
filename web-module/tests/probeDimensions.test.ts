import { Blob as NodeBlob } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import { probeEncodedDimensions, probeJpegDimensions } from '../src/image/probeDimensions';

describe('probeEncodedDimensions', () => {
  it('reads PNG dimensions', async () => {
    const bytes = new Uint8Array(24);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const view = new DataView(bytes.buffer);
    view.setUint32(16, 640, false);
    view.setUint32(20, 480, false);
    await expect(probeEncodedDimensions(new NodeBlob([bytes]) as unknown as Blob, 'png')).resolves.toEqual({
      width: 640,
      height: 480,
    });
  });

  it('reads JPEG SOF dimensions', () => {
    const bytes = new Uint8Array([
      0xff, 0xd8,
      0xff, 0xe0, 0x00, 0x04, 0x00, 0x00,
      0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0xe0, 0x02, 0x80,
      0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
    ]);
    expect(probeJpegDimensions(bytes)).toEqual({ width: 640, height: 480 });
  });
});
