# Orbit 知识库 Schema

本文件定义知识库的结构和维护流程。它是 agent 维护知识库时的操作规约。

## 参考模式

- 本知识库参考 Andrej Karpathy 的 LLM Wiki 模式（https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f，2026-06-30 核对）：保留原始来源、让 LLM 维护结构化 Markdown wiki、用 schema/AGENTS 约束维护流程，并通过 ingest、query、lint、index 和 log 让知识持续积累。
- Orbit 版本不是通用 RAG：默认不引入 embedding 或向量数据库，而是把文档 catalog、主题 wiki、开发历史、learnings 和 app-local manifest 作为可审计的编译后知识层。
- 原始文档仍保留在来源路径；`knowledge/` 是中文优先的索引、综合和审计层，负责说明来源、状态、新鲜度和后续维护规则。

## 三层模型

1. 原始来源：现有文档、代码、测试、运行证据和 `.learnings`。这些文件保留在原路径。
2. 文档库：`knowledge/docs/catalog.zh.md` 和 `knowledge/docs/catalog.json`，负责列出权威文档、中文简介、状态、新鲜度和来源路径。
3. 知识库：`knowledge/wiki/**`、`knowledge/history/**`、`knowledge/learnings/**`，负责综合项目知识、开发历史和排障经验。

## 文档状态

- `current`：当前权威文档。
- `historical`：历史背景或参考材料。
- `superseded`：已被其他文档替代。
- `needs-review`：需要结合代码继续核对。
- `generated-evidence`：运行证据或生成结果，不应作为默认权威入口。

## 新鲜度状态

- `verified-current`：代码路径和测试证明当前一致。
- `likely-current`：描述稳定边界，相关文件存在，但没有完整自动证明。
- `needs-code-check`：需要人工或脚本继续核对。
- `known-stale`：已知过期、路径失效或被替代。

## 更新流程

1. 修改实现前，读取 `knowledge/index.zh.md` 和相关知识页。
2. 修改完成后，更新对应文档、catalog 条目或知识页。
3. 追加 `knowledge/history/development-log.zh.md`，说明修改意图、关联提交、验证和剩余风险。
4. 如果新增 `.learnings` 条目，同步更新 `knowledge/learnings/**`。
5. 新增内容必须包含中文解释。

## 排除规则

默认文档库排除 `harness-state/runs/**` 和 `harness-state/tmp/**`。这些路径可以作为开发历史证据引用，但不能混入当前权威文档目录。
