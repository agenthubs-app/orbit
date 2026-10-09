import { useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { createThemedStyles } from "../../design/theme";
import type { OrbitColors } from "../../design/tokens";
import { Icon, type IconName } from "./Icon";
import { durations, useReducedMotion } from "./motion";
import { UiPressable } from "./Pressable";
import { claimsGesture, dragOffset, openWidth, settleOpen, SWIPE_ACTION_WIDTH, SWIPE_MAX_ACTIONS } from "./swipe-logic";
import { UiText } from "./Text";

export type SwipeAction = { key: string; label: string; icon: IconName; tone: "lav" | "teal" | "ok" | "coral"; onPress: () => void };

// kit .swipe: drag left to reveal up to three 72-wide actions (lav / teal / coral;
// a 「完了」 action uses ok, RD-17).
// The row follows the finger (gesture-handler + reanimated on the UI thread); only
// horizontal drags are claimed, so vertical page scrolling keeps working. With
// Reduce Motion the row jumps to its rest position. The actions are also reachable
// from VoiceOver through accessibilityActions (no gesture needed).
export function SwipeRow({ children, actions }: { children: ReactNode; actions: SwipeAction[] }) {
  const { colors, styles } = useStyles();
  const reduced = useReducedMotion();
  const visible = actions.slice(0, SWIPE_MAX_ACTIONS);
  const width = openWidth(visible.length);
  const offset = useSharedValue(0);
  const [open, setOpen] = useState(false);
  const settle = (nextOpen: boolean) => {
    offset.value = reduced ? (nextOpen ? -width : 0) : withTiming(nextOpen ? -width : 0, { duration: durations.swipe });
    setOpen(nextOpen);
  };
  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-12, 12])
    .onUpdate((event) => {
      if (!claimsGesture(event.translationX, event.translationY)) return;
      offset.value = dragOffset(event.translationX, open, visible.length);
    })
    .onEnd((event) => {
      runOnJS(settle)(settleOpen(event.translationX, open));
    });
  const faceStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));
  return (
    // One accessible row: VoiceOver reads the row and offers the swipe actions as
    // its custom actions (the iOS Mail pattern); the buttons behind the face are
    // hidden from it so they are not reachable twice (R04 review m10).
    <View
      accessible
      accessibilityActions={visible.map((action) => ({ name: action.key, label: action.label }))}
      onAccessibilityAction={(event) => visible.find((action) => action.key === event.nativeEvent.actionName)?.onPress()}
      style={styles.root}
    >
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.actions, { width }]}>
        {visible.map((action) => {
          const tone = actionColors(colors)[action.tone];
          return (
            <UiPressable key={action.key} accessibilityRole="button" accessibilityLabel={action.label} onPress={() => { settle(false); action.onPress(); }} style={[styles.action, { backgroundColor: tone.background }]}>
              <Icon name={action.icon} size={20} color={tone.text} />
              <UiText numberOfLines={1} maxFontSizeMultiplier={1.2} style={[styles.actionLabel, { color: tone.text }]}>{action.label}</UiText>
            </UiPressable>
          );
        })}
      </View>
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.face, faceStyle]}>{children}</Animated.View>
      </GestureDetector>
    </View>
  );
}

function actionColors(colors: OrbitColors) {
  return {
    lav: { background: colors.macLav, text: colors.macLavText },
    teal: { background: colors.macTeal, text: colors.macTealText },
    ok: { background: colors.okSoft, text: colors.okText },
    coral: { background: colors.coralSoft, text: colors.coralText },
  };
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  root: { overflow: "hidden", borderRadius: 18, backgroundColor: colors.surface },
  actions: { position: "absolute", top: 0, bottom: 0, right: 0, flexDirection: "row" },
  action: { width: SWIPE_ACTION_WIDTH, alignItems: "center", justifyContent: "center", gap: 3 },
  actionLabel: { fontSize: 10.5, fontWeight: "700" },
  face: { backgroundColor: colors.surface, paddingHorizontal: 14 },
}));
