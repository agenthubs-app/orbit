import { Ionicons } from "@expo/vector-icons";
import { type Href, useRouter } from "expo-router";
import { useState } from "react";
import {
  Image,
  ImageBackground,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import {
  eventValueRecommendationAcceptPath,
  eventValueRecommendationsPath,
  ORBIT_API_ENDPOINTS
} from "../../api/endpoints";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { AppScreen } from "../../components/AppScreen";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { colors, radius, spacing, typography } from "../../design/tokens";
import {
  useApiResource,
  type ApiResourceState
} from "../../hooks/useApiResource";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import {
  eventDiscoveryFilterCounts,
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

function eventDateChip(startsAt: string): { date: string; detail: string } {
  const [date = "", weekday = "", time = ""] = startsAt.split(/\s+/u);

  return {
    date: date || "待定",
    detail: [weekday, time].filter(Boolean).join(" ")
  };
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
    .sort((left, right) => left.localeCompare(right, "zh-CN"))
    .slice(0, 8);
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
  const subtitle = publicEventSubtitle(event.subtitle);
  const status = publicEventStatus(event.status);

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
        <Text numberOfLines={1} style={styles.eventRowDate}>
          {event.startsAt}
        </Text>
        <Text numberOfLines={2} style={styles.eventRowTitle}>
          {event.title}
        </Text>
        <View style={styles.eventRowMeta}>
          <Ionicons color={colors.text3} name="location-outline" size={14} />
          <Text numberOfLines={1} style={styles.eventRowLocation}>
            {[event.location, subtitle].filter(Boolean).join(" · ") || "地点待定"}
          </Text>
        </View>
        <View style={styles.eventRowFooter}>
          <Text numberOfLines={1} style={styles.eventRowStatus}>
            {status}
          </Text>
          <Ionicons color={colors.text4} name="chevron-forward" size={16} />
        </View>
      </View>
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
  return (
    <Pressable
      accessibilityState={{ selected }}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.discoveryChip,
        selected ? styles.discoveryChipActive : null,
        pressed ? styles.eventCardPressed : null
      ]}
    >
      <Text
        numberOfLines={1}
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
  label,
  onChange,
  values
}: {
  activeValue: string;
  label: string;
  onChange: (value: string) => void;
  values: string[];
}) {
  if (values.length === 0) {
    return null;
  }

  return (
    <View style={styles.filterRailGroup}>
      <Text style={styles.filterRailLabel}>{label}</Text>
      <ScrollView
        contentContainerStyle={styles.filterRailContent}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        <EventFilterChip
          label="全部"
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
  topics
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
}) {
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const hasQuery = query.trim().length > 0;
  const selectedFilterCount = Number(Boolean(locationFilter)) + Number(Boolean(topicFilter));

  return (
    <View style={styles.discoveryControls}>
      <View style={styles.discoverySearchRow}>
        <Ionicons color={colors.text3} name="search-outline" size={18} />
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={onQueryChange}
          placeholder="搜索活动、地点或主题"
          placeholderTextColor={colors.text4}
          returnKeyType="search"
          style={styles.discoverySearchInput}
          value={query}
        />
        {hasQuery ? (
          <Pressable
            accessibilityLabel="清空活动搜索"
            accessibilityRole="button"
            onPress={() => onQueryChange("")}
            style={styles.discoveryIconButton}
          >
            <Ionicons color={colors.text3} name="close-circle" size={19} />
          </Pressable>
        ) : null}
        <Pressable
          accessibilityLabel="筛选活动"
          accessibilityRole="button"
          accessibilityState={{ expanded: filtersExpanded }}
          onPress={() => setFiltersExpanded((current) => !current)}
          style={[
            styles.discoveryFilterButton,
            selectedFilterCount > 0 ? styles.discoveryFilterButtonActive : null
          ]}
        >
          <Ionicons
            color={selectedFilterCount > 0 ? colors.onAccent : colors.text2}
            name="options-outline"
            size={17}
          />
          {selectedFilterCount > 0 ? (
            <Text style={styles.discoveryFilterCount}>{selectedFilterCount}</Text>
          ) : null}
        </Pressable>
      </View>
      <ScrollView
        contentContainerStyle={styles.statusRailContent}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        {eventDiscoveryStatusFilters.map((filter) => (
          <EventFilterChip
            count={counts[filter]}
            key={filter}
            label={eventDiscoveryStatusLabels[filter]}
            onPress={() => onStatusChange(filter)}
            selected={statusFilter === filter}
          />
        ))}
      </ScrollView>
      {filtersExpanded ? (
        <View style={styles.expandedFilters}>
          <EventFilterRail
            activeValue={locationFilter}
            label="地点"
            onChange={onLocationChange}
            values={locations}
          />
          <EventFilterRail
            activeValue={topicFilter}
            label="主题"
            onChange={onTopicChange}
            values={topics}
          />
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
      <Ionicons color={colors.accent} name="options-outline" size={17} />
      <Text style={styles.eventCenterEntryTitle}>我负责的活动</Text>
      <Ionicons color={colors.text3} name="chevron-forward" size={16} />
    </Pressable>
  );
}

export function EventsScreen() {
  const router = useRouter();
  const { baseUrl } = useOrbitApiBaseUrl();
  const { signedIn } = useOrbitAuthSession();
  const state = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.publicEvents,
    (data) => eventsToSummaries(data).length === 0
  );
  const [recommendationRefreshKey, setRecommendationRefreshKey] = useState(0);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<EventDiscoveryStatusFilter>("upcoming");
  const [topicFilter, setTopicFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [visibleEventCount, setVisibleEventCount] = useState(eventPageSize);
  const refreshing = state.refreshing;
  const events = state.kind === "success" ? eventsToSummaries(state.data) : [];
  const discoveryEvents = events.map((event) => ({
    ...event,
    topics: discoveryTopicsForEvent(event)
  }));
  const filteredEvents = filterEventSummaries(discoveryEvents, {
    query,
    status: statusFilter,
    topic: topicFilter
  }).filter((event) => !locationFilter || event.location === locationFilter);
  const visibleEvents = filteredEvents.slice(0, visibleEventCount);
  const allFilteredEventsVisible = visibleEventCount >= filteredEvents.length;
  const discoveryTopics = [
    ...new Set(discoveryEvents.flatMap((event) => event.topics))
  ].slice(0, 8);
  const discoveryLocations = eventDiscoveryLocations(discoveryEvents);
  const discoveryCounts = eventDiscoveryFilterCounts(discoveryEvents);
  const resultLabel = `${filteredEvents.length} 场活动`;
  const sectionTitle = query.trim()
    ? "搜索结果"
    : statusFilter === "upcoming"
      ? "即将开始"
      : statusFilter === "active"
        ? "正在进行"
        : statusFilter === "ended"
          ? "历史活动"
          : "全部活动";
  const showRecommendations =
    signedIn &&
    !query.trim() &&
    statusFilter === "upcoming" &&
    !topicFilter &&
    !locationFilter;

  function refreshAll() {
    state.refresh();
    setRecommendationRefreshKey((current) => current + 1);
  }

  function openEvent(id: string) {
    router.push({
      params: { id },
      pathname: "/events/[id]"
    });
  }

  function openEventRegistration(id: string) {
    router.push(`/events/${encodeURIComponent(id)}/register` as Href);
  }

  function changeQuery(nextQuery: string) {
    setQuery(nextQuery);
    setVisibleEventCount(eventPageSize);
  }

  function changeStatusFilter(nextStatus: EventDiscoveryStatusFilter) {
    setStatusFilter(nextStatus);
    setVisibleEventCount(eventPageSize);
  }

  function changeTopicFilter(nextTopic: string) {
    setTopicFilter(nextTopic);
    setVisibleEventCount(eventPageSize);
  }

  function changeLocationFilter(nextLocation: string) {
    setLocationFilter(nextLocation);
    setVisibleEventCount(eventPageSize);
  }

  return (
    <AppScreen
      eyebrow="发现活动"
      refreshControl={
        <RefreshControl
          onRefresh={refreshAll}
          refreshing={refreshing}
          tintColor={colors.accent}
        />
      }
      title="活动"
    >
      {state.kind === "loading" ? <LoadingState /> : null}
      {state.kind === "offline" ? (
        <ErrorState message={state.error.message} title="服务器连不上" />
      ) : null}
      {state.kind === "failure" ? (
        <ErrorState message={state.error.message} />
      ) : null}
      {state.kind === "empty" ? (
        <EmptyState message="报名、导入或推荐的活动会出现在这里。" title="暂无活动" />
      ) : null}
      {events.length > 0 ? (
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
        />
      ) : null}
      {showRecommendations ? (
        <AuthenticatedEventValueRecommendations
          baseUrl={baseUrl}
          events={filteredEvents}
          key={recommendationRefreshKey}
          onOpenEvent={openEvent}
          onRegisterEvent={openEventRegistration}
        />
      ) : null}
      {events.length > 0 ? (
        <SectionHeader detail={resultLabel} title={sectionTitle} />
      ) : null}
      {signedIn && events.length > 0 ? (
        <EventCenterEntry
          onPress={() => router.push("/events/center" as Href)}
        />
      ) : null}
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
            setVisibleEventCount((current) =>
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
    </AppScreen>
  );
}

function AuthenticatedEventValueRecommendations({
  baseUrl,
  events,
  onOpenEvent,
  onRegisterEvent
}: {
  baseUrl: string;
  events: EventSummary[];
  onOpenEvent: (id: string) => void;
  onRegisterEvent: (id: string) => void;
}) {
  const client = useOrbitApiClient();
  const recommendationsState = useApiResource<unknown>(
    eventValueRecommendationsPath({ limit: 3 }),
    (data) => eventValueRecommendationsToView(data).recommendations.length === 0
  );
  const [acceptedRecommendation, setAcceptedRecommendation] =
    useState<EventValueRecommendationAcceptanceView | null>(null);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [pendingAcceptEventId, setPendingAcceptEventId] = useState<string | null>(
    null
  );

  async function acceptEventRecommendation(
    recommendation: EventValueRecommendationCardView
  ) {
    setPendingAcceptEventId(recommendation.id);
    setAcceptedRecommendation(null);
    setAcceptError(null);

    const result = await client.post<unknown>(
      eventValueRecommendationAcceptPath(recommendation.id)
    );

    if (result.success) {
      setAcceptedRecommendation(
        eventValueRecommendationAcceptanceToView(result.data)
      );
      recommendationsState.refresh();
    } else {
      setAcceptError(result.error.message);
    }

    setPendingAcceptEventId(null);
  }

  if (recommendationsState.kind === "loading") {
    return null;
  }

  return (
    <EventValueRecommendationsModule
      acceptError={acceptError}
      acceptedRecommendation={acceptedRecommendation}
      baseUrl={baseUrl}
      events={events}
      onAcceptEvent={acceptEventRecommendation}
      onOpenEvent={onOpenEvent}
      onRegisterEvent={onRegisterEvent}
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
  pendingAcceptEventId: string | null;
  state: ApiResourceState<unknown>;
}) {
  if (state.kind === "failure" || state.kind === "offline") {
    return (
      <View style={styles.recommendationNotice}>
        <Text style={styles.recommendationNoticeTitle}>暂时取不到推荐</Text>
        <Text style={styles.recommendationBody}>活动列表还能正常看，稍后再刷新推荐。</Text>
      </View>
    );
  }

  if (state.kind === "loading") {
    return null;
  }

  const view = eventValueRecommendationsToView(state.data);
  const eventById = eventSummaryById(events);
  const currentRecommendations = view.recommendations.filter((recommendation) =>
    eventById.has(recommendation.id)
  );

  if (currentRecommendations.length === 0) {
    return null;
  }

  return (
    <View style={styles.recommendationSection}>
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
            <Text numberOfLines={2} style={styles.recommendationCoverTitle}>
              {event?.title ?? recommendation.title}
            </Text>
          </View>
        </ImageBackground>
      ) : (
        <View style={styles.recommendationTopRow}>
          <Text numberOfLines={2} style={styles.recommendationTitle}>
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
        <Text numberOfLines={1} style={styles.eventDetail}>
          {event
            ? [event.startsAt, event.location].filter(Boolean).join(" · ")
            : recommendation.detail}
        </Text>
        <Text numberOfLines={2} style={styles.recommendationBody}>
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

const styles = StyleSheet.create({
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
    gap: spacing.md
  },
  discoveryChip: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border2,
    borderRadius: radius.pill,
    borderWidth: 1,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    justifyContent: "center"
  },
  discoveryChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  discoveryChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  discoveryChipText: {
    color: colors.text2,
    fontSize: typography.caption,
    fontWeight: "800",
    lineHeight: 17
  },
  discoveryChipTextActive: {
    color: colors.onAccent
  },
  discoveryFilterButton: {
    alignItems: "center",
    backgroundColor: colors.surface3,
    borderRadius: radius.control,
    flexDirection: "row",
    height: 44,
    justifyContent: "center",
    minWidth: 44,
    paddingHorizontal: spacing.sm
  },
  discoveryFilterButtonActive: {
    backgroundColor: colors.accent
  },
  discoveryFilterCount: {
    color: colors.onAccent,
    fontSize: 10,
    fontWeight: "900",
    marginLeft: spacing.xs
  },
  discoveryIconButton: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    width: 44
  },
  discoveryClearButton: {
    alignItems: "center",
    height: 32,
    justifyContent: "center",
    width: 32
  },
  discoveryMetaRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  discoveryPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg
  },
  discoveryResultLabel: {
    color: colors.text3,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 17
  },
  discoverySearchInput: {
    color: colors.text,
    flex: 1,
    fontSize: typography.body,
    minWidth: 0,
    paddingVertical: 0
  },
  discoverySearchRow: {
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.md
  },
  expandedFilters: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    gap: spacing.md,
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
  statusRailContent: {
    gap: spacing.sm,
    paddingRight: spacing.lg
  },
  discoveryTopicChip: {
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    minHeight: 30,
    paddingHorizontal: spacing.md,
    justifyContent: "center"
  },
  discoveryTopicChipText: {
    color: colors.text2,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 16
  },
  discoveryTopicRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs
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
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  eventCenterEntryCopy: {
    flex: 1,
    gap: spacing.xxs,
    minWidth: 0
  },
  eventCenterEntryDetail: {
    color: colors.text3,
    fontSize: typography.caption,
    lineHeight: 17
  },
  eventCenterEntryIcon: {
    alignItems: "center",
    backgroundColor: colors.accentSofter,
    borderRadius: radius.control,
    height: 40,
    justifyContent: "center",
    width: 40
  },
  eventCenterEntryTitle: {
    color: colors.ink,
    flex: 1,
    fontSize: typography.body,
    fontWeight: "800",
    lineHeight: 20
  },
  eventImageList: {
    gap: spacing.lg
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
  eventImageCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: "hidden"
  },
  eventImageCopy: {
    gap: spacing.xs
  },
  eventImageFrame: {
    backgroundColor: colors.surface3,
    height: 240,
    overflow: "hidden",
    width: "100%"
  },
  eventImage: {
    borderRadius: radius.lg
  },
  eventImageContent: {
    ...StyleSheet.absoluteFill,
    justifyContent: "space-between",
    padding: spacing.lg
  },
  eventImageOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(8,8,12,0.34)"
  },
  eventImageBottom: {
    gap: spacing.md,
    minWidth: 0
  },
  eventImageTopRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between"
  },
  eventImageCta: {
    color: colors.onAccent,
    fontSize: typography.caption,
    fontWeight: "800",
    lineHeight: 17
  },
  eventImageDateChip: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.92)",
    borderColor: "rgba(255,255,255,0.88)",
    borderRadius: radius.control,
    borderWidth: 1,
    flexShrink: 0,
    minWidth: 74,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs
  },
  eventImageDateDetail: {
    color: colors.text2,
    fontSize: 10,
    fontWeight: "700",
    lineHeight: 13
  },
  eventImageDateValue: {
    color: colors.ink,
    fontSize: typography.caption,
    fontWeight: "900",
    lineHeight: 17
  },
  eventImageDetail: {
    color: "rgba(255,255,255,0.86)",
    flexShrink: 1,
    fontSize: typography.small,
    fontWeight: "700",
    lineHeight: 19,
    minWidth: 0
  },
  eventImageFooter: {
    alignItems: "center",
    borderTopColor: "rgba(255,255,255,0.24)",
    borderTopWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
    paddingTop: spacing.md
  },
  eventImageMetaLine: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
    maxWidth: "100%",
    minWidth: 0
  },
  eventImageMetaRow: {
    gap: spacing.xs
  },
  eventImageStatusPill: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.92)",
    borderColor: "rgba(255,255,255,0.88)",
    borderRadius: radius.pill,
    borderWidth: 1,
    color: colors.accent,
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 14,
    overflow: "hidden",
    paddingHorizontal: spacing.sm,
    paddingVertical: 5
  },
  eventImageSubtitle: {
    color: "rgba(255,255,255,0.78)",
    fontSize: typography.caption,
    fontWeight: "800",
    lineHeight: 16
  },
  eventImageTitle: {
    color: colors.onAccent,
    fontSize: 24,
    fontWeight: "900",
    lineHeight: 30
  },
  eventList: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.control,
    borderWidth: 1,
    overflow: "hidden"
  },
  eventRow: {
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 108,
    padding: spacing.md
  },
  eventRowContent: {
    flex: 1,
    gap: spacing.xxs,
    justifyContent: "center",
    minWidth: 0
  },
  eventRowDate: {
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: "800",
    lineHeight: 16
  },
  eventRowFooter: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between"
  },
  eventRowImageFrame: {
    backgroundColor: colors.surface3,
    borderRadius: radius.control,
    height: 84,
    width: 112
  },
  eventRowLocation: {
    color: colors.text3,
    flex: 1,
    fontSize: typography.caption,
    lineHeight: 16,
    minWidth: 0
  },
  eventRowMeta: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
    minWidth: 0
  },
  eventRowStatus: {
    color: colors.text2,
    flex: 1,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 16
  },
  eventRowTitle: {
    color: colors.ink,
    fontSize: typography.body,
    fontWeight: "800",
    lineHeight: 20
  },
  recommendationAction: {
    color: colors.text,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 17
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
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.control,
    borderWidth: 1,
    overflow: "hidden",
    width: 280
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
    ...StyleSheet.absoluteFill,
    justifyContent: "space-between",
    padding: spacing.md
  },
  recommendationCoverFrame: {
    backgroundColor: colors.surface3,
    height: 132,
    overflow: "hidden",
    width: "100%"
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
    color: colors.ink,
    fontSize: typography.caption,
    fontWeight: "900",
    lineHeight: 16
  },
  recommendationCoverTitle: {
    color: colors.onAccent,
    fontSize: typography.section,
    fontWeight: "900",
    lineHeight: 22
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
  recommendationNextAction: {
    color: colors.text3,
    fontSize: typography.caption,
    lineHeight: 17
  },
  recommendationRow: {
    backgroundColor: colors.surface2,
    borderColor: colors.border2,
    borderRadius: radius.control,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md
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
    fontSize: typography.body,
    fontWeight: "800",
    lineHeight: 20
  },
  recommendationTopRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between"
  },
  primaryButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.accent,
    borderRadius: radius.control,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs
  },
  primaryButtonText: {
    color: colors.onAccent,
    fontSize: typography.caption,
    fontWeight: "800"
  },
  safetyText: {
    color: colors.text3,
    flex: 1,
    fontSize: typography.caption,
    lineHeight: 16,
    textAlign: "right"
  },
  secondaryButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.accentSofter,
    borderRadius: radius.control,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs
  },
  secondaryButtonText: {
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: "800"
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
    fontSize: typography.section,
    fontWeight: "900",
    lineHeight: 22
  },
  statusBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.92)",
    borderColor: "rgba(255,255,255,0.88)",
    borderRadius: radius.pill,
    borderWidth: 1,
    color: colors.accent,
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 14,
    maxWidth: 150,
    overflow: "hidden",
    paddingHorizontal: 7,
    paddingVertical: 5,
    textAlign: "center"
  }
});
