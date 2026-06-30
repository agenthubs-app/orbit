# Wiki 中文镜像实施计划

本页是 Orbit Wiki 的中文阅读版。它保留原始文档的路径、代码块、命令和接口标识，用中文说明阅读目的、审计依据和结构入口。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `docs/superpowers/plans/2026-06-30-knowledge-wiki-chinese-mirrors.md` |
| 中文镜像 | `knowledge/docs/zh/knowledge-wiki-chinese-mirrors-plan.zh.md` |
| 分类 | `implementation-plan` |
| 状态 | `current` |
| 新鲜度 | `verified-current` |
| 负责人域 | `knowledge` |

## 中文摘要

定义每个 catalog 文档如何保留原始来源，同时生成中文阅读版供 /dev/knowledge 默认展示。

## 审计依据

已登记来源文档，后续变更通过 catalog 新鲜度状态追踪。

## 结构化阅读入口

- 第 1 节：知识 Wiki Chinese Mirrors 实现 计划
- 第 2 节：源文档第 2 个标题
- 第 3 节：任务 1: Lock the Chinese Mirror 契约 in 测试
- 第 4 节：任务 2: Generate Chinese Mirror Documents
- 第 5 节：任务 3: Add localizedSourcePath to Catalog and Manifest
- 第 6 节：任务 4: Render Chinese Mirrors in dev 知识
- 第 7 节：任务 5: Document and Verify
- 第 8 节：源文档第 8 个标题

## 保留的代码与命令证据

### 代码证据 1

```bash
node --test tests/knowledge-catalog.test.mjs
cd repos/orbits && node --test --import tsx tests/pages/knowledge-wiki-page.test.tsx
```

### 代码证据 2

```js
const mirrorPath = `knowledge/docs/zh/${entry.id}.zh.md`;
```

### 代码证据 3

```bash
node scripts/knowledge/generate-chinese-doc-mirrors.mjs
```

### 代码证据 4

```bash
node scripts/knowledge/build-catalog.mjs
node scripts/knowledge/generate-chinese-doc-mirrors.mjs
node scripts/knowledge/sync-app-manifest.mjs
```

### 代码证据 5

```bash
cd repos/orbits
node --test --import tsx tests/api/knowledge-document-content.test.ts tests/pages/knowledge-wiki-page.test.tsx
```

### 代码证据 6

```bash
node --test tests/knowledge-rules.test.mjs tests/knowledge-catalog.test.mjs
cd repos/orbits && npm test && npm run lint
git diff --check
```

## 源文档正文

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every cataloged Orbit Wiki document open as a Chinese reading page without overwriting the original Markdown sources.

**Architecture:** Add a deterministic Chinese mirror layer under `knowledge/docs/zh/`. The catalog and app manifest expose `localizedSourcePath`, and the dev-only document reader prefers that Chinese mirror path. Tests fail when any catalog entry lacks a mirror or when the wiki source falls back to `sourcePath` for rendered article content.

**Tech Stack:** Node.js scripts, Next.js App Router, TypeScript, `react-markdown`, `remark-gfm`, Node test runner with `tsx`.

## Global Constraints

- Do not overwrite the original source Markdown files listed by `sourcePath`.
- Every `knowledge/docs/catalog.json` document must have a generated or curated Chinese mirror file.
- Chinese mirror files must preserve source paths, code identifiers, commands, API names, file names, JSON/YAML/code fences, and audit evidence.
- `/dev/knowledge` must render the Chinese mirror body; missing mirrors must fail tests instead of silently showing English.
- Maintain the existing dev-only document content security boundary: manifest whitelist, project-root path guard, no production exposure.
- Update `knowledge/history/development-log.zh.md`, `knowledge/log.zh.md`, and app-local manifest history for this change.

---

### Task 1: Lock the Chinese Mirror Contract in Tests

**Files:**
- Modify: `tests/knowledge-catalog.test.mjs`
- Modify: `repos/orbits/tests/pages/knowledge-wiki-page.test.tsx`

**Interfaces:**
- Consumes: `knowledge/docs/catalog.json`
- Produces: failing tests for `localizedSourcePath` and Chinese document rendering

- [ ] **Step 1: Add the failing catalog test**

Add a test that iterates through `catalog.documents`, asserts `localizedSourcePath` is a string under `knowledge/docs/zh/`, asserts the file exists, and asserts each mirror contains the source path and Chinese marker `中文阅读版`.

- [ ] **Step 2: Add the failing wiki rendering test**

Extend `knowledge wiki document URLs render markdown on the first page load` so it expects the rendered source text to mention `knowledge/docs/zh/` and the rendered body to contain `中文阅读版`.

- [ ] **Step 3: Run the tests and confirm RED**

Run:

```bash
node --test tests/knowledge-catalog.test.mjs
cd repos/orbits && node --test --import tsx tests/pages/knowledge-wiki-page.test.tsx
```

Expected: both fail because `localizedSourcePath` and mirror files do not exist yet.

### Task 2: Generate Chinese Mirror Documents

**Files:**
- Create: `scripts/knowledge/generate-chinese-doc-mirrors.mjs`
- Create: `knowledge/docs/zh/**/*.zh.md`

**Interfaces:**
- Consumes: `knowledge/docs/catalog.json`
- Produces: one Chinese mirror Markdown file per catalog document

- [ ] **Step 1: Implement the generator**

Create a Node script that:

```js
const mirrorPath = `knowledge/docs/zh/${entry.id}.zh.md`;
```

and writes a Markdown page with:

- H1 from `titleZh`
- source metadata table in Chinese
- `summaryZh`
- `reviewEvidenceZh`
- source headings converted into a Chinese reading outline
- code fences and inline code preserved as source evidence

- [ ] **Step 2: Run the generator**

Run:

```bash
node scripts/knowledge/generate-chinese-doc-mirrors.mjs
```

Expected: 146 mirror files under `knowledge/docs/zh/`.

### Task 3: Add `localizedSourcePath` to Catalog and Manifest

**Files:**
- Modify: `scripts/knowledge/build-catalog.mjs`
- Modify: `scripts/knowledge/sync-app-manifest.mjs`
- Generated: `knowledge/docs/catalog.json`
- Generated: `knowledge/docs/catalog.zh.md`
- Generated: `repos/orbits/shared/knowledge/knowledge-manifest.ts`

**Interfaces:**
- Produces: `localizedSourcePath` on every document entry

- [ ] **Step 1: Add `localizedSourcePath` in `doc()`**

Set `localizedSourcePath` to `knowledge/docs/zh/${id}.zh.md` unless explicitly overridden.

- [ ] **Step 2: Include the field in app manifest sync**

Add `localizedSourcePath: entry.localizedSourcePath` to each manifest document.

- [ ] **Step 3: Rebuild generated files**

Run:

```bash
node scripts/knowledge/build-catalog.mjs
node scripts/knowledge/generate-chinese-doc-mirrors.mjs
node scripts/knowledge/sync-app-manifest.mjs
```

Expected: catalog, Chinese catalog, mirror files, and app manifest are synchronized.

### Task 4: Render Chinese Mirrors in `/dev/knowledge`

**Files:**
- Modify: `repos/orbits/app/dev/knowledge/read-knowledge-document.ts`
- Modify: `repos/orbits/app/dev/knowledge/knowledge-wiki.tsx`
- Test: `repos/orbits/tests/api/knowledge-document-content.test.ts`
- Test: `repos/orbits/tests/pages/knowledge-wiki-page.test.tsx`

**Interfaces:**
- Consumes: `document.localizedSourcePath`
- Produces: API and page content from Chinese mirror path

- [ ] **Step 1: Update the reader**

In `readDevKnowledgeDocumentContent`, resolve `document.localizedSourcePath`. Throw `NOT_FOUND` if it is missing or unreadable. Continue returning `sourcePath`, but point it at the localized path used for display.

- [ ] **Step 2: Update page copy**

Change the loaded-state copy from `读取 Markdown 原文` to `读取中文 Markdown 阅读版`.

- [ ] **Step 3: Run targeted tests**

Run:

```bash
cd repos/orbits
node --test --import tsx tests/api/knowledge-document-content.test.ts tests/pages/knowledge-wiki-page.test.tsx
```

Expected: all targeted tests pass.

### Task 5: Document and Verify

**Files:**
- Modify: `knowledge/AGENTS.md`
- Modify: `knowledge/history/development-log.zh.md`
- Modify: `knowledge/log.zh.md`
- Modify: `scripts/knowledge/sync-app-manifest.mjs`

**Interfaces:**
- Produces: durable maintenance rule and recent history entry

- [ ] **Step 1: Add the maintenance rule**

State that every catalog document must have a Chinese mirror and that `/dev/knowledge` must not silently show English source content.

- [ ] **Step 2: Add development history and manifest history**

Record this change as `Wiki 文档中文镜像层`.

- [ ] **Step 3: Run final verification**

Run:

```bash
node --test tests/knowledge-rules.test.mjs tests/knowledge-catalog.test.mjs
cd repos/orbits && npm test && npm run lint
git diff --check
```

Expected: all tests and lint pass.

## Self-Review

- Spec coverage: every requirement from the approved design maps to a task.
- Placeholder scan: no TBD/TODO/later placeholders.
- Type consistency: `localizedSourcePath` is the single manifest/catalog field used by scripts, API, and tests.
