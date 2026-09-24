/**
 * Orbit_0918 新 UI 设计 tokens。
 *
 * 唯一来源：docs/designs/Orbit_0918/CLAUDE.md（设计规范）与各 .dc.html 设计稿。
 * 批次 0 只落地常量，不改全局 CSS；后续批次（导航浮岛视觉、各页面组件）
 * 统一从这里取值，避免逐页散落十六进制。
 */
export const ORBIT_0918_COLORS = {
  /** 主文字 */
  ink: "#0E1225",
  /** 次级文字 / 链接 */
  text2: "#3B3F7A",
  /** 辅助说明文字 */
  text3: "#6B6F99",
  /** 弱提示文字 */
  text4: "#9FA3C4",
  /** 页面底色 */
  pageBg: "#FBFBFE",
  /** 面板底色（大区块） */
  panel: "#ECEEFB",
  /** 面板底色（浅） */
  panelSoft: "#F7F7FD",
  /** 卡片边框 */
  border: "#E8E9F6",
  /** 输入框 / 控件边框 */
  borderStrong: "#DDDEFA",
  /** 强调（主按钮 hover、高亮） */
  accent: "#4B4FC7",
  /** 强调深（结论文字、深色 chip） */
  accentDeep: "#2E3270",
} as const;

export const ORBIT_0918_FONTS = {
  /** 标题：Noto Serif SC 900 */
  serif: "'Noto Serif SC', 'Songti SC', 'SimSun', serif",
  /** 正文：Noto Sans SC */
  sans: "'Noto Sans SC', 'PingFang SC', 'Hiragino Sans GB', sans-serif",
} as const;

/** 容器与导航尺寸（设计规范 CLAUDE.md 第 2 条）。 */
export const ORBIT_0918_LAYOUT = {
  /** 页面内容容器最大宽度 */
  containerMax: 1240,
  /** 滚动收拢后浮岛导航最大宽度 */
  navPillMax: 1180,
  /** 导航收拢的滚动阈值（px） */
  navCollapseScrollY: 40,
} as const;

export const ORBIT_0918_SHADOWS = {
  card: "0 10px 40px rgba(59,63,122,0.08)",
  navPill: "0 12px 40px rgba(59,63,122,0.12)",
} as const;
