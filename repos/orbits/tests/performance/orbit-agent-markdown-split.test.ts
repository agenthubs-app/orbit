import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

test("assistant markdown stays out of the unopened Agent first-load module", () => {
  const agentSource = readFileSync(
    join(projectRoot, "app/(app)/app/agent/orbit-real-agent.tsx"),
    "utf8",
  );
  const markdownSource = readFileSync(
    join(projectRoot, "app/(app)/app/agent/agent-markdown.tsx"),
    "utf8",
  );

  assert.match(agentSource, /dynamic\(\(\) => import\("\.\/agent-markdown"\)/);
  assert.doesNotMatch(agentSource, /from "react-markdown"/);
  assert.doesNotMatch(agentSource, /from "remark-gfm"/);
  assert.match(markdownSource, /from "react-markdown"/);
  assert.match(markdownSource, /from "remark-gfm"/);
});
