"use client";

// contact-reach R41 ②③ 連絡する. One dialog, two paths, decided by the drawer's eligibility read (DESIGN D1/D7):
//   message (canSend or canStart): the template body, 「候補の時間を入れる」 (only when canProposeMeeting), and a real
//     send — ONE POST …/messages { body, proposal? } with one Idempotency-Key per opening (a retry of the same
//     content reuses it). canStart only: POST conversations/start first. 409 MEETING_ALREADY_ACTIVE: the inserted
//     times give way to that meeting + 日程を変更 (the existing reschedule flow).
//   e-mail draft (anything else, read failures included): to / subject / body, inserted times are a paragraph of
//     text written as ranges (R43 formatMeetingRangesText; picking again replaces only that paragraph), 「コピー」 and
//     「メールアプリで開く」 (mailto, disabled without an address). No relationship request is made on this path.
// Unsent text is kept per account + contact + path on this browser (contact-reach-draft.ts) and cleared on send.
import { useEffect, useRef, useState } from "react";

import { formatMeetingRangesText, replaceMeetingSlotsText } from "../../../../../shared/compute/meeting-slots";
import { useSharedReadAccount } from "../../orbit-shared-read-account";
import { MeetingProposalModal } from "../calendar/MeetingProposalModal";
import type { MeetingSlotSelection } from "../calendar/MeetingSlotPicker";
import { mediumLabel, slotLabel } from "../calendar/meeting-slot-text";
import { AppointmentProposalCard } from "../inbox/AppointmentProposalCard";
import { networkCopy } from "../copy/network";
import { taskCopy } from "../copy/task";
import { pickCopy } from "../copy/types";
import { Bone, Button, Icon, IconButton, Modal, TextField, fillCopy, useScopeLanguage, useStandardCopy, useToast } from "../ui";
import { clearReachDraft, readReachDraft, saveReachDraft, type ReachPath } from "./contact-reach-draft";
import { networkApi, type ReachEligibility } from "./network-api";
import styles from "./contact-reach.module.css";

export interface ContactReachModalProps {
  open: boolean;
  contactId: string;
  name: string;
  /** The card's e-mail address ("" when there is none). */
  email: string;
  /** The drawer's eligibility read; null = could not be read or not an Orbit contact → e-mail draft. */
  eligibility: ReachEligibility | null;
  onClose: () => void;
  onSent?: () => void;
}

export const reachPathOf = (eligibility: ReachEligibility | null): ReachPath => (eligibility && (eligibility.canSend || eligibility.canStart) ? "orbit" : "email");
const EMAIL = /^[^\s@?&#/]+@[^\s@?&#/]+\.[^\s@?&#/]+$/;

/** mailto: with the subject and body encoded (line breaks as CRLF, RFC 6068). null without a usable address. */
export function mailtoHref(email: string, subject: string, body: string): string | null {
  const address = email.trim();
  if (!EMAIL.test(address)) return null;
  return `mailto:${address}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body.replace(/\r?\n/g, "\r\n"))}`;
}

function newComposeId(): string {
  try { return crypto.randomUUID(); } catch { return `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
}

export function ContactReachModal(props: ContactReachModalProps) {
  if (!props.open) return null;
  return <ReachSession key={`${props.contactId}:${reachPathOf(props.eligibility)}`} {...props} />;
}

type ReachError = "reachSendFailed" | "reachOffline" | "reachStale" | "reachMeetingUnavailable";

function ReachSession({ contactId, name, email, eligibility, onClose, onSent }: ContactReachModalProps) {
  const language = useScopeLanguage();
  const copy = useStandardCopy();
  const toast = useToast();
  const { account } = useSharedReadAccount();
  const n = (key: keyof typeof networkCopy, values?: Record<string, string | number>) => fillCopy(pickCopy(networkCopy[key], language), values ?? {});
  const tk = (key: keyof typeof taskCopy, values?: Record<string, string | number>) => fillCopy(pickCopy(taskCopy[key], language), values ?? {});
  const path = reachPathOf(eligibility);
  const [saved] = useState(() => readReachDraft(account, contactId, path));
  // null body: the template is still being read (a bone of the same size stands in).
  const [body, setBody] = useState<string | null>(saved?.body ?? null);
  const [subject, setSubject] = useState(saved?.subject ?? "");
  const [proposal, setProposal] = useState<MeetingSlotSelection | null>(path === "orbit" ? saved?.proposal ?? null : null);
  const [picked, setPicked] = useState<MeetingSlotSelection | null>(path === "email" ? saved?.picked ?? null : null);
  const [insertedBlock, setInsertedBlock] = useState<string | null>(path === "email" ? saved?.insertedBlock ?? null : null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [activeAppointmentId, setActiveAppointmentId] = useState<string | null>(eligibility?.activeAppointmentId ?? null);
  const [activeUnknown, setActiveUnknown] = useState(false);
  const [canPropose, setCanPropose] = useState(Boolean(eligibility?.canProposeMeeting));
  const [conversation, setConversation] = useState(() => eligibility?.conversationId && eligibility.qualificationVersion ? { id: eligibility.conversationId, version: eligibility.qualificationVersion } : null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<ReachError | null>(null);
  const [reschedule, setReschedule] = useState<string | null>(null);
  const composeId = useRef(newComposeId());
  const attempt = useRef<{ fingerprint: string; revision: number } | null>(null);

  // The template (0 AI calls) unless a draft was kept.
  useEffect(() => {
    if (saved) return;
    let alive = true;
    void networkApi.reconnectDraft(contactId, language).then((result) => {
      if (!alive) return;
      setBody((current) => current ?? (result.ok ? result.data.draft.body : ""));
      if (result.ok) setSubject((current) => current || result.data.draft.subject);
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Keep what was written on this browser.
  useEffect(() => {
    if (body === null) return;
    saveReachDraft(account, contactId, path, path === "orbit" ? { body, proposal } : { body, subject, picked, insertedBlock });
  }, [account, contactId, path, body, subject, proposal, picked, insertedBlock]);

  const insertEmailTimes = (selection: MeetingSlotSelection) => {
    const lineKey = selection.format === "in_person" ? "reachLinePlace" : selection.format === "video" ? "reachLineLink" : "reachLinePhone";
    const paragraph = formatMeetingRangesText(selection.ranges ?? selection.slots, { language, timeZone: selection.timeZone, durationMinutes: selection.durationMinutes, medium: selection.format });
    const block = paragraph && selection.place ? `${paragraph}\n${n(lineKey, { value: selection.place })}` : paragraph;
    setBody((current) => replaceMeetingSlotsText(current ?? "", block, { previous: insertedBlock }));
    setInsertedBlock(block || null); setPicked(selection);
  };

  const send = async () => {
    if (path !== "orbit" || sending || body === null || !body.trim()) return;
    setError(null);
    if (typeof navigator !== "undefined" && navigator.onLine === false) { setError("reachOffline"); return; }
    setSending(true);
    try {
      let target = conversation;
      if (!target) {
        const started = await networkApi.startConversation(contactId);
        if ("reason" in started) { setError(started.reason === "not_found" || started.reason === "invalid" ? "reachStale" : "reachSendFailed"); return; }
        if (!started.data.conversationId || !started.data.qualificationVersion) { setError("reachStale"); return; }
        target = { id: started.data.conversationId, version: started.data.qualificationVersion };
        setConversation(target);
      }
      const request = {
        body: body.trim(), qualificationVersion: target.version,
        ...(proposal ? { proposal: { candidateTimes: proposal.slots.map((slot) => ({ startsAtUtc: new Date(slot.startsAt).toISOString() })), durationMinutes: proposal.durationMinutes, medium: proposal.medium, note: "", timezone: proposal.timeZone } } : {}),
      };
      // A retry of the same content reuses the key (the server answers with the first delivery); changed content is a new send.
      const fingerprint = JSON.stringify([target.id, request]);
      if (!attempt.current || attempt.current.fingerprint !== fingerprint) attempt.current = { fingerprint, revision: (attempt.current?.revision ?? -1) + 1 };
      const result = await networkApi.sendMessage(target.id, request, `reach:${composeId.current}:${attempt.current.revision}`);
      if (!("reason" in result)) {
        clearReachDraft(account, contactId, "orbit");
        toast.success(n("reachSent"));
        onSent?.(); onClose();
        return;
      }
      if (result.reason === "active") { setProposal(null); setActiveAppointmentId(result.appointmentId); setActiveUnknown(!result.appointmentId); return; }
      if (result.reason === "meeting_unavailable") { setCanPropose(false); setError("reachMeetingUnavailable"); return; }
      setError(result.reason === "stale" ? "reachStale" : "reachSendFailed");
    } finally { setSending(false); }
  };

  const copyDraft = async () => {
    try { await navigator.clipboard.writeText(subject ? `${subject}\n\n${body ?? ""}` : body ?? ""); toast.success(n("reachCopied")); }
    catch { toast.error(n("reachCopyFailed")); }
  };

  const title = n("reachTitle", { name });
  const header = <div className={styles.head}>
    <h2>{title}</h2>
    <span className={`${styles.tag} ${path === "orbit" ? styles.tagOrbit : styles.tagMail}`} data-reach-path={path}>{n(path === "orbit" ? "reachTagOrbit" : "reachTagEmail")}</span>
    <span className={styles.grow} />
    <IconButton icon="x" size={34} label={copy.action.close} onClick={onClose} />
  </div>;
  const textarea = (label: string) => body === null
    ? <div className={styles.textareaBone} aria-busy="true" data-reach-body-loading=""><Bone width="70%" height={13} /><Bone width="90%" height={13} /><Bone width="55%" height={13} /></div>
    : <textarea className={styles.textarea} aria-label={label} value={body} onChange={(event) => { setBody(event.target.value); setError(null); }} data-reach-body="" />;
  const mailto = path === "email" ? mailtoHref(email, subject, body ?? "") : null;

  const proposalBlock = path !== "orbit" || !canPropose ? null
    : activeAppointmentId || activeUnknown ? <div className={styles.field} data-reach-active="">
      <span className={styles.lbl}>{n("reachActive")}</span>
      {activeAppointmentId ? <AppointmentProposalCard appointmentId={activeAppointmentId} peerName={name} onReschedule={(meeting) => setReschedule(meeting.appointmentId)} /> : null}
    </div>
    : proposal ? <div className={styles.prop} data-reach-proposal="">
      <div className={styles.propHead}><Icon name="calendar" size={15} /><span className={styles.grow}>{tk("cardDraftHead", { minutes: proposal.durationMinutes, medium: mediumLabel(proposal.format, language) })}</span>
        <Button size="sm" variant="ghost" label={tk("cardEdit")} onClick={() => setPickerOpen(true)} />
        <Button size="sm" variant="ghost" label={tk("cardRemove")} onClick={() => setProposal(null)} data-reach-remove="" /></div>
      {proposal.slots.map((slot, index) => <div key={slot.startsAt} className={styles.slot}><span className={styles.n}>{index + 1}</span><time dateTime={slot.startsAt}>{slotLabel(slot, proposal.timeZone, language)}</time></div>)}
    </div>
    : <div className={styles.attach}><button type="button" className={`btn ${styles.chipBtn}`} onClick={() => setPickerOpen(true)} disabled={body === null} data-reach-insert=""><Icon name="calendar" size={15} />{n("reachInsert")}</button></div>;

  const actions = path === "orbit"
    ? <><Button label={copy.action.cancel} onClick={onClose} /><Button variant="primary" icon="send" label={n(sending ? "reachSending" : "reachSend")} loading={sending} disabled={sending || body === null || !body.trim()} onClick={() => void send()} data-reach-send="" /></>
    : <><Button icon="copy" label={copy.action.copy} disabled={body === null} onClick={() => void copyDraft()} data-reach-copy="" />
      {mailto ? <a className={`btn ${styles.chipBtn} ${styles.link}`} href={mailto} data-reach-mailto="">{n("reachOpenMail")}</a>
        : <Button variant="primary" label={n("reachOpenMail")} disabled data-reach-mailto="" />}</>;

  return <>
    <Modal open form onClose={onClose} title={title} header={header} size={560} hint={n(path === "orbit" ? (proposal ? "reachHintProposal" : "reachHintOrbit") : "reachHintEmail")} actions={actions}>
      <div className={styles.body} data-contact-reach={path}>
        {path === "email" ? <>
          <div className={styles.field}><span className={styles.lbl}>{n("reachTo")}</span>
            <div className={styles.to} data-reach-to="">{EMAIL.test(email.trim()) ? <>{email.trim()} <em>· {n("reachToSource")}</em></> : <em>{n("reachToNone")}</em>}</div></div>
          <TextField label={n("reachSubject")} value={subject} onChange={(event) => setSubject(event.target.value)} />
          <div className={styles.field}><span className={styles.lbl}>{n("reachEmailBody")}</span>{textarea(n("reachEmailBody"))}</div>
          <div className={styles.attach}><button type="button" className={`btn ${styles.chipBtn}`} onClick={() => setPickerOpen(true)} disabled={body === null} data-reach-insert=""><Icon name="calendar" size={15} />{n(insertedBlock ? "reachReinsert" : "reachInsert")}</button></div>
        </> : <>
          <div className={styles.field}><span className={styles.lbl}>{n("reachMessage")}</span>{textarea(n("reachMessage"))}</div>
          {proposalBlock}
        </>}
        {error ? <p className={styles.alert} role="alert" data-reach-error={error}>{n(error)}</p> : null}
      </div>
    </Modal>
    <MeetingProposalModal mode="insert" open={pickerOpen} minimum={path === "orbit" ? 3 : 1} requirePlace={path === "orbit"} initial={path === "orbit" ? proposal : picked}
      onClose={() => setPickerOpen(false)} onInsert={(selection) => { setPickerOpen(false); setError(null); if (path === "orbit") setProposal(selection); else insertEmailTimes(selection); }} />
    {reschedule ? <MeetingProposalModal open appointmentId={reschedule} contactId={contactId} onClose={() => setReschedule(null)} onSent={() => setReschedule(null)} /> : null}
  </>;
}
