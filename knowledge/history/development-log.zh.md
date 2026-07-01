# Orbit 开发历史

## [2026-06-30] docs | 设计 Orbit 文档库与知识库

- 用户目标：把散落文档结构化、知识库化，建立单独文档查询入口、中文知识库、开发历史、learnings 汇总和可视化 Wiki 页面。
- 修改摘要：新增设计文档 `docs/superpowers/specs/2026-06-30-orbit-docs-knowledge-wiki-design.md`，并新增实施计划 `docs/superpowers/plans/2026-06-30-orbit-docs-knowledge-wiki.md`。
- 关联提交：`9ff7d3f docs: design orbit knowledge wiki`、`99d60e2 docs: plan orbit knowledge wiki`、`909dffe docs: tighten knowledge wiki plan`。
- 验证方式：设计阶段完成文档自检，确认首版实施必须包含中文入口、文档 catalog、开发历史、learnings 索引和 `/dev/knowledge` 页面。
- 后续注意：旧文档不应一次性搬家；第一版先建立结构、状态和可验证维护规则，再分批做深度新鲜度审计。

## [2026-06-30] implementation | 文档库与知识库第一版

- 用户目标：让文档和知识不再散落，建立可查询、可浏览、可维护、中文优先的项目知识库。
- 修改摘要：建立 `knowledge/` 骨架、中文文档 catalog、freshness report、开发历史、learnings 索引和 app-local knowledge manifest；新增 `/dev/knowledge` 可视化 Wiki 页面；把文档维护规则写入根 `AGENT.md` 和 `repos/orbits/AGENTS.md`。
- 关联提交：`980c70f docs: add orbit knowledge base skeleton`、`2120699 docs: add orbit document catalog`、`eea5144 feat: add orbit knowledge manifest`、`1a09347 feat: add orbit knowledge wiki page`。
- 关联文件：`knowledge/index.zh.md`、`knowledge/docs/catalog.zh.md`、`knowledge/docs/freshness-report.zh.md`、`knowledge/learnings/index.zh.md`、`repos/orbits/shared/knowledge/knowledge-manifest.ts`、`repos/orbits/app/dev/knowledge/page.tsx`。
- 验证方式：运行 root knowledge tests、app manifest/page tests、app lint、`git diff --check`。
- 后续注意：首版 catalog 纳入 69 个权威入口，仍有一批 `LIVE_IMPLEMENTATION.md` 和 harness prompt 属于未纳入或 `needs-code-check`，后续应分批做深度中文化和代码新鲜度审计。

## [2026-06-30] implementation | 文档库全量覆盖审计

- 用户目标：继续收敛散落文档，避免 freshness report 长期保留未纳入 Markdown。
- 修改摘要：扩展 catalog 扫描范围到 `repos/orbits` 全部 Markdown、harness prompt、app/shared/feature `LIVE_IMPLEMENTATION.md`、README 和手动验收文档；为每个条目补中文审计依据 `reviewEvidenceZh`；`/dev/knowledge` 显示审计依据；app manifest 不再截断 catalog。
- 覆盖结果：`knowledge/docs/catalog.json` 纳入 146 个文档；扫描范围内未纳入目录降为 0；`.venv/**`、`.pytest_cache/**`、`.superpowers/**`、`harness-state/runs/**` 和参考项目 `repos/tokyo-business-connect/**` 继续排除在默认 Orbit 文档库之外。
- 验证方式：运行 catalog 生成、manifest 同步、root knowledge tests、app manifest/page tests、app lint、app full test、`git diff --check`。
- 当时后续注意：`needs-code-check` 用于保守标记尚未逐行对照当前代码的历史设计、feature DESIGN、mockdata 和 harness 文档；该状态已在后续“文档新鲜度审计收敛”中处理。

## [2026-06-30] implementation | 文档新鲜度审计收敛

- 用户目标：让文档库不只是列出文档，还要明确每个文档是否落后于当前代码和数据。
- 修改摘要：逐类审计 37 个 `needs-code-check` 条目，按历史资料、当前设计、数据层、mockdata、harness 和 feature DESIGN 分类补充证据；将可由代码、测试或历史定位判断的条目改为 `likely-current` 或 `verified-current`；保留 1 个明确 `known-stale` 的旧组件级 sprint 设计。
- 覆盖结果：`knowledge/docs/freshness-report.zh.md` 显示 `needs-code-check` 为 0，扫描范围内未纳入为 0，catalog 总量保持 146。
- 验证方式：运行 catalog 生成、manifest 同步、root knowledge tests、app manifest/page tests、app lint、app full test、`git diff --check`。
- 后续注意：`likely-current` 表示已有合理代码/测试/历史定位证据，不等价于每个英文原文段落都逐行重写；未来文档变更仍必须更新 catalog 审计依据。

## [2026-06-30] maintenance | 记录 LLM Wiki 参考模式

- 用户目标：知识库构建参考 Karpathy LLM Wiki 的最新模式，同时保持 Orbit 项目自身可审计、中文优先、无需 RAG 的实现边界。
- 修改摘要：在 `knowledge/schema.zh.md` 增加参考模式说明，记录 raw sources、LLM-maintained wiki、schema/AGENTS、ingest/query/lint/index/log 等概念如何映射到 Orbit 的文档 catalog、主题 wiki、开发历史、learnings 和 app-local manifest。
- 验证方式：运行 root knowledge tests、`git diff --check`。

## [2026-06-30] implementation | 可浏览知识库 Wiki Explorer

- 用户目标：`/dev/knowledge` 不应只是总结性静态页面，而要能查看所有文档和知识库内容。
- 修改摘要：将 `/dev/knowledge` 升级为可交互 Wiki Explorer，支持查看全部 146 个 catalog 文档、搜索、按类型/状态/新鲜度筛选、选择条目查看来源路径/摘要/审计依据，并在同页浏览知识主题、开发历史和经验库入口。
- 架构边界：页面仍只消费 `repos/orbits/shared/knowledge/knowledge-manifest.ts`，不在 app runtime 读取父目录 Markdown；原始全文仍保留在来源路径，Explorer 展示编译后的中文元数据和知识库入口。
- 验证方式：新增 page test 断言全量浏览器、筛选控件、详情面板和后段文档可见；运行 app page test、manifest test、lint、app full test、HTTP 页面检查和 `git diff --check`。

## [2026-06-30] implementation | 真实 Wiki 风格浏览工具

- 用户反馈：上一版 Wiki Explorer 仍像 dashboard/list，太丑且不好用，不像真实 Wiki。
- 修改摘要：参考真实 Wiki 的组织方式重做 `/dev/knowledge`：新增顶栏搜索与页面标签、左侧全站导航树、中间文章阅读区、右侧页面目录和 infobox、Wiki 风格文档索引表；移除 workbench card/grid 结构，让页面以“文章 + 索引 + 最近更改 + 经验库”的方式组织。
- 架构边界：继续只消费 app-local manifest，不在运行时读取父目录 Markdown；文档索引表仍覆盖 146 个 catalog 文档，并保留审计依据、新鲜度和来源路径。
- 验证方式：更新 page test 要求 `data-wiki-shell`、`wiki-global-nav`、`wiki-article`、`wiki-page-toc`、`wiki-infobox`、`wiki-index-table`，并禁止 `workbench-surface`/`workbench-grid`/`relationship-record` 结构回退。

## [2026-06-30] implementation | Wiki 支持打开 Markdown 正文

- 用户反馈：真实 Wiki 页面仍只能看索引、摘要、路径和审计依据，不能打开具体文档内容。
- 修改摘要：新增 `/api/dev/knowledge/documents/[id]` dev-only 读取端点，按 app-local manifest 白名单 id 读取对应 Markdown 原文；`/dev/knowledge` 点击文档后在文章区显示“正文内容”，支持加载、错误和常见 Markdown 块渲染。
- 架构边界：客户端页面仍不直接使用 `node:fs` 或任意路径读取；API 只接受 manifest 中已登记的 document id，生产环境返回 404，并使用 no-store developer-admin headers。
- 验证方式：新增 API route 测试覆盖成功读取、未知 id 和 production 隐藏；更新 page test 锁定正文区域和 API 请求边界；运行 app page/API tests、lint、单独 TypeScript 检查和后续完整测试。

## [2026-06-30] implementation | Wiki 文档页独立化与 Markdown 渲染修正

- 用户反馈：点击文档后正文只占页面一小部分，不像 Wikipedia 那样打开整页文章；同时当前 Markdown 渲染存在兼容问题。
- 修改摘要：将 `/dev/knowledge` 拆成主页导航页和文档独立文章页；文档页只保留文档元信息与正文内容，不再混入知识主题、文档索引、最近更改和经验库区块；用 `react-markdown` 与 `remark-gfm` 替换手写 Markdown block parser。
- 架构边界：读取边界不变，客户端仍通过 dev-only 文档内容 API 按 manifest 白名单 id 获取 Markdown；主页继续作为全站导航和索引入口。
- 验证方式：新增 page test 覆盖 `initialPage` 文档独立页、主页不预渲染正文区、GFM 渲染依赖和手写 parser 移除。

## [2026-06-30] implementation | Wiki 文档中文镜像层

- 用户目标：Wiki 中打开的所有 catalog 文档正文都应是中文，不再把英文原文作为默认阅读内容。
- 修改摘要：新增 `knowledge/docs/zh/*.zh.md` 中文阅读版镜像，共覆盖当前 147 个 catalog 文档；catalog 和 app manifest 为每个条目增加 `localizedSourcePath`；`/dev/knowledge` 的 dev-only 文档内容读取改为中文镜像优先且不静默回退英文；新增 `scripts/knowledge/generate-chinese-doc-mirrors.mjs` 维护镜像。
- 架构边界：原始 `sourcePath` 文档保留不改，中文镜像承载 Wiki 阅读体验；代码块、命令、路径、API 名和配置片段作为证据保留原样。
- 验证方式：root catalog test 要求每个条目存在中文镜像；app manifest/API/page tests 要求文档 URL 首屏读取 `knowledge/docs/zh/*.zh.md`；后续完整验证覆盖 root knowledge tests、app tests、lint 和 `git diff --check`。

## [2026-06-30] implementation | Wiki 导航链接 URL 化

- 用户反馈：Wiki 页面很多链接点不动，尤其是索引、主题、最近更改和经验库入口依赖客户端状态切换；在 hydration 不稳定或文档独立页中会表现为无效点击或空锚点。
- 修改摘要：将 `/dev/knowledge` 的主要导航从 button 状态切换改为真实 URL 链接；服务端支持 `?page=index`、`?topic=...`、`?history=...`、`?learning=...` 和 `?category=...` 首屏渲染；主题、历史和经验条目新增独立文章页。
- 架构边界：搜索和筛选下拉仍作为客户端增强保留；主导航、主题入口、分类入口、历史入口和经验入口都能在无客户端状态的情况下通过 URL 打开。
- 验证方式：更新 page test 覆盖 URL-addressable 导航、文档页绝对锚点和死锚点禁止；用浏览器实际点击验证索引、主题、历史条目和文档页锚点。

## [2026-06-30] implementation | 中文 Wiki 镜像保留中文源正文

- 用户反馈：部分文档页打开后只有标题或摘要，看不到真正文章内容，例如 `/dev/knowledge?document=feature-bootstrap-design`。
- 根因分析：中文镜像生成脚本只写入页面元信息、中文摘要、审计依据、结构化标题目录和代码块证据，没有把已经是中文的源文档正文追加进镜像。
- 修改摘要：更新 `scripts/knowledge/generate-chinese-doc-mirrors.mjs`，当源文档主体已经包含中文内容时，在镜像中追加“源文档正文”并保留完整 Markdown 正文；重新生成 147 个中文镜像。
- 验证方式：新增 root catalog test 锁定 `feature-bootstrap-design` 镜像必须包含源正文段落；新增 page test 锁定对应 document URL 首屏渲染完整中文正文。

## [2026-06-30] implementation | Orbit AI 共享 runtime 与人脉匹配文档同步

- 用户目标：确认 Orbit AI tool 能根据 chat 上下文匹配已有真实链接人脉，并让产品 chat、trace 页面和 planner-only 诊断使用同一逻辑，同时补齐文档和文档库。
- 修改摘要：补充 Orbit AI trace 英中设计文档，说明 `/api/dev/orbit-agent/trace` 仍是 planner-only 兼容入口但通过 `runLiveOrbitAgentRuntime` 以 `maxLoopSteps=1` 执行；补充 `contacts.recommend`、`contact_recommendations`、`ORBIT_CONTACT_RECOMMENDATION_METHOD` 和 `rules_v1`/未来 RAG 方法边界；更新 `features/orbit-ai/DESIGN.md`，把共享 runtime 和人脉推荐方法选择写入模块设计。
- 知识库更新：更新 catalog 生成脚本的 Orbit AI/trace 文档摘要、审计依据和关联代码路径；重新生成 catalog、中文镜像和 app-local knowledge manifest。
- 架构边界：产品 chat、`/dev/orbit-ai/trace` full-chain trace 和 `/api/dev/orbit-agent/trace` planner-only route 都应复用 `features/orbit-ai/live-agent-runtime.ts`；人脉推荐只使用已有关系证据，不做开放式陌生人发现。
- 验证方式：运行知识库生成脚本、root catalog tests、app knowledge manifest test 和 Orbit AI targeted capability tests。

## [2026-06-30] maintenance | 文档可读性与代码一致性扫描

- 用户目标：整体扫描代码和文档，确认文档反映真实代码功能，并提升中文文档可读性。
- 扫描范围：检查 `knowledge/docs` catalog、中文镜像生成脚本、app-local knowledge manifest、知识库主题页，以及 Orbit AI 的 module doc、feature design、trace design、performance audit 和相关 runtime/contract/service factory 代码路径。
- 发现问题：catalog 和中文镜像有大量模板化说明，读者需要自己判断状态和权威性；Orbit AI 的模块说明没有清楚区分 command、conversation、artifact task 三个 capability；Trace 和 performance 文档没有在开头说明哪些内容是当前实现、哪些是历史审计记录。
- 修改摘要：更新中文镜像生成结构，加入“怎么读”、状态/新鲜度解释和更清楚的非中文源文档说明；重写 Orbit AI module/feature 文档；补充 trace 英中文设计的当前代码入口；补充 performance audit 的阅读提示；更新知识库首页、Agent 主题页和模块地图。
- 知识库更新：更新 catalog 中 Orbit AI、trace 和 performance 条目的摘要、审计依据与关联代码路径；重新生成 catalog、中文镜像和 app-local knowledge manifest。
- 验证方式：运行知识库生成脚本、root knowledge tests、app knowledge tests、app lint、`git diff --check` 和 GitNexus detect changes。

## [2026-07-01] maintenance | Agent 模块命名收敛为 Actions

- 用户目标：确认 Contacts/Events 负责业务工具、外部副作用执行边界由原 Agent 模块负责后，将该模块重命名为 Actions，降低与 Orbit AI agent/runtime 的语义混淆。
- 修改摘要：将模块架构文档从 `agent.md` 改为 `actions.md`，更新模块树、`features/agent/DESIGN.md`、相关 live handoff 文档、Orbit AI 模块说明、知识库主题页和 app-local manifest；catalog 与中文镜像展示名改为 `actions`。
- 架构边界：当前代码路径、route 和 API 仍保留 legacy `features/agent`、`/app/agent` 和 `/api/agent/*`，因为 GitNexus 对 `createAgentActionQueueService` 的上游影响为 HIGH；本次只收敛产品/文档术语，不做代码符号和路由迁移。
- 验证方式：运行知识库生成脚本、root knowledge tests、app knowledge tests、modular-boundaries test、`git diff --check` 和 GitNexus detect changes。
