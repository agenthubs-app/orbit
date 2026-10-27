import React from "react";
import { StyleSheet, View } from "react-native";

import { Button, UiText } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { spacing, typography } from "../../design/tokens";
import type { OrbitTranslator } from "../../i18n/messages";

export function NotFoundContent({ t, onHome, onHelp }: {
  t: OrbitTranslator;
  onHome: () => void;
  onHelp: () => void;
}) {
  const styles = useStyles().styles;
  const body = t("publicInfo.notFoundBody");
  const mobileBreak = /URL\s\S/u.exec(body);
  const breakAt = mobileBreak ? mobileBreak.index + mobileBreak[0].length : 0;
  return <View style={styles.content}>
    <UiText style={styles.icon}>🧭</UiText>
    <UiText accessibilityRole="header" style={styles.title}>{t("publicInfo.notFoundTitle")}</UiText>
    <UiText style={styles.description}>{breakAt > 0 ? `${body.slice(0, breakAt)}\n${body.slice(breakAt)}` : body}</UiText>
    <View style={styles.actions}>
      <Button block label={t("publicInfo.backHome")} variant="primary" onPress={onHome} />
      <Button block label={t("publicInfo.seeHelp")} onPress={onHelp} />
    </View>
  </View>;
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingTop: 122, paddingBottom: spacing.xxl, alignItems: "center" },
  icon: { fontSize: 64, lineHeight: 72 },
  title: { color: colors.ink, fontSize: typography.number, fontWeight: "900", textAlign: "center", marginTop: 18 },
  description: { color: colors.ink2, fontSize: typography.bodySm, lineHeight: 28, textAlign: "center", marginTop: spacing.sm },
  actions: { alignSelf: "stretch", gap: spacing.sm + spacing.xxs, marginTop: 20 },
}));
