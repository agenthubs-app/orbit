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

- 部署 `dpl_AFgkQAtYfizJJURWH2ZLDHidjbwb`（`orbit-staging-4cnvr9tyv-…`），来自 `chat-agent` 5c181a810（又加了：等待确认的卡片上的纠正和「就按刚才那条建」）（含名字的简繁日异体：联系人搜索 + 记录查找的文字归一表）。
- 正式环境变量（agent v1 需要的，已在）：`ORBIT_AGENT_V1_MODE=on`、`ORBIT_AGENT_WEB=on`、`ORBIT_GEMINI_DECISION_API_KEY`、`ORBIT_MCP_BASE_URL`、新增 `ORBIT_AGENT_CONVERSATION=on`（多轮理解引擎）。
- 记录查找的退路：`ORBIT_AGENT_FINDER=legacy`；多轮引擎的退路：`ORBIT_AGENT_CONVERSATION=legacy`。

## 回滚

- 回到你 11-22 23:24 那版（没有 agent v1）：`vercel promote https://orbit-staging-i981fop5q-orbitsdev2026-7133.vercel.app --cwd repos/orbits --yes`

## 以后部署

- 从 `chat-agent` 部署即可，agent v1 已在里面。部署前请跑 `node --test --import tsx tests/agent-v1/*.test.ts`（应全过），改到 agent 相关代码时再按 `docs/epics/agent-design/eval/README.md` 跑离线用例。
