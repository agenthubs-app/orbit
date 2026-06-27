/* eslint-disable no-unused-vars -- The base ESLint config lacks JSX variable usage tracking. */
import { StateView } from "../../../../shared/ui/state-view";
import { bilingualText } from "../../../../shared/ui/bilingual";
import { AppEventsCommandCenter } from "./compose-app-events-from-previously-approved-mock-first-capabilities/events-command-center";

export const metadata = {
  title: "Events | Orbit",
  description:
    "Compose sourced events, event value recommendations, attendee recommendations, and readiness in Orbit.",
};

type AppEventsSearchParams = Record<string, string | string[] | undefined>;

interface EventsPageProps {
  searchParams?: AppEventsSearchParams | Promise<AppEventsSearchParams>;
}

function isPromiseLike<TValue>(
  value: TValue | Promise<TValue> | undefined,
): value is Promise<TValue> {
  return Boolean(value && typeof (value as Promise<TValue>).then === "function");
}

function LegacyEventsStateBoundary() {
  return (
    <StateView
      description={bilingualText(
        "活动页会汇总谁会参加、为什么重要，以及什么样的介绍最合适。",
        "Events will collect who is attending, why they matter, and what would make a good introduction.",
      )}
      emptyState={bilingualText(
        "还没有加载活动名单、目标、准备备注或参会者证据。",
        "No event roster, goals, readiness notes, or attendee evidence is loaded.",
      )}
      evidence={[
        bilingualText("还没有加载名单。", "No roster is loaded."),
        bilingualText(
          "目标和准备备注为空。",
          "Goals and readiness notes are empty.",
        ),
      ]}
      eyebrow={bilingualText("活动", "Events")}
      guardrail={bilingualText(
        "活动页可以组织准备工作，但目前不能导入参会者。",
        "Events can frame preparation work, but it cannot import attendees yet.",
      )}
      nextStep={bilingualText(
        "名单导入可用后，再添加活动来源。",
        "Add an event source after roster import is available.",
      )}
      purpose={bilingualText(
        "准备活动上下文、参会者来源和目标。",
        "Prepare event context, attendee sources, and goals.",
      )}
      title={bilingualText("活动", "Events")}
    />
  );
}

function renderEventsPage(searchParams: AppEventsSearchParams | undefined) {
  return <AppEventsCommandCenter searchParams={searchParams} />;
}

export default function EventsPage({ searchParams }: EventsPageProps = {}) {
  if (searchParams === undefined) {
    return <LegacyEventsStateBoundary />;
  }

  if (isPromiseLike(searchParams)) {
    return searchParams.then((resolvedSearchParams) =>
      renderEventsPage(resolvedSearchParams),
    );
  }

  return renderEventsPage(searchParams);
}
