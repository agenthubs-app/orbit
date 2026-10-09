import { useEffect } from "react";
import { BackHandler } from "react-native";

// Android hardware back while an overlay is open: run `onBack` and swallow the event.
export function useBackHandler(active: boolean, onBack: () => void): void {
  useEffect(() => {
    if (!active) return;
    const subscription = BackHandler.addEventListener?.("hardwareBackPress", () => {
      onBack();
      return true;
    });
    return () => subscription?.remove?.();
  }, [active, onBack]);
}
