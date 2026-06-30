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
