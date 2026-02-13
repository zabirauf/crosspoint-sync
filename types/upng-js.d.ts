declare module 'upng-js' {
  interface DecodedImage {
    width: number;
    height: number;
    depth: number;
    ctype: number;
    frames: Array<{
      rect: { x: number; y: number; width: number; height: number };
      delay: number;
      dispose: number;
      blend: number;
      data?: ArrayBuffer;
    }>;
    tabs: Record<string, unknown>;
    data: ArrayBuffer;
  }

  function decode(buffer: ArrayBuffer): DecodedImage;
  function toRGBA8(image: DecodedImage): ArrayBuffer[];
  function encode(
    imgs: ArrayBuffer[],
    w: number,
    h: number,
    cnum: number,
    dels?: number[],
    forbidPlte?: boolean,
  ): ArrayBuffer;

  export { decode, toRGBA8, encode, DecodedImage };
  export default { decode, toRGBA8, encode };
}
