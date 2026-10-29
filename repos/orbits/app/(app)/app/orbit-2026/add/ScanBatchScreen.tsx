"use client";

import { useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";

import { planTaskSegmentHref } from "../../../../../shared/compute/plan-href";
import { appendWebGuideReturnTo, type WebGuideReturnTo } from "../../../../../features/guide/return-to";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { INDUSTRY_CATALOG, isIndustryIdCode, listSecondaryIndustries } from "../../../../../shared/domain/industries";
import { regionDisplayName } from "../../../../../shared/domain/regions";
import { seniorityLevelLabel } from "../../../../../shared/domain/seniority";
import {
  INGEST_V2_FIELDS,
  fieldCandidates,
  industryCandidates,
  regionCandidates,
  seniorityCandidates,
  setDraftFieldSource,
  setDraftIndustry,
  setDraftRegion,
  setDraftSeniority,
  setManualDraftField,
  setManualDraftNotes,
  type IngestV2CardDraft,
  type IngestV2Field,
} from "../../contacts/ingest-v2/ingest-v2-route-view-model";
import { INGEST_V2_MAX_ITEMS, INGEST_V2_MAX_RAW_BYTES } from "../../../../../features/acquisition/business-card-ingest-v2/contract";
import { useOrbitLanguage } from "../../orbit-language-context";
import { addBatchCopy as b, addDoorsCopy, addManualCopy, addScanCopy as s } from "../copy/add";
import type { OrbitCopyEntry } from "../copy/types";
import { ShellPage } from "../shell/slots";
import { Button, Card, Chip, CountUp, FilterOption, Icon, IconButton, Kbd, MacTile, Orbit2026Scope, ProgressBar, Skeleton, TextField, ToastProvider } from "../ui";
import { DensityDots, translator, type Translate } from "./add-parts";
import { IngestV2PrivateImage } from "../../contacts/ingest-v2/ingest-v2-private-image";
import { INGEST_V2_API_BASE } from "../../contacts/ingest-v2/ingest-v2-client";
import { ManualContactDrawer } from "./ManualContactDrawer";
import { DropZone, ScanGuide, useStagedCards, type ScanStartResult } from "./ScanUploadScreen";
import type { StagedCard } from "./upload-model";
import type { ScanBatchActions, ScanBatchView, ScanCardKind, ScanCardView, ScanIssueGroup, ScanSettleResult } from "./scan-types";
import styles from "./add.module.css";

const KIND_CHIP: Partial<Record<ScanCardKind, { copy: OrbitCopyEntry; tone: "lav" | "apricot" | "coral" | "neutral" | "ok" }>> = {
  uploading: { copy: b.stateUploading, tone: "neutral" },
  queued: { copy: b.stateQueued, tone: "neutral" },
  reading: { copy: b.stateReading, tone: "neutral" },
  duplicate: { copy: b.stateDuplicate, tone: "lav" },
  guess: { copy: b.stateGuess, tone: "apricot" },
  failed: { copy: b.stateFailed, tone: "coral" },
  added: { copy: b.stateAdded, tone: "ok" },
  skipped: { copy: b.stateSkipped, tone: "neutral" },
};

const GROUP_COPY: Record<ScanIssueGroup, OrbitCopyEntry> = {
  name: b.groupName,
  orgSuffix: b.groupOrgSuffix,
  misread: b.groupMisread,
  sides: b.groupSides,
  enrichment: b.groupEnrichment,
  format: b.groupFormat,
  other: b.groupOther,
};
const FIELD_COPY: Record<IngestV2Field, OrbitCopyEntry> = {
  displayName: b.fieldName,
  organization: b.fieldOrganization,
  role: b.fieldRole,
  email: b.fieldEmail,
  phone: b.fieldPhone,
  address: b.fieldAddress,
};

const MATCH_COPY: Record<string, OrbitCopyEntry> = { email: b.matchedEmail, phone: b.matchedPhone, name_organization: b.matchedNameOrg, name: b.matchedName };


/**
 * The single-line Enter of the review (b1 B5 ↵): not inside a textarea, a button, a select,
 * a checkbox / radio or a listbox — there Enter belongs to the control.
 */
export function enterConfirms(event: { key: string; isComposing?: boolean; target: unknown }): boolean {
  if (event.key !== "Enter" || event.isComposing) return false;
  const target = event.target as { tagName?: string; getAttribute?: (name: string) => string | null } | null;
  const tag = target?.tagName?.toUpperCase();
  if (tag === "TEXTAREA" || tag === "BUTTON" || tag === "SELECT" || tag === "OPTION" || tag === "A") return false;
  const type = target?.getAttribute?.("type")?.toLowerCase();
  if (tag === "INPUT" && (type === "checkbox" || type === "radio")) return false;
  const role = target?.getAttribute?.("role");
  return role !== "combobox" && role !== "listbox" && role !== "option" && role !== "radio";
}

function typing(target: unknown): boolean {
  const tag = (target as { tagName?: string } | null)?.tagName?.toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function dayLabel(iso: string | null, language: OrbitLanguage): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(language === "en" ? "en-US" : language === "zh" ? "zh-CN" : "ja-JP", { month: "long", day: "numeric" });
}

/**
 * `/app/contacts/new/scan/[batchId]` (R12, DESIGN §2.2 steps 4–7, Web): 読み取り中 (each card:
 * name / 読み取り中 / 重複 / 推測あり / 読み取れず) → the clean ones go straight into 人脈 →
 * まとめて確認 (three tiles, one 会った場所 for the batch, 重複 side by side, 要確認 by issue,
 * 読み取れず with 撮り直す / 手入力で補う / スキップ) → 完成 (new / merged / unreadable).
 * Keyboard: ↵ confirm · → next card · S skip.
 */
// Opened from the guide: a person added by hand stays here (toast only) instead of opening their page outside the guide.
const stayInGuide = () => undefined;

export function ScanBatchScreen({ view, actions, onStart, returnTo = null }: { view: ScanBatchView; actions: ScanBatchActions; onStart?: (cards: readonly StagedCard[]) => Promise<ScanStartResult>; returnTo?: WebGuideReturnTo | null }) {
  const { language, preserveHref } = useOrbitLanguage();
  const router = useRouter();
  const t = translator(language);
  // Pages inside the scan flow keep the guide's return target, so 「もっとスキャン」 and retry stay in the onboarding frame.
  const go = (href: string) => router.push(preserveHref(href.startsWith("/app/contacts/new/scan") ? appendWebGuideReturnTo(href, returnTo) : href));
  const reading = view.phase === "uploading" || view.phase === "reading" || view.phase === "importing";
  const title = reading ? t(s.pageTitle) : view.phase === "review" ? t(b.reviewPageTitle) : t(b.pageTitle);
  const left = view.cards.filter((card) => card.section === "duplicate" || card.section === "review" || card.section === "failed").length;
  const added = view.cards.filter((card) => card.card.allConfirmed).length;
  const subtitle = view.phase === "review" ? t(left ? b.reviewPageSub : b.reviewPageSubDone, { n: view.cards.length, added, left }) : t(s.pageSubtitle);
  const back = <IconButton icon="left" label={t(returnTo ? s.backToGuide : s.back)} onClick={() => go(returnTo ?? "/app/contacts/new")} />;
  return (
    <Orbit2026Scope language={language} className={styles.page}>
      <ToastProvider>
        <ShellPage title={title} subtitle={subtitle} left={back} />
        <div className={styles.fade} data-scan-batch={view.batchId} data-scan-phase={view.phase}>
          {view.phase === "loading" ? <Skeleton lines={6} /> : null}
          {view.phase === "missing" || view.phase === "expired" || view.phase === "cancelled" ? <BatchErrorCard phase={view.phase} t={t} go={go} /> : null}
          {view.phase === "uploading" || view.phase === "reading" || view.phase === "importing" ? <ReadingPanel view={view} actions={actions} t={t} onStart={onStart} onStarted={(id) => go(`/app/contacts/new/scan/${encodeURIComponent(id)}`)} onNavigate={returnTo ? stayInGuide : go} /> : null}
          {view.phase === "review" ? <ReviewPanel view={view} actions={actions} t={t} language={language} onLater={() => go(returnTo ?? "/app/contacts")} /> : null}
          {view.phase === "done" ? <DonePanel view={view} t={t} language={language} go={go} returnTo={returnTo} /> : null}
        </div>
      </ToastProvider>
    </Orbit2026Scope>
  );
}

function CardRow({ card, t, trailing }: { card: ScanCardView; t: Translate; trailing?: ReactNode }) {
  const chip = KIND_CHIP[card.kind];
  const pending = card.kind === "uploading" || card.kind === "queued" || card.kind === "reading";
  const sub = [card.organization, card.role].filter(Boolean).join(" · ") || card.fileName;
  return (
    <li className={styles.listRow} data-scan-card={card.cardId} data-scan-kind={card.kind}>
      <span className={`${styles.cardTile} ${card.kind === "failed" ? styles.cardTileFail : pending ? "" : styles.cardTileRead}`} aria-hidden />
      <span className={styles.grow}>
        <b className={styles.ellipsis}>{pending ? t(b.stateReading) : card.name || t(b.noName)}</b>
        <span className={`${styles.label} ${styles.ellipsis}`}>{sub}</span>
      </span>
      {card.twoSided ? <Chip label={t(b.sideBoth)} /> : null}
      {chip ? <Chip label={t(chip.copy)} tone={chip.tone} /> : card.kind === "ready" ? <Icon name="check" size={16} /> : null}
      {trailing}
    </li>
  );
}

/**
 * 読み取り中 (b11 A1 Web, the same page as the drop zone): 📇 drop zone (more photos start a new batch),
 * アップロード中 N枚 · M枚 読み取り済み with one row per card (✓ / 推測あり / 重複 / N枚目を読み取り中 /
 * 画像を読み取れませんでした with 差し替える · 手入力で補う), はじめての方へ on the right.
 */
function ReadingPanel({ view, actions, t, onStart, onStarted, onNavigate }: { view: ScanBatchView; actions: ScanBatchActions; t: Translate; onStart?: (cards: readonly StagedCard[]) => Promise<ScanStartResult>; onStarted: (batchId: string) => void; onNavigate: (href: string) => void }) {
  const reattach = useRef<HTMLInputElement | null>(null);
  const [manual, setManual] = useState(false);
  const stage = useStagedCards(t, INGEST_V2_MAX_ITEMS, INGEST_V2_MAX_RAW_BYTES);
  const started = useRef(0);
  // Photos dropped here start their own batch straight away (this one keeps reading).
  useEffect(() => {
    if (!onStart || !stage.cards.length || stage.starting || started.current === stage.cards.length) return;
    started.current = stage.cards.length;
    void stage.start(onStart).then((batchId) => { if (batchId) { stage.clear(); onStarted(batchId); } });
  }, [onStart, onStarted, stage]);
  const total = view.cards.length;
  const settled = view.phase === "uploading" ? 0 : view.settled;
  return (
    <div className={styles.wgrid}>
      <Card className={`${styles.span8} ${styles.uploadCard}`} data-scan-reading="">
        <DropZone t={t} stage={stage} maxPhotos={INGEST_V2_MAX_ITEMS} />
        {stage.input}
        <div className={styles.cardH}>
          <h3 aria-live="polite">{view.phase === "importing" ? t(b.importing) : t(b.uploadHead)} <span className={styles.cardHMeta}>{t(b.uploadMeta, { n: view.photos || total, done: settled })}</span></h3>
          <span className={styles.cardHNote}>{t(b.keepGoing)}</span>
        </div>
        {view.uploadFailed ? (
          <p className={styles.notice} role="alert"><Icon name="alert" size={16} /><span>{t(b.uploadFailed)}</span><Button size="sm" label={t(b.retryUpload)} onClick={actions.retryUpload} /></p>
        ) : null}
        {view.missingFiles > 0 ? (
          <p className={styles.notice} data-scan-missing={view.missingFiles}>
            <Icon name="info" size={16} /><span>{t(b.missingFiles, { n: view.missingFiles })}</span>
            <Button size="sm" label={t(b.reselect)} onClick={() => reattach.current?.click()} />
            <input ref={reattach} className={styles.srOnly} type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" tabIndex={-1} aria-hidden onChange={(event) => { actions.reattach(event.target.files); event.target.value = ""; }} />
          </p>
        ) : null}
        <div>{view.cards.map((card, index) => <UploadRow key={card.cardId} card={card} index={index} t={t} actions={actions} onManual={() => setManual(true)} />)}</div>
      </Card>
      {/* 手入力で補う while reading: add the person by hand; the unreadable card stays to skip in まとめて確認. */}
      <ManualContactDrawer open={manual} onClose={() => setManual(false)} navigate={onNavigate} />
      <ScanGuide t={t} className={styles.span4} />
    </div>
  );
}

function UploadRow({ card, index, t, actions, onManual }: { card: ScanCardView; index: number; t: Translate; actions: ScanBatchActions; onManual: () => void }) {
  const file = useRef<HTMLInputElement | null>(null);
  const [replaceFailed, setReplaceFailed] = useState(false);
  const pending = card.kind === "uploading" || card.kind === "queued" || card.kind === "reading";
  const failed = card.kind === "failed";
  const sub = pending ? t(card.twoSided ? b.sideBoth : b.sideFront) : failed ? card.fileName : [card.organization, card.role].filter(Boolean).join(" · ") || card.fileName;
  // N枚目 = the photo number in the batch (its first photo), not the row.
  const title = pending ? t(b.readingNth, { n: Math.min(...card.card.items.map((entry) => entry.seq)) || index + 1 }) : failed ? t(card.failure === "busy" ? b.failedBusy : b.failedImage) : card.name || t(b.noName);
  return (
    <div className={styles.prow} data-scan-card={card.cardId} data-scan-kind={card.kind}>
      <span className={`${styles.tp} ${failed ? styles.tpNg : ""}`} aria-hidden />
      <div className={styles.prowMeta}><b>{title}</b><span>{sub}</span></div>
      {pending ? <span className={styles.spin} aria-hidden /> : null}
      {card.kind === "guess" ? <Chip label={t(b.stateGuess)} tone="apricot" /> : null}
      {card.kind === "duplicate" ? <Chip label={t(b.stateDuplicate)} tone="lav" /> : null}
      {card.kind === "skipped" ? <Chip label={t(b.stateSkipped)} /> : null}
      {card.kind === "ready" || card.kind === "added" ? <span className={styles.okd} aria-label={t(b.stateAdded)}><Icon name="check" size={16} /></span> : null}
      {failed ? (
        <>
          <Button size="sm" label={t(b.replace)} onClick={() => file.current?.click()} data-failed-retake={card.cardId} />
          <input ref={file} className={styles.srOnly} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" tabIndex={-1} aria-hidden onChange={(event) => {
            const picked = event.target.files?.[0];
            event.target.value = "";
            if (picked) void actions.replace(card.cardId, picked).then((ok) => setReplaceFailed(!ok));
          }} />
          <Button size="sm" variant="ghost" label={t(b.typeIn)} onClick={onManual} data-failed-manual={card.cardId} />
        </>
      ) : null}
      {replaceFailed ? <span className={styles.error} role="alert">{t(b.replaceFailed)}</span> : null}
    </div>
  );
}

function AfterCard({ t }: { t: Translate }) {
  return (
    <Card variant="flat">
      <div className={styles.stack}>
        <span className={styles.sectionTitle}>{t(s.afterTitle)}</span>
        <div className={styles.steps}>
          <Chip label={`🤖 ${t(s.afterRead)}`} /><Icon name="right" size={16} /><Chip label={`✅ ${t(s.afterCheck)}`} /><Icon name="right" size={16} /><Chip label={`👥 ${t(s.afterAdd)}`} />
        </div>
        <p className={styles.privacy}>🔒 {t(s.privacy)}</p>
      </div>
    </Card>
  );
}

type Choice = "merge" | "separate";
type Settled = "added" | "merged" | "skipped";

const REASON_TONE: Record<"duplicate" | "review" | "failed", string> = { duplicate: styles.reasonDup, review: styles.reasonCheck, failed: styles.reasonFail };
const QUEUE_CHIP: Record<"duplicate" | "review" | "failed", { copy: OrbitCopyEntry; tone: "lav" | "apricot" | "coral" }> = {
  duplicate: { copy: b.stateDuplicate, tone: "lav" },
  review: { copy: b.stateGuess, tone: "apricot" },
  failed: { copy: b.stateFailed, tone: "coral" },
};
const RESULT_COPY: Record<Settled, OrbitCopyEntry> = { added: b.resultAdded, merged: b.resultMerged, skipped: b.resultSkipped };
const COMPARE_FIELDS = [["displayName", b.fieldName], ["organization", b.fieldOrganization], ["role", b.fieldRole], ["email", b.fieldEmail], ["phone", b.fieldPhone], ["address", b.fieldAddress]] as const;

/** Cards that ask the person something (重複 / 要確認 / 読み取れず); clean held cards wait for the end. */
function asks(card: ScanCardView): card is ScanCardView & { section: "duplicate" | "review" | "failed" } {
  return card.section === "duplicate" || card.section === "review" || card.section === "failed";
}

/**
 * 名刺を確認 (2026-10-29 v2, docs/designs/redesign-2026-10/card-confirm-v2-proposal.html): one card at a time —
 * the photo beside everything that was read, why it needs a look on top, and one decision per card
 * (人脈に追加 / ○○ に統合 / 新しく追加 / 追加しない; 読み取れず: 撮り直す / 手入力). Every decision is saved
 * at once; clean cards held for 会った場所 are added together once the queue is done.
 * Keyboard: ↵ confirm · → next card · S leave out.
 */
function ReviewPanel({ view, actions, t, language, onLater }: { view: ScanBatchView; actions: ScanBatchActions; t: Translate; language: OrbitLanguage; onLater: () => void }) {
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [focused, setFocused] = useState<string | null>(null);
  const [problems, setProblems] = useState<Record<string, ScanSettleResult>>({});
  const [settled, setSettled] = useState<Record<string, Settled>>({});
  const [busy, setBusy] = useState(false);
  const [addedOpen, setAddedOpen] = useState(false);
  // The queue keeps the cards decided here (greyed, with what happened) so the list does not jump.
  const asked = useRef(new Set<string>());
  for (const card of view.cards) if (asks(card)) asked.current.add(card.cardId);
  const queue = view.cards.filter((card) => asked.current.has(card.cardId));
  const open = queue.filter(asks).filter((card) => !settled[card.cardId]);
  const held = view.cards.filter((card) => card.section === "ready" && !settled[card.cardId]);
  const autoAdded = view.cards.filter((card) => card.section === null && card.card.allConfirmed && !settled[card.cardId]);
  const current = open.find((card) => card.cardId === focused) ?? open[0] ?? null;

  const record = (card: ScanCardView, result: ScanSettleResult, kind: "confirm" | "merge" | "skip") => {
    setProblems((now) => {
      const next = { ...now };
      if (result === "created" || result === "merged" || result === "skipped") delete next[card.cardId];
      else next[card.cardId] = result;
      return next;
    });
    if (result === "created" || result === "merged" || result === "skipped") {
      setSettled((now) => ({ ...now, [card.cardId]: kind === "skip" || result === "skipped" ? "skipped" : result === "merged" ? "merged" : "added" }));
    }
  };
  const run = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try { await work(); } finally { await actions.refresh(); setBusy(false); }
  };
  const confirmOne = (card: ScanCardView) => run(async () => {
    const kind = card.section === "duplicate" && (choices[card.cardId] ?? "merge") === "merge" ? "merge" : "confirm";
    record(card, await actions.settle(card.cardId, kind), kind);
  });
  const skipOne = (card: ScanCardView) => run(async () => { record(card, await actions.settle(card.cardId, "skip"), "skip"); });
  const addHeld = () => run(async () => { for (const card of held) record(card, await actions.settle(card.cardId, "confirm"), "confirm"); });

  // ↵ confirm the card on screen · → next card · S leave it out.
  const keys = useRef({ current, open, confirmOne, skipOne });
  keys.current = { current, open, confirmOne, skipOne };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const { current: card, open: list } = keys.current;
      if (!card || event.metaKey || event.ctrlKey || event.altKey) return;
      if (enterConfirms(event)) {
        if (card.section === "failed") return;
        event.preventDefault();
        void keys.current.confirmOne(card);
      } else if (event.key === "ArrowRight" && !typing(event.target)) {
        event.preventDefault();
        const index = list.findIndex((entry) => entry.cardId === card.cardId);
        const next = list[(index + 1) % list.length];
        if (next) setFocused(next.cardId);
      } else if ((event.key === "s" || event.key === "S") && !typing(event.target)) {
        event.preventDefault();
        void keys.current.skipOne(card);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const total = queue.length;
  const done = queue.filter((card) => settled[card.cardId]).length;
  return (
    <div className={`${styles.wgrid} ${styles.fade}`} data-scan-review="">
      {view.events.length ? (
        <Card className={styles.span12} data-scan-met="">
          <div className={styles.row} role="group" aria-label={t(b.metTitle)}>
            <span aria-hidden>📍</span><b>{t(b.metTitle)}</b><Chip label={t(b.metEstimated)} tone="apricot" />
            {view.events.map((event) => (
              <FilterOption key={event.eventId} label={`${dayLabel(event.startsAt, language)} · ${event.title}`} selected={view.selectedEventId === event.eventId} onToggle={() => actions.chooseEvent(event.eventId)} />
            ))}
            <FilterOption label={t(b.metNone)} selected={view.selectedEventId === null} onToggle={() => actions.chooseEvent(null)} />
          </div>
          <p className={styles.label}>{t(b.metLead)}</p>
        </Card>
      ) : null}
      <Card className={`${styles.span3} ${styles.queue}`} data-review-queue={open.length}>
        {total ? <span className={styles.queueHead}>{t(b.queueTitle)}</span> : null}
        {queue.map((card) => {
          const result = settled[card.cardId];
          const chip = result ? { copy: RESULT_COPY[result], tone: "ok" as const } : asks(card) ? QUEUE_CHIP[card.section] : null;
          return (
            <button key={card.cardId} type="button" className={[styles.queueRow, current?.cardId === card.cardId ? styles.queueOn : "", result ? styles.queueDone : ""].filter(Boolean).join(" ")} disabled={Boolean(result)} onClick={() => setFocused(card.cardId)} data-review-queue-card={card.cardId} data-review-result={result}>
              <span className={`${styles.cardTile} ${card.section === "failed" ? styles.cardTileFail : styles.cardTileRead}`} aria-hidden />
              <span className={styles.grow}>
                <b className={styles.ellipsis}>{card.section === "failed" && !card.name ? t(b.stateFailed) : card.name || t(b.noName)}</b>
                <span className={`${styles.label} ${styles.ellipsis}`}>{card.organization || card.fileName}</span>
                {chip ? <span><Chip label={t(chip.copy)} tone={chip.tone} /></span> : null}
              </span>
            </button>
          );
        })}
        {held.length ? (
          <div className={styles.queueGroup} data-review-held={held.length}>
            <span className={styles.queueHead}>{t(b.queueHeld)}</span>
            <span className={styles.label}>{held.map((card) => card.name || t(b.noName)).join(t(b.listSep))}</span>
          </div>
        ) : null}
        {autoAdded.length ? (
          <div className={styles.queueGroup}>
            <button type="button" className={styles.queueToggle} aria-expanded={addedOpen} onClick={() => setAddedOpen((value) => !value)} data-review-added={autoAdded.length}>
              <Icon name="check" size={16} /><span className={styles.grow}>{t(b.queueAdded)}</span><b>{t(b.queueCount, { n: autoAdded.length })}</b>
            </button>
            {addedOpen ? <span className={styles.label}>{autoAdded.map((card) => card.name || t(b.noName)).join(t(b.listSep))}</span> : null}
          </div>
        ) : null}
      </Card>
      <Card className={`${styles.span9} ${styles.confirmMain}`}>
        {current ? (
          <ConfirmCard
            key={current.cardId}
            card={current}
            batchId={view.batchId}
            t={t}
            language={language}
            actions={actions}
            busy={busy}
            problem={problems[current.cardId] ?? null}
            choice={choices[current.cardId] ?? "merge"}
            onChoice={(choice) => setChoices((now) => ({ ...now, [current.cardId]: choice }))}
            onConfirm={() => void confirmOne(current)}
            onSkip={() => void skipOne(current)}
          />
        ) : (
          <div className={styles.confirmDone} data-review-queue-done="">
            <span className={styles.okMark} aria-hidden><Icon name="check" size={16} /></span>
            <b>{t(b.queueDoneTitle)}</b>
            {held.length ? (
              <>
                <span className={styles.label}>{t(b.heldBody, { n: held.length })}</span>
                <Button variant="primary" className={styles.h46} loading={busy} label={t(b.heldAdd, { n: held.length })} onClick={() => void addHeld()} data-review-add-held={held.length} />
              </>
            ) : null}
          </div>
        )}
      </Card>
      <div className={`${styles.span12} ${styles.reviewFoot}`}>
        {total ? <span className={styles.queueProgress}><ProgressBar value={done / total} label={t(b.queueProgress, { done, total })} />{t(b.queueProgress, { done, total })}</span> : null}
        <span className={styles.footNote}>{t(b.leaveNote)}</span>
        <Button label={t(b.leave)} onClick={onLater} data-review-later="" />
      </div>
    </div>
  );
}

function normalizedText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}

type CardProps = {
  card: ScanCardView;
  t: Translate;
  language: OrbitLanguage;
  actions: ScanBatchActions;
};

function problemCopy(card: ScanCardView, problem: ScanSettleResult | null): OrbitCopyEntry | null {
  if (problem === "blocked") {
    if (card.draft?.conflictedFields.length) return b.blockedSides;
    if (!card.draft?.fields.displayName.trim()) return b.blockedName;
    return b.blockedStale;
  }
  return problem === "failed" ? b.saveFailed : null;
}

/** Why this card needs a look, from what the batch already knows (match reason, issue group, failure kind). */
function reasonOf(card: ScanCardView & { section: "duplicate" | "review" | "failed" }, t: Translate): { title: string; sub: string } {
  if (card.section === "failed") return { title: t(card.failure === "busy" ? b.failedBusy : b.failedImage), sub: t(card.failure === "busy" ? b.reasonBusySub : b.reasonFailedSub) };
  if (card.section === "review") return { title: t(GROUP_COPY[card.issueGroup ?? "other"]), sub: t(b.reasonCheckSub) };
  const candidate = card.candidate;
  const matched = (candidate?.matchedOn ?? []).map((reason) => MATCH_COPY[reason] ?? b.matchedNameOrg).map((copy) => t(copy));
  const moved = Boolean(candidate?.organization && card.organization && normalizedText(candidate.organization) !== normalizedText(card.organization));
  return { title: t(b.reasonDuplicate), sub: [...new Set(matched), moved ? t(b.diffMoved) : ""].filter(Boolean).join(" · ") };
}

function ConfirmCard({ card, batchId, t, language, actions, busy, problem, choice, onChoice, onConfirm, onSkip }: CardProps & {
  card: ScanCardView & { section: "duplicate" | "review" | "failed" };
  batchId: string;
  busy: boolean;
  problem: ScanSettleResult | null;
  choice: Choice;
  onChoice: (choice: Choice) => void;
  onConfirm: () => void;
  onSkip: () => void;
}) {
  const [showFields, setShowFields] = useState(false);
  const [typingIn, setTypingIn] = useState(false);
  const [replaceFailed, setReplaceFailed] = useState(false);
  const file = useRef<HTMLInputElement | null>(null);
  const reason = reasonOf(card, t);
  const message = problemCopy(card, problem);
  const editor = <FieldEditor card={card} t={t} language={language} actions={actions} />;
  const failed = card.section === "failed";
  const candidate = card.candidate;
  const primary = card.section === "duplicate"
    ? choice === "merge" && candidate ? t(b.actMerge, { name: candidate.displayName }) : t(b.actSeparate)
    : failed && !typingIn ? null : t(b.actAdd);
  let side: ReactNode;
  if (card.section === "duplicate" && candidate) {
    const draft = card.draft?.fields;
    side = (
      <div className={styles.stack} data-review-compare={card.cardId}>
        <b>{t(b.compareTitle)}</b>
        <table className={styles.compare}>
          <thead><tr><th aria-label={t(b.fieldName)} /><th>{t(b.compareExisting)}</th><th>{t(b.compareCard)}</th></tr></thead>
          <tbody>
            {COMPARE_FIELDS.map(([field, label]) => {
              const had = (candidate[field] ?? "").trim();
              const read = (draft?.[field] ?? "").trim();
              const state = had && read ? normalizedText(had) === normalizedText(read) ? "same" : "diff" : "";
              return <tr key={field} data-compare={state || undefined}><td>{t(label)}</td><td>{had || "—"}</td><td>{read || "—"}</td></tr>;
            })}
          </tbody>
        </table>
        <div className={styles.choices} role="radiogroup" aria-label={t(b.reasonDuplicate)}>
          {(["merge", "separate"] as const).map((value) => (
            <button key={value} type="button" role="radio" aria-checked={choice === value} className={`${styles.choice} ${choice === value ? styles.choiceOn : ""}`} onClick={() => onChoice(value)} data-review-choice={value}>
              <b>{t(value === "merge" ? b.choiceSame : b.choiceOther)}</b>
              <span className={styles.label}>{t(value === "merge" ? b.choiceSameBody : b.choiceOtherBody)}</span>
            </button>
          ))}
        </div>
        <span><Button size="sm" variant="ghost" label={t(showFields ? b.hideFields : b.showFields)} onClick={() => setShowFields((value) => !value)} data-review-show-fields={card.cardId} /></span>
      </div>
    );
  } else if (failed && !typingIn) {
    side = (
      <div className={styles.stack}>
        <b>{t(b.fieldsTitle)}</b>
        <span className={styles.label}>{card.name || card.organization ? t(b.failedPartial) : t(b.nothingRead)}</span>
      </div>
    );
  } else {
    side = (
      <div className={styles.stack}>
        <div className={styles.row}><b>{t(b.fieldsTitle)}</b><span className={styles.label}>{t(b.fieldsEditable)}</span></div>
        {editor}
      </div>
    );
  }
  return (
    <div className={styles.confirm} data-review-card={card.cardId} data-review-section={card.section}>
      <div className={`${styles.reason} ${REASON_TONE[card.section]}`} data-review-reason={card.section}>
        <b>{reason.title}</b>
        {reason.sub ? <span>{reason.sub}</span> : null}
      </div>
      <div className={styles.confirmBody}>
        <CardPhoto card={card} batchId={batchId} t={t} />
        {side}
      </div>
      {card.section === "duplicate" && showFields ? editor : null}
      {message ? <p className={styles.error} role="alert"><Icon name="alert" size={16} />{t(message)}</p> : null}
      {replaceFailed ? <p className={styles.error} role="alert"><Icon name="alert" size={16} />{t(b.replaceFailed)}</p> : null}
      <div className={styles.confirmActs}>
        <Button variant="ghost" label={t(b.actLeaveOut)} disabled={busy} onClick={onSkip} data-review-skip={card.cardId} />
        {failed ? (
          <>
            {card.failure === "busy" ? <Button icon="refresh" label={t(b.retryRead)} disabled={busy} onClick={() => void actions.retryRecognition(card.cardId)} data-failed-retry={card.cardId} /> : null}
            <Button icon="camera" label={t(b.retake)} disabled={busy} onClick={() => file.current?.click()} data-failed-retake={card.cardId} />
            <input ref={file} className={styles.srOnly} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" tabIndex={-1} aria-hidden onChange={(event) => {
              const picked = event.target.files?.[0];
              event.target.value = "";
              if (picked) void actions.replace(card.cardId, picked).then((ok) => setReplaceFailed(!ok));
            }} />
            {typingIn || !card.draft ? null : <Button icon="pen" label={t(b.typeIn)} disabled={busy} onClick={() => setTypingIn(true)} data-failed-manual={card.cardId} />}
          </>
        ) : null}
        {primary ? (
          <Button variant="primary" className={styles.confirmPrimary} loading={busy} label={primary} onClick={onConfirm} data-review-confirm={card.cardId} />
        ) : null}
      </div>
    </div>
  );
}

/** The card photo (front / back) from the batch's private image endpoint; click to zoom. */
function CardPhoto({ card, batchId, t }: { card: ScanCardView; batchId: string; t: Translate }) {
  const [side, setSide] = useState<"front" | "back">("front");
  const [zoom, setZoom] = useState(false);
  const item = (side === "back" ? card.card.back : card.card.front) ?? card.card.items[0] ?? null;
  return (
    <div className={styles.photoBox} data-review-photo={card.cardId}>
      <button type="button" className={`${styles.photo} ${zoom ? styles.photoZoom : ""}`} aria-label={t(zoom ? b.photoZoomOut : b.photoZoom)} onClick={() => setZoom((value) => !value)}>
        {item?.derivativeObjectKey && item.imageDigest ? (
          <IngestV2PrivateImage
            key={`${item.id}:${item.version}`}
            alt={item.sourceFileName}
            src={`${INGEST_V2_API_BASE}/${encodeURIComponent(batchId)}/items/${encodeURIComponent(item.id)}/image`}
            loadingLabel={t(b.photoLoading)}
            expiredLabel={t(b.photoExpired)}
            errorLabel={t(b.photoError)}
          />
        ) : <span className={styles.label}>{t(b.photoNone)}</span>}
      </button>
      {card.card.isTwoSided ? (
        <div className={styles.row} role="group">
          {(["front", "back"] as const).map((value) => <FilterOption key={value} label={t(value === "front" ? b.photoFront : b.photoBack)} selected={side === value} onToggle={() => setSide(value)} />)}
        </div>
      ) : null}
    </div>
  );
}

/** 項目を直す: the review fields of the card (same draft rules as the old review page). */
function FieldEditor({ card, t, language, actions }: CardProps) {
  const draft = card.draft;
  if (!draft) return null;
  const set = (next: IngestV2CardDraft) => actions.setDraft(card.cardId, next);
  const flagged = new Set(card.flagged);
  const items = card.card.items;
  return (
    <div className={styles.fields} data-field-editor={card.cardId}>
      {INGEST_V2_FIELDS.map((field) => {
        const value = draft.fields[field];
        const alternatives = [...new Map(items.flatMap((item) => fieldCandidates(item).filter((entry) => entry.field === field && entry.value !== value)).map((entry) => [entry.value, entry])).values()];
        return (
          <div key={field} className={`${styles.stack} ${field === "address" ? styles.fieldWide : ""}`} data-edit-field={field} data-flagged={flagged.has(field) || undefined}>
            <div className={flagged.has(field) ? styles.flagged : undefined}>
              <TextField label={t(FIELD_COPY[field])} value={value} onChange={(event) => set(setManualDraftField(draft, field, event.target.value))} />
            </div>
            {alternatives.length ? (
              <div className={styles.row}>
                <span className={styles.label}>{t(b.maybe)}</span>
                {alternatives.map((entry) => <Button key={entry.value} size="sm" variant="ghost" label={entry.value} onClick={() => set(setDraftFieldSource(draft, field, entry))} />)}
              </div>
            ) : null}
          </div>
        );
      })}
      {draft.industry?.conflicted ? (
        <EnrichmentChoice label={t(b.fieldIndustry)} t={t} options={industryCandidates(card.card).map((pair) => ({ key: `${pair.primaryIndustryId}/${pair.secondaryIndustryId ?? ""}`, label: industryLabel(pair, language), pick: () => set(setDraftIndustry(draft, pair)) }))} onClear={() => set(setDraftIndustry(draft, { primaryIndustryId: null, secondaryIndustryId: null }))} />
      ) : null}
      {draft.seniority?.conflicted ? (
        <EnrichmentChoice label={t(b.fieldSeniority)} t={t} options={seniorityCandidates(card.card).map((level) => ({ key: level, label: seniorityLevelLabel(level, language), pick: () => set(setDraftSeniority(draft, level)) }))} onClear={() => set(setDraftSeniority(draft, null))} />
      ) : null}
      {draft.region?.conflicted ? (
        <EnrichmentChoice label={t(b.fieldRegion)} t={t} options={regionCandidates(card.card).map((region) => ({ key: `${region.countryCode}/${region.city ?? ""}`, label: regionDisplayName(region, language), pick: () => set(setDraftRegion(draft, region)) }))} onClear={() => set(setDraftRegion(draft, { countryCode: null, city: null }))} />
      ) : null}
      <label className={`${styles.stack} ${styles.fieldWide}`}>
        <span className={styles.fieldLabel}>{t(b.fieldNotes)}</span>
        <textarea className={styles.textarea} value={draft.fields.notes} onChange={(event) => set(setManualDraftNotes(draft, event.target.value))} />
      </label>
    </div>
  );
}

function industryLabel(pair: { primaryIndustryId: string; secondaryIndustryId: string | null }, language: OrbitLanguage): string {
  const primary = INDUSTRY_CATALOG.find((industry) => industry.id === pair.primaryIndustryId);
  const secondary = isIndustryIdCode(pair.primaryIndustryId) ? listSecondaryIndustries(pair.primaryIndustryId).find((industry) => industry.id === pair.secondaryIndustryId) : undefined;
  return [primary ? primary.labels[language] : pair.primaryIndustryId, secondary ? secondary.labels[language] : null].filter(Boolean).join(" › ");
}

function EnrichmentChoice({ label, t, options, onClear }: { label: string; t: Translate; options: { key: string; label: string; pick: () => void }[]; onClear: () => void }) {
  return (
    <div className={`${styles.stack} ${styles.fieldWide} ${styles.flagged}`} data-enrichment={label}>
      <span className={styles.fieldLabel}>{label}</span>
      <span className={styles.label}>{t(b.pickOne)}</span>
      <div className={styles.row}>
        {options.map((option) => <Button key={option.key} size="sm" label={option.label} onClick={option.pick} />)}
        <Button size="sm" variant="ghost" label={t(b.clearValue)} onClick={onClear} />
      </div>
    </div>
  );
}

function DonePanel({ view, t, language, go, returnTo }: { view: ScanBatchView; t: Translate; language: OrbitLanguage; go: (href: string) => void; returnTo: WebGuideReturnTo | null }) {
  const eventTitle = view.events.find((event) => view.writtenEventIds.includes(event.eventId))?.title;
  const scene = [t(b.doneScene, { n: view.cards.length, date: dayLabel(view.createdAt, language) }), eventTitle].filter(Boolean).join(" · ");
  const density = view.density;
  return (
    <div className={styles.wgrid} data-scan-done="">
      <Card className={`${styles.span7} ${styles.doneMain}`}>
        <div className={styles.doneCenter}>
          <div className={styles.doneEmoji} aria-hidden>🎉</div>
          <h2 className={styles.doneTitle}>{t(b.doneTitle, { n: view.counts.created + view.counts.merged })}</h2>
          <p className={styles.doneSub}>{scene}</p>
        </div>
        <div className={styles.bignum3}>
          <div data-done-tile="created"><b><CountUp value={view.counts.created} /></b><span className={styles.bigLabel}>{t(b.doneNew)}</span></div>
          <div data-done-tile="merged"><b><CountUp value={view.counts.merged} /></b><span className={styles.bigLabel}>{t(b.doneMerged)}</span></div>
          <div data-done-tile="unreadable"><b className={view.counts.unreadable ? styles.bigWarn : ""}><CountUp value={view.counts.unreadable} /></b><span className={styles.bigLabel}>{t(b.doneFailed)}</span></div>
        </div>
        {density ? (
          <div data-done-density={[1, 2, 3].map((level) => density[level as 1 | 2 | 3]).join(",")}>
            <div className={styles.densityLabel}>{t(addDoorsCopy.densityNote)}</div>
            <div className={styles.stack3} aria-hidden>
              {([1, 2, 3] as const).map((level) => (density[level] ? <i key={level} className={styles[`stack3_${level}`]} style={{ flexGrow: density[level] }} /> : null))}
            </div>
            <div className={styles.stack3Legend}>
              {([1, 2, 3] as const).map((level) => (
                <span key={level} className={styles.stack3Item}><DensityDots level={level} t={t} />{t(b.doneDensityLevel, { label: densityName(level, t), n: density[level] })}</span>
              ))}
            </div>
          </div>
        ) : null}
      </Card>
      <Card className={`${styles.span5} ${styles.doneNext}`}>
        <div className={styles.doneNextHead}><h3>{t(b.nextTitle)}</h3></div>
        <div className={styles.nx} data-done-plan={view.completed ? "ready" : "pending"}>
          <MacTile emoji="🎯" size="sm" tone="lav" />
          <div className={styles.nxMeta}><b>{t(b.nextPlan)}</b><span>{t(view.completed ? b.nextPlanReady : b.nextPlanPending)}</span></div>
          {view.completed ? <Button size="sm" label={t(b.nextPlanOpen)} onClick={() => go(planTaskSegmentHref("web"))} /> : null}
        </div>
        {view.counts.unreadable ? (
          <div className={styles.nx} data-done-unreadable={view.counts.unreadable}>
            <MacTile emoji="🧩" size="sm" tone="apricot" />
            <div className={styles.nxMeta}><b>{t(b.nextFailed, { n: view.counts.unreadable })}</b><span>{t(b.nextFailedBody)}</span></div>
            <span className={styles.nxArrow} aria-hidden><Icon name="right" size={16} /></span>
          </div>
        ) : null}
      </Card>
      <div className={`${styles.span12} ${styles.doneActs}`}>
        {returnTo ? <Button variant="primary" className={styles.h44} label={t(addManualCopy.sampleGuidePlain)} onClick={() => go(returnTo)} data-done-guide="" /> : null}
        <Button variant="primary" icon="users" className={styles.h44} label={t(b.viewNetwork)} onClick={() => go("/app/contacts")} data-done-network="" />
        <Button variant="ghost" icon="scan" className={styles.h44} label={t(b.scanMore)} onClick={() => go("/app/contacts/new/scan")} data-done-more="" />
      </div>
    </div>
  );
}

function densityName(level: 1 | 2 | 3, t: Translate): string {
  return t(level === 1 ? addDoorsCopy.density1 : level === 2 ? addDoorsCopy.density2 : addDoorsCopy.density3);
}

/** W-R12-12a～c: この読み取りを開けませんでした / 期限切れ / 取り消されました (01-system ⑧ 重试卡). */
function BatchErrorCard({ phase, t, go }: { phase: "missing" | "expired" | "cancelled"; t: Translate; go: (href: string) => void }) {
  const title = phase === "missing" ? b.errorMissingTitle : phase === "expired" ? b.errorExpiredTitle : b.errorCancelledTitle;
  const lines = phase === "missing" ? [b.errorMissingBody, b.errorKept] : phase === "expired" ? [b.errorKept] : [b.errorCancelledBody];
  return (
    <div className={styles.wgrid}>
      <Card className={styles.errCard} role="alert" data-scan-error-card={phase}>
        <div className={styles.errIc}><Icon name="alert" size={24} /></div>
        <b className={styles.errTitle}>{t(title)}</b>
        <div className={styles.errSub}>{lines.map((line, index) => <Fragment key={index}>{index ? <br /> : null}{t(line)}</Fragment>)}</div>
        <div className={styles.errActs}>
          <Button variant="primary" icon="scan" label={t(b.scanAgain)} onClick={() => go("/app/contacts/new/scan")} />
          {phase === "cancelled" ? null : <Button variant="ghost" label={t(b.viewNetwork)} onClick={() => go("/app/contacts")} />}
        </div>
      </Card>
    </div>
  );
}
