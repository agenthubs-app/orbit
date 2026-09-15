import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { layout, radius, spacing, textStyles, type OrbitColors } from "../../design/tokens";
import { useOrbitTheme } from "../../design/theme";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import type { ContactNeedMatchView, ContactNeedsView } from "../../view-models/contact-needs";
import { contactAvatarFor, type ContactAvatarTone } from "../../view-models/contacts";
import { ErrorState } from "../../components/ErrorState";

const criterionMessageKeys = {
  "location:japan": "contacts.needCriterion.locationJapan",
  "location:united-states": "contacts.needCriterion.locationUnitedStates",
  "location:china": "contacts.needCriterion.locationChina",
  "location:tokyo": "contacts.needCriterion.locationTokyo",
  "industry:manufacturing_supply_chain": "contacts.needCriterion.manufacturingSupplyChain",
  "industry:technology_internet": "contacts.needCriterion.technologyInternet",
  "industry:finance_investment": "contacts.needCriterion.financeInvestment",
  "industry:trade_logistics": "contacts.needCriterion.tradeLogistics",
  "industry:professional_services": "contacts.needCriterion.professionalServices",
  "industry:retail_consumer": "contacts.needCriterion.retailConsumer",
  "industry:healthcare_life_sciences": "contacts.needCriterion.healthcareLifeSciences",
  "industry:education_research": "contacts.needCriterion.educationResearch",
  "industry:media_creative": "contacts.needCriterion.mediaCreative",
  "capability:procurement": "contacts.needCriterion.procurement",
  "capability:investment": "contacts.needCriterion.investment",
  "capability:sales": "contacts.needCriterion.sales",
  "capability:partnership": "contacts.needCriterion.partnership",
} as const;

const missingFieldMessageKeys = {
  capability: "contacts.needFieldCapability",
  industry: "contacts.needFieldIndustry",
  keyword: "contacts.needFieldKeyword",
  location: "contacts.needFieldLocation",
} as const;

function avatarColors(tone: ContactAvatarTone, colors: OrbitColors): { backgroundColor: string; color: string } {
  return {
    amber: { backgroundColor: colors.amberSoft, color: colors.amber },
    emerald: { backgroundColor: colors.liveSoft, color: colors.live },
    rose: { backgroundColor: colors.roseSoft, color: colors.rose },
    sky: { backgroundColor: colors.skySoft, color: colors.sky },
    violet: { backgroundColor: colors.accentSofter, color: colors.accent },
  }[tone];
}

export function ContactNeedsMatchesContent({ error, onEdit, onOpenContact, onRetry, refreshing, view }: {
  error: string | null;
  onEdit(): void;
  onOpenContact(id: string): void;
  onRetry(): void;
  refreshing: boolean;
  view: ContactNeedsView;
}) {
  const locale = useOrbitLocale();
  const { colors } = useOrbitTheme();
  const [expanded, setExpanded] = useState<string | null>(null);

  function criterionLabel(criterion: { id: string; label: string }): string {
    const key = criterionMessageKeys[criterion.id as keyof typeof criterionMessageKeys];
    return key ? locale.t(key) : criterion.label;
  }

  function matchReason(item: ContactNeedMatchView): string {
    if (item.status === "insufficient_data") {
      const fields = item.missingFields
        .map((field) => missingFieldMessageKeys[field as keyof typeof missingFieldMessageKeys])
        .filter((key): key is (typeof missingFieldMessageKeys)[keyof typeof missingFieldMessageKeys] => Boolean(key))
        .map((key) => locale.t(key));
      return fields.length > 0
        ? locale.t("contacts.needMissingFields", { fields: fields.join(locale.t("contacts.needCriterionSeparator")) })
        : locale.t("contacts.needMissingReason");
    }
    if (item.status === "no_match") return locale.t("contacts.needNoMatchReason");
    return locale.t("contacts.needMatchedReason", {
      labels: item.matchedCriteria.map(criterionLabel).join(locale.t("contacts.needCriterionSeparator")),
    });
  }

  if (view.state !== "ready") {
    const needsGoal = view.state === "unconfigured";
    return (
      <View style={styles.empty}>
        <Text style={[styles.emptyText, { color: colors.text2 }]}>{locale.t(needsGoal ? "contacts.needEmpty" : "contacts.needClarify")}</Text>
        <Pressable accessibilityLabel={locale.t(needsGoal ? "contacts.needFill" : "contacts.needEdit")} accessibilityRole="button" onPress={onEdit} style={[styles.primaryButton, { backgroundColor: colors.ink }]}>
          <Text style={[styles.primaryButtonText, { color: colors.bg }]}>{locale.t(needsGoal ? "contacts.needFill" : "contacts.needEdit")}</Text>
        </Pressable>
      </View>
    );
  }

  const row = (item: ContactNeedMatchView) => {
    const avatar = contactAvatarFor({ id: item.contactId, name: item.displayName });
    const avatarStyle = avatarColors(avatar.tone, colors);
    return <View key={item.contactId} style={[styles.row, { borderBottomColor: colors.hairline }]}>
      <Pressable accessibilityLabel={locale.t("contacts.needOpenContact", { name: item.displayName })} accessibilityRole="button" onPress={() => onOpenContact(item.contactId)} style={styles.rowMain}>
        <View style={[styles.avatar, { backgroundColor: avatarStyle.backgroundColor }]}><Text style={[styles.avatarText, { color: avatarStyle.color }]}>{avatar.initial}</Text></View>
        <View style={styles.rowCopy}>
          <Text style={[styles.name, { color: colors.ink }]}>{item.displayName}</Text>
          <Text style={[styles.detail, { color: colors.text3 }]}>{[item.role, item.organization].filter(Boolean).join(" · ") || locale.t("contacts.needMissingProfile")}</Text>
          <Text style={[styles.reason, { color: colors.text2 }]}>{matchReason(item)}</Text>
        </View>
        <View style={styles.score}><Text style={[styles.scoreLabel, { color: colors.text3 }]}>{locale.t("contacts.needScore")}</Text><Text style={[styles.scoreValue, { color: item.score === null ? colors.text3 : colors.accent }]}>{item.score === null ? locale.t("contacts.needPendingScore") : locale.t("contacts.needScoreValue", { score: item.score })}</Text></View>
        <Ionicons color={colors.text4} name="chevron-forward" size={16} />
      </Pressable>
      <Pressable accessibilityLabel={locale.t("contacts.needEvidenceFor", { name: item.displayName })} accessibilityRole="button" onPress={() => setExpanded((current) => current === item.contactId ? null : item.contactId)} style={styles.evidenceButton}>
        <Text style={[styles.evidenceButtonText, { color: colors.accent }]}>{locale.t("contacts.needEvidence")}</Text>
      </Pressable>
      {expanded === item.contactId ? (
        <View style={[styles.evidence, { backgroundColor: colors.surface2 }]}>
          {item.evidence.length ? item.evidence.map((evidence) => (
            <Text key={evidence.id} style={[styles.evidenceText, { color: colors.text2 }]}>
              {locale.t("contacts.needEvidenceLine", { label: criterionLabel(evidence), excerpt: evidence.excerpt })}
            </Text>
          )) : <Text style={[styles.evidenceText, { color: colors.text2 }]}>{matchReason(item)}</Text>}
          {item.unmatchedCriteria.length > 0 ? (
            <Text style={[styles.evidenceText, { color: colors.text2 }]}>
              {locale.t("contacts.needUnmatchedCriteria", {
                labels: item.unmatchedCriteria.map(criterionLabel).join(locale.t("contacts.needCriterionSeparator")),
              })}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>;
  };

  return (
    <>
      <View style={[styles.goalCard, { backgroundColor: colors.surface2 }]}>
        <View style={styles.goalCopy}><Text style={[styles.caption, { color: colors.text3 }]}>{locale.t("contacts.currentNeed")}</Text><Text style={[styles.goal, { color: colors.ink }]}>{view.goal}</Text></View>
        <Pressable accessibilityLabel={locale.t("contacts.needEdit")} accessibilityRole="button" onPress={onEdit} style={styles.editAction}><Text style={[styles.edit, { color: colors.accent }]}>{locale.t("contacts.needEdit")}</Text></Pressable>
      </View>
      <Text style={[styles.explanation, { color: colors.text3 }]}>{locale.t("contacts.needRankingExplanation")}</Text>
      {error ? <ErrorState message={error} title={locale.t("contacts.needLoadFailed")} /> : null}
      {refreshing ? <Text style={[styles.caption, { color: colors.text3 }]}>{locale.t("common.loading")}</Text> : null}
      <View>{view.scored.map(row)}</View>
      {view.insufficient.length > 0 ? (
        <><Text accessibilityRole="header" style={[styles.sectionLabel, { backgroundColor: colors.surface2, color: colors.text3 }]}>{locale.t("contacts.needInsufficient")}</Text><View>{view.insufficient.map(row)}</View></>
      ) : null}
      {error ? <Pressable accessibilityLabel={locale.t("common.retry")} accessibilityRole="button" onPress={onRetry} style={styles.editAction}><Text style={[styles.edit, { color: colors.accent }]}>{locale.t("common.retry")}</Text></Pressable> : null}
      <Text style={[styles.footnote, { color: colors.text3 }]}>{locale.t("contacts.needScoreFootnote")}</Text>
    </>
  );
}

const styles = StyleSheet.create({
  goalCard: { borderRadius: radius.md, flexDirection: "row", alignItems: "center", padding: spacing.lg },
  goalCopy: { flex: 1, minWidth: 0, paddingRight: spacing.md },
  caption: { ...textStyles.caption, fontWeight: "600" },
  goal: { ...textStyles.body, fontWeight: "600", marginTop: spacing.xs },
  edit: { ...textStyles.small, fontWeight: "700" },
  editAction: { minHeight: layout.control, justifyContent: "center" },
  explanation: { ...textStyles.body, marginVertical: spacing.lg },
  row: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: spacing.md },
  rowMain: { flexDirection: "row", alignItems: "center", minHeight: 65 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", marginRight: spacing.md },
  avatarText: { fontSize: 15, lineHeight: 20, fontWeight: "700" },
  rowCopy: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, lineHeight: 20, fontWeight: "700" },
  detail: { fontSize: 12, lineHeight: 17 },
  reason: { ...textStyles.small, marginTop: 2 },
  score: { alignItems: "flex-end", marginHorizontal: spacing.sm },
  scoreLabel: { ...textStyles.caption },
  scoreValue: { ...textStyles.section, marginTop: 1 },
  evidenceButton: { minHeight: layout.control, justifyContent: "center", marginLeft: 52 },
  evidenceButtonText: { ...textStyles.small, fontWeight: "700" },
  evidence: { borderRadius: radius.control, marginLeft: 52, padding: spacing.md },
  evidenceText: { ...textStyles.small, marginVertical: 1 },
  sectionLabel: { ...textStyles.small, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, marginTop: spacing.xl },
  footnote: { ...textStyles.caption, marginTop: spacing.xl },
  empty: { alignItems: "center", paddingVertical: spacing.xxl },
  emptyText: { ...textStyles.body, textAlign: "center" },
  primaryButton: { minHeight: layout.primaryControl, borderRadius: radius.md, alignItems: "center", justifyContent: "center", alignSelf: "stretch", marginTop: spacing.xl },
  primaryButtonText: { ...textStyles.body, fontWeight: "700" },
});
