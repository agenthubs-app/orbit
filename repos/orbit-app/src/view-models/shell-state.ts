import { isTaskSegment, type TaskSegment } from "./app-navigation";

// R05 shell memory (SC-R05-05): a secondary page returns to the tab it was
// opened from with the same Task segment and scroll position. Pushing a page keeps
// the tab mounted underneath; this memory covers the cases where the tab is
// mounted again (tab switch with replace, direct-open fallback, Task redirects).
// It lives for the app session only, like UIKit tab state without restoration.

const scrollOffsets = new Map<string, number>();
let lastTaskSegment: TaskSegment = "calendar";

/** The key one scroll view remembers its offset under: the tab path, plus the segment on Task. */
export function shellScrollKey(pathname: string, segment?: TaskSegment | null): string {
  return segment ? pathname + "#" + segment : pathname;
}

export function rememberScroll(key: string, y: number): void {
  if (Number.isFinite(y)) scrollOffsets.set(key, Math.max(0, y));
}

export function rememberedScroll(key: string): number {
  return scrollOffsets.get(key) ?? 0;
}

export function rememberTaskSegment(segment: TaskSegment): void {
  lastTaskSegment = segment;
}

/** The segment to open: the one in the link, else the last one used, else カレンダー (first slot). */
export function initialTaskSegment(requested: unknown): TaskSegment {
  const value = Array.isArray(requested) ? requested[0] : requested;
  return isTaskSegment(value) ? value : lastTaskSegment;
}

/** Tests only: forget everything (a new app session). */
export function resetShellMemory(): void {
  scrollOffsets.clear();
  lastTaskSegment = "calendar";
}
