interface HeicDecodedImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

type HeicDecode = (input: { buffer: Uint8Array }) => Promise<HeicDecodedImage>;

export async function decodeHeic(blob: Blob): Promise<ImageData> {
  const imported = await import('heic-decode');
  const decode = (imported.default ?? imported) as unknown as HeicDecode;
  const buffer = new Uint8Array(await blob.arrayBuffer());
  const decoded = await decode({ buffer });
  const pixels = new Uint8ClampedArray(decoded.data.length);
  pixels.set(decoded.data);
  return new ImageData(pixels, decoded.width, decoded.height);
}
