import { OrbitTimeZoneProvider } from "../src/time/OrbitTimeZoneProvider";
import { StatusBar } from "expo-status-bar";
import Constants from "expo-constants";
import { usePathname } from "expo-router";
import type { ReactNode } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SafeAreaView } from "react-native-safe-area-context";
import { ActivityIndicator, Linking, ScrollView, View } from "react-native";
import {
  OrbitAuthSessionProvider,
  useOrbitAuthSession,
} from "../src/api/AuthSessionProvider";
import {
  OrbitApiBaseUrlProvider,
  useOrbitApiBaseUrl,
} from "../src/api/ApiBaseUrlProvider";
import {
  AppErrorBoundary,
  AppErrorScreen
} from "../src/components/AppErrorBoundary";
import { OrbitRouteAccessBoundary } from "../src/components/OrbitRouteAccessBoundary";
import { OrbitNotificationsCoordinator } from "../src/components/OrbitNotificationsCoordinator";
import { OrbitNotificationLifecycle } from "../src/notifications/NotificationLifecycle";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { applyStoredAppearanceSync, loadAppearancePreference } from "../src/design/appearance";
import { useOrbitTheme } from "../src/design/theme";
import { OrbitLocaleProvider } from "../src/i18n/OrbitLocaleProvider";
import { useOrbitLocale } from "../src/i18n/OrbitLocaleContext";
import { ToastProvider, UiFeedbackHost, UiPortalHost } from "../src/components/ui";
import { UiText } from "../src/components/ui/Text";
import { RootVersionGate } from "../src/components/RootVersionGate";
import { useOrbitApiClient } from "../src/hooks/useOrbitApiClient";
import { loadAppVersionGate } from "../src/api/app-version";
import { ForceUpdateContent } from "../src/screens/public/ForceUpdateContent";
import { MaintenanceContent } from "../src/screens/public/MaintenanceContent";
import { validAppStoreUrl } from "../src/view-models/force-update-view";
import { formatMaintenanceUntil } from "../src/view-models/maintenance-view";
import { ShellTabBar } from "../src/components/OrbitTabBar";
import { mainTabForPath } from "../src/view-models/app-navigation";
import { useMobileViewport } from "../src/platform/use-mobile-viewport";
import { useCallback, useEffect, useRef, useState } from "react";
import { DevOpenPath } from "../src/screens/add/dev-open-path";
import {
  appPerformanceInput,
  isAppPerformanceEnabled,
  markAppPerformance,
  setAppPerformanceScope,
} from "../src/performance/app-performance";

// R05 (R01 review m3): the Settings appearance is applied before the first frame.
applyStoredAppearanceSync();

const ROOT_LAYOUT_STARTED_AT = isAppPerformanceEnabled()
  ? globalThis.performance.now()
  : 0;

function AppPerformanceRootObserver() {
  const auth = useOrbitAuthSession();
  const { baseUrl } = useOrbitApiBaseUrl();
  const startupRecorded = useRef(false);
  const authRestoreRecorded = useRef(false);

  useEffect(() => {
    if (!isAppPerformanceEnabled()) {
      return;
    }
    setAppPerformanceScope({ actorId: auth.actorId, baseUrl });
    const durationMs = globalThis.performance.now() - ROOT_LAYOUT_STARTED_AT;
    if (!startupRecorded.current) {
      startupRecorded.current = true;
      markAppPerformance({
        ...appPerformanceInput("app.startup", "app.startup"),
        durationMs,
        failed: false,
      });
    }
    if (auth.ready && !authRestoreRecorded.current) {
      authRestoreRecorded.current = true;
      markAppPerformance({
        ...appPerformanceInput("app.auth_restore", "app.auth_restore"),
        durationMs,
        failed: false,
      });
    }
  }, [auth.actorId, auth.ready, baseUrl]);

  return null;
}

// expo-router 会把这个导出当作根段的错误边界：出错时只重置这一段，
// 导航器保持挂载，retry() 之后跳转仍然可用。
export function ErrorBoundary({
  error,
  retry
}: {
  error: Error;
  retry: () => Promise<void>;
}) {
  return <AppErrorScreen error={error} onRetry={() => void retry()} />;
}

// R04: one root host for overlays (dialogs, sheets, toasts) instead of RN <Modal>;
// the toast provider wraps the portal host so a toast shows above an open dialog
// or sheet; toasts sit above the tab bar on the main tab pages.
// R05: the shell's one tab bar sits over the navigator, under overlays.
function UiRoot({ children, blocked = false }: { children: ReactNode; blocked?: boolean }) {
  const pathname = usePathname();
  const auth = useOrbitAuthSession();
  // The bar hides while the keyboard is up; the toast then drops to its no-bar place (R05 review m6).
  const { keyboardVisible } = useMobileViewport();
  return (
    <ToastProvider hasTabBar={!blocked && auth.signedIn && mainTabForPath(pathname) !== null && !keyboardVisible}>
      <UiPortalHost routeKey={pathname}>
        {children}
        {auth.signedIn && !blocked ? <ShellTabBar /> : null}
        <UiFeedbackHost />
      </UiPortalHost>
    </ToastProvider>
  );
}

const appStoreUrl = validAppStoreUrl(process.env.EXPO_PUBLIC_ORBIT_APP_STORE_URL);

function RootVersionBoundary({ children }: { children: (allowed: boolean) => ReactNode }) {
  const pathname = usePathname();
  const auth = useOrbitAuthSession();
  const { baseUrl } = useOrbitApiBaseUrl();
  const client = useOrbitApiClient();
  const { language, t } = useOrbitLocale();
  const { colors } = useOrbitTheme();
  const [storeError, setStoreError] = useState<string | null>(null);
  const check = useCallback(() => loadAppVersionGate(client, Constants.expoConfig?.version), [client]);
  const scopeKey = `${pathname}\u0000${auth.actorId ?? ""}\u0000${auth.ready}\u0000${baseUrl}`;
  const checking = <View accessibilityRole="progressbar" style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
    <ActivityIndicator color={colors.accentText} /><UiText>{t("publicInfo.checkingStatus")}</UiText>
  </View>;
  return <RootVersionGate scopeKey={scopeKey} check={check} checking={checking} blocked={(decision, retry) =>
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.bg }}><ScrollView contentContainerStyle={{ flexGrow: 1 }}>
      {decision.kind === "force-update"
        ? <ForceUpdateContent t={t} storeUrl={appStoreUrl} error={storeError} onUpdate={() => {
            if (!appStoreUrl) return;
            setStoreError(null);
            void Linking.openURL(appStoreUrl).catch(() => setStoreError(t("publicInfo.storeOpenError")));
          }} />
        : <MaintenanceContent t={t} untilText={formatMaintenanceUntil(decision.until, language)} onRetry={retry} />}
    </ScrollView></SafeAreaView>
  }>{allowed => <View style={{ flex: 1, display: allowed ? "flex" : "none" }} pointerEvents={allowed ? "auto" : "none"} accessibilityElementsHidden={!allowed} importantForAccessibility={allowed ? "auto" : "no-hide-descendants"}>
    {children(allowed)}
  </View>}</RootVersionGate>;
}

export default function RootLayout() {
  const { scheme } = useOrbitTheme();
  // R01: restore the Settings appearance choice (automatic / light / dark).
  useEffect(() => {
    void loadAppearancePreference(AsyncStorage);
  }, []);
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaProvider>
      {/* 类组件边界兜住 router 之外的渲染异常，比如两个 Provider 自身出错。
          router 内部的异常由上面的 ErrorBoundary 导出处理。 */}
      <AppErrorBoundary>
        <OrbitApiBaseUrlProvider>
          <OrbitAuthSessionProvider>
            <AppPerformanceRootObserver />
            <OrbitLocaleProvider>
              <OrbitTimeZoneProvider>
                <RootVersionBoundary>{allowed => <UiRoot blocked={!allowed}>
                  <OrbitNotificationsCoordinator />
                  <OrbitNotificationLifecycle />
                  <OrbitRouteAccessBoundary />
                  <DevOpenPath />
                  <StatusBar style={scheme === "dark" ? "light" : "dark"} />
                </UiRoot>}</RootVersionBoundary>
              </OrbitTimeZoneProvider>
            </OrbitLocaleProvider>
          </OrbitAuthSessionProvider>
        </OrbitApiBaseUrlProvider>
      </AppErrorBoundary>
    </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
