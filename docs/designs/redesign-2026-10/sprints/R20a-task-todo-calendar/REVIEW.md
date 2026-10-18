# R20a 独立复核（RD-25）

**结论：请求修正，R20a 尚不能收口。** 已按提交信息和 REPORT 所列提交核对 `origin/redesign`；本次保持只读，未重跑全量或像素门禁。REPORT 对多项未完成工作有如实标注，但 SC-09、SC-10、SC-14 仍有代码断点。SC-01 只有预检；SC-05～08、11、13 有局部实现和定向测试；SC-15 尚无通过结果。SC-16 的“自身新失败 0”只得到失败名称归属比较支持：两端全量均为 exit 1，且部分比较使用不同数据库配置或源码时点，不能据此认定全量通过。

## S

- **S1｜Web 任务编辑断链（SC-09/14）。** `repos/orbits/app/(app)/app/orbit-2026/todo/TaskListWorkspace.tsx:100` 的“编辑”链接指向旧详情；`repos/orbits/app/(app)/app/tasks/[id]/page.tsx:10` 又重定向回当前列表，没有编辑状态。恢复有保存、取消和 CAS 校验的编辑入口，再退役旧详情。
- **S2｜App 日历缺面谈来源（SC-10/11、离线）。** `repos/orbit-app/src/screens/calendar/CalendarScreen.tsx:40-49` 只合成任务、活动、个人予定；`src/screens/schedule/schedule-calendar-source.ts:20-29` 的同步集合也不含面谈。投影测试手工注入面谈，不能证明实际到达。接入按账号和日期窗口读取的面談来源；若要求离线显示，还需定义相应副本及失效规则。

## M

- **M1｜未知跟进类型被当作普通任务。** `repos/orbits/shared/api-schema/todo-page.ts:31-34` 将未知 `kind` 回退为 `task`，测试也固定了这一行为；App `src/screens/todo/TodoScreen.tsx:344-363` 据此开放完成操作。按 README 规则 10，决定操作类别的未知值应跳过整条。
- **M2｜分页不能保证全局过期优先。** `repos/orbits/features/tasks/task-page.ts:108-116` 按原始日期字符串分页，`app/(app)/app/orbit-2026/todo/task-list-groups.ts:9-25` 才按本地时区分组。跨页可出现今日任务先于过期任务。统一服务端本地日分类、排序和游标，并补跨页测试。
- **M3｜OAuth 失败响应可能暴露内部信息。** `repos/orbits/app/api/integrations/[provider]/callback/handler.ts:147-156` 直接返回异常 `message`。改为固定公开错误文案；`returnTo` 的签名白名单及会话绑定检查可保留。
- **M4｜App 任务页仍拒绝响应新增字段。** `repos/orbit-app/src/api/schema/task-page.ts:21-31` 的响应 schema 使用 `.strict()`，与规则 10 的宽进冲突。移除响应侧严格校验，保留请求侧严格校验并加兼容测试。

## m

- `repos/orbit-app/app/_layout.tsx:97-106` 被 R20a 提交修改，但不在 PLANNER §1 导航壳允许路径中；REPORT 未列明确例外。请主会话补批准或交接记录。`tests/app-wide-route-coverage.test.ts:107-112` 仍把已删除的 Today、Followups 屏登记为实际 consumer，应更新清单。

## 核实通过项

SC-03 的 `deferralCount` 已进入任务读取、同步投影及 App mirror；To-do 请求校验、签名游标和来源隔离有代码及定向测试。OAuth `returnTo` 限于 calendar/settings；新 To-do 与外部日历读取日志未见记录任意异常消息或行数据。旧 Today 屏已删除，`/today` 私有跳转保留。组件库、token 和共用 follow-up 判定文件在所查 R20a 变更中未见越线修改。