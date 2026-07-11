# Orbit 项目总览

Orbit 是一个围绕关系资产、人脉上下文、活动场景、跟进任务和 Agent 辅助动作构建的 Next.js 应用。当前项目包含根 harness、生成应用 `repos/orbits`、mockdata 生成链路和大量设计/实施文档。

## 产品定位（2026-07-11 定稿）

一句话定位：**懂你人脉的商务秘书，不是什么都能聊的商务 AI。**

- 目标用户：商业活动参与者——寻找机会的创业者、需要维护潜在客户的人。
- 产品形态：线下活动 + 线上维护结合的活动关系闭环（会前找活动找人加日历 / 会中互换与 memo / 会后跟进与草稿）。
- 能力取舍判断句：一个功能要不要做，只问"它在会前/会中/会后闭环里吗？"
- 明确不做：面向销售的 CRM（管道、成单管理）、无限制 AI Chat、群发营销、线索购买。
- 护城河：私有关系数据（双方确认的互换与 memo）、主动性（正确时刻主动开口）、可信执行（内部动作确认后做掉，对外只备草稿）。

权威来源：`docs/superpowers/specs/2026-07-11-orbit-ai-positioning-boundary-design.md`。执行深度与边界细节见 `knowledge/wiki/actions-system.zh.md`。

## 核心目标

- 关系资产优先：联系人、连接、来源证据、关系阶段和下一步行动是核心。
- Mock-first / contract-first：先定义契约和 mock 能力，再逐步替换 live provider。
- 可追溯：联系人、推荐、任务、Agent action 和 AI 输出都要保留 source/evidence。
- Agent 安全：AI 可以推荐和起草，但敏感写入、外发、日历、通知等必须走确认和审计。

## 主要来源

- `docs/designs/inital_design.md`
- `docs/designs/orbit_technical_design.md`
- `AGENT.md`
- `repos/orbits/docs/architecture/modular-design.md`
- `repos/orbits/AGENTS.md`

## 当前知识风险

项目文档很多，但散落在 root docs、harness-state、feature 目录、app docs 和 `.learnings`。知识库的职责是统一入口、中文摘要、状态标记和开发历史。
