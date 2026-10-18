"use client";

import { useEffect, useRef, useState } from "react";

import type { PlanCandidateView, PlanIntroDraftResult, PlanPersonTypeDetail, PlanProposalResult } from "../../../../../shared/contract/plan-v2";
import { planOverviewCopy as c } from "../copy/plan";
import { Avatar, Button, Drawer, Icon, Kbd, MacTile, Modal, SearchField, Segmented, TextField, useStandardCopy, useToast } from "../ui";
import { defaultSlots, mailtoHref, recordPreview, slotIso } from "./overview-model";
import { searchNetwork, type PersonCandidate } from "./plan-api";
import { copyText } from "./plan-v2-actions";
import type { Translate } from "./PlanParts";
import k from "./overview.module.css";
import styles from "./TypeDetail.module.css";

/* ---------- 記録モーダル（話した / 名前で記録 / 名前なし） ---------- */

export type RecordMode = "talked" | "offline" | "anonymous";

/** What the page sends for one record; the page owns the requests and the toasts. */
/** `at` = when they talked (b12 W-R24-09 いつ: 今日 / 昨日 / 日付を選ぶ); absent = now. */
export type RecordSubmit = (
  | { kind: "talked"; contactId: string }
  | { kind: "offline"; name: string }
  | { kind: "offlineMatch"; contactId: string }
  | { kind: "offlineNew"; name: string }
  | { kind: "anonymous" }
) & { at?: string };

type When = "today" | "yesterday" | "date";

/** The いつ chip as an ISO time: 今日 = now (no `at`), 昨日 = 24 h ago, a picked day = its noon. */
export function whenToAt(when: When, date: string, now = new Date()): string | undefined {
  if (when === "yesterday") return new Date(now.getTime() - 86_400_000).toISOString();
  if (when === "date" && /^\d{4}-\d{2}-\d{2}$/u.test(date)) {
    const value = new Date(`${date}T12:00:00`);
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  }
  return undefined;
}

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
  const [choice, setChoice] = useState<string>("new");
  const [when, setWhen] = useState<When>("today");
  const [date, setDate] = useState("");
  useEffect(() => { if (open) { setMode(initialMode); setPicked(initialContactId ?? null); setName(""); setQuery(""); setFound([]); setWhen("today"); setDate(""); } }, [open, initialMode, initialContactId]);
  useEffect(() => { setChoice(matches?.[0]?.contactId ?? "new"); }, [matches]);
  useEffect(() => {
    if (!open || mode !== "talked" || query.trim().length < 1) { setFound([]); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => { void searchNetwork(query.trim(), controller.signal).then(setFound).catch(() => setFound([])); }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [open, mode, query]);

  const anonymous = mode === "anonymous" || (mode === "offline" && !name.trim());
  const preview = recordPreview(detail, anonymous);
  const canSubmit = mode === "talked" ? Boolean(picked) : true;
  const at = whenToAt(when, date);
  const withAt = <T extends object>(value: T) => (at ? { ...value, at } : value);
  const showMatches = mode === "offline" && Boolean(matches);
  const submit = () => {
    if (mode === "talked" && picked) saveRecord(withAt({ contactId: picked, kind: "talked" as const }));
    else if (showMatches) saveRecord(withAt(choice === "new" ? { kind: "offlineNew" as const, name: name.trim() } : { contactId: choice, kind: "offlineMatch" as const }));
    else if (mode === "offline" && name.trim()) saveRecord(withAt({ kind: "offline" as const, name: name.trim() }));
    else saveRecord(withAt({ kind: "anonymous" as const }));
  };
  const nth = detail.metCount + 1;
  const previewSub = !preview ? null : preview.half ? t(c.recPlanHalf, { n: nth }) : anonymous ? t(c.recPlanAnon, { n: nth, target: detail.targetCount }) : nth === detail.targetCount ? t(c.recPlanReach, { n: nth }) : t(c.recPlanNth, { n: nth });
  const people: { contactId: string; name: string; sub: string }[] = [
    ...detail.candidates.map((candidate) => ({ contactId: candidate.contactId, name: candidate.name, sub: [candidate.company, candidate.role].filter(Boolean).join(" · ") })),
    ...found.filter((person) => !detail.candidates.some((candidate) => candidate.contactId === person.contactId)).map((person) => ({ contactId: person.contactId, name: person.name, sub: [person.organization, person.role].filter(Boolean).join(" · ") })),
  ];

  return (
    <Modal open={open} onClose={onClose} title={t(c.recordTitle)} subtitle={`${detail.shortLabel} · ${detail.roleSituation}`} size={380}
      actions={<><Button label={copy.action.cancel} variant="secondary" onClick={onClose} />{showMatches && createFailed
        ? <Button label={t(c.recordAnonymous)} variant="primary" disabled={busy} onClick={() => saveRecord(withAt({ kind: "anonymous" as const }))} data-plan-record-anonymous="" />
        : <Button label={t(c.recordSubmit)} variant="primary" disabled={!canSubmit} loading={busy} onClick={submit} />}</>}>
      <div className={`${styles.stack} ${styles.recordStack}`} data-plan-record={mode}>
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
        {mode === "offline" ? <TextField label={t(c.offlineName)} hint={matches && matches.length === 0 ? t(c.noSameName) : t(c.offlineNameHint)} value={name} onChange={(event) => setName(event.target.value)} /> : null}
        {showMatches && matches ? (
          <div data-plan-matches="">
            {matches.length ? <b className={styles.isThis}>{t(c.isThisPerson)}</b> : null}
            <div className={styles.choiceList} role="radiogroup" aria-label={t(c.isThisPerson)}>
              {matches.map((match) => (
                <button key={match.contactId} type="button" role="radio" aria-checked={choice === match.contactId} className={`btn ${styles.choice} ${choice === match.contactId ? styles.choiceOn : ""}`} disabled={busy} onClick={() => setChoice(match.contactId)}>
                  <span className={`${styles.rad} ${choice === match.contactId ? styles.radOn : ""}`} aria-hidden />
                  <Avatar name={match.name} size="sm" />
                  <span className={styles.grow}><b>{match.name}</b><span className={k.lbl}>{match.company ?? ""}</span></span>
                </button>
              ))}
              <button type="button" role="radio" aria-checked={choice === "new"} className={`btn ${styles.choice} ${choice === "new" && matches.length ? styles.choiceOn : ""}`} disabled={busy} onClick={() => setChoice("new")} data-plan-record-new="">
                <span className={`${styles.rad} ${choice === "new" ? styles.radOn : ""}`} aria-hidden />
                <span className={styles.plusTile} aria-hidden><Icon name="plus" size={16} /></span>
                <span className={styles.grow}><b>{t(c.newContact)}</b><span className={k.lbl}>{t(c.newContactSub, { name: name.trim() })}</span></span>
              </button>
            </div>
            {createFailed ? (
              <div className={styles.ngCard} role="alert" data-plan-create-failed="">
                <span className={styles.ngmark} aria-hidden><Icon name="alert" size={16} /></span>
                <div className={styles.grow}><b>{t(c.contactCreateFailed)}</b><span className={k.lbl}>{t(c.createFailedNote, { type: detail.shortLabel, target: detail.targetCount })}</span></div>
              </div>
            ) : null}
          </div>
        ) : null}
        {/* いつ (b12 W-R24-09b): 今日 / 昨日 / 日付を選ぶ — sent as `at`. */}
        <div className={styles.fld}>
          <span className={styles.fldLabel}>{t(c.whenLabel)}</span>
          <div className={k.row} role="radiogroup" aria-label={t(c.whenLabel)} style={{ gap: 6 }}>
            {(["today", "yesterday", "date"] as const).map((key) => (
              <button key={key} type="button" role="radio" aria-checked={when === key} className={`btn ${styles.cat} ${when === key ? styles.catOn : ""}`} onClick={() => setWhen(key)} data-plan-when={key}>{t(key === "today" ? c.whenToday : key === "yesterday" ? c.whenYesterday : c.whenPick)}</button>
            ))}
          </div>
          {when === "date" ? <input className={styles.inputV2} style={{ marginTop: 8, width: "100%" }} type="date" aria-label={t(c.whenPick)} value={date} onChange={(event) => setDate(event.target.value)} /> : null}
        </div>
        {mode === "anonymous" ? <div className={styles.anonNote}><b>{t(c.anonymousRule)}</b></div> : <div className={k.lbl}>{t(c.onceRule)}</div>}
        {/* b12 W-R24-09 recPlan: tile · 「プランに反映：… +N」 on the soft accent. */}
        <div className={styles.recPlan} data-plan-preview="">
          <MacTile emoji={detail.emoji} size="sm" />
          <div className={k.grow}><b>{preview ? t(c.recordPreview, { points: preview.points, type: detail.shortLabel }) : t(anonymous && !detail.skipped ? c.reasonAnonymousOver : c.recordPreviewNone)}</b>{previewSub ? <span className={k.lbl} style={{ display: "block" }}>{previewSub}</span> : null}</div>
        </div>
      </div>
    </Modal>
  );
}

/* ---------- スキップの確認（b12 W-R24-11 · 主ボタンに初期フォーカス） ---------- */

export function SkipDialog({ open, label, points, busy, t, onCancel, onConfirm }: { open: boolean; label: string; points: number; busy: boolean; t: Translate; onCancel: () => void; onConfirm: () => void }) {
  const copy = useStandardCopy();
  const wrap = useRef<HTMLSpanElement>(null);
  // Modal focuses `initialFocus` after its own first-focusable rule: point it at the primary button.
  const primary = useRef<{ readonly current: HTMLElement | null }>({ get current() { return wrap.current?.querySelector("button") ?? null; } }).current;
  return (
    <Modal open={open} onClose={onCancel} title={t(c.skipTitle)} description={t(c.skipBodyV2, { label, points })} icon={<MacTile emoji="🧠" tone="apricot" />} closable={false} size={480} initialFocus={primary}
      hint={<><Kbd>Esc</Kbd> {copy.action.cancel}　<Kbd>↵</Kbd> {t(c.skipConfirm)}</>}
      actions={<><Button label={copy.action.cancel} variant="secondary" onClick={onCancel} /><span ref={wrap} data-plan-skip-confirm=""><Button label={t(c.skipConfirm)} variant="primary" loading={busy} onClick={onConfirm} /></span></>} />
  );
}

/* ---------- 下書き（依頼文 / 面談の提案）：コピー · メールアプリで開く。送信はしない ---------- */

function DraftView({ subject, body, t }: { subject: string; body: string; t: Translate }) {
  const copy = useStandardCopy();
  const toast = useToast();
  return (
    <div data-plan-draft="">
      <div className={k.lbl} style={{ display: "block", marginTop: 12 }}>{t(c.draftSubject)}</div>
      <b className={styles.subj}>{subject}</b>
      <div className={k.lbl} style={{ display: "block", marginTop: 8 }}>{t(c.draftBody)}</div>
      <div className={styles.draftbox}>{body}</div>
      <div className={k.row} style={{ marginTop: 10 }}>
        <button type="button" className={`btn ${k.btn} ${k.sm}`} onClick={() => void copyText(`${subject}\n\n${body}`).then((ok) => { if (ok) toast.success(copy.toast.copied); })}><Icon name="copy" size={16} />{copy.action.copy}</button>
        <a className={`btn ${k.btn} ${k.sm} ${k.ghost}`} href={mailtoHref({ body, subject })} data-plan-mailto="">{t(c.openMail)}</a>
      </div>
      <div className={k.lbl} style={{ display: "block", marginTop: 8 }}>{t(c.noSend)}</div>
    </div>
  );
}

/**
 * 紹介の依頼文 (b12 W-R24-13, Web drawer 520). D43: 丁寧に / 短く switch between two fixed
 * texts, no AI — 丁寧に is the server's draft, 短く the short template from the dictionary.
 */
export function IntroDraftDrawer({ draft, typeLabel, roleSituation, t, onClose }: { draft: PlanIntroDraftResult | null; typeLabel: string; roleSituation: string; t: Translate; onClose: () => void }) {
  const copy = useStandardCopy();
  const toast = useToast();
  const [tone, setTone] = useState<"formal" | "short">("formal");
  useEffect(() => { if (draft) setTone("formal"); }, [draft]);
  // 两种语气都由服务端给；旧服务端没有 short* 时退回字典模板。
  const body = draft ? (tone === "formal" ? draft.body : draft.shortBody ?? t(c.introShortBody, { name: draft.viaName, role: roleSituation })) : "";
  const subject = draft ? (tone === "formal" ? draft.subject : draft.shortSubject ?? t(c.introShortSubject)) : "";
  return (
    <Drawer open={Boolean(draft)} onClose={onClose} title={t(c.introTitle)} titleSize={18} size="md">
      {draft ? (
        <div data-plan-intro-draft="">
          <div className={k.lbl}>{t(c.introVia, { label: typeLabel, name: draft.viaName })}</div>
          <div className={k.card} style={{ marginTop: 14 }}>
            <div className={k.row} style={{ gap: 10 }}><Avatar name={draft.viaName} size="sm" /><b className={k.grow} style={{ fontSize: "var(--fs-body-sm)" }}>{t(c.introTo, { name: draft.viaName })}</b></div>
            <div className={k.lbl} style={{ display: "block", fontWeight: 700, margin: "14px 0 6px" }}>{t(c.draftSubject)}</div>
            <div className={styles.inputBox}>{subject}</div>
            <div className={k.lbl} style={{ display: "block", fontWeight: 700, margin: "12px 0 6px" }}>{t(c.draftBody)}</div>
            <div className={styles.draftbox} data-plan-intro-body="">{body}</div>
            <div className={k.chips} style={{ marginTop: 10 }} role="radiogroup" aria-label={t(c.introTitle)}>
              {(["formal", "short"] as const).map((key) => (
                <button key={key} type="button" role="radio" aria-checked={tone === key} className={`btn ${styles.toneChip} ${tone === key ? styles.toneOn : ""}`} onClick={() => setTone(key)} data-plan-intro-tone={key}>{t(key === "formal" ? c.toneFormal : c.toneShort)}</button>
              ))}
            </div>
          </div>
          <div className={styles.grid2}>
            <button type="button" className={`btn ${k.btn}`} onClick={() => void copyText(`${subject}\n\n${body}`).then((ok) => { if (ok) toast.success(copy.toast.copied); })}><Icon name="copy" size={16} />{copy.action.copy}</button>
            <a className={`btn ${k.btn} ${k.primary}`} href={mailtoHref({ body, subject })} data-plan-mailto=""><Icon name="mail" size={16} />{t(c.openMail)}</a>
          </div>
          <div className={k.lbl} style={{ display: "block", textAlign: "center", marginTop: 12 }}>{t(c.noSend)}</div>
        </div>
      ) : null}
    </Drawer>
  );
}

/**
 * 面談を提案 (b4 「① 面談を提案 · Web 抽屉」, D46 redrawn after this drawer): three time slots,
 * then a draft per person — Orbit users too (draft only, never a send button).
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
    <Drawer open={open} onClose={onClose} title={t(c.proposalTitle)} titleSize={18} size="md">
      <div data-plan-proposal="">
        <div className={k.lbl} style={{ display: "block" }}>{t(c.proposalSlots)}</div>
        {slots.map((slot, index) => (
          <div key={index} className={k.row} style={{ marginTop: 8 }}>
            <span className={styles.slotLbl}>{t(c.proposalSlot, { n: index + 1 })}</span>
            <input className={styles.inputV2} style={{ flex: 1 }} type="date" aria-label={`${t(c.proposalSlot, { n: index + 1 })} ${t(c.proposalDate)}`} value={slot.date} onChange={(event) => set(index, "date", event.target.value)} />
            <input className={styles.inputV2} style={{ width: 120 }} type="time" aria-label={`${t(c.proposalSlot, { n: index + 1 })} ${t(c.proposalTime)}`} value={slot.time} onChange={(event) => set(index, "time", event.target.value)} />
          </div>
        ))}
        {people.map((person, index) => {
          const result = drafts[person.contactId] ?? null;
          const draft = result?.draft ?? null;
          return (
            <div key={person.contactId} className={k.card} style={{ marginTop: index === 0 ? 14 : "var(--gap)" }} data-plan-proposal-person={person.contactId}>
              <div className={k.row} style={{ gap: 10 }}>
                <Avatar name={person.name} size="sm" />
                <b className={k.grow}>{person.name}</b>
                {person.isOrbitUser ? <span className={`${k.chip} ${k.chip_teal}`}>{t(c.orbitChip)}</span> : null}
              </div>
              <div className={k.lbl} style={{ display: "block", marginTop: 8 }}>{t(person.isOrbitUser ? c.proposalOrbit : c.proposalEmail)}</div>
              {/* R24 复核 m11: a structured request (Orbit user) has no draft — say it was requested. */}
              {result?.kind === "request" && !draft ? <b data-plan-proposal-requested={person.contactId}>{t(c.proposalRequested)}</b>
                : draft ? <DraftView subject={draft.subject} body={draft.body} t={t} /> : (
                  <button type="button" className={`btn ${k.btn} ${k.sm} ${k.primary}`} style={{ marginTop: 10 }} disabled={!ready || Boolean(running)} aria-busy={running === person.contactId || undefined}
                    onClick={() => {
                      if (!ready) return;
                      setRunning(person.contactId);
                      void onPropose(person.contactId, isoSlots as string[]).then((value) => { if (value) setDrafts((current) => ({ ...current, [person.contactId]: value })); }).finally(() => setRunning(null));
                    }}><Icon name="mail" size={16} />{t(c.makeDraft)}</button>
                )}
            </div>
          );
        })}
      </div>
    </Drawer>
  );
}
