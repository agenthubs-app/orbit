import { StyleSheet, View } from "react-native";

import { createThemedStyles } from "../../design/theme";
import type { OrbitColors } from "../../design/tokens";
import { Icon, type IconName } from "./Icon";
import { UiPressable } from "./Pressable";
import { UiText } from "./Text";

// `ok` is for done / completed (RD-17: 「完成」 is always the ok green).
export type ChipTone = "neutral" | "coral" | "apricot" | "lav" | "teal" | "blue" | "pink" | "ok";

// kit .chip + 01-system ⑩: a status label — not a button, text always present,
// ≤8 characters (copy-qa checks the standard wording), one coral chip per card,
// max width 160 with an ellipsis. Text uses the readable *-text tokens.
// R31a (R11a request): `icon` = kit `.chip svg.i` 12px before the label, in the chip's text colour, gap 4
// (app.html #6 人脈 source chips: 名刺 / LinkedIn …).
export function Chip({ label, tone = "neutral", icon, suggested = false, expand = false, onAccept, presentation }: { label: string; tone?: ChipTone; icon?: IconName; suggested?: boolean; expand?: boolean; onAccept?: () => void; presentation?: "kit" }) {
  const { colors, styles } = useStyles();
  const { background, text: readableText } = chipColors(colors)[tone];
  const text = presentation === "kit" ? kitChipText(colors)[tone] : readableText;
  const style = [styles.chip, icon ? styles.withIcon : null, suggested && styles.suggested, expand && styles.expanded, { backgroundColor: suggested ? "transparent" : background }];
  const content = <>
    {icon ? <Icon name={icon} size={12} color={text} /> : null}
    <UiText numberOfLines={1} style={[styles.label, { color: suggested ? colors.ink2 : text }]}>{label}</UiText>
    {suggested ? <View style={styles.suggestedCheck}><UiText style={styles.suggestedCheckText}>✓</UiText></View> : null}
  </>;
  if (suggested && onAccept) return <UiPressable accessibilityRole="button" accessibilityLabel={label} hitSlop={{ top: 10, bottom: 10, left: 0, right: 0 }} onPress={onAccept} style={style}>{content}</UiPressable>;
  return (
    <View accessibilityRole="text" style={style}>{content}</View>
  );
}

// The 01-system specimen uses the raw kit ink; product chips keep readable *Text tokens.
function kitChipText(colors: OrbitColors): Record<ChipTone, string> {
  return {
    neutral: colors.ink2,
    coral: colors.coral,
    apricot: colors.macApricotInk,
    lav: colors.macLavInk,
    teal: colors.macTealInk,
    blue: colors.macBlueInk,
    pink: colors.macPinkInk,
    ok: colors.ok,
  };
}

export function chipColors(colors: OrbitColors): Record<ChipTone, { background: string; text: string }> {
  return {
    neutral: { background: colors.surface2, text: colors.ink2 },
    coral: { background: colors.coralSoft, text: colors.coralText },
    apricot: { background: colors.macApricot, text: colors.macApricotText },
    lav: { background: colors.macLav, text: colors.macLavText },
    teal: { background: colors.macTeal, text: colors.macTealText },
    blue: { background: colors.macBlue, text: colors.macBlueText },
    pink: { background: colors.macPink, text: colors.macPinkText },
    ok: { background: colors.okSoft, text: colors.okText },
  };
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  chip: { alignSelf: "flex-start", maxWidth: 160, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  withIcon: { flexDirection: "row", alignItems: "center", gap: 4 },
  // kit .chip: 11 / 700 at the body line-height 1.5 → 22.5 tall with padding 3.
  label: { fontSize: 11, fontWeight: "700", lineHeight: 16.5 },
  suggested: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.plum300, paddingRight: 4 },
  suggestedCheck: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  suggestedCheckText: { color: colors.ink2, fontSize: 10, fontWeight: "700" },
  expanded: { flex: 1, alignSelf: "stretch", maxWidth: "100%" },
}));
