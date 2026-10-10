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
import { Button, ConfirmDialog, UiPressable, UiText, WhyDisclosure } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { useStandardCopy } from "../../i18n/standard-copy";
import type { PlanApi, PlanFailure } from "./plan-api";
import { newIdempotencyKey } from "./plan-model";
import { ChoiceChip, InlineProblem, isLimitFailure, LimitNote, StaleNote, Tag, useFailureText, usePlanStyles } from "./plan-ui";

type AnswerDraft = { values: string[]; text: string; touched: boolean };

export function PlanQuestions({ intake, kind, api, onIntake, onReload }: { intake: PlanIntakeView; kind: PlanGoalKind; api: PlanApi; onIntake: (intake: PlanIntakeView) => void; onReload: () => void }) {
  const shared = usePlanStyles().styles;
  const { styles, colors } = useStyles();
  const { t, language } = useOrbitLocale();
  const failureText = useFailureText();
  const questions = intake.questions ?? [];
  const [answers, setAnswers] = useState<Record<string, AnswerDraft>>(() => Object.fromEntries(questions.map((question) => [question.id, { text: question.guess?.text ?? "", touched: false, values: [...(question.guess?.values ?? [])] }])));
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<PlanFailure | null>(null);
  const why = questions.map((question) => `${question.id}：${question.why}`).join("\n");

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
    <View accessibilityLabel={t("plan.questions.title", { count: questions.length })} style={shared.card}>
      <UiText accessibilityRole="header" style={shared.heading}>{t("plan.questions.title", { count: questions.length })}</UiText>
      <View style={shared.row}>
        <UiText style={[shared.caption, shared.grow]}>{t("plan.questions.bank", { kind: planCopy(PLAN_GOAL_KIND_COPY[kind], language) })}</UiText>
      </View>
      {why ? <WhyDisclosure reason={why} /> : null}
      {questions.map((question, index) => {
        const template = PLAN_GOAL_TEMPLATES[kind].questions.find((item) => item.id === question.id);
        const copy = PLAN_QUESTION_COPY[question.id];
        if (!template || !copy) return null;
        const answer = answers[question.id] ?? { text: "", touched: false, values: [] };
        const multi = template.type === "multi";
        const guessed = Boolean(question.guess) && !answer.touched;
        return (
          <View key={question.id} accessibilityLabel={planCopy(copy.prompt, language)} style={styles.question}>
            <View style={shared.rowTop}>
              <View style={shared.number}><UiText style={shared.numberText}>{index + 1}</UiText></View>
              <UiText style={[shared.title, shared.grow]}>{planCopy(copy.prompt, language)}</UiText>
              <Tag label={`${question.id} ${planCopy(copy.topic, language)}`} />
            </View>
            <View accessibilityRole={multi ? undefined : "radiogroup"} accessibilityLabel={planCopy(copy.prompt, language)} style={shared.wrap}>
              {template.options.map((option) => {
                const text = copy.options[option] ? planCopy(copy.options[option]!, language) : option;
                return <ChoiceChip key={option} accessibilityRole={multi ? "checkbox" : "radio"} guessed={guessed} label={text} selected={answer.values.includes(option)} onPress={() => choose(question.id, option, multi)} />;
              })}
            </View>
            <TextInput
              accessibilityLabel={t("plan.questions.freeLabel", { number: index + 1 })}
              onChangeText={(text) => setAnswers((current) => ({ ...current, [question.id]: { ...answer, text, touched: true } }))}
              placeholder={t("plan.questions.freePlaceholder")}
              placeholderTextColor={colors.ink3Text}
              style={shared.input}
              value={answer.text}
            />
          </View>
        );
      })}
      {failure ? failure.kind === "stale" ? <StaleNote onReload={onReload} /> : isLimitFailure(failure) ? <LimitNote failure={failure} /> : <InlineProblem text={failureText(failure)} /> : null}
      <Button block label={t("plan.questions.submit", { count: questions.length })} loading={sending} onPress={() => void submit()} variant="primary" />
      <UiText style={[shared.caption, styles.center]}>{t("plan.questions.note")}</UiText>
    </View>
  );
}

const SOURCE_LABEL: Record<PlanPremiseRow["source"], string> = { background: "", q1: "Q1", q2: "Q2", q3: "Q3", q4: "Q4", q5: "Q5", record: "" };

/** 「確定した前提」. `collapsed` (a draft exists): a one-line summary with 「すべて見る」. */
export function PlanPremiseCard({ intake, kind, api, onIntake, onReload, hasDraft, draftAction }: {
  intake: PlanIntakeView;
  kind: PlanGoalKind;
  api: PlanApi;
  onIntake: (intake: PlanIntakeView) => void;
  onReload: () => void;
  hasDraft: boolean;
  draftAction?: ReactNode;
}) {
  const shared = usePlanStyles().styles;
  const { styles, colors } = useStyles();
  const { t, language } = useOrbitLocale();
  const copy = useStandardCopy();
  const failureText = useFailureText();
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
    if (hasDraft && confirmRedo !== row.key) {
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

  return (
    <View accessibilityLabel={t("plan.premise.title")} style={shared.card}>
      <View style={shared.row}>
        <UiText style={shared.emoji}>📌</UiText>
        <UiText accessibilityRole="header" style={[shared.heading, shared.grow]}>{t("plan.premise.title")}</UiText>
        {hasDraft ? <Button label={open ? t("plan.premise.collapse") : t("plan.premise.showAll")} onPress={() => setExpanded(!open)} size="sm" variant="ghost" /> : null}
      </View>
      {!open ? (
        <View style={shared.wrap}>
          {rows.slice(0, 6).map((row) => <Tag key={row.key} label={`${row.label}：${row.value}`} />)}
        </View>
      ) : (
        <>
          <UiText style={shared.caption}>{t("plan.premise.hint")}</UiText>
          {rows.map((row) => (
            <View key={row.key}>
              <UiPressable accessibilityRole="button" accessibilityLabel={t("plan.premise.editRow", { label: row.label })} onPress={() => startEdit(row)} style={styles.premiseRow}>
                <UiText style={[shared.label, styles.premiseLabel]}>{row.label}</UiText>
                <UiText style={[shared.body, shared.grow]}>{row.value}</UiText>
                <View style={styles.premiseTags}>
                  <Tag label={sourceLabel(row)} />
                  {row.guessed ? <Tag label={t("plan.common.guessed")} tone="gap" /> : null}
                </View>
              </UiPressable>
              {editing === row.key ? (
                <View style={shared.softCard}>
                  {options.length ? (
                    <View accessibilityRole="radiogroup" accessibilityLabel={row.label} style={shared.wrap}>
                      {options.map((item) => <ChoiceChip key={item.id} label={item.label} selected={option === item.id} onPress={() => setOption(option === item.id ? null : item.id)} />)}
                    </View>
                  ) : null}
                  <TextInput accessibilityLabel={t("plan.premise.valueLabel", { label: row.label })} onChangeText={setText} placeholder={t("plan.questions.freePlaceholder")} placeholderTextColor={colors.ink3Text} style={shared.input} value={text} />
                  <View style={shared.row}>
                    <Button label={t("plan.premise.save")} disabled={!option && !text.trim()} loading={saving} onPress={() => void save()} size="sm" variant="primary" />
                    <Button label={copy.action.cancel} onPress={() => setEditing(null)} size="sm" variant="ghost" />
                  </View>
                </View>
              ) : null}
            </View>
          ))}
        </>
      )}
      {failure ? failure.kind === "stale" ? <StaleNote onReload={onReload} /> : isLimitFailure(failure) ? <LimitNote failure={failure} /> : <InlineProblem text={failureText(failure)} /> : null}
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
    </View>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  question: { gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.line },
  center: { textAlign: "center" },
  premiseRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.line },
  premiseLabel: { width: 72, paddingTop: 2 },
  premiseTags: { alignItems: "flex-end", gap: 4 },
}));
