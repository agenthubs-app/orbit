/* eslint-disable no-unused-vars -- The base ESLint config lacks JSX variable usage tracking. */
import { StateView } from "../../../../shared/ui/state-view";
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
      description="Contacts will show who a person is, where the connection came from, and the evidence behind the next follow-up."
      emptyState="No contact cards, sources, duplicate candidates, or relationship notes are loaded."
      evidence={[
        "No contact list is loaded.",
        "Merge suggestions are not active.",
      ]}
      eyebrow="Contacts"
      guardrail="Contacts can describe capture order, but it cannot create or merge records."
      nextStep="Start with a captured source before creating relationship records."
      purpose="Review people only after their origin and evidence exist."
      title="Contacts"
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
