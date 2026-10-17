"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MeetingDetailsMedium } from "../../../../../shared/contract/appointments";
import { calendarDate, localParts, resolveLocalDateTime, validTimeZone } from "../../../../../features/tasks/local-date-time";
import { useSharedReadAccount } from "../../orbit-shared-read-account";
import { Button, Card, ConfirmDialog, Modal, RetryCard, Segmented, Skeleton, TextField, useScopeLanguage } from "../ui";
import { taskCopy } from "../copy/task";
import { pickCopy } from "../copy/types";
import { createMeetingProposalClient, MeetingProposalError, prepareMeetingProposal, type MeetingCandidate, type MeetingProposalTarget } from "./meeting-proposal-client";
import { createMeetingAvailabilityCheck, createMeetingAvailabilityClient, seedAvailableMeetingCandidates, type MeetingAvailability } from "./meeting-availability";
import styles from "./meeting-proposal.module.css";

export interface MeetingProposalModalProps {
  open: boolean;
  contactId: string;
  onClose: () => void;
  onSent?: (appointmentId: string) => void;
  appointmentId?: string;
  initialCandidates?: readonly { startsAt: string; endsAt: string }[];
}

export function MeetingProposalModal(props: MeetingProposalModalProps) {
  const { account, ready } = useSharedReadAccount();
  const language = useScopeLanguage();
  if (!props.open) return null;
  if (!props.appointmentId || !ready) return <Modal open onClose={props.onClose} title={pickCopy(taskCopy.proposalTitle, language)} size={560}><Steps /><p className={styles.note} role="alert">{pickCopy(props.appointmentId ? taskCopy.proposalReadFailed : taskCopy.proposalContactOnly, language)}</p></Modal>;
  return <ProposalSession key={JSON.stringify([account, props.contactId, props.appointmentId])} {...props} appointmentId={props.appointmentId} />;
}

function Steps({ current }: { current?: string }) {
  const language = useScopeLanguage();
  return <ol className={styles.steps}>{([["candidates", taskCopy.proposalCandidates], ["format", taskCopy.proposalFormat], ["review", taskCopy.proposalReview]] as const).map(([key, entry]) => <li key={key} aria-current={current === key ? "step" : undefined}><h3 className={styles.step}>{pickCopy(entry, language)}</h3></li>)}</ol>;
}

function shiftDay(date: string, amount: number) { const value = calendarDate(date)!; value.setUTCDate(value.getUTCDate() + amount); return value.toISOString().slice(0, 10); }
function monday(date: string) { return shiftDay(date, -(calendarDate(date)!.getUTCDay() + 6) % 7); }
const blankAvailability: MeetingAvailability = { from: "", to: "", complete: false, items: [] };

function ProposalSession({ contactId, appointmentId, initialCandidates, onClose, onSent }: MeetingProposalModalProps & { appointmentId: string }) {
  const language = useScopeLanguage(), t = (entry: typeof taskCopy[keyof typeof taskCopy]) => pickCopy(entry, language);
  const [zone] = useState(() => { try { const value = new Intl.DateTimeFormat().resolvedOptions().timeZone; return validTimeZone(value) ? value : null; } catch { return null; } });
  const [meeting, setMeeting] = useState<MeetingProposalTarget | null>(null), [availability, setAvailability] = useState(blankAvailability);
  const [readState, setReadState] = useState<"loading" | "ready" | "failed">("loading"), [revision, setRevision] = useState(0);
  const [step, setStep] = useState<"candidates" | "format" | "review">("candidates");
  const [candidates, setCandidates] = useState<MeetingCandidate[]>(() => initialCandidates?.map(value => ({ ...value })) ?? []);
  const [duration, setDuration] = useState(() => { const value = initialCandidates?.[0] ? (Date.parse(initialCandidates[0].endsAt) - Date.parse(initialCandidates[0].startsAt)) / 60_000 : 60; return Number.isSafeInteger(value) && value >= 15 && value <= 480 ? value : 60; });
  const [week, setWeek] = useState(() => zone ? monday(localParts(Date.now(), zone).date) : "");
  const [format, setFormat] = useState<MeetingDetailsMedium["kind"]>("in_person"), [place, setPlace] = useState("");
  const [error, setError] = useState<MeetingProposalError["code"] | null>(null), [busy, setBusy] = useState(false), [done, setDone] = useState(false), [discard, setDiscard] = useState(false);
  const dirty = useRef(false), initialized = useRef(false), providedCandidates = useRef(Boolean(initialCandidates?.length)), pending = useRef(false), life = useRef<AbortController | null>(null);
  const client = useMemo(() => createMeetingProposalClient(), []), reader = useMemo(() => createMeetingAvailabilityClient(), []);
  useEffect(() => { const controller = new AbortController(); life.current = controller; return () => { controller.abort(); life.current = null; }; }, []);
  useEffect(() => {
    const controller = new AbortController(), signal = life.current ? AbortSignal.any([controller.signal, life.current.signal]) : controller.signal;
    if (!zone) { setReadState("failed"); return () => controller.abort(); }
    setReadState("loading");
    void Promise.all([client.get(appointmentId, contactId, signal), reader.load(zone, Date.now(), signal)]).then(([target, available]) => {
      if (signal.aborted) return;
      if (target.visibility !== "participants" || target.status !== "confirmed" || !target.confirmed) throw new MeetingProposalError("invalid");
      setMeeting(target); setAvailability(available); setReadState("ready");
      if (!initialized.current) {
        initialized.current = true;
        if (!providedCandidates.current) setCandidates(seedAvailableMeetingCandidates(Date.now(), zone, available));
        const medium = target.confirmed.medium;
        setFormat(medium.kind); setPlace(medium.kind === "in_person" ? medium.location : medium.kind === "video" ? medium.joinUrl ?? "" : medium.phoneHint ?? "");
        setWeek(monday(localParts(available.from, zone).date));
      }
    }).catch(reason => {
      if (signal.aborted) return;
      setReadState("failed");
      if (reason instanceof MeetingProposalError && reason.code === "denied") { dirty.current = false; setMeeting(null); setCandidates([]); setPlace(""); setAvailability(blankAvailability); }
    });
    return () => controller.abort();
  }, [appointmentId, client, contactId, reader, revision, zone]);
  const medium: MeetingDetailsMedium = format === "in_person" ? { kind: "in_person", location: place.trim() } : format === "video" ? { kind: "video", provider: "other", joinUrl: place.trim() || null } : { kind: "phone", phoneHint: place.trim() || null };
  const availabilityCheck = useMemo(() => createMeetingAvailabilityCheck(zone ?? "UTC", availability), [zone, availability]);
  const selection = zone ? prepareMeetingProposal(candidates, { kind: "phone", phoneHint: null }, zone, Date.now()) : null;
  const knownConflict = candidates.some(value => availabilityCheck(value) === "busy");
  const valid = Boolean(selection && !knownConflict), validMedium = Boolean(zone && prepareMeetingProposal(candidates, medium, zone, Date.now()));
  const unverified = !availability.complete || candidates.some(value => availabilityCheck(value) === "unknown");
  const dateFormat = useMemo(() => new Intl.DateTimeFormat(language === "ja" ? "ja-JP" : language === "zh" ? "zh-CN" : "en-GB", { timeZone: zone ?? "UTC", month: "short", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }), [language, zone]);
  const display = (value: string) => Number.isFinite(Date.parse(value)) ? dateFormat.format(new Date(value)) : t(taskCopy.proposalUnknown);
  const edit = () => { dirty.current = true; setError(null); };
  const close = () => { if (!pending.current) { if (dirty.current && !done) setDiscard(true); else onClose(); } };
  async function save() {
    if (!meeting || !zone || !valid || !validMedium || pending.current || done || !life.current) return;
    const signal = life.current.signal;
    pending.current = true; setBusy(true); setError(null);
    let receipt: MeetingProposalTarget | null = null;
    try { receipt = await client.propose(meeting, candidates, medium, zone, signal); }
    catch (reason) { if (!signal.aborted) { const code = reason instanceof MeetingProposalError ? reason.code : "failed"; setError(code); if (code === "denied") { setReadState("failed"); setMeeting(null); setCandidates([]); setPlace(""); dirty.current = false; } } }
    finally { pending.current = false; if (!signal.aborted) setBusy(false); }
    if (receipt && !signal.aborted) { dirty.current = false; setDone(true); setMeeting(receipt); onSent?.(receipt.appointmentId); onClose(); }
  }
  const chosen = <ol aria-label={t(taskCopy.proposalSelection)} className={styles.candidates}>{candidates.map((candidate, index) => <li key={`${candidate.startsAt}:${index}`} className={styles.candidate}><span className={styles.number}>{index + 1}</span><time>{display(candidate.startsAt)} – {display(candidate.endsAt)}</time>{step === "candidates" ? <Button size="sm" variant="ghost" icon="x" label={t(taskCopy.proposalRemove).replace("{number}", String(index + 1))} onClick={() => { edit(); setCandidates(values => values.filter((_, position) => position !== index)); }} /> : null}</li>)}</ol>;
  return <>
    <Modal open onClose={close} title={t(taskCopy.proposalTitle)} size={step === "candidates" ? 1000 : 760}>
      <Steps current={step} />
      {readState === "loading" ? <Skeleton lines={4} /> : readState === "failed" || !meeting || !zone ? <RetryCard title={t(taskCopy.proposalReadFailed)} onRetry={() => setRevision(value => value + 1)} /> : done ? <p role="status">{t(taskCopy.proposalSaved)}</p> : <div className={styles.body}>
        {step === "candidates" ? <><p className={styles.note}>{t(unverified ? taskCopy.proposalUnverified : taskCopy.proposalPickHint)}</p><div className={styles.columns}><Card><div className={styles.row}><Button icon="left" label={t(taskCopy.calendarPrevious)} size="sm" disabled={!week || shiftDay(week, -3) < availability.from.slice(0, 10)} onClick={() => setWeek(value => shiftDay(value, -7))} /><b>{week} – {shiftDay(week, 4)}</b><Button icon="right" label={t(taskCopy.calendarNext)} size="sm" disabled={!week || shiftDay(week, 7) >= availability.to.slice(0, 10)} onClick={() => setWeek(value => shiftDay(value, 7))} /></div>
          <div className={styles.weekGrid}><span />{Array.from({ length: 5 }, (_, day) => <b key={day} className={styles.day}>{shiftDay(week, day)}</b>)}{Array.from({ length: 18 }, (_, slot) => {
            const time = `${String(9 + Math.floor(slot / 2)).padStart(2, "0")}:${slot % 2 ? "30" : "00"}`;
            return <div key={time} className={styles.gridRow}><time className={styles.hour}>{time}</time>{Array.from({ length: 5 }, (_, offset) => {
              const startsAt = resolveLocalDateTime(shiftDay(week, offset), time, zone), candidate = startsAt ? { startsAt, endsAt: new Date(Date.parse(startsAt) + duration * 60_000).toISOString() } : null;
              const index = candidate ? candidates.findIndex(value => Date.parse(value.startsAt) === Date.parse(candidate.startsAt)) : -1;
              const state = candidate ? availabilityCheck(candidate) : "unknown";
              const inWindow = candidate && Date.parse(candidate.startsAt) >= Date.parse(availability.from) && Date.parse(candidate.endsAt) <= Date.parse(availability.to);
              const collides = candidate && candidates.some((value, position) => position !== index && Date.parse(value.startsAt) < Date.parse(candidate.endsAt) && Date.parse(value.endsAt) > Date.parse(candidate.startsAt));
              const disabled = !candidate || !inWindow || 9 * 60 + slot * 30 + duration > 18 * 60 || Date.parse(candidate.startsAt) <= Date.now() + 15 * 60_000 || state === "busy" || Boolean(collides) || index < 0 && candidates.length >= 5;
              return <button type="button" key={offset} data-proposal-slot={startsAt ?? ""} aria-label={`${shiftDay(week, offset)} ${time} · ${t(state === "busy" ? taskCopy.proposalBusy : state === "free" ? taskCopy.proposalFree : taskCopy.proposalUnknown)}`} aria-pressed={index >= 0} disabled={disabled} className={`${styles.slot} ${state === "busy" ? styles.busy : ""} ${index >= 0 ? styles.selected : ""}`} onClick={() => { if (disabled || !candidate) return; edit(); setCandidates(values => (index >= 0 ? values.filter((_, position) => position !== index) : [...values, candidate]).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))); }}>{index >= 0 ? index + 1 : ""}</button>;
            })}</div>;
          })}</div></Card><Card><Segmented<string> label={t(taskCopy.proposalDuration)} value={String(duration)} segments={[...new Set([30, 60, 90, ...(Number.isSafeInteger(duration) && duration >= 15 && duration <= 480 ? [duration] : [])])].map(value => ({ key: String(value), label: t(taskCopy.proposalMinutes).replace("{minutes}", String(value)) }))} onChange={value => { edit(); const minutes = Number(value); setDuration(minutes); setCandidates(values => values.map(candidate => ({ ...candidate, endsAt: new Date(Date.parse(candidate.startsAt) + minutes * 60_000).toISOString() }))); }} />{chosen}</Card></div></> : null}
        {step === "format" ? <><Segmented<MeetingDetailsMedium["kind"]> label={t(taskCopy.proposalFormat)} value={format} segments={[{ key: "in_person", label: t(taskCopy.proposalInPerson) }, { key: "video", label: t(taskCopy.proposalVideo) }, { key: "phone", label: t(taskCopy.proposalPhone) }]} onChange={value => { edit(); setFormat(value); setPlace(""); }} /><TextField label={t(format === "in_person" ? taskCopy.proposalPlace : format === "video" ? taskCopy.proposalVideoUrl : taskCopy.proposalPhoneHint)} aria-label={t(format === "in_person" ? taskCopy.proposalPlace : format === "video" ? taskCopy.proposalVideoUrl : taskCopy.proposalPhoneHint)} maxLength={format === "in_person" ? 500 : format === "video" ? 2048 : 128} value={place} onChange={event => { edit(); setPlace(event.target.value); }} />{format === "video" ? <p className={styles.note}>{t(taskCopy.proposalNoAutoLink)}</p> : null}{chosen}</> : null}
        {step === "review" ? <><p className={styles.note}>{t(taskCopy.proposalKeepOriginal)}</p>{chosen}<Card><b>{t(format === "in_person" ? taskCopy.proposalInPerson : format === "video" ? taskCopy.proposalVideo : taskCopy.proposalPhone)}</b><p className={styles.note}>{place}</p><p className={styles.note}>{zone}</p></Card></> : null}
        {!valid || step !== "candidates" && !validMedium ? <p role="alert" className={styles.note}>{t(taskCopy.proposalInvalid)}</p> : null}
        {error ? <p role="alert" className={styles.note}>{t(error === "conflict" ? taskCopy.proposalConflict : error === "invalid" ? taskCopy.proposalInvalid : taskCopy.todoWriteFailed)}</p> : null}
        <div className={styles.actions}>{step !== "candidates" ? <Button label={t(taskCopy.proposalBack)} disabled={busy} onClick={() => setStep(step === "review" ? "format" : "candidates")} /> : null}{step === "review" ? <Button label={t(taskCopy.proposalSave)} variant="primary" loading={busy} disabled={!valid || !validMedium || busy} onClick={() => { void save(); }} /> : <Button label={t(taskCopy.proposalNext)} variant="primary" disabled={!valid || step === "format" && !validMedium} onClick={() => setStep(step === "candidates" ? "format" : "review")} />}{error === "conflict" ? <Button label={t(taskCopy.proposalReload)} onClick={() => setRevision(value => value + 1)} /> : null}</div>
      </div>}
    </Modal>
    <ConfirmDialog open={discard} title={t(taskCopy.calendarDiscardQuestion)} confirmLabel={t(taskCopy.calendarDiscard)} destructive onConfirm={onClose} onCancel={() => setDiscard(false)} />
  </>;
}
