// R12 人脈を追加: small pieces the add screens share — a fade-in (the only motion left
// with 「視差効果を減らす」), the three-dot density marks and legend (D-10), the three
// count tiles of まとめて確認 / 完成, and a section heading. Library components only.
import { useEffect, useRef, type ReactNode } from "react";
import { Animated, StyleSheet, View } from "react-native";

import type { ContactDensityLevel } from "../../api/compute/contact-density";
import { CountUp, UiPressable, UiText } from "../../components/ui";
import { durations } from "../../components/ui/motion";
import { createThemedStyles, useOrbitTheme } from "../../design/theme";
import { radius } from "../../design/tokens";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";

/** Fades the content in. Nothing slides or scales, so 「視差効果を減らす」 changes nothing here. */
export function FadeIn({ children, testID }: { children: ReactNode; testID?: string }) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(opacity, { duration: durations.toastIn, toValue: 1, useNativeDriver: true }).start();
  }, [opacity]);
  return <Animated.View testID={testID} style={{ opacity }}>{children}</Animated.View>;
}

export function DensityDots({ level }: { level: ContactDensityLevel }) {
  const { colors, styles } = useStyles();
  return (
    <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {[1, 2, 3].map((dot) => <View key={dot} style={[styles.dot, { backgroundColor: dot <= level ? colors.accent : colors.surface3 }]} />)}
    </View>
  );
}

/** 情報の濃さ: 身元だけ ●○○ / 名刺レベル ●●○ / よく知っている ●●●. */
export function DensityLegend() {
  const { styles } = useStyles();
  const { t } = useOrbitLocale();
  const levels: [ContactDensityLevel, string][] = [[1, t("add.doors.density1")], [2, t("add.doors.density2")], [3, t("add.doors.density3")]];
  return (
    <View style={styles.legend} testID="add-density-legend">
      <UiText style={styles.caption}>{t("add.doors.densityTitle")}</UiText>
      <View style={styles.legendRow}>
        {levels.map(([level, label]) => (
          <View key={level} style={styles.legendItem} accessible accessibilityLabel={label}>
            <DensityDots level={level} />
            <UiText style={styles.caption}>{label}</UiText>
          </View>
        ))}
      </View>
    </View>
  );
}

export interface CountTile { key: string; label: string; value: number; tone?: "warn"; onPress?: () => void }

/** Three count tiles (まとめて確認: 重複 / 要確認 / そのまま追加; 完成: 新しく追加 / 既存と統合 / 読み取れず). */
export function CountTiles({ tiles }: { tiles: readonly CountTile[] }) {
  const { styles } = useStyles();
  const { t } = useOrbitLocale();
  return (
    <View style={styles.tiles}>
      {tiles.map((tile) => {
        const body = (
          <>
            <CountUp value={tile.value} style={[styles.tileNumber, tile.tone === "warn" && tile.value > 0 ? styles.warn : null]} />
            <UiText numberOfLines={2} style={styles.caption}>{tile.label}</UiText>
          </>
        );
        const label = t("add.batch.tileLabel", { label: tile.label, n: tile.value });
        return tile.onPress ? (
          <UiPressable key={tile.key} testID={`add-tile-${tile.key}`} accessibilityRole="button" accessibilityLabel={label} onPress={tile.onPress} style={styles.tile}>{body}</UiPressable>
        ) : (
          <View key={tile.key} testID={`add-tile-${tile.key}`} accessible accessibilityLabel={label} style={styles.tile}>{body}</View>
        );
      })}
    </View>
  );
}

export function SectionTitle({ children }: { children: string }) {
  const { styles } = useStyles();
  return <UiText accessibilityRole="header" style={styles.sectionTitle}>{children}</UiText>;
}

export function Caption({ children, tone }: { children: ReactNode; tone?: "error" }) {
  const { styles } = useStyles();
  return <UiText accessibilityRole={tone === "error" ? "alert" : undefined} style={[styles.caption, tone === "error" ? styles.error : null]}>{children}</UiText>;
}

export function Body({ children }: { children: ReactNode }) {
  const { styles } = useStyles();
  return <UiText style={styles.body}>{children}</UiText>;
}

export function useAddColors() {
  return useOrbitTheme().colors;
}

export const useAddStyles = createThemedStyles((colors) => StyleSheet.create({
  stack: { gap: 12 },
  tightStack: { gap: 6 },
  row: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 8 },
  rowBetween: { alignItems: "center", flexDirection: "row", gap: 8, justifyContent: "space-between" },
  grow: { flex: 1, minWidth: 0 },
  title: { color: colors.ink, fontSize: 17, fontWeight: "800", lineHeight: 23 },
  bigTitle: { color: colors.ink, fontSize: 22, fontWeight: "800", lineHeight: 29, textAlign: "center" },
  strong: { color: colors.ink, fontSize: 14, fontWeight: "700" },
  body: { color: colors.ink2, fontSize: 13.5, lineHeight: 20 },
  caption: { color: colors.ink3Text, fontSize: 12, lineHeight: 17 },
  error: { color: colors.coralText },
  notice: { alignItems: "flex-start", backgroundColor: colors.surface2, borderRadius: radius.md, flexDirection: "row", gap: 8, padding: 12 },
  noticeError: { backgroundColor: colors.coralSoft },
  rowPad: { paddingVertical: 6 },
  compareLabel: { width: 64 },
  centered: { alignItems: "center" },
  spaced: { marginTop: 14 },
}));

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  dots: { flexDirection: "row", gap: 3 },
  dot: { borderRadius: 4, height: 8, width: 8 },
  legend: { gap: 6, paddingVertical: 4 },
  legendRow: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  legendItem: { alignItems: "center", flexDirection: "row", gap: 6 },
  caption: { color: colors.ink3Text, fontSize: 12, lineHeight: 17 },
  body: { color: colors.ink2, fontSize: 13.5, lineHeight: 20 },
  error: { color: colors.coralText },
  tiles: { flexDirection: "row", gap: 8 },
  tile: { alignItems: "center", backgroundColor: colors.surface2, borderRadius: radius.md, flex: 1, gap: 2, minHeight: 72, paddingHorizontal: 6, paddingVertical: 10 },
  tileNumber: { color: colors.ink, fontSize: 24, fontWeight: "800" },
  warn: { color: colors.coralText },
  sectionTitle: { color: colors.ink, fontSize: 15, fontWeight: "800", marginTop: 8 },
}));
