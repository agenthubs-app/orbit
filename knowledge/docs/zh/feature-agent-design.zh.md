# agent Feature 设计

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/features/agent/DESIGN.md` |
| 中文镜像 | `knowledge/docs/zh/feature-agent-design.zh.md` |
| 分类 | `feature-design` |
| 状态 | `current` |
| 新鲜度 | `likely-current` |
| 负责人域 | `feature:agent` |

## 怎么读

这页是当前阅读入口。具体字段、函数签名和运行行为仍以原始来源、相关代码路径和测试为准。

已登记来源和关联代码，但后续改动仍需要重新核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

记录 agent feature 的设计边界和 mock-first 实施方向，是模块文档之后的第二层阅读材料。

## 审计依据

已核对 repos/orbits/features/agent 目录和 service factory 存在；模块边界还由 modular-boundaries 测试覆盖。

## 结构化阅读入口

- 第 1 节：Agent 模块设计文档
- 第 2 节：设计定位
- 第 3 节：子能力范围
- 第 4 节：契约与数据边界
- 第 5 节：Mock 行为
- 第 6 节：Live 替换方案
- 第 7 节：API 与页面使用
- 第 8 节：测试要求
- 第 9 节：团队协作规则

## 保留的代码与命令证据

源文档没有独立代码块；涉及的路径、命令和接口名保留在上方元信息中。


## 源文档正文

## 设计定位

Agent 负责把 Orbit 已经掌握的关系证据转成“下一步动作”。它不是自动执行器。当前产品原则是：Agent 可以排序、解释、准备和预览动作，但外部发送、日程修改、通知投递、联系人写入都必须停在确认边界前。

这个模块让 AI chat 和侧边功能页能共享同一套动作队列，而不是各自生成一套不可追踪建议。

## 子能力范围

- `agent-action-queue-mock`：生成关系动作队列，包含优先级、证据、目标联系人和建议动作。
- `agent-autonomy-settings-mock`：定义自动化等级和可执行范围。
- `external-action-sandbox-mock`：模拟外部动作执行前的 no-op sandbox。

## 契约与数据边界

主契约在 `features/agent/contract.ts`。核心字段包括 action type、priority、source reference、provenance、confirmation need、decision state 和 no-side-effect ledger。Agent 动作只能引用其他模块已经确认的证据，不能自己发明联系人事实。

`features/agent/service.ts` 定义 action queue、decision 和 autonomy 服务接口。`service-factory.ts` 是唯一入口。

## Mock 行为

Mock action queue 根据本地关系、活动和跟进 fixture 生成稳定动作。Sandbox 返回 no-op preview，不发消息、不写数据库、不触发通知。Autonomy mock 只表达策略，不真的调度后台任务。

## Live 替换方案

Live Agent 可以接规划器、LLM、任务调度器或外部动作 provider，但必须维持同一 contract。LLM 输出必须经过 validator 和 mapper，不能直接进入页面。外部动作 provider 必须挂在 sandbox 或 confirmation guard 后面。

## API 与页面使用

产品入口是 `/app/agent`，也会被 `/app` 的 AI command center 调用。API 包括 action list、accept、dismiss、settings 和 sandbox external actions。页面显示动作理由、来源证据、确认需求和外部影响边界。

## 测试要求

- action queue 测试确认每个动作有 evidence 和 priority。
- accept/dismiss 测试确认只改变本地 preview，不执行外部副作用。
- autonomy 测试覆盖 low、medium、high 等策略状态。
- sandbox 测试确认 external side effect 标记为 false。
- 页面测试确认用户能看见确认保护和动作来源。

## 团队协作规则

Agent 团队不能直接改 Contacts、Events、Followups 的 fixture 来制造动作。需要新证据时，先通过对应模块 contract 增加字段，再让 Agent 消费该字段。Agent 只负责编排下一步，不拥有原始事实。
