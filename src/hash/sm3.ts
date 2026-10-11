/*
 * SM3 密码杂凑算法（GB/T 32905-2016 / GM/T 0004-2012）：256 位摘要。
 * 用于商用密码（国密）场景，结构与 SHA-256 类似但轮函数独立。
 */
import { BlockHasher, rotl32 } from "./core";

/** 常量 T_j：前 16 轮与后 48 轮各用一个 */
const T0 = 0x79cc4519;
const T1 = 0x7a879d8a;

function p0(x: number): number {
  return (x ^ rotl32(x, 9) ^ rotl32(x, 17)) >>> 0;
}

function p1(x: number): number {
  return (x ^ rotl32(x, 15) ^ rotl32(x, 23)) >>> 0;
}

export class Sm3 extends BlockHasher {
  private readonly v = new Uint32Array([
    0x7380166f, 0x4914b2b9, 0x172442d7, 0xda8a0600, 0xa96f30bc, 0x163138aa,
    0xe38dee4d, 0xb0fb0e4e,
  ]);
  private readonly w = new Uint32Array(68);
  private readonly wp = new Uint32Array(64);

  constructor() {
    super(64, 32, 8, false);
  }

  protected processBlock(block: Uint8Array, offset: number): void {
    const dv = new DataView(block.buffer, block.byteOffset + offset, 64);
    const w = this.w;
    const wp = this.wp;
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(i * 4, false);
    for (let i = 16; i < 68; i++) {
      // W[i] = P1(W[i-16] ^ W[i-9] ^ rotl(W[i-3],15)) ^ rotl(W[i-13],7) ^ W[i-6]
      w[i] =
        (p1((w[i - 16] ^ w[i - 9] ^ rotl32(w[i - 3], 15)) >>> 0) ^
          rotl32(w[i - 13], 7) ^
          w[i - 6]) >>>
        0;
    }
    for (let i = 0; i < 64; i++) wp[i] = (w[i] ^ w[i + 4]) >>> 0;

    let a = this.v[0];
    let b = this.v[1];
    let c = this.v[2];
    let d = this.v[3];
    let e = this.v[4];
    let f = this.v[5];
    let g = this.v[6];
    let h = this.v[7];
    for (let j = 0; j < 64; j++) {
      const t = j < 16 ? T0 : T1;
      // ss1 = rotl(rotl(a,12) + e + rotl(T, j), 7)
      const ss1 = rotl32((rotl32(a, 12) + e + rotl32(t, j)) >>> 0, 7);
      const ss2 = (ss1 ^ rotl32(a, 12)) >>> 0;
      // tt1 = FF_j(a,b,c) + d + ss2 + W'[j]
      const ff = j < 16 ? a ^ b ^ c : (a & b) | (a & c) | (b & c);
      const tt1 = (ff + d + ss2 + wp[j]) >>> 0;
      // tt2 = GG_j(e,f,g) + h + ss1 + W[j]
      const gg = j < 16 ? e ^ f ^ g : (e & f) | (~e & g);
      const tt2 = (gg + h + ss1 + w[j]) >>> 0;
      d = c;
      c = rotl32(b, 9);
      b = a;
      a = tt1;
      h = g;
      g = rotl32(f, 19);
      f = e;
      e = p0(tt2);
    }
    this.v[0] ^= a;
    this.v[1] ^= b;
    this.v[2] ^= c;
    this.v[3] ^= d;
    this.v[4] ^= e;
    this.v[5] ^= f;
    this.v[6] ^= g;
    this.v[7] ^= h;
    for (let i = 0; i < 8; i++) this.v[i] = this.v[i] >>> 0;
  }

  protected writeDigest(out: Uint8Array): void {
    const dv = new DataView(out.buffer, out.byteOffset, 32);
    for (let i = 0; i < 8; i++) dv.setUint32(i * 4, this.v[i], false);
  }
}
