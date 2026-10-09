import { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet } from "react-native";

import { useOrbitTheme } from "../../design/theme";
import { durations } from "./motion";

// Dimmed backdrop (token scrim, no blur). `onPress` undefined = taps do nothing
// (destructive confirms do not close on a backdrop tap).
export function Scrim({ onPress }: { onPress?: (() => void) | undefined }) {
  const { colors } = useOrbitTheme();
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(opacity, { toValue: 1, duration: durations.dialog, useNativeDriver: true }).start(); }, [opacity]);
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim, opacity }]}>
      <Pressable accessible={false} disabled={!onPress} onPress={onPress} style={StyleSheet.absoluteFill} />
    </Animated.View>
  );
}
