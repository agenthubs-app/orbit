import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  partyLoginHref,
  type PartyReturnPath,
} from "../../app/(app)/app/party/party-login-return";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

function source(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

test("Party login return preserves eventId and tab through one canonical nested URL", () => {
  const eventId = "event:e2e/東京?track=AI&round=2";
  const href = partyLoginHref("/app/party/graph", {
    eventId,
    tab: ["round-two", "ignored"],
  });
  const loginUrl = new URL(href, "https://orbit.local");

  assert.equal(loginUrl.pathname, "/app/account/login");
  assert.deepEqual([...loginUrl.searchParams.keys()], ["next"]);

  const next = loginUrl.searchParams.get("next");
  assert.ok(next);
  const returnUrl = new URL(next, "https://orbit.local");
  assert.equal(returnUrl.pathname, "/app/party/graph");
  assert.equal(returnUrl.searchParams.get("eventId"), eventId);
  assert.equal(returnUrl.searchParams.get("tab"), "round-two");
  assert.deepEqual([...returnUrl.searchParams.keys()], ["eventId", "tab"]);
});

test("Party login return ignores unapproved query keys and rejects an external pathname", () => {
  const href = partyLoginHref("/app/party", {
    eventId: "event:trusted",
    tab: "all",
    next: "https://evil.example/steal",
    returnTo: "//evil.example",
  } as { eventId: string; next: string; returnTo: string; tab: string });
  const loginUrl = new URL(href, "https://orbit.local");
  const next = loginUrl.searchParams.get("next");

  assert.equal(next, "/app/party?eventId=event%3Atrusted&tab=all");
  assert.throws(
    () => partyLoginHref("//evil.example" as PartyReturnPath),
    /Unsupported Party return path/,
  );
});

test("all three Party routes preserve their own pathname and resolved search params", () => {
  const routes = [
    ["app/(app)/app/party/page.tsx", "/app/party"],
    ["app/(app)/app/party/checkin/page.tsx", "/app/party/checkin"],
    ["app/(app)/app/party/graph/page.tsx", "/app/party/graph"],
  ] as const;

  for (const [path, pathname] of routes) {
    const page = source(path);
    assert.match(page, /const resolvedSearchParams = await searchParams/);
    assert.ok(
      page.includes(`redirect(partyLoginHref("${pathname}", resolvedSearchParams))`),
      `${path} must preserve ${pathname} and its approved query`,
    );
    assert.doesNotMatch(page, /login\?next=%2Fapp%2Fparty/);
  }
});
