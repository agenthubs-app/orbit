"use client";

import { useEffect, useRef, useState } from "react";

import type { PlanCandidateView, PlanIntroDraftResult, PlanPersonTypeDetail, PlanProposalResult } from "../../../../../shared/contract/plan-v2";
import { planOverviewCopy as c } from "../copy/plan";
import { Avatar, Button, Chip, Drawer, Modal, SearchField, Segmented, TextField, useStandardCopy, useToast } from "../ui";
import { defaultSlots, mailtoHref, recordPreview, slotIso } from "./overview-model";
import { searchNetwork, type PersonCandidate } from "./plan-api";
import { copyText } from "./plan-v2-actions";
import type { Translate } from "./PlanParts";
import styles from "./overview.module.css";

/* ---------- 記録モーダル（話した / 名前で記録 / 名前なし） ---------- */

export type RecordMode = "talked" | "offline" | "anonymous";

/** What the page sends for one record; the page owns the requests and the toasts. */
export type RecordSubmit =
  | { kind: "talked"; contactId: string }
  | { kind: "offline"; name: string }
  | { kind: "offlineMatch"; contactId: string }
  | { kind: "offlineNew"; name: string }
  | { kind: "anonymous" };

type Match = { contactId: string; name: string; company: string | null };

/**
 * b4 A1 ①③: one modal for the three ways to record. The preview says what the plan
 * will get before anything is written; the rules (once per person and type, unnamed
 * only up to the target) are always on screen.
 */
export function RecordModal({ open, detail, initialMode, initialContactId, matches, busy, createFailed = false, t, onClose, saveRecord }: {
  open: boolean;
  detail: PlanPersonTypeDetail;
  initialMode: RecordMode;
  initialContactId?: string | null;
  matches: readonly Match[] | null;
  busy: boolean;
  /** 「新しく登録」 failed (CONTACT_CREATE_FAILED): offer an unnamed record instead. */
  createFailed?: boolean;
  t: Translate;
  onClose: () => void;
  saveRecord: (submit: RecordSubmit) => void;
}) {
  const copy = useStandardCopy();
  const [mode, setMode] = useState<RecordMode>(initialMode);
  const [picked, setPicked] = useState<string | null>(initialContactId ?? null);
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<PersonCandidate[]>([]);
  useEffect(() => { if (open) { setMode(initialMode); setPicked(initialContactId ?? null); setName(""); setQuery(""); setFound([]); } }, [open, initialMode, initialContactId]);
  useEffect(() => {
    if (!open || mode !== "talked" || query.trim().length < 1) { setFound([]); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => { void searchNetwork(query.trim(), controller.signal).then(setFound).catch(() => setFound([])); }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [open, mode, query]);

  const anonymous = mode === "anonymous" || (mode === "offline" && !name.trim());
  const preview = recordPreview(detail, anonymous);
  const canSubmit = mode === "talked" ? Boolean(picked) : true;
  const submit = () => {
    if (mode === "talked" && picked) saveRecord({ contactId: picked, kind: "talked" });
    else if (mode === "offline" && name.trim()) saveRecord({ kind: "offline", name: name.trim() });
    else saveRecord({ kind: "anonymous" });
  };
  const people: { contactId: string; name: string; sub: string }[] = [
    ...detail.candidates.map((candidate) => ({ contactId: candidate.contactId, name: candidate.name, sub: [candidate.company, candidate.role].filter(Boolean).join(" · ") })),
    ...found.filter((person) => !detail.candidates.some((candidate) => candidate.contactId === person.contactId)).map((person) => ({ contactId: person.contactId, name: person.name, sub: [person.organization, person.role].filter(Boolean).join(" · ") })),
  ];

  return (
    <Modal open={open} onClose={onClose} title={t(c.recordTitle)} size={420}
      actions={matches && mode === "offline" ? null : <><Button label={copy.action.cancel} variant="secondary" onClick={onClose} /><Button label={t(c.recordSubmit)} variant="primary" disabled={!canSubmit} loading={busy} onClick={submit} /></>}>
      <div className={styles.stack} data-plan-record={mode}>
        <div className={styles.modes}>
          <Segmented<RecordMode> label={t(c.recordModeLabel)} value={mode} onChange={setMode} wide
            segments={[{ key: "talked", label: t(c.modeTalked) }, { key: "offline", label: t(c.modeOffline) }, { key: "anonymous", label: t(c.modeAnonymous) }]} />
        </div>
        {mode === "talked" ? (
          <div>
            <SearchField value={query} onChange={setQuery} placeholder={t(c.searchNetwork)} label={t(c.searchNetwork)} />
            <div className={styles.pickList} role="radiogroup" aria-label={t(c.modeTalked)}>
              {people.map((person) => (
                <button key={person.contactId} type="button" role="radio" aria-checked={picked === person.contactId} className={`btn ${styles.pick}`} data-on={picked === person.contactId ? "" : undefined} onClick={() => setPicked(person.contactId)}>
                  <Avatar name={person.name} size="sm" />
                  <span className={styles.grow}><span className={styles.strong}>{person.name}</span> <span className={styles.label}>{person.sub}</span></span>
                </button>
              ))}
              {people.length === 0 && query.trim() ? <span className={styles.label}>{t(c.noSearchResult)}</span> : null}
            </div>
          </div>
        ) : null}
        {mode === "offline" && !matches ? <TextField label={t(c.offlineName)} hint={t(c.offlineNameHint)} value={name} onChange={(event) => setName(event.target.value)} /> : null}
        {mode === "offline" && matches ? (
          <div data-plan-matches="">
            <div className={styles.strong}>{t(c.isThisPerson)}</div>
            <div className={styles.pickList}>
              {matches.map((match) => (
                <button key={match.contactId} type="button" className={`btn ${styles.pick}`} disabled={busy} onClick={() => saveRecord({ contactId: match.contactId, kind: "offlineMatch" })}>
                  <Avatar name={match.name} size="sm" />
                  <span className={styles.grow}><span className={styles.strong}>{match.name}</span> <span className={styles.label}>{match.company ?? ""}</span></span>
                </button>
              ))}
            </div>
            <Button size="sm" label={t(c.newContact)} icon="user-plus" disabled={busy} onClick={() => saveRecord({ kind: "offlineNew", name: name.trim() })} />
            {createFailed ? (
              <div className={styles.banner} role="alert" data-plan-create-failed="">
                <span className={styles.grow}>{t(c.contactCreateFailed)}</span>
                <Button size="sm" label={t(c.recordAnonymous)} disabled={busy} onClick={() => saveRecord({ kind: "anonymous" })} data-plan-record-anonymous="" />
              </div>
            ) : null}
          </div>
        ) : null}
        {mode === "anonymous" ? <p className={styles.muted}>{t(c.anonymousRule)}</p> : null}
        <div className={styles.preview} data-plan-preview="">
          {preview ? t(c.recordPreview, { points: preview.points, type: detail.shortLabel }) : t(anonymous && !detail.skipped ? c.reasonAnonymousOver : c.recordPreviewNone)}
        </div>
        <div className={styles.ruleBox}>{t(c.onceRule)} {t(c.anonymousRule)}</div>
      </div>
    </Modal>
  );
}

/* ---------- スキップの確認（主ボタンに初期フォーカス） ---------- */

export function SkipDialog({ open, points, busy, t, onCancel, onConfirm }: { open: boolean; points: number; busy: boolean; t: Translate; onCancel: () => void; onConfirm: () => void }) {
  const copy = useStandardCopy();
  const wrap = useRef<HTMLSpanElement>(null);
  // Modal focuses `initialFocus` after its own first-focusable rule: point it at the primary button.
  const primary = useRef<{ readonly current: HTMLElement | null }>({ get current() { return wrap.current?.querySelector("button") ?? null; } }).current;
  return (
    <Modal open={open} onClose={onCancel} title={t(c.skipTitle)} description={t(c.skipBody, { points })} size={420} initialFocus={primary}
      actions={<><Button label={copy.action.cancel} variant="secondary" onClick={onCancel} /><span ref={wrap} data-plan-skip-confirm=""><Button label={t(c.skipConfirm)} variant="primary" loading={busy} onClick={onConfirm} /></span></>} />
  );
}

/* ---------- 下書き（依頼文 / 面談の提案）：コピー · メールアプリで開く。送信はしない ---------- */

function DraftView({ subject, body, t }: { subject: string; body: string; t: Translate }) {
  const copy = useStandardCopy();
  const toast = useToast();
  return (
    <div className={styles.draft} data-plan-draft="">
      <div className={styles.label}>{t(c.draftSubject)}</div>
      <div className={styles.strong}>{subject}</div>
      <div className={styles.label}>{t(c.draftBody)}</div>
      <p className={styles.draftBody}>{body}</p>
      <div className={styles.row}>
        <Button size="sm" icon="copy" label={copy.action.copy} onClick={() => void copyText(`${subject}\n\n${body}`).then((ok) => { if (ok) toast.success(copy.toast.copied); })} />
        <a className={styles.mailLink} href={mailtoHref({ body, subject })} data-plan-mailto="">{t(c.openMail)}</a>
      </div>
      <span className={styles.label}>{t(c.noSend)}</span>
    </div>
  );
}

export function IntroDraftDrawer({ draft, t, onClose }: { draft: PlanIntroDraftResult | null; t: Translate; onClose: () => void }) {
  return (
    <Drawer open={Boolean(draft)} onClose={onClose} title={t(c.introTitle)} size="md">
      {draft ? (
        <div className={styles.stack} data-plan-intro-draft="">
          <div className={styles.row}><Avatar name={draft.viaName} size="sm" /><span className={styles.strong}>{t(c.routeVia, { name: draft.viaName })}</span></div>
          <DraftView subject={draft.subject} body={draft.body} t={t} />
        </div>
      ) : null}
    </Drawer>
  );
}

/**
 * 面談を提案 (Web 520 drawer): three time slots, then a draft per person. Orbit users
 * would get a structured request; the server returns a draft for everyone today, so
 * the page shows the draft with コピー / メールアプリで開く — never a send button.
 */
export function ProposalDrawer({ open, people, t, onClose, onPropose }: {
  open: boolean;
  people: PlanCandidateView[];
  t: Translate;
  onClose: () => void;
  onPropose: (contactId: string, slots: string[]) => Promise<PlanProposalResult | null>;
}) {
  const [slots, setSlots] = useState(() => defaultSlots(new Date()));
  const [drafts, setDrafts] = useState<Record<string, PlanProposalResult>>({});
  const [running, setRunning] = useState<string | null>(null);
  useEffect(() => { if (open) { setSlots(defaultSlots(new Date())); setDrafts({}); } }, [open]);
  const isoSlots = slots.map(slotIso);
  const ready = isoSlots.every((value): value is string => Boolean(value));
  const set = (index: number, part: "date" | "time", value: string) => setSlots(slots.map((slot, at) => (at === index ? { ...slot, [part]: value } : slot)));
  return (
    <Drawer open={open} onClose={onClose} title={t(c.proposalTitle)} size="md">
      <div className={styles.stack} data-plan-proposal="">
        <p className={styles.muted}>{t(c.proposalSlots)}</p>
        <div className={styles.slots}>
          {slots.map((slot, index) => (
            <div key={index} className={styles.slotRow}>
              <span className={styles.label}>{t(c.proposalSlot, { n: index + 1 })}</span>
              <input className={styles.input} type="date" aria-label={`${t(c.proposalSlot, { n: index + 1 })} ${t(c.proposalDate)}`} value={slot.date} onChange={(event) => set(index, "date", event.target.value)} />
              <input className={styles.input} type="time" aria-label={`${t(c.proposalSlot, { n: index + 1 })} ${t(c.proposalTime)}`} value={slot.time} onChange={(event) => set(index, "time", event.target.value)} />
            </div>
          ))}
        </div>
        {people.map((person) => {
          const result = drafts[person.contactId] ?? null;
          const draft = result?.draft ?? null;
          return (
            <div key={person.contactId} className={styles.person} data-plan-proposal-person={person.contactId}>
              <div className={styles.row}>
                <Avatar name={person.name} size="sm" />
                <span className={`${styles.grow} ${styles.strong}`}>{person.name}</span>
                {person.isOrbitUser ? <Chip label={t(c.orbitUser)} tone="teal" /> : null}
              </div>
              <span className={styles.label}>{t(person.isOrbitUser ? c.proposalOrbit : c.proposalEmail)}</span>
              {/* R24 复核 m11: a structured request (Orbit user) has no draft — say it was requested. */}
              {result?.kind === "request" && !draft ? <span className={styles.strong} data-plan-proposal-requested={person.contactId}>{t(c.proposalRequested)}</span>
                : draft ? <DraftView subject={draft.subject} body={draft.body} t={t} /> : (
                <span><Button size="sm" icon="mail" label={t(c.makeDraft)} variant="primary" disabled={!ready || Boolean(running)} loading={running === person.contactId}
                  onClick={() => {
                    if (!ready) return;
                    setRunning(person.contactId);
                    void onPropose(person.contactId, isoSlots as string[]).then((result) => { if (result) setDrafts((current) => ({ ...current, [person.contactId]: result })); }).finally(() => setRunning(null));
                  }} /></span>
              )}
            </div>
          );
        })}
      </div>
    </Drawer>
  );
}
