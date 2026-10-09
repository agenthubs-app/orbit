import { StyleSheet, View } from "react-native";

import { createThemedStyles } from "../../design/theme";
import type { OrbitColors } from "../../design/tokens";
import { UiText } from "./Text";

// `ok` is for done / completed (RD-17: 「完成」 is always the ok green).
export type ChipTone = "neutral" | "coral" | "apricot" | "lav" | "teal" | "blue" | "pink" | "ok";

// kit .chip + 01-system ⑩: a status label — not a button, text always present,
// ≤8 characters (copy-qa checks the standard wording), one coral chip per card,
// max width 160 with an ellipsis. Text uses the readable *-text tokens.
export function Chip({ label, tone = "neutral" }: { label: string; tone?: ChipTone }) {
  const { colors, styles } = useStyles();
  const { background, text } = chipColors(colors)[tone];
  return (
    <View accessibilityRole="text" style={[styles.chip, { backgroundColor: background }]}>
      <UiText numberOfLines={1} style={[styles.label, { color: text }]}>{label}</UiText>
    </View>
  );
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

const useStyles = createThemedStyles(() => StyleSheet.create({
  chip: { alignSelf: "flex-start", maxWidth: 160, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  label: { fontSize: 11, fontWeight: "700" },
}));
