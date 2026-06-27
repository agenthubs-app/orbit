/* eslint-disable no-unused-vars -- The base ESLint config lacks JSX variable usage tracking. */
import { StateView } from "../../../../shared/ui/state-view";
import { bilingualText } from "../../../../shared/ui/bilingual";
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
      description={bilingualText(
        "只有在有来源支撑的关系存在后，跟进页才会承载草稿、提醒和审批。",
        "Followups will hold drafts, reminders, and approvals only after a source-backed relationship exists.",
      )}
      emptyState={bilingualText(
        "还没有加载草稿、提醒、审批记录或发送目标。",
        "No drafts, reminders, approval records, or delivery targets are loaded.",
      )}
      evidence={[
        bilingualText(
          "这个页面不能发送消息。",
          "No message can be sent from this page.",
        ),
        bilingualText("还没有安排提醒。", "Reminders are not scheduled."),
      ]}
      eyebrow={bilingualText("跟进", "Followups")}
      guardrail={bilingualText(
        "跟进页可以暂存意图，但不能安排或发送任何内容。",
        "Followups can stage intent, but it cannot schedule or send anything.",
      )}
      nextStep={bilingualText(
        "发送任何内容前，先复核来源和审批状态。",
        "Review the source and approval state before sending anything.",
      )}
      purpose={bilingualText(
        "把提醒和草稿放在审批之后。",
        "Stage reminders and drafts behind approval.",
      )}
      title={bilingualText("跟进", "Followups")}
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
