import { OrbitTimeZoneProvider } from "../src/time/OrbitTimeZoneProvider";
import { StatusBar } from "expo-status-bar";
import { usePathname } from "expo-router";
import type { ReactNode } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
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
import { loadAppearancePreference } from "../src/design/appearance";
import { useOrbitTheme } from "../src/design/theme";
import { OrbitLocaleProvider } from "../src/i18n/OrbitLocaleProvider";
import { ToastProvider, UiFeedbackHost, UiPortalHost } from "../src/components/ui";
import { mainTabForPath } from "../src/view-models/app-navigation";
import { useEffect, useRef } from "react";
import {
  appPerformanceInput,
  isAppPerformanceEnabled,
  markAppPerformance,
  setAppPerformanceScope,
} from "../src/performance/app-performance";

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
// toasts sit above the tab bar on the main tab pages.
function UiRoot({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <UiPortalHost>
      <ToastProvider hasTabBar={mainTabForPath(pathname) !== null}>
        {children}
        <UiFeedbackHost />
      </ToastProvider>
    </UiPortalHost>
  );
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
                <UiRoot>
                  <OrbitNotificationsCoordinator />
                  <OrbitNotificationLifecycle />
                  <OrbitRouteAccessBoundary />
                  <StatusBar style={scheme === "dark" ? "light" : "dark"} />
                </UiRoot>
              </OrbitTimeZoneProvider>
            </OrbitLocaleProvider>
          </OrbitAuthSessionProvider>
        </OrbitApiBaseUrlProvider>
      </AppErrorBoundary>
    </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
