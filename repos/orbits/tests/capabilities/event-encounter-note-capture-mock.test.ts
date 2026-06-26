import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

async function importProjectModule<TModule>(
  pathFromRoot: string,
): Promise<TModule> {
  const absolutePath = join(projectRoot, pathFromRoot);

  assert.equal(
    existsSync(absolutePath),
    true,
    `${pathFromRoot} must exist for the event encounter note capture mock sprint`,
  );

  return (await import(pathToFileURL(absolutePath).href)) as TModule;
}

test("event encounter note contract exposes note voice summary seed evidence fixtures and errors", async () => {
  const contract = await importProjectModule<{
    EVENT_ENCOUNTER_NOTE_ERROR_CODES: readonly string[];
    EVENT_ENCOUNTER_NOTE_ERROR_DEFINITIONS: Record<
      string,
      { appCode: string; message: string; recovery: string }
    >;
    EVENT_ENCOUNTER_NOTE_FIXTURE_SOURCE: string;
    mockEventEncounterNoteFixture: {
      state: string;
      encounter: {
        encounterId: string;
        eventId: string;
        contactId: string;
        audioUploadRequested: false;
        liveNoteStorageExecuted: false;
      };
      note: {
        kind: string;
        text: string;
        createdBy: string;
        speechToTextRequested: false;
        liveNoteStorageExecuted: false;
      };
      voiceNote: {
        status: string;
        placeholderText: string;
        speechToTextRequested: false;
        audioUploadRequested: false;
      };
      conversationSummarySeed: {
        seedId: string;
        generatedBy: string;
        aiProviderRequested: false;
      };
      evidenceDraft: {
        evidenceId: string;
        sourceLabel: string;
        createdBy: string;
        liveDatabaseWriteExecuted: false;
      };
      provenance: {
        source: string;
        evidenceIds: readonly string[];
        generationMethod: string;
        speechToTextRequested: false;
        audioUploadRequested: false;
        liveNoteStorageExecuted: false;
        externalNetworkRequested: false;
        aiProviderRequested: false;
      };
    };
    mockEmptyEventEncounterNoteFixture: {
      state: string;
      encounter: null;
      note: null;
      voiceNote: null;
      conversationSummarySeed: null;
      evidenceDraft: null;
      nextAction: string;
    };
    mockPendingEventEncounterNoteFixture: {
      state: string;
      voiceNote: {
        status: string;
        speechToTextRequested: false;
        audioUploadRequested: false;
      };
      evidenceDraft: null;
      nextAction: string;
    };
    mockEventEncounterEvidenceFixture: {
      state: string;
      eventId: string;
      encounterId: string;
      evidence: {
        evidenceId: string;
        kind: string;
        createdBy: string;
        liveDatabaseWriteExecuted: false;
      };
      provenance: {
        source: string;
        generationMethod: string;
        liveDatabaseWriteExecuted: false;
      };
    };
  }>("features/events/encounter-contract.ts");
  const serviceModule = await importProjectModule<{
    createMockEventEncounterNoteService: () => {
      createEncounterNote: (input?: {
        eventId?: string | null;
        contactId?: string | null;
        noteText?: string | null;
        scenario?: string | null;
      }) => {
        success: boolean;
        data?: typeof contract.mockEventEncounterNoteFixture;
        error?: { code: string; appCode: string };
      };
      createEncounterEvidence: (input?: {
        eventId?: string | null;
        encounterId?: string | null;
        scenario?: string | null;
      }) => {
        success: boolean;
        data?: typeof contract.mockEventEncounterEvidenceFixture;
        error?: { code: string; appCode: string };
      };
    };
  }>("features/events/mock-encounter-service.ts");

  const service = serviceModule.createMockEventEncounterNoteService();
  const success = service.createEncounterNote({
    contactId: "contact:priya-shah",
    eventId: "demo-event-1",
    noteText: "Priya asked for a storage pilot introduction.",
  });
  const evidence = service.createEncounterEvidence({
    encounterId: "demo-encounter-1",
    eventId: "demo-event-1",
  });
  const empty = service.createEncounterNote({
    eventId: "demo-event-1",
    scenario: "empty",
  });
  const pending = service.createEncounterNote({
    eventId: "demo-event-1",
    scenario: "pending",
  });
  const failure = service.createEncounterNote({
    eventId: "demo-event-1",
    scenario: "failure",
  });
  const missingEvent = service.createEncounterNote({
    eventId: "missing-event",
  });
  const missingEncounter = service.createEncounterEvidence({
    encounterId: "",
    eventId: "demo-event-1",
  });

  assert.deepEqual(contract.EVENT_ENCOUNTER_NOTE_ERROR_CODES, [
    "EVENT_ENCOUNTER_NOTE_EVENT_ID_REQUIRED",
    "EVENT_ENCOUNTER_NOTE_EVENT_NOT_FOUND",
    "EVENT_ENCOUNTER_NOTE_ENCOUNTER_ID_REQUIRED",
    "EVENT_ENCOUNTER_NOTE_EMPTY",
    "EVENT_ENCOUNTER_NOTE_PENDING",
    "EVENT_ENCOUNTER_NOTE_MOCK_FAILED",
  ]);
  assert.equal(
    contract.EVENT_ENCOUNTER_NOTE_ERROR_DEFINITIONS
      .EVENT_ENCOUNTER_NOTE_MOCK_FAILED.appCode,
    "SERVICE_UNAVAILABLE",
  );
  assert.match(
    contract.EVENT_ENCOUNTER_NOTE_ERROR_DEFINITIONS
      .EVENT_ENCOUNTER_NOTE_PENDING.recovery,
    /speech-to-text|audio upload|live note storage/i,
  );

  assert.equal(success.success, true);
  assert.equal(success.data?.state, "success");
  assert.equal(success.data?.encounter.encounterId, "demo-encounter-1");
  assert.equal(success.data?.encounter.eventId, "demo-event-1");
  assert.equal(success.data?.encounter.contactId, "contact:priya-shah");
  assert.equal(success.data?.encounter.audioUploadRequested, false);
  assert.equal(success.data?.encounter.liveNoteStorageExecuted, false);
  assert.equal(success.data?.note.kind, "typed_note");
  assert.match(success.data?.note.text ?? "", /storage pilot/i);
  assert.equal(success.data?.note.createdBy, "mock-encounter-note-service");
  assert.equal(success.data?.note.speechToTextRequested, false);
  assert.equal(success.data?.note.liveNoteStorageExecuted, false);
  assert.equal(success.data?.voiceNote.status, "placeholder");
  assert.equal(success.data?.voiceNote.speechToTextRequested, false);
  assert.equal(success.data?.voiceNote.audioUploadRequested, false);
  assert.equal(
    success.data?.conversationSummarySeed.generatedBy,
    "mock-encounter-note-rules",
  );
  assert.equal(success.data?.conversationSummarySeed.aiProviderRequested, false);
  assert.equal(success.data?.evidenceDraft.createdBy, "mock-encounter-note-service");
  assert.equal(success.data?.evidenceDraft.liveDatabaseWriteExecuted, false);
  assert.equal(
    success.data?.provenance.source,
    contract.EVENT_ENCOUNTER_NOTE_FIXTURE_SOURCE,
  );
  assert.equal(success.data?.provenance.speechToTextRequested, false);
  assert.equal(success.data?.provenance.audioUploadRequested, false);
  assert.equal(success.data?.provenance.liveNoteStorageExecuted, false);
  assert.equal(success.data?.provenance.externalNetworkRequested, false);
  assert.equal(success.data?.provenance.aiProviderRequested, false);

  assert.equal(evidence.success, true);
  assert.equal(evidence.data?.state, "success");
  assert.equal(evidence.data?.eventId, "demo-event-1");
  assert.equal(evidence.data?.encounterId, "demo-encounter-1");
  assert.equal(evidence.data?.evidence.kind, "encounter_note");
  assert.equal(evidence.data?.evidence.createdBy, "mock-encounter-note-service");
  assert.equal(evidence.data?.evidence.liveDatabaseWriteExecuted, false);
  assert.equal(evidence.data?.provenance.liveDatabaseWriteExecuted, false);

  assert.equal(empty.success, true);
  assert.equal(empty.data?.state, "empty");
  assert.equal(empty.data?.encounter, null);
  assert.equal(empty.data?.evidenceDraft, null);
  assert.match(contract.mockEmptyEventEncounterNoteFixture.nextAction, /Capture/i);
  assert.equal(pending.success, true);
  assert.equal(pending.data?.state, "pending");
  assert.equal(pending.data?.voiceNote.status, "placeholder");
  assert.equal(pending.data?.evidenceDraft, null);
  assert.equal(failure.success, false);
  assert.equal(failure.error?.code, "EVENT_ENCOUNTER_NOTE_MOCK_FAILED");
  assert.equal(failure.error?.appCode, "SERVICE_UNAVAILABLE");
  assert.equal(missingEvent.success, false);
  assert.equal(missingEvent.error?.code, "EVENT_ENCOUNTER_NOTE_EVENT_NOT_FOUND");
  assert.equal(missingEncounter.success, false);
  assert.equal(
    missingEncounter.error?.code,
    "EVENT_ENCOUNTER_NOTE_ENCOUNTER_ID_REQUIRED",
  );
});

test("mock event encounter note service is deterministic and never calls live providers", async () => {
  const serviceModule = await importProjectModule<{
    createMockEventEncounterNoteService: () => {
      createEncounterNote: (input?: {
        eventId?: string | null;
        contactId?: string | null;
        noteText?: string | null;
        scenario?: string | null;
      }) => unknown;
      createEncounterEvidence: (input?: {
        eventId?: string | null;
        encounterId?: string | null;
        scenario?: string | null;
      }) => unknown;
    };
  }>("features/events/mock-encounter-service.ts");
  const service = serviceModule.createMockEventEncounterNoteService();
  const noteInput = {
    contactId: "contact:priya-shah",
    eventId: "demo-event-1",
    noteText: "Priya asked for a storage pilot introduction.",
  };
  const evidenceInput = {
    encounterId: "demo-encounter-1",
    eventId: "demo-event-1",
  };

  assert.deepEqual(
    service.createEncounterNote(noteInput),
    service.createEncounterNote(noteInput),
  );
  assert.deepEqual(
    service.createEncounterEvidence(evidenceInput),
    service.createEncounterEvidence(evidenceInput),
  );
  assert.deepEqual(
    service.createEncounterNote({
      ...noteInput,
      scenario: "unknown-scenario",
    }),
    service.createEncounterNote(noteInput),
  );

  for (const filePath of [
    "features/events/encounter-contract.ts",
    "features/events/mock-encounter-service.ts",
    "app/api/events/[id]/encounters/route.ts",
    "app/api/events/[id]/encounters/[encounterId]/evidence/route.ts",
    "features/events/event-encounter-note-capture-mock/debug-view.tsx",
  ]) {
    const source = readFileSync(join(projectRoot, filePath), "utf8");

    assert.doesNotMatch(source, /\bfetch\s*\(/);
    assert.doesNotMatch(source, /Supabase|createClient|OAuth/i);
    assert.doesNotMatch(source, /XMLHttpRequest|WebSocket|EventSource/);
    assert.doesNotMatch(source, /navigator|mediaDevices|localStorage|indexedDB/);
    assert.doesNotMatch(
      source,
      /from ["']node:(net|http|https)["']|require\(["']node:(net|http|https)["']\)/,
    );
    assert.doesNotMatch(source, /openai|anthropic|ai provider/i);
  }
});

test("event encounter note API routes return stable envelopes with empty and failure paths", async () => {
  const encounterRoute = await importProjectModule<{
    POST: (
      request: Request,
      context: { params: Promise<{ id: string }> },
    ) => Promise<Response>;
  }>("app/api/events/[id]/encounters/route.ts");
  const evidenceRoute = await importProjectModule<{
    POST: (
      request: Request,
      context: { params: Promise<{ id: string; encounterId: string }> },
    ) => Promise<Response>;
  }>("app/api/events/[id]/encounters/[encounterId]/evidence/route.ts");
  const fixtures = await importProjectModule<{
    mockEventEncounterNoteFixture: unknown;
    mockEmptyEventEncounterNoteFixture: unknown;
    mockEventEncounterEvidenceFixture: unknown;
  }>("features/events/encounter-contract.ts");

  const encounterResponse = await encounterRoute.POST(
    new Request("https://orbit.local/api/events/demo-event-1/encounters", {
      body: JSON.stringify({
        contactId: "contact:priya-shah",
        noteText: "Priya asked for a storage pilot introduction.",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
    {
      params: Promise.resolve({ id: "demo-event-1" }),
    },
  );
  const evidenceResponse = await evidenceRoute.POST(
    new Request(
      "https://orbit.local/api/events/demo-event-1/encounters/demo-encounter-1/evidence",
      {
        body: JSON.stringify({ evidenceKind: "encounter_note" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      },
    ),
    {
      params: Promise.resolve({
        encounterId: "demo-encounter-1",
        id: "demo-event-1",
      }),
    },
  );
  const emptyEncounterResponse = await encounterRoute.POST(
    new Request(
      "https://orbit.local/api/events/demo-event-1/encounters?scenario=empty",
      {
        method: "POST",
      },
    ),
    {
      params: Promise.resolve({ id: "demo-event-1" }),
    },
  );
  const failureEncounterResponse = await encounterRoute.POST(
    new Request(
      "https://orbit.local/api/events/demo-event-1/encounters?scenario=failure",
      {
        method: "POST",
      },
    ),
    {
      params: Promise.resolve({ id: "demo-event-1" }),
    },
  );
  const emptyEvidenceResponse = await evidenceRoute.POST(
    new Request(
      "https://orbit.local/api/events/demo-event-1/encounters/demo-encounter-1/evidence?scenario=empty",
      {
        method: "POST",
      },
    ),
    {
      params: Promise.resolve({
        encounterId: "demo-encounter-1",
        id: "demo-event-1",
      }),
    },
  );
  const pendingEvidenceResponse = await evidenceRoute.POST(
    new Request(
      "https://orbit.local/api/events/demo-event-1/encounters/demo-encounter-1/evidence?scenario=pending",
      {
        method: "POST",
      },
    ),
    {
      params: Promise.resolve({
        encounterId: "demo-encounter-1",
        id: "demo-event-1",
      }),
    },
  );
  const failureEvidenceResponse = await evidenceRoute.POST(
    new Request(
      "https://orbit.local/api/events/demo-event-1/encounters/demo-encounter-1/evidence?scenario=failure",
      {
        method: "POST",
      },
    ),
    {
      params: Promise.resolve({
        encounterId: "demo-encounter-1",
        id: "demo-event-1",
      }),
    },
  );

  assert.equal(encounterResponse.status, 201);
  assert.equal(encounterResponse.headers.get("cache-control"), "no-store");
  assert.equal(encounterResponse.headers.get("x-orbit-feature-mode"), "mock");
  assert.deepEqual(await encounterResponse.json(), {
    success: true,
    data: fixtures.mockEventEncounterNoteFixture,
  });

  assert.equal(evidenceResponse.status, 201);
  assert.equal(evidenceResponse.headers.get("cache-control"), "no-store");
  assert.equal(evidenceResponse.headers.get("x-orbit-feature-mode"), "mock");
  assert.deepEqual(await evidenceResponse.json(), {
    success: true,
    data: fixtures.mockEventEncounterEvidenceFixture,
  });

  assert.equal(emptyEncounterResponse.status, 200);
  assert.deepEqual(await emptyEncounterResponse.json(), {
    success: true,
    data: fixtures.mockEmptyEventEncounterNoteFixture,
  });

  assert.equal(failureEncounterResponse.status, 503);
  assert.deepEqual(await failureEncounterResponse.json(), {
    success: false,
    error: {
      code: "SERVICE_UNAVAILABLE",
      message:
        "The mock event encounter note capture boundary is pinned to a controlled failure scenario.",
      context: {
        boundary: "developer-admin",
        eventEncounterNoteErrorCode: "EVENT_ENCOUNTER_NOTE_MOCK_FAILED",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock event encounter note failure came from deterministic fixture rules.",
        service: "event-encounter-note-capture-mock",
      },
    },
  });

  assert.equal(emptyEvidenceResponse.status, 400);
  assert.deepEqual(await emptyEvidenceResponse.json(), {
    success: false,
    error: {
      code: "VALIDATION_ERROR",
      message: "The mock encounter note has no typed or voice-note content.",
      context: {
        boundary: "developer-admin",
        eventEncounterNoteErrorCode: "EVENT_ENCOUNTER_NOTE_EMPTY",
        mode: "mock",
        privacy: "demo-event-encounter-note-only",
        provenance: "fixture:features/events/encounter-contract.ts",
        service: "event-encounter-note-capture-mock",
      },
    },
  });

  assert.equal(pendingEvidenceResponse.status, 409);
  assert.deepEqual(await pendingEvidenceResponse.json(), {
    success: false,
    error: {
      code: "CONFLICT",
      message:
        "The mock encounter note is waiting on a voice-note placeholder review.",
      context: {
        boundary: "developer-admin",
        eventEncounterNoteErrorCode: "EVENT_ENCOUNTER_NOTE_PENDING",
        mode: "mock",
        privacy: "demo-event-encounter-note-only",
        provenance: "fixture:features/events/encounter-contract.ts",
        service: "event-encounter-note-capture-mock",
      },
    },
  });

  assert.equal(failureEvidenceResponse.status, 503);
  assert.deepEqual(await failureEvidenceResponse.json(), {
    success: false,
    error: {
      code: "SERVICE_UNAVAILABLE",
      message:
        "The mock event encounter note capture boundary is pinned to a controlled failure scenario.",
      context: {
        boundary: "developer-admin",
        eventEncounterNoteErrorCode: "EVENT_ENCOUNTER_NOTE_MOCK_FAILED",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock event encounter note failure came from deterministic fixture rules.",
        service: "event-encounter-note-capture-mock",
      },
    },
  });
});

test("event encounter note debug route renders all states and the live replacement handoff", async () => {
  const debugView = await importProjectModule<{
    EVENT_ENCOUNTER_NOTE_CAPTURE_MOCK_SLUG: string;
    EventEncounterNoteCaptureMockDemo: () => React.ReactElement;
  }>("features/events/event-encounter-note-capture-mock/debug-view.tsx");
  const html = renderToStaticMarkup(
    React.createElement(debugView.EventEncounterNoteCaptureMockDemo),
  );
  const pageSource = readFileSync(
    join(projectRoot, "app/dev/capabilities/[slug]/page.tsx"),
    "utf8",
  );
  const liveDocPath =
    "features/events/event-encounter-note-capture-mock/LIVE_IMPLEMENTATION.md";
  const liveDoc = readFileSync(join(projectRoot, liveDocPath), "utf8");

  assert.equal(
    debugView.EVENT_ENCOUNTER_NOTE_CAPTURE_MOCK_SLUG,
    "event-encounter-note-capture-mock",
  );
  assert.match(pageSource, /EVENT_ENCOUNTER_NOTE_CAPTURE_MOCK_SLUG/);
  assert.match(pageSource, /EventEncounterNoteCaptureMockDemo/);

  assert.match(html, /Event encounter note capture mock/);
  assert.match(html, /aria-label="Event encounter note operator checkpoint"/);
  assert.match(html, /Ready for verifier review/);
  assert.match(html, /aria-label="Event encounter note state comparison"/);
  assert.match(html, /Compare success, empty, pending, and failure outcomes/);
  assert.match(html, /Captured note/);
  assert.match(html, /No encounter note/);
  assert.match(html, /Voice placeholder waiting/);
  assert.match(html, /Controlled failure/);
  assert.match(html, /Success state/);
  assert.match(html, /Empty state/);
  assert.match(html, /Pending state/);
  assert.match(html, /Failure state/);
  assert.match(html, /Voice-note placeholder/);
  assert.match(html, /Conversation summary seed/);
  assert.match(html, /Evidence creation/);
  assert.match(html, /Climate founders dinner/);
  assert.match(html, /Priya Shah/);
  assert.match(html, /storage pilot introduction/);
  assert.match(html, /speech-to-text false/);
  assert.match(html, /audio upload false/);
  assert.match(html, /live note storage false/);
  assert.match(html, /EVENT_ENCOUNTER_NOTE_MOCK_FAILED/);
  assert.match(html, /POST \/api\/events\/demo-event-1\/encounters/);
  assert.match(
    html,
    /POST \/api\/events\/demo-event-1\/encounters\/demo-encounter-1\/evidence/,
  );
  assert.match(
    html,
    /POST \/api\/events\/demo-event-1\/encounters\/demo-encounter-1\/evidence\?scenario=empty/,
  );
  assert.match(
    html,
    /POST \/api\/events\/demo-event-1\/encounters\/demo-encounter-1\/evidence\?scenario=pending/,
  );
  assert.match(
    html,
    /POST \/api\/events\/demo-event-1\/encounters\/demo-encounter-1\/evidence\?scenario=failure/,
  );
  assert.match(html, new RegExp(liveDocPath));
  assert.match(html, /ORBIT_EVENT_ENCOUNTER_NOTE_PROVIDER/);
  assert.match(html, /event-encounter-note-workbench/);
  assert.match(
    html,
    /\.event-encounter-note-workbench\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
  );

  assert.match(
    liveDoc,
    /features\/events\/event-encounter-note-capture-mock\/live-service\.ts/,
  );
  assert.match(
    liveDoc,
    /features\/events\/event-encounter-note-capture-mock\/providers\//,
  );
  assert.match(liveDoc, /ORBIT_EVENT_ENCOUNTER_NOTE_PROVIDER/);
  assert.match(liveDoc, /speech-to-text/i);
  assert.match(liveDoc, /audio upload/i);
  assert.match(liveDoc, /live note storage/i);
  assert.match(liveDoc, /required environment variables/i);
  assert.match(liveDoc, /permissions/i);
  assert.match(liveDoc, /privacy/i);
  assert.match(liveDoc, /provenance/i);
  assert.match(liveDoc, /replacement tests/i);
});
