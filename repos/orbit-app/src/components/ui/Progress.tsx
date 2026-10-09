import { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import Svg, { Circle } from "./svg";

import { useOrbitTheme } from "../../design/theme";
import { durations, useReducedMotion } from "./motion";
import { UiText } from "./Text";

// kit .bar: track 6 (thin 4) on surface-3, plum fill with a round knob; grows in
// 1.1 s. Reduce Motion: drawn at its value.
export function ProgressBar({ value, thin = false, tone = "plum", accessibilityLabel }: { value: number; thin?: boolean; tone?: "plum" | "coral"; accessibilityLabel: string }) {
  const { colors } = useOrbitTheme();
  const reduced = useReducedMotion();
  const clamped = Math.max(0, Math.min(1, value));
  const grow = useRef(new Animated.Value(reduced ? clamped : 0)).current;
  useEffect(() => {
    if (reduced) grow.setValue(clamped);
    else Animated.timing(grow, { toValue: clamped, duration: 1100, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [clamped, grow, reduced]);
  const fill = tone === "coral" ? colors.coral : colors.plum700;
  const height = thin ? 4 : 6;
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={accessibilityLabel} accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }} style={[styles.track, { height, borderRadius: height, backgroundColor: colors.surface3 }]}>
      <Animated.View style={[styles.fill, { borderRadius: height, backgroundColor: fill, width: grow.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }]}>
        {thin ? null : <View style={[styles.knob, { borderColor: fill, backgroundColor: colors.surface }]} />}
      </Animated.View>
    </View>
  );
}

// kit.js ring(): segments in one colour family around a centre label.
export function RingChart({ size = 96, stroke = 10, segments, center, accessibilityLabel }: { size?: number; stroke?: number; segments: { value: number; color: string }[]; center?: string; accessibilityLabel: string }) {
  const { colors } = useOrbitTheme();
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const total = segments.reduce((sum, segment) => sum + segment.value, 0) || 1;
  const gap = segments.length > 1 ? 3 : 0;
  let offset = 0;
  return (
    <View accessibilityRole="image" accessibilityLabel={accessibilityLabel} style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.surface3} strokeWidth={stroke} fill="none" />
        {segments.map((segment, index) => {
          const length = Math.max(0, (segment.value / total) * circumference - gap);
          const element = <Circle key={index} cx={size / 2} cy={size / 2} r={r} stroke={segment.color} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={`${length} ${circumference}`} strokeDashoffset={-offset} />;
          offset += length + gap;
          return element;
        })}
      </Svg>
      {center ? <UiText style={{ color: colors.ink, fontSize: 18, fontWeight: "800" }}>{center}</UiText> : null}
    </View>
  );
}

/** kit.js .cnt: ease-out cubic over 1.1 s. */
export function countUpValue(target: number, elapsedMs: number, durationMs = durations.count): number {
  const progress = Math.min(1, Math.max(0, elapsedMs / durationMs));
  return target * (1 - Math.pow(1 - progress, 3));
}

// Numbers roll up once; Reduce Motion shows the final value at once.
export function CountUp({ value, decimals = 0, style }: { value: number; decimals?: number; style?: object }) {
  const { colors } = useOrbitTheme();
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(reduced ? value : 0);
  useEffect(() => {
    if (reduced) { setShown(value); return; }
    const start = Date.now();
    let frame = 0;
    const tick = () => {
      const next = countUpValue(value, Date.now() - start);
      setShown(next);
      if (next < value) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reduced, value]);
  return <UiText accessibilityLabel={value.toFixed(decimals)} style={[{ color: colors.ink, fontWeight: "800" }, style]}>{shown.toLocaleString("ja-JP", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}</UiText>;
}

const styles = StyleSheet.create({
  track: { overflow: "visible", marginVertical: 8 },
  fill: { height: "100%", justifyContent: "center" },
  knob: { position: "absolute", right: -7, width: 14, height: 14, borderRadius: 7, borderWidth: 3 },
});
