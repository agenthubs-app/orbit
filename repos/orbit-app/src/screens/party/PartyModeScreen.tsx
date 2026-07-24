import { Ionicons } from "@expo/vector-icons";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { RefreshControl, StyleSheet, Text, View, Pressable } from "react-native";
import {
  eventAttendeesPath,
  eventDetailPath,
  eventMatchesPath
} from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { MetricPill } from "../../components/MetricPill";
import { colors, radius, spacing, typography } from "../../design/tokens";
import { useApiResource } from "../../hooks/useApiResource";
import {
  DEFAULT_PARTY_EVENT_ID,
  partyModeToView,
  type PartyAgendaItemView,
  type PartyGraphGroupView,
  type PartyModeView,
  type PartyPriorityPersonView
} from "../../view-models/party";

type PartyModeVariant = "checkin" | "graph" | "overview";

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function isUsable<TData>(
  state: ReturnType<typeof useApiResource<TData>>
): state is Extract<typeof state, { kind: "empty" | "success" }> {
  return state.kind === "success" || state.kind === "empty";
}

function partyHref(path: "/party" | "/party/checkin" | "/party/graph", eventId: string): Href {
  return `${path}?eventId=${encodeURIComponent(eventId)}` as Href;
}

function screenCopy(variant: PartyModeVariant): { eyebrow: string; title: string } {
  if (variant === "checkin") {
    return { eyebrow: "现场签到", title: "签到码" };
  }

  if (variant === "graph") {
    return { eyebrow: "活动现场", title: "关系图" };
  }

  return { eyebrow: "活动现场", title: "现场模式" };
}

export function PartyModeScreen({
  variant = "overview"
}: {
  variant?: PartyModeVariant;
}) {
  const params = useLocalSearchParams<{
    code?: string | string[];
    eventId?: string | string[];
  }>();
  const eventId =
    firstParam(params.eventId)?.trim() ||
    firstParam(params.code)?.trim() ||
    DEFAULT_PARTY_EVENT_ID;
  const eventState = useApiResource<unknown>(eventDetailPath(eventId), () => false);
  const attendeeState = useApiResource<unknown>(
    eventAttendeesPath(eventId),
    () => false
  );
  const matchState = useApiResource<unknown>(eventMatchesPath(eventId), () => false);
  const copy = screenCopy(variant);

  function refresh() {
    eventState.refresh();
    attendeeState.refresh();
    matchState.refresh();
  }

  const party =
    isUsable(eventState) && isUsable(attendeeState)
      ? partyModeToView({
          attendeesPayload: attendeeState.data,
          eventPayload: eventState.data,
          matchesPayload: isUsable(matchState) ? matchState.data : {}
        })
      : null;
  const loading = eventState.kind === "loading" || attendeeState.kind === "loading";
  const refreshing =
    eventState.refreshing || attendeeState.refreshing || matchState.refreshing;

  return (
    <AppScreen
      eyebrow={copy.eyebrow}
      refreshControl={
        <RefreshControl
          onRefresh={refresh}
          refreshing={refreshing}
          tintColor={colors.accent}
        />
      }
      title={copy.title}
    >
      {loading ? <LoadingState /> : null}
      {eventState.kind === "offline" || attendeeState.kind === "offline" ? (
        <ErrorState
          message={
            eventState.kind === "offline"
              ? eventState.error.message
              : attendeeState.kind === "offline"
                ? attendeeState.error.message
                : "活动现场暂时打不开。"
          }
          title="服务器连不上"
        />
      ) : null}
      {eventState.kind === "failure" || attendeeState.kind === "failure" ? (
        <ErrorState
          message={
            eventState.kind === "failure"
              ? eventState.error.message
              : attendeeState.kind === "failure"
                ? attendeeState.error.message
                : "活动现场暂时打不开。"
          }
        />
      ) : null}
      {party ? (
        <>
          {variant === "checkin" ? (
            <PartyCheckIn party={party} />
          ) : variant === "graph" ? (
            <PartyGraph party={party} />
          ) : (
            <PartyOverview party={party} />
          )}
          {matchState.kind === "failure" || matchState.kind === "offline" ? (
            <ErrorState
              message={matchState.error.message}
              title="现场匹配不可用"
            />
          ) : null}
        </>
      ) : null}
    </AppScreen>
  );
}

function PartyOverview({ party }: { party: PartyModeView }) {
  const router = useRouter();

  return (
    <>
      <DataCard detail={party.eventDetail} title={party.eventTitle}>
        <Text style={styles.bodyText}>{party.nextAction}</Text>
        <View style={styles.metricsRow}>
          {party.metrics.map((metric) => (
            <MetricPill
              key={metric.label}
              label={metric.label}
              value={metric.value}
            />
          ))}
        </View>
        <View style={styles.actionGrid}>
          <ActionButton
            icon="ticket-outline"
            label="签到码"
            onPress={() => router.push(partyHref("/party/checkin", party.eventId))}
            primary
          />
          <ActionButton
            icon="git-network-outline"
            label="关系图"
            onPress={() => router.push(partyHref("/party/graph", party.eventId))}
          />
          <ActionButton
            icon="people-outline"
            label="参会者"
            onPress={() =>
              router.push(`/events/${encodeURIComponent(party.eventId)}/attendees` as Href)
            }
          />
        </View>
      </DataCard>
      <TicketCard party={party} />
      {party.priorityPeople.length === 0 ? (
        <EmptyState message="这场活动暂时没有可见名单。" title="还没有参会者" />
      ) : (
        party.priorityPeople.map((person) => (
          <PriorityPersonCard key={person.id} person={person} />
        ))
      )}
      {party.matches.length > 0 ? (
        <DataCard detail="先当面确认对方也愿意继续聊" title="互相想认识">
          <View style={styles.stack}>
            {party.matches.map((match) => (
              <View key={match.id} style={styles.matchRow}>
                <Text style={styles.matchTitle}>{match.title}</Text>
                <Text style={styles.bodyText}>{match.names}</Text>
                <Text style={styles.mutedText}>{match.message}</Text>
              </View>
            ))}
          </View>
        </DataCard>
      ) : null}
    </>
  );
}

function PartyCheckIn({ party }: { party: PartyModeView }) {
  const router = useRouter();

  return (
    <>
      <DataCard detail={party.checkIn.statusLabel} title={`${party.eventTitle}签到`}>
        <View style={styles.ticket}>
          <Text style={styles.ticketLabel}>现场通行码</Text>
          <Text selectable style={styles.ticketCode}>
            {party.checkIn.accessCode}
          </Text>
          <Text style={styles.ticketHint}>{party.checkIn.attendeeSummary}</Text>
        </View>
        <Text style={styles.bodyText}>{party.checkIn.instruction}</Text>
        <View style={styles.actionGrid}>
          <ActionButton
            icon="people-outline"
            label="看名单"
            onPress={() =>
              router.push(`/events/${encodeURIComponent(party.eventId)}/attendees` as Href)
            }
            primary
          />
          <ActionButton
            icon="arrow-back-outline"
            label="回现场"
            onPress={() => router.push(partyHref("/party", party.eventId))}
          />
        </View>
      </DataCard>
      <DataCard detail={party.eventDetail} title="现场流程">
        <AgendaList agenda={party.agenda} />
      </DataCard>
    </>
  );
}

function PartyGraph({ party }: { party: PartyModeView }) {
  const router = useRouter();

  return (
    <>
      <DataCard detail={party.eventDetail} title={party.eventTitle}>
        <Text style={styles.bodyText}>
          先按分组看人，再决定第一轮该聊谁。
        </Text>
        <View style={styles.metricsRow}>
          {party.metrics.map((metric) => (
            <MetricPill
              key={metric.label}
              label={metric.label}
              value={metric.value}
            />
          ))}
        </View>
        <View style={styles.actionGrid}>
          <ActionButton
            icon="ticket-outline"
            label="签到码"
            onPress={() => router.push(partyHref("/party/checkin", party.eventId))}
            primary
          />
          <ActionButton
            icon="arrow-back-outline"
            label="回现场"
            onPress={() => router.push(partyHref("/party", party.eventId))}
          />
        </View>
      </DataCard>
      {party.graphGroups.length === 0 ? (
        <EmptyState message="参会者标签还没准备好。" title="暂无关系分组" />
      ) : (
        party.graphGroups.map((group) => (
          <GraphGroupCard group={group} key={group.id} />
        ))
      )}
    </>
  );
}

function TicketCard({ party }: { party: PartyModeView }) {
  return (
    <DataCard detail={party.checkIn.statusLabel} title="现场通行">
      <View style={styles.ticketCompact}>
        <Text selectable style={styles.ticketCompactCode}>
          {party.accessCode}
        </Text>
        <Text style={styles.mutedText}>{party.checkIn.instruction}</Text>
      </View>
    </DataCard>
  );
}

function PriorityPersonCard({ person }: { person: PartyPriorityPersonView }) {
  return (
    <DataCard detail={person.organizationRole} title={person.name}>
      <View style={styles.pillRow}>
        <Text style={styles.matchPill}>{person.matchLabel}</Text>
        <Text style={styles.statusPill}>{person.statusLabel}</Text>
        <Text style={styles.neutralPill}>{person.groupLabel}</Text>
        <Text style={styles.neutralPill}>{person.seatLabel}</Text>
        {person.tags.map((tag) => (
          <Text key={tag} style={styles.tagPill}>
            {tag}
          </Text>
        ))}
      </View>
      <Text style={styles.bodyText}>{person.reason}</Text>
      {person.relationshipContext ? (
        <Text style={styles.mutedText}>{person.relationshipContext}</Text>
      ) : null}
      <Text style={styles.nextText}>{person.nextAction}</Text>
    </DataCard>
  );
}

function GraphGroupCard({ group }: { group: PartyGraphGroupView }) {
  return (
    <DataCard detail={group.detail} title={group.title}>
      <View style={styles.stack}>
        {group.people.map((person) => (
          <View key={person.id} style={styles.graphPersonRow}>
            <View style={styles.graphInitial}>
              <Text style={styles.graphInitialText}>{person.name.slice(0, 1)}</Text>
            </View>
            <View style={styles.graphPersonText}>
              <Text style={styles.graphPersonName}>{person.name}</Text>
              <Text style={styles.mutedText}>{person.reason}</Text>
            </View>
          </View>
        ))}
      </View>
    </DataCard>
  );
}

function AgendaList({ agenda }: { agenda: PartyAgendaItemView[] }) {
  return (
    <View style={styles.stack}>
      {agenda.map((item) => (
        <View key={item.title} style={styles.agendaRow}>
          <Text style={styles.agendaTime}>{item.time}</Text>
          <View style={styles.agendaText}>
            <Text style={styles.agendaTitle}>{item.title}</Text>
            <Text style={styles.mutedText}>{item.detail}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function ActionButton({
  icon,
  label,
  onPress,
  primary = false
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        primary ? styles.primaryButton : styles.secondaryButton,
        pressed ? styles.pressed : null
      ]}
    >
      <Ionicons
        color={primary ? colors.onAccent : colors.accent}
        name={icon}
        size={17}
      />
      <Text
        style={primary ? styles.primaryButtonText : styles.secondaryButtonText}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  actionButton: {
    alignItems: "center",
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.xs,
    justifyContent: "center",
    minHeight: 40,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  actionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  agendaRow: {
    alignItems: "flex-start",
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    paddingBottom: spacing.md
  },
  agendaText: {
    flex: 1,
    gap: spacing.xs
  },
  agendaTime: {
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: "800",
    lineHeight: 18,
    minWidth: 52
  },
  agendaTitle: {
    color: colors.ink,
    fontSize: typography.small,
    fontWeight: "700",
    lineHeight: 20
  },
  bodyText: {
    color: colors.text,
    fontSize: typography.small,
    lineHeight: 20
  },
  graphInitial: {
    alignItems: "center",
    backgroundColor: colors.accentSofter,
    borderRadius: radius.pill,
    height: 34,
    justifyContent: "center",
    width: 34
  },
  graphInitialText: {
    color: colors.accent,
    fontSize: typography.small,
    fontWeight: "800"
  },
  graphPersonName: {
    color: colors.ink,
    fontSize: typography.small,
    fontWeight: "700",
    lineHeight: 20
  },
  graphPersonRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md
  },
  graphPersonText: {
    flex: 1,
    gap: spacing.xs
  },
  matchPill: {
    backgroundColor: colors.liveSoft,
    borderRadius: radius.pill,
    color: colors.live,
    fontSize: typography.caption,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  matchRow: {
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
    fontWeight: "800",
    lineHeight: 20
  },
  metricsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  mutedText: {
    color: colors.text3,
    fontSize: typography.small,
    lineHeight: 20
  },
  neutralPill: {
    backgroundColor: colors.surface2,
    borderRadius: radius.pill,
    color: colors.text2,
    fontSize: typography.caption,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  nextText: {
    color: colors.accent,
    fontSize: typography.small,
    fontWeight: "700",
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
    backgroundColor: colors.accent
  },
  primaryButtonText: {
    color: colors.onAccent,
    fontSize: typography.small,
    fontWeight: "800"
  },
  secondaryButton: {
    backgroundColor: colors.accentSofter,
    borderColor: colors.accentSoft,
    borderWidth: 1
  },
  secondaryButtonText: {
    color: colors.accent,
    fontSize: typography.small,
    fontWeight: "800"
  },
  stack: {
    gap: spacing.md
  },
  statusPill: {
    backgroundColor: colors.skySoft,
    borderRadius: radius.pill,
    color: colors.sky,
    fontSize: typography.caption,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  tagPill: {
    backgroundColor: colors.amberSoft,
    borderRadius: radius.pill,
    color: colors.amber,
    fontSize: typography.caption,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  ticket: {
    backgroundColor: colors.ink,
    borderRadius: radius.lg,
    gap: spacing.sm,
    padding: spacing.lg
  },
  ticketCode: {
    color: colors.onAccent,
    fontFamily: "Courier",
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: 0,
    lineHeight: 38
  },
  ticketCompact: {
    backgroundColor: colors.bgSunken,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md
  },
  ticketCompactCode: {
    color: colors.ink,
    fontFamily: "Courier",
    fontSize: typography.title,
    fontWeight: "800",
    letterSpacing: 0,
    lineHeight: 26
  },
  ticketHint: {
    color: colors.accentSoft,
    fontSize: typography.small,
    lineHeight: 20
  },
  ticketLabel: {
    color: colors.accentSoft,
    fontSize: typography.caption,
    fontWeight: "800",
    letterSpacing: 0,
    lineHeight: 18
  }
});
