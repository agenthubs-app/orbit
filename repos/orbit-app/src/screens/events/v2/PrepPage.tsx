// R27 会う準備（App；b2 #24）：倒计时卡（地図アプリで開く · チェックイン）· 名刺余量警示 · 会いたい人手风琴（なぜ / 話しかけ方 / これまで · コピー）·
// 準備リスト（5 项，PATCH 保存）· 明日のフォロー确认卡。数据：GET /api/events/[id]/prep（规则，不调 AI）。与 Web PrepPage 390（b12 360）同口径。
// 名刺の残り只存这台设备（AsyncStorage），从不发给服务端（DESIGN §2.5）。
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, Platform, StyleSheet, TextInput, View } from "react-native";

import type { EventPrepChecklistItem, EventPrepResponse } from "../../../api/contract/event-prep";
import { Icon, IconButton, UiPressable, UiText, useToast } from "../../../components/ui";
import Svg, { Circle, Path, Rect } from "../../../components/ui/svg";
import { createThemedStyles } from "../../../design/theme";
import { radius } from "../../../design/tokens";
import { useOrbitApiClient } from "../../../hooks/useOrbitApiClient";
import { useOrbitLocale } from "../../../i18n/OrbitLocaleContext";
import { addDesignMock } from "../../add/add-design-mock";
import { newIdempotencyKey } from "./events-api";
import { useJourneyApi } from "./journey-api";
import { eventRange, hm, tokyo, type JourneyT } from "./journey-model";
import { JourneyPage } from "./JourneyPage";
import { useJourneyT } from "./useJourneyT";

const CARDS_KEY = (eventId: string) => `orbit.events.cardsLeft.${eventId}`;
const CHECK_LABEL: Record<EventPrepChecklistItem["key"], string> = { cards: "clCards", intro: "clIntro", materials: "clMaterials", qr: "clQr", return: "clReturn" };
type Tone = "lav" | "teal" | "pink";
/** 头像色（b2 #24）：lav · teal · teal · pink。 */
const AV_TONES: readonly Tone[] = ["lav", "teal", "teal", "pink"];

const tokyoDay = (iso: string) => Math.floor((Date.parse(iso) + 9 * 3_600_000) / 86_400_000);
/** 「今夜 19:00」/「今日 14:00」/「明日 19:00」/「10/7 19:00」 */
export function prepWhen(startsAt: string, now: string, t: JourneyT): string {
  const diff = tokyoDay(startsAt) - tokyoDay(now);
  const p = tokyo(startsAt);
  const time = p ? `${String(p.hh).padStart(2, "0")}:${String(p.mm).padStart(2, "0")}` : "";
  if (diff === 0) return (p?.hh ?? 0) >= 17 ? t("tonightAt", { time }) : t("todayAt", { time });
  if (diff === 1) return t("tomorrowAt", { time });
  return p ? `${p.month}/${p.day} ${time}` : time;
}
/** 「3:12」（时:分），开始后 0。 */
export function countdown(startsAt: string, nowMs: number): { text: string; hours: boolean } {
  const left = Math.max(0, Date.parse(startsAt) - nowMs);
  const h = Math.floor(left / 3_600_000);
  const m = Math.floor((left % 3_600_000) / 60_000);
  return h > 0 ? { hours: true, text: `${h}:${String(m).padStart(2, "0")}` } : { hours: false, text: String(m) };
}

export function PrepPage() {
  const { styles, colors } = useStyles();
  const { t, language } = useJourneyT();
  const router = useRouter();
  const toast = useToast();
  const locale = useOrbitLocale();
  const api = useJourneyApi();
  const client = useOrbitApiClient();
  const noKeyboard = addDesignMock("no-keyboard");
  const params = useLocalSearchParams<{ id?: string }>();
  const eventId = String(params.id ?? "");
  const base = `/events/${encodeURIComponent(eventId)}`;
  const [data, setData] = useState<EventPrepResponse | null>(null);
  const [missing, setMissing] = useState(false);
  const [nowMs, setNowMs] = useState<number | null>(null);
  const [cards, setCards] = useState<number | null>(null);
  const [editingCards, setEditingCards] = useState(false);
  const [openPerson, setOpenPerson] = useState(0);
  const [followDone, setFollowDone] = useState<"added" | "skipped" | null>(null);

  useEffect(() => {
    let live = true;
    void api.prep(eventId).then((result) => {
      if (!live) return;
      if (!result.ok) { setMissing(true); return; }
      setData(result.data);
      setNowMs(Date.parse(result.data.now));
    });
    AsyncStorage.getItem(CARDS_KEY(eventId)).then((value) => { if (live && value !== null && Number.isFinite(Number(value))) setCards(Number(value)); }).catch(() => undefined);
    return () => { live = false; };
  }, [api, eventId]);
  // 倒计时从服务端时钟开始，每分钟走一格。
  const ticking = nowMs !== null;
  useEffect(() => {
    if (!ticking) return;
    const timer = setInterval(() => setNowMs((value) => (value === null ? value : value + 60_000)), 60_000);
    return () => clearInterval(timer);
  }, [ticking]);

  const toggle = async (item: EventPrepChecklistItem) => {
    if (!data) return;
    // 只翻这一项（函数式更新，连点不会用到旧的 data）；失败时把这一项翻回去。
    const flip = (done: boolean) => setData((current) => (current ? { ...current, checklist: current.checklist.map((entry) => (entry.key === item.key ? { ...entry, done } : entry)) } : current));
    flip(!item.done);
    const saved = await api.checklist(eventId, [{ ...item, done: !item.done }]);
    if (saved.ok) setData(saved.data); else { flip(item.done); toast.error(locale.t("eventsV2.genericError")); }
  };
  const copyOpener = async (text: string) => {
    try { await Clipboard.setStringAsync(text.replace(/^「|」$/g, "")); toast.success(t("copied")); } catch { toast.error(locale.t("eventsV2.genericError")); }
  };
  const saveCards = (text: string) => {
    const value = Math.max(0, Math.min(500, Number(text) || 0));
    setCards(value); setEditingCards(false);
    AsyncStorage.setItem(CARDS_KEY(eventId), String(value)).catch(() => undefined);
  };
  const addFollowup = async () => {
    const slot = data?.followupSuggestion;
    if (!slot) return;
    // 示例世界只读：不写真实日历。
    if (data?.sample) { setFollowDone("added"); toast.success(t("followAdded")); return; }
    const response = await client.post<unknown>("/api/schedule-items", { body: { endsAt: slot.endsAt, idempotencyKey: newIdempotencyKey(), startsAt: slot.startsAt, timeZone: "Asia/Tokyo", title: slot.title } }).catch(() => null);
    if (response?.success) { setFollowDone("added"); toast.success(t("followAdded")); } else toast.error(locale.t("eventsV2.genericError"));
  };

  const back = { fallback: base, leftLabel: t("back") };
  if (!data || nowMs === null) {
    return <JourneyPage title={t("prepTitle")} {...back}>{missing ? <View style={styles.card}><UiText style={styles.sub}>{t("notFound")}</UiText></View> : null}</JourneyPage>;
  }
  const until = countdown(data.startsAt, nowMs);
  const recommended = data.cardsRecommended;
  const low = cards !== null && cards < recommended;
  const done = data.checklist.filter((item) => item.done).length;
  const shortTitle = data.title.replace(/\s*(Tokyo|東京)?\s*vol\.?\s*\d+\s*$/i, "").trim() || data.title;
  const tone = (key: Tone) => ({ lav: [colors.macLav, colors.macLavInk], pink: [colors.macPink, colors.macPinkInk], teal: [colors.macTeal, colors.macTealInk] } as const)[key];
  const checkTitle = (item: EventPrepChecklistItem) => (item.key === "cards" ? t("clCards", { n: recommended }) : item.key === "materials" ? item.label || t("clMaterials") : t(CHECK_LABEL[item.key]));
  const checkSub = (item: EventPrepChecklistItem) => (item.key === "cards" ? (cards !== null ? t("clCardsLeft", { n: cards }) : null)
    : item.key === "intro" ? (data.selfIntro?.source === "registration_draft" ? t("clIntroAi") : data.selfIntro ? null : t("clIntroWrite"))
      : item.key === "materials" ? t("clMaterialsSub") : item.key === "qr" ? t("clQrSub") : t("clReturnSub", { time: hm(data.endsAt ?? data.startsAt) }));
  const follow = data.followupSuggestion;
  const followRange = follow ? t("followSlot", { date: eventRange(follow.startsAt, null, language).replace(/\d{1,2}:\d{2}$/, ""), from: hm(follow.startsAt), title: follow.title, to: hm(follow.endsAt) }) : "";

  return (
    <JourneyPage title={t("prepTitle")} subtitle={t("prepSubtitle", { title: shortTitle, when: prepWhen(data.startsAt, data.now, t) })} {...back}
      right={<IconButton icon="scan" accessibilityLabel={t("checkIn")} onPress={() => router.push(`${base}/live` as Href)} />} testID="events-prep">
      <View style={styles.card} testID="events-prep-when">
        <View style={[styles.row, { alignItems: "stretch", gap: 14 }]}>
          <View style={styles.grow}>
            <UiText style={styles.lbl}>{t("untilStart")}</UiText>
            <UiText style={styles.big}>{until.text}<UiText style={styles.bigUnit}>{` ${until.hours ? t("hoursUnit") : t("minutesUnit")}`}</UiText></UiText>
            <UiText style={[styles.lbl, { marginTop: 6 }]}>{[data.venue, data.access].filter(Boolean).join("\n")}</UiText>
          </View>
          <View style={styles.map}>
            <Svg width={128} height={96} viewBox="0 0 120 90">
              <Rect width={120} height={90} rx={14} fill={colors.surface2} />
              <Path d="M0 58 L120 38 M30 0 L48 90 M82 0 L96 90" stroke={colors.surface3} strokeWidth={7} fill="none" />
              <Path d="M0 76 Q60 70 120 18" stroke={colors.macBlueInk} strokeWidth={2.5} fill="none" opacity={0.5} />
              <Circle cx={66} cy={44} r={12} fill={colors.plum100} />
              <Circle cx={66} cy={44} r={5} fill={colors.plum700} />
            </Svg>
            {data.access ? <UiText style={styles.mapText}>{data.access.replace(/\s*出口.*$/, "")}</UiText> : null}
          </View>
        </View>
        <View style={[styles.row, { gap: 8, marginTop: 12 }]}>
          {data.mapUrl ? <UiPressable accessibilityRole="link" accessibilityLabel={t("mapOpen")} onPress={() => void Linking.openURL(data.mapUrl!)} style={[styles.btnSm, styles.grow]}><Icon name="pin" size={16} color={colors.ink} /><UiText style={styles.btnSmText}>{t("mapOpen")}</UiText></UiPressable> : null}
          <UiPressable accessibilityRole="button" accessibilityLabel={t("checkIn")} onPress={() => router.push(`${base}/live` as Href)} style={[styles.btnSm, styles.grow]}><Icon name="ticket" size={16} color={colors.ink} /><UiText style={styles.btnSmText}>{t("checkIn")}</UiText></UiPressable>
        </View>
      </View>
      {low ? (
        <UiPressable accessibilityRole="button" accessibilityLabel={t("cardsInputLabel")} onPress={() => setEditingCards(true)} style={styles.warnbar} testID="events-prep-cards">
          <View style={styles.warnEmojiBox}><UiText style={styles.warnEmoji}>📇</UiText></View>
          <UiText style={[styles.warnText, styles.grow]}>{`${t("cardsWarnA")} `}<UiText style={styles.warnB}>{t("cardsN", { n: cards ?? 0 })}</UiText>{t("cardsWarnB", { p: data.people.length })}{" "}<UiText style={styles.warnB}>{t("cardsN", { n: recommended })}</UiText>{` ${t("cardsWarnC")}`}</UiText>
        </UiPressable>
      ) : null}
      {editingCards || cards === null ? (
        <View style={[styles.card, styles.gap, styles.cardsInput]}>
          <UiText style={styles.lbl}>{t("cardsInputLabel")}</UiText>
          <TextInput keyboardType="number-pad" defaultValue={cards === null ? "" : String(cards)} autoFocus={editingCards} showSoftInputOnFocus={!noKeyboard} onSubmitEditing={(event) => saveCards(event.nativeEvent.text)} onEndEditing={(event) => { if (editingCards) saveCards(event.nativeEvent.text); }} accessibilityLabel={t("cardsInputLabel")} style={styles.cardsField} />
        </View>
      ) : null}
      <View style={[styles.card, styles.gap]} testID="events-prep-people">
        <View style={styles.cardH}><UiText style={styles.h3}>{t("meetListTitle", { n: data.people.length })}</UiText><UiText style={styles.lbl}>{t("meetListHint").split(" · ")[0]}</UiText></View>
        {data.people.map((person, index) => {
          const open = openPerson === index;
          const [bg, ink] = tone(AV_TONES[index % AV_TONES.length]!);
          return (
            <View key={person.attendeeId} style={index ? styles.accLine : null}>
              <UiPressable accessibilityRole="button" accessibilityLabel={person.name} accessibilityState={{ expanded: open }} onPress={() => setOpenPerson(open ? -1 : index)} style={styles.accH}>
                <View style={[styles.av, { backgroundColor: bg }]}><UiText style={[styles.avText, { color: ink }]}>{person.initial}</UiText></View>
                <View style={styles.grow}>
                  <UiText style={styles.accName} numberOfLines={1}>{person.name}</UiText>
                  <UiText style={styles.lbl} numberOfLines={1}>{[person.org, person.role].filter(Boolean).join(" · ")}</UiText>
                </View>
                <View style={[styles.chip, { backgroundColor: person.relation === "working" ? colors.macTeal : colors.macLav }]}><UiText style={[styles.chipText, { color: person.relation === "working" ? colors.macTealInk : colors.macLavInk }]}>{person.relation === "working" ? t("relWorking") : person.relation === "met" ? t("relMet") : t("relNone")}</UiText></View>
                <View style={open ? styles.chevOpen : null}><Icon name="down" size={16} color={colors.ink} /></View>
              </UiPressable>
              {open ? (
                <View style={styles.accIn}>
                  <View style={styles.kv}><UiText style={styles.kvKey}>{t("colWhy")}</UiText><UiText style={styles.kvVal}>{person.why}</UiText></View>
                  <View style={styles.kv}><UiText style={styles.kvKey}>{t("colOpener")}</UiText><View style={[styles.quote, styles.grow]}><UiText style={styles.quoteText}>{person.opener}</UiText></View></View>
                  <View style={styles.kv}><UiText style={styles.kvKey}>{t("colHistory")}</UiText><UiText style={styles.kvVal}>{person.history}</UiText></View>
                  <UiPressable accessibilityRole="button" accessibilityLabel={t("copy")} onPress={() => void copyOpener(person.opener)} style={[styles.btnSm, { alignSelf: "flex-start" }]}><Icon name="pen" size={16} color={colors.ink} /><UiText style={styles.btnSmText}>{t("copy")}</UiText></UiPressable>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
      <View style={[styles.card, styles.gap]} testID="events-prep-checklist">
        <View style={styles.cardH}><UiText style={styles.h3}>{t("checklistTitle")}</UiText><UiText style={styles.lbl}>{t("countOf", { done, total: data.checklist.length })}</UiText></View>
        {data.checklist.map((item, index) => {
          const sub = checkSub(item);
          return (
            <UiPressable key={item.key} accessibilityRole="checkbox" accessibilityState={{ checked: item.done }} accessibilityLabel={checkTitle(item)} onPress={() => void toggle(item)} style={[styles.chk, index ? styles.chkLine : null]}>
              <View style={[styles.box, item.done ? styles.boxDone : null]}>{item.done ? <Icon name="check" size={16} color={colors.surface} /> : null}</View>
              <View style={styles.grow}>
                <UiText style={[styles.chkTitle, item.done ? styles.chkDone : null]}>{checkTitle(item)}</UiText>
                {sub ? <UiText style={styles.lbl}>{sub}</UiText> : null}
              </View>
            </UiPressable>
          );
        })}
      </View>
      {follow && !followDone ? (
        <View style={[styles.card, styles.gap, styles.confirm]} testID="events-prep-follow">
          <View style={[styles.row, { gap: 8 }]}>
            <View style={[styles.emoSm, { backgroundColor: colors.macLav }]}><UiText style={styles.emoSmText}>🗓️</UiText></View>
            <UiText style={styles.title13}>{t("followAskShort")}</UiText>
          </View>
          <UiText style={[styles.sub, { marginBottom: 10, marginTop: 6 }]}>{followRange}</UiText>
          <View style={[styles.row, { gap: 8 }]}>
            <UiPressable accessibilityRole="button" accessibilityLabel={t("addIt")} onPress={() => void addFollowup()} style={[styles.btnSm, styles.primary]}><UiText style={[styles.btnSmText, { color: colors.bg }]}>{t("addIt")}</UiText></UiPressable>
            <UiPressable accessibilityRole="button" accessibilityLabel={t("notNow")} onPress={() => setFollowDone("skipped")} style={styles.btnSm}><UiText style={styles.btnSmText}>{t("notNow")}</UiText></UiPressable>
          </View>
        </View>
      ) : null}
    </JourneyPage>
  );
}

// .big：iOS ui-rounded 的字形在 39.9 行高里比 Chrome 高 3px，只平移字形不改行盒。
// kit（b2 #24）：.big 38 · .warnbar 11/14 r16 · .acc-h 10 0 · .acc-in 0 0 12 48 · .kv 58 | 1fr gap 8 · .quote r14 10/12 · .chk 10 0 · .box 22。
const useStyles = createThemedStyles((colors) => StyleSheet.create({
  row: { alignItems: "center", flexDirection: "row", gap: 10 },
  grow: { flex: 1, minWidth: 0 },
  gap: { marginTop: 14 },
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: 18 },
  lbl: { color: colors.ink3, fontSize: 11.5, fontWeight: "500", lineHeight: 17.25 },
  sub: { color: colors.ink2, fontSize: 12.5, lineHeight: 18.75 },
  h3: { color: colors.ink, fontSize: 14.5, fontWeight: "800", lineHeight: 21.75 },
  title13: { color: colors.ink, fontSize: 13, fontWeight: "700", lineHeight: 19.5 },
  cardH: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  big: { color: colors.ink, fontFamily: Platform.OS === "ios" ? "ui-rounded" : undefined, fontSize: 38, fontVariant: ["tabular-nums"], fontWeight: "800", letterSpacing: -0.76, lineHeight: 39.9, transform: [{ translateY: 3 }] },
  bigUnit: { color: colors.ink3, fontSize: 15, fontWeight: "700", letterSpacing: 0 },
  map: { height: 96, width: 128 },
  // svg <text x=10 y=84 font 8>，viewBox 120×90 缩放到 128×96（×16/15）：基线 89.6、字号 8.53。
  mapText: { color: colors.ink3, fontSize: 8.53, left: 10.67, lineHeight: 10, position: "absolute", top: 81.6 },
  btnSm: { alignItems: "center", backgroundColor: colors.surface2, borderRadius: radius.pill, flexDirection: "row", gap: 6, height: 32, justifyContent: "center", paddingHorizontal: 12 },
  btnSmText: { color: colors.ink, fontSize: 12, fontWeight: "700", lineHeight: 18 },
  primary: { backgroundColor: colors.ink },
  warnbar: { alignItems: "center", backgroundColor: colors.coralSoft, borderRadius: 16, flexDirection: "row", gap: 10, marginTop: 14, paddingHorizontal: 14, paddingVertical: 11 },
  // Chrome 里 18px 的 📇 占 21 宽，iOS 的彩色 emoji 占 24：固定 21 的占位，文字起点同画板。
  warnEmojiBox: { alignItems: "center", width: 21 },
  warnEmoji: { fontSize: 18, lineHeight: 24, width: 24, textAlign: "center" },
  warnText: { color: colors.ink, fontSize: 12.5, lineHeight: 18.75 },
  warnB: { color: colors.coral, fontWeight: "700" },
  cardsInput: { gap: 8 },
  cardsField: { backgroundColor: colors.surface2, borderRadius: 14, color: colors.ink, fontSize: 15, height: 44, paddingHorizontal: 14 },
  av: { alignItems: "center", borderRadius: radius.pill, height: 38, justifyContent: "center", width: 38 },
  avText: { fontSize: 13.5, fontWeight: "800", lineHeight: 17 },
  accLine: { borderTopColor: colors.line, borderTopWidth: 1 },
  accH: { alignItems: "center", flexDirection: "row", gap: 10, paddingVertical: 10 },
  accName: { color: colors.ink, fontSize: 13.5, fontWeight: "700", lineHeight: 20.25 },
  chevOpen: { transform: [{ rotate: "180deg" }] },
  chip: { alignItems: "center", backgroundColor: colors.surface2, borderRadius: radius.pill, flexDirection: "row", paddingHorizontal: 9, paddingVertical: 3 },
  chipText: { color: colors.ink2, fontSize: 11, fontWeight: "700", lineHeight: 16.5 },
  accIn: { gap: 8, paddingBottom: 12, paddingLeft: 48 },
  kv: { flexDirection: "row", gap: 8 },
  kvKey: { color: colors.ink3, fontSize: 11.5, lineHeight: 18.75, paddingTop: 1, width: 58 },
  kvVal: { color: colors.ink, flex: 1, fontSize: 12.5, lineHeight: 18.75 },
  quote: { backgroundColor: colors.surface2, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10 },
  quoteText: { color: colors.ink, fontSize: 12.5, lineHeight: 20 },
  chk: { alignItems: "flex-start", flexDirection: "row", gap: 10, paddingVertical: 10 },
  chkLine: { borderTopColor: colors.line, borderTopWidth: 1 },
  box: { alignItems: "center", borderColor: colors.ink4, borderRadius: radius.pill, borderWidth: 1.8, height: 22, justifyContent: "center", marginTop: 1, width: 22 },
  boxDone: { backgroundColor: colors.plum500, borderColor: colors.plum500 },
  chkTitle: { color: colors.ink, fontSize: 13.5, fontWeight: "700", lineHeight: 20.25 },
  chkDone: { color: colors.ink3, textDecorationLine: "line-through" },
  confirm: { backgroundColor: "transparent", borderColor: colors.plum300, borderRadius: 20, borderStyle: "dashed", borderWidth: 1.5 },
  emoSm: { alignItems: "center", borderRadius: 10, height: 32, justifyContent: "center", width: 32 },
  emoSmText: { fontSize: 17, lineHeight: 22 },
}));
