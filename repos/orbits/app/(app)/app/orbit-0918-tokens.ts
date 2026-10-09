/**
 * Orbit_0918 新 UI 设计 tokens。
 *
 * 改版 R01：颜色和字体改为引用设计 token（orbit-2026/tokens.css，源为
 * shared/design/tokens.json），名字用设计稿命名。这些 0918 页面在功能 Sprint
 * 里整屏重写（见 docs/designs/redesign-2026-10/sprints/screen-ownership.md）。
 */
export const ORBIT_0918_COLORS = {
  /** 主文字 */
  ink: "var(--ink)",
  /** 次级文字 / 链接 */
  ink2: "var(--ink-2)",
  /** 辅助说明、弱提示文字 */
  ink3Text: "var(--ink-3-text)",
  /** 页面底色 */
  bg: "var(--bg)",
  /** 面板底色（大区块） */
  surface2: "var(--surface-2)",
  /** 面板底色（浅） */
  surface: "var(--surface)",
  /** 卡片边框 */
  line: "var(--line)",
  /** 输入框 / 控件边框 */
  ink4: "var(--ink-4)",
  /** 强调（主按钮、高亮） */
  accentText: "var(--accent-text)",
  /** 强调深（结论文字、深色 chip） */
  plum900: "var(--plum-900)",
} as const;

export const ORBIT_0918_FONTS = {
  /** 按界面语言切换的无衬线字体（RD-09：不再使用衬线体） */
  font: "var(--font)",
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
  /** 新设计不用卡片阴影 */
  card: "none",
  navPill: "var(--shadow-float)",
} as const;
