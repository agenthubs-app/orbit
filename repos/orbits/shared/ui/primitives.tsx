/**
 * 共享 UI primitive 组件。
 *
 * 这些组件是 dev dashboard、mock capability 页面和产品样张共同使用的轻量积木。
 * 它们只负责稳定 className、tone 白名单和基础结构，不包含业务数据读取逻辑。
 */
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
