# Ink & Signal 我的页面 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans。沿用用户已经批准的 ZIP 设计、自身功能优先、原地执行及不提交／推送／部署边界。本批只处理个人页，继续原有整包目标。

**Goal:** `/profile` 对齐 1c-我的，保留真实资料、编辑、文档提取与建议确认，所有统计有真实来源，失败不丢草稿。

**Architecture:** 继续使用现有 ProfileScreen 与 HTTP hooks；消费端协议校验单列在 `src/api/profile-detail-contract.ts`。页面内预览／编辑切换，草稿由编辑组件持有，刷新不重挂载草稿。路由会话作用域与操作撤销沿用活动详情的局部模式，不修改共享 hooks 或生成契约。

**Tech Stack:** Expo Router、React Native、Ionicons、Zod、Node＋RNW 真实路由／HTTP 渲染测试。

**Spec:** `docs/designs/2026-09-12-ink-signal/design_handoff_orbit_ink_signal/screenshots/1c-我的.png`，HTML 第 787–802 行；已实际打开源图和 HTML。自己的功能优先级见设计目录 README。

## 全局约束与映射

- 仅 App，保留 HEAD `8b38b4eb8618505ca4f59f20dc323159e1ad784b` 上全部未提交工作；不写 Web、数据库或共享生成文件，不安装依赖，不提交／推送／部署。
- 30pt/900 页标题，设置按钮至少 44pt 热区；16pt inset。72pt 头像、24pt/900 姓名、13pt 职位／公司、12pt 地点，20pt 分段距离。使用实际身份头像（若有）或现有姓名首字母，不复制样例人物。
- 三列统计 26pt/800 数字、11pt 说明和横竖分隔；正常 76pt 高，大字号允许增加。基本资料四行：行业／公司／职位／简介，14pt 内容、72pt 标签列，简介 22pt 行高。三类标签按源稿混排，提供为黑底，其余描边；组别保留可访问名称。
- 设置进入 `/settings`，账号行进入 `/account`；沿用五入口底栏，编辑后可返回预览且保留未保存草稿。原资料提取、建议和关系目标仍可达，不隐藏现有能力。
- 人脉数读取 `/api/contacts` 的完整已校验集合；今日待办读取 `/api/tasks?status=open`，复用首页东京日期及含逾期的投影。没有可靠的已报名活动总数，第三格明确改为“近期日程”，读取 `/api/schedule-items` 的非取消未来条目，点击 `/schedule`；不把主办／参与角色等同 RSVP。
- 每个统计独立 loading／failure／retry，失败为“未读到”而非 0；合法空集合显示 0，不能从公开活动或设计样例补数字。
- GET `/api/profile` 使用现有 `{state,profile,completeness,editor,nextAction}`。`profile.id` 是资料 ID，不强制等于认证账号；empty 必须 profile=null，pending 禁止保存。可选扩展字段允许真实稀疏数据。
- PUT 仅使用实际支持字段；除现有手工字段外，支持建议已有的目标关系类型／联系时间／介绍渠道，避免宣称已应用但保存时丢弃。缺失字段不擅自清空。成功必须 2xx、success 状态、正确资料 ID 和请求字段回显匹配；空档案创建须有新的非空 ID。
- 接受建议只把返回补丁放入编辑草稿，不保存资料；回执的 acceptedSuggestion.id／status／targetProfileField、profilePatch 与 appliedFields 必须一致且对应当前请求。
- 文档端点只传文本和文件名／类型，现服务没有图片或 PDF 字节提取。保留选择入口并明确提示需粘贴文本；不宣称 OCR／上传完成。成功／等待／无字段结果分别展示，仅有效 success 草稿可显式应用，应用不自动 PUT。原文与文件选择不因失败丢失。
- 真实多语言资料、建议、证据不可因包含 live／generated／provider 等业务单词而替换；仅将已核对的服务占位精确本地化。既有特定账号身份展示策略不在本批改写。
- 页面 focus、auth.ready／signedIn／actor／cookie、server.ready／baseUrl 形成不含敏感信息的递增作用域；变化使旧读取、401、写回执、picker 结果和导航回调失效。刷新使旧操作失效而保留草稿。三类写入及原生 picker 有同步锁。
- 320pt＋1.6 字号、820pt、深色、键盘和长文本可用。不得把 RNW 截图当作原生或跨端真实账号验收。

## Task 1 · 个人预览、统计与读取

**Files:** 修改 `app/(app)/profile.tsx`、`src/screens/profile/ProfileScreen.tsx`；新增 `src/api/profile-detail-contract.ts`、`tests/helpers/profile-detail-fixtures.ts`、`tests/ink-signal-profile.test.ts`。旧账号布局断言只在真实设计改变时更新。

- [x] 在实际私有路由＋hooks＋client 测试中构造完整 HTTP 资料、联系人、任务和日程夹具。新增测试捕捉旧卡片版式、样例计数、错误跳转及未挂载/失焦读取。

```ts
assert.equal(await page.getByRole("heading", { name: "我的", exact: true }).count(), 1);
assert.equal((await page.getByTestId("profile-avatar").boundingBox())?.width, 72);
assert.equal(await page.getByRole("button", { name: "人脉 2", exact: true }).count(), 1);
assert.equal(await page.getByRole("button", { name: "今日待办 3", exact: true }).count(), 1);
assert.equal(await page.getByRole("button", { name: "近期日程 2", exact: true }).count(), 1);
await page.getByRole("button", { name: "设置", exact: true }).click();
assert.deepEqual(await navigation(page), ["/settings"]);
assert.deepEqual(await writes(page), []);
```

- [x] 运行 `node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/ink-signal-profile.test.ts`，确认失败来自实际旧页面而非夹具装配。
- [x] 对每个将修改的函数执行绝对仓库 GitNexus impact 并报告风险；route 及新增未索引函数标记 unknown，不当作零风险。保留公共组件和共享 VM。
- [x] 添加页内消费 schema 与 stats 投影：资料全结构／状态校验；联系人复用首页集合检查后计全量；任务使用 homeTasksToView；日程使用完整条目校验后筛 startsAt > now 且非取消。响应失败、重复 ID、坏时间和矛盾空态可见，分别重试只发 GET。

```ts
const enabled = focused && auth.ready && auth.signedIn && server.ready && Boolean(auth.user?.id);
// scopeKey 为随上述身份／环境变化而更换的页内令牌，不把 Cookie 放进日志或 UI。
const state = validateApiResourceState(useApiResource<unknown>(
  ORBIT_API_ENDPOINTS.profile, () => false, { scopeKey }
), profileDetailSchema);
```

- [x] 实现已批准预览层级和读状态，账号和设置保留真实路由。编辑入口只切换本页，原编辑／提取／建议仍在；空资料可创建，不以加载失败替代空档案。
- [x] 验证错误 2xx、非 2xx、账号／Cookie／服务器／focus／readiness／卸载变化和迟到 401；统计失败不阻塞资料。定向与类型检查通过后进入下一任务。

## Task 2 · 编辑、建议及提取的真实确认

**Files:** 同一屏幕、消费 schema 和测试；不修改 Web 或共享 profile VM。

- [x] 按已读取的 Web profile/live-service、signal-contract/live-signal-service 和 extraction-contract/live-extraction-service 编写完整 PUT、建议接受及提取回执夹具。先验证刷新失败保留草稿、编辑过程中旧回执不覆盖新输入。

```ts
await press(page, "编辑资料");
await page.getByRole("textbox", { name: "简介", exact: true }).fill("新的真实介绍");
await pressTwice(page, "保存资料");
assert.equal((await writes(page)).length, 1);
assert.equal((await writes(page))[0]?.body.bio, "新的真实介绍");
await replyWrite(page, { success: true, data: {} });
assert.equal(await page.getByText("资料已保存。", { exact: true }).count(), 0);
assert.equal(await page.getByRole("textbox", { name: "简介", exact: true }).inputValue(), "新的真实介绍");
```

- [x] 手工草稿加入与实际资料协议一致的目标关系类型、联系时间和介绍渠道；应用建议及提取时只改明确返回的支持字段。保存请求不发送文件 URI、认证信息或任意未知补丁字段。
- [x] 三种操作使用局部同步锁、AbortController、作用域归属与 2xx／结构／身份校验。保存成功只确认同一草稿版本；新的编辑不能被旧成功刷新覆盖。未修改保存和返回预览不写网络。
- [x] picker 在调用前加同步锁；取消中性，读取失败可重试，迟到账号／scope／刷新结果不可发提取 POST。用户输入原文保留；实际服务无字段／等待不可应用或显示资料已更新。
- [x] 建议 loading／empty／pending／failure 可见并可独立重试。返回建议 ID、targetField、值、appliedFields 或资料回显不匹配时保持草稿和显式失败；接受／提取／应用不隐式保存。
- [x] 补真实多语言与服务占位测试；保留有效业务原文，精确本地化已确认的实现文案。正常动作、每类坏回执和每类 scope 变化全部通过后复审。

## Task 3 · 成对视觉与完整回归

- [x] 390×844／2× 的源图和最新预览在同一次输入中打开；正文、头像、统计、基本资料、标签、账号行与浮动底栏对齐。320pt／1.6、820pt、深色、空档案、读取失败、编辑失败和长文本逐一查看。
- [x] 保存 `docs/designs/2026-09-12-ink-signal/2026-09-12-profile-qa.md`；P0/P1/P2 必须修复再成对检查，P3 只记录。不得以测试通过代替视觉证据。
- [x] 运行新测试及原 profile／account 相关测试、`npm run typecheck`、`npm test`、`git diff --check`；使用请求代码复审技能安排独立只读审查，有 Important 必须修复复验。
- [x] 更新设计 README 与本计划的真实证据，记录 App 版本、另一端影响、未完成原生／跨端验收；继续 IORBIT 等剩余页面，不关闭整包目标。
