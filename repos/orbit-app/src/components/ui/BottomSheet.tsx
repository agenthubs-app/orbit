import { useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { AccessibilityInfo, AppState, findNodeHandle, Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { createThemedStyles } from "../../design/theme";
import { radius } from "../../design/tokens";
import { durations, useReducedMotion } from "./motion";
import { UiPortal, UiRouteContext } from "./Portal";
import { Scrim } from "./Scrim";
import { sheetDragOffset, sheetMaxHeight, sheetShouldAutoClose, shouldDismissSheet } from "./sheet-logic";
import { useBackHandler } from "./useBackHandler";

// kit .sheet: inset 8, radius 34, grab handle 38×5. Drag the handle down to close
// (gesture-handler + reanimated); content over 80% of the screen scrolls inside a
// sheet pinned at 20% from the top; the keyboard pushes the sheet up. Reduce Motion:
// the sheet fades in place instead of sliding.
//
// R31a (G23, R15 review m4 / :78): it closes itself when its page loses focus (route change, app to background), except
// while the keyboard is up. `dismissOnBackdrop={false}`: a backdrop tap does nothing (Android back and the VoiceOver escape
// gesture still close it). `draggable={false}`: the handle stays drawn but a drag does not close it (confirm sheets).
export function BottomSheet({ visible, onClose, children, accessibilityLabel, dismissOnBackdrop = true, draggable = true, returnFocusTo }: { visible: boolean; onClose: () => void; children: ReactNode; accessibilityLabel?: string; dismissOnBackdrop?: boolean; draggable?: boolean; returnFocusTo?: RefObject<View | null> | undefined }) {
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
  const close = useCallback(() => {
    onClose();
    if (!returnFocusTo) return;
    requestAnimationFrame(() => {
      const target = returnFocusTo.current;
      if (!target) return;
      if (Platform.OS === "web") (target as View & { focus?: () => void }).focus?.();
      const handle = findNodeHandle(target);
      if (handle != null) AccessibilityInfo.setAccessibilityFocus(handle);
    });
  }, [onClose, returnFocusTo]);
  useBackHandler(visible, close);
  useAutoClose(visible, close, keyboard > 0);
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
    .enabled(draggable)
    .onUpdate((event) => { offset.value = sheetDragOffset(event.translationY); })
    .onEnd((event) => {
      if (shouldDismissSheet(event.translationY, event.velocityY, sheetHeight)) runOnJS(close)();
      else offset.value = reduced ? 0 : withTiming(0, { duration: durations.sheet });
    }), [close, draggable, offset, reduced, sheetHeight]);
  const sheetStyle = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ translateY: offset.value }] }));
  if (!visible) return null;
  return (
    <UiPortal>
      <View accessibilityViewIsModal onAccessibilityEscape={close} style={StyleSheet.absoluteFill}>
        <Scrim onPress={dismissOnBackdrop ? close : undefined} />
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

/** Closes the sheet when its page loses focus (see sheetShouldAutoClose). */
function useAutoClose(visible: boolean, close: () => void, keyboardUp: boolean) {
  const route = useContext(UiRouteContext);
  const openedOn = useRef<string | null>(null);
  const typing = useRef(keyboardUp);
  typing.current = keyboardUp;
  useEffect(() => { openedOn.current = visible ? route : null; }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps -- remember the route the sheet opened on
  useEffect(() => {
    if (visible && sheetShouldAutoClose({ openedOn: openedOn.current, route, keyboardUp })) close();
  }, [close, keyboardUp, route, visible]);
  useEffect(() => {
    if (!visible) return;
    const subscription = AppState.addEventListener("change", (appState) => {
      if (sheetShouldAutoClose({ openedOn: null, route: null, appState, keyboardUp: typing.current })) close();
    });
    return () => subscription.remove();
  }, [close, visible]);
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
