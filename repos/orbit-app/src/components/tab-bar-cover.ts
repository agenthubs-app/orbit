import { useSyncExternalStore } from "react";

import type { MainTab } from "../view-models/app-navigation";

// D07: which tab page is still drawing its own copy of the tab bar (TabPageBar) while
// it settles back on top after a secondary page popped; the root ShellTabBar stays
// hidden for that tab until the transition ends.
// No other imports: page code imports this through TabPageBar.
let coveredTab: MainTab | null = null;
const coveredListeners = new Set<() => void>();
export function setCoveredTab(tab: MainTab | null) {
  if (coveredTab === tab) return;
  coveredTab = tab;
  coveredListeners.forEach((listener) => listener());
}
export function useCoveredTab(): MainTab | null {
  return useSyncExternalStore((listener) => { coveredListeners.add(listener); return () => { coveredListeners.delete(listener); }; }, () => coveredTab, () => null);
}

export function currentCoveredTab(): MainTab | null {
  return coveredTab;
}
