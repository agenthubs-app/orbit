import { useEffect, useState } from "react";
import { Keyboard } from "react-native";

export interface MobileViewportState {
  keyboardVisible: boolean;
  visibleHeight: number | null;
}

// Native layout remains owned by SafeAreaView and KeyboardAvoidingView. This
// default module only centralizes the keyboard subscription shared by the tab
// bar; Metro selects the Web implementation in browsers.
export function useMobileViewport(): MobileViewportState {
  const [keyboardVisible, setKeyboardVisible] = useState(() => Keyboard.isVisible());

  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () => setKeyboardVisible(true));
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboardVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return { keyboardVisible, visibleHeight: null };
}
