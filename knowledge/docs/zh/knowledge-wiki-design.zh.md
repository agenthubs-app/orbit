# 文档库与知识库设计

本页是 Orbit Wiki 的中文阅读版。它保留原始文档的路径、代码块、命令和接口标识，用中文说明阅读目的、审计依据和结构入口。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `docs/superpowers/specs/2026-06-30-orbit-docs-knowledge-wiki-design.md` |
| 中文镜像 | `knowledge/docs/zh/knowledge-wiki-design.zh.md` |
| 分类 | `sprint-spec` |
| 状态 | `current` |
| 新鲜度 | `verified-current` |
| 负责人域 | `knowledge` |

## 中文摘要

本次知识库目标的设计文档，定义 knowledge 目录、catalog、开发历史、learnings 和 /dev/knowledge 页面。

## 审计依据

已登记来源文档，后续变更通过 catalog 新鲜度状态追踪。

## 结构化阅读入口

- 第 1 节：Orbit 文档库与知识库设计
- 第 2 节：摘要
- 第 3 节：当前问题
- 第 4 节：目标
- 第 5 节：非目标
- 第 6 节：信息架构
- 第 7 节：文档条目模型
- 第 8 节：新鲜度与落后判定
- 第 9 节：维护规则
- 第 10 节：可视化 Wiki 页面
- 第 11 节：生成与同步
- 第 12 节：测试策略
- 第 13 节：分阶段实施
- 第 14 节：阶段 1：知识库骨架和维护规则
- 第 15 节：阶段 2：文档 catalog 与新鲜度报告
- 第 16 节：阶段 3：App 内可视化 Wiki 页面
- 第 17 节：阶段 4：中文补齐与深度审计
- 第 18 节：阶段 5：持续维护
- 第 19 节：验收标准

## 保留的代码与命令证据

### 代码证据 1

```text
knowledge/
  AGENTS.md
  index.zh.md
  schema.zh.md
  log.zh.md
  docs/
    catalog.zh.md
    catalog.json
    freshness-report.zh.md
  wiki/
    project-overview.zh.md
    architecture.zh.md
    agent-system.zh.md
    data-and-mockdata.zh.md
    harness.zh.md
    modules.zh.md
  history/
    development-log.zh.md
  learnings/
    index.zh.md
    troubleshooting.zh.md
    errors.zh.md
    patterns.zh.md
  generated/
    app-knowledge-manifest.ts
```

### 代码证据 2

```ts
type OrbitKnowledgeDocStatus =
  | "current"
  | "historical"
  | "superseded"
  | "needs-review"
  | "generated-evidence";

type OrbitKnowledgeFreshness =
  | "verified-current"
  | "likely-current"
  | "needs-code-check"
  | "known-stale";

interface OrbitKnowledgeDocEntry {
  id: string;
  titleZh: string;
  summaryZh: string;
  sourcePath: string;
  category:
    | "product-design"
    | "technical-design"
    | "architecture"
    | "module-architecture"
    | "feature-design"
    | "implementation-handoff"
    | "sprint-spec"
    | "implementation-plan"
    | "harness"
    | "mockdata"
    | "learning"
    | "development-history";
  status: OrbitKnowledgeDocStatus;
  freshness: OrbitKnowledgeFreshness;
  ownerArea: string;
  relatedCodePaths: readonly string[];
  relatedKnowledgePages: readonly string[];
  lastReviewedOn: string;
}
```

### 代码证据 3

```text
repos/orbits/app/dev/knowledge/page.tsx
repos/orbits/app/dev/knowledge/knowledge-wiki.tsx
repos/orbits/shared/knowledge/knowledge-manifest.ts
repos/orbits/tests/pages/knowledge-wiki-page.test.tsx
repos/orbits/tests/services/knowledge-manifest.test.ts
```

### 代码证据 4

```text
scripts/knowledge/build-catalog.mjs
scripts/knowledge/sync-app-manifest.mjs
```

### 代码证据 5

```bash
npm test
npm run lint
```

## 源文档正文

日期：2026-06-30  
状态：设计文档，不包含实现变更  
范围：根项目 `orbit` 的文档库、知识库、维护规则，以及 `repos/orbits` 内部可视化知识库页面

## 摘要

Orbit 现在的问题不是“没有文档”，而是文档、运行证据、实施记录、排障经验和开发历史散落在多个目录里，缺少统一入口、状态标记、中文覆盖和可验证维护规则。第一轮盘点排除 `harness-state/runs/**` 运行快照后，当前权威 Markdown 约 119 个，其中 53 个包含中文，66 个没有中文，只有 5 个有显式状态字段。

推荐方案是在根项目建立结构化知识库目录 `knowledge/`，并在 `repos/orbits` 内新增一个开发者可浏览的 `/dev/knowledge` Wiki 页面。根知识库是权威维护层；App 内 Wiki 页面消费生成后的知识库摘要，不直接读取父级目录。这样既满足用户低成本浏览，也让 coding agent 可以在理解项目时先读文档库和知识库，而不是每次从散乱文件重新推断。

该设计参考 Karpathy 的 LLM Wiki pattern：原始来源、LLM 维护的 wiki、维护 schema、内容索引 `index.md`、时间日志 `log.md`。Orbit 的落地版本需要更工程化：每个条目必须有来源路径、中文摘要、权威性状态、新鲜度状态、关联代码路径和维护规则。

## 当前问题

文档现状有五类风险：

1. 权威文档和历史快照混在同一搜索空间里。`harness-state/runs/**/source/**` 保存了历史运行证据，不应成为当前文档入口。
2. 文档类型混杂。产品设计、技术设计、sprint spec、implementation plan、feature `DESIGN.md`、`LIVE_IMPLEMENTATION.md`、`.learnings` 和 harness prompt 都是 Markdown，但读者不知道先看哪个。
3. 中文覆盖不完整。大量 `LIVE_IMPLEMENTATION.md`、harness 文档、plan/spec 和 `.learnings` 条目只有英文或中英混合，不满足“知识库和文档库都要有中文版”的长期要求。
4. 状态不可见。除了少数 spec 写了 `Status` 或 `状态`，大部分文档没有说明它是当前权威、历史参考、被替代、需要校验还是运行证据。
5. 开发历史缺少项目级入口。Git commit 记录存在，但没有面向人和 agent 的中文开发历史，不能快速回答“为什么做了这次修改、影响哪些文档和代码、后续该注意什么”。

## 目标

1. 建立单独的文档查询入口，链接所有权威文档地址，并提供中文简介、类型、状态和关联代码。
2. 建立知识库，包含文档库入口、项目理解页、开发历史、排障经验、learned patterns 和维护日志。
3. 把“实现变更必须更新或新增对应文档”写入根 `AGENT.md`，把 app 内实现变更的文档要求写入 `repos/orbits/AGENTS.md`。
4. 明确 agent 理解项目时应先读知识库入口、文档库索引和相关知识页，再读代码。
5. 将 `.learnings` 和 `repos/orbits/.learnings` 纳入知识库，但保留原始文件作为来源证据。
6. 所有新增知识库和文档库内容必须有中文版；允许保留英文源文档，但索引层必须提供中文标题、中文摘要和中文状态。
7. 搭建可浏览器浏览的可视化 Wiki 页面，让用户低成本理解项目状态、架构、模块、开发历史和排障知识。
8. 用测试或脚本检查文档入口、中文覆盖、来源路径和 app-local Wiki manifest，避免文档体系再次漂移。

## 非目标

- 不把所有历史 Markdown 立即搬家。第一版建立索引和知识层，原始文档仍保留在原路径。
- 不把 `harness-state/runs/**` 快照当作当前文档库条目。它们可以作为历史证据被开发历史引用。
- 不实现完整 RAG、embedding、向量数据库或外部搜索服务。
- 不让 `repos/orbits` 运行时代码直接读取根目录 `knowledge/` 或父级路径。
- 不一次性重写 119 个文档。第一版必须先建立结构和可验证维护机制，再分批补齐中文和新鲜度审计。

## 信息架构

根项目新增 `knowledge/`，作为 Orbit 项目知识库：

```text
knowledge/
  AGENTS.md
  index.zh.md
  schema.zh.md
  log.zh.md
  docs/
    catalog.zh.md
    catalog.json
    freshness-report.zh.md
  wiki/
    project-overview.zh.md
    architecture.zh.md
    agent-system.zh.md
    data-and-mockdata.zh.md
    harness.zh.md
    modules.zh.md
  history/
    development-log.zh.md
  learnings/
    index.zh.md
    troubleshooting.zh.md
    errors.zh.md
    patterns.zh.md
  generated/
    app-knowledge-manifest.ts
```

`knowledge/index.zh.md` 是人的总入口，也是 agent 理解项目时的第一入口。它链接文档库、主题 wiki、开发历史、learnings 和维护日志。

`knowledge/docs/catalog.zh.md` 是文档查询入口。它列出每个权威文档的中文标题、中文简介、来源路径、类型、权威性状态、新鲜度状态、关联代码路径和推荐阅读顺序。

`knowledge/docs/catalog.json` 是机器可读索引。它由脚本生成或校验，供测试和 app-local manifest 生成使用。

`knowledge/wiki/**` 是综合后的知识页。它不复制所有字段和 DTO，而是说明项目如何工作、权威来源在哪里、读代码应从哪里开始。

`knowledge/history/development-log.zh.md` 是中文开发历史。每个重要变更追加一条记录：日期、用户意图、修改摘要、关联提交、关联文件、验证方式、文档更新情况和后续注意事项。

`knowledge/learnings/**` 是 `.learnings` 的中文可读层。原始 `.learnings/*.md` 和 `repos/orbits/.learnings/*.md` 仍是来源证据；知识库负责归类、中文摘要和交叉链接。

`knowledge/generated/app-knowledge-manifest.ts` 是给 `repos/orbits` 使用的生成物，后续复制或同步到 `repos/orbits/shared/knowledge/knowledge-manifest.ts`。App 页面只消费 app-local manifest，避免违反 `repos/orbits/AGENTS.md` 的父目录边界。

## 文档条目模型

文档库条目使用稳定字段：

```ts
type OrbitKnowledgeDocStatus =
  | "current"
  | "historical"
  | "superseded"
  | "needs-review"
  | "generated-evidence";

type OrbitKnowledgeFreshness =
  | "verified-current"
  | "likely-current"
  | "needs-code-check"
  | "known-stale";

interface OrbitKnowledgeDocEntry {
  id: string;
  titleZh: string;
  summaryZh: string;
  sourcePath: string;
  category:
    | "product-design"
    | "technical-design"
    | "architecture"
    | "module-architecture"
    | "feature-design"
    | "implementation-handoff"
    | "sprint-spec"
    | "implementation-plan"
    | "harness"
    | "mockdata"
    | "learning"
    | "development-history";
  status: OrbitKnowledgeDocStatus;
  freshness: OrbitKnowledgeFreshness;
  ownerArea: string;
  relatedCodePaths: readonly string[];
  relatedKnowledgePages: readonly string[];
  lastReviewedOn: string;
}
```

`sourcePath` 必须指向真实文件。条目不能只给目录、不能指向运行快照副本、不能指向不存在的路径。

`summaryZh` 必须是中文。英文源文档可以保留，但入口必须提供中文摘要。

`freshness` 不等于简单看文件修改时间。它要结合代码存在性、测试覆盖、架构约定和显式 superseded 标记判断。第一版允许把无法确认的文档标为 `needs-code-check`，但不能假装已经 verified。

## 新鲜度与落后判定

第一版使用保守规则：

- `verified-current`：文档有对应测试、代码路径仍存在，且最近一次检查确认内容和实现一致。
- `likely-current`：文档描述的是稳定原则或模块边界，对应代码路径存在，但没有完整自动校验。
- `needs-code-check`：文档可能仍有用，但缺少状态、缺少中文摘要、对应代码最近变化较多，或描述依赖需要人工核对。
- `known-stale`：文档显式 superseded/deprecated，或引用的路径/架构已不存在。

`docs/superpowers/specs/2026-06-24-component-level-sprint-design.md` 这类已声明 superseded 的文件应标为 `superseded` 或 `known-stale`。`harness-state/runs/**` 中的运行快照不进入默认文档库，只能作为开发历史或验证证据链接。

## 维护规则

根 `AGENT.md` 增加项目级规则：

- 实现变更、架构变更、数据契约变更、agent 工具变更、harness 流程变更，都必须更新或新增对应文档。
- 每次完成用户可见或架构相关修改后，都必须追加 `knowledge/history/development-log.zh.md`。
- 所有新增知识库和文档库条目必须有中文标题和中文摘要。
- 理解项目时优先读取 `knowledge/index.zh.md`、`knowledge/docs/catalog.zh.md` 和相关知识页，再读取代码。
- `.learnings` 的新增排障、错误和经验应同步进入 `knowledge/learnings/**` 的中文索引。

`repos/orbits/AGENTS.md` 增加 app 内规则：

- App 内实现变更必须更新 `repos/orbits/docs/**`、feature `DESIGN.md`、`LIVE_IMPLEMENTATION.md` 或根知识库同步入口中的相关条目。
- App 内 Wiki 页面只读取 app-local manifest，不直接读父目录。
- 影响 `/dev/knowledge` 展示的数据结构时，必须更新页面测试和 knowledge manifest 测试。

## 可视化 Wiki 页面

在 `repos/orbits` 新增内部开发页面：

```text
repos/orbits/app/dev/knowledge/page.tsx
repos/orbits/app/dev/knowledge/knowledge-wiki.tsx
repos/orbits/shared/knowledge/knowledge-manifest.ts
repos/orbits/tests/pages/knowledge-wiki-page.test.tsx
repos/orbits/tests/services/knowledge-manifest.test.ts
```

页面路由是 `/dev/knowledge`。它是开发者知识库页面，不是面向用户的产品页。

页面首屏应展示：

- 项目知识库总览；
- 文档库入口卡片；
- 文档状态统计；
- 需要中文补齐或代码核对的文档数量；
- 最近开发历史；
- 最近 learnings；
- 主要架构主题入口；
- 模块知识入口；
- 排障入口。

UI 风格应跟现有 dev workbench 保持一致，复用 `WorkbenchFrame`、`WorkbenchSurface`、`Chip` 等已有 primitive。不要做营销式 landing page。页面应支持快速扫描、过滤和跳转。

## 生成与同步

第一版可以使用 Node/TypeScript 脚本，不引入新依赖：

```text
scripts/knowledge/build-catalog.mjs
scripts/knowledge/sync-app-manifest.mjs
```

`build-catalog.mjs` 读取允许的 Markdown 根目录，排除：

- `.git/**`
- `node_modules/**`
- `.next/**`
- `harness-state/runs/**`
- `harness-state/tmp/**`
- generated fixture 大文件旁的非文档内容

脚本生成或校验 `knowledge/docs/catalog.json`，并输出 `knowledge/docs/freshness-report.zh.md`。

`sync-app-manifest.mjs` 把知识库摘要转成 app-local TypeScript manifest。App 测试只依赖 app-local manifest。

所有 Python 命令仍必须通过 `uv`。本设计优先用 Node，是为了避免为文档索引引入额外 Python 环境复杂度。

## 测试策略

根项目测试应检查：

- `knowledge/index.zh.md` 存在并链接文档库、开发历史、learnings 和 Wiki 主题。
- `knowledge/docs/catalog.json` 中每个 `sourcePath` 存在。
- 每个文档条目有 `titleZh` 和 `summaryZh`，且包含中文字符。
- 默认文档库不包含 `harness-state/runs/**` 快照。
- 每个条目有 `status`、`freshness` 和 `lastReviewedOn`。
- `.learnings` 原始文件至少被 `knowledge/learnings/index.zh.md` 引用。

App 测试应检查：

- `repos/orbits/shared/knowledge/knowledge-manifest.ts` 不为空。
- `/dev/knowledge` 页面渲染文档库入口、状态统计、开发历史和 learnings。
- 页面不会 import 根目录路径或使用 `..` 读取父目录。
- 页面文案包含中文主标题和中文摘要。

现有 app 验证继续使用：

```bash
npm test
npm run lint
```

根侧如果新增 Node 测试，应使用仓库现有 Node 运行方式。若新增 Python 测试，必须使用 `uv run`。

## 分阶段实施

### 阶段 1：知识库骨架和维护规则

建立 `knowledge/` 目录、总入口、schema、log、初始文档目录、初始开发历史和 learnings 中文索引。更新根 `AGENT.md` 和 `repos/orbits/AGENTS.md`。这一阶段不要求所有旧文档都完成深度审计，但必须给出清晰状态。

### 阶段 2：文档 catalog 与新鲜度报告

实现文档扫描、分类、排除规则、中文摘要字段、状态字段和 freshness 报告。第一版优先覆盖权威文档，排除运行快照。

### 阶段 3：App 内可视化 Wiki 页面

同步 app-local manifest，新增 `/dev/knowledge` 页面，使用现有 dev UI primitives 展示知识库。

### 阶段 4：中文补齐与深度审计

分批补齐没有中文入口的文档摘要，优先级为：根产品/技术设计、app 架构文档、模块文档、feature 设计、mock-to-live handoff、harness 文档、plans/specs、learnings。

### 阶段 5：持续维护

每次实现变更追加开发历史；每次排障进入 learnings 中文索引；每次新增文档进入 catalog。周期性运行 lint/report 检查孤儿文档、过期声明、缺中文条目和路径失效。

## 验收标准

第一版完成时必须满足：

1. 存在单独文档查询入口 `knowledge/docs/catalog.zh.md`。
2. 存在知识库总入口 `knowledge/index.zh.md`。
3. 存在中文开发历史 `knowledge/history/development-log.zh.md`。
4. `.learnings` 和 `repos/orbits/.learnings` 被知识库中文索引引用。
5. 根 `AGENT.md` 写明实现变更必须更新文档和开发历史。
6. `repos/orbits/AGENTS.md` 写明 app 内实现变更的文档维护要求。
7. App 内存在可浏览的 `/dev/knowledge` 页面。
8. 文档 catalog 默认排除 `harness-state/runs/**`。
9. 每个 catalog 条目有中文标题、中文简介、状态和来源路径。
10. 测试或脚本能证明来源路径存在、中文字段存在、app manifest 可渲染。

该目标很大，不应在第一版声称所有旧文档已经完全校准。第一版的成功标准是：结构、入口、规则、可视化和校验机制已经存在，并且旧文档都能被纳入明确状态，而不是继续散落。
