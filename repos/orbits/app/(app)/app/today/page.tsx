/**
 * Today route adapter — iOrbit 工作台合并后收窄成纯重定向（同 /app/home 先例）。
 *
 * 今日工作台的呈现已并入 /app/agent（iOrbit home：今日日程/月历微件/建议与
 * 行动）。这里只保留深链重定向：裸进 → /app/agent；?entry= 决策深链 →
 * /app/agent/actions?entry=（决策落 actions 屏）。原 Today 组件
 * （today-page-content、时间脊柱、决策面板等）留在原处不删除——
 * OrbitTodayDecisionForm / OrbitTodayArrangements 等仍被 actions 屏及其它
 * 页面复用，VM 单测不受影响。
 */
import { redirect } from "next/navigation";

type AppTodaySearchParams = {
  entry?: string | string[];
};

function firstParam(
  params: AppTodaySearchParams | undefined,
  key: string,
): string | null {
  const value = params?.[key];
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === "string" && first.trim() ? first.trim() : null;
  }
  return null;
}

export default async function AppTodayPage({
  searchParams,
}: {
  searchParams?: Promise<AppTodaySearchParams>;
} = {}) {
  const entry = firstParam(await searchParams, "entry");
  redirect(
    entry
      ? `/app/agent/actions?entry=${encodeURIComponent(entry)}`
      : "/app/agent",
  );
}
