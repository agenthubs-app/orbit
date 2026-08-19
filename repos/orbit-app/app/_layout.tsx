import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { OrbitAuthSessionProvider } from "../src/api/AuthSessionProvider";
import { OrbitApiBaseUrlProvider } from "../src/api/ApiBaseUrlProvider";
import {
  AppErrorBoundary,
  AppErrorScreen
} from "../src/components/AppErrorBoundary";
import { OrbitRouteAccessBoundary } from "../src/components/OrbitRouteAccessBoundary";
import { OrbitNotificationLifecycle } from "../src/notifications/NotificationLifecycle";

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
  return (
    <SafeAreaProvider>
      {/* 类组件边界兜住 router 之外的渲染异常，比如两个 Provider 自身出错。
          router 内部的异常由上面的 ErrorBoundary 导出处理。 */}
      <AppErrorBoundary>
        <OrbitApiBaseUrlProvider>
          <OrbitAuthSessionProvider>
            <OrbitNotificationLifecycle />
            <OrbitRouteAccessBoundary />
            <StatusBar style="dark" />
          </OrbitAuthSessionProvider>
        </OrbitApiBaseUrlProvider>
      </AppErrorBoundary>
    </SafeAreaProvider>
  );
}
