// R12 人脈を追加: small pieces the add screens share — a fade-in (the only motion left
// with 「視差効果を減らす」), the three-dot density marks and legend (D-10), the three
// count tiles of まとめて確認 / 完成, and a section heading. Library components only.
import { useEffect, useRef, type ReactNode } from "react";
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import type { ContactDensityLevel } from "../../api/compute/contact-density";
import { CountUp, UiPressable, UiText } from "../../components/ui";
import { durations } from "../../components/ui/motion";
import { createThemedStyles, useOrbitTheme } from "../../design/theme";
import { radius } from "../../design/tokens";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";

/** Fades the content in. Nothing slides or scales, so 「視差効果を減らす」 changes nothing here. */

export function FadeIn({ children, testID, style }: { children: ReactNode; testID?: string; style?: StyleProp<ViewStyle> }) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(opacity, { duration: durations.toastIn, toValue: 1, useNativeDriver: true }).start();
  }, [opacity]);
  return <Animated.View testID={testID} style={[{ opacity }, style]}>{children}</Animated.View>;
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

/**
 * 完成: how much is known about the new people (D-10, R12 review m11) — one segment per level
 * sized by count, then 身元だけ N人 / 名刺レベル N人 / よく知っている N人.
 */
export function DensityBar({ counts }: { counts: Readonly<Record<ContactDensityLevel, number>> }) {
  const { colors, styles } = useStyles();
  const { t } = useOrbitLocale();
  const levels: [ContactDensityLevel, string, string][] = [
    [1, t("add.doors.density1"), colors.plum300],
    [2, t("add.doors.density2"), colors.plum500],
    [3, t("add.doors.density3"), colors.plum700],
  ];
  const line = (label: string, level: ContactDensityLevel) => t("add.batch.doneDensityLevel", { label, n: counts[level] });
  const summary = levels.map(([level, label]) => line(label, level)).join(" · ");
  return (
    <View style={styles.legend} testID="add-done-density">
      <UiText style={styles.caption}>{t("add.doors.densityTitle")}</UiText>
      <View style={styles.track} accessible accessibilityRole="image" accessibilityLabel={summary}>
        {levels.map(([level, , color]) => (counts[level] ? <View key={level} style={[styles.segment, { backgroundColor: color, flexGrow: counts[level] }]} /> : null))}
      </View>
      <View style={styles.legendRow}>
        {levels.map(([level, label]) => (
          <View key={level} style={styles.legendItem} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            <DensityDots level={level} />
            <UiText style={styles.caption}>{line(label, level)}</UiText>
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

/**
 * kit 顶栏右侧的文字按钮（`.btn.sm.primary` 高 34、左右 12、12px 700）：放在 44 宽的格子里、向右溢出，
 * 和设计稿一样不把两侧加宽（ShellTopBar 遇到宽于 44 的一侧会两侧同宽、靠右）。看得见的高 34，hitSlop 补到 44。
 */
export function KitHeadAction({ label, disabled = false, onPress, testID }: { label: string; disabled?: boolean; onPress: () => void; testID?: string }) {
  const { colors, styles } = useStyles();
  return (
    <View style={styles.headSlot}>
      {/* An explicit-width layer lets the button keep its own width past the 44 cell (Yoga caps children at the parent). */}
      <View pointerEvents="box-none" style={styles.headLayer}>
      <UiPressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} hitSlop={5} onPress={onPress}
        style={[styles.headBtn, disabled && styles.headBtnOff]} testID={testID}>
        <UiText numberOfLines={1} style={[styles.headBtnText, { color: colors.bg }]}>{label}</UiText>
      </UiPressable>
      </View>
    </View>
  );
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
  title: { color: colors.ink, fontSize: 19, fontWeight: "800", lineHeight: 26 },
  bigTitle: { color: colors.ink, fontSize: 24, fontWeight: "800", lineHeight: 32, textAlign: "center" },
  strong: { color: colors.ink, fontSize: 17, fontWeight: "700" },
  body: { color: colors.ink2, fontSize: 16, lineHeight: 24 },
  caption: { color: colors.ink3Text, fontSize: 14, lineHeight: 20 },
  error: { color: colors.coralText },
  notice: { alignItems: "flex-start", backgroundColor: colors.surface2, borderRadius: radius.md, flexDirection: "row", gap: 8, padding: 12 },
  noticeError: { backgroundColor: colors.coralSoft },
  rowPad: { paddingVertical: 6 },
  compareLabel: { width: 64 },
  centered: { alignItems: "center" },
  spaced: { marginTop: 14 },
}));

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  headSlot: { width: 44, height: 34 },
  headLayer: { position: "absolute", left: 0, top: 0, width: 200, height: 34, flexDirection: "row" },
  headBtn: { height: 34, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" },
  headBtnOff: { opacity: 0.4 },
  headBtnText: { fontSize: 14, fontWeight: "700", lineHeight: 21 },
  dots: { flexDirection: "row", gap: 3 },
  dot: { borderRadius: 4, height: 8, width: 8 },
  legend: { gap: 6, paddingVertical: 4 },
  legendRow: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  legendItem: { alignItems: "center", flexDirection: "row", gap: 6 },
  track: { backgroundColor: colors.surface3, borderRadius: radius.pill, flexDirection: "row", gap: 3, height: 10, overflow: "hidden" },
  segment: { minWidth: 6 },
  caption: { color: colors.ink3Text, fontSize: 14, lineHeight: 20 },
  body: { color: colors.ink2, fontSize: 16, lineHeight: 24 },
  error: { color: colors.coralText },
  tiles: { flexDirection: "row", gap: 8 },
  tile: { alignItems: "center", backgroundColor: colors.surface2, borderRadius: radius.md, flex: 1, gap: 2, minHeight: 72, paddingHorizontal: 6, paddingVertical: 10 },
  tileNumber: { color: colors.ink, fontSize: 28, fontWeight: "800" },
  warn: { color: colors.coralText },
  sectionTitle: { color: colors.ink, fontSize: 17, fontWeight: "800", marginTop: 8 },
}));
