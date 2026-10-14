// R23 ⑥ 手動編集 (App `/plans/drafts/<draftId>/edit`; once only, saving confirms).
// Steps: rename in place (「元：…」), 目安, move up / down, delete, add (≤ 7, ≥ 1).
// Person types: count steppers, allocation inputs (multiples of 5) — the difference
// flows from the highest other types by the shared rule (plan-allocation), so the
// total stays 100; removing a type shows where its points go first. 「元に戻す」
// drops the local edits. Nothing is sent until 「このプランで始める」.
// R25: the same page edits a review draft (kind review: after a 見直し, or opened by
// 「手動で編集」 on the overview): the review's 3-step progress, 「保存して確定」, and on
// success Task › プラン with 「方案を更新しました」; back returns to where it came from.
import { useRouter, type Href } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, PanResponder, StyleSheet, TextInput, View } from "react-native";

import type { PlanDraftView } from "../../api/contract/plan-v2";
import { PLAN_ALLOCATION_TOTAL, PLAN_EVENT_TARGET_MAX, PLAN_TYPE_TARGET_MAX, type PlanAllocationMove } from "../../api/compute/plan-allocation";
import { planReviewHref, planTaskSegmentHref } from "../../api/compute/plan-href";
import { PLAN_SHORT_NAME_COPY, planCopy } from "../../api/compute/plan-template-copy";
import { PLAN_EVENT_SLOT } from "../../api/compute/plan-templates";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { openMainTab } from "../../components/shell-navigation";
import { BottomSheet, Button, FilterOption, Icon, RetryCard, Skeleton, UiPressable, UiText, useToast } from "../../components/ui";
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
  canRemoveType,
  moveStep,
  newIdempotencyKey,
  PLAN_EVENT_EMOJI,
  PLAN_STEP_LIMIT,
  removeType,
  typeLetters,
  unusedTemplateSlots,
  type ManualEditState,
} from "./plan-model";
import { FailureNote, InlineProblem, usePlanStyles } from "./plan-ui";
import { FlowFoot, FootFade, GhostRow, PlanChatFrame } from "./plan-flow-kit";
import { KitButton, KitCard, KitCardHead, KitEmo, kitText, useKitStyles } from "./plan-kit";

// The reflow's refusals in words (R25 review S1 adds earned / skipped / counted / has points).
const MANUAL_ERROR_KEYS: Record<string, "plan.manual.errorStep" | "plan.manual.errorRange" | "plan.manual.errorBelowEarned" | "plan.manual.errorSkipped" | "plan.manual.errorBelowMet" | "plan.manual.errorHasPoints"> = {
  below_earned: "plan.manual.errorBelowEarned",
  cannot_remove_with_points: "plan.manual.errorHasPoints",
  not_multiple_of_step: "plan.manual.errorStep",
  skipped_locked: "plan.manual.errorSkipped",
  target_below_met: "plan.manual.errorBelowMet",
  target_out_of_range: "plan.manual.errorRange",
};

export function PlanManualEditScreen({ draftId }: { draftId: string }) {
  const api = usePlanApi();
  const router = useRouter();
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const shared = usePlanStyles().styles;
  const kit = useKitStyles().styles;
  const { styles, colors } = useStyles();
  const { t, language } = useOrbitLocale();
  const copy = useStandardCopy();
  const toast = useToast();
  const [draft, setDraft] = useState<PlanDraftView | null>(null);
  const [loadFailure, setLoadFailure] = useState<PlanFailure | null>(null);
  const [state, setState] = useState<ManualEditState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [removing, setRemoving] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; field: "title" | "criteria" } | null>(null);
  const [addingType, setAddingType] = useState(false);
  const [addingStep, setAddingStep] = useState(false);
  const [newStep, setNewStep] = useState({ doneCriteria: "", title: "", types: [] as string[] });
  const [saving, setSaving] = useState(false);
  const [saveFailure, setSaveFailure] = useState<PlanFailure | null>(null);
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const stepSequence = useRef(0);

  const read = useCallback(async () => {
    setLoadFailure(null);
    let result = await api.getDraft(draftId);
    // R25: a review draft (no intake) is also readable through …/review, which carries
    // the plan's goal; GET …/drafts/[id] alone fails for it on the server (see REPORT).
    if (!result.ok && result.failure.kind !== "network") {
      const review = await api.getReview(draftId);
      if (review.ok) result = { data: review.data.draft, ok: true, status: review.status };
    }
    if (!result.ok) return setLoadFailure(result.failure);
    setDraft(result.data);
    setState(manualEditStateOf(result.data.content, result.data.slotState));
    setInputs({});
    setNotice(null);
  }, [api, draftId]);

  useEffect(() => {
    if (!auth.ready || !server.ready) return;
    void read();
  }, [auth.ready, read, server.ready]);

  const kind = draft && isKnownGoalKind(draft.goalKind) ? draft.goalKind : null;
  const origin = useMemo(() => (draft ? manualEditStateOf(draft.content, draft.slotState) : null), [draft]);
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

  const errorText = (error: string) => t(MANUAL_ERROR_KEYS[error] ?? "plan.manual.errorNoRoom");

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
    if (result.ok) {
      if (draft.kind === "review") toast.success(t("plan.review.updated"));
      return openMainTab(router, result.data.href);
    }
    if (result.failure.kind !== "network") attempt.current = null;
    setSaveFailure(result.failure);
  };

  // R25 review: the plan changed meanwhile and this review draft was discarded (STALE) →
  // start a review on the latest plan and continue there (no review is used by opening).
  const [reopening, setReopening] = useState(false);
  const reopenLatest = async () => {
    if (!draft?.planId || reopening) return;
    setReopening(true);
    const result = await api.startReview(draft.planId, newIdempotencyKey("review-start"));
    setReopening(false);
    if (!result.ok) return setSaveFailure(result.failure);
    router.replace(planReviewHref("app", draft.planId) as Href);
  };

  const total = state ? allocationTotal(state) : 0;
  const changes = state && origin ? changeCount(origin, state) : 0;
  const review = draft?.kind === "review";
  const originIndex = new Map((origin?.steps ?? []).map((step, index) => [step.id, index] as const));
  const typeRows = state ? [
    ...state.types.map((type) => ({ key: type.key, slot: type.slot, emoji: type.emoji, title: `${letters.get(type.key)} ${type.shortLabel}`, allocation: type.allocation, count: type.targetCount, event: false })),
    { key: PLAN_EVENT_SLOT, slot: PLAN_EVENT_SLOT, emoji: PLAN_EVENT_EMOJI, title: t("plan.draft.event"), allocation: state.event.allocation, count: state.event.targetCount, event: true },
  ] : [];
  const setStep = (id: string, patch: Partial<ManualEditState["steps"][number]>) => state && setState({ ...state, steps: state.steps.map((item) => item.id === id ? { ...item, ...patch } : item) });
  const moveTo = (id: string, to: number) => {
    if (!state) return;
    let next = state;
    let from = next.steps.findIndex((step) => step.id === id);
    while (from !== to && from >= 0) { next = moveStep(next, id, to > from ? 1 : -1); from += to > from ? 1 : -1; }
    setState(next);
  };

  return (
    <PlanChatFrame
      title={t("plan.manual.title")}
      subtitle={t(review ? "plan.manual.reviewSubtitle" : "plan.manual.subtitle")}
      stage={review ? 2 : 4}
      {...(review ? { stageKeys: REVIEW_STAGE_KEYS } : {})}
      onClose={close}
      right={state && origin && editable ? <KitButton sm label={copy.action.undo} disabled={changes === 0} onPress={() => { setState(origin); setInputs({}); setNotice(null); setEditing(null); }} style={styles.undo} /> : null}
    >
      {state && editable ? (
        <FlowFoot>
          <View style={styles.foot}>
            <FootFade />
            {saveFailure && review && saveFailure.kind === "stale" ? (
              <View accessibilityRole="alert" style={styles.stale} testID="manual-stale">
                <UiText style={styles.staleText}>{t("plan.review.staleBody")}</UiText>
                <Button label={t("plan.review.loadLatest")} loading={reopening} onPress={() => void reopenLatest()} size="sm" variant="secondary" />
              </View>
            ) : saveFailure ? saveFailure.kind === "used" ? <InlineProblem text={t("plan.manual.used")} /> : <FailureNote failure={saveFailure} onReload={() => { setSaveFailure(null); void read(); }} /> : null}
            <View style={styles.footRow}>
              <View style={kit.grow}>
                <UiText style={styles.footTotal}>{t("plan.manual.footTotal", { total })}</UiText>
                <UiText style={kit.lbl}>{t("plan.manual.changes", { count: changes })}</UiText>
              </View>
              <KitButton primary label={t(review ? "plan.manual.reviewSave" : "plan.manual.start")} disabled={!manualEditReady(state) || saving} onPress={() => void save()} style={styles.start} testID="manual-start" />
            </View>
          </View>
        </FlowFoot>
      ) : null}
      {!draft && !loadFailure ? <Skeleton lines={6} /> : null}
      {loadFailure ? <RetryCard title={fillCopy(copy.error.loadFailed, { item: t("plan.manual.title") })} {...(loadFailure.kind === "network" ? {} : { message: t("plan.flow.loadFailedBody") })} onRetry={() => void read()} /> : null}
      {draft && !editable ? (
        <KitCard>
          <UiText style={styles.introText}>{t("plan.manual.used")}</UiText>
          <KitButton label={t("plan.common.back")} onPress={close} style={styles.back} />
        </KitCard>
      ) : null}
      {draft && state && editable ? (
        <View style={styles.stack}>
          <View style={styles.intro}>
            <UiText style={styles.introText}>{review ? t("plan.manual.reviewIntro") : draft.aiFixUsed > 0 ? t("plan.manual.introAfter", { count: draft.aiFixUsed }) : t("plan.manual.intro")}</UiText>
          </View>

          <KitCard style={styles.card}>
            <KitCardHead title={t("plan.manual.steps")} right={t("plan.manual.reorderLong")} style={styles.cardH} />
            {state.steps.map((step, index) => {
              const was = originIndex.get(step.id);
              const renamed = Boolean(step.originalTitle && step.originalTitle !== step.title.trim());
              return (
                <StepRow
                  key={step.id}
                  index={index}
                  count={state.steps.length}
                  title={step.title}
                  criteria={step.doneCriteria}
                  original={renamed ? step.originalTitle : null}
                  moved={was !== undefined && was !== index ? t("plan.manual.movedFrom", { from: was + 1, to: index + 1 }) : null}
                  editing={editing?.id === step.id ? editing.field : null}
                  onEdit={(field) => setEditing(field ? { field, id: step.id } : null)}
                  onTitle={(title) => setStep(step.id, { title })}
                  onCriteria={(doneCriteria) => setStep(step.id, { doneCriteria })}
                  onMove={(to) => moveTo(step.id, to)}
                  onDelete={() => setState({ ...state, steps: state.steps.filter((item) => item.id !== step.id) })}
                />
              );
            })}
            {state.steps.length < PLAN_STEP_LIMIT ? <GhostRow label={t("plan.manual.addStep")} onPress={() => setAddingStep(true)} height={40} /> : null}
          </KitCard>

          <KitCard style={styles.card}>
            <KitCardHead title={t("plan.manual.types")} right={t("plan.manual.sumHead", { total })} style={styles.cardH} />
            {notice ? <UiText accessibilityRole="alert" style={[kit.lbl, styles.notice]}>{notice}</UiText> : null}
            {typeRows.map((row, index) => {
              const before = originAllocation.get(row.key);
              const max = row.event ? PLAN_EVENT_TARGET_MAX : PLAN_TYPE_TARGET_MAX;
              return (
                <View key={row.key} accessibilityLabel={row.title} style={[styles.ewrow, index > 0 && styles.rowGap]}>
                  <View style={styles.ewHead}>
                    <KitEmo emoji={row.emoji} tone={TYPE_TONES[index % TYPE_TONES.length]!} sm />
                    <UiText numberOfLines={1} style={styles.ewName}>{row.title}</UiText>
                    {!row.event ? (
                      <UiPressable accessibilityRole="button" accessibilityLabel={t("plan.manual.removeType", { label: row.title })} disabled={state.types.length <= 1 || !canRemoveType(state, row.slot)} hitSlop={9} onPress={() => setRemoving(row.key)} style={styles.del}>
                        <View style={styles.delIcon}><Icon name="x" size={16} color={colors.ink3} /></View>
                      </UiPressable>
                    ) : <View style={styles.delSpace} />}
                  </View>
                  <View style={styles.ctl}>
                    <UiText style={kit.lbl}>{t(row.event ? "plan.manual.times" : "plan.manual.people")}</UiText>
                    <View style={styles.stp}>
                      <UiPressable accessibilityRole="button" accessibilityLabel={t("plan.manual.fewer", { label: row.title })} disabled={row.count <= 1} hitSlop={11} onPress={() => stepCount(row.key, -1)} style={styles.stpI}><UiText style={styles.stpIText}>−</UiText></UiPressable>
                      <UiText accessibilityLabel={t("plan.manual.countValue", { count: row.count, label: row.title })} style={styles.stpB}>{String(row.count)}</UiText>
                      <UiPressable accessibilityRole="button" accessibilityLabel={t("plan.manual.more", { label: row.title })} disabled={row.count >= max} hitSlop={11} onPress={() => stepCount(row.key, 1)} style={styles.stpI}><UiText style={styles.stpIText}>＋</UiText></UiPressable>
                    </View>
                    <View style={kit.grow} />
                    <UiText style={kit.lbl}>{t("plan.manual.points")}</UiText>
                    <TextInput
                      accessibilityLabel={t("plan.manual.pointsOf", { label: row.title })}
                      keyboardType="number-pad"
                      onBlur={() => commitAllocation(row.key)}
                      onChangeText={(value) => setInputs({ ...inputs, [row.key]: value.replace(/[^0-9]/g, "") })}
                      onSubmitEditing={() => commitAllocation(row.key)}
                      returnKeyType="done"
                      selectionColor={colors.plum700}
                      style={styles.ptin}
                      value={inputs[row.key] ?? String(row.allocation)}
                    />
                    {before !== undefined && before !== row.allocation ? (
                      <UiText accessibilityLabel={t("plan.manual.fromTo", { from: before, to: row.allocation })} style={styles.ba}>
                        <UiText style={styles.baS}>{String(before)}</UiText>{" → "}<UiText style={[styles.baB, row.allocation < before && styles.baDn]}>{String(row.allocation)}</UiText>
                      </UiText>
                    ) : <UiText style={styles.ba}>{String(row.allocation)}</UiText>}
                  </View>
                </View>
              );
            })}
            {unusedTemplateSlots(state, kind).length ? <GhostRow label={t("plan.manual.addType")} onPress={() => setAddingType(true)} height={40} /> : null}
          </KitCard>
          <UiText style={[kit.lbl, styles.after]}>{t(review ? "plan.manual.reviewAfter" : "plan.manual.after")}</UiText>
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
        </View>
      ) : null}
    </PlanChatFrame>
  );
}

/**
 * b10 ⑥ .erow：握把 · 号码 · 名前（13px 700，一行）+ 目安 / 元（.lbl 一行）· 移动后的「5 → 4」· 删除。
 * 点名前 / 目安就地改（.ein）；长按抬起（.lift：白底、阴影、−1.2° · 1.02），上下拖到新位置松手。
 * 读屏：上へ / 下へ 两个 accessibilityActions。
 */
function StepRow({ index, count, title, criteria, original, moved, editing, onEdit, onTitle, onCriteria, onMove, onDelete }: {
  index: number;
  count: number;
  title: string;
  criteria: string;
  original: string | null;
  moved: string | null;
  editing: "title" | "criteria" | null;
  onEdit: (field: "title" | "criteria" | null) => void;
  onTitle: (title: string) => void;
  onCriteria: (criteria: string) => void;
  onMove: (to: number) => void;
  onDelete: () => void;
}) {
  const { styles, colors } = useStyles();
  const kit = useKitStyles().styles;
  const { t } = useOrbitLocale();
  const [lifted, setLifted] = useState(false);
  const dy = useRef(new Animated.Value(0)).current;
  const pitch = useRef(56);
  const live = useRef({ count, index, lifted: false, onMove });
  live.current = { count, index, lifted, onMove };
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: () => live.current.lifted,
    onMoveShouldSetPanResponderCapture: () => live.current.lifted,
    onPanResponderMove: (_event, gesture) => dy.setValue(gesture.dy),
    onPanResponderRelease: (_event, gesture) => {
      const { count: n, index: from, onMove: move } = live.current;
      const to = Math.max(0, Math.min(n - 1, from + Math.round(gesture.dy / pitch.current)));
      dy.setValue(0);
      setLifted(false);
      if (to !== from) move(to);
    },
    onPanResponderTerminate: () => { dy.setValue(0); setLifted(false); },
  }), [dy]);
  const number = index + 1;
  const sub = original ? t("plan.manual.original", { title: original }) : criteria ? t("plan.manual.criteriaLine", { text: criteria }) : t("plan.manual.criteriaPlaceholder");
  return (
    <Animated.View
      {...pan.panHandlers}
      accessible={editing === null}
      accessibilityLabel={`${t("plan.manual.stepLabel", { number })} ${title}`}
      accessibilityActions={[{ name: "up", label: t("plan.manual.moveUp", { number }) }, { name: "down", label: t("plan.manual.moveDown", { number }) }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === "up" && index > 0) onMove(index - 1);
        if (event.nativeEvent.actionName === "down" && index < count - 1) onMove(index + 1);
      }}
      onLayout={(event) => { pitch.current = event.nativeEvent.layout.height + 6; }}
      style={[styles.erow, index > 0 && styles.rowGap, lifted && styles.lift, lifted && { transform: [{ translateY: dy }, { rotate: "-1.2deg" }, { scale: 1.02 }] }]}
    >
      <UiPressable accessible={false} delayLongPress={300} onLongPress={() => { onEdit(null); setLifted(true); }} style={styles.erowPress}>
        <View style={styles.grip}>{GRIP_DOTS.map((dot) => <View key={dot} style={styles.gripDot} />)}</View>
        <View style={[styles.snum, lifted && styles.snumLift]}><UiText style={[styles.snumText, lifted && styles.snumTextLift]}>{String(number)}</UiText></View>
        <View style={kit.grow}>
          {editing === "title" ? (
            <TextInput accessibilityLabel={t("plan.manual.stepName", { number })} autoFocus onBlur={() => onEdit(null)} onChangeText={onTitle} selectionColor={colors.plum700} style={styles.ein} value={title} />
          ) : (
            <UiPressable accessibilityRole="button" accessibilityLabel={t("plan.manual.editName", { number })} onLongPress={() => { onEdit(null); setLifted(true); }} onPress={() => onEdit("title")}>
              <UiText numberOfLines={1} style={styles.emB}>{title}</UiText>
            </UiPressable>
          )}
          {editing === "criteria" ? (
            <TextInput accessibilityLabel={t("plan.manual.stepCriteria", { number })} autoFocus onBlur={() => onEdit(null)} onChangeText={onCriteria} placeholder={t("plan.manual.criteriaPlaceholder")} placeholderTextColor={colors.ink3} selectionColor={colors.plum700} style={[styles.ein, styles.einSub]} value={criteria} />
          ) : (
            <UiPressable accessibilityRole="button" accessibilityLabel={t("plan.manual.editCriteria", { number })} onLongPress={() => { onEdit(null); setLifted(true); }} onPress={() => onEdit("criteria")}>
              <UiText numberOfLines={1} style={[kit.lbl, editing === "title" && styles.subUnderInput]}>{sub}</UiText>
            </UiPressable>
          )}
        </View>
        {moved ? <UiText style={styles.mv}>{moved}</UiText> : null}
        <UiPressable accessibilityRole="button" accessibilityLabel={t("plan.manual.deleteStep", { number })} disabled={count <= 1} hitSlop={9} onPress={onDelete} style={styles.del}>
          <View style={styles.delIcon}><Icon name="x" size={16} color={colors.ink3} /></View>
        </UiPressable>
      </UiPressable>
    </Animated.View>
  );
}

const GRIP_DOTS = [0, 1, 2, 3, 4, 5];
const TYPE_TONES = ["lav", "pink", "blue", "teal", "apricot"] as const;
const REVIEW_STAGE_KEYS = ["plan.review.stagePremise", "plan.review.stageFix", "plan.review.stageManual"] as const;

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  undo: { backgroundColor: "transparent" },
  stack: { gap: 14 },
  intro: { backgroundColor: colors.surface2, borderRadius: 24, paddingVertical: 12, paddingHorizontal: 14 },
  introText: { color: colors.ink, ...kitText(12.5, "400", 1.6) },
  back: { marginTop: 12, alignSelf: "flex-start" },
  card: { paddingVertical: 12, paddingHorizontal: 16 },
  cardH: { marginTop: 2, marginBottom: 6 },
  notice: { marginBottom: 6 },
  rowGap: { marginTop: 6 },
  erow: { borderRadius: 16, backgroundColor: colors.surface2 },
  erowPress: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, paddingHorizontal: 10 },
  lift: { backgroundColor: colors.surface, zIndex: 2, shadowColor: colors.plum900, shadowOpacity: 0.22, shadowRadius: 15, shadowOffset: { width: 0, height: 10 } },
  grip: { width: 12, height: 18, flexDirection: "row", flexWrap: "wrap", alignContent: "space-between", justifyContent: "space-between", paddingVertical: 1.5, paddingHorizontal: 1.5 },
  gripDot: { width: 2.6, height: 2.6, borderRadius: 1.3, backgroundColor: colors.ink4, marginHorizontal: 0.2 },
  snum: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" },
  snumLift: { backgroundColor: colors.plum700 },
  snumText: { color: colors.bg, ...kitText(11, "800") },
  snumTextLift: { color: colors.onAccent },
  emB: { color: colors.ink, ...kitText(13, "700") },
  ein: { height: 30, borderRadius: 10, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.plum500, paddingHorizontal: 8, paddingVertical: 0, color: colors.ink, fontSize: 13, fontWeight: "700" },
  einSub: { marginTop: 3, fontSize: 11.5, fontWeight: "500" },
  subUnderInput: { marginTop: 3 },
  mv: { color: colors.plum700, ...kitText(10, "800") },
  del: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  delIcon: { width: 13, height: 13, alignItems: "center", justifyContent: "center", transform: [{ scale: 13 / 16 }] },
  delSpace: { width: 26 },
  ewrow: { padding: 10, borderRadius: 16, backgroundColor: colors.surface2, gap: 6 },
  ewHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  ewName: { flex: 1, minWidth: 0, color: colors.ink, ...kitText(12.5, "700") },
  ctl: { flexDirection: "row", alignItems: "center", gap: 8, marginLeft: 38 },
  stp: { flexDirection: "row", alignItems: "center", gap: 2, padding: 2, borderRadius: 999, backgroundColor: colors.surface },
  stpI: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  stpIText: { color: colors.ink2, ...kitText(13, "800") },
  stpB: { minWidth: 30, textAlign: "center", color: colors.ink, ...kitText(13, "700") },
  ptin: { width: 50, height: 28, borderRadius: 9, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: "transparent", textAlign: "center", padding: 0, color: colors.ink, fontSize: 14, fontWeight: "900" },
  ba: { color: colors.ink3, ...kitText(11, "700") },
  baS: { color: colors.ink4, textDecorationLine: "line-through" },
  baB: { color: colors.ink },
  baDn: { color: colors.rose700 },
  after: { lineHeight: 18.4 },
  foot: { paddingTop: 22, paddingHorizontal: 18, paddingBottom: 30, gap: 8 },
  footRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  footTotal: { color: colors.ink, ...kitText(13, "700") },
  start: { height: 46 },
  sheet: { gap: 10, borderRadius: radius.lg },
  stale: { backgroundColor: colors.macApricot, borderRadius: radius.md, padding: 12, gap: 8 },
  staleText: { color: colors.macApricotText, fontSize: 13, lineHeight: 20, fontWeight: "600" },
}));
