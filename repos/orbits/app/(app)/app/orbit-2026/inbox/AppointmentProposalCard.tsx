"use client";

// contact-reach R41 ⑥ (and ② in the compose dialog): the meeting a message carries. Pending: one row per
// candidate, 「これにする」 on each when the other person proposed (accept { candidateId }); your own proposal shows
// 返事待ち and no pick buttons; every candidate past → 期限切れ, greyed, only 「別の時間を提案」. Accepted → one
// line 「確定 11/19（水）14:00 – 15:00 · オンライン」. A stale version (409) reads the meeting again and says so.
import { useCallback, useEffect, useState } from "react";

import type { MeetingDetailsMedium } from "../../../../../shared/contract/appointments";
import { MeetingProposalModal } from "../calendar/MeetingProposalModal";
import type { MeetingSlotSelection } from "../calendar/MeetingSlotPicker";
import { mediumLabel, slotLabel } from "../calendar/meeting-slot-text";
import { taskCopy } from "../copy/task";
import { pickCopy } from "../copy/types";
import { Bone, Button, Chip, Icon, fillCopy, useScopeLanguage, useStandardCopy, useToast } from "../ui";
import { appointmentCommand, pendingProposal, readAppointment, type AppointmentCardView } from "./appointment-card-client";
import styles from "./appointment-proposal-card.module.css";

export interface AppointmentProposalCardProps {
  appointmentId: string;
  /** The other person's name (「{name} さんから日程の提案」). */
  peerName: string;
  /** Shown on a confirmed meeting: opens the existing reschedule flow. */
  onReschedule?: (meeting: AppointmentCardView) => void;
  /** Injected for tests. */
  now?: () => number;
}

function deviceZone(): string {
  try { return new Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; }
}
const endOf = (startsAt: string, minutes: number) => new Date(Date.parse(startsAt) + minutes * 60_000).toISOString();

export function AppointmentProposalCard({ appointmentId, peerName, onReschedule, now = Date.now }: AppointmentProposalCardProps) {
  const language = useScopeLanguage();
  const copy = useStandardCopy();
  const toast = useToast();
  const t = (key: keyof typeof taskCopy, values?: Record<string, string | number>) => fillCopy(pickCopy(taskCopy[key], language), values ?? {});
  // undefined: reading; null: could not be read.
  const [meeting, setMeeting] = useState<AppointmentCardView | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<"changed" | "failed" | null>(null);
  const [counterOpen, setCounterOpen] = useState(false);
  const zone = deviceZone();
  const load = useCallback(async (signal?: AbortSignal) => {
    const value = await readAppointment(appointmentId, signal);
    if (!signal?.aborted) setMeeting(value);
  }, [appointmentId]);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);

  const run = async (command: "accept" | "counter", payload: Record<string, unknown>) => {
    if (!meeting || busy) return false;
    setBusy(true); setNotice(null);
    const result = await appointmentCommand(meeting, command, payload);
    setBusy(false);
    if (!("reason" in result)) { setMeeting(result.data); toast.success(t(command === "accept" ? "cardAccepted" : "cardCountered")); return true; }
    if (result.reason === "conflict") { setNotice("changed"); await load(); } else setNotice("failed");
    return false;
  };
  const counter = async (selection: MeetingSlotSelection) => {
    setCounterOpen(false);
    await run("counter", { proposal: { candidateTimes: selection.slots.map((slot) => ({ startsAtUtc: new Date(slot.startsAt).toISOString() })), durationMinutes: selection.durationMinutes, medium: selection.medium, note: "", timezone: selection.timeZone } });
  };

  if (meeting === undefined) return <div className={styles.card} aria-busy="true" data-appointment-card="loading"><Bone width="60%" height={14} /><Bone width="80%" height={14} /><Bone width="80%" height={14} /></div>;
  if (meeting === null) return <div className={styles.card} data-appointment-card="failed"><p className={styles.note}>{t("cardReadFailed")}</p><div className={styles.foot}><Button size="sm" variant="ghost" label={copy.action.retry} onClick={() => { setMeeting(undefined); void load(); }} /></div></div>;

  const pending = pendingProposal(meeting);
  const medium = (value: { kind: MeetingDetailsMedium["kind"] }) => mediumLabel(value.kind, language);
  const notes = notice ? <p className={styles.alert} role="alert">{t(notice === "changed" ? "cardChanged" : "cardFailed")}</p> : null;
  const picker = <MeetingProposalModal mode="insert" open={counterOpen} minimum={3} requirePlace onClose={() => setCounterOpen(false)} onInsert={(selection) => void counter(selection)} />;
  const confirmedLine = meeting.confirmed ? <div className={styles.line} data-appointment-confirmed="">
    <Chip label={t(meeting.status === "completed" ? "cardCompleted" : "cardConfirmed")} tone={meeting.status === "completed" ? "neutral" : "teal"} />
    <span>{slotLabel({ startsAt: meeting.confirmed.startsAtUtc, endsAt: endOf(meeting.confirmed.startsAtUtc, meeting.confirmed.durationMinutes) }, zone, language)}</span>
    <span>· {medium(meeting.confirmed.medium)}</span>
  </div> : null;

  if (pending && (meeting.status === "awaiting_response" || meeting.status === "negotiating" || meeting.status === "reschedule_pending")) {
    const mine = pending.proposedBy === "you";
    const candidates = pending.candidateTimes ?? [];
    const expired = candidates.length > 0 && candidates.every((candidate) => Date.parse(candidate.startsAtUtc) <= now());
    const head = t(mine ? "cardFromYou" : "cardFromThem", { name: peerName, minutes: pending.durationMinutes, medium: medium(pending.medium) });
    return <div className={`${styles.card} ${expired ? styles.dim : ""}`} data-appointment-card={expired ? "expired" : mine ? "mine" : "pending"}>
      {confirmedLine}
      <div className={styles.head}><Icon name="calendar" size={15} /><span className={styles.grow}>{head}</span>
        {expired ? <Chip label={t("cardExpired")} tone="neutral" /> : mine ? <Chip label={t("cardWaiting")} tone="lav" /> : null}</div>
      {candidates.map((candidate, index) => <div key={candidate.candidateId} className={styles.slot}>
        <span className={styles.n}>{index + 1}</span>
        <time dateTime={candidate.startsAtUtc}>{slotLabel({ startsAt: candidate.startsAtUtc, endsAt: endOf(candidate.startsAtUtc, pending.durationMinutes) }, zone, language)}</time>
        {!mine && !expired && Date.parse(candidate.startsAtUtc) > now() ? <Button size="sm" label={t("cardPick")} disabled={busy} onClick={() => void run("accept", { candidateId: candidate.candidateId })} data-appointment-pick={candidate.candidateId} /> : null}
      </div>)}
      {notes}
      {!mine || expired ? <div className={styles.foot}><Button size="sm" variant="ghost" label={t(expired ? "cardCounterShort" : "cardCounter")} disabled={busy} onClick={() => setCounterOpen(true)} data-appointment-counter="" /></div> : null}
      {picker}
    </div>;
  }

  if (meeting.status === "cancelled") return <div className={`${styles.card} ${styles.dim}`} data-appointment-card="cancelled"><div className={styles.line}><Chip label={t("cardCancelled")} tone="neutral" /></div></div>;
  return <div className={styles.card} data-appointment-card={meeting.status}>
    {confirmedLine}
    {notes}
    {meeting.status === "confirmed" && onReschedule ? <div className={styles.foot}><Button size="sm" label={t("cardReschedule")} onClick={() => onReschedule(meeting)} data-appointment-reschedule="" /></div> : null}
    {picker}
  </div>;
}
