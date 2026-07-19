# 生成 Fixture 灌种到 Live 库的实施计划

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/docs/superpowers/plans/2026-07-01-live-generated-fixtures-seed.md` |
| 中文镜像 | `knowledge/docs/zh/app-plan-live-generated-fixtures-seed.zh.md` |
| 分类 | `implementation-plan` |
| 状态 | `historical` |
| 新鲜度 | `likely-current` |
| 负责人域 | `data` |

## 怎么读

这页主要提供历史背景。不要把它当成当前实现说明，当前行为应回到相关代码路径、主题知识页和更新后的设计文档确认。

已登记来源和关联代码，但后续改动仍需要重新核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

把 defaultMockFixtures 的全部 21 个集合灌种到远端 orbit_records Postgres 并验证：新增共享 seed 模块（DTO 转通用 LiveRecord、幂等 upsert、结构化 verify）和 db:seed/db:verify npm 脚本。文末附执行证据：已对远端工作区上载 8267 条记录，并逐集合列出计数与关键记录字段校验。

## 审计依据

这是一份已执行完毕的一次性计划，自带 Execution Evidence（远端集合计数、关键记录校验）；后续应以 shared/storage/seed-generated-fixtures.ts、两个 CLI 脚本与 live-generated-fixture-seed 测试为准，计数可能随 fixture 演进而变化。

## 结构化阅读入口

- 第 1 节：Live Generated Fixtures Seed 实现 计划
- 第 2 节：源标题：Global Constraints
- 第 3 节：任务 1: Write Failing Generated Fixture Seed 测试
- 第 4 节：任务 2: Implement Shared Generated Fixture Seed 模块
- 第 5 节：任务 3: Add CLI Scripts 和 Package Commands
- 第 6 节：任务 4: 远端 Seed 和 验证
- 第 7 节：任务 5: Final 检测 和 Report
- 第 8 节：执行 Evidence

## 保留的代码与命令证据

### 代码证据 1

```bash
node --test --import tsx tests/services/live-generated-fixture-seed.test.ts
```

### 代码证据 2

```bash
node --test --import tsx tests/services/live-generated-fixture-seed.test.ts
```

### 代码证据 3

```bash
node --test --import tsx tests/services/live-generated-fixture-seed.test.ts
npm run lint
npm run db:seed:live-generated-fixtures
npm run db:verify:live-generated-fixtures
```

### 代码证据 4

```bash
npm test
npm run build
```

### 代码证据 5

```bash
gitnexus detect_changes --scope all
```

## 源文档正文

源文档正文主要不是中文。中文镜像不直接机翻全文，避免生成一份看似同步、实际难以审计的副本；阅读时先看本页摘要、审计依据、标题入口和代码证据。需要逐段核对时，请打开上方原始来源。
