import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const projectRoot = process.cwd();
const catalogPath = join(projectRoot, "knowledge/docs/catalog.json");

function readCatalog() {
  return JSON.parse(readFileSync(catalogPath, "utf8"));
}

test("knowledge document catalog has valid Chinese entries", () => {
  assert.equal(existsSync(catalogPath), true, "catalog.json must exist");
  const catalog = readCatalog();

  assert.equal(catalog.schemaVersion, 1);
  assert.equal(catalog.generatedOn, "2026-06-30");
  assert.ok(Array.isArray(catalog.documents));
  assert.ok(
    catalog.documents.length >= 120,
    "catalog must cover the authoritative docs and implementation handoff docs",
  );

  const ids = new Set();
  for (const doc of catalog.documents) {
    assert.equal(typeof doc.id, "string");
    assert.equal(ids.has(doc.id), false, `${doc.id} must be unique`);
    ids.add(doc.id);
    assert.match(doc.titleZh, /[\u4e00-\u9fff]/, `${doc.id} needs Chinese title`);
    assert.match(
      doc.summaryZh,
      /[\u4e00-\u9fff]/,
      `${doc.id} needs Chinese summary`,
    );
    assert.match(
      doc.reviewEvidenceZh,
      /[\u4e00-\u9fff]/,
      `${doc.id} needs Chinese review evidence`,
    );
    assert.equal(
      existsSync(join(projectRoot, doc.sourcePath)),
      true,
      `${doc.sourcePath} must exist`,
    );
    assert.doesNotMatch(doc.sourcePath, /^harness-state\/runs\//);
    assert.ok(
      ["current", "historical", "superseded", "needs-review", "generated-evidence"].includes(
        doc.status,
      ),
    );
    assert.ok(
      ["verified-current", "likely-current", "needs-code-check", "known-stale"].includes(
        doc.freshness,
      ),
    );
    assert.equal(typeof doc.lastReviewedOn, "string");
  }
});

test("catalog includes core Orbit document families and learnings", () => {
  const sourcePaths = readCatalog().documents.map((doc) => doc.sourcePath);

  assert.ok(sourcePaths.includes("docs/designs/inital_design.md"));
  assert.ok(sourcePaths.includes("docs/designs/orbit_technical_design.md"));
  assert.ok(sourcePaths.includes("AGENT.md"));
  assert.ok(sourcePaths.includes("repos/orbits/AGENTS.md"));
  assert.ok(sourcePaths.includes("repos/orbits/docs/architecture/modular-design.md"));
  assert.ok(sourcePaths.includes("repos/orbits/docs/architecture/modules/orbit-ai.md"));
  assert.ok(sourcePaths.includes("repos/orbits/README.md"));
  assert.ok(sourcePaths.includes("harness/prompts/planner.md"));
  assert.ok(sourcePaths.includes("harness/prompts/generator.md"));
  assert.ok(sourcePaths.includes("repos/orbits/scripts/manual-acceptance.md"));
  assert.ok(
    sourcePaths.includes(
      "repos/orbits/features/agent/agent-action-queue-mock/LIVE_IMPLEMENTATION.md",
    ),
  );
  assert.ok(
    sourcePaths.includes(
      "repos/orbits/app/(app)/app/chat/compose-app-chat-from-previously-approved-mock-first-capabilities/LIVE_IMPLEMENTATION.md",
    ),
  );
  assert.ok(
    sourcePaths.includes(
      "repos/orbits/shared/local-remote-store/RELATIONSHIP_SCHEMA_LIVE_IMPLEMENTATION.md",
    ),
  );
  assert.ok(sourcePaths.includes(".learnings/TROUBLESHOOTING.md"));
  assert.ok(sourcePaths.includes("repos/orbits/.learnings/LEARNINGS.md"));
});

test("Chinese catalog and freshness report are readable entry points", () => {
  const catalogZh = readFileSync(
    join(projectRoot, "knowledge/docs/catalog.zh.md"),
    "utf8",
  );
  const freshness = readFileSync(
    join(projectRoot, "knowledge/docs/freshness-report.zh.md"),
    "utf8",
  );

  assert.match(catalogZh, /# Orbit 文档库目录/);
  assert.match(catalogZh, /文档查询入口/);
  assert.match(catalogZh, /docs\/designs\/orbit_technical_design\.md/);
  assert.match(freshness, /# Orbit 文档新鲜度报告/);
  assert.match(freshness, /needs-code-check|需要代码核对/);
  assert.match(freshness, /扫描范围内未纳入目录：0 个 Markdown/);
});
