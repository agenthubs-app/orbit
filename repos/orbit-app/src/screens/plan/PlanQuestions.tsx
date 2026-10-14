// R23 ③ ≤5 問 and 確定した前提. Questions come from the goal type's question bank
// (texts from plan-template-copy); a guess is pre-selected and marked 「推測」.
// Choosing options and typing never sends anything: 「まとめて回答する」 sends all
// answers once. The premise rows edit in place (PATCH …/premise); 「この前提で初版を
// つくる」 asks for the first draft (not counted against the AI revisions).
import { useMemo, useState, type ReactNode } from "react";
import { StyleSheet, TextInput, View } from "react-native";

import type { PlanGoalKind, PlanIntakeView, PlanPremiseRow } from "../../api/contract/plan-v2";
import { PLAN_GOAL_KIND_COPY, PLAN_QUESTION_COPY, planCopy } from "../../api/compute/plan-template-copy";
import { PLAN_GOAL_TEMPLATES } from "../../api/compute/plan-templates";
import { Button, ConfirmDialog, Icon, UiPressable, UiText } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { useStandardCopy } from "../../i18n/standard-copy";
import type { PlanApi, PlanFailure } from "./plan-api";
import { newIdempotencyKey } from "./plan-model";
import { ChoiceChip, FailureNote } from "./plan-ui";
import { KitButton, KitCard, KitChip, KitEmo, kitText, useKitStyles, useKitWhy } from "./plan-kit";
import { Bubble, ChatMark } from "./plan-flow-kit";

type AnswerDraft = { values: string[]; text: string; touched: boolean };

export function PlanQuestions({ intake, kind, api, onIntake, onReload }: { intake: PlanIntakeView; kind: PlanGoalKind; api: PlanApi; onIntake: (intake: PlanIntakeView) => void; onReload: () => void }) {
  const { styles, colors } = useStyles();
  const kit = useKitStyles().styles;
  const { t, language } = useOrbitLocale();
  const questions = intake.questions ?? [];
  const [answers, setAnswers] = useState<Record<string, AnswerDraft>>(() => Object.fromEntries(questions.map((question) => [question.id, { text: question.guess?.text ?? "", touched: false, values: [...(question.guess?.values ?? [])] }])));
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<PlanFailure | null>(null);
  const why = questions.map((question) => `${question.id}：${question.why}`).join("\n");
  const whyBox = useKitWhy(why || null);

  const choose = (id: string, value: string, multi: boolean) => setAnswers((current) => {
    const answer = current[id] ?? { text: "", touched: false, values: [] };
    const values = multi ? (answer.values.includes(value) ? answer.values.filter((item) => item !== value) : [...answer.values, value]) : answer.values[0] === value && answer.touched ? [] : [value];
    return { ...current, [id]: { ...answer, touched: true, values } };
  });

  const submit = async () => {
    if (sending) return;
    setSending(true);
    setFailure(null);
    const result = await api.answers(intake.intakeId, questions.map((question) => {
      const answer = answers[question.id];
      return { questionId: question.id, text: answer?.text.trim() ? answer.text.trim() : null, values: answer?.values ?? [] };
    }), newIdempotencyKey("answers"));
    setSending(false);
    if (result.ok) onIntake(result.data);
    else setFailure(result.failure);
  };

  return (
    <>
      <Bubble>{t("plan.questions.bubble", { count: questions.length })}</Bubble>
      <ChatMark />
      <KitCard style={styles.qcard} testID="flow-questions">
        <View accessibilityLabel={t("plan.questions.title", { count: questions.length })} style={styles.row8}>
          <UiText accessibilityRole="header" style={styles.qTitle}>{t("plan.questions.title", { count: questions.length })}</UiText>
          <KitChip label={t("plan.questions.bank", { kind: planCopy(PLAN_GOAL_KIND_COPY[kind], language) })} />
          {whyBox.button}
        </View>
        {whyBox.body}
        {questions.map((question, index) => {
          const template = PLAN_GOAL_TEMPLATES[kind].questions.find((item) => item.id === question.id);
          const qcopy = PLAN_QUESTION_COPY[question.id];
          if (!template || !qcopy) return null;
          const answer = answers[question.id] ?? { text: "", touched: false, values: [] };
          const multi = template.type === "multi";
          return (
            <View key={question.id} accessibilityLabel={planCopy(qcopy.prompt, language)} style={[styles.qb, index > 0 && styles.line]}>
              <View style={styles.row8}>
                <View style={styles.qno}><UiText style={styles.qnoText}>{String(index + 1)}</UiText></View>
                <UiText style={styles.qPrompt}>{planCopy(qcopy.prompt, language)}</UiText>
                <View style={styles.qid}><UiText style={styles.qidText}>{`${question.id} ${planCopy(qcopy.topic, language)}`}</UiText></View>
              </View>
              <View accessibilityRole={multi ? undefined : "radiogroup"} accessibilityLabel={planCopy(qcopy.prompt, language)} style={styles.opts}>
                {template.options.map((option) => {
                  const text = qcopy.options[option] ? planCopy(qcopy.options[option]!, language) : option;
                  const on = answer.values.includes(option);
                  return (
                    <UiPressable key={option} accessibilityRole={multi ? "checkbox" : "radio"} accessibilityState={{ checked: on, selected: on }} aria-checked={on} hitSlop={6} onPress={() => choose(question.id, option, multi)} style={[styles.fopt, on && styles.foptOn]}>
                      {on ? <UiText style={styles.foptCheck}>✓</UiText> : null}
                      <UiText style={[styles.foptText, on && styles.foptTextOn]}>{text}</UiText>
                    </UiPressable>
                  );
                })}
              </View>
              <View style={styles.qin}>
                <Icon name="pen" size={16} color={colors.ink3} />
                <TextInput
                  accessibilityLabel={t("plan.questions.freeLabel", { number: index + 1 })}
                  onChangeText={(text) => setAnswers((current) => ({ ...current, [question.id]: { ...answer, text, touched: true } }))}
                  placeholder={t("plan.questions.freePlaceholder")}
                  placeholderTextColor={colors.ink4}
                  selectionColor={colors.plum700}
                  style={styles.qinInput}
                  value={answer.text}
                />
              </View>
            </View>
          );
        })}
        {failure ? <FailureNote failure={failure} onReload={() => { setFailure(null); onReload(); }} /> : null}
        <KitButton primary label={t("plan.questions.submit", { count: questions.length })} disabled={sending} onPress={() => void submit()} style={styles.send} testID="questions-send" />
        <UiText style={[kit.lbl, styles.center, styles.note]}>{t("plan.questions.note")}</UiText>
      </KitCard>
    </>
  );
}

/** 折叠后的 chip 只写第一段（「 · 」或「（」之前），同 b10 ④ premc。 */
export function shortPremise(value: string): string {
  return value.split(/\s·\s|（/u)[0]!.trim() || value;
}

const SOURCE_LABEL: Record<PlanPremiseRow["source"], string> = { background: "", q1: "Q1", q2: "Q2", q3: "Q3", q4: "Q4", q5: "Q5", record: "" };

/** 「確定した前提」. With a draft it starts folded (「すべて見る」); with AI revisions a change asks first. */
export function PlanPremiseCard({ intake, kind, api, onIntake, onReload, hasDraft, hasRevisions = false, draftAction }: {
  intake: PlanIntakeView;
  kind: PlanGoalKind;
  api: PlanApi;
  onIntake: (intake: PlanIntakeView) => void;
  onReload: () => void;
  hasDraft: boolean;
  /** The draft has AI revisions: changing a premise discards them, so ask first (m16). */
  hasRevisions?: boolean;
  draftAction?: ReactNode;
}) {
  const { styles, colors } = useStyles();
  const kit = useKitStyles().styles;
  const { t, language } = useOrbitLocale();
  const copy = useStandardCopy();
  const rows = intake.premise ?? [];
  const [expanded, setExpanded] = useState(!hasDraft);
  const [editing, setEditing] = useState<string | null>(null);
  const [option, setOption] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<PlanFailure | null>(null);
  const [confirmRedo, setConfirmRedo] = useState<string | null>(null);
  const open = hasDraft ? expanded : true;

  const sourceLabel = (row: PlanPremiseRow) => (row.source === "background" ? t("plan.premise.sourceBackground") : row.source === "record" ? t("plan.premise.sourceRecord") : SOURCE_LABEL[row.source]);

  const startEdit = (row: PlanPremiseRow) => {
    if (hasRevisions && confirmRedo !== row.key) {
      setConfirmRedo(row.key);
      return;
    }
    setEditing(row.key);
    setOption(null);
    setText(row.guessed ? "" : row.value);
    setFailure(null);
  };

  const options = useMemo(() => {
    if (!editing) return [];
    const template = PLAN_GOAL_TEMPLATES[kind].questions.find((item) => item.id === editing);
    const copy = PLAN_QUESTION_COPY[editing];
    return template && copy ? template.options.map((id) => ({ id, label: copy.options[id] ? planCopy(copy.options[id]!, language) : id })) : [];
  }, [editing, kind, language]);

  const save = async () => {
    if (!editing) return;
    const chosen = options.find((item) => item.id === option)?.label ?? null;
    const value = [chosen, text.trim() || null].filter(Boolean).join(" · ");
    if (!value) return;
    setSaving(true);
    setFailure(null);
    const result = await api.premise(intake.intakeId, editing, value, newIdempotencyKey("premise"));
    setSaving(false);
    if (!result.ok) return setFailure(result.failure);
    setEditing(null);
    onIntake(result.data);
  };

  const circled = ["①", "②", "③", "④", "⑤", "⑥"];
  const answered = rows.filter((row) => row.source !== "background" && row.source !== "record").map((row, index) => `${circled[index] ?? `${index + 1}.`} ${row.value}`).join(" ");
  return (
    <>
      {hasDraft && !hasRevisions ? <ChatMark scroll /> : null}
      {answered ? <Bubble me>{answered}</Bubble> : null}
      {!hasDraft ? <><ChatMark /><Bubble>{t("plan.premise.bubble")}</Bubble></> : null}
      <KitCard style={styles.premCard} testID="flow-premise">
        <View accessibilityLabel={t("plan.premise.title")} style={styles.premHead}>
          <KitEmo emoji="📌" tone="teal" sm />
          <UiText accessibilityRole="header" style={styles.premTitle}>{t("plan.premise.title")}</UiText>
          {open && !hasDraft ? <UiText style={kit.lbl}>{t("plan.premise.hint")}</UiText> : null}
          {hasDraft && open ? <Button label={t("plan.premise.collapse")} onPress={() => setExpanded(false)} size="sm" variant="ghost" /> : null}
        </View>
        {!open ? (
          <View style={styles.premc}>
            {rows.slice(0, 6).map((row) => <KitChip key={row.key} label={`${row.label}：${shortPremise(row.value)}`} />)}
            <UiPressable accessibilityRole="button" hitSlop={8} onPress={() => setExpanded(true)} style={styles.v2go}>
              <UiText style={styles.v2goText}>{t("plan.premise.showAll")}</UiText>
              <Icon name="down" size={16} color={colors.ink2} />
            </UiPressable>
          </View>
        ) : (
          rows.map((row, index) => (
            <View key={row.key}>
              <UiPressable accessibilityRole="button" accessibilityLabel={t("plan.premise.editRow", { label: row.label })} onPress={() => startEdit(row)} style={[styles.prem, index > 0 && styles.line]}>
                <UiText style={[kit.lbl, styles.premLabel]}>{row.label}</UiText>
                <UiText style={styles.premValue}>{row.value}</UiText>
                <View style={styles.premTags}>
                  {sourceLabel(row) ? <View style={styles.src}><UiText style={styles.srcText}>{sourceLabel(row)}</UiText></View> : null}
                  {row.guessed ? <View style={styles.src}><UiText style={styles.srcText}>{t("plan.common.guessed")}</UiText></View> : null}
                </View>
              </UiPressable>
              {editing === row.key ? (
                <View style={styles.editBox}>
                  {options.length ? (
                    <View accessibilityRole="radiogroup" accessibilityLabel={row.label} style={styles.opts}>
                      {options.map((item) => <ChoiceChip key={item.id} label={item.label} selected={option === item.id} onPress={() => setOption(option === item.id ? null : item.id)} />)}
                    </View>
                  ) : null}
                  <TextInput accessibilityLabel={t("plan.premise.valueLabel", { label: row.label })} onChangeText={setText} placeholder={t("plan.questions.freePlaceholder")} placeholderTextColor={colors.ink4} style={styles.editInput} value={text} />
                  <View style={styles.row8}>
                    <Button label={t("plan.premise.save")} disabled={!option && !text.trim()} loading={saving} onPress={() => void save()} size="sm" variant="primary" />
                    <Button label={copy.action.cancel} onPress={() => setEditing(null)} size="sm" variant="ghost" />
                  </View>
                </View>
              ) : null}
            </View>
          ))
        )}
        {failure ? <FailureNote failure={failure} onReload={() => { setFailure(null); onReload(); }} /> : null}
        {draftAction}
        <ConfirmDialog
          visible={confirmRedo !== null && editing === null}
          title={t("plan.premise.redoTitle")}
          message={t("plan.premise.redoBody")}
          confirmLabel={t("plan.premise.redoConfirm")}
          onCancel={() => setConfirmRedo(null)}
          onConfirm={() => {
            const row = rows.find((item) => item.key === confirmRedo);
            if (row) startEdit(row);
          }}
        />
      </KitCard>
    </>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  center: { textAlign: "center" },
  row8: { flexDirection: "row", alignItems: "center", gap: 8 },
  line: { borderTopWidth: 1, borderTopColor: colors.line },
  qcard: { paddingVertical: 14, paddingHorizontal: 16 },
  qTitle: { flex: 1, color: colors.ink, ...kitText(14, "700") },
  qb: { paddingVertical: 10 },
  qno: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" },
  qnoText: { color: colors.bg, ...kitText(11.5, "800") },
  qPrompt: { flex: 1, minWidth: 0, color: colors.ink, ...kitText(13.5, "700", 1.45) },
  qid: { backgroundColor: colors.surface2, borderRadius: 6, paddingVertical: 1, paddingHorizontal: 6 },
  qidText: { color: colors.ink3, ...kitText(10, "800") },
  opts: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  fopt: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 4, paddingHorizontal: 9, borderRadius: 999, backgroundColor: colors.surface2, borderWidth: 1.5, borderColor: "transparent" },
  foptOn: { borderColor: colors.plum500, backgroundColor: colors.accentSoft },
  foptCheck: { color: colors.plum700, ...kitText(11.5, "900") },
  foptText: { color: colors.ink2, ...kitText(11.5, "700") },
  foptTextOn: { color: colors.ink },
  qin: { marginTop: 8, height: 38, borderRadius: 12, backgroundColor: colors.surface2, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12 },
  qinInput: { flex: 1, minWidth: 0, color: colors.ink, fontSize: 12.5, padding: 0 },
  send: { marginTop: 12, alignSelf: "stretch" },
  note: { marginTop: 6 },
  premCard: { paddingVertical: 12, paddingHorizontal: 16 },
  premHead: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2, marginBottom: 4 },
  premTitle: { flex: 1, color: colors.ink, ...kitText(14, "700") },
  prem: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 8 },
  premLabel: { width: 84, lineHeight: 19.38 },
  premValue: { flex: 1, minWidth: 0, color: colors.ink, ...kitText(12.5, "400", 1.55) },
  premTags: { alignItems: "flex-end", gap: 4 },
  src: { backgroundColor: colors.surface2, borderRadius: 6, paddingVertical: 1, paddingHorizontal: 6 },
  srcText: { color: colors.ink3, ...kitText(10, "800") },
  premc: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6, alignItems: "center" },
  v2go: { flexDirection: "row", alignItems: "center", gap: 4 },
  v2goText: { color: colors.ink2, ...kitText(12, "700") },
  editBox: { gap: 8, padding: 12, borderRadius: 14, backgroundColor: colors.surface2, marginBottom: 8 },
  editInput: { minHeight: 40, borderRadius: 12, backgroundColor: colors.surface, paddingHorizontal: 12, color: colors.ink, fontSize: 13 },
}));
