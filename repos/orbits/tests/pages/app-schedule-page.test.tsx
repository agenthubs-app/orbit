/**
 * /app/schedule — T3 (today-schedule merge) collapsed this route into a
 * redirect shell (see docs/superpowers/specs/2026-07-25-today-schedule-
 * merge-design.md §1/§7). "可复核安排" (the arrangement cards this file used
 * to render and assert on) now lives in /app/today's right column
 * (id="arrangements", covered by tests/pages/app-today-merged.test.ts and
 * tests/pages/app-schedule-route-services.test.ts, which still exercise
 * `schedule-route-view-model.ts` directly). `orbit-real-schedule-page.tsx`
 * stays in place (T3 brief — kept, not deleted) with no page consuming it
 * anymore; its mobile-constraints CSS is still asserted below by reading its
 * source directly instead of rendering it through the retired page route.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

function source(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

interface RedirectDigest {
  destination: string;
  statusCode: number;
  type: string;
}

// next/navigation's redirect() throws an Error whose `digest` encodes the
// target: "NEXT_REDIRECT;<type>;<destination>;<statusCode>;". There's no
// existing test-side helper for this in the repo yet, so this is a small
// local one rather than reaching into next/dist internals.
function parseRedirectDigest(error: unknown): RedirectDigest {
  assert.ok(error instanceof Error, "expected redirect() to throw an Error");
  const digest = (error as Error & { digest?: string }).digest;
  assert.ok(
    digest?.startsWith("NEXT_REDIRECT;"),
    `expected a NEXT_REDIRECT digest, got: ${digest}`,
  );
  const parts = digest.split(";");
  return {
    destination: parts.slice(2, -2).join(";"),
    statusCode: Number(parts.at(-2)),
    type: parts[1],
  };
}

test("/app/schedule is a thin redirect shell to /app/today#arrangements", async () => {
  const pageSource = source("app/(app)/app/schedule/page.tsx");

  assert.match(pageSource, /redirect\("\/app\/today#arrangements"\)/);
  assert.match(pageSource, /from "next\/navigation"/);

  const Page = (await import("../../app/(app)/app/schedule/page")).default;

  let thrown: unknown;
  try {
    Page();
  } catch (error) {
    thrown = error;
  }

  const redirect = parseRedirectDigest(thrown);
  assert.equal(redirect.destination, "/app/today#arrangements");
  assert.equal(redirect.statusCode, 307);
});

test("/app/schedule constrains the arrangement rail on mobile (orbit-real-schedule-page.tsx, kept in place per T3 but no longer routed to)", () => {
  const realPageSource = source(
    "app/(app)/app/schedule/orbit-real-schedule-page.tsx",
  );

  assert.match(realPageSource, /data-orbit-schedule-mobile-constraints/);
  assert.match(realPageSource, /@media \(max-width: 760px\)/);
  assert.match(realPageSource, /\.orbit-schedule-grid/);
  assert.match(realPageSource, /grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(realPageSource, /overflow-wrap: anywhere/);
});
