# App 经验记录

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/.learnings/LEARNINGS.md` |
| 中文镜像 | `knowledge/docs/zh/app-learning-patterns.zh.md` |
| 分类 | `learning` |
| 状态 | `current` |
| 新鲜度 | `likely-current` |
| 负责人域 | `learning` |

## 怎么读

这页是当前阅读入口。具体字段、函数签名和运行行为仍以原始来源、相关代码路径和测试为准。

已登记来源和关联代码，但后续改动仍需要重新核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

记录 framework/mock/live 解耦、提交范围检查和注释提交卫生等经验。

## 审计依据

已登记来源文档，后续变更通过 catalog 新鲜度状态追踪。

## 结构化阅读入口

- 第 1 节：源标题：LRN 20260630 001 correction
- 第 2 节：摘要
- 第 3 节：源标题：Details
- 第 4 节：源标题：Suggested Action
- 第 5 节：源标题：Metadata
- 第 6 节：源标题：LRN 20260630 003 correction
- 第 7 节：摘要
- 第 8 节：源标题：Details
- 第 9 节：源标题：Suggested Action
- 第 10 节：源标题：Metadata
- 第 11 节：源标题：LRN 20260630 002 correction
- 第 12 节：摘要
- 第 13 节：源标题：Details
- 第 14 节：源标题：Suggested Action
- 第 15 节：源标题：Metadata

## 保留的代码与命令证据

源文档没有独立代码块；涉及的路径、命令和接口名保留在上方元信息中。


## 源文档正文

## [LRN-20260630-001] correction

**Logged**: 2026-06-30T01:46:33Z
**Priority**: high
**Status**: pending
**Area**: backend

### Summary
Orbit 的 agent 能力必须保持 framework/contract、mock、live 三层解耦。

### Details
用户最初的设计原则是“框架、mock、live 解耦”。我之前把“先用 mock 跑通能力”误读成了“contract 可以携带 mock fixture 作为默认样例”，导致 mock 数据、演示身份和 fixture provenance 泄漏进主逻辑或 contract 文件。正确边界是：framework/contract 只定义能力、类型、错误和注入点；mock 是一个可替换实现，mock 数据只能放在 fixtures 或 mock service 专用文件；live 是另一套实现，不能 import mock fixture 或依赖演示身份。

### Suggested Action
新增或改造 agent 能力时，先写边界测试锁住 contract/service/live 文件不包含 mock fixture、demo identity 或 mock implementation import，再实现 mock/live 的可插拔 provider。遇到 mock-first 需求时，也必须把 fixture 文件和 contract 文件分开。

### Metadata
- Source: user_feedback
- Related Files: features/orbit-ai/live-conversation-service.ts, features/orbit-ai/live-conversation-trace.ts, shared/ai/provider.ts, features/followups/message-draft-contract.ts
- Tags: architecture, agent, contract, mock, live, fixture-boundary
- Pattern-Key: architecture.agent_framework_mock_live_decoupling
- Recurrence-Count: 1
- First-Seen: 2026-06-30
- Last-Seen: 2026-06-30

---

## [LRN-20260630-003] correction

**Logged**: 2026-06-30T06:34:00Z
**Priority**: medium
**Status**: pending
**Area**: infra

### Summary
提交“注释改动”时也要处理注释周围的空行移动。

### Details
用户指出提交中文注释后 IDE 的 CHANGES 里仍有很多注释相关改动。原因是第一轮只 stage 了注释文本行，后续虽然补了一批注释/空行移动，但仍漏掉了大量 blank-only hunk。IDE 会把这些空行位置变化和附近注释一起显示，让用户看到“注释还没提交”。

### Suggested Action
拆分注释任务时，统计并处理三类内容：新增/删除注释行、注释移动产生的删除+添加、以及注释周围的空行移动。提交前用脚本验证 staged diff 只有注释或空白行，不能只看 `git diff -G` 的文件列表。

### Metadata
- Source: user_feedback
- Related Files: repos/orbits/app, repos/orbits/features
- Tags: git, commit-hygiene, diff-filtering, comments
- Pattern-Key: git.comment_commit_blank_lines
- Recurrence-Count: 1
- First-Seen: 2026-06-30
- Last-Seen: 2026-06-30

---

## [LRN-20260630-002] correction

**Logged**: 2026-06-30T03:52:00Z
**Priority**: high
**Status**: pending
**Area**: infra

### Summary
回答“某个任务是否已提交”时，不能只检查单个代表文件。

### Details
用户指出 IDE 的 CHANGES 区仍有大量“增加注释”的改动。我之前只检查了 `features/orbit-ai/live-conversation-service.ts`，因此错误地把“这个文件没有未提交 diff”说成了“注释任务已经提交”。正确做法是先确认 Git 根目录，再用 `git status`、`git diff --stat` 和任务相关的 diff 过滤覆盖整个工作区，尤其是在工作区已有大量并行改动时。

### Suggested Action
涉及提交状态的问题，先报告检查范围：仓库根、目标路径、staged/unstaged/untracked 三类状态。若工作区很脏，必须把目标任务改动从其他改动中分离验证后再提交。

### Metadata
- Source: user_feedback
- Related Files: features/orbit-ai/live-conversation-service.ts, app, features, tests
- Tags: git, commit-hygiene, dirty-worktree
- Pattern-Key: git.commit_status_scope
- Recurrence-Count: 1
- First-Seen: 2026-06-30
- Last-Seen: 2026-06-30

---
