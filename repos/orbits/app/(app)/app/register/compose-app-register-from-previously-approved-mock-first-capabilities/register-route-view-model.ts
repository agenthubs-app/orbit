import type { EventRecord } from "../../../../../features/events/event-crud-and-import/contract";
import { loadPublicEventForRegistration } from "../../../../../features/events/registration/event-loader";

export type AppRegisterSearchParams = Record<
  string,
  string | string[] | undefined
>;
export type AppRegisterRouteScenario = "empty" | "pending" | "failure";

export interface AppRegisterRouteInput {
  code?: string | null;
  searchParams?: AppRegisterSearchParams;
}

export interface AppRegisterRouteStateViewModel {
  copy: {
    description: string;
    emptyState: string;
    eyebrow: string;
    guardrail: string;
    nextStep: string;
    purpose: string;
    title: string;
  };
  errorCode: string | null;
  evidenceIds: readonly string[];
  recoveryActions: readonly {
    id: string;
    href: string;
    label: string;
    recoveryCopy: string;
  }[];
  scenario: AppRegisterRouteScenario;
}

export type AppRegisterRouteViewModel =
  | {
      state: "success";
      register: {
        event: {
          code: string;
          id: string;
          name: string;
          theme: string;
        };
      };
    }
  | {
      state: "route-state";
      routeState: AppRegisterRouteStateViewModel;
    };

function readSearchParam(
  searchParams: AppRegisterSearchParams | undefined,
  key: string,
): string | null {
  const value = searchParams?.[key];

  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function compactCodeForEventId(eventId: string): string {
  const compact = eventId.replace(/[^a-z0-9]+/giu, "").toUpperCase();

  return compact || "EVENT";
}

function uniqueEvidenceIds(evidenceIds: readonly string[]): string[] {
  return Array.from(new Set(evidenceIds.filter(Boolean)));
}

function baseRouteState(input: {
  errorCode?: string | null;
  evidenceIds: readonly string[];
  scenario: AppRegisterRouteScenario;
}): AppRegisterRouteStateViewModel {
  const copyByScenario = {
    empty: {
      description:
        "Choose a source-backed event before collecting registration profile details.",
      emptyState:
        "No registration event is ready, and no registration profile was saved.",
      eyebrow: "Registration",
      guardrail:
        "This route only reads event and profile context. It does not create attendees, send messages, trigger notifications, or contact external providers.",
      nextStep:
        "Return to events and open registration from a reviewed event record.",
      purpose:
        "Keep the registration entry visible while preserving source-backed event boundaries.",
      title: "Registration is not ready",
    },
    failure: {
      description: "Registration could not load event or profile context.",
      emptyState:
        "No registration profile was saved, no attendee was created, and no external provider was contacted.",
      eyebrow: "Registration",
      guardrail:
        "The failed route state stops before registration writes, notifications, email, calendar, AI, or outside network work.",
      nextStep:
        "Confirm the Events live store and profile sources are configured, then retry registration.",
      purpose:
        "Show a recoverable registration boundary without falling back to mock data.",
      title: "Registration could not load",
    },
    pending: {
      description:
        "Registration context is waiting for reviewed event or profile sources.",
      emptyState:
        "The registration form is held until source-backed context is ready.",
      eyebrow: "Registration",
      guardrail:
        "Pending registration context cannot create attendees or trigger external work.",
      nextStep:
        "Check the event again after its source-backed registration context is ready.",
      purpose:
        "Keep the registration entry stable while source review is pending.",
      title: "Registration is loading",
    },
  } as const;

  return {
    copy: copyByScenario[input.scenario],
    errorCode: input.errorCode ?? null,
    evidenceIds: uniqueEvidenceIds([
      input.errorCode ?? "",
      ...input.evidenceIds,
    ]),
    recoveryActions: [
      {
        id: "register-return-events",
        href: "/app/events",
        label: "Return to events",
        recoveryCopy:
          "Open an event with reviewed source context before retrying registration.",
      },
      ...(input.scenario === "empty"
        ? []
        : [
            {
              id: "register-retry",
              href: "/app/register",
              label: "Retry registration",
              recoveryCopy:
                "Retry registration after confirming the event and profile services are configured.",
            },
          ]),
    ],
    scenario: input.scenario,
  };
}

function eventRouteState(input: {
  code: string;
  evidenceIds: readonly string[];
  scenario?: AppRegisterRouteScenario | null;
}): AppRegisterRouteViewModel {
  return {
    state: "route-state",
    routeState: baseRouteState({
      errorCode: input.code,
      evidenceIds: input.evidenceIds,
      scenario: input.scenario ?? "failure",
    }),
  };
}

function eventView(event: EventRecord) {
  return {
    code: compactCodeForEventId(event.id),
    id: event.id,
    name: event.title,
    theme: event.sourceMetadata.captureMethod,
  };
}

function registerViewModel(event: EventRecord) {
  return {
    event: eventView(event),
  };
}

export async function loadAppRegisterRouteViewModel(
  input: AppRegisterRouteInput = {},
): Promise<AppRegisterRouteViewModel> {
  const searchParams = input.searchParams;
  const eventId =
    input.code?.trim() ||
    readSearchParam(searchParams, "code")?.trim() ||
    null;

  if (!eventId) {
    return {
      state: "route-state",
      routeState: baseRouteState({
        evidenceIds: ["register-route-code-required"],
        scenario: "empty",
      }),
    };
  }

  const event = loadPublicEventForRegistration(eventId);
  if (!event) {
    return eventRouteState({
      code: "PUBLIC_REGISTRATION_EVENT_NOT_FOUND",
      evidenceIds: ["public-catalogue-registration-event-not-found"],
      scenario: "empty",
    });
  }

  return {
    state: "success",
    register: registerViewModel(event),
  };
}
