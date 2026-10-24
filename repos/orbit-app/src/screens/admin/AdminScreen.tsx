import { type Href, useRouter } from "expo-router";
import { Image, RefreshControl, StyleSheet, View } from "react-native";

import { dashboardAggregatePath, ORBIT_API_ENDPOINTS } from "../../api/endpoints";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { AppScreen } from "../../components/AppScreen";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Icon } from "../../components/ui/Icon";
import { UiPressable } from "../../components/ui/Pressable";
import { EmptyState, RetryCard, Skeleton } from "../../components/ui/States";
import { UiText } from "../../components/ui/Text";
import { createThemedStyles, useOrbitTheme } from "../../design/theme";
import { radius, typography } from "../../design/tokens";
import { useApiResource } from "../../hooks/useApiResource";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { adminToView, type AdminEventView, type AdminSurface } from "../../view-models/admin";

function assetUrl(baseUrl: string, path: string): string {
  if (/^https?:\/\//iu.test(path)) return path;
  return `${baseUrl.replace(/\/+$/u, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

export function AdminScreen({ surface = "dashboard" }: { surface?: AdminSurface }) {
  const { colors } = useOrbitTheme();
  const { language, t } = useOrbitLocale();
  const eventsState = useApiResource<unknown>(ORBIT_API_ENDPOINTS.events, (data) => adminToView({ events: data }).events.length === 0);
  const profileState = useApiResource<unknown>(ORBIT_API_ENDPOINTS.profile, () => false);
  const dashboardState = useApiResource<unknown>(dashboardAggregatePath(4), () => false);
  function refreshAll() {
    eventsState.refresh();
    profileState.refresh();
    dashboardState.refresh();
  }

  return (
    <AppScreen
      eyebrow={t("admin.label")}
      inset="kit"
      refreshControl={<RefreshControl onRefresh={refreshAll} refreshing={eventsState.refreshing || profileState.refreshing || dashboardState.refreshing} tintColor={colors.accentText} />}
      title={surface === "events" ? t("admin.events.title") : t("admin.dashboard.title")}
    >
      {eventsState.kind === "loading" ? <Skeleton onRetry={refreshAll} /> : null}
      {eventsState.kind === "offline" || eventsState.kind === "failure" ? (
        <RetryCard title={eventsState.kind === "offline" ? t("admin.state.offline") : t("admin.state.failure")} onRetry={refreshAll} />
      ) : null}
      {eventsState.kind === "empty" ? (
        <EmptyState title={t("admin.event.emptyTitle")} message={t("admin.event.emptyMessage")} action={{ label: t("admin.state.retry"), onPress: refreshAll }} />
      ) : null}
      {eventsState.kind === "success" ? (
        <>
          {surface === "dashboard" && (profileState.kind === "offline" || profileState.kind === "failure") ? (
            <RetryCard title={profileState.kind === "offline" ? t("admin.state.offline") : t("admin.profile.failure")} onRetry={refreshAll} />
          ) : null}
          <AdminContent
            dashboard={dashboardState.kind === "success" ? dashboardState.data : null}
            events={eventsState.data}
            profile={profileState.kind === "success" ? profileState.data : null}
            profileAvailable={profileState.kind === "success"}
            surface={surface}
            language={language}
          />
        </>
      ) : null}
    </AppScreen>
  );
}

function AdminContent({ dashboard, events, profile, profileAvailable, surface, language }: {
  dashboard: unknown;
  events: unknown;
  profile: unknown;
  profileAvailable: boolean;
  surface: AdminSurface;
  language: "ja" | "zh" | "en";
}) {
  const router = useRouter();
  const { baseUrl } = useOrbitApiBaseUrl();
  const { t } = useOrbitLocale();
  const { styles } = useStyles();
  const view = adminToView({ dashboard, events, profile, surface, language });

  return (
    <>
      <Card style={styles.section}>
        {profileAvailable ? <UiText style={styles.heading}>{view.org.name} · {view.org.owner}</UiText> : null}
        <UiText style={styles.body}>{view.summary}</UiText>
        <View style={styles.actions}>
          {view.nav.map((item) => <Button key={item.id} label={item.label} onPress={() => router.push(item.href as Href)} variant={item.id === surface ? "primary" : "secondary"} />)}
        </View>
      </Card>

      {surface === "dashboard" ? (
        <Card style={styles.section}>
          <UiText style={styles.heading}>{t("admin.event.count")}</UiText>
          <View style={styles.statRow}>
            {view.stats.map((stat) => <View key={stat.id} style={styles.stat}><UiText style={styles.statValue}>{stat.value}</UiText><UiText style={styles.statLabel}>{stat.label}</UiText></View>)}
          </View>
        </Card>
      ) : null}

      <Card style={styles.section}>
        <UiText style={styles.heading}>{t("admin.events.title")}</UiText>
        <UiText style={styles.body}>{t("admin.event.listCount", { count: view.events.length })}</UiText>
        {view.events.map((event: AdminEventView) => (
          <UiPressable accessibilityRole="button" accessibilityLabel={event.title} key={event.id} onPress={() => router.push(event.href as Href)}>
            <Card variant="flat" style={styles.eventRow}>
              {event.coverPath ? <Image source={{ uri: assetUrl(baseUrl, event.coverPath) }} style={styles.cover} /> : <Icon name="calendar" size={24} />}
              <View style={styles.eventCopy}>
                <UiText style={styles.itemTitle}>{event.title}</UiText>
                <UiText style={styles.body}>{event.stateLabel} · {event.startsAt} · {event.location}</UiText>
              </View>
            </Card>
          </UiPressable>
        ))}
      </Card>

      {surface === "dashboard" && profileAvailable ? (
        <Card style={styles.section}>
          <UiText style={styles.heading}>{t("admin.profile.title")}</UiText>
          {view.members.length > 0 ? view.members.map((member) => <View key={member.id}><UiText style={styles.itemTitle}>{member.name}</UiText><UiText style={styles.body}>{member.email}</UiText></View>) : <UiText style={styles.body}>{t("admin.profile.emailUnknown")}</UiText>}
        </Card>
      ) : null}
      <Card variant="flat"><UiText style={styles.body}>{view.boundary}</UiText></Card>
    </>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  section: { gap: 10 },
  heading: { color: colors.ink, fontSize: typography.dialogTitle, fontWeight: "800" },
  body: { color: colors.ink2, fontSize: typography.bodySm, lineHeight: 23 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statRow: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  stat: { flexBasis: 128, flexGrow: 1, gap: 2 },
  statValue: { color: colors.ink, fontSize: typography.number, fontWeight: "800" },
  statLabel: { color: colors.ink3Text, fontSize: typography.meta },
  cover: { width: 48, height: 48, borderRadius: radius.row },
  eventRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56 },
  eventCopy: { flex: 1, minWidth: 0, gap: 4 },
  itemTitle: { color: colors.ink, fontSize: typography.body, fontWeight: "700" },
}));
