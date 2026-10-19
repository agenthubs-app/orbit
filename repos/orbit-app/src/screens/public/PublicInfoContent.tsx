import React from "react";
import { StyleSheet, TextInput, View } from "react-native";

import { Accordion, Button, Card, Chip, Icon, UiText } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { radius, spacing, typography } from "../../design/tokens";
import type { OrbitTranslator } from "../../i18n/messages";
import { filterPublicFaq } from "../../view-models/public-faq-search";

export type PublicInfoKind = "help" | "terms" | "privacy";

const faqKeys = [
  { id: "send", question: "publicInfo.sendQuestion", answer: "publicInfo.sendAnswer", searchKeywords: ["draft", "下書き", "草稿"] },
  { id: "gmail", question: "publicInfo.gmailQuestion", answer: "publicInfo.gmailAnswer", searchKeywords: ["metadata", "メタデータ", "元数据"] },
  { id: "card", question: "publicInfo.cardQuestion", answer: "publicInfo.cardAnswer", searchKeywords: ["scan", "名刺", "名片"] },
] as const;

export function PublicInfoContent({ kind, t, query, onQueryChange, onOpen, contactEmail, onOpenEmail }: {
  kind: PublicInfoKind;
  t: OrbitTranslator;
  query: string;
  onQueryChange: (query: string) => void;
  onOpen: (path: "/" | "/help") => void;
  contactEmail: string | null;
  onOpenEmail: () => void;
}) {
  const { colors, styles } = useStyles();
  const help = kind === "help";
  const title = t(kind === "help" ? "publicInfo.helpTitle" : kind === "terms" ? "publicInfo.termsTitle" : "publicInfo.privacyTitle");
  const faq = filterPublicFaq(faqKeys.map(({ id, question, answer, searchKeywords }) => ({
    id,
    question: t(question),
    answer: t(answer),
    searchKeywords,
  })), query);

  return <View style={styles.content}>
    <UiText style={styles.eyebrow}>{t("publicInfo.page")}</UiText>
    <UiText accessibilityRole="header" style={styles.title}>{title}</UiText>
    {help ? <>
      <UiText style={styles.intro}>{t("publicInfo.helpIntro")}</UiText>
      <View style={styles.search}>
        <Icon name="search" size={16} color={colors.ink3Text} />
        <TextInput
          accessibilityLabel={t("publicInfo.searchPlaceholder")}
          onChangeText={onQueryChange}
          placeholder={t("publicInfo.searchPlaceholder")}
          placeholderTextColor={colors.ink3Text}
          returnKeyType="search"
          style={styles.searchInput}
          value={query}
        />
      </View>
      {faq.length ? <Card style={styles.faqCard}>
        <UiText style={styles.cardTitle}>{t("publicInfo.faqTitle")}</UiText>
        {faq.map((item) => <View key={item.id} style={styles.faqRow}>
          <Accordion title={item.question}><UiText style={styles.answer}>{item.answer}</UiText></Accordion>
        </View>)}
      </Card> : <Card style={styles.faqCard}>
        <UiText style={styles.cardTitle}>{query.trim() ? `「${query.trim()}」` : ""}{t("publicInfo.noResults")}</UiText>
        <UiText style={styles.answer}>{t("publicInfo.tryAnother")}</UiText>
      </Card>}
      <Card variant="flat" style={styles.contactCard}>
        <UiText style={styles.cardTitle}>{t("publicInfo.contactTitle")}</UiText>
        {contactEmail ? <Button label={t("publicInfo.openMail")} variant="secondary" onPress={onOpenEmail} />
          : <UiText style={styles.answer}>{t("publicInfo.contactUnavailable")}</UiText>}
      </Card>
    </> : <Card style={styles.legalCard}>
      <Chip label={t("publicInfo.legalPlaceholder")} tone="apricot" />
      <UiText style={styles.legalBody}>{t("publicInfo.legalBody")}</UiText>
    </Card>}
    <View style={styles.actions}>
      <Button label={t("publicInfo.home")} variant="primary" onPress={() => onOpen("/")} />
      {!help ? <Button label={t("publicInfo.seeHelp")} onPress={() => onOpen("/help")} /> : null}
    </View>
  </View>;
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxl },
  eyebrow: { color: colors.ink3Text, fontSize: typography.label, fontWeight: "500" },
  title: { color: colors.ink, fontSize: typography.title, fontWeight: "900", lineHeight: 32, marginTop: spacing.sm },
  intro: { color: colors.ink2, fontSize: typography.bodySm, marginTop: spacing.xs },
  search: { minHeight: 44, borderRadius: radius.pill, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, marginTop: 20, marginBottom: spacing.lg },
  searchInput: { flex: 1, color: colors.ink, fontSize: typography.bodySm, paddingVertical: spacing.sm },
  faqCard: { marginTop: 0 },
  faqRow: { borderTopWidth: 1, borderTopColor: colors.line, paddingVertical: 6 },
  cardTitle: { color: colors.ink, fontSize: 16, fontWeight: "700" },
  answer: { color: colors.ink2, fontSize: typography.bodySm, lineHeight: 22, marginTop: spacing.sm },
  contactCard: { marginTop: spacing.md, gap: spacing.xs },
  legalCard: { marginTop: spacing.xl, gap: spacing.md, padding: 22 },
  legalBody: { color: colors.ink2, fontSize: typography.bodySm, lineHeight: 24 },
  actions: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.sm, marginTop: 22 },
}));
