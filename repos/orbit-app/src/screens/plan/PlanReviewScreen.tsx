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
import { StyleSheet, TextInput, View } from "react-native";

import type { PlanDraftChange, PlanDraftTurn, PlanPremiseRow, PlanReviewView, PlanV2Detail } from "../../api/contract/plan-v2";
import { planDraftEditHref, planTaskSegmentHref } from "../../api/compute/plan-href";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { openMainTab } from "../../components/shell-navigation";
import { Button, Chip, Icon, RetryCard, Skeleton, UiPressable, UiText, useToast, WhyDisclosure } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { radius } from "../../design/tokens";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { fillCopy, useStandardCopy } from "../../i18n/standard-copy";
import { usePlanApi, type PlanFailure } from "./plan-api";
import { newIdempotencyKey } from "./plan-model";
import { canSendReview, markEvidenceTexts, markOf, premiseEdits, reviewStage, turnOrdinal } from "./plan-review-model";
import { QuotaBar, ReviewProgress, ReviewUsedUpNote } from "./plan-review-ui";
import { FailureNote, InlineProblem, PlanFrame, Tag, usePlanStyles } from "./plan-ui";

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
    <PlanFrame
      title={t("plan.review.title")}
      subtitle={draft?.goal ?? plan?.goal}
      stage={null}
      progress={<ReviewProgress stage={stage} />}
      onClose={close}
      footer={view && open ? (
        <ReviewFooter
          view={view}
          text={text}
          onText={setText}
          busy={busy}
          onSend={() => void send()}
          onManual={() => draft && router.push(planDraftEditHref("app", draft.draftId) as Href)}
          onConfirm={() => void confirm()}
          onClose={close}
          failure={failureView("confirm")}
        />
      ) : undefined}
    >
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
          <UiText style={shared.body2}>{view.premiseMarks.length ? t("plan.review.introMarked") : t("plan.review.intro")}</UiText>
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
          {draft.turns.map((turn) => (
            <ReviewTurn
              key={turn.n}
              turn={turn}
              ordinal={turnOrdinal(view, turn.n)}
              limit={limit}
              earned={plan?.score.total ?? null}
              latest={turn.n === lastTurn?.n && open}
              busy={busy !== null}
              onToggle={(change, accepted) => void toggle(change, accepted)}
            />
          ))}
          {busy === "send" ? <UiText style={shared.caption}>{t("plan.review.sending")}</UiText> : null}
          {failureView("send")}
          {failureView("toggle")}
          {!sendable && open ? <ReviewUsedUpNote limit={limit} resetsAt={view.resetsAt} /> : null}
          {!open ? <InlineProblem text={t("plan.review.closed")} /> : null}
          {left > 0 && sendable && draft.turns.length > 0 ? <UiText style={[shared.caption, styles.center]}>{t("plan.review.leftNote", { count: left })}</UiText> : null}
        </>
      ) : null}
      {view && !open ? <Button label={t("plan.common.back")} onPress={close} variant="secondary" /> : null}
    </PlanFrame>
  );
}

/** 「確定した前提」: each row with its source; AI marks in 豆沙; tap a row to change it in place. */
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
  const shared = usePlanStyles().styles;
  const { styles, colors } = useStyles();
  const { t } = useOrbitLocale();
  const [all, setAll] = useState(false);
  const changed = premiseEdits(rows, edits).length;
  if (compact && !all) {
    return (
      <View style={shared.card} testID="premise-card">
        <View style={shared.row}>
          <UiText style={shared.emoji}>📌</UiText>
          <UiText accessibilityRole="header" style={[shared.title, shared.grow]}>{t("plan.review.premiseTitle")}</UiText>
        </View>
        {rows.map((row) => <UiText key={row.key} numberOfLines={1} style={shared.body2}>{t("plan.review.premiseLine", { label: row.label, value: edits[row.key]?.trim() || row.value })}</UiText>)}
        <UiPressable accessibilityRole="button" hitSlop={8} onPress={() => setAll(true)} style={styles.link}>
          <UiText style={styles.linkText}>{t("plan.review.premiseAll")}</UiText>
        </UiPressable>
      </View>
    );
  }
  return (
    <View style={shared.card} testID="premise-card">
      <View style={shared.row}>
        <UiText style={shared.emoji}>📌</UiText>
        <UiText accessibilityRole="header" style={[shared.title, shared.grow]}>{t("plan.review.premiseTitle")}</UiText>
        <UiText style={shared.caption}>{changed ? t("plan.review.premiseChanged", { count: changed }) : view.premiseMarks.length ? t("plan.review.premiseMarkLegend") : ""}</UiText>
      </View>
      {rows.map((row) => {
        const mark = markOf(view.premiseMarks, row.key);
        const value = edits[row.key];
        const isEdited = value !== undefined && value.trim() !== "" && value.trim() !== row.value;
        const isEditing = editing === row.key;
        return (
          <View key={row.key} style={[styles.premiseRow, mark && !isEdited && styles.premiseMarked]} testID={mark ? "premise-marked" : "premise-row"}>
            <UiPressable
              accessibilityRole="button"
              accessibilityLabel={t("plan.review.premiseEdit", { label: row.label })}
              disabled={!editable || isEditing}
              onPress={() => onEdit(row.key)}
              style={styles.premiseHead}
            >
              <View style={[shared.row, shared.grow]}>
                <UiText style={shared.label}>{row.label}</UiText>
                {mark && !isEdited ? <Chip label={t("plan.review.markChip")} tone="pink" /> : null}
              </View>
              <Tag label={t(SOURCE_KEYS[row.source])} />
            </UiPressable>
            {isEditing ? (
              <TextInput
                accessibilityLabel={t("plan.review.premiseInput", { label: row.label })}
                autoFocus
                multiline
                onBlur={() => onEdit(null)}
                onChangeText={(next) => onChange(row.key, next)}
                placeholderTextColor={colors.ink3Text}
                style={[shared.input, styles.inputActive]}
                value={value ?? row.value}
              />
            ) : isEdited ? (
              <View style={styles.editedValue}>
                <UiText style={shared.strike}>{row.value}</UiText>
                <UiText style={shared.after}>{value!.trim()}</UiText>
              </View>
            ) : (
              <UiText style={shared.body}>{row.value}</UiText>
            )}
            {mark && !isEdited ? (
              <View style={styles.markBody}>
                {mark.reason ? <UiText style={styles.markText}>{mark.reason}</UiText> : null}
                {markEvidenceTexts(mark).map((text, index) => <UiText key={index} style={styles.markText}>{t("plan.review.markEvidenceLine", { text })}</UiText>)}
                {mark.evidenceIds.length && markEvidenceTexts(mark).length === 0 ? <UiText style={styles.markText}>{t("plan.review.markEvidence", { count: mark.evidenceIds.length })}</UiText> : null}
                {mark.suggested && editable ? (
                  <UiPressable accessibilityRole="button" accessibilityLabel={t("plan.review.useSuggested", { value: mark.suggested })} onPress={() => onChange(row.key, mark.suggested!)} style={styles.suggested}>
                    <UiText style={styles.suggestedText}>{t("plan.review.useSuggested", { value: mark.suggested })}</UiText>
                  </UiPressable>
                ) : null}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

/** One revision: the user's words, then only the changes (✓ / ✕ on the latest), or 「今回は変更しません」. */
function ReviewTurn({ turn, ordinal, limit, earned, latest, busy, onToggle }: {
  turn: PlanDraftTurn;
  ordinal: number;
  limit: number;
  earned: number | null;
  latest: boolean;
  busy: boolean;
  onToggle: (change: PlanDraftChange, accepted: boolean) => void;
}) {
  const shared = usePlanStyles().styles;
  const { styles } = useStyles();
  const { t } = useOrbitLocale();
  const changed = turn.changes.length > 0 && !turn.noChangeReason;
  return (
    <View style={styles.turn} testID="review-turn">
      {turn.input ? <View style={shared.bubble}><UiText style={shared.bubbleText}>{turn.input}</UiText></View> : null}
      <View style={shared.card}>
        <View style={shared.row}>
          <UiText style={shared.emoji}>🧭</UiText>
          <View style={shared.grow}>
            <UiText style={shared.title}>{t(changed ? "plan.review.turnTitle" : "plan.review.turnTitleNoChange", { k: ordinal, limit })}</UiText>
            <UiText style={shared.caption}>{changed ? t("plan.turn.updated") : t("plan.turn.unchangedTitle")}</UiText>
          </View>
        </View>
        {changed ? turn.changes.map((change) => {
          const accepted = change.accepted !== false;
          return (
            <View key={change.id ?? change.path} style={styles.change} testID="review-change">
              <View style={shared.row}>
                <Tag label={t("plan.turn.changed")} tone="accent" />
                <UiText style={[shared.label, shared.grow]}>{change.label}</UiText>
                {change.reason ? <WhyDisclosure reason={change.reason} /> : null}
              </View>
              <View style={shared.rowTop}>
                <View style={[shared.grow, styles.changeBody, !accepted && styles.rejected]}>
                  {change.before ? <UiText style={shared.strike}>{change.before}</UiText> : null}
                  {change.after ? <UiText style={shared.after}>{change.after}</UiText> : null}
                </View>
                {latest && change.id ? (
                  <View accessibilityRole="radiogroup" accessibilityLabel={change.label} style={styles.toggle}>
                    <ToggleCell icon="check" selected={accepted} disabled={busy} label={t("plan.review.accept", { label: change.label })} onPress={() => onToggle(change, true)} />
                    <ToggleCell icon="x" selected={!accepted} disabled={busy} label={t("plan.review.reject", { label: change.label })} onPress={() => onToggle(change, false)} />
                  </View>
                ) : (
                  <Chip label={t(accepted ? "plan.review.accepted" : "plan.review.rejected")} tone={accepted ? "lav" : "neutral"} />
                )}
              </View>
            </View>
          );
        }) : (
          <>
            <UiText style={shared.body2}>{turn.noChangeReason ?? t("plan.turn.unchangedTitle")}</UiText>
            <Chip label={t("plan.review.countsNoChange")} tone="neutral" />
          </>
        )}
        {turn.unchanged.length ? <UiText style={shared.caption}>{t("plan.turn.unchanged", { items: turn.unchanged.join(" · ") })}</UiText> : null}
        {earned !== null ? <UiText style={shared.caption}>{t("plan.review.earned", { points: earned })}</UiText> : null}
      </View>
    </View>
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
      <Icon name={icon} size={16} color={selected ? (icon === "check" ? colors.onAccent : colors.ink) : colors.ink3Text} />
    </UiPressable>
  );
}

/** The fixed bottom: the quota line, 「ほかに変わったこと」, send; after a revision, 手動編集 / 確定. */
function ReviewFooter({ view, text, onText, busy, onSend, onManual, onConfirm, onClose, failure }: {
  view: PlanReviewView;
  text: string;
  onText: (text: string) => void;
  busy: Op | null;
  onSend: () => void;
  onManual: () => void;
  onConfirm: () => void;
  onClose: () => void;
  failure: ReactNode;
}) {
  const shared = usePlanStyles().styles;
  const { styles, colors } = useStyles();
  const { t } = useOrbitLocale();
  const left = view.reviewLeftThisMonth;
  const limit = view.reviewMonthlyLimit;
  const sendable = canSendReview(view);
  const turns = view.draft.turns;
  const last = turns.at(-1) ?? null;
  const noChange = Boolean(last && (last.changes.length === 0 || last.noChangeReason));
  return (
    <View style={styles.footer} testID="review-footer">
      <View style={shared.row}>
        <UiText style={shared.label}>{t("plan.review.thisMonth")}</UiText>
        <UiText accessibilityLabel={t("plan.review.leftA11y", { count: left })} style={[shared.bigNumber, left === 0 && shared.bigNumberOut]}>{t("plan.review.left", { count: left })}</UiText>
        <View style={shared.grow}><QuotaBar left={left} limit={limit} /></View>
      </View>
      {sendable ? (
        <>
          <UiText style={shared.caption}>{t("plan.review.sendRules", { limit })}</UiText>
          <TextInput
            accessibilityLabel={t("plan.review.otherLabel")}
            editable={busy === null}
            multiline
            onChangeText={onText}
            placeholder={t("plan.review.otherPlaceholder")}
            placeholderTextColor={colors.ink3Text}
            style={[shared.input, styles.field]}
            value={text}
          />
          <Button
            block
            label={turns.length ? t("plan.review.again", { count: left }) : t("plan.review.send")}
            loading={busy === "send"}
            disabled={busy !== null && busy !== "send"}
            onPress={onSend}
            variant={turns.length ? "secondary" : "primary"}
          />
          <UiText style={[shared.caption, styles.center]}>{t("plan.review.sendNote", { after: left - 1, before: left })}</UiText>
        </>
      ) : (
        <View style={[shared.input, styles.fieldOff]}>
          <UiText style={shared.caption}>{t("plan.review.usedUpShort")}</UiText>
        </View>
      )}
      {failure}
      {turns.length ? (
        <View style={shared.footerRow}>
          <View style={shared.grow}><Button block disabled={!view.draft.manualEditAvailable || busy !== null} label={t("plan.review.manual")} onPress={onManual} variant="secondary" /></View>
          <View style={shared.grow}><Button block label={noChange ? t("plan.review.keep") : t("plan.review.confirm")} loading={busy === "confirm"} disabled={busy !== null && busy !== "confirm"} onPress={onConfirm} variant="primary" /></View>
        </View>
      ) : !sendable ? (
        <Button block label={t("plan.review.understood")} onPress={onClose} variant="primary" />
      ) : null}
    </View>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  center: { textAlign: "center" },
  link: { alignSelf: "flex-start", minHeight: 24, justifyContent: "center" },
  linkText: { color: colors.accentText, fontSize: 12, fontWeight: "700" },
  premiseRow: { gap: 6, padding: 10, marginHorizontal: -6, borderRadius: radius.md },
  premiseMarked: { backgroundColor: colors.macPink },
  premiseHead: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 28 },
  inputActive: { borderColor: colors.plum700, borderWidth: 2, minHeight: 56, textAlignVertical: "top" },
  editedValue: { gap: 4, alignItems: "flex-start" },
  markBody: { gap: 4 },
  markText: { color: colors.macPinkText, fontSize: 12, lineHeight: 17, fontWeight: "600" },
  suggested: { alignSelf: "flex-start", minHeight: 32, justifyContent: "center", paddingHorizontal: 12, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  suggestedText: { color: colors.accentText, fontSize: 12, fontWeight: "700" },
  turn: { gap: 8 },
  change: { gap: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.line },
  changeBody: { gap: 4 },
  rejected: { opacity: 0.45 },
  toggle: { flexDirection: "row", gap: 6 },
  toggleCell: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface2 },
  toggleOn: { backgroundColor: colors.plum700 },
  toggleOff: { backgroundColor: colors.surface3 },
  footer: { gap: 8 },
  field: { minHeight: 44, maxHeight: 96, textAlignVertical: "top" },
  fieldOff: { backgroundColor: colors.surface2, justifyContent: "center" },
  note: { backgroundColor: colors.macApricot, borderRadius: radius.md, padding: 12, gap: 8 },
  noteText: { color: colors.macApricotText, fontSize: 13, lineHeight: 20, fontWeight: "600" },
  noteTitle: { color: colors.macApricotText, fontSize: 14, lineHeight: 20, fontWeight: "800" },
}));
