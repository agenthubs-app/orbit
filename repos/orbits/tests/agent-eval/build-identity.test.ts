import assert from "node:assert/strict";
import { test } from "node:test";

import { checkGateIdentity, classifyDirty, refreshServer, type BuildIdentity } from "./lib/build-identity";

/**
 * agent-design AG04 run-02: the eval server's build identity. run-01's dev1 ran on the previous
 * server because `--build` built but left the running server serving. Now `--build` replaces the
 * server, the build records the commit it was made from, every run records it, and a gate run
 * refuses to start on a build that is not HEAD or on a dirty tree.
 */

const NEXT_ENV_NOISE = [
  "diff --git a/repos/orbits/next-env.d.ts b/repos/orbits/next-env.d.ts",
  "index c4b7818fb..9edff1c7c 100644",
  "--- a/repos/orbits/next-env.d.ts",
  "+++ b/repos/orbits/next-env.d.ts",
  "@@ -1,6 +1,6 @@",
  ' /// <reference types="next" />',
  '-import "./.next/dev/types/routes.d.ts";',
  '+import "./.next/types/routes.d.ts";',
].join("\n");

test("next-env.d.ts rewritten by next build (only its routes import) is the build's own noise; anything else is dirty", () => {
  const diffOf = (file: string) => (file.endsWith("next-env.d.ts") ? NEXT_ENV_NOISE : "+changed");
  assert.deepEqual(classifyDirty([" M repos/orbits/next-env.d.ts"], diffOf), { dirty: [], noise: ["repos/orbits/next-env.d.ts"] });
  assert.deepEqual(classifyDirty([" M repos/orbits/next-env.d.ts", " M repos/orbits/features/agent-v1/graph/build.ts"], diffOf).dirty, ["repos/orbits/features/agent-v1/graph/build.ts"]);
  const other = classifyDirty([" M repos/orbits/next-env.d.ts"], () => `${NEXT_ENV_NOISE}\n+// a real edit`);
  assert.deepEqual(other.dirty, ["repos/orbits/next-env.d.ts"], "any other change to next-env.d.ts is a real change");
  assert.deepEqual(classifyDirty(["M  docs/x.md", "?? untracked.txt"], diffOf).dirty, ["docs/x.md"], "untracked files are not the tree's state");
});

const build = (overrides: Partial<BuildIdentity> = {}): BuildIdentity => ({ builtAt: "t", commit: "abc1234def", dirty: false, dirtyPaths: [], nextBuildId: "b1", ...overrides });

test("a gate run starts only on a clean build of HEAD with a clean tree", () => {
  assert.deepEqual(checkGateIdentity({ build: build(), dirty: [], head: "abc1234def" }), []);
  assert.match(checkGateIdentity({ build: null, dirty: [], head: "abc1234def" }).join(), /no build identity/u);
  assert.match(checkGateIdentity({ build: build({ commit: "0000000" }), dirty: [], head: "abc1234def" }).join(), /built from 0000000.*HEAD is abc1234def/u);
  assert.match(checkGateIdentity({ build: build({ dirty: true, dirtyPaths: ["a.ts"] }), dirty: [], head: "abc1234def" }).join(), /built from a dirty tree \(a\.ts\)/u);
  assert.match(checkGateIdentity({ build: build(), dirty: ["b.ts"], head: "abc1234def" }).join(), /working tree is dirty \(b\.ts\)/u);
});

test("--build replaces a running server: stop, build, record the identity, start — never leaves the old one serving", async () => {
  const steps: string[] = [];
  const deps = (running: boolean) => ({
    build: async () => { steps.push("build"); },
    recordIdentity: async () => { steps.push("identity"); },
    running: async () => running,
    start: async () => { steps.push("start"); },
    stop: async () => { steps.push("stop"); },
  });
  await refreshServer(deps(true), { build: true });
  assert.deepEqual(steps, ["stop", "build", "identity", "start"]);
  steps.length = 0;
  await refreshServer(deps(false), { build: true });
  assert.deepEqual(steps, ["build", "identity", "start"]);
  steps.length = 0;
  await refreshServer(deps(true), { build: false });
  assert.deepEqual(steps, [], "without --build a running server is kept");
  steps.length = 0;
  await refreshServer(deps(false), { build: false });
  assert.deepEqual(steps, ["start"]);
});
