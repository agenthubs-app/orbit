"use client";

import { useOrbitLanguage } from "../orbit-language-context";
import { START_JA } from "../orbit-2026/copy/start-ja";

type Copy = { en: string; zh: string; ja?: string };

export function useStartCopy() {
  const orbit = useOrbitLanguage();
  const t = (copy: Copy) => orbit.t({ ...copy, ja: copy.ja ?? START_JA[copy.zh] });
  return { ...orbit, t };
}
