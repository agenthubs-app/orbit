import { Ionicons } from "@expo/vector-icons";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View
} from "react-native";
import {
  eventAttendeesPath,
  eventMatchesPath,
  eventWantToConnectPath
} from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { colors, radius, spacing, typography } from "../../design/tokens";
import { useApiResource } from "../../hooks/useApiResource";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import {
  buildWantConnectRequest,
  eventAttendeeRosterToView,
  eventMatchesToView,
  type EventAttendeeCardView
} from "../../view-models/event-attendees";

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "event";
  }

  return value ?? "event";
}

export function EventAttendeesScreen() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const eventId = firstParam(id);
  const router = useRouter();
  const client = useOrbitApiClient();
  const rosterState = useApiResource<unknown>(
    eventAttendeesPath(eventId),
    (data) => eventAttendeeRosterToView(data).attendees.length === 0
  );
  const matchesState = useApiResource<unknown>(
    eventMatchesPath(eventId),
    (data) => eventMatchesToView(data).matches.length === 0
  );
  const [pendingAttendeeId, setPendingAttendeeId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  function refresh() {
    setFeedback(null);
    setActionError(null);
    rosterState.refresh();
    matchesState.refresh();
  }

  async function recordWantConnect(attendee: EventAttendeeCardView) {
    setPendingAttendeeId(attendee.id);
    setFeedback(null);
    setActionError(null);

    const result = await client.post<unknown>(eventWantToConnectPath(eventId), {
      body: buildWantConnectRequest(attendee)
    });

    if (result.success) {
      setFeedback(`已记录想认识 ${attendee.name}。现场先确认对方也愿意继续聊。`);
      matchesState.refresh();
    } else {
      setActionError(result.error.message);
    }

    setPendingAttendeeId(null);
  }

  const roster =
    rosterState.kind === "success" || rosterState.kind === "empty"
      ? eventAttendeeRosterToView(rosterState.data)
      : null;
  const matches =
    matchesState.kind === "success" || matchesState.kind === "empty"
      ? eventMatchesToView(matchesState.data)
      : null;

  return (
    <AppScreen
      eyebrow="活动现场"
      refreshControl={
        <RefreshControl
          onRefresh={refresh}
          refreshing={rosterState.refreshing || matchesState.refreshing}
          tintColor={colors.accent}
        />
      }
      title="参会者"
    >
      {rosterState.kind === "loading" ? <LoadingState /> : null}
      {rosterState.kind === "offline" ? (
        <ErrorState message={rosterState.error.message} title="服务器连不上" />
      ) : null}
      {rosterState.kind === "failure" ? (
        <ErrorState message={rosterState.error.message} />
      ) : null}
      {roster ? (
        <>
          <DataCard detail={roster.eventDetail} title={roster.eventTitle}>
            <Text style={styles.bodyText}>{roster.nextAction}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                router.push({
                  params: { id: eventId },
                  pathname: "/events/[id]"
                })
              }
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed ? styles.pressed : null
              ]}
            >
              <Ionicons color={colors.accent} name="arrow-back-outline" size={17} />
              <Text style={styles.secondaryButtonText}>返回活动</Text>
            </Pressable>
          </DataCard>
          {matches && matches.matches.length > 0 ? (
            <DataCard detail={matches.nextAction} title="现场匹配">
              <View style={styles.stack}>
                {matches.matches.map((match) => (
                  <View key={match.id} style={styles.matchBlock}>
                    <Text style={styles.matchTitle}>{match.title}</Text>
                    <Text style={styles.bodyText}>{match.names.join(" · ")}</Text>
                    <Text style={styles.bodyText}>{match.message}</Text>
                  </View>
                ))}
              </View>
            </DataCard>
          ) : null}
          {matchesState.kind === "failure" ? (
            <ErrorState message={matchesState.error.message} title="现场匹配不可用" />
          ) : null}
          {feedback ? <Text style={styles.feedbackText}>{feedback}</Text> : null}
          {actionError ? <Text style={styles.errorText}>{actionError}</Text> : null}
          {roster.attendees.length === 0 ? (
            <EmptyState message="这场活动暂时没有可见名单。" title="没有参会者" />
          ) : (
            roster.attendees.map((attendee) => (
              <AttendeeCard
                attendee={attendee}
                key={attendee.id}
                onWantConnect={recordWantConnect}
                pending={pendingAttendeeId === attendee.id}
              />
            ))
          )}
        </>
      ) : null}
    </AppScreen>
  );
}

function AttendeeCard({
  attendee,
  onWantConnect,
  pending
}: {
  attendee: EventAttendeeCardView;
  onWantConnect: (attendee: EventAttendeeCardView) => void;
  pending: boolean;
}) {
  return (
    <DataCard detail={attendee.organizationRole} title={attendee.name}>
      <View style={styles.pillRow}>
        <Text style={styles.statusPill}>{attendee.statusLabel}</Text>
        <Text style={styles.knownPill}>{attendee.knownLabel}</Text>
        {attendee.tags.map((tag) => (
          <Text key={tag} style={styles.tagPill}>
            {tag}
          </Text>
        ))}
      </View>
      <Text style={styles.bodyText}>{attendee.relationshipContext}</Text>
      {attendee.reasons.length > 0 ? (
        <View style={styles.stack}>
          {attendee.reasons.map((reason) => (
            <Text key={reason} style={styles.reasonText}>
              {reason}
            </Text>
          ))}
        </View>
      ) : null}
      <Text style={styles.nextText}>{attendee.suggestedNextAction}</Text>
      {attendee.canWantConnect ? (
        <Pressable
          accessibilityRole="button"
          disabled={pending}
          onPress={() => onWantConnect(attendee)}
          style={({ pressed }) => [
            styles.primaryButton,
            pending ? styles.disabled : null,
            pressed ? styles.pressed : null
          ]}
        >
          <Ionicons color={colors.onAccent} name="person-add-outline" size={17} />
          <Text style={styles.primaryButtonText}>
            {pending ? "记录中" : "想认识"}
          </Text>
        </Pressable>
      ) : null}
    </DataCard>
  );
}

const styles = StyleSheet.create({
  bodyText: {
    color: colors.text,
    fontSize: typography.small,
    lineHeight: 20
  },
  disabled: {
    opacity: 0.54
  },
  errorText: {
    color: colors.rose,
    fontSize: typography.small,
    lineHeight: 20
  },
  feedbackText: {
    color: colors.live,
    fontSize: typography.small,
    fontWeight: "700",
    lineHeight: 20
  },
  knownPill: {
    backgroundColor: colors.accentSofter,
    borderRadius: radius.pill,
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  matchBlock: {
    backgroundColor: colors.liveSoft,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md
  },
  matchTitle: {
    color: colors.live,
    fontSize: typography.small,
    fontWeight: "700"
  },
  nextText: {
    color: colors.text3,
    fontSize: typography.small,
    lineHeight: 20
  },
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs
  },
  pressed: {
    opacity: 0.78,
    transform: [{ translateY: 0.5 }]
  },
  primaryButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.accent,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 40,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  primaryButtonText: {
    color: colors.onAccent,
    fontSize: typography.small,
    fontWeight: "700"
  },
  reasonText: {
    backgroundColor: colors.surface2,
    borderColor: colors.border2,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.text,
    fontSize: typography.small,
    lineHeight: 20,
    padding: spacing.md
  },
  secondaryButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.accentSofter,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 40,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  secondaryButtonText: {
    color: colors.accent,
    fontSize: typography.small,
    fontWeight: "700"
  },
  stack: {
    gap: spacing.sm
  },
  statusPill: {
    backgroundColor: colors.liveSoft,
    borderRadius: radius.pill,
    color: colors.live,
    fontSize: typography.caption,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  tagPill: {
    backgroundColor: colors.surface2,
    borderColor: colors.border2,
    borderRadius: radius.pill,
    borderWidth: 1,
    color: colors.text2,
    fontSize: typography.caption,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 5
  }
});
