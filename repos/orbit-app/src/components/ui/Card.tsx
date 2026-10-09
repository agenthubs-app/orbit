import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { createThemedStyles } from "../../design/theme";
import { radius } from "../../design/tokens";

// kit .card: radius 24, padding 18; layers by tone, not shadow (01-system :187, 215).
// default = surface, flat = surface-2, line = surface + 1px line.
export function Card({ children, variant = "default", style }: { children: ReactNode; variant?: "default" | "flat" | "line"; style?: StyleProp<ViewStyle> }) {
  const { styles } = useStyles();
  return <View style={[styles.card, variant === "flat" && styles.flat, variant === "line" && styles.line, style]}>{children}</View>;
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: 18 },
  flat: { backgroundColor: colors.surface2 },
  line: { borderWidth: 1, borderColor: colors.line },
}));
