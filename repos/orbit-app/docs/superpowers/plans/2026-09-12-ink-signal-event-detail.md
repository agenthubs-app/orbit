# Ink & Signal 活动详情 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans。沿用已批准的 ZIP 视觉目标、自身功能优先、原地执行及不提交／推送／部署边界；本批实施 2a-活动详情，不扩张后端能力。

**Goal:** 实际 `/events/[id]` 按选定详情稿显示信息层级和固定报名入口，保持真实报名、参会者、现场、会前及会后能力。

**Architecture:** 保留本屏与既有 HTTP client／view-model，使用页内 SafeAreaView、48pt 导航和 ScrollView，底部独立报名容器自然占位。路由 readiness／focus／身份／服务器／eventId 形成隔离作用域；页面消费端校验公开及个人响应，不改共享生成文件。

**Tech Stack:** Expo Router、React Native、Ionicons、Zod、Node/RNW 真实路由渲染测试。

**Spec:** `docs/designs/2026-09-12-ink-signal/design_handoff_orbit_ink_signal/screenshots/2a-活动详情.png` 与 `Orbit 改版方向.dc.html` 第 222–242 行；功能优先级见设计目录 README。源 PNG 和 HTML 已实际打开。

## 全局约束与数据映射

- 基线：活动主屏批次 1659/1659、typecheck8、diff check 通过。HEAD `8b38b4eb8618505ca4f59f20dc323159e1ad784b` 加未提交 App 工作；保留所有既有修改。
- 48pt 页头，16pt inset，96pt／12pt 圆角真实封面，左下 11pt 状态；封面下 24pt/900 标题、13pt 主办方和真实人数；日期／时间／地点／主办方四格；15pt/800 分段标题、14pt/22 正文；当天安排时间轴；参会者列表行；底部提示与至少 50pt 黑色报名按钮。
- 热区至少 44pt；320pt／大字号不裁切，不禁用系统字号。平板内容限宽；保留深色行为。系统安全区由运行时提供，不画手机边框／时钟。
- 公开 GET `/api/events/public/[id]` 当前返回 `{ event: EventRecord + organizer }`。路由允许公共代码和别名，响应 ID 是规范 event ID，后续报名／参会者／现场／个性化请求均使用规范 ID；不能强制响应 ID 等于别名。
- 日期和时间由真实 startsAt／endsAt 按现有东京时间语义投影。公开源未返回报名人数、详细议程、个人已报名状态或可导航 organizerId 时，保留待确认提示／现有开始时间，不复制设计样例；主办方只读，不伪造链接。
- 图片沿用实际 coverPath／既有解析，图片本身不是源稿示意渐变。分享按钮调用原生 Share，仅分享当前已校验的标题、时间、地点文本；不发网络写入、不含登录信息，不虚构公开 URL，取消不宣称分享成功。
- 报名按钮仅进入已有注册流程，不代替注册／问答／资格检查；参会者和现场目的页仍实施现有权限。费用、来源证据、会前重点、个人模块和下一步都保留在主要公开信息之后。
- 公共表单／状态不因未登录消失。仅 ready 且 focused 时挂载；scope 变化撤销请求和旧回调，迟到 401 不退出新会话。
- 各函数修改前 GitNexus impact；详情组件 LOW，页内 useStyles MEDIUM（11 直接、13 总计、0 已索引流程），已告知。路由导出未被图谱追踪，实际路由测试补足，未索引不解释为零风险。
- 只改 App；不新增依赖、Web／数据库写入或共享同步白名单。QA 存于设计目录，原生与同账号跨端联验未做不得标为通过。

## Task 1 · 公开详情、布局与入口

**Files:** 修改 `app/events/[id].tsx`、`src/screens/events/EventDetailScreen.tsx`；新增 `tests/ink-signal-event-detail.test.ts`；仅更新 `tests/app-wide-events.test.ts`、`tests/event-detail-screen-source.test.ts` 过时外观断言和完整协议夹具。

- [x] 写实际 route＋hooks＋client 的失败测试：固定底部报名、标题在 96pt 图片后、四格日期和时间、当天安排、参会者与现场入口、无主底栏。真实规范 ID 导航，挂载／阅读／分享不报名。
- [x] 运行 `node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/ink-signal-event-detail.test.ts`，确认新布局／边界失败源于当前生产代码。
- [x] 路由按 `focused && auth.ready && server.ready` 挂载，scope 还覆盖 `id, signedIn, user.id, cookieHeader, baseUrl`。屏幕 GET opt-in scope；校验 `{event}`、ID／标题／合法起止日期及消费的可选字段。不完整 2xx 展示重试，不渲染 Event 默认记录。
- [x] 实现批准布局；介绍和时间轴展开真实内容，字段缺失明确提示；四格在大字号或窄屏变单列。分享使用同步锁，取消无成功提示、失败可重试。报名 footer 与 ScrollView 分开，最后一项滚动可达。
- [x] 保留公开／访客、真实退回历史或 `/events`、报名／参会者／现场路径，以及费用／来源／准备／下一步。校验未 ready／失焦、身份／cookie／server／id／卸载迟到读取和旧导航无副作用。
- [x] 定向测试和类型检查通过后进入 Task 2；修复相关旧测试夹具，不放宽生产校验来让旧夹具通过。

```ts
const cover = await page.getByTestId("event-detail-cover").boundingBox();
const title = await page.getByRole("heading", { name: "周末产品交流会" }).boundingBox();
assert.equal(cover?.height, 96);
assert.ok(title && cover && title.y >= cover.y + cover.height);
await page.getByRole("button", { name: "报名参加", exact: true }).click();
assert.deepEqual(await page.evaluate(() => window.fixture.navigation), ["/events/event%3A1/register"]);
assert.deepEqual(await writes(page), []);
```

## Task 2 · 个人准备及会后复核

**Files:** 本屏 `AuthenticatedEventDetailModules`、`EventReadinessModule`、`EventRecommendationsModule`、`EventPostEventReviewModule`；同一真实路由测试文件。消费端 Schema 如规模需要可单列 `src/api/event-detail-contract.ts`，但不抽取整个页面或修改通用 hook。

- [x] 先核对实际 GET 与三项写入的 Web handler／contract，写完整 HTTP 夹具；测试 loading、empty、pending、failure 可见且分别重试，不阻塞公开详情。
- [x] 测试当前正常动作：建议目标／编辑／PUT 确认、推荐人物／POST 换一句、会后候选／POST 确认与复核队列导航；挂载和重试仅 GET。失败保留目标草稿，刷新不覆盖正在编辑的草稿。
- [x] 对这三个操作写同步双击、坏 2xx／不匹配 ID／未确认状态／非 2xx、scope 或刷新变化的迟到结果与 401 失败测试；不能凭 `success:true` 伪造确认，回执需满足真实服务协议。
- [x] 使用已 opt-in 的 client 和局部 AbortController／同步锁；每个私有读取有 scope，成功与失败反馈只归当前活动／账号。页面刷新与卸载撤销旧请求；保留每种现有能力，不引入新的后端动作。
- [x] 运行个人行为与旧准备 view-model／screen 测试；有重要问题先修复再继续验收。

```ts
await page.getByRole("textbox", { name: "自定义活动目标" }).fill("认识两位产品负责人");
await page.getByRole("button", { name: "确认目标", exact: true }).click();
assert.equal((await writes(page))[0]?.method, "PUT");
// 正确回执前不得出现“活动目标已确认”；失败后输入仍为用户草稿。
assert.equal(await page.getByText("活动目标已确认。", { exact: true }).count(), 0);
```

## Task 3 · 成对视觉 QA 与验收

- [x] 同状态 390×844／2× 源稿和最新实际截图一起打开；核对字号／层级／图片／间距／线条／footer。320pt＋1.6 字号、820pt、深色、公开失败、个人失败和长文本逐一检查，确认最后内容与所有主动作可达。
- [x] 保存 `docs/designs/2026-09-12-ink-signal/2026-09-12-event-detail-qa.md`；修复 P0/P1/P2 并重新成对查看，P3 只记后续。不把未提供数据或原生依赖问题声称完成。
- [x] 运行新测试＋`tests/app-wide-events.test.ts`＋`tests/event-detail-screen-source.test.ts`＋`tests/event-preparation-view-model.test.ts`，随后 `npm run typecheck`、`npm test`、`git diff --check` 和独立只读复审。
- [x] 更新总 README 与计划实际证据。本批完成后继续剩余已选屏幕，未经全包审计不关闭整体目标。

## 本批完成证据

2026-09-12：定向 195/195（target6），全量 1803/1803（full4）、typecheck11、diff check 均通过；最终独立只读复审 APPROVE，0 Critical／Important／Minor。源图与最新 round8 实际渲染同输入对照通过，QA 报告已更新。新增 144 项真实交互回归。后续个人页测试在 full4 启动后加入，不计入本批的 1803 基线。未提交／推送／部署，原生和真实账号跨端验收仍未完成；整包目标保持进行中。
