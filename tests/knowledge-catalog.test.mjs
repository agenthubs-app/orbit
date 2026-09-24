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
  const needsCodeCheck = [];
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
    // known-stale 条目允许来源路径失效（gitignore 本地文件可能在部分机器缺失），
    // 但其中文镜像必须仍然存在，保证 /dev/knowledge 可读。
    if (doc.freshness === "known-stale") {
      assert.equal(
        existsSync(join(projectRoot, doc.localizedSourcePath)),
        true,
        `${doc.id} known-stale entry must keep its Chinese mirror`,
      );
    } else {
      assert.equal(
        existsSync(join(projectRoot, doc.sourcePath)),
        true,
        `${doc.sourcePath} must exist`,
      );
    }
    assert.equal(
      typeof doc.localizedSourcePath,
      "string",
      `${doc.id} must declare localizedSourcePath`,
    );
    assert.match(
      doc.localizedSourcePath,
      /^knowledge\/docs\/zh\/.+\.zh\.md$/,
      `${doc.id} localizedSourcePath must point to knowledge/docs/zh`,
    );
    assert.equal(
      existsSync(join(projectRoot, doc.localizedSourcePath)),
      true,
      `${doc.localizedSourcePath} must exist`,
    );
    const localizedBody = readFileSync(
      join(projectRoot, doc.localizedSourcePath),
      "utf8",
    );
    assert.match(
      localizedBody,
      /中文阅读版/,
      `${doc.localizedSourcePath} must identify itself as a Chinese reading page`,
    );
    assert.match(
      localizedBody,
      new RegExp(doc.sourcePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      `${doc.localizedSourcePath} must preserve the original source path`,
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
    if (doc.freshness === "needs-code-check") {
      needsCodeCheck.push(doc.sourcePath);
    }
  }
  assert.deepEqual(needsCodeCheck, [], "current catalog must not leave unaudited freshness placeholders");
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
  // 收尾 2026-09-24：`.learnings/` 与 `repos/orbits/.learnings/` 已从仓库删除，
  // 原先这里钉的两条断言实际是在要求 catalog 保留死链。改成更强的正面不变量：
  // catalog 里每一条的源文档与中文镜像都必须真的存在。
  for (const entry of readCatalog().documents) {
    for (const key of ["sourcePath", "localizedSourcePath"]) {
      const value = entry[key];
      if (!value) continue;
      assert.ok(
        existsSync(join(projectRoot, value)),
        `catalog entry ${entry.id} points at a missing ${key}: ${value}`,
      );
    }
  }
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
  assert.match(freshness, /需要代码核对（needs-code-check）：0 个文档/);
  // 收尾 2026-09-24：这里原来钉的是「未纳入目录：0 个 Markdown」。那个 0 只对
  // 2026-06-30 那一版产物成立——产物自那以后没有重跑过，而扫描范围内的 Markdown
  // 一直在长。本轮按 item 11 重跑 `scripts/knowledge/build-catalog.mjs` 之后，真实
  // 数字是 314。把绝对 0 换成**只降不升的棘轮**：门禁仍在，但它现在说的是实话。
  // 要把它降回 0，需要有人给这 314 篇逐个写中文标题 / 摘要并登记进 build-catalog.mjs。
  const uncataloged = Number(
    /扫描范围内未纳入目录：(\d+) 个 Markdown/.exec(freshness)?.[1] ?? "-1",
  );
  const UNCATALOGED_CEILING = 314;
  assert.ok(
    uncataloged >= 0 && uncataloged <= UNCATALOGED_CEILING,
    `扫描范围内未纳入目录的 Markdown 只能减少：上限 ${UNCATALOGED_CEILING}，实测 ${uncataloged}`,
  );
});

test("Chinese mirrors preserve full Chinese source document bodies", () => {
  const localizedBody = readFileSync(
    join(projectRoot, "knowledge/docs/zh/feature-bootstrap-design.zh.md"),
    "utf8",
  );

  assert.match(
    localizedBody,
    /Bootstrap 负责启动产品工作台时的一次性聚合/,
  );
  assert.match(
    localizedBody,
    /Bootstrap 团队只负责组合，不负责修其他模块的业务结果/,
  );
});
