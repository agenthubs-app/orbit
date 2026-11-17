import { useRouter } from "expo-router";
import { useMemo, type ReactElement } from "react";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

import { swipeDirection, swipeToMainTab } from "./shell-navigation";

// A clear sideways swipe on a tab page opens the neighbouring tab page (taps on the bar switch
// at once). It starts only after 24pt of horizontal travel and gives way to vertical scrolling
// after 14pt, so lists still scroll; a child that takes the touch first (a held home widget,
// a row's own swipe) keeps it.
const START_X = 24;
const GIVE_WAY_Y = 14;

export function MainTabSwipe({ path, enabled = true, children }: { path: string | null; enabled?: boolean; children: ReactElement }) {
  const router = useRouter();
  const pan = useMemo(() => Gesture.Pan()
    .enabled(enabled && path !== null)
    .runOnJS(true)
    .activeOffsetX([-START_X, START_X])
    .failOffsetY([-GIVE_WAY_Y, GIVE_WAY_Y])
    .onEnd((event, success) => {
      if (!success || !path) return;
      const direction = swipeDirection(event.translationX, event.velocityX);
      if (direction) swipeToMainTab(router, path, direction);
    }), [enabled, path, router]);
  if (!path) return children;
  return <GestureDetector gesture={pan}>{children}</GestureDetector>;
}
