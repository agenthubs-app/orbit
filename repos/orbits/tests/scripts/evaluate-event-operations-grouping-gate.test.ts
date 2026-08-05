import assert from "node:assert/strict";
import test from "node:test";

import {
  parseGroupingGateOptions,
  validateGroupingGateOutput,
} from "../../scripts/evaluate-event-operations-grouping-gate";

test("grouping gate has safe real-generation defaults", () => {
  assert.deepEqual(
    parseGroupingGateOptions(["--generation-id", "generation:one"]),
    {
      concurrency: 8,
      execute: false,
      generationId: "generation:one",
      rounds: 5,
    },
  );
  assert.throws(() => parseGroupingGateOptions([]), /generation-id/u);
  assert.throws(
    () => parseGroupingGateOptions([
      "--generation-id", "generation:one", "--rounds", "0",
    ]),
    /rounds/u,
  );
});

test("grouping gate rejects every bounded-candidate violation", () => {
  const allowed = new Map([
    ["participant:a", new Set(["participant:b", "participant:c"])],
    ["participant:b", new Set(["participant:a", "participant:c"])],
  ]);
  const feature = (participantId: string, affinityParticipantIds: string[]) => ({
    affinityParticipantIds,
    facilitationHint: "Use the concrete dependency.",
    participantId,
    primaryTopic: "Primary",
    secondaryTopic: "Secondary",
  });
  const validate = (value: ReturnType<typeof feature>[]) =>
    validateGroupingGateOutput({
      allowedTargetIdsBySource: allowed,
      maxAffinityCount: 2,
      participantIds: ["participant:a", "participant:b"],
      value,
    });
  assert.equal(validate([
    feature("participant:a", ["participant:b"]),
    feature("participant:b", ["participant:a"]),
  ]), null);
  assert.equal(validate([feature("participant:a", [])]), "source_count");
  assert.equal(validate([
    feature("participant:a", []),
    feature("participant:unknown", []),
  ]), "unknown_source");
  assert.equal(validate([
    feature("participant:a", []),
    feature("participant:a", []),
  ]), "duplicate_source");
  assert.equal(validate([
    feature("participant:a", ["participant:b", "participant:b"]),
    feature("participant:b", []),
  ]), "duplicate_affinity");
  assert.equal(validate([
    feature("participant:a", ["participant:outside"]),
    feature("participant:b", []),
  ]), "affinity_outside_shortlist");
});
