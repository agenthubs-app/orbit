# 手动验收指南

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/scripts/manual-acceptance.md` |
| 中文镜像 | `knowledge/docs/zh/manual-acceptance-guide.zh.md` |
| 分类 | `developer-guide` |
| 状态 | `current` |
| 新鲜度 | `likely-current` |
| 负责人域 | `qa` |

## 怎么读

这页是当前阅读入口。具体字段、函数签名和运行行为仍以原始来源、相关代码路径和测试为准。

已登记来源和关联代码，但后续改动仍需要重新核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

记录 app 手动验收路径和检查点，适合在自动测试之外做产品表面回归。

## 审计依据

已核对文档仍在 app scripts 目录，且当前 app 路由与页面测试已覆盖主要产品表面；路径变化时仍需同步维护。

## 结构化阅读入口

- 第 1 节：Sprint 68 手动 验收 Script
- 第 2 节：源标题：Preconditions
- 第 3 节：产品 路由 Walk
- 第 4 节：源标题：Required API Probes
- 第 5 节：Required Mock 能力 Probes
- 第 6 节：源标题：Provenance Check
- 第 7 节：验证 Commands

## 保留的代码与命令证据

### 代码证据 1

```bash
node --test --import tsx tests/integration/mock-capability-loop.test.tsx
npm test
npm run lint
npm run build
```

## 源文档正文

源文档正文主要不是中文。中文镜像不直接机翻全文，避免生成一份看似同步、实际难以审计的副本；阅读时先看本页摘要、审计依据、标题入口和代码证据。需要逐段核对时，请打开上方原始来源。
