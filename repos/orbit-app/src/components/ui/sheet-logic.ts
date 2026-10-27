// R04 BottomSheet rules (kit .sheet, 01-system): content taller than 80% of the
// screen pins the sheet's top at 20% and scrolls inside; a drag down of more than a
// quarter of the sheet (or a fast flick) closes it; otherwise it springs back.
// The drag helpers are "worklet"s: the pan callbacks run them on the UI thread.
export const SHEET_MAX_RATIO = 0.8;
export const SHEET_FLICK_VELOCITY = 900;
// Declared before the worklets: a worklet captures its constants when the module loads.
export const SHEET_KEYBOARD_GAP = 12;

/**
 * Tallest the sheet may be. With the keyboard up (R04 review M6) the sheet sits on
 * the keyboard, so it may use only the space above it, below the safe area and a
 * small gap — otherwise its top (handle, first field) is pushed off screen.
 */
export function sheetMaxHeight(screenHeight: number, keyboardHeight = 0, topInset = 0): number {
  "worklet";
  const ratio = Math.round(screenHeight * SHEET_MAX_RATIO);
  if (keyboardHeight <= 0) return ratio;
  return Math.max(0, Math.min(ratio, Math.round(screenHeight - keyboardHeight - topInset - SHEET_KEYBOARD_GAP)));
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

/**
 * R31a: a sheet closes itself when its page loses focus — the route changed (a push left the page mounted underneath)
 * or the app went to the background — but never while the keyboard is up (someone is typing in it). No router
 * (route null) means no route rule.
 */
export function sheetShouldAutoClose({ openedOn, route, appState, keyboardUp }: { openedOn: string | null; route: string | null; appState?: string; keyboardUp: boolean }): boolean {
  if (keyboardUp) return false;
  if (appState === "background") return true;
  return openedOn !== null && route !== null && route !== openedOn;
}
