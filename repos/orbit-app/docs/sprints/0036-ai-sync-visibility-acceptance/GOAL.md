# Sprint 0036 — AI 同步可见性与全链验收

## 要实现什么

让 Orbit AI 在读取笔记、待办、已确认跟进和日程时明确说明数据来自云端权威记录及其新鲜度，并用完整跨端验收和数据地图证明：哪些数据能被 AI 看到、哪些正在本机等待同步、哪些永远不可见。

## 做完能看到什么

- AI 查询四个领域时返回来源、读取时间、record revision、截断/续页状态；不能把旧 revision 或局部结果说成“全部最新数据”。
- App 有本地待同步内容时，在 AI 输入区/结果附近明确提示“仅本机，AI 暂不可见”；同步完成后提示消失，AI 可读到新 revision。
- 换账号、清 App、重装、丢 realtime 消息、制造冲突后，Web/App/AI 的权威边界仍一致且没有跨账号泄漏。
- 数据审查文档和私有交互式 Data Atlas 更新为当前实现，展示数据原型、存储、外部接口、同步状态、AI 函数覆盖和剩余问题。

## 怎么验收

以 AI query/manifest/artifact 测试覆盖四域 freshness、actor isolation、field allowlist、截断与 prompt injection，再以同账号 production Web/API、iOS Simulator 和真实可用 AI provider 做同步前后回读。最后执行受影响端全量验证，更新并发布私有 Data Atlas；实现、报告和站点来源提交并合并回 `chat-agent`。

完整范围见 [DESIGN.md](DESIGN.md) 与 [PLANNER.md](PLANNER.md)。本页不表示已经实现；状态以执行后的 `REPORT.md` 和主线合并验证为准。
