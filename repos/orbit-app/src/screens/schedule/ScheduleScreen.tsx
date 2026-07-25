import { Ionicons } from "@expo/vector-icons";
import { type Href, useRouter } from "expo-router";
import {
  ImageBackground,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View
} from "react-native";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { ORBIT_API_ENDPOINTS } from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { MetricPill } from "../../components/MetricPill";
import { colors, radius, spacing, typography } from "../../design/tokens";
import { useApiResource } from "../../hooks/useApiResource";
import {
  scheduleToTimelineView,
  type ScheduleTimelineItem,
  type ScheduleTimelineSection,
  type ScheduleTimelineView
} from "../../view-models/schedule";

function assetUrl(baseUrl: string, path: string): string {
  if (/^https?:\/\//iu.test(path)) {
    return path;
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl.replace(/\/+$/u, "")}${normalizedPath}`;
}

function usable<TData>(
  state: ReturnType<typeof useApiResource<TData>>
): state is Extract<ReturnType<typeof useApiResource<TData>>, { kind: "empty" | "success" }> {
  return state.kind === "success" || state.kind === "empty";
}

export function ScheduleScreen() {
  const tasksState = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.tasks,
    () => false
  );
  const eventsState = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.events,
    () => false
  );

  function refresh() {
    tasksState.refresh();
    eventsState.refresh();
  }

  const hasAnyData = usable(tasksState) || usable(eventsState);
  const view = hasAnyData
    ? scheduleToTimelineView({
        events: usable(eventsState) ? eventsState.data : { events: [] },
        tasks: usable(tasksState) ? tasksState.data : { tasks: [] }
      })
    : null;
  const loading =
    tasksState.kind === "loading" || eventsState.kind === "loading";

  return (
    <AppScreen
      eyebrow="关系日程"
      refreshControl={
        <RefreshControl
          onRefresh={refresh}
          refreshing={tasksState.refreshing || eventsState.refreshing}
          tintColor={colors.accent}
        />
      }
      title="日程"
    >
      {loading ? <LoadingState /> : null}
      {tasksState.kind === "offline" ? (
        <ErrorState message={tasksState.error.message} title="跟进暂时连不上" />
      ) : null}
      {eventsState.kind === "offline" ? (
        <ErrorState message={eventsState.error.message} title="活动暂时连不上" />
      ) : null}
      {tasksState.kind === "failure" ? (
        <ErrorState message={tasksState.error.message} title="跟进加载失败" />
      ) : null}
      {eventsState.kind === "failure" ? (
        <ErrorState message={eventsState.error.message} title="活动加载失败" />
      ) : null}
      {view ? <ScheduleWorkspace view={view} /> : null}
    </AppScreen>
  );
}

function ScheduleWorkspace({ view }: { view: ScheduleTimelineView }) {
  return (
    <>
      <DataCard detail="跟进和活动放在同一条时间线上" title="关系日程">
        <Text style={styles.summaryText}>{view.summary}</Text>
        <View style={styles.metricsRow}>
          {view.stats.map((stat) => (
            <MetricPill key={stat.label} label={stat.label} value={stat.value} />
          ))}
        </View>
      </DataCard>
      {view.eventHighlights.length > 0 ? (
        <ScheduleEventHighlights items={view.eventHighlights} />
      ) : null}
      {view.sections.length > 0 ? (
        view.sections.map((section) => (
          <ScheduleSection key={section.id} section={section} />
        ))
      ) : (
        <EmptyState message={view.emptyMessage} title={view.emptyTitle} />
      )}
    </>
  );
}

function ScheduleEventHighlights({ items }: { items: ScheduleTimelineItem[] }) {
  const router = useRouter();
  const { baseUrl } = useOrbitApiBaseUrl();

  return (
    <DataCard detail={`${items.length} 场活动需要提前看`} title="待准备活动">
      <View style={styles.itemStack}>
        {items.map((item) => (
          <EventTimelineModule
            baseUrl={baseUrl}
            item={item}
            key={`highlight-${item.id}`}
            onPress={() => router.push(item.href as Href)}
          />
        ))}
      </View>
    </DataCard>
  );
}

function ScheduleSection({ section }: { section: ScheduleTimelineSection }) {
  return (
    <DataCard detail={section.detail} title={section.title}>
      <View style={styles.itemStack}>
        {section.items.map((item) => (
          <TimelineItemRow key={`${item.kind}-${item.id}`} item={item} />
        ))}
      </View>
    </DataCard>
  );
}

function TimelineItemRow({ item }: { item: ScheduleTimelineItem }) {
  const router = useRouter();
  const { baseUrl } = useOrbitApiBaseUrl();

  if (item.kind === "event") {
    return (
      <EventTimelineModule
        baseUrl={baseUrl}
        item={item}
        onPress={() => router.push(item.href as Href)}
      />
    );
  }

  const supportingText = item.reason !== item.detail ? item.reason : "";

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(item.href as Href)}
      style={({ pressed }) => [
        styles.itemRow,
        pressed ? styles.itemRowPressed : null
      ]}
    >
      <View style={styles.timeColumn}>
        <Text numberOfLines={1} style={styles.timeText}>
          {item.timeLabel || "待定"}
        </Text>
        <View style={[styles.iconBadge, styles.followupIcon]}>
          <Ionicons color={colors.accent} name="person-outline" size={16} />
        </View>
      </View>
      <View style={styles.itemContent}>
        <View style={styles.itemHeader}>
          <Text numberOfLines={2} style={styles.itemTitle}>
            {item.title}
          </Text>
          <Text
            numberOfLines={1}
            style={[
              styles.statusPill,
              styles.followupStatus
            ]}
          >
            {item.statusLabel}
          </Text>
        </View>
        {item.subtitle ? (
          <Text numberOfLines={2} style={styles.itemMeta}>
            {item.subtitle}
          </Text>
        ) : null}
        {item.detail ? (
          <Text numberOfLines={3} style={styles.itemDetail}>
            {item.detail}
          </Text>
        ) : null}
        {supportingText ? (
          <Text numberOfLines={3} style={styles.itemReason}>
            {supportingText}
          </Text>
        ) : null}
        <View style={styles.actionRow}>
          <Text style={styles.actionText}>{item.actionLabel}</Text>
          <Ionicons color={colors.accent} name="chevron-forward" size={15} />
        </View>
      </View>
    </Pressable>
  );
}

function EventTimelineModule({
  baseUrl,
  item,
  onPress
}: {
  baseUrl: string;
  item: ScheduleTimelineItem;
  onPress: () => void;
}) {
  const imagePath = item.coverPath;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.eventTimelineCard,
        pressed ? styles.itemRowPressed : null
      ]}
    >
      <View style={styles.eventTimelineMediaColumn}>
        {imagePath ? (
          <ImageBackground
            imageStyle={styles.eventTimelineThumbImage}
            source={{ uri: assetUrl(baseUrl, imagePath) }}
            style={styles.eventTimelineThumbFrame}
          >
            <View style={styles.eventTimelineThumbOverlay} />
          </ImageBackground>
        ) : (
          <View style={styles.eventTimelineFallbackThumb}>
            <Ionicons color={colors.amber} name="calendar-outline" size={19} />
          </View>
        )}
        <Text numberOfLines={1} style={[styles.statusPill, styles.eventStatus]}>
          {item.statusLabel}
        </Text>
      </View>
      <View style={styles.eventTimelineContent}>
        <Text numberOfLines={2} style={styles.itemTitle}>
          {item.title}
        </Text>
        <View style={styles.eventTimelineMeta}>
          <View style={styles.eventTimelineMetaLine}>
            <Ionicons color={colors.text3} name="time-outline" size={14} />
            <Text numberOfLines={1} style={styles.itemMeta}>
              {item.timeLabel || "时间待定"}
            </Text>
          </View>
          {item.location ? (
            <View style={styles.eventTimelineMetaLine}>
              <Ionicons color={colors.text3} name="location-outline" size={14} />
              <Text numberOfLines={1} style={styles.itemMeta}>
                {item.location}
              </Text>
            </View>
          ) : null}
          {item.participantCountLabel ? (
            <View style={styles.eventTimelineMetaLine}>
              <Ionicons color={colors.text3} name="people-outline" size={14} />
              <Text numberOfLines={1} style={styles.itemMeta}>
                {item.participantCountLabel}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={styles.eventTimelineFooter}>
          <Text numberOfLines={1} style={styles.itemReason}>
            打开活动背景
          </Text>
          <Text style={styles.actionText}>{item.actionLabel}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  actionRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs
  },
  actionText: {
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: "800",
    lineHeight: 18
  },
  eventIcon: {
    backgroundColor: colors.amberSoft
  },
  eventStatus: {
    alignSelf: "stretch",
    backgroundColor: colors.amberSoft,
    color: colors.amber,
    textAlign: "center"
  },
  eventTimelineCard: {
    alignItems: "flex-start",
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    paddingBottom: spacing.md
  },
  eventTimelineContent: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0
  },
  eventTimelineFallbackThumb: {
    alignItems: "center",
    backgroundColor: colors.amberSoft,
    borderRadius: radius.control,
    height: 72,
    justifyContent: "center",
    width: 72
  },
  eventTimelineFooter: {
    alignItems: "center",
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
    paddingTop: spacing.xs
  },
  eventTimelineMediaColumn: {
    flexShrink: 0,
    gap: spacing.xs,
    width: 72
  },
  eventTimelineMeta: {
    gap: spacing.xxs
  },
  eventTimelineMetaLine: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
    minWidth: 0
  },
  eventTimelineThumbFrame: {
    backgroundColor: colors.surface3,
    borderRadius: radius.control,
    height: 72,
    overflow: "hidden",
    width: 72
  },
  eventTimelineThumbImage: {
    borderRadius: radius.control
  },
  eventTimelineThumbOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(10,10,16,0.10)"
  },
  followupIcon: {
    backgroundColor: colors.accentSofter
  },
  followupStatus: {
    backgroundColor: colors.accentSoft,
    color: colors.accent
  },
  iconBadge: {
    alignItems: "center",
    borderRadius: radius.pill,
    height: 34,
    justifyContent: "center",
    width: 34
  },
  itemContent: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0
  },
  itemDetail: {
    color: colors.text,
    fontSize: typography.small,
    lineHeight: 20
  },
  itemHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between"
  },
  itemMeta: {
    color: colors.text3,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 18
  },
  itemReason: {
    color: colors.text3,
    fontSize: typography.caption,
    lineHeight: 18
  },
  itemRow: {
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    paddingBottom: spacing.md
  },
  itemRowPressed: {
    opacity: 0.75
  },
  itemStack: {
    gap: spacing.md
  },
  itemTitle: {
    color: colors.ink,
    flex: 1,
    fontSize: typography.body,
    fontWeight: "800",
    lineHeight: 21
  },
  metricsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  statusPill: {
    borderRadius: radius.pill,
    flexShrink: 0,
    fontSize: typography.caption,
    fontWeight: "800",
    lineHeight: 18,
    overflow: "hidden",
    paddingHorizontal: 9,
    paddingVertical: 4
  },
  summaryText: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: "600",
    lineHeight: 22
  },
  timeColumn: {
    alignItems: "center",
    gap: spacing.xs,
    width: 48
  },
  timeText: {
    color: colors.ink,
    fontSize: typography.caption,
    fontWeight: "800",
    lineHeight: 18
  }
});
