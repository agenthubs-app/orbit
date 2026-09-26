import { useOrbitTimeZone } from "../../time/OrbitTimeZoneProvider";
import { Ionicons } from "@expo/vector-icons";
import { type Href, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Image,
  ImageBackground,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { z } from "zod";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import {
  eventValueRecommendationAcceptPath,
  eventValueRecommendationsPath,
  ORBIT_API_ENDPOINTS
} from "../../api/endpoints";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { validateApiResourceState } from "../../api/validated-resource-state";
import { OrbitTabBar } from "../../components/OrbitTabBar";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { layout, radius, spacing, typography, textStyles } from "../../design/tokens";
import { createControlStyles } from "../../design/controls";
import { createThemedStyles } from "../../design/theme";
import {
  useApiResource,
  type ApiResourceState
} from "../../hooks/useApiResource";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import {
  eventsToSummaries,
  eventValueRecommendationAcceptanceToView,
  eventValueRecommendationsToView,
  filterEventSummaries,
  type EventDiscoveryStatusFilter,
  type EventSummary,
  type EventValueRecommendationAcceptanceView,
  type EventValueRecommendationCardView
} from "../../view-models/events";

const eventDiscoveryStatusFilters: EventDiscoveryStatusFilter[] = [
  "upcoming",
  "active",
  "ended",
  "all"
];

const eventPageSize = 8;
const eventFont = Platform.select({ web: '-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB","Noto Sans SC","Microsoft YaHei",sans-serif', ios: "System", default: "sans-serif" });
// Validate this public consumer without modifying the generated shared contract.
const publicEventsSchema = z.object({
  events: z.array(z.object({
    id: z.string().trim().min(1), title: z.string().trim().min(1),
    startsAt: z.string().datetime({ offset: true }), endsAt: z.string().datetime({ offset: true }),
    status: z.enum(["draft", "confirmed", "imported", "pending_import", "cancelled"]),
    venue: z.string().optional(), location: z.string().optional(), locationLabel: z.string().optional(),
    description: z.string().optional(), organizer: z.string().optional(), host: z.string().optional(),
    theme: z.string().optional(), industry: z.string().optional(),
    coverPath: z.string().optional(), coverUrl: z.string().optional(), imageUrl: z.string().optional(),
    tags: z.array(z.string()).optional(),
    participantCount: z.number().int().nonnegative().optional(),
    stats: z.object({ count: z.number().int().nonnegative().optional() }).passthrough().optional(),
    sourceMetadata: z.object({ label: z.string().optional(), coverPath: z.string().optional(), coverUrl: z.string().optional() }).passthrough().optional()
  }).passthrough().refine(event => Date.parse(event.startsAt) < Date.parse(event.endsAt)))
}).passthrough().refine(value => new Set(value.events.map(event => event.id)).size === value.events.length);

const eventRecommendationSchema = z.object({
  eventId: z.string().trim().min(1), title: z.string().trim().min(1),
  startsAt: z.string().datetime({ offset: true }), location: z.string(), venue: z.string(),
  valueScore: z.number().min(0).max(100), scoreBand: z.enum(["high", "medium", "low"]),
  signals: z.array(z.object({ label: z.string(), detail: z.string(), weight: z.number() }).passthrough()),
  recommendedAction: z.string()
}).passthrough();
const eventRecommendationsSchema = z.object({
  state: z.enum(["success", "empty", "pending"]),
  profile: z.object({ calendarFit: z.enum(["open", "tight", "conflict"]), goal: z.string(), industryPreference: z.string(), location: z.string() }).passthrough(),
  recommendations: z.array(eventRecommendationSchema), summary: z.string(), nextAction: z.string()
}).passthrough().refine(value =>
  (value.state === "success" ? value.recommendations.length > 0 : value.recommendations.length === 0) &&
  new Set(value.recommendations.map(event => event.eventId)).size === value.recommendations.length
);
const eventRecommendationAcceptanceSchema = z.object({
  state: z.literal("accepted"), acceptedEvent: eventRecommendationSchema,
  action: z.object({ calendarProviderRequested: z.literal(false), notificationDelivered: z.literal(false), databaseWriteExecuted: z.literal(false), externalNetworkRequested: z.literal(false), productionAuditLogWriteExecuted: z.literal(false) }).passthrough(),
  summary: z.string(), nextAction: z.string()
}).passthrough();

const eventDiscoveryStatusLabels: Record<EventDiscoveryStatusFilter, string> = {
  active: "进行中",
  all: "全部",
  ended: "历史",
  upcoming: "即将"
};

function assetUrl(baseUrl: string, path: string): string {
  if (/^https?:\/\//iu.test(path)) {
    return path;
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl.replace(/\/+$/u, "")}${normalizedPath}`;
}

function inferredEventTopic(title: string): string {
  const normalized = title.toLowerCase();

  if (/\bai\b|人工智能|自动化|poc/iu.test(normalized)) {
    return "AI 科技";
  }

  if (/投资|创投|融资|种子轮|创业者/iu.test(normalized)) {
    return "创投融资";
  }

  if (/跨境|海外|入境客|日中|中日/iu.test(normalized)) {
    return "跨境商务";
  }

  if (/人脉|关系|社群|沙龙|对接|交流/iu.test(normalized)) {
    return "人脉社群";
  }

  if (/工作坊|训练营|课程|诊断/iu.test(normalized)) {
    return "工作坊";
  }

  if (/餐饮|门店|增长/iu.test(normalized)) {
    return "餐饮增长";
  }

  return "商业交流";
}

function discoveryTopicsForEvent(event: EventSummary): string[] {
  return event.topics.length > 0 ? event.topics : [inferredEventTopic(event.title)];
}

function eventDiscoveryLocations(events: EventSummary[]): string[] {
  return [...new Set(events.map((event) => event.location.trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, "zh-CN"));
}

function publicEventStatus(status: string): string {
  const normalized = status.trim().toLowerCase();

  if (normalized === "imported" || normalized === "confirmed" || normalized === "scheduled" || status === "已确认") {
    return "可报名";
  }

  return status || "待确认";
}

function publicEventSubtitle(subtitle: string): string {
  return subtitle
    .split(" · ")
    .map((segment) => segment.trim())
    .filter((segment) => segment && !/^Organizer\s+#/iu.test(segment))
    .join(" · ");
}

function CompactEventRow({
  baseUrl,
  event,
  onPress
}: {
  baseUrl: string;
  event: EventSummary;
  onPress: () => void;
}) {
  const { colors, styles } = useStyles();
  const subtitle = publicEventSubtitle(event.subtitle);
  const status = publicEventStatus(event.status);
  const { width, fontScale } = useWindowDimensions();
  const expandedText = width < 360 || fontScale >= 1.4;

  return (
    <Pressable
      accessibilityLabel={`${event.title}，${event.startsAt}，${event.location || "地点待定"}，${status}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.eventRow,
        pressed ? styles.eventCardPressed : null
      ]}
    >
      <Image
        resizeMode="cover"
        source={{ uri: assetUrl(baseUrl, event.coverPath) }}
        style={styles.eventRowImageFrame}
      />
      <View style={styles.eventRowContent}>
        <Text style={styles.eventRowTitle}>
          {event.title}
        </Text>
        <Text style={styles.eventRowDate}>
          {event.startsAt}
        </Text>
        <View style={styles.eventRowMeta}>
          <Text style={styles.eventRowLocation}>
            {[event.location, subtitle].filter(Boolean).join(" · ") || "地点待定"}
          </Text>
        </View>
        {expandedText ? <Text style={styles.eventRowStatus}>{status}</Text> : null}
      </View>
      {!expandedText ? <View style={styles.eventRowFooter}><Text style={styles.eventRowStatus}>{status}</Text><Ionicons color={colors.text4} name="chevron-forward" size={14} /></View> : null}
    </Pressable>
  );
}

function EventFilterChip({
  count,
  label,
  onPress,
  selected
}: {
  count?: number;
  label: string;
  onPress: () => void;
  selected: boolean;
}) {
  const { styles } = useStyles();
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityHint={typeof count === "number" ? `${count} 场活动` : undefined}
      accessibilityState={{ selected }}
      aria-selected={selected}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.discoveryChip,
        selected ? styles.discoveryChipActive : null,
        pressed ? styles.eventCardPressed : null
      ]}
    >
      <Text
        style={[
          styles.discoveryChipText,
          selected ? styles.discoveryChipTextActive : null
        ]}
      >
        {label}{typeof count === "number" ? ` ${count}` : ""}
      </Text>
    </Pressable>
  );
}

function EventFilterRail({
  activeValue,
  allLabel = "全部",
  label,
  onChange,
  values
}: {
  activeValue: string;
  allLabel?: string;
  label: string;
  onChange: (value: string) => void;
  values: string[];
}) {
  const { styles } = useStyles();
  return (
    <View style={styles.filterRailGroup}>
      <Text style={styles.filterRailLabel}>{label}</Text>
      <ScrollView
        contentContainerStyle={styles.filterRailContent}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        <EventFilterChip
          label={allLabel}
          onPress={() => onChange("")}
          selected={!activeValue}
        />
        {values.map((value) => (
          <EventFilterChip
            key={value}
            label={value}
            onPress={() => onChange(activeValue === value ? "" : value)}
            selected={activeValue === value}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function EventDiscoveryControls({
  counts,
  locations,
  locationFilter,
  onLocationChange,
  onQueryChange,
  onStatusChange,
  onTopicChange,
  query,
  statusFilter,
  topicFilter,
  topics,
  tab,
  onTabChange
}: {
  counts: Record<EventDiscoveryStatusFilter, number>;
  locations: string[];
  locationFilter: string;
  onLocationChange: (location: string) => void;
  onQueryChange: (query: string) => void;
  onStatusChange: (status: EventDiscoveryStatusFilter) => void;
  onTopicChange: (topic: string) => void;
  query: string;
  statusFilter: EventDiscoveryStatusFilter;
  topicFilter: string;
  topics: string[];
  tab: "all" | "recommended";
  onTabChange: (tab: "all" | "recommended") => void;
}) {
  const { colors, styles } = useStyles();
  const locale = useOrbitLocale();
  const [filterMenu, setFilterMenu] = useState<"time" | "location" | "topic" | null>(null);
  const hasQuery = query.trim().length > 0;

  return (
    <View style={styles.discoveryControls}>
      <View style={styles.discoverySearchRow}>
        <Ionicons color={colors.text3} name="search-outline" size={18} />
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={onQueryChange}
          placeholder={locale.t("events.searchPlaceholder")}
          placeholderTextColor={colors.text4}
          returnKeyType="search"
          style={styles.discoverySearchInput}
          value={query}
        />
        {hasQuery ? (
          <Pressable
            accessibilityLabel={locale.t("events.clearSearch")}
            accessibilityRole="button"
            onPress={() => onQueryChange("")}
            style={styles.discoveryIconButton}
          >
            <Ionicons color={colors.text3} name="close-circle" size={19} />
          </Pressable>
        ) : null}
      </View>
      <View accessibilityRole="tablist" accessibilityLabel={locale.t("events.listLabel")} style={styles.catalogueTabs}>
        {([{ id: "recommended", label: locale.t("events.tabRecommended") }, { id: "all", label: locale.t("events.tabAll") }] as const).map(item => <Pressable key={item.id} accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{ selected: tab === item.id }} aria-selected={tab === item.id} onPress={() => onTabChange(item.id)} style={styles.catalogueTab}><View style={[styles.catalogueTabLabel, tab === item.id && styles.catalogueTabSelected]}><Text style={[styles.catalogueTabText, tab === item.id && styles.catalogueTabTextSelected]}>{item.label}</Text></View></Pressable>)}
      </View>
      <View style={styles.filterButtons}>
        {([{ id: "time", label: locale.t("events.filterTime"), value: statusFilter === "upcoming" ? locale.t("events.upcomingSoon") : statusFilter === "all" ? locale.t("events.allTime") : eventDiscoveryStatusLabels[statusFilter] }, { id: "location", label: locale.t("events.filterLocation"), value: locationFilter || locale.t("events.allLocations") }, { id: "topic", label: locale.t("events.filterTopic"), value: topicFilter || locale.t("events.allTopics") }] as const).map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={item.label} accessibilityState={{ expanded: filterMenu === item.id }} aria-expanded={filterMenu === item.id} onPress={() => setFilterMenu(current => current === item.id ? null : item.id)} style={styles.filterButton}><Text style={styles.filterButtonText}>{item.value}</Text><Ionicons color={colors.text2} name="caret-down" size={10} /></Pressable>)}
      </View>
      {filterMenu ? (
        <View style={styles.expandedFilters}>
          {filterMenu === "time" ? <View style={styles.discoveryChipRow}>{eventDiscoveryStatusFilters.map(filter => <EventFilterChip key={filter} count={counts[filter]} label={filter === "all" ? locale.t("events.allTime") : filter === "upcoming" ? locale.t("events.upcomingSoon") : eventDiscoveryStatusLabels[filter]} onPress={() => { onStatusChange(filter); setFilterMenu(null); }} selected={statusFilter === filter} />)}</View> : null}
          {filterMenu === "location" ? <EventFilterRail
            activeValue={locationFilter}
            allLabel={locale.t("events.allLocations")}
            label={locale.t("events.location")}
            onChange={value => { onLocationChange(value); setFilterMenu(null); }}
            values={locations}
          /> : null}
          {filterMenu === "topic" ? <EventFilterRail
            activeValue={topicFilter}
            allLabel={locale.t("events.allTopics")}
            label={locale.t("events.topic")}
            onChange={value => { onTopicChange(value); setFilterMenu(null); }}
            values={topics}
          /> : null}
        </View>
      ) : null}
    </View>
  );
}

function SectionHeader({
  action,
  detail,
  onAction,
  title
}: {
  action?: string;
  detail?: string;
  onAction?: () => void;
  title: string;
}) {
  const { colors, styles } = useStyles();
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionHeaderCopy}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {detail ? <Text style={styles.sectionDetail}>{detail}</Text> : null}
      </View>
      {action && onAction ? (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          style={({ pressed }) => [
            styles.sectionAction,
            pressed ? styles.eventCardPressed : null
          ]}
        >
          <Text style={styles.sectionActionText}>{action}</Text>
          <Ionicons color={colors.accent} name="chevron-forward" size={15} />
        </Pressable>
      ) : null}
    </View>
  );
}

function CompactEventList({
  baseUrl,
  events,
  onOpenEvent
}: {
  baseUrl: string;
  events: EventSummary[];
  onOpenEvent: (id: string) => void;
}) {
  const { styles } = useStyles();
  if (events.length === 0) {
    return null;
  }

  return (
    <View style={styles.eventList}>
      {events.map((event) => (
        <CompactEventRow
          baseUrl={baseUrl}
          event={event}
          key={event.id}
          onPress={() => onOpenEvent(event.id)}
        />
      ))}
    </View>
  );
}

function eventSummaryById(events: EventSummary[]): Map<string, EventSummary> {
  return new Map(events.map((event) => [event.id, event]));
}

function EventCenterEntry({ onPress }: { onPress: () => void }) {
  const { colors, styles } = useStyles();
  return (
    <Pressable
      accessibilityLabel="打开活动运营中心"
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.eventCenterEntry,
        pressed ? styles.eventCardPressed : null
      ]}
    >
      <Text style={styles.eventCenterEntryTitle}>我负责的活动</Text>
      <Ionicons color={colors.accent} name="chevron-forward" size={13} />
    </Pressable>
  );
}

export function EventsScreen({ scopeKey, isScopeCurrent }: { scopeKey?: string; isScopeCurrent?: () => boolean } = {}) {
  const { colors, styles } = useStyles();
  const locale = useOrbitLocale();
  const router = useRouter();
  const { baseUrl } = useOrbitApiBaseUrl();
  const { signedIn } = useOrbitAuthSession();
  const { timeZone } = useOrbitTimeZone();
  const rawState = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.publicEvents,
    (data) => eventsToSummaries(data, timeZone).length === 0,
    { scopeKey: scopeKey ?? "public-events" }
  );
  const state = validateApiResourceState(rawState, publicEventsSchema);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  function isCurrent() { return mounted.current && isScopeCurrent?.() !== false; }
  const [tab, setTab] = useState<"all" | "recommended">("all");
  const [recommendationRefreshKey, setRecommendationRefreshKey] = useState(0);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<EventDiscoveryStatusFilter>("upcoming");
  const [topicFilter, setTopicFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [visibleEventCount, setVisibleEventCount] = useState(eventPageSize);
  const refreshing = state.refreshing;
  const events = state.kind === "success" || state.kind === "empty" ? eventsToSummaries(state.data, timeZone) : [];
  const currentTime = Date.now();
  // Public records use "imported" for both future and live events. Keep their
  // source status for display and derive only the discovery time filter here.
  const phaseById = new Map((state.kind === "success" || state.kind === "empty" ? state.data.events : []).map(event => [event.id,
    event.status === "cancelled" || Date.parse(event.endsAt) <= currentTime ? "ended"
      : Date.parse(event.startsAt) <= currentTime ? "active" : "upcoming"
  ] as const));
  const discoveryEvents = events.map((event) => ({
    ...event,
    topics: discoveryTopicsForEvent(event)
  }));
  const filteredEvents = filterEventSummaries(discoveryEvents, {
    query,
    status: "all",
    topic: topicFilter
  }).filter((event) => (statusFilter === "all" || phaseById.get(event.id) === statusFilter) && (!locationFilter || event.location === locationFilter));
  const visibleEvents = filteredEvents.slice(0, visibleEventCount);
  const allFilteredEventsVisible = visibleEventCount >= filteredEvents.length;
  const discoveryTopics = [
    ...new Set(discoveryEvents.flatMap((event) => event.topics))
  ];
  const discoveryLocations = eventDiscoveryLocations(discoveryEvents);
  const discoveryCounts = {
    all: events.length,
    active: events.filter(event => phaseById.get(event.id) === "active").length,
    ended: events.filter(event => phaseById.get(event.id) === "ended").length,
    upcoming: events.filter(event => phaseById.get(event.id) === "upcoming").length
  };
  const sectionTitle = query.trim()
    ? "搜索结果"
    : statusFilter === "upcoming"
      ? "近期活动"
      : statusFilter === "active"
        ? "正在进行"
        : statusFilter === "ended"
          ? "历史活动"
          : "全部活动";
  const showRecommendations =
    signedIn && tab === "recommended" && (state.kind === "success" || state.kind === "empty");

  function refreshAll() {
    if (!isCurrent()) return;
    state.refresh();
    setRecommendationRefreshKey((current) => current + 1);
  }

  function openEvent(id: string) {
    if (!isCurrent()) return;
    router.push({
      params: { id },
      pathname: "/events/[id]"
    });
  }

  function openEventRegistration(id: string) {
    if (!isCurrent()) return;
    router.push(`/events/${encodeURIComponent(id)}/register` as Href);
  }

  function changeQuery(nextQuery: string) {
    if (!isCurrent()) return;
    setQuery(nextQuery);
    setVisibleEventCount(eventPageSize);
  }

  function changeStatusFilter(nextStatus: EventDiscoveryStatusFilter) {
    if (!isCurrent()) return;
    setStatusFilter(nextStatus);
    setVisibleEventCount(eventPageSize);
  }

  function changeTopicFilter(nextTopic: string) {
    if (!isCurrent()) return;
    setTopicFilter(nextTopic);
    setVisibleEventCount(eventPageSize);
  }

  function changeLocationFilter(nextLocation: string) {
    if (!isCurrent()) return;
    setLocationFilter(nextLocation);
    setVisibleEventCount(eventPageSize);
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
    <ScrollView contentContainerStyle={styles.pageContent} automaticallyAdjustKeyboardInsets contentInsetAdjustmentBehavior="automatic" keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          onRefresh={refreshAll}
          refreshing={refreshing}
          tintColor={colors.accent}
        />
      }
    >
      <View style={styles.pageHeader}><Text accessibilityRole="header" style={styles.pageTitle}>{locale.t("events.title")}</Text>{signedIn ? <EventCenterEntry onPress={() => { if (isCurrent()) router.push("/events/center" as Href); }} /> : null}</View>
      {state.kind === "loading" ? <LoadingState /> : null}
      {state.kind === "offline" ? (
        <ErrorState message={state.error.message} title="服务器连不上" />
      ) : null}
      {state.kind === "failure" ? (
        <ErrorState message={state.error.message} />
      ) : null}
      {state.kind === "failure" || state.kind === "offline" ? <Pressable accessibilityRole="button" accessibilityLabel="重新读取活动" onPress={refreshAll} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>重新读取</Text></Pressable> : null}
      {state.kind === "empty" ? (
        <EmptyState message="报名、导入或推荐的活动会出现在这里。" title="暂无活动" />
      ) : null}
      {state.kind === "success" || state.kind === "empty" ? (
        <EventDiscoveryControls
          counts={discoveryCounts}
          locationFilter={locationFilter}
          locations={discoveryLocations}
          onLocationChange={changeLocationFilter}
          onQueryChange={changeQuery}
          onStatusChange={changeStatusFilter}
          onTopicChange={changeTopicFilter}
          query={query}
          statusFilter={statusFilter}
          topicFilter={topicFilter}
          topics={discoveryTopics}
          tab={tab}
          onTabChange={value => { if (isCurrent()) setTab(value); }}
        />
      ) : null}
      {showRecommendations ? (
        <AuthenticatedEventValueRecommendations
          baseUrl={baseUrl}
          events={filteredEvents}
          key={JSON.stringify([recommendationRefreshKey, query, statusFilter, topicFilter, locationFilter])}
          onOpenEvent={openEvent}
          onRegisterEvent={openEventRegistration}
          scopeKey={scopeKey ?? "event-recommendations"}
          isScopeCurrent={isCurrent}
        />
      ) : null}
      {tab === "recommended" && !signedIn ? <View style={styles.recommendationNotice}><Text style={styles.recommendationBody}>登录后，按你的目标查看活动推荐。</Text><Pressable accessibilityRole="button" accessibilityLabel="登录后查看推荐" onPress={() => { if (isCurrent()) router.push("/account?next=%2Fevents" as Href); }} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>登录后查看推荐</Text></Pressable></View> : null}
      {tab === "all" ? <>
      {events.length > 0 ? <View style={styles.resultsHeader}><Text accessibilityRole="header" style={styles.sectionTitle}>{sectionTitle}</Text><Text testID="events-result-count" accessibilityLabel={`${filteredEvents.length} 场活动`} style={styles.resultCount}>{filteredEvents.length}</Text></View> : null}
      <CompactEventList
        baseUrl={baseUrl}
        events={visibleEvents}
        onOpenEvent={openEvent}
      />
      {filteredEvents.length > eventPageSize ? (
        <Pressable
          accessibilityLabel={
            allFilteredEventsVisible ? "收起活动" : "查看更多活动"
          }
          accessibilityRole="button"
          onPress={() =>
            isCurrent() && setVisibleEventCount((current) =>
              allFilteredEventsVisible
                ? eventPageSize
                : Math.min(current + eventPageSize, filteredEvents.length)
            )
          }
          style={({ pressed }) => [
            styles.showMoreEventsButton,
            pressed ? styles.eventCardPressed : null
          ]}
        >
          <Text style={styles.showMoreEventsText}>
            {allFilteredEventsVisible ? "收起活动" : "查看更多活动"}
          </Text>
          <Ionicons
            color={colors.accent}
            name={allFilteredEventsVisible ? "chevron-up" : "chevron-down"}
            size={18}
          />
        </Pressable>
      ) : null}
      {events.length > 0 && filteredEvents.length === 0 ? (
        <EmptyState
          message="换个关键词，或清掉状态、地点和主题筛选。"
          title="没有匹配的活动"
        />
      ) : null}
      </> : null}
    </ScrollView>
    <OrbitTabBar active="events" />
    </SafeAreaView>
  );
}

function AuthenticatedEventValueRecommendations({
  baseUrl,
  events,
  onOpenEvent,
  onRegisterEvent,
  scopeKey,
  isScopeCurrent
}: {
  baseUrl: string;
  events: EventSummary[];
  onOpenEvent: (id: string) => void;
  onRegisterEvent: (id: string) => void;
  scopeKey: string;
  isScopeCurrent: () => boolean;
}) {
  const client = useOrbitApiClient({ scopeKey });
  const [readAttempt, setReadAttempt] = useState(0);
  const rawState = useApiResource<unknown>(
    eventValueRecommendationsPath({ limit: 3 }),
    (data) => eventValueRecommendationsToView(data).recommendations.length === 0,
    { scopeKey: JSON.stringify([scopeKey, readAttempt]) }
  );
  const recommendationsState = validateApiResourceState(rawState, eventRecommendationsSchema);
  const mounted = useRef(true);
  const activeScope = useRef(isScopeCurrent);
  activeScope.current = isScopeCurrent;
  const acceptController = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; acceptController.current?.abort(); acceptController.current = null; };
  }, []);
  function isCurrent() { return mounted.current && activeScope.current(); }
  function retryRecommendations() { if (isCurrent()) setReadAttempt(value => value + 1); }
  const [acceptedRecommendation, setAcceptedRecommendation] =
    useState<EventValueRecommendationAcceptanceView | null>(null);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [pendingAcceptEventId, setPendingAcceptEventId] = useState<string | null>(
    null
  );

  async function acceptEventRecommendation(
    recommendation: EventValueRecommendationCardView
  ) {
    if (!isCurrent() || acceptController.current || !events.some(event => event.id === recommendation.id)) return;
    const controller = new AbortController();
    acceptController.current = controller;
    setPendingAcceptEventId(recommendation.id);
    setAcceptedRecommendation(null);
    setAcceptError(null);

    try {
      const result = await client.post<unknown>(
        eventValueRecommendationAcceptPath(recommendation.id),
        { signal: controller.signal }
      );
      if (!isCurrent() || controller.signal.aborted) return;
      const parsed = result.success && result.status >= 200 && result.status < 300
        ? eventRecommendationAcceptanceSchema.safeParse(result.data) : null;
      if (parsed?.success && parsed.data.acceptedEvent.eventId === recommendation.id) {
        setAcceptedRecommendation(eventValueRecommendationAcceptanceToView(parsed.data));
        retryRecommendations();
      } else {
        setAcceptError(result.success ? "未能确认推荐选择，请重试。" : result.error.message);
      }
    } catch {
      if (isCurrent() && !controller.signal.aborted) setAcceptError("未能确认推荐选择，请重试。");
    } finally {
      if (acceptController.current === controller) acceptController.current = null;
      if (isCurrent() && !controller.signal.aborted) setPendingAcceptEventId(null);
    }
  }

  return (
    <EventValueRecommendationsModule
      acceptError={acceptError}
      acceptedRecommendation={acceptedRecommendation}
      baseUrl={baseUrl}
      events={events}
      onAcceptEvent={acceptEventRecommendation}
      onOpenEvent={id => { if (isCurrent()) onOpenEvent(id); }}
      onRegisterEvent={id => { if (isCurrent()) onRegisterEvent(id); }}
      onRetry={retryRecommendations}
      pendingAcceptEventId={pendingAcceptEventId}
      state={recommendationsState}
    />
  );
}

function EventValueRecommendationsModule({
  acceptError,
  acceptedRecommendation,
  baseUrl,
  events,
  onAcceptEvent,
  onOpenEvent,
  onRegisterEvent,
  onRetry,
  pendingAcceptEventId,
  state
}: {
  acceptError: string | null;
  acceptedRecommendation: EventValueRecommendationAcceptanceView | null;
  baseUrl: string;
  events: EventSummary[];
  onAcceptEvent: (recommendation: EventValueRecommendationCardView) => void;
  onOpenEvent: (id: string) => void;
  onRegisterEvent: (id: string) => void;
  onRetry: () => void;
  pendingAcceptEventId: string | null;
  state: ApiResourceState<z.infer<typeof eventRecommendationsSchema>>;
}) {
  const { styles } = useStyles();
  const data = state.kind === "success" || state.kind === "empty" ? state.data : null;
  const view = data ? eventValueRecommendationsToView(data) : null;
  const eventById = eventSummaryById(events);
  const currentRecommendations = view?.recommendations.filter((recommendation) =>
    eventById.has(recommendation.id)
  ) ?? [];
  const noticeTitle = state.kind === "loading" ? "正在读取推荐"
    : state.kind === "failure" || state.kind === "offline" ? "暂时取不到推荐"
    : data?.state === "pending" ? "推荐还在准备中"
    : data?.state === "empty" ? "暂无活动推荐"
    : currentRecommendations.length === 0 ? "当前筛选下没有推荐活动" : null;

  return (
    <View style={styles.recommendationSection}>
      {noticeTitle ? <View style={styles.recommendationNotice}>
        <Text accessibilityRole="header" style={styles.recommendationNoticeTitle}>{noticeTitle}</Text>
        {state.kind === "failure" || state.kind === "offline" ? <Text style={styles.recommendationBody}>{state.error.message}</Text> : null}
        {data?.state === "success" && currentRecommendations.length === 0 ? <Text style={styles.recommendationBody}>换个筛选条件，或切到全部查看公开活动。</Text> : null}
        {state.kind !== "loading" ? <Pressable accessibilityRole="button" accessibilityLabel="重新读取推荐" onPress={onRetry} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>重新读取推荐</Text></Pressable> : null}
      </View> : null}
      {currentRecommendations.length > 0 ? <>
      <SectionHeader
        detail="根据你的目标和时间安排"
        title="为你推荐"
      />
      <EventRecommendationRail
        baseUrl={baseUrl}
        eventById={eventById}
        onAcceptEvent={onAcceptEvent}
        onOpenEvent={onOpenEvent}
        pendingAcceptEventId={pendingAcceptEventId}
        recommendations={currentRecommendations}
      />
      </> : null}
      {acceptError ? <Text style={styles.recommendationError}>{acceptError}</Text> : null}
      {acceptedRecommendation ? (
        <EventValueRecommendationAcceptedCard
          onOpenEvent={() => onOpenEvent(acceptedRecommendation.eventId)}
          onRegister={() => onRegisterEvent(acceptedRecommendation.eventId)}
          view={acceptedRecommendation}
        />
      ) : null}
    </View>
  );
}

function EventRecommendationRail({
  baseUrl,
  eventById,
  onAcceptEvent,
  onOpenEvent,
  pendingAcceptEventId,
  recommendations
}: {
  baseUrl: string;
  eventById: Map<string, EventSummary>;
  onAcceptEvent: (recommendation: EventValueRecommendationCardView) => void;
  onOpenEvent: (id: string) => void;
  pendingAcceptEventId: string | null;
  recommendations: EventValueRecommendationCardView[];
}) {
  const { styles } = useStyles();
  return (
    <ScrollView
      contentContainerStyle={styles.recommendationRailContent}
      horizontal
      showsHorizontalScrollIndicator={false}
    >
      {recommendations.map((recommendation) => {
        const event = eventById.get(recommendation.id);
        const recommendationCoverPath =
          event?.coverPath ?? "/orbit-covers/meeting.jpg";

        return (
          <EventRecommendationCard
            baseUrl={baseUrl}
            coverPath={recommendationCoverPath}
            event={event}
            key={recommendation.id}
            onAccept={() => onAcceptEvent(recommendation)}
            onOpen={() => onOpenEvent(recommendation.id)}
            pending={pendingAcceptEventId === recommendation.id}
            recommendation={recommendation}
          />
        );
      })}
    </ScrollView>
  );
}

function EventRecommendationCard({
  baseUrl,
  coverPath,
  event,
  onAccept,
  onOpen,
  pending,
  recommendation
}: {
  baseUrl: string;
  coverPath?: string | undefined;
  event?: EventSummary | undefined;
  onAccept: () => void;
  onOpen: () => void;
  pending: boolean;
  recommendation: EventValueRecommendationCardView;
}) {
  const { styles } = useStyles();
  return (
    <View style={styles.recommendationCard}>
      {coverPath ? (
        <ImageBackground
          imageStyle={styles.recommendationCoverImage}
          source={{ uri: assetUrl(baseUrl, coverPath) }}
          style={styles.recommendationCoverFrame}
        >
          <View style={styles.recommendationCoverOverlay} />
          <View style={styles.recommendationCoverContent}>
            <View style={styles.recommendationCoverScore}>
              <Text style={styles.recommendationCoverScoreText}>
                {recommendation.scoreLabel}
              </Text>
              <Text style={styles.recommendationCoverBandText}>
                {recommendation.scoreBandLabel}
              </Text>
            </View>
            <Text style={styles.recommendationCoverTitle}>
              {event?.title ?? recommendation.title}
            </Text>
          </View>
        </ImageBackground>
      ) : (
        <View style={styles.recommendationTopRow}>
          <Text style={styles.recommendationTitle}>
            {event?.title ?? recommendation.title}
          </Text>
          <View style={styles.recommendationScoreBlock}>
            <Text style={styles.recommendationScore}>
              {recommendation.scoreLabel}
            </Text>
            <Text style={styles.recommendationBand}>
              {recommendation.scoreBandLabel}
            </Text>
          </View>
        </View>
      )}
      <View style={styles.recommendationCardBody}>
        <Text style={styles.eventDetail}>
          {event
            ? [event.startsAt, event.location].filter(Boolean).join(" · ")
            : recommendation.detail}
        </Text>
        <Text style={styles.recommendationBody}>
          {recommendation.reason}
        </Text>
        <View style={styles.recommendationActionRow}>
          <Pressable
            accessibilityRole="button"
            onPress={onOpen}
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed ? styles.eventCardPressed : null
            ]}
          >
            <Text style={styles.secondaryButtonText}>查看活动</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={pending}
            onPress={onAccept}
            style={({ pressed }) => [
              styles.primaryButton,
              pending ? styles.disabled : null,
              pressed ? styles.eventCardPressed : null
            ]}
          >
            <Text style={styles.primaryButtonText}>
              {pending ? "记录中" : "记下推荐"}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function EventValueRecommendationAcceptedCard({
  onOpenEvent,
  onRegister,
  view
}: {
  onOpenEvent: () => void;
  onRegister: () => void;
  view: EventValueRecommendationAcceptanceView;
}) {
  const { styles } = useStyles();
  return (
    <View style={styles.acceptedCard}>
      <Text style={styles.recommendationTitle}>{view.title}</Text>
      <Text style={styles.eventDetail}>{view.detail}</Text>
      <View style={styles.recommendationTopRow}>
        <Text style={styles.recommendationBand}>{view.scoreLabel}</Text>
        <Text style={styles.safetyText}>{view.safetyLabel}</Text>
      </View>
      <Text style={styles.recommendationBody}>{view.nextAction}</Text>
      <View style={styles.recommendationActionRow}>
        <Pressable
          accessibilityRole="button"
          onPress={onOpenEvent}
          style={({ pressed }) => [
            styles.secondaryButton,
            pressed ? styles.eventCardPressed : null
          ]}
        >
          <Text style={styles.secondaryButtonText}>查看活动</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onRegister}
          style={({ pressed }) => [
            styles.primaryButton,
            pressed ? styles.eventCardPressed : null
          ]}
        >
          <Text style={styles.primaryButtonText}>{"去报名"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.surface },
  pageContent: { alignSelf: "center", width: "100%", maxWidth: layout.contentMax, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 140 },
  pageHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 14 },
  pageTitle: { color: colors.ink, fontFamily: eventFont, fontSize: 30, fontWeight: "900", letterSpacing: -0.6, lineHeight: 38, flexShrink: 1 },
  catalogueTabs: { flexDirection: "row", gap: 6, borderBottomWidth: 1, borderBottomColor: colors.border, marginTop: 12 },
  catalogueTab: { minHeight: 44, minWidth: 44, alignItems: "flex-start", justifyContent: "flex-end", marginBottom: -1 },
  catalogueTabLabel: { paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: "transparent" },
  catalogueTabSelected: { borderBottomColor: colors.ink },
  catalogueTabText: { color: colors.text3, fontFamily: eventFont, fontSize: 14, lineHeight: 20 },
  catalogueTabTextSelected: { color: colors.ink, fontWeight: "800" },
  filterButtons: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  filterButton: { minHeight: 44, minWidth: 44, maxWidth: "100%", flexShrink: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: colors.border, borderRadius: 8 },
  filterButtonText: { color: colors.ink, fontFamily: eventFont, fontSize: 12, lineHeight: 17, flexShrink: 1 },
  resultsHeader: { marginTop: 18, marginBottom: 4, flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8 },
  resultCount: { color: colors.accent, fontFamily: eventFont, fontSize: 12, lineHeight: 17, fontWeight: "700" },
  acceptedCard: {
    backgroundColor: colors.liveSoft,
    borderColor: colors.border,
    borderRadius: radius.control,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md
  },
  disabled: {
    opacity: 0.54
  },
  discoveryControls: {
    gap: 0
  },
  discoveryChip: {
    ...createControlStyles(colors).chip
  },
  discoveryChipActive: {
    ...createControlStyles(colors).selectedChip
  },
  discoveryChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  discoveryChipText: {
    ...createControlStyles(colors).chipText
  },
  discoveryChipTextActive: {
    ...createControlStyles(colors).selectedChipText
  },
  discoveryIconButton: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    width: 44
  },
  discoverySearchInput: {
    color: colors.text,
    flex: 1,
    fontFamily: eventFont,
    fontSize: 14,
    minWidth: 0,
    paddingVertical: 0
  },
  discoverySearchRow: {
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderRadius: 10,
    flexDirection: "row",
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 12
  },
  expandedFilters: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    gap: spacing.md,
    marginTop: 12,
    paddingTop: spacing.md
  },
  filterRailContent: {
    gap: spacing.sm,
    paddingRight: spacing.lg
  },
  filterRailGroup: {
    gap: spacing.sm
  },
  filterRailLabel: {
    color: colors.text3,
    fontSize: typography.caption,
    fontWeight: "800",
    lineHeight: 17
  },
  eventCardPressed: {
    opacity: 0.86,
    transform: [{ translateY: 0.5 }]
  },
  eventDetail: {
    color: colors.text3,
    fontSize: typography.small,
    lineHeight: 20
  },
  eventCenterEntry: {
    alignItems: "center",
    flexDirection: "row",
    gap: 2,
    flexShrink: 1,
    minHeight: 44,
    paddingHorizontal: 0,
    backgroundColor: "transparent",
    paddingVertical: 4
  },
  eventCenterEntryTitle: {
    color: colors.accent,
    flexShrink: 1,
    fontFamily: eventFont,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 20
  },
  showMoreEventsButton: {
    alignItems: "center",
    alignSelf: "center",
    flexDirection: "row",
    gap: spacing.xs,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: spacing.lg
  },
  showMoreEventsText: {
    color: colors.accent,
    fontSize: typography.body,
    fontWeight: "700"
  },
  eventList: {
    backgroundColor: "transparent",
    paddingVertical: 0
  },
  eventRow: {
    borderBottomColor: colors.border2,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 14,
    minHeight: 99,
    backgroundColor: "transparent",
    paddingVertical: 14
  },
  eventRowContent: {
    flex: 1,
    gap: 3,
    minWidth: 0
  },
  eventRowDate: {
    color: colors.ink,
    fontFamily: eventFont,
    fontSize: 12,
    lineHeight: 17
  },
  eventRowFooter: {
    alignItems: "flex-end",
    flexShrink: 0,
    gap: 3,
    justifyContent: "space-between"
  },
  eventRowImageFrame: {
    backgroundColor: colors.surface3,
    width: 92,
    height: 70,
    flexShrink: 0,
    borderRadius: 8
  },
  eventRowLocation: {
    color: colors.text3,
    flex: 1,
    minWidth: 0,
    fontFamily: eventFont,
    fontSize: 12,
    lineHeight: 17
  },
  eventRowMeta: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
    minWidth: 0
  },
  eventRowStatus: {
    color: colors.accent,
    fontFamily: eventFont,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700"
  },
  eventRowTitle: {
    color: colors.ink,
    fontFamily: eventFont,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "800",
    letterSpacing: -0.15
  },
  recommendationActionRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  recommendationBand: {
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 16,
    textAlign: "right"
  },
  recommendationBody: {
    color: colors.text,
    fontSize: typography.small,
    lineHeight: 20
  },
  recommendationCard: {
    backgroundColor: "transparent",
    paddingVertical: spacing.md,
    width: 260,
    maxWidth: "100%"
  },
  recommendationCardBody: {
    gap: spacing.sm,
    padding: spacing.md
  },
  recommendationCoverBandText: {
    color: colors.text2,
    fontSize: 10,
    fontWeight: "800",
    lineHeight: 13
  },
  recommendationCoverContent: {
    justifyContent: "space-between",
    padding: spacing.md,
    gap: spacing.lg
  },
  recommendationCoverFrame: {
    backgroundColor: colors.surface3,
    overflow: "hidden",
    width: "100%",
    minHeight: 132,
    borderRadius: radius.card
  },
  recommendationCoverImage: {
    borderRadius: radius.control
  },
  recommendationCoverOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(8,8,12,0.38)"
  },
  recommendationCoverScore: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.92)",
    borderColor: "rgba(255,255,255,0.88)",
    borderRadius: radius.control,
    borderWidth: 1,
    gap: 1,
    minWidth: 66,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs
  },
  recommendationCoverScoreText: {
    color: colors.imageBadgeText,
    fontSize: typography.caption,
    fontWeight: "900",
    lineHeight: 16
  },
  recommendationCoverTitle: {
    color: colors.onImage,
    ...textStyles.section
  },
  recommendationError: {
    color: colors.rose,
    fontSize: typography.caption,
    lineHeight: 17
  },
  recommendationNotice: {
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.control,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md
  },
  recommendationNoticeTitle: {
    color: colors.ink,
    fontSize: typography.body,
    fontWeight: "800",
    lineHeight: 20
  },
  recommendationRailContent: {
    gap: spacing.md,
    paddingRight: spacing.lg
  },
  recommendationSection: {
    gap: spacing.md
  },
  recommendationScore: {
    color: colors.ink,
    fontSize: typography.small,
    fontWeight: "800",
    lineHeight: 18,
    textAlign: "right"
  },
  recommendationScoreBlock: {
    alignItems: "flex-end",
    minWidth: 62
  },
  recommendationTitle: {
    color: colors.ink,
    flex: 1,
    ...textStyles.listTitle
  },
  recommendationTopRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between"
  },
  primaryButton: {
    ...createControlStyles(colors).primaryButton,
    flexDirection: "row",
    gap: spacing.sm,
    maxWidth: "100%"
  },
  primaryButtonText: {
    ...createControlStyles(colors).primaryButtonText
  },
  safetyText: {
    color: colors.text3,
    flex: 1,
    fontSize: typography.caption,
    lineHeight: 16,
    textAlign: "right"
  },
  secondaryButton: {
    ...createControlStyles(colors).secondaryButton,
    flexDirection: "row",
    gap: spacing.sm,
    maxWidth: "100%"
  },
  secondaryButtonText: {
    ...createControlStyles(colors).secondaryButtonText
  },
  sectionAction: {
    alignItems: "center",
    flexDirection: "row",
    minHeight: 44,
    paddingLeft: spacing.md
  },
  sectionActionText: {
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: "800"
  },
  sectionDetail: {
    color: colors.text3,
    fontSize: typography.caption,
    lineHeight: 17
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between"
  },
  sectionHeaderCopy: {
    flex: 1,
    gap: spacing.xxs,
    minWidth: 0
  },
  sectionTitle: {
    color: colors.ink,
    fontFamily: eventFont,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "800"
  },
}));
