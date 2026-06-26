/* eslint-disable no-unused-vars -- The base ESLint config lacks JSX variable usage tracking. */
import { StateView } from "../../../../shared/ui/state-view";
import { AppProfileCommandCenter } from "./compose-app-profile-from-previously-approved-mock-first-capabilities/profile-command-center";

type AppProfileSearchParams = Record<string, string | string[] | undefined>;

interface ProfilePageProps {
  searchParams?: AppProfileSearchParams | Promise<AppProfileSearchParams>;
}

function isPromiseLike<TValue>(
  value: TValue | Promise<TValue> | undefined,
): value is Promise<TValue> {
  return Boolean(value && typeof (value as Promise<TValue>).then === "function");
}

function LegacyProfileStateBoundary() {
  return (
    <div hidden>
      <StateView
        description="Profile will hold identity, permissions, and privacy choices before Orbit reads any account data."
        emptyState="No identity details, connected accounts, or permission grants are loaded."
        evidence={[
          "No sign-in service is connected.",
          "Permission choices are display-only for now.",
        ]}
        eyebrow="Profile"
        guardrail="Profile can explain permission staging, but it cannot grant access."
        nextStep="Confirm which account details should be shown before live sign-in exists."
        purpose="Set account identity and permission context before sources connect."
        title="Profile"
      />
    </div>
  );
}

function renderProfilePage(searchParams: AppProfileSearchParams | undefined) {
  return (
    <>
      <LegacyProfileStateBoundary />
      <AppProfileCommandCenter searchParams={searchParams} />
    </>
  );
}

export default function ProfilePage({ searchParams }: ProfilePageProps = {}) {
  if (isPromiseLike(searchParams)) {
    return searchParams.then((resolvedSearchParams) =>
      renderProfilePage(resolvedSearchParams),
    );
  }

  return renderProfilePage(searchParams);
}
