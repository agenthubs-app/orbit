import assert from "node:assert/strict";
import test from "node:test";

import { formatOrbitPartyDateTime } from "../../app/(app)/app/party/party-date-time";

test("Party date rendering is deterministic JST text for SSR and hydration", () => {
  assert.equal(
    formatOrbitPartyDateTime("2026-08-02T18:35:00.000Z"),
    "2026/08/03 03:35:00 JST",
  );
  assert.equal(formatOrbitPartyDateTime("invalid"), "—");
});
