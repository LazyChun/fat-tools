/*
 * 哈希引擎公共基础：统一接口、字节工具与分组（Merkle–Damgård）哈希骨架。
 *
 * 所有算法实现为纯 TS 增量哈希器（update/digest），不依赖 WebCrypto，
 * 因此可对大文件做真正的流式分块计算，且在任意 JS 环境行为一致。
 */

/** 统一的增量哈希器接口 */
export interface Hasher {
  /** 喂入一段数据（可多次调用） */
  update(data: Uint8Array): this;
  /** 输出最终摘要（调用一次后不应再继续 update） */
  digest(): Uint8Array;
}

/** 文本 → UTF-8 字节 */
export function utf8Bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/** 字节 → 小写 hex */
export function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

/** hex → 字节（忽略大小写与空白） */
export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/\s+/g, "");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** 字节 → Base64 */
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/**
 * 分组哈希骨架（MD5 / SHA-1 / SHA-2 / SM3 共用）：
 * 负责跨块数据缓冲与标准填充（0x80 + 0…0 + 比特长度），
 * 子类只需实现压缩函数 processBlock 与最终状态写出 writeDigest。
 */
export abstract class BlockHasher implements Hasher {
  private readonly buf: Uint8Array;
  private buffered = 0;
  private totalBytes = 0;
  private readonly out: Uint8Array;
  /** 长度域起始偏移（blockSize - lengthFieldBytes），即 56 或 112 */
  private readonly lenFieldAt: number;

  constructor(
    readonly blockSize: number,
    readonly digestBytes: number,
    private readonly lengthFieldBytes: 8 | 16 = 8,
    private readonly littleEndianLength = false,
  ) {
    this.buf = new Uint8Array(blockSize);
    this.out = new Uint8Array(digestBytes);
    this.lenFieldAt = blockSize - lengthFieldBytes;
  }

  update(data: Uint8Array): this {
    this.totalBytes += data.length;
    let off = 0;
    // 先补满上次的残块
    if (this.buffered > 0) {
      const take = Math.min(this.blockSize - this.buffered, data.length);
      this.buf.set(data.subarray(0, take), this.buffered);
      this.buffered += take;
      off = take;
      if (this.buffered === this.blockSize) {
        this.processBlock(this.buf, 0);
        this.buffered = 0;
      }
    }
    // 整块直接处理，避免复制
    while (off + this.blockSize <= data.length) {
      this.processBlock(data, off);
      off += this.blockSize;
    }
    // 尾部残块缓存
    if (off < data.length) {
      this.buf.set(data.subarray(off), this.buffered);
      this.buffered += data.length - off;
    }
    return this;
  }

  digest(): Uint8Array {
    const bits = this.totalBytes * 8;
    const lo = bits >>> 0;
    const hi = Math.floor(bits / 0x100000000);
    // 填充：0x80 + 0…0 + 长度域；若长度域放不下则补一整块
    this.buf[this.buffered] = 0x80;
    let pos = this.buffered + 1;
    if (pos > this.lenFieldAt) {
      for (let i = pos; i < this.blockSize; i++) this.buf[i] = 0;
      this.processBlock(this.buf, 0);
      pos = 0;
    }
    for (let i = pos; i < this.lenFieldAt; i++) this.buf[i] = 0;
    const dv = new DataView(this.buf.buffer);
    if (this.lengthFieldBytes === 8) {
      if (this.littleEndianLength) {
        dv.setUint32(this.lenFieldAt, lo, true);
        dv.setUint32(this.lenFieldAt + 4, hi, true);
      } else {
        dv.setUint32(this.lenFieldAt, hi, false);
        dv.setUint32(this.lenFieldAt + 4, lo, false);
      }
    } else {
      // 128 位长度域：高 64 位恒为 0（消息长度远小于 2^61 字节）
      dv.setUint32(this.lenFieldAt, 0, false);
      dv.setUint32(this.lenFieldAt + 4, 0, false);
      dv.setUint32(this.lenFieldAt + 8, hi, false);
      dv.setUint32(this.lenFieldAt + 12, lo, false);
    }
    this.processBlock(this.buf, 0);
    this.writeDigest(this.out);
    return this.out.slice();
  }

  /** 压缩函数：处理 block 从 offset 开始的一个完整分组 */
  protected abstract processBlock(block: Uint8Array, offset: number): void;

  /** 把最终内部状态按各算法的字节序写出到 out（长度 = digestBytes） */
  protected abstract writeDigest(out: Uint8Array): void;
}

/** 32 位循环左移 */
export function rotl32(x: number, n: number): number {
  return ((x << n) | (x >>> (32 - n))) >>> 0;
}

/** 32 位循环右移（SHA-2 家族使用） */
export function rotr32(x: number, n: number): number {
  if (n === 0) return x >>> 0;
  return ((x >>> n) | (x << (32 - n))) >>> 0;
}
