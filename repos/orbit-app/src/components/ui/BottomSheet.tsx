import { useCallback, useEffect, type ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
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
  const maxHeight = sheetMaxHeight(height);
  const offset = useSharedValue(reduced ? 0 : height);
  const opacity = useSharedValue(reduced ? 0 : 1);
  const close = useCallback(() => onClose(), [onClose]);
  useBackHandler(visible, close);
  useEffect(() => {
    if (!visible) return;
    offset.value = reduced ? 0 : withTiming(0, { duration: durations.sheet });
    opacity.value = withTiming(1, { duration: durations.sheet });
  }, [offset, opacity, reduced, visible]);
  const drag = Gesture.Pan()
    .onUpdate((event) => { offset.value = sheetDragOffset(event.translationY); })
    .onEnd((event) => {
      if (shouldDismissSheet(event.translationY, event.velocityY, maxHeight)) runOnJS(close)();
      else offset.value = withTiming(0, { duration: durations.sheet });
    });
  const sheetStyle = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ translateY: offset.value }] }));
  if (!visible) return null;
  return (
    <UiPortal>
      <View accessibilityViewIsModal style={StyleSheet.absoluteFill}>
        <Scrim onPress={close} />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} pointerEvents="box-none" style={styles.anchor}>
          <Animated.View accessibilityLabel={accessibilityLabel} style={[styles.sheet, { maxHeight }, sheetStyle]}>
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

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  anchor: { flex: 1, justifyContent: "flex-end" },
  sheet: { marginHorizontal: 8, marginBottom: 8, borderRadius: radius.sheet, backgroundColor: colors.surface, overflow: "hidden" },
  grabArea: { alignItems: "center", paddingTop: 10, paddingBottom: 14, minHeight: 29 },
  grab: { width: 38, height: 5, borderRadius: 3, backgroundColor: colors.surface3 },
  content: { paddingHorizontal: 18, paddingBottom: 26 },
}));
