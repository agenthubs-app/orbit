/**
 * Orbit 共享 UI 主题 token。
 *
 * 这个文件只放跨页面复用的颜色、字号、间距、圆角和阴影。
 * 组件应该优先引用这些 token，避免每个页面产生不可追踪的视觉常量。
 */
export const color = {
  // 基础背景与文本色。
  canvas: "#f4f7f5",
  surface: "#ffffff",
  surfaceRaised: "#f9fbfa",
  text: "#17211f",
  mutedText: "#52615d",

  // 边框与交互主色。
  border: "#d5ddd9",
  borderStrong: "#aebbb5",
  primaryAction: "#155e75",
  primaryActionHover: "#0f4758",
  primaryActionText: "#ffffff",

  // 语义色用于 evidence、confirmation、privacy、warning 等状态表达。
  evidence: "#1d4ed8",
  confirmation: "#6f4e37",
  privacy: "#51447a",
  warning: "#9a3412",
  success: "#166534",
  focus: "#0e7490",
  accentSoft: "#e8f2f0",

  // 兼容旧组件命名；新代码可以逐步使用上面的语义 token。
  muted: "#52615d",
  subtle: "#6d7a75",
  primary: "#155e75",
  primaryStrong: "#0f4758",
  primaryText: "#ffffff",
};

export const typography = {
  // 字体栈按现代系统字体优先，避免额外字体加载失败影响布局。
  bodyFamily:
    'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  displayFamily:
    'Aptos Display, Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  monoFamily:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
  titleSize: "2.25rem",
  sectionTitleSize: "1rem",
  bodySize: "0.94rem",
  smallSize: "0.78rem",
  lineHeightTight: "1.15",
  lineHeightBody: "1.55",
  // 字距明确固定为 0，避免响应式页面出现过度压缩的标题。
  letterSpacing: "0",
  letterSpacingTight: "0",
};

export const spacing = {
  // 间距 token 保持 4px 倍数，control 尺寸用于按钮/输入框的稳定高度。
  xxs: "4px",
  xs: "8px",
  sm: "12px",
  md: "16px",
  lg: "20px",
  xl: "24px",
  section: "32px",
  controlMinHeight: "40px",
  controlMinWidth: "116px",
};

export const radius = {
  // Orbit 的卡片和控件圆角控制在 8px 以内，保持工具型界面的克制感。
  control: "6px",
  card: "8px",
  panel: "8px",
  frame: "8px",
  chip: "6px",
};

export const shadows = {
  // 阴影只用于轻量层级和 focus ring，不承担大面积装饰效果。
  card: "0 1px 2px rgba(23, 33, 31, 0.08)",
  raised: "0 16px 36px rgba(23, 33, 31, 0.1)",
  focus: "0 0 0 3px rgba(14, 116, 144, 0.24)",
};

export const theme = {
  // 聚合导出方便组件按 theme.color/theme.spacing 的方式消费。
  color,
  typography,
  spacing,
  radius,
  shadows,
};
