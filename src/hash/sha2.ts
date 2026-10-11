/*
 * SHA-2 家族（FIPS 180-4）：
 *  - SHA-224 / SHA-256：32 位字，512 位分组
 *  - SHA-384 / SHA-512：64 位字（以 hi/lo 双 32 位模拟），1024 位分组
 */
import { BlockHasher, rotr32 } from "./core";

/* ------------------------------------------------------------------ */
/* SHA-224 / SHA-256                                                   */
/* ------------------------------------------------------------------ */

const K256 = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const IV256 = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
  0x1f83d9ab, 0x5be0cd19,
]);

const IV224 = new Uint32Array([
  0xc1059ed8, 0x367cd507, 0x3070dd17, 0xf70e5939, 0xffc00b31, 0x68581511,
  0x64f98fa7, 0xbefa4fa4,
]);

abstract class Sha256Base extends BlockHasher {
  protected readonly h: Uint32Array;
  private readonly w = new Uint32Array(64);

  constructor(iv: Uint32Array, digestBytes: number) {
    super(64, digestBytes, 8, false);
    this.h = new Uint32Array(iv);
  }

  protected processBlock(block: Uint8Array, offset: number): void {
    const dv = new DataView(block.buffer, block.byteOffset + offset, 64);
    const w = this.w;
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(i * 4, false);
    for (let i = 16; i < 64; i++) {
      const x = w[i - 15];
      const y = w[i - 2];
      const s0 = (rotr32(x, 7) ^ rotr32(x, 18) ^ (x >>> 3)) >>> 0;
      const s1 = (rotr32(y, 17) ^ rotr32(y, 19) ^ (y >>> 10)) >>> 0;
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let a = this.h[0];
    let b = this.h[1];
    let c = this.h[2];
    let d = this.h[3];
    let e = this.h[4];
    let f = this.h[5];
    let g = this.h[6];
    let h = this.h[7];
    for (let i = 0; i < 64; i++) {
      const S1 = (rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const t1 = (h + S1 + ch + K256[i] + w[i]) >>> 0;
      const S0 = (rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const t2 = (S0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    this.h[0] = (this.h[0] + a) >>> 0;
    this.h[1] = (this.h[1] + b) >>> 0;
    this.h[2] = (this.h[2] + c) >>> 0;
    this.h[3] = (this.h[3] + d) >>> 0;
    this.h[4] = (this.h[4] + e) >>> 0;
    this.h[5] = (this.h[5] + f) >>> 0;
    this.h[6] = (this.h[6] + g) >>> 0;
    this.h[7] = (this.h[7] + h) >>> 0;
  }

  protected writeDigest(out: Uint8Array): void {
    const dv = new DataView(out.buffer, out.byteOffset, out.length);
    for (let i = 0; i * 4 < out.length; i++) {
      dv.setUint32(i * 4, this.h[i], false);
    }
  }
}

export class Sha224 extends Sha256Base {
  constructor() {
    super(IV224, 28);
  }
}

export class Sha256 extends Sha256Base {
  constructor() {
    super(IV256, 32);
  }
}

/* ------------------------------------------------------------------ */
/* SHA-384 / SHA-512（64 位字以 [hi, lo] 双 32 位模拟）                 */
/* ------------------------------------------------------------------ */

/** 64 位循环右移结果写入 out[0]=hi out[1]=lo（out 为复用暂存） */
function rotr64To(out: number[], hi: number, lo: number, n: number): void {
  if (n === 0) {
    out[0] = hi;
    out[1] = lo;
    return;
  }
  if (n < 32) {
    out[0] = ((hi >>> n) | (lo << (32 - n))) >>> 0;
    out[1] = ((lo >>> n) | (hi << (32 - n))) >>> 0;
    return;
  }
  if (n === 32) {
    out[0] = lo;
    out[1] = hi;
    return;
  }
  const m = n - 32;
  out[0] = ((lo >>> m) | (hi << (32 - m))) >>> 0;
  out[1] = ((hi >>> m) | (lo << (32 - m))) >>> 0;
}

/** 模块级暂存（同步执行，无重入风险） */
const R = [0, 0];

/** K 常量与初始向量按标准 hex 串解析：每个 64 位常量产出 (hi, lo) 两个 32 位字 */
function parse64(hex: string): Uint32Array {
  const count = hex.length / 16; // 64 位常量个数
  const out = new Uint32Array(count * 2);
  for (let i = 0; i < count; i++) {
    out[2 * i] = parseInt(hex.slice(i * 16, i * 16 + 8), 16);
    out[2 * i + 1] = parseInt(hex.slice(i * 16 + 8, i * 16 + 16), 16);
  }
  return out;
}

const K512_HEX =
  "428a2f98d728ae227137449123ef65cdb5c0fbcfec4d3b2fe9b5dba58189dbbc" +
  "3956c25bf348b53859f111f1b605d019923f82a4af194f9bab1c5ed5da6d8118" +
  "d807aa98a303024212835b0145706fbe243185be4ee4b28c550c7dc3d5ffb4e2" +
  "72be5d74f27b896f80deb1fe3b1696b19bdc06a725c71235c19bf174cf692694" +
  "e49b69c19ef14ad2efbe4786384f25e30fc19dc68b8cd5b5240ca1cc77ac9c65" +
  "2de92c6f592b02754a7484aa6ea6e4835cb0a9dcbd41fbd476f988da831153b5" +
  "983e5152ee66dfaba831c66d2db43210b00327c898fb213fbf597fc7beef0ee4" +
  "c6e00bf33da88fc2d5a79147930aa72506ca6351e003826f142929670a0e6e70" +
  "27b70a8546d22ffc2e1b21385c26c9264d2c6dfc5ac42aed53380d139d95b3df" +
  "650a73548baf63de766a0abb3c77b2a881c2c92e47edaee692722c851482353b" +
  "a2bfe8a14cf10364a81a664bbc423001c24b8b70d0f89791c76c51a30654be30" +
  "d192e819d6ef5218d69906245565a910f40e35855771202a106aa07032bbd1b8" +
  "19a4c116b8d2d0c81e376c085141ab532748774cdf8eeb9934b0bcb5e19b48a8" +
  "391c0cb3c5c95a634ed8aa4ae3418acb5b9cca4f7763e373682e6ff3d6b2b8a3" +
  "748f82ee5defb2fc78a5636f43172f6084c87814a1f0ab728cc702081a6439ec" +
  "90befffa23631e28a4506cebde82bde9bef9a3f7b2c67915c67178f2e372532b" +
  "ca273eceea26619cd186b8c721c0c207eada7dd6cde0eb1ef57d4f7fee6ed178" +
  "06f067aa72176fba0a637dc5a2c898a6113f9804bef90dae1b710b35131c471b" +
  "28db77f523047d8432caab7b40c724933c9ebe0a15c9bebc431d67c49c100d4c" +
  "4cc5d4becb3e42b6597f299cfc657e2a5fcb6fab3ad6faec6c44198c4a475817";

const K512 = parse64(K512_HEX); // 160 个 32 位：80 个常量的 (hi, lo)

const IV512 = parse64(
  "6a09e667f3bcc908bb67ae8584caa73b3c6ef372fe94f82ba54ff53a5f1d36f1" +
    "510e527fade682d19b05688c2b3e6c1f1f83d9abfb41bd6b5be0cd19137e2179",
);

const IV384 = parse64(
  "cbbb9d5dc1059ed8629a292a367cd5079159015a3070dd17152fecd8f70e5939" +
    "67332667ffc00b318eb44a8768581511db0c2e0d64f98fa747b5481dbefa4fa4",
);

abstract class Sha512Base extends BlockHasher {
  /** 8 个寄存器 × (hi, lo) */
  protected readonly h: Uint32Array;
  /** 80 个消息字 × (hi, lo) */
  private readonly w = new Uint32Array(160);

  constructor(iv: Uint32Array, digestBytes: number) {
    super(128, digestBytes, 16, false);
    this.h = new Uint32Array(iv);
  }

  protected processBlock(block: Uint8Array, offset: number): void {
    const dv = new DataView(block.buffer, block.byteOffset + offset, 128);
    const w = this.w;
    for (let i = 0; i < 16; i++) {
      w[2 * i] = dv.getUint32(i * 8, false);
      w[2 * i + 1] = dv.getUint32(i * 8 + 4, false);
    }
    for (let i = 16; i < 80; i++) {
      // s0 = rotr(w[i-15],1) ^ rotr(w[i-15],8) ^ shr(w[i-15],7)
      const xh = w[2 * i - 30];
      const xl = w[2 * i - 29];
      rotr64To(R, xh, xl, 1);
      let s0h = R[0];
      let s0l = R[1];
      rotr64To(R, xh, xl, 8);
      s0h = (s0h ^ R[0]) >>> 0;
      s0l = (s0l ^ R[1]) >>> 0;
      const sh7h = xh >>> 7;
      const sh7l = ((xh << 25) | (xl >>> 7)) >>> 0;
      s0h = (s0h ^ sh7h) >>> 0;
      s0l = (s0l ^ sh7l) >>> 0;
      // s1 = rotr(w[i-2],19) ^ rotr(w[i-2],61) ^ shr(w[i-2],6)
      const yh = w[2 * i - 4];
      const yl = w[2 * i - 3];
      rotr64To(R, yh, yl, 19);
      let s1h = R[0];
      let s1l = R[1];
      rotr64To(R, yh, yl, 61);
      s1h = (s1h ^ R[0]) >>> 0;
      s1l = (s1l ^ R[1]) >>> 0;
      const sh6h = yh >>> 6;
      const sh6l = ((yh << 26) | (yl >>> 6)) >>> 0;
      s1h = (s1h ^ sh6h) >>> 0;
      s1l = (s1l ^ sh6l) >>> 0;
      // w[i] = w[i-16] + s0 + w[i-7] + s1
      let lo = (w[2 * i - 31] + s0l) >>> 0;
      let hi = (w[2 * i - 32] + s0h + (lo < w[2 * i - 31] ? 1 : 0)) >>> 0;
      const l2 = (w[2 * i - 13] + lo) >>> 0;
      hi = (hi + w[2 * i - 14] + (l2 < lo ? 1 : 0)) >>> 0;
      const l3 = (s1l + l2) >>> 0;
      hi = (hi + s1h + (l3 < l2 ? 1 : 0)) >>> 0;
      w[2 * i] = hi;
      w[2 * i + 1] = l3;
    }

    let ah = this.h[0];
    let al = this.h[1];
    let bh = this.h[2];
    let bl = this.h[3];
    let ch = this.h[4];
    let cl = this.h[5];
    let dh = this.h[6];
    let dl = this.h[7];
    let eh = this.h[8];
    let el = this.h[9];
    let fh = this.h[10];
    let fl = this.h[11];
    let gh = this.h[12];
    let gl = this.h[13];
    let hh = this.h[14];
    let hl = this.h[15];

    for (let i = 0; i < 80; i++) {
      // S1 = rotr(e,14) ^ rotr(e,18) ^ rotr(e,41)
      rotr64To(R, eh, el, 14);
      let s1h = R[0];
      let s1l = R[1];
      rotr64To(R, eh, el, 18);
      s1h = (s1h ^ R[0]) >>> 0;
      s1l = (s1l ^ R[1]) >>> 0;
      rotr64To(R, eh, el, 41);
      s1h = (s1h ^ R[0]) >>> 0;
      s1l = (s1l ^ R[1]) >>> 0;
      // ch = (e & f) ^ (~e & g)
      const cth = ((eh & fh) ^ (~eh & gh)) >>> 0;
      const ctl = ((el & fl) ^ (~el & gl)) >>> 0;
      // temp1 = h + S1 + ch + K[i] + W[i]
      let t1l = (hl + s1l) >>> 0;
      let t1h = (hh + s1h + (t1l < hl ? 1 : 0)) >>> 0;
      const l2 = (ctl + t1l) >>> 0;
      t1h = (t1h + cth + (l2 < t1l ? 1 : 0)) >>> 0;
      const l3 = (K512[2 * i + 1] + l2) >>> 0;
      t1h = (t1h + K512[2 * i] + (l3 < l2 ? 1 : 0)) >>> 0;
      const l4 = (w[2 * i + 1] + l3) >>> 0;
      t1h = (t1h + w[2 * i] + (l4 < l3 ? 1 : 0)) >>> 0;
      t1l = l4;
      // S0 = rotr(a,28) ^ rotr(a,34) ^ rotr(a,39)
      rotr64To(R, ah, al, 28);
      let s0h = R[0];
      let s0l = R[1];
      rotr64To(R, ah, al, 34);
      s0h = (s0h ^ R[0]) >>> 0;
      s0l = (s0l ^ R[1]) >>> 0;
      rotr64To(R, ah, al, 39);
      s0h = (s0h ^ R[0]) >>> 0;
      s0l = (s0l ^ R[1]) >>> 0;
      // maj = (a&b) ^ (a&c) ^ (b&c)
      const mjh = ((ah & bh) ^ (ah & ch) ^ (bh & ch)) >>> 0;
      const mjl = ((al & bl) ^ (al & cl) ^ (bl & cl)) >>> 0;
      // temp2 = S0 + maj
      let t2l = (s0l + mjl) >>> 0;
      let t2h = (s0h + mjh + (t2l < s0l ? 1 : 0)) >>> 0;
      // 旋转寄存器
      hh = gh;
      hl = gl;
      gh = fh;
      gl = fl;
      fh = eh;
      fl = el;
      const el2 = (dl + t1l) >>> 0;
      const eh2 = (dh + t1h + (el2 < dl ? 1 : 0)) >>> 0;
      eh = eh2;
      el = el2;
      dh = ch;
      dl = cl;
      ch = bh;
      cl = bl;
      bh = ah;
      bl = al;
      const al2 = (t1l + t2l) >>> 0;
      const ah2 = (t1h + t2h + (al2 < t1l ? 1 : 0)) >>> 0;
      ah = ah2;
      al = al2;
    }

    // V += a..h（逐寄存器带进位）
    this.addReg(0, ah, al);
    this.addReg(2, bh, bl);
    this.addReg(4, ch, cl);
    this.addReg(6, dh, dl);
    this.addReg(8, eh, el);
    this.addReg(10, fh, fl);
    this.addReg(12, gh, gl);
    this.addReg(14, hh, hl);
  }

  private addReg(idx: number, vh: number, vl: number): void {
    const lo = (this.h[idx + 1] + vl) >>> 0;
    this.h[idx] = (this.h[idx] + vh + (lo < this.h[idx + 1] ? 1 : 0)) >>> 0;
    this.h[idx + 1] = lo;
  }

  protected writeDigest(out: Uint8Array): void {
    const dv = new DataView(out.buffer, out.byteOffset, out.length);
    const regs = out.length / 8;
    for (let i = 0; i < regs; i++) {
      dv.setUint32(i * 8, this.h[2 * i], false);
      dv.setUint32(i * 8 + 4, this.h[2 * i + 1], false);
    }
  }
}

export class Sha384 extends Sha512Base {
  constructor() {
    super(IV384, 48);
  }
}

export class Sha512 extends Sha512Base {
  constructor() {
    super(IV512, 64);
  }
}
