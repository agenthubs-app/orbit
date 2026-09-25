import { Ionicons } from "@expo/vector-icons";
import { type Href, useRouter } from "expo-router";
import { useState } from "react";
import {
  ImageBackground,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { ORBIT_API_ENDPOINTS } from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { radius, spacing, typography, textStyles } from "../../design/tokens";
import { createControlStyles } from "../../design/controls";
import { createThemedStyles, useOrbitTheme } from "../../design/theme";
import { useApiResource } from "../../hooks/useApiResource";
import {
  eventDiscoveryFilterCounts,
  eventDiscoveryTopics,
  filterEventSummaries,
  type EventDiscoveryStatusFilter
} from "../../view-models/events";
import {
  homeEventsToView,
  type HomeEventFilter,
  type HomeEventView
} from "../../view-models/home";

const filterLabels: Record<HomeEventFilter, string> = {
  active: "进行中",
  all: "全部",
  ended: "历史",
  upcoming: "即将"
};

const homeEventFilterOrder: HomeEventFilter[] = [
  "all",
  "upcoming",
  "active",
  "ended"
];

function isReady(
  state: ReturnType<typeof useApiResource<unknown>>
): state is Extract<typeof state, { kind: "empty" | "success" }> {
  return state.kind === "success" || state.kind === "empty";
}

function assetUrl(baseUrl: string, path: string): string {
  if (/^https?:\/\//iu.test(path)) {
    return path;
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl.replace(/\/+$/u, "")}${normalizedPath}`;
}

function homeEventDateChip(startsAt: string): { date: string; detail: string } {
  const [date = "", weekday = "", time = ""] = startsAt.split(/\s+/u);

  return {
    date: date || "待定",
    detail: [weekday, time].filter(Boolean).join(" ")
  };
}

export function HomeScreen() {
  const { colors } = useOrbitTheme();
  const router = useRouter();
  const { baseUrl } = useOrbitApiBaseUrl();
  const [filter, setFilter] = useState<HomeEventFilter>("all");
  const [eventQuery, setEventQuery] = useState("");
  const [eventTopicFilter, setEventTopicFilter] = useState("");
  const eventsState = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.publicEvents,
    () => false
  );
  const events = isReady(eventsState)
    ? homeEventsToView({ events: eventsState.data })
    : null;

  return (
    <AppScreen
      refreshControl={
        <RefreshControl
          onRefresh={eventsState.refresh}
          refreshing={eventsState.refreshing}
          tintColor={colors.accent}
        />
      }
      title="我的活动"
    >
      {eventsState.kind === "loading" ? <LoadingState /> : null}
      {eventsState.kind === "offline" ? (
        <ErrorState message={eventsState.error.message} title="服务器连不上" />
      ) : null}
      {eventsState.kind === "failure" ? (
        <ErrorState message={eventsState.error.message} title="首页不可用" />
      ) : null}
      {events ? (
        <HomeEventsContent
          baseUrl={baseUrl}
          events={events}
          eventQuery={eventQuery}
          eventTopicFilter={eventTopicFilter}
          filter={filter}
          onEventQueryChange={setEventQuery}
          onEventTopicFilterChange={setEventTopicFilter}
          onFilterChange={setFilter}
          onOpenEvent={(eventId) =>
            router.push(`/events/${encodeURIComponent(eventId)}` as Href)
          }
        />
      ) : null}
    </AppScreen>
  );
}

function HomeEventsContent({
  baseUrl,
  events,
  eventQuery,
  eventTopicFilter,
  filter,
  onEventQueryChange,
  onEventTopicFilterChange,
  onFilterChange,
  onOpenEvent
}: {
  baseUrl: string;
  events: HomeEventView[];
  eventQuery: string;
  eventTopicFilter: string;
  filter: HomeEventFilter;
  onEventQueryChange: (query: string) => void;
  onEventTopicFilterChange: (topic: string) => void;
  onFilterChange: (filter: HomeEventFilter) => void;
  onOpenEvent: (eventId: string) => void;
}) {
  const filteredEvents = filterEventSummaries(events, {
    query: eventQuery,
    status: filter,
    topic: eventTopicFilter
  });
  const discoveryTopics = eventDiscoveryTopics(events);
  const discoveryCounts = eventDiscoveryFilterCounts(events);
  const resultLabel =
    filteredEvents.length === events.length
      ? `${events.length} 场活动`
      : `${filteredEvents.length} / ${events.length} 场活动`;

  return (
    <>
      {filteredEvents.length > 0 ? (
        <EventImageList
          baseUrl={baseUrl}
          events={filteredEvents}
          onPress={onOpenEvent}
        />
      ) : events.length === 0 ? (
        <EmptyState message="报名过的活动会出现在这里。" title="暂无活动" />
      ) : null}
      {events.length > 0 ? (
        <HomeEventDiscoveryControls
          counts={discoveryCounts}
          filter={filter}
          onFilterChange={onFilterChange}
          onQueryChange={onEventQueryChange}
          onTopicChange={onEventTopicFilterChange}
          query={eventQuery}
          resultLabel={resultLabel}
          topicFilter={eventTopicFilter}
          topics={discoveryTopics}
        />
      ) : null}
      {events.length > 0 && filteredEvents.length === 0 ? (
        <EmptyState
          message="换个关键词，或清掉状态和主题筛选。"
          title="没有匹配的活动"
        />
      ) : null}
    </>
  );
}

function HomeEventDiscoveryControls({
  counts,
  filter,
  onFilterChange,
  onQueryChange,
  onTopicChange,
  query,
  resultLabel,
  topicFilter,
  topics
}: {
  counts: Record<EventDiscoveryStatusFilter, number>;
  filter: HomeEventFilter;
  onFilterChange: (filter: HomeEventFilter) => void;
  onQueryChange: (query: string) => void;
  onTopicChange: (topic: string) => void;
  query: string;
  resultLabel: string;
  topicFilter: string;
  topics: string[];
}) {
  const { colors, styles } = useStyles();
  const hasQuery = query.trim().length > 0;

  return (
    <View style={styles.homeEventDiscoveryPanel}>
      <View style={styles.homeEventSearchRow}>
        <Ionicons color={colors.text3} name="search-outline" size={18} />
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={onQueryChange}
          placeholder="搜索活动、地点或主题"
          placeholderTextColor={colors.text4}
          returnKeyType="search"
          style={styles.homeEventSearchInput}
          value={query}
        />
        {hasQuery ? (
          <Pressable
            accessibilityLabel="清空活动搜索"
            accessibilityRole="button"
            onPress={() => onQueryChange("")}
            style={styles.homeEventClearButton}
          >
            <Ionicons color={colors.text3} name="close-circle" size={19} />
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.homeEventFilterLabel}>{resultLabel}</Text>
      <View style={styles.filterRow}>
        {homeEventFilterOrder.map((key) => {
          const selected = filter === key;

          return (
            <Pressable
              accessibilityRole="button"
              key={key}
              onPress={() => onFilterChange(key)}
              style={({ pressed }) => [
                styles.filterButton,
                selected ? styles.filterButtonActive : null,
                pressed ? styles.pressed : null
              ]}
            >
              <Text
                style={[
                  styles.filterButtonText,
                  selected ? styles.filterButtonTextActive : null
                ]}
              >
                {filterLabels[key]} {counts[key]}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {topics.length > 0 ? (
        <View style={styles.homeEventTopicRow}>
          {topics.map((topic) => {
            const selected = topicFilter === topic;

            return (
              <Pressable
                accessibilityRole="button"
                key={topic}
                onPress={() => onTopicChange(selected ? "" : topic)}
                style={({ pressed }) => [
                  styles.homeEventTopicButton,
                  selected ? styles.filterButtonActive : null,
                  pressed ? styles.pressed : null
                ]}
              >
                <Text
                  style={[
                    styles.homeEventTopicButtonText,
                    selected ? styles.filterButtonTextActive : null
                  ]}
                >
                  {topic}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function EventImageList({
  baseUrl,
  events,
  onPress
}: {
  baseUrl: string;
  events: HomeEventView[];
  onPress: (eventId: string) => void;
}) {
  const { styles } = useStyles();
  return (
    <View style={styles.homeEventImageList}>
      {events.map((event) => (
        <EventImageCard
          baseUrl={baseUrl}
          event={event}
          key={event.id}
          onPress={onPress}
        />
      ))}
    </View>
  );
}

function EventImageCard({
  baseUrl,
  event,
  onPress
}: {
  baseUrl: string;
  event: HomeEventView;
  onPress: (eventId: string) => void;
}) {
  const { colors, styles } = useStyles();
  const dateChip = homeEventDateChip(event.startsAt);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onPress(event.id)}
      style={({ pressed }) => [
        styles.homeEventImageCard,
        pressed ? styles.pressed : null
      ]}
    >
      <ImageBackground
        imageStyle={styles.homeEventImage}
        source={{ uri: assetUrl(baseUrl, event.coverPath) }}
        style={styles.homeEventImageFrame}
      >
        <View style={styles.homeEventImageOverlay} />
        <View style={styles.homeEventImageContent}>
          <View style={styles.homeEventImageTopRow}>
            <Text style={styles.homeEventImageStatusPill}>
              {filterLabels[event.state]}
            </Text>
            <View style={styles.homeEventImageDateChip}>
              <Text style={styles.homeEventImageDateValue}>
                {dateChip.date}
              </Text>
              {dateChip.detail ? (
                <Text style={styles.homeEventImageDateDetail}>
                  {dateChip.detail}
                </Text>
              ) : null}
            </View>
          </View>
          <View style={styles.homeEventImageBottom}>
            <View style={styles.homeEventImageCopy}>
              {event.subtitle ? (
                <Text style={styles.homeEventImageSubtitle}>
                  {event.subtitle}
                </Text>
              ) : null}
              <Text style={styles.homeEventImageTitle}>
                {event.title}
              </Text>
            </View>
            <View style={styles.homeEventImageMetaRow}>
              <View style={styles.homeEventImageMetaLine}>
                <Ionicons color={colors.onImage} name="time-outline" size={14} />
                <Text style={styles.homeEventImageDetail}>
                  {event.startsAt}
                </Text>
              </View>
              {event.location ? (
                <View style={styles.homeEventImageMetaLine}>
                  <Ionicons color={colors.onImage} name="location-outline" size={14} />
                  <Text style={styles.homeEventImageDetail}>
                    {event.location}
                  </Text>
                </View>
              ) : null}
            </View>
            <View style={styles.homeEventImageFooter}>
              <Text style={styles.homeEventImageDetail}>
                {event.participantCountLabel}
              </Text>
              <Text style={styles.homeEventImageCta}>{event.actionLabel}</Text>
            </View>
          </View>
        </View>
      </ImageBackground>
    </Pressable>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  filterButton: {
    ...createControlStyles(colors).chip
  },
  filterButtonActive: {
    ...createControlStyles(colors).selectedChip
  },
  filterButtonText: {
    ...createControlStyles(colors).chipText
  },
  filterButtonTextActive: {
    ...createControlStyles(colors).selectedChipText
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  homeEventImageCard: {
    backgroundColor: "transparent",
    paddingVertical: spacing.md
  },
  homeEventImageCopy: {
    gap: spacing.xs
  },
  homeEventImageFrame: {
    backgroundColor: colors.surface3,
    overflow: "hidden",
    width: "100%",
    minHeight: 300,
    borderRadius: radius.card
  },
  homeEventImage: {
    borderRadius: radius.lg
  },
  homeEventImageContent: {
    justifyContent: "space-between",
    padding: spacing.lg,
    gap: spacing.xl
  },
  homeEventImageOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(8,8,12,0.34)"
  },
  homeEventImageCta: {
    color: colors.onImage,
    fontSize: typography.caption,
    fontWeight: "800",
    lineHeight: 17
  },
  homeEventImageDateChip: {
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
  homeEventImageDateDetail: {
    color: colors.imageBadgeText,
    fontSize: 10,
    fontWeight: "700",
    lineHeight: 13
  },
  homeEventImageDateValue: {
    color: colors.imageBadgeText,
    fontSize: typography.caption,
    fontWeight: "900",
    lineHeight: 17
  },
  homeEventImageBottom: {
    gap: spacing.md,
    minWidth: 0
  },
  homeEventImageDetail: {
    color: "rgba(255,255,255,0.86)",
    flexShrink: 1,
    fontSize: typography.small,
    fontWeight: "700",
    lineHeight: 19,
    minWidth: 0
  },
  homeEventImageFooter: {
    alignItems: "center",
    borderTopColor: "rgba(255,255,255,0.24)",
    borderTopWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
    paddingTop: spacing.md
  },
  homeEventImageList: {
    gap: spacing.lg
  },
  homeEventImageTopRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between"
  },
  homeEventFilterLabel: {
    color: colors.text3,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 17
  },
  homeEventClearButton: {
    alignItems: "center",
    justifyContent: "center",
    height: 44,
    width: 44
  },
  homeEventDiscoveryPanel: {
    gap: spacing.md,
    backgroundColor: "transparent",
    paddingVertical: spacing.md
  },
  homeEventSearchInput: {
    color: colors.text,
    flex: 1,
    fontSize: typography.body,
    minWidth: 0,
    paddingVertical: 0
  },
  homeEventSearchRow: {
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
  homeEventTopicButton: {
    ...createControlStyles(colors).chip
  },
  homeEventTopicButtonText: {
    ...createControlStyles(colors).chipText
  },
  homeEventTopicRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs
  },
  homeEventImageMetaLine: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
    maxWidth: "100%",
    minWidth: 0
  },
  homeEventImageMetaRow: {
    gap: spacing.xs
  },
  homeEventImageStatusPill: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.92)",
    borderColor: "rgba(255,255,255,0.88)",
    borderRadius: radius.pill,
    borderWidth: 1,
    color: colors.imageBadgeText,
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 14,
    overflow: "hidden",
    paddingHorizontal: spacing.sm,
    paddingVertical: 5
  },
  homeEventImageSubtitle: {
    color: "rgba(255,255,255,0.78)",
    fontSize: typography.caption,
    fontWeight: "800",
    lineHeight: 16
  },
  homeEventImageTitle: {
    color: colors.onImage,
    ...textStyles.title
  },
  pressed: {
    opacity: 0.84,
    transform: [{ translateY: 0.5 }]
  },
}));
