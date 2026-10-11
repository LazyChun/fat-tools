/*
 * MD5（RFC 1321）：128 位摘要，小端字序。
 * 仅用于校验用途，已不适用于安全场景。
 */
import { BlockHasher, rotl32 } from "./core";

const K = new Uint32Array(64);
for (let i = 0; i < 64; i++) {
  K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0;
}

const S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5,
  9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11,
  16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10,
  15, 21,
];

export class Md5 extends BlockHasher {
  private readonly h = new Uint32Array([
    0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476,
  ]);
  private readonly x = new Uint32Array(16);

  constructor() {
    super(64, 16, 8, true);
  }

  protected processBlock(block: Uint8Array, offset: number): void {
    const dv = new DataView(block.buffer, block.byteOffset + offset, 64);
    for (let i = 0; i < 16; i++) this.x[i] = dv.getUint32(i * 4, true);
    let a = this.h[0];
    let b = this.h[1];
    let c = this.h[2];
    let d = this.h[3];
    for (let i = 0; i < 64; i++) {
      let f: number;
      let g: number;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) & 15;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) & 15;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) & 15;
      }
      const tmp = d;
      d = c;
      c = b;
      b = (b + rotl32((f + a + K[i] + this.x[g]) >>> 0, S[i])) >>> 0;
      a = tmp;
    }
    this.h[0] = (this.h[0] + a) >>> 0;
    this.h[1] = (this.h[1] + b) >>> 0;
    this.h[2] = (this.h[2] + c) >>> 0;
    this.h[3] = (this.h[3] + d) >>> 0;
  }

  protected writeDigest(out: Uint8Array): void {
    const dv = new DataView(out.buffer, out.byteOffset, 16);
    for (let i = 0; i < 4; i++) dv.setUint32(i * 4, this.h[i], true);
  }
}
