function classNames(...names) {
  return names.filter(Boolean).join(" ");
}

const toneNames = new Set([
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
  return tones.has(tone) ? tone : "neutral";
}

export function ProductFrame({ children, className = "" }) {
  return <main className={classNames("workbench-frame", className)}>{children}</main>;
}

export function ProductSurface({
  children,
  className = "",
  elevated = false,
  eyebrow,
  title,
}) {
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
  const resolvedTone = safeTone(tone);

  return (
    <span className={classNames("orbit-chip", `orbit-chip-${resolvedTone}`)}>
      {children}
    </span>
  );
}

export function Field({ children, helper = "", label }) {
  return (
    <label className="control-field">
      <span>{label}</span>
      {children}
      {helper && <small>{helper}</small>}
    </label>
  );
}

export function PrimaryAction({ children, className = "", ...props }) {
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
export const WorkbenchSurface = ProductSurface;
export const PrimaryButton = PrimaryAction;
export const SecondaryButton = SecondaryAction;
