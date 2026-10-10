// R23 ⑥ 手動編集 (App `/plans/drafts/<draftId>/edit`; once only, saving confirms).
// Steps: rename in place (「元：…」), 目安, move up / down, delete, add (≤ 7, ≥ 1).
// Person types: count steppers, allocation inputs (multiples of 5) — the difference
// flows from the highest other types by the shared rule (plan-allocation), so the
// total stays 100; removing a type shows where its points go first. 「元に戻す」
// drops the local edits. Nothing is sent until 「このプランで始める」.
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";

import type { PlanDraftView } from "../../api/contract/plan-v2";
import { PLAN_ALLOCATION_TOTAL, PLAN_EVENT_TARGET_MAX, PLAN_TYPE_TARGET_MAX, type PlanAllocationMove } from "../../api/compute/plan-allocation";
import { planTaskSegmentHref } from "../../api/compute/plan-href";
import { PLAN_SHORT_NAME_COPY, planCopy } from "../../api/compute/plan-template-copy";
import { PLAN_EVENT_SLOT } from "../../api/compute/plan-templates";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { openMainTab } from "../../components/shell-navigation";
import { BottomSheet, Button, FilterOption, IconButton, RetryCard, Skeleton, UiPressable, UiText } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { radius } from "../../design/tokens";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { fillCopy, useStandardCopy } from "../../i18n/standard-copy";
import { usePlanApi, type PlanFailure } from "./plan-api";
import {
  addType,
  allocationTotal,
  changeCount,
  editAllocation,
  editTargetCount,
  isKnownGoalKind,
  manualEditReady,
  manualEditRequest,
  manualEditStateOf,
  moveStep,
  newIdempotencyKey,
  PLAN_EVENT_EMOJI,
  PLAN_STEP_LIMIT,
  removeType,
  typeLetters,
  unusedTemplateSlots,
  type ManualEditState,
} from "./plan-model";
import { FailureNote, InlineProblem, PlanFrame, Tag, usePlanStyles } from "./plan-ui";

export function PlanManualEditScreen({ draftId }: { draftId: string }) {
  const api = usePlanApi();
  const router = useRouter();
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const shared = usePlanStyles().styles;
  const { styles, colors } = useStyles();
  const { t, language } = useOrbitLocale();
  const copy = useStandardCopy();
  const [draft, setDraft] = useState<PlanDraftView | null>(null);
  const [loadFailure, setLoadFailure] = useState<PlanFailure | null>(null);
  const [state, setState] = useState<ManualEditState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [removing, setRemoving] = useState<string | null>(null);
  const [addingType, setAddingType] = useState(false);
  const [addingStep, setAddingStep] = useState(false);
  const [newStep, setNewStep] = useState({ doneCriteria: "", title: "", types: [] as string[] });
  const [saving, setSaving] = useState(false);
  const [saveFailure, setSaveFailure] = useState<PlanFailure | null>(null);
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const stepSequence = useRef(0);

  const read = useCallback(async () => {
    setLoadFailure(null);
    const result = await api.getDraft(draftId);
    if (!result.ok) return setLoadFailure(result.failure);
    setDraft(result.data);
    setState(manualEditStateOf(result.data.content));
    setInputs({});
    setNotice(null);
  }, [api, draftId]);

  useEffect(() => {
    if (!auth.ready || !server.ready) return;
    void read();
  }, [auth.ready, read, server.ready]);

  const kind = draft && isKnownGoalKind(draft.goalKind) ? draft.goalKind : null;
  const origin = useMemo(() => (draft ? manualEditStateOf(draft.content) : null), [draft]);
  const originAllocation = useMemo(() => new Map([...(origin?.types ?? []).map((type) => [type.key, type.allocation] as const), [PLAN_EVENT_SLOT, origin?.event.allocation ?? 0]]), [origin]);
  const letters = typeLetters(state?.types ?? []);
  const labelOf = (key: string) => key === PLAN_EVENT_SLOT ? t("plan.draft.event") : `${letters.get(key) ?? ""} ${state?.types.find((type) => type.key === key)?.shortLabel ?? ""}`.trim();
  const editable = Boolean(draft && draft.status === "open" && draft.manualEditAvailable);

  const close = () => (router.canGoBack() ? router.back() : openMainTab(router, planTaskSegmentHref("app")));

  const explain = (moves: PlanAllocationMove[], key: string) => {
    const own = moves.find((move) => move.key === key);
    const others = moves.filter((move) => move.key !== key);
    if (!own) return setNotice(null);
    setNotice(t("plan.manual.moved", {
      label: labelOf(key),
      from: own.from,
      to: own.to,
      others: others.map((move) => `${labelOf(move.key)} ${move.from} → ${move.to}`).join(" · ") || t("plan.manual.none"),
    }));
  };

  const errorText = (error: string) => t(error === "not_multiple_of_step" ? "plan.manual.errorStep" : error === "target_out_of_range" ? "plan.manual.errorRange" : "plan.manual.errorNoRoom");

  const commitAllocation = (key: string) => {
    if (!state) return;
    const raw = inputs[key];
    if (raw === undefined) return;
    const value = Number(raw.trim());
    setInputs((current) => { const next = { ...current }; delete next[key]; return next; });
    const result = editAllocation(state, kind, key, value);
    if (!result.ok) return setNotice(errorText(result.error));
    setState(result.state);
    explain(result.moves, key);
  };

  const stepCount = (key: string, delta: number) => {
    if (!state) return;
    const current = key === PLAN_EVENT_SLOT ? state.event.targetCount : state.types.find((type) => type.key === key)?.targetCount ?? 1;
    const result = editTargetCount(state, kind, key, current + delta);
    if (result.ok) setState(result.state);
  };

  const preview = useMemo(() => (state && removing ? removeType(state, kind, removing) : null), [kind, removing, state]);

  const save = async () => {
    if (!draft || !state || saving) return;
    const body = manualEditRequest(state, draft.revision, "");
    const fingerprint = JSON.stringify(body);
    if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, key: newIdempotencyKey("manual") };
    setSaving(true);
    setSaveFailure(null);
    const result = await api.manualEdit(draft.draftId, { ...body, idempotencyKey: attempt.current.key });
    setSaving(false);
    if (result.ok) return openMainTab(router, result.data.href);
    if (result.failure.kind !== "network") attempt.current = null;
    setSaveFailure(result.failure);
  };

  const total = state ? allocationTotal(state) : 0;
  const changes = state && origin ? changeCount(origin, state) : 0;

  return (
    <PlanFrame
      title={t("plan.manual.title")}
      subtitle={t("plan.manual.subtitle")}
      stage={4}
      onClose={close}
      right={state && origin && editable ? <Button label={copy.action.undo} disabled={changes === 0} onPress={() => { setState(origin); setInputs({}); setNotice(null); }} size="sm" variant="ghost" /> : null}
      footer={state && editable ? (
        <View style={styles.footer}>
          <UiText style={shared.caption}>{t("plan.manual.totals", { count: changes, total })}</UiText>
          {saveFailure ? saveFailure.kind === "used" ? <InlineProblem text={t("plan.manual.used")} /> : <FailureNote failure={saveFailure} onReload={() => { setSaveFailure(null); void read(); }} /> : null}
          <Button block disabled={!manualEditReady(state)} label={t("plan.manual.start")} loading={saving} onPress={() => void save()} variant="primary" />
        </View>
      ) : undefined}
    >
      {!draft && !loadFailure ? <Skeleton lines={6} /> : null}
      {loadFailure ? <RetryCard title={fillCopy(copy.error.loadFailed, { item: t("plan.manual.title") })} {...(loadFailure.kind === "network" ? {} : { message: t("plan.flow.loadFailedBody") })} onRetry={() => void read()} /> : null}
      {draft && !editable ? (
        <View style={shared.card}>
          <UiText style={shared.body2}>{t("plan.manual.used")}</UiText>
          <Button label={t("plan.common.back")} onPress={close} variant="secondary" />
        </View>
      ) : null}
      {draft && state && editable ? (
        <>
          <UiText style={shared.body2}>{t("plan.manual.intro")}</UiText>
          <View style={shared.card}>
            <View style={shared.row}>
              <UiText accessibilityRole="header" style={[shared.title, shared.grow]}>{t("plan.manual.steps")}</UiText>
              <UiText style={shared.caption}>{t("plan.manual.stepCount", { count: state.steps.length })}</UiText>
            </View>
            <UiText style={shared.caption}>{t("plan.manual.reorderHint")}</UiText>
            {state.steps.map((step, index) => (
              <View key={step.id} accessibilityLabel={t("plan.manual.stepLabel", { number: index + 1 })} style={styles.step}>
                <View style={shared.row}>
                  <View style={shared.number}><UiText style={shared.numberText}>{index + 1}</UiText></View>
                  <TextInput
                    accessibilityLabel={t("plan.manual.stepName", { number: index + 1 })}
                    onChangeText={(title) => setState({ ...state, steps: state.steps.map((item) => item.id === step.id ? { ...item, title } : item) })}
                    style={[shared.input, shared.grow]}
                    value={step.title}
                  />
                </View>
                {step.originalTitle && step.originalTitle !== step.title.trim() ? <UiText style={shared.caption}>{t("plan.manual.original", { title: step.originalTitle })}</UiText> : null}
                <TextInput
                  accessibilityLabel={t("plan.manual.stepCriteria", { number: index + 1 })}
                  multiline
                  onChangeText={(doneCriteria) => setState({ ...state, steps: state.steps.map((item) => item.id === step.id ? { ...item, doneCriteria } : item) })}
                  placeholder={t("plan.manual.criteriaPlaceholder")}
                  placeholderTextColor={colors.ink3Text}
                  style={shared.input}
                  value={step.doneCriteria}
                />
                <View style={shared.row}>
                  <View style={[shared.wrap, shared.grow]}>{step.personTypeKeys.map((key) => <Tag key={key} label={key === PLAN_EVENT_SLOT ? PLAN_EVENT_EMOJI : `${state.types.find((type) => type.key === key)?.emoji ?? ""} ${letters.get(key) ?? ""}`} />)}</View>
                  <IconButton icon="up" accessibilityLabel={t("plan.manual.moveUp", { number: index + 1 })} disabled={index === 0} onPress={() => setState(moveStep(state, step.id, -1))} size={34} />
                  <IconButton icon="down" accessibilityLabel={t("plan.manual.moveDown", { number: index + 1 })} disabled={index === state.steps.length - 1} onPress={() => setState(moveStep(state, step.id, 1))} size={34} />
                  <IconButton icon="x" accessibilityLabel={t("plan.manual.deleteStep", { number: index + 1 })} disabled={state.steps.length <= 1} onPress={() => setState({ ...state, steps: state.steps.filter((item) => item.id !== step.id) })} size={34} />
                </View>
              </View>
            ))}
            {state.steps.length < PLAN_STEP_LIMIT ? (
              <UiPressable accessibilityRole="button" onPress={() => setAddingStep(true)} style={shared.dashedCard}>
                <UiText style={[shared.title, styles.centerText]}>{t("plan.manual.addStep")}</UiText>
              </UiPressable>
            ) : null}
          </View>

          <View style={shared.card}>
            <View style={shared.row}>
              <UiText accessibilityRole="header" style={[shared.title, shared.grow]}>{t("plan.manual.types")}</UiText>
              <Tag label={t("plan.manual.total", { total })} tone={total === PLAN_ALLOCATION_TOTAL ? "ok" : "gap"} />
            </View>
            <UiText style={shared.caption}>{t("plan.manual.typesHint")}</UiText>
            {notice ? <UiText accessibilityRole="alert" style={shared.body2}>{notice}</UiText> : null}
            {[...state.types.map((type) => ({ key: type.key, emoji: type.emoji, title: `${letters.get(type.key)} ${type.shortLabel}`, sub: type.roleSituation, allocation: type.allocation, count: type.targetCount, event: false })),
              { key: PLAN_EVENT_SLOT, emoji: PLAN_EVENT_EMOJI, title: t("plan.draft.event"), sub: "", allocation: state.event.allocation, count: state.event.targetCount, event: true }].map((row) => {
              const before = originAllocation.get(row.key);
              const max = row.event ? PLAN_EVENT_TARGET_MAX : PLAN_TYPE_TARGET_MAX;
              return (
                <View key={row.key} accessibilityLabel={row.title} style={styles.typeRow}>
                  <View style={shared.rowTop}>
                    <UiText style={shared.emoji}>{row.emoji}</UiText>
                    <View style={shared.grow}>
                      <UiText style={shared.title}>{row.title}</UiText>
                      {row.sub ? <UiText numberOfLines={2} style={shared.caption}>{row.sub}</UiText> : null}
                    </View>
                    {!row.event ? <IconButton icon="x" accessibilityLabel={t("plan.manual.removeType", { label: row.title })} disabled={state.types.length <= 1} onPress={() => setRemoving(row.key)} size={34} /> : null}
                  </View>
                  <View style={shared.row}>
                    <UiText style={shared.label}>{t(row.event ? "plan.manual.times" : "plan.manual.people")}</UiText>
                    <IconButton icon="minus" accessibilityLabel={t("plan.manual.fewer", { label: row.title })} disabled={row.count <= 1} onPress={() => stepCount(row.key, -1)} size={34} soft />
                    <UiText accessibilityLabel={t("plan.manual.countValue", { count: row.count, label: row.title })} style={styles.count}>{row.count}</UiText>
                    <IconButton icon="plus" accessibilityLabel={t("plan.manual.more", { label: row.title })} disabled={row.count >= max} onPress={() => stepCount(row.key, 1)} size={34} soft />
                    <View style={shared.grow} />
                    <UiText style={shared.label}>{t("plan.manual.points")}</UiText>
                    <TextInput
                      accessibilityLabel={t("plan.manual.pointsOf", { label: row.title })}
                      keyboardType="number-pad"
                      onBlur={() => commitAllocation(row.key)}
                      onChangeText={(value) => setInputs({ ...inputs, [row.key]: value.replace(/[^0-9]/g, "") })}
                      onSubmitEditing={() => commitAllocation(row.key)}
                      returnKeyType="done"
                      style={[shared.input, styles.points]}
                      value={inputs[row.key] ?? String(row.allocation)}
                    />
                  </View>
                  {before !== undefined && before !== row.allocation ? <UiText style={styles.delta}>{t("plan.manual.fromTo", { from: before, to: row.allocation })}</UiText> : null}
                </View>
              );
            })}
            {unusedTemplateSlots(state, kind).length ? <Button icon="plus" label={t("plan.manual.addType")} onPress={() => setAddingType(true)} variant="secondary" /> : null}
          </View>
          <UiText style={shared.caption}>{t("plan.manual.after")}</UiText>

          <BottomSheet visible={removing !== null && preview !== null} onClose={() => setRemoving(null)} accessibilityLabel={t("plan.manual.removeTitle", { letter: removing ? letters.get(removing) ?? "" : "" })}>
            {removing && preview ? (
              <View style={styles.sheet}>
                <UiText accessibilityRole="header" style={shared.heading}>{t("plan.manual.removeTitle", { letter: letters.get(removing) ?? "" })}</UiText>
                <UiText style={shared.body2}>{t("plan.manual.removeSub", { label: state.types.find((type) => type.key === removing)?.shortLabel ?? "", points: state.types.find((type) => type.key === removing)?.allocation ?? 0 })}</UiText>
                {preview.ok ? (
                  <>
                    <UiText style={shared.body2}>{t("plan.manual.removeFlow", { points: state.types.find((type) => type.key === removing)?.allocation ?? 0 })}</UiText>
                    {[...preview.state.types.map((type) => ({ key: type.key, emoji: type.emoji, to: type.allocation })), { key: PLAN_EVENT_SLOT, emoji: PLAN_EVENT_EMOJI, to: preview.state.event.allocation }].map((row) => {
                      const from = row.key === PLAN_EVENT_SLOT ? state.event.allocation : state.types.find((type) => type.key === row.key)?.allocation ?? 0;
                      return (
                        <View key={row.key} style={shared.row}>
                          <UiText style={shared.emoji}>{row.emoji}</UiText>
                          <UiText style={[shared.body, shared.grow]}>{labelOf(row.key)}</UiText>
                          <UiText style={shared.title}>{from === row.to ? String(row.to) : t("plan.manual.fromTo", { from, to: row.to })}</UiText>
                        </View>
                      );
                    })}
                    <View style={shared.row}><UiText style={[shared.title, shared.grow]}>{t("plan.manual.sum")}</UiText><UiText style={shared.title}>{allocationTotal(preview.state)}</UiText></View>
                    <UiText style={shared.caption}>{t("plan.manual.removeNote", { letter: letters.get(removing) ?? "" })}</UiText>
                  </>
                ) : <InlineProblem text={errorText(preview.error)} />}
                <View style={shared.footerRow}>
                  <Button label={copy.action.cancel} onPress={() => setRemoving(null)} variant="secondary" />
                  <Button disabled={!preview.ok} label={t("plan.manual.removeConfirm")} onPress={() => { if (preview.ok) { setState(preview.state); setNotice(null); } setRemoving(null); }} variant="danger" />
                </View>
              </View>
            ) : null}
          </BottomSheet>

          <BottomSheet visible={addingType} onClose={() => setAddingType(false)} accessibilityLabel={t("plan.manual.addType")}>
            <View style={styles.sheet}>
              <UiText accessibilityRole="header" style={shared.heading}>{t("plan.manual.addType")}</UiText>
              {unusedTemplateSlots(state, kind).map((slot) => (
                <UiPressable key={slot.slot} accessibilityRole="button" onPress={() => {
                  const result = addType(state, kind, slot.slot, language);
                  if (result.ok) { setState(result.state); explain(result.moves, slot.slot); }
                  setAddingType(false);
                }} style={[shared.softCard, shared.row]}>
                  <UiText style={shared.emoji}>{slot.emoji}</UiText>
                  <UiText style={[shared.title, shared.grow]}>{planCopy(PLAN_SHORT_NAME_COPY[slot.slot] ?? { en: slot.slot, ja: slot.slot, zh: slot.slot }, language)}</UiText>
                  <UiText style={shared.caption}>{t("plan.manual.templatePoints", { points: slot.allocation })}</UiText>
                </UiPressable>
              ))}
            </View>
          </BottomSheet>

          <BottomSheet visible={addingStep} onClose={() => setAddingStep(false)} accessibilityLabel={t("plan.manual.addStep")}>
            <View style={styles.sheet}>
              <UiText accessibilityRole="header" style={shared.heading}>{t("plan.manual.addStep")}</UiText>
              <TextInput accessibilityLabel={t("plan.manual.newStepName")} onChangeText={(title) => setNewStep({ ...newStep, title })} placeholder={t("plan.manual.newStepName")} placeholderTextColor={colors.ink3Text} style={shared.input} value={newStep.title} />
              <TextInput accessibilityLabel={t("plan.manual.criteriaPlaceholder")} onChangeText={(doneCriteria) => setNewStep({ ...newStep, doneCriteria })} placeholder={t("plan.manual.criteriaPlaceholder")} placeholderTextColor={colors.ink3Text} style={shared.input} value={newStep.doneCriteria} />
              <UiText style={shared.label}>{t("plan.manual.newStepTypes")}</UiText>
              <View style={shared.wrap}>
                {[...state.types.map((type) => ({ key: type.key, label: `${type.emoji} ${letters.get(type.key)}` })), { key: PLAN_EVENT_SLOT, label: PLAN_EVENT_EMOJI }].map((item) => (
                  <FilterOption key={item.key} label={item.label} selected={newStep.types.includes(item.key)} onToggle={() => setNewStep({ ...newStep, types: newStep.types.includes(item.key) ? newStep.types.filter((key) => key !== item.key) : [...newStep.types, item.key] })} />
                ))}
              </View>
              <Button block disabled={!newStep.title.trim()} label={t("plan.manual.addStepConfirm")} onPress={() => {
                stepSequence.current += 1;
                setState({ ...state, steps: [...state.steps, { doneCriteria: newStep.doneCriteria.trim(), id: `new-${stepSequence.current}`, key: null, originalTitle: null, personTypeKeys: newStep.types, title: newStep.title.trim() }] });
                setNewStep({ doneCriteria: "", title: "", types: [] });
                setAddingStep(false);
              }} variant="primary" />
            </View>
          </BottomSheet>
        </>
      ) : null}
    </PlanFrame>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  footer: { gap: 8 },
  step: { gap: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.line },
  centerText: { textAlign: "center" },
  typeRow: { gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.line },
  count: { color: colors.ink, fontSize: 15, fontWeight: "800", minWidth: 22, textAlign: "center" },
  points: { width: 64, textAlign: "center", minHeight: 40, paddingVertical: 6 },
  delta: { color: colors.accentText, fontSize: 12, fontWeight: "700", alignSelf: "flex-end" },
  sheet: { gap: 10, borderRadius: radius.lg },
}));
