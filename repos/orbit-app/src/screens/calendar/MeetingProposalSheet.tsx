import * as Crypto from "expo-crypto";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import type { MeetingDetailsContract, MeetingDetailsMedium } from "../../api/contract/appointments";
import { BottomSheet, Button, Segmented, TextField, UiText } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { radius, spacing, textStyles } from "../../design/tokens";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { useOrbitTimeZone } from "../../time/OrbitTimeZoneProvider";
import { loadRescheduleTarget, postRescheduleProposal, seedMeetingCandidates, validateMeetingCandidates, type MeetingCandidate } from "./meeting-proposal-flow";

export interface MeetingProposalSheetProps {
  open: boolean;
  contactId: string;
  onClose: () => void;
  onSent?: (appointmentId: string) => void;
  appointmentId?: string;
  initialCandidates?: readonly { startsAt: string; endsAt: string }[];
}

export function MeetingProposalSheet({ open, contactId, onClose, onSent, appointmentId, initialCandidates }: MeetingProposalSheetProps) {
  const { t } = useOrbitLocale();
  const { styles } = useStyles();
  return <BottomSheet visible={open} onClose={onClose} accessibilityLabel={t("calendar.proposal.title")}>
    <View style={styles.body}>
      <UiText accessibilityRole="header" style={styles.title}>{t("calendar.proposal.title")}</UiText>
      <View style={styles.stepTrack}>
        <UiText style={styles.step}>{t("calendar.proposal.candidates")}</UiText>
        <UiText style={styles.step}>{t("calendar.proposal.format")}</UiText>
        <UiText style={styles.step}>{t("calendar.proposal.review")}</UiText>
      </View>
      {appointmentId ? <RescheduleProposal key={`${contactId}:${appointmentId}`} contactId={contactId} appointmentId={appointmentId} onClose={onClose} {...(initialCandidates ? { initialCandidates } : {})} {...(onSent ? { onSent } : {})} />
        : <UiText accessibilityRole="alert" style={styles.notice}>{t("calendar.proposal.contactOnlyUnavailable")}</UiText>}
    </View>
  </BottomSheet>;
}

function RescheduleProposal({ contactId, appointmentId, initialCandidates, onClose, onSent }: Required<Pick<MeetingProposalSheetProps, "contactId" | "appointmentId" | "onClose">> & Pick<MeetingProposalSheetProps, "initialCandidates" | "onSent">) {
  const { t, language } = useOrbitLocale();
  const { styles } = useStyles();
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const zone = useOrbitTimeZone();
  const client = useOrbitApiClient({ scopeKey: JSON.stringify([contactId, appointmentId]) });
  const [meeting, setMeeting] = useState<MeetingDetailsContract | null>(null);
  const [loading, setLoading] = useState(true);
  const [readError, setReadError] = useState(false);
  const [revision, setRevision] = useState(0);
  const [step, setStep] = useState<"candidates" | "format" | "review">("candidates");
  const [candidates, setCandidates] = useState<MeetingCandidate[]>(() => seedMeetingCandidates(initialCandidates, Date.now(), zone.timeZone));
  const [format, setFormat] = useState<MeetingDetailsMedium["kind"]>("in_person");
  const [place, setPlace] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const retry = useRef<{ fingerprint: string; key: string } | null>(null);
  const ready = auth.ready && auth.signedIn && !auth.offline && server.ready;

  useEffect(() => {
    if (!ready) { setLoading(false); setReadError(true); return; }
    const controller = new AbortController();
    setLoading(true);
    setReadError(false);
    void loadRescheduleTarget(client, appointmentId, contactId, controller.signal).then(value => {
      if (controller.signal.aborted) return;
      setMeeting(value);
      setReadError(!value);
    }).catch(() => { if (!controller.signal.aborted) setReadError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [appointmentId, client, contactId, ready, revision]);

  const selection = validateMeetingCandidates(candidates, Date.now());
  const medium: MeetingDetailsMedium = format === "in_person" ? { kind: "in_person", location: place.trim() }
    : format === "video" ? { kind: "video", provider: "other", joinUrl: place.trim() || null }
    : { kind: "phone", phoneHint: place.trim() || null };
  const mediumValid = format !== "in_person" || Boolean(place.trim());
  const displayTime = (candidate: MeetingCandidate) => {
    const instant = Date.parse(candidate.startsAt);
    return Number.isFinite(instant) ? new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short", timeZone: zone.timeZone }).format(instant) : candidate.startsAt;
  };
  const shift = (index: number, minutes: number) => setCandidates(values => values.map((value, position) => position === index ? {
    startsAt: new Date(Date.parse(value.startsAt) + minutes * 60_000).toISOString(),
    endsAt: new Date(Date.parse(value.endsAt) + minutes * 60_000).toISOString(),
  } : value));
  const add = () => setCandidates(values => values.length >= 5 ? values : [...values, {
    startsAt: new Date(Date.parse(values.at(-1)?.startsAt ?? new Date().toISOString()) + 24 * 60 * 60_000).toISOString(),
    endsAt: new Date(Date.parse(values.at(-1)?.endsAt ?? new Date(Date.now() + 30 * 60_000).toISOString()) + 24 * 60 * 60_000).toISOString(),
  }]);

  async function send() {
    if (!meeting || !ready || !zone.canSave || !mediumValid || selection.error || pending.current) return;
    const fingerprint = JSON.stringify([meeting.appointmentId, meeting.version, candidates, medium, zone.timeZone]);
    const key = retry.current?.fingerprint === fingerprint ? retry.current.key : `ios:meeting-proposal:${Crypto.randomUUID()}`;
    retry.current = { fingerprint, key };
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await postRescheduleProposal(client, meeting, candidates, medium, zone.timeZone, key);
      if (result.status === "sent") {
        retry.current = null;
        onSent?.(result.appointmentId);
        onClose();
      } else {
        const key = result.status === "invalid" ? "calendar.proposal.invalid" : result.status === "conflict" ? "calendar.proposal.conflict" : result.status === "unconfirmed" ? "calendar.proposal.unconfirmed" : "calendar.proposal.failed";
        setError(t(key));
      }
    } catch { setError(t("calendar.proposal.failed")); }
    finally { pending.current = false; setBusy(false); }
  }

  if (!ready) return <UiText accessibilityRole="alert" style={styles.notice}>{t(auth.offline ? "calendar.proposal.offline" : "calendar.proposal.readFailed")}</UiText>;
  if (loading && !meeting) return <UiText style={styles.hint}>{t("calendar.proposal.loading")}</UiText>;
  if (readError || !meeting) return <View style={styles.body}><UiText accessibilityRole="alert" style={styles.notice}>{t("calendar.proposal.readFailed")}</UiText><Button label={t("calendar.proposal.reload")} onPress={() => setRevision(value => value + 1)} /></View>;
  return <View style={styles.body}>
    {step === "candidates" ? <>
      <UiText style={styles.hint}>{t("calendar.proposal.tentative")}</UiText>
      {candidates.map((candidate, index) => <View key={index} style={styles.candidate}>
        <UiText style={styles.candidateTitle}>{t("calendar.proposal.option", { number: index + 1 })}</UiText>
        <UiText style={styles.candidateTime}>{displayTime(candidate)}</UiText>
        <View style={styles.actions}>
          <Button size="sm" label={t("calendar.proposal.earlier")} onPress={() => shift(index, -30)} />
          <Button size="sm" label={t("calendar.proposal.later")} onPress={() => shift(index, 30)} />
          <Button size="sm" label={t("calendar.proposal.nextDay")} onPress={() => shift(index, 24 * 60)} />
          {candidates.length > 3 ? <Button size="sm" label={t("calendar.proposal.remove")} onPress={() => setCandidates(values => values.filter((_, position) => position !== index))} /> : null}
        </View>
      </View>)}
      {candidates.length < 5 ? <Button label={t("calendar.proposal.add")} onPress={add} /> : null}
      {selection.error ? <UiText accessibilityRole="alert" style={styles.error}>{t(selection.error === "count" ? "calendar.proposal.countError" : selection.error === "overlap" ? "calendar.proposal.overlapError" : "calendar.proposal.timeError")}</UiText> : null}
      <Button variant="primary" label={t("calendar.proposal.continue")} disabled={Boolean(selection.error)} onPress={() => { setError(""); setStep("format"); }} />
    </> : null}
    {step === "format" ? <>
      <Segmented<MeetingDetailsMedium["kind"]> accessibilityLabel={t("calendar.proposal.format")} segments={[
        { key: "in_person", label: t("calendar.proposal.inPerson") }, { key: "video", label: t("calendar.proposal.video") }, { key: "phone", label: t("calendar.proposal.phone") },
      ]} value={format} onChange={value => { setFormat(value); setPlace(""); }} />
      <TextField label={t(format === "in_person" ? "calendar.proposal.location" : format === "video" ? "calendar.proposal.videoUrl" : "calendar.proposal.phoneHint")} value={place} onChangeText={setPlace} />
      {!mediumValid ? <UiText accessibilityRole="alert" style={styles.error}>{t("calendar.proposal.placeRequired")}</UiText> : null}
      <View style={styles.actions}><Button label={t("calendar.proposal.back")} onPress={() => setStep("candidates")} /><Button variant="primary" label={t("calendar.proposal.continue")} disabled={!mediumValid} onPress={() => { setError(""); setStep("review"); }} /></View>
    </> : null}
    {step === "review" ? <>
      <UiText style={styles.hint}>{t("calendar.proposal.reviewNotice")}</UiText>
      {candidates.map((candidate, index) => <UiText key={index} style={styles.candidateTime}>{t("calendar.proposal.option", { number: index + 1 })} · {displayTime(candidate)}</UiText>)}
      <UiText style={styles.candidateTime}>{t("calendar.proposal.format")} · {format === "in_person" ? t("calendar.proposal.inPerson") : format === "video" ? t("calendar.proposal.video") : t("calendar.proposal.phone")}{place.trim() ? ` · ${place.trim()}` : ""}</UiText>
      {!zone.canSave ? <UiText accessibilityRole="alert" style={styles.error}>{t("calendar.proposal.zoneUnavailable")}</UiText> : null}
      {error ? <UiText accessibilityRole="alert" style={styles.error}>{error}</UiText> : null}
      <View style={styles.actions}><Button label={t("calendar.proposal.back")} disabled={busy} onPress={() => setStep("format")} /><Button variant="primary" label={t("calendar.proposal.send")} loading={busy} disabled={!zone.canSave || Boolean(selection.error)} onPress={() => void send()} /></View>
      {error === t("calendar.proposal.conflict") ? <Button label={t("calendar.proposal.reload")} onPress={() => setRevision(value => value + 1)} /> : null}
    </> : null}
  </View>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  body: { gap: spacing.lg },
  title: { ...textStyles.title, color: colors.ink },
  stepTrack: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  step: { ...textStyles.listTitle, color: colors.ink2 },
  notice: { ...textStyles.body, color: colors.ink3Text },
  hint: { ...textStyles.body, color: colors.ink3Text },
  candidate: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface2 },
  candidateTitle: { ...textStyles.listTitle, color: colors.ink },
  candidateTime: { ...textStyles.body, color: colors.ink },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  error: { ...textStyles.body, color: colors.coralText },
}));
