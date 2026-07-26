# Agent 关系信号引擎

## 产品职责

关系信号引擎负责把 Orbit 已有的日程、跟进任务、联系人、关系与证据，
转换成少量、可解释、可处理的关系工作。它不是通知文案生成器，也不直接
执行外部动作。

首批真实信号：

- `followup_due`：已逾期或未来七天到期的开放跟进；
- `event_upcoming`：未来七天内开始、尚未取消的活动；
- `relationship_stale`：九十天以上没有新关系证据的非归档关系。

## 数据与状态边界

- 来源读取复用 Events 与 Followups 的 live provider，不读取前端 fixture。
- 每条信号保留来源、证据 ID、采集时间、置信度、重要性和可执行入口。
- 用户状态按 `workspace + actor` 隔离，存入 `agentSignals` collection。
- `fingerprint` 标识同一业务事实，`materialHash` 只覆盖会改变处理判断的字段。
- 重复刷新只更新 `lastObservedAt`；实质字段变化才重新置为 `new` 并生成 diff。
- 来源事实消失后信号转为 `resolved`，不会继续显示。
- `snoozed`、`dismissed` 与 `acknowledged` 在无实质变化时不会被刷新覆盖。

## 产品界面

Agent 空白态首先呈现“今天值得你关注的事”，聊天建议位于工作台之后。
界面只展示 `new` 与 `acknowledged` 信号，并支持：

- 打开来源业务页面；
- 把已绑定的任务、联系人和关系上下文交给 Agent 准备；
- 明天提醒；
- 忽略；
- 手动刷新并执行去重。

桌面与移动端各有展示容器，但只有当前断点对应的实例会读取接口，避免隐藏
DOM 重复刷新。

## 安全与准确性

- 工作台动作只进入 Agent 对话，不直接发送消息或写入外部系统。
- 联系人跟进 Prompt 以 task/contact/connection ID 和来源摘要为准，避免按姓名
  二次匹配造成歧义。
- 安全分类器使用完整英文单词边界，避免把 `investor` 当成 `invest`、把
  `exchange` 当成 `change`、把 `relationship record` 当成写入动作。
- 医疗、法律和具体投资指令仍由本地边界拦截，并返回与风险领域对应的说明。

## 后续扩展

新的信号来源应实现 candidate collector，而不是在页面添加条件分支。外部
变化监测、会议纪要、CRM、Slack 或 MCP 接入后，仍通过同一 fingerprint、
material diff、来源和状态模型进入工作台。
