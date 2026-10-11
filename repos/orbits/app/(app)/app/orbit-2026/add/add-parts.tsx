"use client";

import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { addDoorsCopy } from "../copy/add";
import { pickCopy, type OrbitCopyEntry } from "../copy/types";
import { fillCopy } from "../ui";
import styles from "./add.module.css";

export type Translate = (entry: OrbitCopyEntry, values?: Readonly<Record<string, string | number>>) => string;

export function translator(language: OrbitLanguage): Translate {
  return (entry, values) => (values ? fillCopy(pickCopy(entry, language), values) : pickCopy(entry, language));
}

const DENSITY_COPY = { 1: addDoorsCopy.density1, 2: addDoorsCopy.density2, 3: addDoorsCopy.density3 } as const;

/** ●○○ / ●●○ / ●●● (D-10), labelled for screen readers. */
export function DensityDots({ level, t }: { level: 1 | 2 | 3; t: Translate }) {
  return (
    <span className={styles.dots} role="img" aria-label={t(DENSITY_COPY[level])} data-density={level}>
      {[1, 2, 3].map((index) => <i key={index} className={`${styles.dot} ${index <= level ? styles.dotOn : ""}`} aria-hidden />)}
    </span>
  );
}

export function densityLabel(level: 1 | 2 | 3, t: Translate): string {
  return `${"●".repeat(level)}${"○".repeat(3 - level)} ${t(DENSITY_COPY[level])}`;
}

/**
 * 完成: how much is known about the new people (D-10, `shared/compute/contact-density`), one
 * segment per level sized by count, then ●○○ 身元だけ 2人 … (R12 review m11). `countCopy` takes {label} and {n}.
 */
export function DensityBar({ counts, t, countCopy }: { counts: Readonly<Record<1 | 2 | 3, number>>; t: Translate; countCopy: OrbitCopyEntry }) {
  const levels = [1, 2, 3] as const;
  const summary = levels.map((level) => t(countCopy, { label: t(DENSITY_COPY[level]), n: counts[level] })).join(" · ");
  return (
    <div className={styles.densityBar} data-done-density={levels.map((level) => counts[level]).join(",")}>
      <span className={styles.label}>{t(addDoorsCopy.densityNote)}</span>
      <div className={styles.densityTrack} role="img" aria-label={summary}>
        {levels.map((level) => (counts[level] ? <i key={level} className={`${styles.densitySeg} ${styles[`densitySeg${level}`]}`} style={{ flexGrow: counts[level] }} /> : null))}
      </div>
      <div className={styles.row} aria-hidden>
        {levels.map((level) => (
          <span key={level} className={`${styles.row} ${styles.label}`}><DensityDots level={level} t={t} />{t(countCopy, { label: t(DENSITY_COPY[level]), n: counts[level] })}</span>
        ))}
      </div>
    </div>
  );
}
