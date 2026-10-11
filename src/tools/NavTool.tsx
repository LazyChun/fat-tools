/*
 * 网站导航：可自定义的网址导航页
 *
 * - 支持任意多个导航页（页签切换），每页内可建多个分组
 * - 链接支持自定义图标（emoji / 图片 URL），默认自动读取站点 favicon
 * - 管理模式下可新增 / 编辑 / 删除 / 排序（页、分组、链接）
 * - 关键字过滤；配置整体导出 / 导入 JSON；localStorage 持久化
 * - 点击链接优先走后端 nav.openUrl 调系统默认浏览器，失败时 window.open 兜底
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Empty,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  Upload,
} from "antd";
import {
  AppstoreAddOutlined,
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  EditOutlined,
  ExportOutlined,
  FolderOutlined,
  ImportOutlined,
  LinkOutlined,
  PlusOutlined,
  SearchOutlined,
  SettingOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import { ToolShell } from "../components/Common";
import { getSdk, recordUsage } from "../historyClient";
import {
  buildExport,
  countLinks,
  deleteGroup,
  deleteLink,
  deletePage,
  faviconCandidates,
  filterPage,
  getDomain,
  hueOf,
  isImageIcon,
  isValidHttpUrl,
  loadActivePageId,
  loadPages,
  moveGroup,
  moveLink,
  movePage,
  normalizeUrl,
  parseImportText,
  saveActivePageId,
  savePages,
  uid,
  upsertGroup,
  upsertLink,
  upsertPage,
  type NavGroup,
  type NavLink,
  type NavPage,
} from "./navData";

const { Text } = Typography;

interface Props {
  onBack?: () => void;
}

// ── 通用辅助 ──────────────────────────────────────────────────

/** 在系统默认浏览器打开链接；后端不可用时退回 window.open */
async function openExternal(url: string): Promise<void> {
  try {
    const sdk = getSdk();
    if (sdk && (await sdk.backend.isRunning())) {
      const r = await sdk.backend.invoke<{ ok?: boolean }>("nav.openUrl", {
        url,
      });
      if (r?.ok) return;
    }
  } catch {
    /* 走兜底 */
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

function toast(kind: "success" | "warn" | "error" | "info", msg: string): void {
  try {
    getSdk()?.ui.toast[kind](msg);
  } catch {
    /* 独立预览环境无 SDK 时静默 */
  }
}

async function confirmDialog(
  title: string,
  content?: string,
): Promise<boolean> {
  try {
    const sdk = getSdk();
    if (sdk) {
      return await sdk.ui.modal.confirm({
        title,
        content,
        okText: "确定",
        cancelText: "取消",
      });
    }
  } catch {
    /* 走兜底 */
  }
  return window.confirm(content ? `${title}\n${content}` : title);
}

function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ── 网站图标：自定义图片 → 站点 favicon → 首字母方块 ──────────

const LetterAvatar: React.FC<{ text: string; size: number }> = ({
  text,
  size,
}) => {
  const ch = (text || "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 6,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        fontSize: size * 0.55,
        fontWeight: 600,
        background: `hsl(${hueOf(text)}, 55%, 45%)`,
        userSelect: "none",
      }}
    >
      {ch}
    </div>
  );
};

const Favicon: React.FC<{ link: NavLink; size?: number }> = ({
  link,
  size = 30,
}) => {
  const candidates = useMemo(() => faviconCandidates(link.url), [link.url]);
  const [stage, setStage] = useState(0);
  const [customBroken, setCustomBroken] = useState(false);

  useEffect(() => {
    setStage(0);
    setCustomBroken(false);
  }, [link.url, link.icon]);

  const custom = (link.icon || "").trim();
  const customAsImage = custom && isImageIcon(custom) && !customBroken;

  if (customAsImage) {
    return (
      <img
        src={custom}
        width={size}
        height={size}
        alt=""
        onError={() => setCustomBroken(true)}
        style={{
          width: size,
          height: size,
          borderRadius: 6,
          objectFit: "cover",
          flexShrink: 0,
        }}
      />
    );
  }
  if (custom) {
    // emoji / 短文字图标
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: 6,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: size * 0.62,
          lineHeight: 1,
          background: "rgba(128,128,128,0.12)",
          userSelect: "none",
        }}
      >
        {custom.slice(0, 4)}
      </div>
    );
  }
  if (stage >= candidates.length) {
    return (
      <LetterAvatar text={link.title || getDomain(link.url)} size={size} />
    );
  }
  return (
    <img
      src={candidates[stage]}
      width={size}
      height={size}
      alt=""
      onError={() => setStage((s) => s + 1)}
      style={{ width: size, height: size, borderRadius: 6, flexShrink: 0 }}
    />
  );
};

// ── 链接卡片 ──────────────────────────────────────────────────

const LinkCard: React.FC<{
  link: NavLink;
  editMode: boolean;
  canUp: boolean;
  canDown: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onMove: (delta: -1 | 1) => void;
}> = ({ link, editMode, canUp, canDown, onOpen, onEdit, onDelete, onMove }) => {
  const domain = getDomain(link.url);
  return (
    <Tooltip
      title={link.desc ? `${link.title}：${link.desc}` : link.url}
      placement="top"
      mouseEnterDelay={0.5}
    >
      <div
        onClick={editMode ? undefined : onOpen}
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 12px",
          borderRadius: 8,
          border: "1px solid rgba(128,128,128,0.22)",
          background: "rgba(128,128,128,0.05)",
          cursor: editMode ? "default" : "pointer",
          transition: "border-color 0.12s ease, box-shadow 0.12s ease",
          minWidth: 0,
        }}
        onMouseEnter={(e) => {
          if (!editMode) {
            e.currentTarget.style.borderColor = "rgba(22,119,255,0.55)";
            e.currentTarget.style.boxShadow =
              "0 2px 10px rgba(22,119,255,0.15)";
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = "rgba(128,128,128,0.22)";
          e.currentTarget.style.boxShadow = "none";
        }}
      >
        <Favicon link={link} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {link.title}
          </div>
          <div
            style={{
              fontSize: 11,
              opacity: 0.6,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {domain || link.url}
          </div>
        </div>
        {editMode ? (
          <Space
            size={2}
            style={{ flexShrink: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              size="small"
              type="text"
              disabled={!canUp}
              icon={<ArrowUpOutlined />}
              onClick={() => onMove(-1)}
            />
            <Button
              size="small"
              type="text"
              disabled={!canDown}
              icon={<ArrowDownOutlined />}
              onClick={() => onMove(1)}
            />
            <Button
              size="small"
              type="text"
              icon={<EditOutlined />}
              onClick={onEdit}
            />
            <Button
              size="small"
              type="text"
              danger
              icon={<DeleteOutlined />}
              onClick={onDelete}
            />
          </Space>
        ) : null}
      </div>
    </Tooltip>
  );
};

// ── 链接编辑弹窗 ──────────────────────────────────────────────

const LinkEditModal: React.FC<{
  page: NavPage;
  sourceGroupId: string;
  link: NavLink | null; // null = 新增
  onCancel: () => void;
  onSaved: (
    targetGroupId: string,
    saved: NavLink,
    movedFromGroupId: string | null,
  ) => void;
}> = ({ page, sourceGroupId, link, onCancel, onSaved }) => {
  const [title, setTitle] = useState(link?.title || "");
  const [url, setUrl] = useState(link?.url || "");
  const [desc, setDesc] = useState(link?.desc || "");
  const [icon, setIcon] = useState(link?.icon || "");
  const [groupId, setGroupId] = useState(sourceGroupId);
  const [error, setError] = useState("");

  const ok = () => {
    const t = title.trim();
    if (!t) {
      setError("请填写网站名称");
      return;
    }
    const normalized = normalizeUrl(url);
    if (!isValidHttpUrl(normalized)) {
      setError("网址无效，请填写正确的域名或 http(s):// 链接");
      return;
    }
    const saved: NavLink = {
      id: link?.id || uid(),
      title: t,
      url: normalized,
      desc: desc.trim() || undefined,
      icon: icon.trim() || undefined,
    };
    onSaved(groupId, saved, groupId !== sourceGroupId ? sourceGroupId : null);
  };

  return (
    <Modal
      open
      title={link ? "编辑网站" : "添加网站"}
      onCancel={onCancel}
      onOk={ok}
      okText="保存"
      cancelText="取消"
      width={480}
    >
      {error ? (
        <Alert
          type="error"
          showIcon
          message={error}
          style={{ marginBottom: 10 }}
        />
      ) : null}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            名称
          </Text>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例如：GitHub"
            maxLength={60}
            autoFocus
            onPressEnter={ok}
          />
        </div>
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            网址
          </Text>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="github.com 或 https://github.com"
            maxLength={2048}
            onPressEnter={ok}
          />
        </div>
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            所属分组
          </Text>
          <Select
            value={groupId}
            onChange={setGroupId}
            style={{ width: "100%" }}
            options={page.groups.map((g) => ({ value: g.id, label: g.title }))}
          />
        </div>
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            图标（可留空自动获取；可填 emoji 或图片 URL）
          </Text>
          <Input
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            placeholder="留空自动获取；或填 🐙 / https://…/logo.png"
            maxLength={500}
          />
        </div>
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            备注（可选）
          </Text>
          <Input.TextArea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="一句话描述这个网站"
            maxLength={200}
            autoSize={{ minRows: 2, maxRows: 4 }}
          />
        </div>
      </div>
    </Modal>
  );
};

// ── 分组编辑弹窗 ──────────────────────────────────────────────

const GroupEditModal: React.FC<{
  group: NavGroup | null;
  onCancel: () => void;
  onSaved: (group: NavGroup) => void;
}> = ({ group, onCancel, onSaved }) => {
  const [title, setTitle] = useState(group?.title || "");
  const [error, setError] = useState("");

  const ok = () => {
    const t = title.trim();
    if (!t) {
      setError("请填写分组名称");
      return;
    }
    onSaved({ id: group?.id || uid(), title: t, links: group?.links || [] });
  };

  return (
    <Modal
      open
      title={group ? "编辑分组" : "添加分组"}
      onCancel={onCancel}
      onOk={ok}
      okText="保存"
      cancelText="取消"
    >
      {error ? (
        <Alert
          type="error"
          showIcon
          message={error}
          style={{ marginBottom: 10 }}
        />
      ) : null}
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="例如：常用工具"
        maxLength={60}
        autoFocus
        onPressEnter={ok}
      />
    </Modal>
  );
};

// ── 导航页管理弹窗 ────────────────────────────────────────────

const PageManageModal: React.FC<{
  pages: NavPage[];
  renaming: { id: string; value: string } | null;
  onCancel: () => void;
  onRenameChange: (value: string) => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
  onStartRename: (page: NavPage) => void;
  onMove: (pageId: string, delta: -1 | 1) => void;
  onDelete: (pageId: string) => void;
}> = ({
  pages,
  renaming,
  onCancel,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
  onStartRename,
  onMove,
  onDelete,
}) => (
  <Modal open title="管理导航页" onCancel={onCancel} footer={null} width={520}>
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {pages.map((p, i) => (
        <div
          key={p.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 10px",
            borderRadius: 6,
            background: "rgba(128,128,128,0.08)",
          }}
        >
          {renaming?.id === p.id ? (
            <>
              <Input
                value={renaming.value}
                onChange={(e) => onRenameChange(e.target.value)}
                onPressEnter={onRenameCommit}
                maxLength={40}
                autoFocus
                size="small"
                style={{ flex: 1 }}
              />
              <Button size="small" type="primary" onClick={onRenameCommit}>
                保存
              </Button>
              <Button size="small" onClick={onRenameCancel}>
                取消
              </Button>
            </>
          ) : (
            <>
              <FolderOutlined style={{ color: "#1677ff" }} />
              <Text style={{ flex: 1, minWidth: 0 }} ellipsis>
                {p.name}
              </Text>
              <Tag bordered={false} style={{ marginInlineEnd: 0 }}>
                {countLinks([p])} 链接
              </Tag>
              <Button
                size="small"
                type="text"
                disabled={i === 0}
                icon={<ArrowUpOutlined />}
                onClick={() => onMove(p.id, -1)}
              />
              <Button
                size="small"
                type="text"
                disabled={i === pages.length - 1}
                icon={<ArrowDownOutlined />}
                onClick={() => onMove(p.id, 1)}
              />
              <Button
                size="small"
                type="text"
                icon={<EditOutlined />}
                onClick={() => onStartRename(p)}
              />
              <Popconfirm
                title={`删除导航页「${p.name}」？`}
                description="页内分组与链接将一并删除"
                okText="删除"
                cancelText="取消"
                okButtonProps={{ danger: true }}
                disabled={pages.length <= 1}
                onConfirm={() => onDelete(p.id)}
              >
                <Button
                  size="small"
                  type="text"
                  danger
                  disabled={pages.length <= 1}
                  icon={<DeleteOutlined />}
                />
              </Popconfirm>
            </>
          )}
        </div>
      ))}
      {pages.length <= 1 ? (
        <Text type="secondary" style={{ fontSize: 12 }}>
          至少保留一个导航页
        </Text>
      ) : null}
    </div>
  </Modal>
);

// ── 导入弹窗 ──────────────────────────────────────────────────

const ImportModal: React.FC<{
  onCancel: () => void;
  onImported: (pages: NavPage[]) => void;
}> = ({ onCancel, onImported }) => {
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  const doImport = () => {
    const pages = parseImportText(text.trim());
    if (!pages) {
      setError("无法解析：请粘贴网站导航导出的 JSON（或页数组）");
      return;
    }
    onImported(pages);
  };

  return (
    <Modal
      open
      title="导入导航配置"
      onCancel={onCancel}
      onOk={doImport}
      okText="导入并覆盖当前配置"
      cancelText="取消"
      width={560}
    >
      {error ? (
        <Alert
          type="error"
          showIcon
          message={error}
          style={{ marginBottom: 10 }}
        />
      ) : null}
      <Alert
        type="info"
        showIcon
        message="导入会覆盖当前所有导航页，建议先导出备份。"
        style={{ marginBottom: 10 }}
      />
      <Upload
        accept=".json,application/json"
        showUploadList={false}
        beforeUpload={(file) => {
          const reader = new FileReader();
          reader.onload = () => setText(String(reader.result || ""));
          reader.readAsText(file as unknown as File);
          return false;
        }}
      >
        <Button
          size="small"
          icon={<UploadOutlined />}
          style={{ marginBottom: 8 }}
        >
          选择导出的 JSON 文件
        </Button>
      </Upload>
      <Input.TextArea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder='也可以直接粘贴 JSON，例如 {"type":"fat-tools.nav","pages":[…]}'
        autoSize={{ minRows: 8, maxRows: 14 }}
        style={{ fontFamily: "monospace", fontSize: 12 }}
      />
    </Modal>
  );
};

// ── 主组件 ────────────────────────────────────────────────────

const NavTool: React.FC<Props> = ({ onBack }) => {
  const [pages, setPages] = useState<NavPage[]>(() => loadPages());
  const [activeId, setActiveId] = useState<string>(() => {
    const saved = loadActivePageId();
    return saved && pages.some((p) => p.id === saved)
      ? saved
      : pages[0]?.id || "";
  });
  const [editMode, setEditMode] = useState(false);
  const [query, setQuery] = useState("");

  // 弹窗状态
  const [linkEditor, setLinkEditor] = useState<{
    groupId: string;
    link: NavLink | null;
  } | null>(null);
  const [groupEditor, setGroupEditor] = useState<{
    group: NavGroup | null;
  } | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [renaming, setRenaming] = useState<{
    id: string;
    value: string;
  } | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  // 持久化
  useEffect(() => savePages(pages), [pages]);
  useEffect(() => saveActivePageId(activeId), [activeId]);

  const activePage = pages.find((p) => p.id === activeId) || pages[0];

  const viewPage = useMemo(
    () => (activePage ? filterPage(activePage, query) : null),
    [activePage, query],
  );

  const totalLinks = countLinks(pages);

  // ── 页签 / 导航页操作 ──

  const switchPage = (id: string) => {
    setActiveId(id);
    setQuery("");
  };

  const addPage = () => {
    const page: NavPage = {
      id: uid(),
      name: `新页面 ${pages.length + 1}`,
      groups: [],
    };
    setPages(upsertPage(pages, page));
    setActiveId(page.id);
    setQuery("");
    setManageOpen(true);
    setRenaming({ id: page.id, value: page.name });
    recordUsage({
      toolId: "nav",
      toolTitle: "网站导航",
      action: "add-page",
      summary: `新增导航页：${page.name}`,
    });
  };

  const removePage = async (pageId: string) => {
    const target = pages.find((p) => p.id === pageId);
    const next = deletePage(pages, pageId);
    setPages(next);
    if (activeId === pageId) setActiveId(next[0]?.id || "");
    toast("success", `已删除导航页「${target?.name || ""}」`);
    recordUsage({
      toolId: "nav",
      toolTitle: "网站导航",
      action: "delete-page",
      summary: `删除导航页：${target?.name || pageId}`,
    });
  };

  const commitRename = () => {
    if (!renaming) return;
    const value = renaming.value.trim();
    if (!value) {
      toast("warn", "名称不能为空");
      return;
    }
    setPages((prev) =>
      prev.map((p) =>
        p.id === renaming.id ? { ...p, name: value.slice(0, 40) } : p,
      ),
    );
    setRenaming(null);
  };

  // ── 分组操作 ──

  const saveGroup = (group: NavGroup) => {
    if (!activePage) return;
    setPages(upsertGroup(pages, activePage.id, group));
    setGroupEditor(null);
    recordUsage({
      toolId: "nav",
      toolTitle: "网站导航",
      action: groupEditor?.group ? "edit-group" : "add-group",
      summary: `${groupEditor?.group ? "编辑" : "新增"}分组：${group.title}`,
    });
  };

  const removeGroup = (groupId: string) => {
    if (!activePage) return;
    const g = activePage.groups.find((x) => x.id === groupId);
    setPages(deleteGroup(pages, activePage.id, groupId));
    if (linkEditor?.groupId === groupId) setLinkEditor(null);
    toast("success", `已删除分组「${g?.title || ""}」`);
    recordUsage({
      toolId: "nav",
      toolTitle: "网站导航",
      action: "delete-group",
      summary: `删除分组：${g?.title || groupId}`,
    });
  };

  // ── 链接操作 ──

  const saveLink = (
    targetGroupId: string,
    saved: NavLink,
    movedFromGroupId: string | null,
  ) => {
    if (!activePage) return;
    let next = upsertLink(pages, activePage.id, targetGroupId, saved);
    if (movedFromGroupId)
      next = deleteLink(next, activePage.id, movedFromGroupId, saved.id);
    setPages(next);
    setLinkEditor(null);
    toast(
      "success",
      linkEditor?.link ? "已保存修改" : `已添加「${saved.title}」`,
    );
    recordUsage({
      toolId: "nav",
      toolTitle: "网站导航",
      action: linkEditor?.link ? "edit-link" : "add-link",
      summary: `${linkEditor?.link ? "编辑" : "新增"}网站：${saved.title}（${saved.url}）`,
      detail: { title: saved.title, url: saved.url },
    });
  };

  const removeLink = (groupId: string, link: NavLink) => {
    if (!activePage) return;
    setPages(deleteLink(pages, activePage.id, groupId, link.id));
    toast("success", `已删除「${link.title}」`);
    recordUsage({
      toolId: "nav",
      toolTitle: "网站导航",
      action: "delete-link",
      summary: `删除网站：${link.title}`,
    });
  };

  // ── 导入 / 导出 ──

  const doExport = () => {
    if (!activePage) return;
    const stamp = new Date().toISOString().slice(0, 10);
    downloadJson(`fat-tools-nav-${stamp}.json`, buildExport(pages));
    toast("success", `已导出 ${pages.length} 个导航页 / ${totalLinks} 个链接`);
    recordUsage({
      toolId: "nav",
      toolTitle: "网站导航",
      action: "export",
      summary: `导出 ${pages.length} 个导航页 / ${totalLinks} 个链接`,
    });
  };

  const doImport = async (incoming: NavPage[]) => {
    if (totalLinks > 0) {
      const ok = await confirmDialog(
        "覆盖当前导航配置？",
        `现有 ${pages.length} 个导航页 / ${totalLinks} 个链接将被替换为导入的 ${incoming.length} 个导航页 / ${countLinks(incoming)} 个链接。`,
      );
      if (!ok) return;
    }
    setPages(incoming);
    setActiveId(incoming[0].id);
    setQuery("");
    setImportOpen(false);
    setEditMode(false);
    toast(
      "success",
      `已导入 ${incoming.length} 个导航页 / ${countLinks(incoming)} 个链接`,
    );
    recordUsage({
      toolId: "nav",
      toolTitle: "网站导航",
      action: "import",
      summary: `导入 ${incoming.length} 个导航页 / ${countLinks(incoming)} 个链接`,
    });
  };

  // ── 渲染 ────────────────────────────────────────────────────

  return (
    <ToolShell
      title="网站导航"
      onBack={onBack}
      extra={
        <Space size={6} wrap>
          <Button
            size="small"
            icon={<ImportOutlined />}
            onClick={() => setImportOpen(true)}
          >
            导入
          </Button>
          <Button
            size="small"
            icon={<ExportOutlined />}
            onClick={doExport}
            disabled={pages.length === 0}
          >
            导出
          </Button>
          <Space size={4}>
            <Switch size="small" checked={editMode} onChange={setEditMode} />
            <Text style={{ fontSize: 12 }}>管理模式</Text>
          </Space>
        </Space>
      }
    >
      {activePage && viewPage ? (
        <>
          <Tabs
            size="small"
            activeKey={activePage.id}
            onChange={switchPage}
            items={pages.map((p) => ({
              key: p.id,
              label: (
                <span>
                  {p.name}
                  <Tag
                    bordered={false}
                    style={{
                      marginInlineStart: 6,
                      marginInlineEnd: 0,
                      fontSize: 11,
                    }}
                  >
                    {countLinks([p])}
                  </Tag>
                </span>
              ),
            }))}
            tabBarExtraContent={
              <Space size={4}>
                <Button
                  size="small"
                  type="text"
                  icon={<PlusOutlined />}
                  onClick={addPage}
                >
                  新页面
                </Button>
                <Button
                  size="small"
                  type="text"
                  icon={<SettingOutlined />}
                  onClick={() => {
                    setRenaming(null);
                    setManageOpen(true);
                  }}
                >
                  页面管理
                </Button>
              </Space>
            }
          />

          <Input
            size="small"
            allowClear
            prefix={<SearchOutlined />}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`在「${activePage.name}」中搜索网站…`}
            style={{ marginBottom: 12, maxWidth: 360 }}
          />

          {viewPage.groups.length === 0 ? (
            query ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={`「${activePage.name}」中没有匹配「${query}」的网站`}
              />
            ) : activePage.groups.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="这个导航页还是空的，先创建一个分组吧"
              >
                <Button
                  type="primary"
                  icon={<AppstoreAddOutlined />}
                  onClick={() => setGroupEditor({ group: null })}
                >
                  创建第一个分组
                </Button>
              </Empty>
            ) : null
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 18,
                paddingBottom: 12,
              }}
            >
              {viewPage.groups.map((g, gi) => {
                const sourceGroup = activePage.groups.find(
                  (x) => x.id === g.id,
                );
                const total = sourceGroup?.links.length || g.links.length;
                return (
                  <section key={g.id}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 8,
                        flexWrap: "wrap",
                      }}
                    >
                      <FolderOutlined style={{ color: "#1677ff" }} />
                      <Text strong>{g.title}</Text>
                      <Tag bordered={false} style={{ marginInlineEnd: 0 }}>
                        {total}
                      </Tag>
                      {editMode && !query ? (
                        <Space size={2} style={{ marginLeft: "auto" }}>
                          <Tooltip title="在该分组添加网站">
                            <Button
                              size="small"
                              type="text"
                              icon={<LinkOutlined />}
                              onClick={() =>
                                setLinkEditor({ groupId: g.id, link: null })
                              }
                            >
                              加网站
                            </Button>
                          </Tooltip>
                          <Button
                            size="small"
                            type="text"
                            icon={<EditOutlined />}
                            onClick={() =>
                              setGroupEditor({ group: sourceGroup || g })
                            }
                          />
                          <Button
                            size="small"
                            type="text"
                            disabled={gi === 0}
                            icon={<ArrowUpOutlined />}
                            onClick={() =>
                              setPages(
                                moveGroup(pages, activePage.id, g.id, -1),
                              )
                            }
                          />
                          <Button
                            size="small"
                            type="text"
                            disabled={gi === viewPage.groups.length - 1}
                            icon={<ArrowDownOutlined />}
                            onClick={() =>
                              setPages(moveGroup(pages, activePage.id, g.id, 1))
                            }
                          />
                          <Popconfirm
                            title={`删除分组「${g.title}」？`}
                            description="组内链接将一并删除"
                            okText="删除"
                            cancelText="取消"
                            okButtonProps={{ danger: true }}
                            onConfirm={() => removeGroup(g.id)}
                          >
                            <Button
                              size="small"
                              type="text"
                              danger
                              icon={<DeleteOutlined />}
                            />
                          </Popconfirm>
                        </Space>
                      ) : null}
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(auto-fill, minmax(210px, 1fr))",
                        gap: 8,
                      }}
                    >
                      {g.links.map((link, li) => (
                        <LinkCard
                          key={link.id}
                          link={link}
                          editMode={editMode && !query}
                          canUp={li > 0}
                          canDown={li < g.links.length - 1}
                          onOpen={() => openExternal(link.url)}
                          onEdit={() => setLinkEditor({ groupId: g.id, link })}
                          onDelete={() => removeLink(g.id, link)}
                          onMove={(delta) =>
                            setPages(
                              moveLink(
                                pages,
                                activePage.id,
                                g.id,
                                link.id,
                                delta,
                              ),
                            )
                          }
                        />
                      ))}
                      {editMode && !query ? (
                        <button
                          type="button"
                          onClick={() =>
                            setLinkEditor({ groupId: g.id, link: null })
                          }
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 6,
                            padding: "10px 12px",
                            borderRadius: 8,
                            border: "1px dashed rgba(128,128,128,0.45)",
                            background: "transparent",
                            color: "rgba(128,128,128,0.9)",
                            cursor: "pointer",
                            fontSize: 13,
                          }}
                        >
                          <PlusOutlined />
                          添加网站
                        </button>
                      ) : null}
                    </div>
                  </section>
                );
              })}

              {editMode && !query ? (
                <Button
                  block
                  icon={<AppstoreAddOutlined />}
                  onClick={() => setGroupEditor({ group: null })}
                  style={{ borderStyle: "dashed" }}
                >
                  添加分组
                </Button>
              ) : null}
            </div>
          )}

          <Text
            type="secondary"
            style={{ fontSize: 12, display: "block", marginTop: 8 }}
          >
            共 {pages.length} 个导航页 / {totalLinks}{" "}
            个链接，配置保存在本地（localStorage），可导出 JSON 备份或迁移。
          </Text>
        </>
      ) : (
        <Empty description="暂无导航页" />
      )}

      {/* 弹窗 */}
      {linkEditor && activePage ? (
        <LinkEditModal
          page={activePage}
          sourceGroupId={linkEditor.groupId}
          link={linkEditor.link}
          onCancel={() => setLinkEditor(null)}
          onSaved={saveLink}
        />
      ) : null}
      {groupEditor ? (
        <GroupEditModal
          group={groupEditor.group}
          onCancel={() => setGroupEditor(null)}
          onSaved={saveGroup}
        />
      ) : null}
      {manageOpen ? (
        <PageManageModal
          pages={pages}
          renaming={renaming}
          onCancel={() => {
            setManageOpen(false);
            setRenaming(null);
          }}
          onRenameChange={(value) =>
            setRenaming((r) => (r ? { ...r, value } : r))
          }
          onRenameCommit={commitRename}
          onRenameCancel={() => setRenaming(null)}
          onStartRename={(p) => setRenaming({ id: p.id, value: p.name })}
          onMove={(pageId, delta) => setPages(movePage(pages, pageId, delta))}
          onDelete={removePage}
        />
      ) : null}
      {importOpen ? (
        <ImportModal
          onCancel={() => setImportOpen(false)}
          onImported={doImport}
        />
      ) : null}
    </ToolShell>
  );
};

export default NavTool;
