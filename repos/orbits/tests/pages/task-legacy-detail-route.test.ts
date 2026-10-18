import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { transformSync } from "esbuild";

test("legacy plain-task URL redirects to the new Task detail without losing its encoded identity", async () => {
  const path = require.resolve("../../app/(app)/app/tasks/[id]/page");
  const compiled = transformSync(readFileSync(path, "utf8"), { format: "cjs", loader: "tsx", jsx: "automatic", platform: "node" }).code;
  const baseRequire = createRequire(path);
  const module = { exports: {} as Record<string, any> };
  new Function("require", "module", "exports", compiled)((request: string) => {
    if (request === "next/navigation") return { redirect: (destination: string) => { throw Object.assign(Error("redirect"), { destination }); } };
    if (request.endsWith("/auth")) return { auth: async () => ({ user: { id: "subject" } }) };
    if (request === "../tasks-page-content") return { TasksPageContent: () => null };
    return baseRequire(request);
  }, module, module.exports);
  await assert.rejects(module.exports.default({ params: Promise.resolve({ id: "task%3Aone%2Ftwo" }) }), error => {
    const destination = new URL((error as Error & { destination: string }).destination, "https://orbit.test");
    assert.equal(destination.pathname, "/app/tasks");
    assert.deepEqual(Object.fromEntries(destination.searchParams), { tab: "todo", view: "all", task: "task:one/two" });
    return true;
  });
});
