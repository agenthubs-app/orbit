#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
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
  reviewEvidenceZh,
  sourcePath,
  localizedSourcePath,
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
    reviewEvidenceZh:
      reviewEvidenceZh ??
      (relatedCodePaths.length
        ? `已登记关联代码路径：${relatedCodePaths.join("、")}。`
        : "已登记来源文档，后续变更通过 catalog 新鲜度状态追踪。"),
    sourcePath,
    localizedSourcePath: localizedSourcePath ?? `knowledge/docs/zh/${id}.zh.md`,
    category,
    status,
    freshness,
    ownerArea,
    relatedCodePaths,
    relatedKnowledgePages,
    lastReviewedOn: generatedOn,
  };
}

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
      relativePath.includes("/.next/") ||
      relativePath.includes("/dist/") ||
      relativePath.includes("/coverage/")
    ) {
      return [];
    }
    if (entry.isDirectory()) {
      return walkMarkdown(relativePath);
    }
    return /\.mdx?$/.test(entry.name) ? [relativePath] : [];
  });
}

function uniqueSorted(paths) {
  return [...new Set(paths)].sort();
}

function readableSlug(slug) {
  return slug.replace(/[-_]+/g, " ");
}

function liveImplementationDoc(sourcePath) {
  const parentDir = dirname(sourcePath);
  const segments = sourcePath.split("/");
  const parentName = readableSlug(segments.at(-2) ?? sourcePath);
  const featureMatch = sourcePath.match(/^repos\/orbits\/features\/([^/]+)\/([^/]+)\//);
  const appMatch = sourcePath.match(/^repos\/orbits\/app\/(.+)\/[^/]+$/);
  const sharedMatch = sourcePath.match(/^repos\/orbits\/shared\/([^/]+)\//);

  if (featureMatch) {
    const [, moduleId, capabilityId] = featureMatch;
    const capability = readableSlug(capabilityId);
    return doc({
      id: `live-handoff-feature-${moduleId}-${capabilityId}`,
      titleZh: `${moduleId} 能力 Live 交接：${capability}`,
      summaryZh: `记录 ${moduleId} 模块中 ${capability} 能力从 mock-first 实现切换到 live provider 时需要替换和验证的边界。`,
      reviewEvidenceZh:
        `已核对对应 feature 目录存在：${parentDir}。目录级实时行为仍以 service factory、API route 和测试为准。`,
      sourcePath,
      category: "implementation-handoff",
      status: "generated-evidence",
      freshness: "likely-current",
      ownerArea: `feature:${moduleId}`,
      relatedCodePaths: [parentDir, `repos/orbits/features/${moduleId}/service-factory.ts`],
      relatedKnowledgePages: ["knowledge/wiki/modules.zh.md"],
    });
  }

  if (appMatch) {
    const routeLabel = readableSlug(appMatch[1].replace(/^(\(app\)\/)?app\//, ""));
    return doc({
      id: `live-handoff-app-${sourcePath
        .replace(/^repos\/orbits\/app\//, "")
        .replace(/\/LIVE_IMPLEMENTATION\.md$/, "")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-|-$/g, "")}`,
      titleZh: `App 页面组合交接：${routeLabel}`,
      summaryZh: `记录 app 路由 ${routeLabel} 如何由已批准的 mock-first capability 组合成可运行页面，以及未来 live 替换时需要保留的交互边界。`,
      reviewEvidenceZh:
        `已核对页面目录存在：${parentDir}。页面是否仍完全匹配文档，需要结合 route view-model 和页面测试继续审计。`,
      sourcePath,
      category: "implementation-handoff",
      status: "generated-evidence",
      freshness: "likely-current",
      ownerArea: "app",
      relatedCodePaths: [parentDir],
      relatedKnowledgePages: ["knowledge/wiki/architecture.zh.md"],
    });
  }

  if (sharedMatch) {
    const [, sharedArea] = sharedMatch;
    return doc({
      id: `live-handoff-shared-${sourcePath
        .replace(/^repos\/orbits\/shared\//, "")
        .replace(/\/?RELATIONSHIP_SCHEMA_LIVE_IMPLEMENTATION\.md$/, "")
        .replace(/\/LIVE_IMPLEMENTATION\.md$/, "")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-|-$/g, "")}`,
      titleZh: `Shared Runtime 交接：${readableSlug(sharedArea)}`,
      summaryZh: `记录 shared/${sharedArea} 共享层从 mock 或本地实现迁移到 live/runtime provider 时的契约、替换点和验证要求。`,
      reviewEvidenceZh:
        `已核对共享代码目录存在：${parentDir}。具体数据结构和 API 仍以 shared 层源码与测试为准。`,
      sourcePath,
      category: "implementation-handoff",
      status: "generated-evidence",
      freshness: "likely-current",
      ownerArea: `shared:${sharedArea}`,
      relatedCodePaths: [parentDir],
      relatedKnowledgePages: ["knowledge/wiki/architecture.zh.md"],
    });
  }

  return doc({
    id: `live-handoff-${sourcePath.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
    titleZh: `Live 实现交接：${parentName}`,
    summaryZh: `记录 ${parentName} 的 live 替换要求和实现证据。`,
    reviewEvidenceZh: `已核对来源目录存在：${parentDir}。`,
    sourcePath,
    category: "implementation-handoff",
    status: "generated-evidence",
    freshness: "likely-current",
    ownerArea: "implementation",
    relatedCodePaths: [parentDir],
    relatedKnowledgePages: ["knowledge/wiki/architecture.zh.md"],
  });
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
    summaryZh:
      moduleId === "orbit-ai"
        ? "说明 Orbit AI command、conversation、artifact task 三个 capability 的职责差异，以及产品 chat、dev trace 和 planner-only 诊断共用 live runtime 的边界。"
        : `说明 ${moduleId} 模块的职责、Mock 行为、热拔插边界和阅读顺序。字段、状态和副作用规则仍以对应 contract 与测试为准。`,
    reviewEvidenceZh:
      moduleId === "orbit-ai"
        ? "已核对 service-factory 暴露 command/conversation/artifact-task 三个服务；live-agent-runtime、live-conversation-trace 和 trace-contract 共同描述当前执行链与调试数据。"
        : undefined,
    sourcePath: `repos/orbits/docs/architecture/modules/${moduleId}.md`,
    category: "module-architecture",
    freshness: "verified-current",
    ownerArea: `module:${moduleId}`,
    relatedCodePaths:
      moduleId === "ai-provider"
        ? ["repos/orbits/shared/ai/service-factory.ts"]
        : moduleId === "orbit-ai"
          ? [
              "repos/orbits/features/orbit-ai/service-factory.ts",
              "repos/orbits/features/orbit-ai/live-agent-runtime.ts",
              "repos/orbits/features/orbit-ai/live-conversation-trace.ts",
              "repos/orbits/features/orbit-ai/trace-contract.ts",
            ]
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
    summaryZh:
      moduleId === "orbit-ai"
        ? "Orbit AI 的当前权威设计入口：解释 command center、live conversation、artifact producer、planner 工具白名单、人脉推荐方法和产品/trace 共用执行链。"
        : `记录 ${moduleId} feature 的设计边界和 mock-first 实施方向，是模块文档之后的第二层阅读材料。`,
    reviewEvidenceZh:
      moduleId === "orbit-ai"
        ? "已核对 artifact-contract、service-factory、live-agent-runtime、live-conversation-service、live-conversation-trace、contact-recommendation artifact service 和相关 capability tests；产品 chat、full-chain trace、planner-only trace 共用同一 runtime。"
        : `已核对 repos/orbits/features/${moduleId} 目录和 service factory 存在；模块边界还由 modular-boundaries 测试覆盖。`,
    sourcePath: `repos/orbits/features/${moduleId}/DESIGN.md`,
    category: "feature-design",
    freshness: "likely-current",
    ownerArea: `feature:${moduleId}`,
    relatedCodePaths:
      moduleId === "orbit-ai"
        ? [
            "repos/orbits/features/orbit-ai/artifact-contract.ts",
            "repos/orbits/features/orbit-ai/service-factory.ts",
            "repos/orbits/features/orbit-ai/live-agent-runtime.ts",
            "repos/orbits/features/orbit-ai/live-conversation-trace.ts",
            "repos/orbits/features/orbit-ai/contact-recommendation-artifact-service.ts",
            "repos/orbits/features/orbit-ai/contact-recommendation-matching.ts",
          ]
        : [`repos/orbits/features/${moduleId}`, `repos/orbits/features/${moduleId}/service-factory.ts`],
    relatedKnowledgePages: ["knowledge/wiki/modules.zh.md"],
  }),
);

const liveImplementationDocs = uniqueSorted([
  ...walkMarkdown("repos/orbits/app"),
  ...walkMarkdown("repos/orbits/features"),
  ...walkMarkdown("repos/orbits/shared"),
])
  .filter((path) => /(?:^|\/)(?:LIVE_IMPLEMENTATION|RELATIONSHIP_SCHEMA_LIVE_IMPLEMENTATION)\.md$/.test(path))
  .map((path) => liveImplementationDoc(path));

const harnessPromptDocs = ["planner", "generator", "evaluator", "verifier"].map((role) =>
  doc({
    id: `harness-prompt-${role}`,
    titleZh: `长跑 Harness ${role} 提示词`,
    summaryZh: `定义长跑 harness 中 ${role} 角色的职责、输入输出和执行约束，是多代理循环的系统提示来源。`,
    reviewEvidenceZh:
      "已核对 prompt 文件仍在 harness/prompts 下；实际执行行为需要和 harness 调用代码及运行证据一起审计。",
    sourcePath: `harness/prompts/${role}.md`,
    category: "harness",
    status: "current",
    freshness: "likely-current",
    ownerArea: "harness",
    relatedCodePaths: ["harness"],
    relatedKnowledgePages: ["knowledge/wiki/harness.zh.md"],
  }),
);

const additionalOrbitDocs = [
  doc({
    id: "chat-agent-quality-loop-plan",
    titleZh: "Chat Agent 质量循环计划",
    summaryZh: "记录 Orbit Chat Agent 质量检查、trace 和改进循环的实施计划，是后续 agent 质量迭代的历史入口。",
    reviewEvidenceZh:
      "已核对 Orbit AI trace 页面、chat API 边界和相关测试仍存在；该计划作为历史质量循环入口保留。",
    sourcePath: "docs/superpowers/plans/2026-06-29-orbit-chat-agent-quality-loop.md",
    category: "implementation-plan",
    status: "historical",
    freshness: "likely-current",
    ownerArea: "orbit-ai",
    relatedCodePaths: ["repos/orbits/features/orbit-ai", "repos/orbits/app/dev/orbit-ai/trace"],
    relatedKnowledgePages: ["knowledge/wiki/agent-system.zh.md"],
  }),
  doc({
    id: "orbit-ai-reference-redesign-sprints",
    titleZh: "Orbit AI 参考重设计 Sprint",
    summaryZh: "记录 Orbit AI 参考界面重设计的 sprint 拆分和验收方向，是 UI/agent 体验历史资料。",
    reviewEvidenceZh:
      "已纳入历史设计类文档；当前 UI 以 app/(app)/app/orbit-ai* 和 dev trace 页面源码为准。",
    sourcePath: "docs/superpowers/specs/2026-06-27-orbit-ai-reference-redesign-sprints.md",
    category: "sprint-spec",
    status: "historical",
    freshness: "likely-current",
    ownerArea: "orbit-ai",
    relatedCodePaths: ["repos/orbits/app/(app)/app/orbit-ai-command-center.tsx"],
    relatedKnowledgePages: ["knowledge/wiki/agent-system.zh.md"],
  }),
  doc({
    id: "harness-audit-2026-06-24",
    titleZh: "Harness 审计 2026-06-24",
    summaryZh: "记录长跑 harness 的早期审计结果、风险和修正方向，是理解 harness 演进的历史证据。",
    reviewEvidenceZh:
      "已纳入历史审计；当前 harness 行为已用 harness/README、AGENT.md 和 harness 脚本作为后续权威入口。",
    sourcePath: "harness-state/audits/2026-06-24-harness-audit.md",
    category: "harness",
    status: "historical",
    freshness: "likely-current",
    ownerArea: "harness",
    relatedCodePaths: ["harness"],
    relatedKnowledgePages: ["knowledge/wiki/harness.zh.md"],
  }),
  doc({
    id: "bootstrap-product-context",
    titleZh: "Bootstrap 产品上下文",
    summaryZh: "记录 harness 启动阶段使用的产品上下文，用于解释早期 sprint 为什么围绕 Orbit 关系管理和 mock capability 展开。",
    reviewEvidenceZh:
      "已纳入历史上下文；当前产品方向应优先阅读 knowledge/wiki/project-overview.zh.md 和 docs/designs/inital_design.md。",
    sourcePath: "harness-state/bootstrap-product-context.md",
    category: "product-design",
    status: "historical",
    freshness: "likely-current",
    ownerArea: "product",
    relatedKnowledgePages: ["knowledge/wiki/project-overview.zh.md"],
  }),
  doc({
    id: "trace-debug-design-en",
    titleZh: "Orbit AI Trace Debug 英文设计源",
    summaryZh: "Orbit AI trace debug 设计的英文源文件；当前说明 full-chain trace、planner-only 兼容入口、共享 runtime 和人脉推荐方法选择。",
    reviewEvidenceZh:
      "已核对 live-agent-runtime、live-conversation-service、live-conversation-trace、/api/dev/orbit-agent/trace route 和 contact recommendation tests；英文源与中文 companion 同步更新。",
    sourcePath: "repos/orbits/docs/superpowers/specs/2026-06-29-orbit-ai-trace-debug-design.md",
    category: "sprint-spec",
    status: "current",
    freshness: "verified-current",
    ownerArea: "orbit-ai",
    relatedCodePaths: [
      "repos/orbits/features/orbit-ai/live-agent-runtime.ts",
      "repos/orbits/features/orbit-ai/live-conversation-trace.ts",
      "repos/orbits/features/orbit-ai/contact-recommendation-artifact-service.ts",
      "repos/orbits/app/dev/orbit-ai/trace",
      "repos/orbits/app/api/dev/orbit-agent/trace/route.ts",
    ],
    relatedKnowledgePages: ["knowledge/wiki/agent-system.zh.md"],
  }),
  doc({
    id: "orbits-app-readme",
    titleZh: "Orbits App 开发 README",
    summaryZh: "记录 Next.js app 的基础启动、开发命令和项目入口，是 repos/orbits 内最短的操作说明。",
    reviewEvidenceZh:
      "已核对 package.json 中仍存在 README 提到的核心脚本；详细实现边界以 AGENTS.md 和知识库为准。",
    sourcePath: "repos/orbits/README.md",
    category: "developer-guide",
    freshness: "likely-current",
    ownerArea: "repos/orbits",
    relatedCodePaths: ["repos/orbits/package.json"],
    relatedKnowledgePages: ["knowledge/wiki/architecture.zh.md"],
  }),
  doc({
    id: "manual-acceptance-guide",
    titleZh: "手动验收指南",
    summaryZh: "记录 app 手动验收路径和检查点，适合在自动测试之外做产品表面回归。",
    reviewEvidenceZh:
      "已核对文档仍在 app scripts 目录，且当前 app 路由与页面测试已覆盖主要产品表面；路径变化时仍需同步维护。",
    sourcePath: "repos/orbits/scripts/manual-acceptance.md",
    category: "developer-guide",
    freshness: "likely-current",
    ownerArea: "qa",
    relatedCodePaths: ["repos/orbits/app"],
    relatedKnowledgePages: ["knowledge/wiki/architecture.zh.md"],
  }),
];

const documents = [
  ...additionalOrbitDocs,
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
    reviewEvidenceZh:
      "已和当前产品入口区分：该文件作为 historical 资料保留，当前产品方向以 docs/designs/inital_design.md 和 project overview 为准。",
    sourcePath: "docs/designs/inital_design.v0.md",
    category: "product-design",
    status: "historical",
    freshness: "likely-current",
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
    summaryZh: "说明 app 本地/远端数据库边界和 relationship schema，是当前数据层和 mock/hybrid 模式的重要文档。",
    reviewEvidenceZh:
      "已核对 ORBIT_LOCAL_REMOTE_DATABASE_SCHEMA_VERSION、orbit-database.ts、local-remote tests 和 relationship schema tests，当前数据层测试覆盖该边界。",
    sourcePath: "repos/orbits/docs/architecture/local-remote-database.md",
    category: "architecture",
    freshness: "verified-current",
    ownerArea: "data",
    relatedCodePaths: ["repos/orbits/shared/local-remote-store/orbit-database.ts"],
    relatedKnowledgePages: ["knowledge/wiki/data-and-mockdata.zh.md"],
  }),
  doc({
    id: "orbit-ai-performance-check",
    titleZh: "Orbit AI 性能检查",
    summaryZh: "2026-06-30 的 Orbit AI 性能审计和已落地优化记录：provider latency、loop steps、Server-Timing、外置 reference CSS、ETag 和重复 JSON clone 移除。",
    reviewEvidenceZh:
      "已核对本记录对应的优化已在 route、live runtime、artifact producer 和 OrbitReferenceStyles 相关代码中落地；它仍是历史快照，新的性能判断要重新测量。",
    sourcePath: "repos/orbits/docs/architecture/orbit-ai-agent-performance-check-2026-06-30.md",
    category: "architecture",
    status: "historical",
    freshness: "likely-current",
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
    reviewEvidenceZh:
      "已核对 Orbit AI service、chat/agent API、trace debug 页面和相关 tests 仍存在；更细的 ReAct 工具边界以 bounded ReAct 设计为准。",
    sourcePath: "docs/superpowers/specs/2026-06-29-orbit-product-chat-agent-design.md",
    category: "sprint-spec",
    freshness: "likely-current",
    ownerArea: "orbit-ai",
    relatedCodePaths: ["repos/orbits/features/orbit-ai", "repos/orbits/app/api/ai/conversations/route.ts"],
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
    id: "knowledge-wiki-chinese-mirrors-plan",
    titleZh: "Wiki 中文镜像实施计划",
    summaryZh: "定义每个 catalog 文档如何保留原始来源，同时生成中文阅读版供 /dev/knowledge 默认展示。",
    sourcePath: "docs/superpowers/plans/2026-06-30-knowledge-wiki-chinese-mirrors.md",
    category: "implementation-plan",
    freshness: "verified-current",
    ownerArea: "knowledge",
    relatedKnowledgePages: ["knowledge/index.zh.md"],
  }),
  doc({
    id: "hybrid-mockdata-handoff-design",
    titleZh: "Hybrid Mockdata Handoff 设计",
    summaryZh: "定义 relationship mockdata 如何生成 TypeScript fixture 并接入 hybrid local-remote database。",
    reviewEvidenceZh:
      "已核对 relationship_data_goal_runner.py、generated-relationship-fixtures.ts、fixtures.ts 和 hybrid/local-remote 相关测试存在。",
    sourcePath: "docs/superpowers/specs/2026-06-30-hybrid-mockdata-handoff-design.md",
    category: "sprint-spec",
    freshness: "likely-current",
    ownerArea: "data",
    relatedCodePaths: [
      "harness/relationship_data_goal_runner.py",
      "repos/orbits/shared/mock/generated-relationship-fixtures.ts",
      "repos/orbits/shared/mock/fixtures.ts",
    ],
    relatedKnowledgePages: ["knowledge/wiki/data-and-mockdata.zh.md"],
  }),
  doc({
    id: "hybrid-mockdata-handoff-plan",
    titleZh: "Hybrid Mockdata Handoff 计划",
    summaryZh: "实施 generated relationship fixture 接入 app mock/hybrid 数据层的计划。",
    reviewEvidenceZh:
      "已核对生成 fixture 已接入 shared/mock/fixtures.ts，且 core hybrid local-remote services 与 relationship schema tests 覆盖该链路。",
    sourcePath: "docs/superpowers/plans/2026-06-30-hybrid-mockdata-handoff.md",
    category: "implementation-plan",
    freshness: "verified-current",
    ownerArea: "data",
    relatedCodePaths: [
      "repos/orbits/shared/mock/generated-relationship-fixtures.ts",
      "repos/orbits/tests/capabilities/core-hybrid-local-remote-services.test.ts",
      "repos/orbits/tests/services/local-remote-relationship-schema.test.ts",
    ],
    relatedKnowledgePages: ["knowledge/wiki/data-and-mockdata.zh.md"],
  }),
  doc({
    id: "harness-readme",
    titleZh: "Orbit 长跑 Harness README",
    summaryZh: "说明 harness 架构、命令、运行证据和长跑开发流程，是 harness 操作的主要英文来源。",
    reviewEvidenceZh:
      "已核对 harness 主脚本、preflight、workspace、prompt 和 AGENT 规则仍存在；README 作为当前操作入口保留。",
    sourcePath: "harness/README.md",
    category: "harness",
    freshness: "likely-current",
    ownerArea: "harness",
    relatedCodePaths: ["harness"],
    relatedKnowledgePages: ["knowledge/wiki/harness.zh.md"],
  }),
  doc({
    id: "harness-state-spec",
    titleZh: "Harness 执行规格摘要",
    summaryZh: "当前 harness-state/spec 是执行摘要，不是 sprint 详细需求来源。",
    reviewEvidenceZh:
      "已核对 harness.py 明确把 contract JSON 和 sprints.md 作为详细需求来源；该文件定位为当前执行摘要。",
    sourcePath: "harness-state/spec.md",
    category: "harness",
    freshness: "likely-current",
    ownerArea: "harness",
    relatedKnowledgePages: ["knowledge/wiki/harness.zh.md"],
  }),
  doc({
    id: "harness-sprints-index",
    titleZh: "Harness Sprint 索引",
    summaryZh: "人类可读 sprint 历史索引，具体成功标准仍以 contract JSON 为准。",
    reviewEvidenceZh:
      "已核对 harness.py 将 sprints.md 作为可读索引，并把 contract JSON 作为权威成功标准来源。",
    sourcePath: "harness-state/sprints.md",
    category: "harness",
    freshness: "likely-current",
    ownerArea: "harness",
    relatedKnowledgePages: ["knowledge/wiki/harness.zh.md"],
  }),
  doc({
    id: "product-facing-sprints",
    titleZh: "产品化 Sprint Backlog",
    summaryZh: "记录 Sprint 68 后从 mock capability loop 转向 /app/** 产品表面的产品化 backlog。",
    reviewEvidenceZh:
      "已核对 /app 产品路由、route view-model tests 和 capability registry tests 存在；该 backlog 作为产品化历史和后续方向保留。",
    sourcePath: "harness-state/productization-notes/product-facing-sprints.md",
    category: "harness",
    freshness: "likely-current",
    ownerArea: "product",
    relatedKnowledgePages: ["knowledge/wiki/project-overview.zh.md"],
  }),
  doc({
    id: "mockdata-design",
    titleZh: "Relationship Mockdata 设计",
    summaryZh: "用于生成关系 mock 数据、AI 画像建模、活动场景和 demo 数据的长文档。",
    reviewEvidenceZh:
      "已核对 mockdata exports、validator、relationship_data_goal_runner.py 和 generated relationship fixtures 存在；长文档作为数据设计来源保留。",
    sourcePath: "repos/mockdata/orbit_mock_data_ai_relationship_design.md",
    category: "mockdata",
    freshness: "likely-current",
    ownerArea: "data",
    relatedCodePaths: ["harness/relationship_data_goal_runner.py", "repos/mockdata"],
    relatedKnowledgePages: ["knowledge/wiki/data-and-mockdata.zh.md"],
  }),
  doc({
    id: "mockdata-generation-readme",
    titleZh: "Mockdata 生成 README",
    summaryZh: "说明 relationship mockdata 生成目录和运行方式，需要和当前 generator 代码保持同步。",
    reviewEvidenceZh:
      "已核对 README 描述的 generated-relationship-fixtures.ts、fixtures.ts 和 validate_relationship_mockdata.mjs 存在。",
    sourcePath: "repos/mockdata/generation/README.md",
    category: "mockdata",
    freshness: "likely-current",
    ownerArea: "data",
    relatedCodePaths: ["repos/mockdata/generation", "harness/relationship_data_goal_runner.py"],
    relatedKnowledgePages: ["knowledge/wiki/data-and-mockdata.zh.md"],
  }),
  doc({
    id: "trace-debug-design",
    titleZh: "Orbit AI Trace Debug 设计",
    summaryZh: "说明 /dev/orbit-ai/trace 如何展示 full-chain trace、planner-only 对比、runtimeSnapshot、artifact producers、tool calls、数据来源和安全边界。",
    reviewEvidenceZh:
      "已核对产品 chat、/dev/orbit-ai/trace 和 /api/dev/orbit-agent/trace 都调用 runLiveOrbitAgentRuntime；trace-contract 暴露 artifactProducers，contact recommendation method 由 ORBIT_CONTACT_RECOMMENDATION_METHOD 控制并有 targeted tests。",
    sourcePath: "repos/orbits/docs/superpowers/specs/2026-06-29-orbit-ai-trace-debug-design.zh.md",
    category: "sprint-spec",
    freshness: "verified-current",
    ownerArea: "orbit-ai",
    relatedCodePaths: [
      "repos/orbits/features/orbit-ai/live-agent-runtime.ts",
      "repos/orbits/features/orbit-ai/live-conversation-trace.ts",
      "repos/orbits/features/orbit-ai/contact-recommendation-artifact-service.ts",
      "repos/orbits/app/dev/orbit-ai/trace",
      "repos/orbits/app/api/dev/orbit-agent/trace/route.ts",
    ],
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
    reviewEvidenceZh:
      "已核对 capability registry、service factory tests 和 mock-to-live handoff tests 仍覆盖该框架；该文档作为 Sprint 68 交接证据保留。",
    sourcePath:
      "repos/orbits/docs/mock-to-live/verify-that-the-capability-first-framework-can-run-the-mvp-loop-in-mock-mode-wit/LIVE_IMPLEMENTATION.md",
    category: "implementation-handoff",
    freshness: "likely-current",
    ownerArea: "architecture",
    relatedCodePaths: [
      "repos/orbits/tests/services/capability-registry.test.ts",
      "repos/orbits/tests/services/core-service-factories.test.ts",
      "repos/orbits/tests/services/hybrid-service-factories.test.ts",
    ],
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
    reviewEvidenceZh:
      "已标记为历史性能 learnings；当前性能判断需要结合新的 trace、测试或性能记录，但该经验仍是有效排查入口。",
    sourcePath: ".learnings/PERFORMANCE.md",
    category: "learning",
    status: "historical",
    freshness: "likely-current",
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
  ...harnessPromptDocs,
  ...liveImplementationDocs,
];

function validateDocuments() {
  const ids = new Set();
  const missing = [];
  const invalid = [];
  for (const entry of documents) {
    if (ids.has(entry.id)) invalid.push(`duplicate id ${entry.id}`);
    ids.add(entry.id);
    if (!/[\u4e00-\u9fff]/.test(entry.titleZh)) invalid.push(`${entry.id} missing Chinese title`);
    if (!/[\u4e00-\u9fff]/.test(entry.summaryZh)) invalid.push(`${entry.id} missing Chinese summary`);
    if (!/[\u4e00-\u9fff]/.test(entry.reviewEvidenceZh)) {
      invalid.push(`${entry.id} missing Chinese review evidence`);
    }
    if (!existsSync(join(projectRoot, entry.sourcePath))) missing.push(entry.sourcePath);
    if (!entry.localizedSourcePath?.startsWith("knowledge/docs/zh/")) {
      invalid.push(`${entry.id} invalid localizedSourcePath`);
    }
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
    "阅读规则：`current` 是当前可用入口；`historical` 和 `superseded` 只能解释背景；`verified-current` 表示最近已和代码或测试核对；`likely-current` 仍需要在改代码前重新确认。",
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
        `  - 中文阅读版：\`${entry.localizedSourcePath}\``,
        `  - 简介：${entry.summaryZh}`,
        `  - 审计依据：${entry.reviewEvidenceZh}`,
        `  - 状态：\`${entry.status}\`；新鲜度：\`${entry.freshness}\`；负责人域：\`${entry.ownerArea}\``,
        `  - 关联知识页：${entry.relatedKnowledgePages.map((page) => `\`${page}\``).join("、") || "暂无"}`,
      );
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function renderFreshnessReport() {
  const allMarkdown = uniqueSorted([
    "AGENT.md",
    ...walkMarkdown("docs"),
    ...walkMarkdown("harness"),
    ...walkMarkdown("harness-state"),
    ...walkMarkdown("repos/mockdata"),
    ...walkMarkdown("repos/orbits"),
    ...walkMarkdown(".learnings"),
  ]);
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
    `- 扫描范围内未纳入目录：${uncataloged.length} 个 Markdown。`,
    "",
    "## 需要代码核对",
    "",
    ...(needsReview.length
      ? needsReview.map((entry) => `- \`${entry.sourcePath}\`：${entry.summaryZh}`)
      : ["- 暂无。"]),
    "",
    "## 已知过期",
    "",
    ...(knownStale.length
      ? knownStale.map((entry) => `- \`${entry.sourcePath}\`：${entry.summaryZh}`)
      : ["- 暂无。"]),
    "",
    "## 扫描范围内未纳入目录",
    "",
    ...(uncataloged.length
      ? uncataloged.map((path) => `- \`${path}\``)
      : ["- 扫描范围内的 Markdown 都已纳入。"]),
    "",
    "## 规则",
    "",
    "- `harness-state/runs/**` 和 `harness-state/tmp/**` 默认排除，只能作为历史证据引用。",
    "- `.venv/**`、`.pytest_cache/**`、`.superpowers/**` 和参考项目 `repos/tokyo-business-connect/**` 不属于默认 Orbit 文档库范围。",
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
