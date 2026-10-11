"use client";

import { useMemo } from "react";

import { useDemoMode } from "../../_demo/demo-mode-core";
import { useOrbitLanguage } from "../../orbit-language-context";
import { shellCopy } from "../copy/shell";
import { pickCopy } from "../copy/types";
import { Icon } from "../ui";
import styles from "./shell.module.css";
import { ShellPage } from "./slots";

// R07: the sample-mode pill at the left of the main header (b1「药丸 + 写操作拦截（Web）」:
// apricot 「🧪 サンプル ⌄」 after the 🔍; D17, user-approved 2026-10-12). Rendered inside the page's
// DemoModeProvider; it reads the demo state there and hands the shell a pill
// that needs no context (the shell's header is outside the provider). Shown only
// while the demo banner is collapsed; clicking it opens the banner again.
export function ShellDemoPill() {
  const demo = useDemoMode();
  const { language } = useOrbitLanguage();
  const collapsed = Boolean(demo?.collapsed);
  const completed = demo?.view.completed ?? 0;
  const setCollapsed = demo?.setCollapsed;
  const pill = useMemo(() => (collapsed && setCollapsed ? (
    <button type="button" data-orbit-guide-demo-pill className={styles.spill}
      aria-label={pickCopy(completed === 0 ? shellCopy.demoPillStart : shellCopy.demoPillContinue, language)} onClick={() => setCollapsed(false)}>
      <span aria-hidden>🧪</span>{pickCopy(shellCopy.demoPill, language)}<Icon name="down" size={16} />
    </button>
  ) : null), [collapsed, completed, language, setCollapsed]);
  return <ShellPage demoPill={pill} />;
}
