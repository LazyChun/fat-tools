/*
 * 仪表盘卡片图标（内联 SVG data-URI）
 *
 * 宿主 BlockMenuItem 直接把 iconUrl 塞进 <img src>，相对/绝对路径都会
 * 404（插件静态资源没有独立的公开根路径），因此用 data-URI 内联最可靠。
 */

const CALCULATOR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
  <rect x="9" y="4" width="30" height="40" rx="5" fill="#1677ff"/>
  <rect x="13" y="9" width="22" height="10" rx="2" fill="#ffffff" opacity="0.95"/>
  <g fill="#ffffff">
    <rect x="13" y="23" width="6" height="5" rx="1.2"/>
    <rect x="22" y="23" width="6" height="5" rx="1.2"/>
    <rect x="31" y="23" width="4" height="5" rx="1.2"/>
    <rect x="13" y="31" width="6" height="5" rx="1.2"/>
    <rect x="22" y="31" width="6" height="5" rx="1.2"/>
    <rect x="31" y="31" width="4" height="9" rx="1.2" opacity="0.85"/>
    <rect x="13" y="38.5" width="6" height="1.5" rx="0.75" opacity="0.9"/>
    <rect x="22" y="38.5" width="6" height="1.5" rx="0.75" opacity="0.9"/>
  </g>
</svg>`;

export const CALCULATOR_ICON_URL = `data:image/svg+xml;utf8,${encodeURIComponent(CALCULATOR_SVG)}`;
