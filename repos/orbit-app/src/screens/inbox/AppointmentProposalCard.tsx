// contact-reach R42 ⑥ (and ② in the compose screen): the meeting a message carries, same state machine as Web R41.
// Pending: one row per candidate, 「これにする」 on each when the other person proposed (accept { candidateId }); your own
// proposal shows 返事待ち and no pick buttons; every candidate past → 期限切れ, dimmed, only 「別の時間を提案」 (counter,
// through the same slot picker). Accepted → one line 「確定 11/19（水）14:00 – 15:00 · オンライン」. A stale version
// (409) reads the meeting again and says so. Commands need the network: offline the buttons wait.
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { Button, Chip, Icon, Skeleton, UiText, useToast } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { MeetingSlotPickerSheet, type MeetingSlotSelection } from "../calendar/MeetingSlotPickerSheet";
import { mediumLabel, slotLabel } from "../calendar/meeting-slot-text";
import { deviceTimeZone } from "../calendar/scheduling-availability-client";
import { appointmentCommand, pendingProposal, readAppointment, type AppointmentCardView } from "./appointment-card-client";

export interface AppointmentProposalCardProps {
  appointmentId: string;
  /** The other person's name (「{name} さんから日程の提案」). */
  peerName: string;
  /** Shown on a confirmed meeting: opens the existing reschedule flow. */
  onReschedule?: (meeting: AppointmentCardView) => void;
  offline?: boolean;
  /** Draws the card with an outline (opened from a notification). */
  highlighted?: boolean;
  /** Injected for tests. */
  now?: () => number;
}

const endOf = (startsAt: string, minutes: number) => new Date(Date.parse(startsAt) + minutes * 60_000).toISOString();

export function AppointmentProposalCard({ appointmentId, peerName, onReschedule, offline = false, highlighted = false, now = Date.now }: AppointmentProposalCardProps) {
  const { t } = useOrbitLocale();
  const { styles, colors } = useStyles();
  const toast = useToast();
  const client = useOrbitApiClient();
  // undefined: reading; null: could not be read.
  const [meeting, setMeeting] = useState<AppointmentCardView | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<"changed" | "failed" | null>(null);
  const [counterOpen, setCounterOpen] = useState(false);
  const zone = deviceTimeZone();
  const load = useCallback(async (signal?: AbortSignal) => {
    const value = await readAppointment(client, appointmentId, signal);
    if (!signal?.aborted) setMeeting(value);
  }, [appointmentId, client]);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);

  const run = async (command: "accept" | "counter", payload: Record<string, unknown>) => {
    if (!meeting || busy || offline) return;
    setBusy(true); setNotice(null);
    const result = await appointmentCommand(client, meeting, command, payload);
    setBusy(false);
    if (result.ok) { setMeeting(result.data); toast.success(t(command === "accept" ? "calendar.card.accepted" : "calendar.card.countered")); return; }
    if (result.reason === "conflict") { setNotice("changed"); await load(); } else setNotice("failed");
  };
  const counter = (selection: MeetingSlotSelection) => {
    setCounterOpen(false);
    void run("counter", { proposal: { candidateTimes: selection.slots.map((slot) => ({ startsAtUtc: new Date(slot.startsAt).toISOString() })), durationMinutes: selection.durationMinutes, medium: selection.medium, note: "", timezone: selection.timeZone } });
  };
  const frame = [styles.card, highlighted && styles.highlighted];

  if (meeting === undefined) return <View style={frame} testID="appointment-card-loading"><Skeleton lines={3} /></View>;
  if (meeting === null) return (
    <View style={frame} testID="appointment-card-failed">
      <UiText style={styles.note}>{t("calendar.card.readFailed")}</UiText>
      <View style={styles.foot}><Button size="sm" variant="ghost" label={t("common.retry")} onPress={() => { setMeeting(undefined); void load(); }} /></View>
    </View>
  );

  const pending = pendingProposal(meeting);
  const notes = notice ? <UiText accessibilityRole="alert" style={styles.alert}>{t(notice === "changed" ? "calendar.card.changed" : "calendar.card.failed")}</UiText>
    : offline ? <UiText style={styles.note}>{t("calendar.card.needsNetwork")}</UiText> : null;
  const picker = <MeetingSlotPickerSheet open={counterOpen} minimum={3} requirePlace onClose={() => setCounterOpen(false)} onInsert={counter} />;
  const confirmedLine = meeting.confirmed ? (
    <View style={styles.line} testID="appointment-confirmed">
      <Chip label={t(meeting.status === "completed" ? "calendar.card.completed" : "calendar.card.confirmed")} tone={meeting.status === "completed" ? "neutral" : "teal"} />
      <UiText style={styles.lineText}>{`${slotLabel({ startsAt: meeting.confirmed.startsAtUtc, endsAt: endOf(meeting.confirmed.startsAtUtc, meeting.confirmed.durationMinutes) }, zone, t)} · ${mediumLabel(meeting.confirmed.medium.kind, t)}`}</UiText>
    </View>
  ) : null;

  if (pending && (meeting.status === "awaiting_response" || meeting.status === "negotiating" || meeting.status === "reschedule_pending")) {
    const mine = pending.proposedBy === "you";
    const candidates = pending.candidateTimes ?? [];
    const expired = candidates.length > 0 && candidates.every((candidate) => Date.parse(candidate.startsAtUtc) <= now());
    const head = t(mine ? "calendar.card.fromYou" : "calendar.card.fromThem", { name: peerName, minutes: pending.durationMinutes, medium: mediumLabel(pending.medium.kind, t) });
    return (
      <View style={[...frame, expired && styles.dim]} testID={`appointment-card-${expired ? "expired" : mine ? "mine" : "pending"}`}>
        {confirmedLine}
        <View style={styles.head}>
          <Icon name="calendar" size={15} color={colors.ink2} />
          <UiText style={styles.headText}>{head}</UiText>
          {expired ? <Chip label={t("calendar.card.expired")} /> : mine ? <Chip label={t("calendar.card.waiting")} tone="lav" /> : null}
        </View>
        {candidates.map((candidate, index) => (
          <View key={candidate.candidateId} style={[styles.slot, index > 0 && styles.slotLine]}>
            <View style={styles.n}><UiText style={styles.nText}>{index + 1}</UiText></View>
            <UiText style={styles.slotText}>{slotLabel({ startsAt: candidate.startsAtUtc, endsAt: endOf(candidate.startsAtUtc, pending.durationMinutes) }, zone, t)}</UiText>
            {!mine && !expired && Date.parse(candidate.startsAtUtc) > now()
              ? <Button size="sm" label={t("calendar.card.pick")} disabled={busy || offline} onPress={() => void run("accept", { candidateId: candidate.candidateId })} accessibilityLabel={`${t("calendar.card.pick")} ${index + 1}`} />
              : null}
          </View>
        ))}
        {notes}
        {!mine || expired ? <View style={styles.foot}><Button size="sm" variant="ghost" label={t(expired ? "calendar.card.counterShort" : "calendar.card.counter")} disabled={busy || offline} onPress={() => setCounterOpen(true)} /></View> : null}
        {picker}
      </View>
    );
  }

  if (meeting.status === "cancelled") return <View style={[...frame, styles.dim]} testID="appointment-card-cancelled"><View style={styles.line}><Chip label={t("calendar.card.cancelled")} /></View></View>;
  return (
    <View style={frame} testID={`appointment-card-${meeting.status}`}>
      {confirmedLine}
      {notes}
      {meeting.status === "confirmed" && onReschedule ? <View style={styles.foot}><Button size="sm" label={t("calendar.card.reschedule")} disabled={offline} onPress={() => onReschedule(meeting)} /></View> : null}
      {picker}
    </View>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  card: { borderWidth: 1, borderColor: colors.line, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: colors.surface, gap: 8 },
  highlighted: { borderWidth: 2, borderColor: colors.ink2 },
  dim: { opacity: 0.6 },
  head: { flexDirection: "row", alignItems: "center", gap: 8 },
  headText: { flex: 1, color: colors.ink, fontSize: 13, fontWeight: "800" },
  slot: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
  slotLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  n: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" },
  nText: { color: colors.bg, fontSize: 11, fontWeight: "800" },
  slotText: { flex: 1, color: colors.ink, fontSize: 13 },
  line: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  lineText: { color: colors.ink, fontSize: 13 },
  foot: { flexDirection: "row", justifyContent: "flex-start" },
  note: { color: colors.ink3Text, fontSize: 12 },
  alert: { color: colors.coralText, fontSize: 12 },
}));
