/* eslint-disable no-unused-vars -- The base ESLint config lacks JSX variable usage tracking. */
import { StateView } from "../../../../shared/ui/state-view";
import { bilingualText } from "../../../../shared/ui/bilingual";
import { AppDashboardCommandCenter } from "./compose-app-dashboard-from-previously-approved-mock-first-capabilities/dashboard-command-center";

export const metadata = {
  title: "Dashboard | Orbit",
  description:
    "Compose source-backed dashboard summary, distributions, network gaps, opportunities, and provenance warnings in Orbit.",
};

type AppDashboardSearchParams = Record<string, string | string[] | undefined>;

interface DashboardPageProps {
  searchParams?: AppDashboardSearchParams | Promise<AppDashboardSearchParams>;
}

function isPromiseLike<TValue>(
  value: TValue | Promise<TValue> | undefined,
): value is Promise<TValue> {
  return Boolean(value && typeof (value as Promise<TValue>).then === "function");
}

function LegacyDashboardStateBoundary() {
  return (
    <StateView
      description={bilingualText(
        "当这些项目具备证据后，仪表盘会显示关系健康度、机会和错过的跟进。",
        "Dashboard will show relationship health, opportunities, and missed follow-ups once those items have evidence.",
      )}
      emptyState={bilingualText(
        "还没有计算评分、机会信号、错过的跟进或趋势数据。",
        "No scores, opportunity signals, missed follow-ups, or trend data are calculated.",
      )}
      evidence={[
        bilingualText("还没有计算分析结果。", "No analytics are calculated."),
        bilingualText("机会项目为空。", "Opportunity items are empty."),
      ]}
      eyebrow={bilingualText("仪表盘", "Dashboard")}
      guardrail={bilingualText(
        "仪表盘可以定义要衡量什么，但没有来源时不能推断健康度。",
        "Dashboard can define what will be measured, but it cannot infer health without sources.",
      )}
      nextStep={bilingualText(
        "阅读趋势前，先加载有来源的关系活动。",
        "Load sourced relationship activity before reading trends.",
      )}
      purpose={bilingualText(
        "只有在有来源的活动存在后才读取关系健康度。",
        "Read relationship health only after sourced activity exists.",
      )}
      title={bilingualText("仪表盘", "Dashboard")}
    />
  );
}

function renderDashboardPage(searchParams: AppDashboardSearchParams | undefined) {
  return <AppDashboardCommandCenter searchParams={searchParams} />;
}

export default function DashboardPage({
  searchParams,
}: DashboardPageProps = {}) {
  if (searchParams === undefined) {
    return <LegacyDashboardStateBoundary />;
  }

  if (isPromiseLike(searchParams)) {
    return searchParams.then((resolvedSearchParams) =>
      renderDashboardPage(resolvedSearchParams),
    );
  }

  return renderDashboardPage(searchParams);
}
