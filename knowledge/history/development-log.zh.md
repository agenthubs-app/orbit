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
