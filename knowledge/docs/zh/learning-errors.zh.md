# 根错误记录

本页是 Orbit Wiki 的中文阅读版。它保留原始文档的路径、代码块、命令和接口标识，用中文说明阅读目的、审计依据和结构入口。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `.learnings/ERRORS.md` |
| 中文镜像 | `knowledge/docs/zh/learning-errors.zh.md` |
| 分类 | `learning` |
| 状态 | `current` |
| 新鲜度 | `likely-current` |
| 负责人域 | `learning` |

## 中文摘要

记录 harness 依赖、tsx eval、provider hang 和 git diff 命令等错误经验。

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
- 第 8 节：源文档第 8 个标题
- 第 9 节：摘要
- 第 10 节：错误
- 第 11 节：上下文
- 第 12 节：源文档第 12 个标题
- 第 13 节：源文档第 13 个标题
- 第 14 节：源文档第 14 个标题
- 第 15 节：源文档第 15 个标题
- 第 16 节：摘要
- 第 17 节：错误
- 第 18 节：上下文
- 第 19 节：源文档第 19 个标题
- 第 20 节：源文档第 20 个标题
- 第 21 节：源文档第 21 个标题
- 第 22 节：源文档第 22 个标题
- 第 23 节：摘要
- 第 24 节：错误
- 第 25 节：上下文
- 第 26 节：源文档第 26 个标题
- 第 27 节：源文档第 27 个标题
- 第 28 节：源文档第 28 个标题
- 第 29 节：摘要
- 第 30 节：错误
- 第 31 节：上下文
- 第 32 节：源文档第 32 个标题
- 第 33 节：源文档第 33 个标题
- 第 34 节：源文档第 34 个标题
- 第 35 节：源文档第 35 个标题
- 第 36 节：摘要
- 第 37 节：错误
- 第 38 节：上下文
- 第 39 节：源文档第 39 个标题
- 第 40 节：源文档第 40 个标题
- 第 41 节：源文档第 41 个标题
- 第 42 节：摘要
- 第 43 节：错误
- 第 44 节：上下文
- 第 45 节：源文档第 45 个标题
- 第 46 节：源文档第 46 个标题
- 第 47 节：源文档第 47 个标题
- 第 48 节：源文档第 48 个标题
- 第 49 节：摘要
- 第 50 节：错误
- 第 51 节：上下文
- 第 52 节：源文档第 52 个标题
- 第 53 节：源文档第 53 个标题
- 第 54 节：源文档第 54 个标题
- 第 55 节：源文档第 55 个标题
- 第 56 节：摘要
- 第 57 节：错误
- 第 58 节：上下文
- 第 59 节：源文档第 59 个标题
- 第 60 节：源文档第 60 个标题
- 第 61 节：源文档第 61 个标题
- 第 62 节：源文档第 62 个标题
- 第 63 节：摘要
- 第 64 节：错误
- 第 65 节：上下文
- 第 66 节：源文档第 66 个标题
- 第 67 节：源文档第 67 个标题
- 第 68 节：源文档第 68 个标题
- 第 69 节：源文档第 69 个标题
- 第 70 节：摘要
- 第 71 节：错误
- 第 72 节：上下文
- 第 73 节：源文档第 73 个标题
- 第 74 节：源文档第 74 个标题
- 第 75 节：源文档第 75 个标题
- 第 76 节：源文档第 76 个标题
- 第 77 节：摘要
- 第 78 节：错误
- 第 79 节：上下文
- 第 80 节：源文档第 80 个标题

## 保留的代码与命令证据

### 代码证据 1

```text
/dev/orbit-ai/trace submit -> requestStatus === "loading" -> button disabled
Trace API waits on provider planner/synthesis without an abort timeout.
```

### 代码证据 2

```text
ModuleNotFoundError: No module named 'claude_agent_sdk'
```

### 代码证据 3

```text
TypeError: m.resolveModuleMode is not a function
TypeError: svc.resolveContactsListSearchAndFilterService is not a function
```

### 代码证据 4

```text
TypeError: ClaudeAgentOptions.__init__() got an unexpected keyword argument 'max_tokens'

KeyboardInterrupt while asyncio.run(_run_minimax_agent(...)) was waiting in the SDK event loop.
The bundled claude child process was alive with --model MiniMax-M3 but emitted no output.
```

### 代码证据 5

```text
zsh:1: read-only variable: status
```

### 代码证据 6

```text
Failed to read file to update /Volumes/ORICO/Projects/orbit/tests/capabilities/orbit-agent-conversation-mock.test.ts: No such file or directory
```

### 代码证据 7

```text
SyntaxError: The requested module '../features/orbit-ai/live-conversation-service.ts'
does not provide an export named 'createLiveOrbitAgentConversationService'
```

### 代码证据 8

```text
apply_patch reported success, but harness/harness.py and tests/test_harness_core.py repeatedly reverted to the old hard-fail implementation.
ps showed a 16-hour-old codex resume process with dangerous sandbox bypass.
```

### 代码证据 9

```text
warning: Not a git repository. Use --no-index to compare two paths outside a working tree
```

### 代码证据 10

```text
FAILED tests/test_harness_core.py::test_evaluator_fails_passed_criteria_without_evidence
AssertionError: assert 'pass' == 'fail'
```

### 代码证据 11

```text
apply_patch verification failed: invalid hunk at line 2, Update file hunk for path 'harness-state/spec.md' is empty
```

### 代码证据 12

```text
TypeError: ClaudeAgentOptions.__init__() got an unexpected keyword argument 'temperature'
```

### 代码证据 13

```text
zsh:1: unmatched "
```

### 代码证据 14

```text
rg: README.md: No such file or directory (os error 2)
```

### 代码证据 15

```text
warning: Not a git repository. Use --no-index to compare two paths outside a working tree
```

### 代码证据 16

```text
apply_patch verification failed: Failed to find expected lines in /Volumes/ORICO/Projects/orbit/harness/README.md
```

### 代码证据 17

```text
FileNotFoundError: [Errno 2] No such file or directory: PosixPath('/Volumes/ORICO/Projects/orbit/harness-state/tmp')
```

### 代码证据 18

```text
ERROR: not found: tests/test_harness_core.py::test_run_planning_loop_accumulates_multi_turn_planner_output
ERROR: not found: tests/test_harness_core.py::test_run_planning_loop_rejects_empty_contract_list
```

### 代码证据 19

```text
ValueError: Planner output must include a JSON object with a contracts list under ## Sprint Contract Seeds.
NameError: name 're' is not defined
```

### 代码证据 20

```text
NameError: name 'json' is not defined
```

## 源文档正文

该源文档主体不是中文。当前中文阅读版先保留中文摘要、审计依据、结构化入口和代码证据，不把英文原文混入默认阅读正文。
