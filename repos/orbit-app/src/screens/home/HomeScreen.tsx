import { Ionicons } from "@expo/vector-icons";
import { type Href, useRouter } from "expo-router";
import { Fragment, useMemo, useState } from "react";
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
import { DataCard } from "../../components/DataCard";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { colors, radius, spacing, typography } from "../../design/tokens";
import { useApiResource } from "../../hooks/useApiResource";
import {
  homeFilteredEvents,
  homeToView,
  type HomeEntryView,
  type HomeEventFilter,
  type HomeEventView,
  type HomePipelineItemView,
  type HomeProfileGroupView,
  type HomeProfilePanelView,
  type HomeView
} from "../../view-models/home";

type HomeMode = "events" | "hub";

const filterLabels: Record<HomeEventFilter, string> = {
  active: "进行中",
  all: "全部",
  ended: "历史",
  upcoming: "即将"
};

const homeAskPrompts = [
  "今天我应该先跟进谁？",
  "帮我准备最近一场活动",
  "有哪些人适合互相介绍？"
] as const;

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

export function HomeScreen({ mode = "hub" }: { mode?: HomeMode }) {
  const router = useRouter();
  const { baseUrl } = useOrbitApiBaseUrl();
  const [filter, setFilter] = useState<HomeEventFilter>("all");
  const profileState = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.profile,
    () => false
  );
  const eventsState = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.events,
    () => false
  );
  const contactsState = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.contacts,
    () => false
  );
  const view = useMemo(() => {
    if (!isReady(profileState) || !isReady(eventsState) || !isReady(contactsState)) {
      return null;
    }

    return homeToView({
      contacts: contactsState.data,
      events: eventsState.data,
      profile: profileState.data
    });
  }, [contactsState, eventsState, profileState]);

  function refreshAll() {
    profileState.refresh();
    eventsState.refresh();
    contactsState.refresh();
  }

  const loading =
    profileState.kind === "loading" ||
    eventsState.kind === "loading" ||
    contactsState.kind === "loading";
  const offline =
    profileState.kind === "offline"
      ? profileState.error.message
      : eventsState.kind === "offline"
        ? eventsState.error.message
        : contactsState.kind === "offline"
          ? contactsState.error.message
          : null;
  const failure =
    profileState.kind === "failure"
      ? profileState.error.message
      : eventsState.kind === "failure"
        ? eventsState.error.message
        : contactsState.kind === "failure"
          ? contactsState.error.message
          : null;

  return (
    <AppScreen
      eyebrow={mode === "events" ? "我的活动" : "个人首页"}
      refreshControl={
        <RefreshControl
          onRefresh={refreshAll}
          refreshing={
            profileState.refreshing ||
            eventsState.refreshing ||
            contactsState.refreshing
          }
          tintColor={colors.accent}
        />
      }
      title={mode === "events" ? "我的活动" : "首页"}
    >
      {loading ? <LoadingState /> : null}
      {offline ? <ErrorState message={offline} title="服务器连不上" /> : null}
      {failure ? <ErrorState message={failure} title="首页不可用" /> : null}
      {view ? (
        mode === "events" ? (
          <HomeEventsContent
            baseUrl={baseUrl}
            filter={filter}
            onFilterChange={setFilter}
            onOpenEvent={(eventId) =>
              router.push(`/events/${encodeURIComponent(eventId)}` as Href)
            }
            view={view}
          />
        ) : (
          <HomeHubContent
            baseUrl={baseUrl}
            onAskOrbit={(message) =>
              router.push({
                params: { id: "new", initialMessage: message },
                pathname: "/ai/[id]"
              })
            }
            onOpenEntry={(href) => router.push(href as Href)}
            onOpenEvent={(eventId) =>
              router.push(`/events/${encodeURIComponent(eventId)}` as Href)
            }
            onOpenEvents={() => router.push("/home/events" as Href)}
            view={view}
          />
        )
      ) : null}
    </AppScreen>
  );
}

function HomeHubContent({
  baseUrl,
  onAskOrbit,
  onOpenEntry,
  onOpenEvent,
  onOpenEvents,
  view
}: {
  baseUrl: string;
  onAskOrbit: (message: string) => void;
  onOpenEntry: (href: HomeEntryView["href"]) => void;
  onOpenEvent: (eventId: string) => void;
  onOpenEvents: () => void;
  view: HomeView;
}) {
  const previewEvents = view.events.slice(0, view.layout.secondaryEventLimit);
  const [askDraft, setAskDraft] = useState("");
  const [askError, setAskError] = useState<string | null>(null);

  function submitAsk(message: string) {
    const trimmed = message.trim();

    if (!trimmed) {
      setAskError("先输入你想让 Orbit AI 判断的问题。");
      return;
    }

    setAskError(null);
    setAskDraft("");
    onAskOrbit(trimmed);
  }

  return (
    <>
      <View style={[styles.homeHero, { minHeight: view.layout.aiMinHeight }]}>
        <View style={styles.heroHeader}>
          <View style={styles.heroAiIcon}>
            <Ionicons color={colors.accent} name="sparkles-outline" size={22} />
          </View>
          <View style={styles.heroTextBlock}>
            <Text style={styles.heroEyebrow}>Ask Orbit AI</Text>
            <Text numberOfLines={2} style={styles.heroTitle}>
              {view.assistant.title}
            </Text>
          </View>
        </View>
        <View style={styles.askComposer}>
          <TextInput
            multiline
            onChangeText={setAskDraft}
            placeholder={view.assistant.placeholder}
            placeholderTextColor={colors.text4}
            style={[
              styles.askInput,
              { minHeight: view.layout.askInputMinHeight }
            ]}
            value={askDraft}
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => submitAsk(askDraft)}
            style={({ pressed }) => [
              styles.askSendButton,
              pressed ? styles.pressed : null
            ]}
          >
            <Ionicons color={colors.onAccent} name="send" size={18} />
          </Pressable>
        </View>
        {askError ? <Text style={styles.errorText}>{askError}</Text> : null}
        <View style={styles.promptChips}>
          {homeAskPrompts.map((prompt) => (
            <Pressable
              accessibilityRole="button"
              key={prompt}
              onPress={() => submitAsk(prompt)}
              style={({ pressed }) => [
                styles.promptChip,
                pressed ? styles.pressed : null
              ]}
            >
              <Text style={styles.promptChipText}>{prompt}</Text>
            </Pressable>
          ))}
        </View>
        <PipelineRail items={view.pipeline} />
      </View>

      <HomeProfilePanel
        onPress={() => onOpenEntry("/profile")}
        panel={view.profilePanel}
      />

      <View style={styles.sectionBlock}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>常用入口</Text>
          <Text style={styles.sectionHint}>需要直接处理时再打开</Text>
        </View>
        <View style={styles.entryGrid}>
          {view.entries.map((entry) => (
            <EntryTile
              entry={entry}
              key={entry.href}
              onPress={onOpenEntry}
              variant={view.layout.entryVariant}
            />
          ))}
        </View>
      </View>

      <View style={styles.sectionBlock}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleBlock}>
            <Text style={styles.sectionTitle}>我的活动</Text>
            <Text style={styles.sectionHint}>挑一场需要准备的活动</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={onOpenEvents}
            style={({ pressed }) => [
              styles.textIconButton,
              pressed ? styles.pressed : null
            ]}
          >
            <Text style={styles.textIconButtonText}>全部</Text>
            <Ionicons color={colors.accent} name="chevron-forward" size={16} />
          </Pressable>
        </View>
        {previewEvents.length > 0 ? (
          <View style={styles.eventStack}>
            {previewEvents.map((event) => (
              <EventRow
                baseUrl={baseUrl}
                event={event}
                key={event.id}
                onPress={onOpenEvent}
              />
            ))}
          </View>
        ) : (
          <EmptyState message="报名过的活动会出现在这里。" title="暂无活动" />
        )}
      </View>
    </>
  );
}

function HomeProfilePanel({
  onPress,
  panel
}: {
  onPress: () => void;
  panel: HomeProfilePanelView;
}) {
  return (
    <DataCard detail={panel.goal} onPress={onPress} title={panel.title}>
      {panel.bio ? <Text style={styles.profileBio}>{panel.bio}</Text> : null}
      {panel.facts.length > 0 ? (
        <View style={styles.profileFactGrid}>
          {panel.facts.map((fact) => (
            <View key={fact.label} style={styles.profileFact}>
              <Text style={styles.profileFactLabel}>{fact.label}</Text>
              <Text numberOfLines={2} style={styles.profileFactValue}>
                {fact.value}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      {panel.groups.length > 0 ? (
        <View style={styles.profileGroupStack}>
          {panel.groups.map((group) => (
            <HomeProfileGroup group={group} key={group.title} />
          ))}
        </View>
      ) : null}
    </DataCard>
  );
}

function HomeProfileGroup({ group }: { group: HomeProfileGroupView }) {
  return (
    <View style={styles.profileGroup}>
      <Text style={styles.profileGroupTitle}>{group.title}</Text>
      <View style={styles.profileChipRow}>
        {group.items.slice(0, 5).map((item) => (
          <Text key={item} style={styles.profileChip}>
            {item}
          </Text>
        ))}
      </View>
    </View>
  );
}

function HomeEventsContent({
  baseUrl,
  filter,
  onFilterChange,
  onOpenEvent,
  view
}: {
  baseUrl: string;
  filter: HomeEventFilter;
  onFilterChange: (filter: HomeEventFilter) => void;
  onOpenEvent: (eventId: string) => void;
  view: HomeView;
}) {
  const events = homeFilteredEvents(view.events, filter);

  return (
    <>
      <DataCard detail={`${view.stats.events} 场活动`} title="活动状态">
        <View style={styles.filterRow}>
          {(Object.keys(filterLabels) as HomeEventFilter[]).map((key) => (
            <Pressable
              accessibilityRole="button"
              key={key}
              onPress={() => onFilterChange(key)}
              style={[
                styles.filterButton,
                filter === key ? styles.filterButtonActive : null
              ]}
            >
              <Text
                style={[
                  styles.filterButtonText,
                  filter === key ? styles.filterButtonTextActive : null
                ]}
              >
                {filterLabels[key]} {view.filterCounts[key]}
              </Text>
            </Pressable>
          ))}
        </View>
      </DataCard>
      {events.length > 0 ? (
        <View style={styles.eventStack}>
          {events.map((event) => (
            <EventRow
              baseUrl={baseUrl}
              event={event}
              key={event.id}
              onPress={onOpenEvent}
            />
          ))}
        </View>
      ) : (
        <EmptyState message="当前没有这个状态的活动。" title="没有活动" />
      )}
    </>
  );
}

function PipelineRail({ items }: { items: HomePipelineItemView[] }) {
  return (
    <View style={styles.pipelineRail}>
      {items.map((item, index) => (
        <Fragment key={item.label}>
          {index > 0 ? <View style={styles.pipelineDivider} /> : null}
          <PipelineCell item={item} />
        </Fragment>
      ))}
    </View>
  );
}

function PipelineCell({ item }: { item: HomePipelineItemView }) {
  const textStyle =
    item.tone === "live"
      ? styles.pipelineValueLive
      : item.tone === "sky"
        ? styles.pipelineValueSky
        : styles.pipelineValueAccent;

  return (
    <View style={styles.pipelineCell}>
      <Text numberOfLines={1} style={[styles.pipelineValue, textStyle]}>
        {item.value}
      </Text>
      <Text numberOfLines={1} style={styles.pipelineLabel}>
        {item.label}
      </Text>
      <Text
        ellipsizeMode="tail"
        numberOfLines={2}
        style={styles.pipelineDetail}
      >
        {item.detail}
      </Text>
    </View>
  );
}

function EntryTile({
  entry,
  onPress,
  variant
}: {
  entry: HomeEntryView;
  onPress: (href: HomeEntryView["href"]) => void;
  variant?: HomeView["layout"]["entryVariant"];
}) {
  const iconName =
    entry.href === "/profile"
      ? "person-outline"
      : entry.href === "/contacts"
        ? "people-outline"
        : "calendar-outline";

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onPress(entry.href)}
      style={({ pressed }) => [
        styles.entryTile,
        variant === "compact" ? styles.entryTileCompact : null,
        pressed ? styles.pressed : null
      ]}
    >
      <View
        style={[
          styles.entryIcon,
          variant === "compact" ? styles.entryIconCompact : null
        ]}
      >
        <Ionicons color={colors.accent} name={iconName} size={18} />
      </View>
      <Text numberOfLines={1} style={styles.itemTitle}>
        {entry.title}
      </Text>
      {variant === "compact" ? null : (
        <Text numberOfLines={3} style={styles.metaText}>
          {entry.detail}
        </Text>
      )}
    </Pressable>
  );
}

function EventRow({
  baseUrl,
  event,
  onPress
}: {
  baseUrl: string;
  event: HomeEventView;
  onPress: (eventId: string) => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onPress(event.id)}
      style={({ pressed }) => [styles.eventRow, pressed ? styles.pressed : null]}
    >
      <ImageBackground
        imageStyle={styles.eventImage}
        source={{ uri: assetUrl(baseUrl, event.coverPath) }}
        style={styles.eventImageFrame}
      >
        <View style={styles.eventImageScrim} />
        <Text style={styles.imageStatePill}>{filterLabels[event.state]}</Text>
      </ImageBackground>
      <View style={styles.rowText}>
        <Text numberOfLines={2} style={styles.itemTitle}>
          {event.title}
        </Text>
        <Text style={styles.metaText}>{event.detailLine}</Text>
      </View>
      <Ionicons color={colors.text3} name="chevron-forward" size={18} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  askComposer: {
    alignItems: "flex-end",
    backgroundColor: colors.surface,
    borderColor: colors.accentSoft,
    borderRadius: radius.input,
    borderWidth: 2,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md
  },
  askInput: {
    color: colors.text,
    flex: 1,
    fontSize: 17,
    lineHeight: 24,
    maxHeight: 190,
    minHeight: 96,
    minWidth: 0,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    textAlignVertical: "top"
  },
  askSendButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: radius.control,
    height: 44,
    justifyContent: "center",
    width: 48
  },
  bodyText: {
    color: colors.text2,
    fontSize: typography.small,
    lineHeight: 20
  },
  entryIcon: {
    alignItems: "center",
    backgroundColor: colors.accentSofter,
    borderRadius: radius.control,
    height: 38,
    justifyContent: "center",
    width: 38
  },
  entryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  entryRow: {
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md
  },
  entryStack: {
    gap: spacing.sm
  },
  entryTile: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexBasis: "31%",
    flexGrow: 1,
    gap: spacing.sm,
    minHeight: 112,
    minWidth: 104,
    padding: spacing.md
  },
  entryIconCompact: {
    height: 34,
    width: 34
  },
  entryTileCompact: {
    alignItems: "center",
    backgroundColor: colors.surface2,
    flexBasis: "31%",
    gap: spacing.xs,
    justifyContent: "center",
    minHeight: 76,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md
  },
  errorText: {
    color: colors.rose,
    fontSize: typography.small,
    lineHeight: 20
  },
  eventImage: {
    borderRadius: radius.sm
  },
  eventImageFrame: {
    alignItems: "flex-start",
    backgroundColor: colors.surface3,
    borderRadius: radius.sm,
    height: 76,
    justifyContent: "flex-start",
    overflow: "hidden",
    padding: spacing.sm,
    width: 92
  },
  eventImageScrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.12)"
  },
  eventMark: {
    alignItems: "center",
    backgroundColor: colors.ink,
    borderRadius: radius.md,
    height: 42,
    justifyContent: "center",
    width: 42
  },
  eventMarkText: {
    color: colors.onAccent,
    fontSize: typography.section,
    fontWeight: "700",
    lineHeight: 22
  },
  eventRow: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md
  },
  eventStack: {
    gap: spacing.sm
  },
  filterButton: {
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.control,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  filterButtonActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  filterButtonText: {
    color: colors.text2,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 16
  },
  filterButtonTextActive: {
    color: colors.onAccent
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  heroAiIcon: {
    alignItems: "center",
    backgroundColor: colors.accentSofter,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    height: 48,
    justifyContent: "center",
    width: 48
  },
  heroEyebrow: {
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: "800",
    lineHeight: 16
  },
  heroHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md
  },
  heroHeadline: {
    color: colors.text2,
    fontSize: typography.small,
    lineHeight: 19
  },
  heroSummary: {
    color: colors.text,
    fontSize: typography.small,
    lineHeight: 20
  },
  heroTextBlock: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0
  },
  heroTitle: {
    color: colors.ink,
    fontSize: 29,
    fontWeight: "800",
    lineHeight: 34
  },
  homeHero: {
    backgroundColor: colors.surface,
    borderColor: colors.accentSoft,
    borderRadius: radius.lg,
    borderWidth: 2,
    gap: spacing.xl,
    minHeight: 430,
    padding: spacing.xl
  },
  imageStatePill: {
    backgroundColor: "rgba(255,255,255,0.9)",
    borderRadius: radius.pill,
    color: colors.ink,
    fontSize: 11,
    fontWeight: "800",
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 5
  },
  itemTitle: {
    color: colors.ink,
    fontSize: typography.body,
    fontWeight: "700",
    lineHeight: 20
  },
  metaText: {
    color: colors.text3,
    fontSize: typography.small,
    lineHeight: 19
  },
  pipelineCell: {
    alignItems: "center",
    flex: 1,
    gap: spacing.xxs,
    minHeight: 82,
    minWidth: 0,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.md
  },
  pipelineDetail: {
    color: colors.text3,
    fontSize: 11,
    lineHeight: 15,
    textAlign: "center"
  },
  pipelineDivider: {
    alignSelf: "stretch",
    backgroundColor: colors.border,
    width: StyleSheet.hairlineWidth
  },
  pipelineLabel: {
    color: colors.text2,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 16,
    textAlign: "center"
  },
  pipelineRail: {
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    overflow: "hidden"
  },
  pipelineValue: {
    fontSize: 24,
    fontWeight: "900",
    lineHeight: 28
  },
  pipelineValueAccent: {
    color: colors.accent
  },
  pipelineValueLive: {
    color: colors.live
  },
  pipelineValueSky: {
    color: colors.sky
  },
  pressed: {
    opacity: 0.84,
    transform: [{ translateY: 0.5 }]
  },
  profileBio: {
    color: colors.text,
    fontSize: typography.small,
    lineHeight: 20
  },
  profileChip: {
    backgroundColor: colors.accentSofter,
    borderRadius: radius.pill,
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 16,
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  profileChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs
  },
  profileFact: {
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    flexBasis: "31%",
    flexGrow: 1,
    gap: 3,
    minWidth: 94,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm
  },
  profileFactGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  profileFactLabel: {
    color: colors.text3,
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 14
  },
  profileFactValue: {
    color: colors.ink,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 17
  },
  profileGroup: {
    gap: spacing.xs
  },
  profileGroupStack: {
    gap: spacing.sm
  },
  profileGroupTitle: {
    color: colors.text2,
    fontSize: typography.caption,
    fontWeight: "800",
    lineHeight: 16
  },
  promptChip: {
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7
  },
  promptChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  promptChipText: {
    color: colors.text2,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 16
  },
  rowText: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0
  },
  sectionBlock: {
    gap: spacing.sm
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
    paddingHorizontal: spacing.xs
  },
  sectionHint: {
    color: colors.text3,
    flexShrink: 1,
    fontSize: typography.caption,
    lineHeight: 16,
    textAlign: "right"
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: typography.section,
    fontWeight: "800",
    lineHeight: 22
  },
  sectionTitleBlock: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: colors.accentSofter,
    borderColor: colors.border,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.xs,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md
  },
  secondaryButtonText: {
    color: colors.accent,
    fontSize: typography.small,
    fontWeight: "700",
    lineHeight: 18
  },
  statCell: {
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    flex: 1,
    gap: spacing.xs,
    minWidth: 84,
    padding: spacing.md
  },
  statLabel: {
    color: colors.text3,
    fontSize: typography.caption,
    lineHeight: 16
  },
  statRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  statValue: {
    color: colors.ink,
    fontSize: typography.title,
    fontWeight: "700",
    lineHeight: 24
  },
  statePill: {
    backgroundColor: colors.accentSofter,
    borderRadius: radius.control,
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  textIconButton: {
    alignItems: "center",
    backgroundColor: colors.accentSofter,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 36,
    paddingHorizontal: spacing.md
  },
  textIconButtonText: {
    color: colors.accent,
    fontSize: typography.small,
    fontWeight: "800",
    lineHeight: 18
  }
});
