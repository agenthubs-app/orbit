# Orbit 知识库维护日志

## [2026-06-30] design | 建立 Orbit 文档库与知识库结构

- 根据用户目标设计 `knowledge/` 结构化知识库。
- 参考 LLM-maintained wiki 模式，采用文档库、主题 wiki、开发历史、learnings 和维护日志分层。
- 记录中文优先、来源可追溯、运行快照不进入默认文档库的维护规则。

## [2026-06-30] implementation | 文档库与知识库第一版

- 建立 `knowledge/` 知识库入口、文档 catalog、开发历史和 learnings 中文索引。
- 同步 `repos/orbits/shared/knowledge/knowledge-manifest.ts`。
- 新增 `/dev/knowledge` 可视化 Wiki 页面。
- 验证命令记录在 `knowledge/history/development-log.zh.md`。
