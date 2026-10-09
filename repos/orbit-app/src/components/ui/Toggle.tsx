import { useEffect, useRef } from "react";
import { Animated, StyleSheet } from "react-native";

import { useOrbitTheme } from "../../design/theme";
import { useReducedMotion } from "./motion";
import { UiPressable } from "./Pressable";

// kit .tgl: 44×26, on = plum-700 (green only means done, RD-17), knob 20.
export function Toggle({ value, onValueChange, accessibilityLabel, disabled = false }: { value: boolean; onValueChange: (next: boolean) => void; accessibilityLabel: string; disabled?: boolean }) {
  const { colors } = useOrbitTheme();
  const reduced = useReducedMotion();
  const knob = useRef(new Animated.Value(value ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) knob.setValue(value ? 1 : 0);
    else Animated.timing(knob, { toValue: value ? 1 : 0, duration: 250, useNativeDriver: true }).start();
  }, [knob, reduced, value]);
  return (
    <UiPressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      hitSlop={9}
      onPress={() => onValueChange(!value)}
      pressedScale={1}
      style={[styles.track, { backgroundColor: value ? colors.plum700 : colors.surface3 }, disabled && styles.disabled]}
    >
      <Animated.View style={[styles.knob, { backgroundColor: colors.surface, transform: [{ translateX: knob.interpolate({ inputRange: [0, 1], outputRange: [0, 18] }) }] }]} />
    </UiPressable>
  );
}

const styles = StyleSheet.create({
  track: { width: 44, height: 26, borderRadius: 13, padding: 3 },
  knob: { width: 20, height: 20, borderRadius: 10 },
  disabled: { opacity: 0.45 },
});
