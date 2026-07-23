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
      relativePath.includes("/coverage/") ||
      // coding-agent 工具说明（skills、CLAUDE.md）不是项目知识文档。
      relativePath.includes("/.claude/") ||
      /(^|\/)CLAUDE\.md$/.test(relativePath)
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

function featureDisplayId(moduleId) {
  return moduleId === "agent" ? "actions" : moduleId;
}

function displayCapabilityId(moduleId, capabilityId) {
  if (moduleId !== "agent") return capabilityId;
  if (capabilityId === "agent-action-queue-mock") return "action-queue-mock";
  if (capabilityId === "agent-autonomy-settings-mock") return "autonomy-settings-mock";
  return capabilityId;
}

function liveImplementationDoc(sourcePath) {
  const parentDir = dirname(sourcePath);
  const segments = sourcePath.split("/");
  const parentName = readableSlug(segments.at(-2) ?? sourcePath);
  // feature 根目录下的 <CAPABILITY>_LIVE_IMPLEMENTATION.md / <CAPABILITY>_MOCK_TO_LIVE.md
  const featureFileMatch = sourcePath.match(
    /^repos\/orbits\/features\/([^/]+)\/([A-Z0-9_]+)\.md$/,
  );
  if (featureFileMatch) {
    const [, moduleId, fileName] = featureFileMatch;
    const displayModuleId = featureDisplayId(moduleId);
    const capabilityLabel =
      readableSlug(
        fileName.replace(/_?(LIVE_IMPLEMENTATION|MOCK_TO_LIVE)$/, "").toLowerCase(),
      ) || readableSlug(fileName.toLowerCase());
    const kindLabel = fileName.endsWith("MOCK_TO_LIVE") ? "mock-to-live 切换" : "live 实现";
    return doc({
      id: `live-handoff-feature-${displayModuleId}-${fileName.toLowerCase().replace(/_/g, "-")}`,
      titleZh: `${displayModuleId} 能力 Live 交接：${capabilityLabel}`,
      summaryZh: `记录 ${displayModuleId} 模块 ${capabilityLabel} 能力的 ${kindLabel} 边界：需要替换的服务、环境变量、权限约束和验证要求。`,
      reviewEvidenceZh: `已核对对应 feature 目录存在：repos/orbits/features/${moduleId}。具体切换行为以 service factory 与测试为准。`,
      sourcePath,
      category: "implementation-handoff",
      status: "generated-evidence",
      freshness: "likely-current",
      ownerArea: `feature:${displayModuleId}`,
      relatedCodePaths: [
        `repos/orbits/features/${moduleId}`,
        `repos/orbits/features/${moduleId}/service-factory.ts`,
      ],
      relatedKnowledgePages: ["knowledge/wiki/modules.zh.md"],
    });
  }
  const featureMatch = sourcePath.match(/^repos\/orbits\/features\/([^/]+)\/([^/]+)\//);
  const appMatch = sourcePath.match(/^repos\/orbits\/app\/(.+)\/[^/]+$/);
  const sharedMatch = sourcePath.match(/^repos\/orbits\/shared\/([^/]+)\//);

  if (featureMatch) {
    const [, moduleId, capabilityId] = featureMatch;
    const displayModuleId = featureDisplayId(moduleId);
    const displayCapability = displayCapabilityId(moduleId, capabilityId);
    const capability = readableSlug(displayCapability);
    return doc({
      id: `live-handoff-feature-${displayModuleId}-${displayCapability}`,
      titleZh: `${displayModuleId} 能力 Live 交接：${capability}`,
      summaryZh: `记录 ${displayModuleId} 模块中 ${capability} 能力从 mock-first 实现切换到 live provider 时需要替换和验证的边界。`,
      reviewEvidenceZh:
        `已核对对应 feature 目录存在：${parentDir}。目录级实时行为仍以 service factory、API route 和测试为准。`,
      sourcePath,
      category: "implementation-handoff",
      status: "generated-evidence",
      freshness: "likely-current",
      ownerArea: `feature:${displayModuleId}`,
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
  "actions",
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
  "home",
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
        : moduleId === "actions"
          ? ["repos/orbits/features/agent/service-factory.ts"]
        : moduleId === "home"
          ? ["repos/orbits/app/(app)/app/home", "repos/orbits/app/page.tsx"]
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
  "actions",
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
        : moduleId === "actions"
          ? "已核对 legacy implementation path repos/orbits/features/agent 目录和 service factory 存在；模块边界还由 modular-boundaries 测试覆盖。"
        : `已核对 repos/orbits/features/${moduleId} 目录和 service factory 存在；模块边界还由 modular-boundaries 测试覆盖。`,
    sourcePath:
      moduleId === "actions"
        ? "repos/orbits/features/agent/DESIGN.md"
        : `repos/orbits/features/${moduleId}/DESIGN.md`,
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
        : moduleId === "actions"
          ? ["repos/orbits/features/agent", "repos/orbits/features/agent/service-factory.ts"]
          : [`repos/orbits/features/${moduleId}`, `repos/orbits/features/${moduleId}/service-factory.ts`],
    relatedKnowledgePages: ["knowledge/wiki/modules.zh.md"],
  }),
);

const liveImplementationDocs = uniqueSorted([
  ...walkMarkdown("repos/orbits/app"),
  ...walkMarkdown("repos/orbits/features"),
  ...walkMarkdown("repos/orbits/shared"),
])
  .filter((path) => /(?:^|\/)[A-Z0-9_]*(?:LIVE_IMPLEMENTATION|MOCK_TO_LIVE)\.md$/.test(path))
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
    relatedKnowledgePages: ["knowledge/wiki/actions-system.zh.md"],
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
    relatedKnowledgePages: ["knowledge/wiki/actions-system.zh.md"],
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
    freshness: "known-stale",
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
    relatedKnowledgePages: ["knowledge/wiki/actions-system.zh.md"],
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

// 2026-07-19 补登记：2026-06-30 后新增但未纳入 catalog 的文档积压。
const julyBacklogDocs = [
  doc({
    id: "adr-0001-events-live-store-first",
    titleZh: "ADR-0001：先建 Events Live Store，后做日历 Provider 导入",
    summaryZh: "决定 Events 的 live 模式首先以 Orbit 自有的 Events Live Store 实现（CRUD/详情/手动创建），把外部日历 Provider 导入（OAuth、同步、去重、重复事件展开）留作后续独立集成，且后者将来只能写穿 Events Live Store 而不拥有事件记录。",
    reviewEvidenceZh: "长期架构决定记录（ADR），仍是权威边界；具体 live 行为以 repos/orbits/features/events/event-crud-and-import/live-service.ts 及 tests/capabilities/event-crud-and-import-live-store.test.ts 的代码与测试为准。",
    sourcePath: "docs/adr/0001-events-live-store-before-calendar-provider-import.md",
    category: "adr",
    status: "current",
    freshness: "likely-current",
    ownerArea: "events",
    relatedCodePaths: ["repos/orbits/features/events/event-crud-and-import/live-service.ts", "repos/orbits/features/events/service-factory.ts", "repos/orbits/tests/capabilities/event-crud-and-import-live-store.test.ts"],
    relatedKnowledgePages: ["knowledge/wiki/architecture.zh.md", "knowledge/wiki/modules.zh.md"],
  }),
  doc({
    id: "adr-0002-local-postgres-live-db",
    titleZh: "ADR-0002：本地 Live 数据库选用 Local Postgres",
    summaryZh: "决定第一个 Local Live Database 目标是本地 Postgres（而非 SQLite 或完整 Supabase 本地栈），使开发数据存储贴近未来 Supabase 生产形态；hybrid 仍是 localStorage/内存迁移模式，不等同于 Local Live Database。",
    reviewEvidenceZh: "长期架构决定记录（ADR），仍是权威方向；具体连接与配置行为以 repos/orbits/shared/storage/postgres-live-record-store.ts 与 live-database-config.ts 的代码及相关存储测试为准。",
    sourcePath: "docs/adr/0002-local-postgres-for-local-live-database.md",
    category: "adr",
    status: "current",
    freshness: "likely-current",
    ownerArea: "data",
    relatedCodePaths: ["repos/orbits/shared/storage/postgres-live-record-store.ts", "repos/orbits/shared/storage/live-database-config.ts", "repos/orbits/shared/storage/migrations.ts"],
    relatedKnowledgePages: ["knowledge/wiki/architecture.zh.md", "knowledge/wiki/data-and-mockdata.zh.md"],
  }),
  doc({
    id: "adr-0003-indexed-jsonb-records",
    titleZh: "ADR-0003：Live 数据库采用带索引的 JSONB 信封记录",
    summaryZh: "决定 Live 数据库行采用类型化信封记录：稳定列承载身份、归属、来源、时间戳和常用检索索引，JSONB payload 承载各 feature 的 DTO，形成共享的 orbit_records 形状；字段稳定后可再通过普通 Postgres 迁移升格为列或独立表。",
    reviewEvidenceZh: "长期架构决定记录（ADR），是 orbit_records 通用信封边界的权威依据；具体 schema 与映射行为以 repos/orbits/shared/storage/live-record-store.ts、migrations.ts 及各 feature 的 storage provider 代码与测试为准。",
    sourcePath: "docs/adr/0003-indexed-jsonb-records-for-local-live-database.md",
    category: "adr",
    status: "current",
    freshness: "likely-current",
    ownerArea: "data",
    relatedCodePaths: ["repos/orbits/shared/storage/live-record-store.ts", "repos/orbits/shared/storage/migrations.ts", "repos/orbits/shared/storage/configured-live-record-store.ts"],
    relatedKnowledgePages: ["knowledge/wiki/architecture.zh.md", "knowledge/wiki/data-and-mockdata.zh.md"],
  }),
  doc({
    id: "adr-0004-events-capabilities-own-live",
    titleZh: "ADR-0004：Events 各 capability 按业务角色命名并自持 live 实现",
    summaryZh: "决定 Events 子能力（attendee-roster、goal-readiness、encounter-note、want-connect、post-event-review）按业务角色命名，mock/hybrid/live 只是其可替换实现；迁移顺序为先结构性去 mock、再 live 边界、最后全量数据接通，用户产生的活动工作成为 orbit_records 中的持久 Live Records，派生分数与推荐保持为计算视图。",
    reviewEvidenceZh: "长期架构决定记录（ADR），命名与迁移顺序仍是权威约束；各子能力当前实际的 live 行为以 repos/orbits/features/events/ 下各 capability 的 live-service 与对应 tests/capabilities/ 测试为准。",
    sourcePath: "docs/adr/0004-events-capabilities-own-live-implementations.md",
    category: "adr",
    status: "current",
    freshness: "likely-current",
    ownerArea: "events",
    relatedCodePaths: ["repos/orbits/features/events/attendee-roster", "repos/orbits/features/events/goal-readiness", "repos/orbits/features/events/service-factory.ts"],
    relatedKnowledgePages: ["knowledge/wiki/modules.zh.md", "knowledge/wiki/architecture.zh.md"],
  }),
  doc({
    id: "demo-visual-assets",
    titleZh: "Orbit 演示视觉资产规则（Sprint 96）",
    summaryZh: "规定演示活动/用户/联系人的本地视觉资产只能经 shared/demo-visual-assets.ts 读取 public/orbit-demo-assets/manifest.json，禁止组件硬编码路径与远程热链图片，并定义 manifest 字段、生成提示词、授权姿态、替换流程和 mock-to-live 替换边界。",
    reviewEvidenceZh: "当前权威的资产存放与替换规则文档；覆盖范围与断言以 repos/orbits/tests/capabilities/demo-visual-asset-coverage.test.ts 等测试和 shared/demo-visual-assets.ts 代码为准。",
    sourcePath: "repos/orbits/docs/architecture/demo-visual-assets.md",
    category: "architecture",
    status: "current",
    freshness: "likely-current",
    ownerArea: "app",
    relatedCodePaths: ["repos/orbits/shared/demo-visual-assets.ts", "repos/orbits/public/orbit-demo-assets/manifest.json", "repos/orbits/tests/capabilities/demo-visual-asset-coverage.test.ts"],
    relatedKnowledgePages: ["knowledge/wiki/data-and-mockdata.zh.md", "knowledge/wiki/modules.zh.md"],
  }),
  doc({
    id: "relationship-inbox-panel",
    titleZh: "关系收件箱面板（Relationship Inbox Panel）落地设计",
    summaryZh: "设计并记录了 /app/** 顶栏右上角的 shell 级 slide-over 面板：单入口两 tab（对话线程 + 提醒/主动提示），复用 chat/message-draft/notifications/proactive 既有契约，新增 createConversationFromDraft 写入路径；文末实现状态显示步骤 0–5 已于 2026-07-09 全部落地。",
    reviewEvidenceZh: "已执行完成的一次性落地设计（含拍板决定与实现状态快照）；面板当前行为以 repos/orbits/app/(app)/app/inbox/ 下组件、app/api/chat/relationship-inbox/route.ts 及 tests/pages/app-relationship-inbox-*.test 系列测试为准，发送安全边界（外发全 false、停在本地 staged 预览）仍是有效约束。",
    sourcePath: "repos/orbits/docs/architecture/relationship-inbox-panel.md",
    category: "architecture",
    status: "historical",
    freshness: "likely-current",
    ownerArea: "app",
    relatedCodePaths: ["repos/orbits/app/(app)/app/inbox/relationship-inbox-panel.tsx", "repos/orbits/app/(app)/app/inbox/inbox-panel-view-model.ts", "repos/orbits/app/api/chat/relationship-inbox/route.ts"],
    relatedKnowledgePages: ["knowledge/wiki/modules.zh.md", "knowledge/wiki/actions-system.zh.md"],
  }),
  doc({
    id: "root-home-routing",
    titleZh: "根路由与 Home 路由分工",
    summaryZh: "规定三个 home 类路由的分工：/ 是公共产品入口（render-only、无写副作用），/app/home 是登录后个人中枢（live-capable、可 fail-closed），/app/home/events 是个人活动列表；禁止把 / 指回 /app/home，并要求根页活动链接用稳定 id 而非可能碰撞的 display code。",
    reviewEvidenceZh: "当前权威的路由分工约定；具体渲染与链接行为以 repos/orbits/app/page.tsx 和 app/(app)/app/home 路由代码及相关页面测试为准。",
    sourcePath: "repos/orbits/docs/architecture/root-home-routing.md",
    category: "architecture",
    status: "current",
    freshness: "likely-current",
    ownerArea: "app",
    relatedCodePaths: ["repos/orbits/app/page.tsx", "repos/orbits/app/(app)/app/home", "repos/orbits/app/(app)/app/home/events"],
    relatedKnowledgePages: ["knowledge/wiki/architecture.zh.md", "knowledge/wiki/project-overview.zh.md"],
  }),
  doc({
    id: "events-live-store-design",
    titleZh: "Events Live Store 首版设计（event-crud-import）",
    summaryZh: "为 event-crud-import 单个能力设计首个 live 模式：注册显式 live 构造器、缺配置时以 EVENTS_LIVE_STORE_UNCONFIGURED 受控失败、契约的数据库执行标志放宽为 boolean 且 live 写入成功后才置 true；明确排除日历/OAuth/后台同步等 Calendar Provider Import 范畴。",
    reviewEvidenceZh: "一次性设计规格，对应实现已落地（roadmap 记录 event-crud-import live 已完成）；当前行为以 repos/orbits/features/events/event-crud-and-import/live-service.ts 与 tests/capabilities/event-crud-and-import-live-store.test.ts 为准，长期边界见 ADR-0001。",
    sourcePath: "repos/orbits/docs/superpowers/specs/2026-07-01-events-live-store-design.md",
    category: "sprint-spec",
    status: "historical",
    freshness: "likely-current",
    ownerArea: "events",
    relatedCodePaths: ["repos/orbits/features/events/event-crud-and-import/live-service.ts", "repos/orbits/features/events/service-factory.ts", "repos/orbits/tests/capabilities/event-crud-and-import-live-store.test.ts"],
    relatedKnowledgePages: ["knowledge/wiki/architecture.zh.md", "knowledge/wiki/data-and-mockdata.zh.md"],
  }),
  doc({
    id: "live-data-feature-roadmap",
    titleZh: "Orbit Live 数据功能路线图",
    summaryZh: "从 mock-first/hybrid 迁移到 orbit_records 远程 live 存储的总路线图：按目标（fixture 种子、各 feature live provider、各 /app/* 路由 live service bundle 等）逐条列出成功证据与实现证据，并记录共享配置化 Postgres 连接池复用、fail-closed 等运行约束；是 live 化工作的 primary source of truth。",
    reviewEvidenceZh: "当前权威的滚动路线图文档，随每个 goal 完成持续更新；各条实现证据是当时快照，具体行为以 repos/orbits/shared/storage/ 与各 features/*/live-service、tests/capabilities|pages 下的对应测试为准。",
    sourcePath: "repos/orbits/docs/superpowers/specs/2026-07-01-live-data-feature-roadmap.md",
    category: "sprint-spec",
    status: "current",
    freshness: "likely-current",
    ownerArea: "data",
    relatedCodePaths: ["repos/orbits/shared/storage/live-record-store.ts", "repos/orbits/shared/storage/configured-live-record-store.ts", "repos/orbits/features/contacts/live-service.ts"],
    relatedKnowledgePages: ["knowledge/wiki/data-and-mockdata.zh.md", "knowledge/wiki/architecture.zh.md"],
  }),
  doc({
    id: "orbit-ai-proactive-agent-design",
    titleZh: "Orbit AI 主动 Agent 设计",
    summaryZh: "定义 Orbit AI 作为唯一用户侧助理收件箱：feature 信号（AgentSignal）经 proactive agent 转成 Orbit AI 聊天窗内的主动助理回合（ProactiveAgentMessage，deliverySurface=orbit_ai_chat）；Orbit AI 拥有主动解释与文案，Chat 拥有人际沟通，Notifications 只管投递机制；首版 mock-first、不触发任何外部副作用。",
    reviewEvidenceZh: "定义 Orbit AI/Chat/Notifications 归属边界的设计文档，边界仍是权威；具体 proactive 行为以 repos/orbits/features/orbit-ai/proactive-contract.ts 与 app/api/ai/proactive-turns/route.ts 的代码及测试为准。",
    sourcePath: "repos/orbits/docs/superpowers/specs/2026-07-01-orbit-ai-proactive-agent-design.md",
    category: "sprint-spec",
    status: "current",
    freshness: "likely-current",
    ownerArea: "orbit-ai",
    relatedCodePaths: ["repos/orbits/features/orbit-ai/proactive-contract.ts", "repos/orbits/app/api/ai/proactive-turns/route.ts"],
    relatedKnowledgePages: ["knowledge/wiki/modules.zh.md", "knowledge/wiki/actions-system.zh.md"],
  }),
  doc({
    id: "relationship-search-agent-tool-boundaries",
    titleZh: "关系搜索与 Orbit Agent 工具边界设计",
    summaryZh: "确立中央 planner + 分布式工具归属的目标边界：Orbit AI 负责规划/白名单/trace/合成，业务 feature 拥有工具策略（contacts.recommend、events.recommend 等），Relationship Search 只做证据背书的检索基底（关键词/向量/元数据/图约束混合），不得拥有推荐策略或写副作用；并规定 live 检索的 provenance 与权限要求。",
    reviewEvidenceZh: "记录目标边界的设计文档，边界原则仍是权威（roadmap 与 codex prompt 均引用）；当前检索实现以 repos/orbits/features/search/live-service.ts 及 tests/capabilities/relationship-natural-search-live-store.test.ts 为准，contact-recommendation-matching 的迁移仍是方向性描述。",
    sourcePath: "repos/orbits/docs/superpowers/specs/2026-07-01-relationship-search-and-agent-tools-design.md",
    category: "sprint-spec",
    status: "current",
    freshness: "likely-current",
    ownerArea: "orbit-ai",
    relatedCodePaths: ["repos/orbits/features/search/live-service.ts", "repos/orbits/features/search/service-factory.ts", "repos/orbits/features/orbit-ai"],
    relatedKnowledgePages: ["knowledge/wiki/architecture.zh.md", "knowledge/wiki/modules.zh.md"],
  }),
  doc({
    id: "codex-live-feature-execution-prompt",
    titleZh: "Codex Live 功能执行提示词（2026-07-04）",
    summaryZh: "供新 Codex 会话继续 live 数据功能落地的一次性交接提示词：指向 roadmap 为 source of truth，规定 goal 粒度、TDD、GitNexus 影响分析、验证门（lint/test/远程 smoke）、fail-closed 与禁外部副作用等不可协商规则，以及远程数据库环境变量约定。",
    reviewEvidenceZh: "一次性执行交接材料（历史快照），其中的架构规则来自 roadmap 与各设计文档；当前工作状态与规则以 docs/superpowers/specs/2026-07-01-live-data-feature-roadmap.md 及仓库代码/测试为准，不应把本提示词当作最新进度依据。",
    sourcePath: "repos/orbits/docs/superpowers/specs/2026-07-04-codex-live-feature-execution-prompt.md",
    category: "sprint-spec",
    status: "historical",
    freshness: "likely-current",
    ownerArea: "data",
    relatedCodePaths: ["repos/orbits/shared/storage/live-record-store.ts", "repos/orbits/docs/superpowers/plans"],
    relatedKnowledgePages: ["knowledge/wiki/harness.zh.md", "knowledge/wiki/data-and-mockdata.zh.md"],
  }),
  doc({
    id: "event-detail-ui-contract",
    titleZh: "活动详情页 UI 合约（Sprint 95）",
    summaryZh: "规定 /app/events/[id]（以 event_001 为目标）恢复后的页面层级：hero、schedule、relationship priority、报名动作、attendee context、supporting details 必须可见，移动端固定 CTA 需 overlap/overflow guard；并明确 route view model 边界（无显式 ?mode=live 时读本地确定性工作区、缺配置 fail-closed）、渲染期零副作用和防回归测试清单。",
    reviewEvidenceZh: "当前权威的页面 UI 合约；具体断言以 repos/orbits/tests/pages/app-event-detail-page.test.tsx 与 app-event-detail-live-route-services.test.ts 及 app/(app)/app/events/[id] 路由代码为准，event_002 的 controlled boundary 等状态可能随后续 sprint 变化。",
    sourcePath: "repos/orbits/app/(app)/app/events/EVENT_DETAIL_UI_CONTRACT.md",
    category: "ui-contract",
    status: "current",
    freshness: "likely-current",
    ownerArea: "events",
    relatedCodePaths: ["repos/orbits/app/(app)/app/events/[id]", "repos/orbits/tests/pages/app-event-detail-page.test.tsx", "repos/orbits/tests/pages/app-event-detail-live-route-services.test.ts"],
    relatedKnowledgePages: ["knowledge/wiki/modules.zh.md", "knowledge/wiki/harness.zh.md"],
  }),
  doc({
    id: "orbit-ai-proactive-agent-basic-plan",
    titleZh: "Orbit AI 主动代理基础版实施计划",
    summaryZh: "以 mock-first 方式在 features/orbit-ai 下新增独立的 orbit-ai-proactive-agent 能力：把结构化信号（AgentSignal）转成投递到 Orbit AI 聊天窗口的主动助手消息（deliverySurface: orbit_ai_chat），Notifications 仅作为未来投递管道而非内容生产方。计划刻意绕开高影响的 createOrbitAgentConversationService，全部任务复选框已勾选完成。",
    reviewEvidenceZh: "这是一份已执行完毕的一次性 TDD 实施计划（所有步骤标记为 [x]），属于历史材料；代码中已出现超出本计划范围的 live-proactive-service.ts 与 PROACTIVE_AGENT_LIVE_IMPLEMENTATION.md，说明主动代理能力已继续演进。当前行为应以 repos/orbits/features/orbit-ai 下的合约与服务代码及其 DESIGN.md 为准，本计划仅供追溯边界决策（主动内容归 Orbit AI 聊天、通知只做投递）。",
    sourcePath: "docs/superpowers/plans/2026-07-01-orbit-ai-proactive-agent-basic.md",
    category: "implementation-plan",
    status: "historical",
    freshness: "likely-current",
    ownerArea: "orbit-ai",
    relatedCodePaths: ["repos/orbits/features/orbit-ai/proactive-contract.ts", "repos/orbits/features/orbit-ai/mock-proactive-service.ts", "repos/orbits/features/orbit-ai/proactive-service-factory.ts"],
    relatedKnowledgePages: ["knowledge/wiki/modules.zh.md", "knowledge/wiki/architecture.zh.md"],
  }),
  doc({
    id: "ios-app-first-stage",
    titleZh: "Orbit iOS App 第一阶段实施计划",
    summaryZh: "在 repos/orbit-app 从零搭建 iOS-first 的独立 Expo 客户端：Expo Router 路由骨架、带类型的 API envelope 客户端（含非 JSON/网络失败的受控错误码）、RouteState 视图模型映射、移动端设计 token 与基础组件，以及 AI/Events/Contacts/Schedule/Profile 五个数据驱动 Tab。全程只走 repos/orbits 的 HTTP API，禁止直读数据库或引用 web 源码。",
    reviewEvidenceZh: "这是一次性的分任务实施计划（含完整文件内容与逐条命令），属于已执行的历史材料——repos/orbit-app 中对应的 src/api、src/view-models、src/screens、tests 均已落地并继续被后续 Goal 2-8 演进。当前结构与行为应以 repos/orbit-app 实际代码及其 AGENTS.md/README.md 为准；计划中的绝对路径也已过时。",
    sourcePath: "docs/superpowers/plans/2026-07-03-orbit-ios-app-first-stage.md",
    category: "implementation-plan",
    status: "historical",
    freshness: "likely-current",
    ownerArea: "ios-app",
    relatedCodePaths: ["repos/orbit-app/src/api/client.ts", "repos/orbit-app/src/view-models/route-state.ts", "repos/orbit-app/src/hooks/useApiResource.ts"],
    relatedKnowledgePages: ["knowledge/wiki/architecture.zh.md", "knowledge/wiki/project-overview.zh.md"],
  }),
  doc({
    id: "ios-app-goal-2-details-refresh",
    titleZh: "iOS App 目标 2：详情导航与下拉刷新计划",
    summaryZh: "把首阶段只读列表升级为可导航、可刷新的移动视图：Events/Contacts 卡片跳转详情路由并请求 /api/events/:id 与 /api/contacts/:id，useApiResource 增加 refresh/refreshing 状态支持下拉刷新，详情映射器需兼容 mock/hybrid/live 三种载荷形态。",
    reviewEvidenceZh: "简短的一次性任务清单式计划，属于已执行的历史材料；repos/orbit-app 中的 EventDetailScreen/ContactDetailScreen、detail-view-model.test.ts 及 useApiResource 均已实现对应能力。当前行为以 orbit-app 代码为准，本文档仅记录该阶段的范围与排除项（不含鉴权、离线缓存、编辑操作等）。",
    sourcePath: "docs/superpowers/plans/2026-07-03-orbit-ios-app-goal-2-details-and-refresh.md",
    category: "implementation-plan",
    status: "historical",
    freshness: "likely-current",
    ownerArea: "ios-app",
    relatedCodePaths: ["repos/orbit-app/src/screens/events/EventDetailScreen.tsx", "repos/orbit-app/src/screens/contacts/ContactDetailScreen.tsx", "repos/orbit-app/src/hooks/useApiResource.ts"],
    relatedKnowledgePages: ["knowledge/wiki/architecture.zh.md", "knowledge/wiki/project-overview.zh.md"],
  }),
  doc({
    id: "ios-app-goal-3-runtime-server-settings",
    titleZh: "iOS App 目标 3：运行时服务器地址设置计划",
    summaryZh: "让 App 在运行时切换 Orbit API 服务器地址，模拟器、真机、远程 API 测试无需改代码：新增 base URL 规范化/校验工具、AsyncStorage 持久化的服务器地址 Provider 包裹根布局，并把只读 Settings 页替换为可编辑的服务器地址表单。",
    reviewEvidenceZh: "一次性任务清单式计划，属于已执行的历史材料；repos/orbit-app/src/api 下的 base-url.ts、ApiBaseUrlProvider.tsx 与 ApiSettingsScreen.tsx 及 base-url.test.ts 已落地。当前行为以这些代码为准，本文档记录该阶段范围（明确排除鉴权、密钥与生产环境管理）。",
    sourcePath: "docs/superpowers/plans/2026-07-03-orbit-ios-app-goal-3-runtime-server-settings.md",
    category: "implementation-plan",
    status: "historical",
    freshness: "likely-current",
    ownerArea: "ios-app",
    relatedCodePaths: ["repos/orbit-app/src/api/base-url.ts", "repos/orbit-app/src/api/ApiBaseUrlProvider.tsx", "repos/orbit-app/src/screens/settings/ApiSettingsScreen.tsx"],
    relatedKnowledgePages: ["knowledge/wiki/architecture.zh.md", "knowledge/wiki/harness.zh.md"],
  }),
  doc({
    id: "ios-app-goal-4-orbit-ai-send-message",
    titleZh: "iOS App 目标 4：Orbit AI 发送消息计划",
    summaryZh: "把移动端 Orbit AI Tab 从只读列表变成可用的助手收件箱：新增聊天输入框，经现有 envelope 客户端 POST /api/ai/conversations，映射助手回复、消息列表与建议的工具意图，并渲染发送中/成功/校验失败/离线/失败等状态。明确不含流式响应与工具确认执行。",
    reviewEvidenceZh: "一次性任务清单式计划，属于已执行的历史材料；repos/orbit-app 的 AiScreen.tsx、conversations.ts 视图模型与 conversation-view-model.test.ts 已实现该能力并被后续 Goal 5 继续扩展。当前行为以 orbit-app 代码及 orbits 侧 /api/ai/conversations 合约为准。",
    sourcePath: "docs/superpowers/plans/2026-07-03-orbit-ios-app-goal-4-orbit-ai-send-message.md",
    category: "implementation-plan",
    status: "historical",
    freshness: "likely-current",
    ownerArea: "ios-app",
    relatedCodePaths: ["repos/orbit-app/src/screens/ai/AiScreen.tsx", "repos/orbit-app/src/view-models/conversations.ts", "repos/orbit-app/tests/conversation-view-model.test.ts"],
    relatedKnowledgePages: ["knowledge/wiki/modules.zh.md", "knowledge/wiki/actions-system.zh.md"],
  }),
  doc({
    id: "ios-app-goal-5-orbit-ai-bootstrap-summary",
    titleZh: "iOS App 目标 5：Orbit AI 启动摘要计划",
    summaryZh: "为 Orbit AI Tab 增加 API 驱动的启动摘要：通过 /api/app/bootstrap 读取关系上下文，在 bootstrap 视图模型中新增 bootstrapMetrics 生成 Events/Follow-ups/Relationships/Assistant actions 等紧凑指标卡，让用户发消息前先看到当日关系概览。坚持不新增第六个 Tab、不做营销式首页。",
    reviewEvidenceZh: "一次性 TDD 实施计划，属于已执行的历史材料；repos/orbit-app/src/view-models/bootstrap.ts 与 bootstrap-view-model.test.ts 已包含对应实现。当前摘要卡的字段与文案以 orbit-app 代码和 orbits 侧 bootstrap API 载荷为准。",
    sourcePath: "docs/superpowers/plans/2026-07-03-orbit-ios-app-goal-5-orbit-ai-bootstrap-summary.md",
    category: "implementation-plan",
    status: "historical",
    freshness: "likely-current",
    ownerArea: "ios-app",
    relatedCodePaths: ["repos/orbit-app/src/view-models/bootstrap.ts", "repos/orbit-app/tests/bootstrap-view-model.test.ts", "repos/orbit-app/src/screens/ai/AiScreen.tsx"],
    relatedKnowledgePages: ["knowledge/wiki/data-and-mockdata.zh.md", "knowledge/wiki/project-overview.zh.md"],
  }),
  doc({
    id: "ios-app-goal-6-server-health-check",
    titleZh: "iOS App 目标 6：服务器健康检查计划",
    summaryZh: "让 Server 设置页可以验证配置的 Orbit API 地址是否可达：新增 health 视图模型把 /api/health 载荷转成用户可读文案（隐藏 mode/mock/hybrid 等运行时实现字段），用户点按检查按钮时经现有 OrbitApiClient 发起请求。",
    reviewEvidenceZh: "一次性 TDD 实施计划，属于已执行的历史材料；repos/orbit-app/src/view-models/health.ts、health-view-model.test.ts 与 ApiSettingsScreen.tsx 均已落地。当前行为以 orbit-app 代码为准，文档价值在于记录\"用户文案不得暴露运行时实现标签\"这一约束。",
    sourcePath: "docs/superpowers/plans/2026-07-03-orbit-ios-app-goal-6-server-health-check.md",
    category: "implementation-plan",
    status: "historical",
    freshness: "likely-current",
    ownerArea: "ios-app",
    relatedCodePaths: ["repos/orbit-app/src/view-models/health.ts", "repos/orbit-app/tests/health-view-model.test.ts", "repos/orbit-app/src/screens/settings/ApiSettingsScreen.tsx"],
    relatedKnowledgePages: ["knowledge/wiki/harness.zh.md", "knowledge/wiki/architecture.zh.md"],
  }),
  doc({
    id: "ios-app-goal-7-actionable-schedule-cards",
    titleZh: "iOS App 目标 7：可行动的日程卡片计划",
    summaryZh: "把 Schedule Tab 从占位文案升级为可行动的跟进上下文：扩展 schedule 视图模型保留 /api/tasks 中的 contactName、organization、priority、recommendedAction 字段并在紧凑卡片中渲染，不新增后端路由，也暂不加任务详情路由（等详情 API 存在再说）。",
    reviewEvidenceZh: "一次性 TDD 实施计划，属于已执行的历史材料；repos/orbit-app/src/view-models/schedule.ts 与 ScheduleScreen.tsx 已实现扩展字段。当前卡片字段与展示逻辑以 orbit-app 代码及 orbits 侧 /api/tasks 载荷为准。",
    sourcePath: "docs/superpowers/plans/2026-07-03-orbit-ios-app-goal-7-actionable-schedule-cards.md",
    category: "implementation-plan",
    status: "historical",
    freshness: "likely-current",
    ownerArea: "ios-app",
    relatedCodePaths: ["repos/orbit-app/src/view-models/schedule.ts", "repos/orbit-app/src/screens/schedule/ScheduleScreen.tsx", "repos/orbit-app/tests/screen-state.test.ts"],
    relatedKnowledgePages: ["knowledge/wiki/data-and-mockdata.zh.md", "knowledge/wiki/project-overview.zh.md"],
  }),
  doc({
    id: "ios-app-goal-8-actionable-contact-cards",
    titleZh: "iOS App 目标 8：可行动的联系人卡片计划",
    summaryZh: "让 Contacts Tab 展示下一步行动、状态与价值上下文：扩展联系人摘要映射器输出 nextAction、用户可读的 status（如 needs_follow_up 转为 Needs follow up）与 valueScore，在现有卡片列表中渲染并保留详情导航，同时不暴露 source/provider 等内部字段。",
    reviewEvidenceZh: "一次性 TDD 实施计划，属于已执行的历史材料；repos/orbit-app/src/view-models/contacts.ts 与 ContactsScreen.tsx 已实现扩展映射。当前联系人卡片行为以 orbit-app 代码及 orbits 侧 /api/contacts 载荷为准。",
    sourcePath: "docs/superpowers/plans/2026-07-03-orbit-ios-app-goal-8-actionable-contact-cards.md",
    category: "implementation-plan",
    status: "historical",
    freshness: "likely-current",
    ownerArea: "ios-app",
    relatedCodePaths: ["repos/orbit-app/src/view-models/contacts.ts", "repos/orbit-app/src/screens/contacts/ContactsScreen.tsx", "repos/orbit-app/tests/screen-state.test.ts"],
    relatedKnowledgePages: ["knowledge/wiki/data-and-mockdata.zh.md", "knowledge/wiki/project-overview.zh.md"],
  }),
  doc({
    id: "events-capability-live-data-design",
    titleZh: "Events 能力接入真实数据设计",
    summaryZh: "规划 Events 从\"mock 命名目录 + 纯 mock 服务\"分三阶段走向真实数据：先把子能力目录去 mock 化改为业务命名（attendee-roster、goal-readiness、encounter-note、want-connect、post-event-review），再基于 LiveRecord 信封建立存储 provider 骨架与七类集合，最后逐能力接入 live 服务并在 service-factory 注册，缺失 live 配置时 fail-closed 而非回退 mock。同时划定边界：Events 只存事件工作记录和联系人草稿，正式联系人创建仍走 Acquisition/Contacts。",
    reviewEvidenceZh: "这是 sprint 设计文档而非一次性计划；repos/orbits/features/events 下的目录已呈业务命名且存在 storage/ 与 service-factory.ts，说明至少 Stage 1-2 已落地。三阶段路线与边界规则（Events 不直接建联系人、Calendar 导入与 Events Live Store 分离）仍是该能力的设计权威；具体实现进度以 features/events 代码为准。",
    sourcePath: "docs/superpowers/specs/2026-07-01-events-capability-live-data-design.md",
    category: "sprint-spec",
    status: "current",
    freshness: "likely-current",
    ownerArea: "events",
    relatedCodePaths: ["repos/orbits/features/events/service-factory.ts", "repos/orbits/features/events/storage", "repos/orbits/features/events/attendee-roster"],
    relatedKnowledgePages: ["knowledge/wiki/modules.zh.md", "knowledge/wiki/data-and-mockdata.zh.md"],
  }),
  doc({
    id: "orbit-ios-app-design",
    titleZh: "Orbit iOS App 总体设计",
    summaryZh: "确立 repos/orbit-app 作为 iOS-first 独立 Expo 客户端的总体设计：明确拒绝 WebView 封装与过早 monorepo 化，移动端只消费 repos/orbits 的 /api/** HTTP 接口，Orbit AI 聊天窗口是唯一助手收件箱（主动提醒以助手 turn 出现而非独立通知中心）。定义了移动端/Web 端职责边界、API 客户端要求、五 Tab 导航模型、设计规则，以及 Goal 1-12 的长期路线（从脚手架到相机采集、推送与 TestFlight 发布）。",
    reviewEvidenceZh: "这是 orbit-app 的顶层设计文档，也是 Goal 2-8 各实施计划共同引用的权威来源；其边界规则（独立 Expo 应用、仅走 HTTP API、不暴露 mock/hybrid/provider 标签、路由状态五分法）与当前 repos/orbit-app 代码一致，仍应视为移动端架构的现行准绳。Goal 9 之后的路线（原生采集、推送、发布）尚未实施，属于前瞻内容。",
    sourcePath: "docs/superpowers/specs/2026-07-03-orbit-ios-app-design.md",
    category: "sprint-spec",
    status: "current",
    freshness: "likely-current",
    ownerArea: "ios-app",
    relatedCodePaths: ["repos/orbit-app/app.config.ts", "repos/orbit-app/src/api/client.ts", "repos/orbit-app/AGENTS.md"],
    relatedKnowledgePages: ["knowledge/wiki/architecture.zh.md", "knowledge/wiki/project-overview.zh.md"],
  }),
  doc({
    id: "app-plan-connections-live-store",
    titleZh: "Connections 证据 Live Store 计划（Goal 3）",
    summaryZh: "将连接/证据读取模型从 mock-only 迁移到基于 orbit_records（connections/contacts/evidence 集合）的 live 存储模式：新增 live 连接证据服务与存储 provider，注册 live 模式，API 路由改为 await 异步服务，addEvidence 在 live 模式下保持 fail-closed。验收含内存 live store 读到 510 条连接及远端 Postgres 返回生成的关系连接。",
    reviewEvidenceZh: "这是一份 2026-07-01 的一次性实施计划（goal/scope/acceptance 形式），描述的是当时的目标而非现状；实际行为应以 features/connections 下的 live 服务、service-factory 及对应测试为准。",
    sourcePath: "repos/orbits/docs/superpowers/plans/2026-07-01-connections-live-store.md",
    category: "implementation-plan",
    status: "historical",
    freshness: "likely-current",
    ownerArea: "connections",
    relatedCodePaths: ["repos/orbits/features/connections/live-service.ts", "repos/orbits/features/connections/storage/connection-live-record-provider.ts", "repos/orbits/features/connections/service-factory.ts"],
    relatedKnowledgePages: ["knowledge/wiki/data-and-mockdata.zh.md", "knowledge/wiki/modules.zh.md"],
  }),
  doc({
    id: "app-plan-contacts-live-store",
    titleZh: "Contacts Live Store 计划（Goal 2）",
    summaryZh: "将 Contacts 列表/搜索/筛选能力从 hybrid 本地远端数据迁移到共享 orbit_records 表的 live 存储模式：保留 contract.ts 为 DTO 边界，新增 live 服务与读取 contacts/connections/evidence 的存储 provider，注册 live 模式并让 /api/contacts 路由异步化。验收含内存 live store 读到 66 个联系人及 live 模式无数据库配置时 fail-closed。",
    reviewEvidenceZh: "这是一份 2026-07-01 的一次性实施计划，记录当时的迁移目标与验收标准；当前实际实现应以 features/contacts 下的 live 服务、存储 provider 与 service-factory 及其测试为准。",
    sourcePath: "repos/orbits/docs/superpowers/plans/2026-07-01-contacts-live-store.md",
    category: "implementation-plan",
    status: "historical",
    freshness: "likely-current",
    ownerArea: "contacts",
    relatedCodePaths: ["repos/orbits/features/contacts/live-service.ts", "repos/orbits/features/contacts/storage/contact-live-record-provider.ts", "repos/orbits/features/contacts/service-factory.ts"],
    relatedKnowledgePages: ["knowledge/wiki/data-and-mockdata.zh.md", "knowledge/wiki/modules.zh.md"],
  }),
  doc({
    id: "app-plan-events-live-store",
    titleZh: "Events Live Store 实施计划",
    summaryZh: "为 Events 的 event-crud-import 子能力增加显式 live 模式的 TDD 任务清单：先写失败测试，再实现带 LiveEventStoreProvider 的 live 服务（未配置 provider 时返回 EVENTS_LIVE_STORE_UNCONFIGURED），最后仅在该子能力的 factory 注册 live。明确不涉及日历 provider 导入，live 不得回退到 mock/hybrid，仅创建成功后才置 liveDatabaseWriteExecuted。",
    reviewEvidenceZh: "这是一份按任务分步执行的一次性实施计划（含 RED/GREEN 验证命令与 GitNexus 检测步骤）；Events live 能力的现状应以 features/events/event-crud-and-import/live-service.ts、service-factory 及对应能力测试为准。",
    sourcePath: "repos/orbits/docs/superpowers/plans/2026-07-01-events-live-store.md",
    category: "implementation-plan",
    status: "historical",
    freshness: "likely-current",
    ownerArea: "events",
    relatedCodePaths: ["repos/orbits/features/events/event-crud-and-import/live-service.ts", "repos/orbits/features/events/service-factory.ts"],
    relatedKnowledgePages: ["knowledge/wiki/modules.zh.md", "knowledge/wiki/data-and-mockdata.zh.md"],
  }),
  doc({
    id: "app-plan-live-generated-fixtures-seed",
    titleZh: "生成 Fixture 灌种到 Live 库的实施计划",
    summaryZh: "把 defaultMockFixtures 的全部 21 个集合灌种到远端 orbit_records Postgres 并验证：新增共享 seed 模块（DTO 转通用 LiveRecord、幂等 upsert、结构化 verify）和 db:seed/db:verify npm 脚本。文末附执行证据：已对远端工作区上载 8267 条记录，并逐集合列出计数与关键记录字段校验。",
    reviewEvidenceZh: "这是一份已执行完毕的一次性计划，自带 Execution Evidence（远端集合计数、关键记录校验）；后续应以 shared/storage/seed-generated-fixtures.ts、两个 CLI 脚本与 live-generated-fixture-seed 测试为准，计数可能随 fixture 演进而变化。",
    sourcePath: "repos/orbits/docs/superpowers/plans/2026-07-01-live-generated-fixtures-seed.md",
    category: "implementation-plan",
    status: "historical",
    freshness: "likely-current",
    ownerArea: "data",
    relatedCodePaths: ["repos/orbits/shared/storage/seed-generated-fixtures.ts", "repos/orbits/scripts/seed-live-generated-fixtures.ts", "repos/orbits/tests/services/live-generated-fixture-seed.test.ts"],
    relatedKnowledgePages: ["knowledge/wiki/data-and-mockdata.zh.md", "knowledge/wiki/architecture.zh.md"],
  }),
  doc({
    id: "app-plan-live-record-storage",
    titleZh: "Live Record 存储层实施计划",
    summaryZh: "新增 shared/storage 薄存储层的 TDD 计划：定义数据库中立的 LiveRecord 信封与 LiveRecordStore 接口（list/get/upsert/delete）、内存实现和 orbit_records 的 Postgres 迁移 SQL，并以 Events 存储 provider 作为第一个消费者。约束包括不含 feature 业务规则、DTO 映射留在 feature provider、Search/Orbit AI 不直接读存储、单测不依赖运行中的 Postgres。",
    reviewEvidenceZh: "这是一份 2026-07-01 的一次性实施计划，奠定了 shared/storage 与 hybrid local-remote-store 并存的边界；存储层现状应以 shared/storage/live-record-store.ts、migrations.ts 及 live-record-storage 测试为准。",
    sourcePath: "repos/orbits/docs/superpowers/plans/2026-07-01-live-record-storage.md",
    category: "implementation-plan",
    status: "historical",
    freshness: "likely-current",
    ownerArea: "data",
    relatedCodePaths: ["repos/orbits/shared/storage/live-record-store.ts", "repos/orbits/shared/storage/migrations.ts", "repos/orbits/features/events/event-crud-and-import/providers/storage-event-provider.ts"],
    relatedKnowledgePages: ["knowledge/wiki/architecture.zh.md", "knowledge/wiki/data-and-mockdata.zh.md"],
  }),
  doc({
    id: "app-plan-search-backend-abstractions",
    titleZh: "关系搜索后端抽象实施计划",
    summaryZh: "为 Relationship Search 引入可配置的 backend/store 抽象：默认保持 fixture-backed 确定性实现，用 ORBIT_RELATIONSHIP_SEARCH_BACKEND / _STORE 环境变量选择实现（非法值显式失败），API 载荷保持稳定；并新增 Contacts 拥有的 contacts.recommend 搜索适配器，让 Orbit AI matcher 通过它委托检索而不越权拥有业务策略。",
    reviewEvidenceZh: "这是一份一次性 TDD 实施计划，明确了 Search 拥有检索机制、Contacts 拥有推荐策略、Orbit AI 拥有工具选择的分工；现状应以 features/search/backend-factory.ts、stores/fixture-store.ts 与 features/contacts/contact-recommendation-search.ts 为准。",
    sourcePath: "repos/orbits/docs/superpowers/plans/2026-07-01-search-backend-abstractions.md",
    category: "implementation-plan",
    status: "historical",
    freshness: "likely-current",
    ownerArea: "search",
    relatedCodePaths: ["repos/orbits/features/search/backend-factory.ts", "repos/orbits/features/search/stores/fixture-store.ts", "repos/orbits/features/contacts/contact-recommendation-search.ts"],
    relatedKnowledgePages: ["knowledge/wiki/architecture.zh.md", "knowledge/wiki/modules.zh.md"],
  }),
  doc({
    id: "app-plan-contacts-live-route-performance",
    titleZh: "Contacts Live 路由性能优化计划",
    summaryZh: "把 /app/contacts 及详情页 live 模式的冗余全图读取替换为按路由收敛的 focused graph 读取：为 contacts/connections/relationship-value provider 增加可选的 focused 方法并保留全图 API 兼容回退，详情路由增加 live-only 的共享图 fast path（一次加载、三处复用）。计划还记录了当时脏工作区草稿的分类处理和逐符号 GitNexus 风险闸门。",
    reviewEvidenceZh: "这是一份 2026-07-02 的一次性性能优化实施计划（含每步测试断言与提交流程），并带有'未经用户明确恢复不得实施'的前置条件；实际查询形态应以 contacts/connections/analysis 的 live 服务、存储 provider 及 *-live-store 能力测试为准。",
    sourcePath: "repos/orbits/docs/superpowers/plans/2026-07-02-contacts-live-route-performance.md",
    category: "implementation-plan",
    status: "historical",
    freshness: "likely-current",
    ownerArea: "contacts",
    relatedCodePaths: ["repos/orbits/features/contacts/live-detail-service.ts", "repos/orbits/features/analysis/live-value-service.ts", "repos/orbits/tests/capabilities/contacts-live-store.test.ts"],
    relatedKnowledgePages: ["knowledge/wiki/modules.zh.md", "knowledge/wiki/data-and-mockdata.zh.md"],
  }),
  doc({
    id: "orbit-ai-contact-recommendation-evaluation",
    titleZh: "Orbit AI 联系人推荐评估",
    summaryZh: "Sprint 86 目标驱动联系人发现的评估文档：五类可审计信号、十个命名评估用例、就绪分数阈值 72，以及展示层对三语 fixture 片段和英文诊断串的本地化清洗规则。还记录了多语言检索策略（查询侧 extractSearchTerms 抽英文关键词、录入侧翻译合成双语 searchText，均 fail-closed）和 mock 到 live 的替换路径与隐私约束。",
    reviewEvidenceZh: "这是能力评估与边界文档，混合了设计决策与现行实现说明；评估阈值、用例与安全约束以文档为设计基准，具体行为以 contact-recommendation-service.ts、language-normalization-service.ts 及对应评估测试为准。",
    sourcePath: "repos/orbits/features/orbit-ai/CONTACT_RECOMMENDATION_EVALUATION.md",
    category: "evaluation",
    status: "current",
    freshness: "likely-current",
    ownerArea: "orbit-ai",
    relatedCodePaths: ["repos/orbits/features/orbit-ai/contact-recommendation-service.ts", "repos/orbits/features/orbit-ai/contact-recommendation-artifact-service.ts", "repos/orbits/features/orbit-ai/language-normalization-service.ts"],
    relatedKnowledgePages: ["knowledge/wiki/actions-system.zh.md", "knowledge/wiki/harness.zh.md"],
  }),
  doc({
    id: "orbit-ai-event-recommendation-evaluation",
    titleZh: "Orbit AI 活动推荐评估",
    summaryZh: "Sprint 87 goal_relevance_v1 活动推荐规则服务的评估文档：五类信号评分（参会意图/活动主题/时间/关系机会/画像匹配）、就绪阈值 74、十个固定评估场景，以及无可解析目标时必须返回 needs_more_context 的约束。详情链接暂指向 demo-event-1 工作区并以 sourceEventId 保留来源，文末给出 live 替换所需的 provider 文件、只读权限与 fail-closed 要求。",
    reviewEvidenceZh: "这是能力评估文档，阈值与评估用例是设计承诺；实际评分与拒绝行为以 event-recommendation-service.ts、artifact service 及其评估测试为准，demo-event-1 链接是待 live sprint 替换的已知临时状态。",
    sourcePath: "repos/orbits/features/orbit-ai/EVENT_RECOMMENDATION_EVALUATION.md",
    category: "evaluation",
    status: "current",
    freshness: "likely-current",
    ownerArea: "orbit-ai",
    relatedCodePaths: ["repos/orbits/features/orbit-ai/event-recommendation-service.ts", "repos/orbits/features/orbit-ai/event-recommendation-artifact-service.ts"],
    relatedKnowledgePages: ["knowledge/wiki/actions-system.zh.md", "knowledge/wiki/harness.zh.md"],
  }),
  doc({
    id: "orbit-ai-followup-context-evaluation",
    titleZh: "Orbit AI 跟进上下文评估",
    summaryZh: "Sprint 85 跟进上下文解析的评估文档：chat.context 工具计划经会话候选打分（接受阈值 0.7，模糊高分必须 pending）后才调用 generator，十个命名用例覆盖直接命中、失效会话 id、同名歧义、中英文输入和隐私受限等场景。大量篇幅记录失败模式清单——原始来源标签/技术 token/actor 与 ISO 时间戳不得泄漏到主面板、移动端证据必须折叠分层等呈现约束。",
    reviewEvidenceZh: "这是能力评估与失败案例分析文档，其失败模式清单是 UI 呈现的审计标准；实际解析与面板行为以 chat-context-artifact-service.ts 和 orbit-ai-followup-context-evaluation 测试为准。",
    sourcePath: "repos/orbits/features/orbit-ai/FOLLOWUP_CONTEXT_EVALUATION.md",
    category: "evaluation",
    status: "current",
    freshness: "likely-current",
    ownerArea: "orbit-ai",
    relatedCodePaths: ["repos/orbits/features/orbit-ai/chat-context-artifact-service.ts", "repos/orbits/tests/capabilities/orbit-ai-followup-context-evaluation.test.ts"],
    relatedKnowledgePages: ["knowledge/wiki/actions-system.zh.md", "knowledge/wiki/harness.zh.md"],
  }),
  doc({
    id: "orbit-ai-general-conversation-evaluation",
    titleZh: "Orbit AI 普通对话路由评估",
    summaryZh: "Sprint 88 普通对话路由层的评估文档：mock/SSR 预览路径用确定性 general-conversation-service 判断是否需要工具，live 路径则完全交给模型 planner 做意图路由（general_chat 直接自由回复，其它 intent 受 schema 和工具 allowlist 约束），routingDecisionFromPlannerIntent 保持统一展示契约。接受阈值为 no-tool 正确率 100%、上下文记忆正确率 80%。",
    reviewEvidenceZh: "这是评估文档且已随架构演进更新（明确 live 路径不再消费规则判断）；读者应注意 mock 与 live 的路由机制不同，实际行为以 general-conversation-service.ts、live-agent-runtime.ts 及评估测试为准。",
    sourcePath: "repos/orbits/features/orbit-ai/GENERAL_CONVERSATION_EVALUATION.md",
    category: "evaluation",
    status: "current",
    freshness: "likely-current",
    ownerArea: "orbit-ai",
    relatedCodePaths: ["repos/orbits/features/orbit-ai/general-conversation-service.ts", "repos/orbits/features/orbit-ai/live-agent-runtime.ts"],
    relatedKnowledgePages: ["knowledge/wiki/actions-system.zh.md", "knowledge/wiki/harness.zh.md"],
  }),
  doc({
    id: "orbit-ai-todo-summary-evaluation",
    titleZh: "Orbit AI 待办摘要评估",
    summaryZh: "todo-summary-service 回答'我接下来该做什么'的评估文档：只综合结构化输入（对话下一步、日程、生日、引荐、关系提醒），输出必须带来源/证据/链接/优先级，所有动作 requiresConfirmation。五个命名 case 校验召回与首位优先级（阈值均 0.8），服务必须拒绝复用过期的 prepared final response；文末给出 mock-to-live 的文件规划与只读权限约束。",
    reviewEvidenceZh: "这是能力评估文档，五个 case 与阈值是回归基准，live 路径部分是尚未实现的规划；实际行为以 todo-summary-service.ts 和 orbit-ai-todo-summary-evaluation 测试为准。",
    sourcePath: "repos/orbits/features/orbit-ai/TODO_SUMMARY_EVALUATION.md",
    category: "evaluation",
    status: "current",
    freshness: "likely-current",
    ownerArea: "orbit-ai",
    relatedCodePaths: ["repos/orbits/features/orbit-ai/todo-summary-service.ts"],
    relatedKnowledgePages: ["knowledge/wiki/actions-system.zh.md", "knowledge/wiki/harness.zh.md"],
  }),
  doc({
    id: "orbit-ai-panel-localization",
    titleZh: "Orbit AI 面板本地化架构",
    summaryZh: "Sprint 92 把 Orbit AI 右侧结果面板的用户可见文案集中到 panel-localization.ts，按 panel/artifact/metadata/actions/confidence/calendar/proactive/conversation/recovery 九个命名空间组织；缺失翻译键时回退原文，技术溯源字段（id、路径、provider 名、时间戳等）刻意不翻译。React 页面经 /app/agent 本地适配器间接消费，避免 UI 直接 import feature 模块。",
    reviewEvidenceZh: "这是现行架构约定文档：新增用户可见文案应加入对应命名空间而非页面本地修补；命名空间与回退行为以 features/orbit-ai/panel-localization.ts 实现为准。",
    sourcePath: "repos/orbits/features/orbit-ai/PANEL_LOCALIZATION.md",
    category: "architecture",
    status: "current",
    freshness: "likely-current",
    ownerArea: "orbit-ai",
    relatedCodePaths: ["repos/orbits/features/orbit-ai/panel-localization.ts"],
    relatedKnowledgePages: ["knowledge/wiki/actions-system.zh.md", "knowledge/wiki/modules.zh.md"],
  }),
  doc({
    id: "app-test-runner-guide",
    titleZh: "Node 测试运行器使用说明",
    summaryZh: "极简指南：npm test 跑全量测试套件，npm test -- tests/path/example.test.ts 只跑指定文件；harness sprint 合约使用聚焦形式，避免无关套件失败掩盖 sprint 结果。",
    reviewEvidenceZh: "这是仍然有效的开发者指南，仅两条命令约定；具体测试脚本定义以 package.json 的 test script 为准。",
    sourcePath: "repos/orbits/scripts/TEST_RUNNER.md",
    category: "developer-guide",
    status: "current",
    freshness: "likely-current",
    ownerArea: "repos/orbits",
    relatedCodePaths: ["repos/orbits/package.json"],
    relatedKnowledgePages: ["knowledge/wiki/harness.zh.md", "knowledge/wiki/project-overview.zh.md"],
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
    relatedKnowledgePages: ["knowledge/wiki/actions-system.zh.md"],
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
    relatedKnowledgePages: ["knowledge/wiki/actions-system.zh.md"],
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
    relatedKnowledgePages: ["knowledge/wiki/actions-system.zh.md"],
  }),
  doc({
    id: "orbit-ai-positioning-boundary-design",
    titleZh: "Orbit AI 定位与能力边界设计",
    summaryZh:
      "2026-07-11 定稿的产品定位与边界决定：懂你人脉的商务秘书、三层漏斗（对话无边界/能力有边界/执行闭环）、A 档确认执行、邮件永远止于草稿、主动性档位 2、不做清单，附活动端 NFC 互换与语音 memo 决定备忘。",
    reviewEvidenceZh:
      "设计与产品负责人逐节确认；执行深度与主动性尚未实现，后续 sprint 以该文档第 3、4、5、6 节为契约来源。",
    sourcePath: "docs/superpowers/specs/2026-07-11-orbit-ai-positioning-boundary-design.md",
    category: "sprint-spec",
    freshness: "likely-current",
    ownerArea: "orbit-ai",
    relatedCodePaths: [
      "repos/orbits/features/orbit-ai/agent-tools/registry.ts",
      "repos/orbits/features/orbit-ai/live-agent-runtime.ts",
      "repos/orbits/features/agent",
    ],
    relatedKnowledgePages: [
      "knowledge/wiki/actions-system.zh.md",
      "knowledge/wiki/project-overview.zh.md",
    ],
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
    relatedKnowledgePages: ["knowledge/wiki/actions-system.zh.md"],
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
    relatedKnowledgePages: ["knowledge/wiki/actions-system.zh.md"],
  }),
  doc({
    id: "trace-debug-plan",
    titleZh: "Orbit AI Trace Debug 计划",
    summaryZh: "实现 Orbit AI trace debug 页面和 API 的计划。",
    sourcePath: "repos/orbits/docs/superpowers/plans/2026-06-29-orbit-ai-trace-debug.md",
    category: "implementation-plan",
    freshness: "likely-current",
    ownerArea: "orbit-ai",
    relatedKnowledgePages: ["knowledge/wiki/actions-system.zh.md"],
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
    reviewEvidenceZh:
      "来源文件为 gitignore 本地文件，2026-07-11 核对时在本机已缺失；综合内容仍保留在关联知识页。",
    sourcePath: ".learnings/TROUBLESHOOTING.md",
    category: "learning",
    freshness: "known-stale",
    ownerArea: "learning",
    relatedKnowledgePages: ["knowledge/learnings/troubleshooting.zh.md"],
  }),
  doc({
    id: "learning-errors",
    titleZh: "根错误记录",
    summaryZh: "记录 harness 依赖、tsx eval、provider hang 和 git diff 命令等错误经验。",
    reviewEvidenceZh:
      "来源文件为 gitignore 本地文件，2026-07-11 核对时在本机已缺失；综合内容仍保留在关联知识页。",
    sourcePath: ".learnings/ERRORS.md",
    category: "learning",
    freshness: "known-stale",
    ownerArea: "learning",
    relatedKnowledgePages: ["knowledge/learnings/errors.zh.md"],
  }),
  doc({
    id: "learning-patterns-root",
    titleZh: "根通用经验",
    summaryZh: "记录用户反馈、harness best practices 和项目维护经验。",
    reviewEvidenceZh:
      "来源文件为 gitignore 本地文件，2026-07-11 核对时在本机已缺失；综合内容仍保留在关联知识页。",
    sourcePath: ".learnings/LEARNINGS.md",
    category: "learning",
    freshness: "known-stale",
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
    freshness: "known-stale",
    ownerArea: "learning",
    relatedKnowledgePages: ["knowledge/learnings/patterns.zh.md"],
  }),
  doc({
    id: "app-learning-errors",
    titleZh: "App 错误记录",
    summaryZh: "记录 repos/orbits 内 fixture migration、comment patch、git diff 正则等错误经验。",
    reviewEvidenceZh:
      "来源文件为 gitignore 本地文件，2026-07-11 核对时在本机已缺失；综合内容仍保留在关联知识页。",
    sourcePath: "repos/orbits/.learnings/ERRORS.md",
    category: "learning",
    freshness: "known-stale",
    ownerArea: "learning",
    relatedKnowledgePages: ["knowledge/learnings/errors.zh.md"],
  }),
  doc({
    id: "app-learning-patterns",
    titleZh: "App 经验记录",
    summaryZh: "记录 framework/mock/live 解耦、提交范围检查和注释提交卫生等经验。",
    reviewEvidenceZh:
      "来源文件为 gitignore 本地文件，2026-07-11 核对时在本机已缺失；综合内容仍保留在关联知识页。",
    sourcePath: "repos/orbits/.learnings/LEARNINGS.md",
    category: "learning",
    freshness: "known-stale",
    ownerArea: "learning",
    relatedKnowledgePages: ["knowledge/learnings/patterns.zh.md"],
  }),
  ...harnessPromptDocs,
  ...liveImplementationDocs,
  ...julyBacklogDocs,
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
    // known-stale 允许来源路径失效（schema 定义：已知过期、路径失效或被替代）。
    if (entry.freshness !== "known-stale" && !existsSync(join(projectRoot, entry.sourcePath))) {
      missing.push(entry.sourcePath);
    }
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
