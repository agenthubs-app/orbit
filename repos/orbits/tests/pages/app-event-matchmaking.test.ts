import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

test("event matchmaking UI explains sources, consent, and manual scheduling", () => {
  const source = readFileSync(
    join(
      projectRoot,
      "app/(app)/app/events/[id]/orbit-event-matchmaking.tsx",
    ),
    "utf8",
  );

  assert.match(source, /data-matchmaking-source/);
  assert.match(source, /来源：本场报名画像与活动匹配目标/);
  assert.match(source, /reasons\.slice\(0, 3\)/);
  assert.match(source, /type="datetime-local"/);
  assert.match(source, /日历暂未连接，请手动提议时间/);
  assert.match(source, /双方同意前，联系方式保持隐藏/);
  assert.match(source, /已记录双方同意；Orbit 仍不会自动发送消息/);
  assert.doesNotMatch(source, /candidate\.evidenceIds/);
  assert.doesNotMatch(source, /otherParticipant\.(email|phone)/);
});
