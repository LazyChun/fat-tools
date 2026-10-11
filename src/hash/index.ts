/*
 * 哈希计算模块入口：算法注册表 + 文本/文件哈希高层 API。
 *
 * 全部算法为纯 TS 增量实现（见 core/md5/sha1/sha2/sha3/sm3/crc32），
 * 文件哈希采用流式分块单遍读取，多算法同时喂入，内存占用恒定。
 */
import { bytesToBase64, bytesToHex, hexToBytes, utf8Bytes, type Hasher } from "./core";
import { Crc32 } from "./crc32";
import { Md5 } from "./md5";
import { Sha1 } from "./sha1";
import { Sha224, Sha256, Sha384, Sha512 } from "./sha2";
import { Sha3_224, Sha3_256, Sha3_384, Sha3_512 } from "./sha3";
import { Sm3 } from "./sm3";

export type HashAlgorithm =
  | "CRC-32"
  | "MD5"
  | "SHA-1"
  | "SHA-224"
  | "SHA-256"
  | "SHA-384"
  | "SHA-512"
  | "SHA3-224"
  | "SHA3-256"
  | "SHA3-384"
  | "SHA3-512"
  | "SM3";

export interface HashAlgorithmMeta {
  id: HashAlgorithm;
  /** 算法家族（用于分组展示） */
  family: string;
  /** 摘要字节数 */
  digestBytes: number;
  /** 是否已不适用于安全场景（仅校验用途） */
  legacy?: boolean;
  create: () => Hasher;
}

/** 全部可用算法（展示顺序即注册顺序） */
export const HASH_ALGORITHMS: HashAlgorithmMeta[] = [
  { id: "MD5", family: "MD5", digestBytes: 16, legacy: true, create: () => new Md5() },
  { id: "SHA-1", family: "SHA-1", digestBytes: 20, legacy: true, create: () => new Sha1() },
  { id: "SHA-224", family: "SHA-2", digestBytes: 28, create: () => new Sha224() },
  { id: "SHA-256", family: "SHA-2", digestBytes: 32, create: () => new Sha256() },
  { id: "SHA-384", family: "SHA-2", digestBytes: 48, create: () => new Sha384() },
  { id: "SHA-512", family: "SHA-2", digestBytes: 64, create: () => new Sha512() },
  { id: "SHA3-224", family: "SHA-3", digestBytes: 28, create: () => new Sha3_224() },
  { id: "SHA3-256", family: "SHA-3", digestBytes: 32, create: () => new Sha3_256() },
  { id: "SHA3-384", family: "SHA-3", digestBytes: 48, create: () => new Sha3_384() },
  { id: "SHA3-512", family: "SHA-3", digestBytes: 64, create: () => new Sha3_512() },
  { id: "SM3", family: "国密", digestBytes: 32, create: () => new Sm3() },
  { id: "CRC-32", family: "校验和", digestBytes: 4, legacy: true, create: () => new Crc32() },
];

/** 创建指定算法的增量哈希器 */
export function createHasher(algorithm: HashAlgorithm): Hasher {
  const meta = HASH_ALGORITHMS.find((m) => m.id === algorithm);
  if (!meta) throw new Error(`未知哈希算法：${algorithm}`);
  return meta.create();
}

/** 计算文本哈希（UTF-8 编码），返回 { 算法: hex小写 } */
export function hashText(
  algorithms: HashAlgorithm[],
  text: string,
): Record<string, string> {
  const bytes = utf8Bytes(text);
  const hashes: Record<string, string> = {};
  for (const id of algorithms) {
    hashes[id] = bytesToHex(createHasher(id).update(bytes).digest());
  }
  return hashes;
}

/* ------------------------------------------------------------------ */
/* 文件哈希（流式分块）                                                 */
/* ------------------------------------------------------------------ */

/** 默认分块大小：8MB */
export const FILE_CHUNK_BYTES = 8 * 1024 * 1024;

/** 用户主动取消时抛出的错误 */
export class HashCancelledError extends Error {
  constructor() {
    super("已取消");
    this.name = "HashCancelledError";
  }
}

export interface HashFileOptions {
  /** 进度回调（0-100） */
  onProgress?: (percent: number) => void;
  /** 返回 true 时中止计算并抛出 HashCancelledError（分块间隙检查） */
  shouldCancel?: () => boolean;
  /** 分块大小（字节），默认 8MB */
  chunkBytes?: number;
}

export interface FileHashResult {
  name: string;
  size: number;
  /** { 算法: hex小写 } */
  hashes: Record<string, string>;
  /** 计算耗时（毫秒） */
  durationMs: number;
}

/**
 * 计算本地文件哈希（纯本地，不上传）：
 * 按 chunkBytes 分块流式读取，一遍 IO 同时喂入所有选中算法。
 */
export async function hashFile(
  algorithms: HashAlgorithm[],
  file: File,
  options: HashFileOptions = {},
): Promise<FileHashResult> {
  const { onProgress, shouldCancel, chunkBytes = FILE_CHUNK_BYTES } = options;
  const started = Date.now();
  const hashers = algorithms.map((id) => [id, createHasher(id)] as const);
  const total = file.size;
  if (total === 0) {
    onProgress?.(100);
  } else {
    let read = 0;
    while (read < total) {
      if (shouldCancel?.()) throw new HashCancelledError();
      const end = Math.min(read + chunkBytes, total);
      const buf = new Uint8Array(await file.slice(read, end).arrayBuffer());
      for (const [, hasher] of hashers) hasher.update(buf);
      read = end;
      onProgress?.(Math.round((read / total) * 100));
    }
  }
  const hashes: Record<string, string> = {};
  for (const [id, hasher] of hashers) hashes[id] = bytesToHex(hasher.digest());
  return { name: file.name, size: total, hashes, durationMs: Date.now() - started };
}

/* ------------------------------------------------------------------ */
/* 展示辅助                                                            */
/* ------------------------------------------------------------------ */

export type HashOutputFormat = "lower" | "upper" | "base64";

/** 按输出格式化摘要（hex 小写 / hex 大写 / Base64） */
export function formatDigest(hex: string, format: HashOutputFormat): string {
  if (format === "upper") return hex.toUpperCase();
  if (format === "base64") return bytesToBase64(hexToBytes(hex));
  return hex;
}

/** 期望值比对：支持 hex（忽略大小写与空白）与 Base64 三种形态 */
export function matchesExpected(hex: string, expected: string): boolean {
  const e = expected.replace(/\s+/g, "");
  if (!e) return false;
  return e === hex || e === hex.toUpperCase() || e === bytesToBase64(hexToBytes(hex));
}

/** 文件大小可读化 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}
