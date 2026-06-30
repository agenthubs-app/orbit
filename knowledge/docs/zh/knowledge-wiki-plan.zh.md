# 文档库与知识库实施计划

本页是 Orbit Wiki 的中文阅读版。它保留原始文档的路径、代码块、命令和接口标识，用中文说明阅读目的、审计依据和结构入口。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `docs/superpowers/plans/2026-06-30-orbit-docs-knowledge-wiki.md` |
| 中文镜像 | `knowledge/docs/zh/knowledge-wiki-plan.zh.md` |
| 分类 | `implementation-plan` |
| 状态 | `current` |
| 新鲜度 | `verified-current` |
| 负责人域 | `knowledge` |

## 中文摘要

把知识库目标拆成可测试任务：骨架、catalog、app manifest、可视化页面和最终验证。

## 审计依据

已登记来源文档，后续变更通过 catalog 新鲜度状态追踪。

## 结构化阅读入口

- 第 1 节：Orbit 文档库与知识库 Implementation Plan
- 第 2 节：源文档第 2 个标题
- 第 3 节：源文档第 3 个标题
- 第 4 节：任务 1: Root 知识 Skeleton And Maintenance Rules
- 第 5 节：任务 2: Document Catalog, Freshness Report, And Sync Scripts
- 第 6 节：任务 3: App 本地 知识 Manifest
- 第 7 节：任务 4: dev 知识 Visual Wiki Page
- 第 8 节：任务 5: 验证, Development History, And Completion 审计
- 第 9 节：源文档第 9 个标题

## 保留的代码与命令证据

### 代码证据 1

```js
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const projectRoot = process.cwd();

function source(path) {
  return readFileSync(join(projectRoot, path), "utf8");
}

function assertChinese(path) {
  assert.match(source(path), /[\u4e00-\u9fff]/, `${path} must contain Chinese text`);
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
```

### 代码证据 2

```bash
node --test tests/knowledge-rules.test.mjs
```

### 代码证据 3

```md
## Documentation And Knowledge Base Maintenance

- Use `knowledge/index.zh.md` as the first project knowledge entry before deep code exploration.
- Every implementation change, architecture change, data contract change, agent tool change, or harness workflow change must update or add the relevant documentation.
- Every user-visible or architecture-relevant change must append a Chinese entry to `knowledge/history/development-log.zh.md`.
- New document catalog and knowledge entries must include Chinese titles and Chinese summaries.
- New troubleshooting, error, and recurring-pattern learnings under `.learnings/` must be reflected in `knowledge/learnings/`.
```

### 代码证据 4

```md
## App Documentation And Knowledge Manifest

- App implementation changes must update the related `docs/**`, feature `DESIGN.md`, `LIVE_IMPLEMENTATION.md`, or knowledge catalog entry.
- The `/dev/knowledge` page must consume `shared/knowledge/knowledge-manifest.ts`; app code must not read parent-directory knowledge files directly.
- Changes to the app knowledge manifest or `/dev/knowledge` page must update the related page and service tests.
- Keep app-facing knowledge copy in Chinese, with English technical names only where they are source identifiers.
```

### 代码证据 5

```bash
node --test tests/knowledge-rules.test.mjs
```

### 代码证据 6

```bash
git add AGENT.md repos/orbits/AGENTS.md knowledge tests/knowledge-rules.test.mjs
git commit -m "docs: add orbit knowledge base skeleton"
```

### 代码证据 7

```js
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
  assert.ok(catalog.documents.length >= 35, "catalog must cover the authoritative docs");

  const ids = new Set();
  for (const doc of catalog.documents) {
    assert.equal(typeof doc.id, "string");
    assert.equal(ids.has(doc.id), false, `${doc.id} must be unique`);
    ids.add(doc.id);
    assert.match(doc.titleZh, /[\u4e00-\u9fff]/, `${doc.id} needs Chinese title`);
    assert.match(doc.summaryZh, /[\u4e00-\u9fff]/, `${doc.id} needs Chinese summary`);
    assert.equal(existsSync(join(projectRoot, doc.sourcePath)), true, `${doc.sourcePath} must exist`);
    assert.doesNotMatch(doc.sourcePath, /^harness-state\/runs\//);
    assert.ok(["current", "historical", "superseded", "needs-review", "generated-evidence"].includes(doc.status));
    assert.ok(["verified-current", "likely-current", "needs-code-check", "known-stale"].includes(doc.freshness));
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
  assert.ok(sourcePaths.includes(".learnings/TROUBLESHOOTING.md"));
  assert.ok(sourcePaths.includes("repos/orbits/.learnings/LEARNINGS.md"));
});

test("Chinese catalog and freshness report are readable entry points", () => {
  const catalogZh = readFileSync(join(projectRoot, "knowledge/docs/catalog.zh.md"), "utf8");
  const freshness = readFileSync(join(projectRoot, "knowledge/docs/freshness-report.zh.md"), "utf8");

  assert.match(catalogZh, /# Orbit 文档库目录/);
  assert.match(catalogZh, /文档查询入口/);
  assert.match(catalogZh, /docs\/designs\/orbit_technical_design\.md/);
  assert.match(freshness, /# Orbit 文档新鲜度报告/);
  assert.match(freshness, /needs-code-check|需要代码核对/);
});
```

### 代码证据 8

```bash
node --test tests/knowledge-catalog.test.mjs
```

### 代码证据 9

```bash
node scripts/knowledge/build-catalog.mjs
```

### 代码证据 10

```bash
node --test tests/knowledge-catalog.test.mjs
```

### 代码证据 11

```bash
git add scripts/knowledge knowledge/docs tests/knowledge-catalog.test.mjs
git commit -m "docs: add orbit document catalog"
```

### 代码证据 12

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ORBIT_KNOWLEDGE_MANIFEST } from "../../shared/knowledge/knowledge-manifest";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

test("app knowledge manifest exposes Chinese project knowledge without parent-directory reads", () => {
  assert.equal(ORBIT_KNOWLEDGE_MANIFEST.schemaVersion, 1);
  assert.match(ORBIT_KNOWLEDGE_MANIFEST.titleZh, /知识库/);
  assert.ok(ORBIT_KNOWLEDGE_MANIFEST.documents.length >= 20);
  assert.ok(ORBIT_KNOWLEDGE_MANIFEST.topicPages.length >= 5);
  assert.ok(ORBIT_KNOWLEDGE_MANIFEST.recentHistory.length >= 1);
  assert.ok(ORBIT_KNOWLEDGE_MANIFEST.learnings.length >= 3);

  for (const doc of ORBIT_KNOWLEDGE_MANIFEST.documents) {
    assert.match(doc.titleZh, /[\u4e00-\u9fff]/);
    assert.match(doc.summaryZh, /[\u4e00-\u9fff]/);
    assert.doesNotMatch(doc.sourcePath, /^harness-state\/runs\//);
  }

  const source = readFileSync(
    join(projectRoot, "shared/knowledge/knowledge-manifest.ts"),
    "utf8",
  );
  assert.doesNotMatch(source, /\.\.\//);
  assert.doesNotMatch(source, /node:fs|from "fs"|readFileSync/);
});
```

### 代码证据 13

```bash
npm test -- tests/services/knowledge-manifest.test.ts
```

### 代码证据 14

```bash
node scripts/knowledge/sync-app-manifest.mjs
```

### 代码证据 15

```text
"shared/knowledge/knowledge-manifest.ts"
```

### 代码证据 16

```bash
npm test -- tests/services/knowledge-manifest.test.ts
```

### 代码证据 17

```bash
git add repos/orbits/shared/knowledge/knowledge-manifest.ts repos/orbits/tests/services/knowledge-manifest.test.ts repos/orbits/package.json
git commit -m "feat: add orbit knowledge manifest"
```

### 代码证据 18

```tsx
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");
const testRequire = createRequire(import.meta.url);

testRequire.extensions[".css"] = () => undefined;

async function importProjectModule<TModule>(
  pathFromRoot: string,
): Promise<TModule> {
  const absolutePath = join(projectRoot, pathFromRoot);
  assert.equal(existsSync(absolutePath), true, `${pathFromRoot} must exist`);
  return (await import(pathToFileURL(absolutePath).href)) as TModule;
}

test("/dev/knowledge renders the Orbit knowledge wiki", async () => {
  const page = await importProjectModule<{ default: () => React.ReactElement }>(
    "app/dev/knowledge/page.tsx",
  );
  const html = renderToStaticMarkup(React.createElement(page.default));

  assert.match(html, /Orbit 知识库/);
  assert.match(html, /data-orbit-knowledge-wiki="true"/);
  assert.match(html, /文档库入口/);
  assert.match(html, /开发历史/);
  assert.match(html, /排障经验/);
  assert.match(html, /需要代码核对/);
  assert.match(html, /docs\/designs\/orbit_technical_design\.md/);
  assert.match(html, /knowledge\/docs\/catalog\.zh\.md/);
});

test("knowledge wiki page consumes the app-local manifest only", () => {
  const pageSource = readFileSync(
    join(projectRoot, "app/dev/knowledge/knowledge-wiki.tsx"),
    "utf8",
  );

  assert.match(pageSource, /shared\/knowledge\/knowledge-manifest/);
  assert.doesNotMatch(pageSource, /\.\.\/\.\.\/\.\./);
  assert.doesNotMatch(pageSource, /node:fs|readFileSync|process\.cwd/);
});
```

### 代码证据 19

```bash
npm test -- tests/pages/knowledge-wiki-page.test.tsx
```

### 代码证据 20

```tsx
import "../../globals.css";
import { OrbitKnowledgeWiki } from "./knowledge-wiki";

export default function KnowledgePage() {
  return <OrbitKnowledgeWiki />;
}
```

### 代码证据 21

```text
"app/dev/knowledge/page.tsx"
"app/dev/knowledge/knowledge-wiki.tsx"
"tests/pages/knowledge-wiki-page.test.tsx"
"tests/services/knowledge-manifest.test.ts"
```

### 代码证据 22

```bash
npm test -- tests/pages/knowledge-wiki-page.test.tsx tests/services/knowledge-manifest.test.ts
```

### 代码证据 23

```bash
git add repos/orbits/app/dev/knowledge repos/orbits/tests/pages/knowledge-wiki-page.test.tsx repos/orbits/package.json
git commit -m "feat: add orbit knowledge wiki page"
```

### 代码证据 24

```md
## [2026-06-30] implementation | 文档库与知识库第一版

- 建立 `knowledge/` 知识库入口、文档 catalog、开发历史和 learnings 中文索引。
- 同步 `repos/orbits/shared/knowledge/knowledge-manifest.ts`。
- 新增 `/dev/knowledge` 可视化 Wiki 页面。
- 验证命令记录在 `knowledge/history/development-log.zh.md`。
```

### 代码证据 25

```bash
node scripts/knowledge/build-catalog.mjs
node scripts/knowledge/sync-app-manifest.mjs
```

### 代码证据 26

```bash
node --test tests/knowledge-rules.test.mjs tests/knowledge-catalog.test.mjs
```

### 代码证据 27

```bash
npm test -- tests/services/knowledge-manifest.test.ts tests/pages/knowledge-wiki-page.test.tsx
```

### 代码证据 28

```bash
npm run lint
```

### 代码证据 29

```bash
git diff --check
git status --short
```

### 代码证据 30

```bash
git add knowledge/history/development-log.zh.md knowledge/log.zh.md knowledge/docs/catalog.json knowledge/docs/catalog.zh.md knowledge/docs/freshness-report.zh.md repos/orbits/shared/knowledge/knowledge-manifest.ts
git commit -m "docs: record knowledge wiki implementation history"
```

## 源文档正文

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立 Orbit 项目的中文文档库入口、知识库、开发历史、learnings 索引和 `/dev/knowledge` 可视化 Wiki 页面。

**Architecture:** 根项目 `knowledge/` 是权威知识层，原始文档保留在现有路径。根脚本生成机器可读 catalog 和 app-local manifest；`repos/orbits` 只消费 `shared/knowledge/knowledge-manifest.ts`，不读取父目录。根 `AGENT.md` 和 `repos/orbits/AGENTS.md` 写入持续维护规则。

**Tech Stack:** Markdown, Node `node --test`, Next.js App Router, React 18, existing `WorkbenchFrame` / `WorkbenchSurface` / `Chip`, TypeScript, existing `npm test` and `npm run lint`.

## Global Constraints

- 所有新增知识库和文档库内容必须有中文标题、中文摘要或中文主体。
- 根知识库默认排除 `harness-state/runs/**` 和 `harness-state/tmp/**`。
- App 页面不得 import 或读取父目录；只能消费 `repos/orbits/shared/knowledge/knowledge-manifest.ts`。
- 不引入 RAG、embedding、向量数据库或新 npm 依赖。
- 不搬迁现有原始文档；第一版通过索引、状态和知识页组织它们。
- Python 命令必须使用 `uv run`；本计划优先使用 Node 脚本。
- 工作树已有无关改动时，只 stage 本任务明确列出的文件。

---

## File Structure

Create root knowledge files:

- `knowledge/AGENTS.md`: knowledge-specific maintenance rules.
- `knowledge/index.zh.md`: human and agent entry point.
- `knowledge/schema.zh.md`: schema and workflow rules.
- `knowledge/log.zh.md`: append-only knowledge maintenance log.
- `knowledge/docs/catalog.zh.md`: Chinese document query entry.
- `knowledge/docs/catalog.json`: machine-readable catalog.
- `knowledge/docs/freshness-report.zh.md`: stale/missing-Chinese review report.
- `knowledge/wiki/project-overview.zh.md`: project overview.
- `knowledge/wiki/architecture.zh.md`: architecture map.
- `knowledge/wiki/agent-system.zh.md`: Orbit AI/Agent knowledge page.
- `knowledge/wiki/data-and-mockdata.zh.md`: data/mockdata knowledge page.
- `knowledge/wiki/harness.zh.md`: harness knowledge page.
- `knowledge/wiki/modules.zh.md`: module map.
- `knowledge/history/development-log.zh.md`: Chinese development history.
- `knowledge/learnings/index.zh.md`: learnings entry.
- `knowledge/learnings/troubleshooting.zh.md`: troubleshooting synthesis.
- `knowledge/learnings/errors.zh.md`: error knowledge synthesis.
- `knowledge/learnings/patterns.zh.md`: recurring patterns.

Create root scripts and tests:

- `scripts/knowledge/build-catalog.mjs`: scans Markdown sources and writes/validates catalog artifacts.
- `scripts/knowledge/sync-app-manifest.mjs`: creates the app-local TypeScript manifest.
- `tests/knowledge-rules.test.mjs`: root knowledge skeleton and AGENT rule tests.
- `tests/knowledge-catalog.test.mjs`: catalog validity tests.

Modify existing root and app rules:

- `AGENT.md`: add documentation and knowledge maintenance contract.
- `repos/orbits/AGENTS.md`: add app-local documentation and Wiki manifest rules.

Create app knowledge files:

- `repos/orbits/shared/knowledge/knowledge-manifest.ts`: app-local manifest generated from root catalog.
- `repos/orbits/app/dev/knowledge/page.tsx`: `/dev/knowledge` route.
- `repos/orbits/app/dev/knowledge/knowledge-wiki.tsx`: visual Wiki component.
- `repos/orbits/tests/services/knowledge-manifest.test.ts`: manifest shape and boundary tests.
- `repos/orbits/tests/pages/knowledge-wiki-page.test.tsx`: server-rendered page tests.

Modify app checks:

- `repos/orbits/package.json`: include new knowledge files in the explicit `lint` typecheck list.

---

### Task 1: Root Knowledge Skeleton And Maintenance Rules

**Files:**
- Create: `knowledge/AGENTS.md`
- Create: `knowledge/index.zh.md`
- Create: `knowledge/schema.zh.md`
- Create: `knowledge/log.zh.md`
- Create: `knowledge/wiki/project-overview.zh.md`
- Create: `knowledge/wiki/architecture.zh.md`
- Create: `knowledge/wiki/agent-system.zh.md`
- Create: `knowledge/wiki/data-and-mockdata.zh.md`
- Create: `knowledge/wiki/harness.zh.md`
- Create: `knowledge/wiki/modules.zh.md`
- Create: `knowledge/history/development-log.zh.md`
- Create: `knowledge/learnings/index.zh.md`
- Create: `knowledge/learnings/troubleshooting.zh.md`
- Create: `knowledge/learnings/errors.zh.md`
- Create: `knowledge/learnings/patterns.zh.md`
- Modify: `AGENT.md`
- Modify: `repos/orbits/AGENTS.md`
- Test: `tests/knowledge-rules.test.mjs`

**Interfaces:**
- Consumes: current source docs in `docs/**`, `harness/**`, `harness-state/**`, `.learnings/**`, `repos/orbits/**`.
- Produces: stable project entry `knowledge/index.zh.md`; maintenance instructions consumed by future agents.

- [ ] **Step 1: Write the failing root knowledge rules test**

Create `tests/knowledge-rules.test.mjs`:

```js
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const projectRoot = process.cwd();

function source(path) {
  return readFileSync(join(projectRoot, path), "utf8");
}

function assertChinese(path) {
  assert.match(source(path), /[\u4e00-\u9fff]/, `${path} must contain Chinese text`);
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
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/knowledge-rules.test.mjs
```

Expected: FAIL because `knowledge/` files and AGENT rules do not exist yet.

- [ ] **Step 3: Create the root knowledge skeleton**

Create the files listed above. Minimum content requirements:

- `knowledge/index.zh.md` must link `knowledge/docs/catalog.zh.md`, `knowledge/history/development-log.zh.md`, `knowledge/learnings/index.zh.md`, and every page under `knowledge/wiki/`.
- `knowledge/schema.zh.md` must define raw sources, wiki pages, catalog, log, development history, and freshness rules.
- `knowledge/wiki/project-overview.zh.md` must summarize Orbit's product intent and source documents.
- `knowledge/wiki/architecture.zh.md` must summarize app, feature, service factory, mock/hybrid/live, and route view-model boundaries.
- `knowledge/wiki/agent-system.zh.md` must summarize Orbit AI, Agent, bounded ReAct design, tools, safety ledger, and confirmation boundaries.
- `knowledge/wiki/data-and-mockdata.zh.md` must summarize local-remote database, generated relationship fixture, mockdata source, and freshness risks.
- `knowledge/wiki/harness.zh.md` must summarize harness execution, sprint contracts, evidence, and protected directories.
- `knowledge/wiki/modules.zh.md` must summarize module groups and link to module architecture docs.
- `knowledge/log.zh.md` must start with `## [2026-06-30] design | 建立 Orbit 文档库与知识库结构`.
- `knowledge/history/development-log.zh.md` must include the initial design commit `9ff7d3f docs: design orbit knowledge wiki` and explain why the knowledge work began.
- `knowledge/learnings/index.zh.md` must link both `.learnings/` and `repos/orbits/.learnings/`.
- `knowledge/AGENTS.md` must say the knowledge layer is maintained by agents and all generated summaries require Chinese.

- [ ] **Step 4: Update AGENT instructions**

In root `AGENT.md`, add a new section near the repository policy sections:

```md
## Documentation And Knowledge Base Maintenance

- Use `knowledge/index.zh.md` as the first project knowledge entry before deep code exploration.
- Every implementation change, architecture change, data contract change, agent tool change, or harness workflow change must update or add the relevant documentation.
- Every user-visible or architecture-relevant change must append a Chinese entry to `knowledge/history/development-log.zh.md`.
- New document catalog and knowledge entries must include Chinese titles and Chinese summaries.
- New troubleshooting, error, and recurring-pattern learnings under `.learnings/` must be reflected in `knowledge/learnings/`.
```

In `repos/orbits/AGENTS.md`, add an app-local section:

```md
## App Documentation And Knowledge Manifest

- App implementation changes must update the related `docs/**`, feature `DESIGN.md`, `LIVE_IMPLEMENTATION.md`, or knowledge catalog entry.
- The `/dev/knowledge` page must consume `shared/knowledge/knowledge-manifest.ts`; app code must not read parent-directory knowledge files directly.
- Changes to the app knowledge manifest or `/dev/knowledge` page must update the related page and service tests.
- Keep app-facing knowledge copy in Chinese, with English technical names only where they are source identifiers.
```

- [ ] **Step 5: Run test to verify it passes**

Run:

```bash
node --test tests/knowledge-rules.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add AGENT.md repos/orbits/AGENTS.md knowledge tests/knowledge-rules.test.mjs
git commit -m "docs: add orbit knowledge base skeleton"
```

---

### Task 2: Document Catalog, Freshness Report, And Sync Scripts

**Files:**
- Create: `scripts/knowledge/build-catalog.mjs`
- Create: `scripts/knowledge/sync-app-manifest.mjs`
- Create: `knowledge/docs/catalog.zh.md`
- Create: `knowledge/docs/catalog.json`
- Create: `knowledge/docs/freshness-report.zh.md`
- Create: `tests/knowledge-catalog.test.mjs`

**Interfaces:**
- Consumes: root knowledge skeleton from Task 1.
- Produces: `knowledge/docs/catalog.json` and `knowledge/docs/catalog.zh.md` consumed by Task 3 manifest sync.

- [ ] **Step 1: Write the failing catalog test**

Create `tests/knowledge-catalog.test.mjs`:

```js
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
  assert.ok(catalog.documents.length >= 35, "catalog must cover the authoritative docs");

  const ids = new Set();
  for (const doc of catalog.documents) {
    assert.equal(typeof doc.id, "string");
    assert.equal(ids.has(doc.id), false, `${doc.id} must be unique`);
    ids.add(doc.id);
    assert.match(doc.titleZh, /[\u4e00-\u9fff]/, `${doc.id} needs Chinese title`);
    assert.match(doc.summaryZh, /[\u4e00-\u9fff]/, `${doc.id} needs Chinese summary`);
    assert.equal(existsSync(join(projectRoot, doc.sourcePath)), true, `${doc.sourcePath} must exist`);
    assert.doesNotMatch(doc.sourcePath, /^harness-state\/runs\//);
    assert.ok(["current", "historical", "superseded", "needs-review", "generated-evidence"].includes(doc.status));
    assert.ok(["verified-current", "likely-current", "needs-code-check", "known-stale"].includes(doc.freshness));
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
  assert.ok(sourcePaths.includes(".learnings/TROUBLESHOOTING.md"));
  assert.ok(sourcePaths.includes("repos/orbits/.learnings/LEARNINGS.md"));
});

test("Chinese catalog and freshness report are readable entry points", () => {
  const catalogZh = readFileSync(join(projectRoot, "knowledge/docs/catalog.zh.md"), "utf8");
  const freshness = readFileSync(join(projectRoot, "knowledge/docs/freshness-report.zh.md"), "utf8");

  assert.match(catalogZh, /# Orbit 文档库目录/);
  assert.match(catalogZh, /文档查询入口/);
  assert.match(catalogZh, /docs\/designs\/orbit_technical_design\.md/);
  assert.match(freshness, /# Orbit 文档新鲜度报告/);
  assert.match(freshness, /needs-code-check|需要代码核对/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/knowledge-catalog.test.mjs
```

Expected: FAIL because catalog artifacts do not exist.

- [ ] **Step 3: Implement the catalog builder**

Create `scripts/knowledge/build-catalog.mjs`. It must:

- define a curated `DOCUMENTS` array for the first version;
- include at least 35 entries across product design, technical design, architecture, module docs, feature docs, plans/specs, harness docs, mockdata docs, and learnings;
- write `knowledge/docs/catalog.json`;
- write `knowledge/docs/catalog.zh.md`;
- write `knowledge/docs/freshness-report.zh.md`;
- fail if any source path is missing or if any Chinese field lacks Chinese characters.

The first version should prefer curated accuracy over fully automatic summaries. It may scan for missing extra Markdown and list them in the freshness report as “未纳入首版目录”.

- [ ] **Step 4: Implement app manifest sync script**

Create `scripts/knowledge/sync-app-manifest.mjs`. It must:

- read `knowledge/docs/catalog.json`;
- read summary sections from `knowledge/index.zh.md`, `knowledge/history/development-log.zh.md`, and `knowledge/learnings/index.zh.md`;
- write a TypeScript file at `repos/orbits/shared/knowledge/knowledge-manifest.ts`;
- export `ORBIT_KNOWLEDGE_MANIFEST`;
- avoid importing root files from app code.

- [ ] **Step 5: Build the catalog artifacts**

Run:

```bash
node scripts/knowledge/build-catalog.mjs
```

Expected: command exits 0 and writes the three `knowledge/docs/*` artifacts.

- [ ] **Step 6: Run catalog tests**

Run:

```bash
node --test tests/knowledge-catalog.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/knowledge knowledge/docs tests/knowledge-catalog.test.mjs
git commit -m "docs: add orbit document catalog"
```

---

### Task 3: App-Local Knowledge Manifest

**Files:**
- Create: `repos/orbits/shared/knowledge/knowledge-manifest.ts`
- Create: `repos/orbits/tests/services/knowledge-manifest.test.ts`
- Modify: `repos/orbits/package.json`

**Interfaces:**
- Consumes: `knowledge/docs/catalog.json` and `scripts/knowledge/sync-app-manifest.mjs` from Task 2.
- Produces: app-local `ORBIT_KNOWLEDGE_MANIFEST` consumed by Task 4.

- [ ] **Step 1: Write the failing app manifest test**

Create `repos/orbits/tests/services/knowledge-manifest.test.ts`:

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ORBIT_KNOWLEDGE_MANIFEST } from "../../shared/knowledge/knowledge-manifest";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

test("app knowledge manifest exposes Chinese project knowledge without parent-directory reads", () => {
  assert.equal(ORBIT_KNOWLEDGE_MANIFEST.schemaVersion, 1);
  assert.match(ORBIT_KNOWLEDGE_MANIFEST.titleZh, /知识库/);
  assert.ok(ORBIT_KNOWLEDGE_MANIFEST.documents.length >= 20);
  assert.ok(ORBIT_KNOWLEDGE_MANIFEST.topicPages.length >= 5);
  assert.ok(ORBIT_KNOWLEDGE_MANIFEST.recentHistory.length >= 1);
  assert.ok(ORBIT_KNOWLEDGE_MANIFEST.learnings.length >= 3);

  for (const doc of ORBIT_KNOWLEDGE_MANIFEST.documents) {
    assert.match(doc.titleZh, /[\u4e00-\u9fff]/);
    assert.match(doc.summaryZh, /[\u4e00-\u9fff]/);
    assert.doesNotMatch(doc.sourcePath, /^harness-state\/runs\//);
  }

  const source = readFileSync(
    join(projectRoot, "shared/knowledge/knowledge-manifest.ts"),
    "utf8",
  );
  assert.doesNotMatch(source, /\.\.\//);
  assert.doesNotMatch(source, /node:fs|from "fs"|readFileSync/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `repos/orbits`:

```bash
npm test -- tests/services/knowledge-manifest.test.ts
```

Expected: FAIL because the manifest file does not exist yet.

- [ ] **Step 3: Generate the app manifest**

Run from root:

```bash
node scripts/knowledge/sync-app-manifest.mjs
```

Expected: command exits 0 and creates `repos/orbits/shared/knowledge/knowledge-manifest.ts`.

- [ ] **Step 4: Add manifest file to lint typecheck list**

Modify `repos/orbits/package.json` `lint` script to include:

```text
"shared/knowledge/knowledge-manifest.ts"
```

Keep the existing explicit file list and add the new file near other `shared/**` files.

- [ ] **Step 5: Run app manifest test**

Run from `repos/orbits`:

```bash
npm test -- tests/services/knowledge-manifest.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add repos/orbits/shared/knowledge/knowledge-manifest.ts repos/orbits/tests/services/knowledge-manifest.test.ts repos/orbits/package.json
git commit -m "feat: add orbit knowledge manifest"
```

---

### Task 4: `/dev/knowledge` Visual Wiki Page

**Files:**
- Create: `repos/orbits/app/dev/knowledge/page.tsx`
- Create: `repos/orbits/app/dev/knowledge/knowledge-wiki.tsx`
- Create: `repos/orbits/tests/pages/knowledge-wiki-page.test.tsx`
- Modify: `repos/orbits/package.json`

**Interfaces:**
- Consumes: `ORBIT_KNOWLEDGE_MANIFEST` from Task 3.
- Produces: browser-readable `/dev/knowledge` developer Wiki page.

- [ ] **Step 1: Write the failing page test**

Create `repos/orbits/tests/pages/knowledge-wiki-page.test.tsx`:

```tsx
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");
const testRequire = createRequire(import.meta.url);

testRequire.extensions[".css"] = () => undefined;

async function importProjectModule<TModule>(
  pathFromRoot: string,
): Promise<TModule> {
  const absolutePath = join(projectRoot, pathFromRoot);
  assert.equal(existsSync(absolutePath), true, `${pathFromRoot} must exist`);
  return (await import(pathToFileURL(absolutePath).href)) as TModule;
}

test("/dev/knowledge renders the Orbit knowledge wiki", async () => {
  const page = await importProjectModule<{ default: () => React.ReactElement }>(
    "app/dev/knowledge/page.tsx",
  );
  const html = renderToStaticMarkup(React.createElement(page.default));

  assert.match(html, /Orbit 知识库/);
  assert.match(html, /data-orbit-knowledge-wiki="true"/);
  assert.match(html, /文档库入口/);
  assert.match(html, /开发历史/);
  assert.match(html, /排障经验/);
  assert.match(html, /需要代码核对/);
  assert.match(html, /docs\/designs\/orbit_technical_design\.md/);
  assert.match(html, /knowledge\/docs\/catalog\.zh\.md/);
});

test("knowledge wiki page consumes the app-local manifest only", () => {
  const pageSource = readFileSync(
    join(projectRoot, "app/dev/knowledge/knowledge-wiki.tsx"),
    "utf8",
  );

  assert.match(pageSource, /shared\/knowledge\/knowledge-manifest/);
  assert.doesNotMatch(pageSource, /\.\.\/\.\.\/\.\./);
  assert.doesNotMatch(pageSource, /node:fs|readFileSync|process\.cwd/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `repos/orbits`:

```bash
npm test -- tests/pages/knowledge-wiki-page.test.tsx
```

Expected: FAIL because the page files do not exist yet.

- [ ] **Step 3: Implement the Wiki page**

Create `repos/orbits/app/dev/knowledge/page.tsx`:

```tsx
import "../../globals.css";
import { OrbitKnowledgeWiki } from "./knowledge-wiki";

export default function KnowledgePage() {
  return <OrbitKnowledgeWiki />;
}
```

Create `repos/orbits/app/dev/knowledge/knowledge-wiki.tsx`. It must:

- import `WorkbenchFrame`, `WorkbenchSurface`, and `Chip`;
- import `ORBIT_KNOWLEDGE_MANIFEST`;
- render `data-orbit-knowledge-wiki="true"`;
- show metric cards for total documents, `needs-code-check`, `known-stale`, and learnings;
- render sections titled `文档库入口`, `核心知识主题`, `开发历史`, and `排障经验`;
- use compact cards and source-path code labels.

- [ ] **Step 4: Add page files to lint typecheck list**

Modify `repos/orbits/package.json` `lint` script to include:

```text
"app/dev/knowledge/page.tsx"
"app/dev/knowledge/knowledge-wiki.tsx"
"tests/pages/knowledge-wiki-page.test.tsx"
"tests/services/knowledge-manifest.test.ts"
```

Keep the existing explicit file list and add the entries near existing dev page and tests entries.

- [ ] **Step 5: Run page test**

Run from `repos/orbits`:

```bash
npm test -- tests/pages/knowledge-wiki-page.test.tsx tests/services/knowledge-manifest.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add repos/orbits/app/dev/knowledge repos/orbits/tests/pages/knowledge-wiki-page.test.tsx repos/orbits/package.json
git commit -m "feat: add orbit knowledge wiki page"
```

---

### Task 5: Verification, Development History, And Completion Audit

**Files:**
- Modify: `knowledge/history/development-log.zh.md`
- Modify: `knowledge/log.zh.md`
- Modify if generated output changed: `knowledge/docs/catalog.json`
- Modify if generated output changed: `knowledge/docs/catalog.zh.md`
- Modify if generated output changed: `knowledge/docs/freshness-report.zh.md`
- Modify if generated output changed: `repos/orbits/shared/knowledge/knowledge-manifest.ts`

**Interfaces:**
- Consumes: Tasks 1-4.
- Produces: final verified state and updated project development history.

- [ ] **Step 1: Append final development history**

Append a Chinese entry to `knowledge/history/development-log.zh.md` with:

- date `2026-06-30`;
- user goal summary;
- implementation summary by task;
- related commits;
- verification commands and results;
- remaining known gaps, especially documents marked `needs-code-check`.

- [ ] **Step 2: Append knowledge maintenance log**

Append to `knowledge/log.zh.md`:

```md
## [2026-06-30] implementation | 文档库与知识库第一版

- 建立 `knowledge/` 知识库入口、文档 catalog、开发历史和 learnings 中文索引。
- 同步 `repos/orbits/shared/knowledge/knowledge-manifest.ts`。
- 新增 `/dev/knowledge` 可视化 Wiki 页面。
- 验证命令记录在 `knowledge/history/development-log.zh.md`。
```

- [ ] **Step 3: Rebuild generated knowledge artifacts**

Run from root:

```bash
node scripts/knowledge/build-catalog.mjs
node scripts/knowledge/sync-app-manifest.mjs
```

Expected: both commands exit 0.

- [ ] **Step 4: Run root knowledge tests**

Run:

```bash
node --test tests/knowledge-rules.test.mjs tests/knowledge-catalog.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Run focused app tests**

Run from `repos/orbits`:

```bash
npm test -- tests/services/knowledge-manifest.test.ts tests/pages/knowledge-wiki-page.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Run app lint**

Run from `repos/orbits`:

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 7: Check whitespace and staged scope**

Run from root:

```bash
git diff --check
git status --short
```

Expected: `git diff --check` exits 0. `git status --short` may show pre-existing unrelated dirty files, but knowledge task files must be identifiable and committed separately.

- [ ] **Step 8: Commit final history and regenerated artifacts**

```bash
git add knowledge/history/development-log.zh.md knowledge/log.zh.md knowledge/docs/catalog.json knowledge/docs/catalog.zh.md knowledge/docs/freshness-report.zh.md repos/orbits/shared/knowledge/knowledge-manifest.ts
git commit -m "docs: record knowledge wiki implementation history"
```

If Task 5 only regenerates artifacts already committed by earlier tasks and no diff remains, skip this commit and record that in the final response.

---

## Self-Review

Spec coverage:

- Single document query entry: Task 2 creates `knowledge/docs/catalog.zh.md`.
- Documentation and knowledge rules in AGENT files: Task 1 updates root and app AGENTS.
- Agent can understand project through docs: Task 1 creates `knowledge/index.zh.md`; Task 2 creates catalog; Task 3 syncs manifest.
- Development history: Task 1 creates `knowledge/history/development-log.zh.md`; Task 5 appends final entry.
- Learnings integration: Task 1 creates `knowledge/learnings/**`; Task 2 catalog includes `.learnings` paths.
- Chinese requirement: Tasks 1 and 2 test Chinese text; Task 3 and Task 4 test app-facing Chinese copy.
- Browser-visible Wiki page: Task 4 implements `/dev/knowledge`.
- Freshness/staleness: Task 2 creates freshness report and status fields.

Placeholder scan:

- The plan intentionally avoids unfinished placeholder markers and empty sections.
- Every generated artifact has an explicit path and verification command.

Type consistency:

- App manifest export is consistently named `ORBIT_KNOWLEDGE_MANIFEST`.
- Root catalog uses `documents`, `schemaVersion`, and `generatedOn`.
- The page test and implementation both use `/dev/knowledge` and `data-orbit-knowledge-wiki="true"`.
