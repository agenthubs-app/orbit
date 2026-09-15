# BR-018 — 笔记来源待办建议

- 创建/更新日期：2026-09-15
- 总状态：verified
- 优先级：P1
- 发起角色：Bridge
- 下一责任方及是否已接单：本交接已完成；Sprint 0019 的全范围收口由各前序 Sprint 继续承担
- web_status：source_ready
- app_status：consumer_ready
- verification_status：同一 live Web/API、隔离 PostgreSQL、同账号 Web/App、原生 iOS Simulator 已验证预填、零自动写入、建议接受、幂等、返回来源与日期确认
- 依赖/阻塞：本交接无；Sprint 0019 的 SC-0019-05 仍依赖 R-00～R-14 的其他前序 Sprint 关闭
- 设计/实现/发布授权来源（如适用）：用户 2026-09-15 连续实施指令；Sprint 0019 `APPROVED_SCOPE_ADDENDUM.md`

## 变化与证据

- 用户可见行为：笔记详情的“从这篇笔记整理待办”进入 IORBIT 并预填模板；发送前不生成，发送后显示来源建议，日期含糊时先要求补充；接受后笔记和事项可以互相返回。
- Web 服务/HTTP：`features/orbit-ai/task-interaction-service.ts`、`features/tasks/suggestion-service.ts`；`POST /api/ai/conversations` 接受可选 `sourceNote`；现有 suggestion accept 路由重验来源版本并幂等创建事项。
- App 消费点：`/notes/:id`、`/ai/new`、`/tasks/:id`；现有首页、任务、日历和联系人投影继续读取同一 task。
- Web/App SHA：基线 `36bf8f5ca`；功能提交 `15685b18e8ba0b8b8c355306e27b7c72439b7469`。
- Schema 增量：task interaction、suggestion 与 task 新增可选 `sourceNoteId`／`sourceNoteVersion`；suggestion 保留完整 `relatedContactIds`；新增 `needs_date_confirmation` 状态。
- 请求、身份、幂等和版本：App 只发送 `{id, version}`，正文由服务端按 actor 读取；接受前重验版本；同一 suggestion 的接受键稳定，多联系人不复制事项。
- 失败处理：来源失效、保存失败和日期歧义均保留可编辑输入；旧作用域结果不能确认成功；已接受重复请求返回既有事项。
- 兼容策略：新增字段均为可选；旧非笔记 AI 请求维持既有直接创建／建议行为，不做数据库迁移或数据回填。

## 验收结果

- 本地：Web 定向 37/37、补充 12/12；App 受影响集 174/174、view-model 41/41、source 9/9；两端 typecheck 与契约同步通过。
- App 全量：最终 2590/2590，0 skip，exit 0；此前断言迁移和一次浏览器进程异常均保留日志与复验事实。
- Web 全量：3008 pass／52 fail／183 skip，exit 1；0019 新增测试通过，失败数量与 0018 基线相同。
- Web 写 → App 回读：live Web/API 的版本 2 来源笔记由原生 App 回读后进入 IORBIT；预填阶段任务数为 0。
- App 接受 → Web 回读：App 显式发送并接受后，Web API 回读唯一 task，source note ID/version、suggestion ID 和联系人一致；重复 accept 返回同一 task，任务总数仍为 1。
- 权限、版本、失败：原生 App 对含 `tomorrow` 的来源笔记显示“需要确认日期”，Web 任务总数不增加；既有自动化继续覆盖来源版本变化、错误回执与作用域变化。
- 原生 UI：iOS Simulator 中完成预填、显式发送、接受、任务详情及返回来源笔记；Next 生产 Web 和 App 原生构建均为本轮实际产物。
- 未检查范围：远程部署、实体 iOS 设备、外部日历／通知写入；本场景不要求这些副作用。
- 客观关闭条件：本 BR 条件已满足；Sprint 0019 的 R-00～R-14 总验收由 SC-0019-05 单独保持 blocked。

## 更新历史

- 2026-09-15 08:16 JST，Bridge：本地功能提交 `15685b18e`，App 全量通过；真实双向／原生和全范围关闭证据仍缺失。
- 2026-09-15 09:21 JST，Bridge：同账号原生 App 完成来源建议接受，Web 回读唯一事项并验证幂等；日期含糊时没有新增事项，App 可从任务返回来源笔记。BR-018 更新为 `verified`。
