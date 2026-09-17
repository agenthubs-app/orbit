import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { RegistrationPortraitWorkspace } from "../../app/(app)/app/events/[id]/register/registration-portrait-workspace";
import { EventRegistrationWorkspace } from "../../app/(app)/app/events/[id]/register/event-registration-workspace";

// Synthetic transport data, not a client-produced authorization reference.
function registrationSourceFixture(actorId = "actor", eventId = "event", sourceVersion = "c".repeat(64), targetAttendees = "Builders") {
  return { actorId, eventId, sourceVersion, answers: (["targetAttendees", "valueOffered"] as const).map(field => ({ responseId: `legacy:${field}`, field, label: { en: field, zh: field }, answer: field === "targetAttendees" ? targetAttendees : "Reviews", question: null, questionSource: "legacy_unknown", generation: null, source: "registration", sourceVersion })) };
}

for (const phase of ["preview", "save"] as const) for (const change of ["actor", "origin", "event", "unmount"] as const) test(`Web private ${phase} rejects late data and retained callbacks after ${change}`, async () => {
  const originalFetch = globalThis.fetch, originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  let actorId = "first", eventId = "first-event";
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { origin: "https://first.example" } } });
  let resolveHeld!: (response: Response) => void;
  let heldSignal: AbortSignal | null | undefined;
  const calls: { path: string; method: string }[] = [];
  const persona = { tagline: "First scope private portrait", seeking: "Builders", offering: "Reviews", energyStyle: "Listening", industryTags: ["Robotics"], tags: ["Hardware"], openers: ["What are you building?"], provenance: { generationMethod: "orbit-agent-model-adaptive", fallbackReason: null, model: "synthetic", provider: "synthetic" } };
  globalThis.fetch = (async (input, init) => {
    const path = String(input), method = init?.method ?? "GET"; calls.push({ path, method });
    if ((phase === "preview" && path.endsWith("/persona")) || (phase === "save" && method === "POST" && path.endsWith("/portrait"))) { heldSignal = init?.signal; return new Promise<Response>(resolve => { resolveHeld = resolve; }); }
    if (path.includes("/registration?")) return Response.json({ success: true, data: { registration: { eventId, userId: actorId, updatedAt: "2026-09-17T09:00:00Z", participantProfile: { answers: { targetAttendees: "Builders", valueOffered: "Reviews" } } }, questionSet: { questions: [] } } });
    if (path.endsWith("/portrait")) return Response.json({ success: true, data: { portrait: null, registrationSource: registrationSourceFixture(actorId, eventId) } });
    if (path.endsWith("/persona")) return Response.json({ success: true, data: { persona, generationToken: "first-result", answersVersion: "a".repeat(64), sourceRegistrationVersion: "2026-09-17T09:00:00Z" } });
    if (path.includes("/recommendations/event/")) return Response.json({ success: true, data: { state: "empty", event: { id: eventId }, recommendations: [], nextAction: "" } });
    throw new Error(`Unexpected operation ${method} ${path}`);
  }) as typeof fetch;
  let renderer!: ReactTestRenderer;
  const screen = () => <RegistrationPortraitWorkspace actorId={actorId} event={{ id: eventId, title: "Night", venue: "Tokyo" }} language="en"><p>Original enrollment</p></RegistrationPortraitWorkspace>;
  const button = (label: string) => renderer.root.find(node => node.type === "button" && node.children.includes(label));
  try {
    await act(async () => { renderer = create(screen()); });
    await act(async () => { button("Build portrait").props.onClick(); });
    if (phase === "save") await act(async () => { await button("Generate portrait").props.onClick(); });
    const oldAction = button(phase === "save" ? "Save portrait" : "Generate portrait").props.onClick;
    await act(async () => { void oldAction(); });
    if (change === "actor") actorId = "second";
    if (change === "event") eventId = "second-event";
    if (change === "origin") (globalThis as any).window.location.origin = "https://second.example";
    if (change === "unmount") renderer.unmount(); else renderer.update(screen());
    assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /First scope private portrait/);
    await act(async () => {});
    assert.equal(heldSignal?.aborted, true);
    const before = calls.length;
    await act(async () => { await oldAction(); resolveHeld(Response.json({ success: false, error: { message: "Old request" } }, { status: 401 })); });
    assert.equal(calls.length, before, "Old callbacks and responses cannot begin reads or writes in the new scope.");
    assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /First scope private portrait/);
  } finally { if (renderer) await act(async () => { renderer.unmount(); }); globalThis.fetch = originalFetch; if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow); else Reflect.deleteProperty(globalThis, "window"); }
});

test("Web expired unstored answers remain visible but only actual new questions restore proofs", async () => {
  const originalFetch = globalThis.fetch;
  const posts: any[] = [];
  globalThis.fetch = (async (input, init) => {
    const path = String(input), body = init?.body ? JSON.parse(String(init.body)) : null;
    if (body) posts.push({ path, body });
    if (path.includes("/registration?")) return Response.json({ success: true, data: { registration: null, questionSet: { questions: [] } } });
    if (path.endsWith("/portrait")) return Response.json({ success: true, data: { portrait: null } });
    if (path.endsWith("/persona")) return Response.json({ success: false, error: { message: "Proof expired" } }, { status: 422 });
    if (path.endsWith("/interview")) { const field = body.transcript.length ? "valueOffered" : "targetAttendees"; return Response.json({ success: true, data: { done: false, signedQuestion: { question: { field, prompt: `Original ${field}?`, options: [], acknowledgment: "", provenance: { generationMethod: "orbit-agent-model-adaptive", fallbackReason: null, model: "synthetic", provider: "synthetic" } }, questionToken: `expired:${field}`, portraitAdaptiveToken: `expired:workspace:${field}` } } }); }
    throw new Error(`Unexpected operation ${path}`);
  }) as typeof fetch;
  let renderer!: ReactTestRenderer;
  const button = (label: string) => renderer.root.find(node => node.type === "button" && node.children.includes(label));
  try {
    await act(async () => { renderer = create(<RegistrationPortraitWorkspace actorId="actor" event={{ id: "event", title: "Night", venue: "Tokyo" }} language="en"><p>Original enrollment</p></RegistrationPortraitWorkspace>); });
    await act(async () => { button("Build portrait").props.onClick(); });
    await act(async () => { await button("Next question").props.onClick(); });
    await act(async () => { renderer.root.findByType("textarea").props.onChange({ target: { value: "Kept first answer" } }); });
    await act(async () => { await button("Next question").props.onClick(); });
    await act(async () => { renderer.root.findByType("textarea").props.onChange({ target: { value: "Kept second answer" } }); });
    await act(async () => { await button("Generate portrait").props.onClick(); });
    await act(async () => { button("Ask unstored questions again").props.onClick(); });
    const page = JSON.stringify(renderer.toJSON()); assert.match(page, /Kept first answer/); assert.match(page, /Kept second answer/);
    assert.equal(button("Generate portrait").props.disabled, true);
    assert.equal(posts.length, 3, "Restart is not itself a provider or writer request.");
    await act(async () => { await button("Next question").props.onClick(); });
    assert.deepEqual(posts[3].body.transcript, []);
    assert.equal(posts.filter(post => post.path.endsWith("/registration") || post.path.endsWith("/portrait")).length, 0);
  } finally { if (renderer) await act(async () => { renderer.unmount(); }); globalThis.fetch = originalFetch; }
});

test("Web editing a reopened portrait invalidates its display but preserves its durable CAS baseline", async () => {
  const originalFetch = globalThis.fetch;
  const persona = { tagline: "Old durable portrait", seeking: "Builders", offering: "Reviews", energyStyle: "Listening", industryTags: ["Robotics"], tags: ["Hardware"], openers: ["What are you building?"], provenance: { generationMethod: "orbit-agent-model-adaptive", fallbackReason: null, model: "synthetic", provider: "synthetic" } };
  const sourceVersion = "2026-09-17T09:00:00Z";
  let portrait: any = { id: "portrait", actorId: "actor", eventId: "event", version: 1, updatedAt: "2026-09-17T10:00:00Z", generatedAt: "2026-09-17T09:59:00Z", answersVersion: "a".repeat(64), sourceEventVersion: "event-core-postgres:event:v1", sourceQuestionSetHash: null, sourceQuestionSetVersion: null, sourceRegistrationVersion: sourceVersion, persona, sourceAnswers: (["targetAttendees", "valueOffered"] as const).map(field => ({ responseId: `legacy:${field}`, field, label: { en: field, zh: field }, answer: field === "targetAttendees" ? "Builders" : "Reviews", question: null, questionSource: "legacy_unknown", generation: null, source: "registration", sourceVersion })) };
  const saves: any[] = [];
  globalThis.fetch = (async (input, init) => {
    const path = String(input), body = init?.body ? JSON.parse(String(init.body)) : null;
    if (path.includes("/registration?")) return Response.json({ success: true, data: { registration: { eventId: "event", userId: "actor", updatedAt: sourceVersion, participantProfile: { answers: { targetAttendees: "Builders", valueOffered: "Reviews" } } }, questionSet: { questions: (["targetAttendees", "valueOffered"] as const).map(field => ({ id: field, participantProfileField: field, prompt: `Original ${field}?`, options: [], required: true, portraitQuestionToken: `formal:${field}` })) } } });
    if (path.endsWith("/persona")) { assert.equal(body.responses[0].answer, "Updated builders"); return Response.json({ success: true, data: { persona: { ...persona, tagline: "New draft portrait" }, generationToken: "new-result", answersVersion: "b".repeat(64), sourceRegistrationVersion: sourceVersion } }); }
    if (path.endsWith("/portrait") && body) {
      saves.push(body); assert.equal(body.expectedPortraitVersion, 1, "Editing a local draft cannot delete its durable CAS baseline.");
      portrait = { ...portrait, version: 2, updatedAt: "2026-09-17T10:01:00Z", answersVersion: "b".repeat(64), persona: { ...persona, tagline: "New draft portrait" } };
      return Response.json({ success: true, data: { portrait, receipt: { mutationId: body.mutationId, portraitId: "portrait", actorId: "actor", eventId: "event", portraitVersion: 2, answersVersion: portrait.answersVersion, updatedAt: portrait.updatedAt } } });
    }
    if (path.endsWith("/portrait")) return Response.json({ success: true, data: { portrait, registrationSource: registrationSourceFixture() } });
    if (path.includes("/recommendations/event/")) return Response.json({ success: true, data: { state: "empty", event: { id: "event" }, recommendations: [], nextAction: "" } });
    throw new Error(`Unexpected operation ${path}`);
  }) as typeof fetch;
  let renderer!: ReactTestRenderer;
  const button = (label: string) => renderer.root.find(node => node.type === "button" && node.children.includes(label));
  try {
    await act(async () => { renderer = create(<RegistrationPortraitWorkspace actorId="actor" event={{ id: "event", title: "Night", venue: "Tokyo" }} language="en" enrollment={{ stage: "registered", status: "rsvped", canSubmit: false, pending: false, error: null, onSubmit: async () => {} }}><p>Legacy controls</p></RegistrationPortraitWorkspace>); });
    await act(async () => { renderer.root.findAllByType("textarea")[0].props.onChange({ target: { value: "Updated builders" } }); });
    assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /Event portrait complete/);
    await act(async () => { button("Build portrait").props.onClick(); });
    assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /Old durable portrait/);
    await act(async () => { await button("Generate portrait").props.onClick(); });
    await act(async () => { await button("Save portrait").props.onClick(); });
    assert.equal(saves.length, 1); assert.equal(saves[0].expectedPortraitVersion, 1); assert.equal(button("Saved").props.disabled, true);
  } finally { if (renderer) await act(async () => { renderer.unmount(); }); globalThis.fetch = originalFetch; }
});

test("Web definite source rejection explicitly refreshes trusted references and saves a regenerated preview", async () => {
  const originalFetch = globalThis.fetch;
  const persona = { tagline: "Recovered preview", seeking: "Builders", offering: "Reviews", energyStyle: "Listening", industryTags: ["Robotics"], tags: ["Hardware"], openers: ["What are you building?"], provenance: { generationMethod: "orbit-agent-model-adaptive", fallbackReason: null, model: "synthetic", provider: "synthetic" } };
  const calls: { path: string; body: any }[] = [];
  let sourceVersion = "2026-09-17T09:00:00Z", physicalVersion = "c".repeat(64), generations = 0, portrait: any = null;
  globalThis.fetch = (async (input, init) => {
    const path = String(input), body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ path, body });
    if (path.includes("/registration?")) return Response.json({ success: true, data: { registration: { eventId: "event", userId: "actor", updatedAt: sourceVersion, participantProfile: { answers: { targetAttendees: "Builders", valueOffered: "Reviews" } } }, questionSet: { questions: [] } } });
    if (path.endsWith("/persona")) { generations++; assert.equal(body.responses[0].sourceVersion, physicalVersion); return Response.json({ success: true, data: { persona, generationToken: `preview:${generations}`, answersVersion: "a".repeat(64), sourceRegistrationVersion: sourceVersion } }); }
    if (path.endsWith("/portrait") && body) {
      if (generations === 1) { sourceVersion = "2026-09-17T09:00:01Z"; physicalVersion = "d".repeat(64); return Response.json({ success: false, error: { message: "Source changed" } }, { status: 409 }); }
      portrait = { id: "portrait", actorId: "actor", eventId: "event", version: 1, updatedAt: "2026-09-17T10:00:00Z", generatedAt: "2026-09-17T09:59:00Z", answersVersion: "a".repeat(64), sourceEventVersion: "event-core-postgres:event:v1", sourceQuestionSetHash: null, sourceQuestionSetVersion: null, sourceRegistrationVersion: sourceVersion, persona, sourceAnswers: (["targetAttendees", "valueOffered"] as const).map(field => ({ responseId: `legacy:${field}`, field, label: { en: field, zh: field }, answer: field === "targetAttendees" ? "Builders" : "Reviews", question: null, questionSource: "legacy_unknown", generation: null, source: "registration", sourceVersion })) };
      return Response.json({ success: true, data: { portrait, receipt: { mutationId: body.mutationId, portraitId: "portrait", actorId: "actor", eventId: "event", portraitVersion: 1, answersVersion: portrait.answersVersion, updatedAt: portrait.updatedAt } } });
    }
    if (path.endsWith("/portrait")) return Response.json({ success: true, data: { portrait, registrationSource: registrationSourceFixture("actor", "event", physicalVersion) } });
    if (path.includes("/recommendations/event/")) return Response.json({ success: true, data: { state: "empty", event: { id: "event" }, recommendations: [], nextAction: "" } });
    throw new Error(`Unexpected operation ${path}`);
  }) as typeof fetch;
  let renderer!: ReactTestRenderer;
  const button = (label: string) => renderer.root.find(node => node.type === "button" && node.children.includes(label));
  try {
    await act(async () => { renderer = create(<RegistrationPortraitWorkspace actorId="actor" event={{ id: "event", title: "Night", venue: "Tokyo" }} language="en"><p>Original enrollment</p></RegistrationPortraitWorkspace>); });
    await act(async () => { button("Build portrait").props.onClick(); });
    await act(async () => { await button("Generate portrait").props.onClick(); });
    await act(async () => { await button("Save portrait").props.onClick(); });
    assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /not yet confirmed/);
    await act(async () => { await button("Reload current sources").props.onClick(); });
    assert.match(JSON.stringify(renderer.toJSON()), /Builders/);
    assert.equal(generations, 1, "Refreshing sources is not a provider call.");
    await act(async () => { await button("Generate portrait").props.onClick(); });
    await act(async () => { await button("Save portrait").props.onClick(); });
    assert.equal(button("Saved").props.disabled, true);
    const saves = calls.filter(call => call.path.endsWith("/portrait") && call.body);
    assert.equal(saves.length, 2); assert.notEqual(saves[0].body.mutationId, saves[1].body.mutationId);
    assert.equal(calls.filter(call => call.path.endsWith("/registration") && call.body).length, 0);
  } finally { if (renderer) await act(async () => { renderer.unmount(); }); globalThis.fetch = originalFetch; }
});

test("Web private portrait generates without registration and requires receipt plus an independent GET before completion", async () => {
  const originalFetch = globalThis.fetch;
  const calls: { path: string; method: string; body: any }[] = [];
  const persona = { tagline: "Synthetic generated portrait", seeking: "Builders", offering: "Reviews", energyStyle: "Listening", industryTags: ["Robotics"], tags: ["Hardware"], openers: ["What are you building?"], provenance: { generationMethod: "orbit-agent-model-adaptive", fallbackReason: null, model: "synthetic", provider: "synthetic" } };
  const registration = { eventId: "event", userId: "actor", updatedAt: "2026-09-17T09:00:00Z", participantProfile: { answers: { targetAttendees: "Builders", valueOffered: "Reviews" } } };
  let portrait: any = null;
  let failReadback = false;
  let savedPayload: any;
  let recommendationStatus = 503;
  globalThis.fetch = (async (input, init) => {
    const path = String(input), method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ path, method, body });
    if (path.includes("/registration?") && method === "GET") return Response.json({ success: true, data: { registration, questionSet: { questions: [] } } });
    if (path.endsWith("/persona")) return Response.json({ success: true, data: { persona, generationToken: "opaque-server-proof", answersVersion: "b".repeat(64), sourceRegistrationVersion: registration.updatedAt } });
    if (path.endsWith("/portrait") && method === "POST") {
      if (savedPayload) assert.deepEqual(body, savedPayload, "Unknown save results must retry the same mutation.");
      savedPayload = body;
      portrait = { id: "portrait", actorId: "actor", eventId: "event", version: 1, updatedAt: "2026-09-17T10:00:00Z", generatedAt: "2026-09-17T09:59:00Z", answersVersion: "b".repeat(64), sourceEventVersion: "event-core-postgres:event:v1", sourceQuestionSetHash: null, sourceQuestionSetVersion: null, sourceRegistrationVersion: registration.updatedAt, persona, sourceAnswers: (["targetAttendees", "valueOffered"] as const).map(field => ({ responseId: `legacy:${field}`, field, label: { en: field, zh: field }, answer: registration.participantProfile.answers[field], question: null, questionSource: "legacy_unknown", generation: null, source: "registration", sourceVersion: registration.updatedAt })) };
      return Response.json({ success: true, data: { portrait, receipt: { mutationId: body.mutationId, portraitId: portrait.id, actorId: "actor", eventId: "event", portraitVersion: 1, answersVersion: portrait.answersVersion, updatedAt: portrait.updatedAt } } });
    }
    if (path.endsWith("/portrait")) return failReadback && portrait ? Response.json({ success: false, error: { message: "Cannot confirm" } }, { status: 503 }) : Response.json({ success: true, data: { portrait, registrationSource: registrationSourceFixture() } });
    if (path.includes("/recommendations/event/")) return recommendationStatus !== 200 ? Response.json({ success: false, error: { message: "Recommendation unavailable" } }, { status: recommendationStatus }) : Response.json({ success: true, data: { state: "success", event: { id: "event" }, recommendations: [{ recommendationId: "r1", eventId: "event", attendee: { attendeeId: "not-a-contact", contactId: "legal/contact", displayName: "Real suggested person", role: "Founder", organization: "Robotics" }, reasons: ["Shared prototyping goals"] }, { recommendationId: "r2", eventId: "event", attendee: { attendeeId: "also-not-a-contact", displayName: "No legal contact link", role: "Engineer", organization: "Hardware" }, reasons: [] }], nextAction: "" } });
    throw new Error(`Unexpected operation ${method} ${path}`);
  }) as typeof fetch;
  let renderer!: ReactTestRenderer;
  const screen = () => <RegistrationPortraitWorkspace actorId="actor" event={{ id: "event", title: "Robotics evening", venue: "Tokyo" }} language="en"><p>Actual registration controls</p></RegistrationPortraitWorkspace>;
  const button = (label: string) => renderer.root.find(node => node.type === "button" && node.children.includes(label));
  try {
    await act(async () => { renderer = create(screen()); });
    assert.equal(calls.filter(call => call.method === "POST").length, 0);
    await act(async () => { button("Build portrait").props.onClick(); });
    await act(async () => { await button("Generate portrait").props.onClick(); });
    const preview = calls.find(call => call.path.endsWith("/persona"))!;
    assert.equal(preview.body.mode, "portrait-preview");
    assert.deepEqual(preview.body.responses.map((proof: any) => [proof.kind, proof.answer]), [["stored_response", "Builders"], ["stored_response", "Reviews"]]);
    assert.match(JSON.stringify(renderer.toJSON()), /Recommendations unavailable/);
    recommendationStatus = 403;
    await act(async () => { await button("Retry recommendations").props.onClick(); });
    assert.match(JSON.stringify(renderer.toJSON()), /Recommendations unavailable/);
    recommendationStatus = 200;
    await act(async () => { await button("Retry recommendations").props.onClick(); });
    assert.match(JSON.stringify(renderer.toJSON()), /Real suggested person/);
    const contactLinks = renderer.root.findAll(node => node.type === "a" && node.children.includes("View contact"));
    assert.equal(contactLinks.length, 1); assert.equal(contactLinks[0].props.href, "/app/contacts/legal%2Fcontact?language=en");
    failReadback = true;
    await act(async () => { await button("Save portrait").props.onClick(); });
    assert.equal(renderer.root.findAll(node => node.type === "button" && node.children.includes("Saved")).length, 0);
    assert.match(JSON.stringify(renderer.toJSON()), /not yet confirmed/);
    failReadback = false;
    await act(async () => { await button("Save portrait").props.onClick(); });
    assert.equal(button("Saved").props.disabled, true);
    assert.equal(calls.filter(call => call.path.endsWith("/persona")).length, 1);
    assert.equal(calls.filter(call => call.method === "POST" && call.path.endsWith("/registration")).length, 0);
    await act(async () => { renderer.unmount(); renderer = create(screen()); });
    assert.match(JSON.stringify(renderer.toJSON()), /Event portrait complete/);
    await act(async () => { button("View").props.onClick(); });
    assert.match(JSON.stringify(renderer.toJSON()), /Synthetic generated portrait/);
    assert.equal(calls.filter(call => call.path.endsWith("/persona")).length, 1);
  } finally { if (renderer) await act(async () => { renderer.unmount(); }); globalThis.fetch = originalFetch; }
});

test("Web formal registration uses the original writer and readback even when optional portrait storage is unavailable", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { addEventListener() {}, removeEventListener() {}, setInterval: () => 1, clearInterval() {}, localStorage: { getItem: () => null, removeItem() {} } } });
  let registration: any = null;
  const posts: { path: string; body: any }[] = [];
  globalThis.fetch = (async (input, init) => {
    const path = String(input);
    if (init?.method === "POST") {
      posts.push({ path, body: JSON.parse(String(init.body)) });
      assert.equal(path, "/api/events/event/registration", "The enrollment command cannot request persona generation.");
      registration = { id: "record", eventId: "event", userId: "actor", status: "rsvped", updatedAt: "2026-09-17T10:00:00Z", participantProfileId: "profile", participantProfile: { id: "profile", eventId: "event", userId: "actor", answers: posts[0].body.answers }, mutationReceipt: { action: "register", actorId: "actor", eventId: "event", recordId: "record", registrationVersion: "2026-09-17T10:00:00Z" } };
      return Response.json({ success: true, data: registration });
    }
    if (path.endsWith("/portrait")) return Response.json({ success: false, error: { message: "Optional portrait storage unavailable" } }, { status: 503 });
    return Response.json({ success: true, data: { registration, questionSet: { questionSetHash: "a".repeat(64), questionSetVersion: 2, questions: (["targetAttendees", "valueOffered"] as const).map(field => ({ id: field, participantProfileField: field, prompt: `Original formal ${field} question?`, options: [], required: true, portraitQuestionToken: `formal-proof:${field}` })) }, eligibility: { allowedActions: registration ? ["cancel"] : ["register"] } } });
  }) as typeof fetch;
  let renderer!: ReactTestRenderer;
  try {
    await act(async () => { renderer = create(<EventRegistrationWorkspace actorId="actor" initialEligibility={{ state: "open", reason: "open", allowedActions: ["register"], evaluatedAt: "2026-09-17T09:00:00Z", registrationVersion: null, applicationVersion: null, policyVersion: null }} admissionControlled={false} event={{ id: "event", title: "Night", venue: "Tokyo" }} initialRegistration={null} initialAdmissionApplication={null} initialSignedQuestion={null} language="en" profile={{ displayName: "Aiko" }} />); });
    const inputs = renderer.root.findAllByType("textarea"); assert.equal(inputs.length, 2);
    await act(async () => { inputs[0].props.onChange({ target: { value: "Builders" } }); inputs[1].props.onChange({ target: { value: "Reviews" } }); });
    await act(async () => { await renderer.root.find(node => node.type === "button" && node.children.includes("Confirm registration")).props.onClick(); });
    assert.deepEqual(posts, [{ path: "/api/events/event/registration", body: { intent: "register", expectedRegistrationVersion: null, answers: { targetAttendees: "Builders", valueOffered: "Reviews" }, questionSetHash: "a".repeat(64), questionSetVersion: 2 } }]);
    assert.equal(renderer.root.findByType("main").props["data-registration-stage"], "registered");
    assert.equal(renderer.root.findAll(node => node.type === "button" && node.children.includes("Save portrait")).length, 0);
  } finally { if (renderer) await act(async () => { renderer.unmount(); }); globalThis.fetch = originalFetch; if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow); else Reflect.deleteProperty(globalThis, "window"); }
});

test("unregistered Web formal core drafts generate a private preview with trusted proofs and zero registration writes", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { addEventListener() {}, removeEventListener() {}, localStorage: { getItem: () => null } } });
  const calls: { method: string; path: string; body: any }[] = [];
  const persona = { tagline: "Unregistered private preview", seeking: "Builders", offering: "Reviews", energyStyle: "Listening", industryTags: ["Robotics"], tags: ["Hardware"], openers: ["What are you building?"], provenance: { generationMethod: "orbit-agent-model-adaptive", fallbackReason: null, model: "synthetic", provider: "synthetic" } };
  globalThis.fetch = (async (input, init) => {
    const path = String(input); calls.push({ path, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : null });
    if (path.endsWith("/portrait")) return Response.json({ success: true, data: { portrait: null } });
    if (path.includes("/registration?")) return Response.json({ success: true, data: { registration: null, questionSet: { questionSetHash: "a".repeat(64), questionSetVersion: 1, questions: (["targetAttendees", "valueOffered"] as const).map(field => ({ id: field, participantProfileField: field, prompt: `Original formal ${field} question?`, options: [], required: true, portraitQuestionToken: `formal-proof:${field}` })) } } });
    if (path.endsWith("/persona")) return Response.json({ success: true, data: { persona, generationToken: "opaque-proof", answersVersion: "b".repeat(64), sourceRegistrationVersion: null } });
    if (path.includes("/recommendations/event/")) return Response.json({ success: true, data: { state: "empty", event: { id: "event" }, recommendations: [], nextAction: "" } });
    throw new Error(`Unexpected operation ${path}`);
  }) as typeof fetch;
  let renderer!: ReactTestRenderer;
  const button = (label: string) => renderer.root.find(node => node.type === "button" && node.children.includes(label));
  try {
    await act(async () => { renderer = create(<EventRegistrationWorkspace actorId="actor" initialEligibility={{ state: "open", reason: "open", allowedActions: ["register"], evaluatedAt: "2026-09-17T09:00:00Z", registrationVersion: null, applicationVersion: null, policyVersion: null }} admissionControlled={false} event={{ id: "event", title: "Night", venue: "Tokyo" }} initialRegistration={null} initialAdmissionApplication={null} initialSignedQuestion={null} language="en" profile={{ displayName: "Aiko" }} />); });
    assert.match(JSON.stringify(renderer.toJSON()), /Original formal targetAttendees question\?/);
    const inputs = renderer.root.findAllByType("textarea"); assert.equal(inputs.length, 2);
    await act(async () => { inputs[0].props.onChange({ target: { value: "Builders" } }); inputs[1].props.onChange({ target: { value: "Reviews" } }); });
    await act(async () => { button("Build portrait").props.onClick(); });
    assert.equal(calls.filter(call => call.method === "POST").length, 0);
    await act(async () => { await button("Generate portrait").props.onClick(); });
    assert.deepEqual(calls.filter(call => call.method === "POST").map(call => call.body), [{ mode: "portrait-preview", language: "en", responses: [{ kind: "registration_question", portraitQuestionToken: "formal-proof:targetAttendees", answer: "Builders" }, { kind: "registration_question", portraitQuestionToken: "formal-proof:valueOffered", answer: "Reviews" }] }]);
    assert.match(JSON.stringify(renderer.toJSON()), /Unregistered private preview/);
    await act(async () => { button("Registration details").props.onClick(); });
    assert.deepEqual(renderer.root.findAllByType("textarea").map(input => input.props.value), ["Builders", "Reviews"]);
  } finally { if (renderer) await act(async () => { renderer.unmount(); }); globalThis.fetch = originalFetch; if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow); else Reflect.deleteProperty(globalThis, "window"); }
});

test("Web actor change cannot render the previous private portrait in the first commit or accept its late save", async () => {
  const originalFetch = globalThis.fetch;
  let actor = "first";
  let resolveSave!: (response: Response) => void;
  let saveSignal: AbortSignal | null | undefined;
  const persona = { tagline: "First actor private portrait", seeking: "Builders", offering: "Reviews", energyStyle: "Listening", industryTags: ["Robotics"], tags: ["Hardware"], openers: ["What are you building?"], provenance: { generationMethod: "orbit-agent-model-adaptive", fallbackReason: null, model: "synthetic", provider: "synthetic" } };
  let portraitReads = 0;
  globalThis.fetch = (async (input, init) => {
    const path = String(input);
    if (path.endsWith("/portrait") && init?.method === "POST") return new Promise<Response>(resolve => { resolveSave = resolve; saveSignal = init.signal; });
    if (path.endsWith("/portrait")) { portraitReads++; return Response.json({ success: true, data: { portrait: null, registrationSource: registrationSourceFixture(actor, "event", "c".repeat(64), `${actor} builders`) } }); }
    if (path.includes("/registration?")) return Response.json({ success: true, data: { registration: { eventId: "event", userId: actor, updatedAt: "2026-09-17T09:00:00Z", participantProfile: { answers: { targetAttendees: `${actor} builders`, valueOffered: "Reviews" } } }, questionSet: { questions: [] } } });
    if (path.endsWith("/persona")) return Response.json({ success: true, data: { persona, generationToken: "opaque-proof", answersVersion: "b".repeat(64), sourceRegistrationVersion: "2026-09-17T09:00:00Z" } });
    if (path.includes("/recommendations/event/")) return Response.json({ success: true, data: { state: "empty", event: { id: "event" }, recommendations: [], nextAction: "" } });
    throw new Error(`Unexpected operation ${path}`);
  }) as typeof fetch;
  let renderer!: ReactTestRenderer;
  const screen = () => <RegistrationPortraitWorkspace actorId={actor} event={{ id: "event", title: "Night", venue: "Tokyo" }} language="en"><p>Registration controls</p></RegistrationPortraitWorkspace>;
  const button = (label: string) => renderer.root.find(node => node.type === "button" && node.children.includes(label));
  try {
    await act(async () => { renderer = create(screen()); });
    await act(async () => { button("Build portrait").props.onClick(); });
    await act(async () => { await button("Generate portrait").props.onClick(); });
    const oldSave = button("Save portrait").props.onClick;
    let pending!: Promise<void>;
    await act(async () => { pending = oldSave(); });
    actor = "second";
    // Deliberately observe the committed tree before the new passive effect runs.
    renderer.update(screen());
    assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /First actor private portrait|first builders/);
    assert.equal(saveSignal?.aborted, true);
    await act(async () => { resolveSave(Response.json({ success: true, data: null })); await pending; });
    await act(async () => { await oldSave(); });
    assert.equal(portraitReads, 2, "Old save completions cannot request a readback under the new actor.");
    assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /First actor private portrait|first builders/);
  } finally { if (renderer) await act(async () => { renderer.unmount(); }); globalThis.fetch = originalFetch; }
});

test("the actual Web registration entry mounts the private session without changing its registration writer", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { addEventListener() {}, removeEventListener() {}, localStorage: { getItem: () => null } } });
  const calls: { method: string; path: string }[] = [];
  const registration: any = { id: "registration", eventId: "event", userId: "actor", updatedAt: "2026-09-17T09:00:00Z", status: "rsvped", participantProfileId: "profile", participantProfile: { id: "profile", eventId: "event", userId: "actor", answers: { targetAttendees: "Builders", valueOffered: "Reviews" } } };
  globalThis.fetch = (async (input, init) => { calls.push({ path: String(input), method: init?.method ?? "GET" }); return Response.json({ success: true, data: String(input).endsWith("/portrait") ? { portrait: null, registrationSource: registrationSourceFixture() } : { registration, questionSet: { questions: [] } } }); }) as typeof fetch;
  let renderer!: ReactTestRenderer;
  try {
    await act(async () => { renderer = create(<EventRegistrationWorkspace actorId="actor" admissionControlled={false} event={{ id: "event", title: "Night", venue: "Tokyo" }} initialRegistration={registration} initialAdmissionApplication={null} initialSignedQuestion={null} language="en" profile={{ displayName: "Aiko" }} />); });
    assert.equal(calls.length, 2);
    assert.ok(calls.every(call => call.method === "GET"));
    await act(async () => { renderer.root.find(node => node.type === "button" && node.children.includes("Build portrait")).props.onClick(); });
    assert.equal(renderer.root.findByProps({ "data-portrait-view": "interview" }).type, "section");
    assert.equal(calls.length, 2);
  } finally { globalThis.fetch = originalFetch; if (renderer) await act(async () => { renderer.unmount(); }); if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow); else Reflect.deleteProperty(globalThis, "window"); }
});

test("Web portrait keeps two original questions for full review and editing invalidates dependent drafts without registration writes", async () => {
  const originalFetch = globalThis.fetch;
  const calls: { method: string; path: string; body: any }[] = [];
  const questions = [
    { field: "targetAttendees", prompt: "First original question?", options: ["Founders", "Other"] },
    { field: "valueOffered", prompt: "Second original question?", options: ["Reviews"] },
    { field: "industry", prompt: "Current industry question?", options: [] }
  ];
  let next = 0;
  globalThis.fetch = (async (input, init) => {
    const path = String(input), method = init?.method ?? "GET";
    calls.push({ path, method, body: init?.body ? JSON.parse(String(init.body)) : null });
    if (path.includes("/registration?")) return Response.json({ success: true, data: { registration: null, questionSet: { questions: [] } } });
    if (path.endsWith("/portrait")) return Response.json({ success: true, data: { portrait: null } });
    if (path.endsWith("/interview")) { const question = questions[next++]; return Response.json({ success: true, data: { done: false, signedQuestion: { question: { ...question, acknowledgment: "Thanks.", provenance: { generationMethod: "orbit-agent-model-adaptive", fallbackReason: null, model: "synthetic", provider: "synthetic" } }, questionToken: `original:${question.field}`, portraitAdaptiveToken: `workspace:${question.field}` } } }); }
    throw new Error(`Unexpected operation ${method} ${path}`);
  }) as typeof fetch;
  let renderer!: ReactTestRenderer;
  const button = (label: string) => renderer.root.find(node => node.type === "button" && node.children.includes(label));
  try {
    await act(async () => { renderer = create(<RegistrationPortraitWorkspace actorId="actor" event={{ id: "event", title: "Night", venue: "Tokyo" }} language="en"><p>Actual registration controls</p></RegistrationPortraitWorkspace>); });
    await act(async () => { button("Build portrait").props.onClick(); });
    await act(async () => { await button("Next question").props.onClick(); });
    assert.equal(renderer.root.findAllByType("textarea").length, 0);
    await act(async () => { button("Other").props.onClick(); });
    assert.equal(button("Next question").props.disabled, true);
    await act(async () => { renderer.root.findByType("textarea").props.onChange({ target: { value: "Custom founders" } }); });
    await act(async () => { await button("Next question").props.onClick(); });
    await act(async () => { button("Reviews").props.onClick(); });
    await act(async () => { await button("Next question").props.onClick(); });
    assert.equal(calls.filter(call => call.method === "POST").length, 3);
    await act(async () => { button("All").props.onClick(); });
    const all = JSON.stringify(renderer.toJSON());
    assert.match(all, /First original question\?/); assert.match(all, /Second original question\?/);
    await act(async () => { button("Edit Who to meet").props.onClick(); });
    await act(async () => { renderer.root.findByType("textarea").props.onChange({ target: { value: "Changed partners" } }); button("Cancel").props.onClick(); });
    assert.match(JSON.stringify(renderer.toJSON()), /Custom founders/);
    await act(async () => { button("Edit Who to meet").props.onClick(); });
    await act(async () => { renderer.root.findByType("textarea").props.onChange({ target: { value: "Changed partners" } }); });
    await act(async () => { button("Keep changes").props.onClick(); });
    assert.match(JSON.stringify(renderer.toJSON()), /Changed partners/);
    assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /Second original question\?|Reviews/);
    assert.equal(calls.filter(call => call.method === "POST").length, 3, "Editing is an unsaved private draft, not an automatic model or registration write.");
    await act(async () => { button("Registration details").props.onClick(); });
    assert.match(JSON.stringify(renderer.toJSON()), /Actual registration controls/);
    assert.equal(calls.filter(call => call.method === "POST" && call.path.endsWith("/registration")).length, 0);
  } finally { globalThis.fetch = originalFetch; if (renderer) await act(async () => { renderer.unmount(); }); }
});
