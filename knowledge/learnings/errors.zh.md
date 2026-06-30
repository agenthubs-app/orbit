# 错误记录

## Claude Agent SDK 依赖缺失

来源：`.learnings/ERRORS.md`

根 harness 使用 Claude-backed Planner/Evaluator/Verifier 时，需要 `claude-agent-sdk`。缺失时会出现 `ModuleNotFoundError: No module named 'claude_agent_sdk'`。依赖应通过 `uv` 管理，并保留 runtime dependency 测试。

## tsx eval named export 包装

来源：`.learnings/ERRORS.md`

在本 repo 用 `node --import tsx -e` 快速 probe TypeScript 模块时，named exports 可能出现在 `module.default` 下。快速探针应使用 `const mod = module.default ?? module` 再读取导出。

## Node heredoc regex 转义失败

来源：`repos/orbits/.learnings/ERRORS.md`

bulk migration script 中简单路径分隔符替换不要过度使用 regex literal。优先使用 `replaceAll("/", "-")` 这类字符串 API，并在 codemod 后运行 `rg`、`git diff --check` 和目标测试。
