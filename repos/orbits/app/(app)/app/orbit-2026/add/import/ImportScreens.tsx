"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import type { ContactImportBatchView, ContactImportMappableField, ContactImportRowView } from "../../../../../../shared/contract/contact-import";
import { appendWebGuideReturnTo, type WebGuideReturnTo } from "../../../../../../features/guide/return-to";
import { useOrbitLanguage } from "../../../orbit-language-context";
import { addImportCopy as c } from "../../copy/add-import";
import { addManualCopy } from "../../copy/add";
import { ShellPage } from "../../shell/slots";
import { Button, Card, CountUp, Icon, IconButton, MacTile, Orbit2026Scope, RetryCard, Skeleton, ToastProvider, useToast } from "../../ui";
import { translator, type Translate } from "../add-parts";
import addStyles from "../add.module.css";
import { ReviewRail, UnifiedReview, type ReviewDuplicateRow, type ReviewGroupRow } from "../UnifiedReview";
import { ImportApiError, allRows, commitImport, importApi, newKey, prepareImportFile } from "./import-api";
import {
  addCount,
  commitPlan,
  defaultMergeChoice,
  differingFields,
  exceptionCount,
  fieldExample,
  fieldFill,
  fileSizeLabel,
  importSourceOf,
  isProbablyMoved,
  mergesIntoExisting,
  serverSkipped,
  mappingColumns,
  remap,
  splitImportRows,
  type ImportIssueGroup,
  type ImportSource,
} from "./import-model";
import {
  IMPORT_HREF,
  ImportDoorsView,
  ImportEventView,
  ImportMappingView,
  ImportRowsList,
  ImportUploadView,
  LINKEDIN_EXPORT_URL,
  railFor,
  type EventOptionView,
  type EventPersonView,
  type ImportMethod,
  type MappingRowView,
  type PersonPreview,
  type UploadedFileView,
} from "./ImportViews";
import styles from "./import.module.css";

const SOURCE_LABEL = { vcard: c.sourceVcard, event: c.sourceEvent } as const;
/** LinkedIn / CSV are the same word in every language (brand / format), so they are not copy. */
const SOURCE_BRAND = { linkedin: "LinkedIn", csv: "CSV" } as const;
const sourceName = (source: ImportSource, t: Translate) => (source === "linkedin" || source === "csv" ? SOURCE_BRAND[source] : t(SOURCE_LABEL[source]));
const TITLE = { linkedin: [c.linkedinTitle, c.linkedinCrumb], contacts: [c.vcardTitle, c.vcardCrumb], csv: [c.csvTitle, c.csvCrumb], event: [c.eventTitle, c.eventCrumb] } as const;

function usePage(returnTo: WebGuideReturnTo | null = null) {
  const { language, preserveHref } = useOrbitLanguage();
  const router = useRouter();
  const t = translator(language);
  const href = (path: string) => preserveHref(path.startsWith(IMPORT_HREF) ? appendWebGuideReturnTo(path, returnTo) : path);
  return { language, t, href, go: (path: string) => router.push(href(path)), replace: (path: string) => router.replace(href(path)) };
}

export function batchHref(id: string, step?: "review"): string {
  return `${IMPORT_HREF}/${encodeURIComponent(id)}${step ? `?step=${step}` : ""}`;
}

function rejectMessage(t: Translate, error: unknown): string {
  const reason = error instanceof ImportApiError ? error.reason : null;
  if (reason === "too_large") return t(c.errTooLarge);
  if (reason === "too_many_rows") return t(c.errTooMany);
  if (reason === "empty" || reason === "NOTHING_TO_IMPORT") return t(c.errEmpty);
  if (reason === "undecodable") return t(c.errUndecodable);
  if (reason === "not_vcard") return t(c.errNotVcard);
  if (error instanceof ImportApiError && error.status === 503) return t(c.errUnavailable);
  return t(c.errGeneric);
}

/** `/app/contacts/new/import` (W-R16-10) and `?method=linkedin|contacts|csv|event`. */
export function ImportStartScreen({ method, preset, returnTo = null }: { method: ImportMethod | null; preset?: StartPreset; returnTo?: WebGuideReturnTo | null }) {
  const page = usePage(returnTo);
  const { t } = page;
  const back = <IconButton icon="left" label={t(c.back)} onClick={() => page.go(returnTo ?? (method ? IMPORT_HREF : "/app/contacts/new"))} />;
  const [title, crumb] = method ? TITLE[method] : [c.doorsTitle, c.doorsCrumb];
  const rail = railFor(method === "contacts" ? "vcard" : method ?? "doors", t);
  return (
    <Orbit2026Scope language={page.language} className={addStyles.page}>
      <ToastProvider>
        <ShellPage title={t(title)} subtitle={t(crumb)} left={back} rightRail={rail} />
        {method === null ? <ImportDoorsView t={t} href={page.href} /> : null}
        {method === "linkedin" || method === "contacts" || method === "csv" ? <UploadStep key={method} method={method} preset={preset?.file} returnTo={returnTo} /> : null}
        {method === "event" ? <EventStep preset={preset?.event} returnTo={returnTo} /> : null}
      </ToastProvider>
    </Orbit2026Scope>
  );
}

/** Read-only states for the local pixel gate (design fixtures); never set in production. */
export interface StartPreset {
  file?: UploadedFileView;
  event?: { events: EventOptionView[]; selected: string; people: EventPersonView[] };
}

function UploadStep({ method, preset, returnTo }: { method: "linkedin" | "contacts" | "csv"; preset?: UploadedFileView; returnTo: WebGuideReturnTo | null }) {
  const page = usePage(returnTo);
  const { t } = page;
  const [file, setFile] = useState<UploadedFileView | null>(preset ?? null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const onFiles = async (files: FileList | File[]) => {
    const picked = Array.from(files)[0];
    if (!picked || reading) return;
    setError("");
    setReading(true);
    try {
      const prepared = await prepareImportFile(picked, method === "contacts" ? "vcard" : "csv");
      if (prepared.ok === false) {
        setError(prepared.reason === "zipNoCsv" ? t(c.errZipNoCsv) : prepared.reason === "zipBroken" ? t(c.errZipBroken) : t(c.errWrongType, { kinds: method === "contacts" ? ".vcf" : method === "linkedin" ? "CSV / ZIP" : "CSV" }));
        return;
      }
      const { batch } = await importApi.upload(prepared.blob, prepared.name, prepared.kind, newKey());
      setBatchId(batch.id);
      setFile({ name: prepared.name, count: batch.rowCount, size: fileSizeLabel(prepared.size) });
    } catch (caught) {
      setFile(null);
      setBatchId(null);
      setError(rejectMessage(t, caught));
    } finally {
      setReading(false);
    }
  };
  return (
    <ImportUploadView t={t} method={method} file={file} reading={reading} error={error}
      onFiles={(files) => void onFiles(files)}
      onRemove={() => { setFile(null); setBatchId(null); }}
      onCancel={() => page.go(IMPORT_HREF)}
      onNext={() => { if (batchId) page.go(batchHref(batchId, method === "contacts" ? "review" : undefined)); }}
      onOpenLinkedIn={() => window.open(LINKEDIN_EXPORT_URL, "_blank", "noopener,noreferrer")} />
  );
}

/** 10月7日（火） in Tokyo time. */
export function eventDay(iso: string | null, language: string, t: Translate): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat(language === "en" ? "en-US" : language === "zh" ? "zh-CN" : "ja-JP", { timeZone: "Asia/Tokyo", month: language === "en" ? "short" : "numeric", day: "numeric", weekday: "short" }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return t(c.eventDay, { month: get("month"), day: get("day"), weekday: get("weekday").replace(/^\u5468/, "") });
}

function personSub(row: ContactImportRowView): string {
  return [row.fields.organization, row.fields.role].filter(Boolean).join(" · ");
}

function EventStep({ preset, returnTo }: { preset?: StartPreset["event"]; returnTo: WebGuideReturnTo | null }) {
  const page = usePage(returnTo);
  const { t } = page;
  const [events, setEvents] = useState<EventOptionView[]>(preset?.events ?? []);
  const [selected, setSelected] = useState<string | null>(preset?.selected ?? null);
  const [batch, setBatch] = useState<ContactImportBatchView | null>(null);
  const [rows, setRows] = useState<ContactImportRowView[]>([]);
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const keys = useRef(new Map<string, string>());
  const latest = useRef<string | null>(null);
  useEffect(() => {
    if (preset) return;
    let live = true;
    void importApi.events().then(({ events: list }) => {
      if (live) setEvents(list.map((event) => ({ eventId: event.eventId, title: event.title, meta: eventDay(event.startsAt ?? event.lastExchangeAt, page.language, t), cards: event.exchanged })));
    }).catch(() => live && setEvents([]));
    return () => { live = false; };
  }, [preset, page.language]);
  const select = async (eventId: string) => {
    setSelected(eventId);
    latest.current = eventId;
    if (preset) return;
    setLoading(true);
    try {
      // One idempotency key per event on this page: choosing it again opens the same batch.
      const key = keys.current.get(eventId) ?? newKey();
      keys.current.set(eventId, key);
      const result = await importApi.importEvent(eventId, key);
      const list = await allRows(result.batch.id);
      // A later choice wins: an earlier event's answer arriving late is dropped.
      if (latest.current !== eventId) return;
      setBatch(result.batch);
      setRows(list);
      setChecked(Object.fromEntries(list.map((row) => [row.seq, row.decision !== "skip"])));
    } catch (caught) {
      if (latest.current !== eventId) return;
      setBatch(null);
      setRows([]);
      toast.error(rejectMessage(t, caught));
    } finally {
      if (latest.current === eventId) setLoading(false);
    }
  };
  const people: EventPersonView[] = preset ? preset.people : rows.map((row) => ({
    seq: row.seq,
    name: row.fields.displayName || t(c.noName),
    sub: personSub(row),
    inNetwork: mergesIntoExisting(row),
    checked: checked[row.seq] ?? false,
  }));
  const next = async () => {
    if (!batch) return;
    setBusy(true);
    try {
      // Not ticked → skip; ticked again after an earlier skip → create. People already in 人脈 stay merged.
      const decisions = rows.filter((row) => row.status === "pending" && !mergesIntoExisting(row)).flatMap((row): { seq: number; decision: "skip" | "create" }[] => (
        !checked[row.seq] && row.decision !== "skip" ? [{ seq: row.seq, decision: "skip" as const }]
          : checked[row.seq] && row.decision === "skip" ? [{ seq: row.seq, decision: "create" as const }] : []
      ));
      if (decisions.length) await importApi.decide(batch.id, decisions);
      page.go(batchHref(batch.id, "review"));
    } catch (caught) {
      toast.error(rejectMessage(t, caught));
    } finally {
      setBusy(false);
    }
  };
  return (
    <ImportEventView t={t} events={events} selected={selected} people={people} loading={loading} busy={busy}
      onSelect={(eventId) => void select(eventId)}
      onToggle={(seq) => setChecked((current) => ({ ...current, [seq]: !current[seq] }))}
      onCancel={() => page.go(IMPORT_HREF)}
      onNext={() => void next()} />
  );
}

export type ImportBatchData =
  | { phase: "loading" }
  | { phase: "missing" | "expired" | "cancelled" }
  | { phase: "error"; retry: () => void }
  | { phase: "ready"; batch: ContactImportBatchView; rows: ContactImportRowView[] };

/** What まとめて確認 needs beyond the rows: in the design fixtures the board's own group lines. */
export interface ReviewOverride {
  autoMerged: number;
  duplicates: ReviewDuplicateRow[];
  groups: ReviewGroupRow[];
  asIs: number;
  addCount: number;
  emails: number;
  reviewSub: string;
}

export interface ImportBatchActions {
  remap: (column: number, field: ContactImportMappableField | null) => Promise<void>;
  commit: (mergeChoice: Readonly<Record<number, boolean>>, skipped: ReadonlySet<number>) => Promise<void>;
}

/** `/app/contacts/new/import/[id]`: 列の対応 (CSV) → まとめて確認 (`?step=review`) → 完成. */
export function ImportBatchScreen({ data, step, actions, review, returnTo = null }: { data: ImportBatchData; step: "mapping" | "review"; actions: ImportBatchActions; review?: ReviewOverride; returnTo?: WebGuideReturnTo | null }) {
  const page = usePage(returnTo);
  const { t } = page;
  const batch = data.phase === "ready" ? data.batch : null;
  const source: ImportSource = batch ? importSourceOf(batch.format) : "csv";
  const done = batch?.status === "completed" || batch?.status === "committing";
  const showMapping = Boolean(batch && !done && step === "mapping" && batch.kind === "csv");
  const back = <IconButton icon="left" label={t(c.back)} onClick={() => page.go(batch && !showMapping && batch.kind === "csv" ? batchHref(batch.id) : returnTo ?? IMPORT_HREF)} />;
  const title = done ? t(c.reviewTitle) : showMapping ? t(c.mapTitle) : t(c.reviewTitle);
  const subtitle = !batch ? t(c.doorsCrumb) : showMapping ? t(c.mapSub, { source: sourceName(source, t), file: batch.fileName, n: batch.rowCount.toLocaleString() }) : t(c.reviewSub, { source: sourceName(source, t), n: batch.rowCount.toLocaleString() });
  const stepLabel = batch && !done && batch.kind === "csv" ? <span className={styles.lbl}>{t(c.step, { n: showMapping ? 2 : 3 })}</span> : undefined;
  return (
    <Orbit2026Scope language={page.language} className={addStyles.page}>
      <ToastProvider>
        <ShellPage title={title} subtitle={subtitle} left={back} right={stepLabel} rightRail={batch ? railFor(source, t) : undefined} />
        <div data-import-batch={batch?.id ?? ""} data-import-phase={data.phase === "ready" ? (done ? "done" : showMapping ? "mapping" : "review") : data.phase}>
          {data.phase === "loading" ? <Skeleton lines={6} /> : null}
          {data.phase === "missing" || data.phase === "expired" || data.phase === "cancelled" ? <ImportErrorCard phase={data.phase} t={t} go={page.go} /> : null}
          {data.phase === "error" ? <RetryCard title={t(c.errLoad)} onRetry={data.retry} /> : null}
          {data.phase === "ready" && showMapping ? <MappingPanel batch={data.batch} rows={data.rows} source={source} actions={actions} t={t} onNext={() => page.go(batchHref(data.batch.id, "review"))} onBack={() => page.go(`${IMPORT_HREF}?method=${source === "linkedin" ? "linkedin" : "csv"}`)} /> : null}
          {data.phase === "ready" && !showMapping && !done ? <ReviewPanel batch={data.batch} rows={data.rows} source={source} actions={actions} t={t} review={review} onLater={() => page.go(returnTo ?? "/app/contacts")} /> : null}
          {data.phase === "ready" && done ? <DonePanel batch={data.batch} source={source} t={t} go={page.go} returnTo={returnTo} /> : null}
        </div>
      </ToastProvider>
    </Orbit2026Scope>
  );
}

function MappingPanel({ batch, rows, source, actions, t, onNext, onBack }: { batch: ContactImportBatchView; rows: ContactImportRowView[]; source: ImportSource; actions: ImportBatchActions; t: Translate; onNext: () => void; onBack: () => void }) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const first = rows[0];
  const total = rows.length;
  const mappingRows: MappingRowView[] = mappingColumns(batch).map((column) => {
    const fill = column.field ? fieldFill(rows, column.field) : null;
    const sparse = Boolean(fill?.sparse);
    return { index: column.index, header: column.header, field: column.field, example: sparse ? t(c.sparseExample, { total: total.toLocaleString(), n: fill!.filled }) : column.field ? fieldExample(first, column.field) : "", sparse };
  });
  const preview: PersonPreview[] = rows.filter((row) => row.fields.displayName).slice(0, 3).map((row) => ({ key: String(row.seq), name: row.fields.displayName, sub: personSub(row) }));
  const split = useMemo(() => splitImportRows(rows), [rows]);
  return (
    <ImportMappingView t={t} source={source} rows={mappingRows} preview={preview} exceptions={exceptionCount(split)} busy={busy}
      onChange={(column, field) => {
        if (!batch.mapping) return;
        setBusy(true);
        void actions.remap(column, field).catch(() => toast.error(t(c.remapFailed))).finally(() => setBusy(false));
      }}
      onBack={onBack} onNext={onNext} />
  );
}

const GROUP_LABEL: Record<ImportIssueGroup, typeof c.issueEmail> = { email: c.issueEmail, truncated: c.issueTruncated, country: c.issueCountry, inFile: c.issueInFile, blocked: c.issueBlocked };

function groupExample(group: ImportIssueGroup, row: ContactImportRowView, t: Translate): string {
  const name = row.fields.displayName || t(c.noName);
  if (group === "email") return t(c.issueEmailExample, { value: name });
  if (group === "truncated") return t(c.issueTruncatedExample, { name });
  if (group === "country") return t(c.issueCountryExample, { name });
  if (group === "inFile") return t(c.issueInFileExample, { name });
  return t(c.issueBlockedExample, { n: row.seq });
}

function ReviewPanel({ batch, rows, source, actions, t, review, onLater }: { batch: ContactImportBatchView; rows: ContactImportRowView[]; source: ImportSource; actions: ImportBatchActions; t: Translate; review?: ReviewOverride; onLater: () => void }) {
  const split = useMemo(() => splitImportRows(rows), [rows]);
  const [choice, setChoice] = useState<Record<number, boolean>>(() => defaultMergeChoice(split.duplicates));
  // Starts from what the server already left out (イベントから: not ticked), so they are not created at commit.
  const [skipped, setSkipped] = useState<Set<number>>(() => serverSkipped(rows));
  const [oneByOne, setOneByOne] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const duplicateRows: ReviewDuplicateRow[] = review?.duplicates ?? split.duplicates.map((row) => {
    const candidate = row.candidate!;
    const moved = isProbablyMoved(row);
    const fields = differingFields(row);
    const difference = moved ? t(c.diffMoved) : fields.length ? fields.map((field) => t(field === "displayName" ? c.diffName : field === "organization" ? c.diffOrganization : c.diffRole)).join(" · ") : t(c.diffSame);
    return {
      id: String(row.seq),
      existing: [candidate.displayName, candidate.organization].filter(Boolean).join(" · "),
      incoming: [row.fields.displayName, row.fields.organization].filter(Boolean).join(" · "),
      difference,
      warn: moved,
      selected: Boolean(choice[row.seq]),
    };
  });
  const groups: ReviewGroupRow[] = review?.groups ?? split.groups.map(({ group, rows: list }) => ({ key: group, label: t(GROUP_LABEL[group]), example: groupExample(group, list[0]!, t), tone: group === "blocked" || group === "inFile" ? "lo" : "mid", count: list.length }));
  const autoMerged = review?.autoMerged ?? split.autoMerged.length;
  const reviewCount = groups.reduce((sum, group) => sum + group.count, 0);
  const asIs = review?.asIs ?? split.asIs.length;
  const count = review?.addCount ?? addCount(split, skipped);
  const emails = review?.emails ?? rows.filter((row) => row.fields.email).length;
  const selectedSeqs = split.duplicates.filter((row) => choice[row.seq]).map((row) => row.seq);
  const setSelected = (merge: boolean) => setChoice((current) => {
    const next = { ...current };
    // 別人として追加 / 選んだ N件を統合 settle the ticked rows; they leave the tick so the table reads as decided.
    for (const seq of selectedSeqs) next[seq] = merge;
    return next;
  });
  const commit = async () => {
    setBusy(true);
    try {
      await actions.commit(choice, skipped);
    } catch {
      toast.error(t(c.addFailed));
    } finally {
      setBusy(false);
    }
  };
  const reviewRows = split.groups.flatMap(({ rows: list }) => list).map((row) => ({ seq: row.seq, name: row.fields.displayName || t(c.noName), sub: personSub(row) || groupExample(split.groups.find((entry) => entry.rows.includes(row))!.group, row, t), locked: row.decision === "skip" && (row.inFileDuplicateOf !== null || row.issues.length > 0 && !row.fields.displayName) }));
  return (
    <UnifiedReview
      t={t}
      tiles={{
        duplicate: { count: duplicateRows.length + autoMerged, sub: t(c.tileDuplicateSub, { n: autoMerged }) },
        review: { count: reviewCount, sub: review?.reviewSub ?? (groups.length ? t(c.tileReviewSub, { labels: [...new Set(groups.map((group) => group.label))].join(t(c.listSep)) }) : t(c.tileReviewNone)) },
        asIs: { count: asIs, sub: t(c.tileAsIsSub) },
      }}
      onTile={(key) => document.querySelector(key === "duplicate" ? "[data-review-duplicates]" : key === "review" ? "[data-review-groups]" : "[data-review-add-all]")?.scrollIntoView({ behavior: "smooth", block: "center" })}
      sourceLabel={t(c.incoming, { source: sourceName(source, t) })}
      autoMerged={autoMerged}
      duplicates={duplicateRows}
      onToggleDuplicate={(id) => setChoice((current) => ({ ...current, [Number(id)]: !current[Number(id)] }))}
      onSeparate={() => setSelected(false)}
      onMergeSelected={() => setSelected(true)}
      groups={groups}
      onOneByOne={() => setOneByOne((value) => !value)}
      onApplySuggestions={() => { setSkipped(serverSkipped(rows)); setOneByOne(false); }}
      note={[t(c.reviewNote), source === "linkedin" ? t(c.reviewNoteLinkedIn, { n: emails }) : ""].filter(Boolean).join(" · ")}
      onLater={onLater}
      addCount={count}
      onAddAll={() => void commit()}
      busy={busy}
      extra={oneByOne && reviewRows.length ? <ImportRowsList t={t} rows={reviewRows} skipped={skipped} onToggle={(seq) => setSkipped((current) => { const next = new Set(current); if (next.has(seq)) next.delete(seq); else next.add(seq); return next; })} /> : undefined}
    />
  );
}

function DonePanel({ batch, source, t, go, returnTo }: { batch: ContactImportBatchView; source: ImportSource; t: Translate; go: (href: string) => void; returnTo: WebGuideReturnTo | null }) {
  const added = batch.counts.created + batch.counts.merged;
  return (
    <div className={addStyles.wgrid} data-import-done={added}>
      <Card className={`${addStyles.span7} ${addStyles.doneMain}`}>
        <div className={addStyles.doneCenter}>
          <div className={addStyles.doneEmoji} aria-hidden>🎉</div>
          <h2 className={addStyles.doneTitle}>{t(c.doneTitle, { n: added })}</h2>
          <p className={addStyles.doneSub}>{t(c.doneScene, { source: sourceName(source, t), file: batch.fileName })}</p>
        </div>
        <div className={addStyles.bignum3}>
          <div data-done-tile="created"><b><CountUp value={batch.counts.created} /></b><span className={addStyles.bigLabel}>{t(c.doneNew)}</span></div>
          <div data-done-tile="merged"><b><CountUp value={batch.counts.merged} /></b><span className={addStyles.bigLabel}>{t(c.doneMerged)}</span></div>
          <div data-done-tile="skipped"><b><CountUp value={batch.counts.skipped + batch.counts.failed} /></b><span className={addStyles.bigLabel}>{t(c.doneSkipped)}</span></div>
        </div>
      </Card>
      <Card className={`${addStyles.span5} ${addStyles.doneNext}`}>
        <div className={addStyles.doneNextHead}><h3>{t(c.doneNextTitle)}</h3></div>
        <div className={addStyles.nx}>
          <MacTile emoji="💬" size="sm" tone="lav" />
          <div className={addStyles.nxMeta}><b>{t(c.doneNextQuestion)}</b><span>{t(c.doneNextQuestionBody)}</span></div>
        </div>
        <div className={addStyles.nx}>
          <MacTile emoji="🎯" size="sm" tone="teal" />
          <div className={addStyles.nxMeta}><b>{t(c.doneNextPlan)}</b><span>{t(c.doneNextPlanBody)}</span></div>
        </div>
      </Card>
      <div className={`${addStyles.span12} ${addStyles.doneActs}`}>
        {returnTo ? <Button variant="primary" className={addStyles.h44} label={t(addManualCopy.sampleGuidePlain)} onClick={() => go(returnTo)} data-done-guide="" /> : null}
        <Button variant="primary" icon="users" className={addStyles.h44} label={t(c.viewNetwork)} onClick={() => go("/app/contacts")} data-done-network="" />
        <Button variant="ghost" className={addStyles.h44} label={t(c.importMore)} onClick={() => go(IMPORT_HREF)} data-done-more="" />
      </div>
    </div>
  );
}

function ImportErrorCard({ phase, t, go }: { phase: "missing" | "expired" | "cancelled"; t: Translate; go: (href: string) => void }) {
  const title = phase === "missing" ? c.errMissingTitle : phase === "expired" ? c.errExpiredTitle : c.errCancelledTitle;
  return (
    <div className={addStyles.wgrid}>
      <Card className={addStyles.errCard} role="alert" data-import-error-card={phase}>
        <div className={addStyles.errIc}><Icon name="alert" size={24} /></div>
        <b className={addStyles.errTitle}>{t(title)}</b>
        <div className={addStyles.errSub}>{t(c.errBody)}</div>
        <div className={addStyles.errActs}>
          <Button variant="primary" label={t(c.importAgain)} onClick={() => go(IMPORT_HREF)} />
          <Button variant="ghost" label={t(c.viewNetwork)} onClick={() => go("/app/contacts")} />
        </div>
      </Card>
    </div>
  );
}

/** The live batch: loads it and its rows, re-reads after a remap, commits with every merge confirmed. */
export function ImportBatchClient({ batchId, step, returnTo = null }: { batchId: string; step: "mapping" | "review"; returnTo?: WebGuideReturnTo | null }) {
  const [data, setData] = useState<ImportBatchData>({ phase: "loading" });
  const intent = useRef(newKey());
  const load = async () => {
    try {
      const { batch } = await importApi.get(batchId);
      if (batch.status === "expired") return setData({ phase: "expired" });
      if (batch.status === "cancelled") return setData({ phase: "cancelled" });
      setData({ phase: "ready", batch, rows: batch.status === "completed" ? [] : await allRows(batchId) });
    } catch (caught) {
      // 404 = not this person's / gone; anything else (offline, 500) can be retried.
      if (caught instanceof ImportApiError && caught.status === 404) setData({ phase: "missing" });
      else setData({ phase: "error", retry: () => { setData({ phase: "loading" }); void load(); } });
    }
  };
  useEffect(() => { void load(); }, [batchId]); // eslint-disable-line react-hooks/exhaustive-deps
  const actions: ImportBatchActions = {
    remap: async (column, field) => {
      if (data.phase !== "ready" || !data.batch.mapping) return;
      const { batch } = await importApi.remap(batchId, remap(data.batch.mapping, column, field));
      setData({ phase: "ready", batch, rows: await allRows(batchId) });
    },
    commit: async (mergeChoice, skipped) => {
      if (data.phase !== "ready") return;
      const plan = commitPlan(data.rows, mergeChoice, skipped);
      try {
        const batch = await commitImport(batchId, intent.current, plan.decisions, plan.mergeConfirmations);
        setData({ phase: "ready", batch, rows: [] });
        window.scrollTo({ top: 0 });
      } catch (caught) {
        // The batch may have been committed by an earlier try (or changed): read it again, then say it failed.
        void load();
        throw caught;
      }
    },
  };
  return <ImportBatchScreen data={data} step={step} actions={actions} returnTo={returnTo} />;
}
