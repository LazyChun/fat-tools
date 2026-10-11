/*
 * fat-tools 路由定义
 *
 * 侧边栏菜单点击 → sdk.router.navigate(path)；右侧工作台页
 * （registerWorkbenchPage）根据 sdk.router.getCurrent().path 渲染对应工具。
 *
 * 路由格式：/tools/<toolId>
 *
 * 注意：本模块被 HistoryTool（由 registry 导入）引用，与 registry 存在
 * 循环依赖，因此禁止在模块顶层访问 TOOLS（会触发 TDZ），一律惰性求值。
 */
import { TOOLS } from "./tools/registry";

export const ROUTE_PREFIX = "/tools";

/** 工具 id → 路由 path（未知 id 返回 null） */
export function toolIdToPath(toolId: string): string | null {
  return TOOLS.some((t) => t.id === toolId) ? `${ROUTE_PREFIX}/${toolId}` : null;
}

/** path → 工具 id（非本插件路由返回 null） */
export function pathToToolId(path: string): string | null {
  if (!path || !path.startsWith(`${ROUTE_PREFIX}/`)) return null;
  const id = path.slice(ROUTE_PREFIX.length + 1);
  return TOOLS.some((t) => t.id === id) ? id : null;
}

/** 默认落地路由（首个工具） */
export function getDefaultRoute(): string {
  return TOOLS.length ? `${ROUTE_PREFIX}/${TOOLS[0].id}` : ROUTE_PREFIX;
}
