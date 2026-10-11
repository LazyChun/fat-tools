/*
 * fat-tools 本地偏好（localStorage）：记忆上次使用的工具
 */
const DEFAULT_TOOL_KEY = "fat-tools.defaultTool";

export function getPreferredToolId(): string | null {
  try {
    return window.localStorage.getItem(DEFAULT_TOOL_KEY);
  } catch {
    return null;
  }
}

export function setPreferredToolId(id: string | null): void {
  try {
    if (id) window.localStorage.setItem(DEFAULT_TOOL_KEY, id);
    else window.localStorage.removeItem(DEFAULT_TOOL_KEY);
  } catch {
    /* ignore */
  }
}
