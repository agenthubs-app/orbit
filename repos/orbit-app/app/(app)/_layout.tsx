import { Stack } from "expo-router";
import { isIOrbitRoute } from "../../src/components/shell-navigation";
import { AppErrorScreen } from "../../src/components/AppErrorBoundary";
import { useOrbitTheme } from "../../src/design/theme";

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
  const { colors } = useOrbitTheme();
  // iOrbit pushed from /contacts or /events lands in this stack: it appears at once, like from the root stack.
  return <Stack screenOptions={({ route }) => ({ headerShown: false, contentStyle: { backgroundColor: colors.bg }, ...(isIOrbitRoute(route) ? { animation: "none" as const, gestureEnabled: false } : {}) })} />;
}
