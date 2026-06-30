# 根排障知识

本页是 Orbit Wiki 的中文阅读版。它保留原始文档的路径、代码块、命令和接口标识，用中文说明阅读目的、审计依据和结构入口。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `.learnings/TROUBLESHOOTING.md` |
| 中文镜像 | `knowledge/docs/zh/learning-troubleshooting.zh.md` |
| 分类 | `learning` |
| 状态 | `current` |
| 新鲜度 | `likely-current` |
| 负责人域 | `learning` |

## 中文摘要

记录 Orbit AI trace submit loading、provider timeout 和 responsive submit 控件等排障过程。

## 审计依据

已登记来源文档，后续变更通过 catalog 新鲜度状态追踪。

## 结构化阅读入口

- 第 1 节：Troubleshooting 知识 Base
- 第 2 节：源文档第 2 个标题
- 第 3 节：源文档第 3 个标题
- 第 4 节：源文档第 4 个标题
- 第 5 节：源文档第 5 个标题
- 第 6 节：验证
- 第 7 节：源文档第 7 个标题
- 第 8 节：源文档第 8 个标题
- 第 9 节：源文档第 9 个标题

## 保留的代码与命令证据

### 代码证据 1

```sh
node --test --import tsx tests/capabilities/orbit-agent-gemini-live.test.ts
node --test --import tsx tests/capabilities/orbit-ai-trace-debug.test.ts tests/pages/orbit-ai-trace-debug-page.test.tsx
npm run lint
```

### 代码证据 2

```sh
curl -sS -X POST http://localhost:3000/api/dev/orbit-ai/trace \
  -H 'content-type: application/json' \
  --data '{"message":"这段聊天不要给 AI 分析，也不要保存记录"}'
```

## 源文档正文

该源文档主体不是中文。当前中文阅读版先保留中文摘要、审计依据、结构化入口和代码证据，不把英文原文混入默认阅读正文。
