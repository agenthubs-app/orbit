export const ORBIT_KNOWLEDGE_MANIFEST = {
  "schemaVersion": 1,
  "generatedOn": "2026-06-30",
  "titleZh": "Orbit 知识库",
  "summaryZh": "这是 Orbit 项目的结构化知识入口。理解项目时，先读这里，再进入文档库、主题知识页、开发历史和排障经验，最后再阅读代码。",
  "documents": [
    {
      "id": "root-agent-operating-notes",
      "titleZh": "根 Agent 运行规则",
      "summaryZh": "定义 harness、repos/orbits、参考项目、sprint 粒度、产品化策略和知识库维护规则。",
      "sourcePath": "AGENT.md",
      "category": "harness",
      "status": "current",
      "freshness": "verified-current",
      "ownerArea": "root"
    },
    {
      "id": "app-agent-rules",
      "titleZh": "Orbits App Agent 规则",
      "summaryZh": "定义 app repo 内实现边界、mock/live 替换、产品 UI 与 contract 解耦，以及 /dev/knowledge manifest 规则。",
      "sourcePath": "repos/orbits/AGENTS.md",
      "category": "technical-design",
      "status": "current",
      "freshness": "verified-current",
      "ownerArea": "repos/orbits"
    },
    {
      "id": "product-design-current",
      "titleZh": "Orbit 产品设计",
      "summaryZh": "描述 Orbit 复杂版产品方向，是理解关系资产、人脉管理和 Agent 目标的产品来源。",
      "sourcePath": "docs/designs/inital_design.md",
      "category": "product-design",
      "status": "current",
      "freshness": "likely-current",
      "ownerArea": "product"
    },
    {
      "id": "product-design-v0",
      "titleZh": "Orbit 产品设计 v0",
      "summaryZh": "早期产品设计版本，保留用于理解历史上下文，阅读时应和当前产品设计对照。",
      "sourcePath": "docs/designs/inital_design.v0.md",
      "category": "product-design",
      "status": "historical",
      "freshness": "needs-code-check",
      "ownerArea": "product"
    },
    {
      "id": "technical-design",
      "titleZh": "Orbit 技术设计",
      "summaryZh": "说明 mock-first、contract-first、模块拆分、Next.js App Router 和服务层边界。",
      "sourcePath": "docs/designs/orbit_technical_design.md",
      "category": "technical-design",
      "status": "current",
      "freshness": "likely-current",
      "ownerArea": "architecture"
    },
    {
      "id": "modular-design",
      "titleZh": "模块化与热拔插设计",
      "summaryZh": "当前 app 模块化原则文档，说明 service factory、mock/hybrid/live 和 route view-model 防腐层。",
      "sourcePath": "repos/orbits/docs/architecture/modular-design.md",
      "category": "architecture",
      "status": "current",
      "freshness": "verified-current",
      "ownerArea": "architecture"
    },
    {
      "id": "local-remote-database",
      "titleZh": "Local Remote Database 边界",
      "summaryZh": "说明 app 本地/远端数据库边界和 relationship schema。由于数据层近期变化频繁，需要持续代码核对。",
      "sourcePath": "repos/orbits/docs/architecture/local-remote-database.md",
      "category": "architecture",
      "status": "needs-review",
      "freshness": "needs-code-check",
      "ownerArea": "data"
    },
    {
      "id": "orbit-ai-performance-check",
      "titleZh": "Orbit AI 性能检查",
      "summaryZh": "记录 2026-06-30 Orbit AI Agent 性能检查，作为优化历史和风险背景。",
      "sourcePath": "repos/orbits/docs/architecture/orbit-ai-agent-performance-check-2026-06-30.md",
      "category": "architecture",
      "status": "historical",
      "freshness": "needs-code-check",
      "ownerArea": "orbit-ai"
    },
    {
      "id": "module-account",
      "titleZh": "account 模块架构",
      "summaryZh": "说明 account 模块的定位、期望行为、Mock 行为和热拔插边界。字段和状态仍以对应 contract 文件为准。",
      "sourcePath": "repos/orbits/docs/architecture/modules/account.md",
      "category": "module-architecture",
      "status": "current",
      "freshness": "verified-current",
      "ownerArea": "module:account"
    },
    {
      "id": "module-acquisition",
      "titleZh": "acquisition 模块架构",
      "summaryZh": "说明 acquisition 模块的定位、期望行为、Mock 行为和热拔插边界。字段和状态仍以对应 contract 文件为准。",
      "sourcePath": "repos/orbits/docs/architecture/modules/acquisition.md",
      "category": "module-architecture",
      "status": "current",
      "freshness": "verified-current",
      "ownerArea": "module:acquisition"
    },
    {
      "id": "module-agent",
      "titleZh": "agent 模块架构",
      "summaryZh": "说明 agent 模块的定位、期望行为、Mock 行为和热拔插边界。字段和状态仍以对应 contract 文件为准。",
      "sourcePath": "repos/orbits/docs/architecture/modules/agent.md",
      "category": "module-architecture",
      "status": "current",
      "freshness": "verified-current",
      "ownerArea": "module:agent"
    },
    {
      "id": "module-ai-provider",
      "titleZh": "ai-provider 模块架构",
      "summaryZh": "说明 ai-provider 模块的定位、期望行为、Mock 行为和热拔插边界。字段和状态仍以对应 contract 文件为准。",
      "sourcePath": "repos/orbits/docs/architecture/modules/ai-provider.md",
      "category": "module-architecture",
      "status": "current",
      "freshness": "verified-current",
      "ownerArea": "module:ai-provider"
    },
    {
      "id": "module-analysis",
      "titleZh": "analysis 模块架构",
      "summaryZh": "说明 analysis 模块的定位、期望行为、Mock 行为和热拔插边界。字段和状态仍以对应 contract 文件为准。",
      "sourcePath": "repos/orbits/docs/architecture/modules/analysis.md",
      "category": "module-architecture",
      "status": "current",
      "freshness": "verified-current",
      "ownerArea": "module:analysis"
    },
    {
      "id": "module-audit",
      "titleZh": "audit 模块架构",
      "summaryZh": "说明 audit 模块的定位、期望行为、Mock 行为和热拔插边界。字段和状态仍以对应 contract 文件为准。",
      "sourcePath": "repos/orbits/docs/architecture/modules/audit.md",
      "category": "module-architecture",
      "status": "current",
      "freshness": "verified-current",
      "ownerArea": "module:audit"
    },
    {
      "id": "module-bootstrap",
      "titleZh": "bootstrap 模块架构",
      "summaryZh": "说明 bootstrap 模块的定位、期望行为、Mock 行为和热拔插边界。字段和状态仍以对应 contract 文件为准。",
      "sourcePath": "repos/orbits/docs/architecture/modules/bootstrap.md",
      "category": "module-architecture",
      "status": "current",
      "freshness": "verified-current",
      "ownerArea": "module:bootstrap"
    },
    {
      "id": "module-chat",
      "titleZh": "chat 模块架构",
      "summaryZh": "说明 chat 模块的定位、期望行为、Mock 行为和热拔插边界。字段和状态仍以对应 contract 文件为准。",
      "sourcePath": "repos/orbits/docs/architecture/modules/chat.md",
      "category": "module-architecture",
      "status": "current",
      "freshness": "verified-current",
      "ownerArea": "module:chat"
    },
    {
      "id": "module-connections",
      "titleZh": "connections 模块架构",
      "summaryZh": "说明 connections 模块的定位、期望行为、Mock 行为和热拔插边界。字段和状态仍以对应 contract 文件为准。",
      "sourcePath": "repos/orbits/docs/architecture/modules/connections.md",
      "category": "module-architecture",
      "status": "current",
      "freshness": "verified-current",
      "ownerArea": "module:connections"
    },
    {
      "id": "module-contacts",
      "titleZh": "contacts 模块架构",
      "summaryZh": "说明 contacts 模块的定位、期望行为、Mock 行为和热拔插边界。字段和状态仍以对应 contract 文件为准。",
      "sourcePath": "repos/orbits/docs/architecture/modules/contacts.md",
      "category": "module-architecture",
      "status": "current",
      "freshness": "verified-current",
      "ownerArea": "module:contacts"
    },
    {
      "id": "module-dashboard",
      "titleZh": "dashboard 模块架构",
      "summaryZh": "说明 dashboard 模块的定位、期望行为、Mock 行为和热拔插边界。字段和状态仍以对应 contract 文件为准。",
      "sourcePath": "repos/orbits/docs/architecture/modules/dashboard.md",
      "category": "module-architecture",
      "status": "current",
      "freshness": "verified-current",
      "ownerArea": "module:dashboard"
    },
    {
      "id": "module-events",
      "titleZh": "events 模块架构",
      "summaryZh": "说明 events 模块的定位、期望行为、Mock 行为和热拔插边界。字段和状态仍以对应 contract 文件为准。",
      "sourcePath": "repos/orbits/docs/architecture/modules/events.md",
      "category": "module-architecture",
      "status": "current",
      "freshness": "verified-current",
      "ownerArea": "module:events"
    },
    {
      "id": "module-followups",
      "titleZh": "followups 模块架构",
      "summaryZh": "说明 followups 模块的定位、期望行为、Mock 行为和热拔插边界。字段和状态仍以对应 contract 文件为准。",
      "sourcePath": "repos/orbits/docs/architecture/modules/followups.md",
      "category": "module-architecture",
      "status": "current",
      "freshness": "verified-current",
      "ownerArea": "module:followups"
    },
    {
      "id": "module-notifications",
      "titleZh": "notifications 模块架构",
      "summaryZh": "说明 notifications 模块的定位、期望行为、Mock 行为和热拔插边界。字段和状态仍以对应 contract 文件为准。",
      "sourcePath": "repos/orbits/docs/architecture/modules/notifications.md",
      "category": "module-architecture",
      "status": "current",
      "freshness": "verified-current",
      "ownerArea": "module:notifications"
    },
    {
      "id": "module-orbit-ai",
      "titleZh": "orbit-ai 模块架构",
      "summaryZh": "说明 orbit-ai 模块的定位、期望行为、Mock 行为和热拔插边界。字段和状态仍以对应 contract 文件为准。",
      "sourcePath": "repos/orbits/docs/architecture/modules/orbit-ai.md",
      "category": "module-architecture",
      "status": "current",
      "freshness": "verified-current",
      "ownerArea": "module:orbit-ai"
    },
    {
      "id": "module-permissions",
      "titleZh": "permissions 模块架构",
      "summaryZh": "说明 permissions 模块的定位、期望行为、Mock 行为和热拔插边界。字段和状态仍以对应 contract 文件为准。",
      "sourcePath": "repos/orbits/docs/architecture/modules/permissions.md",
      "category": "module-architecture",
      "status": "current",
      "freshness": "verified-current",
      "ownerArea": "module:permissions"
    },
    {
      "id": "module-profile",
      "titleZh": "profile 模块架构",
      "summaryZh": "说明 profile 模块的定位、期望行为、Mock 行为和热拔插边界。字段和状态仍以对应 contract 文件为准。",
      "sourcePath": "repos/orbits/docs/architecture/modules/profile.md",
      "category": "module-architecture",
      "status": "current",
      "freshness": "verified-current",
      "ownerArea": "module:profile"
    },
    {
      "id": "module-recommendations",
      "titleZh": "recommendations 模块架构",
      "summaryZh": "说明 recommendations 模块的定位、期望行为、Mock 行为和热拔插边界。字段和状态仍以对应 contract 文件为准。",
      "sourcePath": "repos/orbits/docs/architecture/modules/recommendations.md",
      "category": "module-architecture",
      "status": "current",
      "freshness": "verified-current",
      "ownerArea": "module:recommendations"
    },
    {
      "id": "module-search",
      "titleZh": "search 模块架构",
      "summaryZh": "说明 search 模块的定位、期望行为、Mock 行为和热拔插边界。字段和状态仍以对应 contract 文件为准。",
      "sourcePath": "repos/orbits/docs/architecture/modules/search.md",
      "category": "module-architecture",
      "status": "current",
      "freshness": "verified-current",
      "ownerArea": "module:search"
    },
    {
      "id": "feature-account-design",
      "titleZh": "account Feature 设计",
      "summaryZh": "记录 account feature 的设计边界和 mock-first 实施方向，是模块文档之后的第二层阅读材料。",
      "sourcePath": "repos/orbits/features/account/DESIGN.md",
      "category": "feature-design",
      "status": "needs-review",
      "freshness": "needs-code-check",
      "ownerArea": "feature:account"
    },
    {
      "id": "feature-acquisition-design",
      "titleZh": "acquisition Feature 设计",
      "summaryZh": "记录 acquisition feature 的设计边界和 mock-first 实施方向，是模块文档之后的第二层阅读材料。",
      "sourcePath": "repos/orbits/features/acquisition/DESIGN.md",
      "category": "feature-design",
      "status": "needs-review",
      "freshness": "needs-code-check",
      "ownerArea": "feature:acquisition"
    },
    {
      "id": "feature-agent-design",
      "titleZh": "agent Feature 设计",
      "summaryZh": "记录 agent feature 的设计边界和 mock-first 实施方向，是模块文档之后的第二层阅读材料。",
      "sourcePath": "repos/orbits/features/agent/DESIGN.md",
      "category": "feature-design",
      "status": "needs-review",
      "freshness": "needs-code-check",
      "ownerArea": "feature:agent"
    },
    {
      "id": "feature-analysis-design",
      "titleZh": "analysis Feature 设计",
      "summaryZh": "记录 analysis feature 的设计边界和 mock-first 实施方向，是模块文档之后的第二层阅读材料。",
      "sourcePath": "repos/orbits/features/analysis/DESIGN.md",
      "category": "feature-design",
      "status": "needs-review",
      "freshness": "needs-code-check",
      "ownerArea": "feature:analysis"
    },
    {
      "id": "feature-audit-design",
      "titleZh": "audit Feature 设计",
      "summaryZh": "记录 audit feature 的设计边界和 mock-first 实施方向，是模块文档之后的第二层阅读材料。",
      "sourcePath": "repos/orbits/features/audit/DESIGN.md",
      "category": "feature-design",
      "status": "needs-review",
      "freshness": "needs-code-check",
      "ownerArea": "feature:audit"
    },
    {
      "id": "feature-bootstrap-design",
      "titleZh": "bootstrap Feature 设计",
      "summaryZh": "记录 bootstrap feature 的设计边界和 mock-first 实施方向，是模块文档之后的第二层阅读材料。",
      "sourcePath": "repos/orbits/features/bootstrap/DESIGN.md",
      "category": "feature-design",
      "status": "needs-review",
      "freshness": "needs-code-check",
      "ownerArea": "feature:bootstrap"
    },
    {
      "id": "feature-chat-design",
      "titleZh": "chat Feature 设计",
      "summaryZh": "记录 chat feature 的设计边界和 mock-first 实施方向，是模块文档之后的第二层阅读材料。",
      "sourcePath": "repos/orbits/features/chat/DESIGN.md",
      "category": "feature-design",
      "status": "needs-review",
      "freshness": "needs-code-check",
      "ownerArea": "feature:chat"
    },
    {
      "id": "feature-connections-design",
      "titleZh": "connections Feature 设计",
      "summaryZh": "记录 connections feature 的设计边界和 mock-first 实施方向，是模块文档之后的第二层阅读材料。",
      "sourcePath": "repos/orbits/features/connections/DESIGN.md",
      "category": "feature-design",
      "status": "needs-review",
      "freshness": "needs-code-check",
      "ownerArea": "feature:connections"
    },
    {
      "id": "feature-contacts-design",
      "titleZh": "contacts Feature 设计",
      "summaryZh": "记录 contacts feature 的设计边界和 mock-first 实施方向，是模块文档之后的第二层阅读材料。",
      "sourcePath": "repos/orbits/features/contacts/DESIGN.md",
      "category": "feature-design",
      "status": "needs-review",
      "freshness": "needs-code-check",
      "ownerArea": "feature:contacts"
    },
    {
      "id": "feature-dashboard-design",
      "titleZh": "dashboard Feature 设计",
      "summaryZh": "记录 dashboard feature 的设计边界和 mock-first 实施方向，是模块文档之后的第二层阅读材料。",
      "sourcePath": "repos/orbits/features/dashboard/DESIGN.md",
      "category": "feature-design",
      "status": "needs-review",
      "freshness": "needs-code-check",
      "ownerArea": "feature:dashboard"
    },
    {
      "id": "feature-events-design",
      "titleZh": "events Feature 设计",
      "summaryZh": "记录 events feature 的设计边界和 mock-first 实施方向，是模块文档之后的第二层阅读材料。",
      "sourcePath": "repos/orbits/features/events/DESIGN.md",
      "category": "feature-design",
      "status": "needs-review",
      "freshness": "needs-code-check",
      "ownerArea": "feature:events"
    },
    {
      "id": "feature-followups-design",
      "titleZh": "followups Feature 设计",
      "summaryZh": "记录 followups feature 的设计边界和 mock-first 实施方向，是模块文档之后的第二层阅读材料。",
      "sourcePath": "repos/orbits/features/followups/DESIGN.md",
      "category": "feature-design",
      "status": "needs-review",
      "freshness": "needs-code-check",
      "ownerArea": "feature:followups"
    },
    {
      "id": "feature-notifications-design",
      "titleZh": "notifications Feature 设计",
      "summaryZh": "记录 notifications feature 的设计边界和 mock-first 实施方向，是模块文档之后的第二层阅读材料。",
      "sourcePath": "repos/orbits/features/notifications/DESIGN.md",
      "category": "feature-design",
      "status": "needs-review",
      "freshness": "needs-code-check",
      "ownerArea": "feature:notifications"
    },
    {
      "id": "feature-orbit-ai-design",
      "titleZh": "orbit-ai Feature 设计",
      "summaryZh": "记录 orbit-ai feature 的设计边界和 mock-first 实施方向，是模块文档之后的第二层阅读材料。",
      "sourcePath": "repos/orbits/features/orbit-ai/DESIGN.md",
      "category": "feature-design",
      "status": "needs-review",
      "freshness": "needs-code-check",
      "ownerArea": "feature:orbit-ai"
    },
    {
      "id": "feature-permissions-design",
      "titleZh": "permissions Feature 设计",
      "summaryZh": "记录 permissions feature 的设计边界和 mock-first 实施方向，是模块文档之后的第二层阅读材料。",
      "sourcePath": "repos/orbits/features/permissions/DESIGN.md",
      "category": "feature-design",
      "status": "needs-review",
      "freshness": "needs-code-check",
      "ownerArea": "feature:permissions"
    },
    {
      "id": "feature-profile-design",
      "titleZh": "profile Feature 设计",
      "summaryZh": "记录 profile feature 的设计边界和 mock-first 实施方向，是模块文档之后的第二层阅读材料。",
      "sourcePath": "repos/orbits/features/profile/DESIGN.md",
      "category": "feature-design",
      "status": "needs-review",
      "freshness": "needs-code-check",
      "ownerArea": "feature:profile"
    },
    {
      "id": "feature-recommendations-design",
      "titleZh": "recommendations Feature 设计",
      "summaryZh": "记录 recommendations feature 的设计边界和 mock-first 实施方向，是模块文档之后的第二层阅读材料。",
      "sourcePath": "repos/orbits/features/recommendations/DESIGN.md",
      "category": "feature-design",
      "status": "needs-review",
      "freshness": "needs-code-check",
      "ownerArea": "feature:recommendations"
    },
    {
      "id": "feature-search-design",
      "titleZh": "search Feature 设计",
      "summaryZh": "记录 search feature 的设计边界和 mock-first 实施方向，是模块文档之后的第二层阅读材料。",
      "sourcePath": "repos/orbits/features/search/DESIGN.md",
      "category": "feature-design",
      "status": "needs-review",
      "freshness": "needs-code-check",
      "ownerArea": "feature:search"
    },
    {
      "id": "capability-first-sprint-design",
      "titleZh": "Capability-first Sprint 设计",
      "summaryZh": "解释为什么早期 Orbit sprint 以能力边界而不是页面组件为中心。",
      "sourcePath": "docs/superpowers/specs/2026-06-24-capability-first-sprint-design.md",
      "category": "sprint-spec",
      "status": "current",
      "freshness": "likely-current",
      "ownerArea": "harness"
    },
    {
      "id": "component-level-sprint-design",
      "titleZh": "Component-level Sprint 旧设计",
      "summaryZh": "早期组件级 sprint 设计，已被 capability-first 设计替代。",
      "sourcePath": "docs/superpowers/specs/2026-06-24-component-level-sprint-design.md",
      "category": "sprint-spec",
      "status": "superseded",
      "freshness": "known-stale",
      "ownerArea": "harness"
    },
    {
      "id": "orbit-product-chat-agent-design",
      "titleZh": "产品级 Chat Agent 设计",
      "summaryZh": "记录 Orbit 产品级 Chat Agent 的目标、边界和 agent 工作流判断。",
      "sourcePath": "docs/superpowers/specs/2026-06-29-orbit-product-chat-agent-design.md",
      "category": "sprint-spec",
      "status": "current",
      "freshness": "needs-code-check",
      "ownerArea": "orbit-ai"
    },
    {
      "id": "bounded-react-tool-registry",
      "titleZh": "Bounded ReAct 工具注册设计",
      "summaryZh": "设计 Orbit AI bounded ReAct runtime、工具 registry、policy gate、确认边界和工具风险等级。",
      "sourcePath": "docs/superpowers/specs/2026-06-30-orbit-bounded-react-tool-registry-design.md",
      "category": "sprint-spec",
      "status": "current",
      "freshness": "likely-current",
      "ownerArea": "orbit-ai"
    },
    {
      "id": "trace-tool-catalog-plan",
      "titleZh": "Orbit AI Trace 工具目录计划",
      "summaryZh": "实施 trace debug 页面展示工具 catalog 和中文规格说明的计划。",
      "sourcePath": "docs/superpowers/plans/2026-06-30-orbit-ai-trace-tool-catalog.md",
      "category": "implementation-plan",
      "status": "current",
      "freshness": "likely-current",
      "ownerArea": "orbit-ai"
    },
    {
      "id": "knowledge-wiki-design",
      "titleZh": "文档库与知识库设计",
      "summaryZh": "本次知识库目标的设计文档，定义 knowledge 目录、catalog、开发历史、learnings 和 /dev/knowledge 页面。",
      "sourcePath": "docs/superpowers/specs/2026-06-30-orbit-docs-knowledge-wiki-design.md",
      "category": "sprint-spec",
      "status": "current",
      "freshness": "verified-current",
      "ownerArea": "knowledge"
    },
    {
      "id": "knowledge-wiki-plan",
      "titleZh": "文档库与知识库实施计划",
      "summaryZh": "把知识库目标拆成可测试任务：骨架、catalog、app manifest、可视化页面和最终验证。",
      "sourcePath": "docs/superpowers/plans/2026-06-30-orbit-docs-knowledge-wiki.md",
      "category": "implementation-plan",
      "status": "current",
      "freshness": "verified-current",
      "ownerArea": "knowledge"
    },
    {
      "id": "hybrid-mockdata-handoff-design",
      "titleZh": "Hybrid Mockdata Handoff 设计",
      "summaryZh": "定义 relationship mockdata 如何生成 TypeScript fixture 并接入 hybrid local-remote database。",
      "sourcePath": "docs/superpowers/specs/2026-06-30-hybrid-mockdata-handoff-design.md",
      "category": "sprint-spec",
      "status": "current",
      "freshness": "needs-code-check",
      "ownerArea": "data"
    },
    {
      "id": "hybrid-mockdata-handoff-plan",
      "titleZh": "Hybrid Mockdata Handoff 计划",
      "summaryZh": "实施 generated relationship fixture 接入 app mock/hybrid 数据层的计划。",
      "sourcePath": "docs/superpowers/plans/2026-06-30-hybrid-mockdata-handoff.md",
      "category": "implementation-plan",
      "status": "needs-review",
      "freshness": "needs-code-check",
      "ownerArea": "data"
    },
    {
      "id": "harness-readme",
      "titleZh": "Orbit 长跑 Harness README",
      "summaryZh": "说明 harness 架构、命令、运行证据和长跑开发流程，是 harness 操作的主要英文来源。",
      "sourcePath": "harness/README.md",
      "category": "harness",
      "status": "needs-review",
      "freshness": "needs-code-check",
      "ownerArea": "harness"
    },
    {
      "id": "harness-state-spec",
      "titleZh": "Harness 执行规格摘要",
      "summaryZh": "当前 harness-state/spec 是执行摘要，不是 sprint 详细需求来源。",
      "sourcePath": "harness-state/spec.md",
      "category": "harness",
      "status": "current",
      "freshness": "needs-code-check",
      "ownerArea": "harness"
    },
    {
      "id": "harness-sprints-index",
      "titleZh": "Harness Sprint 索引",
      "summaryZh": "人类可读 sprint 历史索引，具体成功标准仍以 contract JSON 为准。",
      "sourcePath": "harness-state/sprints.md",
      "category": "harness",
      "status": "current",
      "freshness": "needs-code-check",
      "ownerArea": "harness"
    },
    {
      "id": "product-facing-sprints",
      "titleZh": "产品化 Sprint Backlog",
      "summaryZh": "记录 Sprint 68 后从 mock capability loop 转向 /app/** 产品表面的产品化 backlog。",
      "sourcePath": "harness-state/productization-notes/product-facing-sprints.md",
      "category": "harness",
      "status": "needs-review",
      "freshness": "needs-code-check",
      "ownerArea": "product"
    },
    {
      "id": "mockdata-design",
      "titleZh": "Relationship Mockdata 设计",
      "summaryZh": "用于生成关系 mock 数据、AI 画像建模、活动场景和 demo 数据的长文档。",
      "sourcePath": "repos/mockdata/orbit_mock_data_ai_relationship_design.md",
      "category": "mockdata",
      "status": "needs-review",
      "freshness": "needs-code-check",
      "ownerArea": "data"
    },
    {
      "id": "mockdata-generation-readme",
      "titleZh": "Mockdata 生成 README",
      "summaryZh": "说明 relationship mockdata 生成目录和运行方式，需要和当前 generator 代码保持同步。",
      "sourcePath": "repos/mockdata/generation/README.md",
      "category": "mockdata",
      "status": "needs-review",
      "freshness": "needs-code-check",
      "ownerArea": "data"
    }
  ],
  "topicPages": [
    {
      "id": "project-overview",
      "titleZh": "项目总览",
      "path": "knowledge/wiki/project-overview.zh.md",
      "summaryZh": "Orbit 是一个围绕关系资产、人脉上下文、活动场景、跟进任务和 Agent 辅助动作构建的 Next.js 应用。当前项目包含根 harness、生成应用 `repos/orbits`、mockdata 生成链路和大量设计/实施文档。"
    },
    {
      "id": "architecture",
      "titleZh": "架构总览",
      "path": "knowledge/wiki/architecture.zh.md",
      "summaryZh": "Orbit 的实现目标是模块化、可替换、可验证。页面、API、feature service、mock/hybrid/live provider 和测试各自有清晰边界。"
    },
    {
      "id": "agent-system",
      "titleZh": "Agent 系统",
      "path": "knowledge/wiki/agent-system.zh.md",
      "summaryZh": "Orbit Agent 由两个相关但不同的层组成：产品内的 Orbit AI / Agent 功能，以及根 harness 的多 agent 生成流程。"
    },
    {
      "id": "data-and-mockdata",
      "titleZh": "数据与 Mockdata",
      "path": "knowledge/wiki/data-and-mockdata.zh.md",
      "summaryZh": "Orbit 当前使用 mock-first 和 hybrid local-remote database 过渡真实数据层。目标是让 mock 数据、generated fixture 和未来 live provider 都映射到同一组 DTO。"
    },
    {
      "id": "harness",
      "titleZh": "Harness",
      "path": "knowledge/wiki/harness.zh.md",
      "summaryZh": "根目录 `harness/` 是 Orbit 长跑开发系统，负责计划、生成、评价、验证和证据归档。生成应用目标是 `repos/orbits`，参考项目 `repos/tokyo-business-connect` 只读。"
    },
    {
      "id": "modules",
      "titleZh": "模块地图",
      "path": "knowledge/wiki/modules.zh.md",
      "summaryZh": "Orbit app 按业务能力拆为 feature modules。每个模块应有 contract、service interface、service factory、mock/hybrid/live 实现边界，以及中文模块架构文档。"
    }
  ],
  "recentHistory": [
    {
      "id": "knowledge-wiki-implementation",
      "date": "2026-06-30",
      "titleZh": "文档库与知识库第一版",
      "summaryZh": "建立 knowledge 骨架、文档 catalog、learnings 索引、app-local manifest 和 /dev/knowledge 页面。",
      "sourcePath": "knowledge/history/development-log.zh.md"
    },
    {
      "id": "knowledge-wiki-design",
      "date": "2026-06-30",
      "titleZh": "设计 Orbit 文档库与知识库",
      "summaryZh": "建立文档 catalog、知识库、开发历史、learnings 索引和 /dev/knowledge 页面目标。",
      "sourcePath": "knowledge/history/development-log.zh.md"
    }
  ],
  "learnings": [
    {
      "id": "troubleshooting",
      "titleZh": "排障知识",
      "summaryZh": "Orbit AI trace loading、provider timeout 和 responsive submit 控件经验。",
      "sourcePath": "knowledge/learnings/troubleshooting.zh.md"
    },
    {
      "id": "errors",
      "titleZh": "错误记录",
      "summaryZh": "依赖缺失、tsx eval、迁移脚本和 git diff 正则等错误记录。",
      "sourcePath": "knowledge/learnings/errors.zh.md"
    },
    {
      "id": "patterns",
      "titleZh": "复用模式",
      "summaryZh": "framework/mock/live 解耦、提交范围检查和注释提交卫生。",
      "sourcePath": "knowledge/learnings/patterns.zh.md"
    }
  ]
} as const;
