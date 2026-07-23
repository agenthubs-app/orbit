import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

function readProjectFile(relativePath: string): string {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

const agentSource = readProjectFile(
  "app/(app)/app/agent/orbit-real-agent.tsx",
);
const styles = readProjectFile(
  "app/(app)/app/orbit-reference-styles.tsx",
);

test("Orbit agent exposes stable hooks for the existing chat composition", () => {
  assert.match(agentSource, /className="orbit-agent-workspace"/);
  assert.match(agentSource, /className="orbit-agent-composer"/);
  assert.match(agentSource, /className="orbit-agent-assistant-turn"/);
  assert.match(agentSource, /className="orbit-agent-result-card/);
  assert.doesNotMatch(agentSource, /orbit-agent-page-wordmark/);
});

test("Orbit agent light presentation uses a pure-white readable token layer", () => {
  assert.match(styles, /\[data-orbit-real-page="agent"\]\s*\{/);
  assert.match(styles, /--agent-canvas:\s*#FFFFFF/i);
  assert.match(styles, /--agent-body-size:\s*15px/);
  assert.match(styles, /--agent-meta-size:\s*12px/);
  assert.match(styles, /body:has\(\[data-orbit-real-page="agent"\]\)/);
});

test("Orbit agent styles flatten assistant turns, composer, and result cards", () => {
  assert.match(styles, /\.orbit-agent-assistant-turn/);
  assert.match(styles, /\.orbit-agent-composer/);
  assert.match(styles, /\.orbit-agent-result-card/);
  assert.doesNotMatch(
    styles,
    /\.orbit-agent-capability\s*\+\s*span\s*\{[^}]*display:\s*none/s,
  );
});
