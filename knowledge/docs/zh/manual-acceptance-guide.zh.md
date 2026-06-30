# 手动验收指南

本页是 Orbit Wiki 的中文阅读版。它保留原始文档的路径、代码块、命令和接口标识，用中文说明阅读目的、审计依据和结构入口。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/scripts/manual-acceptance.md` |
| 中文镜像 | `knowledge/docs/zh/manual-acceptance-guide.zh.md` |
| 分类 | `developer-guide` |
| 状态 | `current` |
| 新鲜度 | `likely-current` |
| 负责人域 | `qa` |

## 中文摘要

记录 app 手动验收路径和检查点，适合在自动测试之外做产品表面回归。

## 审计依据

已核对文档仍在 app scripts 目录，且当前 app 路由与页面测试已覆盖主要产品表面；路径变化时仍需同步维护。

## 结构化阅读入口

- 第 1 节：Sprint 68 手动 验收 Script
- 第 2 节：源文档第 2 个标题
- 第 3 节：产品 路由 Walk
- 第 4 节：源文档第 4 个标题
- 第 5 节：Required Mock 能力 Probes
- 第 6 节：源文档第 6 个标题
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

该源文档主体不是中文。当前中文阅读版先保留中文摘要、审计依据、结构化入口和代码证据，不把英文原文混入默认阅读正文。
