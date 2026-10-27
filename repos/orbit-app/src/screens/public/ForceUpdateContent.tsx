import React from "react";
import { StyleSheet, View } from "react-native";

import { Button, Card, UiText } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { radius, spacing, typography } from "../../design/tokens";
import type { OrbitTranslator } from "../../i18n/messages";

export function ForceUpdateContent({ t, storeUrl, onUpdate, error }: {
  t: OrbitTranslator;
  storeUrl: string | null;
  onUpdate: () => void;
  error?: string | null;
}) {
  const styles = useStyles().styles;
  return <View style={styles.content}>
    <View style={styles.logo}><UiText style={styles.logoText}>O</UiText></View>
    <UiText accessibilityRole="header" style={styles.title}>{t("publicInfo.forceTitle")}</UiText>
    <UiText style={styles.description}>{t("publicInfo.forceBody")}</UiText>
    <Card style={styles.card}><UiText style={styles.cardText}>{t("publicInfo.forceRestart")}</UiText></Card>
    <View style={styles.footer}>
      <Button label={t("publicInfo.forceStoreButton")} variant="primary" size="lg" block disabled={!storeUrl} onPress={onUpdate} />
      {!storeUrl ? <UiText style={styles.hint}>{t("publicInfo.storeUrlUnavailable")}</UiText> : null}
      {error ? <UiText accessibilityRole="alert" style={styles.hint}>{error}</UiText> : null}
    </View>
  </View>;
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  content: { minHeight: 680, paddingHorizontal: spacing.lg, paddingTop: 116, paddingBottom: spacing.xl, alignItems: "center" },
  logo: { width: 84, height: 84, borderRadius: radius.xl, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" },
  logoText: { color: colors.bg, fontSize: 36, fontWeight: "900" },
  title: { color: colors.ink, fontSize: typography.title, fontWeight: "900", textAlign: "center", marginTop: 20 },
  description: { color: colors.ink2, fontSize: typography.bodySm, lineHeight: 28, textAlign: "center", marginTop: spacing.sm },
  card: { alignSelf: "stretch", marginTop: 20 },
  cardText: { color: colors.ink2, fontSize: typography.bodySm, lineHeight: 28 },
  footer: { alignSelf: "stretch", marginTop: "auto", gap: spacing.sm },
  hint: { color: colors.ink3Text, fontSize: typography.label, textAlign: "center" },
}));
