import type { ReactElement } from "react";

// Web and the render tests: no sideways swipe between tab pages (the tab bar is the way).
// The device build resolves MainTabSwipe.native.tsx.
export function MainTabSwipe({ children }: { path: string | null; enabled?: boolean; children: ReactElement }) {
  return children;
}
