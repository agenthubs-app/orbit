# R21 收口后独立复核

**结论：需修正，不能按完整 R21 验收。** REPORT 对像素、全量测试和 A/B/D 依赖均如实列为未完成；但 App 离线回执另有一处会让历史记录消失的缺陷。复核以 `origin/redesign` 为准，仓库保持只读。

## 问题

- **S｜离线 PATCH 成功后，会话可能从 App 历史消失。** `repos/orbit-app/src/data/sync/ai-session-outbox-upload.ts:62` 把顶层 `pinned`、`customTitle` 写入镜像；`src/view-models/ai-sessions-local.ts:18` 仅去掉 `messageCount`，随后用严格 schema 解析并跳过失败项。现有上传测试只检查回执字段，未检查重新渲染。**修法：**回执只更新 `organization`，增加「上传 ACK → 镜像读取 → 历史仍可见」测试。

- **M｜在线全文搜索失败时静默显示不完整结果。** `repos/orbit-app/src/screens/ai/AiScreen.tsx:305` 在服务端搜索未成功时退回只含摘要的本地镜像；`:227`、`:398` 又不会显示该次搜索失败。用户可能把正文命中缺席理解为“无结果”。**修法：**在线搜索失败时显示错误与重试；只在明确离线时显示标旧的镜像结果。

- **M｜App 会话列表响应仍不符合规则 10 的宽进要求。** `repos/orbit-app/src/api/schema/ai-session-page.ts:23`、`:35` 对响应使用 `.strict()`，新增响应字段会使整页失败。**修法：**读取 schema 丢弃额外字段，列表逐项跳过坏记录；保留请求端严格校验。

- **M｜离线删除的版本前提未传到服务端。** `repos/orbit-app/src/data/sync/ai-session-outbox-upload.ts:37` 发无条件 DELETE，虽在队列中保存 `expectedRevision`，另一设备的并发修改仍可被删除。REPORT 已披露此限制。**修法：**补 DELETE 的版本 CAS 与冲突回执，或由主会话明确批准删除优先语义，并继续将跨设备 SC-04 标为未验。

- **m｜「自身新失败 0」尚不能证实。** `docs/designs/redesign-2026-10/sprints/R21-iorbit/REPORT.md:17` 说明 rebase 后只跑定向测试和类型检查；所列两端全量日志均早于该基底且 exit 1。**修法：**在当前基底重跑全量并与同基底对照，再写零新增失败结论。

## 核实通过与边界

共享契约改动为增量；`pageContext` 有服务端 actor 校验与筛选白名单，OAuth 登录 `next` 为固定路径。置顶上限、90 日清理、本人会话搜索有代码和定向证据。未见 R21 改动组件库、token 或导航壳源码；旧入口仍有路由测试。SC-06 的真流式、SC-10 的完整删旧屏、SC-11/12 的 inbox 四格，以及 SC-13/14 像素门禁仍未完成。