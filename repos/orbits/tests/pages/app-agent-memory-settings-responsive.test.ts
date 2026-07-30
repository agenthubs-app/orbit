import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

test("Agent memory switches wrap long labels without moving state chips outside the card", () => {
  const source = readFileSync(
    join(
      projectRoot,
      "app/(app)/app/settings/orbit-agent-memory-settings.tsx",
    ),
    "utf8",
  );

  assert.match(
    source,
    /const memorySwitchStyle = \{[\s\S]*?minWidth: 0,[\s\S]*?whiteSpace: "normal"/,
  );
  assert.match(
    source,
    /const memorySwitchLabelStyle = \{[\s\S]*?flex: 1,[\s\S]*?overflowWrap: "anywhere"/,
  );
  assert.match(
    source,
    /const memorySwitchStateStyle = \{[\s\S]*?flexShrink: 0/,
  );
  assert.equal(source.match(/style=\{memorySwitchStyle\}/gu)?.length, 2);
  assert.equal(source.match(/style=\{memorySwitchLabelStyle\}/gu)?.length, 2);
  assert.equal(source.match(/style=\{memorySwitchStateStyle\}/gu)?.length, 2);
});
