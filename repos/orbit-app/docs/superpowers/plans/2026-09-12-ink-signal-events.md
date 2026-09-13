# Ink & Signal 活动主页面 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans。用户已批准整个 ZIP 的视觉目标、自身功能优先及原地执行；复用相同审批，不提交／推送／部署。本批是 1c-活动，2a-活动详情随后独立验收。

**Goal:** 将实际 `/events` 对齐已选活动列表，同时保留公开浏览、组合筛选、分页、活动跳转及真实推荐操作。

**Architecture:** 沿用 EventsScreen 和既有事件 view-model／HTTP client，按既有人脉主屏模式使用本页安全区、滚动布局与公共底栏。列表与推荐分别校验和恢复；只把现有推荐入口收进源稿的下划线标签，不新增报名集合 API。

**Tech Stack:** Expo Router、React Native／react-native-svg、Zod、Node/RNW 实际路由渲染测试。

**Spec:** `docs/designs/2026-09-12-ink-signal/design_handoff_orbit_ink_signal/screenshots/1c-活动.png` 和 `Orbit 改版方向.dc.html` 第 772–786 行，已实际打开；功能边界见本目录设计 README。

## 约束与映射

- 当前基线 1580/1580、typecheck 与 diff check 通过，分支 chat-agent，HEAD `8b38b4eb8618505ca4f59f20dc323159e1ad784b` 加 App 未提交工作。保留既有资料和 Web 进行中改动。
- 30pt/900 标题、16pt inset、42pt 搜索视觉、14pt 下划线标签、三个描边筛选、92×70pt 图片、15pt 活动标题、12pt 时间／地点／状态、14pt 行间距和浅分隔线；交互热区至少 44pt，大字号不裁剪。
- 仅公开集合 GET `/api/events/public`；它返回 EventRecord＋code／organizer，不返回当前用户的报名集合。不得把 `imported`／`confirmed` 当成“已报名”，也不逐条请求报名接口冒充集合。源标签映射为“推荐／全部”；缺失报名集合在 QA 记为功能差异。
- 时间筛选保留原 upcoming／active／ended／all，地点／主题与搜索组合、8 项渐进展开／收起保持原语义。默认“全部”标签＋“即将开始”时间筛选。
- 推荐使用现有 `/api/recommendations/events?limit=3` 和显式 `/api/recommendations/events/[id]/accept`；“记下推荐”不是报名，不发送日历／通知。访客看公开列表，推荐页提示登录；运营入口仍只给登录用户，目的页自行检查权限。
- 保留真实图片及原图片解析路径；没有真实图片时才使用源稿素材，不按设计样例给真实活动改名、造地点／计数。
- 只编辑 App、不修改共享生成副本、不添加依赖或后端能力。各既有符号编辑前 impact，HIGH／CRITICAL 告知用户。

## Task 1 · 公开目录与布局

**Files:** `app/(app)/events.tsx`、`src/screens/events/EventsScreen.tsx`；新增 `tests/ink-signal-events.test.ts`；按新布局更新 `tests/events-screen-source.test.ts`、`tests/app-wide-events.test.ts` 的过时外观期待。

- [x] 写实际路由失败测试：标题、顶栏运营入口、默认全部标签、三个筛选、92×70 图片、标题先于时间、分隔线与真实计数；挂载和筛选不写入。
- [x] 使用本页布局和公共 OrbitTabBar，保留 ScrollView 的键盘与刷新能力；三个筛选按钮展开对应真实选项，selected／expanded 可读。
- [x] 公共读取使用完整账号／Cookie／服务器／焦点作用域，访客不被要求先登录。根路由只在身份与服务器 ready 且 focused 时读取；旧回调不能导航。
- [x] App 消费端校验 events 数组与实际消费字段、重复 ID；坏 2xx、读取失败展示重试，合法空数组才显示暂无活动；不使用示例 Event 回退。
- [x] 行为测试验证搜索＋时间＋地点＋主题组合、清空、分页、直接活动 ID 导航、访客／未 ready／失焦和迟到读取。

```ts
await page.getByRole("button", { name: "筛选活动时间" }).click();
await page.getByRole("button", { name: "全部时间", exact: true }).click();
await page.getByPlaceholder("搜索活动、地点或主题").fill("产品");
assert.deepEqual(await writes(page), []);
```

## Task 2 · 推荐标签及确认边界

**Files:** 同一 EventsScreen 内 `AuthenticatedEventValueRecommendations`、`EventValueRecommendationsModule`、`acceptEventRecommendation`，以及新路由渲染测试。

- [x] 先写失败测试：全部标签不展示推荐卡，切到推荐才读取，访客显示登录入口；推荐 loading／pending／empty／失败有独立状态与重试，不影响公开目录。
- [x] 保留原建议、分数、查看、记下、下一步和去报名动作；列表筛选仍作用于推荐对应真实活动，不制造未知 eventId。
- [x] 记下推荐必须 2xx、state accepted、同一 eventId、有效分数和消费字段、action 安全布尔值齐全；残缺／pending／错 ID／非 2xx 不显示已记录。
- [x] 同步锁与 AbortSignal，切标签／筛选／刷新／账号／Cookie／服务器／焦点／卸载时撤销旧操作；取消迟到结果及 401，不丢当前搜索条件，不额外报名。

```ts
await press(page, "记下推荐");
assert.deepEqual(await writes(page), [{ method: "POST", path: "/api/recommendations/events/event%3A1/accept", body: null }]);
assert.equal(await page.getByText("已接受推荐：周末产品交流会").count(), 0); // 未收到有效确认
```

## Task 3 · 对照与验收

- [x] 定向运行 `node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/ink-signal-events.test.ts tests/events-screen-source.test.ts tests/event-value-recommendations-view-model.test.ts tests/app-wide-events.test.ts`。
- [x] 390×844／2× 实际列表图与源稿同输入对照，逐项核对字体、布局、颜色、图像、内容；320pt／1.6 字号、820pt、深色、过滤与失败图验证完整文本和控件可达。
- [x] `npm run typecheck`、`npm test`、`git diff --check`，独立只读复审。修复重要问题后重验；按实际证据更新 QA 和总 README。
- [x] 保留原生／真实账号联验未完成的标注；本批完成后继续活动详情，不将单屏完成替代整个 ZIP 目标。
