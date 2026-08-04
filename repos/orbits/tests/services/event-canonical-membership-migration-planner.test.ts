import assert from "node:assert/strict";
import test from "node:test";

import type { EventRegistration } from "../../features/events/registration/contract";
import type {
  CanonicalMembershipMigrationEventFact,
  CanonicalMembershipOperatorManifest,
} from "../../features/events/registration/canonical-migration/contract";
import { parseCanonicalMembershipOperatorManifest } from "../../features/events/registration/canonical-migration/operator-manifest";
import { buildCanonicalMembershipMigrationPlan } from "../../features/events/registration/canonical-migration/planner";

const canonicalEventIds = [
  "event_signup_01",
  "event:e2e:orbit-connection-night",
] as const;
const legacyEventIds = [
  "demo-event-1",
  "demo-event-2",
  "event_01",
  "event_02",
  "event_03",
  "event_04",
  "event_05",
  "event_06",
  "event_07",
  "event_08",
  "event_09",
  "event_10",
  "event_signup_02",
  "event_signup_03",
  "event:live-record:20260729",
  "event:live-record:runtime-evidence-forum",
  "event:manual:founder-investor-salon",
] as const;

function registration(input: {
  eventId: string;
  index: number;
  status: "cancelled" | "rsvped";
  withAdaptiveResponse?: boolean;
}): EventRegistration {
  const userId = `actor:${input.eventId}:${input.index}`;
  const participantProfileId = `event-participant-profile:${encodeURIComponent(input.eventId)}:${encodeURIComponent(userId)}`;
  const answeredAt = `2026-08-04T${String(10 + (input.index % 10)).padStart(2, "0")}:00:00.000Z`;
  const desiredOutcome = `Build partnership path ${input.index} for ${input.eventId}`;
  return {
    cancelledAt: input.status === "cancelled" ? "2026-08-05T10:00:00.000Z" : null,
    eventId: input.eventId,
    id: `event-registration:${encodeURIComponent(input.eventId)}:${encodeURIComponent(userId)}`,
    participantProfile: {
      answers: {
        desiredOutcome,
        energyStyle: input.index % 2 === 0 ? "Structured small group" : "Focused one-to-one",
        experienceHighlight: `Led market launch ${input.index} across APAC`,
        industry: input.index % 2 === 0 ? "Climate hardware" : "Industrial AI",
        positioning: `Founder ${input.index} building cross-border infrastructure`,
        targetAttendees: "Operators, investors, and technical partners",
        valueOffered: `Pilot design and market evidence ${input.index}`,
      },
      createdAt: answeredAt,
      displayName: `Participant ${input.eventId} ${input.index}`,
      eventId: input.eventId,
      id: participantProfileId,
      interviewResponses: input.withAdaptiveResponse
        ? [
            {
              answer: {
                customText: desiredOutcome,
                displayText: desiredOutcome,
                selectedOptionIds: [],
              },
              answerSource: "participant",
              answeredAt,
              field: "desiredOutcome",
              generation: {
                method: "orbit-agent-model-adaptive",
                model: "gpt-5.6",
                promptVersion: 3,
                provider: "openai",
              },
              question: {
                fieldLabel: { en: "Desired outcome", zh: "期待结果" },
                inputKind: "single_choice_with_custom",
                language: "en",
                options: [
                  { id: "pilot", label: "Find a pilot partner" },
                  { id: "capital", label: "Meet investors" },
                ],
                prompt: "What concrete outcome would make this event valuable?",
              },
              questionId: `question:${input.index}`,
              questionSource: "ai_adaptive",
              responseId: `response:${input.index}`,
              visibility: "matching_only",
            },
          ]
        : undefined,
      updatedAt: answeredAt,
      userId,
    },
    participantProfileId,
    reactivatedAt: null,
    registeredAt: answeredAt,
    sideEffects: {
      calendarUpdateExecuted: false,
      emailSent: false,
      globalProfileWriteExecuted: false,
      notificationDelivered: false,
      organizerMessageSent: false,
      refundRequested: false,
    },
    status: input.status,
    updatedAt:
      input.status === "cancelled" ? "2026-08-05T10:00:00.000Z" : answeredAt,
    userId,
  };
}

function registrations(
  eventId: string,
  rsvped: number,
  cancelled: number,
): readonly EventRegistration[] {
  return [
    ...Array.from({ length: rsvped }, (_, index) =>
      registration({
        eventId,
        index,
        status: "rsvped",
        withAdaptiveResponse: index === 0,
      }),
    ),
    ...Array.from({ length: cancelled }, (_, offset) =>
      registration({ eventId, index: rsvped + offset, status: "cancelled" }),
    ),
  ];
}

function inventory(values: readonly EventRegistration[]) {
  return {
    invalidRegistrationCount: 0,
    rawRegistrationCount: values.length,
    registrations: values,
    validRegistrationCount: values.length,
  };
}

function facts(): readonly CanonicalMembershipMigrationEventFact[] {
  const legacyCounts: Readonly<Record<string, readonly [number, number]>> = {
    event_01: [0, 1],
    event_signup_02: [1, 0],
    event_signup_03: [1, 0],
    "event:live-record:20260729": [0, 1],
  };
  const firstCanonical = registrations(canonicalEventIds[0], 64, 6);
  const secondCanonical = registrations(canonicalEventIds[1], 64, 6);
  return [
    {
      activationBaselineValid: true,
      authority: "canonical_membership",
      configurationDeadline: {
        configurationVersion: 2,
        profileEditDeadlineAt: "2026-08-04T05:56:00.000Z",
      },
      contentHash: "core-content-signup-01",
      eventId: canonicalEventIds[0],
      eventVersion: 1,
      ...inventory(firstCanonical),
    },
    {
      activationBaselineValid: true,
      authority: "canonical_membership",
      configurationDeadline: {
        configurationVersion: 2,
        profileEditDeadlineAt: "2026-08-03T12:25:00.000Z",
      },
      contentHash: "core-content-e2e",
      eventId: canonicalEventIds[1],
      eventVersion: 1,
      ...inventory(secondCanonical),
    },
    ...legacyEventIds.map((eventId, index) => {
      const [rsvped, cancelled] = legacyCounts[eventId] ?? [0, 0];
      const values = registrations(eventId, rsvped, cancelled);
      return {
        authority: "legacy_registration" as const,
        configurationDeadline: null,
        contentHash: `core-content-legacy-${index}`,
        eventId,
        eventVersion: 1,
        ...inventory(values),
      };
    }),
  ];
}

function manifestFor(eventIds: readonly string[]): CanonicalMembershipOperatorManifest {
  return {
    events: Object.fromEntries(
      eventIds.map((eventId, index) => [
        eventId,
        {
          evidenceId: `operator-manifest:event:${eventId}`,
          profileEditDeadlineAt: `2026-08-${String(10 + (index % 10)).padStart(2, "0")}T10:00:00.000Z`,
          source: "operator_manifest" as const,
        },
      ]),
    ),
    schemaVersion: 1,
  };
}

test("planner covers all 19 Event Core events and blocks every legacy zero event without deadline evidence", () => {
  const parsedManifest = parseCanonicalMembershipOperatorManifest({
    events: {},
    schemaVersion: 1,
  });
  const plan = buildCanonicalMembershipMigrationPlan({
    facts: facts(),
    parsedManifest,
  });

  assert.equal(plan.eventCount, 19);
  assert.equal(plan.events.filter((event) => event.action === "verify_canonical").length, 2);
  assert.equal(plan.events.filter((event) => event.action === "blocked").length, 17);
  assert.equal(
    plan.blockers.filter((value) => value.code === "MISSING_PROFILE_EDIT_DEADLINE")
      .length,
    17,
  );
  assert.deepEqual(plan.total, {
    cancelled: 14,
    invalidRegistrations: 0,
    registrations: 144,
    rsvped: 130,
    validRegistrations: 144,
  });
  assert.equal(plan.applyEligible, false);
  assert.equal(plan.applyPlanHash, null);
  assert.match(plan.diagnosticHash, /^[a-f0-9]{64}$/u);
  assert.match(plan.eventCoreHash, /^[a-f0-9]{64}$/u);
  assert.ok(
    plan.events.every(
      (event) =>
        event.source.rsvped + event.source.cancelled === event.source.validCount &&
        event.source.validCount + event.source.invalidCount === event.source.rawCount,
    ),
  );
  assert.ok(
    plan.events
      .filter((event) => event.currentState === "canonical")
      .every((event) => event.deadline === null),
    "canonical verification must not hash mutable current configuration deadlines",
  );
  assert.deepEqual(
    plan.events
      .filter((event) => event.authority === "legacy_registration" && event.source.rawCount > 0)
      .map((event) => [event.eventId, event.source.rsvped, event.source.cancelled]),
    [
      ["event_01", 0, 1],
      ["event_signup_02", 1, 0],
      ["event_signup_03", 1, 0],
      ["event:live-record:20260729", 0, 1],
    ],
  );
  assert.deepEqual(
    plan.events
      .filter((event) => event.authority === "canonical_membership")
      .map((event) => [event.eventId, event.source.rsvped, event.source.cancelled]),
    [
      ["event_signup_01", 64, 6],
      ["event:e2e:orbit-connection-night", 64, 6],
    ],
  );
});

test("complete manifest is eligible and hashes are stable across fact and registration order", () => {
  const completeManifest = manifestFor(legacyEventIds);
  const parsedManifest = parseCanonicalMembershipOperatorManifest(
    completeManifest,
  );
  const first = buildCanonicalMembershipMigrationPlan({ facts: facts(), parsedManifest });
  const reorderedFacts = [...facts()]
    .reverse()
    .map((fact) => ({ ...fact, registrations: [...fact.registrations].reverse() }));
  const second = buildCanonicalMembershipMigrationPlan({
    facts: reorderedFacts,
    parsedManifest: parseCanonicalMembershipOperatorManifest(
      JSON.stringify({
        events: Object.fromEntries(
          Object.entries(completeManifest.events).reverse(),
        ),
        schemaVersion: 1,
      }),
    ),
  });
  assert.equal(first.applyEligible, true);
  assert.match(first.applyPlanHash ?? "", /^[a-f0-9]{64}$/u);
  assert.equal(second.applyPlanHash, first.applyPlanHash);
  assert.equal(second.diagnosticHash, first.diagnosticHash);
  assert.equal(second.eventCoreHash, first.eventCoreHash);
  assert.equal(second.manifestHash, first.manifestHash);

  const utc = parseCanonicalMembershipOperatorManifest({
    events: {
      event_01: {
        evidenceId: "operator-manifest:event:event_01",
        profileEditDeadlineAt: "2026-08-10T10:00:00.000Z",
        source: "operator_manifest",
      },
    },
    schemaVersion: 1,
  });
  const offset = parseCanonicalMembershipOperatorManifest({
    events: {
      event_01: {
        evidenceId: "operator-manifest:event:event_01",
        profileEditDeadlineAt: "2026-08-10T19:00:00+09:00",
        source: "operator_manifest",
      },
    },
    schemaVersion: 1,
  });
  assert.equal(
    offset.manifest?.events.event_01?.profileEditDeadlineAt,
    "2026-08-10T10:00:00.000Z",
  );
  assert.equal(offset.manifestHash, utc.manifestHash);

  const contaminatedFacts = facts().map((fact) =>
    fact.authority === "canonical_membership"
      ? ({ ...fact, legacyProjection: { changed: "fixed-stale-value" } } as typeof fact)
      : fact,
  );
  assert.equal(
    buildCanonicalMembershipMigrationPlan({
      facts: contaminatedFacts,
      parsedManifest,
    }).applyPlanHash,
    first.applyPlanHash,
    "canonical fact hashing must ignore fields outside its closed planner contract",
  );
});

test("missing, extra, unknown, and malformed manifests aggregate deterministic blockers", () => {
  const missing = buildCanonicalMembershipMigrationPlan({
    facts: facts(),
    parsedManifest: parseCanonicalMembershipOperatorManifest(
      manifestFor(legacyEventIds.slice(1)),
    ),
  });
  assert.equal(
    missing.blockers.filter((value) => value.code === "MISSING_PROFILE_EDIT_DEADLINE")
      .length,
    1,
  );

  const extraManifest = manifestFor([
    ...legacyEventIds,
    canonicalEventIds[0],
    "event:unknown",
  ]);
  const extra = buildCanonicalMembershipMigrationPlan({
    facts: facts(),
    parsedManifest: parseCanonicalMembershipOperatorManifest(extraManifest),
  });
  assert.ok(extra.blockers.some((value) => value.code === "MANIFEST_ENTRY_EXTRA"));
  assert.ok(extra.blockers.some((value) => value.code === "MANIFEST_EVENT_UNKNOWN"));
  assert.equal(extra.applyPlanHash, null);

  const invalid = buildCanonicalMembershipMigrationPlan({
    facts: facts(),
    parsedManifest: parseCanonicalMembershipOperatorManifest({
      events: {
        event_01: {
          evidenceId: "evidence:event_01",
          extra: true,
          profileEditDeadlineAt: "2026-08-10T10:00:00+09:00",
          source: "operator_manifest",
        },
      },
      schemaVersion: 1,
    }),
  });
  assert.ok(invalid.blockers.some((value) => value.code === "MANIFEST_ENTRY_INVALID"));
  assert.equal(invalid.applyPlanHash, null);
  assert.equal(
    invalid.diagnosticHash,
    buildCanonicalMembershipMigrationPlan({
      facts: facts(),
      parsedManifest: parseCanonicalMembershipOperatorManifest({
        events: {
          event_01: {
            evidenceId: "evidence:event_01",
            extra: true,
            profileEditDeadlineAt: "2026-08-10T10:00:00+09:00",
            source: "operator_manifest",
          },
        },
        schemaVersion: 1,
      }),
    }).diagnosticHash,
  );
});

test("duplicate facts select a stable identity independent of input order", () => {
  const base = facts().find((fact) => fact.eventId === "event_01")!;
  const changed: CanonicalMembershipMigrationEventFact = {
    ...base,
    contentHash: "different-event-core-content",
    eventVersion: 2,
    ...inventory(registrations("event_01", 1, 0)),
  };
  const parsedManifest = parseCanonicalMembershipOperatorManifest(
    manifestFor(["event_01"]),
  );
  const first = buildCanonicalMembershipMigrationPlan({
    facts: [base, changed],
    parsedManifest,
  });
  const second = buildCanonicalMembershipMigrationPlan({
    facts: [changed, base],
    parsedManifest,
  });
  assert.ok(first.blockers.some((value) => value.code === "EVENT_FACT_DUPLICATE"));
  assert.equal(first.applyPlanHash, null);
  assert.equal(second.applyPlanHash, null);
  assert.equal(second.eventCoreHash, first.eventCoreHash);
  assert.equal(second.diagnosticHash, first.diagnosticHash);
  assert.deepEqual(second.events, first.events);
});

test("fractional or inconsistent source inventory fails closed before apply hashing", () => {
  const base = facts().find((fact) => fact.eventId === "event_01")!;
  const malformed: CanonicalMembershipMigrationEventFact = {
    ...base,
    invalidRegistrationCount: 0.5,
    rawRegistrationCount: base.validRegistrationCount + 0.5,
  };
  const plan = buildCanonicalMembershipMigrationPlan({
    facts: [malformed],
    parsedManifest: parseCanonicalMembershipOperatorManifest(
      manifestFor(["event_01"]),
    ),
  });
  assert.equal(plan.events[0]?.action, "blocked");
  assert.ok(
    plan.events[0]?.blockers.some(
      (value) => value.code === "REGISTRATION_INVENTORY_INVALID",
    ),
  );
  assert.equal(plan.applyPlanHash, null);
});

test("manifest parser validates RFC3339 calendar fields and preserves valid offsets", () => {
  const invalidTimestamps = [
    "2026-02-30T10:00:00.000Z",
    "2025-02-29T10:00:00.000Z",
    "2026-08-10T24:00:00.000Z",
    "2026-08-10T10:60:00.000Z",
    "2026-08-10T10:00:00+24:00",
    "2026-08-10T10:00:00+09:60",
    "2026-08-10T10:00:00.1234Z",
  ];
  for (const profileEditDeadlineAt of invalidTimestamps) {
    const parsed = parseCanonicalMembershipOperatorManifest({
      events: {
        event_01: {
          evidenceId: "operator-manifest:event:event_01",
          profileEditDeadlineAt,
          source: "operator_manifest",
        },
      },
      schemaVersion: 1,
    });
    assert.ok(
      parsed.blockers.some((value) => value.code === "MANIFEST_ENTRY_INVALID"),
      profileEditDeadlineAt,
    );
  }

  const leapDay = parseCanonicalMembershipOperatorManifest({
    events: {
      event_01: {
        evidenceId: "operator-manifest:event:event_01",
        profileEditDeadlineAt: "2024-02-29T19:00:00+09:00",
        source: "operator_manifest",
      },
    },
    schemaVersion: 1,
  });
  assert.deepEqual(leapDay.blockers, []);
  assert.equal(
    leapDay.manifest?.events.event_01?.profileEditDeadlineAt,
    "2024-02-29T10:00:00.000Z",
  );
});

test("manifest parser rejects decoded duplicate keys at every accepted object level", () => {
  for (const source of [
    '{"events":{},"events":{},"schemaVersion":1}',
    '{"events":{"event_01":{"evidenceId":"first","evidenceId":"second","profileEditDeadlineAt":"2026-08-10T10:00:00.000Z","source":"operator_manifest"}},"schemaVersion":1}',
    '{"events":{"event_01":{"evidenceId":"first","profileEditDeadlineAt":"2026-08-10T10:00:00.000Z","source":"operator_manifest"},"\\u0065vent_01":{"evidenceId":"second","profileEditDeadlineAt":"2026-08-10T10:00:00.000Z","source":"operator_manifest"}},"schemaVersion":1}',
  ]) {
    const parsed = parseCanonicalMembershipOperatorManifest(source);
    assert.equal(parsed.manifest, null);
    assert.deepEqual(parsed.blockers.map((value) => value.code), ["MANIFEST_JSON_INVALID"]);
  }
});

test("manifest preserves prototype-named event ids and binds them into plan hashes", () => {
  const source = (evidenceId: string) =>
    JSON.stringify({
      events: {
        __proto__: null,
      },
      schemaVersion: 1,
    }).replace(
      '"events":{}',
      `"events":{"__proto__":{"evidenceId":${JSON.stringify(evidenceId)},"profileEditDeadlineAt":"2026-08-10T10:00:00.000Z","source":"operator_manifest"},"constructor":{"evidenceId":"operator-manifest:event:constructor","profileEditDeadlineAt":"2026-08-11T10:00:00.000Z","source":"operator_manifest"}}`,
    );
  const first = parseCanonicalMembershipOperatorManifest(
    source("operator-manifest:event:prototype:first"),
  );
  const second = parseCanonicalMembershipOperatorManifest(
    source("operator-manifest:event:prototype:second"),
  );

  assert.deepEqual(first.blockers, []);
  assert.equal(Object.hasOwn(first.manifest?.events ?? {}, "__proto__"), true);
  assert.equal(Object.hasOwn(first.manifest?.events ?? {}, "constructor"), true);
  assert.equal(
    first.manifest?.events.__proto__?.evidenceId,
    "operator-manifest:event:prototype:first",
  );
  assert.notEqual(second.manifestHash, first.manifestHash);

  const prototypeFact: CanonicalMembershipMigrationEventFact = {
    authority: "legacy_registration",
    configurationDeadline: null,
    contentHash: "core-content-prototype-event",
    eventId: "__proto__",
    eventVersion: 1,
    ...inventory([]),
  };
  const constructorFact: CanonicalMembershipMigrationEventFact = {
    ...prototypeFact,
    contentHash: "core-content-constructor-event",
    eventId: "constructor",
  };
  const firstPlan = buildCanonicalMembershipMigrationPlan({
    facts: [prototypeFact, constructorFact],
    parsedManifest: first,
  });
  const secondPlan = buildCanonicalMembershipMigrationPlan({
    facts: [prototypeFact, constructorFact],
    parsedManifest: second,
  });
  assert.equal(firstPlan.applyEligible, true);
  assert.match(firstPlan.applyPlanHash ?? "", /^[a-f0-9]{64}$/u);
  assert.notEqual(secondPlan.applyPlanHash, firstPlan.applyPlanHash);
});

test("manifest diagnostics hash hostile and non-JSON values without throwing", () => {
  const circular: Record<string, unknown> = { schemaVersion: 1 };
  circular.self = circular;
  const hostile = Object.defineProperty({}, "events", {
    enumerable: true,
    get() {
      throw new Error("hostile getter");
    },
  });
  for (const value of [
    undefined,
    () => undefined,
    BigInt(42),
    circular,
    hostile,
  ]) {
    const first = parseCanonicalMembershipOperatorManifest(value);
    const second = parseCanonicalMembershipOperatorManifest(value);
    assert.equal(first.manifest, null);
    assert.ok(first.blockers.length > 0);
    assert.match(first.manifestHash, /^[a-f0-9]{64}$/u);
    assert.equal(second.manifestHash, first.manifestHash);
  }

  const invalidEntry = (evidenceId: unknown) => ({
    events: {
      event_01: {
        evidenceId,
        profileEditDeadlineAt: "2026-08-10T10:00:00.000Z",
        source: "operator_manifest",
      },
    },
    schemaVersion: 1,
  });
  const first = parseCanonicalMembershipOperatorManifest(invalidEntry(1));
  const firstReplay = parseCanonicalMembershipOperatorManifest(invalidEntry(1));
  const second = parseCanonicalMembershipOperatorManifest(invalidEntry(2));
  assert.equal(first.manifestHash, firstReplay.manifestHash);
  assert.notEqual(first.manifestHash, second.manifestHash);
});

test("Event Core hash excludes registration and configuration migration facts", () => {
  const completeManifest = parseCanonicalMembershipOperatorManifest(
    manifestFor(legacyEventIds),
  );
  const baseFacts = facts();
  const base = buildCanonicalMembershipMigrationPlan({
    facts: baseFacts,
    parsedManifest: completeManifest,
  });
  const registrationChangedFacts = baseFacts.map((fact) =>
    fact.eventId === "event_signup_01"
      ? {
          ...fact,
          registrations: fact.registrations.map((value, index) =>
            index === 0
              ? {
                  ...value,
                  participantProfile: {
                    ...value.participantProfile,
                    answers: {
                      ...value.participantProfile.answers,
                      desiredOutcome: "Changed canonical registration authority",
                    },
                  },
                }
              : value,
          ),
        }
      : fact,
  );
  const registrationChanged = buildCanonicalMembershipMigrationPlan({
    facts: registrationChangedFacts,
    parsedManifest: completeManifest,
  });
  assert.equal(registrationChanged.eventCoreHash, base.eventCoreHash);
  assert.notEqual(registrationChanged.diagnosticHash, base.diagnosticHash);
  assert.notEqual(registrationChanged.applyPlanHash, base.applyPlanHash);

  const configuredFacts = (deadline: string) =>
    baseFacts.map((fact) =>
      fact.eventId === "event_01"
        ? {
            ...fact,
            configurationDeadline: {
              configurationVersion: 3,
              profileEditDeadlineAt: deadline,
            },
          }
        : fact,
    );
  const manifestWithoutConfiguredEvent = parseCanonicalMembershipOperatorManifest(
    manifestFor(legacyEventIds.filter((eventId) => eventId !== "event_01")),
  );
  const firstConfiguration = buildCanonicalMembershipMigrationPlan({
    facts: configuredFacts("2026-08-10T10:00:00.000Z"),
    parsedManifest: manifestWithoutConfiguredEvent,
  });
  const secondConfiguration = buildCanonicalMembershipMigrationPlan({
    facts: configuredFacts("2026-08-11T10:00:00.000Z"),
    parsedManifest: manifestWithoutConfiguredEvent,
  });
  assert.equal(secondConfiguration.eventCoreHash, firstConfiguration.eventCoreHash);
  assert.notEqual(secondConfiguration.diagnosticHash, firstConfiguration.diagnosticHash);
  assert.notEqual(secondConfiguration.applyPlanHash, firstConfiguration.applyPlanHash);
});
