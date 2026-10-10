import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { createThemedStyles } from "../../design/theme";
import { radius } from "../../design/tokens";
import { durations, useReducedMotion } from "./motion";
import { UiPortal } from "./Portal";
import { Scrim } from "./Scrim";
import { sheetDragOffset, sheetMaxHeight, shouldDismissSheet } from "./sheet-logic";
import { useBackHandler } from "./useBackHandler";

// kit .sheet: inset 8, radius 34, grab handle 38×5. Drag the handle down to close
// (gesture-handler + reanimated); content over 80% of the screen scrolls inside a
// sheet pinned at 20% from the top; the keyboard pushes the sheet up. Reduce Motion:
// the sheet fades in place instead of sliding.
export function BottomSheet({ visible, onClose, children, accessibilityLabel }: { visible: boolean; onClose: () => void; children: ReactNode; accessibilityLabel?: string }) {
  const { styles } = useStyles();
  const reduced = useReducedMotion();
  const { height } = useWindowDimensions();
  const { top } = useSafeAreaInsets();
  const keyboard = useKeyboardHeight(visible);
  const maxHeight = sheetMaxHeight(height, keyboard, top);
  // Measured height: the close threshold is a quarter of the sheet as drawn.
  const [sheetHeight, setSheetHeight] = useState(maxHeight);
  const offset = useSharedValue(reduced ? 0 : height);
  const opacity = useSharedValue(reduced ? 0 : 1);
  const close = useCallback(() => onClose(), [onClose]);
  useBackHandler(visible, close);
  useEffect(() => {
    if (!visible) {
      // Ready to slide in again next time (review m11).
      offset.value = reduced ? 0 : height;
      opacity.value = reduced ? 0 : 1;
      return;
    }
    offset.value = reduced ? 0 : withTiming(0, { duration: durations.sheet });
    opacity.value = withTiming(1, { duration: durations.sheet });
  }, [height, offset, opacity, reduced, visible]);
  const drag = useMemo(() => Gesture.Pan()
    .onUpdate((event) => { offset.value = sheetDragOffset(event.translationY); })
    .onEnd((event) => {
      if (shouldDismissSheet(event.translationY, event.velocityY, sheetHeight)) runOnJS(close)();
      else offset.value = reduced ? 0 : withTiming(0, { duration: durations.sheet });
    }), [close, offset, reduced, sheetHeight]);
  const sheetStyle = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ translateY: offset.value }] }));
  if (!visible) return null;
  return (
    <UiPortal>
      <View accessibilityViewIsModal onAccessibilityEscape={close} style={StyleSheet.absoluteFill}>
        <Scrim onPress={close} />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} pointerEvents="box-none" style={styles.anchor}>
          <Animated.View accessibilityLabel={accessibilityLabel} onLayout={(event) => setSheetHeight(event.nativeEvent.layout.height)} style={[styles.sheet, { maxHeight }, sheetStyle]}>
            <GestureDetector gesture={drag}>
              <View accessibilityRole="adjustable" accessibilityLabel={accessibilityLabel} style={styles.grabArea}><View style={styles.grab} /></View>
            </GestureDetector>
            <ScrollView bounces={false} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">{children}</ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </UiPortal>
  );
}

/** Keyboard height while the sheet is open (iOS reports it before the animation). */
function useKeyboardHeight(active: boolean): number {
  const [keyboard, setKeyboard] = useState(0);
  useEffect(() => {
    if (!active) return;
    const show = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", (event) => setKeyboard(event.endCoordinates.height));
    const hide = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", () => setKeyboard(0));
    return () => { show.remove(); hide.remove(); setKeyboard(0); };
  }, [active]);
  return keyboard;
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  anchor: { flex: 1, justifyContent: "flex-end" },
  sheet: { marginHorizontal: 8, marginBottom: 8, borderRadius: radius.sheet, backgroundColor: colors.surface, overflow: "hidden" },
  grabArea: { alignItems: "center", paddingTop: 10, paddingBottom: 14, minHeight: 29 },
  grab: { width: 38, height: 5, borderRadius: 3, backgroundColor: colors.surface3 },
  content: { paddingHorizontal: 18, paddingBottom: 26 },
}));
