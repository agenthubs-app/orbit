import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { agentHrefForContext } from "../../app/(app)/app/orbit-agent-context-href";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

function agentPrompt(href: string): string {
  return new URL(href, "http://orbit.local").searchParams.get("q") ?? "";
}

test("contact context entry preserves the real entity identity and safety boundary", () => {
  const href = agentHrefForContext({
    details: "Morning Light Technologies · Product Manager",
    id: "contact_030",
    kind: "contact",
    label: "後藤 信也",
    language: "zh",
  });
  const prompt = agentPrompt(href);

  assert.ok(href.startsWith("/app/agent?q="));
  assert.match(prompt, /contact_030/);
  assert.match(prompt, /後藤 信也/);
  assert.match(prompt, /支持证据/);
  assert.match(prompt, /不要执行任何外部操作/);
});

test("event context entry asks for fit and preparation without executing", () => {
  const prompt = agentPrompt(
    agentHrefForContext({
      details: "Tokyo · Aug 4",
      id: "event_signup_02",
      kind: "event",
      label: "Tokyo AI Implementation Partner Meetup",
      language: "en",
    }),
  );

  assert.match(prompt, /event_signup_02/);
  assert.match(prompt, /fit with my goals and network/);
  assert.match(prompt, /Do not perform any external action/);
});

test("contact and event detail views both reuse the context entry helper", () => {
  for (const path of [
    "app/(app)/app/contacts/orbit-real-card-connection.tsx",
    "app/(app)/app/events/[id]/orbit-real-event-detail.tsx",
  ]) {
    const component = readFileSync(join(projectRoot, path), "utf8");

    assert.match(component, /agentHrefForContext/);
    assert.match(component, /data-agent-context=/);
  }
});
