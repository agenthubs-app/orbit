import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { transformSync } from "esbuild";
import { NextRequest } from "next/server";
import { handleMaintenanceRequest } from "../../features/operations/maintenance/http";

// Execute the real proxy callback with only session lookup replaced. The
// route-level Cron secret check remains real, so this tests both boundaries.
const path = new URL("../../proxy.ts", import.meta.url);
const requireFromProxy = createRequire(path);
const compiled = transformSync(readFileSync(path, "utf8"), { loader: "ts", format: "cjs" });
const module = { exports: {} as { proxy: (request: NextRequest & { auth: unknown }) => Response } };
new Function("require", "module", "exports", compiled.code)(
  (name: string) => name === "./auth" ? { auth: (callback: unknown) => callback } : requireFromProxy(name),
  module, module.exports,
);
const proxy = module.exports.proxy;

test("sessionless Cron reaches its secret guard; missing and wrong secrets do no work", async () => {
  const secret = "synthetic-cron-secret-at-least-32-characters";
  let runs = 0;
  const deps = {
    run: async () => {
      runs++;
      return { startedAt: new Date(0).toISOString(), durationMs: 0, budgetMs: 1000, ok: 0, failed: 0, skipped: 0, tasks: [] };
    },
    ensureHeartbeat: async () => null,
  };
  for (const auth of [undefined, "Bearer incorrect", `Bearer ${secret}`]) {
    const request = new NextRequest("https://test/api/internal/maintenance", {
      headers: auth ? { authorization: auth } : {},
    }) as NextRequest & { auth: unknown };
    request.auth = null;
    const decision = proxy(request);
    assert.equal(decision.headers.get("x-middleware-next"), "1");
    const response = await handleMaintenanceRequest(request, deps, secret);
    assert.equal(response.status, auth === `Bearer ${secret}` ? 200 : 401);
  }
  assert.equal(runs, 1);
});

test("Cron exemption does not grant sessionless access to any adjacent or personal route", () => {
  for (const path of ["/api/internal/maintenance/extra", "/api/internal/agent/worker", "/api/tasks", "/api/notes", "/api/relationship-tasks", "/api/notifications", "/api/queues/event-operations"]) {
    const request = new NextRequest(`https://test${path}`) as NextRequest & { auth: unknown };
    request.auth = null;
    assert.equal(proxy(request).status, 401, path);
  }
  const post = new NextRequest("https://test/api/internal/maintenance", { method: "POST" }) as NextRequest & { auth: unknown };
  post.auth = null;
  assert.equal(proxy(post).status, 401);
});
