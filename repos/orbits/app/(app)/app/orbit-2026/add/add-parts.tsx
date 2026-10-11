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
