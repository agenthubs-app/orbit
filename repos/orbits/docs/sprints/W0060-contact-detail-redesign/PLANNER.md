# Sprint W0060 — 联系人详情页改版（M）

> revision 2（2026-10-03）：按 [REVIEW-2026-10-03.md](../REVIEW-2026-10-03.md) 修订（revision 1 SHA256 `b7be38d2c3b42f63ff7e3afc52a03cdf10de6c686beb18cf4ccaf47cf18fae15`）：G-13 新增详情「计划关联」服务端视图（已关联需求、所在阶段、本周行动理由），`PlanNeedLinkPanel` 关联成功回调刷新；G-5／G-17「为什么现在」改为取该联系人本周计划行动自身的理由（与 W0061 同一顺序），不再自算缺口；G-16 快速 memo 防重复提交、剪贴板失败、示例「约 TA」无副作用写进 SC；字段改名只限联系人详情。

**Plan revision:** 2。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** RC-04（REQUIREMENTS 大目标 5）；D54（字段语义）、D55（新顺序）、D56（「为什么是 TA」组成）、D57（memo 两入口）、D58（推测样式）、D63。
**单一目标:** `NetworkDetailModal` 按原型重排为五块：①名片头卡 ②为什么是 TA ③能给／需要／话题三栏 ④最近互动（含内联快速 memo）⑤关系概览 + 名片备注（默认收起）；修正字段标签；去掉底部「写 memo」、独立「下一步建议」与重复的「共同话题」面板。
**易读目标:** [GOAL.md](GOAL.md)。
**视觉依据:** 原型 <https://claude.ai/artifact/1xi35cdWj5hjv8oPZDbHcV> 画板①「联系人详情（新布局）」（880 宽）。Generator 打不开时以下文「结构」为准。
**基线:** 编制时 `chat-agent` = `a7c96deb`。**在 W0057、W0058、W0059 合并后开工**（改同一个弹窗文件，不并行；可与 W0059 由同一个 Generator 先后执行，各自提交与 REPORT）。行号按符号重定位。
**进入条件:** W0057、W0058、W0059 completed；从三份 REPORT 交接节取：W0057 的洞察状态接口与面板状态名、W0058 的详情 VM 字段来源字段名、W0059 的 `close()`／返回按钮接线。缺则 blocked。付费 AI：本 Sprint 0 次（不新增任何 AI 调用；「起草邮件」用现有模板草稿接口）。

## 原型结构（文字版，Generator 以此为准）

- **顶栏**：左「‹ 返回 {来源}」（W0059）；右 ×。
- **① 名片头卡**（白卡）：左 56px 首字母方块头像；中：姓名（22px 粗）+ 档位 chip（如「有往来」）+「依据 ▾」（展开 `RelationshipBasis`）；第二行「公司 · 职位」；第三行小 chip：行业（一级／二级）、职级（四档派生名）、地区——**点 chip 打开编辑**（沿用 `ContactEnrichmentInline` 的编辑能力与写入接口、来源规则），后接灰字「· 来自 {来源} · {日期}」；右侧按钮「✎ 写 memo」（打开完整弹窗 `NetworkFollowModal`，可选关联活动）与主色「约 TA」。卡内分隔线下：联系方式胶囊（邮箱／电话／微信／LINE，非空才显示），点击复制并提示「已复制」，行尾灰字「点击复制」。
- **② 为什么是 TA**（描边强调卡）：标题行「为什么是 TA」+ 右侧灰字「对照目标：{目标}」；首行大字「TA 能帮你：{goal_relation}」（W0061 会替换成共享组件，本 Sprint 先直接渲染）；「依据」+ 证据小签（名片／memo 日期／计划需求）；浅底条「对应计划需求」+ 已关联需求 chip（✓）+ 虚线「+ 关联到其他需求」（`PlanNeedLinkPanel` 的能力收进这里）；分隔线下「下一步」一句（`insight.nextStep` 优先，没有用 `contact.nextAction`，都没有不显示该行）+ 灰字「为什么现在：…」（规则见易错边界 4）+ 按钮「约 TA」「起草邮件」。洞察未就绪时这块显示 W0057 的状态（正在生成／失败自动重试／失败可重新生成／未设目标去设目标），**需求关联与动作按钮照常可用**。
- **③ 三栏**（等宽三卡）：「TA 能给你的」「TA 需要的 <灰字>你也许帮得上</灰字>」「可以聊的话题」（chip）。推测条目：浅灰字 + 虚线小角标「据名片推测」；话题推测 chip 虚线浅底「… · 推测」。手机端三栏纵向堆叠。
- **④ 最近互动**：顶部一行：输入框（placeholder「记一句：今天聊了什么、TA 提到什么需要…」，有 label）+ 日期 chip（默认今天）+ 主色「保存」；下一行灰字「会用于 AI 整理「能给你的／需要的／话题」，仅你可见」；`extra`（会后纪要／约谈附加态）放在本块顶部；下方时间线（现有 `RecentInteractions`）。
- **⑤ 关系概览 · 名片备注**：整块是一个折叠按钮，默认收起「展开 ▾」；展开后四格（关系档位、上次互动、下次计划、来源）+「名片备注」原文。
- 底部：只保留「关闭」（W0059 行为）。

## 上下文包

### 必读文件
- `app/(app)/app/contacts/network-0918/network-detail-modal.tsx`（386 行，W0059 后会变）：:121 `RelationshipBasis`；:148 组件签名（`insight?: ReactNode`）；:165–176 读 `publicProfile`（`contact.encounters[0]?.context.publicProfile` 的 topics／offering／seeking）与 `contact.nextAction`；:219 `cardNotes`；:240–256 hero + `ContactEnrichmentInline`；:256 `{insight}`；:257–267 关系概览；:268–279 联系方式；:281–286 名片备注；:287–300 左栏 `extra` + 最近互动 + 共同话题；:301–321 右栏 我能提供（**标签写反**，英文 "What they offer"）／对方需求／下一步建议／我的计划 `PlanNeedLinkPanel`；:322–330 底部关闭 + 写 memo。
- `network-insight-panel.tsx`（85 行，W0057 后含状态与轮询）、`network-insight-copy.ts`；`contact-enrichment-inline.tsx`（198 行，行业／职级／地区内联编辑）；`network-follow-modal.tsx`（`buildMemoPatch`、`PATCH /api/contacts/<id>`、`tokyoToday`、`memoEventSuggestions`）；`network-cards.tsx:38`／`network-all.tsx:28`（memo 保存后 `window.location.reload()`）。
- `app/(app)/app/agent/iorbit-0918/plan-match-sheet.tsx`：`PlanNeedLinkPanel`（手动关联需求）、`PLAN_MATCH_SCHEDULE_HREF = "/app/tasks/personal"`（「约 TA」去处）。
- `app/api/contacts/[id]/reconnect-draft/route-handlers.ts`：「起草邮件」模板草稿（不发送、不保存；先核实不调用付费 AI，若调用则本 Sprint 不接、登记）。
- `features/contacts/live-detail-service.ts:318–378` `publicProfileFor`：offering←`connection.valueTypes`、seeking←`connection.suggestedActions`、topics←`connection.sharedTopics` 的回退。
- `app/(app)/app/contacts/[id]/page.tsx`：洞察以 ReactNode 传入；改版需要洞察数据（goal_relation、evidence、nextStep、状态）在 ② 内组合——建议把 prop 改为数据（`insightView` + `quotaExhausted`），由弹窗内渲染。
- 测试：`tests/pages/app-network-detail-modal.test.tsx`（旧块顺序断言要改成新设计，RULES 5.3）、`app-network-demo-mode.test.tsx`、`contact-card-route.test.ts`、详情 VM 测试。

### 关键符号
- `NetworkDetailModal`（直接调用方 3，LOW）、`NetworkInsightPanel`、`ContactEnrichmentInline`、`PlanNeedLinkPanel`、`publicProfileFor`（详情服务内部，消费者以 impact 为准）。

### 易错边界（都对应到 SC）
1. **标签语义（D54；rev 2：只改联系人详情与人脉相关展示，本人资料页里本人的「我能提供」是正确的，不动）：**`offering` =「TA 能给你的」/ "What they can offer you"；`seeking` =「TA 需要的（你也许帮得上）」/ "What they need (you may help)"；`topics` =「可以聊的话题」/ "Topics to talk about"。全站同字段的其他展示处一并核对（`grep -rn "我能提供\|对方需求\|共同话题" app`），只改文案（SC-01）。
2. **不拿别的数据凑（W60-1）：**三栏只显示 `publicProfile` 的真实值（memo 提取、名片推测、用户填写）；connection 的 `valueTypes`／`suggestedActions`／`sharedTopics` 回退**不再用于这三栏**（`suggestedActions` 是给你的建议动作，不是对方的需要）。实现上不改 `publicProfileFor` 的对外输出（避免影响其他消费者），在详情 VM 增加「该字段是否来自回退」标记或直接读来源字段，弹窗据此只显示真实值；空态文案「写一条 memo，AI 会帮你整理」（中英）（SC-02）。
3. **推测样式：**条目来源 `via = card_inference`（W0058 字段）时浅色 + 「据名片推测」角标；memo 提取或用户值正常显示（SC-02）。
4. **下一步唯一（D56）：**只显示一条：`insight.nextStep`（ready 时，按界面语言）优先，否则 `contact.nextAction.text`，都没有不显示。「为什么现在」（rev 2，与 D61／W0061 同一顺序）：取**该联系人本周未完成的计划行动**（`linkedContactIds` 恰好只含此人，或 `meta.contactId` 为此人）自身的理由文字 `detail`，前缀阶段名；没有这样的行动则不显示（下一步已用了 `insight.nextStep`，不重复）。不自算「还差 k 个」。规则写成纯函数 `contactWhyNow(...)` 放在 `app/(app)/app/contacts/network-0918/contact-value.ts`，W0061 复用。**不新增 AI 调用**（SC-03）。
4a. **计划数据面（rev 2 G-13）：**现在 `OrbitContactView` 没有计划数据，`PlanNeedLinkPanel` 自己请求、不回传状态。新增服务端只读视图 `readContactPlanContext({ actorId, contactId })`（只读当前生效计划的 `getCurrent()`，0 次写入、0 次生成器调用，W0050 R-6 同一守则）：输出 `linkedNeeds[{ needId, title, phaseNo, phaseTitle }]` 与 `weekAction{ id, title, detail, phaseNo } | null`；详情页服务端读好随 VM 下发；`PlanNeedLinkPanel` 增加 `onLinked` 回调，关联成功后 `router.refresh()`（不新增历史条目）。
5. **快速 memo（D57）：**一句 + 日期（默认东京今天）+ 保存，走与完整弹窗**同一个** `buildMemoPatch` 与 `PATCH /api/contacts/<id>`；空文本不可保存；保存中禁用且有 in-flight 锁（双击／回车连按只发 1 次请求）；失败显示错误并保留文本；成功后 `window.location.reload()`（不新增历史条目，W0059 的后退不受影响）；输入框内按 Esc 不关闭弹窗（W0059 保持）；示例模式走 `guardWrite` 拦截（SC-04）。
6. **复制联系方式：**`navigator.clipboard.writeText`；不存在或被拒绝时退回选中该文本并提示「已选中，可手动复制」；不发请求、不记日志（SC-04）。
7. **折叠默认收起**，按钮有 `aria-expanded`；展开状态不持久化（SC-01）。
8. **示例模式：**同一组件渲染示例联系人，所有写入（快速 memo、chip 编辑、关联需求）走 `guardWrite`；「约 TA」「起草邮件」在示例里也走拦截层、0 次请求、不导航；示例数据没有的块不渲染空壳（SC-05）。
9. **去掉的元素：**底部「写 memo」、独立「下一步建议」面板、「共同话题」面板（与「可以聊的话题」同一数据）、独立「我的计划」面板（并入 ②）（SC-01）。

## 范围与文件

- 新建（rev 2）：`features/plans/contact-plan-context.ts`（`readContactPlanContext`）与测试。
- 修改：`network-detail-modal.tsx`（重排）、`plan-match-sheet.tsx`（`PlanNeedLinkPanel` 加 `onLinked`）、`network-insight-panel.tsx`（收进 ② 或拆为状态子组件）、`contact-enrichment-inline.tsx`（改为 chip 触发的编辑，能力不变）、`[id]/page.tsx`（insight 改传数据）、`features/contacts/live-detail-service.ts`（只加「回退」标记字段，若需要）、相关样式（`orbit-reference-styles.tsx` 中 `nw-*` 段或组件内样式，**不与其他 Sprint 并行改共享样式文件**）、测试。
- 新建：`app/(app)/app/contacts/network-0918/contact-value.ts`（`contactWhyNow`、下一步选择等纯函数）与单测；`network-detail-quick-memo.tsx`（可选拆分）。
- 排除：关闭行为（W0059 已做）；价值一句话组件（W0061 替换 ② 首行）；洞察生成；App 端；列表卡片与分析页。

## 验收契约

| SC | 操作链（可观察行为） | 主证据 |
| --- | --- | --- |
| SC-W0060-01 | **五块顺序与去留。**渲染真实联系人：DOM 顺序为 头卡 → 为什么是 TA → 三栏 → 最近互动 → 折叠概览；底部只有「关闭」；没有「下一步建议」「共同话题」「我的计划」独立面板；三栏标签中英按 D54；折叠默认收起、`aria-expanded` 正确 | `app-network-detail-modal.test.tsx`（改为新设计断言） |
| SC-W0060-02 | **三栏真实值与推测样式。**publicProfile 为空、connection 有 valueTypes／suggestedActions 时三栏显示空态而不是回退值；`card_inference` 条目带「据名片推测」角标；memo 提取值正常显示 | 组件测试 + 详情 VM 测试 |
| SC-W0060-03 | **为什么是 TA。**ready 洞察：首行、依据、已关联需求 chip（含阶段）、「+ 关联到其他需求」（关联成功后刷新出新 chip）、下一步取 `insight.nextStep`；无洞察时下一步取 `contact.nextAction`；有本周计划行动时「为什么现在」= 该行动 `detail`，否则不显示；`readContactPlanContext` 0 次写入、0 次生成器调用；pending／failed／no_goal 显示 W0057 状态且关联与按钮可用；「起草邮件」不触发付费 AI | 组件测试 + `contact-value` 单测 |
| SC-W0060-04 | **快速 memo 与复制。**输入一句 → 保存：发出与完整弹窗同形的 PATCH，成功后整页 reload；双击只发 1 次；空文本禁用；失败保留文本；Esc 不关；点邮箱胶囊调用剪贴板并提示「已复制」，剪贴板缺失／拒绝时退回选中并提示 | 组件测试（fetch 桩、clipboard 桩） |
| SC-W0060-05 | **示例模式与真实页面。**示例详情所有写操作与「约 TA」「起草邮件」被拦下（0 次请求、不导航）；1440 与 375 对照原型截图（三栏在 375 纵向堆叠），控制台无错误 | `app-network-demo-mode.test.tsx` + 浏览器截图（证据目录） |

## 一次 Generator 的执行顺序

1. 登记 run-01、Planner SHA256、基线；从 W0057／W0058／W0059 REPORT 取名字。
2. impact：`NetworkDetailModal`、`NetworkInsightPanel`、`ContactEnrichmentInline`、`publicProfileFor`；HIGH 则升 H 并报告。
3. 纯函数（SC-03）→ 弹窗重排（SC-01）→ 三栏（SC-02）→ 快速 memo 与复制（SC-04）→ 示例与浏览器（SC-05）。
4. 路径限定提交 `sprint/W0060-contact-detail-redesign` → REPORT → 协调者合并。

## 最小测试与检查

- **档位：用户分档 M**，执行按 RULES 的 L：开发跑改变行为的用例；收口跑修改测试所在完整文件及直接消费者（`app-network-detail-modal.test.tsx`、`app-network-demo-mode.test.tsx`、`contact-card-route.test.ts`、`app-network-overview.test.tsx`、详情 VM／路由测试、`tests/capabilities/contact-detail-note-preservation.test.ts`）+ `npx tsc --noEmit -p .` 一次 + 浏览器验证。若 impact 出现 HIGH/CRITICAL 或改到共享样式／共享 VM 的跨页消费者，升 H（加全量对照与一次 Codex 代码 review）并在 REPORT 说明。
- **不运行**：全量（除非升 H）；任何 AI 调用。

## 付费 AI 调用上限

0。

## 回滚

revert 本 Sprint 提交即可（纯界面与 VM 增量字段）。

## 风险

- 旧测试大量断言旧块顺序：按 RULES 5.3 改为断言新设计，不保留两套。
- `ContactEnrichmentInline` 从内联改为 chip 触发后，编辑写入接口与来源（`origin=user`）不得改变。

## Planner 定（对标）

| 编号 | 结论 | 对标做法 |
| --- | --- | --- |
| W60-1 | 三栏不再用 connection 的值回退凑内容，空则引导写 memo | RN-01「不出假内容」；HubSpot 属性为空显示「—」并引导补充，不用相邻字段充数 |
| W60-2 | 「为什么现在」只在有本周计划行动时显示，文字取行动自身理由（rev 2） | Salesforce Einstein「Why」只在有可解释信号时出现 |
| W60-3 | 「约 TA」去个人日程新建页（与计划行动卡「定时间」同一去处），「起草邮件」用现有模板草稿 | 与站内现有动作保持一致，不新造流程 |
