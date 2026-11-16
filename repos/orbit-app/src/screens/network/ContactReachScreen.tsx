// contact-reach R42 ⑦ 連絡する (App, full screen; same structure as Web R41's ContactReachModal):
//   message (canSend or canStart): the template body, 「候補の時間を入れる」 (only when canProposeMeeting; the day-list
//     picker from the bottom), and a real send — ONE POST …/messages { body, proposal? } with one Idempotency-Key per
//     opening. canStart only: POST conversations/start first. Times need the network (offline 送信 waits, the text stays);
//     plain text offline goes through the device outbox. 409 MEETING_ALREADY_ACTIVE: that meeting + 日程を変更.
//   e-mail draft (anything else, read failures included): to / subject / body; inserted times are a paragraph of text
//     (R40 formatMeetingSlotsText; picking again replaces only it); 「コピー」 and 「メールアプリで開く」 (mailto, disabled
//     without an address). No relationship request is made on this path.
// Unsent text stays on this device (contact-reach-model, AsyncStorage) per account + contact + path; a send clears it.
import * as Clipboard from "expo-clipboard";
import { randomUUID } from "expo-crypto";
import { useRouter, type Href } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Linking, StyleSheet, View } from "react-native";

import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { formatMeetingSlotsText, replaceMeetingSlotsText } from "../../api/compute/meeting-slots";
import { AppScreen } from "../../components/AppScreen";
import { Button, Chip, Icon, RetryCard, Skeleton, TextField, UiPressable, UiText, useToast } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { useApiResource } from "../../hooks/useApiResource";
import { useLocalContacts } from "../../hooks/useLocalContacts";
import { useLocalRelationshipConversations } from "../../hooks/useLocalRelationshipMessages";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { useRelationshipMessageOutbox } from "../../hooks/useRelationshipMessageOutbox";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { useStandardCopy } from "../../i18n/standard-copy";
import { localContactDetail } from "../../view-models/contacts-local";
import { MeetingProposalSheet } from "../calendar/MeetingProposalSheet";
import { MeetingSlotPickerSheet, type MeetingSlotSelection } from "../calendar/MeetingSlotPickerSheet";
import { mediumLabel, slotLabel } from "../calendar/meeting-slot-text";
import { AppointmentProposalCard } from "../inbox/AppointmentProposalCard";
import { detailContactFrom } from "./contact-detail-model";
import {
  cachedReachEligibility, clearReachDraft, loadReachEligibility, mailtoHref, proposalOf, reachPathOf, readReachDraft, rememberReachEligibility,
  saveReachDraft, sendReachMessage, startReachConversation, usableEmail, type ReachDraft, type ReachEligibility, type ReachPath,
} from "./contact-reach-model";

type ReachError = "network.reach.sendFailed" | "network.reach.offline" | "network.reach.offlineProposal" | "network.reach.stale" | "network.reach.meetingUnavailable";

export function ContactReachScreen({ contactId }: { contactId: string }) {
  const auth = useOrbitAuthSession();
  const { t } = useOrbitLocale();
  const { styles } = useStyles();
  const client = useOrbitApiClient();
  const account = auth.accountId ?? auth.actorId ?? null;
  const local = useLocalContacts();
  const remote = useApiResource<Record<string, unknown>>(`/api/contacts/${encodeURIComponent(contactId)}`, () => false, { scopeKey: contactId, cachePolicy: "network-only", enabled: !local.available });
  const contact = useMemo(() => local.available ? detailContactFrom(localContactDetail(local.rows, contactId)) : remote.kind === "success" ? detailContactFrom(remote.data) : null, [local.available, local.rows, contactId, remote]);
  // undefined: still reading (the contact page's answer is used when there is one); null: not readable → e-mail draft.
  const [eligibility, setEligibility] = useState<ReachEligibility | null | undefined>(() => (account ? cachedReachEligibility(account, contactId) : undefined));
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void loadReachEligibility(client, contactId, controller.signal).then((value) => {
      if (controller.signal.aborted) return;
      // A failed re-read keeps the contact page's answer (the path must not flip under the person's hands).
      setEligibility((current) => value ?? (current === undefined ? null : current));
      if (value && account) rememberReachEligibility(account, contactId, value);
      setChecked(true);
    });
    return () => controller.abort();
  }, [account, client, contactId]);

  const title = contact ? t("network.reach.title", { name: contact.displayName }) : "";
  if (!contact || (eligibility === undefined && !checked)) {
    const loading = local.available ? local.freshness.loading || !contact && eligibility === undefined : remote.kind === "loading";
    return (
      <AppScreen inset="kit" title={title} backIcon="x" backAccessibilityLabel={t("network.detail.back")}>
        <View testID="contact-reach">{loading || contact ? <Skeleton lines={6} /> : <RetryCard title={t("network.detail.notFound")} onRetry={() => (local.available ? local.refresh() : remote.refresh())} />}</View>
      </AppScreen>
    );
  }
  const path = reachPathOf(eligibility);
  return <ReachSession key={`${account}:${contactId}:${path}`} contactId={contactId} account={account} name={contact.displayName} email={contact.primaryEmail} eligibility={eligibility ?? null} path={path} title={title} />;
}

function ReachSession({ contactId, account, name, email, eligibility, path, title }: { contactId: string; account: string | null; name: string; email: string; eligibility: ReachEligibility | null; path: ReachPath; title: string }) {
  const { t, language } = useOrbitLocale();
  const copy = useStandardCopy();
  const { styles, colors } = useStyles();
  const toast = useToast();
  const router = useRouter();
  const auth = useOrbitAuthSession();
  const client = useOrbitApiClient();
  const threads = useLocalRelationshipConversations();
  const outbox = useRelationshipMessageOutbox(threads);
  const offline = auth.offline || (threads.available && threads.freshness.offline);
  // null body: the kept draft / template is still being read (a bone of the same size stands in).
  const [body, setBody] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [proposal, setProposal] = useState<MeetingSlotSelection | null>(null);
  const [picked, setPicked] = useState<MeetingSlotSelection | null>(null);
  const [insertedBlock, setInsertedBlock] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [activeAppointmentId, setActiveAppointmentId] = useState<string | null>(eligibility?.activeAppointmentId ?? null);
  const [activeUnknown, setActiveUnknown] = useState(false);
  const [canPropose, setCanPropose] = useState(Boolean(eligibility?.canProposeMeeting));
  const [conversation, setConversation] = useState(() => eligibility?.conversationId && eligibility.qualificationVersion ? { id: eligibility.conversationId, version: eligibility.qualificationVersion } : null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<ReachError | null>(null);
  const [reschedule, setReschedule] = useState<string | null>(null);
  const composeId = useRef(randomUUID());
  const attempt = useRef<{ fingerprint: string; revision: number } | null>(null);
  const loaded = useRef(false);

  // What was kept on this device, else the template (0 AI calls).
  useEffect(() => {
    let alive = true;
    void (async () => {
      const saved = await readReachDraft(account, contactId, path);
      if (!alive) return;
      if (saved) {
        setBody(saved.body); setSubject(saved.subject ?? "");
        if (path === "orbit") setProposal(saved.proposal ?? null); else { setPicked(saved.picked ?? null); setInsertedBlock(saved.insertedBlock ?? null); }
        loaded.current = true;
        return;
      }
      const result = await client.post<{ draft?: { subject?: unknown; body?: unknown } }>(`/api/contacts/${encodeURIComponent(contactId)}/reconnect-draft`, { body: { language } }).catch(() => null);
      if (!alive) return;
      const draft = result?.success ? result.data?.draft : undefined;
      setBody((current) => current ?? (typeof draft?.body === "string" ? draft.body : ""));
      if (typeof draft?.subject === "string") setSubject((current) => current || (draft.subject as string));
      loaded.current = true;
    })();
    return () => { alive = false; };
    // One read per opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Keep what was written on this device.
  useEffect(() => {
    if (body === null || !loaded.current) return;
    const draft: ReachDraft = path === "orbit" ? { body, proposal } : { body, subject, picked, insertedBlock };
    void saveReachDraft(account, contactId, path, draft);
  }, [account, contactId, path, body, subject, proposal, picked, insertedBlock]);

  const insertEmailTimes = (selection: MeetingSlotSelection) => {
    const lineKey = selection.format === "in_person" ? "network.reach.linePlace" : selection.format === "video" ? "network.reach.lineLink" : "network.reach.linePhone";
    const paragraph = formatMeetingSlotsText(selection.slots, { language, timeZone: selection.timeZone, durationMinutes: selection.durationMinutes, medium: selection.format });
    const block = paragraph && selection.place ? `${paragraph}\n${t(lineKey, { value: selection.place })}` : paragraph;
    setBody((current) => replaceMeetingSlotsText(current ?? "", block, { previous: insertedBlock }));
    setInsertedBlock(block || null); setPicked(selection);
  };

  const done = async (message: "network.reach.sent" | "network.reach.queued") => {
    await clearReachDraft(account, contactId, "orbit");
    toast.success(t(message));
    if (router.canGoBack()) router.back(); else router.replace(`/contacts/${encodeURIComponent(contactId)}` as Href);
  };

  const send = async () => {
    if (path !== "orbit" || sending || body === null || !body.trim()) return;
    setError(null);
    if (offline) {
      // Plain text waits in the device outbox when the conversation already exists; times need the server now.
      if (!proposal && conversation && outbox.enabled) {
        setSending(true);
        try { await outbox.enqueue({ conversationId: conversation.id, body: body.trim(), qualificationVersion: conversation.version, retireDraftThrough: null }); await done("network.reach.queued"); }
        catch { setError("network.reach.sendFailed"); }
        finally { setSending(false); }
        return;
      }
      setError(proposal ? "network.reach.offlineProposal" : "network.reach.offline");
      return;
    }
    setSending(true);
    try {
      let target = conversation;
      if (!target) {
        const started = await startReachConversation(client, contactId);
        if (!started.ok) { setError(started.reason === "stale" ? "network.reach.stale" : "network.reach.sendFailed"); return; }
        target = { id: started.conversationId, version: started.qualificationVersion };
        setConversation(target);
      }
      const request = { body: body.trim(), qualificationVersion: target.version, ...(proposal ? { proposal: proposalOf(proposal) } : {}) };
      // A retry of the same content reuses the key (the server answers with the first delivery); changed content is a new send.
      const fingerprint = JSON.stringify([target.id, request]);
      if (!attempt.current || attempt.current.fingerprint !== fingerprint) attempt.current = { fingerprint, revision: (attempt.current?.revision ?? -1) + 1 };
      const result = await sendReachMessage(client, { conversationId: target.id, senderAccountId: auth.actorId ?? "", request, idempotencyKey: `reach:${composeId.current}:${attempt.current.revision}` });
      if (result.ok) { await done("network.reach.sent"); return; }
      if (result.reason === "active") { setProposal(null); setActiveAppointmentId(result.appointmentId); setActiveUnknown(!result.appointmentId); return; }
      if (result.reason === "meeting_unavailable") { setCanPropose(false); setError("network.reach.meetingUnavailable"); return; }
      setError(result.reason === "stale" ? "network.reach.stale" : "network.reach.sendFailed");
    } finally { setSending(false); }
  };

  const copyDraft = () => {
    void Clipboard.setStringAsync(subject ? `${subject}\n\n${body ?? ""}` : body ?? "").then(() => toast.success(t("network.reach.copied")), () => toast.error(t("network.reach.copyFailed")));
  };
  const mailto = path === "email" ? mailtoHref(email, subject, body ?? "") : null;
  const openMail = () => { if (mailto) Linking.openURL(mailto).catch(() => toast.error(t("network.reach.openMailFailed"))); };

  const sendDisabled = sending || body === null || !body.trim() || (offline && Boolean(proposal || !conversation || !outbox.enabled));
  // The e-mail path's 「メールアプリで開く」 sits with 「コピー」 under the body (in the top bar its width folded the title to 4 lines at 390pt).
  const headerAction = path === "orbit"
    ? <Button size="sm" variant="primary" icon="send" label={t(sending ? "network.reach.sending" : "network.reach.send")} loading={sending} disabled={sendDisabled} onPress={() => void send()} />
    : undefined;
  const bone = <View style={styles.bone} testID="contact-reach-body-loading"><Skeleton lines={4} /></View>;
  const bodyField = (label: string) => body === null ? bone
    : <TextField label={label} value={body} multiline scrollEnabled={false} textAlignVertical="top" onChangeText={(value) => { setBody(value); setError(null); }} testID="contact-reach-body" />;
  const insertChip = (label: string) => (
    <UiPressable accessibilityRole="button" accessibilityLabel={label} disabled={body === null} onPress={() => setPickerOpen(true)} style={styles.chipBtn} testID="contact-reach-insert">
      <Icon name="calendar" size={15} color={colors.ink2} /><UiText style={styles.chipText}>{label}</UiText>
    </UiPressable>
  );

  const proposalBlock = path !== "orbit" || !canPropose ? null
    : activeAppointmentId || activeUnknown ? (
      <View style={styles.field} testID="contact-reach-active">
        <UiText style={styles.lbl}>{t("network.reach.active")}</UiText>
        {activeAppointmentId ? <AppointmentProposalCard appointmentId={activeAppointmentId} peerName={name} offline={offline} onReschedule={(meeting) => setReschedule(meeting.appointmentId)} /> : null}
      </View>
    )
    : proposal ? (
      <View style={styles.prop} testID="contact-reach-proposal">
        <View style={styles.propHead}>
          <Icon name="calendar" size={15} color={colors.ink2} />
          <UiText style={styles.propTitle}>{t("calendar.card.draftHead", { minutes: proposal.durationMinutes, medium: mediumLabel(proposal.format, t) })}</UiText>
          <Button size="sm" variant="ghost" label={t("calendar.card.edit")} onPress={() => setPickerOpen(true)} />
          <Button size="sm" variant="ghost" label={t("calendar.card.remove")} onPress={() => setProposal(null)} />
        </View>
        {proposal.slots.map((slot, index) => (
          <View key={slot.startsAt} style={[styles.slot, index > 0 && styles.slotLine]}>
            <View style={styles.n}><UiText style={styles.nText}>{index + 1}</UiText></View>
            <UiText style={styles.slotText}>{slotLabel(slot, proposal.timeZone, t)}</UiText>
          </View>
        ))}
      </View>
    )
    : <View style={styles.attach}>{insertChip(t("network.reach.insert"))}</View>;

  const hint = path === "orbit" ? t(proposal ? "network.reach.hintProposal" : "network.reach.hintOrbit") : t("network.reach.hintEmail");
  return (
    <AppScreen inset="kit" title={title} backIcon="x" backAccessibilityLabel={copy.action.cancel} {...(headerAction ? { headerActions: headerAction } : {})}>
      <View style={styles.stack} testID="contact-reach" accessibilityLabel={path}>
        <View style={styles.tagRow}><Chip label={t(path === "orbit" ? "network.reach.tagOrbit" : "network.reach.tagEmail")} tone={path === "orbit" ? "lav" : "apricot"} /></View>
        {path === "email" ? (
          <>
            <View style={styles.field}>
              <UiText style={styles.lbl}>{t("network.reach.to")}</UiText>
              <View style={styles.to} testID="contact-reach-to">
                {usableEmail(email) ? <UiText style={styles.toText}>{email.trim()}<UiText style={styles.toSource}>{` · ${t("network.reach.toSource")}`}</UiText></UiText>
                  : <UiText style={styles.toSource}>{t("network.reach.toNone")}</UiText>}
              </View>
            </View>
            <TextField label={t("network.reach.subject")} value={subject} onChangeText={setSubject} testID="contact-reach-subject" />
            {bodyField(t("network.reach.emailBody"))}
            <View style={styles.attach}>{insertChip(t(insertedBlock ? "network.reach.reinsert" : "network.reach.insert"))}</View>
            <View style={styles.actions}>
              <Button icon="copy" label={copy.action.copy} disabled={body === null} onPress={copyDraft} />
              <Button variant="primary" icon="mail" label={t("network.reach.openMail")} disabled={!mailto || body === null} onPress={openMail} />
            </View>
          </>
        ) : (
          <>
            {bodyField(t("network.reach.message"))}
            {proposalBlock}
          </>
        )}
        {error ? <UiText accessibilityRole="alert" style={styles.alert} testID="contact-reach-error">{t(error)}</UiText>
          : path === "orbit" && offline && (proposal || !conversation || !outbox.enabled) ? <UiText style={styles.alert} testID="contact-reach-offline">{t(proposal ? "network.reach.offlineProposal" : "network.reach.offline")}</UiText> : null}
        <UiText style={[styles.lbl, styles.center]}>{hint}</UiText>
      </View>
      <MeetingSlotPickerSheet open={pickerOpen} minimum={path === "orbit" ? 3 : 1} requirePlace={path === "orbit"} initial={path === "orbit" ? proposal : picked}
        onClose={() => setPickerOpen(false)} onInsert={(selection) => { setPickerOpen(false); setError(null); if (path === "orbit") setProposal(selection); else insertEmailTimes(selection); }} />
      {reschedule ? <MeetingProposalSheet open appointmentId={reschedule} contactId={contactId} onClose={() => setReschedule(null)} onSent={() => setReschedule(null)} /> : null}
    </AppScreen>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  stack: { gap: 14 },
  tagRow: { flexDirection: "row" },
  field: { gap: 6 },
  lbl: { color: colors.ink3Text, fontSize: 13, fontWeight: "500" },
  center: { textAlign: "center" },
  to: { minHeight: 44, borderRadius: 14, backgroundColor: colors.surface2, justifyContent: "center", paddingHorizontal: 12 },
  toText: { color: colors.ink, fontSize: 15 },
  toSource: { color: colors.ink3Text, fontSize: 13 },
  bone: { minHeight: 180, borderRadius: 14, backgroundColor: colors.surface, padding: 12 },
  attach: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  chipBtn: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 36, paddingHorizontal: 14, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  chipText: { color: colors.ink2, fontSize: 13, fontWeight: "700" },
  prop: { borderWidth: 1, borderColor: colors.line, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: colors.surface },
  propHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  propTitle: { flex: 1, color: colors.ink, fontSize: 13, fontWeight: "800" },
  slot: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
  slotLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  n: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" },
  nText: { color: colors.bg, fontSize: 11, fontWeight: "800" },
  slotText: { flex: 1, color: colors.ink, fontSize: 13 },
  actions: { flexDirection: "row", gap: 10 },
  alert: { color: colors.coralText, fontSize: 13, lineHeight: 19 },
}));
