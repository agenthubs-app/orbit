// R27 会場モード（App）各 tab：② 現場（b2 #27）· ③ おすすめ（#28）· ④ 参加者 一覧（#29）/ ⑥ 関係マップ（#31）· ⑤ グループ（#30）· ⑦ 予定（#32），
// 以及 ① チェックイン（#26）。数据全来自 GET /api/events/[id]/venue（主办方已发布的结果 + 我的联系人，只读）。
import qrcode from "qrcode-generator";
import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, TextInput, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { Circle as SvgCircle, G, Line, Path, Text as SvgText } from "react-native-svg";

import type { EventVenuePerson, EventVenueResponse } from "../../../api/contract/event-venue";
import { SHELL_GUTTER } from "../../../components/ShellTopBar";
import { Icon, Segmented, UiPressable, UiText } from "../../../components/ui";
import Svg from "../../../components/ui/svg";
import { createThemedStyles, useOrbitTheme } from "../../../design/theme";
import { radius } from "../../../design/tokens";
import { hm, type JourneyT } from "./journey-model";
import { Avatar, AvatarStack, Chip, exchangeChip, GradientCard, surname, ThinBar, useTone, useVenueStyles, Why, WhyBody, type Tone } from "./venue-ui";

type ToneOf = (person: { attendeeId?: string; initial: string }) => Tone;
const PCARD = 300;
// kit .carousel：横滑卡吸附在页边距 18（2026-11-21 手机根因 D，同 Web scroll-padding-inline 18；之前贴屏幕左缘）。

// ---------- ① チェックイン（b2 #26） ----------
function qrPath(text: string): { size: number; path: string } {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const count = qr.getModuleCount();
  let path = "";
  for (let row = 0; row < count; row += 1) for (let col = 0; col < count; col += 1) if (qr.isDark(row, col)) path += `M${col} ${row}h1v1h-1z`;
  return { path, size: count };
}

export function CheckInView({ data, t }: { data: EventVenueResponse; t: JourneyT }) {
  const { styles, colors } = useVenueStyles();
  const v = useStyles().styles;
  const [mode, setMode] = useState<"qr" | "name">("qr");
  const check = data.checkIn;
  const qr = useMemo(() => (check?.qrPayload ? qrPath(check.qrPayload) : null), [check?.qrPayload]);
  const reception = check?.receptionNumber ? t("vReception", { n: check.receptionNumber }) : "";
  return (
    <View testID="events-venue-checkin">
      {/* No QR from the host yet: only the name card (no 扫码 tab that shows no code, no 扫不出 fallback card). */}
      {qr ? (
        <View style={{ marginBottom: 14 }}>
          <Segmented<"qr" | "name"> accessibilityLabel={t("checkIn")} value={mode} onChange={setMode} segments={[{ key: "qr", label: t("vByQr") }, { key: "name", label: t("vByName") }]} />
        </View>
      ) : null}
      <View style={[styles.card, v.qrCard]}>
        {mode === "qr" && qr ? (
          <View style={v.qrFrame}>
            {/* kit：svg 196，viewBox 留 1 模块静区；始终深色模块（扫码要对比度）。 */}
            <Svg width={196} height={196} viewBox={`-1 -1 ${qr.size + 2} ${qr.size + 2}`}><Path d={qr.path} fill={colors.ink} /></Svg>
          </View>
        ) : (
          <View style={[v.qrFrame, v.nameBox]}><UiText style={v.bigName}>{check?.displayName ?? ""}</UiText></View>
        )}
        <UiText style={v.qrTitle}>{t("vShowQr")}</UiText>
        <UiText style={[styles.lbl, { textAlign: "center" }]}>{reception}</UiText>
      </View>
      {qr ? <View style={[styles.card, styles.flat, styles.gap]}>
        <View style={styles.row}>
          <View style={[styles.emoSm, { backgroundColor: colors.macApricot }]}><UiText style={styles.emoSmText}>🙋</UiText></View>
          <View style={styles.grow}><UiText style={styles.title13}>{t("vQrFail")}</UiText><UiText style={styles.lbl}>{t("vSayName", { name: check?.displayName ?? "" })}</UiText></View>
        </View>
      </View> : null}
      <View style={[styles.card, styles.gap]}>
        <UiText style={[styles.lbl, { marginBottom: 10 }]}>{t("vAfterCheckin")}</UiText>
        <View style={v.grid3}>
          {([["🪑", "vSeatRound", colors.macLav], ["✨", "vRecPeople", colors.macPink], ["📇", "vCardSwap", colors.macTeal]] as const).map(([emoji, key, bg]) => (
            <View key={key} style={v.grid3Cell}><View style={[styles.emo, { backgroundColor: bg, marginBottom: 6 }]}><UiText style={styles.emoText}>{emoji}</UiText></View><UiText style={v.grid3Text}>{t(key)}</UiText></View>
          ))}
        </View>
      </View>
    </View>
  );
}

// ---------- ② 現場（b2 #27） ----------
export function NowTab({ data, t, toneOf, onRecap, onMoreOpeners }: { data: EventVenueResponse; t: JourneyT; toneOf: ToneOf; onRecap: () => void; onMoreOpeners: () => void }) {
  const { styles, colors } = useVenueStyles();
  const v = useStyles().styles;
  const [why, setWhy] = useState(false);
  const round = data.round;
  const seat = data.mySeat;
  const nowMs = Date.parse(data.now);
  const share = round ? (nowMs - Date.parse(round.startsAt)) / Math.max(1, Date.parse(round.endsAt) - Date.parse(round.startsAt)) : 0;
  const mates = seat?.tablemates ?? [];
  const mateLine = mates.length > 2 ? t("vMatesMore", { n: mates.length - 2, names: mates.slice(0, 2).map((mate) => t("honorific", { name: surname(mate.name) })).join(" · ") }) : mates.map((mate) => t("honorific", { name: surname(mate.name) })).join(" · ");
  return (
    <View testID="events-venue-now">
      {round ? (
        <View style={styles.card}>
          <View style={[styles.row, styles.between]}><UiText style={styles.lbl}>{t("nowLbl")}</UiText><Chip label={t("remainingMin", { m: round.remainingMinutes })} /></View>
          <UiText style={v.roundTitle}>{t("vRoundTitle", { n: round.index, title: round.title })}</UiText>
          <UiText style={styles.lbl}>{[`${hm(round.startsAt)}–${hm(round.endsAt)}`, round.theme ? t("themeLine", { theme: round.theme }) : null].filter(Boolean).join(" · ")}</UiText>
          <ThinBar share={share} />
        </View>
      ) : null}
      {seat ? (
        <GradientCard from={colors.macLav} style={styles.gap}>
          <View style={[styles.row, styles.between]}>
            <View><UiText style={styles.lbl}>{t("vSeatMine")}</UiText><UiText style={[styles.big, v.seat46]}>{seat.table}</UiText></View>
            <View style={v.rdots}>
              {(data.seats ?? []).map((item) => {
                const done = round ? item.round < round.index : false;
                const now = round ? item.round === round.index : false;
                return (
                  <View key={item.round} style={[v.rdot, now ? v.rdotNow : null, done ? { opacity: 0.7 } : null]}>
                    <UiText style={[v.rdotTable, now ? { color: colors.bg } : null]}>{item.table}</UiText>
                    <UiText style={[v.rdotRound, now ? { color: colors.bg } : null]}>{`R${item.round}`}</UiText>
                  </View>
                );
              })}
            </View>
          </View>
          {seat.why ? (
            <View style={[styles.row, { gap: 6, marginTop: 10 }]}>
              <UiText style={[styles.sub, styles.grow]}>{t("seatWhy", { why: seat.why })}</UiText>
              {seat.whyDetail ? <Why label={t("why")} open={why} onToggle={() => setWhy((value) => !value)} /> : null}
            </View>
          ) : null}
          {why && seat.whyDetail ? <WhyBody text={seat.whyDetail} /> : null}
          {mates.length ? <View style={[styles.row, { marginTop: 12 }]}><AvatarStack people={mates} toneOf={toneOf} /><UiText style={styles.lbl}>{mateLine}</UiText></View> : null}
        </GradientCard>
      ) : null}
      {data.openers.length ? (
        <View style={[styles.card, styles.gap]}>
          <View style={styles.cardH}><UiText style={styles.h3}>{t("openersTitle")}</UiText><UiPressable accessibilityRole="button" accessibilityLabel={t("openersMore")} onPress={onMoreOpeners} style={styles.lbtn}><Icon name="refresh" size={16} color={colors.ink2} /></UiPressable></View>
          {data.openers.map((opener, index) => (
            <View key={opener} style={[v.ice, index ? v.iceLine : null]}><View style={v.iceEmoji}><UiText style={v.iceText}>💬</UiText></View><UiText style={[v.iceText, styles.grow]}>{`「${opener}」`}</UiText></View>
          ))}
        </View>
      ) : null}
      <View style={[v.grid2, styles.gap]}>
        <View style={[styles.card, v.grid2Cell]}><UiText style={styles.lbl}>{t("statExchanged")}</UiText><UiText style={styles.mid}>{data.stats.exchanged}<UiText style={styles.lbl}>{` ${t("vPersonsUnit")}`}</UiText></UiText></View>
        <View style={[styles.card, v.grid2Cell]}><UiText style={styles.lbl}>{t("vStatWanted")}</UiText><UiText style={styles.mid}>{data.stats.wantedMet}<UiText style={styles.lbl}>{` / ${data.stats.wantedTotal}`}</UiText></UiText></View>
      </View>
      {data.nextRound ? (
        <View style={[styles.card, styles.flat]}>
          <View style={styles.row}>
            <View style={[styles.emoSm, { backgroundColor: colors.macTeal }]}><UiText style={styles.emoSmText}>➡️</UiText></View>
            <View style={styles.grow}><UiText style={styles.title13}>{t("vNextRound", { at: /^\d/.test(data.nextRound.at) && data.nextRound.at.length <= 5 ? data.nextRound.at : hm(data.nextRound.at), n: data.nextRound.round, table: data.nextRound.table })}</UiText><UiText style={styles.lbl}>{data.nextRound.names}</UiText></View>
          </View>
        </View>
      ) : null}
      <UiPressable accessibilityRole="button" accessibilityLabel={t("toAfter")} onPress={onRecap} style={[styles.card, styles.flat, styles.gap]}>
        <View style={styles.row}>
          <View style={[styles.emoSm, { backgroundColor: colors.macLav }]}><UiText style={styles.emoSmText}>📝</UiText></View>
          <View style={styles.grow}><UiText style={styles.title13}>{t("vRecapRow", { time: hm(data.endsAt ?? data.startsAt) })}</UiText><UiText style={styles.lbl}>{t("vRecapRowSub")}</UiText></View>
          <Icon name="right" size={16} color={colors.ink3} />
        </View>
      </UiPressable>
    </View>
  );
}

// ---------- ③ おすすめ（b2 #28） ----------
/** 「R3 で近くの卓」：下一轮我的桌和对方的桌字母相邻（同桌不算「近く」）。 */
function nearNext(person: EventVenuePerson, data: EventVenueResponse): number | null {
  const next = data.nextRound;
  if (!next || !person.table) return null;
  const a = next.table.charCodeAt(0);
  const b = person.table.charCodeAt(0);
  return Math.abs(a - b) === 1 ? next.round : null;
}

export function RecsTab({ data, t, toneOf, onRequest, onDismiss, onOpen, readOnly = false }: { data: EventVenueResponse; t: JourneyT; toneOf: ToneOf; onRequest: (person: EventVenuePerson) => void; onDismiss: (person: EventVenuePerson) => void; onOpen: (person: EventVenuePerson) => void; readOnly?: boolean }) {
  const { styles, colors } = useVenueStyles();
  const v = useStyles().styles;
  const [page, setPage] = useState(0);
  const [why, setWhy] = useState<string | null>(null);
  const recs = data.recommendations;
  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => setPage(Math.max(0, Math.min(recs.length - 1, Math.round(event.nativeEvent.contentOffset.x / (PCARD + 12)))));
  return (
    <View testID="events-venue-recs">
      <View style={styles.cardH}><UiText style={styles.h3}>{t("recsTitle")}</UiText><UiText style={styles.lbl}>{t("vRecsHint", { n: Math.max(recs.length, data.recommendations.length) })}</UiText></View>
      {recs.length ? null : <View style={styles.card}><UiText style={[styles.sub, { color: colors.ink3 }]}>{t("vRecsEmpty")}</UiText></View>}
      {recs.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToOffsets={recs.map((_, index) => index * (PCARD + 12))} decelerationRate="fast" onScroll={onScroll} scrollEventThrottle={32} style={v.carousel} contentContainerStyle={v.carouselInner}>
        {recs.map((person) => {
          const near = nearNext(person, data);
          return (
            <View key={person.attendeeId} style={v.pcard}>
              <UiPressable accessibilityRole="button" accessibilityLabel={person.name} onPress={() => onOpen(person)} style={[styles.row, { gap: 12 }]}>
                <Avatar initial={person.initial} tone={toneOf(person)} size="lg" />
                <View style={styles.grow}><UiText style={v.name16}>{person.name}</UiText><UiText style={styles.lbl} numberOfLines={1}>{[person.org, person.role].filter(Boolean).join(" · ")}</UiText></View>
              </UiPressable>
              <View style={[styles.row, { gap: 6 }]}>
                {person.table ? <Chip label={t("tableChip", { t: person.table })} tone="lav"><Icon name="pin" size={16} color={colors.macLavInk} /></Chip> : null}
                {near && !readOnly ? <Chip label={t("vNearNext", { n: near })} tone="teal" /> : null}
                {readOnly && person.exchange === "exchanged" ? <Chip label={t("exExchanged")} tone="teal" /> : null}
              </View>
              {person.why ? (
                <View>
                  <View style={[styles.row, { alignItems: "flex-start", gap: 6 }]}>
                    <UiText style={[styles.sub, styles.grow, { lineHeight: 20 }]}>{person.why}</UiText>
                    {person.whyDetail ? <Why label={t("why")} open={why === person.attendeeId} onToggle={() => setWhy((value) => (value === person.attendeeId ? null : person.attendeeId))} /> : null}
                  </View>
                  {why === person.attendeeId && person.whyDetail ? <WhyBody text={person.whyDetail} /> : null}
                </View>
              ) : null}
              {readOnly ? null : <View style={[styles.row, { gap: 8, marginTop: "auto" }]}>
                {person.exchange === "none" ? <UiPressable accessibilityRole="button" accessibilityLabel={t("requestExchange")} onPress={() => onRequest(person)} style={[styles.btnSm, styles.primary, styles.grow]}><UiText style={[styles.btnSmText, { color: colors.bg }]}>{t("requestExchange")}</UiText></UiPressable>
                  : <View style={styles.grow}>{exchangeChip(person, t)}</View>}
                <UiPressable accessibilityRole="button" accessibilityLabel={t("vDismissRec")} onPress={() => onDismiss(person)} style={styles.lbtn}><Icon name="x" size={16} color={colors.ink2} /></UiPressable>
              </View>}
            </View>
          );
        })}
      </ScrollView> : null}
      {recs.length > 1 ? <View style={v.dots}>{recs.map((person, index) => <View key={person.attendeeId} style={[v.dot, index === page ? v.dotOn : null]} />)}</View> : null}
      {data.nextOrder.length ? (
        <View style={[styles.card, v.orderCard]}>
          <View style={[styles.cardH, { marginBottom: 0, marginTop: 8 }]}><UiText style={styles.h3}>{t(readOnly ? "vNextOrderPast" : "vNextOrder")}</UiText></View>
          {data.nextOrder.map((person, index) => (
            <UiPressable key={person.attendeeId} accessibilityRole="button" accessibilityLabel={person.name} onPress={() => onOpen(person)} style={styles.li}>
              {index ? <View style={styles.liLine} /> : null}
              <UiText style={v.orderNum}>{index + 1}</UiText>
              <Avatar initial={person.initial} tone={toneOf(person)} size="sm" />
              <View style={styles.grow}><UiText style={styles.metaTitle} numberOfLines={1}>{person.name}</UiText><UiText style={styles.metaSub} numberOfLines={1}>{[person.org, person.table ? t("tableChip", { t: person.table }) : null].filter(Boolean).join(" · ")}</UiText></View>
              {person.exchange === "incoming" ? exchangeChip(person, t) : null}
            </UiPressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

// ---------- ④ 参加者 一覧（b2 #29）/ ⑥ 関係マップ（#31） ----------
type PeopleFilter = "all" | "wanted" | "exchanged" | "requests" | "table" | "recs";
/** 会場の記録：同桌过的人（各轮去重）。 */
export function tablemateIds(data: EventVenueResponse): ReadonlySet<string> {
  return new Set((data.rounds ?? []).flatMap((round) => round.tablemates.map((mate) => mate.attendeeId)));
}
export function PeopleTab({ data, t, toneOf, view, onView, onOpen, readOnly = false }: { data: EventVenueResponse; t: JourneyT; toneOf: ToneOf; view: "list" | "map"; onView: (view: "list" | "map") => void; onOpen: (person: EventVenuePerson) => void; readOnly?: boolean }) {
  const { styles, colors } = useVenueStyles();
  const v = useStyles().styles;
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<PeopleFilter>("all");
  const counts = {
    all: data.attendeeTotal,
    // 交換済み / 会いたい 的总数来自服务端 stats（名单只有公开的一部分）。
    exchanged: data.stats.exchanged,
    requests: data.attendees.filter((person) => person.exchange === "incoming" || person.exchange === "requested").length,
    wanted: data.stats.wantedTotal,
  };
  const mates = tablemateIds(data);
  const recIds = new Set(data.recommendations.map((person) => person.attendeeId));
  const needle = q.trim().toLowerCase();
  const shown = data.attendees.filter((person) => (filter === "wanted" ? person.wanted : filter === "exchanged" ? person.exchange === "exchanged" : filter === "requests" ? person.exchange === "incoming" || person.exchange === "requested"
    : filter === "table" ? mates.has(person.attendeeId) : filter === "recs" ? recIds.has(person.attendeeId) : true)
    && (!needle || [person.name, person.org, person.role, person.why].some((value) => value?.toLowerCase().includes(needle))));
  return (
    <View testID="events-venue-people">
      {readOnly ? null : <View style={{ marginBottom: view === "map" ? 12 : 10 }}>
        <Segmented<"list" | "map"> accessibilityLabel={t("tabPeople")} value={view} onChange={onView} segments={[{ key: "list", label: t("vList") }, { key: "map", label: t("mapTitle") }]} />
      </View>}
      {view === "list" || readOnly ? (
        <>
          <View style={v.search}><Icon name="search" size={16} color={colors.ink3} /><TextInput value={q} onChangeText={setQ} placeholder={t("vSearchPh")} placeholderTextColor={colors.ink3} accessibilityLabel={t("vSearchPh")} style={v.searchInput} /></View>
          <View style={v.filters}>
            {(readOnly
              ? [["all", t("vAllN", { n: counts.all })], ["table", t("vSameTableN", { n: mates.size })], ["recs", `${t("segRecs")} ${recIds.size}`], ["exchanged", t("vExchangedN", { n: counts.exchanged })]] as const
              : [["all", t("vAllN", { n: counts.all })], ["wanted", t("vWantedN", { n: counts.wanted })], ["exchanged", t("vExchangedN", { n: counts.exchanged })], ["requests", t("vRequestsN", { n: counts.requests })]] as const).map(([key, label]) => (
              <UiPressable key={key} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: filter === key }} onPress={() => setFilter(key)}><Chip label={label} {...(filter === key ? { tone: "lav" as const } : {})} /></UiPressable>
            ))}
          </View>
          <View style={[styles.card, v.listCard]}>
            {shown.length ? null : <UiText style={[styles.sub, { color: colors.ink3, paddingVertical: 12 }]}>{t("noPeopleHere")}</UiText>}
            {shown.map((person, index) => (
              <UiPressable key={person.attendeeId} accessibilityRole="button" accessibilityLabel={person.name} onPress={() => onOpen(person)} style={styles.li} testID={`events-venue-person-${person.attendeeId}`}>
                {index ? <View style={styles.liLine} /> : null}
                <Avatar initial={person.initial} tone={toneOf(person)} />
                <View style={styles.grow}><UiText style={styles.metaTitle} numberOfLines={1}>{person.name}</UiText><UiText style={styles.metaSub} numberOfLines={1}>{[person.org, person.role].filter(Boolean).join(" · ")}</UiText></View>
                {person.exchange !== "none" ? <View style={v.peopleStatus}>{exchangeChip(person, t)}</View> : null}
                {readOnly ? <Icon name="right" size={16} color={colors.ink4} /> : null}
              </UiPressable>
            ))}
          </View>
        </>
      ) : (
        <>
          <View style={[styles.card, v.mapCard]}><RelationMap data={data} t={t} /></View>
          <View style={[styles.card, styles.gap, v.legendCard]}>
            <View style={v.legend}>
              {([[colors.plum700, false, t("exExchanged")], [colors.plum500, false, t("legendKnown")], [colors.plum300, true, t("legendWanted")], [colors.surface3, false, t("legendOther")]] as const).map(([stroke, dashed, label]) => (
                <View key={label} style={[styles.row, { gap: 5 }]}><Svg width={22} height={6}><Line x1={0} y1={3} x2={22} y2={3} stroke={stroke} strokeWidth={2.2} {...(dashed ? { strokeDasharray: "4 4" } : {})} /></Svg><UiText style={v.legendText}>{label}</UiText></View>
              ))}
            </View>
            <UiText style={[styles.lbl, { marginTop: 8 }]}>{t("vMapHint")}</UiText>
          </View>
          {data.mutualHint ? (
            <View style={[styles.card, styles.flat, styles.gap]}>
              <View style={styles.row}>
                <View style={[styles.emoSm, { backgroundColor: colors.macLav }]}><UiText style={styles.emoSmText}>🔗</UiText></View>
                <View style={styles.grow}><UiText style={styles.title13}>{t("vMutualTitle", { name: data.mutualHint.name, via: data.mutualHint.via })}</UiText><UiText style={styles.lbl}>{t("vMutualSub")}</UiText></View>
              </View>
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

// 関係マップ（同 Web RelationMap：固定 8 个位置按关系落位；连线 = 我 → 对方 + 同桌的已交换 + 共通の知り合い）。
const SLOTS: Readonly<Record<EventVenuePerson["relation"], readonly (readonly [number, number])[]>> = {
  exchanged: [[276, 78], [292, 196]],
  known: [[44, 150], [180, 46]],
  other: [[168, 296], [290, 296]],
  wanted: [[78, 82], [66, 236]],
};
const CENTER = [177, 170] as const;

export function RelationMap({ data, t, width = 338 }: { data: EventVenueResponse; t: JourneyT; width?: number }) {
  const { colors } = useOrbitTheme();
  const line: Record<EventVenuePerson["relation"], { stroke: string; width: number; dash?: string }> = {
    exchanged: { stroke: colors.plum700, width: 2.2 },
    known: { stroke: colors.plum500, width: 1.5 },
    other: { stroke: colors.surface3, width: 1.2 },
    wanted: { dash: "4 4", stroke: colors.plum300, width: 1.6 },
  };
  const used: Record<string, number> = {};
  const nodes = data.attendees.flatMap((person) => {
    const slot = SLOTS[person.relation][used[person.relation] ?? 0];
    if (!slot) return [];
    used[person.relation] = (used[person.relation] ?? 0) + 1;
    return [{ person, x: slot[0], y: slot[1] }];
  });
  const at = (name: string) => nodes.find((node) => surname(node.person.name) === name);
  const mutual = data.mutualHint ? [at(data.mutualHint.via), at(data.mutualHint.name)] : [];
  const tables = nodes.flatMap((a, i) => nodes.slice(i + 1).filter((b) => a.person.table && a.person.table === b.person.table && a.person.relation === "exchanged" && b.person.relation === "exchanged").map((b) => [a, b] as const));
  return (
    <Svg width={width} height={width * (340 / 354)} viewBox="0 0 354 340" accessibilityLabel={t("mapTitle")}>
      {tables.map(([a, b]) => <Line key={`${a.person.attendeeId}-${b.person.attendeeId}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={colors.surface3} strokeWidth={1.2} />)}
      {mutual[0] && mutual[1] ? <Line x1={mutual[0].x} y1={mutual[0].y} x2={mutual[1].x} y2={mutual[1].y} stroke={colors.plum300} strokeWidth={1.2} /> : null}
      {nodes.map(({ person, x, y }) => { const style = line[person.relation]; return <Line key={`l-${person.attendeeId}`} x1={CENTER[0]} y1={CENTER[1]} x2={x} y2={y} stroke={style.stroke} strokeWidth={style.width} {...(style.dash ? { strokeDasharray: style.dash } : {})} />; })}
      {nodes.map(({ person, x, y }) => {
        const r = person.relation === "other" ? 15 : 19;
        const fill = person.relation === "exchanged" ? colors.plum700 : person.relation === "known" ? colors.plum300 : person.relation === "wanted" ? colors.plum100 : colors.surface3;
        const ink = person.relation === "exchanged" ? colors.onAccent : person.relation === "known" ? colors.plum900 : person.relation === "wanted" ? colors.ink : colors.ink3;
        return (
          <G key={`n-${person.attendeeId}`}>
            <SvgCircle cx={x} cy={y} r={r} fill={fill} {...(person.relation === "wanted" ? { stroke: colors.plum500, strokeDasharray: "3 3", strokeWidth: 1.5 } : {})} />
            <SvgText x={x} y={y + 4} textAnchor="middle" fontSize={11} fontWeight="800" fill={ink}>{person.initial}</SvgText>
            <SvgText x={x} y={y + 31} textAnchor="middle" fontSize={10} fill={colors.ink3}>{surname(person.name)}</SvgText>
          </G>
        );
      })}
      <SvgCircle cx={CENTER[0]} cy={CENTER[1]} r={27} fill={colors.ink} />
      <SvgText x={CENTER[0]} y={CENTER[1] + 4.3} textAnchor="middle" fontSize={12} fontWeight="800" fill={colors.bg}>{t("mapYou")}</SvgText>
    </Svg>
  );
}

// ---------- ⑤ グループ（b2 #30） ----------
const TABLE_TONES: readonly Tone[] = ["apricot", "blue", "teal", "pink"];
/** 会場の記録 · グループ：每一轮一行（轮次 · 桌号大字 · 主题 · 为什么这桌 ? · 同桌名单，名字可点）。 */
export function RoundsTab({ data, t, toneOf, onOpen }: { data: EventVenueResponse; t: JourneyT; toneOf: ToneOf; onOpen: (mate: { attendeeId: string; name: string; initial: string; org?: string | null; role?: string | null }) => void }) {
  const { styles, colors } = useVenueStyles();
  const v = useStyles().styles;
  const [why, setWhy] = useState<number | null>(null);
  const rounds = data.rounds ?? [];
  // ほかのテーブル（Web 同款）：按轮切换，点一桌展开成员（名字也打开参加者の詳細）。
  const others = (data.roundTables ?? []).filter((entry) => entry.tables.length > 0);
  const [otherRound, setOtherRound] = useState<number | null>(null);
  const [openTable, setOpenTable] = useState<string | null>(null);
  const shownRound = others.find((entry) => entry.round === otherRound) ?? others[0] ?? null;
  const tone = useTone();
  const exchanged = new Set(data.attendees.filter((person) => person.exchange === "exchanged").map((person) => person.attendeeId));
  return (
    <View testID="events-venue-rounds">
      <View style={[styles.card, v.roundsCard]}>
        <View style={[styles.cardH, { marginBottom: 0, marginTop: 10 }]}><UiText style={styles.h3}>{t("vMyTables")}</UiText><UiText style={styles.lbl}>{t("vRoundsN", { n: rounds.length })}</UiText></View>
        {rounds.map((round, index) => {
          const reason = round.whyDetail ?? round.why;
          return (
            <View key={round.round} style={[v.round, index ? v.roundLine : null]} testID={`events-venue-round-${round.round}`}>
              <View style={[styles.row, { gap: 12 }]}>
                <View style={v.roundLeft}><UiText style={styles.lbl}>{t("vRoundShort", { n: round.round })}</UiText><UiText style={[styles.big, v.roundTable]}>{round.table}</UiText></View>
                <View style={styles.grow}>
                  <UiText style={styles.title13} numberOfLines={2}>{round.theme ? t("themeLine", { theme: round.theme }) : round.title ?? round.table}</UiText>
                  <UiText style={styles.lbl}>{t("vSameTableCount", { n: round.tablemates.length })}</UiText>
                </View>
                {reason ? <Why label={t("why")} open={why === round.round} onToggle={() => setWhy((value) => (value === round.round ? null : round.round))} /> : null}
              </View>
              {why === round.round && reason ? <WhyBody text={reason} /> : null}
              <View style={{ marginTop: 6 }}>
                {round.tablemates.map((mate) => (
                  <UiPressable key={mate.attendeeId} accessibilityRole="button" accessibilityLabel={mate.name} onPress={() => onOpen(mate)} style={[styles.li, v.mateRow]}>
                    <Avatar initial={mate.initial} tone={toneOf(mate)} size="sm" />
                    <View style={styles.grow}><UiText style={styles.title13} numberOfLines={1}>{mate.name}</UiText>{mate.org || mate.role ? <UiText style={styles.metaSub} numberOfLines={1}>{[mate.org, mate.role].filter(Boolean).join(" · ")}</UiText> : null}</View>
                    {exchanged.has(mate.attendeeId) ? <Chip label={t("exExchanged")} tone="teal" /> : null}
                    <Icon name="right" size={16} color={colors.ink4} />
                  </UiPressable>
                ))}
              </View>
            </View>
          );
        })}
      </View>
      {shownRound ? (
        <View style={[styles.card, styles.gap]} testID="events-venue-other-tables">
          <View style={styles.cardH}><UiText style={styles.h3}>{t("vOtherTables")}</UiText><UiText style={styles.lbl}>{t("vRoundShort", { n: shownRound.round })}</UiText></View>
          {shownRound.tables.map((table, index) => {
            const key = `${shownRound.round}:${table.table}`;
            const open = openTable === key;
            return (
              <View key={key}>
                <UiPressable accessibilityRole="button" accessibilityLabel={table.theme ?? table.table} accessibilityState={{ expanded: open }} onPress={() => setOpenTable(open ? null : key)} style={v.groupRow} testID={`events-venue-other-table-${table.table}`}>
                  <View style={[styles.emoSm, { backgroundColor: tone(TABLE_TONES[index % TABLE_TONES.length]!)[0] }]}><UiText style={v.groupLetter}>{table.table.charAt(0)}</UiText></View>
                  <View style={styles.grow}><UiText style={styles.title13}>{table.theme ?? table.table}</UiText><UiText style={styles.lbl}>{[table.table.length > 1 ? table.table : null, t("vNPeople", { n: table.members.length })].filter(Boolean).join(" · ")}</UiText></View>
                  {open ? null : <AvatarStack people={table.members.slice(0, 3)} toneOf={toneOf} />}
                  <Icon name={open ? "up" : "down"} size={16} color={colors.ink3} />
                </UiPressable>
                {open ? table.members.map((member) => (
                  <UiPressable key={member.attendeeId} accessibilityRole="button" accessibilityLabel={member.name} onPress={() => onOpen(member)} style={[styles.li, v.mateRow, v.otherMember]}>
                    <Avatar initial={member.initial} tone={toneOf(member)} size="sm" />
                    <View style={styles.grow}><UiText style={styles.title13} numberOfLines={1}>{member.name}</UiText>{member.org || member.role ? <UiText style={styles.metaSub} numberOfLines={1}>{[member.org, member.role].filter(Boolean).join(" · ")}</UiText> : null}</View>
                    <Icon name="right" size={16} color={colors.ink4} />
                  </UiPressable>
                )) : null}
              </View>
            );
          })}
          {others.length > 1 ? (
            <View style={{ marginTop: 10 }}>
              <Segmented<string> accessibilityLabel={t("vOtherTables")} value={String(shownRound.round)} onChange={(value) => { setOtherRound(Number(value)); setOpenTable(null); }}
                segments={others.map((entry) => ({ key: String(entry.round), label: t("vRoundShort", { n: entry.round }) }))} />
            </View>
          ) : null}
        </View>
      ) : null}
      <UiText style={[styles.lbl, { marginTop: 14, textAlign: "center" }]}>{t("vSeatsByOrganizer")}</UiText>
    </View>
  );
}

export function GroupsTab({ data, t, toneOf }: { data: EventVenueResponse; t: JourneyT; toneOf: ToneOf }) {
  const { styles, colors } = useVenueStyles();
  const v = useStyles().styles;
  const tone = useTone();
  const seat = data.mySeat;
  const groups = data.groups;
  const members = [...(data.me ? [{ ...data.me, attendeeId: "__me", me: true }] : []), ...(seat?.tablemates ?? []).map((mate) => ({ ...mate, me: false }))];
  return (
    <View testID="events-venue-groups">
      {seat ? (
        <GradientCard from={colors.macLav}>
          <View style={[styles.row, styles.between]}><UiText style={styles.lbl}>{t("vMyTable", { n: groups?.round ?? data.round?.index ?? 1 })}</UiText><Chip label={t("vNPeople", { n: members.length })} tone="lav" /></View>
          <UiText style={[styles.big, v.seat34]}>{seat.table}</UiText>
          {groups?.myTheme ? <UiText style={styles.sub}>{t("themeLine", { theme: groups.myTheme })}</UiText> : null}
          <View style={{ marginTop: 8 }}>
            {members.map((member, index) => (
              <View key={member.attendeeId} style={styles.li}>
                {index ? <View style={styles.liLine} /> : null}
                <Avatar initial={member.initial} tone={member.me ? "lav" : toneOf(member)} size="sm" />
                <View style={styles.grow}><UiText style={styles.title13} numberOfLines={1}>{member.me ? t("vYou", { name: member.name }) : member.name}</UiText><UiText style={styles.metaSub} numberOfLines={1}>{[member.org, member.role].filter(Boolean).join(" · ")}</UiText></View>
              </View>
            ))}
          </View>
        </GradientCard>
      ) : null}
      {groups?.others.length ? (
        <View style={[styles.card, styles.gap]}>
          <View style={styles.cardH}><UiText style={styles.h3}>{t("vOtherTables")}</UiText><UiText style={styles.lbl}>{t("vRoundN", { n: groups.round })}</UiText></View>
          {groups.others.map((group, index) => (
            <View key={group.table} style={v.groupRow}>
              <View style={[styles.emoSm, { backgroundColor: tone(TABLE_TONES[index % TABLE_TONES.length]!)[0] }]}><UiText style={v.groupLetter}>{group.table}</UiText></View>
              <View style={styles.grow}><UiText style={styles.title13}>{group.theme ?? group.table}</UiText><UiText style={styles.lbl}>{t("vNPeople", { n: group.count })}</UiText></View>
              <AvatarStack people={group.initials.map((initial) => ({ initial }))} toneOf={toneOf} />
            </View>
          ))}
        </View>
      ) : null}
      <UiText style={[styles.lbl, { marginTop: 14, textAlign: "center" }]}>{t("vSeatsByOrganizer")}</UiText>
    </View>
  );
}

// ---------- ⑦ 予定（b2 #32） ----------
export function AgendaTab({ data, t }: { data: EventVenueResponse; t: JourneyT }) {
  const { styles, colors } = useVenueStyles();
  const v = useStyles().styles;
  const [why, setWhy] = useState(false);
  const nowIndex = data.agenda.findIndex((item) => item.now);
  return (
    <View testID="events-venue-agenda">
      <View style={styles.card}>
        {data.agenda.length ? null : <UiText style={[styles.sub, { color: colors.ink3 }]}>{t("noAgenda")}</UiText>}
        {data.agenda.map((item, index) => {
          const done = nowIndex >= 0 && index < nowIndex;
          const now = index === nowIndex;
          const last = index === data.agenda.length - 1;
          return (
            <View key={`${item.at}-${item.title}`} style={[v.tline, index ? { marginTop: 14 } : null]}>
              <UiText style={v.tlineTime}>{item.at}</UiText>
              <View style={v.tlineDotCol}>
                {now ? <View style={v.tlineRing} /> : null}
                <View style={[v.tlineDot, done ? { backgroundColor: colors.plum300 } : now ? { backgroundColor: colors.coral } : null]} />
                {last ? null : <View style={v.tlineRail} />}
              </View>
              <View style={styles.grow}>
                <View style={[styles.row, { gap: 6 }]}><UiText style={[v.tlineTitle, done ? { color: colors.ink3 } : null]}>{item.title}</UiText>{now ? <Chip label={t("nowLbl")} coral /> : null}</View>
                {item.detail || item.myTable ? <UiText style={styles.lbl}>{[item.detail, item.myTable ? t("tableChip", { t: item.myTable }) : null].filter(Boolean).join(" · ")}</UiText> : null}
              </View>
            </View>
          );
        })}
      </View>
      {data.agendaTip ? (
        <GradientCard from={colors.macPink} style={styles.gap}>
          <View style={[styles.row, { gap: 8 }]}>
            <View style={[styles.emoSm, { backgroundColor: colors.macPink }]}><UiText style={styles.emoSmText}>⭐</UiText></View>
            <UiText style={[styles.title13, styles.grow]}>{data.agendaTip.text}</UiText>
            {data.agendaTip.detail ? <Why label={t("why")} open={why} onToggle={() => setWhy((value) => !value)} /> : null}
          </View>
          {why && data.agendaTip.detail ? <WhyBody text={data.agendaTip.detail} /> : null}
        </GradientCard>
      ) : null}
    </View>
  );
}

// kit（b2 #26–#32）：.rdots · .ice 10 0 13/1.55 · .grid2 / .grid3 12 · .pcard 300 r24 18 gap 10 · .search 44 · .tline 46|14|1fr · .dot 10。
const useStyles = createThemedStyles((colors) => StyleSheet.create({
  qrCard: { alignItems: "center", paddingHorizontal: 18, paddingVertical: 24 },
  qrFrame: { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 20, borderWidth: 1, padding: 13 },
  nameBox: { alignItems: "center", height: 224, justifyContent: "center", width: 224 },
  bigName: { color: colors.ink, fontSize: 30, fontWeight: "800", lineHeight: 39, textAlign: "center" },
  qrTitle: { color: colors.ink, fontSize: 17, fontWeight: "700", lineHeight: 26, marginTop: 14, textAlign: "center" },
  grid3: { flexDirection: "row", gap: 12 },
  grid3Cell: { alignItems: "center", flex: 1 },
  grid3Text: { color: colors.ink, fontSize: 13, fontWeight: "700", lineHeight: 20, textAlign: "center" },
  roundTitle: { color: colors.ink, fontSize: 18, fontWeight: "700", lineHeight: 27, marginTop: 4 },
  seat46: { fontSize: 46, letterSpacing: -0.92, lineHeight: 48.3 },
  seat34: { fontSize: 34, letterSpacing: -0.68, lineHeight: 35.7, marginTop: 4 },
  rdots: { flexDirection: "row", gap: 6, width: 170 },
  rdot: { alignItems: "center", backgroundColor: colors.surface2, borderRadius: 12, flex: 1, paddingHorizontal: 4, paddingVertical: 7 },
  rdotNow: { backgroundColor: colors.ink },
  rdotTable: { color: colors.ink2, fontFamily: "ui-rounded", fontSize: 17, fontWeight: "700", lineHeight: 19 },
  rdotRound: { color: colors.ink3, fontSize: 12, fontWeight: "700", lineHeight: 18 },
  ice: { alignItems: "flex-start", flexDirection: "row", gap: 10, paddingVertical: 10 },
  iceLine: { borderTopColor: colors.line, borderTopWidth: 1 },
  iceText: { color: colors.ink, fontSize: 15, lineHeight: 23 },
  // Chrome 里 13px 的 💬 占 16，iOS 的彩色 emoji 占 19：固定占位，文字起点同画板。
  iceEmoji: { alignItems: "center", width: 16 },
  grid2: { flexDirection: "row", gap: 12 },
  grid2Cell: { flex: 1 },
  carousel: { marginHorizontal: -SHELL_GUTTER },
  carouselInner: { gap: 12, paddingBottom: 4, paddingHorizontal: SHELL_GUTTER, paddingTop: 2 },
  roundsCard: { paddingHorizontal: 18, paddingVertical: 6 },
  round: { paddingVertical: 12 },
  roundLine: { borderTopColor: colors.line, borderTopWidth: 1 },
  roundLeft: { width: 56 },
  roundTable: { fontSize: 22, letterSpacing: -0.44, lineHeight: 26 },
  mateRow: { gap: 10, paddingVertical: 7 },
  otherMember: { paddingLeft: 42 },
  pcard: { backgroundColor: colors.surface, borderRadius: radius.xl, gap: 10, padding: 18, width: PCARD },
  name16: { color: colors.ink, fontSize: 18, fontWeight: "700", lineHeight: 27 },
  dots: { flexDirection: "row", gap: 5, justifyContent: "center", marginTop: 10 },
  dot: { backgroundColor: colors.ink4, borderRadius: 3, height: 6, width: 6 },
  dotOn: { backgroundColor: colors.ink2, width: 18 },
  orderCard: { marginTop: 16, paddingHorizontal: 16, paddingVertical: 8 },
  orderNum: { color: colors.ink3, fontFamily: "ui-rounded", fontSize: 17, fontWeight: "800", lineHeight: 25, width: 18 },
  search: { alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.pill, flexDirection: "row", gap: 8, height: 44, paddingHorizontal: 16 },
  searchInput: { color: colors.ink, flex: 1, fontSize: 16, padding: 0 },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12, marginTop: 10 },
  listCard: { paddingHorizontal: 16, paddingVertical: 6 },
  peopleStatus: { alignSelf: "center" },
  mapCard: { alignItems: "center", paddingHorizontal: 8, paddingVertical: 10 },
  legendCard: { paddingHorizontal: 16, paddingVertical: 14 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  legendText: { color: colors.ink2, fontSize: 13, lineHeight: 20 },
  groupRow: { alignItems: "center", borderTopColor: colors.line, borderTopWidth: 1, flexDirection: "row", gap: 10, paddingVertical: 9 },
  groupLetter: { color: colors.ink, fontSize: 15, fontWeight: "800", lineHeight: 22 },
  tline: { flexDirection: "row", gap: 8 },
  tlineTime: { color: colors.ink, fontFamily: "ui-rounded", fontSize: 15, fontWeight: "800", lineHeight: 23, paddingTop: 1, width: 46 },
  tlineDotCol: { width: 14 },
  tlineDot: { backgroundColor: colors.surface3, borderRadius: 5, height: 10, marginTop: 4, width: 10 },
  // kit .tline.n .dot：box-shadow 0 0 0 4px coral-soft —— 画成点后面的 18 圆，不占布局。
  tlineRing: { backgroundColor: colors.coralSoft, borderRadius: 9, height: 18, left: -4, position: "absolute", top: 0, width: 18 },
  tlineRail: { backgroundColor: colors.surface3, height: 46, left: 4, position: "absolute", top: 16, width: 2 },
  tlineTitle: { color: colors.ink, fontSize: 15, fontWeight: "700", lineHeight: 22 },
}));
