import React, { useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";

import { Button, Card, Chip, Icon, UiPressable, UiText } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { radius, spacing, typography } from "../../design/tokens";
import type { OrbitTranslator } from "../../i18n/messages";
import { filterPublicFaq } from "../../view-models/public-faq-search";

export type PublicInfoKind = "help" | "terms" | "privacy";

const faqKeys = [
  { id: "send", question: "publicInfo.sendQuestion", answer: "publicInfo.sendAnswer", searchKeywords: "publicInfo.sendSearchKeywords" },
  { id: "gmail", question: "publicInfo.gmailQuestion", answer: "publicInfo.gmailAnswer", searchKeywords: "publicInfo.gmailSearchKeywords" },
  { id: "card", question: "publicInfo.cardQuestion", answer: "publicInfo.cardAnswer", searchKeywords: "publicInfo.cardSearchKeywords" },
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
    searchKeywords: t(searchKeywords).split("|"),
  })), query);

  return <View style={styles.content}>
    <UiText accessibilityRole="header" style={[styles.title, !help && styles.legalTitle]}>{title}</UiText>
    {help ? <>
      <UiText style={styles.intro}>{t("publicInfo.helpIntro")}</UiText>
      <View style={styles.search}>
        <Icon name="search" size={16} color={colors.ink3Text} />
        <TextInput
          accessibilityLabel={t("publicInfo.searchPlaceholder")}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
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
          <PublicFaqRow question={item.question} answer={item.answer} />
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
    {/* QA-D: the header back button already leaves; a second 「ホームへ」 button was redundant. */}
    {!help ? <View style={[styles.actions, styles.legalActions]}>
      <Button label={t("publicInfo.seeHelp")} onPress={() => onOpen("/help")} />
    </View> : null}
  </View>;
}

function PublicFaqRow({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  const { styles } = useStyles();
  return <View>
    <UiPressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((value) => !value)} pressedScale={0.99} style={styles.faqTrigger}>
      <UiText accessibilityElementsHidden style={styles.faqMarker}>{open ? "▼" : "▶"}</UiText>
      <UiText style={styles.faqQuestion}>{question}</UiText>
    </UiPressable>
    {open ? <UiText style={styles.answer}>{answer}</UiText> : null}
  </View>;
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  content: { paddingHorizontal: spacing.xl - spacing.xxs, paddingTop: spacing.sm, paddingBottom: spacing.xxl },
  eyebrow: { color: colors.ink3Text, fontSize: typography.label, fontWeight: "500" },
  title: { color: colors.ink, fontSize: typography.title, fontWeight: "700", lineHeight: 37, marginTop: spacing.sm },
  legalTitle: { marginTop: spacing.md },
  intro: { color: colors.ink2, fontSize: typography.bodySm, marginTop: spacing.xs },
  search: { minHeight: 44, borderRadius: radius.pill, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, marginTop: 30, marginBottom: spacing.lg },
  searchInput: { flex: 1, color: colors.ink, fontSize: typography.bodySm, paddingVertical: spacing.sm },
  faqCard: { marginTop: 0, paddingTop: spacing.xl, paddingBottom: spacing.md },
  faqRow: { borderTopWidth: 1, borderTopColor: colors.line, paddingVertical: spacing.xs },
  faqTrigger: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: spacing.xs },
  faqMarker: { color: colors.ink, fontSize: 13, width: 12 },
  faqQuestion: { color: colors.ink, fontSize: 17, fontWeight: "700", flexShrink: 1 },
  cardTitle: { color: colors.ink, fontSize: 18, fontWeight: "700" },
  answer: { color: colors.ink2, fontSize: typography.bodySm, lineHeight: 25, marginTop: spacing.sm },
  contactCard: { marginTop: spacing.md + spacing.xxs, gap: spacing.xs },
  legalCard: { marginTop: spacing.xl + spacing.xs, gap: spacing.md, padding: 22 },
  legalBody: { color: colors.ink2, fontSize: typography.bodySm, lineHeight: 28 },
  actions: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.lg + spacing.xxs },
  legalActions: { marginTop: spacing.xl - spacing.xxs },
}));
