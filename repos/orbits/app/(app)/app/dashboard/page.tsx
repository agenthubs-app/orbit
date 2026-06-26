/* eslint-disable no-unused-vars -- The base ESLint config lacks JSX variable usage tracking. */
import { StateView } from "../../../../shared/ui/state-view";
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
      description="Dashboard will show relationship health, opportunities, and missed follow-ups once those items have evidence."
      emptyState="No scores, opportunity signals, missed follow-ups, or trend data are calculated."
      evidence={[
        "No analytics are calculated.",
        "Opportunity items are empty.",
      ]}
      eyebrow="Dashboard"
      guardrail="Dashboard can define what will be measured, but it cannot infer health without sources."
      nextStep="Load sourced relationship activity before reading trends."
      purpose="Read relationship health only after sourced activity exists."
      title="Dashboard"
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
