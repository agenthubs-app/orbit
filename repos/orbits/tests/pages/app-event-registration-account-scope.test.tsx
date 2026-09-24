import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import type { ReactElement } from "react";

import type { LiveAccountSessionGraph } from "../../features/account/storage/account-live-record-provider";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");
const testRequire = createRequire(import.meta.url);
const eventId = "event:registration-account-scope";

const graph: LiveAccountSessionGraph = {
  accounts: [
    {
      id: "account:a",
      name: "Account A",
      createdAt: "2026-07-28T00:00:00.000Z",
      updatedAt: "2026-07-28T00:00:00.000Z",
    },
    {
      id: "account:b",
      name: "Account B",
      createdAt: "2026-07-28T00:00:00.000Z",
      updatedAt: "2026-07-28T00:00:00.000Z",
    },
  ],
  evidenceIds: ["evidence:account-membership"],
  generatedAt: "2026-07-28T00:00:00.000Z",
  profiles: [
    {
      id: "profile:a",
      accountId: "account:a",
      displayName: "Actor A",
      createdAt: "2026-07-28T00:00:00.000Z",
      updatedAt: "2026-07-28T00:00:00.000Z",
    },
    {
      id: "profile:b",
      accountId: "account:b",
      displayName: "Actor B",
      createdAt: "2026-07-28T00:00:00.000Z",
      updatedAt: "2026-07-28T00:00:00.000Z",
    },
  ],
};

const actualActorModule = testRequire(
  join(projectRoot, "app/api/_shared/authenticated-actor.ts"),
) as typeof import("../../app/api/_shared/authenticated-actor");
const resolveActorIdentity = actualActorModule.resolveAuthenticatedApiActorIdentity;

function fixtureEvent() {
  return {
    code: "REGISTRATION_SCOPE",
    description: "Canonical actor scope fixture",
    endsAt: "2099-09-17T01:00:00.000Z",
    evidence: [],
    id: eventId,
    liveDatabaseWriteExecuted: false,
    sourceMetadata: {
      capturedAt: "2026-09-17T00:00:00.000Z",
      label: "Registration scope fixture",
      provider: "test",
    },
    startsAt: "2099-09-17T00:00:00.000Z",
    status: "confirmed" as const,
    title: "Registration scope fixture",
    venue: "Tokyo",
  };
}

function fixtureApplication(actorId: string) {
  return {
    actorId,
    applicationVersion: 1,
    decidedAt: null,
    decisionActorId: null,
    eventId,
    policyVersion: 1,
    profilePayload: { answers: {} },
    status: "pending_review" as const,
    submittedAt: "2026-09-17T00:00:00.000Z",
    updatedAt: "2026-09-17T00:00:00.000Z",
  };
}

function fixturePolicy() {
  return {
    admissionMode: "approval_required" as const,
    capacity: 8,
    eventId,
    policyVersion: 1,
    profileEditDeadlineAt: "2099-09-17T00:30:00.000Z",
    registrationClosesAt: "2099-09-17T00:45:00.000Z",
    registrationOpensAt: "2026-09-17T00:00:00.000Z",
    updatedAt: "2026-09-17T00:00:00.000Z",
    waitlistEnabled: true,
  };
}

type RegistrationPageOptions = {
  admissionControlled?: boolean;
  outsideRequestScope?: boolean;
  signedIn?: boolean;
  sessionUserId?: string;
};

function loadRegistrationPage(
  t: TestContext,
  options: RegistrationPageOptions = {},
) {
  const calls: Array<{ operation: string; input?: unknown }> = [];
  const redirected = new Error("Test redirect");
  const Workspace = (props: Record<string, unknown>) =>
    <div data-registration-workspace-stub>{JSON.stringify(props)}</div>;
  const modules: Record<string, unknown> = {
    "next/navigation": {
      redirect: (href: string) => {
        calls.push({ input: href, operation: "redirect" });
        throw redirected;
      },
    },
    [join(projectRoot, "auth.ts")]: {
      auth: async () => {
        calls.push({ operation: "auth" });
        if (options.outsideRequestScope) {
          throw new Error("auth called outside a request scope");
        }
        if (options.signedIn === false) return null;
        return {
          user: {
            email: "actor-a@example.test",
            id: options.sessionUserId ?? "profile:a",
            name: "Actor A",
          },
        };
      },
    },
    [join(projectRoot, "app/api/_shared/authenticated-actor.ts")]: {
      resolveAuthenticatedApiActorFromSession: async (input: {
        email?: string | null;
        name?: string | null;
        userId: string;
      }) => {
        calls.push({ input, operation: "resolveActor" });
        return resolveActorIdentity({
          graph,
          mode: "live",
          session: input,
          workspaceId: "workspace:registration-test",
        });
      },
    },
    [join(projectRoot, "app/(app)/app/orbit-language-core.ts")]: {
      normalizeOrbitLanguage: (value: string | null | undefined) =>
        value === "en" ? "en" : "zh",
    },
    [join(projectRoot, "app/(app)/app/orbit-language-server.ts")]: {
      getOrbitServerLanguage: async () => {
        calls.push({ operation: "language" });
        return "en";
      },
      localizeOrbitTree: (value: unknown) => value,
    },
    [join(projectRoot, "app/(app)/app/orbit-event-presentation.ts")]: {
      eventTitleForId: () => "Registration scope fixture",
    },
    [join(projectRoot, "app/(app)/app/orbit-reference-styles.tsx")]: {
      OrbitReferenceStyles: () => null,
    },
    [join(projectRoot, "app/(app)/app/orbit-visual-freeze-runtime.tsx")]: {
      OrbitVisualFreezeRuntime: () => null,
    },
    [join(projectRoot, "shared/ui/state-view.tsx")]: {
      StateView: () => null,
    },
    [join(projectRoot, "features/events/registration/event-loader.ts")]: {
      loadEventForRegistration: async (id: string, actorId?: string | null) => {
        calls.push({ input: { actorId, eventId: id }, operation: "loadEvent" });
        return id === eventId ? fixtureEvent() : null;
      },
      localizedEventTitle: (event: { title: string }) => event.title,
    },
    [join(projectRoot, "features/orbit-ai/event-recommendation-artifact-service.ts")]: {
      bilingualSegment: (value: string) => value,
    },
    [join(projectRoot, "features/events/registration/question-generator.ts")]: {
      generateEventRegistrationQuestions: async () => {
        calls.push({ operation: "generateQuestions" });
        if (options.admissionControlled === false) {
          return {
            provenance: {
              aiProviderRequested: true,
              externalNetworkRequested: false,
              fallbackReason: null,
              generationMethod: "orbit-agent-model-customized" as const,
              model: "registration-account-scope-test-model",
              provider: "registration-account-scope-test-provider",
            },
            questions: [
              {
                id: "target_attendees" as const,
                intent: "target_attendees" as const,
                options: ["Founders", "Operators"],
                participantProfileField: "targetAttendees" as const,
                prompt: "Who do you want to meet?",
                required: true,
              },
            ],
          };
        }
        return {
          provenance: {
            aiProviderRequested: false,
            externalNetworkRequested: false,
            fallbackReason: "QUESTIONS_NOT_REQUESTED",
            generationMethod: "deterministic-not-requested" as const,
            model: null,
            provider: null,
          },
          questions: [],
        };
      },
    },
    [join(projectRoot, "features/events/registration/runtime.ts")]: {
      eventRegistrationRuntimeService: {
        get: async (input: { eventId: string; userId: string }) => {
          calls.push({ input, operation: "registrationRuntime" });
          return null;
        },
      },
      readRuntimeEventRegistrationWindow: async (id: string) => {
        calls.push({ input: id, operation: "registrationWindow" });
        return { availability: "open" };
      },
    },
    [join(projectRoot, "features/events/registration/eligibility.ts")]: {
      resolveEventRegistrationEligibility: () => {
        calls.push({ operation: "eligibility" });
        return undefined;
      },
    },
    [join(projectRoot, "features/events/admission/journey-runtime.ts")]: {
      createConfiguredEventAdmissionJourneyService: () => ({
        getState: async (input: { actorId: string; eventReference: string }) => {
          calls.push({ input, operation: "admissionState" });
          return {
            admissionControlled: options.admissionControlled ?? true,
            application: options.admissionControlled === false
              ? null
              : fixtureApplication(input.actorId),
            eventId: input.eventReference,
            policy: fixturePolicy(),
          };
        },
      }),
    },
    [join(projectRoot, "features/events/registration/interview-question-token.server.ts")]: {
      signAdaptiveInterviewQuestion: (input: {
        actorId: string;
        eventId: string;
        language: string;
      }) => {
        calls.push({
          input: {
            actorId: input.actorId,
            eventId: input.eventId,
            language: input.language,
          },
          operation: "signQuestion",
        });
        return "signed-question";
      },
    },
    [join(projectRoot, "features/profile/service-factory.ts")]: {
      createProfileService: () => ({
        getProfile: async (input: { actorId: string }) => {
          calls.push({ input, operation: "profile" });
          return {
            data: { profile: { displayName: "Actor A" } },
            success: true,
          };
        },
      }),
    },
    [join(projectRoot, "app/(app)/app/events/[id]/register/event-registration-workspace.tsx")]: {
      EventRegistrationWorkspace: Workspace,
    },
    [join(projectRoot, "app/(app)/app/events/[id]/register/registration-return-path.ts")]: {
      eventRegistrationReturnPath: (id: string, language?: string) =>
        `/app/events/${encodeURIComponent(id)}/register${language ? `?language=${encodeURIComponent(language)}` : ""}`,
    },
  };

  const pagePath = join(
    projectRoot,
    "app/(app)/app/events/[id]/register/page.tsx",
  );
  const ids = [...Object.keys(modules), pagePath].map((id) =>
    testRequire.resolve(id),
  );
  const previous = new Map(ids.map((id) => [id, testRequire.cache[id]]));
  t.after(() => {
    for (const [id, cached] of previous) {
      if (cached) testRequire.cache[id] = cached;
      else delete testRequire.cache[id];
    }
  });
  for (const [id, exports] of Object.entries(modules)) {
    const resolved = testRequire.resolve(id);
    const replacement = new Module(resolved);
    replacement.filename = resolved;
    replacement.loaded = true;
    replacement.exports = exports;
    testRequire.cache[resolved] = replacement;
  }
  delete testRequire.cache[testRequire.resolve(pagePath)];
  const page = testRequire(pagePath).default as (input: {
    params: Promise<{ id: string }>;
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
  }) => Promise<ReactElement>;

  function workspaceElement(value: unknown): ReactElement<Record<string, unknown>> | undefined {
    if (Array.isArray(value)) {
      return value.map(workspaceElement).find(Boolean);
    }
    if (!value || typeof value !== "object") return undefined;
    const element = value as ReactElement<Record<string, unknown> & { children?: unknown }>;
    if (element.type === Workspace) return element;
    return workspaceElement(element.props?.children);
  }

  return { calls, page, redirected, workspaceElement };
}

test("registration page resolves Auth.js profile subjects to canonical account owners", async (t) => {
  const { calls, page, workspaceElement } = loadRegistrationPage(t);
  const rendered = await page({
    params: Promise.resolve({ id: eventId }),
    searchParams: Promise.resolve({ language: "en" }),
  });
  const workspace = workspaceElement(rendered);

  const identity = resolveActorIdentity({
    graph,
    mode: "live",
    session: {
      email: "actor-a@example.test",
      name: "Actor A",
      userId: "profile:a",
    },
    workspaceId: "workspace:registration-test",
  });
  assert.equal(identity?.id, "account:a");
  assert.deepEqual(calls, [
    { operation: "auth" },
    {
      input: {
        email: "actor-a@example.test",
        name: "Actor A",
        userId: "profile:a",
      },
      operation: "resolveActor",
    },
    { input: { actorId: "account:a", eventId }, operation: "loadEvent" },
    {
      input: { actorId: "account:a", eventReference: eventId },
      operation: "admissionState",
    },
    { input: { eventId, userId: "account:a" }, operation: "registrationRuntime" },
    { input: { actorId: "account:a" }, operation: "profile" },
  ]);
  assert.equal(workspace?.props.actorId, "account:a");
  assert.notEqual(workspace?.props.actorId, "profile:a");
});

test("registration page keeps the legacy branch canonical across its window, signed question, and workspace", async (t) => {
  const { calls, page, workspaceElement } = loadRegistrationPage(t, {
    admissionControlled: false,
  });
  const rendered = await page({
    params: Promise.resolve({ id: eventId }),
    searchParams: Promise.resolve({ language: "en" }),
  });
  const workspace = workspaceElement(rendered);

  assert.deepEqual(calls, [
    { operation: "auth" },
    {
      input: {
        email: "actor-a@example.test",
        name: "Actor A",
        userId: "profile:a",
      },
      operation: "resolveActor",
    },
    { input: { actorId: "account:a", eventId }, operation: "loadEvent" },
    {
      input: { actorId: "account:a", eventReference: eventId },
      operation: "admissionState",
    },
    { input: eventId, operation: "registrationWindow" },
    { operation: "generateQuestions" },
    { input: { eventId, userId: "account:a" }, operation: "registrationRuntime" },
    { input: { actorId: "account:a" }, operation: "profile" },
    { operation: "eligibility" },
    { input: { eventId, language: "en", actorId: "account:a" }, operation: "signQuestion" },
  ]);
  assert.equal(workspace?.props.actorId, "account:a");
  assert.equal(workspace?.props.admissionControlled, false);
  assert.equal(workspace?.props.initialAdmissionApplication, null);
  assert.equal(
    (workspace?.props.initialSignedQuestion as { questionToken?: string } | undefined)
      ?.questionToken,
    "signed-question",
  );
});

test("registration page redirects anonymous users before resolving account membership", async (t) => {
  const { calls, page, redirected } = loadRegistrationPage(t, { signedIn: false });
  await assert.rejects(
    page({
      params: Promise.resolve({ id: eventId }),
      searchParams: Promise.resolve({ language: "en" }),
    }),
    (error) => error === redirected,
  );
  assert.deepEqual(calls, [
    { operation: "auth" },
    {
      input: `/app/account/login?next=%2Fapp%2Fevents%2Fevent%253Aregistration-account-scope%2Fregister%3Flanguage%3Den`,
      operation: "redirect",
    },
  ]);
});

test("registration page fails closed when canonical account membership is unavailable", async (t) => {
  const { calls, page } = loadRegistrationPage(t, {
    sessionUserId: "profile:unknown",
  });
  await assert.rejects(
    page({ params: Promise.resolve({ id: eventId }) }),
    /Authenticated Orbit account membership is unavailable/u,
  );
  assert.deepEqual(calls.map((call) => call.operation), ["auth", "resolveActor"]);
});

test("registration page keeps the outside-request-scope server-render fallback", async (t) => {
  const { calls, page, workspaceElement } = loadRegistrationPage(t, {
    outsideRequestScope: true,
  });
  const rendered = await page({
    params: Promise.resolve({ id: eventId }),
    searchParams: Promise.resolve({ language: "en" }),
  });
  const workspace = workspaceElement(rendered);

  assert.deepEqual(calls, [
    { operation: "auth" },
    { input: { actorId: undefined, eventId }, operation: "loadEvent" },
    { operation: "generateQuestions" },
  ]);
  assert.equal(workspace?.props.actorId, undefined);
});
