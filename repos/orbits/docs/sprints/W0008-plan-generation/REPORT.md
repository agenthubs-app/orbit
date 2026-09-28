# Sprint W0008 — 执行总结

## 目标实现情况

- 本轮要实现：用户在引导第 3 步问固定问题，先看到结论与阶段骨架，细节逐段补齐，最后自动保存为「我的计划 v1」（按 D3 先不接 AI，用 mock 生成器）。
- 已验证能做到：
  - 第 3 步「开始分析」把固定问题和选填补充发到新接口 `POST /api/agent/plans/bootstrap`，不改对话接口与共享契约；生成与保存在一次请求内原子完成，任何阶段失败整份不保存并提示重试（SC-01、SC-02）。
  - 周期按期限切分：一个月内 2–3 段、3 个月内 3 段（12 周）、一年内 4 个季度段且只有第一段细到周（SC-02）。
  - 联系人超过 200 位时只保留近 90 天有互动或与目标相关的，筛选在 SQL 里做，不再被 5000 条上限误伤（SC-03，review 后补）。
  - mock 内容只引用用户本人的真实已确认联系人与已发布的真实活动，校验器拒绝不存在或他人的 id；同一幂等键并发只保存一份，一个 201、一个回放（SC-04）。
  - 目标里的数字只认业务成果（家、位、客户、投资人等），期限数字不再被当成成果；判断不出就不编数字（review 后补）。
  - 对话页的计划卡片按原型「结论在前」：一句话回答、3 个关键数字、三个阶段、这周 3 件事、现有人脉能帮什么、最大风险、30 秒自我介绍、阶段细节折叠、「已保存为你的计划 v1」；分段揭示；刷新或 `/app/agent?plan=<id>` 直接显示完成态；卡片文字对比度达到 AA（SC-01）。
  - 生成器接口 + service factory：当前只有 mock（`ORBIT_PLAN_GENERATOR`，默认 mock），其他 provider fail closed；全程 0 次外部请求（SC-05）。
- 仍未实现或未验证：
  - **浏览器验证没做**：需要在用户账号上真实生成一份计划，会写入用户数据；由组件测试覆盖卡片与揭示过程。
  - 「查看和跟踪 →」指向的 `/app/agent/plan` 要到 W0009 才读取新计划（W0009 紧接着做）。
  - 生成文案的语言在生成时固定，切换界面语言不会翻译。
  - 在目标环境打开 `ORBIT_GUIDE_DEMO` 仍待用户授权（D1 发布动作）。

## 运行记录

- 原需求：RW-08（AI 部分按 D3 延后）
- 结果：completed（浏览器验证缺失）
- run：run-01；Generator：子代理；协调者：Claude 主会话；2026-09-28
- Planner revision：2
- 功能 SHA：`26f09869`；分支 `sprint/W0008-plan-generation`
- push：未执行

## 验收结果

| SC | 结果 | 证据 |
| --- | --- | --- |
| SC-W0008-01 | pass（组件级） | `app-agent-iorbit-plan-card.test.tsx`（块顺序、假时钟揭示、完成态、年计划折叠、对比度）、`app-agent-iorbit-chat.test.tsx`（`?plan` 落到对话、追问只发新问题）、`app-agent-guide-demo-page.test.tsx` |
| SC-W0008-02 | pass | `plan-generator.test.ts`（三种期限、有界并行、单阶段失败）、`plan-bootstrap.test.ts`（失败不保存） |
| SC-W0008-03 | pass | `plan-input-selector.test.ts`（199/200/201、90 天与目标相关、本人范围、真实 PG 5004 人边界） |
| SC-W0008-04 | pass | 校验器测试；`agent-plans-bootstrap-route.test.ts`（401、同键 201+200 回放、并发只存一份、409 带 planId、400、503 不保存、他人 id 404） |
| SC-W0008-05 | pass | factory 只返回 mock、其他 fail closed、bootstrap 期间 fetch 0 次；开关两态页面测试；定向集 284 条 283 过（唯一失败为基线 `?session=`）、0 skip；review 修复前全量 5438 条 42 失败，与上一基线新增 0；`tsc` 0 |

## GitNexus

- `AgentMessage` HIGH（10 个受影响，均在 iorbit-0918／全局提问）、`IOrbitChat` HIGH——都只是新增可选字段与渲染分支，对话／首页／screens／history 测试全过。
- staged detect-changes：33 文件、46 符号、9 流程，**risk high**（来自 `/app/agent` 入口流程）。

## Codex 代码 review 与处理

| 意见 | 判断 | 处理 |
| --- | --- | --- |
| 「查看和跟踪」进入的计划页还不读新计划 | 暂不改 | W0009 紧接着把计划页改为读生效计划 |
| 英文目标把期限数字当成果 | 采纳 | 先剔除期限表达、只认业务单位、判断不出返回 null |
| 并发同键都返回首次创建 | 采纳 | 事务内返回 created，一个 201、一个回放 |
| 状态文字对比度不足 | 采纳 | 4 处改为 AA 颜色，加对比度测试 |
| 5000 条硬截断漏人 | 采纳 | 保留条件下推到 SQL |
| 证据不全 | 部分 | 全量对照已做；浏览器验证见上 |

## 交接

- 给真实 AI Sprint：替换 `generator-service-factory.ts` 的实现即可；建议届时加生成前的键查询，并把生成挪进持久化后台任务。
- 费用：0 次付费 AI 调用。
