# Orbit Knowledge Base Rules

本目录是 Orbit 项目的结构化知识库。它不是原始文档堆放区，而是 agent 维护的中文综合层，用来帮助人和 coding agent 更低成本地理解项目。

## 维护模型

- `knowledge/index.zh.md` 是第一入口。
- `knowledge/docs/catalog.zh.md` 是文档查询入口。
- `knowledge/wiki/**` 是综合知识页。
- `knowledge/history/development-log.zh.md` 是开发历史。
- `knowledge/learnings/**` 汇总 `.learnings/` 和 `repos/orbits/.learnings/` 的排障、错误和经验。
- `knowledge/log.zh.md` 是知识库维护日志，只追加，不重写历史。

## 中文要求

所有新增知识库和文档库条目必须有中文标题、中文摘要或中文主体。英文技术名、路径、API 名和 commit message 可以保留原文，但解释层必须使用中文。

每个 `knowledge/docs/catalog.json` 条目都必须有 `localizedSourcePath`，指向 `knowledge/docs/zh/*.zh.md` 中文阅读版。`/dev/knowledge` 打开文档时必须读取中文阅读版；如果中文镜像缺失，测试应失败，不允许静默回退到英文原文。

## 来源规则

原始来源仍在现有目录中，例如 `docs/`、`harness/`、`harness-state/`、`.learnings/`、`repos/orbits/docs/` 和 `repos/orbits/features/`。知识库页面必须保留来源路径，不把运行快照伪装成当前权威文档。

## 更新规则

实现变更、架构变更、数据契约变更、Agent 工具变更、harness 流程变更，都必须同步更新文档库或知识库。每次用户可见或架构相关修改完成后，追加 `knowledge/history/development-log.zh.md`。

新增或修改 catalog 后，按顺序运行 `node scripts/knowledge/build-catalog.mjs`、`node scripts/knowledge/generate-chinese-doc-mirrors.mjs` 和 `node scripts/knowledge/sync-app-manifest.mjs`，确保中文 catalog、中文镜像和 app-local manifest 保持一致。
