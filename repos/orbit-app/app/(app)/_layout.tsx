import { Stack, usePathname } from "expo-router";
import { AppErrorScreen } from "../../src/components/AppErrorBoundary";
import { OrbitPrivateRouteBoundary } from "../../src/components/OrbitRouteAccessBoundary";
import { isPrivateMobileRoute } from "../../src/view-models/mobile-route-access";

// 主屏所在的这一段单独兜底：某个屏幕渲染失败时只重置它，
// 抽屉、历史面板和导航栈都不受影响。
export function ErrorBoundary({
  error,
  retry
}: {
  error: Error;
  retry: () => Promise<void>;
}) {
  return <AppErrorScreen error={error} onRetry={() => void retry()} />;
}

export default function AppLayout() {
  const pathname = usePathname();

  return (
    <OrbitPrivateRouteBoundary enabled={isPrivateMobileRoute(pathname)}>
      <Stack screenOptions={{ headerShown: false }} />
    </OrbitPrivateRouteBoundary>
  );
}
