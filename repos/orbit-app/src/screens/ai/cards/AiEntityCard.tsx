import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { createThemedStyles, useOrbitTheme } from "../../../design/theme";
import { radius, rowRoleStyles, spacing, textStyles } from "../../../design/tokens";
import type { AiEntityCardView } from "../../../view-models/ai-entity-card";

/**
 * Sprint 0094: the one card the assistant uses for every entity it surfaces.
 *
 * Four entities each had their own panel and notes had none, so the same
 * question produced five different-looking answers. The card carries only what
 * identifies the record — the detail page carries the rest.
 */

const KIND_GLYPH: Readonly<Record<AiEntityCardView["kind"], keyof typeof Ionicons.glyphMap>> = {
  contact: "person-outline",
  event: "calendar-outline",
  note: "document-text-outline",
  schedule: "time-outline",
  task: "checkbox-outline",
};

export function AiEntityCard({
  onOpenHref,
  view,
}: {
  onOpenHref: (href: string) => void;
  view: AiEntityCardView;
}) {
  const { colors, styles } = useStyles();
  const body = (
    <>
      <View style={styles.glyph}>
        <Ionicons color={colors.accent} name={KIND_GLYPH[view.kind]} size={17} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.kind}>{view.kindLabel}</Text>
        <Text numberOfLines={1} style={styles.title}>{view.title}</Text>
        {view.meta ? <Text numberOfLines={1} style={styles.meta}>{view.meta}</Text> : null}
        {view.reason ? <Text numberOfLines={1} style={styles.reason}>{view.reason}</Text> : null}
      </View>
      {view.href ? <Ionicons color={colors.accent} name="chevron-forward" size={16} /> : null}
    </>
  );

  // The whole card is the target, not a link buried in it.
  return view.href ? (
    <Pressable
      accessibilityLabel={`${view.kindLabel} ${view.title}`}
      accessibilityRole="button"
      testID={`ai-entity-card-${view.kind}`}
      onPress={() => onOpenHref(view.href!)}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      {body}
    </Pressable>
  ) : (
    <View accessibilityLabel={`${view.kindLabel} ${view.title}`} style={styles.card} testID={`ai-entity-card-${view.kind}`}>{body}</View>
  );
}

export function AiEntityCardList({
  onOpenHref,
  views,
}: {
  onOpenHref: (href: string) => void;
  views: readonly AiEntityCardView[];
}) {
  const { styles } = useStyles();
  if (views.length === 0) return null;
  return (
    <View style={styles.list}>
      {views.map((view) => <AiEntityCard key={view.key} onOpenHref={onOpenHref} view={view} />)}
    </View>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  list: { gap: spacing.xs, marginTop: spacing.sm },
  card: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 64,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  glyph: {
    alignItems: "center",
    backgroundColor: colors.accentSofter,
    borderRadius: radius.md,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  copy: { flex: 1, minWidth: 0 },
  kind: { ...rowRoleStyles.groupHeading, color: colors.text3 },
  title: { ...textStyles.listTitle, color: colors.ink },
  meta: { ...textStyles.small, color: colors.text2 },
  reason: { ...textStyles.caption, color: colors.text3 },
  pressed: { backgroundColor: colors.accentSofter, opacity: 0.85 },
}));
