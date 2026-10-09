import { StyleSheet, View } from "react-native";

import { createThemedStyles } from "../../design/theme";
import type { OrbitColors } from "../../design/tokens";
import { UiText } from "./Text";

type Tone = "lav" | "pink" | "blue" | "teal" | "apricot";
const TONES: Tone[] = ["lav", "pink", "blue", "teal", "apricot"];
const SIZES = { sm: 30, md: 38, lg: 56 } as const;

// kit .av: 38 / 30 / 56, macaron background, initials. The tone is stable per name
// so a person keeps one colour everywhere.
export function avatarTone(name: string): Tone {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  return TONES[hash % TONES.length]!;
}

export function initials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  if (/^[A-Za-z]/.test(trimmed)) return trimmed.split(/\s+/).slice(0, 2).map((part) => part[0]!.toUpperCase()).join("");
  return [...trimmed][0]!;
}

function toneColors(colors: OrbitColors, tone: Tone) {
  return {
    lav: { background: colors.macLav, text: colors.macLavText },
    pink: { background: colors.macPink, text: colors.macPinkText },
    blue: { background: colors.macBlue, text: colors.macBlueText },
    teal: { background: colors.macTeal, text: colors.macTealText },
    apricot: { background: colors.macApricot, text: colors.macApricotText },
  }[tone];
}

export function Avatar({ name, size = "md" }: { name: string; size?: keyof typeof SIZES }) {
  const { colors, styles } = useStyles();
  const { background, text } = toneColors(colors, avatarTone(name));
  const dimension = SIZES[size];
  return (
    <View accessibilityLabel={name} accessibilityRole="image" style={[styles.avatar, { width: dimension, height: dimension, backgroundColor: background }]}>
      <UiText maxFontSizeMultiplier={1} style={[styles.initials, { color: text, fontSize: size === "lg" ? 19 : size === "sm" ? 11.5 : 13.5 }]}>{initials(name)}</UiText>
    </View>
  );
}

// kit .avs: overlap -8 with a surface ring.
export function AvatarStack({ names, size = "sm", max = 4 }: { names: string[]; size?: keyof typeof SIZES; max?: number }) {
  const { styles } = useStyles();
  return (
    <View accessibilityLabel={names.join("、")} style={styles.stack}>
      {names.slice(0, max).map((name, index) => (
        <View key={`${name}-${index}`} style={[styles.ring, index > 0 && styles.overlap]}><Avatar name={name} size={size} /></View>
      ))}
    </View>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  avatar: { borderRadius: 999, alignItems: "center", justifyContent: "center" },
  initials: { fontWeight: "800" },
  stack: { flexDirection: "row" },
  ring: { borderRadius: 999, borderWidth: 2, borderColor: colors.surface },
  overlap: { marginLeft: -8 },
}));
