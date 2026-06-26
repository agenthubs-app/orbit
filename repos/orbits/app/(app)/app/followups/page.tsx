/* eslint-disable no-unused-vars -- The base ESLint config lacks JSX variable usage tracking. */
import { StateView } from "../../../../shared/ui/state-view";
import { AppFollowupsCommandCenter } from "./compose-app-followups-from-previously-approved-mock-first-capabilities/followups-command-center";

export const metadata = {
  title: "Follow-ups | Orbit",
  description:
    "Compose source-backed follow-up tasks, message drafts, reminder queue entries, and local completion review in Orbit.",
};

type AppFollowupsSearchParams = Record<string, string | string[] | undefined>;

interface FollowupsPageProps {
  searchParams?: AppFollowupsSearchParams | Promise<AppFollowupsSearchParams>;
}

function isPromiseLike<TValue>(
  value: TValue | Promise<TValue> | undefined,
): value is Promise<TValue> {
  return Boolean(value && typeof (value as Promise<TValue>).then === "function");
}

function LegacyFollowupsStateBoundary() {
  return (
    <StateView
      description="Followups will hold drafts, reminders, and approvals only after a source-backed relationship exists."
      emptyState="No drafts, reminders, approval records, or delivery targets are loaded."
      evidence={[
        "No message can be sent from this page.",
        "Reminders are not scheduled.",
      ]}
      eyebrow="Followups"
      guardrail="Followups can stage intent, but it cannot schedule or send anything."
      nextStep="Review the source and approval state before sending anything."
      purpose="Stage reminders and drafts behind approval."
      title="Followups"
    />
  );
}

function renderFollowupsPage(searchParams: AppFollowupsSearchParams | undefined) {
  return <AppFollowupsCommandCenter searchParams={searchParams} />;
}

export default function FollowupsPage({
  searchParams,
}: FollowupsPageProps = {}) {
  if (searchParams === undefined) {
    return <LegacyFollowupsStateBoundary />;
  }

  if (isPromiseLike(searchParams)) {
    return searchParams.then((resolvedSearchParams) =>
      renderFollowupsPage(resolvedSearchParams),
    );
  }

  return renderFollowupsPage(searchParams);
}
