import { Stack } from "expo-router";
import { AppErrorScreen } from "../../src/components/AppErrorBoundary";

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
  return <Stack screenOptions={{ headerShown: false }} />;
}
