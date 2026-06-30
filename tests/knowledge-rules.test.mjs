import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const projectRoot = process.cwd();

function source(path) {
  return readFileSync(join(projectRoot, path), "utf8");
}

function assertChinese(path) {
  assert.match(
    source(path),
    /[\u4e00-\u9fff]/,
    `${path} must contain Chinese text`,
  );
}

test("root knowledge base has Chinese entry points and maintenance rules", () => {
  const requiredFiles = [
    "knowledge/AGENTS.md",
    "knowledge/index.zh.md",
    "knowledge/schema.zh.md",
    "knowledge/log.zh.md",
    "knowledge/wiki/project-overview.zh.md",
    "knowledge/wiki/architecture.zh.md",
    "knowledge/wiki/agent-system.zh.md",
    "knowledge/wiki/data-and-mockdata.zh.md",
    "knowledge/wiki/harness.zh.md",
    "knowledge/wiki/modules.zh.md",
    "knowledge/history/development-log.zh.md",
    "knowledge/learnings/index.zh.md",
    "knowledge/learnings/troubleshooting.zh.md",
    "knowledge/learnings/errors.zh.md",
    "knowledge/learnings/patterns.zh.md",
  ];

  for (const path of requiredFiles) {
    assert.equal(existsSync(join(projectRoot, path)), true, `${path} must exist`);
    assertChinese(path);
  }

  const index = source("knowledge/index.zh.md");
  assert.match(index, /文档库/);
  assert.match(index, /开发历史/);
  assert.match(index, /排障/);
  assert.match(index, /架构/);
  assert.match(index, /knowledge\/docs\/catalog\.zh\.md/);
  assert.match(index, /knowledge\/wiki\/project-overview\.zh\.md/);
  assert.match(index, /knowledge\/wiki\/architecture\.zh\.md/);
  assert.match(index, /knowledge\/wiki\/agent-system\.zh\.md/);
  assert.match(index, /knowledge\/wiki\/data-and-mockdata\.zh\.md/);
  assert.match(index, /knowledge\/wiki\/harness\.zh\.md/);
  assert.match(index, /knowledge\/wiki\/modules\.zh\.md/);
});

test("agent instructions require documentation and development history updates", () => {
  const rootAgent = source("AGENT.md");
  const appAgent = source("repos/orbits/AGENTS.md");

  assert.match(rootAgent, /knowledge\/index\.zh\.md/);
  assert.match(rootAgent, /实现变更.*文档/);
  assert.match(rootAgent, /development-log\.zh\.md/);
  assert.match(rootAgent, /中文/);
  assert.match(rootAgent, /\.learnings/);

  assert.match(appAgent, /\/dev\/knowledge/);
  assert.match(appAgent, /knowledge-manifest/);
  assert.match(appAgent, /文档/);
  assert.match(appAgent, /父目录/);
});
