import assert from "node:assert/strict";
import test from "node:test";

import { createAppointmentActionIdempotencyRegistry } from "../../features/appointments/client-idempotency";

test("appointment action keys stay ASCII-safe while Unicode remains part of the local retry fingerprint", () => {
  const uuids = [
    "00000000-0000-4000-8000-000000000001",
    "00000000-0000-4000-8000-000000000002",
  ];
  const registry = createAppointmentActionIdempotencyRegistry(() => uuids.shift()!);
  const proposal = {
    candidateTimes: [
      { startsAtUtc: "2026-08-07T10:00:00.000Z" },
      { startsAtUtc: "2026-08-08T01:30:00.000Z" },
      { startsAtUtc: "2026-08-10T09:30:00.000Z" },
    ],
    durationMinutes: 45,
    medium: { joinUrl: null, kind: "video", provider: "google_meet" },
    note: "讨论合作の次のステップと東京での実証実験",
    timezone: "Asia/Tokyo",
  };
  const fingerprint = `appointment:例:v1:propose:${JSON.stringify(proposal)}`;
  const first = registry.keyFor(fingerprint);
  const replay = registry.keyFor(fingerprint);
  const changed = registry.keyFor(`${fingerprint}:changed`);

  assert.equal(replay, first);
  assert.notEqual(changed, first);
  for (const key of [first, changed]) {
    assert.match(key, /^[\x21-\x7e]+$/);
    assert.ok(key.length <= 96);
    assert.doesNotMatch(key, /讨论|ステップ|東京|実証/);
    const request = new Request("http://localhost/appointments", {
      headers: { "Idempotency-Key": key },
      method: "POST",
    });
    assert.equal(request.headers.get("idempotency-key"), key);
  }
});
