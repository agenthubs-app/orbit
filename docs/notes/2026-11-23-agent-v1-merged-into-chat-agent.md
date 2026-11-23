# 2026-11-23：agent v1 已合进 chat-agent，正式站从 chat-agent 部署

写给小雨。拉 `chat-agent` 时会看到 agent v1 的约 480 个提交，原因和要注意的地方如下。

## 发生了什么

- 11-22 23:24，正式站被部署成了 `chat-agent` 的版本（推测是你发的，含 landing v2），把原来跑在正式站上的 agent v1（分支 `agent-v1-integration`）顶掉了。
- 用户决定：不再分两条线，把 `agent-v1-integration` 合进 `chat-agent`，以后都从 `chat-agent` 部署。
- 合并提交 `5762efa9d`（你的 `697a3e955` + `agent-v1-integration` 的 `d4067c596`）。冲突 6 个文件，两边的改动都保留了：
  - 网页 `EventsScreen.tsx`、App `EventsHome.tsx`：你的「これから / 過去」切换、空状态、封面图，加上 agent v1 的私人活动、自己的出席记录、全天活动。
  - `features/events/mine/service.ts`：封面图 + 私人活动的关联记录。
  - `IOrbit2026.module.css`、App `AiConversationScreen.tsx`、`audit-offline-read-surfaces.ts`：两边都留。
- 合并后与两边各自比较：类型检查、网页全量测试、App 测试、构建都没有合并带来的新失败。

## 正式站现在

- 部署 `orbit-staging-kkuma2oku-…`，来自 `chat-agent` 3284b68b7（多轮引擎 r12；问/办已打开〔只加问题、无选项不问、agent 已认出的不再问〕，退路 ORBIT_AGENT_CONVERSATION_NEXT=shadow；打字「算了先别建」等同点卡片的拒绝）。比 agent-v1-integration 多出的、11-23 当天上线的改动：
  - 人名的简繁日异体写法（联系人搜索 + 记录查找的文字归一表）；
  - 等待确认的卡片上的纠正（含多条记录、日程、笔记）和「就按刚才那条建」；
  - 回答开头的数量由代码核对；
  - 卡片改动说明不再「X→X」、一句改两条待办出双条卡片、一句两件事拆成两部分（第一层提示词 understand@ag09.2）；
  - 多轮引擎按需读库数据（shadow）、代词 R27 打开、「问还是办」只记录；子开关 ORBIT_AGENT_CONVERSATION_{WORLD,PRONOUN,CARRY,NEXT}=off|shadow|on。
- 正式环境变量（agent v1 需要的，已在）：`ORBIT_AGENT_V1_MODE=on`、`ORBIT_AGENT_WEB=on`、`ORBIT_GEMINI_DECISION_API_KEY`、`ORBIT_MCP_BASE_URL`、新增 `ORBIT_AGENT_CONVERSATION=on`（多轮理解引擎）。
- 记录查找的退路：`ORBIT_AGENT_FINDER=legacy`；多轮引擎的退路：`ORBIT_AGENT_CONVERSATION=legacy`。

## 回滚

- 回到你 11-22 23:24 那版（没有 agent v1）：`vercel promote https://orbit-staging-i981fop5q-orbitsdev2026-7133.vercel.app --cwd repos/orbits --yes`

## 以后部署

- 从 `chat-agent` 部署即可，agent v1 已在里面。部署前请跑 `node --test --import tsx tests/agent-v1/*.test.ts`（应全过），改到 agent 相关代码时再按 `docs/epics/agent-design/eval/README.md` 跑离线用例。
