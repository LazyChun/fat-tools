/*
 * SHA-1（FIPS 180-4）：160 位摘要，大端字序。
 * 仅用于校验用途，已不适用于安全场景。
 */
import { BlockHasher, rotl32 } from "./core";

export class Sha1 extends BlockHasher {
  private readonly h = new Uint32Array([
    0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0,
  ]);
  private readonly w = new Uint32Array(80);

  constructor() {
    super(64, 20, 8, false);
  }

  protected processBlock(block: Uint8Array, offset: number): void {
    const dv = new DataView(block.buffer, block.byteOffset + offset, 64);
    const w = this.w;
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(i * 4, false);
    for (let i = 16; i < 80; i++) {
      w[i] = rotl32(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    }
    let a = this.h[0];
    let b = this.h[1];
    let c = this.h[2];
    let d = this.h[3];
    let e = this.h[4];
    for (let i = 0; i < 80; i++) {
      let f: number;
      let k: number;
      if (i < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (i < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const t = (rotl32(a, 5) + f + e + k + w[i]) >>> 0;
      e = d;
      d = c;
      c = rotl32(b, 30);
      b = a;
      a = t;
    }
    this.h[0] = (this.h[0] + a) >>> 0;
    this.h[1] = (this.h[1] + b) >>> 0;
    this.h[2] = (this.h[2] + c) >>> 0;
    this.h[3] = (this.h[3] + d) >>> 0;
    this.h[4] = (this.h[4] + e) >>> 0;
  }

  protected writeDigest(out: Uint8Array): void {
    const dv = new DataView(out.buffer, out.byteOffset, out.length);
    for (let i = 0; i < 5; i++) dv.setUint32(i * 4, this.h[i], false);
  }
}
