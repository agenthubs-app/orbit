import { Ionicons } from "@expo/vector-icons";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import {
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View
} from "react-native";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
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

function assetUrl(baseUrl: string, path: string): string {
  if (/^https?:\/\//iu.test(path)) {
    return path;
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl.replace(/\/+$/u, "")}${normalizedPath}`;
}

function screenCopy(variant: PartyModeVariant): { eyebrow: string; title: string } {
  if (variant === "checkin") {
    return { eyebrow: "现场签到", title: "签到状态" };
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
    null;
  const copy = screenCopy(variant);

  if (!eventId) {
    return <PartyEventRequired copy={copy} />;
  }

  return <PartyEventScreen eventId={eventId} variant={variant} />;
}

function PartyEventRequired({
  copy
}: {
  copy: { eyebrow: string; title: string };
}) {
  const router = useRouter();

  return (
    <AppScreen eyebrow={copy.eyebrow} title={copy.title}>
      <EmptyState
        message="先从活动列表打开一场真实活动，再进入签到、匹配和关系图。"
        title="尚未选择活动"
      />
      <View style={styles.actionGrid}>
        <ActionButton
          icon="calendar-outline"
          label="查看活动"
          onPress={() => router.push("/events" as Href)}
          primary
        />
      </View>
    </AppScreen>
  );
}

function PartyEventScreen({
  eventId,
  variant
}: {
  eventId: string;
  variant: PartyModeVariant;
}) {
  const router = useRouter();
  const eventState = useApiResource<unknown>(eventDetailPath(eventId), () => false);
  const attendeeState = useApiResource<unknown>(
    eventAttendeesPath(eventId),
    () => false
  );
  const matchState = useApiResource<unknown>(eventMatchesPath(eventId), () => false);
  const copy = screenCopy(variant);
  const attendeeSourceMissing =
    (eventState.kind === "success" || eventState.kind === "empty") &&
    attendeeState.kind === "failure" &&
    attendeeState.error.code === "NOT_FOUND";

  function refresh() {
    eventState.refresh();
    attendeeState.refresh();
    matchState.refresh();
  }

  const party =
    isUsable(eventState) && isUsable(attendeeState)
      ? partyModeToView({
          attendeesPayload: attendeeState.data,
          eventId,
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
      {eventState.kind === "failure" ||
      (attendeeState.kind === "failure" && !attendeeSourceMissing) ? (
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
      {attendeeSourceMissing ? (
        <>
          <EmptyState
            message="这场活动还没有接入参会者名单或签到数据。当前不会生成通行码、现场匹配或签到结果。"
            title="现场数据尚未连接"
          />
          <View style={styles.actionGrid}>
            <ActionButton
              icon="calendar-outline"
              label="返回活动"
              onPress={() =>
                router.push({
                  params: { id: eventId },
                  pathname: "/events/[id]"
                })
              }
              primary
            />
          </View>
        </>
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
  const { baseUrl } = useOrbitApiBaseUrl();

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
            label="签到状态"
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
      <CheckInBoundaryCard party={party} />
      {party.priorityPeople.length === 0 ? (
        <EmptyState message="这场活动暂时没有可见名单。" title="还没有参会者" />
      ) : (
        party.priorityPeople.map((person) => (
          <PriorityPersonCard baseUrl={baseUrl} key={person.id} person={person} />
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
      <DataCard detail={party.checkIn.statusLabel} title={party.eventTitle}>
        <View style={styles.checkInBoundary}>
          <Ionicons color={colors.amber} name="information-circle-outline" size={28} />
          <Text style={styles.checkInBoundaryTitle}>签到尚未连接</Text>
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
          />
          <ActionButton
            icon="git-network-outline"
            label="看关系图"
            onPress={() => router.push(partyHref("/party/graph", party.eventId))}
            primary
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
      <PartyConnectionMap party={party} />
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

function PartyConnectionMap({ party }: { party: PartyModeView }) {
  const { baseUrl } = useOrbitApiBaseUrl();
  const people = party.priorityPeople.slice(0, 5);

  if (people.length === 0) {
    return null;
  }

  return (
    <DataCard
      detail={`${people.length} 个优先节点 · ${party.matches.length} 条现场匹配`}
      title="现场连接地图"
    >
      <View style={styles.connectionMapStage}>
        <View style={styles.connectionMapCenter}>
          <Ionicons color={colors.onAccent} name="person-outline" size={18} />
          <Text style={styles.connectionMapCenterText}>我</Text>
          <Text style={styles.connectionMapCenterMeta}>现场关系</Text>
        </View>
        <View style={styles.connectionMapNodes}>
          {party.priorityPeople.slice(0, 5).map((person, index) => (
            <View
              key={person.id}
              style={[
                styles.connectionNode,
                index === 0 ? styles.connectionNodePrimary : null
              ]}
            >
              <View style={styles.connectionNodeMarker}>
                <PartyPersonAvatar
                  baseUrl={baseUrl}
                  imageUrl={person.imageUrl}
                  name={person.name}
                  style={styles.connectionNodeAvatar}
                  textStyle={styles.connectionNodeAvatarText}
                />
              </View>
              <View style={styles.connectionNodeText}>
                <Text numberOfLines={1} style={styles.connectionNodeName}>
                  {person.name}
                </Text>
                <Text numberOfLines={1} style={styles.connectionNodeMeta}>
                  {person.matchLabel} · {person.groupLabel}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>
      <Text style={styles.nextText}>
        先从 1 号节点开始聊，确认对方需求、可交换资源和下一步。
      </Text>
    </DataCard>
  );
}

function CheckInBoundaryCard({ party }: { party: PartyModeView }) {
  return (
    <DataCard detail={party.checkIn.statusLabel} title="现场签到">
      <View style={styles.ticketCompact}>
        <Text style={styles.checkInBoundaryTitle}>未生成签到码</Text>
        <Text style={styles.mutedText}>{party.checkIn.instruction}</Text>
      </View>
    </DataCard>
  );
}

function PriorityPersonCard({
  baseUrl,
  person
}: {
  baseUrl: string;
  person: PartyPriorityPersonView;
}) {
  return (
    <DataCard detail={person.organizationRole} title={person.name}>
      <View style={styles.priorityPersonHeader}>
        <PartyPersonAvatar
          baseUrl={baseUrl}
          imageUrl={person.imageUrl}
          name={person.name}
          style={styles.partyPersonAvatar}
          textStyle={styles.partyPersonAvatarText}
        />
        <View style={styles.priorityPersonMeta}>
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
        </View>
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
  const { baseUrl } = useOrbitApiBaseUrl();

  return (
    <DataCard detail={group.detail} title={group.title}>
      <View style={styles.stack}>
        {group.people.map((person) => (
          <View key={person.id} style={styles.graphPersonRow}>
            <PartyPersonAvatar
              baseUrl={baseUrl}
              imageUrl={person.imageUrl}
              name={person.name}
              style={styles.graphPersonAvatar}
              textStyle={styles.graphPersonAvatarText}
            />
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

function PartyPersonAvatar({
  baseUrl,
  imageUrl,
  name,
  style,
  textStyle
}: {
  baseUrl: string;
  imageUrl: string | undefined;
  name: string;
  style: object;
  textStyle: object;
}) {
  return (
    <View style={style}>
      {imageUrl ? (
        <Image
          resizeMode="cover"
          source={{ uri: assetUrl(baseUrl, imageUrl) }}
          style={styles.partyPersonAvatarImage}
        />
      ) : (
        <Text style={textStyle}>{name.slice(0, 1) || "?"}</Text>
      )}
    </View>
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
    minHeight: 44,
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
  checkInBoundary: {
    alignItems: "flex-start",
    backgroundColor: colors.amberSoft,
    borderColor: colors.amber,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md
  },
  checkInBoundaryTitle: {
    color: colors.ink,
    fontSize: typography.body,
    fontWeight: "800",
    lineHeight: 22
  },
  connectionMapCenter: {
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    gap: spacing.xs,
    justifyContent: "center",
    minHeight: 98,
    padding: spacing.md,
    width: 92
  },
  connectionMapCenterMeta: {
    color: colors.accentSoft,
    fontFamily: "Courier",
    fontSize: typography.caption,
    fontWeight: "800",
    letterSpacing: 0,
    lineHeight: 18
  },
  connectionMapCenterText: {
    color: colors.onAccent,
    fontSize: typography.small,
    fontWeight: "800",
    lineHeight: 20
  },
  connectionMapNodes: {
    flex: 1,
    gap: spacing.sm
  },
  connectionMapStage: {
    alignItems: "stretch",
    backgroundColor: colors.bgSunken,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 170,
    padding: spacing.md
  },
  connectionNode: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 42,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs
  },
  connectionNodeMarker: {
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderRadius: radius.pill,
    height: 26,
    justifyContent: "center",
    width: 26
  },
  connectionNodeMarkerText: {
    color: colors.text2,
    fontSize: typography.caption,
    fontWeight: "800",
    lineHeight: 16
  },
  connectionNodeAvatar: {
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderRadius: radius.pill,
    height: 26,
    justifyContent: "center",
    overflow: "hidden",
    width: 26
  },
  connectionNodeAvatarText: {
    color: colors.text2,
    fontSize: typography.caption,
    fontWeight: "800",
    lineHeight: 16
  },
  connectionNodeMeta: {
    color: colors.text3,
    fontSize: typography.caption,
    lineHeight: 18
  },
  connectionNodeName: {
    color: colors.ink,
    fontSize: typography.small,
    fontWeight: "800",
    lineHeight: 20
  },
  connectionNodePrimary: {
    backgroundColor: colors.liveSoft,
    borderColor: colors.live
  },
  connectionNodeText: {
    flex: 1,
    minWidth: 0
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
  graphPersonAvatar: {
    alignItems: "center",
    backgroundColor: colors.accentSofter,
    borderRadius: radius.pill,
    height: 34,
    justifyContent: "center",
    overflow: "hidden",
    width: 34
  },
  graphPersonAvatarText: {
    color: colors.accent,
    fontSize: typography.small,
    fontWeight: "800"
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
  partyPersonAvatar: {
    alignItems: "center",
    backgroundColor: colors.accentSofter,
    borderRadius: radius.pill,
    height: 44,
    justifyContent: "center",
    overflow: "hidden",
    width: 44
  },
  partyPersonAvatarImage: {
    borderRadius: radius.pill,
    height: "100%",
    width: "100%"
  },
  partyPersonAvatarText: {
    color: colors.accent,
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 22
  },
  pressed: {
    opacity: 0.78,
    transform: [{ translateY: 0.5 }]
  },
  priorityPersonHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm
  },
  priorityPersonMeta: {
    flex: 1,
    minWidth: 0
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
  ticketCompact: {
    backgroundColor: colors.bgSunken,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md
  },
  ticketHint: {
    color: colors.text2,
    fontSize: typography.small,
    lineHeight: 20
  }
});
