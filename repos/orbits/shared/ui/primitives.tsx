/**
 * 共享 UI primitive 组件。
 *
 * 这些组件是 dev dashboard、mock capability 页面和产品样张共同使用的轻量积木。
 * 它们只负责稳定 className、tone 白名单和基础结构，不包含业务数据读取逻辑。
 *
 * WorkbenchSurface 和 Chip 会在产品路由（app/(app)/app/**）里被当作 route-state
 * 边界渲染，那些路由不加载 app/globals.css（globals.css 的规则全部限定在
 * `.orbit-dev-root` 下）。所以这两个组件必须自带样式：下面的 <style> 块把它们
 * 依赖的 globals.css 规则复制成字面量值，不引用 --orbit-* token、不依赖
 * `.orbit-dev-root` 作用域。
 */
const primitivesStyles = `
.workbench-surface {
  background: var(--surface, #ffffff);
  border: 1px solid var(--border-2, #d5ddd9);
  border-radius: var(--r-xs, 8px);
  box-shadow: var(--sh-xs, 0 1px 2px rgba(23, 33, 31, 0.08));
  color: var(--text, inherit);
  display: grid;
  gap: 16px;
  max-width: 100%;
  min-width: 0;
  overflow-wrap: anywhere;
  padding: 16px;
}

.workbench-surface-raised {
  background: var(--surface-2, #f9fbfa);
  box-shadow: var(--sh-lg, 0 16px 36px rgba(23, 33, 31, 0.1));
}

.surface-heading {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.surface-eyebrow {
  color: var(--accent, #0f4758);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  font-size: 0.74rem;
  font-weight: 750;
  letter-spacing: 0;
  line-height: 1.35;
  margin: 0;
  overflow-wrap: anywhere;
  text-transform: uppercase;
}

.surface-heading h2 {
  color: var(--ink, #17211f);
  font-family: Aptos Display, Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 1rem;
  font-weight: 760;
  letter-spacing: 0;
  line-height: 1.2;
  margin: 0;
  overflow-wrap: anywhere;
}

.orbit-chip {
  align-items: center;
  border: 1px solid var(--border-strong, #aebbb5);
  border-radius: 6px;
  display: inline-flex;
  font-size: 0.78rem;
  font-weight: 750;
  justify-content: center;
  line-height: 1.2;
  max-width: 100%;
  min-height: 28px;
  min-width: 0;
  overflow-wrap: anywhere;
  padding: 5px 10px;
  text-align: center;
  width: fit-content;
}

.orbit-chip-neutral {
  background: var(--surface-2, #f9fbfa);
  color: var(--text, #17211f);
}

.orbit-chip-primary {
  background: rgba(21, 94, 117, 0.1);
  border-color: rgba(21, 94, 117, 0.3);
  color: #0f4758;
}

.orbit-chip-evidence {
  background: rgba(29, 78, 216, 0.08);
  border-color: rgba(29, 78, 216, 0.24);
  color: #1d4ed8;
}

.orbit-chip-confirmation {
  background: rgba(111, 78, 55, 0.09);
  border-color: rgba(111, 78, 55, 0.24);
  color: #6f4e37;
}

.orbit-chip-privacy {
  background: rgba(81, 68, 122, 0.08);
  border-color: rgba(81, 68, 122, 0.24);
  color: #51447a;
}

.orbit-chip-warning {
  background: rgba(154, 52, 18, 0.08);
  border-color: rgba(154, 52, 18, 0.24);
  color: #9a3412;
}

.orbit-chip-success {
  background: rgba(22, 101, 52, 0.08);
  border-color: rgba(22, 101, 52, 0.24);
  color: #166534;
}
`;

function classNames(...names) {
  // 统一过滤 falsy class，避免组件里反复手写 className 拼接。
  return names.filter(Boolean).join(" ");
}

const toneNames = new Set([
  // 语义 tone 必须和全局 CSS token 对齐；未知 tone 会回退为 neutral。
  "neutral",
  "primary",
  "evidence",
  "confirmation",
  "privacy",
  "warning",
  "success",
]);

const swatchTones = new Set([
  "canvas",
  "surface",
  "raised",
  "border",
  "text",
  "muted",
  "primary",
  "evidence",
  "confirmation",
  "privacy",
  "warning",
  "success",
]);

function safeTone(tone, tones = toneNames) {
  // 所有外部传入的 tone 都走白名单，防止生成不存在的 CSS class。
  return tones.has(tone) ? tone : "neutral";
}

export function ProductFrame({ children, className = "" }) {
  // 页面级外壳，主要用于 workbench/dev surface 的统一宽度和背景。
  return <main className={classNames("workbench-frame", className)}>{children}</main>;
}

export function ProductSurface({
  children,
  className = "",
  elevated = false,
  eyebrow,
  title,
}) {
  // Surface 是页面内的信息区块；可选 eyebrow/title 让卡片标题结构保持一致。
  return (
    <section
      className={classNames(
        "workbench-surface",
        elevated && "workbench-surface-raised",
        className,
      )}
    >
      <style>{primitivesStyles}</style>
      {(eyebrow || title) && (
        <header className="surface-heading">
          {eyebrow && <p className="surface-eyebrow">{eyebrow}</p>}
          {title && <h2>{title}</h2>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Chip({ children, tone = "neutral" }) {
  // Chip 用于展示 evidence、privacy、confirmation 等短状态，不承载按钮行为。
  const resolvedTone = safeTone(tone);

  return (
    <span className={classNames("orbit-chip", `orbit-chip-${resolvedTone}`)}>
      <style>{primitivesStyles}</style>
      {children}
    </span>
  );
}

export function Field({ children, helper = "", label }) {
  // Field 只提供 label/helper 包裹，具体 input/select 由调用方传入。
  return (
    <label className="control-field">
      <span>{label}</span>
      {children}
      {helper && <small>{helper}</small>}
    </label>
  );
}

export function PrimaryAction({ children, className = "", ...props }) {
  // 默认 type=button，避免在表单上下文里意外触发 submit。
  return (
    <button className={classNames("primary-action", className)} type="button" {...props}>
      {children}
    </button>
  );
}

export function SecondaryAction({ children, className = "", ...props }) {
  return (
    <button className={classNames("secondary-action", className)} type="button" {...props}>
      {children}
    </button>
  );
}

export function TokenSwatch({ name, tone = "surface", value }) {
  // TokenSwatch 专门用于设计系统页面展示颜色/语义 token。
  const resolvedTone = safeTone(tone, swatchTones);

  return (
    <div className={classNames("token-swatch", `token-swatch-${resolvedTone}`)}>
      <span aria-hidden="true" />
      <div>
        <strong>{name}</strong>
        <code>{value}</code>
      </div>
    </div>
  );
}

export function InlineMetric({ label, tone = "neutral", value }) {
  const resolvedTone = safeTone(tone);

  return (
    <div className={classNames("inline-metric", `inline-metric-${resolvedTone}`)}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function StatusDisplay({ label, tone = "neutral", value }) {
  const resolvedTone = safeTone(tone);

  return (
    <p className={classNames("status-display", `status-display-${resolvedTone}`)}>
      <span>{label}</span>
      <strong>{value}</strong>
    </p>
  );
}

export const WorkbenchFrame = ProductFrame;
// 兼容旧命名：dev workbench 页面仍通过 Workbench* / *Button 别名使用同一套 primitive。
export const WorkbenchSurface = ProductSurface;
export const PrimaryButton = PrimaryAction;
export const SecondaryButton = SecondaryAction;
