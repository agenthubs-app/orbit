"use client";

import { useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { planTaskSegmentHref } from "../../../../../shared/compute/plan-href";
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
import { addBatchCopy as b, addDoorsCopy, addScanCopy as s } from "../copy/add";
import type { OrbitCopyEntry } from "../copy/types";
import { ShellPage } from "../shell/slots";
import { Button, Card, Chip, CountUp, FilterOption, Icon, IconButton, Kbd, MacTile, Orbit2026Scope, ProgressBar, Skeleton, TextField, ToastProvider } from "../ui";
import { DensityDots, translator, type Translate } from "./add-parts";
import { ReviewRail, UnifiedReview, type ReviewDuplicateRow, type ReviewGroupRow } from "./UnifiedReview";
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
/** 要確認 row labels (b9 ④ .frow 84px key). */
const GROUP_SHORT: Record<ScanIssueGroup, OrbitCopyEntry> = {
  name: b.shortName,
  orgSuffix: b.shortOrgSuffix,
  misread: b.shortMisread,
  sides: b.shortSides,
  enrichment: b.shortEnrichment,
  format: b.shortFormat,
  other: b.shortOther,
};
const GROUP_ORDER: readonly ScanIssueGroup[] = ["name", "sides", "misread", "orgSuffix", "format", "enrichment", "other"];

const FIELD_COPY: Record<IngestV2Field, OrbitCopyEntry> = {
  displayName: b.fieldName,
  organization: b.fieldOrganization,
  role: b.fieldRole,
  email: b.fieldEmail,
  phone: b.fieldPhone,
  address: b.fieldAddress,
};

const MATCH_COPY: Record<string, OrbitCopyEntry> = { email: b.matchedEmail, phone: b.matchedPhone, name_organization: b.matchedNameOrg, name: b.matchedName };

const SECTION_ID = { duplicate: "add-scan-duplicates", review: "add-scan-review", ready: "add-scan-ready", failed: "add-scan-failed" } as const;

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
export function ScanBatchScreen({ view, actions, onStart }: { view: ScanBatchView; actions: ScanBatchActions; onStart?: (cards: readonly StagedCard[]) => Promise<ScanStartResult> }) {
  const { language, preserveHref } = useOrbitLanguage();
  const router = useRouter();
  const t = translator(language);
  const go = (href: string) => router.push(preserveHref(href));
  const reading = view.phase === "uploading" || view.phase === "reading" || view.phase === "importing";
  const title = reading ? t(s.pageTitle) : view.phase === "review" ? t(b.reviewPageTitle) : t(b.pageTitle);
  const subtitle = view.phase === "review" ? t(b.reviewPageSub, { n: view.cards.length }) : t(s.pageSubtitle);
  const back = <IconButton icon="left" label={t(s.back)} onClick={() => go("/app/contacts/new")} />;
  return (
    <Orbit2026Scope language={language} className={styles.page}>
      <ToastProvider>
        <ShellPage title={title} subtitle={subtitle} left={back} rightRail={view.phase === "review" ? <ReviewRail t={t} emoji="📇" tone="apricot" title={t(b.railTitle)} body={t(b.railBody)} level={1} levelNote={t(b.railLevelNote)} /> : undefined} />
        <div className={styles.fade} data-scan-batch={view.batchId} data-scan-phase={view.phase}>
          {view.phase === "loading" ? <Skeleton lines={6} /> : null}
          {view.phase === "missing" || view.phase === "expired" || view.phase === "cancelled" ? <BatchErrorCard phase={view.phase} t={t} go={go} /> : null}
          {view.phase === "uploading" || view.phase === "reading" || view.phase === "importing" ? <ReadingPanel view={view} actions={actions} t={t} onStart={onStart} onStarted={(id) => go(`/app/contacts/new/scan/${encodeURIComponent(id)}`)} onNavigate={go} /> : null}
          {view.phase === "review" ? <ReviewPanel view={view} actions={actions} t={t} language={language} onLater={() => go("/app/contacts")} /> : null}
          {view.phase === "done" ? <DonePanel view={view} t={t} language={language} go={go} /> : null}
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

function ReviewPanel({ view, actions, t, language, onLater }: { view: ScanBatchView; actions: ScanBatchActions; t: Translate; language: OrbitLanguage; onLater: () => void }) {
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [problems, setProblems] = useState<Record<string, ScanSettleResult>>({});
  const [busy, setBusy] = useState(false);
  const [oneByOne, setOneByOne] = useState(false);
  const pending = useMemo(() => view.cards.filter((card) => card.section !== null), [view.cards]);
  const dups = pending.filter((card) => card.section === "duplicate");
  const reviews = pending.filter((card) => card.section === "review");
  const ready = pending.filter((card) => card.section === "ready");
  const failed = pending.filter((card) => card.section === "failed");
  // Keyboard (↵ / → / S) walks the cards shown one by one: 要確認 and 読み取れなかった (重複 are rows in the table).
  const order = [...reviews, ...failed];
  const addable = [...dups, ...reviews, ...ready];
  // R12 review m5: 統合 is not 追加 — the button counts them apart.
  const merging = dups.filter((card) => (choices[card.cardId] ?? "merge") === "merge").length;
  const adding = addable.length - merging;
  const current = order.find((card) => card.cardId === focused) ?? order[0] ?? null;

  const settleOne = async (card: ScanCardView): Promise<ScanSettleResult> => {
    const kind = card.section === "duplicate" ? (choices[card.cardId] ?? "merge") === "merge" ? "merge" : "confirm" : "confirm";
    const result = await actions.settle(card.cardId, kind);
    setProblems((current) => {
      const next = { ...current };
      if (result === "created" || result === "merged" || result === "skipped") delete next[card.cardId];
      else next[card.cardId] = result;
      return next;
    });
    return result;
  };
  const run = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try { await work(); } finally { await actions.refresh(); setBusy(false); }
  };
  const addAll = () => run(async () => { for (const card of addable) await settleOne(card); });
  const confirmOne = (card: ScanCardView) => run(async () => { await settleOne(card); });
  const skipOne = (card: ScanCardView) => run(async () => { await actions.settle(card.cardId, "skip"); });

  // ↵ confirm the focused card · → next card · S skip (b1 B5 right rail).
  const keys = useRef({ current, order, confirmOne, skipOne });
  keys.current = { current, order, confirmOne, skipOne };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const { current: card, order: list } = keys.current;
      if (!card || event.metaKey || event.ctrlKey || event.altKey) return;
      if (enterConfirms(event)) {
        if (card.section === "failed" && open !== card.cardId) return;
        event.preventDefault();
        void keys.current.confirmOne(card);
      } else if (event.key === "ArrowRight" && !typing(event.target)) {
        event.preventDefault();
        const index = list.findIndex((entry) => entry.cardId === card.cardId);
        const next = list[(index + 1) % list.length];
        if (next) { setFocused(next.cardId); document.querySelector(`[data-review-card="${next.cardId}"]`)?.scrollIntoView({ block: "nearest" }); }
      } else if ((event.key === "s" || event.key === "S") && !typing(event.target)) {
        event.preventDefault();
        void keys.current.skipOne(card);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const groups = GROUP_ORDER.map((group) => [group, reviews.filter((card) => card.issueGroup === group)] as const).filter(([, cards]) => cards.length);

  const cardProps = (card: ScanCardView) => ({
    card, t, language, actions, busy,
    focused: current?.cardId === card.cardId,
    open: open === card.cardId,
    problem: problems[card.cardId] ?? null,
    onFocus: () => setFocused(card.cardId),
    onToggle: () => setOpen((value) => (value === card.cardId ? null : card.cardId)),
    onConfirm: () => void confirmOne(card),
    onSkip: () => void skipOne(card),
  });

  // 重複: checked = 統合 (default), unchecked = 別人として追加 (b9 A2 / A3 ④ table).
  const duplicateRows: ReviewDuplicateRow[] = dups.flatMap((card) => {
    const candidate = card.candidate;
    if (!candidate) return [];
    const incoming = [card.name || t(b.noName), card.organization].filter(Boolean).join(" · ");
    const existing = [candidate.displayName, candidate.organization].filter(Boolean).join(" · ");
    const moved = Boolean(candidate.organization && card.organization && normalizedText(candidate.organization) !== normalizedText(card.organization) && normalizedText(candidate.displayName) === normalizedText(card.name));
    return [{ id: card.cardId, existing, incoming, difference: moved ? t(b.diffMoved) : differenceLabel(card, t), warn: moved, selected: (choices[card.cardId] ?? "merge") === "merge" }];
  });
  const settleMany = (cards: readonly ScanCardView[], kind: "merge" | "confirm") => run(async () => {
    for (const card of cards) {
      const result = await actions.settle(card.cardId, kind);
      setProblems((current) => { const next = { ...current }; if (result === "created" || result === "merged" || result === "skipped") delete next[card.cardId]; else next[card.cardId] = result; return next; });
    }
  });
  const selectedDups = dups.filter((card) => (choices[card.cardId] ?? "merge") === "merge");
  const reviewGroups: ReviewGroupRow[] = groups.map(([group, cards]) => ({
    key: group,
    label: t(GROUP_SHORT[group]),
    example: [cards[0]!.name || t(b.noName), cards[0]!.organization].filter(Boolean).join(" · "),
    tone: group === "name" || group === "misread" ? "lo" : "mid",
    count: cards.length,
  }));

  return (
    <div data-scan-review="">
      <UnifiedReview
        t={t}
        tiles={{
          duplicate: { count: view.counts.duplicate, sub: t(b.tileDuplicateSub) },
          review: { count: view.counts.review, sub: reviewGroups[0]?.label ?? t(b.tileReviewNone) },
          asIs: { count: view.counts.asIs, sub: t(b.tileAsIsSub) },
        }}
        onTile={(key) => scrollTo(key === "duplicate" ? SECTION_ID.duplicate : key === "review" ? SECTION_ID.review : SECTION_ID.ready)}
        sourceLabel={t(b.incomingCards)}
        autoMerged={view.counts.merged}
        autoMergedLabel={t(b.autoMergedCards, { n: view.counts.merged })}
        duplicates={duplicateRows}
        onToggleDuplicate={(id) => setChoices((current) => ({ ...current, [id]: (current[id] ?? "merge") === "merge" ? "separate" : "merge" }))}
        onSeparate={() => void settleMany(selectedDups, "confirm")}
        onMergeSelected={() => void settleMany(selectedDups, "merge")}
        groups={reviewGroups}
        onOneByOne={() => setOneByOne((value) => !value)}
        onApplySuggestions={() => void settleMany(reviews, "confirm")}
        note={t(b.reviewNote)}
        onLater={onLater}
        addCount={addable.length}
        onAddAll={() => void addAll()}
        busy={busy}
        extra={(view.events.length || failed.length || oneByOne) ? (
          <div className={styles.stack}>
            {view.events.length ? (
              <Card data-scan-met="">
                <div className={styles.stack}>
                  <div className={styles.row}><span aria-hidden>📍</span><b>{t(b.metTitle)}</b><Chip label={t(b.metEstimated)} tone="apricot" /></div>
                  <div className={styles.row} role="group" aria-label={t(b.metTitle)}>
                    {view.events.map((event) => (
                      <FilterOption key={event.eventId} label={`${dayLabel(event.startsAt, language)} · ${event.title}`} selected={view.selectedEventId === event.eventId} onToggle={() => actions.chooseEvent(event.eventId)} />
                    ))}
                    <FilterOption label={t(b.metNone)} selected={view.selectedEventId === null} onToggle={() => actions.chooseEvent(null)} />
                  </div>
                  <p className={styles.label}>{t(b.metLead)}</p>
                </div>
              </Card>
            ) : null}
            {oneByOne && groups.length ? (
              <section id={SECTION_ID.review} className={styles.section} data-scan-section="review">
                {groups.map(([group, cards]) => (
                  <div key={group} className={styles.stack} data-scan-group={group}>
                    <span className={styles.label}>{t(GROUP_COPY[group])} · {cards.length}</span>
                    {cards.map((card) => <ReviewCard key={card.cardId} {...cardProps(card)} />)}
                  </div>
                ))}
              </section>
            ) : null}
            {failed.length ? (
              <section id={SECTION_ID.failed} className={styles.section} data-scan-section="failed">
                <h3 className={styles.sectionTitle}>{t(b.sectionFailed)}</h3>
                {failed.map((card) => <FailedCard key={card.cardId} {...cardProps(card)} />)}
              </section>
            ) : null}
          </div>
        ) : null}
      />
    </div>
  );
}

function normalizedText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}

/** 違い: the fields that read differently from the person already in 人脈. */
function differenceLabel(card: ScanCardView, t: Translate): string {
  const candidate = card.candidate;
  if (!candidate) return "";
  const fields = ([["displayName", b.diffName], ["organization", b.diffOrganization], ["role", b.diffRole]] as const)
    .filter(([field]) => (candidate[field] ?? "").trim() && (card[field === "displayName" ? "name" : field] ?? "").trim() && normalizedText(candidate[field]) !== normalizedText(card[field === "displayName" ? "name" : field]));
  return fields.length ? fields.map(([, copy]) => t(copy)).join(" · ") : t(b.diffSame);
}

type CardProps = {
  card: ScanCardView;
  t: Translate;
  language: OrbitLanguage;
  actions: ScanBatchActions;
  busy: boolean;
  focused: boolean;
  open: boolean;
  problem: ScanSettleResult | null;
  onFocus: () => void;
  onToggle: () => void;
  onConfirm: () => void;
  onSkip: () => void;
};

function problemCopy(card: ScanCardView, problem: ScanSettleResult | null): OrbitCopyEntry | null {
  if (problem === "blocked") {
    if (card.draft?.conflictedFields.length) return b.blockedSides;
    if (!card.draft?.fields.displayName.trim()) return b.blockedName;
    return b.blockedStale;
  }
  return problem === "failed" ? b.saveFailed : null;
}

function cardClass(focused: boolean, problem: ScanSettleResult | null): string {
  return [styles.reviewCard, styles.fade, focused ? styles.reviewCardFocus : "", problem === "blocked" || problem === "failed" ? styles.reviewCardError : ""].filter(Boolean).join(" ");
}

function ReviewCard(props: CardProps) {
  const { card, t, busy, focused, open, problem, onFocus, onToggle, onConfirm, onSkip } = props;
  const message = problemCopy(card, problem);
  return (
    <div className={cardClass(focused, problem)} onFocusCapture={onFocus} onMouseDown={onFocus} data-review-card={card.cardId} data-review-open={open || undefined}>
      <div className={styles.row}>
        <MacTile emoji="📇" size="sm" />
        <span className={styles.grow}>
          <b className={styles.ellipsis}>{card.name || t(b.noName)}</b>
          <span className={`${styles.label} ${styles.ellipsis}`}>{[card.organization, card.role].filter(Boolean).join(" · ") || card.fileName}</span>
        </span>
        {card.twoSided ? <Chip label={t(b.sideBoth)} /> : null}
        <Button size="sm" variant="ghost" label={open ? t(b.closeCard) : t(b.editCard)} onClick={onToggle} data-review-edit={card.cardId} />
      </div>
      {open ? <FieldEditor {...props} /> : null}
      {message ? <p className={styles.error} role="alert"><Icon name="alert" size={16} />{t(message)}</p> : null}
      <div className={styles.row}>
        <Button size="sm" variant="primary" label={t(b.addThis)} disabled={busy} onClick={onConfirm} data-review-confirm={card.cardId} />
        <Button size="sm" variant="ghost" label={t(b.skip)} disabled={busy} onClick={onSkip} data-review-skip={card.cardId} />
      </div>
    </div>
  );
}

function FailedCard(props: CardProps) {
  const { card, t, busy, focused, open, problem, actions, onFocus, onToggle, onConfirm, onSkip } = props;
  const message = problemCopy(card, problem);
  const file = useRef<HTMLInputElement | null>(null);
  const [replaceFailed, setReplaceFailed] = useState(false);
  return (
    <div className={cardClass(focused, problem)} onFocusCapture={onFocus} onMouseDown={onFocus} data-review-card={card.cardId} data-failed-card={card.cardId}>
      <div className={styles.row}>
        <span className={`${styles.cardTile} ${styles.cardTileFail}`} aria-hidden />
        <span className={styles.grow}>
          <b>{t(card.failure === "busy" ? b.failedBusy : b.failedImage)}</b>
          <span className={`${styles.label} ${styles.ellipsis}`}>{card.fileName}</span>
        </span>
        {card.organization || card.name ? <Chip label={[card.name, card.organization].filter(Boolean).join(" · ")} tone="apricot" /> : null}
      </div>
      {open ? (
        <>
          <span className={styles.label}>{t(b.failedPartial)}</span>
          <FieldEditor {...props} />
          <span><Button size="sm" variant="primary" label={t(b.addThis)} disabled={busy} onClick={onConfirm} data-failed-confirm={card.cardId} /></span>
        </>
      ) : null}
      {message ? <p className={styles.error} role="alert"><Icon name="alert" size={16} />{t(message)}</p> : null}
      {replaceFailed ? <p className={styles.error} role="alert"><Icon name="alert" size={16} />{t(b.replaceFailed)}</p> : null}
      <div className={styles.row}>
        {card.failure === "busy" ? (
          <Button size="sm" variant="primary" icon="refresh" label={t(b.retryRead)} disabled={busy} onClick={() => void actions.retryRecognition(card.cardId)} data-failed-retry={card.cardId} />
        ) : null}
        <Button size="sm" variant={card.failure === "busy" ? "secondary" : "primary"} icon="camera" label={t(b.retake)} disabled={busy} onClick={() => file.current?.click()} data-failed-retake={card.cardId} />
        <input ref={file} className={styles.srOnly} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" tabIndex={-1} aria-hidden onChange={(event) => {
          const picked = event.target.files?.[0];
          event.target.value = "";
          if (picked) void actions.replace(card.cardId, picked).then((ok) => setReplaceFailed(!ok));
        }} />
        <Button size="sm" variant="secondary" icon="pen" label={t(b.typeIn)} disabled={busy} onClick={onToggle} data-failed-manual={card.cardId} />
        <Button size="sm" variant="ghost" label={t(b.skip)} disabled={busy} onClick={onSkip} data-failed-skip={card.cardId} />
      </div>
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

function DonePanel({ view, t, language, go }: { view: ScanBatchView; t: Translate; language: OrbitLanguage; go: (href: string) => void }) {
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
