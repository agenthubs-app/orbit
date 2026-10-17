import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { transformSync } from "esbuild";

test("legacy personal schedule route delegates to the authenticated Task calendar", async () => {
  const pagePath = require.resolve("../../app/(app)/app/tasks/personal/page");
  const compiled = transformSync(readFileSync(pagePath, "utf8"), { format: "cjs", loader: "tsx", jsx: "automatic", platform: "node" }).code;
  const baseRequire = createRequire(pagePath);
  const module = { exports: {} as Record<string, unknown> };
  const redirected = new Error("Test redirect");
  const destinations: string[] = [];
  new Function("require", "module", "exports", compiled)((request: string) => {
    if (request === "next/navigation") return { redirect: (href: string) => { destinations.push(href); throw redirected; } };
    if (request.endsWith("/auth")) return { auth: async () => ({ user: { id: "subject" } }) };
    if (request.includes("authenticated-actor")) return { resolveAuthenticatedApiActorFromSession: async () => ({ id: "actor" }) };
    if (request.includes("orbit-reference-styles") || request.includes("tasks-styles") || request.includes("personal-schedule-workspace")) return { OrbitReferenceStyles: () => null, TasksStyles: () => null, PersonalScheduleWorkspace: () => null };
    return baseRequire(request);
  }, module, module.exports);
  const page = module.exports.default as () => unknown;
  assert.throws(page, error => error === redirected);
  assert.deepEqual(destinations, ["/app/tasks?tab=calendar"]);
});
