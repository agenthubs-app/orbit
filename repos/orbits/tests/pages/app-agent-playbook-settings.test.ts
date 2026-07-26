import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Settings exposes natural-language Playbook compile, trial, triggers, and versions", async () => {
  const source = await readFile(
    new URL(
      "../../app/(app)/app/settings/orbit-agent-automation-settings.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(source, /data-agent-playbook-natural-language/);
  assert.match(source, /data-agent-playbook-draft/);
  assert.match(source, /data-agent-playbook-trial/);
  assert.match(source, /\/api\/agent\/automations\/compile/);
  assert.match(source, /\/api\/agent\/automations\/dry-run/);
  assert.match(source, /关系信号/);
  assert.match(source, /保存新版本/);
  assert.match(source, /版本记录/);
});
