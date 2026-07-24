import { useRouter } from "expo-router";
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
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { colors, radius, spacing, typography } from "../../design/tokens";
import { useApiResource } from "../../hooks/useApiResource";
import { eventsToSummaries, type EventSummary } from "../../view-models/events";

function eventDetailLine(event: EventSummary): string {
  return [event.startsAt, event.location].filter(Boolean).join(" · ");
}

function assetUrl(baseUrl: string, path: string): string {
  if (/^https?:\/\//iu.test(path)) {
    return path;
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl.replace(/\/+$/u, "")}${normalizedPath}`;
}

function EventCard({
  baseUrl,
  event,
  onPress
}: {
  baseUrl: string;
  event: EventSummary;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.eventCard,
        pressed ? styles.eventCardPressed : null
      ]}
    >
      <ImageBackground
        imageStyle={styles.eventImage}
        source={{ uri: assetUrl(baseUrl, event.coverPath) }}
        style={styles.eventImageFrame}
      >
        <View style={styles.imageScrim} />
        <View style={styles.imageTopRow}>
          <Text style={styles.statusBadge}>{event.status}</Text>
        </View>
      </ImageBackground>
      <View style={styles.eventBody}>
        <Text numberOfLines={2} style={styles.eventTitle}>
          {event.title}
        </Text>
        <Text numberOfLines={1} style={styles.eventDetail}>
          {eventDetailLine(event)}
        </Text>
      </View>
    </Pressable>
  );
}

export function EventsScreen() {
  const router = useRouter();
  const { baseUrl } = useOrbitApiBaseUrl();
  const state = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.events,
    (data) => eventsToSummaries(data).length === 0
  );

  return (
    <AppScreen
      eyebrow="发现活动"
      refreshControl={
        <RefreshControl
          onRefresh={state.refresh}
          refreshing={state.refreshing}
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
      {state.kind === "success"
        ? eventsToSummaries(state.data).map((event) => (
            <EventCard
              baseUrl={baseUrl}
              event={event}
              key={event.id}
              onPress={() =>
                router.push({
                  params: { id: event.id },
                  pathname: "/events/[id]"
                })
              }
            />
          ))
        : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  eventBody: {
    gap: spacing.xs,
    padding: spacing.lg
  },
  eventCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: "hidden"
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
  eventImage: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg
  },
  eventImageFrame: {
    aspectRatio: 1.72,
    backgroundColor: colors.surface3,
    justifyContent: "space-between",
    overflow: "hidden",
    padding: spacing.md
  },
  eventTitle: {
    color: colors.ink,
    fontSize: typography.section,
    fontWeight: "700",
    lineHeight: 23
  },
  imageScrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.16)"
  },
  imageTopRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "flex-end"
  },
  statusBadge: {
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: radius.pill,
    color: colors.ink,
    fontSize: typography.caption,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 6
  }
});
