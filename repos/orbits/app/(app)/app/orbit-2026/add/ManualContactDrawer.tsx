"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import type { IngestContactCandidateContract } from "../../../../../shared/contract/business-card-batch";
import type { ManualContactFieldChoice, ManualContactMergeField } from "../../../../../shared/contract/manual-contact";
import { splitSignature, type SignatureField, type SignatureSpan } from "../../../../../shared/compute/signature-split";
import { addManualCopy as m } from "../copy/add";
import { Button, Chip, Drawer, FilterOption, Icon, IconButton, Kbd, MacTile, Radio, useScopeLanguage, useStandardCopy, useToast } from "../ui";
import { showShellToast } from "../shell/shell-toast-bridge";
import { DensityDots, translator, type Translate } from "./add-parts";
import { SampleBlockedDialog } from "./SampleBlockedDialog";
import { checkManualDuplicates, readEvents, saveManualContact, suggestOrganizations, undoManualContact } from "./manual-api";
import {
  EMPTY_MANUAL_FORM,
  applySignature,
  createBody,
  defaultChoices,
  differingFields,
  duplicateCheckBody,
  eventChips,
  formDensity,
  formFingerprint,
  monthDay,
  signatureRuns,
  type EventChip,
  type ManualDecision,
  type ManualForm,
} from "./manual-model";
import styles from "./add.module.css";

/** 即時の重複チェック（DESIGN §2.3：名前を入れたらすぐ、保存を待たない）。 */
export const MANUAL_DUPLICATE_DEBOUNCE_MS = 400;
const ORGANIZATION_DEBOUNCE_MS = 250;

const FIELD_LABEL: Record<ManualContactMergeField, typeof m.name> = {
  displayName: m.name,
  organization: m.organization,
  role: m.role,
  email: m.email,
  phone: m.phone,
};

/** b9 A4 Web: the items listed beside the pasted signature, in this order. */
const PASTE_ROWS = [
  { field: "displayName", label: m.pasteRowName },
  { field: "organization", label: m.organization },
  { field: "role", label: m.role },
  { field: "phone", label: m.phone },
  { field: "email", label: m.email },
  { field: "address", label: m.spanAddress },
  { field: "met", label: m.pasteRowMet },
] as const;

/** Coloured in the pasted text (b9 A4: 名前 lav · 会社 blue · 役職 teal · 電話 / メール apricot). */
const MARKED: ReadonlySet<SignatureField> = new Set(["displayName", "organization", "role", "phone", "email"]);

/** 推定 (b9 A4): an address is read by its shape, anything low-confidence is a guess. */
function isGuess(span: SignatureSpan): boolean {
  return span.field === "address" || span.confidence === "low";
}

function pastedTyped(form: ManualForm, field: SignatureField): boolean {
  return field in form && String(form[field as keyof ManualForm] ?? "").trim() !== "";
}

function pastedValue(form: ManualForm, spans: readonly SignatureSpan[], field: SignatureField): string {
  const typed = field in form ? String(form[field as keyof ManualForm] ?? "").trim() : "";
  return typed || spans.find((span) => span.field === field)?.value || "";
}

function metLabel(form: ManualForm, events: readonly EventChip[], t: Translate): string {
  if (!form.met) return "";
  if (form.met.kind === "event") return events.find((event) => event.eventId === form.met?.eventId)?.title ?? form.met.label ?? "";
  return form.met.label || t(m.metIntro);
}

/** b11 A3 Web「石川 洋介（ミライ精機 · 名刺）」: the name, then the company when known. */
function candidateName(candidate: IngestContactCandidateContract): string {
  return candidate.organization ? `${candidate.displayName}（${candidate.organization}）` : candidate.displayName;
}

function newKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `manual-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * 手入力 (b11 A3 Web): a 520 drawer on 人脈を追加 (`?add=manual`, full screen under 768). The save
 * bar is the drawer's footer slot, outside the scrolling body.
 * Name only is enough; a duplicate check runs as soon as a name is typed (same rule as a
 * card + 同名); 統合 lists only the fields that differ; 「署名を貼り付け」 splits a signature
 * by rules and marks the pieces in the original. ⌘↵ saves; on success the person's page
 * opens with 「人脈に追加しました · 手入力 [元に戻す]」 for 5 seconds.
 */
export function ManualContactDrawer({ open, onClose, navigate, now = () => new Date() }: {
  open: boolean;
  onClose: () => void;
  navigate: (href: string) => void;
  now?: () => Date;
}) {
  const language = useScopeLanguage();
  const t = translator(language);
  // The form state lives in ManualFormBody, which also draws the drawer: the save bar goes in
  // the drawer's own footer (outside the scrolling body — R12 review M1), full screen on a phone.
  return open ? <ManualFormBody t={t} onClose={onClose} navigate={navigate} now={now} /> : null;
}

function ManualFormBody({ t, onClose, navigate, now }: { t: Translate; onClose: () => void; navigate: (href: string) => void; now: () => Date }) {
  const toast = useToast();
  const [form, setForm] = useState<ManualForm>(EMPTY_MANUAL_FORM);
  const [candidates, setCandidates] = useState<readonly IngestContactCandidateContract[]>([]);
  const [decision, setDecision] = useState<ManualDecision>({ kind: "none" });
  const [nameError, setNameError] = useState(false);
  const [reviewNeeded, setReviewNeeded] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [events, setEvents] = useState<EventChip[]>([]);
  const [orgs, setOrgs] = useState<{ name: string; contactCount: number }[]>([]);
  const [orgFocus, setOrgFocus] = useState(false);
  const [signature, setSignature] = useState("");
  const [pasteMode, setPasteMode] = useState(false);
  const [sampleBlocked, setSampleBlocked] = useState(false);
  const [editingPaste, setEditingPaste] = useState(true);
  const standard = useStandardCopy();
  const key = useRef<{ fingerprint: string; value: string } | null>(null);
  const formId = useId();
  const update = (patch: Partial<ManualForm>) => setForm((current) => ({ ...current, ...patch }));

  // 出会った場所: the person's events around today (参加予定 / 最近参加).
  useEffect(() => {
    const controller = new AbortController();
    void readEvents(controller.signal).then((list) => { if (!controller.signal.aborted) setEvents(eventChips(list, now())); });
    return () => controller.abort();
  }, [now]);

  // Duplicate check as you type (only the name is enough: 同名).
  const checkBody = useMemo(() => duplicateCheckBody(form), [form.displayName, form.organization, form.email, form.phone]); // eslint-disable-line react-hooks/exhaustive-deps
  const checkKey = JSON.stringify(checkBody);
  useEffect(() => {
    if (!checkBody) { setCandidates([]); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void checkManualDuplicates(checkBody, controller.signal).then((result) => {
        if (controller.signal.aborted || !result.ok) return;
        setCandidates(result.data.candidates.slice(0, 3));
      });
    }, MANUAL_DUPLICATE_DEBOUNCE_MS);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [checkKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // A merge target that is no longer a candidate is dropped; 別の人 stays for the same people.
  const candidateIds = candidates.map((candidate) => candidate.contactId).join("|");
  useEffect(() => {
    setDecision((current) => (current.kind === "merge" && !candidates.some((candidate) => candidate.contactId === current.contactId) ? { kind: "none" } : current));
  }, [candidateIds]); // eslint-disable-line react-hooks/exhaustive-deps

  // 会社: names already in the person's network.
  useEffect(() => {
    const query = form.organization.trim();
    if (!orgFocus || !query) { setOrgs([]); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void suggestOrganizations(query, controller.signal).then((result) => {
        if (!controller.signal.aborted && result.ok) setOrgs(result.data.organizations.filter((org) => org.name !== query).slice(0, 5));
      });
    }, ORGANIZATION_DEBOUNCE_MS);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [form.organization, orgFocus]);

  const spans = useMemo(() => (signature.trim() ? splitSignature(signature) : []), [signature]);
  // Coloured: the items that were read for sure; a guess (推定) shows only in the item list.
  const runs = useMemo(() => signatureRuns(signature, spans.filter((span) => MARKED.has(span.field) && !isGuess(span))), [signature, spans]);
  const mergeTarget = decision.kind === "merge" ? candidates.find((candidate) => candidate.contactId === decision.contactId) ?? null : null;
  const diff = mergeTarget ? differingFields(mergeTarget, form) : [];

  const startMerge = (candidate: IngestContactCandidateContract) => {
    setReviewNeeded(false);
    setDecision({ kind: "merge", contactId: candidate.contactId, choices: defaultChoices(differingFields(candidate, form)) });
  };
  const choose = (field: ManualContactMergeField, choice: ManualContactFieldChoice) => {
    setDecision((current) => (current.kind === "merge" ? { ...current, choices: { ...current.choices, [field]: choice } } : current));
  };

  const save = async () => {
    if (saving) return;
    // From the paste view the split items are the form (b9 A4 Web「人脈に追加」).
    const current = pasteMode ? applySignature(form, spans) : form;
    if (pasteMode) setForm(current);
    if (!current.displayName.trim()) { setNameError(true); setPasteMode(false); return; }
    setSaving(true);
    setFailure(null);
    // Only the differing fields are sent as choices; the rest are filled when empty (server rule).
    const sent: ManualDecision = decision.kind === "merge"
      ? { ...decision, choices: Object.fromEntries(diff.map((field) => [field, decision.choices[field] ?? "incoming"])) }
      : decision;
    const fingerprint = formFingerprint(current, sent);
    if (key.current?.fingerprint !== fingerprint) key.current = { fingerprint, value: newKey() };
    const result = await saveManualContact(createBody(current, sent, key.current.value));
    setSaving(false);
    if (result.ok === false) {
      if (result.reason === "SAMPLE_READ_ONLY") setSampleBlocked(true);
      else setFailure(t(m.saveFailed));
      return;
    }
    const { outcome, contactId, candidates: found } = result.data;
    if (outcome === "duplicate_review" || !contactId) {
      setCandidates((found ?? []).slice(0, 3));
      setDecision({ kind: "none" });
      setReviewNeeded(true);
      setPasteMode(false);
      return;
    }
    const name = current.displayName.trim();
    if (outcome === "created") {
      const undo = () => void undoManualContact(contactId).then((undone) => {
        const message = undone.ok ? t(m.undoneToast) : undone.ok === false && undone.reason === "UNDO_EXPIRED" ? t(m.undoExpired) : t(m.undoFailed);
        const input = { kind: undone.ok ? "success" as const : "error" as const, message };
        if (!showShellToast(input)) toast[input.kind](message);
        if (undone.ok && typeof window !== "undefined" && window.location.pathname.startsWith(`/app/contacts/${contactId}`)) navigate("/app/contacts");
      });
      const input = { kind: "success" as const, message: t(m.addedToast), sub: t(m.addedSub, { name }), undo };
      if (!showShellToast(input)) toast.success(input.message, { sub: input.sub, undo });
    } else {
      const input = { kind: "success" as const, message: t(m.mergedToast), sub: name };
      if (!showShellToast(input)) toast.success(input.message, { sub: input.sub });
    }
    onClose();
    navigate(`/app/contacts/${encodeURIComponent(contactId)}`);
  };

  // ⌘↵ / Ctrl+↵ saves from anywhere in the drawer.
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.isComposing) { event.preventDefault(); void saveRef.current(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const level = formDensity(form);
  const metOn = form.met?.kind === "intro";

  const footer = (
    <div className={styles.manualFoot} data-manual-footer="">
      <span className={styles.footNote} data-manual-density={level}>{t(m.densityBefore)} <DensityDots level={level} t={t} /> {t(m.densityAfter)}</span>
      <Button label={t(m.cancel)} onClick={onClose} />
      {/* Still the form's submit button, so ↵ in a field saves too; the click saves directly. */}
      <Button type="submit" form={formId} variant="primary" loading={saving} label={decision.kind === "merge" ? t(m.saveMerge) : t(m.save)} trailing={<span className={styles.saveKbd}><Kbd>⌘↵</Kbd></span>} onClick={(event) => { event.preventDefault(); void save(); }} data-manual-save="" />
    </div>
  );

  const head = (
    <div className={styles.dialogHead}>
      <div><b className={styles.dialogTitle}>{t(m.drawerTitle)}</b><p className={styles.dialogSub}>{t(m.drawerLead)}</p></div>
      <IconButton icon="x" label={standard.action.close} onClick={onClose} />
    </div>
  );

  // b9 A4 Web: the pasted signature (coloured where it was split) and what each item became.
  const pasteView = (
    <div className={styles.pasteGrid} data-manual-paste="">
      <div>
        <label className={styles.pasteLabel} htmlFor={`${formId}-paste`}>{t(m.pasteLabel)}</label>
        {signature.trim() && !editingPaste ? (
          <div role="button" tabIndex={0} className={styles.pasteBox} onClick={() => setEditingPaste(true)}
            onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setEditingPaste(true); } }} data-manual-signature-preview="">
            {runs.map((run, index) => run.field
              ? <mark key={index} className={styles[`mark_${run.field}`]} data-span={run.field}>{run.text}</mark>
              : <span key={index}>{run.text}</span>)}
          </div>
        ) : (
          <textarea id={`${formId}-paste`} className={styles.pasteBox} value={signature} autoFocus placeholder={t(m.pastePlaceholder)}
            onChange={(event) => setSignature(event.target.value)} onBlur={() => { if (signature.trim()) setEditingPaste(false); }} data-manual-signature="" />
        )}
        {spans.length ? <p className={styles.pasteNote} role="status"><Icon name="sparkle" size={16} /> {t(m.pasteFound)}</p> : signature.trim() ? <p className={styles.pasteNote}>{t(m.pasteNone)}</p> : null}
      </div>
      <div className={styles.pasteCard} data-manual-paste-fields="">
        {PASTE_ROWS.map((row) => {
          const value = row.field === "met" ? metLabel(form, events, t) : pastedValue(form, spans, row.field);
          const guessed = row.field !== "met" && !pastedTyped(form, row.field) && spans.some((span) => span.field === row.field && isGuess(span));
          return (
            <button type="button" key={row.field} className={styles.frow} onClick={() => { setForm((current) => applySignature(current, spans)); setPasteMode(false); }} data-paste-row={row.field}>
              <span className={styles.frowKey}>{t(row.label)}</span>
              <i className={`${styles.frowDot} ${!value ? styles.frowDotOff : guessed ? styles.frowDotMid : ""}`} />
              <b className={value ? "" : styles.frowNone}>{value || t(m.pasteMissing)}</b>
              {value && guessed ? <Chip label={t(m.pasteGuess)} tone="apricot" /> : <span />}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <Drawer open onClose={onClose} title={t(m.drawerTitle)} size={pasteMode ? "lg" : "md"} fullOnPhone bare>
    <form id={formId} className={styles.manual} onSubmit={(event) => { event.preventDefault(); void save(); }} data-manual-form="" data-manual-mode={pasteMode ? "paste" : "form"} noValidate>
      {head}
      {pasteMode ? pasteView : (
        <>
          <div className={styles.fld}>
            <label className={styles.fldLabel} htmlFor={`${formId}-name`}>{t(m.name)} <span className={styles.req}>{t(m.required)}</span></label>
            <input id={`${formId}-name`} className={`${styles.in} ${nameError && !form.displayName.trim() ? styles.inError : ""}`} value={form.displayName} autoFocus required
              aria-invalid={nameError && !form.displayName.trim() ? true : undefined}
              onChange={(event) => { update({ displayName: event.target.value }); setNameError(false); }} data-manual-field="displayName" />
            {nameError && !form.displayName.trim() ? <p className={styles.error} role="alert"><Icon name="alert" size={16} />{t(m.nameMissing)}</p> : null}
          </div>
          {decision.kind === "separate" ? (
            <div className={styles.dupNote} data-manual-separate="">
              <span className={styles.footNote}>{t(m.dupSeparated)}</span>
              <Button size="sm" variant="ghost" label={t(m.dupUndoSeparate)} onClick={() => setDecision({ kind: "none" })} />
            </div>
          ) : decision.kind === "none" && candidates.length ? (
            <div className={styles.fade} data-manual-duplicates={candidates.length}>
              {reviewNeeded ? <p className={`${styles.notice} ${styles.dupGap}`} role="alert" data-manual-review-needed=""><Icon name="info" size={16} /><span>{t(m.reviewNeeded)}</span></p> : null}
              {candidates.map((candidate) => (
                <div key={candidate.contactId} className={styles.dup} data-manual-candidate={candidate.contactId} data-matched-on={candidate.matchedOn.join(",")}>
                  <MacTile emoji="🔍" size="sm" tone="apricot" />
                  <span className={styles.dupText}>
                    <b>{t(m.dupTitle, { name: candidateName(candidate) })}</b>
                    <span className={styles.footNote}>{t(m.dupLead)}</span>
                  </span>
                  <Button size="sm" variant="primary" label={t(m.dupMerge)} onClick={() => startMerge(candidate)} data-manual-merge={candidate.contactId} />
                  <Button size="sm" variant="ghost" label={t(m.dupSeparate)} onClick={() => { setReviewNeeded(false); setDecision({ kind: "separate" }); }} data-manual-separate-button="" />
                </div>
              ))}
            </div>
          ) : null}
          {mergeTarget && decision.kind === "merge" ? (
            <div className={`${styles.merge} ${styles.fade}`} data-manual-merge-panel={mergeTarget.contactId}>
              <b>{t(m.mergeTitle, { name: mergeTarget.displayName })}</b>
              <span className={styles.footNote}>{diff.length ? t(m.mergeLead) : t(m.mergeNoDiff)}</span>
              {diff.length ? (
                <div className={styles.stack}>
                  <div className={styles.mergeRow}><span /><span className={styles.label}>{t(m.mergeExisting)}</span><span className={styles.label}>{t(m.mergeIncoming)}</span></div>
                  {diff.map((field) => {
                    const choice = decision.choices[field] ?? "incoming";
                    return (
                      <div key={field} className={styles.mergeRow} role="radiogroup" aria-label={t(FIELD_LABEL[field])} data-merge-field={field}>
                        <span className={styles.label}>{t(FIELD_LABEL[field])}</span>
                        <Radio selected={choice === "existing"} onSelect={() => choose(field, "existing")} label={mergeTarget[field]} />
                        <Radio selected={choice === "incoming"} onSelect={() => choose(field, "incoming")} label={form[field]} />
                      </div>
                    );
                  })}
                </div>
              ) : null}
              <span><Button size="sm" variant="ghost" label={t(m.mergeCancel)} onClick={() => setDecision({ kind: "none" })} /></span>
            </div>
          ) : null}

          <div className={styles.fld}>
            <label className={styles.fldLabel} htmlFor={`${formId}-org`}>{t(m.organization)}</label>
            <input id={`${formId}-org`} className={styles.in} value={form.organization} autoComplete="organization"
              onChange={(event) => update({ organization: event.target.value })}
              onFocus={() => setOrgFocus(true)} onBlur={() => window.setTimeout(() => setOrgFocus(false), 150)} data-manual-field="organization" />
            {orgs.length ? (
              <ul className={styles.suggestions} data-manual-orgs="">
                {orgs.map((org) => (
                  <li key={org.name}>
                    <button type="button" className={`btn ${styles.suggestion}`} onMouseDown={(event) => event.preventDefault()} onClick={() => { update({ organization: org.name }); setOrgs([]); }}>
                      <Icon name="brief" size={16} />{t(m.orgSuggestion, { name: org.name, n: org.contactCount })}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className={styles.fld}>
            <span className={styles.fldLabel}>{t(m.met)}</span>
            <div className={styles.metRow} data-manual-met="">
              {events.map((event) => (
                <FilterOption
                  key={event.eventId}
                  label={t(m.metEventChip, { title: event.title, date: monthDay(event.startsAt) })}
                  selected={form.met?.kind === "event" && form.met.eventId === event.eventId}
                  onToggle={() => update({ met: form.met?.eventId === event.eventId ? null : { kind: "event", eventId: event.eventId, label: event.title } })}
                />
              ))}
              <FilterOption label={t(m.metIntro)} selected={metOn} onToggle={() => update({ met: metOn ? null : { kind: "intro" } })} />
            </div>
            {form.met?.kind === "intro" ? (
              <input className={`${styles.in} ${styles.inGap}`} aria-label={t(m.metIntroLabel)} placeholder={t(m.metIntroLabel)} value={form.met.label ?? ""}
                onChange={(event) => update({ met: { kind: "intro", label: event.target.value } })} data-manual-field="metLabel" />
            ) : null}
          </div>

          <div className={styles.fld}>
            <label className={styles.fldLabel} htmlFor={`${formId}-note`}>{t(m.note)}</label>
            <textarea id={`${formId}-note`} className={`${styles.in} ${styles.memo}`} value={form.note} onChange={(event) => update({ note: event.target.value })} data-manual-field="note" />
          </div>

          <button type="button" className={styles.pasteDoor} onClick={() => setPasteMode(true)} data-manual-paste-open="">📋 {t(m.pasteTitle)}</button>
        </>
      )}

      {failure ? <p className={styles.error} role="alert" data-manual-error=""><Icon name="alert" size={16} />{failure}</p> : null}
      {footer}
    </form>
    <SampleBlockedDialog open={sampleBlocked} onClose={() => setSampleBlocked(false)} />
    </Drawer>
  );
}
