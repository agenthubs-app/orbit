"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

import { Icon, type IconName } from "./Icon";
import styles from "./Button.module.css";

export type ButtonVariant = "primary" | "accent" | "secondary" | "ghost" | "danger" | "dangerGhost" | "dangerSoft";

// kit .btn: pill, 40 high (sm 32), 13 / 700; press scales to .96 (not with Reduce
// Motion). Destructive: the final action in a dialog is solid coral, the entry is
// coral text (ghost), the coral-soft fill is for menu items. The rendered <button>
// carries `btn` so the legacy button ratchet counts it as a designed button.
export function Button({
  label,
  variant = "secondary",
  size = "md",
  block = false,
  icon,
  loading = false,
  className,
  type = "button",
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  label: string;
  variant?: ButtonVariant;
  size?: "md" | "sm";
  block?: boolean;
  icon?: IconName;
  loading?: boolean;
}) {
  const classes = [styles.button, styles[variant], size === "sm" ? styles.sm : "", block ? styles.block : "", className ?? ""].filter(Boolean).join(" ");
  return (
    <button {...rest} type={type} className={`btn ${classes}`} aria-busy={loading || undefined} disabled={rest.disabled || loading}>
      {loading ? <span className={styles.spinner} aria-hidden /> : icon ? <Icon name={icon} size={16} /> : null}
      <span className={styles.label}>{label}</span>
    </button>
  );
}

// kit .rbtn (40, surface) / .lbtn (34, surface-2): round icon buttons. The label is
// required — the icon carries the meaning. `dot` is the unread mark (coral, no number).
export function IconButton({
  icon,
  label,
  size = 40,
  soft = false,
  dot = false,
  className,
  type = "button",
  children,
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> & {
  icon: IconName;
  label: string;
  size?: 40 | 34;
  soft?: boolean;
  dot?: boolean;
  children?: ReactNode;
}) {
  const classes = [styles.icon, size === 34 ? styles.iconSm : "", soft || size === 34 ? styles.soft : "", className ?? ""].filter(Boolean).join(" ");
  return (
    <button {...rest} type={type} aria-label={label} title={rest.title ?? label} className={`btn ${classes}`}>
      <Icon name={icon} size={size === 34 ? 16 : 20} />
      {dot ? <span className={styles.dot} aria-hidden /> : null}
      {children}
    </button>
  );
}
