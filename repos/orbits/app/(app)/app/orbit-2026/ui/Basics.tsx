import type { HTMLAttributes, ReactNode } from "react";

import styles from "./Basics.module.css";

// kit .card on the Web: radius 22, padding 20 (ui.css:281); flat = surface-2,
// line = 1px line. Section header: title + optional trailing link.
export function Card({ children, variant = "default", title, trailing, className, ...rest }: HTMLAttributes<HTMLElement> & {
  children: ReactNode;
  variant?: "default" | "flat" | "line";
  title?: string;
  trailing?: ReactNode;
}) {
  return (
    <section {...rest} className={[styles.card, variant !== "default" ? styles[variant] : "", className ?? ""].filter(Boolean).join(" ")}>
      {title || trailing ? (
        <header className={styles.cardHead}>
          {title ? <h3 className={styles.cardTitle}>{title}</h3> : <span />}
          {trailing}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export type ChipTone = "neutral" | "coral" | "apricot" | "lav" | "teal" | "blue" | "pink" | "ok";

// kit .chip: 11 / 700 pill, at most 160 wide. `ok` is completion green (RD-17).
export function Chip({ label, tone = "neutral" }: { label: string; tone?: ChipTone }) {
  return <span className={`${styles.chip} ${styles[`chip_${tone}`]}`} title={label}>{label}</span>;
}

type AvatarTone = "lav" | "pink" | "blue" | "teal" | "apricot";
const AVATAR_TONES: AvatarTone[] = ["lav", "pink", "blue", "teal", "apricot"];

/** Same hash as the App (src/components/ui/Avatar.tsx): one person, one colour everywhere. */
export function avatarTone(name: string): AvatarTone {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  return AVATAR_TONES[hash % AVATAR_TONES.length]!;
}

export function initials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  if (/^[A-Za-z]/.test(trimmed)) return trimmed.split(/\s+/).slice(0, 2).map((part) => part[0]!.toUpperCase()).join("");
  return [...trimmed][0]!;
}

// kit .av: 38 / 30 / 56 macaron circle with initials; the name is the label.
export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  return (
    <span role="img" aria-label={name} className={`${styles.avatar} ${styles[`av_${size}`]} ${styles[`tone_${avatarTone(name)}`]}`}>
      <span aria-hidden>{initials(name)}</span>
    </span>
  );
}

export function AvatarStack({ names, size = "sm", max = 4 }: { names: string[]; size?: "sm" | "md"; max?: number }) {
  const shown = names.slice(0, max);
  const rest = names.length - shown.length;
  return (
    <span className={styles.stack} role="group" aria-label={names.join("、")}>
      {shown.map((name) => <Avatar key={name} name={name} size={size} />)}
      {rest > 0 ? <span className={`${styles.avatar} ${styles[`av_${size}`]} ${styles.more}`} aria-hidden>+{rest}</span> : null}
    </span>
  );
}

// kit .emo: a macaron tile with an emoji (40 / r 13; sm 32 / r 10). Decoration unless labelled.
export function MacTile({ emoji, tone = "lav", size = "md", label }: { emoji: string; tone?: AvatarTone; size?: "md" | "sm"; label?: string }) {
  return (
    <span className={`${styles.mac} ${size === "sm" ? styles.macSm : ""} ${styles[`tile_${tone}`]}`} {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}>
      {emoji}
    </span>
  );
}

// kit .kbd (Web only): a key cap, 20 high, radius 6. Only keys go inside.
export function Kbd({ children, onDark = false }: { children: ReactNode; onDark?: boolean }) {
  return <kbd className={`${styles.kbd} ${onDark ? styles.kbdOnDark : ""}`}>{children}</kbd>;
}
