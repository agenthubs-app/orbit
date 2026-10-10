// R23 ④⑤ the plan card (初版 / after revisions), each revision's diff card and the
// AI-fix bar fixed above the keyboard. Citations are collapsed on the App (UI-SPEC).
import { Linking, StyleSheet, TextInput, View } from "react-native";

import type { PlanDraftTurn, PlanDraftView } from "../../api/contract/plan-v2";
import { Accordion, Button, IconButton, UiPressable, UiText, WhyDisclosure } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { PLAN_EVENT_EMOJI, stepTypeChips, typeLetters } from "./plan-model";
import { Tag, usePlanStyles } from "./plan-ui";

export function PlanDraftCard({ draft }: { draft: PlanDraftView }) {
  const shared = usePlanStyles().styles;
  const { styles } = useStyles();
  const { t } = useOrbitLocale();
  const { content } = draft;
  const letters = typeLetters(content.personTypes);
  const basis = content.basis.map((item) => item.label).join("\n");
  return (
    <View accessibilityLabel={t("plan.draft.eyebrow")} style={shared.card}>
      <View style={shared.row}>
        <UiText style={shared.emoji}>🧭</UiText>
        <View style={shared.grow}>
          <UiText style={shared.caption}>{t("plan.draft.eyebrow")}</UiText>
          <UiText accessibilityRole="header" style={shared.heading}>{draft.purposeText ?? draft.goal}</UiText>
        </View>
      </View>
      {basis ? <WhyDisclosure reason={basis} /> : null}
      <View style={styles.section}>
        <UiText style={shared.label}>{t("plan.draft.diagnosis")}</UiText>
        <UiText style={shared.body}>{content.diagnosis}</UiText>
      </View>
      <View style={shared.conclusion}>
        <UiText style={shared.label}>{t("plan.draft.conclusion")}</UiText>
        <UiText style={shared.conclusionText}>{content.conclusion}</UiText>
        {content.flow && content.flow.length > 0 ? (
          <View style={styles.flow}>
            {content.flow.map((cell, index) => (
              <View key={`${cell.label}-${index}`} style={styles.flowCell}>
                <UiText style={shared.emoji}>{cell.emoji}</UiText>
                <UiText style={shared.title}>{cell.label}</UiText>
                <UiText style={shared.caption}>{cell.note}</UiText>
              </View>
            ))}
          </View>
        ) : null}
      </View>
      <View style={styles.section}>
        <UiText style={shared.label}>{t("plan.draft.steps")}</UiText>
        {content.steps.map((step, index) => (
          <View key={step.key} style={shared.rowTop}>
            <View style={shared.number}><UiText style={shared.numberText}>{index + 1}</UiText></View>
            <View style={[shared.grow, styles.stepBody]}>
              <UiText style={shared.title}>{step.title}</UiText>
              {step.doneCriteria ? <UiText style={shared.body2}>{t("plan.draft.doneCriteria", { text: step.doneCriteria })}</UiText> : null}
              <View style={shared.wrap}>{stepTypeChips(step.personTypeKeys, content.personTypes).map((chip) => <Tag key={chip} label={chip} />)}</View>
            </View>
          </View>
        ))}
      </View>
      <View style={styles.section}>
        <UiText style={shared.label}>{t("plan.draft.types")}</UiText>
        {content.allocationReasons.length ? <WhyDisclosure reason={content.allocationReasons.join("\n")} /> : null}
        {content.personTypes.map((type) => (
          <View key={type.key} style={shared.rowTop}>
            <UiText style={shared.emoji}>{type.emoji}</UiText>
            <View style={shared.grow}>
              <UiText style={shared.title}>{`${letters.get(type.key)} ${type.shortLabel}`}</UiText>
              <UiText style={shared.body2}>{type.roleSituation}</UiText>
            </View>
            <UiText style={styles.points}>{t("plan.draft.typePoints", { count: type.targetCount, points: type.allocation })}</UiText>
          </View>
        ))}
        <View style={shared.rowTop}>
          <UiText style={shared.emoji}>{PLAN_EVENT_EMOJI}</UiText>
          <UiText style={[shared.title, shared.grow]}>{t("plan.draft.event")}</UiText>
          <UiText style={styles.points}>{t("plan.draft.eventPoints", { count: content.event.targetCount, points: content.event.allocation })}</UiText>
        </View>
      </View>
      {draft.citations.length ? (
        <Accordion title={t("plan.draft.citations", { count: draft.citations.length })}>
          <View style={styles.citations}>
            {draft.citations.map((citation, index) => (
              <View key={`${citation.id}@${citation.version}`} style={shared.softCard}>
                <View style={shared.row}>
                  <View style={shared.number}><UiText style={shared.numberText}>{index + 1}</UiText></View>
                  <UiText style={[shared.title, shared.grow]}>{citation.title}</UiText>
                </View>
                <UiText style={shared.body2}>{citation.summary}</UiText>
                <View style={shared.wrap}>
                  <Tag label={citation.id} />
                  <Tag label={t("plan.draft.citationVersion", { date: citation.updatedOn, version: citation.version })} />
                </View>
                <UiPressable accessibilityRole="link" onPress={() => void Linking.openURL(citation.sourceUrl)}>
                  <UiText style={styles.link}>{t("plan.draft.citationSource", { label: citation.sourceLabel })}</UiText>
                </UiPressable>
              </View>
            ))}
            <UiText style={shared.caption}>{t("plan.draft.citationNote")}</UiText>
          </View>
        </Accordion>
      ) : null}
    </View>
  );
}

/** One revision: the user's words on the right, then only what changed. */
export function PlanTurn({ turn, limit }: { turn: PlanDraftTurn; limit: number }) {
  const shared = usePlanStyles().styles;
  const { styles } = useStyles();
  const { t } = useOrbitLocale();
  const changed = turn.changes.length > 0 && !turn.noChangeReason;
  return (
    <View style={styles.turn}>
      <View style={shared.bubble}><UiText style={shared.bubbleText}>{turn.input}</UiText></View>
      <View accessibilityLabel={t("plan.turn.title", { limit, n: turn.n })} style={shared.card}>
        <View style={shared.row}>
          <UiText style={shared.emoji}>🧭</UiText>
          <View style={shared.grow}>
            <UiText style={shared.title}>{t("plan.turn.title", { limit, n: turn.n })}</UiText>
            <UiText style={shared.caption}>{changed ? t("plan.turn.updated") : t("plan.turn.unchangedTitle")}</UiText>
          </View>
        </View>
        {changed ? turn.changes.map((change) => (
          <View key={change.path} style={styles.change}>
            <View style={shared.row}><Tag label={t("plan.turn.changed")} tone="accent" /><UiText style={shared.label}>{change.label}</UiText></View>
            {change.before ? <UiText style={shared.strike}>{change.before}</UiText> : null}
            {change.after ? <UiText style={shared.after}>{change.after}</UiText> : null}
          </View>
        )) : <UiText style={shared.body2}>{turn.noChangeReason ?? t("plan.turn.unchangedTitle")}</UiText>}
        {turn.unchanged.length ? <UiText style={shared.caption}>{t("plan.turn.unchanged", { items: turn.unchanged.join(" · ") })}</UiText> : null}
      </View>
    </View>
  );
}

/**
 * The AI-fix bar (fixed above the input): 「AI 修正 あと N 回」, the hint and example,
 * the field, and the two ways out. At 0 the field is disabled.
 */
export function PlanFixBar({ draft, text, onText, onSend, sending, onManual, onConfirm, confirming }: {
  draft: PlanDraftView;
  text: string;
  onText: (text: string) => void;
  onSend: () => void;
  sending: boolean;
  onManual: () => void;
  onConfirm: () => void;
  confirming: boolean;
}) {
  const shared = usePlanStyles().styles;
  const { styles, colors } = useStyles();
  const { t } = useOrbitLocale();
  const left = Math.max(0, draft.aiFixLimit - draft.aiFixUsed);
  const out = left === 0;
  return (
    <View style={styles.bar}>
      <View style={shared.row}>
        <UiText style={shared.label}>{t("plan.fix.label")}</UiText>
        <UiText accessibilityLabel={t("plan.fix.leftLabel", { count: left })} style={[shared.bigNumber, out && shared.bigNumberOut]}>{t("plan.fix.left", { count: left })}</UiText>
        <UiText style={[shared.caption, shared.grow]}>{out ? t("plan.fix.countsNoChange") : t("plan.fix.firstFree")}</UiText>
      </View>
      {out ? <UiText style={shared.body2}>{t("plan.fix.usedUp")}</UiText> : (
        <>
          <UiText style={shared.caption}>{t("plan.fix.hint")}</UiText>
          <UiText numberOfLines={2} style={shared.caption}>{t("plan.fix.example")}</UiText>
        </>
      )}
      <View style={shared.row}>
        <TextInput
          accessibilityLabel={t("plan.fix.inputLabel")}
          editable={!out && !sending}
          multiline
          onChangeText={onText}
          placeholder={out ? t("plan.fix.usedUpShort") : t("plan.fix.placeholder")}
          placeholderTextColor={colors.ink3Text}
          style={[shared.input, shared.grow, styles.field, out && styles.fieldOff]}
          value={text}
        />
        <IconButton icon="up" accessibilityLabel={t("plan.fix.send")} disabled={out || sending || !text.trim()} onPress={onSend} />
      </View>
      <View style={shared.footerRow}>
        <Button disabled={!draft.manualEditAvailable} label={t("plan.fix.manual")} onPress={onManual} size="sm" variant="secondary" />
        <Button label={t("plan.fix.confirm")} loading={confirming} onPress={onConfirm} size="sm" variant="primary" />
      </View>
    </View>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  section: { gap: 8 },
  flow: { flexDirection: "row", gap: 6, marginTop: 4 },
  flowCell: { flex: 1, backgroundColor: colors.surface, borderRadius: 12, padding: 8, gap: 2, alignItems: "center" },
  stepBody: { gap: 4 },
  points: { color: colors.ink, fontSize: 12.5, fontWeight: "800" },
  citations: { gap: 8 },
  link: { color: colors.accentText, fontSize: 12, textDecorationLine: "underline" },
  turn: { gap: 8 },
  change: { gap: 4, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.line },
  bar: { gap: 6 },
  field: { maxHeight: 96 },
  fieldOff: { backgroundColor: colors.surface2 },
}));
