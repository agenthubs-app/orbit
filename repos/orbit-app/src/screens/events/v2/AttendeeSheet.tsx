// 2026-11-20 参加者の詳細（App；docs/designs/redesign-2026-10/events-replay-cover-app-proposal.html ⑤ ⑥）：会場の記録 / 詳細の参加者 tab /
// 会後の「今日会った人」から同じ底部弹层。分区顺序与 Web 右栏一致：头部 → このイベントでの接点（同桌轮次 · おすすめ + 理由 ?）→
// 自己紹介 / 公开问答 → メモ（自分だけ）→ 交換を申請（结束后 30 天内，服务端 canRequestExchange）或「人脈で開く」。
// 数据：GET /api/events/[id]/attendees/[attendeeId]（按需单条读取）；交换走现有 /operations/contact-requests，メモ走 /venue/memo。
import { useRouter, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";

import type { EventAttendeeProfile } from "../../../api/contract/event-attendee-profile";
import { BottomSheet, Icon, UiPressable, UiText, useToast } from "../../../components/ui";
import { createThemedStyles } from "../../../design/theme";
import { useOrbitApiClient } from "../../../hooks/useOrbitApiClient";
import { useOrbitLocale } from "../../../i18n/OrbitLocaleContext";
import { addDesignMock } from "../../add/add-design-mock";
import { useJourneyApi } from "./journey-api";
import { tokyo } from "./journey-model";
import { useJourneyT } from "./useJourneyT";
import { Avatar, Chip, useVenueStyles, Why, WhyBody, type Tone } from "./venue-ui";

/** What the caller already knows about the person, so the header shows at once while the profile loads. */
export type AttendeeSheetPerson = { attendeeId: string; name: string; initial: string; org?: string | null; role?: string | null; tone?: Tone };

export function AttendeeSheet({ eventId, person, onClose, onChanged }: {
  eventId: string;
  person: AttendeeSheetPerson | null;
  onClose: () => void;
  /** After an exchange request or a memo save, so the page can re-read its list. */
  onChanged?: () => void;
}) {
  const { styles, colors } = useStyles();
  const vs = useVenueStyles().styles;
  const { t } = useJourneyT();
  const locale = useOrbitLocale();
  const router = useRouter();
  const toast = useToast();
  const api = useJourneyApi();
  const client = useOrbitApiClient();
  const noKeyboard = addDesignMock("no-keyboard");
  const [profile, setProfile] = useState<EventAttendeeProfile | null>(null);
  const [failed, setFailed] = useState(false);
  const [memo, setMemo] = useState("");
  const [why, setWhy] = useState(false);
  const [busy, setBusy] = useState(false);
  const attendeeId = person?.attendeeId ?? null;

  useEffect(() => {
    setProfile(null); setFailed(false); setWhy(false); setMemo("");
    if (!attendeeId) return undefined;
    let live = true;
    void api.attendee(eventId, attendeeId).then((res) => {
      if (!live) return;
      if (res.ok) { setProfile(res.data); setMemo(res.data.memo ?? ""); } else setFailed(true);
    });
    return () => { live = false; };
  }, [api, eventId, attendeeId]);

  const saveMemo = async () => {
    if (!profile || (profile.memo ?? "") === memo.trim()) return;
    const res = await api.venueMemo(eventId, profile.attendeeId, memo);
    if (!res.ok) { toast.error(locale.t("eventsV2.genericError")); return; }
    setProfile({ ...profile, memo: memo.trim() || null });
    toast.success(t("memoSaved"));
    onChanged?.();
  };
  const close = () => { void saveMemo(); onClose(); };
  const request = async () => {
    if (!profile || busy) return;
    setBusy(true);
    const res = await client.post<unknown>(`/api/events/${encodeURIComponent(eventId)}/operations/contact-requests`, { body: { expectedRevision: null, targetParticipantId: profile.participantId } }).catch(() => null);
    setBusy(false);
    if (!res?.success) { toast.error(locale.t("eventsV2.genericError")); return; }
    setProfile({ ...profile, exchange: "requested" });
    toast.success(t("swapRequested"));
    onChanged?.();
  };

  const shown = profile ?? (person ? { ...person } : null);
  const deadlineParts = profile?.exchangeUntil ? tokyo(profile.exchangeUntil) : null;
  const together = profile?.together;
  return (
    <BottomSheet visible={Boolean(person)} onClose={close} accessibilityLabel={person?.name ?? ""}>
      {shown ? (
        <View testID="events-attendee-sheet">
          <View style={[vs.row, { gap: 12 }]}>
            <Avatar initial={shown.initial} tone={person?.tone ?? "lav"} size="lg" />
            <View style={vs.grow}><UiText style={styles.name}>{shown.name}</UiText><UiText style={vs.lbl}>{[shown.org, shown.role].filter(Boolean).join(" · ")}</UiText></View>
            <UiPressable accessibilityRole="button" accessibilityLabel={t("close")} onPress={close} style={vs.lbtn}><Icon name="x" size={16} color={colors.ink2} /></UiPressable>
          </View>
          {failed ? <UiText style={[vs.sub, { color: colors.ink3, marginTop: 14 }]}>{t("pLoadFailed")}</UiText> : null}
          {together && (together.sharedRounds.length || together.recommended || profile?.exchange === "exchanged") ? (
            <>
              <UiText style={styles.section}>{t("pContactPoints")}</UiText>
              <View style={styles.chips} testID="events-attendee-together">
                {together.sharedRounds.map((round) => <Chip key={`r-${round.round}`} label={t("pSameTable", { round: round.round, table: round.table })} tone="lav"><Icon name="pin" size={16} color={colors.macLavInk} /></Chip>)}
                {together.recommended ? <Chip label={t("pRecommended")} /> : null}
                {profile?.exchange === "exchanged" ? <Chip label={t("exExchanged")} tone="teal" /> : null}
              </View>
              {together.why ? (
                <View style={{ marginTop: 8 }}>
                  <View style={[vs.row, { alignItems: "flex-start", gap: 6 }]}>
                    <UiText style={[vs.sub, vs.grow, { lineHeight: 22 }]}>{together.why}</UiText>
                    {together.whyDetail ? <Why label={t("why")} open={why} onToggle={() => setWhy((value) => !value)} /> : null}
                  </View>
                  {why && together.whyDetail ? <WhyBody text={together.whyDetail} /> : null}
                </View>
              ) : null}
            </>
          ) : null}
          {profile && (profile.intro || profile.answers.length) ? (
            <View style={[vs.card, vs.flat, styles.intro]} testID="events-attendee-intro">
              {profile.intro ? <View><UiText style={vs.lbl}>{t("pIntro")}</UiText><UiText style={styles.qa}>{profile.intro}</UiText></View> : null}
              {profile.answers.map((answer, index) => (
                <View key={`${answer.q}-${index}`} style={profile.intro || index ? { marginTop: 10 } : null}><UiText style={vs.lbl}>{answer.q}</UiText><UiText style={styles.qa}>{answer.a}</UiText></View>
              ))}
            </View>
          ) : null}
          {profile ? (
            <>
              <UiText style={[vs.lbl, { marginBottom: 6, marginTop: 12 }]}>{t("pMemo")}</UiText>
              <TextInput value={memo} onChangeText={setMemo} onEndEditing={() => void saveMemo()} onSubmitEditing={() => void saveMemo()} placeholder={t("vMemoPh")} placeholderTextColor={colors.ink3}
                showSoftInputOnFocus={!noKeyboard} accessibilityLabel={t("pMemo")} maxLength={200} style={styles.input} testID="events-attendee-memo" />
              {profile.exchange === "exchanged" ? (
                profile.contactId ? (
                  <UiPressable accessibilityRole="button" accessibilityLabel={t("pOpenInNetwork")} onPress={() => { onClose(); router.push(`/contacts/${encodeURIComponent(profile.contactId!)}` as Href); }} style={[styles.block, styles.primary]} testID="events-attendee-open-contact">
                    <Icon name="users" size={16} color={colors.bg} /><UiText style={[styles.blockText, { color: colors.bg }]}>{t("pOpenInNetwork")}</UiText>
                  </UiPressable>
                ) : null
              ) : profile.exchange === "none" ? (
                profile.canRequestExchange ? (
                  <>
                    <UiPressable accessibilityRole="button" accessibilityLabel={t("requestExchange")} onPress={() => void request()} disabled={busy} style={[styles.block, styles.primary]} testID="events-attendee-request">
                      <UiText style={[styles.blockText, { color: colors.bg }]}>{t("requestExchange")}</UiText>
                    </UiPressable>
                    {deadlineParts ? <UiText style={[vs.lbl, styles.center]}>{t("pExchangeUntil", { date: `${deadlineParts.month}/${deadlineParts.day}` })}</UiText> : null}
                  </>
                ) : <View style={[styles.block, styles.off]}><UiText style={[styles.blockText, { color: colors.ink3 }]}>{t("pExchangeClosed")}</UiText></View>
              ) : <View style={{ marginTop: 14 }}><Chip label={profile.exchange === "incoming" ? t("exIncoming") : t("exRequested")} {...(profile.exchange === "incoming" ? { tone: "lav" as const } : {})} /></View>}
            </>
          ) : null}
        </View>
      ) : null}
    </BottomSheet>
  );
}

// kit（提案 ⑤）：.sheet 内 名字 17/19 · lbl 13 · chip 行 gap 6 · .card.flat 12/14 · .input 44 r14 · .btn.block 44。
const useStyles = createThemedStyles((colors) => StyleSheet.create({
  name: { color: colors.ink, fontSize: 19, fontWeight: "700", lineHeight: 29 },
  section: { color: colors.ink3, fontSize: 13, fontWeight: "500", lineHeight: 20, marginBottom: 6, marginTop: 14 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  intro: { marginTop: 12, paddingHorizontal: 14, paddingVertical: 12 },
  qa: { color: colors.ink, fontSize: 15, lineHeight: 23 },
  input: { backgroundColor: colors.surface2, borderRadius: 14, color: colors.ink, fontSize: 15, height: 44, paddingHorizontal: 14 },
  block: { alignItems: "center", borderRadius: 999, flexDirection: "row", gap: 6, height: 44, justifyContent: "center", marginTop: 14 },
  primary: { backgroundColor: colors.ink },
  off: { backgroundColor: colors.surface2 },
  blockText: { fontSize: 15, fontWeight: "700", lineHeight: 22 },
  center: { marginTop: 6, textAlign: "center" },
}));
