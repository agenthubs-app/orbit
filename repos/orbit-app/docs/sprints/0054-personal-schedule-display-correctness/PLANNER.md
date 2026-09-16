# Sprint0054 — 个人日程显示修正执行计划

> 执行者使用既有支线任务按RULES单Generator/TDD实现；不调用已卸载的executing-plans，不增加评审代理或重开0053原run。

**Goal:** 修复0053真实原生分钟单位和全天占用日期显示，UTC/存储/编辑语义不变。
**Architecture:** 只改个人日程阅读投影及本地化显示。App沿用home.durationMinutes；全天读取savedZone的endsAt-1ms作占用末日，Web同语义。不新增API、契约、存储或引擎依赖。
**Tech Stack:** 既有TypeScript、React Native/Hermes、Expo Router、Next React及现有Node/render测试。
**Spec:** [GOAL.md](GOAL.md)、[AUDIT.md](AUDIT.md)，承接0053 SC01/02原生显示及SC05真实验证中这两个具体失败。
**Requirements / Baseline:** 关联R-09/R-12与0053用户参考图。固定主线起点1bc3b13c8ee1e8f036e9b343179aa5b96cfcc0f8（运行产品27a45a2bedb19013e2f7f0bba6d3187bec369c74，后续仅文档）；独立codex/sprint-0054-personal-schedule-display-correctness树，禁止从Phone移动HEAD取基线。

## 全局约束与进入条件

- 按RULES0/7复用用户参考图要求、已批准持续推进和忠实显示修正授权；目标不变、原失败保留，本Sprint不复刻0053全部范围。
- ROOT登记唯一现有B任务、GPT-5.6 Sol medium、隔离树/精确产品基线及本Planner SHA后，才启动run-01；可变启动状态以全局README为准，不提前REPORT。基线应包含主线0053固定代码，不带Phone未提交工具/其他线移动HEAD。
- GitNexus刷新实际结果先核，待改符号upstream impact后再编辑；HIGH/CRITICAL先报告，新增/linked UNKNOWN结合源调用，不把零流程当无影响。
- B只持个人日程详情/阅读VM及其测试锁；0052 matching/schema/四字典属于A，不并写。通用time模块、editor、API、契约/schema、字典、notes/contacts和平台runtime配置排除。
- 真实主3000/8082/DA及同账号浏览器只有ROOT持有；321xx/固定ngrok/322xx只有Phone父。B当前不写数据库、操控账号/设备/服务/付费provider或清缓存；原累计$5不重置。
- ROOT集成固定SHA→按Web变更生产重建/重启→真实验证→普通push/核远端；纯文档提交不重复build。未齐SC不completed。

## 文件白名单与接口

- App修改src/screens/schedule/PersonalScheduleDetailScreen.tsx、src/view-models/personal-schedule-detail.ts；测试新增tests/personal-schedule-detail-view-model.test.ts并扩展tests/personal-schedule-interactions.test.tsx。
- Web修改app/(app)/app/tasks/personal-schedule-workspace.tsx内PersonalDetail阅读投影；测试扩展tests/pages/personal-schedule-workspace.test.tsx。
- 消费personalScheduleDetail(item:PersonalScheduleContract,fallbackZone:string)，返回现有date/endDate/durationMinutes/zone；date和endDate仅表示阅读占用日期，timed事件保持实际结束日期。editor不消费本VM、不改其draft。
- 消费locale.t("home.durationMinutes",{count:view.durationMinutes})及既有localParts/IANA校验；不新增字段或文案。durationMinutes数值、缺结束null及所有原始instants不变。
- 必要额外直接消费者先实际impact并追加与对应SC关系，不扩大成全域日期或格式化重构。

## 最多五项验收

| SC | 可观察结果 | 必需证据 |
| --- | --- | --- |
| SC54-01 | 中文/日文/英文30、60、120分钟详情保留数字及分钟单位，不调用平台单位换算；缺结束仍用既有提示 | 完整App交互文件中实际render和显式期望字符串，不仅snapshot/源码搜索；真实原生语言确认由SC04补 |
| SC54-02 | 单日全天17→18只显示17，多日17→19显示17–18；DST23/25小时仍一当地日，savedZone不被deviceZone替代；timed跨日真实结束日期不变 | 新VM完整文件手写期望及Web完整workspace文件实际只读详情render，保存instant不被mutate |
| SC54-03 | 仅阅读投影改变：原始UTC/秒精度、durationMinutes/缺结束、ID/私有关联及编辑/CAS/回执独立GET保护保持，打开详情不写业务 | App完整personal-schedule-duration/interactions及Web完整workspace直接回归；两端typecheck，类型/schema未改不重复sync |
| SC54-04 | 主线同版本Web与8082 Hermes Simulator实际30/60/120分钟及单/多日全天显示一致，至少原生中文/日文/英文单位实证，无误多一天 | ROOT明确当前actor/APIbase/数据库/设备/原生/JS来源，实际点击/截图、同精确记录独立GET及安全清理；mock/Node不是原生PASS |
| SC54-05 | 固定功能和REPORT提交，精确合chat-agent并验证合并树；Web实际消费新构建，Phone相关源影响交接清楚，适用push核远端 | 固定功能SHA/报告SHA/实际差量、构建PID/BUILD/测试/原始失败与未齐项；不将读取QA冒整个0053完成 |

## Task1：分钟文案与占用日的同一阅读操作链

新VM测试使用现有真实契约字段，测试中明确写出期望，不通过待改函数计算期望。下面是首个RED案例，其余Tokyo多日、NY春秋和timed案例沿相同结构逐项加入：

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { personalScheduleDetail } from "../src/view-models/personal-schedule-detail";

test("all-day reading excludes the exclusive end date without mutating instants", () => {
  const item = {
    id: "personal:test", sourceId: "personal:test", accountId: "owner",
    ownerUserId: "owner", kind: "personal" as const,
    category: "personal" as const, state: "upcoming" as const, title: "Saved",
    startsAt: "2026-09-16T15:00:00Z", endsAt: "2026-09-17T15:00:00Z",
    timeZone: "Asia/Tokyo", allDay: true,
    createdAt: "2026-09-17T00:00:00Z", updatedAt: "2026-09-17T00:00:00Z",
  };
  const original = structuredClone(item);
  const view = personalScheduleDetail(item, "America/New_York");
  assert.equal(view?.date, "2026-09-17");
  assert.equal(view?.endDate, "2026-09-17");
  assert.equal(view?.durationMinutes, 1440);
  assert.deepEqual(item, original);
});
```

既有App交互文件的`open(t, patch)`接受language、detail和item；保留标题Original title以符合该helper等待条件。在同文件加入真正消费者断言，而不是新建假Screen：

```ts
test("readonly duration stays in minutes in every supported language", async t => {
  for (const [language, expected] of [
    ["zh", "30 分钟"], ["ja", "30分"], ["en", "30 min"],
  ] as const) {
    const p = await open(t, { detail: true, language, item: {
      ...initialItem, startsAt: "2026-09-17T00:00:00Z",
      endsAt: "2026-09-17T00:30:00Z", timeZone: "Asia/Tokyo",
    } });
    await p.getByText(expected, { exact: true }).waitFor();
    assert.equal((await writes(p)).length, 0);
  }
});
```

以上正常浏览器可能原代码就GREEN；若如此必须先加入限定`Intl.NumberFormat`单位分支故障替身，让`unit:"minute"`回传秒再证明旧消费者RED，其余格式化委托原实现，不能假称正常浏览器RED或Hermes验证。分别扩展60/120分钟。最小实现形状如下，仅用于现有阅读端，必须在RED后再写入产品文件：

```ts
const endInstant = item.endsAt && item.allDay === true
  ? new Date(Date.parse(item.endsAt) - 1).toISOString()
  : item.endsAt;
const end = endInstant ? localParts(endInstant, zone) : null;
// DetailScreen：替换平台unit NumberFormat调用，保留缺结束分支。
locale.t("home.durationMinutes", { count: view.durationMinutes });
```

Web在现有readonly测试中复用完整HTTP mock，单日全天夹具使用同一Tokyo区间；点击真实row后从`aria-label="个人日程详情"`section文本断言只含2026-09-17、不含2026-09-18，并核mock中所有method都是GET。多日/DST逐项明确占用末日期；不能禁止列表本身显示原始时间或修改editor以迎合断言。

- [ ] 写RED：新VM夹具手写Tokyo start2026-09-16T15:00:00Z/end2026-09-17T15:00:00Z期待date/endDate均2026-09-17，1440min；二日end2026-09-18T15:00:00Z期待末日2026-09-18。NY春start2026-03-08T05:00:00Z/end2026-03-09T04:00:00Z期待单日03-08/1380min，秋start2026-11-01T04:00:00Z/end2026-11-02T05:00:00Z期待单日11-01/1500min。timed同跨日保持end真正03-09/11-02。
- [ ] 在既有App open({detail:true})夹具增加显式30分钟/60分钟/120分钟与三语言断言，引用同真实记录读接口；可将Intl unit格式替身返回秒模拟故障边界，必须验证消费者实际输出且不能当Hermes实证。精确缺结束提示及打开write count0继续原夹具。
- [ ] 在既有Web readonly detail测试fixture按上述半开区间，点击真实列表row、等detail GET后断言实际占用日期；不能只测新helper本身。完成上述RED后最小改App显示为既有locale.t分钟文案、allDay且合法endsAt用localParts(new Date(Date.parse(endsAt)-1).toISOString(),savedZone)；timed仍原endsAt。Web对应只改PersonalDetail的阅读end投影与单日/多日显示，不改PersonalEditor。
- [ ] 使用固定Node22和既有zero-outbound隔离，App cwd运行node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/personal-schedule-detail-view-model.test.ts tests/personal-schedule-duration.test.ts tests/personal-schedule-interactions.test.tsx；Web cwd运行node --test --import tsx tests/pages/personal-schedule-workspace.test.tsx。实际direct GREEN后相关两端npm run typecheck一次。PURE L不默认全量；若actualimpact触发H，按RULES一次本地I，原baseline失败不改写。
- [ ] actual staged detect/或准确immutable staged-tree cache审计与白名单复核→单阅读链功能commit，不拆helper虚增提交。每同失败最多2repair/同假设3诊断，原失败保留。

## Task2：ROOT真实验证与Git收口（环境锁独立串行）

- [ ] B提交后冻结功能SHA，结束写一次REPORT列SC/改动/命令/退出码/失败/缺项/未提交/句柄与预算0，释放源锁。ROOT核准确源码及合并树，不能以规划或定向单测宣布修复完成。
- [ ] ROOT按实际Web改动停止旧主3000→生产build→新进程/health→确认8082主DA与同actor同DB浏览器。沿创建30min→两端GET详情→改期60/120min→单/多日全天→两端GET显示/UTC不变；切原生三个语言只改变偏好，保存CAS仍保护，安全删除本次明确自建ID并GET404/列表缺席。
- [ ] 对Phone由原父精确消费已验证显示增量并按unset同域/隔离cache正确recipe重建，先独立preview登录再IPC发布，不重错缓存产物、不变域名/322xx。ROOT汇总适用SC/主线SHA和普通push一致；0053仍缺的其他关联/视觉及同账号完整矩阵如实留在原Sprint，不用0054成功重写原失败。

此新Sprint只处理已确认的新显示故障模式和独立原生实证，不消耗0053的第二Generator。启动前外部缺项只阻实际设备/账号步骤，本地已授权实现可以继续，但不得跳过pre-edit impact或越过未获准真实写入目标。
