import * as Haptics from "expo-haptics";

// R04: a light tap on press (iOS / Android). Failures are silent: haptics are a
// nicety, never a reason for a press to fail. Web uses haptics.ts (no-op), so
// browser bundles never pull in the native module.
export function tapHaptic(): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
}

export function successHaptic(): void {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
}
