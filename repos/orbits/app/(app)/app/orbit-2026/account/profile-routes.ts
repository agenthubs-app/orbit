import { profileOnboardingFlowPath } from "../../profile/profile-onboarding-navigation";

type LegacyProfileQuery = {
  next?: string | string[];
  onboarding?: string | string[];
  view?: string | string[];
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Return null for the canonical profile page; legacy query variants redirect. */
export function profileLegacyDestination(query: LegacyProfileQuery): string | null {
  if (first(query.onboarding) === "1") {
    return profileOnboardingFlowPath(first(query.next) ?? "/app/home");
  }

  switch (first(query.view)) {
    case "connect":
      return "/app/settings/integrations";
    case "persona":
      return "/app/profile?edit=tags";
    case "basic":
      return "/app/profile?edit=card";
    default:
      return null;
  }
}
