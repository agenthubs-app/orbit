"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

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
import { useOrbitLanguage } from "../../orbit-language-context";
import { addBatchCopy as b, addScanCopy as s } from "../copy/add";
import type { OrbitCopyEntry } from "../copy/types";
import { ShellPage } from "../shell/slots";
import { Button, Card, Chip, CountUp, FilterOption, Icon, IconButton, Kbd, MacTile, Orbit2026Scope, ProgressBar, Skeleton, TextField, ToastProvider } from "../ui";
import { translator, type Translate } from "./add-parts";
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
export function ScanBatchScreen({ view, actions }: { view: ScanBatchView; actions: ScanBatchActions }) {
  const { language, preserveHref } = useOrbitLanguage();
  const router = useRouter();
  const t = translator(language);
  const go = (href: string) => router.push(preserveHref(href));
  const added = view.counts.created + view.counts.merged;
  const title = view.phase === "done" ? t(b.doneTitle, { n: added }) : t(b.pageTitle);
  const back = <IconButton icon="left" label={t(s.back)} soft onClick={() => go("/app/contacts/new")} />;
  return (
    <Orbit2026Scope language={language} className={styles.page}>
      <ToastProvider>
        <ShellPage title={title} subtitle={t(s.pageSubtitle)} left={back} />
        <div className={styles.fade} data-scan-batch={view.batchId} data-scan-phase={view.phase}>
          {view.phase === "loading" ? <Skeleton lines={6} /> : null}
          {view.phase === "missing" || view.phase === "expired" || view.phase === "cancelled" ? (
            <Card>
              <div className={styles.stack}>
                <p className={styles.body} role="alert">{t(view.phase === "missing" ? b.loadFailed : view.phase === "expired" ? b.expired : b.cancelled)}</p>
                <span><Button variant="primary" icon="scan" label={t(b.scanAgain)} onClick={() => go("/app/contacts/new/scan")} /></span>
              </div>
            </Card>
          ) : null}
          {view.phase === "uploading" || view.phase === "reading" || view.phase === "importing" ? <ReadingPanel view={view} actions={actions} t={t} /> : null}
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

function ReadingPanel({ view, actions, t }: { view: ScanBatchView; actions: ScanBatchActions; t: Translate }) {
  const reattach = useRef<HTMLInputElement | null>(null);
  const total = view.cards.length;
  const head = view.phase === "uploading"
    ? t(b.uploadingTitle, { done: view.uploaded, n: view.photos })
    : view.phase === "importing" ? t(b.importing) : t(b.readingTitle, { n: total });
  const percent = view.phase === "uploading" ? (view.photos ? view.uploaded / view.photos : 0) * 30 : view.phase === "importing" ? 96 : 30 + (total ? view.settled / total : 0) * 66;
  return (
    <div className={styles.columns}>
      <Card data-scan-reading="">
        <div className={styles.stack}>
          <div className={styles.rowBetween}>
            <h2 className={styles.title} aria-live="polite">{head}</h2>
            {view.phase === "reading" ? <span className={styles.label}>{t(b.readProgress, { done: view.settled, n: total })}</span> : null}
          </div>
          <ProgressBar value={Math.round(percent)} label={head} />
          <p className={styles.body}>{t(b.readingLead)}</p>
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
          <ul className={styles.list}>
            {view.cards.map((card) => <CardRow key={card.cardId} card={card} t={t} />)}
          </ul>
        </div>
      </Card>
      <AfterCard t={t} />
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
  const pending = useMemo(() => view.cards.filter((card) => card.section !== null), [view.cards]);
  const dups = pending.filter((card) => card.section === "duplicate");
  const reviews = pending.filter((card) => card.section === "review");
  const ready = pending.filter((card) => card.section === "ready");
  const failed = pending.filter((card) => card.section === "failed");
  const order = [...dups, ...reviews, ...ready, ...failed];
  const addable = [...dups, ...reviews, ...ready];
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

  return (
    <div className={styles.columns}>
      <div className={styles.stack} data-scan-review="">
        <Card>
          <div className={styles.stack}>
            <h2 className={styles.title}>{t(b.reviewTitle, { n: view.cards.length })}</h2>
            <p className={styles.body}>{t(b.reviewLead)}</p>
            <div className={styles.tiles}>
              <button type="button" className={`btn ${styles.tile} ${styles.rise}`} onClick={() => scrollTo(SECTION_ID.duplicate)} data-scan-tile="duplicate">
                <CountUp value={view.counts.duplicate} className={styles.tileNumber} /><span className={styles.label}>{t(b.tileDuplicate)}</span>
              </button>
              <button type="button" className={`btn ${styles.tile} ${styles.rise}`} onClick={() => scrollTo(SECTION_ID.review)} data-scan-tile="review">
                <CountUp value={view.counts.review} className={styles.tileNumber} /><span className={styles.label}>{t(b.tileReview)}</span>
              </button>
              <button type="button" className={`btn ${styles.tile} ${styles.rise}`} onClick={() => scrollTo(SECTION_ID.ready)} data-scan-tile="asIs">
                <CountUp value={view.counts.asIs} className={styles.tileNumber} /><span className={styles.label}>{t(b.tileAsIs)}</span>
              </button>
            </div>
          </div>
        </Card>

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

        {dups.length ? (
          <section id={SECTION_ID.duplicate} className={styles.section} data-scan-section="duplicate">
            <h3 className={styles.sectionTitle}>{t(b.sectionDuplicate)}</h3>
            {dups.map((card) => (
              <DuplicateCard key={card.cardId} {...cardProps(card)} choice={choices[card.cardId] ?? "merge"} onChoose={(choice) => setChoices((current) => ({ ...current, [card.cardId]: choice }))} />
            ))}
          </section>
        ) : null}

        {groups.length ? (
          <section id={SECTION_ID.review} className={styles.section} data-scan-section="review">
            <h3 className={styles.sectionTitle}>{t(b.sectionReview)}</h3>
            {groups.map(([group, cards]) => (
              <div key={group} className={styles.stack} data-scan-group={group}>
                <span className={styles.label}>{t(GROUP_COPY[group])} · {cards.length}</span>
                {cards.map((card) => <ReviewCard key={card.cardId} {...cardProps(card)} />)}
              </div>
            ))}
          </section>
        ) : null}

        <section id={SECTION_ID.ready} className={styles.section} data-scan-section="ready">
          <h3 className={styles.sectionTitle}>{t(b.sectionAsIs)}</h3>
          {view.counts.autoAdded ? <p className={styles.body} data-scan-auto-added={view.counts.autoAdded}>{t(b.asIsAuto, { n: view.counts.autoAdded })}</p> : null}
          {ready.length ? (
            <Card>
              <p className={styles.label}>{t(b.asIsHeld)}</p>
              <ul className={styles.list}>{ready.map((card) => <CardRow key={card.cardId} card={card} t={t} />)}</ul>
            </Card>
          ) : null}
        </section>

        {failed.length ? (
          <section id={SECTION_ID.failed} className={styles.section} data-scan-section="failed">
            <h3 className={styles.sectionTitle}>{t(b.sectionFailed)}</h3>
            {failed.map((card) => <FailedCard key={card.cardId} {...cardProps(card)} />)}
          </section>
        ) : null}

        <div className={styles.footer} data-scan-footer="">
          <Button variant="primary" icon="user-plus" label={t(b.addAll, { n: addable.length })} disabled={!addable.length} loading={busy} onClick={() => void addAll()} data-scan-add-all={addable.length} />
          <Button variant="ghost" label={t(b.later)} onClick={onLater} data-scan-later="" />
          <span className={styles.label}>{t(b.laterNote)}</span>
        </div>
      </div>
      <div className={styles.stack}>
        <Card variant="flat" className={styles.keysCard} data-scan-keys="">
          <div className={styles.kbd}>
            <span className={styles.sectionTitle}>{t(b.keyboardTitle)}</span>
            <span className={styles.row}><Kbd>↵</Kbd><span className={styles.label}>{t(b.keyConfirm)}</span></span>
            <span className={styles.row}><Kbd>→</Kbd><span className={styles.label}>{t(b.keyNext)}</span></span>
            <span className={styles.row}><Kbd>S</Kbd><span className={styles.label}>{t(b.keySkip)}</span></span>
          </div>
        </Card>
        <AfterCard t={t} />
      </div>
    </div>
  );
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

function DuplicateCard({ card, t, busy, focused, problem, onFocus, onConfirm, onSkip, choice, onChoose }: CardProps & { choice: Choice; onChoose: (choice: Choice) => void }) {
  const candidate = card.candidate;
  const message = problemCopy(card, problem);
  if (!candidate) return null;
  const rows = (["displayName", "organization", "role", "email", "phone"] as const).filter((field) => (candidate[field] ?? "").trim() || (card.draft?.fields[field] ?? "").trim());
  return (
    <div className={cardClass(focused, problem)} onFocusCapture={onFocus} onMouseDown={onFocus} data-review-card={card.cardId} data-duplicate-card={card.cardId}>
      <div className={styles.row}>
        <b className={styles.grow}>{card.name || t(b.noName)}</b>
        {candidate.matchedOn.map((match) => (MATCH_COPY[match] ? <Chip key={match} label={t(MATCH_COPY[match]!)} tone="lav" /> : null))}
      </div>
      <div className={styles.compare} data-compare="">
        <span />
        <span className={styles.compareHead}>{t(b.existing)}</span>
        <span className={styles.compareHead}>{t(b.incoming)}</span>
        {rows.map((field) => {
          const existing = candidate[field] ?? "";
          const incoming = card.draft?.fields[field] ?? "";
          const differs = existing.trim() !== incoming.trim();
          return (
            <span key={field} className={styles.contents} data-compare-field={field} data-differs={differs || undefined}>
              <span className={styles.label}>{t(FIELD_COPY[field])}</span>
              <span>{existing || "—"}</span>
              <span className={differs ? styles.compareDiff : undefined}>{incoming || "—"}</span>
            </span>
          );
        })}
      </div>
      <div className={styles.choiceRow} role="radiogroup" aria-label={card.name || t(b.noName)}>
        <FilterOption label={t(b.merge)} selected={choice === "merge"} onToggle={() => onChoose("merge")} />
        <FilterOption label={t(b.separate)} selected={choice === "separate"} onToggle={() => onChoose("separate")} />
        <span className={styles.label}>{t(b.mergeNote)}</span>
      </div>
      {message ? <p className={styles.error} role="alert"><Icon name="alert" size={16} />{t(message)}</p> : null}
      <div className={styles.row}>
        <Button size="sm" variant="primary" label={choice === "merge" ? t(b.merge) : t(b.separate)} disabled={busy} onClick={onConfirm} data-duplicate-confirm={card.cardId} />
        <Button size="sm" variant="ghost" label={t(b.skip)} disabled={busy} onClick={onSkip} />
      </div>
    </div>
  );
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
  return (
    <div className={styles.columns}>
      <div className={styles.stack} data-scan-done="">
        <Card>
          <div className={styles.doneHead}>
            <MacTile emoji="🎉" />
            <h2 className={styles.bigTitle}>{t(b.doneTitle, { n: view.counts.created + view.counts.merged })}</h2>
            <p className={styles.label}>{scene}</p>
          </div>
          <div className={`${styles.tiles} ${styles.tilesSpaced}`}>
            <div className={`${styles.tile} ${styles.rise}`} data-done-tile="created"><CountUp value={view.counts.created} className={styles.tileNumber} /><span className={styles.label}>{t(b.doneNew)}</span></div>
            <div className={`${styles.tile} ${styles.rise}`} data-done-tile="merged"><CountUp value={view.counts.merged} className={styles.tileNumber} /><span className={styles.label}>{t(b.doneMerged)}</span></div>
            <div className={`${styles.tile} ${styles.rise} ${view.counts.unreadable ? styles.tileWarn : ""}`} data-done-tile="unreadable"><CountUp value={view.counts.unreadable} className={styles.tileNumber} /><span className={styles.label}>{t(b.doneFailed)}</span></div>
          </div>
        </Card>
        <Card title={t(b.nextTitle)}>
          <div className={styles.next} data-done-plan={view.completed ? "ready" : "pending"}>
            <MacTile emoji="🎯" size="sm" />
            <span className={styles.grow}><b>{t(b.nextPlan)}</b><span className={styles.label}>{t(view.completed ? b.nextPlanReady : b.nextPlanPending)}</span></span>
            {view.completed ? <Button size="sm" label={t(b.nextPlanOpen)} onClick={() => go(planTaskSegmentHref("web"))} /> : null}
          </div>
          {view.counts.unreadable ? (
            <div className={styles.next} data-done-unreadable={view.counts.unreadable}>
              <MacTile emoji="🧩" size="sm" tone="apricot" />
              <span className={styles.grow}><b>{t(b.nextFailed, { n: view.counts.unreadable })}</b><span className={styles.label}>{t(b.nextFailedBody)}</span></span>
            </div>
          ) : null}
        </Card>
        <div className={styles.row}>
          <Button variant="primary" icon="users" label={t(b.viewNetwork)} onClick={() => go("/app/contacts")} data-done-network="" />
          <Button variant="ghost" icon="scan" label={t(b.scanMore)} onClick={() => go("/app/contacts/new/scan")} data-done-more="" />
        </div>
      </div>
      <AfterCard t={t} />
    </div>
  );
}
