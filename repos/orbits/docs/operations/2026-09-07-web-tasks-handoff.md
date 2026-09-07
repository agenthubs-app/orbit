# Web 待办接入交接 — 2026-09-07

- 发起角色：Web；本端状态：consumer_ready（本地验证），真实双端业务验收未完成。
- 基线：外层仓库 `chat-agent`，`b70d286c2`；本端交付版本为包含本文件的提交。内层旧 Git 仓库不作为基线。
- 授权：用户要求补网页端接入，并明确委托按现有布局自行决定实现方案。未授权也未执行部署、推送或修改 App。
- 下一责任方：Bridge / 真实环境验证者，尚未接单。本任务不能写根目录 Bridge 台账，故在 Web 内提供交接。

## 用户可见变化

Today 保留日历、决策、安排，新增独立待办摘要。`/app/tasks` 支持新增、搜索、待办/已完成切换、完成/恢复和建议接受/忽略。`/app/tasks/[id]` 支持标题/备注编辑、确认删除、提醒设置/取消和历史。入口要求登录，编码 ID 在详情路由解码后交给现有 API。

仍使用 `/api/tasks`、`/api/tasks/:id`、`/api/tasks/:id/activities`、`/api/today`、`/api/task-suggestions` 及其 accept/dismiss、`/api/reminders` 与 cancel。共享 DTO、Schema、枚举、业务服务和数据库没有变化，不需 App 合约同步。

同一 actor 和 task ID 保持不变，编辑提交草稿基线的 `expectedUpdatedAt`。读取 no-store，手动刷新；不承诺实时跨端同步。成功写入后刷新失败保留成功反馈并显示读取错误；旧 GET 不能覆盖已保存数据。草稿遇到外部新版本时保留输入并要求显式载入新版。

写入失败重试在当前页面客户端内复用幂等键；成功或不同请求内容使用新键。幂等键不跨重载持久化。提醒只有「1 小时后」的 `in_app` 预设，不开启手机/Web Push；超时未确认的提醒给出返回列表后重新打开的恢复提示。日期/分类只读，现有备注不能清空时明确显示 API 限制。

提醒仍保存 App 兼容的 `/tasks/:id` deep link，Web 的 `toReminderAlerts` 映射为 `/app/tasks/:id`，同时保留旧提醒行为。GitNexus 对该修改报告 LOW、2 个直接调用方（首页和收件箱）、0 个登记执行流程；新待办模块尚未索引，不能将 UNKNOWN 当作零风险。

## 验证

环境：macOS、Node 25.8.1；cwd 为 Web 目录。不是 Node 22 生产构建验收。

```sh
node --import tsx --test tests/pages/web-tasks-*.test.* tests/api/tasks-routes.test.ts tests/api/today-route.test.ts tests/api/task-suggestion-routes.test.ts tests/api/reminder-plan-routes.test.ts tests/services/tasks-service.test.ts tests/services/today-service.test.ts tests/services/reminder-plan-service.test.ts tests/pages/app-today-*.test.* tests/pages/app-relationship-inbox-*.test.* tests/ui/orbit-button-ratchet.test.ts tests/ui/orbit-css-template-literals.test.ts
npm run typecheck
npm run typecheck:app
```

- 相关测试：exit 0，128 通过、0 失败、0 跳过。其中新测试 18 项，包含真实 tasks handler + 内存 TaskService，不是仅检查请求字符串。
- 两项类型检查：exit 0。
- 浏览器：`tests/pages/web-tasks.browser.mjs`，隔离临时 Next 预览，全部浏览器 API 流量使用夹具；1440px 与 390px 检查登录回跳、CRUD、建议接受、提醒设置/取消、Today 链接，无页面错误、无列表/详情横向溢出，exit 0。截图在临时目录，已人工检查。初次默认 Playwright 内核缺失，使用可配置的本机 Chrome 路径完成；未安装依赖或浏览器。移动完整截图回到页首后采集，避免固定导航因当前滚动位置出现在截图中段。
- 独立代码审查：四项 Important 均通过回归修复，无剩余 Critical/Important。过期提醒的恢复提示另有回归覆盖。
- 提交前 `gitnexus_detect_changes(scope: staged)`：23 文件、4 个索引触及符号、9 条 Today 关联流程，聚合风险 HIGH，已向用户报告并复核 context/diff。Today 实际仅新增 import 与摘要组件，未改任何聚合/降级函数；工具标出的相邻 `readRawParam`、`proactiveSurfaceHref` 没有源码修改。相关 Today / inbox 回归和浏览器覆盖通过。新增符号未索引的限制仍保留。
- 全量 `npm test`：exit 1，2,216 通过、20 失败、19 跳过。失败文件为 `tests/audits/{full-product-functional-audit,product-surface-manifest}.test.ts`、`tests/capabilities/{ai-email-draft-service,event-operations-seed,orbit-agent-gemini-live}.test.ts`、`tests/pages/{app-agent-contact-recommendations,app-contact-detail-live-route-services,app-demo-visual-assets,app-event-detail-live-route-services,app-events-live-route-services}.test.*`、`tests/ui/{auth-state-consistency,orbit-scale-ratchet,orbit-z-scale}.test.ts`。失败断言涉及现有审计证据、联系人/活动行为和样式白名单；没有修改这些模块。全量结果不代表当前仓库可发布。
- 全量运行先于最后一项提醒错误提示回归；最后 128 项和完整 typecheck 包含最终代码。

## 未验收项与关闭条件

- Web 写 → App 回读：未运行真实账号验证。
- App 写 → Web 回读：未运行真实账号验证；编辑冲突、干净/有草稿刷新和旧 GET 竞态已用可控夹具覆盖。
- 真机提醒送达、worker、生产数据库、Node 22 构建、远程部署：未运行。
- 英文浏览器完整流程、屏幕阅读器、真实键盘完整遍历：未运行；使用原生控件、标签与现有中英语言上下文。
- Bridge 关闭条件：同一环境、同一账号双向新增/修改/完成后刷新回读正确，通知点击定位同一 task，保留冲突和 actor 隔离；另按既有发布门槛处理全仓失败，不以此本地交付替代发布验收。
