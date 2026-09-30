import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useOrbitApiBaseUrl } from "../api/ApiBaseUrlProvider";
import { ORBIT_API_ENDPOINTS } from "../api/endpoints";
import { serverReachability, type ServerReachabilityState } from "../api/server-reachability";
import { createThemedStyles } from "../design/theme";
import { layout, spacing, textStyles } from "../design/tokens";
import { useOrbitApiClient } from "../hooks/useOrbitApiClient";
import { useOrbitLocale } from "../i18n/OrbitLocaleContext";
import { NeedsNetworkState } from "./NeedsNetworkState";

export { NeedsNetworkState };

/** A cold open decides from the page's own first read: an unreachable answer this soon after opening means offline. */
export const ONLINE_ONLY_OPEN_WINDOW_MS = 3000;

/**
 * Sprint 0131: pages that need the server by design (docs/offline/page-inventory.md,
 * "只能在线") show a calm 「需要联网」 state instead of an error page when the
 * server cannot be reached. The decision comes from what the API client last
 * saw (server-reachability; no extra request): unreachable when the page opens,
 * or the page's own first read finding the server unreachable within
 * ONLINE_ONLY_OPEN_WINDOW_MS. A page that is running online keeps running — a
 * later failure mid-form is the page's own message, so typed input is not thrown
 * away. It reuses the page title style, the muted empty-state text and the
 * secondary button; no new colours or components beyond this frame.
 */
export function OnlineOnlyBoundary({ children }: { children: ReactNode }) {
  const { baseUrl } = useOrbitApiBaseUrl();
  const client = useOrbitApiClient();
  const [offline, setOffline] = useState(() => serverReachability.state(baseUrl) === "unreachable");
  const [retrying, setRetrying] = useState(false);
  const opened = useRef({ at: Date.now(), answered: serverReachability.state(baseUrl) === "reachable" });

  useEffect(() => {
    const hear = (state: ServerReachabilityState) => {
      if (state === "reachable") {
        opened.current.answered = true;
        setOffline(false);
      } else if (state === "unreachable" && !opened.current.answered && Date.now() - opened.current.at < ONLINE_ONLY_OPEN_WINDOW_MS) {
        setOffline(true);
      }
    };
    // The page's own first read may already have answered (child effects run before this one).
    hear(serverReachability.state(baseUrl));
    return serverReachability.subscribe((url, state) => { if (url === baseUrl.trim().replace(/\/+$/u, "")) hear(state); });
  }, [baseUrl]);

  const retry = useCallback(async () => {
    setRetrying(true);
    try { await client.get(ORBIT_API_ENDPOINTS.health); } finally { setRetrying(false); }
    if (serverReachability.state(baseUrl) !== "unreachable") setOffline(false);
  }, [baseUrl, client]);

  if (!offline) return <>{children}</>;
  return <NeedsNetworkPage onRetry={() => { void retry(); }} retrying={retrying} />;
}

function NeedsNetworkPage({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  const locale = useOrbitLocale();
  const router = useRouter();
  const { styles } = useStyles();
  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        {router.canGoBack() ? (
          <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}>
            <Text style={styles.backText}>‹ {locale.t("common.back")}</Text>
          </Pressable>
        ) : null}
        <Text accessibilityRole="header" style={styles.title}>{locale.t("sync.needsNetwork")}</Text>
        <NeedsNetworkState onRetry={onRetry} retrying={retrying} />
      </ScrollView>
    </SafeAreaView>
  );
}

export function withOnlineOnlyRoute<Props extends object>(Screen: ComponentType<Props>): ComponentType<Props> {
  function OnlineOnlyRoute(props: Props) {
    return <OnlineOnlyBoundary><Screen {...props} /></OnlineOnlyBoundary>;
  }
  OnlineOnlyRoute.displayName = `withOnlineOnlyRoute(${Screen.displayName ?? Screen.name ?? "Screen"})`;
  return OnlineOnlyRoute;
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: layout.pageInset, paddingTop: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },
  back: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start" },
  backText: { ...textStyles.body, color: colors.accent },
  title: { ...textStyles.pageTitle, color: colors.ink },
}));
