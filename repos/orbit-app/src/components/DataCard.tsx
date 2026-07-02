import type { PropsWithChildren } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../design/tokens";

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
      style={({ pressed }) => [pressed ? styles.pressed : null]}
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
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.md,
    padding: spacing.lg
  },
  detail: {
    color: colors.muted,
    fontSize: typography.small,
    lineHeight: 20
  },
  header: {
    gap: spacing.xs
  },
  pressed: {
    opacity: 0.72
  },
  title: {
    color: colors.ink,
    fontSize: typography.body,
    fontWeight: "800",
    lineHeight: 22
  }
});
