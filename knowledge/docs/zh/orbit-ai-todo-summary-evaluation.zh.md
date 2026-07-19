# Orbit AI 待办摘要评估

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/features/orbit-ai/TODO_SUMMARY_EVALUATION.md` |
| 中文镜像 | `knowledge/docs/zh/orbit-ai-todo-summary-evaluation.zh.md` |
| 分类 | `evaluation` |
| 状态 | `current` |
| 新鲜度 | `likely-current` |
| 负责人域 | `orbit-ai` |

## 怎么读

这页是当前阅读入口。具体字段、函数签名和运行行为仍以原始来源、相关代码路径和测试为准。

已登记来源和关联代码，但后续改动仍需要重新核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

todo-summary-service 回答'我接下来该做什么'的评估文档：只综合结构化输入（对话下一步、日程、生日、引荐、关系提醒），输出必须带来源/证据/链接/优先级，所有动作 requiresConfirmation。五个命名 case 校验召回与首位优先级（阈值均 0.8），服务必须拒绝复用过期的 prepared final response；文末给出 mock-to-live 的文件规划与只读权限约束。

## 审计依据

这是能力评估文档，五个 case 与阈值是回归基准，live 路径部分是尚未实现的规划；实际行为以 todo-summary-service.ts 和 orbit-ai-todo-summary-evaluation 测试为准。

## 结构化阅读入口

- 第 1 节：Orbit AI 待办摘要评估
- 第 2 节：目标
- 第 3 节：设计 -> 评估 -> 分析循环
- 第 4 节：接受阈值
- 第 5 节：五个评估 case
- 第 6 节：Mock-to-live 替换路径

## 保留的代码与命令证据

源文档没有独立代码块；涉及的路径、命令和接口名保留在上方元信息中。


## 源文档正文

## 目标

`todo-summary-service.ts` 负责回答“我接下来该做什么”这类 Orbit AI 问题。它只综合结构化输入：对话下一步、活动时间、日程记录、生日、引荐机会和关系提醒。输出必须带来源、证据、链接、到期时间、原因和优先级。

该能力不创建真实日历、邮件、通知、任务或 CRM 写入。所有 action 都是 `requiresConfirmation=true` 的复核入口。

## 设计 -> 评估 -> 分析循环

1. 设计：把每个来源映射成统一 `OrbitAiTodoSummaryItem`，保留 `sourceContext`、`sourceLabel`、`evidenceIds` 和 person/event 链接。
2. 评估：运行五个命名 case，覆盖今日 agenda、周末社交提醒、生日提及、朋友引荐请求和活动后的商务跟进。
3. 分析：检查召回是否包含必需 item，检查第一优先级是否符合该问题的意图。
4. 呈现：把结果转成 `followup_queue` artifact payload，标题使用“关系待办摘要”，但不改变 artifact contract 的 kind 列表。
5. 验证：页面只读取 artifact generated view 和 metadata，不导入 fixture 或业务服务；`/app/agent?q=...` 通过 conversation preview 进入同一边界。
6. 质量复核：answered state 必须直接展示前三个优先事项，并把其余事项标成“更多关系待办 / More upcoming work”，避免真实用户只看到 launcher 或把待办误读成泛化历史证据。
7. 浏览器证据：`/app/agent?q=今日待办` 必须进入 answered state；前三个可见 item 使用 `data-orbit-agent-todo-visible-rank` 标记，显示来源、到期、原因、person/event 链接和“需确认 / Confirm”。输入框的可访问名称为“询问 Orbit 关系待办 / Ask Orbit relationship to-dos”。

## 接受阈值

`ORBIT_AI_TODO_SUMMARY_ACCEPTANCE_THRESHOLD` 当前要求：

- `taskRecall >= 0.8`
- `priorityAccuracy >= 0.8`

每个 case 都声明 `expectedRequiredItemIds` 和 `expectedTopItemId`。测试还会传入更新后的 conversation/schedule records，并提供一段过期的 prepared final response；服务必须拒绝复用这段 final response，改用最新结构化记录生成答案。

## 五个评估 case

- `today_agenda`：今日待办必须优先召回对话里的 Aoba pilot recap，并包含今日日程和引荐事项。
- `weekend_social_reminder`：周末社交问题必须召回 Amina 周末 check-in 和 community dinner。
- `birthday_mention`：生日问题必须把 Hana Sato 的 birthday mention 排第一。
- `friend_introduction_request`：朋友引荐问题必须把 Maya -> Kai 的 opt-in 请求排第一。
- `business_followup_after_event`：活动后商务跟进必须优先 Aoba pilot recap，并包含 Seed Investor and Founder Matching Salon。

## Mock-to-live 替换路径

当前 mock 路径：

- `features/orbit-ai/todo-summary-service.ts`：deterministic summary service 和 evaluation cases。
- `features/orbit-ai/mock-conversation-service.ts`：把 `todo_synthesis` routing decision 转成待办摘要 artifact。
- `app/(app)/app/agent/orbit-real-agent.tsx`：只渲染 generated view、metadata 和 links。

未来 live 路径应新增或更新：

- `features/orbit-ai/live-todo-summary-service.ts`：从 live conversation、schedule/event、followup 和 relationship reminder adapters 读取结构化记录。
- `features/orbit-ai/todo-summary-provider.ts`：只做排序策略或可选 model synthesis；不得直接读 raw provider payload。
- `features/orbit-ai/todo-summary-mappers.ts`：把各 feature service DTO 映射成 `OrbitAiTodoSummaryInput`。
- `features/orbit-ai/service-factory.ts`：用 `ORBIT_AGENT_CONVERSATION_MODE` 或模块级 explicit mode 选择 mock/live，并在 provider 缺失时 fail closed。

需要的环境和权限：

- 如果启用 model synthesis，使用现有 server-side provider key：`GEMINI_API_KEY`、`DEEPSEEK_API_KEY` 或 `OPENAI_API_KEY`。
- 如果读取 live schedule/followup/contact 数据，只允许 read-only service 权限。
- 仍不得请求邮件、日历写入、通知投递、外部发送或 live database write 权限。

隐私与来源约束：

- 每个 item 必须保留 `evidenceIds`、`sourceContext`、`sourceLabel` 和 person/event link。
- 页面不得展示 raw provider payload、未映射 fixture 字段或跨模块私有字段。
- 如果某个来源不可用，结果必须显式缺少该来源的 item，而不是用编造数据补齐。

替换测试：

- 保留 `tests/capabilities/orbit-ai-todo-summary-evaluation.test.ts` 的五个命名 case。
- 增加 live adapter contract 测试，证明 mapper 使用更新后的结构化 records，且不会接受忽略更新数据的 prepared final response。
- 保留 `tests/pages/app-agent-todo-summary.test.tsx`，证明 `/app/agent` 仍显示到期时间、原因、来源上下文、person/event 链接，以及 todo-specific “更多关系待办 / More upcoming work” answered-state 标记。
