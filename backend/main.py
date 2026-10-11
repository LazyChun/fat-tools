"""
FatNotes Bespoke Plugin — fat-tools Backend Entry Point

工具操作记录专用 SQLite 后端。

前端调用方式：
    const result = await sdk.backend.invoke("history.add", { toolId, toolTitle, action, summary, detail });

数据库文件：`<workspace>/fatTools/history.db`（stdlib sqlite3，无第三方依赖）。
"""

from plugin_runtime import handler, run

from service import historyStore  # noqa: F401  （导入即注册 @handler）


@handler("history.add")
def history_add(params):
    """写入一条工具操作记录。

    params: { toolId, toolTitle?, action?, summary?, detail? }
    """
    return historyStore.add_record(params or {})


@handler("history.list")
def history_list(params):
    """查询操作记录。params: { toolId?, limit? } → { items, total, limit }"""
    return historyStore.list_records(params or {})


@handler("history.clear")
def history_clear(params):
    """清空操作记录。params: { toolId? }（缺省全清）→ { removed }"""
    return historyStore.clear_records(params or {})


@handler("history.stats")
def history_stats(_params):
    """各工具记录条数统计 → { total, items: [{toolId, toolTitle, count}] }"""
    return historyStore.stats_records(_params or {})


@handler("history.dbPath")
def history_db_path(_params):
    """返回当前 SQLite 文件路径（便于排查与展示）。"""
    return {"path": str(historyStore._db_path())}


if __name__ == "__main__":
    run()
