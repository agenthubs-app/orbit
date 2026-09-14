import { OrbitTimeZoneProvider } from "../src/time/OrbitTimeZoneProvider";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { OrbitAuthSessionProvider } from "../src/api/AuthSessionProvider";
import { OrbitApiBaseUrlProvider } from "../src/api/ApiBaseUrlProvider";
import {
  AppErrorBoundary,
  AppErrorScreen
} from "../src/components/AppErrorBoundary";
import { OrbitRouteAccessBoundary } from "../src/components/OrbitRouteAccessBoundary";
import { OrbitNotificationsCoordinator } from "../src/components/OrbitNotificationsCoordinator";
import { OrbitNotificationLifecycle } from "../src/notifications/NotificationLifecycle";
import { useOrbitTheme } from "../src/design/theme";
import { OrbitLocaleProvider } from "../src/i18n/OrbitLocaleProvider";

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

export default function RootLayout() {
  const { scheme } = useOrbitTheme();
  return (
    <SafeAreaProvider>
      {/* 类组件边界兜住 router 之外的渲染异常，比如两个 Provider 自身出错。
          router 内部的异常由上面的 ErrorBoundary 导出处理。 */}
      <AppErrorBoundary>
        <OrbitApiBaseUrlProvider>
          <OrbitAuthSessionProvider>
            <OrbitLocaleProvider>
              <OrbitTimeZoneProvider>
                <OrbitNotificationsCoordinator />
                <OrbitNotificationLifecycle />
                <OrbitRouteAccessBoundary />
                <StatusBar style={scheme === "dark" ? "light" : "dark"} />
              </OrbitTimeZoneProvider>
            </OrbitLocaleProvider>
          </OrbitAuthSessionProvider>
        </OrbitApiBaseUrlProvider>
      </AppErrorBoundary>
    </SafeAreaProvider>
  );
}
