export type ImageFormat = 'jpeg' | 'png' | 'heic' | 'bmp';

export interface DecodedImage {
  width: number;
  height: number;
  source: ImageBitmap | ImageData;
  close(): void;
}
