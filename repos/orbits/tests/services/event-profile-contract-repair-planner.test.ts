import assert from "node:assert/strict";
import test from "node:test";

import type {
  ProfileContractRepairEventEvidence,
  ProfileContractRepairInventoryRowFact,
  ProfileContractRepairSource,
  ProfileContractRepairTargetFact,
} from "../../features/events/registration/profile-contract-repair/contract";
import {
  compareUtf16CodeUnits,
  profileRepairHash,
  profileRepairInventoryHash,
  profileRepairInventoryRowFingerprint,
  stableProfileRepairValue,
} from "../../features/events/registration/profile-contract-repair/contract";
import { buildProfileContractRepairPlan } from "../../features/events/registration/profile-contract-repair/planner";
import { transformCanonicalProfileAnswerMaps } from "../../features/events/registration/profile-contract-repair/transform";

test("deletion-only transform removes Unicode whitespace and preserves every non-empty byte", () => {
  const preserved = "  non-empty value with deliberate outer spaces  ";
  const invalidNonEmpty = transformCanonicalProfileAnswerMaps({
    participantAnswers: { industry: preserved },
    registrationAnswers: { industry: preserved },
  });
  assert.equal(invalidNonEmpty.kind, "invalid");
  assert.equal(
    invalidNonEmpty.kind === "invalid" ? invalidNonEmpty.code : null,
    "ANSWER_VALUE_INVALID",
    "non-empty values are rejected rather than trimmed or rewritten",
  );

  const result = transformCanonicalProfileAnswerMaps({
    participantAnswers: {
      desiredOutcome: "Build one durable partnership",
      industry: "\u3000\t\n",
    },
    registrationAnswers: {
      desiredOutcome: "Build one durable partnership",
      industry: "\u3000\t\n",
    },
  });
  assert.equal(result.kind, "candidate");
  assert.deepEqual(
    result.kind === "candidate" ? result.afterParticipantAnswers : null,
    { desiredOutcome: "Build one durable partnership" },
  );
  assert.deepEqual(
    result.kind === "candidate" ? result.afterRegistrationAnswers : null,
    { desiredOutcome: "Build one durable partnership" },
  );
  assert.deepEqual(
    result.kind === "candidate" ? result.deletionPaths : null,
    [
      "participant.profileAnswers.industry",
      "registrationProfile.answers.industry",
    ],
  );
});

test("transform fails closed on mismatch, unknown fields, non-strings, and non-canonical values", () => {
  const cases = [
    {
      code: "ANSWER_MAP_MISMATCH",
      participantAnswers: { industry: "Robotics" },
      registrationAnswers: { industry: "Climate" },
    },
    {
      code: "ANSWER_MAP_MISMATCH",
      participantAnswers: { industry: "Robotics" },
      registrationAnswers: {},
    },
    {
      code: "ANSWER_MAP_INVALID",
      participantAnswers: { unknownField: "value" },
      registrationAnswers: { unknownField: "value" },
    },
    {
      code: "ANSWER_VALUE_INVALID",
      participantAnswers: { industry: 42 },
      registrationAnswers: { industry: 42 },
    },
    {
      code: "ANSWER_VALUE_INVALID",
      participantAnswers: { industry: " Robotics" },
      registrationAnswers: { industry: " Robotics" },
    },
  ];
  for (const value of cases) {
    const result = transformCanonicalProfileAnswerMaps(value);
    assert.equal(result.kind, "invalid");
    assert.equal(result.kind === "invalid" ? result.code : null, value.code);
  }
});

test("transform accepts an absent legacy participant mirror without inventing it", () => {
  const candidate = transformCanonicalProfileAnswerMaps({
    participantAnswers: undefined,
    registrationAnswers: {
      desiredOutcome: "Meet one operating partner",
      industry: "\u3000",
    },
  });
  assert.equal(candidate.kind, "candidate");
  assert.equal(
    candidate.kind === "candidate" ? candidate.afterParticipantAnswers : {},
    null,
  );
  assert.deepEqual(
    candidate.kind === "candidate" ? candidate.afterRegistrationAnswers : null,
    { desiredOutcome: "Meet one operating partner" },
  );
  assert.deepEqual(
    candidate.kind === "candidate" ? candidate.deletionPaths : null,
    ["registrationProfile.answers.industry"],
  );

  const invalidPresentMirror = transformCanonicalProfileAnswerMaps({
    participantAnswers: { industry: 42 },
    registrationAnswers: { industry: "Robotics" },
  });
  assert.equal(invalidPresentMirror.kind, "invalid");
  assert.equal(
    invalidPresentMirror.kind === "invalid" ? invalidPresentMirror.code : null,
    "ANSWER_VALUE_INVALID",
    "a present invalid mirror is a blocker even when neither map has a blank candidate",
  );
});

function event(
  eventId: string,
  deadline: string,
  inventory: readonly ProfileContractRepairInventoryRowFact[],
): ProfileContractRepairEventEvidence {
  return {
    activationAuditFingerprint: "a".repeat(64),
    configurationHeadRevision: 2,
    configurationVersion: 3,
    contentHash: "b".repeat(64),
    eventId,
    eventRevision: 4,
    eventVersion: 2,
    inventoryCount: inventory.length,
    inventoryHash: profileRepairInventoryHash(inventory),
    profileEditDeadlineAt: deadline,
    sourceAuthority: "canonical",
  };
}

function target(eventId: string, index: number): ProfileContractRepairTargetFact {
  return {
    afterProfilePayloadHash: `${index}`.repeat(64).slice(0, 64),
    beforeProfilePayloadHash: `${index + 1}`.repeat(64).slice(0, 64),
    deletionPaths: [
      "participant.profileAnswers.industry",
      "registrationProfile.answers.industry",
    ],
    eventId,
    lifecycleHash: "c".repeat(64),
    membershipHeadRevision: 2,
    membershipVersion: 3,
    profileHeadRevision: 4,
    profileVersion: 5,
    responsesHash: "d".repeat(64),
    sourceAuthority: "canonical",
    targetToken: `profile-target-sha256:${String(index).padStart(64, "0")}`,
  };
}

function inventoryRow(
  value: ProfileContractRepairTargetFact,
  candidateState: "candidate" | "unchanged" = "candidate",
): ProfileContractRepairInventoryRowFact {
  const fingerprintInput = {
    afterProfilePayloadHash:
      candidateState === "candidate" ? value.afterProfilePayloadHash : null,
    beforeProfilePayloadHash: value.beforeProfilePayloadHash,
    candidateState,
    deletionPaths: candidateState === "candidate" ? value.deletionPaths : [],
    eventId: value.eventId,
    lateRegistration: false,
    lifecycleHash: value.lifecycleHash,
    membershipHeadRevision: value.membershipHeadRevision,
    membershipStatus: "rsvped" as const,
    membershipVersion: value.membershipVersion,
    profileHeadRevision: value.profileHeadRevision,
    profileVersion: value.profileVersion,
    responsesHash: value.responsesHash,
    sourceAuthority: value.sourceAuthority,
    targetToken: value.targetToken,
  } as const;
  return {
    ...fingerprintInput,
    rowFingerprint: profileRepairInventoryRowFingerprint(fingerprintInput),
  };
}

function validSourceFixture(): ProfileContractRepairSource {
  const repairTarget = target("event-a", 1);
  const unchangedSeed = target("event-a", 9);
  const inventory = [
    inventoryRow(repairTarget),
    inventoryRow(unchangedSeed, "unchanged"),
  ];
  return {
    blockers: [],
    events: [event("event-a", "2026-08-19T10:00:00.000Z", inventory)],
    inventory,
    targets: [repairTarget],
  };
}

function resignInventory(source: ProfileContractRepairSource): void {
  const mutable = source as unknown as {
    events: ProfileContractRepairEventEvidence[];
    inventory: ProfileContractRepairInventoryRowFact[];
  };
  mutable.inventory = mutable.inventory.map((value) => {
    const { rowFingerprint: _rowFingerprint, ...fingerprintInput } = value;
    return {
      ...fingerprintInput,
      rowFingerprint: profileRepairInventoryRowFingerprint(fingerprintInput),
    };
  });
  mutable.events = mutable.events.map((value) => {
    const eventInventory = mutable.inventory.filter(
      (row) => row.eventId === value.eventId,
    );
    return {
      ...value,
      inventoryCount: eventInventory.length,
      inventoryHash: profileRepairInventoryHash(eventInventory),
    };
  });
}

test("hash helpers deterministically bind deadline evidence without exposing source values", () => {
  const repairTarget = target("event-a", 1);
  const inventory = [inventoryRow(repairTarget)];
  const firstEvent = event(
    "event-a",
    "2026-08-19T10:00:00.000Z",
    inventory,
  );
  const replayHash = profileRepairHash(
    "canonical-profile-contract-repair:test-event:v1",
    { ...firstEvent },
  );
  assert.equal(
    replayHash,
    profileRepairHash("canonical-profile-contract-repair:test-event:v1", {
      ...firstEvent,
    }),
  );
  assert.notEqual(
    replayHash,
    profileRepairHash("canonical-profile-contract-repair:test-event:v1", {
      ...firstEvent,
      profileEditDeadlineAt: "2026-08-20T10:00:00.000Z",
    }),
  );
  assert.match(replayHash, /^[a-f0-9]{64}$/u);
});

test("even a coherent handwritten source with a canonical blocker is unattested", () => {
  const source = validSourceFixture();
  (source as unknown as { blockers: unknown[] }).blockers = [
    {
      code: "REPAIR_RESPONSE_SOURCE_INVALID",
      eventId: "event-a",
      message:
        "Canonical profile response rows do not match the immutable profile snapshot.",
      targetToken: "profile-target-sha256:" + "f".repeat(64),
    },
  ];
  const plan = buildProfileContractRepairPlan({
    ...source,
  });
  assert.equal(plan.applyEligible, false);
  assert.equal(plan.applyPlanHash, null);
  assert.equal(plan.eventCount, 0);
  assert.equal(plan.blockers[0]?.code, "REPAIR_SOURCE_CONTRACT_INVALID");
});

test("unchanged canonical inventory fields are bound into its pure aggregate hash", () => {
  const repairTarget = target("event-a", 1);
  const unchangedSeed = target("event-a", 9);
  const baselineInventory = [
    inventoryRow(repairTarget),
    inventoryRow(unchangedSeed, "unchanged"),
  ];
  const baselineHash = profileRepairInventoryHash(baselineInventory);
  const driftCases: Array<[string, ProfileContractRepairTargetFact]> = [
    [
      "payload",
      { ...unchangedSeed, beforeProfilePayloadHash: "e".repeat(64) },
    ],
    ["lifecycle", { ...unchangedSeed, lifecycleHash: "f".repeat(64) }],
    [
      "membership head revision",
      { ...unchangedSeed, membershipHeadRevision: 12 },
    ],
    ["membership version", { ...unchangedSeed, membershipVersion: 13 }],
    ["profile head revision", { ...unchangedSeed, profileHeadRevision: 14 }],
    ["profile version", { ...unchangedSeed, profileVersion: 15 }],
    ["responses", { ...unchangedSeed, responsesHash: "9".repeat(64) }],
  ];
  for (const [label, changedUnchangedSeed] of driftCases) {
    const driftedInventory = [
      inventoryRow(repairTarget),
      inventoryRow(changedUnchangedSeed, "unchanged"),
    ];
    assert.notEqual(profileRepairInventoryHash(driftedInventory), baselineHash, label);
  }
});

test("UTF-16 code-unit ordering makes Unicode keys and inventory aggregation deterministic", () => {
  const unicodeIds = ["event-😀", "event-€"];
  assert.deepEqual([...unicodeIds].sort(compareUtf16CodeUnits), [
    "event-€",
    "event-😀",
  ]);
  assert.deepEqual(
    Object.keys(
      stableProfileRepairValue({ "\uE000": 1, "😀": 2, a: 3 }) as Record<
        string,
        unknown
      >,
    ),
    ["a", "😀", "\uE000"],
  );

  const targets = unicodeIds.map((eventId, index) => target(eventId, index + 1));
  const inventory = targets.map((value) => inventoryRow(value));
  assert.equal(
    profileRepairInventoryHash(inventory),
    profileRepairInventoryHash([...inventory].reverse()),
  );
});

test("planner rejects Sol malicious self-signed sources without leaking raw PII", () => {
  const privateMessage = "private answer from alice@example.com";
  const plaintextToken = "plaintext-token-alice@example.com";
  const cases: Array<{
    mutate: (source: ProfileContractRepairSource) => void;
    name: string;
  }> = [
    {
      name: "prototype deletion path",
      mutate: (source) => {
        (source.inventory[0] as unknown as { deletionPaths: string[] }).deletionPaths = [
          "registrationProfile.answers.__proto__",
        ];
        (source.targets[0] as unknown as { deletionPaths: string[] }).deletionPaths = [
          "registrationProfile.answers.__proto__",
        ];
        resignInventory(source);
      },
    },
    {
      name: "non-hex content hash",
      mutate: (source) => {
        (source.events[0] as { contentHash: string }).contentHash = "x";
      },
    },
    {
      name: "non-canonical timestamp",
      mutate: (source) => {
        (source.events[0] as { profileEditDeadlineAt: string }).profileEditDeadlineAt =
          "2026-08-19T10:00:00Z";
      },
    },
    {
      name: "plaintext target token",
      mutate: (source) => {
        (source.inventory[0] as { targetToken: string }).targetToken = plaintextToken;
        (source.targets[0] as { targetToken: string }).targetToken = plaintextToken;
        resignInventory(source);
      },
    },
    {
      name: "self-signed row fingerprint and event hash",
      mutate: (source) => {
        (source.inventory[0] as { rowFingerprint: string }).rowFingerprint = "a".repeat(64);
        (source.events[0] as { inventoryHash: string }).inventoryHash =
          profileRepairInventoryHash(source.inventory);
      },
    },
    {
      name: "self-signed count and inventory hash",
      mutate: (source) => {
        (source.events[0] as { inventoryCount: number }).inventoryCount = 999;
        (source.events[0] as { inventoryHash: string }).inventoryHash = "b".repeat(64);
      },
    },
    {
      name: "coherent self-signed candidate after hash",
      mutate: (source) => {
        (source.inventory[0] as { afterProfilePayloadHash: string }).afterProfilePayloadHash =
          "e".repeat(64);
        (source.targets[0] as { afterProfilePayloadHash: string }).afterProfilePayloadHash =
          "e".repeat(64);
        resignInventory(source);
      },
    },
    {
      name: "deleted unchanged inventory row with recomputed aggregate",
      mutate: (source) => {
        (source as unknown as { inventory: ProfileContractRepairInventoryRowFact[] })
          .inventory = source.inventory.filter(
          (value) => value.candidateState === "candidate",
        );
        resignInventory(source);
      },
    },
    {
      name: "raw source blocker message and token",
      mutate: (source) => {
        (source as unknown as { blockers: unknown[] }).blockers = [
          {
            code: "UNTRUSTED_BLOCKER",
            eventId: "alice",
            message: privateMessage,
            targetToken: plaintextToken,
          },
        ];
      },
    },
  ];
  for (const value of cases) {
    const source = structuredClone(validSourceFixture());
    value.mutate(source);
    const plan = buildProfileContractRepairPlan(source);
    assert.equal(plan.applyEligible, false, value.name);
    assert.equal(plan.applyPlanHash, null, value.name);
    assert.match(plan.diagnosticHash, /^[a-f0-9]{64}$/u, value.name);
    const serialized = JSON.stringify(plan);
    assert.equal(serialized.includes(privateMessage), false, value.name);
    assert.equal(serialized.includes(plaintextToken), false, value.name);
    if (value.name === "prototype deletion path") {
      assert.equal(serialized.includes("__proto__"), false, value.name);
    }
  }
});

test("planner runtime contract rejects exact-key, numeric, path, event, and blocker violations", () => {
  const canonicalBlocker = {
    code: "REPAIR_EVENT_SOURCE_INVALID",
    eventId: "event-a",
    message:
      "Canonical event/configuration/activation/head evidence is incomplete or inconsistent.",
    targetToken: null,
  };
  const cases: Array<{
    mutate: (source: ProfileContractRepairSource & Record<string, unknown>) => void;
    name: string;
  }> = [
    {
      name: "source exact keys",
      mutate: (source) => {
        source.extra = "secret-root";
      },
    },
    {
      name: "source arrays",
      mutate: (source) => {
        (source as unknown as { targets: unknown }).targets = {};
      },
    },
    {
      name: "event exact keys",
      mutate: (source) => {
        (source.events[0] as unknown as Record<string, unknown>).extra = "secret-event";
      },
    },
    {
      name: "inventory exact keys",
      mutate: (source) => {
        (source.inventory[0] as unknown as Record<string, unknown>).extra =
          "secret-inventory";
      },
    },
    {
      name: "target exact keys",
      mutate: (source) => {
        (source.targets[0] as unknown as Record<string, unknown>).extra =
          "secret-target";
      },
    },
    {
      name: "blocker exact keys",
      mutate: (source) => {
        (source as unknown as { blockers: unknown[] }).blockers = [
          { ...canonicalBlocker, extra: "secret-blocker" },
        ];
      },
    },
    {
      name: "NaN version",
      mutate: (source) => {
        (source.events[0] as { eventVersion: number }).eventVersion = Number.NaN;
      },
    },
    {
      name: "fractional count",
      mutate: (source) => {
        (source.events[0] as { inventoryCount: number }).inventoryCount = 1.5;
      },
    },
    {
      name: "negative revision",
      mutate: (source) => {
        (source.inventory[0] as { membershipHeadRevision: number })
          .membershipHeadRevision = -1;
      },
    },
    {
      name: "invalid late boolean",
      mutate: (source) => {
        (source.inventory[0] as unknown as { lateRegistration: unknown })
          .lateRegistration = "false";
      },
    },
    {
      name: "zero current version",
      mutate: (source) => {
        (source.targets[0] as { profileVersion: number }).profileVersion = 0;
      },
    },
    {
      name: "uppercase hash",
      mutate: (source) => {
        (source.targets[0] as { responsesHash: string }).responsesHash = "A".repeat(64);
      },
    },
    {
      name: "unsorted deletion paths",
      mutate: (source) => {
        (source.targets[0] as unknown as { deletionPaths: string[] }).deletionPaths = [
          "registrationProfile.answers.industry",
          "participant.profileAnswers.industry",
        ];
      },
    },
    {
      name: "duplicate deletion paths",
      mutate: (source) => {
        (source.inventory[0] as unknown as { deletionPaths: string[] }).deletionPaths = [
          "registrationProfile.answers.industry",
          "registrationProfile.answers.industry",
        ];
      },
    },
    {
      name: "participant-only deletion path",
      mutate: (source) => {
        (source.targets[0] as unknown as { deletionPaths: string[] }).deletionPaths = [
          "participant.profileAnswers.industry",
        ];
      },
    },
    {
      name: "candidate missing after hash",
      mutate: (source) => {
        (source.inventory[0] as unknown as { afterProfilePayloadHash: unknown })
          .afterProfilePayloadHash = null;
      },
    },
    {
      name: "unchanged has after hash",
      mutate: (source) => {
        const row = source.inventory[0] as unknown as {
          afterProfilePayloadHash: string;
          candidateState: string;
          deletionPaths: string[];
        };
        row.candidateState = "unchanged";
        row.deletionPaths = [];
        resignInventory(source);
      },
    },
    {
      name: "invalid event id",
      mutate: (source) => {
        (source.events[0] as { eventId: string }).eventId = " alice@example.com ";
      },
    },
    {
      name: "wrong source authority",
      mutate: (source) => {
        (source.inventory[0] as unknown as { sourceAuthority: string })
          .sourceAuthority = "legacy";
      },
    },
    {
      name: "wrong blocker message",
      mutate: (source) => {
        (source as unknown as { blockers: unknown[] }).blockers = [
          { ...canonicalBlocker, message: "secret wrong blocker message" },
        ];
      },
    },
  ];
  for (const value of cases) {
    const source = structuredClone(validSourceFixture()) as ProfileContractRepairSource &
      Record<string, unknown>;
    value.mutate(source);
    const plan = buildProfileContractRepairPlan(source);
    assert.equal(plan.applyEligible, false, value.name);
    assert.equal(plan.applyPlanHash, null, value.name);
    const serialized = JSON.stringify(plan);
    for (const secret of [
      "secret-root",
      "secret-event",
      "secret-inventory",
      "secret-target",
      "secret-blocker",
      "secret wrong blocker message",
      "alice@example.com",
    ]) {
      assert.equal(serialized.includes(secret), false, `${value.name}: ${secret}`);
    }
  }
});

test("planner fails closed without throwing for arbitrary unknown inputs", () => {
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  const throwingProxy = new Proxy(
    {},
    {
      ownKeys() {
        throw new Error("private proxy payload");
      },
    },
  );
  for (const value of [
    undefined,
    null,
    true,
    42,
    "private raw source",
    [],
    {},
    cyclic,
    throwingProxy,
  ]) {
    const plan = buildProfileContractRepairPlan(value);
    assert.equal(plan.applyEligible, false);
    assert.equal(plan.applyPlanHash, null);
    assert.equal(JSON.stringify(plan).includes("private"), false);
  }
});
