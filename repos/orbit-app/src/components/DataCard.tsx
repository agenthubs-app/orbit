import type { PropsWithChildren } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, shadows, spacing, typography } from "../design/tokens";

interface DataCardProps extends PropsWithChildren {
  detail?: string;
  onPress?: () => void;
  title: string;
}

export function DataCard({ children, detail, onPress, title }: DataCardProps) {
  const content = (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text numberOfLines={2} style={styles.title}>
          {title}
        </Text>
        {detail ? (
          <Text numberOfLines={3} style={styles.detail}>
            {detail}
          </Text>
        ) : null}
      </View>
      {children ? <View style={styles.body}>{children}</View> : null}
    </View>
  );

  if (!onPress) {
    return content;
  }

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.pressable, pressed ? styles.pressed : null]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.sm
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
    ...(Platform.OS === "web" ? shadows.webCard : shadows.card)
  },
  detail: {
    color: colors.text3,
    fontSize: typography.small,
    lineHeight: 19
  },
  header: {
    gap: spacing.xs
  },
  pressable: {
    borderRadius: radius.card
  },
  pressed: {
    opacity: 0.82,
    transform: [{ translateY: 0.5 }]
  },
  title: {
    color: colors.ink,
    fontSize: typography.body,
    fontWeight: "600",
    lineHeight: 20
  }
});
