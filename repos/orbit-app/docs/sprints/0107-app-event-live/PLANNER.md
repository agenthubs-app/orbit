# Sprint 0107 — App 活动现场页（设计案 → 实现）

**Plan revision:** 2（2026-09-27：记录设计稿批准与已定设计；验收标准不变）。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** 用户 2026-09-27 决定：网页 `/events/[id]/live` 补到 App。
**单一目标:** App 有与网页等价的活动现场页，已报名参会者可在手机上完成现场操作。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 0106 合并后的 `chat-agent`（开工时追加提交号；若 0106 因等待设计批准而延后，本 Sprint 可在 0105 之后先行，但两者都改路由覆盖清单，须串行合并）。
**进入条件:** 设计案经用户批准（SC-0107-01）——**已满足**：2026-09-27 用户批准设计稿（原话「可以的，按照你现在推荐去做」），画布 https://claude.ai/artifact/B856DzzuzxbjT5y1kVSNfQ，本地副本 `docs/designs/2026-09-27-app-onboarding-live/`（含视觉规范 README）。

## 已查明的事实（2026-09-27）

- 网页：`repos/orbits/app/(app)/app/events/[id]/live/page.tsx`（取代 `/app/party*`；无会话跳登录；经 `createConfiguredEventCoreService().getEvent` 解析正式活动编号；加载 `loadAppPartyRouteViewModel`；`?tab` 决定初始分区）。组件 `events-0918/event-live.tsx`，分区 `home`（含签到）、`rec`（为你推荐）、`all`（全部参会者）、`group`（桌位与轮次）、`graph`、`agenda`（`events-model.ts:221-228`）。
- 加载器 `party-route-view-model.ts:575+` → `createConfiguredEventOperationsService().attendeeWorkspace({actorId, eventId})`（`features/events/event-operations/service.ts:395-410`，`requireRegistered`，否则 `EVENT_OPERATIONS_FORBIDDEN`）+ `loadEventForRegistration`。只面向已报名参会者。
- 现场操作接口（`events-0918/live-controls.ts`）：`POST /api/events/{id}/operations/check-in`、`…/operations/contact-requests`、`…/contact-requests/{rid}/respond`、`…/withdraw`；笔记 `POST /api/encounters`；约时间 `GET/POST /api/appointments`、`POST /api/appointments/{id}/commands`。
- App 现状：没有 live 路由。最接近的是 `AttendeeOperationsScreen`（`/events/[id]/attendees`，「参会者与名片交换」，同一个 attendee workspace：我与签到、推荐、名录、座位、交换名片）；旧的 `PartyModeScreen`（`/party`、`/party/checkin`、`/party/graph`，947 行，走旧接口 `/api/events/:id`、`/attendees`、`/matches`）。App 活动路由与接口清单见 `src/data/offline-read/route-domain-inventory.ts:241-317`。
- 议程：服务端没有任何代码产生议程数据（开发库 16 场活动均无 agenda），网页的议程分区在无数据时的表现需在设计案中确认，App 不得编造。
- 新增原生路由须登记到 `tests/app-wide-route-coverage.test.ts` 与 `docs/designs/2026-09-08-app-wide-style/README.md` 路由表。

## 设计案必须回答（SC-0107-01）

1. 页面结构：6 个分区在手机上的组织方式（顶部分段/底部标签），与网页逐项对照。
2. 与现有 `AttendeeOperationsScreen` 的关系：新页面复用其内容组件还是替换它；`/events/[id]/attendees` 保留为入口还是指向现场页。
3. 旧派对模式 `/party*`：保留、指向现场页，还是删除（网页已用 live 取代 party）。
4. 入口：活动详情页何时显示「现场」按钮（报名后、活动当天、签到开放窗口内？）。
5. 议程无数据时的显示；关系图在手机上的简化方案。

## 设计引用

- 在线画布（私有，需登录）：https://claude.ai/artifact/B856DzzuzxbjT5y1kVSNfQ
- 本地副本与视觉规范：[设计目录 README](../../../../../docs/designs/2026-09-27-app-onboarding-live/README.md)（视觉数值来源：[`controls.ts`](../../../src/design/controls.ts)、[`tokens.ts`](../../../src/design/tokens.ts)）
- 画布索引：[canvas.json](../../../../../docs/designs/2026-09-27-app-onboarding-live/canvas.json)

| 画板 | 内容 | 源文件 |
| --- | --- | --- |
| `LiveEntry` | 活动详情入口 | [LiveEntry.dc.html](../../../../../docs/designs/2026-09-27-app-onboarding-live/LiveEntry.dc.html) |
| `LiveHome` | 现场首页 | [LiveHome.dc.html](../../../../../docs/designs/2026-09-27-app-onboarding-live/LiveHome.dc.html) |
| `LiveRec` | 为你推荐 | [LiveRec.dc.html](../../../../../docs/designs/2026-09-27-app-onboarding-live/LiveRec.dc.html) |
| `LiveAll` | 全部参会者 | [LiveAll.dc.html](../../../../../docs/designs/2026-09-27-app-onboarding-live/LiveAll.dc.html) |
| `LiveGroup` | 我的分组 | [LiveGroup.dc.html](../../../../../docs/designs/2026-09-27-app-onboarding-live/LiveGroup.dc.html) |
| `LivePerson` | 对方资料与操作面板 | [LivePerson.dc.html](../../../../../docs/designs/2026-09-27-app-onboarding-live/LivePerson.dc.html) |
| `LiveAgenda` | 议程与关系图 | [LiveAgenda.dc.html](../../../../../docs/designs/2026-09-27-app-onboarding-live/LiveAgenda.dc.html) |
| `LiveDenied` | 未报名 / 断网 / 结果未发布 / 不在签到时间 | [LiveDenied.dc.html](../../../../../docs/designs/2026-09-27-app-onboarding-live/LiveDenied.dc.html) |

## 已批准的设计（revision 2）

实施以设计稿画板为准：`LiveEntry`、`LiveHome`、`LiveRec`、`LiveAll`、`LiveGroup`、`LivePerson`、`LiveAgenda`、`LiveDenied`。视觉数值取自 `controls.ts`、`tokens.ts`（见设计目录 README）。

1. **结构**：顶部依次是返回链接「活动详情」、绿色「现场」标记、活动名称；下方文字标签页「首页 / 推荐 / 参会者 / 分组 / 议程」，样式与活动页的 `catalogueTabs` 相同。
   - **首页**：「你现在的位置」用超大字号写「N 号桌」，旁边是轮次和人数，下面是签到状态、「推荐给你」前 3 人（分隔线列表），以及「关系图谱」入口行。
   - **关系图**：放在「议程」页下半部分，简化为以「我」为中心的一层关系；完整图谱留在网页。
2. **对方资料**：做成底部弹出面板（`LivePerson`）。
   - 上半部分是信息行：共同兴趣、位置、名片状态。
   - 下面是黑色主按钮「申请交换名片」，再下面并排两个描边按钮「记一条笔记」「约个时间」。
   - 申请后按钮变为「已申请 · 撤回」；对方发起时显示「接受 / 忽略」。
3. **与现有「参会者与名片交换」页的关系**：现场页取代 `AttendeeOperationsScreen`。旧地址 `/events/[id]/attendees` 跳转到现场页的「参会者」标签；`/events/[id]/participants/[pid]` 打开对方资料面板。
4. **旧派对模式 `/party*`**：删除 `PartyModeScreen` 与旧接口调用。旧路由改为跳转：能确定活动时跳到该活动的现场页，否则跳到活动列表，避免旧链接失效。
5. **入口**：报名成功后，活动详情里出现「进入现场」。活动当天，这张入口卡片置顶显示，用 `liveSoft` 底色，写明「活动进行中 · 签到已开放」，按钮是黑色主按钮。未报名的用户看不到入口；若直接打开现场地址，按 `LiveDenied` 显示提示。
6. **议程**：没有数据时显示空状态「还没有发布议程」，不编造内容。
7. **其他状态**：按 `LiveDenied` 处理。「结果尚未开放」和「不在签到时间内」本 Sprint 实现；断网提示条的样式在本 Sprint 定好，离线数据由 0115 接入。

## 范围与文件（批准后）

- 修改/新建：App `app/events/[id]/live.tsx` 及对应屏幕与视图模型；活动详情入口；按设计案处理 `attendees` 与 `/party*`；路由覆盖清单与 README 路由表；三语文案。
- 排除：服务端接口改动（全部复用；若确需新接口，停下报告）；离线能力（0115）；网页端改动。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0107-01 | 设计案（artifact）经用户明确批准，含上面 5 个问题的答案 | 批准记录 |
| SC-0107-02 | 已报名账号在 App 进入现场页，各分区内容与网页同一活动一致、界面与设计稿画板一致；`/events/[id]/attendees` 与 `/party*` 按设计跳转 | 同账号双端截图/数据对照 + 截图与画板并排对照 + 路由测试 |
| SC-0107-03 | 签到、发起/回应/撤回交换名片、记相遇笔记、约时间在 App 完成，网页回读到同一结果 | 真实 HTTP + 跨端回读 |
| SC-0107-04 | 未报名账号无法进入，显示明确提示；接口 403 不被吞掉 | App 测试 + 运行时 |
| SC-0107-05 | route-parity 不再报 `/events/[id]/live`；若 0106 已合并则整条测试转绿（缺失列表为空）；路由覆盖清单与 README 同步；两端全量、typecheck 通过 | 摘要 |

## 测试

- 档位 H（写操作 + 多个屏幕）。开发集：现场页视图模型、各操作的 App 测试（真实路由夹具）；收口：App 全量一次，orbits 未改则复用。
- 运行时：本地生产构建 + phoneweb + Simulator；准备一场有已发布座位/推荐的测试活动（本地库造数，用后清理或在报告中列出）。

## 失败与交接

设计案未批准则保持 planned。报告写明 `/party*` 与 `attendees` 的处理结果、测试活动数据的清理情况，以及给 0115 的接口清单（现场页离线需要哪些数据）。
