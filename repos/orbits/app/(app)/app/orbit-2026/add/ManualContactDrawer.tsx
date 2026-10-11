"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { IngestContactCandidateContract } from "../../../../../shared/contract/business-card-batch";
import type { ManualContactFieldChoice, ManualContactMergeField } from "../../../../../shared/contract/manual-contact";
import { splitSignature, type SignatureField } from "../../../../../shared/compute/signature-split";
import { addManualCopy as m } from "../copy/add";
import { Button, Chip, Drawer, FilterOption, Icon, Kbd, Radio, TextField, useScopeLanguage, useToast } from "../ui";
import { showShellToast } from "../shell/shell-toast-bridge";
import { densityLabel, translator, type Translate } from "./add-parts";
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

const SPAN_LABEL: Record<SignatureField, typeof m.spanName> = {
  displayName: m.spanName,
  organization: m.spanOrganization,
  role: m.spanRole,
  email: m.spanEmail,
  phone: m.spanPhone,
  postalCode: m.spanPostal,
  address: m.spanAddress,
  url: m.spanUrl,
};

function newKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `manual-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * 手入力 (b11 A3 Web): a 520 drawer on 人脈を追加 (`?add=manual`, full screen at 390).
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
  return (
    <Drawer open={open} onClose={onClose} title={t(m.drawerTitle)} size="md">
      {open ? <ManualFormBody t={t} onClose={onClose} navigate={navigate} now={now} /> : null}
    </Drawer>
  );
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
  const [applied, setApplied] = useState(false);
  const key = useRef<{ fingerprint: string; value: string } | null>(null);
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
  const runs = useMemo(() => signatureRuns(signature, spans), [signature, spans]);
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
    if (!form.displayName.trim()) { setNameError(true); return; }
    setSaving(true);
    setFailure(null);
    // Only the differing fields are sent as choices; the rest are filled when empty (server rule).
    const sent: ManualDecision = decision.kind === "merge"
      ? { ...decision, choices: Object.fromEntries(diff.map((field) => [field, decision.choices[field] ?? "incoming"])) }
      : decision;
    const fingerprint = formFingerprint(form, sent);
    if (key.current?.fingerprint !== fingerprint) key.current = { fingerprint, value: newKey() };
    const result = await saveManualContact(createBody(form, sent, key.current.value));
    setSaving(false);
    if (result.ok === false) {
      setFailure(result.reason === "SAMPLE_READ_ONLY" ? t(m.sampleBlocked) : t(m.saveFailed));
      return;
    }
    const { outcome, contactId, candidates: found } = result.data;
    if (outcome === "duplicate_review" || !contactId) {
      setCandidates((found ?? []).slice(0, 3));
      setDecision({ kind: "none" });
      setReviewNeeded(true);
      return;
    }
    const name = form.displayName.trim();
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
  const metOn = (kind: "intro" | "other") => form.met?.kind === kind;

  return (
    <form className={styles.form} onSubmit={(event) => { event.preventDefault(); void save(); }} data-manual-form="" noValidate>
      <p className={styles.label}>{t(m.drawerLead)}</p>

      <div className={styles.stack}>
        <TextField
          label={`${t(m.name)} · ${t(m.required)}`}
          value={form.displayName}
          autoFocus
          required
          error={nameError && !form.displayName.trim() ? t(m.nameMissing) : undefined}
          hint={t(m.nameHint)}
          onChange={(event) => { update({ displayName: event.target.value }); setNameError(false); }}
          data-manual-field="displayName"
        />
        {decision.kind === "separate" ? (
          <div className={styles.row} data-manual-separate="">
            <span className={styles.label}>{t(m.dupSeparated)}</span>
            <Button size="sm" variant="ghost" label={t(m.dupUndoSeparate)} onClick={() => setDecision({ kind: "none" })} />
          </div>
        ) : decision.kind === "none" && candidates.length ? (
          <div className={`${styles.stack} ${styles.fade}`} data-manual-duplicates={candidates.length}>
            {reviewNeeded ? <p className={styles.notice} role="alert" data-manual-review-needed=""><Icon name="info" size={16} /><span>{t(m.reviewNeeded)}</span></p> : null}
            {candidates.map((candidate) => (
              <div key={candidate.contactId} className={styles.dup} data-manual-candidate={candidate.contactId} data-matched-on={candidate.matchedOn.join(",")}>
                <div className={styles.row}>
                  <span aria-hidden>🔍</span>
                  <span className={styles.grow}>
                    <b>{t(m.dupTitle, { name: [candidate.displayName, candidate.organization].filter(Boolean).join(" · ") })}</b>
                    <span className={styles.label}>{t(m.dupLead)}</span>
                  </span>
                </div>
                <div className={styles.row}>
                  <Button size="sm" variant="primary" icon="merge" label={t(m.dupMerge)} onClick={() => startMerge(candidate)} data-manual-merge={candidate.contactId} />
                  <Button size="sm" variant="ghost" label={t(m.dupSeparate)} onClick={() => { setReviewNeeded(false); setDecision({ kind: "separate" }); }} data-manual-separate-button="" />
                </div>
              </div>
            ))}
          </div>
        ) : null}
        {mergeTarget && decision.kind === "merge" ? (
          <div className={`${styles.merge} ${styles.fade}`} data-manual-merge-panel={mergeTarget.contactId}>
            <b>{t(m.mergeTitle, { name: mergeTarget.displayName })}</b>
            <span className={styles.label}>{diff.length ? t(m.mergeLead) : t(m.mergeNoDiff)}</span>
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
      </div>

      <div className={styles.stack}>
        <TextField
          label={t(m.organization)}
          value={form.organization}
          onChange={(event) => update({ organization: event.target.value })}
          onFocus={() => setOrgFocus(true)}
          onBlur={() => window.setTimeout(() => setOrgFocus(false), 150)}
          autoComplete="organization"
          data-manual-field="organization"
        />
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
        <TextField label={t(m.role)} value={form.role} onChange={(event) => update({ role: event.target.value })} autoComplete="organization-title" data-manual-field="role" />
      </div>

      <div className={styles.stack}>
        <span className={styles.fieldLabel}>{t(m.met)}</span>
        <div className={styles.row} data-manual-met="">
          {events.map((event) => (
            <FilterOption
              key={event.eventId}
              label={t(m.metEventChip, { title: event.title, date: monthDay(event.startsAt) })}
              selected={form.met?.kind === "event" && form.met.eventId === event.eventId}
              onToggle={() => update({ met: form.met?.eventId === event.eventId ? null : { kind: "event", eventId: event.eventId, label: event.title } })}
            />
          ))}
          <FilterOption label={t(m.metIntro)} selected={metOn("intro")} onToggle={() => update({ met: metOn("intro") ? null : { kind: "intro" } })} />
          <FilterOption label={t(m.metOther)} selected={metOn("other")} onToggle={() => update({ met: metOn("other") ? null : { kind: "other" } })} />
        </div>
        <span className={styles.label}>{t(m.metHint)}</span>
        {form.met && form.met.kind !== "event" ? (
          <TextField
            label={form.met.kind === "intro" ? t(m.metIntroLabel) : t(m.metOtherLabel)}
            value={form.met.label ?? ""}
            onChange={(event) => update({ met: { kind: form.met!.kind, label: event.target.value } })}
            data-manual-field="metLabel"
          />
        ) : null}
      </div>

      <label className={styles.stack}>
        <span className={styles.fieldLabel}>{t(m.note)}</span>
        <textarea className={styles.textarea} value={form.note} placeholder={t(m.notePlaceholder)} onChange={(event) => update({ note: event.target.value })} data-manual-field="note" />
      </label>

      <div className={styles.stack}>
        <span className={styles.fieldLabel}>{t(m.contact)}</span>
        <TextField label={t(m.email)} type="email" value={form.email} onChange={(event) => update({ email: event.target.value })} autoComplete="email" data-manual-field="email" />
        <TextField label={t(m.phone)} type="tel" value={form.phone} onChange={(event) => update({ phone: event.target.value })} autoComplete="tel" data-manual-field="phone" />
      </div>

      <div className={styles.paste} data-manual-paste="">
        <span className={styles.row}><span aria-hidden>📋</span><b>{t(m.pasteTitle)}</b></span>
        <label className={styles.stack}>
          <span className={styles.srOnly}>{t(m.pasteLabel)}</span>
          <textarea className={styles.textarea} value={signature} placeholder={t(m.pastePlaceholder)} onChange={(event) => { setSignature(event.target.value); setApplied(false); }} data-manual-signature="" />
        </label>
        {signature.trim() ? (
          <>
            <p className={styles.sig} data-manual-signature-preview="">
              {runs.map((run, index) => run.field
                ? <mark key={index} className={`${styles.mark} ${styles[`mark_${run.field}`]}`} title={t(SPAN_LABEL[run.field])} data-span={run.field}>{run.text}</mark>
                : <span key={index}>{run.text}</span>)}
            </p>
            {spans.length ? (
              <div className={styles.row}>
                {[...new Set(spans.map((span) => span.field))].map((field) => <Chip key={field} label={t(SPAN_LABEL[field])} tone="lav" />)}
                <span className={styles.push}>
                  <Button size="sm" variant={applied ? "ghost" : "primary"} icon={applied ? "check" : undefined} label={t(m.pasteApply)} onClick={() => { setForm((current) => applySignature(current, spans)); setApplied(true); }} data-manual-signature-apply="" />
                </span>
              </div>
            ) : <span className={styles.label}>{t(m.pasteNone)}</span>}
            {applied ? <span className={styles.label} role="status">{t(m.pasteFound)}</span> : null}
          </>
        ) : null}
      </div>

      {failure ? <p className={styles.error} role="alert" data-manual-error=""><Icon name="alert" size={16} />{failure}</p> : null}

      <div className={styles.drawerFoot}>
        <span className={styles.label} data-manual-density={level}>{t(m.densityPreview, { level: densityLabel(level, t) })}</span>
        <span className={styles.push} />
        <Button variant="ghost" label={t(m.cancel)} onClick={onClose} />
        <Button type="submit" variant="primary" loading={saving} label={decision.kind === "merge" ? t(m.saveMerge) : t(m.save)} data-manual-save="" />
        <Kbd>⌘↵</Kbd>
      </div>
    </form>
  );
}
