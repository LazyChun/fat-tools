/*
 * SHA-3（FIPS 202，Keccak-f[1600] 海绵函数）：
 * SHA3-224 / SHA3-256 / SHA3-384 / SHA3-512。
 * 与 Merkle–Damgård 结构不同，这里按「吸收 rate 字节 → 置换」的海绵模型实现。
 */
import type { Hasher } from "./core";

/** 24 轮轮常量（64 位，hex 串解析） */
const RC_HEX = [
  "0000000000000001",
  "0000000000008082",
  "800000000000808a",
  "8000000080008000",
  "000000000000808b",
  "0000000080000001",
  "8000000080008081",
  "8000000000008009",
  "000000000000008a",
  "0000000000000088",
  "0000000080008009",
  "000000008000000a",
  "000000008000808b",
  "800000000000008b",
  "8000000000008089",
  "8000000000008003",
  "8000000000008002",
  "8000000000000080",
  "000000000000800a",
  "800000008000000a",
  "8000000080008081",
  "8000000000008080",
  "0000000080000001",
  "8000000080008008",
];

const RC_HI = new Uint32Array(24);
const RC_LO = new Uint32Array(24);
for (let i = 0; i < 24; i++) {
  RC_HI[i] = parseInt(RC_HEX[i].slice(0, 8), 16);
  RC_LO[i] = parseInt(RC_HEX[i].slice(8), 16);
}

/** ρ 步旋转偏移 r[x][y]，按 lane 下标 x + 5y 平铺 */
const RHO = [
  0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18,
  2, 61, 56, 14,
];

/** 64 位循环右移结果写入 out[0]=hi out[1]=lo */
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
const RHO_C = new Uint32Array(10);
const RHO_D = new Uint32Array(10);
const B = new Uint32Array(50);

/**
 * Keccak-f[1600] 置换：状态为 25 条 64 位 lane（以 hi/lo 双 32 位模拟）。
 * θ → ρ/π → χ → ι，共 24 轮。
 */
function keccakF1600(s: Uint32Array): void {
  for (let round = 0; round < 24; round++) {
    // θ：C[x] = 各列异或；D[x] = C[x-1] ^ ROT(C[x+1],1)（循环左移 1 位）
    for (let x = 0; x < 5; x++) {
      let hi = s[2 * x];
      let lo = s[2 * x + 1];
      for (let y = 1; y < 5; y++) {
        hi ^= s[2 * (x + 5 * y)];
        lo ^= s[2 * (x + 5 * y) + 1];
      }
      RHO_C[2 * x] = hi;
      RHO_C[2 * x + 1] = lo;
    }
    for (let x = 0; x < 5; x++) {
      const p = (x + 4) % 5; // C[x-1]
      const q = (x + 1) % 5; // C[x+1]
      // D[x] = C[x-1] ^ ROT(C[x+1], 1)，FIPS 202 的 ROT 为循环左移 1 位 = 右移 63
      rotr64To(R, RHO_C[2 * q], RHO_C[2 * q + 1], 63);
      RHO_D[2 * x] = (RHO_C[2 * p] ^ R[0]) >>> 0;
      RHO_D[2 * x + 1] = (RHO_C[2 * p + 1] ^ R[1]) >>> 0;
    }
    for (let lane = 0; lane < 25; lane++) {
      const x = lane % 5;
      s[2 * lane] ^= RHO_D[2 * x];
      s[2 * lane + 1] ^= RHO_D[2 * x + 1];
    }
    // ρ + π：B[y][(2x+3y)%5] = rotl(A[x][y], r[x][y])
    // FIPS 202 的 ρ 是循环左移 r 位；rotr64To 为右移，右移 (64-r)%64 即左移 r
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        const lane = x + 5 * y;
        rotr64To(R, s[2 * lane], s[2 * lane + 1], (64 - RHO[lane]) % 64);
        const dst = y + 5 * ((2 * x + 3 * y) % 5);
        B[2 * dst] = R[0];
        B[2 * dst + 1] = R[1];
      }
    }
    // χ：A[x,y] = B[x,y] ^ (~B[x+1,y] & B[x+2,y])
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        const l = x + 5 * y;
        const l1 = ((x + 1) % 5) + 5 * y;
        const l2 = ((x + 2) % 5) + 5 * y;
        s[2 * l] = (B[2 * l] ^ (~B[2 * l1] & B[2 * l2])) >>> 0;
        s[2 * l + 1] = (B[2 * l + 1] ^ (~B[2 * l1 + 1] & B[2 * l2 + 1])) >>> 0;
      }
    }
    // ι：A[0,0] ^= RC[round]
    s[0] = (s[0] ^ RC_HI[round]) >>> 0;
    s[1] = (s[1] ^ RC_LO[round]) >>> 0;
  }
}

/** SHA-3 哈希器：rate = 200 - 2×digestBytes 字节，域分隔 0x06 */
export class Sha3 implements Hasher {
  private readonly s = new Uint32Array(50);
  private readonly buf: Uint8Array;
  private buffered = 0;

  constructor(
    readonly digestBytes: 28 | 32 | 48 | 64,
    private readonly rate: number = 200 - 2 * digestBytes,
  ) {
    this.buf = new Uint8Array(rate);
  }

  update(data: Uint8Array): this {
    let off = 0;
    if (this.buffered > 0) {
      const take = Math.min(this.rate - this.buffered, data.length);
      this.buf.set(data.subarray(0, take), this.buffered);
      this.buffered += take;
      off = take;
      if (this.buffered === this.rate) {
        this.absorb(this.buf, 0);
        this.buffered = 0;
        this.buf.fill(0); // 清掉残留字节，保证 digest 填充区为 0
      }
    }
    while (off + this.rate <= data.length) {
      this.absorb(data, off);
      off += this.rate;
    }
    if (off < data.length) {
      this.buf.set(data.subarray(off), this.buffered);
      this.buffered += data.length - off;
    }
    return this;
  }

  /** 吸收一个 rate 字节分组并执行置换 */
  private absorb(block: Uint8Array, offset: number): void {
    const dv = new DataView(block.buffer, block.byteOffset + offset, this.rate);
    const lanes = this.rate / 8;
    for (let i = 0; i < lanes; i++) {
      // lane 为小端 64 位：s[2i] 存高 32 位、s[2i+1] 存低 32 位（与 keccakF1600 约定一致）
      this.s[2 * i] ^= dv.getUint32(8 * i + 4, true);
      this.s[2 * i + 1] ^= dv.getUint32(8 * i, true);
    }
    keccakF1600(this.s);
  }

  digest(): Uint8Array {
    // pad10*1（SHA-3 域分隔 01 → 0x06）
    this.buf[this.buffered] ^= 0x06;
    this.buf[this.rate - 1] ^= 0x80;
    this.absorb(this.buf, 0);
    // 摘要 ≤ rate，单次挤出即可；逐字节按小端取 lane 数据
    const out = new Uint8Array(this.digestBytes);
    for (let i = 0; i < this.digestBytes; i++) {
      const lane = i >> 3;
      const k = i & 7;
      // s[2*lane]=高 32 位、s[2*lane+1]=低 32 位：低 4 字节取 lo、高 4 字节取 hi
      const word = k < 4 ? this.s[2 * lane + 1] : this.s[2 * lane];
      out[i] = (word >>> (8 * (k & 3))) & 0xff;
    }
    return out;
  }
}

export class Sha3_224 extends Sha3 {
  constructor() {
    super(28);
  }
}

export class Sha3_256 extends Sha3 {
  constructor() {
    super(32);
  }
}

export class Sha3_384 extends Sha3 {
  constructor() {
    super(48);
  }
}

export class Sha3_512 extends Sha3 {
  constructor() {
    super(64);
  }
}
