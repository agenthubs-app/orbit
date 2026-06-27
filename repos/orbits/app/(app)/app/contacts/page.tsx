/* eslint-disable no-unused-vars -- The base ESLint config lacks JSX variable usage tracking. */
import { StateView } from "../../../../shared/ui/state-view";
import { bilingualText } from "../../../../shared/ui/bilingual";
import { AppContactsCommandCenter } from "./compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-command-center";

export const metadata = {
  title: "Contacts | Orbit",
  description:
    "Compose source-backed contact search, filters, value tags, and local review actions in Orbit.",
};

type AppContactsSearchParams = Record<string, string | string[] | undefined>;

interface ContactsPageProps {
  searchParams?: AppContactsSearchParams | Promise<AppContactsSearchParams>;
}

function isPromiseLike<TValue>(
  value: TValue | Promise<TValue> | undefined,
): value is Promise<TValue> {
  return Boolean(value && typeof (value as Promise<TValue>).then === "function");
}

function LegacyContactsStateBoundary() {
  return (
    <StateView
      description={bilingualText(
        "联系人页会显示这个人是谁、关系从哪里来，以及下一次跟进背后的证据。",
        "Contacts will show who a person is, where the connection came from, and the evidence behind the next follow-up.",
      )}
      emptyState={bilingualText(
        "还没有加载联系人卡片、来源、重复候选或关系备注。",
        "No contact cards, sources, duplicate candidates, or relationship notes are loaded.",
      )}
      evidence={[
        bilingualText("还没有加载联系人列表。", "No contact list is loaded."),
        bilingualText("合并建议尚未启用。", "Merge suggestions are not active."),
      ]}
      eyebrow={bilingualText("联系人", "Contacts")}
      guardrail={bilingualText(
        "联系人页可以说明采集顺序，但不能创建或合并记录。",
        "Contacts can describe capture order, but it cannot create or merge records.",
      )}
      nextStep={bilingualText(
        "创建关系记录前，先从已采集的来源开始。",
        "Start with a captured source before creating relationship records.",
      )}
      purpose={bilingualText(
        "只有在来源和证据存在后才复核人物。",
        "Review people only after their origin and evidence exist.",
      )}
      title={bilingualText("联系人", "Contacts")}
    />
  );
}

function renderContactsPage(searchParams: AppContactsSearchParams | undefined) {
  return <AppContactsCommandCenter searchParams={searchParams} />;
}

export default function ContactsPage({
  searchParams,
}: ContactsPageProps = {}) {
  if (searchParams === undefined) {
    return <LegacyContactsStateBoundary />;
  }

  if (isPromiseLike(searchParams)) {
    return searchParams.then((resolvedSearchParams) =>
      renderContactsPage(resolvedSearchParams),
    );
  }

  return renderContactsPage(searchParams);
}
