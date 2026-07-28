import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");
const source = readFileSync(
  join(projectRoot, "scripts/seed-account-contact-fixtures.ts"),
  "utf8",
);

test("account contact fixtures use detailed Chinese product copy", () => {
  for (const name of [
    "林玫",
    "佐藤健司",
    "田中爱子",
    "普丽娅·拉奥",
    "索菲娅·马丁内斯",
    "奥马尔·拉赫曼",
    "森花",
    "陈立安",
    "艾玛·威尔逊",
    "小林大地",
    "诺拉·费舍尔",
    "拉菲尔·科斯塔",
  ]) {
    assert.match(source, new RegExp(`displayName: "${name}"`));
  }

  assert.equal(
    [...source.matchAll(/summary: "([^"]+)"/g)].length,
    12,
  );
  for (const [, summary] of source.matchAll(/summary: "([^"]+)"/g)) {
    assert.ok(summary.length >= 55, `summary is too short: ${summary}`);
  }
  for (const [, action] of source.matchAll(/nextAction: "([^"]+)"/g)) {
    assert.ok(action.length >= 28, `next action is too short: ${action}`);
  }
  assert.equal([...source.matchAll(/profileBio: "([^"]+)"/g)].length, 12);
  assert.equal(
    [...source.matchAll(/selfIntroduction: "([^"]+)"/g)].length,
    12,
  );
  assert.equal(
    [...source.matchAll(/interactionHistory:\s*\[/g)].length,
    12,
  );
  assert.match(source, /interactionEvidenceUpserted/);
  assert.match(source, /profileSnippet: fixture\.profileBio/);
  assert.match(source, /selfIntroduction: fixture\.selfIntroduction/);
  assert.doesNotMatch(source, /profileSnippet: fixture\.summary/);
  assert.match(
    source,
    /林玫熟悉日本早期投资，佐藤健司正在推进机器人视觉项目/,
  );
  assert.match(source, /`orbit-contact-\$\{key\}-\$\{suffix\}`/);
  assert.match(source, /`orbit-connection-\$\{key\}-\$\{suffix\}`/);
  assert.match(source, /legacyFixtureRecordsArchived/);
  assert.match(source, /configuredStore\.store\.deleteRecord/);
  assert.match(source, /Only the exact known seeded draft is migrated/);
});
