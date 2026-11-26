// 2026-11-21 参加者 全名单页（event-detail-structure-app-proposal.html ③，用户拍板「全名单另开页」，与 Web /app/events/[id]/people 同构）：
// 段控件 プランに合う / 知り合い / 全員 + 名前・会社 搜索 + 名单；点人打开参加者シート（报名者才可点，与详情页相同规则）。
// 数据：GET /api/events/[id]/overview?attendees=all（服务端已有的全量参数；分页接口暂不做）。名单锁着时显示与详情页相同的说明。
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";

import type { EventOverviewAttendee, EventOverviewResponse } from "../../../api/contract/event-overview";
import { Icon, Segmented, UiPressable, UiText } from "../../../components/ui";
import { RetryCard } from "../../../components/ui/States";
import { createThemedStyles } from "../../../design/theme";
import { radius } from "../../../design/tokens";
import { useOrbitLocale } from "../../../i18n/OrbitLocaleContext";
import { AttendeeSheet, type AttendeeSheetPerson } from "./AttendeeSheet";
import { useJourneyApi } from "./journey-api";
import { JourneyPage } from "./JourneyPage";
import { BoneCard, Bones } from "./loading-ui";
import { useJourneyT } from "./useJourneyT";
import { Avatar, type Tone } from "./venue-ui";

type Filter = "planFit" | "known" | "all";
const TONES: readonly Tone[] = ["lav", "blue", "teal", "pink", "blue", "apricot"];

export function EventPeoplePage() {
  const { styles, colors } = useStyles();
  const { t } = useJourneyT();
  const locale = useOrbitLocale();
  const router = useRouter();
  const api = useJourneyApi();
  const params = useLocalSearchParams<{ id?: string; filter?: string }>();
  const eventId = String(params.id ?? "");
  const base = `/events/${encodeURIComponent(eventId)}`;
  const [data, setData] = useState<EventOverviewResponse | null>(null);
  const [missing, setMissing] = useState<"not_found" | "network" | null>(null);
  const [reload, setReload] = useState(0);
  const [filter, setFilter] = useState<Filter | null>(params.filter === "planFit" || params.filter === "known" || params.filter === "all" ? params.filter : null);
  const [query, setQuery] = useState("");
  const [sheetPerson, setSheetPerson] = useState<AttendeeSheetPerson | null>(null);

  useEffect(() => {
    let live = true;
    void api.overview(eventId, true).then((res) => {
      if (!live) return;
      if (res.ok) { setData(res.data); setMissing(null); } else setMissing(res.reason === "network" || res.reason === "unavailable" ? "network" : "not_found");
    });
    return () => { live = false; };
  }, [api, eventId, reload]);

  const shown: Filter = filter ?? (data && data.attendeeCounts.planFit > 0 ? "planFit" : "all");
  const people = useMemo(() => {
    if (!data) return [] as EventOverviewAttendee[];
    const q = query.trim().toLowerCase();
    return data.attendees.filter((person) => (shown === "planFit" ? person.planFit : shown === "known" ? person.known : true))
      .filter((person) => !q || [person.name, person.org, person.role].some((value) => value?.toLowerCase().includes(q)));
  }, [data, query, shown]);

  const status = data?.registration.status ?? "none";
  // 审核中 / 候补：名单要等审核通过（不再请他们「去报名」）。
  const inReview = status === "pending_review" || status === "waitlisted";
  const holding = status === "registered" || status === "pending_review" || status === "waitlisted" || status === "attended";
  const canOpen = holding && !data?.hosting;
  const back = { fallback: base, leftLabel: t("back") };
  if (!data) {
    return (
      <JourneyPage title={t("tabPeople")} {...back} testID="events-people">
        {missing === "network" ? <RetryCard title={locale.t("sync.needsNetwork")} message={locale.t("sync.needsNetworkBody")} onRetry={() => { setMissing(null); setReload((value) => value + 1); }} />
          : missing ? <View style={styles.card}><UiText style={styles.sub}>{t("notFound")}</UiText></View>
          : <Bones testID="events-people-loading"><BoneCard rows={6} title={false} /></Bones>}
      </JourneyPage>
    );
  }
  return (
    <JourneyPage title={t("peoplePageTitle", { n: data.attendeeCounts.all })} subtitle={data.title} {...back} testID="events-people">
      {data.rosterLocked ? (
        <View style={styles.card} testID="events-people-locked">
          <UiText style={styles.sub}>{t(inReview ? "rosterGatePending" : "rosterGateBody")}</UiText>
          {inReview ? null : <UiPressable accessibilityRole="button" accessibilityLabel={t("rosterGateCta")} onPress={() => router.push(`${base}/register` as Href)} style={styles.gateBtn}><UiText style={[styles.gateBtnText, { color: colors.bg }]}>{t("rosterGateCta")}</UiText></UiPressable>}
        </View>
      ) : (
        <>
          <Segmented<Filter> accessibilityLabel={t("tabPeople")} value={shown} onChange={setFilter}
            segments={[{ key: "planFit", label: t("segPlanFit", { n: data.attendeeCounts.planFit }) }, { key: "known", label: t("segKnown", { n: data.attendeeCounts.known }) }, { key: "all", label: t("segAll", { n: data.attendeeCounts.all }) }]} />
          <View style={styles.search}>
            <Icon name="search" size={16} color={colors.ink3} />
            <TextInput value={query} onChangeText={setQuery} placeholder={t("peopleSearchPh")} placeholderTextColor={colors.ink3} accessibilityLabel={t("peopleSearchPh")} style={styles.searchInput} testID="events-people-search" />
          </View>
          {people.length ? (
            <View style={[styles.card, styles.list]} testID="events-people-list">
              {people.map((person, index) => (
                <UiPressable key={person.attendeeId} accessibilityRole={canOpen ? "button" : undefined} accessibilityLabel={person.name} disabled={!canOpen}
                  onPress={() => setSheetPerson({ attendeeId: person.attendeeId, initial: person.initial, name: person.name, org: person.org ?? null, role: person.role ?? null, tone: TONES[index % TONES.length]! })}
                  style={styles.li} testID={`events-people-${person.attendeeId}`}>
                  {index ? <View style={styles.liLine} /> : null}
                  <Avatar initial={person.initial} tone={TONES[index % TONES.length]!} />
                  <View style={styles.grow}>
                    <UiText style={styles.name} numberOfLines={1}>{person.name}</UiText>
                    <UiText style={styles.meta} numberOfLines={1}>{[person.org, person.role].filter(Boolean).join(" · ")}</UiText>
                  </View>
                  {canOpen ? <Icon name="right" size={16} color={colors.ink4} /> : null}
                </UiPressable>
              ))}
            </View>
          ) : <View style={[styles.card, { marginTop: 12 }]}><UiText style={[styles.sub, { color: colors.ink3 }]}>{query.trim() ? t("peopleNoMatch") : t("noPeopleHere")}</UiText></View>}
        </>
      )}
      <AttendeeSheet eventId={eventId} person={sheetPerson} onClose={() => setSheetPerson(null)} />
    </JourneyPage>
  );
}

// kit（提案 ③）：.seg full · .search 44 r-pill · .card 24 / 6·16 · .li 11 0。
const useStyles = createThemedStyles((colors) => StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: 18 },
  list: { marginTop: 12, paddingHorizontal: 16, paddingVertical: 6 },
  sub: { color: colors.ink2, fontSize: 15, lineHeight: 23 },
  search: { alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.pill, flexDirection: "row", gap: 8, height: 44, marginTop: 10, paddingHorizontal: 16 },
  searchInput: { color: colors.ink, flex: 1, fontSize: 16, padding: 0 },
  li: { alignItems: "center", flexDirection: "row", gap: 12, paddingVertical: 11 },
  liLine: { backgroundColor: colors.line, height: StyleSheet.hairlineWidth, left: 50, position: "absolute", right: 0, top: 0 },
  grow: { flex: 1, minWidth: 0 },
  name: { color: colors.ink, fontSize: 15, fontWeight: "700", lineHeight: 22 },
  meta: { color: colors.ink3, fontSize: 13, lineHeight: 20 },
  gateBtn: { alignItems: "center", alignSelf: "flex-start", backgroundColor: colors.ink, borderRadius: radius.pill, height: 36, justifyContent: "center", marginTop: 12, paddingHorizontal: 18 },
  gateBtnText: { fontSize: 14, fontWeight: "700", lineHeight: 20 },
}));
