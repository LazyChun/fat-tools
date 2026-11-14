import { useEffect } from "react";

/**
 * 工具输入框的「全局搜索直达」喂入器。
 *
 * 宿主全局搜索命中本工具的 inputPattern 后，点击结果项会：
 *   1. 切换到本插件工作台并导航到对应工具；
 *   2. 调用 feed(query) 把触发命中的搜索文本填入工具输入框。
 *
 * feed 仅在文本匹配 pattern 时生效：按名称/描述/关键词点进工具（如搜「计算器」）
 * 不会把搜索词塞进输入框；只有算式、时间戳、URL 等可解析内容才会填入。
 *
 * 组件未挂载时 feed 暂存文本，挂载后由 useFeedValue 自动消费；
 * 已挂载时直接填入。compact 卡片与整页视图同时挂载时，以最后
 * 挂载的实例为准（与既有 CalculatorTool 行为一致）。
 */
export interface ToolSearchFeed {
  /** 输入内容匹配模式：用户搜索文本命中该正则时，本工具出现在全局搜索结果中 */
  pattern: RegExp;
  /** 全局搜索直达：匹配 pattern 时把搜索文本填入输入框（未挂载则暂存，挂载时消费） */
  feed(value: string): void;
  /** 组件内 hook：登记输入 setter 并消费暂存文本 */
  useFeedValue(setValue: (value: string) => void): void;
}

/** 与宿主 matchPluginSearchItem 一致：trim + lowercase 后再测 pattern */
export function matchesToolSearchInput(pattern: RegExp, value: string): boolean {
  const q = value.trim().toLowerCase();
  if (!q) return false;
  pattern.lastIndex = 0;
  try {
    return pattern.test(q);
  } catch {
    return false;
  }
}

/** 创建工具输入喂入器；pattern 用小写文本匹配（宿主侧已 trim + lowercase） */
export function createToolSearchFeed(pattern: RegExp): ToolSearchFeed {
  let pending: string | null = null;
  let setter: ((value: string) => void) | null = null;

  function feed(value: string): void {
    const trimmed = value.trim();
    // 名称/关键词命中也会带上搜索词；只接受真正匹配输入模式的内容
    if (!matchesToolSearchInput(pattern, trimmed)) return;
    if (setter) {
      setter(trimmed);
    } else {
      pending = trimmed;
    }
  }

  function useFeedValue(setValue: (value: string) => void): void {
    useEffect(() => {
      setter = setValue;
      if (pending !== null) {
        const value = pending;
        pending = null;
        setValue(value);
      }
      return () => {
        setter = null;
      };
    }, [setValue]);
  }

  return { pattern, feed, useFeedValue };
}
