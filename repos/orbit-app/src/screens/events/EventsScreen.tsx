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
import {
  eventValueRecommendationAcceptPath,
  eventValueRecommendationsPath,
  ORBIT_API_ENDPOINTS
} from "../../api/endpoints";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
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
  eventDiscoveryTopics,
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
  "all",
  "upcoming",
  "active",
  "ended"
];

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

function EventImageCard({
  baseUrl,
  event,
  onPress
}: {
  baseUrl: string;
  event: EventSummary;
  onPress: () => void;
}) {
  const dateChip = eventDateChip(event.startsAt);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.eventImageCard,
        pressed ? styles.eventCardPressed : null
      ]}
    >
      <ImageBackground
        imageStyle={styles.eventImage}
        source={{ uri: assetUrl(baseUrl, event.coverPath) }}
        style={styles.eventImageFrame}
      >
        <View style={styles.eventImageOverlay} />
        <View style={styles.eventImageContent}>
          <View style={styles.eventImageTopRow}>
            <Text numberOfLines={1} style={styles.eventImageStatusPill}>
              {event.status}
            </Text>
            <View style={styles.eventImageDateChip}>
              <Text numberOfLines={1} style={styles.eventImageDateValue}>
                {dateChip.date}
              </Text>
              {dateChip.detail ? (
                <Text numberOfLines={1} style={styles.eventImageDateDetail}>
                  {dateChip.detail}
                </Text>
              ) : null}
            </View>
          </View>
          <View style={styles.eventImageBottom}>
            <View style={styles.eventImageCopy}>
              {event.subtitle ? (
                <Text numberOfLines={1} style={styles.eventImageSubtitle}>
                  {event.subtitle}
                </Text>
              ) : null}
              <Text numberOfLines={2} style={styles.eventImageTitle}>
                {event.title}
              </Text>
            </View>
            <View style={styles.eventImageMetaRow}>
              <View style={styles.eventImageMetaLine}>
                <Ionicons color={colors.onAccent} name="time-outline" size={14} />
                <Text numberOfLines={1} style={styles.eventImageDetail}>
                  {event.startsAt}
                </Text>
              </View>
              {event.location ? (
                <View style={styles.eventImageMetaLine}>
                  <Ionicons color={colors.onAccent} name="location-outline" size={14} />
                  <Text numberOfLines={1} style={styles.eventImageDetail}>
                    {event.location}
                  </Text>
                </View>
              ) : null}
            </View>
            <View style={styles.eventImageFooter}>
              <Text numberOfLines={1} style={styles.eventImageDetail}>
                {event.participantCountLabel}
              </Text>
              <Text style={styles.eventImageCta}>{event.actionLabel}</Text>
            </View>
          </View>
        </View>
      </ImageBackground>
    </Pressable>
  );
}

function EventDiscoveryControls({
  counts,
  onQueryChange,
  onStatusChange,
  onTopicChange,
  query,
  resultLabel,
  statusFilter,
  topicFilter,
  topics
}: {
  counts: Record<EventDiscoveryStatusFilter, number>;
  onQueryChange: (query: string) => void;
  onStatusChange: (status: EventDiscoveryStatusFilter) => void;
  onTopicChange: (topic: string) => void;
  query: string;
  resultLabel: string;
  statusFilter: EventDiscoveryStatusFilter;
  topicFilter: string;
  topics: string[];
}) {
  const hasQuery = query.trim().length > 0;

  return (
    <View style={styles.discoveryPanel}>
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
            style={styles.discoveryClearButton}
          >
            <Ionicons color={colors.text3} name="close-circle" size={19} />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.discoveryMetaRow}>
        <Text style={styles.discoveryResultLabel}>{resultLabel}</Text>
      </View>
      <View style={styles.discoveryChipRow}>
        {eventDiscoveryStatusFilters.map((filter) => {
          const selected = statusFilter === filter;

          return (
            <Pressable
              accessibilityRole="button"
              key={filter}
              onPress={() => onStatusChange(filter)}
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
                {eventDiscoveryStatusLabels[filter]} {counts[filter]}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {topics.length > 0 ? (
        <View style={styles.discoveryTopicRow}>
          {topics.map((topic) => {
            const selected = topicFilter === topic;

            return (
              <Pressable
                accessibilityRole="button"
                key={topic}
                onPress={() => onTopicChange(selected ? "" : topic)}
                style={({ pressed }) => [
                  styles.discoveryTopicChip,
                  selected ? styles.discoveryChipActive : null,
                  pressed ? styles.eventCardPressed : null
                ]}
              >
                <Text
                  numberOfLines={1}
                  style={[
                    styles.discoveryTopicChipText,
                    selected ? styles.discoveryChipTextActive : null
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
    <View style={styles.eventImageList}>
      {events.map((event) => (
        <EventImageCard
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
    useState<EventDiscoveryStatusFilter>("all");
  const [topicFilter, setTopicFilter] = useState("");
  const refreshing = state.refreshing;
  const events = state.kind === "success" ? eventsToSummaries(state.data) : [];
  const filteredEvents = filterEventSummaries(events, {
    query,
    status: statusFilter,
    topic: topicFilter
  });
  const discoveryTopics = eventDiscoveryTopics(events);
  const discoveryCounts = eventDiscoveryFilterCounts(events);
  const resultLabel =
    filteredEvents.length === events.length
      ? `${events.length} 场活动`
      : `${filteredEvents.length} / ${events.length} 场活动`;

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
      <EventImageList
        baseUrl={baseUrl}
        events={filteredEvents}
        onOpenEvent={openEvent}
      />
      {events.length > 0 ? (
        <EventDiscoveryControls
          counts={discoveryCounts}
          onQueryChange={setQuery}
          onStatusChange={setStatusFilter}
          onTopicChange={setTopicFilter}
          query={query}
          resultLabel={resultLabel}
          statusFilter={statusFilter}
          topicFilter={topicFilter}
          topics={discoveryTopics}
        />
      ) : null}
      {events.length > 0 && filteredEvents.length === 0 ? (
        <EmptyState
          message="换个关键词，或清掉状态和主题筛选。"
          title="没有匹配的活动"
        />
      ) : null}
      {signedIn ? (
        <AuthenticatedEventValueRecommendations
          baseUrl={baseUrl}
          events={events}
          key={recommendationRefreshKey}
          onOpenEvent={openEvent}
          onRegisterEvent={openEventRegistration}
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
      <DataCard detail="暂时取不到推荐" title="推荐参加">
        <Text style={styles.recommendationBody}>
          活动列表还能正常看。推荐排序稍后再刷新。
        </Text>
      </DataCard>
    );
  }

  if (state.kind === "loading") {
    return null;
  }

  const view = eventValueRecommendationsToView(state.data);
  const eventById = eventSummaryById(events);

  if (view.recommendations.length === 0) {
    return (
      <DataCard detail={view.profileLine} title="推荐参加">
        <Text style={styles.recommendationBody}>{view.emptyText}</Text>
        <Text style={styles.recommendationNextAction}>{view.nextAction}</Text>
      </DataCard>
    );
  }

  return (
    <DataCard detail={view.profileLine || view.nextAction} title="推荐参加">
      {view.recommendations.map((recommendation) => {
        const recommendationCoverPath = eventById.get(
          recommendation.id
        )?.coverPath;

        return (
          <EventValueRecommendationRow
            baseUrl={baseUrl}
            coverPath={recommendationCoverPath}
            key={recommendation.id}
            onAccept={() => onAcceptEvent(recommendation)}
            onOpen={() => onOpenEvent(recommendation.id)}
            pending={pendingAcceptEventId === recommendation.id}
            recommendation={recommendation}
          />
        );
      })}
      {acceptError ? <Text style={styles.recommendationError}>{acceptError}</Text> : null}
      {acceptedRecommendation ? (
        <EventValueRecommendationAcceptedCard
          onOpenEvent={() => onOpenEvent(acceptedRecommendation.eventId)}
          onRegister={() => onRegisterEvent(acceptedRecommendation.eventId)}
          view={acceptedRecommendation}
        />
      ) : null}
      <Text style={styles.recommendationNextAction}>{view.nextAction}</Text>
    </DataCard>
  );
}

function EventValueRecommendationRow({
  baseUrl,
  coverPath,
  onAccept,
  onOpen,
  pending,
  recommendation
}: {
  baseUrl: string;
  coverPath?: string | undefined;
  onAccept: () => void;
  onOpen: () => void;
  pending: boolean;
  recommendation: EventValueRecommendationCardView;
}) {
  return (
    <View style={styles.recommendationRow}>
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
              {recommendation.title}
            </Text>
          </View>
        </ImageBackground>
      ) : (
        <View style={styles.recommendationTopRow}>
          <Text numberOfLines={2} style={styles.recommendationTitle}>
            {recommendation.title}
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
      <Text numberOfLines={1} style={styles.eventDetail}>
        {recommendation.detail}
      </Text>
      <Text style={styles.recommendationBody}>{recommendation.reason}</Text>
      <Text style={styles.recommendationAction}>{recommendation.action}</Text>
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
            {pending ? "记录中" : "接受推荐"}
          </Text>
        </Pressable>
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
  discoveryChip: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border2,
    borderRadius: radius.pill,
    borderWidth: 1,
    minHeight: 34,
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
  eventImageList: {
    gap: spacing.lg
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
    height: 300,
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
    borderRadius: radius.control,
    height: 150,
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
    minHeight: 36,
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
    minHeight: 36,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs
  },
  secondaryButtonText: {
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: "800"
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
