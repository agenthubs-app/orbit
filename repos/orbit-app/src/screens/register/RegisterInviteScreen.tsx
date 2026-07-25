import { Ionicons } from "@expo/vector-icons";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { eventDetailPath, ORBIT_API_ENDPOINTS } from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { SectionHeader } from "../../components/SectionHeader";
import { colors, radius, spacing, typography } from "../../design/tokens";
import { useApiResource } from "../../hooks/useApiResource";
import {
  registerInviteToView,
  type RegisterInviteAction,
  type RegisterInviteProfileView,
  type RegisterInviteReadinessStatus,
  type RegisterInviteReadinessView,
  type RegisterInviteView
} from "../../view-models/register-invite";

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

export function RegisterInviteScreen() {
  const auth = useOrbitAuthSession();
  const params = useLocalSearchParams<{ code?: string | string[] }>();
  const inviteCode = firstParam(params.code).trim() || "demo-event-1";
  const eventState = useApiResource<unknown>(
    eventDetailPath(inviteCode),
    () => false
  );
  const profileState = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.profile,
    () => false
  );

  function refreshAll() {
    eventState.refresh();
    profileState.refresh();
  }

  const loading =
    !auth.ready ||
    eventState.kind === "loading" ||
    profileState.kind === "loading";
  const offline =
    eventState.kind === "offline" ? eventState : profileState.kind === "offline" ? profileState : null;

  return (
    <AppScreen
      eyebrow="活动报名"
      refreshControl={
        <RefreshControl
          onRefresh={refreshAll}
          refreshing={eventState.refreshing || profileState.refreshing}
          tintColor={colors.accent}
        />
      }
      title="报名资料准备"
    >
      {loading ? <LoadingState /> : null}
      {offline ? (
        <ErrorState message={offline.error.message} title="服务器连不上" />
      ) : null}
      {!loading && !offline ? (
        <RegisterInviteContent
          authenticated={auth.signedIn}
          eventPayload={
            eventState.kind === "success" || eventState.kind === "empty"
              ? eventState.data
              : null
          }
          inviteCode={inviteCode}
          profilePayload={
            profileState.kind === "success" || profileState.kind === "empty"
              ? profileState.data
              : null
          }
        />
      ) : null}
    </AppScreen>
  );
}

function RegisterInviteContent({
  authenticated,
  eventPayload,
  inviteCode,
  profilePayload
}: {
  authenticated: boolean;
  eventPayload: unknown;
  inviteCode: string;
  profilePayload: unknown;
}) {
  const view = registerInviteToView({
    authenticated,
    eventPayload,
    inviteCode,
    profilePayload
  });

  return (
    <>
      <RegistrationReadinessCard readiness={view.readiness} />
      <InviteCard view={view} />
      <ProfilePreview profile={view.profile} />
      <DataCard detail={view.guardrail} title="操作边界">
        <View style={styles.guardrailRow}>
          <Ionicons color={colors.amber} name="lock-closed-outline" size={18} />
          <Text style={styles.bodyText}>
            继续报名会进入活动问题页；这一步只检查资料。
          </Text>
        </View>
      </DataCard>
      <ActionList actions={view.actions} />
    </>
  );
}

function readinessIconName(status: RegisterInviteReadinessStatus) {
  if (status === "complete") {
    return "checkmark-circle-outline";
  }

  if (status === "next") {
    return "arrow-forward-circle-outline";
  }

  if (status === "blocked") {
    return "lock-closed-outline";
  }

  return "alert-circle-outline";
}

function readinessColor(status: RegisterInviteReadinessStatus) {
  if (status === "complete") {
    return colors.live;
  }

  if (status === "next") {
    return colors.accent;
  }

  if (status === "blocked") {
    return colors.text3;
  }

  return colors.amber;
}

function RegistrationReadinessCard({
  readiness
}: {
  readiness: RegisterInviteReadinessView;
}) {
  return (
    <DataCard detail={readiness.summary} title={readiness.title}>
      <View accessibilityLabel="报名准备" style={styles.readinessTimeline}>
        {readiness.items.map((item, index) => {
          const iconColor = readinessColor(item.status);

          return (
            <View key={item.id} style={styles.readinessStep}>
              <View style={styles.readinessRail}>
                <View
                  style={[
                    styles.readinessIcon,
                    item.status === "complete"
                      ? styles.readinessIconComplete
                      : null,
                    item.status === "next" ? styles.readinessIconNext : null
                  ]}
                >
                  <Ionicons
                    color={iconColor}
                    name={readinessIconName(item.status)}
                    size={18}
                  />
                </View>
                {index < readiness.items.length - 1 ? (
                  <View style={styles.readinessConnector} />
                ) : null}
              </View>
              <View style={styles.readinessCopy}>
                <Text style={styles.readinessTitle}>{item.title}</Text>
                <Text style={styles.readinessDetail}>{item.detail}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </DataCard>
  );
}

function InviteCard({ view }: { view: RegisterInviteView }) {
  return (
    <DataCard detail={view.summary} title={view.event.title}>
      <View style={styles.inviteHeader}>
        <View style={styles.passCodeBox}>
          <Text style={styles.passCode}>{view.event.code}</Text>
          <Text style={styles.passLabel}>邀请码</Text>
        </View>
        <View style={styles.eventCopy}>
          <Text style={styles.statusBadge}>{view.event.status}</Text>
          <Text style={styles.bodyText}>{view.event.description}</Text>
        </View>
      </View>
      <View style={styles.metaStack}>
        <Text style={styles.metaText}>{view.event.startsAt}</Text>
        <Text style={styles.metaText}>{view.event.venue}</Text>
        {view.event.sourceLabel ? (
          <Text style={styles.metaText}>{view.event.sourceLabel}</Text>
        ) : null}
      </View>
    </DataCard>
  );
}

function ProfilePreview({ profile }: { profile: RegisterInviteProfileView }) {
  return (
    <>
      <DataCard detail={[profile.company, profile.role].filter(Boolean).join(" · ")} title={profile.name}>
        <Text style={styles.headlineText}>{profile.headline}</Text>
      </DataCard>
      <TagSection items={profile.offering} title="我能提供" />
      <TagSection items={profile.seeking} title="我想寻找" />
      <TagSection items={profile.topics} title="想聊的话题" />
    </>
  );
}

function TagSection({ items, title }: { items: string[]; title: string }) {
  if (items.length === 0) {
    return null;
  }

  return (
    <View>
      <SectionHeader detail={`${items.length} 项`} title={title} />
      <View style={styles.tagWrap}>
        {items.slice(0, 6).map((item) => (
          <Text key={item} style={styles.tagText}>
            {item}
          </Text>
        ))}
      </View>
    </View>
  );
}

function ActionList({ actions }: { actions: RegisterInviteAction[] }) {
  const router = useRouter();

  return (
    <View style={styles.actionList}>
      {actions.map((action) => (
        <Pressable
          accessibilityRole="button"
          key={action.href}
          onPress={() => router.push(action.href as Href)}
          style={({ pressed }) => [
            styles.actionButton,
            pressed ? styles.pressed : null
          ]}
        >
          <Text style={styles.actionText}>{action.label}</Text>
          <Ionicons color={colors.text3} name="chevron-forward" size={18} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  actionButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md
  },
  actionList: {
    gap: spacing.sm
  },
  actionText: {
    color: colors.text,
    fontSize: typography.small,
    fontWeight: "700"
  },
  bodyText: {
    color: colors.text,
    fontSize: typography.small,
    lineHeight: 20
  },
  eventCopy: {
    flex: 1,
    gap: spacing.sm
  },
  guardrailRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm
  },
  headlineText: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: "600",
    lineHeight: 22
  },
  inviteHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md
  },
  metaStack: {
    gap: spacing.xs
  },
  metaText: {
    color: colors.text3,
    fontSize: typography.small,
    lineHeight: 19
  },
  passCode: {
    color: colors.bg,
    fontSize: typography.title,
    fontWeight: "700",
    letterSpacing: 0.8
  },
  passCodeBox: {
    alignItems: "center",
    backgroundColor: colors.ink,
    borderRadius: radius.lg,
    minWidth: 104,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg
  },
  passLabel: {
    color: colors.text4,
    fontSize: typography.caption,
    fontWeight: "700",
    marginTop: spacing.xs
  },
  pressed: {
    opacity: 0.72
  },
  readinessConnector: {
    backgroundColor: colors.border,
    flex: 1,
    marginVertical: 4,
    width: 2
  },
  readinessCopy: {
    flex: 1,
    gap: 2,
    paddingBottom: spacing.sm
  },
  readinessDetail: {
    color: colors.text3,
    fontSize: typography.small,
    lineHeight: 19
  },
  readinessIcon: {
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 34,
    justifyContent: "center",
    width: 34
  },
  readinessIconComplete: {
    backgroundColor: colors.liveSoft,
    borderColor: colors.liveSoft
  },
  readinessIconNext: {
    backgroundColor: colors.accentSofter,
    borderColor: colors.accentSofter
  },
  readinessRail: {
    alignItems: "center",
    alignSelf: "stretch",
    width: 34
  },
  readinessStep: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 58
  },
  readinessTimeline: {
    gap: 0
  },
  readinessTitle: {
    color: colors.ink,
    fontSize: typography.small,
    fontWeight: "800",
    lineHeight: 19
  },
  statusBadge: {
    alignSelf: "flex-start",
    backgroundColor: colors.amberSoft,
    borderRadius: radius.pill,
    color: colors.amber,
    fontSize: typography.caption,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs
  },
  tagText: {
    backgroundColor: colors.accentSofter,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    color: colors.accent,
    fontSize: typography.small,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  tagWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.sm
  }
});
