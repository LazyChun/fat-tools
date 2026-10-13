"""
系统级屏幕截图：微信/QQ 风格跨多显示器框选。

前端调用：
    await sdk.backend.invoke("screenshot.capture", {"hideHost": True}, 120)

返回：
    {"ok": True, "data": "<base64 png>", "width": W, "height": H}
    {"ok": False, "cancelled": True}   # 用户 Esc / ✕ / 框选太小

体验（参照微信/QQ 截图）：
    1. 可选隐藏 FatNotes 宿主窗口（params["hideHost"]），避免它入镜
    2. 用 Pillow 冻结整个虚拟屏幕（所有显示器）作为覆盖层背景
       —— 选区外压暗、选区内显示原画面（“挖洞”效果）
    3. 拖拽建区：蓝色边框 + 尺寸标签；未拖拽时十字辅助线跟随鼠标
    4. 松开进入调整：8 个控制点缩放、选区内拖动整体移动、✓/✕ 浮动按钮
    5. Enter / 双击 / ✓ 确认 → 从冻结帧裁剪 → PNG base64 返回
    6. Esc / ✕ 取消
    PIL.ImageTk 不可用时退化为旧版半透明黑窗直接框选。
"""
import base64
import io
import sys
import time
import tkinter as tk
from typing import Any, Dict, List, Tuple

from PIL import ImageGrab

from plugin_runtime import handler

_user32 = None
if sys.platform == "win32":
    import ctypes
    from ctypes import wintypes

    _user32 = ctypes.windll.user32

    # 让本进程按物理像素工作：tkinter 事件坐标（x_root/y_root）与
    # Pillow all_screens 截图坐标（虚拟屏幕坐标系，主屏左上角为原点）完全一致。
    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(2)  # PER_MONITOR_DPI_AWARE
    except Exception:
        try:
            _user32.SetProcessDPIAware()
        except Exception:
            pass

# 排除浏览器等误匹配窗口的标题关键字（浏览器窗口标题含当前页面名）
_NON_APP_HINTS = ("Chrome", "Edge", "Firefox", "Opera", "Safari")

BORDER = "#1677FF"
DIM_FACTOR = 0.45  # 选区外压暗程度（1.0 = 原亮度）
HINT = "拖拽框选 · 松开后可调整 · Enter/双击确认 · Esc 取消"


def _virtual_screen_bounds(root: tk.Tk) -> Tuple[int, int, int, int]:
    """虚拟屏幕（所有显示器并集）外接矩形 (x, y, w, h)。

    坐标系以主屏左上角为原点，左侧显示器 x 为负。非 Windows 退化为单主屏。
    """
    if _user32 is not None:
        try:
            vx = _user32.GetSystemMetrics(76)  # SM_XVIRTUALSCREEN
            vy = _user32.GetSystemMetrics(77)  # SM_YVIRTUALSCREEN
            vw = _user32.GetSystemMetrics(78)  # SM_CXVIRTUALSCREEN
            vh = _user32.GetSystemMetrics(79)  # SM_CYVIRTUALSCREEN
            if vw > 0 and vh > 0:
                return vx, vy, vw, vh
        except Exception:
            pass
    return 0, 0, root.winfo_screenwidth(), root.winfo_screenheight()


def _list_monitors() -> List[Tuple[int, int, int, int]]:
    """枚举各显示器矩形 (left, top, w, h)（虚拟屏幕坐标系）。非 Windows 返回空。"""
    if _user32 is None:
        return []
    monitors: List[Tuple[int, int, int, int]] = []

    def _cb(hmon, hdc, lprect, lparam):
        r = lprect.contents
        monitors.append((r.left, r.top, r.right - r.left, r.bottom - r.top))
        return 1

    try:
        mon_proc = ctypes.WINFUNCTYPE(
            ctypes.c_int,
            wintypes.HMONITOR,
            wintypes.HDC,
            ctypes.POINTER(wintypes.RECT),
            wintypes.LPARAM,
        )
        _user32.EnumDisplayMonitors(0, 0, mon_proc(_cb), 0)
    except Exception:
        return []
    return monitors


def _find_host_windows() -> List[int]:
    """找 FatNotes 宿主窗口（与宿主 winNative.get_hwnd 相同的标题匹配方式）。"""
    hwnds: List[int] = []
    if _user32 is None:
        return hwnds

    def _cb(hwnd, lparam):
        try:
            if not _user32.IsWindowVisible(hwnd):
                return 1
            buf = ctypes.create_unicode_buffer(256)
            if not _user32.GetWindowTextW(hwnd, buf, 256):
                return 1
            title = buf.value
            if "FatNotes" in title and not any(b in title for b in _NON_APP_HINTS):
                hwnds.append(hwnd)
        except Exception:
            pass
        return 1

    try:
        enum_proc = ctypes.WINFUNCTYPE(ctypes.c_bool, wintypes.HWND, wintypes.LPARAM)
        _user32.EnumWindows(enum_proc(_cb), 0)
    except Exception:
        pass
    return hwnds


def _png_b64(img) -> Tuple[str, int, int]:
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii"), img.width, img.height


def _in_rect(x: float, y: float, rect) -> bool:
    return rect[0] <= x <= rect[2] and rect[1] <= y <= rect[3]


# ---------------------------------------------------------------- 主入口


@handler("screenshot.capture")
def screenshot_capture(params: Dict[str, Any]) -> Dict[str, Any]:
    """系统级框选截图（跨所有显示器，可选隐藏 FatNotes 窗口）。"""
    params = params or {}
    hide_host = bool(params.get("hideHost"))

    # ① 可选：先隐藏宿主窗口，避免它出现在（冻结画面和）截图里
    hidden: List[int] = []
    if hide_host and _user32 is not None:
        hidden = _find_host_windows()
        for hwnd in hidden:
            _user32.ShowWindow(hwnd, 0)  # SW_HIDE
        if hidden:
            time.sleep(0.4)  # 等窗口真正从桌面消失，避免残影入镜

    try:
        # ② 冻结整个虚拟屏幕作为覆盖层背景
        frozen = None
        ImageTk = ImageEnhance = None
        try:
            frozen = ImageGrab.grab(all_screens=True)
            from PIL import ImageEnhance as _IE
            from PIL import ImageTk as _IT

            ImageTk, ImageEnhance = _IT, _IE
        except Exception:
            frozen = None

        if frozen is not None and ImageTk is not None and ImageEnhance is not None:
            return _capture_frozen(frozen, ImageTk, ImageEnhance)
        return _capture_legacy()
    finally:
        # 无论成功/取消/异常，都把宿主窗口恢复回来
        if _user32 is not None:
            for hwnd in hidden:
                try:
                    _user32.ShowWindow(hwnd, 5)  # SW_SHOW
                except Exception:
                    pass


# ---------------------------------------------------------------- 微信风格覆盖层


def _capture_frozen(frozen, ImageTk, ImageEnhance) -> Dict[str, Any]:
    """冻结画面覆盖层：选区外压暗、选区内高亮，支持拖拽/调整/确认。"""
    state: Dict[str, Any] = {
        "x1": 0, "y1": 0, "x2": 0, "y2": 0,  # 当前选区（虚拟屏幕绝对坐标）
        "phase": "idle",  # idle | drag | adjust
        "act": None,  # drag | move | resize:<handle>
        "orig": None,
        "press": None,
        "cancel": False,
        "confirm": False,
        "bg_img": None,
        "hole_img": None,
        "hole_scheduled": False,
        "btns": None,
    }

    root = tk.Tk()
    try:
        root.overrideredirect(True)
        root.attributes("-topmost", True)
    except tk.TclError:
        pass
    root.configure(bg="black")
    root.config(cursor="crosshair")
    root.title("fat-tools screenshot")

    vx, vy, vw, vh = _virtual_screen_bounds(root)
    if frozen.size != (vw, vh):
        # all_screens 实际只截到主屏 → 覆盖层也只铺主屏，坐标保持一致
        vx, vy, vw, vh = 0, 0, frozen.width, frozen.height
    root.geometry(f"{vw}x{vh}+{vx}+{vy}")

    canvas = tk.Canvas(root, highlightthickness=0, bg="black")
    canvas.pack(fill="both", expand=True)

    # 背景：压暗的冻结画面（选区外自然呈现遮罩效果）
    dimmed = ImageEnhance.Brightness(frozen).enhance(DIM_FACTOR)
    state["bg_img"] = ImageTk.PhotoImage(dimmed, master=root)
    canvas.create_image(0, 0, image=state["bg_img"], anchor="nw", tags=("bg",))

    # 每个显示器顶部一条操作提示（画在遮罩上、选区洞之下）
    for mx, my, mw, mh in _list_monitors() or [(vx, vy, vw, vh)]:
        canvas.create_text(
            mx + mw // 2 - vx,
            my + 46 - vy,
            text=HINT,
            fill="#ffffff",
            font=("Microsoft YaHei", 13, "bold"),
            tags=("hint",),
        )

    def norm():
        return (
            min(state["x1"], state["x2"]),
            min(state["y1"], state["y2"]),
            max(state["x1"], state["x2"]),
            max(state["y1"], state["y2"]),
        )

    def clamp_coords():
        for k in ("x1", "x2"):
            state[k] = max(vx, min(state[k], vx + vw))
        for k in ("y1", "y2"):
            state[k] = max(vy, min(state[k], vy + vh))

    def handle_pts(x1, y1, x2, y2):
        cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
        return {
            "nw": (x1, y1), "n": (cx, y1), "ne": (x2, y1), "e": (x2, cy),
            "se": (x2, y2), "s": (cx, y2), "sw": (x1, y2), "w": (x1, cy),
        }

    def draw_hole():
        """选区“挖洞”：把冻结画面原图贴回选区（节流调用）。"""
        canvas.delete("hole")
        if state["phase"] not in ("drag", "adjust"):
            return
        x1, y1, x2, y2 = norm()
        if x2 - x1 < 2 or y2 - y1 < 2:
            return
        crop = frozen.crop((x1 - vx, y1 - vy, x2 - vx, y2 - vy))
        state["hole_img"] = ImageTk.PhotoImage(crop, master=root)
        canvas.create_image(x1 - vx, y1 - vy, image=state["hole_img"], anchor="nw", tags=("hole",))

    def _hole_tick():
        state["hole_scheduled"] = False
        draw_hole()

    def schedule_hole():
        if state["hole_scheduled"]:
            return
        state["hole_scheduled"] = True
        root.after(50, _hole_tick)

    def render(fast=False):
        """重绘边框/尺寸标签/控制点/按钮。fast=True 时洞延后刷新（拖拽中节流）。"""
        canvas.delete("border", "chip", "handles", "btns")
        state["btns"] = None
        if state["phase"] not in ("drag", "adjust"):
            return
        x1, y1, x2, y2 = norm()
        if x2 - x1 < 1 or y2 - y1 < 1:
            return
        if not fast:
            draw_hole()
        lx1, ly1, lx2, ly2 = x1 - vx, y1 - vy, x2 - vx, y2 - vy

        # 蓝色边框
        canvas.create_rectangle(lx1, ly1, lx2, ly2, outline=BORDER, width=2, tags=("border",))

        # 尺寸标签（贴边框左上角，顶到屏幕顶端则挪到框内）
        text = f"{x2 - x1} × {y2 - y1}"
        tw = len(text) * 9 + 16
        tx = min(max(lx1, 0), vw - tw)
        ty = ly1 - 26 if ly1 - 26 >= 0 else ly1 + 2
        canvas.create_rectangle(tx, ty, tx + tw, ty + 22, fill="#333333", outline="", tags=("chip",))
        canvas.create_text(tx + tw / 2, ty + 11, text=text, fill="#ffffff",
                           font=("Microsoft YaHei", 12, "bold"), tags=("chip",))

        if state["phase"] != "adjust":
            return

        # 8 个白色控制点
        for hx, hy in handle_pts(x1, y1, x2, y2).values():
            lhx, lhy = hx - vx, hy - vy
            canvas.create_rectangle(lhx - 4, lhy - 4, lhx + 4, lhy + 4,
                                    fill="#ffffff", outline=BORDER, width=1, tags=("handles",))

        # ✓ / ✕ 浮动按钮（选区右下方，贴不到就放上方/框内）
        bw, bh, gap = 34, 26, 8
        bx2 = min(lx2, vw)
        by = ly2 + 10
        if by + bh > vh:
            by = ly1 - bh - 10
            if by < 0:
                by = min(ly2 - bh - 2, vh - bh)
        bx1 = max(bx2 - bw * 2 - gap, 0)
        okx1 = bx1 + bw + gap
        canvas.create_rectangle(bx1, by, bx1 + bw, by + bh, fill="#333333", outline="", tags=("btns",))
        canvas.create_text(bx1 + bw / 2, by + bh / 2, text="✕", fill="#ffffff",
                           font=("Microsoft YaHei", 13, "bold"), tags=("btns",))
        canvas.create_rectangle(okx1, by, okx1 + bw, by + bh, fill=BORDER, outline="", tags=("btns",))
        canvas.create_text(okx1 + bw / 2, by + bh / 2, text="✓", fill="#ffffff",
                           font=("Microsoft YaHei", 13, "bold"), tags=("btns",))
        state["btns"] = {
            "cancel": (vx + bx1, vy + by, vx + bx1 + bw, vy + by + bh),
            "ok": (vx + okx1, vy + by, vx + okx1 + bw, vy + by + bh),
        }

    def on_hover(e):
        if state["phase"] != "idle":
            return
        canvas.delete("guides")
        lx, ly = e.x_root - vx, e.y_root - vy
        canvas.create_line(0, ly, vw, ly, fill=BORDER, dash=(3, 5), tags=("guides",))
        canvas.create_line(lx, 0, lx, vh, fill=BORDER, dash=(3, 5), tags=("guides",))

    def on_press(e):
        ex, ey = e.x_root, e.y_root
        btns = state["btns"]
        if btns:
            if _in_rect(ex, ey, btns["ok"]):
                state["confirm"] = True
                root.quit()
                return
            if _in_rect(ex, ey, btns["cancel"]):
                state["cancel"] = True
                root.quit()
                return
        if state["phase"] == "adjust":
            x1, y1, x2, y2 = norm()
            for name, (hx, hy) in handle_pts(x1, y1, x2, y2).items():
                if abs(hx - ex) <= 7 and abs(hy - ey) <= 7:
                    state["act"] = "resize:" + name
                    state["orig"] = norm()
                    return
            if x1 <= ex <= x2 and y1 <= ey <= y2:
                state["act"] = "move"
                state["orig"] = norm()
                state["press"] = (ex, ey)
                return
        # 其余情况：重新拖拽建区
        canvas.delete("guides")
        state["phase"] = "drag"
        state["act"] = "drag"
        state["x1"] = state["x2"] = ex
        state["y1"] = state["y2"] = ey
        render()
        schedule_hole()

    def on_motion(e):
        act = state["act"]
        if not act:
            return
        ex = max(vx, min(e.x_root, vx + vw))
        ey = max(vy, min(e.y_root, vy + vh))
        if act == "drag":
            state["x2"], state["y2"] = ex, ey
        elif act == "move":
            ox1, oy1, ox2, oy2 = state["orig"]
            dx, dy = ex - state["press"][0], ey - state["press"][1]
            state["x1"], state["y1"] = ox1 + dx, oy1 + dy
            state["x2"], state["y2"] = ox2 + dx, oy2 + dy
        elif act.startswith("resize:"):
            ox1, oy1, ox2, oy2 = state["orig"]
            h = act.split(":", 1)[1]
            if "n" in h:
                state["y1"] = min(ey, oy2 - 3)
            if "s" in h:
                state["y2"] = max(ey, oy1 + 3)
            if "w" in h:
                state["x1"] = min(ex, ox2 - 3)
            if "e" in h:
                state["x2"] = max(ex, ox1 + 3)
        clamp_coords()
        render(fast=True)
        schedule_hole()

    def on_release(_e):
        act = state["act"]
        state["act"] = None
        state["orig"] = None
        state["press"] = None
        if act == "drag":
            x1, y1, x2, y2 = norm()
            if x2 - x1 >= 3 and y2 - y1 >= 3:
                state["phase"] = "adjust"
                state["x1"], state["y1"], state["x2"], state["y2"] = x1, y1, x2, y2
            else:
                state["phase"] = "idle"
        elif act:
            state["phase"] = "adjust"
        render()

    def on_confirm(_e=None):
        x1, y1, x2, y2 = norm()
        if x2 - x1 >= 3 and y2 - y1 >= 3 and not state["cancel"]:
            state["confirm"] = True
            root.quit()

    def on_cancel(_e=None):
        state["cancel"] = True
        root.quit()

    canvas.bind("<ButtonPress-1>", on_press)
    canvas.bind("<B1-Motion>", on_motion)
    canvas.bind("<ButtonRelease-1>", on_release)
    canvas.bind("<Motion>", on_hover)
    canvas.bind("<Double-Button-1>", on_confirm)
    canvas.bind("<Return>", on_confirm)
    canvas.bind("<Escape>", on_cancel)
    root.bind("<Return>", on_confirm)
    root.bind("<Escape>", on_cancel)

    root.update_idletasks()
    root.lift()
    try:
        root.focus_force()
    except tk.TclError:
        pass
    root.mainloop()
    root.destroy()

    if state["cancel"] or not state["confirm"]:
        return {"ok": False, "cancelled": True}

    # ③ 从冻结帧裁剪（所见即所得，不用二次截屏）
    x1, y1, x2, y2 = norm()
    if x2 - x1 < 3 or y2 - y1 < 3:
        return {"ok": False, "cancelled": True}
    img = frozen.crop((x1 - vx, y1 - vy, x2 - vx, y2 - vy))
    b64, w, h = _png_b64(img)
    return {"ok": True, "data": b64, "width": w, "height": h}


# ---------------------------------------------------------------- 退化路径（无 ImageTk）


def _capture_legacy() -> Dict[str, Any]:
    """旧版半透明黑窗：拖一次框直接截（ImageTk 不可用时的兜底）。"""
    state = {"x1": 0, "y1": 0, "x2": 0, "y2": 0, "drawing": False, "cancelled": False}

    root = tk.Tk()
    try:
        root.overrideredirect(True)
        root.attributes("-topmost", True)
        root.attributes("-alpha", 0.25)
    except tk.TclError:
        pass
    root.configure(bg="black")
    root.config(cursor="crosshair")
    root.title("fat-tools screenshot")

    vx, vy, vw, vh = _virtual_screen_bounds(root)
    root.geometry(f"{vw}x{vh}+{vx}+{vy}")

    canvas = tk.Canvas(root, highlightthickness=0, bg="black")
    canvas.pack(fill="both", expand=True)

    for mx, my, mw, mh in _list_monitors() or [(vx, vy, vw, vh)]:
        canvas.create_text(
            mx + mw // 2 - vx,
            my + 46 - vy,
            text="拖拽框选截图区域（任意屏幕） · Esc 取消",
            fill="#ffffff",
            font=("Microsoft YaHei", 15, "bold"),
        )

    def on_press(e):
        state["x1"], state["y1"] = e.x_root, e.y_root
        state["drawing"] = True
        canvas.delete("sel")

    def on_drag(e):
        if not state["drawing"]:
            return
        canvas.delete("sel")
        x1, y1 = state["x1"], state["y1"]
        x2, y2 = e.x_root, e.y_root
        canvas.create_rectangle(x1 - vx, y1 - vy, x2 - vx, y2 - vy,
                                outline=BORDER, width=2, tags="sel")
        tx = min(max(min(x1, x2) - vx + 8, 0), vw - 150)
        ty = min(max(min(y1, y2) - vy + 26, 0), vh - 26)
        canvas.create_text(tx, ty, text=f"{abs(x2 - x1)} × {abs(y2 - y1)}",
                           fill=BORDER, font=("Microsoft YaHei", 13, "bold"), tags="sel")

    def on_release(e):
        state["x2"], state["y2"] = e.x_root, e.y_root
        state["drawing"] = False
        root.quit()

    def on_cancel(_e):
        state["cancelled"] = True
        root.quit()

    canvas.bind("<ButtonPress-1>", on_press)
    canvas.bind("<B1-Motion>", on_drag)
    canvas.bind("<ButtonRelease-1>", on_release)
    canvas.bind("<Escape>", on_cancel)
    root.bind("<Escape>", on_cancel)

    root.mainloop()
    root.destroy()

    if state["cancelled"]:
        return {"ok": False, "cancelled": True}

    x1, y1 = min(state["x1"], state["x2"]), min(state["y1"], state["y2"])
    x2, y2 = max(state["x1"], state["x2"]), max(state["y1"], state["y2"])
    if x2 - x1 < 3 or y2 - y1 < 3:
        return {"ok": False, "cancelled": True}

    try:
        img = ImageGrab.grab(bbox=(x1, y1, x2, y2), all_screens=True)
    except TypeError:
        img = ImageGrab.grab(bbox=(x1, y1, x2, y2))
    b64, w, h = _png_b64(img)
    return {"ok": True, "data": b64, "width": w, "height": h}
