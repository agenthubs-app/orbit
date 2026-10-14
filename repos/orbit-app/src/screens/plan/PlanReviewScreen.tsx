// R25 見直し (App `/plans/<planId>/review`, b4 A3 ①–④ / A4 ②). Full screen, no tab bar.
// 3-step progress (前提 / AI 修正 / 手動編集); the confirmed premise card with the AI's
// marks (豆沙 + 依据 + suggested value), edited in place (old value struck through);
// 「ほかに変わったこと」 and the send button that says what it uses (「今月あと N → N-1 回」);
// each AI revision card lists only the changes, each with ✓ / ✕ (the server rebuilds
// the plan and answers the new one), what did not change, or 「今回は変更しません」;
// then 手動で編集（1回）/ この内容で確定 / もう一度直す. Used up → the A4 ② note and
// 「わかりました」 (no paid entry). STALE → 「最新を読み込む」; AI failure → 「もう一度」
// (no review used). Opening the page only reads; writes happen on the user's taps.
import { useRouter, type Href } from "expo-router";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { StyleSheet, TextInput, View, type StyleProp, type ViewStyle } from "react-native";

import type { PlanDraftChange, PlanDraftTurn, PlanPremiseRow, PlanReviewView, PlanV2Detail } from "../../api/contract/plan-v2";
import { planDraftEditHref, planTaskSegmentHref } from "../../api/compute/plan-href";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { openMainTab } from "../../components/shell-navigation";
import { Button, Icon, RetryCard, Skeleton, UiPressable, UiText, useToast } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { radius } from "../../design/tokens";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { fillCopy, useStandardCopy } from "../../i18n/standard-copy";
import { usePlanApi, type PlanFailure } from "./plan-api";
import { newIdempotencyKey } from "./plan-model";
import { canSendReview, hasReviewInput, markEvidenceTexts, markOf, premiseEdits, reviewHasChanges, reviewStage, turnOrdinal } from "./plan-review-model";
import { ReviewUsedUpNote } from "./plan-review-ui";
import { FailureNote, InlineProblem, usePlanStyles } from "./plan-ui";
import { Bubble, ChatMark, FlowFoot, PlanChatFrame } from "./plan-flow-kit";
import { KitButton, KitCard, KitChip, KitEmo, kitText, useKitStyles, useKitWhy } from "./plan-kit";
import { RevComposer } from "./PlanDraft";
import { shortPremise } from "./PlanQuestions";

type Load =
  | { kind: "loading" }
  | { kind: "failed"; failure: PlanFailure }
  | { kind: "none"; plan: PlanV2Detail | null }
  | { kind: "ready"; plan: PlanV2Detail | null };
type Op = "start" | "send" | "toggle" | "confirm";

const SOURCE_KEYS = {
  background: "plan.review.sourceBackground",
  q1: "plan.review.sourceQ1",
  q2: "plan.review.sourceQ2",
  q3: "plan.review.sourceQ3",
  q4: "plan.review.sourceQ4",
  q5: "plan.review.sourceQ5",
  record: "plan.review.sourceRecord",
} as const;

const REVIEW_STAGE_KEYS = ["plan.review.stagePremise", "plan.review.stageFix", "plan.review.stageManual"] as const;

/** 「前回の確定（9/14）から 3週間です。」（确定日 = 计划开始日 startsOn）。 */
function sinceText(confirmedAt: string, t: ReturnType<typeof useOrbitLocale>["t"]): string {
  const at = new Date(confirmedAt);
  const days = Math.max(0, Math.round((Date.now() - at.getTime()) / 86_400_000));
  // 日期按东京（计划日期都是东京日期），不跟设备时区走。
  const date = at.toLocaleDateString("en-US", { day: "numeric", month: "numeric", timeZone: "Asia/Tokyo" });
  return days >= 14 ? t("plan.review.sinceWeeks", { date, weeks: Math.round(days / 7) }) : t("plan.review.sinceDays", { date, days });
}

export function PlanReviewScreen({ planId }: { planId: string }) {
  const api = usePlanApi();
  const router = useRouter();
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const toast = useToast();
  const shared = usePlanStyles().styles;
  const { styles } = useStyles();
  const { t } = useOrbitLocale();
  const copy = useStandardCopy();
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [view, setView] = useState<PlanReviewView | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<Op | null>(null);
  const [failure, setFailure] = useState<{ op: Op; failure: PlanFailure } | null>(null);
  const sequence = useRef(0);

  const read = useCallback(async () => {
    const run = (sequence.current += 1);
    const [plan, current] = await Promise.all([api.overview(planId), api.currentReview(planId)]);
    if (run !== sequence.current) return;
    if (!current.ok && current.failure.kind === "network") return setLoad({ failure: current.failure, kind: "failed" });
    const detail = plan.ok ? plan.data : null;
    if (!current.ok) {
      // No review in progress (404): offer to start one; anything else is a load failure.
      if (current.failure.kind === "other" && current.failure.reason === "DRAFT_NOT_FOUND") return setLoad({ kind: "none", plan: detail });
      return setLoad({ failure: current.failure, kind: "failed" });
    }
    setView(current.data);
    setLoad({ kind: "ready", plan: detail });
  }, [api, planId]);

  useEffect(() => {
    if (!auth.ready || !server.ready) return;
    void read();
  }, [auth.ready, read, server.ready]);

  const close = () => (router.canGoBack() ? router.back() : openMainTab(router, planTaskSegmentHref("app", planId)));
  const plan = load.kind === "ready" || load.kind === "none" ? load.plan : null;

  const act = async <T,>(op: Op, work: () => Promise<{ ok: true; data: T } | { ok: false; failure: PlanFailure }>, done: (data: T) => void) => {
    if (busy) return;
    setBusy(op);
    setFailure(null);
    const result = await work();
    setBusy(null);
    if (!result.ok) {
      setFailure({ failure: result.failure, op });
      // The month ran out meanwhile: read the view again so the page shows the used-up state.
      if (result.failure.kind === "reviewLimit" && view) {
        const fresh = await api.getReview(view.draft.draftId);
        if (fresh.ok) setView(fresh.data);
      }
      return;
    }
    done(result.data);
  };

  /** Opens (or reopens on the latest plan) the review draft — never uses a review. */
  const start = () => act("start", () => api.startReview(planId, newIdempotencyKey("review-start")), (data) => {
    setView(data);
    setEdits({});
    setEditing(null);
    setLoad({ kind: "ready", plan });
  });

  const send = () => {
    if (!view) return;
    const premise = premiseEdits(view.draft.premise, edits);
    const note = text.trim();
    if (!hasReviewInput(premise.length, note)) return;
    return act("send", () => api.reviewFix(view.draft.draftId, premise, note || null, newIdempotencyKey("review-fix")), (data) => {
      setView(data);
      setEdits({});
      setEditing(null);
      setText("");
    });
  };

  const toggle = (change: PlanDraftChange, accepted: boolean) => {
    if (!view || !change.id || (change.accepted !== false) === accepted) return;
    return act("toggle", () => api.toggleChange(view.draft.draftId, change.id!, accepted, newIdempotencyKey("review-toggle")), setView);
  };

  const confirm = () => {
    if (!view) return;
    return act("confirm", () => api.confirm(view.draft.draftId, newIdempotencyKey("review-confirm")), (data) => {
      toast.success(t("plan.review.updated"));
      openMainTab(router, data.href);
    });
  };

  const failureView = (op: Op) => {
    if (failure?.op !== op) return null;
    const item = failure.failure;
    if (item.kind === "stale" || (item.kind === "used" && item.reason === "DRAFT_CLOSED")) {
      return (
        <View accessibilityRole="alert" style={styles.note} testID="review-stale">
          <UiText style={styles.noteText}>{t("plan.review.staleBody")}</UiText>
          <Button label={t("plan.review.loadLatest")} loading={busy === "start"} onPress={() => void start()} size="sm" variant="secondary" />
        </View>
      );
    }
    if (item.kind === "aiFailed") {
      return (
        <View accessibilityRole="alert" style={styles.note} testID="review-ai-failed">
          <UiText style={styles.noteTitle}>{t("plan.review.failedTitle")}</UiText>
          <UiText style={styles.noteText}>{t("plan.review.failedBody")}</UiText>
          <Button icon="refresh" label={t("plan.common.again")} loading={busy === "send"} onPress={() => void send()} size="sm" variant="secondary" />
        </View>
      );
    }
    if (item.kind === "reviewLimit") return null; // the used-up note below says it.
    return <FailureNote failure={item} onReload={() => void read()} />;
  };

  const stage = reviewStage(view);
  const draft = view?.draft ?? null;
  const open = draft?.status === "open";
  const sendable = Boolean(view && canSendReview(view));
  const left = view?.reviewLeftThisMonth ?? 0;
  const limit = view?.reviewMonthlyLimit ?? 0;
  const lastTurn = draft?.turns.at(-1) ?? null;

  return (
    <PlanChatFrame
      subtitle={t("plan.review.subtitle", { goal: draft?.goal ?? plan?.goal ?? "" })}
      stage={stage}
      stageKeys={REVIEW_STAGE_KEYS}
      onClose={close}
      onMenu={() => openMainTab(router, "/ai")}
    >
      {view && open ? <FlowFoot>{(
        <ReviewFooter
          view={view}
          text={text}
          onText={setText}
          busy={busy}
          onSend={() => void send()}
          canSend={hasReviewInput(premiseEdits(view.draft.premise, edits).length, text)}
          failure={
            // 模拟器走查（2026-10-11）：发送中 / 发送失败放在发送按钮旁边——放在正文底部时，点了发送看不到任何反应。
            busy === "send" || failure?.op === "send" || failure?.op === "confirm" ? (
              <View style={styles.footNote}>
                {busy === "send" ? <UiText style={shared.caption}>{t("plan.review.sending")}</UiText> : null}
                {failureView("send")}
                {failureView("confirm")}
              </View>
            ) : null
          }
        />
      )}</FlowFoot> : null}
      {load.kind === "loading" ? <Skeleton lines={6} /> : null}
      {load.kind === "failed" ? (
        <RetryCard
          title={load.failure.kind === "network" ? t("plan.flow.offlineTitle") : fillCopy(copy.error.loadFailed, { item: t("plan.review.title") })}
          {...(load.failure.kind === "network" ? {} : { message: t("plan.flow.loadFailedBody") })}
          onRetry={() => void read()}
        />
      ) : null}
      {load.kind === "none" ? (
        <View style={shared.card} testID="review-none">
          {plan?.achievedAt ? (
            <>
              <UiText style={shared.body2}>{t("plan.review.achieved")}</UiText>
              <Button label={t("plan.common.back")} onPress={close} variant="secondary" />
            </>
          ) : (
            <>
              <UiText style={shared.heading}>{t("plan.review.entryTitle")}</UiText>
              <UiText style={shared.body2}>{t("plan.review.entryBody")}</UiText>
              {failureView("start")}
              <Button block label={t("plan.review.start")} loading={busy === "start"} onPress={() => void start()} variant="primary" />
            </>
          )}
        </View>
      ) : null}
      {view && draft && load.kind === "ready" ? (
        <>
          {failureView("start")}
          <Bubble me>{t("plan.review.fromBubble")}</Bubble>
          <Bubble>{[plan?.startsOn ? sinceText(`${plan.startsOn}T00:00:00+09:00`, t) : null, view.premiseMarks.length ? t("plan.review.introMarked") : t("plan.review.intro")].filter(Boolean).join("")}</Bubble>
          <PremiseCard
            rows={draft.premise}
            view={view}
            edits={edits}
            editing={editing}
            editable={open && sendable && busy === null}
            compact={draft.turns.length > 0}
            onEdit={setEditing}
            onChange={(key, value) => setEdits((current) => ({ ...current, [key]: value }))}
          />
          {draft.turns.map((turn) => {
            const latest = turn.n === lastTurn?.n && open;
            return (
              <ReviewTurn
                key={turn.n}
                turn={turn}
                ordinal={turnOrdinal(view, turn.n)}
                limit={limit}
                earned={plan?.score.total ?? null}
                latest={latest}
                busy={busy !== null}
                onToggle={(change, accepted) => void toggle(change, accepted)}
                footer={latest ? (
                  <TurnActions
                    left={sendable ? left : 0}
                    earned={plan?.score.total ?? null}
                    manualAvailable={draft.manualEditAvailable && busy === null}
                    changed={reviewHasChanges(draft, plan?.premise ?? null)}
                    confirming={busy === "confirm"}
                    disabled={busy !== null}
                    onManual={() => router.push(planDraftEditHref("app", draft.draftId) as Href)}
                    onConfirm={() => void confirm()}
                    onKeep={() => openMainTab(router, planTaskSegmentHref("app", planId))}
                  />
                ) : null}
              />
            );
          })}
          {failureView("toggle")}
          {!sendable && open ? <ReviewUsedUpNote limit={limit} resetsAt={view.resetsAt} reason={view.reviewLimitReason} /> : null}
          {!sendable && open && draft.turns.length === 0 ? <KitButton primary label={t("plan.review.understood")} onPress={close} /> : null}
          {!open ? <InlineProblem text={t("plan.review.closed")} /> : null}
        </>
      ) : null}
      {view && !open ? <Button label={t("plan.common.back")} onPress={close} variant="secondary" /> : null}
    </PlanChatFrame>
  );
}

/**
 * 「確定した前提」（b4 A3 ① #14 kit .prem）：标签 84 | 值 | 来源；AI 印的行铺豆沙底、值下面一行依据（.pflag）。
 * 点一行就地改（旧值划掉）。有修正之后折叠成 chip（每行第一段）+「すべて見る」（#16 .premc）。
 */
function PremiseCard({ rows, view, edits, editing, editable, compact, onEdit, onChange }: {
  rows: readonly PlanPremiseRow[];
  view: PlanReviewView;
  edits: Readonly<Record<string, string>>;
  editing: string | null;
  editable: boolean;
  compact: boolean;
  onEdit: (key: string | null) => void;
  onChange: (key: string, value: string) => void;
}) {
  const { styles, colors } = useStyles();
  const kit = useKitStyles().styles;
  const { t } = useOrbitLocale();
  const [all, setAll] = useState(false);
  const changed = premiseEdits(rows, edits).length;
  const head = (legend: string | null) => (
    <View accessibilityLabel={t("plan.review.premiseTitle")} style={styles.premHead}>
      <KitEmo emoji="📌" tone="teal" sm />
      <UiText accessibilityRole="header" style={styles.premTitle}>{t("plan.review.premiseTitle")}</UiText>
      {legend ? <UiText style={kit.lbl}>{legend}</UiText> : null}
    </View>
  );
  if (compact && !all) {
    return (
      <KitCard style={styles.premCard} testID="premise-card">
        {head(null)}
        <View style={styles.premc}>
          {rows.map((row) => <KitChip key={row.key} label={t("plan.review.premiseLine", { label: row.label, value: shortPremise(edits[row.key]?.trim() || row.value) })} style={styles.chipMax} />)}
          <UiPressable accessibilityRole="button" hitSlop={8} onPress={() => setAll(true)} style={styles.v2go}>
            <UiText style={styles.v2goText}>{t("plan.review.premiseAll")}</UiText>
            <Icon name="down" size={16} color={colors.ink2} />
          </UiPressable>
        </View>
      </KitCard>
    );
  }
  const flagged = rows.map((row) => {
    const value = edits[row.key];
    const isEdited = value !== undefined && value.trim() !== "" && value.trim() !== row.value;
    return Boolean(markOf(view.premiseMarks, row.key)) && !isEdited;
  });
  return (
    <KitCard style={styles.premCard} testID="premise-card">
      {head(changed ? t("plan.review.premiseChanged", { count: changed }) : view.premiseMarks.length ? t("plan.review.premiseMarkLegend") : null)}
      {rows.map((row, index) => {
        const mark = markOf(view.premiseMarks, row.key);
        const value = edits[row.key];
        const isEdited = value !== undefined && value.trim() !== "" && value.trim() !== row.value;
        const isEditing = editing === row.key;
        const flag = flagged[index]!;
        const evidence = mark ? markEvidenceTexts(mark) : [];
        const basis = evidence.length ? evidence.join(" · ") : mark?.reason || (mark?.evidenceIds.length ? t("plan.review.markEvidence", { count: mark.evidenceIds.length }) : null);
        return (
          <View key={row.key} style={[styles.prem, flag ? styles.premFlag : index > 0 && !flagged[index - 1] ? styles.line : null]} testID={flag ? "premise-marked" : "premise-row"}>
            {flag ? <View pointerEvents="none" style={styles.flagBg} /> : null}
            {/* 编辑中这一行不是按钮：输入框不能嵌在（禁用的）按钮里，读屏进不去。 */}
            <PremiseRowShell editing={isEditing} label={t("plan.review.premiseEdit", { label: row.label })} disabled={!editable} onPress={() => onEdit(row.key)} style={styles.premRow}>
              <UiText style={[kit.lbl, styles.premLabel]}>{row.label}</UiText>
              <View style={styles.premMid}>
                {isEditing ? (
                  <TextInput
                    accessibilityLabel={t("plan.review.premiseInput", { label: row.label })}
                    autoFocus
                    multiline
                    onBlur={() => onEdit(null)}
                    onChangeText={(next) => onChange(row.key, next)}
                    placeholderTextColor={colors.ink3Text}
                    selectionColor={colors.plum700}
                    style={styles.premInput}
                    value={value ?? row.value}
                  />
                ) : isEdited ? (
                  <>
                    <UiText style={styles.premStrike}>{row.value}</UiText>
                    <View style={styles.nw}><UiText style={styles.nwText}>{value!.trim()}</UiText></View>
                  </>
                ) : (
                  <UiText style={styles.premValue}>{row.value}</UiText>
                )}
                {flag && basis ? (
                  <View style={styles.pflag}>
                    <View style={styles.pflagIcon}><Icon name="refresh" size={16} color={colors.macApricotInk} /></View>
                    <UiText style={styles.pflagText}>{basis}</UiText>
                  </View>
                ) : null}
              </View>
              <View style={styles.psrc}><UiText style={styles.psrcText}>{t(SOURCE_KEYS[row.source])}</UiText></View>
            </PremiseRowShell>
            {flag && mark?.suggested && editable ? (
              <UiPressable accessibilityRole="button" accessibilityLabel={t("plan.review.useSuggested", { value: mark.suggested })} hitSlop={6} onPress={() => onChange(row.key, mark.suggested!)} style={styles.suggested}>
                <UiText style={styles.suggestedText}>{t("plan.review.useSuggested", { value: mark.suggested })}</UiText>
              </UiPressable>
            ) : null}
          </View>
        );
      })}
    </KitCard>
  );
}

function PremiseRowShell({ editing, label, disabled, onPress, style, children }: { editing: boolean; label: string; disabled: boolean; onPress: () => void; style: StyleProp<ViewStyle>; children: ReactNode }) {
  if (editing) return <View style={style}>{children}</View>;
  return <UiPressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={style}>{children}</UiPressable>;
}

/** One revision (b4 A3 ② #16 .k-rupd): the user's words, then only the changes with ✓ / ✕ on the latest, or 「今回は変更しません」. */
function ReviewTurn({ turn, ordinal, limit, earned, latest, busy, onToggle, footer }: {
  turn: PlanDraftTurn;
  ordinal: number;
  limit: number;
  earned: number | null;
  latest: boolean;
  busy: boolean;
  onToggle: (change: PlanDraftChange, accepted: boolean) => void;
  footer: ReactNode;
}) {
  const { styles } = useStyles();
  const kit = useKitStyles().styles;
  const { t } = useOrbitLocale();
  const changed = turn.changes.length > 0 && !turn.noChangeReason;
  const why = useKitWhy(turn.changes.map((change) => change.reason).filter(Boolean).join("\n") || null);
  const same = [...turn.unchanged, ...(earned !== null ? [t("plan.review.unchangedEarned", { points: earned })] : [])];
  return (
    <>
      {turn.input ? <Bubble me>{turn.input}</Bubble> : null}
      {/* 画板 #16：打开即滚到最新的修正卡（scrollto data-off 64）。 */}
      {latest ? <ChatMark scroll shift={6} /> : null}
      <KitCard style={styles.updCard} testID="review-turn">
        <View style={styles.updHead}>
          <KitEmo emoji="🧭" tone="teal" sm />
          <View style={kit.grow}>
            <UiText style={kit.lbl}>{t(changed ? "plan.review.turnTitle" : "plan.review.turnTitleNoChange", { k: ordinal, limit })}</UiText>
            <UiText accessibilityRole="header" style={styles.updName}>{changed ? t("plan.turn.updated") : t("plan.turn.unchangedTitle")}</UiText>
          </View>
          {why.button ?? <View style={styles.whySpace} />}
        </View>
        {changed ? (
          <View style={styles.diff}>
            {turn.changes.map((change, index) => {
              const accepted = change.accepted !== false;
              return (
                <View key={change.id ?? change.path} style={[styles.dl, index > 0 && styles.line]} testID="review-change">
                  <View style={styles.chgtag}><UiText style={styles.chgtagText}>{t("plan.turn.changed")}</UiText></View>
                  <View style={[kit.grow, !accepted && styles.rejected]}>
                    <UiText style={kit.lbl}>{change.label}</UiText>
                    {change.before ? <UiText style={styles.before}>{change.before}</UiText> : null}
                    {change.after ? <View style={styles.nw}><UiText style={styles.nwText}>{change.after}</UiText></View> : null}
                  </View>
                  {latest && change.id ? (
                    <View accessibilityRole="radiogroup" accessibilityLabel={change.label} style={styles.toggle}>
                      <ToggleCell icon="check" selected={accepted} disabled={busy} label={t("plan.review.accept", { label: change.label })} onPress={() => onToggle(change, true)} />
                      <ToggleCell icon="x" selected={!accepted} disabled={busy} label={t("plan.review.reject", { label: change.label })} onPress={() => onToggle(change, false)} />
                    </View>
                  ) : (
                    <KitChip label={t(accepted ? "plan.review.accepted" : "plan.review.rejected")} tone={accepted ? "lav" : "neutral"} style={styles.toggle} />
                  )}
                </View>
              );
            })}
          </View>
        ) : null}
        {changed && same.length ? <View style={styles.sameLine}><UiText style={styles.sameText}>{t("plan.turn.unchanged", { items: same.join(" · ") })}</UiText></View> : null}
        {!changed ? (
          <>
            <View style={[styles.sameLine, styles.noChange]}><UiText style={styles.sameText}>{turn.noChangeReason ?? t("plan.turn.unchangedTitle")}</UiText></View>
            <KitChip label={t("plan.review.countsNoChange")} style={styles.countsChip} />
          </>
        ) : null}
        {why.body}
        {footer}
      </KitCard>
    </>
  );
}

/** 最新修正卡的底部：「見直し 今月あと N 回」+ 獲得済み、手動で編集（1回）/ この内容で確定（没改就「このままにする」）、说明一行。 */
function TurnActions({ left, earned, manualAvailable, changed, confirming, disabled, onManual, onConfirm, onKeep }: {
  left: number;
  earned: number | null;
  manualAvailable: boolean;
  changed: boolean;
  confirming: boolean;
  disabled: boolean;
  onManual: () => void;
  onConfirm: () => void;
  /** 「このままにする」: back to the overview, nothing confirmed. */
  onKeep: () => void;
}) {
  const { styles } = useStyles();
  const kit = useKitStyles().styles;
  const { t } = useOrbitLocale();
  return (
    <>
      <View style={styles.leftRow}>
        <KitChip label={t("plan.review.chipLeft", { count: left })} tone="lav" />
        {earned !== null ? <UiText style={[kit.lbl, styles.leftNote]}>{t("plan.review.earnedShort", { after: earned, before: earned })}</UiText> : null}
      </View>
      <View style={styles.grid2}>
        <KitButton sm icon="pen" label={t("plan.review.manual")} onPress={onManual} disabled={!manualAvailable} style={styles.grid2Btn} testID="review-manual" />
        {changed
          ? <KitButton sm primary label={t("plan.review.confirm")} onPress={onConfirm} disabled={disabled || confirming} style={styles.grid2Btn} testID="review-confirm" />
          : <KitButton sm primary label={t("plan.review.keep")} onPress={onKeep} disabled={disabled} style={styles.grid2Btn} testID="review-keep" />}
      </View>
      {left > 0 ? <UiText style={[kit.lbl, styles.manualNote]}>{t("plan.review.manualNote", { count: left })}</UiText> : null}
    </>
  );
}

function ToggleCell({ icon, selected, disabled, label, onPress }: { icon: "check" | "x"; selected: boolean; disabled: boolean; label: string; onPress: () => void }) {
  const { styles, colors } = useStyles();
  return (
    <UiPressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected, disabled, selected }}
      aria-checked={selected}
      disabled={disabled}
      hitSlop={4}
      onPress={onPress}
      style={[styles.toggleCell, selected && (icon === "check" ? styles.toggleOn : styles.toggleOff)]}
    >
      <Icon name={icon} size={16} color={selected ? (icon === "check" ? colors.onAccent : colors.ink) : colors.ink3} />
    </UiPressable>
  );
}

/** 底部（kit .revbar + .composer）：「見直し · 今月 あと N 回」+ 规则，输入「ほかに変わったこと」/「もう一度直す」+ 送信。用完变灰。 */
function ReviewFooter({ view, text, onText, busy, onSend, canSend, failure }: {
  view: PlanReviewView;
  text: string;
  onText: (text: string) => void;
  busy: Op | null;
  onSend: () => void;
  canSend: boolean;
  failure: ReactNode;
}) {
  const { t } = useOrbitLocale();
  const sendable = canSendReview(view);
  const left = sendable ? view.reviewLeftThisMonth : 0;
  const turns = view.draft.turns.length;
  const outText = t(view.reviewLimitReason === "ai_budget" ? "plan.review.aiBudgetShort" : "plan.review.usedUpShort");
  return (
    <RevComposer
      label={t("plan.review.thisMonth")}
      left={left}
      leftLabel={t("plan.review.leftA11y", { count: left })}
      hint={sendable ? t("plan.review.barHint") : outText}
      example={t("plan.review.sendRules", { limit: view.reviewMonthlyLimit })}
      placeholder={!sendable ? outText : turns ? t("plan.review.composerAgain", { count: left }) : t("plan.review.otherLabel")}
      inputLabel={t("plan.review.otherLabel")}
      sendLabel={turns ? t("plan.review.again", { count: left }) : t("plan.review.send")}
      text={text}
      onText={onText}
      onSend={onSend}
      sending={busy !== null}
      canSend={canSend}
      above={failure}
    />
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  footNote: { gap: 6, paddingHorizontal: 6 },
  line: { borderTopWidth: 1, borderTopColor: colors.line },
  premCard: { paddingVertical: 12, paddingHorizontal: 16 },
  premHead: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2, marginBottom: 4 },
  premTitle: { flex: 1, color: colors.ink, ...kitText(14, "700") },
  premc: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6, alignItems: "center" },
  chipMax: { maxWidth: "100%" },
  v2go: { flexDirection: "row", alignItems: "center", gap: 4 },
  v2goText: { color: colors.ink2, ...kitText(12, "700") },
  prem: { paddingVertical: 8 },
  premFlag: { padding: 8, marginHorizontal: -8, marginVertical: 2, borderRadius: 12 },
  flagBg: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, borderRadius: 12, backgroundColor: colors.macApricot, opacity: 0.6 },
  premRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  premLabel: { width: 84, lineHeight: 19.38 },
  premMid: { flex: 1, minWidth: 0, alignItems: "flex-start" },
  premValue: { color: colors.ink, ...kitText(12.5, "400", 1.55) },
  premStrike: { color: colors.ink3, ...kitText(12.5, "400", 1.55), textDecorationLine: "line-through" },
  premInput: { alignSelf: "stretch", minHeight: 40, borderRadius: 12, borderWidth: 2, borderColor: colors.plum700, backgroundColor: colors.surface, paddingHorizontal: 10, paddingVertical: 6, color: colors.ink, fontSize: 12.5, lineHeight: 19.38, textAlignVertical: "top" },
  pflag: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4, paddingVertical: 1, paddingHorizontal: 6, borderRadius: 6, backgroundColor: colors.surface },
  pflagIcon: { width: 11, height: 11, alignItems: "center", justifyContent: "center", transform: [{ scale: 11 / 16 }] },
  pflagText: { flexShrink: 1, color: colors.macApricotInk, ...kitText(10.5, "800") },
  psrc: { backgroundColor: colors.surface2, borderRadius: 6, paddingVertical: 1, paddingHorizontal: 6 },
  psrcText: { color: colors.ink3, ...kitText(10, "800") },
  suggested: { alignSelf: "flex-start", marginTop: 6, marginLeft: 92, minHeight: 28, justifyContent: "center", paddingHorizontal: 10, borderRadius: 999, backgroundColor: colors.surface },
  suggestedText: { color: colors.accentText, ...kitText(11.5, "700") },
  updCard: { paddingVertical: 14, paddingHorizontal: 16 },
  updHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  updName: { color: colors.ink, ...kitText(14.5, "700") },
  whySpace: { width: 18 },
  diff: { marginTop: 6 },
  dl: { flexDirection: "row", gap: 10, paddingVertical: 9 },
  chgtag: { alignSelf: "flex-start", paddingVertical: 2, paddingHorizontal: 7, borderRadius: 6, backgroundColor: colors.macLav },
  chgtagText: { color: colors.macLavInk, ...kitText(10, "800") },
  before: { color: colors.ink3, ...kitText(12.5, "400", 1.55), textDecorationLine: "line-through", marginTop: 4 },
  nw: { alignSelf: "flex-start", marginTop: 4, backgroundColor: colors.macLav, borderRadius: 8, paddingVertical: 2, paddingHorizontal: 6 },
  nwText: { color: colors.ink, ...kitText(12.5, "800", 1.55) },
  rejected: { opacity: 0.45 },
  toggle: { flexDirection: "row", gap: 6, alignSelf: "center" },
  toggleCell: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface2 },
  toggleOn: { backgroundColor: colors.plum700 },
  toggleOff: { backgroundColor: colors.surface3 },
  sameLine: { marginTop: 8, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12, backgroundColor: colors.surface2 },
  noChange: { marginTop: 10 },
  sameText: { color: colors.ink2, ...kitText(12, "400", 1.6) },
  countsChip: { alignSelf: "flex-start", marginTop: 8 },
  leftRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  leftNote: { marginLeft: "auto" },
  grid2: { flexDirection: "row", gap: 12, marginTop: 8 },
  grid2Btn: { flex: 1 },
  manualNote: { marginTop: 8, lineHeight: 18.4 },
  note: { backgroundColor: colors.macApricot, borderRadius: radius.md, padding: 12, gap: 8 },
  noteText: { color: colors.macApricotText, fontSize: 13, lineHeight: 20, fontWeight: "600" },
  noteTitle: { color: colors.macApricotText, fontSize: 14, lineHeight: 20, fontWeight: "800" },
}));
