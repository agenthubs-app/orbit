#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const generatedOn = "2026-06-30";
const docsDir = join(projectRoot, "knowledge/docs");

const statuses = new Set([
  "current",
  "historical",
  "superseded",
  "needs-review",
  "generated-evidence",
]);
const freshnessValues = new Set([
  "verified-current",
  "likely-current",
  "needs-code-check",
  "known-stale",
]);

function doc({
  id,
  titleZh,
  summaryZh,
  sourcePath,
  category,
  status = "current",
  freshness = "likely-current",
  ownerArea,
  relatedCodePaths = [],
  relatedKnowledgePages = [],
}) {
  return {
    id,
    titleZh,
    summaryZh,
    sourcePath,
    category,
    status,
    freshness,
    ownerArea,
    relatedCodePaths,
    relatedKnowledgePages,
    lastReviewedOn: generatedOn,
  };
}

const moduleDocs = [
  "account",
  "acquisition",
  "agent",
  "ai-provider",
  "analysis",
  "audit",
  "bootstrap",
  "chat",
  "connections",
  "contacts",
  "dashboard",
  "events",
  "followups",
  "notifications",
  "orbit-ai",
  "permissions",
  "profile",
  "recommendations",
  "search",
].map((moduleId) =>
  doc({
    id: `module-${moduleId}`,
    titleZh: `${moduleId} 模块架构`,
    summaryZh: `说明 ${moduleId} 模块的定位、期望行为、Mock 行为和热拔插边界。字段和状态仍以对应 contract 文件为准。`,
    sourcePath: `repos/orbits/docs/architecture/modules/${moduleId}.md`,
    category: "module-architecture",
    freshness: "verified-current",
    ownerArea: `module:${moduleId}`,
    relatedCodePaths:
      moduleId === "ai-provider"
        ? ["repos/orbits/shared/ai/service-factory.ts"]
        : [`repos/orbits/features/${moduleId}/service-factory.ts`],
    relatedKnowledgePages: ["knowledge/wiki/modules.zh.md"],
  }),
);

const featureDesignDocs = [
  "account",
  "acquisition",
  "agent",
  "analysis",
  "audit",
  "bootstrap",
  "chat",
  "connections",
  "contacts",
  "dashboard",
  "events",
  "followups",
  "notifications",
  "orbit-ai",
  "permissions",
  "profile",
  "recommendations",
  "search",
].map((moduleId) =>
  doc({
    id: `feature-${moduleId}-design`,
    titleZh: `${moduleId} Feature 设计`,
    summaryZh: `记录 ${moduleId} feature 的设计边界和 mock-first 实施方向，是模块文档之后的第二层阅读材料。`,
    sourcePath: `repos/orbits/features/${moduleId}/DESIGN.md`,
    category: "feature-design",
    status: "needs-review",
    freshness: "needs-code-check",
    ownerArea: `feature:${moduleId}`,
    relatedCodePaths: [`repos/orbits/features/${moduleId}`],
    relatedKnowledgePages: ["knowledge/wiki/modules.zh.md"],
  }),
);

const documents = [
  doc({
    id: "root-agent-operating-notes",
    titleZh: "根 Agent 运行规则",
    summaryZh: "定义 harness、repos/orbits、参考项目、sprint 粒度、产品化策略和知识库维护规则。",
    sourcePath: "AGENT.md",
    category: "harness",
    freshness: "verified-current",
    ownerArea: "root",
    relatedCodePaths: ["harness", "repos/orbits"],
    relatedKnowledgePages: ["knowledge/wiki/harness.zh.md"],
  }),
  doc({
    id: "app-agent-rules",
    titleZh: "Orbits App Agent 规则",
    summaryZh: "定义 app repo 内实现边界、mock/live 替换、产品 UI 与 contract 解耦，以及 /dev/knowledge manifest 规则。",
    sourcePath: "repos/orbits/AGENTS.md",
    category: "technical-design",
    freshness: "verified-current",
    ownerArea: "repos/orbits",
    relatedCodePaths: ["repos/orbits/app", "repos/orbits/features", "repos/orbits/shared"],
    relatedKnowledgePages: ["knowledge/wiki/architecture.zh.md"],
  }),
  doc({
    id: "product-design-current",
    titleZh: "Orbit 产品设计",
    summaryZh: "描述 Orbit 复杂版产品方向，是理解关系资产、人脉管理和 Agent 目标的产品来源。",
    sourcePath: "docs/designs/inital_design.md",
    category: "product-design",
    freshness: "likely-current",
    ownerArea: "product",
    relatedKnowledgePages: ["knowledge/wiki/project-overview.zh.md"],
  }),
  doc({
    id: "product-design-v0",
    titleZh: "Orbit 产品设计 v0",
    summaryZh: "早期产品设计版本，保留用于理解历史上下文，阅读时应和当前产品设计对照。",
    sourcePath: "docs/designs/inital_design.v0.md",
    category: "product-design",
    status: "historical",
    freshness: "needs-code-check",
    ownerArea: "product",
    relatedKnowledgePages: ["knowledge/wiki/project-overview.zh.md"],
  }),
  doc({
    id: "technical-design",
    titleZh: "Orbit 技术设计",
    summaryZh: "说明 mock-first、contract-first、模块拆分、Next.js App Router 和服务层边界。",
    sourcePath: "docs/designs/orbit_technical_design.md",
    category: "technical-design",
    freshness: "likely-current",
    ownerArea: "architecture",
    relatedCodePaths: ["repos/orbits/app", "repos/orbits/features", "repos/orbits/shared"],
    relatedKnowledgePages: ["knowledge/wiki/architecture.zh.md"],
  }),
  doc({
    id: "modular-design",
    titleZh: "模块化与热拔插设计",
    summaryZh: "当前 app 模块化原则文档，说明 service factory、mock/hybrid/live 和 route view-model 防腐层。",
    sourcePath: "repos/orbits/docs/architecture/modular-design.md",
    category: "architecture",
    freshness: "verified-current",
    ownerArea: "architecture",
    relatedCodePaths: ["repos/orbits/features", "repos/orbits/shared/services/module-mode.ts"],
    relatedKnowledgePages: ["knowledge/wiki/architecture.zh.md", "knowledge/wiki/modules.zh.md"],
  }),
  doc({
    id: "local-remote-database",
    titleZh: "Local Remote Database 边界",
    summaryZh: "说明 app 本地/远端数据库边界和 relationship schema。由于数据层近期变化频繁，需要持续代码核对。",
    sourcePath: "repos/orbits/docs/architecture/local-remote-database.md",
    category: "architecture",
    status: "needs-review",
    freshness: "needs-code-check",
    ownerArea: "data",
    relatedCodePaths: ["repos/orbits/shared/local-remote-store/orbit-database.ts"],
    relatedKnowledgePages: ["knowledge/wiki/data-and-mockdata.zh.md"],
  }),
  doc({
    id: "orbit-ai-performance-check",
    titleZh: "Orbit AI 性能检查",
    summaryZh: "记录 2026-06-30 Orbit AI Agent 性能检查，作为优化历史和风险背景。",
    sourcePath: "repos/orbits/docs/architecture/orbit-ai-agent-performance-check-2026-06-30.md",
    category: "architecture",
    status: "historical",
    freshness: "needs-code-check",
    ownerArea: "orbit-ai",
    relatedCodePaths: ["repos/orbits/features/orbit-ai"],
    relatedKnowledgePages: ["knowledge/wiki/agent-system.zh.md"],
  }),
  ...moduleDocs,
  ...featureDesignDocs,
  doc({
    id: "capability-first-sprint-design",
    titleZh: "Capability-first Sprint 设计",
    summaryZh: "解释为什么早期 Orbit sprint 以能力边界而不是页面组件为中心。",
    sourcePath: "docs/superpowers/specs/2026-06-24-capability-first-sprint-design.md",
    category: "sprint-spec",
    freshness: "likely-current",
    ownerArea: "harness",
    relatedKnowledgePages: ["knowledge/wiki/harness.zh.md"],
  }),
  doc({
    id: "component-level-sprint-design",
    titleZh: "Component-level Sprint 旧设计",
    summaryZh: "早期组件级 sprint 设计，已被 capability-first 设计替代。",
    sourcePath: "docs/superpowers/specs/2026-06-24-component-level-sprint-design.md",
    category: "sprint-spec",
    status: "superseded",
    freshness: "known-stale",
    ownerArea: "harness",
    relatedKnowledgePages: ["knowledge/wiki/harness.zh.md"],
  }),
  doc({
    id: "orbit-product-chat-agent-design",
    titleZh: "产品级 Chat Agent 设计",
    summaryZh: "记录 Orbit 产品级 Chat Agent 的目标、边界和 agent 工作流判断。",
    sourcePath: "docs/superpowers/specs/2026-06-29-orbit-product-chat-agent-design.md",
    category: "sprint-spec",
    freshness: "needs-code-check",
    ownerArea: "orbit-ai",
    relatedKnowledgePages: ["knowledge/wiki/agent-system.zh.md"],
  }),
  doc({
    id: "bounded-react-tool-registry",
    titleZh: "Bounded ReAct 工具注册设计",
    summaryZh: "设计 Orbit AI bounded ReAct runtime、工具 registry、policy gate、确认边界和工具风险等级。",
    sourcePath: "docs/superpowers/specs/2026-06-30-orbit-bounded-react-tool-registry-design.md",
    category: "sprint-spec",
    freshness: "likely-current",
    ownerArea: "orbit-ai",
    relatedCodePaths: ["repos/orbits/features/orbit-ai/agent-tools/registry.ts"],
    relatedKnowledgePages: ["knowledge/wiki/agent-system.zh.md"],
  }),
  doc({
    id: "trace-tool-catalog-plan",
    titleZh: "Orbit AI Trace 工具目录计划",
    summaryZh: "实施 trace debug 页面展示工具 catalog 和中文规格说明的计划。",
    sourcePath: "docs/superpowers/plans/2026-06-30-orbit-ai-trace-tool-catalog.md",
    category: "implementation-plan",
    freshness: "likely-current",
    ownerArea: "orbit-ai",
    relatedCodePaths: ["repos/orbits/app/dev/orbit-ai/trace", "repos/orbits/features/orbit-ai"],
    relatedKnowledgePages: ["knowledge/wiki/agent-system.zh.md"],
  }),
  doc({
    id: "knowledge-wiki-design",
    titleZh: "文档库与知识库设计",
    summaryZh: "本次知识库目标的设计文档，定义 knowledge 目录、catalog、开发历史、learnings 和 /dev/knowledge 页面。",
    sourcePath: "docs/superpowers/specs/2026-06-30-orbit-docs-knowledge-wiki-design.md",
    category: "sprint-spec",
    freshness: "verified-current",
    ownerArea: "knowledge",
    relatedKnowledgePages: ["knowledge/index.zh.md"],
  }),
  doc({
    id: "knowledge-wiki-plan",
    titleZh: "文档库与知识库实施计划",
    summaryZh: "把知识库目标拆成可测试任务：骨架、catalog、app manifest、可视化页面和最终验证。",
    sourcePath: "docs/superpowers/plans/2026-06-30-orbit-docs-knowledge-wiki.md",
    category: "implementation-plan",
    freshness: "verified-current",
    ownerArea: "knowledge",
    relatedKnowledgePages: ["knowledge/index.zh.md"],
  }),
  doc({
    id: "hybrid-mockdata-handoff-design",
    titleZh: "Hybrid Mockdata Handoff 设计",
    summaryZh: "定义 relationship mockdata 如何生成 TypeScript fixture 并接入 hybrid local-remote database。",
    sourcePath: "docs/superpowers/specs/2026-06-30-hybrid-mockdata-handoff-design.md",
    category: "sprint-spec",
    freshness: "needs-code-check",
    ownerArea: "data",
    relatedCodePaths: ["harness/relationship_data_goal_runner.py", "repos/orbits/shared/mock/fixtures.ts"],
    relatedKnowledgePages: ["knowledge/wiki/data-and-mockdata.zh.md"],
  }),
  doc({
    id: "hybrid-mockdata-handoff-plan",
    titleZh: "Hybrid Mockdata Handoff 计划",
    summaryZh: "实施 generated relationship fixture 接入 app mock/hybrid 数据层的计划。",
    sourcePath: "docs/superpowers/plans/2026-06-30-hybrid-mockdata-handoff.md",
    category: "implementation-plan",
    status: "needs-review",
    freshness: "needs-code-check",
    ownerArea: "data",
    relatedKnowledgePages: ["knowledge/wiki/data-and-mockdata.zh.md"],
  }),
  doc({
    id: "harness-readme",
    titleZh: "Orbit 长跑 Harness README",
    summaryZh: "说明 harness 架构、命令、运行证据和长跑开发流程，是 harness 操作的主要英文来源。",
    sourcePath: "harness/README.md",
    category: "harness",
    status: "needs-review",
    freshness: "needs-code-check",
    ownerArea: "harness",
    relatedCodePaths: ["harness"],
    relatedKnowledgePages: ["knowledge/wiki/harness.zh.md"],
  }),
  doc({
    id: "harness-state-spec",
    titleZh: "Harness 执行规格摘要",
    summaryZh: "当前 harness-state/spec 是执行摘要，不是 sprint 详细需求来源。",
    sourcePath: "harness-state/spec.md",
    category: "harness",
    freshness: "needs-code-check",
    ownerArea: "harness",
    relatedKnowledgePages: ["knowledge/wiki/harness.zh.md"],
  }),
  doc({
    id: "harness-sprints-index",
    titleZh: "Harness Sprint 索引",
    summaryZh: "人类可读 sprint 历史索引，具体成功标准仍以 contract JSON 为准。",
    sourcePath: "harness-state/sprints.md",
    category: "harness",
    freshness: "needs-code-check",
    ownerArea: "harness",
    relatedKnowledgePages: ["knowledge/wiki/harness.zh.md"],
  }),
  doc({
    id: "product-facing-sprints",
    titleZh: "产品化 Sprint Backlog",
    summaryZh: "记录 Sprint 68 后从 mock capability loop 转向 /app/** 产品表面的产品化 backlog。",
    sourcePath: "harness-state/productization-notes/product-facing-sprints.md",
    category: "harness",
    status: "needs-review",
    freshness: "needs-code-check",
    ownerArea: "product",
    relatedKnowledgePages: ["knowledge/wiki/project-overview.zh.md"],
  }),
  doc({
    id: "mockdata-design",
    titleZh: "Relationship Mockdata 设计",
    summaryZh: "用于生成关系 mock 数据、AI 画像建模、活动场景和 demo 数据的长文档。",
    sourcePath: "repos/mockdata/orbit_mock_data_ai_relationship_design.md",
    category: "mockdata",
    status: "needs-review",
    freshness: "needs-code-check",
    ownerArea: "data",
    relatedCodePaths: ["harness/relationship_data_goal_runner.py", "repos/mockdata"],
    relatedKnowledgePages: ["knowledge/wiki/data-and-mockdata.zh.md"],
  }),
  doc({
    id: "mockdata-generation-readme",
    titleZh: "Mockdata 生成 README",
    summaryZh: "说明 relationship mockdata 生成目录和运行方式，需要和当前 generator 代码保持同步。",
    sourcePath: "repos/mockdata/generation/README.md",
    category: "mockdata",
    status: "needs-review",
    freshness: "needs-code-check",
    ownerArea: "data",
    relatedCodePaths: ["repos/mockdata/generation", "harness/relationship_data_goal_runner.py"],
    relatedKnowledgePages: ["knowledge/wiki/data-and-mockdata.zh.md"],
  }),
  doc({
    id: "trace-debug-design",
    titleZh: "Orbit AI Trace Debug 设计",
    summaryZh: "设计 /dev/orbit-ai/trace 调试页面，用于观察 pipeline、trace、工具调用和运行快照。",
    sourcePath: "repos/orbits/docs/superpowers/specs/2026-06-29-orbit-ai-trace-debug-design.zh.md",
    category: "sprint-spec",
    freshness: "likely-current",
    ownerArea: "orbit-ai",
    relatedCodePaths: ["repos/orbits/app/dev/orbit-ai/trace"],
    relatedKnowledgePages: ["knowledge/wiki/agent-system.zh.md"],
  }),
  doc({
    id: "trace-debug-plan",
    titleZh: "Orbit AI Trace Debug 计划",
    summaryZh: "实现 Orbit AI trace debug 页面和 API 的计划。",
    sourcePath: "repos/orbits/docs/superpowers/plans/2026-06-29-orbit-ai-trace-debug.md",
    category: "implementation-plan",
    freshness: "likely-current",
    ownerArea: "orbit-ai",
    relatedKnowledgePages: ["knowledge/wiki/agent-system.zh.md"],
  }),
  doc({
    id: "mock-to-live-sprint-68",
    titleZh: "Sprint 68 Mock-to-Live 交接文档",
    summaryZh: "记录 capability-first framework mock mode 到 live implementation 的替换要求。",
    sourcePath:
      "repos/orbits/docs/mock-to-live/verify-that-the-capability-first-framework-can-run-the-mvp-loop-in-mock-mode-wit/LIVE_IMPLEMENTATION.md",
    category: "implementation-handoff",
    status: "needs-review",
    freshness: "needs-code-check",
    ownerArea: "architecture",
    relatedKnowledgePages: ["knowledge/wiki/architecture.zh.md"],
  }),
  doc({
    id: "learning-troubleshooting",
    titleZh: "根排障知识",
    summaryZh: "记录 Orbit AI trace submit loading、provider timeout 和 responsive submit 控件等排障过程。",
    sourcePath: ".learnings/TROUBLESHOOTING.md",
    category: "learning",
    freshness: "likely-current",
    ownerArea: "learning",
    relatedKnowledgePages: ["knowledge/learnings/troubleshooting.zh.md"],
  }),
  doc({
    id: "learning-errors",
    titleZh: "根错误记录",
    summaryZh: "记录 harness 依赖、tsx eval、provider hang 和 git diff 命令等错误经验。",
    sourcePath: ".learnings/ERRORS.md",
    category: "learning",
    freshness: "likely-current",
    ownerArea: "learning",
    relatedKnowledgePages: ["knowledge/learnings/errors.zh.md"],
  }),
  doc({
    id: "learning-patterns-root",
    titleZh: "根通用经验",
    summaryZh: "记录用户反馈、harness best practices 和项目维护经验。",
    sourcePath: ".learnings/LEARNINGS.md",
    category: "learning",
    freshness: "likely-current",
    ownerArea: "learning",
    relatedKnowledgePages: ["knowledge/learnings/patterns.zh.md"],
  }),
  doc({
    id: "learning-performance",
    titleZh: "性能经验",
    summaryZh: "记录性能检查相关经验，作为后续优化和回归排查入口。",
    sourcePath: ".learnings/PERFORMANCE.md",
    category: "learning",
    status: "needs-review",
    freshness: "needs-code-check",
    ownerArea: "learning",
    relatedKnowledgePages: ["knowledge/learnings/patterns.zh.md"],
  }),
  doc({
    id: "app-learning-errors",
    titleZh: "App 错误记录",
    summaryZh: "记录 repos/orbits 内 fixture migration、comment patch、git diff 正则等错误经验。",
    sourcePath: "repos/orbits/.learnings/ERRORS.md",
    category: "learning",
    freshness: "likely-current",
    ownerArea: "learning",
    relatedKnowledgePages: ["knowledge/learnings/errors.zh.md"],
  }),
  doc({
    id: "app-learning-patterns",
    titleZh: "App 经验记录",
    summaryZh: "记录 framework/mock/live 解耦、提交范围检查和注释提交卫生等经验。",
    sourcePath: "repos/orbits/.learnings/LEARNINGS.md",
    category: "learning",
    freshness: "likely-current",
    ownerArea: "learning",
    relatedKnowledgePages: ["knowledge/learnings/patterns.zh.md"],
  }),
];

function walkMarkdown(dir) {
  const absolute = join(projectRoot, dir);
  if (!existsSync(absolute)) return [];
  return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = join(absolute, entry.name);
    const relativePath = relative(projectRoot, absolutePath);
    if (
      relativePath.startsWith("harness-state/runs/") ||
      relativePath.startsWith("harness-state/tmp/") ||
      relativePath.includes("/node_modules/") ||
      relativePath.includes("/.next/")
    ) {
      return [];
    }
    if (entry.isDirectory()) {
      return walkMarkdown(relativePath);
    }
    return /\.mdx?$/.test(entry.name) ? [relativePath] : [];
  });
}

function validateDocuments() {
  const ids = new Set();
  const missing = [];
  const invalid = [];
  for (const entry of documents) {
    if (ids.has(entry.id)) invalid.push(`duplicate id ${entry.id}`);
    ids.add(entry.id);
    if (!/[\u4e00-\u9fff]/.test(entry.titleZh)) invalid.push(`${entry.id} missing Chinese title`);
    if (!/[\u4e00-\u9fff]/.test(entry.summaryZh)) invalid.push(`${entry.id} missing Chinese summary`);
    if (!existsSync(join(projectRoot, entry.sourcePath))) missing.push(entry.sourcePath);
    if (entry.sourcePath.startsWith("harness-state/runs/")) invalid.push(`${entry.id} uses run snapshot`);
    if (!statuses.has(entry.status)) invalid.push(`${entry.id} invalid status`);
    if (!freshnessValues.has(entry.freshness)) invalid.push(`${entry.id} invalid freshness`);
  }
  if (missing.length || invalid.length) {
    throw new Error(
      [
        missing.length ? `Missing source paths:\n${missing.join("\n")}` : "",
        invalid.length ? `Invalid catalog entries:\n${invalid.join("\n")}` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
    );
  }
}

function groupedDocuments() {
  const groups = new Map();
  for (const entry of documents) {
    if (!groups.has(entry.category)) groups.set(entry.category, []);
    groups.get(entry.category).push(entry);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function renderCatalogMarkdown() {
  const lines = [
    "# Orbit 文档库目录",
    "",
    "这是 Orbit 的文档查询入口。每个条目提供中文简介、来源路径、状态、新鲜度和关联知识页。默认不收录 `harness-state/runs/**` 运行快照。",
    "",
    `生成日期：${generatedOn}`,
    "",
    "## 文档查询入口",
    "",
  ];

  for (const [category, entries] of groupedDocuments()) {
    lines.push(`### ${category}`, "");
    for (const entry of entries) {
      lines.push(
        `- **${entry.titleZh}**（\`${entry.sourcePath}\`）`,
        `  - 简介：${entry.summaryZh}`,
        `  - 状态：\`${entry.status}\`；新鲜度：\`${entry.freshness}\`；负责人域：\`${entry.ownerArea}\``,
        `  - 关联知识页：${entry.relatedKnowledgePages.map((page) => `\`${page}\``).join("、") || "暂无"}`,
      );
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function renderFreshnessReport() {
  const allMarkdown = [
    "AGENT.md",
    "repos/orbits/AGENTS.md",
    ...walkMarkdown("docs"),
    ...walkMarkdown("harness"),
    ...walkMarkdown("harness-state"),
    ...walkMarkdown("repos/mockdata"),
    ...walkMarkdown("repos/orbits/docs"),
    ...walkMarkdown("repos/orbits/features"),
    ...walkMarkdown(".learnings"),
    ...walkMarkdown("repos/orbits/.learnings"),
  ].sort();
  const cataloged = new Set(documents.map((entry) => entry.sourcePath));
  const uncataloged = allMarkdown.filter((path) => !cataloged.has(path));
  const needsReview = documents.filter((entry) => entry.freshness === "needs-code-check");
  const knownStale = documents.filter((entry) => entry.freshness === "known-stale");

  const lines = [
    "# Orbit 文档新鲜度报告",
    "",
    `生成日期：${generatedOn}`,
    "",
    "## 摘要",
    "",
    `- 已纳入 catalog：${documents.length} 个文档。`,
    `- 需要代码核对（needs-code-check）：${needsReview.length} 个文档。`,
    `- 已知过期（known-stale）：${knownStale.length} 个文档。`,
    `- 未纳入首版目录：${uncataloged.length} 个 Markdown。`,
    "",
    "## 需要代码核对",
    "",
    ...needsReview.map((entry) => `- \`${entry.sourcePath}\`：${entry.summaryZh}`),
    "",
    "## 已知过期",
    "",
    ...(knownStale.length
      ? knownStale.map((entry) => `- \`${entry.sourcePath}\`：${entry.summaryZh}`)
      : ["- 暂无。"]),
    "",
    "## 未纳入首版目录",
    "",
    ...(uncataloged.length
      ? uncataloged.map((path) => `- \`${path}\``)
      : ["- 首版扫描范围内的 Markdown 都已纳入。"]),
    "",
    "## 规则",
    "",
    "- `harness-state/runs/**` 和 `harness-state/tmp/**` 默认排除，只能作为历史证据引用。",
    "- `needs-code-check` 不代表文档错误，只代表还没有足够证据证明它和当前代码完全一致。",
  ];

  return `${lines.join("\n")}\n`;
}

validateDocuments();
mkdirSync(docsDir, { recursive: true });
writeFileSync(
  join(docsDir, "catalog.json"),
  `${JSON.stringify({ schemaVersion: 1, generatedOn, documents }, null, 2)}\n`,
);
writeFileSync(join(docsDir, "catalog.zh.md"), renderCatalogMarkdown());
writeFileSync(join(docsDir, "freshness-report.zh.md"), renderFreshnessReport());

console.log(`Wrote ${documents.length} knowledge catalog entries.`);
