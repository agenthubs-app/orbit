// 2026-11-21 活动页的加载骨架：先出固定框架（顶栏 / 段控件 / 底栏照常），内容位置放同形状的灰块，数据到了原位替换。
// 01-system ⑦：灰块用 surface-2，1.6 s 呼吸；减弱动态时静止。
import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { Animated, StyleSheet, View, type DimensionValue, type ViewStyle } from "react-native";

import { useReducedMotion } from "../../../components/ui";
import { durations } from "../../../components/ui/motion";
import { createThemedStyles } from "../../../design/theme";
import { useStandardCopy } from "../../../i18n/standard-copy";

const Pulse = createContext<Animated.AnimatedInterpolation<number> | number>(1);

/** Wraps a skeleton: one shared pulse for every bone inside, announced once as loading. */
export function Bones({ children, style, testID }: { children: ReactNode; style?: ViewStyle; testID?: string }) {
  const reduced = useReducedMotion();
  const copy = useStandardCopy();
  const shimmer = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) return undefined;
    const loop = Animated.loop(Animated.timing(shimmer, { toValue: 1, duration: durations.shimmer, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [reduced, shimmer]);
  const opacity = reduced ? 1 : shimmer.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.55, 1] });
  return <Pulse.Provider value={opacity}><View accessibilityRole="progressbar" accessibilityLabel={copy.loading.loading} style={style} testID={testID}>{children}</View></Pulse.Provider>;
}

export function Bone({ w = "100%", h = 12, r = 6, style }: { w?: DimensionValue; h?: number; r?: number; style?: ViewStyle }) {
  const { styles } = useStyles();
  const opacity = useContext(Pulse);
  return <Animated.View style={[styles.bone, { borderRadius: r, height: h, width: w, opacity }, style]} />;
}

/** A card-shaped skeleton (kit .card 24 / 16·14): a label line, then avatar rows. */
export function BoneCard({ rows = 3, title = true, style }: { rows?: number; title?: boolean; style?: ViewStyle }) {
  const { styles } = useStyles();
  return (
    <View style={[styles.card, style]}>
      {title ? <Bone w="38%" h={12} /> : null}
      {Array.from({ length: rows }, (_, index) => (
        <View key={index} style={[styles.row, (title || index) ? { marginTop: 14 } : null]}>
          <Bone w={38} h={38} r={19} />
          <View style={styles.grow}><Bone w={`${72 - index * 8}%`} h={12} /><Bone w={`${48 - index * 6}%`} h={10} style={{ marginTop: 7 }} /></View>
        </View>
      ))}
    </View>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  bone: { backgroundColor: colors.surface2 },
  card: { backgroundColor: colors.surface, borderRadius: 24, marginBottom: 12, paddingHorizontal: 16, paddingVertical: 14 },
  row: { alignItems: "center", flexDirection: "row", gap: 10 },
  grow: { flex: 1 },
}));
