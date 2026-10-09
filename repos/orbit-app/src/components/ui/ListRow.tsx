import type { ReactNode } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";

import { createThemedStyles } from "../../design/theme";
import { UiPressable } from "./Pressable";
import { UiText } from "./Text";

// kit .list > .li: leading slot (avatar / tile), title 14/700 and one meta line
// 12 / ink-3-text, trailing slot. Tappable rows are buttons with a 44+ target.
// One line each at normal sizes; with larger text they wrap (up to 3 lines) instead
// of cutting the name short, like iOS table cells (R04 review M3).
export function ListRow({ title, subtitle, leading, trailing, onPress, accessibilityLabel }: {
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const { styles } = useStyles();
  const lines = useWindowDimensions().fontScale > 1.2 ? 3 : 1;
  const content = (
    <>
      {leading}
      <View style={styles.meta}>
        <UiText numberOfLines={lines} style={styles.title}>{title}</UiText>
        {subtitle ? <UiText numberOfLines={lines} style={styles.subtitle}>{subtitle}</UiText> : null}
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </>
  );
  if (!onPress) return <View style={styles.row}>{content}</View>;
  return (
    <UiPressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? [title, subtitle].filter(Boolean).join("、")} onPress={onPress} pressedScale={0.98} style={styles.row}>
      {content}
    </UiPressable>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingVertical: 11 },
  meta: { flex: 1, minWidth: 0 },
  title: { color: colors.ink, fontSize: 14, fontWeight: "700" },
  subtitle: { color: colors.ink3Text, fontSize: 12, marginTop: 2 },
  trailing: { flexShrink: 0, alignItems: "flex-end" },
}));
