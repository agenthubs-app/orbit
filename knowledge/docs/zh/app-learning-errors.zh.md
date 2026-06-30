# App 错误记录

本页是 Orbit Wiki 的中文阅读版。它保留原始文档的路径、代码块、命令和接口标识，用中文说明阅读目的、审计依据和结构入口。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/.learnings/ERRORS.md` |
| 中文镜像 | `knowledge/docs/zh/app-learning-errors.zh.md` |
| 分类 | `learning` |
| 状态 | `current` |
| 新鲜度 | `likely-current` |
| 负责人域 | `learning` |

## 中文摘要

记录 repos/orbits 内 fixture migration、comment patch、git diff 正则等错误经验。

## 审计依据

已登记来源文档，后续变更通过 catalog 新鲜度状态追踪。

## 结构化阅读入口

- 第 1 节：源文档第 1 个标题
- 第 2 节：摘要
- 第 3 节：错误
- 第 4 节：上下文
- 第 5 节：源文档第 5 个标题
- 第 6 节：源文档第 6 个标题
- 第 7 节：源文档第 7 个标题
- 第 8 节：摘要
- 第 9 节：错误
- 第 10 节：上下文
- 第 11 节：源文档第 11 个标题
- 第 12 节：源文档第 12 个标题
- 第 13 节：源文档第 13 个标题
- 第 14 节：摘要
- 第 15 节：错误
- 第 16 节：上下文
- 第 17 节：源文档第 17 个标题
- 第 18 节：源文档第 18 个标题

## 保留的代码与命令证据

### 代码证据 1

```text
SyntaxError: Invalid regular expression: missing /
```

### 代码证据 2

```text
error: patch failed: repos/orbits/features/agent/external-action-contract.ts:110
error: repos/orbits/features/agent/external-action-contract.ts: patch does not apply
```

### 代码证据 3

```text
git diff -G '^\+\s*(//|/\*|\*)' --name-only -- repos/orbits
```

## 源文档正文

## [ERR-20260630-001] node_fixture_migration_script

**Logged**: 2026-06-30T02:18:48Z
**Priority**: low
**Status**: pending
**Area**: infra

### Summary
Node heredoc migration script failed once because a path separator regex was under-escaped.

### Error
```text
SyntaxError: Invalid regular expression: missing /
```

### Context
- Command/operation attempted: bulk test import rewrite for contract-to-fixtures migration.
- The script used a regex path replacement that became an unterminated literal in the Node stdin source.
- The failed command did not write files; the corrected script used `replaceAll("/", "-")` instead.

### Suggested Fix
Prefer string APIs such as `replaceAll` for simple path separator rewrites inside heredoc scripts, and keep bulk codemods followed by `rg`, `git diff --check`, and targeted tests.

### Metadata
- Reproducible: yes
- Related Files: tests/capabilities/*.test.ts

---

## [ERR-20260630-003] filtered_comment_patch_context

**Logged**: 2026-06-30T06:12:00Z
**Priority**: low
**Status**: pending
**Area**: infra

### Summary
过滤后的 comment/blank-only patch 在包含大段 fixture 删除的 contract 文件上上下文不稳定。

### Error
```text
error: patch failed: repos/orbits/features/agent/external-action-contract.ts:110
error: repos/orbits/features/agent/external-action-contract.ts: patch does not apply
```

### Context
- Command/operation attempted: 从混合 diff 中抽取注释和空行移动，避免把逻辑改动混入注释提交。
- 大部分文件可逐文件 `git apply --cached --check --recount` 后安全应用。
- 少数 contract 文件同时删除了大段 fixture/mock 数据，过滤掉非注释行后 hunk 上下文不足，不能安全自动应用。

### Suggested Fix
在高度混合的 diff 中只自动 stage 能逐文件通过 `git apply --cached --check` 的 patch；失败文件保留给对应逻辑提交，避免为了“清理注释显示”而误提交代码迁移。

### Metadata
- Reproducible: yes
- Related Files: features/*/*-contract.ts
- See Also: LRN-20260630-002

---

## [ERR-20260630-002] git_diff_g_regex

**Logged**: 2026-06-30T03:52:00Z
**Priority**: medium
**Status**: pending
**Area**: infra

### Summary
`git diff -G` 的正则误把 diff 前缀 `+` 当成被匹配内容。

### Error
```text
git diff -G '^\+\s*(//|/\*|\*)' --name-only -- repos/orbits
```

### Context
- Command/operation attempted: 统计工作区中新增注释的文件数量。
- `-G` 匹配的是变更行的文本内容，不包含 unified diff 输出中的 `+`/`-` 前缀。
- 正确筛选应使用类似 `git diff -G '^\s*(//|/\*|\*)'`。

### Suggested Fix
使用 `git diff -G` 时不要把 diff 展示前缀写进正则；如果要匹配 `+`/`-` 前缀，应改为解析 `git diff` 输出本身，并在脚本中显式处理行前缀。

### Metadata
- Reproducible: yes
- Related Files: repos/orbits
- See Also: LRN-20260630-002

---
