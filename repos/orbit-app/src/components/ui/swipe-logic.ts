// R04 SwipeRow gesture rules, from kit/kit.js (左滑出操作): each action button is 72
// wide, the row follows the finger up to 26 past the open width (170 for two
// actions), and a release past 50 opens (or, from open, closes). Pure functions so
// the thresholds are tested without a gesture system. Marked "worklet" because the
// pan callbacks call them on the UI thread (Reanimated); in JS they run as usual.
export const SWIPE_ACTION_WIDTH = 72;
export const SWIPE_THRESHOLD = 50;
export const SWIPE_OVERSHOOT = 26;
export const SWIPE_MAX_ACTIONS = 3;

export function openWidth(actionCount: number): number {
  "worklet";
  return Math.min(actionCount, SWIPE_MAX_ACTIONS) * SWIPE_ACTION_WIDTH;
}

/** Row offset while dragging (≤ 0). */
export function dragOffset(dx: number, wasOpen: boolean, actionCount: number): number {
  "worklet";
  const width = openWidth(actionCount);
  const base = wasOpen ? -width : 0;
  return Math.min(0, Math.max(-(width + SWIPE_OVERSHOOT), base + dx));
}

/** Whether the row rests open after a release. Taps (|dx| < 4) leave it as it was. */
export function settleOpen(dx: number, wasOpen: boolean): boolean {
  "worklet";
  if (Math.abs(dx) < 4) return wasOpen;
  return wasOpen ? dx < SWIPE_THRESHOLD : dx < -SWIPE_THRESHOLD;
}

/**
 * Horizontal swipes only: a mostly vertical move belongs to the page scroll, so the
 * row never steals it (PLANNER 易错边界: 左滑行和页面纵向滚动冲突).
 */
export function claimsGesture(dx: number, dy: number): boolean {
  "worklet";
  return Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.5;
}
