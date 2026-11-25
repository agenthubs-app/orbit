// 2026-11-20 参加者の詳細（App；docs/designs/redesign-2026-10/events-replay-cover-app-proposal.html ⑤ ⑥）：会場の記録 / 詳細の参加者 tab /
// 会後の「今日会った人」から同じ底部弹层。分区顺序与 Web 右栏一致：头部 → このイベントでの接点（同桌轮次 · おすすめ + 理由 ?）→
// 自己紹介 / 公开问答 → 交換を申請（结束后 30 天内，服务端 canRequestExchange）或「人脈で開く」→ メモ（自分だけ，次要，2026-11-21 用户定放在交换之后）。
// 数据：GET /api/events/[id]/attendees/[attendeeId]（按需单条读取，attendee-cache 内存缓存 5 分钟）；交换走现有
// /operations/contact-requests，メモ走 /venue/memo。加载中：头部用调用方已知的名字立刻出，下面放同形状骨架（loading-ui）。
import { useRouter, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";

import type { EventAttendeeProfile } from "../../../api/contract/event-attendee-profile";
import type { EventVenueExchangeState } from "../../../api/contract/event-venue";
import { useOrbitApiBaseUrl } from "../../../api/ApiBaseUrlProvider";
import { useOrbitAuthSession } from "../../../api/AuthSessionProvider";
import { BottomSheet, Icon, UiPressable, UiText, useToast } from "../../../components/ui";
import { createThemedStyles } from "../../../design/theme";
import { useOrbitApiClient } from "../../../hooks/useOrbitApiClient";
import { useOrbitLocale } from "../../../i18n/OrbitLocaleContext";
import { addDesignMock } from "../../add/add-design-mock";
import { patchAttendee, readAttendee, writeAttendee } from "./attendee-cache";
import { useJourneyApi } from "./journey-api";
import { tokyo } from "./journey-model";
import { Bone, Bones } from "./loading-ui";
import { useJourneyT } from "./useJourneyT";
import { Avatar, Chip, useVenueStyles, Why, WhyBody, type Tone } from "./venue-ui";

/** What the caller already knows about the person, so the header shows at once while the profile loads. */
export type AttendeeSheetPerson = { attendeeId: string; name: string; initial: string; org?: string | null; role?: string | null; tone?: Tone };
/** What changed in the sheet, so the page patches its own list instead of re-reading it. */
export type AttendeeSheetChange = { attendeeId: string; exchange?: EventVenueExchangeState; memo?: string | null };

export function AttendeeSheet({ eventId, person, onClose, onChanged }: {
  eventId: string;
  person: AttendeeSheetPerson | null;
  onClose: () => void;
  /** After an exchange request / answer or a memo save: the change, for the page to patch its list (no re-read). */
  onChanged?: (change: AttendeeSheetChange) => void;
}) {
  const { styles, colors } = useStyles();
  const vs = useVenueStyles().styles;
  const { t } = useJourneyT();
  const locale = useOrbitLocale();
  const router = useRouter();
  const toast = useToast();
  const api = useJourneyApi();
  const client = useOrbitApiClient();
  const { baseUrl } = useOrbitApiBaseUrl();
  const { cookieHeader } = useOrbitAuthSession();
  const identity = `${baseUrl}\n${cookieHeader}`;
  const noKeyboard = addDesignMock("no-keyboard");
  const [profile, setProfile] = useState<EventAttendeeProfile | null>(null);
  const [failed, setFailed] = useState<"private" | "network" | null>(null);
  const [memo, setMemo] = useState("");
  const [why, setWhy] = useState(false);
  const [busy, setBusy] = useState(false);
  const attendeeId = person?.attendeeId ?? null;

  // Cached → shown at once; fresh (< 5 min) → no request; older → shown, then re-read quietly (a failure keeps what is shown).
  useEffect(() => {
    setFailed(null); setWhy(false);
    if (!attendeeId) { setProfile(null); setMemo(""); return undefined; }
    const cached = readAttendee(identity, eventId, attendeeId);
    setProfile(cached?.data ?? null); setMemo(cached?.data.memo ?? "");
    if (cached?.fresh) return undefined;
    let live = true;
    void api.attendee(eventId, attendeeId).then((res) => {
      if (!live) return;
      if (res.ok) { writeAttendee(identity, eventId, res.data); setProfile(res.data); setMemo((current) => (cached && current !== (cached.data.memo ?? "") ? current : res.data.memo ?? "")); }
      else if (!cached) setFailed(res.reason === "network" || res.reason === "unavailable" ? "network" : "private");
    });
    return () => { live = false; };
  }, [api, eventId, attendeeId, identity]);
  const keep = (next: EventAttendeeProfile, change: Omit<AttendeeSheetChange, "attendeeId">) => {
    setProfile(next);
    patchAttendee(identity, eventId, next.attendeeId, change.memo !== undefined ? { memo: change.memo } : { contactId: next.contactId ?? null, exchange: next.exchange, requestId: next.requestId ?? null, requestRevision: next.requestRevision ?? null });
    onChanged?.({ attendeeId: next.attendeeId, ...change });
  };

  const saveMemo = async () => {
    if (!profile || (profile.memo ?? "") === memo.trim()) return;
    const res = await api.venueMemo(eventId, profile.attendeeId, memo);
    if (!res.ok) { toast.error(locale.t("eventsV2.genericError")); return; }
    keep({ ...profile, memo: memo.trim() || null }, { memo: memo.trim() || null });
    toast.success(t("memoSaved"));
  };
  const close = () => { void saveMemo(); onClose(); };
  const request = async () => {
    if (!profile || busy) return;
    setBusy(true);
    const res = await client.post<unknown>(`/api/events/${encodeURIComponent(eventId)}/operations/contact-requests`, { body: { expectedRevision: null, targetParticipantId: profile.participantId } }).catch(() => null);
    setBusy(false);
    if (!res?.success) { toast.error(locale.t("eventsV2.genericError")); return; }
    keep({ ...profile, exchange: "requested" }, { exchange: "requested" });
    toast.success(t("swapRequested"));
  };

  // A request they sent me: accept / ignore through the same /respond route as 会場モード (the server keeps the 30-day window).
  const respond = async (accept: boolean) => {
    if (!profile?.requestId || profile.requestRevision == null || busy) return;
    setBusy(true);
    const res = await client.post<unknown>(`/api/events/${encodeURIComponent(eventId)}/operations/contact-requests/${encodeURIComponent(profile.requestId)}/respond`, { body: { accept, expectedRevision: profile.requestRevision } }).catch(() => null);
    setBusy(false);
    if (!res?.success) { toast.error(locale.t("eventsV2.genericError")); return; }
    keep({ ...profile, exchange: accept ? "exchanged" : "none", requestId: null, requestRevision: null }, { exchange: accept ? "exchanged" : "none" });
    if (accept) toast.success(t("vSwappedToast", { name: profile.name }));
  };
  const shown = profile ?? (person ? { ...person } : null);
  const deadlineParts = profile?.exchangeUntil ? tokyo(profile.exchangeUntil) : null;
  const together = profile?.together;
  return (
    // 2026-11-21 手机扫描：375×667 上点メモ弹出键盘后，头部（头像 / 名字 / 关闭）随内容滚出可视区。头部改为弹层的固定头部。
    <BottomSheet visible={Boolean(person)} onClose={close} accessibilityLabel={person?.name ?? ""} header={shown ? (
      <View style={[vs.row, { gap: 12 }]} testID="events-attendee-head">
        <Avatar initial={shown.initial} tone={person?.tone ?? "lav"} size="lg" />
        <View style={vs.grow}><UiText style={styles.name}>{shown.name}</UiText><UiText style={vs.lbl}>{[shown.org, shown.role].filter(Boolean).join(" · ")}</UiText></View>
        <UiPressable accessibilityRole="button" accessibilityLabel={t("close")} onPress={close} style={vs.lbtn}><Icon name="x" size={16} color={colors.ink2} /></UiPressable>
      </View>
    ) : undefined}>
      {shown ? (
        <View testID="events-attendee-sheet">
          {!profile && !failed ? <SheetBones /> : null}
          {failed ? <UiText style={[vs.sub, { color: colors.ink3, marginTop: 14 }]} testID="events-attendee-unavailable">{t(failed === "private" ? "pNotPublic" : "pLoadFailed")}</UiText> : null}
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
                ) : profile.exchangeClosedReason ? (
                  // 开始前 / 期限已过才说明；原因未知（旧服务端、本人）不显示这一行。
                  <View style={[styles.block, styles.off]} testID="events-attendee-exchange-closed"><UiText style={[styles.blockText, { color: colors.ink3 }]}>{t(profile.exchangeClosedReason === "not_started" ? "pExchangeNotStarted" : "pExchangeClosed")}</UiText></View>
                ) : null
              ) : profile.exchange === "incoming" && profile.requestId ? (
                <View style={[vs.card, vs.flat, styles.incoming]} testID="events-attendee-incoming">
                  <View style={[vs.row, { gap: 8 }]}>
                    <View style={[vs.emoSm, { backgroundColor: colors.macLav }]}><UiText style={vs.emoSmText}>📇</UiText></View>
                    <UiText style={[vs.title13, vs.grow]}>{t("incomingTitle")}</UiText>
                  </View>
                  <View style={[vs.row, { gap: 8, marginTop: 10 }]}>
                    <UiPressable accessibilityRole="button" accessibilityLabel={t("acceptSwap")} disabled={busy} onPress={() => void respond(true)} style={[vs.btnSm, vs.primary, vs.grow]} testID="events-attendee-accept"><UiText style={[vs.btnSmText, { color: colors.bg }]}>{t("acceptSwap")}</UiText></UiPressable>
                    <UiPressable accessibilityRole="button" accessibilityLabel={t("ignoreSwap")} disabled={busy} onPress={() => void respond(false)} style={[vs.btnSm, vs.grow]}><UiText style={vs.btnSmText}>{t("ignoreSwap")}</UiText></UiPressable>
                  </View>
                  <UiText style={[vs.lbl, { marginTop: 6 }]}>{t("vIgnoreNote")}</UiText>
                </View>
              ) : <View style={{ marginTop: 14 }}><Chip label={profile.exchange === "incoming" ? t("exIncoming") : t("exRequested")} {...(profile.exchange === "incoming" ? { tone: "lav" as const } : {})} /></View>}
              <UiText style={[vs.lbl, { marginBottom: 6, marginTop: 18 }]}>{t("pMemo")}</UiText>
              <TextInput value={memo} onChangeText={setMemo} onEndEditing={() => void saveMemo()} onSubmitEditing={() => void saveMemo()} placeholder={t("vMemoPh")} placeholderTextColor={colors.ink3}
                showSoftInputOnFocus={!noKeyboard} accessibilityLabel={t("pMemo")} maxLength={200} style={styles.input} testID="events-attendee-memo" />
            </>
          ) : null}
        </View>
      ) : null}
    </BottomSheet>
  );
}

/** Loading: the sections' own shapes (接点 chips → 自己紹介 card → button → メモ input), so nothing jumps when they fill. */
function SheetBones() {
  const { styles } = useStyles();
  const vs = useVenueStyles().styles;
  return (
    <Bones testID="events-attendee-loading">
      <Bone w="32%" h={12} style={{ marginBottom: 10, marginTop: 18 }} />
      <View style={styles.chips}><Bone w={96} h={30} r={999} /><Bone w={72} h={30} r={999} /></View>
      <Bone w="88%" h={14} style={{ marginTop: 12 }} />
      <View style={[vs.card, vs.flat, styles.intro]}><Bone w="24%" h={11} /><Bone w="94%" h={14} style={{ marginTop: 8 }} /><Bone w="70%" h={14} style={{ marginTop: 7 }} /></View>
      <Bone h={44} r={999} style={{ marginTop: 14 }} />
      <Bone w="20%" h={11} style={{ marginBottom: 8, marginTop: 18 }} />
      <Bone h={44} r={14} />
    </Bones>
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
  blockText: { flexShrink: 1, fontSize: 15, fontWeight: "700", lineHeight: 22, textAlign: "center" },
  center: { marginTop: 6, textAlign: "center" },
  incoming: { marginTop: 14, padding: 14 },
}));
