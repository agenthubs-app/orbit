/**
 * Sprint 0107 LivePerson sheet: the other attendee's details and live actions.
 * Exchange commands go through the attendee controller for this participant
 * (workspace + participant detail, receipt check, reread; never auto-resent).
 * Notes and appointments use event-live-actions and need an accepted exchange.
 */
import { Ionicons } from "@expo/vector-icons";
import * as Crypto from "expo-crypto";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useOrbitAuthSession } from "../../../api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../../../api/ApiBaseUrlProvider";
import type { AttendeeWorkspace } from "../../../api/event-attendee-operations";
import { captureLiveEncounter, findLiveAppointment, proposeLiveAppointment, type LiveAppointment } from "../../../api/event-live-actions";
import { createControlStyles } from "../../../design/controls";
import { radius } from "../../../design/tokens";
import { createThemedStyles } from "../../../design/theme";
import { useOrbitApiClient } from "../../../hooks/useOrbitApiClient";
import { useOrbitLocale } from "../../../i18n/OrbitLocaleContext";
import { createAttendeeController } from "../../../view-models/event-attendee-controller";
import {
  SCHEDULE_DURATION_MINUTES, SCHEDULE_MAX_CANDIDATES, SCHEDULE_MIN_CANDIDATES, SCHEDULE_SLOTS, SCHEDULE_TIMEZONE,
  candidateTimesFrom, composeNoteText, exchangeOpen, exchangeState, initialFor, personRole, scheduleDays, sharedTopics, slotStartsAtUtc
} from "../../../view-models/event-live";
import { liveCopy, type LiveCopy } from "./live-copy";
import { liveFont } from "./live-theme";

type Mode = "detail" | "note" | "schedule";

export function LivePersonSheet({ eventId, participantId, workspace, venue, now, onClose, onContact }: {
  eventId: string; participantId: string; workspace: AttendeeWorkspace; venue: string; now: number;
  onClose: (changed: boolean) => void; onContact: (contactId: string) => void;
}) {
  const auth = useOrbitAuthSession(); const server = useOrbitApiBaseUrl(); const locale = useOrbitLocale();
  const c = liveCopy[locale.language];
  const { styles, colors } = useStyles();
  const scopeKey = JSON.stringify([auth.actorId, auth.user?.id, auth.cookieHeader, server.baseUrl, eventId, participantId]);
  const client = useOrbitApiClient({ scopeKey });
  const mounted = useRef(true);
  const changed = useRef(false);
  const controller = useMemo(() => createAttendeeController({ client, eventId, participantId, operationsActorId: auth.actorId ?? "", isCurrent: () => mounted.current }), [client, eventId, participantId]);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const [mode, setMode] = useState<Mode>("detail");
  useEffect(() => { mounted.current = true; controller.activate(); void controller.load(); return () => { mounted.current = false; controller.dispose(); }; }, [controller]);
  const w = state.workspace ?? workspace;
  const person = w.directory.find(p => p.participantId === participantId);
  const close = () => onClose(changed.current);
  const act = (action: "request" | "accept" | "decline" | "withdraw") => { changed.current = true; void controller.act(action); };
  if (!person) return null;
  const exchange = exchangeState(w, participantId);
  const d = state.detail;
  const placement = d?.placements.find(p => p.roundNumber === (Date.parse(w.configuration.roundTwoStartsAt) <= now ? 2 : 1)) ?? d?.placements[0] ?? null;
  const shared = sharedTopics(person.topics, w.me.topics);
  const busy = state.busy || state.loading;
  const canExchange = exchangeOpen(w, now);
  const accepted = exchange.kind === "accepted";

  return <Modal animationType="slide" transparent visible onRequestClose={close}>
    <View style={styles.root}>
      <Pressable accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID="live-person-scrim" style={styles.scrim} onPress={close} />
      <View style={styles.sheet} accessibilityViewIsModal>
        <View style={styles.handle} />
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
          <View style={styles.head}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{initialFor(person.displayName)}</Text></View>
            <View style={styles.headCopy}><Text accessibilityRole="header" style={styles.name}>{person.displayName}</Text>{personRole(person) ? <Text style={styles.role}>{personRole(person)}</Text> : null}</View>
            <Pressable accessibilityRole="button" accessibilityLabel={c.close} onPress={close} style={styles.close}><Ionicons name="close" size={20} color={colors.text3} /></Pressable>
          </View>
          {state.error ? <Text accessibilityRole="alert" style={styles.error}>{state.error}</Text> : null}
          {mode === "detail" ? <>
            <View style={styles.rows}>
              <InfoRow label={c.sharedTopics} value={shared.length ? shared.join(" · ") : c.none} />
              <InfoRow label={c.placement} value={placement ? c.placementValue(placement.roundNumber, placement.tableNumber) : state.loading ? c.loadingPerson : c.none} />
              <InfoRow label={c.card} value={c.cardState[exchange.kind]} muted={!accepted} />
            </View>
            <ExchangeButtons c={c} kind={exchange.kind} busy={busy} open={canExchange} contactId={exchange.contactId} onAct={act} onContact={onContact} />
            <View style={styles.pair}>
              <Pressable accessibilityRole="button" accessibilityLabel={c.note} accessibilityState={{ disabled: !accepted || !exchange.contactId }} disabled={!accepted || !exchange.contactId} onPress={() => setMode("note")} style={[styles.secondary, styles.half, (!accepted || !exchange.contactId) && styles.disabled]}><Text style={styles.secondaryText}>{c.note}</Text></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={c.schedule} accessibilityState={{ disabled: !accepted || !exchange.requestId }} disabled={!accepted || !exchange.requestId} onPress={() => setMode("schedule")} style={[styles.secondary, styles.half, (!accepted || !exchange.requestId) && styles.disabled]}><Text style={styles.secondaryText}>{c.schedule}</Text></Pressable>
            </View>
            {!accepted && exchange.kind !== "self" ? <Text style={styles.caption}>{c.exchangeFirst}</Text> : null}
          </> : null}
          {mode === "note" && exchange.contactId ? <NoteForm c={c} eventId={eventId} contactId={exchange.contactId} client={client} onDone={() => setMode("detail")} /> : null}
          {mode === "schedule" && exchange.requestId ? <ScheduleForm c={c} eventId={eventId} requestId={exchange.requestId} venue={venue} now={now} client={client} language={locale.language} onDone={() => setMode("detail")} /> : null}
        </ScrollView>
      </View>
    </View>
  </Modal>;
}

function InfoRow({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  const { styles } = useStyles();
  return <View style={styles.row}><Text style={styles.rowLabel}>{label}</Text><Text style={[styles.rowValue, muted && styles.rowMuted]}>{value}</Text></View>;
}

function ExchangeButtons({ c, kind, busy, open, contactId, onAct, onContact }: { c: LiveCopy; kind: ReturnType<typeof exchangeState>["kind"]; busy: boolean; open: boolean; contactId: string | null; onAct: (action: "request" | "accept" | "decline" | "withdraw") => void; onContact: (id: string) => void }) {
  const { styles } = useStyles();
  const primary = (label: string, onPress: () => void, disabled = busy) => <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={[styles.primary, disabled && styles.disabled]}><Text style={styles.primaryText}>{label}</Text></Pressable>;
  const inert = (label: string) => <View accessibilityRole="button" accessibilityState={{ disabled: true }} style={styles.inert}><Text style={styles.inertText}>{label}</Text></View>;
  if (kind === "self") return null;
  if (kind === "none" || kind === "withdrawn_outgoing") return open ? primary(kind === "none" ? c.request : c.requestAgain, () => onAct("request")) : inert(c.opensAtStart);
  if (kind === "outgoing") return <Pressable accessibilityRole="button" accessibilityLabel={c.requested} disabled={busy} onPress={() => onAct("withdraw")} style={[styles.secondary, busy && styles.disabled]}><Text style={styles.secondaryText}>{c.requested}</Text></Pressable>;
  if (kind === "incoming") return <View style={styles.pair}>
    <Pressable accessibilityRole="button" accessibilityLabel={c.accept} disabled={busy} onPress={() => onAct("accept")} style={[styles.primary, styles.half, busy && styles.disabled]}><Text style={styles.primaryText}>{c.accept}</Text></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={c.ignore} disabled={busy} onPress={() => onAct("decline")} style={[styles.secondary, styles.half, busy && styles.disabled]}><Text style={styles.secondaryText}>{c.ignore}</Text></Pressable>
  </View>;
  if (kind === "accepted") return contactId ? primary(c.exchanged, () => onContact(contactId), false) : inert(c.cardState.accepted);
  return inert(c.cardState[kind]);
}

function NoteForm({ c, eventId, contactId, client, onDone }: { c: LiveCopy; eventId: string; contactId: string; client: ReturnType<typeof useOrbitApiClient>; onDone: () => void }) {
  const { styles, colors } = useStyles();
  const [what, setWhat] = useState(""); const [need, setNeed] = useState(""); const [offer, setOffer] = useState(""); const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null); const [saved, setSaved] = useState(false);
  // One key per attempt so a retry after a lost response cannot create a second note.
  const attempt = useRef<{ key: string; observedAt: string } | null>(null);
  async function save() {
    if (busy || !what.trim()) return;
    setBusy(true); setError(null);
    attempt.current ??= { key: `encounter:${Crypto.randomUUID()}`, observedAt: new Date().toISOString() };
    const result = await captureLiveEncounter(client, { eventId, contactId, noteText: composeNoteText({ what, need, offer }, { need: c.noteNeed, offer: c.noteOffer }), nextStep: next, tags: [], observedAt: attempt.current.observedAt, idempotencyKey: attempt.current.key });
    setBusy(false);
    if (result.ok) { attempt.current = null; setSaved(true); } else setError(result.kind === "offline" ? c.needsNetwork : result.message);
  }
  if (saved) return <View style={styles.form}><Text accessibilityRole="summary" style={styles.success}>{c.noteSaved}</Text><Pressable accessibilityRole="button" accessibilityLabel={c.close} onPress={onDone} style={styles.secondary}><Text style={styles.secondaryText}>{c.close}</Text></Pressable></View>;
  const field = (label: string, value: string, set: (v: string) => void, lines: number) => <View style={styles.field}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <TextInput accessibilityLabel={label} value={value} onChangeText={set} multiline maxLength={500} style={[styles.input, { minHeight: 22 * lines + 22 }]} placeholderTextColor={colors.text3} />
  </View>;
  return <View style={styles.form}>
    <Text style={styles.formTitle}>{c.noteTitle}</Text>
    {field(`${c.noteWhat} *`, what, setWhat, 3)}{field(c.noteNeed, need, setNeed, 1)}{field(c.noteOffer, offer, setOffer, 1)}{field(c.noteNext, next, setNext, 1)}
    <Text style={styles.caption}>{c.notePrivacy}</Text>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <Pressable accessibilityRole="button" accessibilityLabel={c.save} disabled={busy || !what.trim()} onPress={() => { void save(); }} style={[styles.primary, (busy || !what.trim()) && styles.disabled]}><Text style={styles.primaryText}>{busy ? c.saving : c.save}</Text></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={c.cancel} onPress={onDone} style={styles.secondary}><Text style={styles.secondaryText}>{c.cancel}</Text></Pressable>
  </View>;
}

function ScheduleForm({ c, eventId, requestId, venue, now, client, language, onDone }: { c: LiveCopy; eventId: string; requestId: string; venue: string; now: number; client: ReturnType<typeof useOrbitApiClient>; language: "zh" | "en" | "ja"; onDone: () => void }) {
  const { styles } = useStyles();
  const days = useMemo(() => scheduleDays(now, language), [now, language]);
  const [day, setDay] = useState(0); const [selected, setSelected] = useState<string[]>([]);
  const [medium, setMedium] = useState<"in_person" | "video">("in_person"); const [note, setNote] = useState("");
  const [lookup, setLookup] = useState<"loading" | "ready" | "failed">("loading");
  const [existing, setExisting] = useState<LiveAppointment | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null); const [sent, setSent] = useState(false); const [conflict, setConflict] = useState(false);
  const keys = useRef({ create: `appointment-create:${Crypto.randomUUID()}`, propose: `appointment-propose:${Crypto.randomUUID()}` });
  useEffect(() => { let alive = true; void findLiveAppointment(client, requestId, eventId).then(result => { if (!alive) return; if (result.ok) { setExisting(result.appointment); setLookup("ready"); } else setLookup("failed"); }); return () => { alive = false; }; }, [client, requestId, eventId]);
  const active = existing && existing.status !== "draft" ? existing : null;
  if (sent || active || conflict) return <View style={styles.form}>
    <Text style={styles.formTitle}>{sent ? c.scheduleSent : c.existingAppointment}</Text>
    {active ? <Text style={styles.rowValue}>{c.existingStatus[active.status]}</Text> : null}
    <Pressable accessibilityRole="button" accessibilityLabel={c.close} onPress={onDone} style={styles.secondary}><Text style={styles.secondaryText}>{c.close}</Text></Pressable>
  </View>;
  const current = days[day]!;
  const toggle = (slot: string) => { const key = `${current.iso} ${slot}`; setSelected(list => list.includes(key) ? list.filter(k => k !== key) : list.length >= SCHEDULE_MAX_CANDIDATES ? list : [...list, key]); };
  const canSend = !busy && lookup !== "loading" && selected.length >= SCHEDULE_MIN_CANDIDATES && selected.length <= SCHEDULE_MAX_CANDIDATES;
  async function send() {
    if (!canSend) return;
    setBusy(true); setError(null);
    const result = await proposeLiveAppointment(client, {
      eventId, requestId, draft: existing?.status === "draft" ? { appointmentId: existing.appointmentId, version: existing.version } : null,
      candidateTimes: candidateTimesFrom(selected), durationMinutes: SCHEDULE_DURATION_MINUTES, timezone: SCHEDULE_TIMEZONE,
      medium: medium === "in_person" ? { kind: "in_person", location: venue.trim() || c.inPerson } : { kind: "video", provider: "google_meet", joinUrl: null },
      note, createKey: keys.current.create, proposeKey: keys.current.propose
    });
    setBusy(false);
    if (result.ok) { setSent(true); return; }
    if (result.kind === "conflict") { setConflict(true); const again = await findLiveAppointment(client, requestId, eventId); if (again.ok) setExisting(again.appointment); return; }
    setError(result.kind === "offline" ? c.needsNetwork : result.message);
  }
  return <View style={styles.form}>
    <Text style={styles.formTitle}>{c.scheduleTitle}</Text>
    {lookup === "loading" ? <Text style={styles.caption}>{c.checkingAppointments}</Text> : null}
    {existing?.status === "draft" ? <Text style={styles.caption}>{c.draftContinues}</Text> : null}
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
      {days.map((item, index) => { const count = selected.filter(k => k.startsWith(`${item.iso} `)).length; return <Pressable key={item.iso} accessibilityRole="button" accessibilityLabel={`${item.label} ${item.weekday}`} accessibilityState={{ selected: index === day }} onPress={() => setDay(index)} style={[styles.chip, index === day && styles.chipOn]}>
        <Text style={[styles.chipText, index === day && styles.chipTextOn]}>{item.label} {item.weekday}{count ? ` · ${count}` : ""}</Text>
      </Pressable>; })}
    </ScrollView>
    <View style={styles.slots}>
      {SCHEDULE_SLOTS.map(slot => { const key = `${current.iso} ${slot}`; const on = selected.includes(key); const past = Date.parse(slotStartsAtUtc(current.iso, slot)) <= now; const full = !on && selected.length >= SCHEDULE_MAX_CANDIDATES;
        return <Pressable key={slot} accessibilityRole="button" accessibilityLabel={slot} accessibilityState={{ selected: on, disabled: past || full }} disabled={past || full} onPress={() => toggle(slot)} style={[styles.chip, styles.slot, on && styles.chipOn, (past || full) && styles.disabled]}><Text style={[styles.chipText, on && styles.chipTextOn]}>{slot}</Text></Pressable>; })}
    </View>
    <Text style={styles.caption}>{c.scheduleHint(selected.length)}</Text>
    <View style={styles.pair}>
      {(["in_person", "video"] as const).map(kind => <Pressable key={kind} accessibilityRole="button" accessibilityLabel={kind === "in_person" ? c.inPerson : c.video} accessibilityState={{ selected: medium === kind }} onPress={() => setMedium(kind)} style={[styles.chip, styles.half, medium === kind && styles.chipOn]}><Text style={[styles.chipText, medium === kind && styles.chipTextOn]}>{kind === "in_person" ? c.inPerson : c.video}</Text></Pressable>)}
    </View>
    <View style={styles.field}><Text style={styles.fieldLabel}>{c.scheduleNote}</Text><TextInput accessibilityLabel={c.scheduleNote} value={note} onChangeText={setNote} multiline maxLength={300} style={[styles.input, { minHeight: 66 }]} /></View>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <Pressable accessibilityRole="button" accessibilityLabel={c.send} disabled={!canSend} onPress={() => { void send(); }} style={[styles.primary, !canSend && styles.disabled]}><Text style={styles.primaryText}>{busy ? c.sending : c.send}</Text></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={c.cancel} onPress={onDone} style={styles.secondary}><Text style={styles.secondaryText}>{c.cancel}</Text></Pressable>
  </View>;
}

const useStyles = createThemedStyles(colors => {
  const controls = createControlStyles(colors);
  return StyleSheet.create({
    root: { flex: 1, justifyContent: "flex-end" },
    scrim: { ...StyleSheet.absoluteFill as object, backgroundColor: "rgba(11,18,32,0.4)" },
    sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, paddingTop: 10, maxHeight: "88%" },
    handle: { alignSelf: "center", width: 36, height: 5, borderRadius: radius.pill, backgroundColor: colors.border },
    body: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 34, gap: 18 },
    head: { flexDirection: "row", alignItems: "center", gap: 14 },
    avatar: { width: 56, height: 56, borderRadius: radius.pill, backgroundColor: colors.bgSunken, alignItems: "center", justifyContent: "center" },
    avatarText: { color: colors.text2, fontFamily: liveFont, fontSize: 20, fontWeight: "800" },
    headCopy: { flex: 1, gap: 2 },
    name: { color: colors.ink, fontFamily: liveFont, fontSize: 22, lineHeight: 30, fontWeight: "800" },
    role: { color: colors.text3, fontFamily: liveFont, fontSize: 13, lineHeight: 18 },
    close: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
    rows: { borderTopWidth: 1, borderTopColor: colors.hairline },
    row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, minHeight: 48, borderBottomWidth: 1, borderBottomColor: colors.hairline },
    rowLabel: { color: colors.text2, fontFamily: liveFont, fontSize: 15 },
    rowValue: { color: colors.ink, fontFamily: liveFont, fontSize: 15, flexShrink: 1, textAlign: "right" },
    rowMuted: { color: colors.text3 },
    primary: { ...controls.primaryButton }, primaryText: { ...controls.primaryButtonText, fontFamily: liveFont },
    secondary: { ...controls.secondaryButton }, secondaryText: { ...controls.secondaryButtonText, fontFamily: liveFont },
    inert: { ...controls.primaryButton, backgroundColor: colors.bgSunken }, inertText: { ...controls.primaryButtonText, color: colors.text3, fontFamily: liveFont },
    pair: { flexDirection: "row", gap: 10 }, half: { flex: 1 },
    disabled: { opacity: 0.45 },
    caption: { color: colors.text3, fontFamily: liveFont, fontSize: 12, lineHeight: 18 },
    error: { color: colors.rose, backgroundColor: colors.roseSoft, borderRadius: radius.control, padding: 12, fontFamily: liveFont, fontSize: 14, lineHeight: 21 },
    success: { color: colors.live, backgroundColor: colors.liveSoft, borderRadius: radius.control, padding: 12, fontFamily: liveFont, fontSize: 15, fontWeight: "600" },
    form: { gap: 12 },
    formTitle: { color: colors.ink, fontFamily: liveFont, fontSize: 15, lineHeight: 22, fontWeight: "800" },
    field: { gap: 6 },
    fieldLabel: { color: colors.text2, fontFamily: liveFont, fontSize: 13, fontWeight: "500" },
    input: { ...controls.input, fontFamily: liveFont, textAlignVertical: "top" },
    chips: { gap: 8 },
    chip: { ...controls.chip }, chipOn: { ...controls.selectedChip },
    chipText: { ...controls.chipText, fontFamily: liveFont }, chipTextOn: { ...controls.selectedChipText },
    slots: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    slot: { minWidth: "30%", flexGrow: 1 }
  });
});
