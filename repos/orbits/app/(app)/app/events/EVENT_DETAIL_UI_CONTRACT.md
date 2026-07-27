# 活动详情页 UI 合约

Sprint 95 恢复 `/app/events/[id]` 的活动详情层级，目标页面是
`/app/events/event_001`。页面必须先展示活动本身，再展示 Orbit 的关系判断，
不能退化成只剩折叠证据或失败卡片的布局。

## 恢复后的页面层级

成功状态必须保留这些可见区域：

- hero：活动封面、返回入口、状态与活动 code。
- schedule：日期、时间、地点与地址。
- relationship priority：第一优先认识的人、第一动作、来源上下文与渲染期无副作用标记。
- registration action：可报名活动显示 `/app/register?code=EVENT001` 入口；已报名活动显示已报名状态。
- attendee context：参会者名单或报名后可见提示。
- supporting details：关系上下文、推荐认识的人、readiness、来源保护摘要。

移动端必须保留 hero、摘要和底部报名动作，并为固定底部动作留出
`data-event-detail-overlap-guard="fixed-mobile-cta-space"`，避免内容被 CTA 遮挡。
事件详情 presenter 还必须暴露
`data-event-detail-overflow-guard="viewport-constrained"` 和
`data-event-detail-layout-contract="fixed-cta-reserved-space"`。固定底部报名动作必须暴露
`data-event-detail-mobile-cta="fixed-bottom"`，并在 640px 以下用
`max-width: 100vw`、`overflow-x: clip`、`padding: 0 16px 104px`、CTA
按钮 `min-width: 0` 与 `white-space: normal` 约束布局，防止 375px
宽移动端出现横向滚动或按钮遮挡正文。

## Route View Model 边界

`/app/events/[id]` 的公开目录详情不要求登录。登录态只用于叠加当前账户对该
活动的报名记录；报名动作进入 `/app/events/[id]/register`，真实请求在没有
session 时跳转登录，并保留精确回跳地址。未知活动或账户私有活动继续进入原有
受保护的 owner-scoped fallback，不能因为公开目录存在而越权读取其他账户数据。

参会者名单属于报名后数据。页面服务端在当前账户没有该活动的 active
registration 时必须把 `stats.attendees` 收敛为空，只保留公开人数统计；不能先把
姓名发送到浏览器再用遮罩、折叠或 CSS 隐藏。活动已结束也不自动放宽权限。

`loadAppEventDetailRoute()` 仍返回原有 `success | empty | pending | failure`
形状。`event_001` 使用 event detail record 作为 canonical event；在 live
provider 为该推荐活动补齐 roster、recommendation、readiness、want-connect、
encounter note 和 post-event review 前，关系上下文暂时复用 `demo-event-1`
的同构 capability payload。页面通过 route-owned mapper 转换成 presenter
view model，React presenter 不读取 feature DTO、fixture 或 provider。

当 `/app/events/event_001` 没有显式 `mode` query 时，页面 route adapter 固定读取
本地确定性活动工作区。这里的“live 默认 runtime”只表示 harness 进程环境
`ORBIT_MODULE_MODE=live`；它不是 live provider 读取。显式 `?mode=live`
才进入 live provider，并在缺少 live store 配置时返回 failure boundary。这个规则避免
把未配置 live provider 静默回退成 mock，同时保证 canonical 推荐活动在未显式选择
provider 时仍能展示恢复后的详情层级。

`event_002` 尚未在 `features/events/event-crud-and-import` 中拥有 canonical
event detail record，因此保持 controlled failure boundary，不伪造产品详情。

## Mock-to-Live 替换

Live service/provider 文件保持在既有边界：

- `features/events/event-crud-and-import/live-service.ts`
- `features/events/event-crud-and-import/providers/storage-event-provider.ts`
- `features/events/attendee-roster/live-service.ts`
- `features/events/attendee-roster/storage/generated-attendee-roster-live-record-provider.ts`
- `features/recommendations/live-service.ts`
- `features/recommendations/storage/event-recommendation-live-record-provider.ts`
- `features/events/goal-readiness/live-service.ts`
- `features/events/goal-readiness/storage/generated-goal-readiness-live-record-provider.ts`
- `features/events/want-connect/live-service.ts`
- `features/events/want-connect/storage/generated-want-connect-live-record-provider.ts`
- `features/events/encounter-note/live-service.ts`
- `features/events/post-event-review/live-service.ts`

`ORBIT_MODULE_MODE` 继续选择 mock、hybrid、live。远程 live store 需要
`ORBIT_EVENT_DATABASE_URL`、`ORBIT_LIVE_DATABASE_URL` 或 `ORBIT_DATABASE_URL`；
缺失配置必须返回可见 failure evidence，不得回退到未声明 provider。

## 隐私与副作用

页面 render 只能读取上下文。它不得发送消息、投递通知、写日历、写联系人、
调用 AI provider、请求外部网络或静默执行票务/支付。`want-to-connect` 只有在
显式 action 路径中才允许 storage-only live intent；普通页面渲染显示
`data-side-effects="none"`。

活动时间和地点只来自 canonical event detail record。其他 capability payload
若携带旧活动 logistics，只能进入 source consistency 摘要，不能覆盖页面主时间、
主地点或报名入口。

公开目录使用稳定且唯一的 event code。长 source id 必须通过保留可读前缀并附加
稳定 hash 的方式生成 code，禁止简单截断造成多个活动指向同一详情。所有登录入口
都必须回到 `/app/events/[id]` 或 `/app/events/[id]/register` 的完整 app 路径。

## 回归测试

Sprint 95 的防回归测试是：

- `tests/pages/app-event-detail-live-route-services.test.ts`
  - 证明 `event_001` 组合为 success，canonical event 保持 `event_001`，
    关系 capability payload 仍保留来源 evidence，且页面 render 不写日历、
    不发消息、不通知、不调用 AI 或外部网络。
  - 证明 success route model 经 route-owned adapter 转成 presenter view model 后，
    仍保留 canonical event、报名 code、attendee、agenda、relationship context、
    readiness、source consistency 与 no-write side-effect shape。
  - 证明 `empty`、`pending`、`failure` 和非 canonical event boundary 继续返回
    原有 routeState、title、evidence 与 recovery action，不退化成折叠详情壳。
- `tests/pages/app-event-detail-page.test.tsx`
  - 证明桌面详情包含 hero、schedule、relationship priority、registration
    action、attendee context 和 supporting details。
  - 证明未带 `mode` query 的 `/app/events/event_001` 在 live 默认 runtime 下仍展示
    本地确定性 restored hierarchy，而不是 live-store failure boundary；显式
    `?mode=live` 的 failure boundary 由 route service 测试覆盖。
  - 证明移动端 hero、summary、registration actions 可达，且没有 hidden、
    `data-collapsed="true"`、默认折叠详情或缺失 viewport overflow guard；同时断言
    640px 以下布局、固定底部 CTA 和 reserved space 合约，防止 375px 宽移动端
    横向溢出或 CTA 遮挡。
  - 证明 `/app/events/event_002` 仍是 controlled boundary，而不是伪造的折叠详情页。
  - 证明公开详情不需要 session、未报名时服务端不序列化 attendee、已结束活动
    不绕过名单权限，登录后返回精确活动路径。
