# 独立 Next 个人日程 v3 对齐实施计划

> 执行者：既有空闲 B 线，GPT-5.6 Sol / medium，一个 Generator、唯一 run-01。执行按本项目 RULES；不调用用户已卸载的 brainstorming／executing-plans，不新增评审代理。

**目标：** 修复真实 `/app/tasks/personal` 仍使用 v2 客户端与 unsupported 提醒重复 UI 的具体缺口，消费既有 v3 和摘要接口，不重开已结束 0059／0060。

**架构：** 页面继续通过自己的 HTTP client／draft model 访问现有 API。使用既有 shared schema 解码并验证 actor、实例、嵌套规则和独立回读；后端规则、ACL、通知所有权不另实现。局部底部窗沿用既有 Web 样式与批准 TURN6a 布局，不改全站主题。

**技术：** Next.js、React、TypeScript、node:test、既有 React renderer／Playwright；Node22，既有依赖，无新增包。

**规格：** 用户2026-09-17提醒／重复／关联窗要求及“继续完成未完成的”；0059／0060冻结Planner和中文REPORT的ROOT追加，参考ZIP `/Users/xzhao/Downloads/软件UI设计现代化 (1).zip` TURN6a。原报告与失败事实保留。

## 全局约束与基线

- 产品基线 `656d3caa1ae7dbcc79b782570cf613bcf956bd11`；ROOT创建计划后交固定文档提交。B另建隔离 `codex/sprint-0061-next-personal-schedule-v3`，不在旧0059树继续产品生成。
- 先读 RULES、Bridge 与 0060REPORT追加；root-only登记／计划由ROOT维护。B产品 cwd 为自己的 `repos/orbits`，不越该目录写App或根台账。截图／日志在ROOT指定ignored evidence，不放产品public或src。
- 不改共享schema／同步副本、后端service／ACL／原生提醒executor、全局主题、通知flag、cutover、OAuth或provider。字段与路径全部消费现有权威契约；必要新增本地组件／model／测试按RULES0登记用途。
- 先upstream impact并报告HIGH；新符号UNKNOWN补实际caller，不当零风险。ROOT唯一索引writer，实际stale告警回ROOT。真实账号、DB、Simulator、服务生命周期、Phone公开入口及费用仅ROOT持有。
- 唯一累计AI/OCR $5账本，不reset；本轮不准任何真实provider调用。隔离测试保持zero-outbound和protected-runtime preload，mjs用--import，不能关闭guard求绿。
- H：Web客户端实例scope和写入回执发生变化，必要定向完整集后本地收口仅Web一次I；App源码未变复用0060证据，不重AppI或后端42整链。唯一heavy窗口先向ROOT领取；原失败／skip与Web PWdenied4保留，新增失败必须查因果。同因果最多两局部repair，禁止重全套。

## 文件边界和接口

修改：`app/(app)/app/tasks/personal-schedule-client.ts`、`personal-schedule-editor-model.ts`、`personal-schedule-workspace.tsx`。

必要新局部组件可置同目录 `personal-schedule-rules.tsx`、`personal-schedule-association-sheet.tsx` 和仅本页样式文件。可更新实际相关 `docs/**` 页面说明；不改全局CSS。测试：`tests/pages/personal-schedule-workspace.test.tsx`、`personal-schedule-page-account-scope.test.ts`，必要新 `personal-schedule-v3-client.test.ts`／`personal-schedule-v3-workspace.test.tsx`。实际直接model消费者先查再纳入定向集，不猜测试路径。

输入现有 `PersonalScheduleContract`：`reminderMinutes?: 0|5|15|30|60|1440`，`recurrence?: {frequency:'daily'|'weekly'|'monthly';until?:string}`，`seriesId`／`occurrenceDate`。清除规则发null，省略不擦除；id稳定为 `${seriesId}:occurrence:${date}`，sourceId等seriesId；普通日程id==sourceId。

请求使用 `x-orbit-personal-schedule-version: 3`；列表按当前日程当地日期计算有界窗口，使用真实 `scope=personal&from=...&to=...`，不发送无效windowStart／windowEnd。PATCH／DELETE重复实例须显式 `scope:'occurrence'|'series'`，expectedUpdatedAt与原幂等键保护保持。整个系列编辑必须独立读base；dirty草稿不能悄悄丢弃，单次修改不能覆写系列规则。

关联使用两literal GET：`/api/schedule-items/association-options/notes`、`/contacts`，现有查询q／limit20／cursor解码、actor和kind严格验证。空q也请求列表，服务端做拼音匹配，不拉全部正文或另实现客户端全量拼音。选择前沿原详情接口校identity／授权；已选chip保留／移除不写服务器，只有Save才写关联。不得以姓名匹配推断授权。

## 四项SC与主要证据

| SC | 用户可观察验收 | 验证 |
| --- | --- | --- |
| 61-01 | Web七提醒／四重复及结束日真实可设置；保存／清除／重开和详情当前值正确，不再unsupported | Web规则UI+model/client完整定向；嵌套ACK与独立GET擦字段／错误actor／409／late scope反例；ROOT真实同账号回读 |
| 61-02 | 有界列表点击稳定未来实例，明确本次／整个系列编辑取消，不误删siblings、不改秒精度／时区／全天边界 | 客户端／UI scope反例与现有服务器兼容；ROOT只用已识别QA系列实际点击／跨端回读，不重复全recurrence单测 |
| 61-03 | 两关联按钮弹可关闭底部窗，空词列表、姓名／标题／首字母、加载更多、已选chip可用；网络失败有反馈 | 实际summary HTTP边界UI；匿名／wrongactor／晚响应不显示他人资料；取消／关窗无mutation，ROOT小雨实际UI |
| 61-04 | 代码与中文REPORT正常commit，ROOT精确主合chat-agent/push；更新后生产Web重启再同账号Simulator回读 | 固定BASE..TREE官方gate，Webtypes一次／唯一WebI真实结果，ROOTbuild/restart/health与实际浏览器；不假称提醒送达或Push完成 |

## 连续实施步骤

### 任务1：v3 client／draft完整读写

- [ ] 在真实client测试加入有效v3实例解码及嵌套规则回读反例，先观察失败。核心输入与断言：

```ts
const rules = { reminderMinutes: 15 as const,
  recurrence: { frequency: 'daily' as const, until: '2026-09-19' } };
// fixture经过实际client.save -> POST/PATCH ACK -> 独立GET。
// GET recurrence.until不同、reminder缺失、actor或stable identity不符必须reject。
assert.deepEqual(saved.recurrence, rules.recurrence);
assert.equal(saved.reminderMinutes, 15);
assert.equal(new Headers(capturedInit.headers).get('x-orbit-personal-schedule-version'), '3');
```

- [ ] 最小实现draft规则／null清除、严格v3identity、嵌套按值校回执；ACK+GET同id／updatedAt／actor／全部有效draft一致才报成功。DELETE独立读确认，不把仅ACK当移除。
- [ ] 跑改变行为用例GREEN，再相关完整client/model文件；保秒精度、时区、全天exclusive-end、冲突草稿和幂等fingerprint。记录原RED与任何非预期失败。

### 任务2：规则、实例scope、批准布局

- [ ] 原workspace新增提醒／重复设置及实例scope的UI RED，不删旧日期／无写入／冲突断言。
- [ ] 将紧凑时间块／分段地点／关联chip／底部窗接入本页；规则七提醒、四重复、可选有效结束日，每月缺日说明。重开已保存详情显示实际规则，默认不填造假时间。
- [ ] scope未选择不能写实例；仅本次保继承规则，整个系列独立base读取并保护dirty草稿。清除／取消／过去实例提示与当前contract一致。保可访问标签、focus退出、44pt命中及窄屏滚动，不重做全站。
- [ ] 必要UI完整文件GREEN，记录原fixture请求URL改变的因果，不只改snapshot删期待。

### 任务3：授权摘要底部窗

- [ ] 加入打开笔记／联系人窗无需输入即请求摘要，断言q为空仍返回选项；晚响应／wrongactor／网络失败／分页选择取消写保护RED。
- [ ] 接两literal GET和严格现有schema，query改变取消旧请求／generation；保持selected值和chip名字，不显示rawID作成功。姓名／标题／首字母使用server q；loading／empty／error／重试／loadmore区分显示。
- [ ] 取消或关窗无任何POST/PATCH/DELETE，Save才提交数组；超过50拒新增，已选可以移除。跑相关完整UI/client文件。

### 任务4：本地收口与固定交接

- [ ] 一次Web types及完整必要定向集；向ROOT申请唯一H窗口后仅Web一次I，使用原Node22/guards，不运行真实服务／DB／AI。
- [ ] 回固定TREE／manifest／diff和原始fail/skip，ROOT官方门槛通过才正常feature commit；独立中文REPORT给固定SHA、dirty、失败、回退及未验到期提醒／Push。
- [ ] ROOT精确合回chat-agent、必要合并检查、普通push独立remote，再停旧Web→productionbuild→restarthealthy；小雨同账号Web↔Simulator仅一个明确测试对象规则／关联／scope回读。所有SC真实满足才completed，否则partial与具体缺项并列。

## 失败与交接

新增产品失败先定位，不以旧59fail整组自动豁免；必要fixture最小两repair保原日志，不能重I制造green。原0060提醒送达验证与本页开发独立，授权／真实环境缺项只阻对应动作。禁止改历史Planner、覆盖其他线或将Phone私有catalog反向覆盖Main。最终交中文REPORT至ROOT，由ROOT落入本Sprint目录；执行线无权写根台账时提供文本，不因此阻止实现交付。
