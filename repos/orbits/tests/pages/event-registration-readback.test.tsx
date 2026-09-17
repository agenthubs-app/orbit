import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

import { resolveAuthenticatedApiActorIdentity } from "../../app/api/_shared/authenticated-actor";
import { EventRegistrationWorkspace } from "../../app/(app)/app/events/[id]/register/event-registration-workspace";
import type { LiveAccountSessionGraph } from "../../features/account/storage/account-live-record-provider";
import type { EventAdmissionApplication } from "../../features/events/admission/contract";
import type {
  EventRegistration,
  EventRegistrationMutationReceipt,
} from "../../features/events/registration/contract";
import type { SignedAdaptiveInterviewQuestion } from "../../features/events/registration/interview-response-contract";

const EVENT_ID = "event:admission-readback";
const ACTOR_ID = "actor:admission-readback";
const RAW_SESSION_ACTOR_ID = "profile:a";
const ACCOUNT_SESSION_GRAPH: LiveAccountSessionGraph = {
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
const CANONICAL_ACTOR_ID = (() => {
  const actor = resolveAuthenticatedApiActorIdentity({
    graph: ACCOUNT_SESSION_GRAPH,
    mode: "live",
    session: { userId: RAW_SESSION_ACTOR_ID },
    workspaceId: "workspace:readback-test",
  });
  if (!actor) throw new Error("readback fixture must resolve a canonical actor");
  return actor.id;
})();

function signedQuestion(
  field: "targetAttendees" | "valueOffered",
  questionToken: string,
): SignedAdaptiveInterviewQuestion {
  return {
    question: {
      acknowledgment: "",
      field,
      options: field === "targetAttendees" ? ["Founders"] : ["Operators"],
      prompt: field === "targetAttendees" ? "Who do you want to meet?" : "What can you offer?",
      provenance: {
        fallbackReason: null,
        generationMethod: "orbit-agent-model-adaptive",
        model: "test-model",
        provider: "test-provider",
      },
    },
    questionToken,
  };
}

function application(overrides: Partial<EventAdmissionApplication> = {}): EventAdmissionApplication {
  return {
    actorId: ACTOR_ID,
    applicationVersion: 1,
    decidedAt: null,
    decisionActorId: null,
    eventId: EVENT_ID,
    policyVersion: 1,
    profilePayload: { answers: {} },
    status: "admitted",
    submittedAt: "2026-09-17T00:00:00.000Z",
    updatedAt: "2026-09-17T00:00:00.000Z",
    ...overrides,
  };
}

type PendingRequest = {
  init?: RequestInit;
  path: string;
  reject: (reason?: unknown) => void;
  resolve: (response: Response) => void;
};

function installWindow() {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      addEventListener() {},
      clearInterval() {},
      localStorage: { getItem: () => null, removeItem() {}, setItem() {} },
      removeEventListener() {},
      setInterval: () => 1,
      setTimeout(callback: () => void) {
        callback();
        return 1;
      },
    },
  });
  return originalWindow;
}

function restoreWindow(originalWindow: PropertyDescriptor | undefined) {
  if (originalWindow) {
    Object.defineProperty(globalThis, "window", originalWindow);
  } else {
    Reflect.deleteProperty(globalThis, "window");
  }
}

function admissionScreen({
  actorId = ACTOR_ID,
  eventId = EVENT_ID,
  initialAdmissionApplication = null,
  initialSignedQuestion = signedQuestion("targetAttendees", "signed-target"),
}: {
  actorId?: string;
  eventId?: string;
  initialAdmissionApplication?: EventAdmissionApplication | null;
  initialSignedQuestion?: SignedAdaptiveInterviewQuestion | null;
} = {}) {
  return (
    <EventRegistrationWorkspace
      actorId={actorId}
      admissionControlled
      event={{ id: eventId, title: "Admission readback", venue: "Tokyo" }}
      initialAdmissionApplication={initialAdmissionApplication}
      initialRegistration={null}
      initialSignedQuestion={initialSignedQuestion}
      language="en"
      profile={{ displayName: "Aiko" }}
    />
  );
}

type LegacyReceipt = EventRegistration & {
  mutationReceipt: EventRegistrationMutationReceipt;
};

function legacyRegistration({
  eventId = EVENT_ID,
  mutationReceipt = {
    action: "register",
    actorId: ACTOR_ID,
    eventId,
    recordId: "registration:readback",
    registrationVersion: "2026-09-17T00:00:00.000Z",
  },
  participantProfileId = "profile:readback",
  status = "rsvped",
  updatedAt = "2026-09-17T00:00:00.000Z",
  userId = ACTOR_ID,
}: {
  eventId?: string;
  mutationReceipt?: EventRegistrationMutationReceipt;
  participantProfileId?: string;
  status?: EventRegistration["status"];
  updatedAt?: string;
  userId?: string;
} = {}): LegacyReceipt {
  return {
    cancelledAt: status === "cancelled" ? updatedAt : null,
    eventId,
    id: "registration:readback",
    participantProfile: {
      answers: { targetAttendees: "Founders", valueOffered: "Operators" },
      createdAt: "2026-09-17T00:00:00.000Z",
      eventId,
      id: "profile:readback",
      updatedAt,
      userId,
    },
    participantProfileId,
    reactivatedAt: null,
    registeredAt: "2026-09-17T00:00:00.000Z",
    sideEffects: {
      calendarUpdateExecuted: false,
      emailSent: false,
      globalProfileWriteExecuted: false,
      notificationDelivered: false,
      organizerMessageSent: false,
      refundRequested: false,
    },
    status,
    updatedAt,
    userId,
    mutationReceipt,
  };
}

function legacyScreen({
  actorId = ACTOR_ID,
  eventId = EVENT_ID,
  initialRegistration = null,
  initialSignedQuestion = signedQuestion("targetAttendees", "signed-target"),
}: {
  actorId?: string;
  eventId?: string;
  initialRegistration?: EventRegistration | null;
  initialSignedQuestion?: SignedAdaptiveInterviewQuestion | null;
} = {}) {
  return (
    <EventRegistrationWorkspace
      actorId={actorId}
      admissionControlled={false}
      event={{ id: eventId, title: "Registration readback", venue: "Tokyo" }}
      initialAdmissionApplication={null}
      initialRegistration={initialRegistration}
      initialSignedQuestion={initialSignedQuestion}
      language="en"
      profile={{ displayName: "Aiko" }}
    />
  );
}

function button(renderer: ReactTestRenderer, label: string) {
  return renderer.root.find(
    (node) => node.type === "button" && node.children.includes(label),
  );
}

async function completeCoreAnswers(
  renderer: ReactTestRenderer,
  requests: PendingRequest[],
) {
  await act(async () => { button(renderer, "Founders").props.onClick(); });
  let next!: Promise<void>;
  await act(async () => {
    next = button(renderer, "Next").props.onClick();
    assert.equal(requests.length, 1);
    requests[0]!.resolve(Response.json({
      data: {
        done: false,
        signedQuestion: signedQuestion("valueOffered", "signed-value"),
      },
      success: true,
    }));
    await next;
  });
  await act(async () => { button(renderer, "Operators").props.onClick(); });
  await act(async () => { await button(renderer, "Next").props.onClick(); });
  return button(renderer, "Save registration and generate persona");
}

function personaResponse() {
  return Response.json({
    data: {
      persona: {
        energyStyle: "Focused",
        industryTags: ["Technology"],
        offering: "Experience",
        openers: ["What are you building next?"],
        provenance: {
          fallbackReason: null,
          generationMethod: "orbit-agent-model-adaptive",
          model: "test-model",
          provider: "test-provider",
        },
        seeking: "Partners",
        tagline: "A useful event persona",
        tags: ["Builder"],
      },
    },
    success: true,
  });
}

test("a legacy register receipt is accepted only after an independent matching GET", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = installWindow();
  const requests: PendingRequest[] = [];
  let personaRequests = 0;
  globalThis.fetch = ((input, init) => {
    const path = String(input);
    if (path.endsWith("/registration/persona")) {
      personaRequests += 1;
      return Promise.resolve(personaResponse());
    }
    return new Promise<Response>((resolve, reject) => requests.push({ init, path, reject, resolve }));
  }) as typeof fetch;

  const receipt = legacyRegistration();
  let renderer!: ReactTestRenderer;
  try {
    await act(async () => { renderer = create(legacyScreen()); });
    const save = await completeCoreAnswers(renderer, requests);
    let savePromise!: Promise<void>;
    await act(async () => {
      savePromise = save.props.onClick();
      await Promise.resolve();
    });
    assert.equal(requests.length, 2);
    assert.match(requests[1]!.path, /\/registration$/u);
    assert.equal(requests[1]!.init?.method, "POST");
    requests[1]!.resolve(Response.json({ data: receipt, success: true }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    assert.equal(requests.length, 3);
    assert.equal(personaRequests, 0);
    assert.equal(requests[2]!.init?.method, "GET");
    assert.equal(requests[2]!.init?.cache, "no-store");
    requests[2]!.resolve(Response.json({
      data: { eligibility: { allowedActions: ["cancel"] }, registration: receipt },
      success: true,
    }));
    await act(async () => { await savePromise; });
    assert.equal(personaRequests, 1);
    assert.equal(renderer.root.findByType("main").props["data-registration-status"], "rsvped");
    assert.equal(renderer.root.findByType("main").props["data-registration-stage"], "persona");
  } finally {
    globalThis.fetch = originalFetch;
    if (renderer) await act(async () => { renderer.unmount(); });
    restoreWindow(originalWindow);
  }
});

test("legacy register receipt mismatches preserve the draft and never enter success", async () => {
  const baseReceipt = legacyRegistration();
  const cases: { label: string; receipt: LegacyReceipt }[] = [
    {
      label: "wrong actor",
      receipt: { ...baseReceipt, mutationReceipt: { ...baseReceipt.mutationReceipt, actorId: "actor:other" } },
    },
    {
      label: "wrong event",
      receipt: { ...baseReceipt, mutationReceipt: { ...baseReceipt.mutationReceipt, eventId: "event:other" } },
    },
    {
      label: "wrong record",
      receipt: { ...baseReceipt, mutationReceipt: { ...baseReceipt.mutationReceipt, recordId: "registration:other" } },
    },
    {
      label: "wrong profile",
      receipt: { ...baseReceipt, participantProfileId: "profile:other" },
    },
    {
      label: "wrong action",
      receipt: { ...baseReceipt, mutationReceipt: { ...baseReceipt.mutationReceipt, action: "cancel" } },
    },
    {
      label: "wrong version",
      receipt: { ...baseReceipt, mutationReceipt: { ...baseReceipt.mutationReceipt, registrationVersion: "2026-09-17T00:01:00.000Z" } },
    },
  ];

  for (const testCase of cases) {
    const originalFetch = globalThis.fetch;
    const originalWindow = installWindow();
    const requests: PendingRequest[] = [];
    let personaRequests = 0;
    globalThis.fetch = ((input, init) => {
      const path = String(input);
      if (path.endsWith("/registration/persona")) {
        personaRequests += 1;
        return Promise.resolve(personaResponse());
      }
      return new Promise<Response>((resolve, reject) => requests.push({ init, path, reject, resolve }));
    }) as typeof fetch;
    let renderer!: ReactTestRenderer;
    try {
      await act(async () => { renderer = create(legacyScreen()); });
      const save = await completeCoreAnswers(renderer, requests);
      let savePromise!: Promise<void>;
      await act(async () => {
        savePromise = save.props.onClick();
        await Promise.resolve();
      });
      assert.equal(requests.length, 2, testCase.label);
      requests[1]!.resolve(Response.json({ data: testCase.receipt, success: true }));
      await act(async () => { await savePromise; });

      assert.equal(requests.length, 2, testCase.label);
      assert.equal(personaRequests, 0, testCase.label);
      assert.equal(renderer.root.findByType("main").props["data-registration-status"], "unregistered", testCase.label);
      assert.equal(renderer.root.findByType("main").props["data-registration-stage"], "interview", testCase.label);
      assert.equal(renderer.root.findAllByProps({ "data-registration-history": true }).length, 2, testCase.label);
      assert.equal(renderer.root.findAllByProps({ role: "alert" }).length, 1, testCase.label);
    } finally {
      globalThis.fetch = originalFetch;
      if (renderer) await act(async () => { renderer.unmount(); });
      restoreWindow(originalWindow);
    }
  }
});

test("legacy register GET mismatches and failures preserve the draft and never enter success", async () => {
  const baseReceipt = legacyRegistration();
  const cases: { label: string; respond: (request: PendingRequest) => void }[] = [
    {
      label: "wrong actor",
      respond: (request) => request.resolve(Response.json({ data: { ...baseReceipt, userId: "actor:other" }, success: true })),
    },
    {
      label: "wrong event",
      respond: (request) => request.resolve(Response.json({ data: { ...baseReceipt, eventId: "event:other" }, success: true })),
    },
    {
      label: "wrong version",
      respond: (request) => request.resolve(Response.json({ data: { ...baseReceipt, updatedAt: "2026-09-17T00:01:00.000Z" }, success: true })),
    },
    {
      label: "failed envelope",
      respond: (request) => request.resolve(Response.json({ error: { message: "read failed" }, success: false }, { status: 503 })),
    },
    {
      label: "network failure",
      respond: (request) => request.reject(new Error("network unavailable")),
    },
  ];

  for (const testCase of cases) {
    const originalFetch = globalThis.fetch;
    const originalWindow = installWindow();
    const requests: PendingRequest[] = [];
    let personaRequests = 0;
    globalThis.fetch = ((input, init) => {
      const path = String(input);
      if (path.endsWith("/registration/persona")) {
        personaRequests += 1;
        return Promise.resolve(personaResponse());
      }
      return new Promise<Response>((resolve, reject) => requests.push({ init, path, reject, resolve }));
    }) as typeof fetch;
    let renderer!: ReactTestRenderer;
    try {
      await act(async () => { renderer = create(legacyScreen()); });
      const save = await completeCoreAnswers(renderer, requests);
      let savePromise!: Promise<void>;
      await act(async () => {
        savePromise = save.props.onClick();
        await Promise.resolve();
      });
      assert.equal(requests.length, 2, testCase.label);
      requests[1]!.resolve(Response.json({ data: baseReceipt, success: true }));
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      assert.equal(requests.length, 3, testCase.label);
      testCase.respond(requests[2]!);
      await act(async () => { await savePromise; });

      assert.equal(personaRequests, 0, testCase.label);
      assert.equal(renderer.root.findByType("main").props["data-registration-status"], "unregistered", testCase.label);
      assert.equal(renderer.root.findByType("main").props["data-registration-stage"], "interview", testCase.label);
      assert.equal(renderer.root.findAllByProps({ "data-registration-history": true }).length, 2, testCase.label);
      assert.equal(renderer.root.findAllByProps({ role: "alert" }).length, 1, testCase.label);
    } finally {
      globalThis.fetch = originalFetch;
      if (renderer) await act(async () => { renderer.unmount(); });
      restoreWindow(originalWindow);
    }
  }
});

test("an admission POST receipt with the wrong actor cannot update the workspace or start persona generation", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const requests: { path: string; resolve: (response: Response) => void }[] = [];
  let personaRequests = 0;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      addEventListener() {},
      clearInterval() {},
      localStorage: { getItem: () => null, removeItem() {}, setItem() {} },
      removeEventListener() {},
      setInterval: () => 1,
    },
  });
  globalThis.fetch = ((input) => {
    const path = String(input);
    if (path.endsWith("/registration/persona")) {
      personaRequests += 1;
      return Promise.resolve(
        Response.json({ success: false }, { status: 503 }),
      );
    }
    return new Promise<Response>((resolve) => requests.push({ path, resolve }));
  }) as typeof fetch;

  let renderer!: ReactTestRenderer;
  try {
    await act(async () => {
      renderer = create(
        <EventRegistrationWorkspace
          actorId={ACTOR_ID}
          admissionControlled
          event={{ id: EVENT_ID, title: "Admission readback", venue: "Tokyo" }}
          initialAdmissionApplication={null}
          initialRegistration={null}
          initialSignedQuestion={signedQuestion("targetAttendees", "signed-target")}
          language="en"
          profile={{ displayName: "Aiko" }}
        />,
      );
    });

    const button = (label: string) =>
      renderer.root.find(
        (node) => node.type === "button" && node.children.includes(label),
      );
    await act(async () => { button("Founders").props.onClick(); });
    let next!: Promise<void>;
    await act(async () => {
      next = button("Next").props.onClick();
      assert.equal(requests.length, 1);
      requests[0].resolve(Response.json({
        data: {
          done: false,
          signedQuestion: signedQuestion("valueOffered", "signed-value"),
        },
        success: true,
      }));
      await next;
    });

    await act(async () => { button("Operators").props.onClick(); });
    await act(async () => { await button("Next").props.onClick(); });
    const save = button("Save registration and generate persona");
    let savePromise!: Promise<void>;
    await act(async () => {
      savePromise = save.props.onClick();
      await Promise.resolve();
    });
    assert.equal(requests.length, 2);
    assert.match(requests[1].path, /\/admission\/application$/u);
    requests[1].resolve(Response.json({
      data: application({ actorId: "actor:another-account" }),
      success: true,
    }));
    await act(async () => { await savePromise; });

    assert.equal(personaRequests, 0);
    assert.notEqual(
      renderer.root.findByType("main").props["data-registration-status"],
      "admitted",
    );
    assert.equal(
      renderer.root.findByType("main").props["data-registration-stage"],
      "interview",
    );
    assert.equal(renderer.root.findAllByProps({ role: "alert" }).length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (renderer) {
      await act(async () => { renderer.unmount(); });
    }
    if (originalWindow) {
      Object.defineProperty(globalThis, "window", originalWindow);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  }
});

test("admission readback accepts a canonical account ACK and rejects raw or other account actors", async () => {
  assert.equal(CANONICAL_ACTOR_ID, "account:a");
  const mappedIdentity = resolveAuthenticatedApiActorIdentity({
    graph: ACCOUNT_SESSION_GRAPH,
    mode: "live",
    session: {
      email: "actor-a@example.test",
      name: "Actor A",
      userId: RAW_SESSION_ACTOR_ID,
    },
    workspaceId: "workspace:readback-test",
  });
  assert.equal(mappedIdentity?.id, CANONICAL_ACTOR_ID);
  const cases = [
    {
      label: "canonical account actor",
      actorId: CANONICAL_ACTOR_ID,
      accepts: true,
    },
    {
      label: "raw Auth.js profile subject",
      actorId: RAW_SESSION_ACTOR_ID,
      accepts: false,
    },
    {
      label: "other account actor",
      actorId: "account:b",
      accepts: false,
    },
  ] as const;

  for (const testCase of cases) {
    const originalFetch = globalThis.fetch;
    const originalWindow = installWindow();
    const requests: PendingRequest[] = [];
    let personaRequests = 0;
    globalThis.fetch = ((input, init) => {
      const path = String(input);
      if (path.endsWith("/registration/persona")) {
        personaRequests += 1;
        return Promise.resolve(personaResponse());
      }
      return new Promise<Response>((resolve, reject) => requests.push({ init, path, reject, resolve }));
    }) as typeof fetch;
    let renderer!: ReactTestRenderer;
    try {
      await act(async () => {
        renderer = create(admissionScreen({ actorId: CANONICAL_ACTOR_ID }));
      });
      const save = await completeCoreAnswers(renderer, requests);
      let savePromise!: Promise<void>;
      await act(async () => {
        savePromise = save.props.onClick();
        await Promise.resolve();
      });
      assert.equal(requests.length, 2, testCase.label);
      requests[1]!.resolve(Response.json({
        data: application({ actorId: testCase.actorId }),
        success: true,
      }));

      if (testCase.accepts) {
        await act(async () => {
          await Promise.resolve();
          await Promise.resolve();
        });
        assert.equal(requests.length, 3, testCase.label);
        requests[2]!.resolve(Response.json({
          data: application({ actorId: CANONICAL_ACTOR_ID }),
          success: true,
        }));
      }
      await act(async () => { await savePromise; });
      assert.equal(personaRequests, testCase.accepts ? 1 : 0, testCase.label);
      assert.equal(
        renderer.root.findByType("main").props["data-registration-status"],
        testCase.accepts ? "admitted" : "unregistered",
        testCase.label,
      );
      assert.equal(
        renderer.root.findByType("main").props["data-registration-stage"],
        testCase.accepts ? "persona" : "interview",
        testCase.label,
      );
      assert.equal(requests.length, testCase.accepts ? 3 : 2, testCase.label);
    } finally {
      globalThis.fetch = originalFetch;
      if (renderer) await act(async () => { renderer.unmount(); });
      restoreWindow(originalWindow);
    }
  }
});

test("a late admission POST cannot read back or start persona generation in a new event scope", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = installWindow();
  const requests: PendingRequest[] = [];
  let personaRequests = 0;
  globalThis.fetch = ((input, init) => {
    const path = String(input);
    if (path.endsWith("/registration/persona")) {
      personaRequests += 1;
      return Promise.resolve(personaResponse());
    }
    return new Promise<Response>((resolve, reject) => requests.push({ init, path, reject, resolve }));
  }) as typeof fetch;

  const currentB = application({
    eventId: "event:admission-readback-b",
    profilePayload: { answers: { targetAttendees: "Builders", valueOffered: "Advice" } },
    status: "pending_review",
  });
  let renderer!: ReactTestRenderer;
  try {
    await act(async () => { renderer = create(admissionScreen()); });
    const save = await completeCoreAnswers(renderer, requests);
    let savePromise!: Promise<void>;
    await act(async () => {
      savePromise = save.props.onClick();
      await Promise.resolve();
    });
    assert.equal(requests.length, 2);
    const oldPostReceipt = application({ applicationVersion: 4, status: "pending_review" });

    await act(async () => {
      renderer.update(admissionScreen({
        eventId: currentB.eventId,
        initialAdmissionApplication: currentB,
        initialSignedQuestion: null,
      }));
    });
    requests[1]!.resolve(Response.json({ data: oldPostReceipt, success: true }));
    await act(async () => { await savePromise; });

    assert.equal(requests.length, 2, "a stale POST cannot start an admission GET");
    assert.equal(personaRequests, 0, "a stale POST cannot start persona generation");
    assert.equal(renderer.root.findByType("main").props["data-registration-status"], "pending_review");
    assert.equal(renderer.root.findByType("main").props["data-registration-stage"], "pending_review");
  } finally {
    globalThis.fetch = originalFetch;
    if (renderer) await act(async () => { renderer.unmount(); });
    restoreWindow(originalWindow);
  }
});

test("an admission POST readback cannot update a new actor scope", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = installWindow();
  const requests: PendingRequest[] = [];
  let personaRequests = 0;
  globalThis.fetch = ((input, init) => {
    const path = String(input);
    if (path.endsWith("/registration/persona")) {
      personaRequests += 1;
      return Promise.resolve(personaResponse());
    }
    return new Promise<Response>((resolve, reject) => requests.push({ init, path, reject, resolve }));
  }) as typeof fetch;

  const oldReceipt = application({ applicationVersion: 4, status: "pending_review" });
  let renderer!: ReactTestRenderer;
  try {
    await act(async () => { renderer = create(admissionScreen()); });
    const save = await completeCoreAnswers(renderer, requests);
    let savePromise!: Promise<void>;
    await act(async () => {
      savePromise = save.props.onClick();
      await Promise.resolve();
    });
    assert.equal(requests.length, 2);
    requests[1]!.resolve(Response.json({ data: oldReceipt, success: true }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    assert.equal(requests.length, 3);

    await act(async () => {
      renderer.update(admissionScreen({
        actorId: "actor:other",
        initialAdmissionApplication: null,
        initialSignedQuestion: null,
      }));
    });
    requests[2]!.resolve(Response.json({ data: oldReceipt, success: true }));
    await act(async () => { await savePromise; });

    assert.equal(requests.length, 3, "a stale actor readback cannot start persona generation");
    assert.equal(personaRequests, 0);
    assert.equal(renderer.root.findByType("main").props["data-registration-status"], "unregistered");
    assert.equal(renderer.root.findByType("main").props["data-registration-stage"], "interview");
  } finally {
    globalThis.fetch = originalFetch;
    if (renderer) await act(async () => { renderer.unmount(); });
    restoreWindow(originalWindow);
  }
});

test("an admission POST readback cannot update an unmounted workspace", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = installWindow();
  const requests: PendingRequest[] = [];
  let personaRequests = 0;
  globalThis.fetch = ((input, init) => {
    const path = String(input);
    if (path.endsWith("/registration/persona")) {
      personaRequests += 1;
      return Promise.resolve(personaResponse());
    }
    return new Promise<Response>((resolve, reject) => requests.push({ init, path, reject, resolve }));
  }) as typeof fetch;

  const oldReceipt = application({ applicationVersion: 4, status: "pending_review" });
  let renderer!: ReactTestRenderer;
  try {
    await act(async () => { renderer = create(admissionScreen()); });
    const save = await completeCoreAnswers(renderer, requests);
    let savePromise!: Promise<void>;
    await act(async () => {
      savePromise = save.props.onClick();
      await Promise.resolve();
    });
    assert.equal(requests.length, 2);
    requests[1]!.resolve(Response.json({ data: oldReceipt, success: true }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    assert.equal(requests.length, 3);

    await act(async () => { renderer.unmount(); });
    requests[2]!.resolve(Response.json({ data: oldReceipt, success: true }));
    await act(async () => { await savePromise; });
    assert.equal(requests.length, 3, "an unmounted workspace cannot start persona generation");
    assert.equal(personaRequests, 0);
  } finally {
    globalThis.fetch = originalFetch;
    restoreWindow(originalWindow);
  }
});

test("an admission POST rejects a wrong event, non-positive version, or unknown status before readback", async () => {
  const cases: { label: string; receipt: Partial<EventAdmissionApplication> }[] = [
    { label: "wrong event", receipt: { eventId: "event:other" } },
    { label: "zero version", receipt: { applicationVersion: 0 } },
    { label: "fractional version", receipt: { applicationVersion: 1.5 } },
    { label: "unknown status", receipt: { status: "not-a-status" as EventAdmissionApplication["status"] } },
  ];

  for (const testCase of cases) {
    const originalFetch = globalThis.fetch;
    const originalWindow = installWindow();
    const requests: PendingRequest[] = [];
    let personaRequests = 0;
    globalThis.fetch = ((input, init) => {
      const path = String(input);
      if (path.endsWith("/registration/persona")) {
        personaRequests += 1;
        return Promise.resolve(personaResponse());
      }
      return new Promise<Response>((resolve, reject) => requests.push({ init, path, reject, resolve }));
    }) as typeof fetch;
    let renderer!: ReactTestRenderer;
    try {
      await act(async () => { renderer = create(admissionScreen()); });
      const save = await completeCoreAnswers(renderer, requests);
      let savePromise!: Promise<void>;
      await act(async () => {
        savePromise = save.props.onClick();
        await Promise.resolve();
      });
      assert.equal(requests.length, 2, testCase.label);
      requests[1]!.resolve(Response.json({ data: application(testCase.receipt), success: true }));
      await act(async () => { await savePromise; });

      assert.equal(requests.length, 2, testCase.label);
      assert.equal(personaRequests, 0, testCase.label);
      assert.equal(renderer.root.findByType("main").props["data-registration-status"], "unregistered", testCase.label);
      assert.equal(renderer.root.findByType("main").props["data-registration-stage"], "interview", testCase.label);
      assert.equal(renderer.root.findAllByProps({ "data-registration-history": true }).length, 2, testCase.label);
    } finally {
      globalThis.fetch = originalFetch;
      if (renderer) await act(async () => { renderer.unmount(); });
      restoreWindow(originalWindow);
    }
  }
});

test("an admission POST waits for a matching direct GET and preserves the existing version and status", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = installWindow();
  const requests: PendingRequest[] = [];
  let personaRequests = 0;
  globalThis.fetch = ((input, init) => {
    const path = String(input);
    if (path.endsWith("/registration/persona")) {
      personaRequests += 1;
      return Promise.resolve(personaResponse());
    }
    return new Promise<Response>((resolve, reject) => requests.push({ init, path, reject, resolve }));
  }) as typeof fetch;

  let renderer!: ReactTestRenderer;
  try {
    await act(async () => { renderer = create(admissionScreen()); });
    const save = await completeCoreAnswers(renderer, requests);
    let savePromise!: Promise<void>;
    await act(async () => {
      savePromise = save.props.onClick();
      await Promise.resolve();
    });

    const persisted = application({
      applicationVersion: 4,
      status: "waitlisted",
    });
    assert.equal(requests.length, 2);
    assert.match(requests[1]!.path, /\/admission\/application$/u);
    requests[1]!.resolve(Response.json({ data: persisted, success: true }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    assert.equal(requests.length, 3);
    assert.equal(personaRequests, 0, "persona generation waits for the admission readback");
    assert.equal(renderer.root.findByType("main").props["data-registration-status"], "unregistered");

    assert.equal(requests[2]!.init?.method, "GET");
    assert.equal(requests[2]!.init?.cache, "no-store");
    requests[2]!.resolve(Response.json({ data: persisted, success: true }));
    await act(async () => { await savePromise; });
    assert.equal(personaRequests, 1);
    assert.equal(renderer.root.findByType("main").props["data-registration-status"], "waitlisted");
    assert.equal(renderer.root.findByProps({ "data-persona-admission-status": "waitlisted" }).props["data-persona-admission-status"], "waitlisted");
  } finally {
    globalThis.fetch = originalFetch;
    if (renderer) await act(async () => { renderer.unmount(); });
    restoreWindow(originalWindow);
  }
});

test("admission readback failures keep the submitted answers and never start persona generation", async () => {
  const persisted = application({ applicationVersion: 4, status: "pending_review" });
  const cases: { label: string; respond: (request: PendingRequest) => void }[] = [
    {
      label: "null application",
      respond: (request) => request.resolve(Response.json({ data: null, success: true })),
    },
    {
      label: "failed envelope",
      respond: (request) => request.resolve(Response.json({ error: { message: "read failed" }, success: false }, { status: 503 })),
    },
    {
      label: "wrong actor",
      respond: (request) => request.resolve(Response.json({ data: { ...persisted, actorId: "actor:other" }, success: true })),
    },
    {
      label: "wrong event",
      respond: (request) => request.resolve(Response.json({ data: { ...persisted, eventId: "event:other" }, success: true })),
    },
    {
      label: "wrong version",
      respond: (request) => request.resolve(Response.json({ data: { ...persisted, applicationVersion: 5 }, success: true })),
    },
    {
      label: "wrong status",
      respond: (request) => request.resolve(Response.json({ data: { ...persisted, status: "admitted" }, success: true })),
    },
    {
      label: "nested application envelope",
      respond: (request) => request.resolve(Response.json({ data: { application: persisted }, success: true })),
    },
    {
      label: "network failure",
      respond: (request) => request.reject(new Error("network unavailable")),
    },
  ];

  for (const testCase of cases) {
    const originalFetch = globalThis.fetch;
    const originalWindow = installWindow();
    const requests: PendingRequest[] = [];
    let personaRequests = 0;
    globalThis.fetch = ((input, init) => {
      const path = String(input);
      if (path.endsWith("/registration/persona")) {
        personaRequests += 1;
        return Promise.resolve(personaResponse());
      }
      return new Promise<Response>((resolve, reject) => requests.push({ init, path, reject, resolve }));
    }) as typeof fetch;
    let renderer!: ReactTestRenderer;
    try {
      await act(async () => { renderer = create(admissionScreen()); });
      const save = await completeCoreAnswers(renderer, requests);
      let savePromise!: Promise<void>;
      await act(async () => {
        savePromise = save.props.onClick();
        await Promise.resolve();
      });
      assert.equal(requests.length, 2, testCase.label);
      requests[1]!.resolve(Response.json({ data: persisted, success: true }));
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      assert.equal(requests.length, 3, testCase.label);
      testCase.respond(requests[2]!);
      await act(async () => { await savePromise; });
      assert.equal(personaRequests, 0, testCase.label);
      assert.equal(renderer.root.findByType("main").props["data-registration-status"], "unregistered", testCase.label);
      assert.equal(renderer.root.findByType("main").props["data-registration-stage"], "interview", testCase.label);
      assert.equal(renderer.root.findAllByProps({ "data-registration-history": true }).length, 2, testCase.label);
      assert.equal(renderer.root.findAllByProps({ role: "alert" }).length, 1, testCase.label);
    } finally {
      globalThis.fetch = originalFetch;
      if (renderer) await act(async () => { renderer.unmount(); });
      restoreWindow(originalWindow);
    }
  }
});

test("admission withdrawal is single-flight, requires withdrawn version plus one, and waits for a matching GET", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = installWindow();
  const requests: PendingRequest[] = [];
  globalThis.fetch = ((input, init) => {
    const path = String(input);
    return new Promise<Response>((resolve, reject) => requests.push({ init, path, reject, resolve }));
  }) as typeof fetch;
  const current = application({
    applicationVersion: 4,
    profilePayload: { answers: { targetAttendees: "Founders", valueOffered: "Operators" } },
    status: "pending_review",
  });
  const withdrawn = application({
    applicationVersion: 5,
    profilePayload: current.profilePayload,
    status: "withdrawn",
  });
  let renderer!: ReactTestRenderer;
  try {
    await act(async () => {
      renderer = create(admissionScreen({
        initialAdmissionApplication: current,
        initialSignedQuestion: null,
      }));
    });
    await act(async () => { button(renderer, "Withdraw application").props.onClick(); });
    let cancelPromise!: Promise<void>;
    let duplicatePromise!: Promise<void>;
    await act(async () => {
      const confirm = button(renderer, "Confirm withdrawal").props.onClick;
      cancelPromise = confirm();
      duplicatePromise = confirm();
      await Promise.resolve();
    });
    assert.equal(requests.length, 1, "double withdrawal sends one DELETE");
    assert.equal(requests[0]!.init?.method, "DELETE");
    assert.deepEqual(JSON.parse(String(requests[0]!.init?.body)), {
      expectedApplicationVersion: 4,
    });
    requests[0]!.resolve(Response.json({ data: withdrawn, success: true }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    assert.equal(requests.length, 2);
    assert.equal(renderer.root.findByType("main").props["data-registration-status"], "pending_review");
    assert.equal(renderer.root.findByType("main").props["data-registration-stage"], "pending_review");
    assert.equal(requests[1]!.init?.method, "GET");
    requests[1]!.resolve(Response.json({ data: withdrawn, success: true }));
    await act(async () => {
      await cancelPromise;
      await duplicatePromise;
    });
    assert.equal(renderer.root.findByType("main").props["data-registration-status"], "withdrawn");
    assert.equal(renderer.root.findByType("main").props["data-registration-stage"], "withdrawn");
    assert.equal(renderer.root.findByProps({ "data-admission-application-status": "withdrawn" }).props["data-admission-application-status"], "withdrawn");
  } finally {
    globalThis.fetch = originalFetch;
    if (renderer) await act(async () => { renderer.unmount(); });
    restoreWindow(originalWindow);
  }
});

test("an admission withdrawal GET failure keeps the pending application and its answers", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = installWindow();
  const requests: PendingRequest[] = [];
  globalThis.fetch = ((input, init) =>
    new Promise<Response>((resolve, reject) => requests.push({ init, path: String(input), reject, resolve }))) as typeof fetch;
  const current = application({
    applicationVersion: 4,
    profilePayload: { answers: { targetAttendees: "Founders", valueOffered: "Operators" } },
    status: "pending_review",
  });
  const withdrawn = application({
    applicationVersion: 5,
    profilePayload: current.profilePayload,
    status: "withdrawn",
  });
  let renderer!: ReactTestRenderer;
  try {
    await act(async () => {
      renderer = create(admissionScreen({
        initialAdmissionApplication: current,
        initialSignedQuestion: null,
      }));
    });
    await act(async () => { button(renderer, "Withdraw application").props.onClick(); });
    let cancelPromise!: Promise<void>;
    await act(async () => {
      cancelPromise = button(renderer, "Confirm withdrawal").props.onClick();
      await Promise.resolve();
    });
    assert.equal(requests.length, 1);
    requests[0]!.resolve(Response.json({ data: withdrawn, success: true }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    assert.equal(requests.length, 2);
    requests[1]!.reject(new Error("readback unavailable"));
    await act(async () => { await cancelPromise; });

    assert.equal(renderer.root.findByType("main").props["data-registration-status"], "pending_review");
    assert.equal(renderer.root.findByType("main").props["data-registration-stage"], "pending_review");
    assert.equal(renderer.root.findAllByProps({ "data-admission-profile-answer": "targetAttendees" }).length, 1);
    assert.match(JSON.stringify(renderer.toJSON()), /answers were kept.*reload/iu);
  } finally {
    globalThis.fetch = originalFetch;
    if (renderer) await act(async () => { renderer.unmount(); });
    restoreWindow(originalWindow);
  }
});

test("admission withdrawal rejects an untrusted or non-next-version DELETE receipt without reading it back", async () => {
  const cases: { label: string; receipt: Partial<EventAdmissionApplication> }[] = [
    { label: "wrong actor", receipt: { actorId: "actor:other", applicationVersion: 5, status: "withdrawn" } },
    { label: "wrong event", receipt: { eventId: "event:other", applicationVersion: 5, status: "withdrawn" } },
    { label: "same version", receipt: { applicationVersion: 4, status: "withdrawn" } },
    { label: "skipped version", receipt: { applicationVersion: 6, status: "withdrawn" } },
    { label: "wrong status", receipt: { applicationVersion: 5, status: "admitted" } },
  ];

  for (const testCase of cases) {
    const originalFetch = globalThis.fetch;
    const originalWindow = installWindow();
    const requests: PendingRequest[] = [];
    globalThis.fetch = ((input, init) =>
      new Promise<Response>((resolve, reject) => requests.push({ init, path: String(input), reject, resolve }))) as typeof fetch;
    const current = application({
      applicationVersion: 4,
      profilePayload: { answers: { targetAttendees: "Founders", valueOffered: "Operators" } },
      status: "pending_review",
    });
    let renderer!: ReactTestRenderer;
    try {
      await act(async () => {
        renderer = create(admissionScreen({
          initialAdmissionApplication: current,
          initialSignedQuestion: null,
        }));
      });
      await act(async () => { button(renderer, "Withdraw application").props.onClick(); });
      let pending!: Promise<void>;
      await act(async () => {
        pending = button(renderer, "Confirm withdrawal").props.onClick();
        await Promise.resolve();
      });
      requests[0]!.resolve(Response.json({ data: application(testCase.receipt), success: true }));
      await act(async () => { await pending; });
      assert.equal(requests.length, 1, testCase.label);
      assert.equal(renderer.root.findByType("main").props["data-registration-status"], "pending_review", testCase.label);
      assert.equal(renderer.root.findByType("main").props["data-registration-stage"], "pending_review", testCase.label);
      assert.equal(renderer.root.findAllByProps({ role: "alert" }).length, 1, testCase.label);
    } finally {
      globalThis.fetch = originalFetch;
      if (renderer) await act(async () => { renderer.unmount(); });
      restoreWindow(originalWindow);
    }
  }
});

test("a late admission GET cannot update a scope that leaves and returns to the same event", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = installWindow();
  const requests: PendingRequest[] = [];
  globalThis.fetch = ((input, init) =>
    new Promise<Response>((resolve, reject) => requests.push({ init, path: String(input), reject, resolve }))) as typeof fetch;
  const currentA = application({
    applicationVersion: 4,
    profilePayload: { answers: { targetAttendees: "Founders", valueOffered: "Operators" } },
    status: "pending_review",
  });
  const currentB = application({
    eventId: "event:admission-readback-b",
    profilePayload: { answers: { targetAttendees: "Builders", valueOffered: "Advice" } },
    status: "pending_review",
  });
  const withdrawnA = application({
    applicationVersion: 5,
    profilePayload: currentA.profilePayload,
    status: "withdrawn",
  });
  let renderer!: ReactTestRenderer;
  try {
    await act(async () => {
      renderer = create(admissionScreen({
        initialAdmissionApplication: currentA,
        initialSignedQuestion: null,
      }));
    });
    await act(async () => { button(renderer, "Withdraw application").props.onClick(); });
    let oldCancel!: Promise<void>;
    await act(async () => {
      oldCancel = button(renderer, "Confirm withdrawal").props.onClick();
      await Promise.resolve();
    });
    assert.equal(requests.length, 1);
    requests[0]!.resolve(Response.json({ data: withdrawnA, success: true }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    assert.equal(requests.length, 2);

    await act(async () => {
      renderer.update(admissionScreen({
        eventId: currentB.eventId,
        initialAdmissionApplication: currentB,
        initialSignedQuestion: null,
      }));
    });
    await act(async () => {
      renderer.update(admissionScreen({
        initialAdmissionApplication: currentA,
        initialSignedQuestion: null,
      }));
    });

    let newCancel!: Promise<void>;
    await act(async () => { button(renderer, "Withdraw application").props.onClick(); });
    await act(async () => {
      newCancel = button(renderer, "Confirm withdrawal").props.onClick();
      await Promise.resolve();
    });
    assert.equal(requests.length, 3);
    requests[2]!.resolve(Response.json({ data: withdrawnA, success: true }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    assert.equal(requests.length, 4);

    requests[1]!.resolve(Response.json({ data: withdrawnA, success: true }));
    await act(async () => { await oldCancel; });
    assert.equal(renderer.root.findByType("main").props["data-registration-status"], "pending_review");
    assert.equal(renderer.root.findByType("main").props["data-registration-stage"], "pending_review");

    requests[3]!.resolve(Response.json({ data: withdrawnA, success: true }));
    await act(async () => { await newCancel; });
    assert.equal(renderer.root.findByType("main").props["data-registration-status"], "withdrawn");
    assert.equal(renderer.root.findByType("main").props["data-registration-stage"], "withdrawn");
  } finally {
    globalThis.fetch = originalFetch;
    if (renderer) await act(async () => { renderer.unmount(); });
    restoreWindow(originalWindow);
  }
});
