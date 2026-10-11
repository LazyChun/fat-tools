/*
 * WorkPageView：工作台整页（右侧工作区）
 *
 * 通过 registerWorkbenchPage 注册（id 与活动栏项 id 一致），
 * 根据 sdk.router.getCurrent().path 渲染对应工具的完整界面。
 */
import React, { useEffect, useMemo, useReducer } from "react";
import type { FatNotesPluginSDK } from "fat-notes-sdk";
import { Empty } from "antd";
import { TOOLS } from "./tools/registry";
import { getDefaultRoute, pathToToolId, toolIdToPath } from "./routes";
import { getPreferredToolId } from "./preferences";
import ThemeShell from "./ThemeShell";

interface Props {
  sdk: FatNotesPluginSDK;
}

const WorkPageView: React.FC<Props> = ({ sdk }) => {
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    const d = sdk.router.onChange(() => forceUpdate());
    return () => d.dispose();
  }, [sdk]);

  const { path } = sdk.router.getCurrent();
  const toolId = pathToToolId(path);
  const tool = useMemo(() => TOOLS.find((t) => t.id === toolId) || null, [toolId]);

  // 当前路由不属于本插件（首次进入 / 其它插件切换过路由）时，兜底导航到记忆的工具
  useEffect(() => {
    if (pathToToolId(sdk.router.getCurrent().path)) return;
    const preferred = getPreferredToolId();
    const landing = (preferred && toolIdToPath(preferred)) || getDefaultRoute();
    sdk.router.navigate(landing);
  }, [sdk, path]);

  if (!tool) {
    return (
      <ThemeShell sdk={sdk} padding={24}>
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="正在打开工具箱…"
        />
      </ThemeShell>
    );
  }

  const Active = tool.component;

  return (
    <ThemeShell sdk={sdk} padding={16}>
      <Active />
    </ThemeShell>
  );
};

export default WorkPageView;
