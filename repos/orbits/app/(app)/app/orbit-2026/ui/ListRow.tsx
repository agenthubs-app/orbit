"use client";

import type { ReactNode } from "react";

import { Icon, type IconName } from "./Icon";
import styles from "./ListRow.module.css";

export type RowAction = { key: string; label: string; icon: IconName; tone?: "lav" | "ok" | "coral"; onSelect: () => void };

// kit .li: leading, title + subtitle, trailing. The App's left-swipe actions
// become hover actions on the Web (01-system.html:227): they appear on hover and
// keyboard focus, and are always shown on narrow / touch screens (≤390 or no hover).
// At most 3, like the App's SwipeRow.
export function ListRow({ title, subtitle, leading, trailing, href, onSelect, hoverActions = [] }: {
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  href?: string;
  onSelect?: () => void;
  hoverActions?: RowAction[];
}) {
  const body = (
    <>
      {leading}
      <span className={styles.meta}>
        <b className={styles.title}>{title}</b>
        {subtitle ? <span className={styles.subtitle}>{subtitle}</span> : null}
      </span>
      {trailing ? <span className={styles.trailing}>{trailing}</span> : null}
    </>
  );
  const actions = hoverActions.slice(0, 3);
  return (
    <div className={`${styles.row} ${actions.length ? styles.withActions : ""}`}>
      {href ? <a className={styles.main} href={href}>{body}</a>
        : onSelect ? <button type="button" className={`btn ${styles.main}`} onClick={onSelect}>{body}</button>
          : <div className={styles.main}>{body}</div>}
      {actions.length ? (
        <span className={styles.actions}>
          {actions.map((action) => (
            <button key={action.key} type="button" className={`btn ${styles.action} ${styles[`tone_${action.tone ?? "lav"}`]}`} aria-label={`${action.label} ${title}`} title={action.label} onClick={action.onSelect}>
              <Icon name={action.icon} size={16} />
            </button>
          ))}
        </span>
      ) : null}
    </div>
  );
}

export function RowChevron() {
  return <Icon name="right" size={16} />;
}
