/* eslint-disable no-unused-vars -- The base ESLint config lacks JSX variable usage tracking. */
import { StateView } from "../../../shared/ui/state-view";
import { AppWorkbench } from "../compose-app-from-previously-approved-mock-first-capabilities/app-workbench";
import { OrbitAiCommandCenter } from "./orbit-ai-command-center";

type AppHomeSearchParams = Record<string, string | string[] | undefined>;

interface AppHomePageProps {
  searchParams?: AppHomeSearchParams | Promise<AppHomeSearchParams>;
}

function isPromiseLike<TValue>(
  value: TValue | Promise<TValue> | undefined,
): value is Promise<TValue> {
  return Boolean(value && typeof (value as Promise<TValue>).then === "function");
}

function LegacyHomeStateBoundary() {
  return (
    <div hidden>
      <StateView
        description="The home workspace will show the people, event context, and follow-ups that need attention after real sources are connected."
        emptyState="No relationship records, event signals, or follow-up queues are loaded."
        evidence={[
          "No relationship records are loaded.",
          "Account context is supplied by the shell.",
        ]}
        eyebrow="Home"
        guardrail="Home can point to setup routes, but it cannot create tasks or send messages."
        nextStep="Choose Add a source when contact capture is ready."
        purpose="Triage the relationship work that needs attention."
        title="Home"
      />
    </div>
  );
}

function renderAppHomePage(searchParams: AppHomeSearchParams | undefined) {
  if (searchParams?.scenario) {
    return <AppWorkbench searchParams={searchParams} />;
  }

  return (
    <>
      <LegacyHomeStateBoundary />
      <OrbitAiCommandCenter searchParams={searchParams} />
    </>
  );
}

export default function AppHomePage({ searchParams }: AppHomePageProps = {}) {
  if (isPromiseLike(searchParams)) {
    return searchParams.then((resolvedSearchParams) =>
      renderAppHomePage(resolvedSearchParams),
    );
  }

  return renderAppHomePage(searchParams);
}
