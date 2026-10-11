# 工具操作记录存储
"""
fat-tools 工具操作历史 —— 专用 SQLite 落库。

数据库文件：`<workspace>/fatTools/history.db`（与 fat-stock 的
`<workspace>/fatStock/` 约定一致，不写入宿主 confs）。

表 tool_history：
    id         自增主键
    tool_id    工具 id（如 calculator / json）
    tool_title 工具显示名（冗余，便于列表直接展示）
    action     动作（如 calculate / format / encode）
    summary    单行摘要（输入/结果截断）
    detail     JSON 字符串（可选，截断后的输入输出详情）
    created_at ISO 时间字符串（本地时区）
    created_ts Unix 时间戳（排序/清理用）
"""

from __future__ import annotations

import json
import sqlite3
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from plugin_runtime import host_get_system_paths

DB_DIR_NAME = "fatTools"
DB_FILE_NAME = "history.db"

# 每个工具最多保留的记录条数（超出后淘汰最旧）
MAX_ROWS_PER_TOOL = 500
# summary 单字段最大长度（防止大文本撑爆库）
MAX_FIELD_LEN = 2000
# detail 内嵌字符串的最大长度（需容纳完整输入以便「恢复输入值」，放宽到 20000）
MAX_DETAIL_VALUE_LEN = 20000

_lock = threading.Lock()
_conn: Optional[sqlite3.Connection] = None
_cached_root: Optional[Path] = None


def _workspace_root() -> Path:
    """宿主工作区根目录解析（与 fat-stock pathUtil 同策略，简化版）。

    优先级：进程缓存 > FAT_NOTES_LAST_CLOSED_FOLDER 环境变量 >
    宿主 systemPaths.lastClosedFolder > configAbsolutePath 父目录 >
    兜底 ~/FatNotes。
    """
    import os

    global _cached_root
    if _cached_root is not None:
        return _cached_root

    env_folder = str(os.getenv("FAT_NOTES_LAST_CLOSED_FOLDER") or "").strip()
    if env_folder:
        _cached_root = Path(env_folder)
        return _cached_root

    try:
        system_paths = host_get_system_paths() or {}
    except Exception:
        system_paths = {}

    last_closed = str(system_paths.get("lastClosedFolder") or "").strip()
    if last_closed:
        _cached_root = Path(last_closed)
        return _cached_root

    config_path = str(system_paths.get("configAbsolutePath") or "").strip()
    if config_path:
        _cached_root = Path(config_path).parent
        return _cached_root

    _cached_root = Path.home() / "FatNotes"
    return _cached_root


def _db_path() -> Path:
    return _workspace_root() / DB_DIR_NAME / DB_FILE_NAME


def _get_conn() -> sqlite3.Connection:
    global _conn
    if _conn is not None:
        return _conn
    path = _db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path), check_same_thread=False)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS tool_history (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            tool_id     TEXT NOT NULL,
            tool_title  TEXT NOT NULL DEFAULT '',
            action      TEXT NOT NULL DEFAULT '',
            summary     TEXT NOT NULL DEFAULT '',
            detail      TEXT NOT NULL DEFAULT '',
            created_at  TEXT NOT NULL,
            created_ts  REAL NOT NULL
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_tool_history_tool ON tool_history(tool_id, created_ts DESC)"
    )
    conn.commit()
    _conn = conn
    return conn


def _truncate(value: Any, limit: int = MAX_FIELD_LEN) -> str:
    if value is None:
        return ""
    text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
    if len(text) > limit:
        return text[:limit] + "…"
    return text


def _clean_detail(detail: Any) -> str:
    """detail 允许传任意 JSON 对象，逐字段截断后整体序列化。"""
    if detail in (None, "", {}):
        return ""
    if isinstance(detail, str):
        return _truncate(detail)
    if isinstance(detail, dict):
        cleaned: Dict[str, Any] = {}
        for k, v in list(detail.items())[:20]:
            if isinstance(v, str):
                cleaned[str(k)[:100]] = _truncate(v, MAX_DETAIL_VALUE_LEN)
            else:
                # 能完整序列化就保留原生类型（数组/数字/布尔），否则才截断
                try:
                    text = json.dumps(v, ensure_ascii=False)
                except Exception:
                    cleaned[str(k)[:100]] = _truncate(v, MAX_DETAIL_VALUE_LEN)
                    continue
                if len(text) <= MAX_DETAIL_VALUE_LEN:
                    cleaned[str(k)[:100]] = v
                else:
                    try:
                        cleaned[str(k)[:100]] = json.loads(_truncate(text, MAX_DETAIL_VALUE_LEN))
                    except Exception:
                        cleaned[str(k)[:100]] = _truncate(text, MAX_DETAIL_VALUE_LEN)
        return json.dumps(cleaned, ensure_ascii=False)
    return _truncate(detail)


def add_record(params: Dict[str, Any]) -> Dict[str, Any]:
    """写入一条操作记录，并按 MAX_ROWS_PER_TOOL 修剪该工具的旧记录。"""
    tool_id = str(params.get("toolId") or "").strip()
    if not tool_id:
        raise ValueError("toolId is required")
    tool_title = _truncate(params.get("toolTitle") or tool_id, 100)
    action = _truncate(params.get("action") or "run", 100)
    summary = _truncate(params.get("summary") or "")
    detail = _clean_detail(params.get("detail"))

    now_ts = time.time()
    now_at = datetime.fromtimestamp(now_ts).isoformat(timespec="seconds")

    with _lock:
        conn = _get_conn()
        cur = conn.execute(
            "INSERT INTO tool_history (tool_id, tool_title, action, summary, detail, created_at, created_ts)"
            " VALUES (?, ?, ?, ?, ?, ?, ?)",
            (tool_id, tool_title, action, summary, detail, now_at, now_ts),
        )
        record_id = cur.lastrowid
        conn.execute(
            """
            DELETE FROM tool_history
             WHERE tool_id = ?
               AND id NOT IN (
                   SELECT id FROM tool_history WHERE tool_id = ?
                   ORDER BY created_ts DESC, id DESC LIMIT ?
               )
            """,
            (tool_id, tool_id, MAX_ROWS_PER_TOOL),
        )
        conn.commit()

    return {"id": record_id, "createdAt": now_at}


def list_records(params: Dict[str, Any]) -> Dict[str, Any]:
    """查询记录：可按 toolId 过滤，limit 默认 50，返回按时间倒序。"""
    tool_id = str(params.get("toolId") or "").strip()
    try:
        limit = max(1, min(int(params.get("limit") or 50), 500))
    except (TypeError, ValueError):
        limit = 50

    sql = (
        "SELECT id, tool_id, tool_title, action, summary, detail, created_at, created_ts"
        " FROM tool_history"
    )
    args: List[Any] = []
    if tool_id:
        sql += " WHERE tool_id = ?"
        args.append(tool_id)
    sql += " ORDER BY created_ts DESC, id DESC LIMIT ?"
    args.append(limit)

    with _lock:
        conn = _get_conn()
        rows = conn.execute(sql, args).fetchall()
        if tool_id:
            total = conn.execute(
                "SELECT COUNT(*) FROM tool_history WHERE tool_id = ?", (tool_id,)
            ).fetchone()[0]
        else:
            total = conn.execute("SELECT COUNT(*) FROM tool_history").fetchone()[0]

    items = [
        {
            "id": r[0],
            "toolId": r[1],
            "toolTitle": r[2],
            "action": r[3],
            "summary": r[4],
            "detail": (json.loads(r[5]) if r[5] else {}),
            "createdAt": r[6],
        }
        for r in rows
    ]
    return {"items": items, "total": total, "limit": limit}


def clear_records(params: Dict[str, Any]) -> Dict[str, Any]:
    """清空记录：带 toolId 只清该工具，否则全清。"""
    tool_id = str(params.get("toolId") or "").strip()
    with _lock:
        conn = _get_conn()
        if tool_id:
            cur = conn.execute("DELETE FROM tool_history WHERE tool_id = ?", (tool_id,))
        else:
            cur = conn.execute("DELETE FROM tool_history")
        conn.commit()
        removed = cur.rowcount if cur.rowcount and cur.rowcount > 0 else 0
    return {"removed": removed}


def stats_records(_params: Dict[str, Any]) -> Dict[str, Any]:
    """各工具记录条数统计（用于操作记录页顶部概览）。"""
    with _lock:
        conn = _get_conn()
        rows = conn.execute(
            "SELECT tool_id, tool_title, COUNT(*) FROM tool_history"
            " GROUP BY tool_id, tool_title ORDER BY COUNT(*) DESC"
        ).fetchall()
        total = conn.execute("SELECT COUNT(*) FROM tool_history").fetchone()[0]
    return {
        "total": total,
        "items": [{"toolId": r[0], "toolTitle": r[1], "count": r[2]} for r in rows],
    }
