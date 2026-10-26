// R30 全局搜索（App /search；b5 #53 初期 / #54 名前 / #55 意味 / #56 結果なし，b12 #490–#499 深色 + 検索中；search/DESIGN.md §2.2）。
// 一套服务两端同用：GET /api/search/global（search-api.ts）。输入 250ms 后查一次、旧请求作废；300ms 还没回答才画「検索中…」骨架
// （不转圈）；429 只提示一次不重试。最近搜索只存在这台设备（AsyncStorage）。「iOrbit に聞く」只把文字预填进 iOrbit 输入框，不发送。
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { recentSearchKey } from "../../data/account-local-caches";
import { splitByHighlights } from "../../api/compute/search-highlight";
import type { GlobalSearchResponse, SearchHighlight } from "../../api/contract/global-search";
import { useShellTopGap } from "../../components/ShellTopBar";
import { avatarTone } from "../../components/ui/Avatar";
import { FullScreenSearch } from "../../components/ui/FullScreenSearch";
import { Icon } from "../../components/ui/Icon";
import { UiPressable } from "../../components/ui/Pressable";
import { UiText } from "../../components/ui/Text";
import { registerAiTemplatePrefill } from "../../data/ai-template-prefill";
import { createThemedStyles } from "../../design/theme";
import { radius, type OrbitColors } from "../../design/tokens";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { localParts } from "../../time/date-time";
import { useOrbitTimeZone } from "../../time/OrbitTimeZoneProvider";
import { addDesignMock } from "../add/add-design-mock";
import { LOCAL_ITEM_FILTERS, localItemCount, searchLocalItems, type LocalItemFilter, type LocalItemHit } from "./local-item-search";
import type { SearchFilter } from "./search-api";
import { useGlobalSearchSource } from "./useGlobalSearchSource";
import { useLocalItemSources } from "./useLocalItemSources";
import { APP_SEMANTIC_PREFERENCE_KEY, APP_RECENT_SEARCHES_MAX, APP_SEARCH_DEBOUNCE_MS, APP_SEARCHING_DELAY_MS, alternativePrompt, appSearchFilters, isAppEmptyResult, rememberAppSearch } from "./search-model";

type Status = "idle" | "pending" | "ready" | "rate_limited" | "failed";
type ScreenFilter = SearchFilter | LocalItemFilter;
const isLocalFilter = (filter: ScreenFilter): filter is LocalItemFilter => (LOCAL_ITEM_FILTERS as readonly string[]).includes(filter);
/** Rows per group under 全部 (a chip shows them all). */
const ALL_GROUP_ROWS = 3;
const LOCAL_GROUP_ROWS = 50;

function fill(text: string, values: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
}

export function GlobalSearchScreen() {
  const { styles, colors } = useStyles();
  const locale = useOrbitLocale();
  const t = locale.t as (key: string, values?: Record<string, string | number>) => string;
  const router = useRouter();
  // LF11: people (and offline the conversations) are searched on the device; the server answers events.
  const api = useGlobalSearchSource();
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  // Simulator QA G1: notes, to-dos and schedule items are searched on the device (useLocalItemSources.ts).
  const localItems = useLocalItemSources(auth.actorId ?? "");
  const { timeZone } = useOrbitTimeZone();
  const topGap = useShellTopGap();
  // 门禁开发开关：聚焦不弹软键盘（画板从不画系统键盘）。
  const noKeyboard = addDesignMock("no-keyboard");
  // `?q=` opens with a query already in the field (R11 人脈 🔍, the design gate); typing replaces it.
  const params = useLocalSearchParams<{ q?: string | string[] }>();
  const [query, setQuery] = useState(() => (Array.isArray(params.q) ? params.q[0] : params.q) ?? "");
  const [filter, setFilter] = useState<ScreenFilter>("all");
  const [capability, setCapability] = useState<GlobalSearchResponse | null>(null);
  const [result, setResult] = useState<GlobalSearchResponse | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [slow, setSlow] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [preferSemantic, setPreferSemantic] = useState(true);
  const semantic = capability?.semantic.available ? preferSemantic : undefined;
  const request = useRef(0);

  useEffect(() => {
    let live = true;
    void AsyncStorage.getItem(APP_SEMANTIC_PREFERENCE_KEY).then((value) => { if (live) setPreferSemantic(value !== "off"); }).catch(() => undefined);
    void api.search({ filter: "all", query: "" }).then((answer) => { if (live && answer.ok) setCapability(answer.data); });
    // LF5: recent searches are the signed-in account's own (the list used to be shared by every account on the device).
    const recentKey = recentSearchKey("global", auth.actorId);
    if (recentKey) void AsyncStorage.getItem(recentKey).then((value) => {
      if (!live || !value) return;
      try { const parsed = JSON.parse(value) as unknown; if (Array.isArray(parsed)) setRecent(parsed.filter((item): item is string => typeof item === "string").slice(0, APP_RECENT_SEARCHES_MAX)); } catch { /* ignore */ }
    }).catch(() => undefined);
    return () => { live = false; };
  }, [api, auth.actorId]);

  useEffect(() => {
    const trimmed = query.trim();
    const id = ++request.current;
    setSlow(false);
    if (!trimmed) { setResult(null); setStatus("idle"); return; }
    setStatus("pending");
    const slowTimer = setTimeout(() => { if (request.current === id) setSlow(true); }, APP_SEARCH_DEBOUNCE_MS + APP_SEARCHING_DELAY_MS);
    const timer = setTimeout(() => {
      // A notes / to-do / schedule chip asks only for 人 (answered on the device when the mirror is readable):
      // the answer still carries the 其他办法 rows for the empty state.
      void api.search({ filter: isLocalFilter(filter) ? "people" : filter, query: trimmed, semantic }).then((answer) => {
        if (request.current !== id) return;
        setSlow(false);
        if (answer.ok === true) { setResult(answer.data); setStatus("ready"); return; }
        setResult(null);
        setStatus(answer.ok === false && answer.reason === "rate_limited" ? "rate_limited" : "failed");
      });
    }, APP_SEARCH_DEBOUNCE_MS);
    return () => { clearTimeout(timer); clearTimeout(slowTimer); };
  }, [api, query, filter, semantic]);

  const saveRecent = useCallback((next: string[]) => {
    setRecent(next);
    const recentKey = recentSearchKey("global", auth.actorId);
    if (recentKey) void AsyncStorage.setItem(recentKey, JSON.stringify(next)).catch(() => undefined);
  }, [auth.actorId]);
  const remember = () => saveRecent(rememberAppSearch(recent, query));
  const open = (href: string) => { remember(); router.push(href as Href); };
  const askIorbit = (prompt?: string) => {
    const text = (prompt ?? query).trim();
    if (!text || !auth.actorId || !server.baseUrl) return;
    remember();
    const prefillIntent = registerAiTemplatePrefill({ actorId: auth.actorId, baseUrl: server.baseUrl, entryPointId: "ai.new_chat", message: text, references: [], template: { id: "search.ask_iorbit", version: 1 } });
    router.push({ pathname: "/ai/[id]", params: { id: "new", prefillIntent } } as Href);
  };
  const close = () => { if (router.canGoBack()) router.back(); else router.replace("/task" as Href); };

  const filters: ScreenFilter[] = [...appSearchFilters(capability?.types ?? result?.types), ...LOCAL_ITEM_FILTERS];
  const filterLabel: Record<ScreenFilter, string> = { all: t("search.typeAll"), conversations: t("search.typeConversations"), events: t("search.typeEvents"), people: t("search.typePeople"), notes: t("search.typeNotes"), todos: t("search.typeTodos"), schedule: t("search.typeSchedule") };
  // Like the Web panel: the previous answer stays until the next one arrives (no blank flash); after 300 ms without an
  // answer the 検索中 skeleton takes over.
  const showResult = (status === "ready" || (status === "pending" && !slow)) && result && query.trim() ? result : null;
  // Local rows follow the answer shown (same query, same moment), so the page never mixes two queries.
  const shownQuery = showResult?.query ?? "";
  const local = useMemo(() => searchLocalItems({ ...localItems, query: shownQuery, now: Date.now(), limit: filter === "all" ? ALL_GROUP_ROWS : LOCAL_GROUP_ROWS }), [filter, localItems, shownQuery]);
  const localFilter = isLocalFilter(filter);
  const empty = localFilter
    ? Boolean(showResult) && localItemCount(local, filter) === 0
    : isAppEmptyResult(showResult, filter) && (filter !== "all" || localItemCount(local, "all") === 0);
  const day = (iso: string) => {
    const date = /^\d{4}-\d{2}-\d{2}$/u.test(iso) ? iso : localParts(iso, timeZone).date;
    const [, month, dayOfMonth] = date.split("-");
    return month && dayOfMonth ? `${Number(month)}/${Number(dayOfMonth)}` : "";
  };
  const localSub = (kind: LocalItemFilter, hit: LocalItemHit) => {
    if (kind === "notes") return [hit.at ? day(hit.at) : "", hit.detail].filter(Boolean).join(" · ");
    if (kind === "todos") return [hit.done ? t("search.todoDone") : hit.at ? day(hit.at) : "", hit.detail].filter(Boolean).join(" · ");
    return [hit.at ? `${day(hit.at)} ${localParts(hit.at, timeZone).time}` : "", hit.detail].filter(Boolean).join(" · ");
  };
  const LOCAL_GROUP: Record<LocalItemFilter, { label: string; emoji: string; tone: string }> = {
    notes: { label: "search.groupNotes", emoji: "📝", tone: colors.macApricot },
    todos: { label: "search.groupTodos", emoji: "☑️", tone: colors.macTeal },
    schedule: { label: "search.groupSchedule", emoji: "🗓️", tone: colors.macBlue },
  };

  const marked = (text: string, ranges: readonly SearchHighlight[], field: "title" | "subtitle", style: object) => {
    const own = ranges.filter((range) => range.field === field);
    if (!own.length) return <UiText style={style} numberOfLines={1}>{text}</UiText>;
    return <UiText style={style} numberOfLines={1}>{splitByHighlights(text, own).map((part, index) => part.marked ? <UiText key={index} style={[style, styles.mark]}>{` ${part.text} `}</UiText> : part.text)}</UiText>;
  };
  const avatar = (name: string, initial: string) => {
    const tone = avatarTone(name);
    return <View style={[styles.av, { backgroundColor: toneBackground(colors, tone) }]}><UiText style={[styles.avText, { color: toneText(colors, tone) }]}>{initial}</UiText></View>;
  };
  const emo = (emoji: string, background: string) => <View style={[styles.emo, { backgroundColor: background }]}><UiText style={styles.emoText}>{emoji}</UiText></View>;
  const group = (label: string, right?: string | null, onRight?: () => void) => (
    <View style={styles.sgrp}>
      <UiText style={styles.sgrpText}>{label}</UiText>
      {right ? (onRight ? <UiPressable accessibilityRole="button" accessibilityLabel={right} onPress={onRight} hitSlop={8}><UiText style={styles.sgrpText}>{right}</UiText></UiPressable> : <UiText style={styles.sgrpText}>{right}</UiText>) : null}
    </View>
  );

  let body: React.ReactNode = null;
  if (!query.trim()) {
    body = (
      <>
        {recent.length ? (
          <>
            {group(t("search.recent"), t("search.recentClear"), () => saveRecent([]))}
            <View style={[styles.card, styles.recentCard]}>
              {recent.map((item) => (
                <UiPressable key={item} accessibilityRole="button" accessibilityLabel={item} onPress={() => setQuery(item)} style={styles.row}>
                  <Icon name="clock" size={16} color={colors.ink} />
                  <View style={styles.meta}><UiText style={[styles.title, styles.recentTitle]} numberOfLines={1}>{item}</UiText></View>
                  <UiPressable accessibilityRole="button" accessibilityLabel={`${t("search.recentClear")} ${item}`} onPress={() => saveRecent(recent.filter((value) => value !== item))} hitSlop={8}><Icon name="x" size={16} color={colors.ink} /></UiPressable>
                </UiPressable>
              ))}
            </View>
          </>
        ) : null}
        {capability?.examples.length ? (
          <>
            {group(t("search.examples"))}
            <View style={styles.chips}>
              {capability.examples.map((item) => <UiPressable key={item} accessibilityRole="button" accessibilityLabel={item} onPress={() => setQuery(item)} style={styles.example}><UiText style={styles.exampleText}>{item}</UiText></UiPressable>)}
            </View>
            {semantic === true ? <UiText style={[styles.lbl, styles.hint]}>{t("search.semanticHint")}</UiText> : null}
          </>
        ) : null}
      </>
    );
  } else if (status === "pending" && slow) {
    body = (
      <View style={[styles.card, styles.resultCard]} accessibilityRole="progressbar" accessibilityLabel={t("search.searching")} testID="global-search-searching">
        {group(t("search.searching"))}
        {[0, 1, 2, 3, 4].map((index) => (
          <View key={index} style={styles.row} importantForAccessibility="no-hide-descendants">
            <View style={[styles.av, { backgroundColor: colors.surface2 }]} />
            <View style={styles.meta}><View style={[styles.skel, { width: "40%" }]} /><View style={[styles.skel, styles.skelSub, { width: "65%" }]} /></View>
          </View>
        ))}
      </View>
    );
  } else if (status === "rate_limited" || status === "failed") {
    body = <View style={[styles.card, styles.resultCard]}><UiText style={styles.status} accessibilityLiveRegion="polite">{t(status === "rate_limited" ? "search.rateLimited" : "search.failed")}</UiText></View>;
  } else if (showResult && empty) {
    body = (
      <View style={[styles.card, styles.resultCard]} testID="global-search-empty">
        <View style={styles.empty}>
          <UiText style={styles.emptyEmoji}>🔎</UiText>
          <UiText style={styles.emptyTitle}>{fill(t(filter === "events" ? "search.emptyTitleEvents" : filter === "conversations" ? "search.emptyTitleConversations" : filter === "notes" ? "search.emptyTitleNotes" : filter === "todos" ? "search.emptyTitleTodos" : filter === "schedule" ? "search.emptyTitleSchedule" : "search.emptyTitle"), { q: showResult.query })}</UiText>
          {filter === "all" || filter === "people" ? <UiText style={[styles.lbl, styles.emptySub]}>{fill(t("search.emptySearched"), { n: showResult.searchedPeople })}</UiText> : null}
        </View>
        {showResult.suggestions.length && !localFilter ? group(t("search.emptyNear")) : null}
        {(localFilter ? [] : showResult.suggestions).map((item, index) => (
          <UiPressable key={item.href} accessibilityRole="button" accessibilityLabel={item.label} onPress={() => open(item.href)} style={[styles.row, index === 0 && styles.sel]}>
            {emo(item.emoji, index === 0 ? colors.macBlue : colors.macApricot)}
            <View style={styles.meta}><UiText style={styles.title} numberOfLines={1}>{item.label}</UiText><UiText style={styles.sub} numberOfLines={1}>{fill(t("search.suggestionNarrow"), { n: item.count })}</UiText></View>
            <Icon name="right" size={16} color={colors.ink} />
          </UiPressable>
        ))}
        {group(t("search.emptyOther"))}
        {showResult.alternatives.map((item) => (
          <UiPressable key={item.kind} accessibilityRole="button" accessibilityLabel={item.label} onPress={() => (item.kind === "ask_iorbit" ? askIorbit(alternativePrompt(item.detail)) : open(item.href))} style={styles.row}>
            {emo(item.emoji, item.kind === "ask_iorbit" ? colors.macLav : colors.macTeal)}
            <View style={styles.meta}><UiText style={styles.title} numberOfLines={1}>{item.label}</UiText><UiText style={styles.sub} numberOfLines={1}>{item.detail}</UiText></View>
          </UiPressable>
        ))}
      </View>
    );
  } else if (showResult) {
    // A notes / to-do / schedule chip shows only its own rows (the 人 answer behind it only feeds the empty state).
    const people = localFilter ? { ...showResult.people, items: [] } : showResult.people;
    const conversations = localFilter ? null : showResult.conversations;
    const events = localFilter ? [] : showResult.events.items;
    const isSemantic = !localFilter && showResult.semantic.enabled;
    body = (
      <View style={[styles.card, styles.resultCard]} testID="global-search-results" accessibilityLabel={t("search.resultsLabel")}>
        {isSemantic ? (
          <View style={styles.banner}>
            <Icon name="sparkle" size={16} color={colors.ink2} />
            <UiText style={styles.bannerText}>{fill(t("search.semanticBanner"), { count: "\u0000", matched: showResult.semantic.matched ?? 0, q: showResult.query, related: showResult.semantic.related ?? 0 }).split("\u0000").map((part, index) => (index ? <UiText key={index}><UiText style={styles.bannerCount}>{fill(t("search.semanticCount"), { n: people.total })}</UiText>{part}</UiText> : part))}</UiText>
          </View>
        ) : null}
        {people.items.length ? group(fill(t("search.groupPeople"), { n: people.total }), people.order === "relevance" ? t("search.orderRelevance") : null) : null}
        {people.items.map((hit, index) => (
          <UiPressable key={hit.contactId} accessibilityRole="button" accessibilityLabel={hit.name} onPress={() => open(hit.href)} style={[styles.row, isSemantic && index === 0 && styles.sel]}>
            {avatar(hit.name, hit.initial)}
            <View style={styles.meta}>{marked(hit.name, hit.highlights, "title", styles.title)}{marked([hit.org, hit.role].filter(Boolean).join(" · "), hit.highlights, "subtitle", styles.sub)}</View>
            {hit.reason ? <View style={styles.reason}><UiText style={styles.reasonText}>{hit.reason}</UiText></View>
              : hit.status === "in_progress" ? <View style={[styles.chip, { backgroundColor: colors.macLav }]}><UiText style={[styles.chipText, { color: colors.macLavText }]}>{t("search.statusInProgress")}</UiText></View>
                : hit.status === "acquaintance" ? <View style={[styles.chip, { backgroundColor: colors.macApricot }]}><UiText style={[styles.chipText, { color: colors.macApricotText }]}>{t("search.statusAcquaintance")}</UiText></View> : null}
          </UiPressable>
        ))}
        {events.length ? group(fill(t("search.groupEvents"), { n: showResult.events.total })) : null}
        {events.map((hit) => (
          <UiPressable key={hit.eventId} accessibilityRole="button" accessibilityLabel={hit.title} onPress={() => open(hit.href)} style={styles.row}>
            {emo(hit.emoji, hit.via === "attendees" ? colors.macLav : colors.macTeal)}
            <View style={styles.meta}>{marked(hit.title, hit.highlights, "title", styles.title)}{marked(hit.note, hit.highlights, "subtitle", styles.sub)}</View>
            {hit.via === "attendees" ? <View style={styles.reason}><UiText style={styles.reasonText}>{t("search.viaAttendees")}</UiText></View> : null}
          </UiPressable>
        ))}
        {conversations?.items.length ? group(fill(t("search.groupConversations"), { n: conversations.total })) : null}
        {conversations?.items.map((hit) => (
          <UiPressable key={hit.id} accessibilityRole="button" accessibilityLabel={hit.title} onPress={() => open(hit.href)} style={styles.row}>
            {emo(hit.kind === "iorbit" ? "✨" : "📧", hit.kind === "iorbit" ? colors.macLav : colors.macBlue)}
            <View style={styles.meta}>
              {hit.kind === "iorbit"
                ? <UiText style={styles.title} numberOfLines={1}>{t("search.iorbitPrefix")}{splitByHighlights(hit.title, hit.highlights.filter((range) => range.field === "title")).map((part, index) => part.marked ? <UiText key={index} style={[styles.title, styles.mark]}>{` ${part.text} `}</UiText> : part.text)}</UiText>
                : marked(hit.title, hit.highlights, "title", styles.title)}
              {marked(hit.subtitle, hit.highlights, "subtitle", styles.sub)}
            </View>
          </UiPressable>
        ))}
        {LOCAL_ITEM_FILTERS.filter((kind) => filter === "all" || filter === kind).map((kind) => {
          const found = local[kind];
          if (!found.items.length) return null;
          const look = LOCAL_GROUP[kind];
          return (
            <View key={kind} testID={`global-search-${kind}`}>
              {group(fill(t(look.label), { n: found.total }), filter === "all" && found.total > found.items.length ? t("search.showAll") : null, () => setFilter(kind))}
              {found.items.map((hit) => {
                const sub = localSub(kind, hit);
                return (
                  <UiPressable key={hit.id} accessibilityRole="button" accessibilityLabel={hit.title} onPress={() => open(hit.href)} style={styles.row}>
                    {emo(look.emoji, look.tone)}
                    <View style={styles.meta}>
                      <UiText style={[styles.title, hit.done && styles.done]} numberOfLines={2}>{hit.title}</UiText>
                      {sub ? <UiText style={styles.sub} numberOfLines={2}>{sub}</UiText> : null}
                    </View>
                  </UiPressable>
                );
              })}
            </View>
          );
        })}
      </View>
    );
  }

  return (
    // R31a (R30): the library's full-screen search page (kit b5 #53–#56 .sbar) instead of a hand-written container.
    <FullScreenSearch testID="global-search" inputTestID="global-search-input" topGap={topGap}
      value={query} onChangeText={setQuery} onSubmitEditing={remember} showSoftInputOnFocus={!noKeyboard}
      placeholder={t("search.placeholder")} clearLabel={t("search.clearQuery")} cancelLabel={t("search.cancel")} onCancel={close}
      chips={<View style={styles.scope} accessibilityLabel={t("search.typesLabel")}>
      {filters.map((item) => {
        const on = item === filter;
        return <UiPressable key={item} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={filterLabel[item]} onPress={() => setFilter(item)} style={[styles.cat, on && styles.catOn]}><UiText style={[styles.catText, on && styles.catTextOn]}>{filterLabel[item]}</UiText></UiPressable>;
      })}
    </View>}>
      {api.eventsOffline && query.trim() && filter !== "people" && !localFilter ? <UiText style={[styles.lbl, styles.hint]} accessibilityLiveRegion="polite">{t("search.eventsOffline")}</UiText> : null}
      {body}
    </FullScreenSearch>
  );
}

type Tone = ReturnType<typeof avatarTone>;
function toneBackground(colors: OrbitColors, tone: Tone): string {
  return { apricot: colors.macApricot, blue: colors.macBlue, lav: colors.macLav, pink: colors.macPink, teal: colors.macTeal }[tone];
}
function toneText(colors: OrbitColors, tone: Tone): string {
  return { apricot: colors.macApricotText, blue: colors.macBlueText, lav: colors.macLavText, pink: colors.macPinkText, teal: colors.macTealText }[tone];
}

// kit（b5 #53–#56）：.sbar 6 0 12 gap 10 · .search 44 r999 13.5 gap 8 0/16 · .btn.ghost 40 0/4 13 700 ink-2 · .chips.scope gap 6 ·
// .cat 7/12 12.5 700 r999（on：ink 底 bg 字）· .card r24 6（初期 4 6）margin-top 12 · .sgrp 11.5 700 ink-3 16 4 6 ·
// .cmdrow gap 12 9/12 r14（sel：surface-2）· .meta b 13.5 700 / span 12 ink-3 · .av.sm 30 11.5 800 · .emo.sm 32 r10 17 ·
// .chip 3/9 11 700 · .mr 2/8 11 700 rose-700 / rose-100 · mark rose-100 · .banner 9/12 r14 surface-2 11.5 ink-2 gap 8 ·
// 空状态 22 10 8：🔎 40 / b 15 700 mt6 / .lbl mt4 · 例 chip lav 6/11 · 提示 .lbl mt10 · 骨架 .skel 12 / 10 mt7（surface-2）。
const useStyles = createThemedStyles((colors) => StyleSheet.create({
  scope: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  cat: { backgroundColor: colors.surface2, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7 },
  catOn: { backgroundColor: colors.ink },
  catText: { color: colors.ink2, fontSize: 15, fontWeight: "700", lineHeight: 23 },
  catTextOn: { color: colors.bg },
  card: { backgroundColor: colors.surface, borderRadius: radius.xl },
  recentCard: { paddingHorizontal: 6, paddingVertical: 4 },
  resultCard: { marginTop: 12, padding: 6 },
  sgrp: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6, marginHorizontal: 4, marginTop: 16 },
  sgrpText: { color: colors.ink3, fontSize: 13, fontWeight: "700", lineHeight: 20 },
  row: { alignItems: "center", borderRadius: 14, flexDirection: "row", gap: 12, paddingHorizontal: 12, paddingVertical: 9 },
  sel: { backgroundColor: colors.surface2 },
  meta: { flex: 1, minWidth: 0 },
  title: { color: colors.ink, fontSize: 16, fontWeight: "700", lineHeight: 24 },
  recentTitle: { fontWeight: "600" },
  done: { color: colors.ink3, textDecorationLine: "line-through" },
  sub: { color: colors.ink3, fontSize: 14, lineHeight: 21 },
  mark: { backgroundColor: colors.rose100 },
  av: { alignItems: "center", borderRadius: radius.pill, height: 30, justifyContent: "center", width: 30 },
  avText: { fontSize: 13, fontWeight: "800", lineHeight: 16 },
  emo: { alignItems: "center", borderRadius: 10, height: 32, justifyContent: "center", width: 32 },
  emoText: { fontSize: 19, lineHeight: 25 },
  chip: { borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 3 },
  chipText: { fontSize: 13, fontWeight: "700", lineHeight: 20 },
  reason: { backgroundColor: colors.rose100, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  reasonText: { color: colors.rose700, fontSize: 13, fontWeight: "700", lineHeight: 20 },
  banner: { alignItems: "center", backgroundColor: colors.surface2, borderRadius: 14, flexDirection: "row", gap: 8, marginTop: 4, paddingHorizontal: 12, paddingVertical: 9 },
  bannerText: { color: colors.ink2, flex: 1, fontSize: 13, lineHeight: 20 },
  bannerCount: { fontWeight: "700" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  example: { backgroundColor: colors.macLav, borderRadius: radius.pill, paddingHorizontal: 11, paddingVertical: 6 },
  exampleText: { color: colors.macLavText, fontSize: 13, fontWeight: "700", lineHeight: 20 },
  lbl: { color: colors.ink3, fontSize: 13, fontWeight: "500", lineHeight: 20 },
  hint: { marginTop: 10 },
  empty: { alignItems: "center", paddingBottom: 8, paddingHorizontal: 10, paddingTop: 22 },
  emptyEmoji: { fontSize: 40, lineHeight: 60 },
  emptyTitle: { color: colors.ink, fontSize: 17, fontWeight: "700", lineHeight: 26, marginTop: 6, textAlign: "center" },
  emptySub: { marginTop: 4, textAlign: "center" },
  skel: { backgroundColor: colors.surface2, borderRadius: 6, height: 12 },
  skelSub: { height: 10, marginTop: 7 },
  status: { color: colors.ink3, fontSize: 14, lineHeight: 21, paddingHorizontal: 12, paddingVertical: 9 },
}));
