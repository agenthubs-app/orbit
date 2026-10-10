"use client";

import { useMemo } from "react";

import { useDemoMode } from "../../_demo/demo-mode-core";
import { useOrbitLanguage } from "../../orbit-language-context";
import { shellCopy } from "../copy/shell";
import { pickCopy } from "../copy/types";
import { Button } from "../ui";
import { ShellPage } from "./slots";

// R07: the sample-mode pill next to the main title. Rendered inside the page's
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
    <Button
      data-orbit-guide-demo-pill
      label={pickCopy(completed === 0 ? shellCopy.demoPillStart : shellCopy.demoPillContinue, language)}
      onClick={() => setCollapsed(false)}
      size="sm"
      variant="accent"
    />
  ) : null), [collapsed, completed, language, setCollapsed]);
  return <ShellPage demoPill={pill} />;
}
