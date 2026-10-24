import React from "react";
import { StyleSheet, View } from "react-native";

import { Button, Card, UiText } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { spacing, typography } from "../../design/tokens";
import type { OrbitTranslator } from "../../i18n/messages";

export function MaintenanceContent({ t, untilText, onRetry }: {
  t: OrbitTranslator;
  untilText: string | null;
  onRetry: () => void;
}) {
  const styles = useStyles().styles;
  return <View style={styles.content}>
    <UiText style={styles.icon}>🛠️</UiText>
    <UiText accessibilityRole="header" style={styles.title}>{t("publicInfo.maintenanceTitle")}</UiText>
    <UiText style={styles.description}>{t("publicInfo.maintenanceBody")}</UiText>
    <Card style={styles.schedule}>
      <UiText style={styles.label}>{t("publicInfo.maintenanceSchedule")}</UiText>
      <UiText style={styles.scheduleValue}>{untilText ?? t("publicInfo.maintenanceUnknown")}</UiText>
    </Card>
    <View style={styles.action}>
      <Button block icon="refresh" label={t("publicInfo.reload")} onPress={onRetry} />
    </View>
  </View>;
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingTop: 122, paddingBottom: spacing.xxl, alignItems: "center" },
  icon: { fontSize: 64, lineHeight: 72 },
  title: { color: colors.ink, fontSize: typography.title, fontWeight: "900", textAlign: "center", marginTop: 18 },
  description: { color: colors.ink2, fontSize: typography.bodySm, lineHeight: 28, textAlign: "center", marginTop: spacing.sm },
  schedule: { alignSelf: "stretch", marginTop: spacing.xl, paddingVertical: spacing.xl, alignItems: "center" },
  label: { color: colors.ink3Text, fontSize: typography.label, textAlign: "center" },
  scheduleValue: { color: colors.ink2, fontSize: typography.bodySm, marginTop: spacing.xs, textAlign: "center" },
  action: { alignSelf: "stretch", marginTop: spacing.lg },
}));
