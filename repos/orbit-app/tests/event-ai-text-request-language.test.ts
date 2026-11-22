import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createOrbitApiClient } from "../src/api/client";
import { createSyncClient } from "../src/data/sync/sync-client";

// AI-written event text (recommendation reasons, table rationale/theme) is generated per language on the server and answered in the
// reader's language only, read from `?lang=` or `x-orbit-lang` (features/plans/v2/flow-handlers requestContext). Every request that
// carries that text must therefore leave the app in the screen language: the journey reads (overview / prep / venue / attendee /
// after) and the sync pulls that feed the offline event-day mirror (recommendations, roundOneTable, roundTwoTable).

const journeySource = readFileSync(new URL("../src/screens/events/v2/journey-api.ts", import.meta.url), "utf8");
const AI_TEXT_READS = ["overview", "prep", "venue", "attendee", "after"] as const;

function journeyReadPath(name: (typeof AI_TEXT_READS)[number]): string {
  const line = journeySource.split("\n").find(row => new RegExp(`^\\s*${name}: \\(`).test(row));
  assert.ok(line, `journey-api still has a ${name} read`);
  const match = /client\.get<unknown>\(`([^`]+)`\)/.exec(line);
  assert.ok(match, `${name} reads through the injected client with no per-request options`);
  return match[1]!.replace(/\$\{id\(eventId\)\}/g, "e1").replace(/\$\{id\(attendeeId\)\}/g, "a%3A1").replace(/\$\{[^}]+\}/g, "");
}

test("journey-api builds every request through the injected client and never sets its own language", () => {
  assert.doesNotMatch(journeySource, /\bfetch\(|x-orbit-lang|[?&]lang=|headers\s*:/i);
  assert.match(journeySource, /const client = useOrbitApiClient\(\);/, "the screen hook uses the language-aware client");
  for (const name of AI_TEXT_READS) journeyReadPath(name);
});

for (const language of ["zh", "ja", "en"] as const) {
  test(`event recommendation and table reads carry the screen language (${language})`, async () => {
    const seen: { path: string; lang: string | null }[] = [];
    const client = createOrbitApiClient({
      conditionalCache: new Map(),
      language,
      fetchImpl: async (input, init) => {
        const url = new URL(String(input));
        seen.push({ path: url.pathname, lang: url.searchParams.get("lang") ?? new Headers(init?.headers).get("x-orbit-lang") });
        return new Response(JSON.stringify({ success: true, data: {} }), { status: 200, headers: { "Content-Type": "application/json" } });
      },
    });
    for (const name of AI_TEXT_READS) await client.get(journeyReadPath(name));
    const sync = createSyncClient(client);
    await sync.getManifest({}).catch(() => undefined);
    await sync.getDomainPage({ domainId: "events" }).catch(() => undefined);
    await sync.getPage({ actorId: "u1" }).catch(() => undefined);

    for (const path of ["/api/events/e1/overview", "/api/events/e1/prep", "/api/events/e1/venue", "/api/events/e1/attendees/profile", "/api/events/e1/after", "/api/sync/manifest", "/api/sync/domains/events", "/api/sync"]) {
      assert.ok(seen.some(request => request.path === path), `${path} was requested`);
    }
    for (const request of seen) assert.equal(request.lang, language, `${request.path} carries the screen language`);
  });
}
