import { Ionicons } from "@expo/vector-icons";
import { type Href, useRouter } from "expo-router";
import { useState } from "react";
import {
  ImageBackground,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View
} from "react-native";
import {
  dashboardAggregatePath,
  ORBIT_API_ENDPOINTS
} from "../../api/endpoints";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { colors, radius, spacing, typography } from "../../design/tokens";
import { useApiResource } from "../../hooks/useApiResource";
import {
  adminToView,
  type AdminEventView,
  type AdminMemberView,
  type AdminStatView,
  type AdminSurface
} from "../../view-models/admin";

function assetUrl(baseUrl: string, path: string): string {
  if (/^https?:\/\//iu.test(path)) {
    return path;
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl.replace(/\/+$/u, "")}${normalizedPath}`;
}

export function AdminScreen({ surface = "dashboard" }: { surface?: AdminSurface }) {
  const eventsState = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.events,
    (data) => adminToView({ events: data }).events.length === 0
  );
  const profileState = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.profile,
    () => false
  );
  const dashboardState = useApiResource<unknown>(
    dashboardAggregatePath(4),
    () => false
  );

  function refreshAll() {
    eventsState.refresh();
    profileState.refresh();
    dashboardState.refresh();
  }

  const title = surface === "events"
    ? "活动管理"
    : surface === "access"
      ? "访问管理"
      : "主办方后台";

  return (
    <AppScreen
      eyebrow="管理员"
      refreshControl={
        <RefreshControl
          onRefresh={refreshAll}
          refreshing={
            eventsState.refreshing ||
            profileState.refreshing ||
            dashboardState.refreshing
          }
          tintColor={colors.accent}
        />
      }
      title={title}
    >
      {eventsState.kind === "loading" ? <LoadingState /> : null}
      {eventsState.kind === "offline" ? (
        <ErrorState message={eventsState.error.message} title="服务器连不上" />
      ) : null}
      {eventsState.kind === "failure" ? (
        <ErrorState message={eventsState.error.message} />
      ) : null}
      {eventsState.kind === "empty" ? (
        <EmptyState
          message="活动导入或创建后，后台会显示报名、签到和匹配状态。"
          title="暂无活动记录"
        />
      ) : null}
      {eventsState.kind === "success" ? (
        <AdminContent
          dashboard={
            dashboardState.kind === "success" ? dashboardState.data : null
          }
          events={eventsState.data}
          profile={profileState.kind === "success" ? profileState.data : null}
          surface={surface}
        />
      ) : null}
    </AppScreen>
  );
}

function AdminContent({
  dashboard,
  events,
  profile,
  surface
}: {
  dashboard: unknown;
  events: unknown;
  profile: unknown;
  surface: AdminSurface;
}) {
  const router = useRouter();
  const [createEventDraftOpen, setCreateEventDraftOpen] = useState(false);
  const view = adminToView({
    dashboard,
    events,
    profile,
    surface
  });

  function navigateTo(href: Href) {
    router.push(href);
  }

  return (
    <>
      <DataCard detail={view.summary} title={`${view.org.name} · ${view.org.owner}`}>
        <AdminNav
          activeTab={view.activeTab}
          nav={view.nav}
          onNavigate={(href) => navigateTo(href as Href)}
        />
        <StatGrid stats={view.stats} />
      </DataCard>

      {surface === "access" ? (
        <AccessCard boundary={view.boundary} members={view.members} />
      ) : (
        <EventsCard
          emptyMessage={view.emptyEventMessage}
          emptyTitle={view.emptyEventTitle}
          events={view.events}
          onCreateEventDraft={
            surface === "events" ? () => setCreateEventDraftOpen(true) : null
          }
          onOpenEvent={(href) => navigateTo(href as Href)}
          title={surface === "events" ? "活动组合" : "近期活动"}
        />
      )}

      {surface === "events" && createEventDraftOpen ? (
        <CreateEventDraftCard onClose={() => setCreateEventDraftOpen(false)} />
      ) : null}

      {surface === "dashboard" ? <MembersCard members={view.members} /> : null}
      {surface !== "access" ? (
        <DataCard detail={view.boundary} title="移动端边界">
          <Text style={styles.bodyText}>
            后台写操作先保留在正式管理流程中；移动端这里只做核对和跳转。
          </Text>
        </DataCard>
      ) : null}
    </>
  );
}

function AdminNav({
  activeTab,
  nav,
  onNavigate
}: {
  activeTab: AdminSurface;
  nav: {
    href: "/admin" | "/admin/access" | "/admin/events";
    id: AdminSurface;
    label: string;
  }[];
  onNavigate: (href: string) => void;
}) {
  return (
    <View style={styles.navRow}>
      {nav.map((item) => {
        const active = item.id === activeTab;
        return (
          <Pressable
            accessibilityRole="button"
            key={item.id}
            onPress={() => onNavigate(item.href)}
            style={({ pressed }) => [
              styles.navPill,
              active ? styles.navPillActive : null,
              pressed ? styles.pressed : null
            ]}
          >
            <Text style={[styles.navText, active ? styles.navTextActive : null]}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function StatGrid({ stats }: { stats: AdminStatView[] }) {
  return (
    <View style={styles.statGrid}>
      {stats.map((stat) => (
        <View key={stat.id} style={styles.statCell}>
          <Text adjustsFontSizeToFit numberOfLines={1} style={styles.statValue}>
            {stat.value}
          </Text>
          <Text numberOfLines={1} style={styles.statLabel}>
            {stat.label}
          </Text>
          <Text numberOfLines={1} style={styles.statNote}>
            {stat.note}
          </Text>
        </View>
      ))}
    </View>
  );
}

function EventsCard({
  emptyMessage,
  emptyTitle,
  events,
  onCreateEventDraft,
  onOpenEvent,
  title
}: {
  emptyMessage: string;
  emptyTitle: string;
  events: AdminEventView[];
  onCreateEventDraft: (() => void) | null;
  onOpenEvent: (href: AdminEventView["href"]) => void;
  title: string;
}) {
  const { baseUrl } = useOrbitApiBaseUrl();

  if (events.length === 0) {
    return <EmptyState message={emptyMessage} title={emptyTitle} />;
  }

  return (
    <DataCard detail={`${events.length} 场活动记录`} title={title}>
      {onCreateEventDraft ? (
        <Pressable
          accessibilityRole="button"
          onPress={onCreateEventDraft}
          style={({ pressed }) => [
            styles.createEventButton,
            pressed ? styles.pressed : null
          ]}
        >
          <Ionicons color={colors.onAccent} name="add-outline" size={17} />
          <Text style={styles.createEventButtonText}>新建活动</Text>
        </Pressable>
      ) : null}
      <View style={styles.list}>
        {events.map((event) => (
          <Pressable
            accessibilityRole="button"
            key={event.id}
            onPress={() => onOpenEvent(event.href)}
            style={({ pressed }) => [
              styles.eventRow,
              pressed ? styles.pressed : null
            ]}
          >
            {event.coverPath ? (
              <ImageBackground
                imageStyle={styles.eventThumbImage}
                source={{ uri: assetUrl(baseUrl, event.coverPath) }}
                style={styles.eventThumbFrame}
              >
                <View style={styles.eventThumbOverlay} />
              </ImageBackground>
            ) : (
              <View style={styles.eventIcon}>
                <Text style={styles.eventFallbackText}>
                  {event.title.slice(0, 1)}
                </Text>
              </View>
            )}
            <View style={styles.eventCopy}>
              <View style={styles.eventTitleRow}>
                <Text numberOfLines={2} style={styles.itemTitle}>
                  {event.title}
                </Text>
                <View style={styles.statusBadge}>
                  <Text style={styles.statusText}>{event.stateLabel}</Text>
                </View>
              </View>
              <View style={styles.eventMetaStack}>
                <View style={styles.eventMetaLine}>
                  <Ionicons color={colors.text3} name="time-outline" size={14} />
                  <Text numberOfLines={1} style={styles.metaText}>
                    {event.startsAt}
                  </Text>
                </View>
                <View style={styles.eventMetaLine}>
                  <Ionicons color={colors.text3} name="location-outline" size={14} />
                  <Text numberOfLines={1} style={styles.metaText}>
                    {event.location}
                  </Text>
                </View>
              </View>
              <Text numberOfLines={2} style={styles.detailText}>
                {event.detail}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>
    </DataCard>
  );
}

function CreateEventDraftCard({ onClose }: { onClose: () => void }) {
  const setupSteps = [
    {
      detail: "活动名称、编号、主题色和一句话简介。",
      icon: "create-outline",
      title: "活动名称"
    },
    {
      detail: "开始时间、结束时间、场地和详细地址。",
      icon: "location-outline",
      title: "时间地点"
    },
    {
      detail: "报名表单可增加行业、目标和自我介绍问题。",
      icon: "list-outline",
      title: "报名表单"
    },
    {
      detail: "开放签到、运行 AI 分组、公布匹配结果。",
      icon: "flash-outline",
      title: "流程自动化"
    }
  ] as const;

  return (
    <DataCard detail="本地草稿，确认后再进入正式后台创建。" title="创建活动草稿">
      <View style={styles.draftStepList}>
        {setupSteps.map((step, index) => (
          <View key={step.title} style={styles.draftStepRow}>
            <View style={styles.draftStepIcon}>
              <Ionicons
                color={colors.accent}
                name={step.icon}
                size={16}
              />
            </View>
            <View style={styles.draftStepCopy}>
              <Text style={styles.itemTitle}>
                {index + 1}. {step.title}
              </Text>
              <Text style={styles.detailText}>{step.detail}</Text>
            </View>
          </View>
        ))}
      </View>
      <View style={styles.automationNote}>
        <Ionicons color={colors.accent} name="time-outline" size={17} />
        <Text style={styles.bodyText}>
          开放签到：活动开始前 30 分钟。运行 AI 分组：签到达到 60%。公布匹配结果：活动开始后 45 分钟。
        </Text>
      </View>
      <View style={styles.draftActionRow}>
        <Pressable
          accessibilityRole="button"
          onPress={onClose}
          style={({ pressed }) => [
            styles.secondaryButton,
            pressed ? styles.pressed : null
          ]}
        >
          <Text style={styles.secondaryButtonText}>取消</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onClose}
          style={({ pressed }) => [
            styles.createEventButton,
            pressed ? styles.pressed : null
          ]}
        >
          <Ionicons color={colors.onAccent} name="checkmark-outline" size={17} />
          <Text style={styles.createEventButtonText}>创建活动草稿</Text>
        </Pressable>
      </View>
    </DataCard>
  );
}

function MembersCard({ members }: { members: AdminMemberView[] }) {
  return (
    <DataCard detail="后台成员和角色只读展示。" title="团队成员">
      <MemberList members={members} />
    </DataCard>
  );
}

function AccessCard({
  boundary,
  members
}: {
  boundary: string;
  members: AdminMemberView[];
}) {
  return (
    <DataCard detail={boundary} title="访问成员">
      <MemberList members={members} />
      <View style={styles.accessNote}>
        <Ionicons color={colors.accent} name="lock-closed" size={18} />
        <Text style={styles.bodyText}>
          邀请成员、调整角色和撤销访问都需要再次确认。
        </Text>
      </View>
    </DataCard>
  );
}

function MemberList({ members }: { members: AdminMemberView[] }) {
  return (
    <View style={styles.list}>
      {members.map((member) => (
        <View key={member.id} style={styles.memberRow}>
          <View style={styles.memberIcon}>
            <Text style={styles.memberIconText}>{member.initial}</Text>
          </View>
          <View style={styles.memberCopy}>
            <Text numberOfLines={1} style={styles.itemTitle}>
              {member.name}
            </Text>
            <Text numberOfLines={1} style={styles.metaText}>
              {member.email}
            </Text>
          </View>
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>{member.role}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  accessNote: {
    alignItems: "center",
    backgroundColor: colors.accentSofter,
    borderRadius: radius.md,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md
  },
  bodyText: {
    color: colors.text2,
    flex: 1,
    fontSize: typography.small,
    lineHeight: 20
  },
  automationNote: {
    alignItems: "flex-start",
    backgroundColor: colors.accentSofter,
    borderRadius: radius.md,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md
  },
  createEventButton: {
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
  createEventButtonText: {
    color: colors.onAccent,
    fontSize: typography.small,
    fontWeight: "700"
  },
  detailText: {
    color: colors.text2,
    fontSize: typography.small,
    lineHeight: 19
  },
  draftActionRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    justifyContent: "space-between"
  },
  draftStepCopy: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0
  },
  draftStepIcon: {
    alignItems: "center",
    backgroundColor: colors.accentSofter,
    borderRadius: radius.md,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  draftStepList: {
    gap: spacing.sm
  },
  draftStepRow: {
    alignItems: "flex-start",
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md
  },
  eventCopy: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0
  },
  eventFallbackText: {
    color: colors.onAccent,
    fontSize: typography.section,
    fontWeight: "700"
  },
  eventIcon: {
    alignItems: "center",
    backgroundColor: colors.ink,
    borderRadius: radius.md,
    height: 48,
    justifyContent: "center",
    width: 48
  },
  eventMetaLine: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
    maxWidth: "100%",
    minWidth: 0
  },
  eventMetaStack: {
    gap: spacing.xxs
  },
  eventRow: {
    alignItems: "flex-start",
    backgroundColor: colors.bgSunken,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 94,
    padding: spacing.md
  },
  eventThumbFrame: {
    backgroundColor: colors.surface3,
    borderRadius: radius.md,
    height: 76,
    overflow: "hidden",
    width: 76
  },
  eventThumbImage: {
    borderRadius: radius.md
  },
  eventThumbOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(10,10,16,0.08)"
  },
  eventTitleRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between"
  },
  itemTitle: {
    color: colors.ink,
    flexShrink: 1,
    fontSize: typography.body,
    fontWeight: "700",
    lineHeight: 20
  },
  list: {
    gap: spacing.sm
  },
  memberCopy: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0
  },
  memberIcon: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  memberIconText: {
    color: colors.onAccent,
    fontSize: typography.section,
    fontWeight: "700"
  },
  memberRow: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md
  },
  metaText: {
    color: colors.text3,
    fontSize: typography.small
  },
  navPill: {
    alignItems: "center",
    backgroundColor: colors.bgSunken,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexGrow: 1,
    minHeight: 38,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm
  },
  navPillActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink
  },
  navRow: {
    flexDirection: "row",
    gap: spacing.sm
  },
  navText: {
    color: colors.text2,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  navTextActive: {
    color: colors.onAccent
  },
  pressed: {
    opacity: 0.82,
    transform: [{ translateY: 0.5 }]
  },
  roleBadge: {
    backgroundColor: colors.accentSofter,
    borderRadius: radius.pill,
    flexShrink: 0,
    maxWidth: 110,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs
  },
  roleText: {
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.control,
    borderWidth: 1,
    minHeight: 40,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  secondaryButtonText: {
    color: colors.text2,
    fontSize: typography.small,
    fontWeight: "700"
  },
  statCell: {
    backgroundColor: colors.bgSunken,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xs,
    minHeight: 98,
    padding: spacing.md,
    width: "48%"
  },
  statGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    justifyContent: "space-between"
  },
  statLabel: {
    color: colors.ink,
    fontSize: typography.small,
    fontWeight: "700"
  },
  statNote: {
    color: colors.text3,
    fontSize: typography.caption
  },
  statValue: {
    color: colors.ink,
    fontSize: 28,
    fontWeight: "800",
    lineHeight: 32
  },
  statusBadge: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    flexShrink: 0,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs
  },
  statusText: {
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: "700"
  }
});
