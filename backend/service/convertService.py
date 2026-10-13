# -*- coding: utf-8 -*-
"""
媒体格式转换（批量）：图片 / 视频 / 音频 / Office 文档（Word、PPT 转 PDF）。

架构：宿主只提供 ffmpeg / ffprobe 可执行文件地址（hostCall ffmpeg.getPaths，
无窗口依赖），本服务拿到地址后完全自主处理 ——
    - 文件/目录选择：backend 进程内 tkinter 原生对话框（截图工具同方案）
    - 元信息探测：直接 subprocess ffprobe
    - 图片/视频/音频转码：直接 subprocess ffmpeg，-progress pipe:1 实时解析进度
    - Word/PPT 转 PDF：PowerShell + COM 自动化（Microsoft Office 优先，WPS 兜底）
    - 取消：terminate 本地转码子进程
    - 打开输出：os.startfile / explorer 定位

前端调用：
    await sdk.backend.invoke("convert.env")
    await sdk.backend.invoke("convert.pickFiles")            # 原生多选对话框 + 入列
    await sdk.backend.invoke("convert.pickFolder")           # 原生选目录 + 递归扫描入列
    await sdk.backend.invoke("convert.selectFolder")         # 仅选目录（输出目录用）
    await sdk.backend.invoke("convert.remove", { ids })
    await sdk.backend.invoke("convert.clear")
    await sdk.backend.invoke("convert.start", { targets, options, outputDir })
    await sdk.backend.invoke("convert.status")                # 1s 轮询进度
    await sdk.backend.invoke("convert.cancel")
    await sdk.backend.invoke("convert.openOutput", { path, select })
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
import time
import uuid
from typing import Any, Dict, List, Optional

from plugin_runtime import handler, host_call

_CREATE_NO_WINDOW = 0x08000000 if sys.platform == "win32" else 0

# ----------------------- 媒体类型与格式映射 -----------------------

_IMAGE_EXTS = {
    "png", "jpg", "jpeg", "webp", "bmp", "gif", "tif", "tiff", "ico", "avif",
    "heic", "heif",
}
_VIDEO_EXTS = {
    "mp4", "mkv", "mov", "avi", "wmv", "flv", "webm", "m4v", "ts", "mpg",
    "mpeg", "3gp", "rm", "rmvb",
}
_AUDIO_EXTS = {
    "mp3", "wav", "aac", "flac", "ogg", "oga", "m4a", "wma", "aiff", "aif",
    "opus", "amr", "ape",
}
_WORD_EXTS = {"doc", "docx"}
_PPT_EXTS = {"ppt", "pptx"}
_DOCUMENT_EXTS = _WORD_EXTS | _PPT_EXTS

# 可选的目标输出格式（白名单，前端下拉与之保持一致）
OUTPUT_FORMATS: Dict[str, List[str]] = {
    "image": ["png", "jpg", "webp", "bmp", "gif", "tiff"],
    "video": ["mp4", "mkv", "mov", "avi", "webm", "ts"],
    "audio": ["mp3", "wav", "aac", "flac", "ogg", "m4a", "opus", "wma"],
    "document": ["pdf"],
}

# 图片质量：JPG -q:v（2 最佳 ~ 5 一般）；WEBP -quality
_JPG_QUALITY = {"high": "2", "medium": "3", "low": "5"}
_WEBP_QUALITY = {"high": "90", "medium": "80", "low": "60"}

# 视频编码预设（{crf} 由质量档位、{ba} 由音频码率注入；webm 固定 vp9 参数）
_VIDEO_PRESETS = {
    "mp4": ["-c:v", "libx264", "-preset", "veryfast", "-crf", "{crf}",
            "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "{ba}",
            "-movflags", "+faststart"],
    "mkv": ["-c:v", "libx264", "-preset", "veryfast", "-crf", "{crf}",
            "-c:a", "aac", "-b:a", "{ba}"],
    "mov": ["-c:v", "libx264", "-preset", "veryfast", "-crf", "{crf}",
            "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "{ba}"],
    "avi": ["-c:v", "libx264", "-preset", "veryfast", "-crf", "{crf}",
            "-c:a", "libmp3lame", "-b:a", "{ba}"],
    "webm": ["-c:v", "libvpx-vp9", "-crf", "32", "-b:v", "0", "-row-mt", "1",
             "-c:a", "libopus", "-b:a", "128k"],
    "ts": ["-c:v", "libx264", "-preset", "veryfast", "-crf", "{crf}",
           "-c:a", "aac", "-b:a", "{ba}"],
}
_VIDEO_CRF = {"high": "18", "medium": "23", "low": "28"}

# 音频编码预设
_AUDIO_PRESETS = {
    "mp3": ["-vn", "-c:a", "libmp3lame", "-b:a", "{ba}"],
    "wav": ["-vn", "-c:a", "pcm_s16le"],
    "aac": ["-vn", "-c:a", "aac", "-b:a", "{ba}"],
    "m4a": ["-vn", "-c:a", "aac", "-b:a", "{ba}"],
    "flac": ["-vn", "-c:a", "flac"],
    "ogg": ["-vn", "-c:a", "libvorbis", "-q:a", "5"],
    "opus": ["-vn", "-c:a", "libopus", "-b:a", "128k"],
    "wma": ["-vn", "-c:a", "wmav2", "-b:a", "{ba}"],
}
_AUDIO_BITRATES = ["96k", "128k", "192k", "320k"]

_ALL_MEDIA_EXTS = sorted(_IMAGE_EXTS | _VIDEO_EXTS | _AUDIO_EXTS | _DOCUMENT_EXTS)

# ----------------------- 运行时状态 -----------------------

_MAX_FOLDER_FILES = 500      # 文件夹扫描的媒体文件上限

_lock = threading.RLock()
_items: Dict[str, Dict[str, Any]] = {}
_order: List[str] = []
_state: Dict[str, Any] = {
    "running": False,
    "cancelled": False,
    "startedAt": None,
    "finishedAt": None,
    "outputDir": None,
}

# 宿主 ffmpeg 地址缓存（hostCall ffmpeg.getPaths 获取，无窗口依赖）
_ffmpeg_cache: Dict[str, Any] = {"checked": False, "ffmpeg": None,
                                 "ffprobe": None, "version": None, "error": None}

_PUBLIC_ITEM_FIELDS = (
    "id", "path", "name", "ext", "mediaType", "sizeBytes", "summary",
    "probeError", "status", "percent", "speed", "error", "outputPath",
    "outputSize", "durationMs", "target", "startedAt", "finishedAt",
)


# ----------------------- ffmpeg 地址（宿主提供） -----------------------

def _refresh_ffmpeg_paths(force: bool = False) -> Dict[str, Any]:
    """向宿主要 ffmpeg / ffprobe 可执行文件地址并缓存。"""
    with _lock:
        if _ffmpeg_cache["checked"] and not force:
            return dict(_ffmpeg_cache)
    try:
        r = host_call("ffmpeg.getPaths", {}, timeout=30) or {}
        ffmpeg_path = r.get("ffmpegPath")
        ffprobe_path = r.get("ffprobePath")
        ready = bool(ffmpeg_path and os.path.isfile(str(ffmpeg_path)))
        with _lock:
            _ffmpeg_cache.update({
                "checked": True,
                "ffmpeg": str(ffmpeg_path) if ffmpeg_path else None,
                "ffprobe": str(ffprobe_path) if ffprobe_path else None,
                "version": r.get("version"),
                "ready": ready,
                "error": None if ready else "宿主 ffmpeg 未安装",
            })
    except Exception as e:
        with _lock:
            _ffmpeg_cache.update({
                "checked": True, "ffmpeg": None, "ffprobe": None,
                "ready": False, "error": str(e)[:300],
            })
    with _lock:
        return dict(_ffmpeg_cache)


# ----------------------- tkinter 原生对话框（backend 自主） -----------------------

def _run_tk_dialog(fn) -> Any:
    """在工作线程内独立创建 Tk root 弹对话框（与截图服务同模式，用完即销毁）。"""
    import tkinter as tk

    root = tk.Tk()
    try:
        root.withdraw()
        try:
            root.attributes("-topmost", True)
        except Exception:
            pass
        root.update()
        return fn(root)
    finally:
        try:
            root.destroy()
        except Exception:
            pass


def _pick_files_dialog() -> List[str]:
    """原生多选文件对话框（媒体类型过滤），取消返回空列表。"""
    from tkinter import filedialog

    patterns = " ".join(f"*.{e}" for e in _ALL_MEDIA_EXTS)
    filetypes = [
        ("媒体文件（图片/视频/音频/文档）", patterns),
        ("图片", " ".join(f"*.{e}" for e in sorted(_IMAGE_EXTS))),
        ("视频", " ".join(f"*.{e}" for e in sorted(_VIDEO_EXTS))),
        ("音频", " ".join(f"*.{e}" for e in sorted(_AUDIO_EXTS))),
        ("Office 文档", " ".join(f"*.{e}" for e in sorted(_DOCUMENT_EXTS))),
        ("所有文件", "*.*"),
    ]

    def _ask(root):
        return filedialog.askopenfilenames(parent=root, filetypes=filetypes)

    result = _run_tk_dialog(_ask)
    return [os.path.normpath(str(p)) for p in (result or ())]


def _pick_folder_dialog() -> Optional[str]:
    """原生选目录对话框，取消返回 None。"""
    from tkinter import filedialog

    def _ask(root):
        return filedialog.askdirectory(parent=root)

    result = _run_tk_dialog(_ask)
    path = str(result or "").strip()
    return os.path.normpath(path) if path else None


# ----------------------- 元信息探测（ffprobe 自主执行） -----------------------

def _probe_one(ffprobe: str, path: str) -> Dict[str, Any]:
    """跑一次 ffprobe，返回前端友好的精简摘要。"""
    cmd = [ffprobe, "-v", "error", "-print_format", "json",
           "-show_format", "-show_streams", path]
    proc = subprocess.run(
        cmd, capture_output=True, text=True, encoding="utf-8",
        errors="replace", timeout=60, creationflags=_CREATE_NO_WINDOW,
    )
    if proc.returncode != 0:
        raise RuntimeError((proc.stderr or "").strip()[-500:] or "ffprobe 失败")
    data = json.loads(proc.stdout or "{}")
    fmt = data.get("format") or {}
    streams = data.get("streams") or []
    video = next((s for s in streams if s.get("codec_type") == "video"), None)
    audio = next((s for s in streams if s.get("codec_type") == "audio"), None)
    duration_ms = None
    try:
        d = float(fmt.get("duration") or 0)
        if d > 0:
            duration_ms = int(d * 1000)
    except (TypeError, ValueError):
        pass
    summary: Dict[str, Any] = {
        "formatName": fmt.get("format_long_name") or fmt.get("format_name"),
        "durationMs": duration_ms,
        "video": None,
        "audio": None,
    }
    if video:
        summary["video"] = {
            "codec": video.get("codec_name"),
            "width": video.get("width"),
            "height": video.get("height"),
        }
    if audio:
        summary["audio"] = {
            "codec": audio.get("codec_name"),
            "sampleRate": audio.get("sample_rate"),
            "channels": audio.get("channels"),
        }
    return summary


def _classify_media(ext: str) -> Optional[str]:
    if ext in _IMAGE_EXTS:
        return "image"
    if ext in _VIDEO_EXTS:
        return "video"
    if ext in _AUDIO_EXTS:
        return "audio"
    if ext in _DOCUMENT_EXTS:
        return "document"
    return None


def _schedule_probe(items: List[Dict[str, Any]]) -> None:
    """后台探测音视频元信息（时长/分辨率），图片跳过。"""
    with _lock:
        ffprobe = _refresh_ffmpeg_paths().get("ffprobe")
    targets = [it for it in items if it.get("mediaType") in ("video", "audio")]
    if not targets or not ffprobe or not os.path.isfile(str(ffprobe)):
        return

    def _worker():
        for it in targets:
            try:
                s = _probe_one(ffprobe, it["path"])
                with _lock:
                    it["summary"] = s
                    it["durationMs"] = s.get("durationMs") or 0
            except Exception as e:
                with _lock:
                    it["probeError"] = str(e)[:300]

    threading.Thread(target=_worker, daemon=True, name="convert-probe").start()


def _add_paths(paths: List[str]) -> Dict[str, Any]:
    """入列一批文件：跳过非媒体与重复项，音视频排队探测。"""
    added: List[Dict[str, Any]] = []
    skipped = 0
    new_items: List[Dict[str, Any]] = []
    with _lock:
        existing = {it["path"] for it in _items.values()}
        for raw in paths:
            p = os.path.normpath(str(raw or "").strip())
            if not p or not os.path.isfile(p) or p in existing:
                skipped += 1
                continue
            ext = os.path.splitext(p)[1].lstrip(".").lower()
            media = _classify_media(ext)
            if media is None:
                skipped += 1
                continue
            try:
                size = os.path.getsize(p)
            except OSError:
                skipped += 1
                continue
            item = {
                "id": uuid.uuid4().hex[:12],
                "path": p,
                "name": os.path.basename(p),
                "ext": ext,
                "mediaType": media,
                "sizeBytes": size,
                "summary": None,
                "probeError": None,
                "durationMs": None,
                "status": "queued",
                "percent": None,
                "speed": None,
                "error": None,
                "outputPath": None,
                "outputSize": None,
                "target": None,
                "startedAt": None,
                "finishedAt": None,
                "_proc": None,
            }
            _items[item["id"]] = item
            _order.append(item["id"])
            new_items.append(item)
            existing.add(p)
    _schedule_probe(new_items)
    for it in new_items:
        added.append({k: it.get(k) for k in _PUBLIC_ITEM_FIELDS})
    return {"items": added, "skipped": skipped}


# ----------------------- Word / PPT 转 PDF（PowerShell + COM） -----------------------
# 零 Python 依赖：调用系统自带 PowerShell 驱动 Office COM（Microsoft Office 优先，
# WPS 的 KWPS/KWPP 兜底 —— 国内环境常见）。路径以单引号字面量注入（' 翻倍转义）。
# Word: Documents.Open(ReadOnly) + ExportAsFixedFormat(17 = wdExportFormatPDF)
# PPT:  Presentations.Open(ReadOnly, 无窗口) + ExportAsFixedFormat(2 = ppFixedFormatPDF)，
#       旧组件兜底 SaveAs(32 = ppSaveAsPDF)

_PS_WORD_TMPL = r"""
$ErrorActionPreference = 'Stop'
$app = $null
foreach ($p in @('Word.Application', 'KWPS.Application')) {
  try { $app = New-Object -ComObject $p; break } catch { }
}
if (-not $app) { [Console]::Error.WriteLine('NO_OFFICE'); exit 2 }
try {
  $app.Visible = $false
  try { $app.DisplayAlerts = 0 } catch { }
  $doc = $app.Documents.Open(__INPUT__, $false, $true)
  $doc.ExportAsFixedFormat(__OUTPUT__, 17)
  $doc.Close(0)
} finally {
  try { $app.Quit() } catch { }
}
"""

_PS_PPT_TMPL = r"""
$ErrorActionPreference = 'Stop'
$app = $null
foreach ($p in @('PowerPoint.Application', 'KWPP.Application')) {
  try { $app = New-Object -ComObject $p; break } catch { }
}
if (-not $app) { [Console]::Error.WriteLine('NO_OFFICE'); exit 2 }
try {
  try { $app.DisplayAlerts = 1 } catch { }
  $pres = $app.Presentations.Open(__INPUT__, $true, $false, $false)
  try { $pres.ExportAsFixedFormat(__OUTPUT__, 2) } catch { $pres.SaveAs(__OUTPUT__, 32) }
  $pres.Close()
} finally {
  try { $app.Quit() } catch { }
}
"""

_DOC_TIMEOUT_S = 600  # 大型 PPT 经 COM 转换可能较慢


def _ps_quote(s: str) -> str:
    """转义为 PowerShell 单引号字符串字面量。"""
    return "'" + str(s).replace("'", "''") + "'"


def _run_powershell(script: str, timeout: int = _DOC_TIMEOUT_S) -> subprocess.CompletedProcess:
    """以 -EncodedCommand 运行 PowerShell（UTF-16LE base64，避免临时文件与转义问题）。"""
    import base64

    encoded = base64.b64encode(script.encode("utf-16-le")).decode("ascii")
    cmd = [
        "powershell", "-NoProfile", "-NonInteractive",
        "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded,
    ]
    return subprocess.run(
        cmd, capture_output=True, text=True, encoding="utf-8",
        errors="replace", timeout=timeout, creationflags=_CREATE_NO_WINDOW,
    )


def _convert_document_one(item: Dict[str, Any], output_dir: Optional[str]) -> None:
    """Office 文档 → PDF：COM 自动化（阻塞至完成，无进度回调）。"""
    out_dir = output_dir or os.path.dirname(item["path"])
    os.makedirs(out_dir, exist_ok=True)
    out_path = _unique_output(out_dir, os.path.splitext(item["name"])[0], "pdf")
    item["target"] = "pdf"
    tmpl = _PS_WORD_TMPL if item["ext"] in _WORD_EXTS else _PS_PPT_TMPL
    script = tmpl.replace("__INPUT__", _ps_quote(item["path"])).replace(
        "__OUTPUT__", _ps_quote(out_path))
    proc = _run_powershell(script)
    if proc.returncode != 0 or not os.path.isfile(out_path):
        err = (proc.stderr or "").strip()
        if "NO_OFFICE" in err:
            raise RuntimeError("未检测到 Microsoft Office 或 WPS，无法转换 Office 文档")
        raise RuntimeError(err[-500:] or f"转换失败（退出码 {proc.returncode}）")
    item["outputPath"] = out_path
    item["outputSize"] = os.path.getsize(out_path)


# ----------------------- 转码参数与输出 -----------------------

def _unique_output(out_dir: str, stem: str, ext: str) -> str:
    """输出文件重名时自动加 (n) 后缀，不覆盖已有文件。"""
    candidate = os.path.join(out_dir, f"{stem}.{ext}")
    if not os.path.exists(candidate):
        return candidate
    n = 1
    while n < 1000:
        candidate = os.path.join(out_dir, f"{stem} ({n}).{ext}")
        if not os.path.exists(candidate):
            return candidate
        n += 1
    raise RuntimeError(f"输出目录已存在大量同名文件: {stem}.{ext}")


def _build_args(item: Dict[str, Any], target: str, options: Dict[str, Any]) -> List[str]:
    """按媒体类型与目标格式构造 ffmpeg 输出参数（白名单预设）。"""
    quality = str(options.get("quality") or "medium")
    bitrate = str(options.get("audioBitrate") or "192k")
    if bitrate not in _AUDIO_BITRATES:
        bitrate = "192k"
    media = item["mediaType"]
    if media == "image":
        if target == "jpg":
            return ["-q:v", _JPG_QUALITY.get(quality, "3")]
        if target == "webp":
            return ["-quality", _WEBP_QUALITY.get(quality, "80")]
        return []
    if media == "video":
        preset = _VIDEO_PRESETS.get(target)
        if preset is None:
            raise ValueError(f"不支持的视频目标格式: {target}")
        return [
            t.format(crf=_VIDEO_CRF.get(quality, "23"), ba=bitrate)
            for t in preset
        ]
    if media == "audio":
        preset = _AUDIO_PRESETS.get(target)
        if preset is None:
            raise ValueError(f"不支持的音频目标格式: {target}")
        return [t.format(ba=bitrate) for t in preset]
    raise ValueError(f"未知的媒体类型: {media}")


def _read_progress_line(line: str, item: Dict[str, Any]) -> None:
    """解析 ffmpeg -progress pipe:1 的一行输出，实时回填百分比与速度。"""
    line = line.strip()
    if not line:
        return
    key, _, value = line.partition("=")
    value = value.strip()
    if key == "out_time_us":
        try:
            out_ms = int(value) / 1000.0
        except ValueError:
            return
        duration = item.get("durationMs") or 0
        item["percent"] = (
            round(min(100.0, out_ms / duration * 100.0), 1)
            if duration > 0 else None
        )
    elif key == "speed" and value:
        item["speed"] = value


def _convert_one(ffmpeg: str, item: Dict[str, Any], target: str,
                 options: Dict[str, Any], output_dir: Optional[str]) -> None:
    """转码单个文件（阻塞至完成），实时更新 item 进度，可被 cancel terminate。

    Office 文档（Word/PPT → PDF）走 PowerShell COM 分支，无进度回调，秒级~分钟级。
    """
    if item["mediaType"] == "document":
        _convert_document_one(item, output_dir)
        item["status"] = "done"
        item["percent"] = 100
        return

    out_dir = output_dir or os.path.dirname(item["path"])
    stem = os.path.splitext(item["name"])[0]
    out_path = _unique_output(out_dir, stem, target)
    os.makedirs(out_dir, exist_ok=True)
    args = _build_args(item, target, options)
    cmd = [ffmpeg, "-hide_banner", "-nostdin", "-y",
           "-progress", "pipe:1", "-nostats",
           "-i", item["path"], *args, out_path]

    item["target"] = target
    proc = subprocess.Popen(
        cmd,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
        creationflags=_CREATE_NO_WINDOW,
    )
    item["_proc"] = proc

    stderr_tail: List[str] = []
    _stderr_lock = threading.Lock()

    def _drain():
        try:
            if proc.stderr is not None:
                for err_line in proc.stderr:
                    with _stderr_lock:
                        stderr_tail.append(err_line.rstrip("\r\n"))
                        if len(stderr_tail) > 40:
                            stderr_tail.pop(0)
        except Exception:
            pass

    threading.Thread(target=_drain, daemon=True).start()

    exit_code: Optional[int] = None
    try:
        if proc.stdout is not None:
            for line in proc.stdout:
                _read_progress_line(line, item)
        exit_code = proc.wait()
    finally:
        item["_proc"] = None

    with _stderr_lock:
        stderr_text = "\n".join(stderr_tail)

    if exit_code == 0 and os.path.isfile(out_path):
        item["status"] = "done"
        item["percent"] = 100
        item["outputPath"] = out_path
        item["outputSize"] = os.path.getsize(out_path)
    else:
        with _lock:
            if _state["cancelled"]:
                item["status"] = "cancelled"
            else:
                item["status"] = "failed"
                item["error"] = stderr_text.strip()[-500:] or f"ffmpeg 退出码 {exit_code}"


def _run_batch(ids: List[str], targets: Dict[str, str],
               options: Dict[str, Any], output_dir: Optional[str]) -> None:
    """批量转换 worker：单线程顺序转码，避免并发 ffmpeg 抢占 CPU。"""
    with _lock:
        _state["running"] = True
        _state["startedAt"] = time.time()
        _state["finishedAt"] = None
        _state["outputDir"] = output_dir

    ffmpeg = _refresh_ffmpeg_paths().get("ffmpeg")

    for iid in ids:
        with _lock:
            if _state["cancelled"]:
                it = _items.get(iid)
                if it and it["status"] == "queued":
                    it["status"] = "cancelled"
                continue
            it = _items.get(iid)
            if not it:
                continue
            it["status"] = "converting"
            it["startedAt"] = time.time()

        # 文档转 PDF 走 Office COM，不依赖 ffmpeg
        if it["mediaType"] != "document" and (not ffmpeg or not os.path.isfile(str(ffmpeg))):
            it["status"] = "failed"
            it["error"] = "宿主 ffmpeg 不可用"
            continue
        target = targets.get(it["mediaType"])
        try:
            if not target:
                it["status"] = "skipped"
                it["error"] = "未选择该类型的目标格式"
                continue
            if target == it["ext"]:
                it["status"] = "skipped"
                it["error"] = "目标格式与源格式相同"
                continue
            _convert_one(ffmpeg, it, target, options, output_dir)
        except Exception as e:
            with _lock:
                if _state["cancelled"]:
                    it["status"] = "cancelled"
                else:
                    it["status"] = "failed"
                    it["error"] = str(e)[:500]
        finally:
            it["finishedAt"] = time.time()

    with _lock:
        _state["running"] = False
        _state["finishedAt"] = time.time()


def _public_state() -> Dict[str, Any]:
    items: List[Dict[str, Any]] = []
    done = failed = skipped = 0
    with _lock:
        for iid in _order:
            it = _items.get(iid)
            if not it:
                continue
            status = it.get("status")
            if status == "done":
                done += 1
            elif status == "failed":
                failed += 1
            elif status == "skipped":
                skipped += 1
            items.append({k: it.get(k) for k in _PUBLIC_ITEM_FIELDS})
        return {
            "running": _state["running"],
            "cancelled": _state["cancelled"],
            "outputDir": _state["outputDir"],
            "startedAt": _state["startedAt"],
            "finishedAt": _state["finishedAt"],
            "total": len(items),
            "done": done,
            "failed": failed,
            "skipped": skipped,
            "items": items,
        }


# ----------------------- Handlers -----------------------

@handler("convert.env")
def convert_env(_params):
    """探测宿主 ffmpeg 可用性（向宿主要地址）+ 输出格式白名单。"""
    info = _refresh_ffmpeg_paths(force=True)
    return {
        "ready": bool(info.get("ready")),
        "version": info.get("version"),
        "ffmpegPath": info.get("ffmpeg"),
        "error": info.get("error"),
        "outputFormats": OUTPUT_FORMATS,
    }


@handler("convert.pickFiles")
def convert_pick_files(_params):
    """tkinter 原生多选文件对话框（媒体过滤）并直接入列。"""
    try:
        paths = _pick_files_dialog()
    except Exception as e:
        return {"cancelled": False, "items": [], "skipped": 0,
                "error": f"打开文件对话框失败: {e}"}
    if not paths:
        return {"cancelled": True, "items": [], "skipped": 0}
    return _add_paths(paths)


@handler("convert.pickFolder")
def convert_pick_folder(_params):
    """tkinter 原生选目录 + 递归扫描媒体文件入列（上限 500）。"""
    try:
        folder = _pick_folder_dialog()
    except Exception as e:
        return {"cancelled": False, "items": [], "skipped": 0,
                "error": f"打开目录对话框失败: {e}"}
    if not folder:
        return {"cancelled": True, "items": [], "skipped": 0}
    if not os.path.isdir(folder):
        return {"cancelled": False, "items": [], "skipped": 0, "error": "目录无效"}
    collected: List[str] = []
    for base, _dirs, files in os.walk(folder):
        for name in files:
            ext = os.path.splitext(name)[1].lstrip(".").lower()
            if _classify_media(ext):
                collected.append(os.path.join(base, name))
                if len(collected) >= _MAX_FOLDER_FILES:
                    break
        if len(collected) >= _MAX_FOLDER_FILES:
            break
    return _add_paths(collected)


@handler("convert.selectFolder")
def convert_select_folder(_params):
    """仅弹出原生目录选择对话框（不扫描入列）—— 用于选择输出目录。"""
    try:
        folder = _pick_folder_dialog()
    except Exception as e:
        return {"cancelled": False, "path": None,
                "error": f"打开目录对话框失败: {e}"}
    return {"cancelled": not folder, "path": folder, "error": None}


@handler("convert.remove")
def convert_remove(params):
    """从清单移除若干文件（转换中的不可移除）。"""
    ids = set((params or {}).get("ids") or [])
    removed = 0
    with _lock:
        for iid in ids:
            it = _items.get(iid)
            if it and it["status"] != "converting":
                _items.pop(iid, None)
                if iid in _order:
                    _order.remove(iid)
                removed += 1
    return {"removed": removed}


@handler("convert.clear")
def convert_clear(_params):
    """清空清单（任务运行中仅清理非转换中的项）。"""
    removed = 0
    with _lock:
        if _state["running"]:
            keep = []
            for iid in _order:
                it = _items.get(iid)
                if it and it["status"] == "converting":
                    keep.append(iid)
                else:
                    _items.pop(iid, None)
                    removed += 1
            _order[:] = keep
        else:
            removed = len(_order)
            _items.clear()
            _order.clear()
    return {"removed": removed}


@handler("convert.start")
def convert_start(params):
    """启动批量转换。params: { targets: {image?, video?, audio?},
    options: { quality?, audioBitrate? }, outputDir? }"""
    p = params or {}
    targets = p.get("targets") or {}
    if not isinstance(targets, dict) or not targets:
        raise ValueError("缺少目标格式 targets")
    options = p.get("options") or {}
    output_dir = str(p.get("outputDir") or "").strip()
    if output_dir and not os.path.isdir(output_dir):
        raise ValueError(f"输出目录不存在: {output_dir}")

    with _lock:
        if _state["running"]:
            raise RuntimeError("已有转换任务进行中")
        # 在启动前重置取消标记（worker 启动有间隙，避免取消信号被覆盖丢失）
        _state["cancelled"] = False
        ids = [iid for iid in _order
               if _items.get(iid, {}).get("status") == "queued"]
        if not ids:
            raise ValueError("没有待转换的文件")

    threading.Thread(
        target=_run_batch,
        args=(ids, dict(targets), dict(options), output_dir or None),
        daemon=True,
        name="convert-worker",
    ).start()
    return {"ok": True, "total": len(ids)}


@handler("convert.status")
def convert_status(_params):
    """任务状态快照（含每项进度），供前端轮询。"""
    return _public_state()


@handler("convert.cancel")
def convert_cancel(_params):
    """取消当前批量任务：terminate 进行中的 ffmpeg，其余排队项标记取消。"""
    with _lock:
        _state["cancelled"] = True
        proc = None
        for iid in _order:
            it = _items.get(iid)
            if it and it["status"] == "converting" and it.get("_proc"):
                proc = it["_proc"]
                break
    if proc is not None:
        try:
            proc.terminate()
        except Exception:
            pass
    return {"ok": True}


@handler("convert.openOutput")
def convert_open_output(params):
    """在资源管理器中打开（或选中）输出路径（backend 自主执行）。"""
    path = str((params or {}).get("path") or "").strip()
    if not path:
        return {"ok": False, "error": "缺少 path"}
    target = os.path.normpath(path)
    if not os.path.exists(target):
        return {"ok": False, "error": f"路径不存在: {target}"}
    try:
        if os.name == "nt" and (params or {}).get("select") and os.path.isfile(target):
            subprocess.Popen(["explorer", "/select,", target],
                             creationflags=_CREATE_NO_WINDOW)
        else:
            reveal = os.path.dirname(target) if os.path.isfile(target) else target
            os.startfile(reveal)  # type: ignore[attr-defined]
        return {"ok": True, "path": target}
    except Exception as e:
        return {"ok": False, "error": str(e)}
