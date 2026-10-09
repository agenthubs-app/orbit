// R04 BottomSheet rules (kit .sheet, 01-system): content taller than 80% of the
// screen pins the sheet's top at 20% and scrolls inside; a drag down of more than a
// quarter of the sheet (or a fast flick) closes it; otherwise it springs back.
// The drag helpers are "worklet"s: the pan callbacks run them on the UI thread.
export const SHEET_MAX_RATIO = 0.8;
export const SHEET_FLICK_VELOCITY = 900;

export function sheetMaxHeight(screenHeight: number): number {
  "worklet";
  return Math.round(screenHeight * SHEET_MAX_RATIO);
}

export function sheetDragOffset(dy: number): number {
  "worklet";
  // Only downwards; upward pulls are resisted (a small rubber band).
  return dy >= 0 ? dy : dy / 6;
}

export function shouldDismissSheet(dy: number, velocityY: number, sheetHeight: number): boolean {
  "worklet";
  return velocityY > SHEET_FLICK_VELOCITY || dy > Math.max(80, sheetHeight / 4);
}
