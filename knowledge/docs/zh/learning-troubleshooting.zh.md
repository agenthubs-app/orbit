# 根排障知识

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `.learnings/TROUBLESHOOTING.md` |
| 中文镜像 | `knowledge/docs/zh/learning-troubleshooting.zh.md` |
| 分类 | `learning` |
| 状态 | `current` |
| 新鲜度 | `likely-current` |
| 负责人域 | `learning` |

## 怎么读

这页是当前阅读入口。具体字段、函数签名和运行行为仍以原始来源、相关代码路径和测试为准。

已登记来源和关联代码，但后续改动仍需要重新核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

记录 Orbit AI trace submit loading、provider timeout 和 responsive submit 控件等排障过程。

## 审计依据

已登记来源文档，后续变更通过 catalog 新鲜度状态追踪。

## 结构化阅读入口

- 第 1 节：Troubleshooting 知识 Base
- 第 2 节：TRB 20260630 001 Orbit AI Trace submit stays disabled after 点击
- 第 3 节：源标题：Symptoms
- 第 4 节：源标题：Root Cause
- 第 5 节：源标题：Fix
- 第 6 节：验证
- 第 7 节：源标题：Prevention
- 第 8 节：源标题：Related Files
- 第 9 节：源标题：Follow up Correction

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

源文档正文主要不是中文。中文镜像不直接机翻全文，避免生成一份看似同步、实际难以审计的副本；阅读时先看本页摘要、审计依据、标题入口和代码证据。需要逐段核对时，请打开上方原始来源。
