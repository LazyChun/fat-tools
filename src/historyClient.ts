/*
 * 工具操作记录客户端
 *
 * 所有工具的操作记录统一落库（专用 SQLite：<workspace>/fatTools/history.db，
 * 由 Python 后端 historyStore 维护）。后端不可用时自动降级到 localStorage，
 * 保证 UI 功能不受宿主环境差异影响。
 */
import type { FatNotesPluginSDK } from "fat-notes-sdk";

export interface HistoryRecord {
  id: number;
  toolId: string;
  toolTitle: string;
  action: string;
  summary: string;
  detail: Record<string, unknown>;
  createdAt: string;
}

export interface HistoryListResult {
  items: HistoryRecord[];
  total: number;
  limit: number;
}

export interface HistoryStats {
  total: number;
  items: { toolId: string; toolTitle: string; count: number }[];
}

const LS_KEY = "fat-tools.history";
const LS_MAX = 200;

// 模块级 SDK 引用：activate 时通过 initHistoryClient(sdk) 注入，
// 工具组件内直接调 recordUsage/listHistory 等即可，无需层层传参。
let sdkRef: FatNotesPluginSDK | null = null;

export function initHistoryClient(sdkInstance: FatNotesPluginSDK): void {
  sdkRef = sdkInstance;
}

/** 取已注入的 SDK 引用（未初始化返回 null） */
export function getSdk(): FatNotesPluginSDK | null {
  return sdkRef;
}

function sdk(): FatNotesPluginSDK {
  if (!sdkRef) throw new Error("[fat-tools] history client not initialized");
  return sdkRef;
}

/** 后端是否可用（探测失败后短时间不再重试） */
let backendAvailable: boolean | null = null;
let backendCheckAt = 0;

async function ensureBackend(): Promise<boolean> {
  const now = Date.now();
  if (backendAvailable !== null && now - backendCheckAt < 30_000) return backendAvailable;
  backendCheckAt = now;
  try {
    backendAvailable = await sdk().backend.isRunning();
  } catch {
    backendAvailable = false;
  }
  return backendAvailable;
}

// ── localStorage 兜底 ─────────────────────────────────────────

function lsRead(): HistoryRecord[] {
  try {
    return JSON.parse(window.localStorage.getItem(LS_KEY) || "[]");
  } catch {
    return [];
  }
}

function lsWrite(items: HistoryRecord[]): void {
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(items.slice(0, LS_MAX)));
  } catch {
    /* ignore */
  }
}

// ── 对外 API ──────────────────────────────────────────────────

export interface RecordInput {
  toolId: string;
  toolTitle: string;
  action: string;
  summary: string;
  detail?: Record<string, unknown>;
}

/** 防抖记录：用于「输入即算」类工具，停止输入 delay 毫秒后才落库，避免逐键刷库 */
const debounceTimers = new Map<string, number>();

/** 从历史恢复输入后，抑制对应防抖 key 的下一次自动落库（避免恢复动作本身污染历史） */
const suppressedKeys = new Set<string>();

export function suppressNextRecord(key: string): void {
  suppressedKeys.add(key);
}

export function recordUsageDebounced(
  key: string,
  input: () => RecordInput | null,
  delay = 1500,
): void {
  const existing = debounceTimers.get(key);
  if (existing) window.clearTimeout(existing);
  const timer = window.setTimeout(() => {
    debounceTimers.delete(key);
    if (suppressedKeys.delete(key)) return; // 恢复输入触发的本次记录被抑制
    const payload = input();
    if (payload) recordUsage(payload);
  }, delay);
  debounceTimers.set(key, timer);
}

/** 记录一次工具操作（fire-and-forget，失败静默降级） */
export function recordUsage(input: RecordInput): void {  void (async () => {
    if (await ensureBackend()) {
      try {
        await sdk().backend.invoke("history.add", input as unknown as Record<string, unknown>);
        return;
      } catch {
        backendAvailable = false;
      }
    }
    // localStorage 兜底
    const items = lsRead();
    items.unshift({
      id: Date.now(),
      toolId: input.toolId,
      toolTitle: input.toolTitle,
      action: input.action,
      summary: input.summary,
      detail: input.detail || {},
      createdAt: new Date().toISOString().slice(0, 19),
    });
    lsWrite(items);
  })();
}

/** 查询操作记录（toolId 可选；后端不可用读 localStorage） */
export async function listHistory(
  opts: { toolId?: string; limit?: number } = {},
): Promise<HistoryListResult> {
  if (await ensureBackend()) {
    try {
      const r = await sdk().backend.invoke<HistoryListResult>(
        "history.list",
        { toolId: opts.toolId, limit: opts.limit } as Record<string, unknown>,
      );
      if (r && Array.isArray(r.items)) return r;
    } catch {
      backendAvailable = false;
    }
  }
  const all = lsRead();
  const items = opts.toolId ? all.filter((i) => i.toolId === opts.toolId) : all;
  return { items: items.slice(0, opts.limit || 50), total: items.length, limit: opts.limit || 50 };
}

/** 各工具记录统计 */
export async function historyStats(): Promise<HistoryStats> {
  if (await ensureBackend()) {
    try {
      const r = await sdk().backend.invoke<HistoryStats>("history.stats", {});
      if (r && Array.isArray(r.items)) return r;
    } catch {
      backendAvailable = false;
    }
  }
  const all = lsRead();
  const map = new Map<string, { toolId: string; toolTitle: string; count: number }>();
  for (const i of all) {
    const e = map.get(i.toolId) || { toolId: i.toolId, toolTitle: i.toolTitle, count: 0 };
    e.count += 1;
    map.set(i.toolId, e);
  }
  return { total: all.length, items: Array.from(map.values()) };
}

/** 清空记录（toolId 可选） */
export async function clearHistory(toolId?: string): Promise<{ removed: number }> {
  if (await ensureBackend()) {
    try {
      return await sdk().backend.invoke<{ removed: number }>("history.clear", { toolId });
    } catch {
      backendAvailable = false;
    }
  }
  const all = lsRead();
  const kept = toolId ? all.filter((i) => i.toolId !== toolId) : [];
  const removed = all.length - kept.length;
  lsWrite(kept);
  return { removed };
}

/** SQLite 文件路径（展示用；后端不可用返回 null） */
export async function getDbPath(): Promise<string | null> {
  if (await ensureBackend()) {
    try {
      const r = await sdk().backend.invoke<{ path: string }>("history.dbPath", {});
      return r?.path || null;
    } catch {
      backendAvailable = false;
    }
  }
  return null;
}
