/*
 * 「工具」仪表盘卡片图标（内联 SVG data-URI）
 *
 * 宿主添加组件菜单把 iconUrl 直接塞进 <img src>，插件静态资源没有
 * 独立公开根路径，相对/绝对路径都会 404，因此用 data-URI 内联最可靠
 * （同 src/assets/calculatorIcon.ts 的做法）。
 */

const TOOL_SWITCHER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
  <rect x="4" y="4" width="40" height="40" rx="10" fill="#1677ff"/>
  <path d="M14 23h20c.55 0 1 .45 1 1v11c0 .55-.45 1-1 1H14c-.55 0-1-.45-1-1V24c0-.55.45-1 1-1z" fill="#ffffff" opacity="0.95"/>
  <path d="M19 23v-5c0-.55.45-1 1-1h8c.55 0 1 .45 1 1v5" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.95"/>
  <rect x="21.5" y="26.5" width="5" height="5" rx="1.25" fill="#1677ff"/>
</svg>`;

export const TOOL_SWITCHER_ICON_URL = `data:image/svg+xml;utf8,${encodeURIComponent(
  TOOL_SWITCHER_SVG,
)}`;
