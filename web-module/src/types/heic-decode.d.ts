declare module 'heic-decode' {
  interface DecodeInput {
    buffer: Uint8Array;
  }
  interface DecodeResult {
    width: number;
    height: number;
    data: Uint8ClampedArray;
  }
  const decode: (input: DecodeInput) => Promise<DecodeResult>;
  export default decode;
}
