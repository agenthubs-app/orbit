import { Image, RefreshControl, StyleSheet } from "react-native";

import { ORBIT_API_ENDPOINTS } from "../../api/endpoints";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { AppScreen } from "../../components/AppScreen";
import { Card } from "../../components/ui/Card";
import { Icon } from "../../components/ui/Icon";
import { EmptyState, RetryCard, Skeleton } from "../../components/ui/States";
import { UiText } from "../../components/ui/Text";
import { createThemedStyles, useOrbitTheme } from "../../design/theme";
import { radius, typography } from "../../design/tokens";
import { useApiResource } from "../../hooks/useApiResource";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { platformToView } from "../../view-models/platform";

function assetUrl(baseUrl: string, path: string): string {
  if (/^https?:\/\//iu.test(path)) return path;
  return `${baseUrl.replace(/\/+$/u, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

export function PlatformScreen() {
  const { colors } = useOrbitTheme();
  const { language, t } = useOrbitLocale();
  const { baseUrl } = useOrbitApiBaseUrl();
  const { styles } = useStyles();
  const eventsState = useApiResource<unknown>(ORBIT_API_ENDPOINTS.publicEvents, (data) => platformToView({ events: data }).reviewQueue.length === 0);
  const refresh = () => eventsState.refresh();
  const view = eventsState.kind === "success" ? platformToView({ events: eventsState.data, language }) : null;

  return (
    <AppScreen
      eyebrow={t("admin.platform.catalogue")}
      inset="kit"
      refreshControl={<RefreshControl onRefresh={refresh} refreshing={eventsState.refreshing} tintColor={colors.accentText} />}
      title={t("admin.platform.title")}
    >
      {eventsState.kind === "loading" ? <Skeleton onRetry={refresh} /> : null}
      {eventsState.kind === "offline" || eventsState.kind === "failure" ? (
        <RetryCard title={eventsState.kind === "offline" ? t("admin.state.offline") : t("admin.platform.failure")} onRetry={refresh} />
      ) : null}
      {eventsState.kind === "empty" ? (
        <EmptyState title={t("admin.platform.emptyTitle")} message={t("admin.platform.emptyMessage")} action={{ label: t("admin.state.retry"), onPress: refresh }} />
      ) : null}
      {view ? (
        <>
          <Card style={styles.section}>
            <UiText style={styles.heading}>{t("admin.platform.catalogue")}</UiText>
            <UiText style={styles.body}>{view.summary}</UiText>
            <UiText style={styles.stat}>{view.stats[0]?.value} {t("admin.event.count")}</UiText>
          </Card>
          <Card style={styles.section}>
            <UiText style={styles.heading}>{t("admin.platform.title")}</UiText>
            <UiText style={styles.body}>{t("admin.platform.listCount", { count: view.reviewQueue.length })}</UiText>
            {view.reviewQueue.map((item) => (
              <Card key={item.id} variant="flat" style={styles.eventRow}>
                {item.coverPath ? <Image source={{ uri: assetUrl(baseUrl, item.coverPath) }} style={styles.cover} /> : <Icon name="calendar" size={24} />}
                <UiText style={styles.itemTitle}>{item.title}</UiText>
                <UiText style={styles.body}>{item.stateLabel} · {item.submitted} · {item.location}</UiText>
              </Card>
            ))}
          </Card>
          <Card variant="flat"><UiText style={styles.body}>{view.boundary}</UiText></Card>
        </>
      ) : null}
    </AppScreen>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  section: { gap: 10 },
  heading: { color: colors.ink, fontSize: typography.dialogTitle, fontWeight: "800" },
  body: { color: colors.ink2, fontSize: typography.bodySm, lineHeight: 20 },
  stat: { color: colors.ink, fontSize: typography.number, fontWeight: "800" },
  cover: { width: 48, height: 48, borderRadius: radius.row },
  eventRow: { gap: 6 },
  itemTitle: { color: colors.ink, fontSize: typography.body, fontWeight: "700" },
}));
