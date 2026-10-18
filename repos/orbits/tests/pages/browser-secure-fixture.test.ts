import assert from "node:assert/strict";
import test from "node:test";
import type { Browser } from "playwright";
import { open } from "../ui/support/orbit-2026-harness";

type FixtureReply = { status?: number; contentType?: string; body?: string } | "aborted" | null;
function fixture() {
  const calls: string[] = []; let route: ((value: unknown) => Promise<unknown>) | undefined;
  const page = {
    on() {},
    route: async (_pattern: string, handler: typeof route) => { route = handler; },
    goto: async (url: string) => { calls.push(`goto:${url}`); },
    setContent: async () => { calls.push("setContent"); },
    addStyleTag: async () => {}, addScriptTag: async () => {},
  };
  // A transport-only test double: never launches a browser or replaces browser crypto.
  const browser = { newPage: async () => page } as unknown as Browser;
  const request = async (url: string, navigation: boolean): Promise<FixtureReply> => {
    assert.ok(route);
    let result: FixtureReply = null;
    await route({ request: () => ({ url: () => url, isNavigationRequest: () => navigation }), fulfill: async (value: FixtureReply) => { result = value; }, abort: async () => { result = "aborted"; } });
    return result;
  };
  return { browser, calls, request };
}

test("secure fixture navigates to HTTPS and fulfills only its own document without external network", async () => {
  const f = fixture();
  await open(f.browser, { js: "", css: "" }, { origin: "https://orbit.fixture.test/" });
  assert.deepEqual(f.calls, ["goto:https://orbit.fixture.test/"]);
  const response = await f.request("https://orbit.fixture.test/", true);
  assert.ok(response && response !== "aborted");
  assert.equal(response.contentType, "text/html"); assert.ok(response.body?.includes('<div id="root"></div>'));
  assert.equal(await f.request("https://external.test/script.js", false), "aborted");
  assert.equal(await f.request("https://orbit.fixture.test/api/private", false), "aborted");
});

test("legacy fixture keeps setContent behavior; insecure and credential-bearing origins fail closed", async () => {
  const f = fixture();
  await open(f.browser, { js: "", css: "" });
  assert.deepEqual(f.calls, ["setContent"]);
  for (const origin of ["http://orbit.fixture.test/", "https://user:password@orbit.fixture.test/"]) await assert.rejects(open(f.browser, { js: "", css: "" }, { origin }), /secure fixture origin/);
});
