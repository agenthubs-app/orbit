import { StyleSheet, View } from "react-native";

import { createThemedStyles } from "../../design/theme";
import { UiText } from "./Text";

// kit .emo: a category tile — emoji on a macaron square (40, radius 13; sm 32 / 10).
// Emoji only mark categories; buttons use line icons (01-system :187).
export function MacTile({ emoji, tone = "lav", size = "md", accessibilityLabel }: { emoji: string; tone?: "pink" | "apricot" | "blue" | "teal" | "lav"; size?: "md" | "sm"; accessibilityLabel?: string }) {
  const { colors, styles } = useStyles();
  const background = { pink: colors.macPink, apricot: colors.macApricot, blue: colors.macBlue, teal: colors.macTeal, lav: colors.macLav }[tone];
  return (
    <View accessible={Boolean(accessibilityLabel)} accessibilityLabel={accessibilityLabel} style={[styles.tile, size === "sm" ? styles.sm : styles.md, { backgroundColor: background }]}>
      <UiText maxFontSizeMultiplier={1.2} style={size === "sm" ? styles.emojiSm : styles.emoji}>{emoji}</UiText>
    </View>
  );
}

const useStyles = createThemedStyles(() => StyleSheet.create({
  tile: { alignItems: "center", justifyContent: "center" },
  md: { width: 40, height: 40, borderRadius: 13 },
  sm: { width: 32, height: 32, borderRadius: 10 },
  emoji: { fontSize: 21 },
  emojiSm: { fontSize: 17 },
}));
