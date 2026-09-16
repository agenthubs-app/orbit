import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

import { EventRegistrationWorkspace } from "../../app/(app)/app/events/[id]/register/event-registration-workspace";
import type { SignedAdaptiveInterviewStep } from "../../features/events/registration/interview-response-contract";
import type { EventRegistration } from "../../features/events/registration/contract";

test("a configuration restriction explains the organizer dependency without starting an interview", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  let requests = 0;
  globalThis.fetch = (async () => { requests++; throw new Error("No interview or save is authorized"); }) as typeof fetch;
  Object.defineProperty(globalThis, "window", { configurable: true, value: { addEventListener() {}, removeEventListener() {}, localStorage: { getItem: () => null, removeItem() {}, setItem() {} } } });
  let renderer!: ReactTestRenderer;
  try {
    await act(async () => { renderer = create(<EventRegistrationWorkspace actorId="actor" initialEligibility={{ state: "unavailable", reason: "unavailable", blockingReason: "configuration_required", allowedActions: [], evaluatedAt: "2026-09-16T00:00:00Z", registrationVersion: null, applicationVersion: null, policyVersion: null }} admissionControlled={false} event={{ id: "event", title: "Night", venue: "Tokyo" }} initialAdmissionApplication={null} initialRegistration={null} initialSignedQuestion={null} language="en" prefilledPositioning="Founder" profile={{ displayName: "Aiko" }} />); });
    assert.equal(requests, 0);
    assert.match(JSON.stringify(renderer.toJSON()), /organizer.*registration information/i);
    assert.equal(renderer.root.findAll(node => node.type === "button" && node.children.includes("Save registration and generate persona")).length, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (renderer) await act(async () => { renderer.unmount(); });
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow); else Reflect.deleteProperty(globalThis, "window");
  }
});

test("confirmed cancellation is single-flight, versioned and independently read back", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { addEventListener() {}, removeEventListener() {}, localStorage: { getItem: () => null, removeItem() {}, setItem() {} } } });
  const active = { id: "record", eventId: "event", userId: "actor", status: "rsvped", updatedAt: "2026-09-16T00:00:00Z", participantProfileId: "profile", participantProfile: { id: "profile", eventId: "event", userId: "actor", answers: { targetAttendees: "Partners", valueOffered: "Experience" } } } as EventRegistration;
  const cancelled = { ...active, status: "cancelled", updatedAt: "2026-09-16T01:00:00Z", mutationReceipt: { action: "cancel", actorId: "actor", eventId: "event", recordId: "record", registrationVersion: "2026-09-16T01:00:00Z" } };
  const requests: { path: string; init?: RequestInit; resolve: (response: Response) => void }[] = [];
  globalThis.fetch = ((input, init) => new Promise<Response>(resolve => requests.push({ path: String(input), init, resolve }))) as typeof fetch;
  let renderer!: ReactTestRenderer;
  try {
    await act(async () => { renderer = create(<EventRegistrationWorkspace admissionControlled={false} event={{ id: "event", title: "Night", venue: "Tokyo" }} initialAdmissionApplication={null} initialRegistration={active} initialSignedQuestion={null} language="en" profile={{ displayName: "Aiko" }} />); });
    const button = (label: string) => renderer.root.find(node => node.type === "button" && node.children.includes(label));
    await act(async () => { button("Cancel registration").props.onClick(); });
    let pending!: Promise<void>;
    await act(async () => { const fn = button("Confirm cancellation").props.onClick; pending = fn(); void fn(); });
    assert.equal(requests.length, 1);
    assert.deepEqual(JSON.parse(String(requests[0].init?.body)), { intent: "cancel", expectedRegistrationVersion: active.updatedAt });
    await act(async () => { requests[0].resolve(Response.json({ success: true, data: cancelled })); });
    assert.equal(requests.length, 2);
    assert.match(requests[1].path, /registration\?questions=false$/);
    assert.equal(renderer.root.findByType("main").props["data-registration-stage"], "registered");
    await act(async () => { requests[1].resolve(Response.json({ success: true, data: { registration: cancelled, eligibility: { state: "registration_cancelled", allowedActions: ["reactivate"], registrationVersion: cancelled.updatedAt } } })); await pending; });
    assert.equal(renderer.root.findByType("main").props["data-registration-stage"], "cancelled");
  } finally {
    globalThis.fetch = originalFetch;
    if (renderer) await act(async () => { renderer.unmount(); });
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow); else Reflect.deleteProperty(globalThis, "window");
  }
});

test("interview single-flight rejects unsigned steps and late callbacks cannot cross event scope", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { addEventListener() {}, removeEventListener() {}, localStorage: { getItem: () => null, removeItem() {}, setItem() {} } } });
  const requests: { resolve: (response: Response) => void; signal: AbortSignal | null | undefined }[] = [];
  globalThis.fetch = ((_input, init) => new Promise<Response>(resolve => requests.push({ resolve, signal: init?.signal }))) as typeof fetch;
  const signed = (token: string) => ({ question: { field: "targetAttendees" as const, prompt: `Who? ${token}`, options: ["Founders"], acknowledgment: "", provenance: { fallbackReason: null, generationMethod: "orbit-agent-model-adaptive" as const, model: "test-model", provider: "test-provider" } }, questionToken: token });
  const screen = (id: string) => <EventRegistrationWorkspace admissionControlled={false} event={{ id, title: "Night", venue: "Tokyo" }} initialAdmissionApplication={null} initialRegistration={null} initialSignedQuestion={signed(id)} language="en" profile={{ displayName: "Aiko" }} />;
  let renderer!: ReactTestRenderer;
  const button = (label: string) => renderer.root.find(node => node.type === "button" && node.children.includes(label));
  try {
    await act(async () => { renderer = create(screen("first")); });
    await act(async () => { button("Founders").props.onClick(); });
    const retainedNext = button("Next").props.onClick;
    let pending!: Promise<void>;
    await act(async () => { pending = retainedNext(); void retainedNext(); });
    assert.equal(requests.length, 1, "double click sends one signed request");
    await act(async () => { requests[0].resolve(Response.json({ success: true, data: { done: false, signedQuestion: null } })); await pending; });
    assert.equal(renderer.root.findAllByProps({ "data-registration-history": true }).length, 0, "an unsigned next question cannot confirm or discard the current turn");
    assert.equal(renderer.root.findAll(node => node.type === "h2" && node.children.includes("Who? first")).length, 1);
    await act(async () => { pending = button("Next").props.onClick(); });
    assert.equal(requests.length, 2);
    await act(async () => { renderer.update(screen("second")); });
    assert.equal(requests[1].signal?.aborted, true);
    await act(async () => { requests[1].resolve(Response.json({ success: true, data: { done: false, signedQuestion: signed("late") } })); await pending; await retainedNext(); });
    assert.equal(requests.length, 2, "retained callbacks cannot send old event answers");
    assert.equal(renderer.root.findAllByProps({ "data-registration-history": true }).length, 0);
    assert.equal(renderer.root.findAll(node => node.type === "h2" && node.children.includes("Who? second")).length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (renderer) await act(async () => { renderer.unmount(); });
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow); else Reflect.deleteProperty(globalThis, "window");
  }
});
test("an old cancellation acknowledgement cannot start a readback under a new actor scope", async () => {
  const originalFetch = globalThis.fetch; const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { addEventListener() {}, removeEventListener() {}, localStorage: { getItem: () => null, removeItem() {}, setItem() {} } } });
  const active = { id: "record", eventId: "event", userId: "first", status: "rsvped", updatedAt: "2026-09-16T00:00:00Z", participantProfileId: "profile", participantProfile: { id: "profile", eventId: "event", userId: "first", answers: {} } } as EventRegistration;
  const requests: ((response: Response) => void)[] = [];
  globalThis.fetch = (() => new Promise<Response>(resolve => { requests.push(resolve); if(requests.length>1)queueMicrotask(()=>resolve(Response.json({success:false},{status:503}))); })) as typeof fetch;
  const screen = (actorId: string) => <EventRegistrationWorkspace actorId={actorId} admissionControlled={false} event={{ id: "event", title: "Night", venue: "Tokyo" }} initialAdmissionApplication={null} initialRegistration={active} initialSignedQuestion={null} language="en" profile={{ displayName: "Aiko" }} />;
  let renderer!: ReactTestRenderer;
  try {
    await act(async () => { renderer=create(screen("first")); });
    const button = (label: string) => renderer.root.find(node=>node.type==="button"&&node.children.includes(label));
    await act(async()=>{ button("Cancel registration").props.onClick(); });
    let pending!: Promise<void>; await act(async()=>{pending=button("Confirm cancellation").props.onClick();});
    await act(async()=>{renderer.update(screen("second"));});
    await act(async()=>{requests[0](Response.json({success:true,data:{...active,status:"cancelled",mutationReceipt:{action:"cancel",actorId:"first",eventId:"event",recordId:"record",registrationVersion:active.updatedAt}}}));await pending;});
    assert.equal(requests.length,1);
    assert.equal(renderer.root.findByType("main").props["data-registration-stage"],"registered");
  } finally { globalThis.fetch=originalFetch;if(renderer)await act(async()=>{renderer.unmount();});if(originalWindow)Object.defineProperty(globalThis,"window",originalWindow);else Reflect.deleteProperty(globalThis,"window"); }
});

test("quick-answer seeding on a new event cannot retain the previous event context", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  let body: any;
  Object.defineProperty(globalThis, "window", { configurable: true, value: { addEventListener() {}, removeEventListener() {}, setInterval: () => 1, clearInterval() {}, localStorage: { getItem: (key: string) => key === "orbit-quick-answers:second" ? JSON.stringify({ targetAttendees: "Partners", valueOffered: "Experience" }) : null, removeItem() {}, setItem() {} } } });
  globalThis.fetch = (async (_input, init) => { body = JSON.parse(String(init?.body)); return Response.json({ success: false, error: { message: "Test failure" } }, { status: 503 }); }) as typeof fetch;
  const screen = (id: string) => <EventRegistrationWorkspace admissionControlled={false} event={{ id, title: "Night", venue: "Tokyo" }} initialAdmissionApplication={null} initialRegistration={null} initialSignedQuestion={null} language="en" prefilledPositioning={id} profile={{ displayName: "Aiko" }} />;
  let renderer!: ReactTestRenderer;
  try {
    await act(async () => { renderer = create(screen("first")); });
    await act(async () => { renderer.update(screen("second")); });
    await act(async () => { await renderer.root.find(node => node.type === "button" && node.children.includes("Save registration and generate persona")).props.onClick(); });
    assert.equal(body.answers.positioning, "second");
    assert.equal(body.answers.targetAttendees, "Partners");
  } finally {
    globalThis.fetch = originalFetch;
    if (renderer) await act(async () => { renderer.unmount(); });
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow); else Reflect.deleteProperty(globalThis, "window");
  }
});

test("an already saved registration generates only a preview and coverage never invents historical questions", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const urls: string[] = [];
  const answers = { positioning: "Founder", industry: "Technology", targetAttendees: "Partners", valueOffered: "Experience", desiredOutcome: "Collaborate", energyStyle: "Focused", experienceHighlight: "Launch", followUpPreference: "Email" };
  const registration: EventRegistration = { id: "saved", eventId: "saved-event", userId: "actor", participantProfileId: "profile", participantProfile: { id: "profile", eventId: "saved-event", userId: "actor", answers, createdAt: "2026-09-16T00:00:00Z", updatedAt: "2026-09-16T00:00:00Z" }, status: "rsvped", registeredAt: "2026-09-16T00:00:00Z", updatedAt: "2026-09-16T00:00:00Z", cancelledAt: null, reactivatedAt: null, sideEffects: { calendarUpdateExecuted: false, emailSent: false, globalProfileWriteExecuted: false, notificationDelivered: false, organizerMessageSent: false, refundRequested: false } };
  Object.defineProperty(globalThis, "window", { configurable: true, value: { addEventListener() {}, removeEventListener() {}, setInterval: () => 1, clearInterval() {}, setTimeout(callback: () => void) { callback(); return 1; }, localStorage: { getItem: () => null, removeItem() {}, setItem() {} } } });
  globalThis.fetch = (async input => { urls.push(String(input)); return Response.json({ success: true, data: { persona: { tagline: "Preview", tags: [], industryTags: [], openers: [], offering: "Experience", seeking: "Partners", energyStyle: "Focused", provenance: { generationMethod: "orbit-agent-model-adaptive", provider: "test-provider", model: "test-model", fallbackReason: null } } } }); }) as typeof fetch;
  let renderer!: ReactTestRenderer;
  try {
    await act(async () => { renderer = create(<EventRegistrationWorkspace admissionControlled={false} event={{ id: "saved-event", title: "Night", venue: "Tokyo" }} initialAdmissionApplication={null} initialRegistration={registration} initialSignedQuestion={null} language="en" profile={{ displayName: "Aiko" }} />); });
    const generate = renderer.root.find(node => node.type === "button" && node.children.includes("Generate event persona"));
    await act(async () => { await generate.props.onClick(); });
    assert.deepEqual(urls, ["/api/events/saved-event/registration/persona"]);
    assert.equal(renderer.root.findByProps({ role: "progressbar" }).props["aria-valuenow"], 8);
    assert.equal(renderer.root.findAll(node => node.type === "p" && node.children.includes("You can generate your persona now or keep answering.")).length, 0, "all eight dimensions must stop suggesting more answers");
    assert.equal(renderer.root.findAllByProps({ "data-registration-history": true }).length, 0, "legacy answer-only snapshots cannot fabricate prompt text");
  } finally {
    globalThis.fetch = originalFetch;
    if (renderer) await act(async () => { renderer.unmount(); });
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow); else Reflect.deleteProperty(globalThis, "window");
  }
});

test("other is a single draft entrance and successful turns append read-only history without automatic saving", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const requests: { url: string; body: any }[] = [];
  const signed = (field: "targetAttendees" | "valueOffered" | "industry", prompt: string, options: string[]) => ({ question: { field, prompt, options, acknowledgment: "", provenance: { fallbackReason: null, generationMethod: "orbit-agent-model-adaptive" as const, model: "test-model", provider: "test-provider" } }, questionToken: `signed-${field}` });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { addEventListener() {}, removeEventListener() {}, localStorage: { getItem: () => null, removeItem() {}, setItem() {} } } });
  let fail = true;
  globalThis.fetch = (async (input, init) => {
    requests.push({ url: String(input), body: JSON.parse(String(init?.body)) });
    if (fail) return Response.json({ success: false, error: { message: "Retry this question" } }, { status: 503 });
    return Response.json({ success: true, data: { done: false, signedQuestion: requests.length < 3 ? signed("valueOffered", "What can you offer?", ["Experience"]) : signed("industry", "Which industry?", []) } });
  }) as typeof fetch;
  let renderer!: ReactTestRenderer;
  const button = (label: string) => renderer.root.find(node => node.type === "button" && node.children.includes(label));
  try {
    await act(async () => { renderer = create(<EventRegistrationWorkspace admissionControlled={false} event={{ id: "other-history", title: "Night", venue: "Tokyo" }} initialAdmissionApplication={null} initialRegistration={null} initialSignedQuestion={signed("targetAttendees", "Who do you want to meet?", ["Founders", "其他", "Other", "その他"])} language="en" profile={{ displayName: "Aiko" }} />); });
    assert.deepEqual(requests, [], "render and coverage must not prefetch model questions");
    assert.equal(renderer.root.findAllByType("input").length, 0);
    assert.equal(renderer.root.findAll(node => node.type === "button" && node.children.includes("Other")).length, 1);
    await act(async () => { button("Other").props.onClick(); });
    await act(async () => { renderer.root.findByType("input").props.onChange({ target: { value: "Independent advisor" } }); });
    await act(async () => { button("Founders").props.onClick(); });
    assert.equal(renderer.root.findAllByType("input").length, 0);
    assert.deepEqual(requests, []);
    await act(async () => { button("Other").props.onClick(); });
    assert.equal(renderer.root.findByType("input").props.value, "Independent advisor");
    await act(async () => { renderer.root.findByType("input").props.onChange({ target: { value: " " } }); });
    assert.equal(renderer.root.findByProps({ role: "progressbar" }).props["aria-valuenow"], 0);
    assert.equal(button("Next").props.disabled, true);
    await act(async () => { renderer.root.findByType("input").props.onChange({ target: { value: "Independent advisor" } }); });
    await act(async () => { await renderer.root.findByType("form").props.onSubmit({ preventDefault() {} }); });
    assert.equal(renderer.root.findByType("input").props.value, "Independent advisor", "failed request retains this uncommitted custom draft");
    assert.equal(renderer.root.findAllByProps({ "data-registration-history": true }).length, 0);
    fail = false;
    await act(async () => { await renderer.root.findByType("form").props.onSubmit({ preventDefault() {} }); });
    let history = renderer.root.findAllByProps({ "data-registration-history": true });
    assert.equal(history.length, 1);
    assert.ok(JSON.stringify(history[0].children.map(child => typeof child === "string" ? child : child.children)).includes("Who do you want to meet?"));
    assert.equal(requests[1].body.transcript.at(-1).answer, "Independent advisor");
    await act(async () => { await button("Experience").props.onClick(); });
    assert.equal(renderer.root.findAllByType("input").length, 0);
    await act(async () => { await button("Next").props.onClick(); });
    history = renderer.root.findAllByProps({ "data-registration-history": true });
    assert.equal(history.length, 2);
    assert.equal(requests.length, 2, "second core answer only offers a stopping choice");
    assert.equal(renderer.root.findByProps({ role: "progressbar" }).props["aria-valuenow"], 2);
    await act(async () => { await button("Continue answering").props.onClick(); });
    assert.equal(requests.length, 3);
    assert.equal(renderer.root.findAllByType("input").length, 1, "an optionless question stays open");
    assert.equal(renderer.root.findAllByProps({ "data-registration-history": true }).length, 2);
    assert.ok(requests.every(request => request.url.endsWith("/registration/interview")));
  } finally {
    globalThis.fetch = originalFetch;
    if (renderer) await act(async () => { renderer.unmount(); });
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow); else Reflect.deleteProperty(globalThis, "window");
  }
});

test("an initial AI failure offers an in-place real-model retry without a fallback question", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      addEventListener() {},
      removeEventListener() {},
    },
  });
  const step: SignedAdaptiveInterviewStep = {
    done: false,
    signedQuestion: {
      question: {
        acknowledgment: "",
        field: "targetAttendees",
        options: ["Founders", "Investors"],
        prompt: "Who do you want to meet at this event?",
        provenance: {
          fallbackReason: null,
          generationMethod: "orbit-agent-model-adaptive",
          model: "test-model",
          provider: "test-provider",
        },
      },
      questionToken: "signed-real-model-question",
    },
  };
  globalThis.fetch = (async () =>
    Response.json({ data: step, success: true })) as typeof fetch;
  let renderer!: ReactTestRenderer;

  try {
    await act(async () => {
      renderer = create(
        <EventRegistrationWorkspace
          admissionControlled={false}
          event={{ id: "event-retry", title: "Retry Night", venue: "Tokyo" }}
          initialAdmissionApplication={null}
          initialRegistration={null}
          initialSignedQuestion={null}
          language="en"
          profile={{ displayName: "Aiko" }}
        />,
      );
    });
    assert.equal(
      renderer.root.findAll(
        (node) => node.props["data-registration-interview-retry"] !== undefined,
      ).length,
      1,
    );
    assert.equal(
      renderer.root.findAll((node) =>
        typeof node.children[0] === "string" &&
        node.children[0].includes("substitute question"),
      ).length > 0,
      true,
    );

    const retry = renderer.root.find(
      (node) => node.props["data-registration-interview-retry"] !== undefined,
    );
    await act(async () => {
      await retry.props.onClick();
    });

    assert.equal(
      renderer.root.findAll(
        (node) => node.type === "h2" && node.children.includes(step.signedQuestion!.question.prompt),
      ).length,
      1,
    );
    assert.equal(
      renderer.root.findAll(
        (node) => node.props["data-registration-interview-retry"] !== undefined,
      ).length,
      0,
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (renderer) {
      await act(async () => {
        renderer.unmount();
      });
    }
    if (originalWindow) {
      Object.defineProperty(globalThis, "window", originalWindow);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  }
});

test("two quick answers offer an explicit save and persona action without automatic registration", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const eventId = "event-two-question-finish";
  const requests: { body: unknown; url: string }[] = [];
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      addEventListener() {},
      clearInterval() {},
      removeEventListener() {},
      setInterval() {
        return 1;
      },
      setTimeout(callback: () => void) {
        callback();
        return 1;
      },
      localStorage: {
        getItem: (key: string) =>
          key === `orbit-quick-answers:${eventId}`
            ? JSON.stringify({
                targetAttendees: "硬件供应链的创始人",
                valueOffered: "海外渠道资源",
              })
            : null,
        removeItem() {},
        setItem() {},
      },
    },
  });
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    requests.push({
      body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
      url,
    });
    if (url.endsWith("/registration/persona")) {
      return Response.json({
        data: {
          persona: {
            energyStyle: "Focused",
            industryTags: ["Technology"],
            offering: "海外渠道资源",
            openers: ["你目前最关注哪个市场？"],
            provenance: {
              fallbackReason: null,
              generationMethod: "orbit-agent-model-adaptive",
              model: "test-model",
              provider: "test-provider",
            },
            seeking: "硬件供应链的创始人",
            tagline: "连接硬件与海外市场",
            tags: ["硬件", "出海"],
          },
        },
        success: true,
      });
    }
    if (url.endsWith("/registration")) {
      const updatedAt = "2026-09-16T00:00:00Z";
      return Response.json({
        data: {
          id: "quick-record", eventId, userId: "actor", participantProfileId: "quick-profile", updatedAt,
          participantProfile: { id: "quick-profile", eventId, userId: "actor", answers: {} },
          status: "rsvped",
          mutationReceipt: { action: "register", actorId: "actor", eventId, recordId: "quick-record", registrationVersion: updatedAt },
        },
        success: true,
      });
    }
    if (url.endsWith("/registration?questions=false")) {
      return Response.json({ success: true, data: { registration: { id: "quick-record", eventId, userId: "actor", participantProfileId: "quick-profile", updatedAt: "2026-09-16T00:00:00Z", status: "rsvped", participantProfile: { id: "quick-profile", eventId, userId: "actor", answers: {} } } } });
    }
    throw new Error(`unexpected request: ${url}`);
  }) as typeof fetch;
  let renderer!: ReactTestRenderer;

  try {
    await act(async () => {
      renderer = create(
        <EventRegistrationWorkspace actorId="actor"
          admissionControlled={false}
          event={{ id: eventId, title: "Two Question Night", venue: "Tokyo" }}
          initialAdmissionApplication={null}
          initialRegistration={null}
          initialSignedQuestion={{
            question: {
              acknowledgment: "",
              field: "targetAttendees",
              options: ["Founders", "Investors"],
              prompt: "Who do you want to meet?",
              provenance: {
                fallbackReason: null,
                generationMethod: "orbit-agent-model-adaptive",
                model: "test-model",
                provider: "test-provider",
              },
            },
            questionToken: "signed-target-attendees-question",
          }}
          language="zh"
          prefilledPositioning="创始人 @ Orbit"
          profile={{ displayName: "Aiko" }}
        />,
      );
    });

    assert.equal(
      requests.some((request) => request.url.endsWith("/registration/interview")),
      false,
      "the registration flow must not request an optional third question",
    );
    assert.deepEqual(requests, [], "core coverage must not automatically save or call the model");
    const save = renderer.root.find((node) => node.type === "button" && node.children.includes("保存报名并生成画像"));
    await act(async () => { await save.props.onClick(); });
    const registrationRequest = requests.find((request) =>
      request.url.endsWith("/registration"),
    );
    assert.deepEqual(registrationRequest?.body, {
      intent: "register",
      expectedRegistrationVersion: null,
      answers: {
        positioning: "创始人 @ Orbit",
        targetAttendees: "硬件供应链的创始人",
        valueOffered: "海外渠道资源",
      },
    });
    assert.equal(
      renderer.root.findAll(
        (node) => node.props["data-registration-stage"] === "persona",
      ).length,
      1,
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (renderer) {
      await act(async () => {
        renderer.unmount();
      });
    }
    if (originalWindow) {
      Object.defineProperty(globalThis, "window", originalWindow);
    } else {
      delete (globalThis as { window?: unknown }).window;
    }
  }
});

test("questionnaire progress counts actual answers rather than current question number or universal prefill", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const secondStep: SignedAdaptiveInterviewStep = {
    done: false,
    signedQuestion: {
      question: {
        acknowledgment: "明白了，你想围绕创业者建立连接。",
        field: "valueOffered",
        options: ["行业经验", "合作资源"],
        prompt: "你最适合为遇到的人提供什么？",
        provenance: {
          fallbackReason: null,
          generationMethod: "orbit-agent-model-adaptive",
          model: "test-model",
          provider: "test-provider",
        },
      },
      questionToken: "signed-value-offered-question",
    },
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      addEventListener() {},
      removeEventListener() {},
      localStorage: { getItem: () => null, removeItem() {}, setItem() {} },
    },
  });
  globalThis.fetch = (async () =>
    Response.json({ data: secondStep, success: true })) as typeof fetch;
  let renderer!: ReactTestRenderer;

  try {
    await act(async () => {
      renderer = create(
        <EventRegistrationWorkspace
          admissionControlled={false}
          event={{ id: "event-progress", title: "Progress Night", venue: "Tokyo" }}
          initialAdmissionApplication={null}
          initialRegistration={null}
          initialSignedQuestion={{
            question: {
              acknowledgment: "",
              field: "targetAttendees",
              options: ["创业者", "投资人"],
              prompt: "你最希望认识谁？",
              provenance: {
                fallbackReason: null,
                generationMethod: "orbit-agent-model-adaptive",
                model: "test-model",
                provider: "test-provider",
              },
            },
            questionToken: "signed-target-question",
          }}
          language="zh"
          prefilledPositioning="创始人 @ Orbit"
          profile={{ displayName: "Aiko" }}
        />,
      );
    });

    let progress = renderer.root.findByProps({ role: "progressbar" });
    assert.equal(progress.props["aria-valuemax"], 8);
    assert.equal(progress.props["aria-valuenow"], 0);
    assert.equal(
      renderer.root.findAllByProps({
        "data-registration-progress-label": "0/8",
      }).length,
      1,
    );

    const firstOption = renderer.root.findAll(
      (node) => node.type === "button" && node.props["data-reg-option"] !== undefined,
    )[0];
    assert.ok(firstOption);
    await act(async () => {
      firstOption.props.onClick();
      await Promise.resolve();
    });

    progress = renderer.root.findByProps({ role: "progressbar" });
    assert.equal(progress.props["aria-valuenow"], 1);
    assert.equal(
      renderer.root.findAllByProps({
        "data-registration-progress-label": "1/8",
      }).length,
      1,
    );
    await act(async () => {
      const next = renderer.root.find(node => node.type === "button" && node.children.includes("继续"));
      await next.props.onClick();
    });
    assert.equal(renderer.root.findAllByProps({ "data-registration-history": true }).length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (renderer) {
      await act(async () => {
        renderer.unmount();
      });
    }
    if (originalWindow) {
      Object.defineProperty(globalThis, "window", originalWindow);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  }
});
