/*
 * CRC-32（IEEE 802.3，反射多项式 0xEDB88320）：
 * 32 位循环冗余校验，用于数据完整性检查，不是密码学哈希。
 */
import type { Hasher } from "./core";

const TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  TABLE[n] = c >>> 0;
}

export class Crc32 implements Hasher {
  private crc = 0xffffffff;

  update(data: Uint8Array): this {
    let c = this.crc;
    for (let i = 0; i < data.length; i++) {
      c = TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
    }
    this.crc = c;
    return this;
  }

  digest(): Uint8Array {
    const v = (this.crc ^ 0xffffffff) >>> 0;
    return new Uint8Array([
      (v >>> 24) & 0xff,
      (v >>> 16) & 0xff,
      (v >>> 8) & 0xff,
      v & 0xff,
    ]);
  }
}
