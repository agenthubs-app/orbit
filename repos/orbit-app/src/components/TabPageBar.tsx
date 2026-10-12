import type { MainTab } from "../view-models/app-navigation";

// Web and the render tests: the root bar simply hides on secondary pages (no native
// push transition to follow). The device build resolves TabPageBar.native.tsx.
export function TabPageBar(_props: { tab: MainTab }) {
  return null;
}
