# Sprint0055 — 点单识别与实施事实纠偏执行计划

**Goal:** 修复0052真实预览中点单别名缺失和自身诉求被误算实施经历，不改原演示数据。
**Architecture:** 延续确定性v2评分；ordering同概念别名补齐，合作/实施项仅接受相关事实语句/明确实施职责，过滤未来意愿、自身诉求和无关服务的“落地”。不引入AI提取、额外模型或新API。
**Tech Stack:** 既有TypeScript/Node22、评分与API完整文件测试。
**Spec:** [GOAL.md](GOAL.md)、[AUDIT.md](AUDIT.md)，关联0052 SC01/02/03及真实SC05中这两个失败；R-03/R-09/R-14。
**Baseline:** 匹配产品固定MAIN005494caddbe207de1cc6f15ceb68c2b8c0cf17d；个人日程1ab/B中文报告为独立已验增量，不改变匹配源码。ROOT在Planner冻结后登记最终主线启动SHA及唯一隔离树，不能取移动Phone HEAD或其dirty。

## 进入条件与边界

- 按RULES0/7复用既定正确评分目标及用户持续推进批准；旧0052已closed，0055唯一现有A任务、GPT-5.6 Sol medium，登记run-01/Planner SHA/固定worktree后启动，不增加第二Generator或评审，不提前REPORT。
- 先读RULES/本目标、AUDIT、Planner及0052真实REPORT，核SOURCE/baseline/用户dirty和唯一源锁；新必要文件先用途/SC登记，不重写原0052契约。
- 每待改符号actual ROOT upstream impact后编辑，HIGH/CRITICAL先报告；工具stale先官方刷新且保护用户AGENTS/CLAUDE，新增/linked未知单列UNKNOWN。
- 白名单：Web features/contact-needs/criteria.ts、scoring.ts、DESIGN.md，现有tests/services/contact-needs.test.ts。API route及notification-discovery-prefilter完整文件只读直接回归；若实际依赖要求补测试内容，先登记对应SC，不改其产品代码。
- 不改service的一致性检查、shared契约/schema/App副本、四字典、App VM/Screen、通用时间、个人日程/笔记/报名/关系价值/provider/账号数据。needs-evidence-v2 wire语义与所有baseWeights不变；修复有自己的固定产品SHA，不用新标记掩盖原v2失败。
- A仅本地zero-outbound实现，ROOT sole主3000/8082/Simulator，Phone父sole321xx/ngrok/322xx；无真实DB/账号/prefs/需求/联系人写入或付费/服务/cache授权。累计$5不重置。

## 五项验收

| SC | 可观察行为 | 必要证据 |
| --- | --- | --- |
| SC55-01 | 原点单需求实际产生scenario:ordering；点单/點單/点餐/點餐混用仍同概念一次，中日英已有概念和拉丁词边界保留 | 现有完整service文件调用真实criteriaForNeed和scoreContactsForNeed，手写ID和去重期望，不改展示原goal |
| SC55-02 | 匿名原诉求/可提供介绍不能获实施经历分；合作baseWeight20及归一分母保持，matched=false/无假证据，不能仍100；无关税务“落地”不借门店身份抬分 | 完整服务反例、分项/溯源断言，使用原句语义合成联系人，不写真实联系人 |
| SC55-03 | 明确相关已完成实施或实际实施职责仍计分，混合事实+诉求保留事实但不借另一意愿；中日英意愿/否定不当事实，排序/同分/弱AI≤15/缺失和舍入保持 | 同一层正例/反例及既有完整service/API/prefilter回归；相关Backend types一次，未改wire/App证据按版本关系复用 |
| SC55-04 | 固定新构建预览对原Phone账号、原78联系人、原需求的真实GET识别点单，不再因上述意愿获实施分；双端读分项一致且数据/版本原样，业务写/付费0 | Phone父保存prebuild本体快照/预算及newSHA/BUILD/entry，preview只读API↔Phone、原文分项；ja/en控制展示非持久语言PASS，原失败保留 |
| SC55-05 | 功能与结束REPORT精确commit→MAIN chat-agent固定增量合并树验收→Web重建/重启→仅验证通过产物准许Phone IPC发布/固定域名读取→普通push实核 | 准确SHA/manifest/测试/原失败及未齐、源码/环境锁释放；全SC缺一不completed，原0052失败不改写 |

## Task1：条件提取与合作依据同一评分链（TDD）

现有测试文件已有`contact`合成夹具、criteriaForNeed和scoreContactsForNeed。先加入以下真实业务RED，不另造假评分函数：

```ts
test("ordering aliases preserve the actual investor goal and one concept", () => {
  for (const goal of [
    "我现在在做餐厅AI点单系统，想认识一些合作方。",
    "餐廳點單與點餐系統合作", "餐厅点单与点餐系统合作",
  ]) {
    assert.equal(criteriaForNeed(goal).filter(item => item.id === "scenario:ordering").length, 1);
  }
});

test("a contact's own landing request is not implementation experience", () => {
  const result = scoreContactsForNeed(
    "我现在在做餐厅AI点单系统，想认识一些合作方。",
    [contact({ id: "intent", displayName: "Anonymous", role: "门店经营者",
      profileSnippet: "某机构的门店经营者。本次关注日本落地可信赖的税务与设立顾问，可提供关西合作渠道介绍。" })],
  );
  const match = result.matches[0]!;
  const implementation = match.criteria.find(item => item.id === "collaboration:implementation")!;
  assert.equal(implementation.matched, false);
  assert.equal(implementation.evidenceField, null);
  assert.equal(implementation.evidenceExcerpt, null);
  const component = match.components!.find(item => item.dimension === "collaboration")!;
  assert.equal(component.baseWeight, 20);
  assert.equal(component.points, 0);
  assert.equal(component.weight, 100 * 20 / 90);
  assert.ok(match.score !== null && match.score < 100);
});
```

- [ ] 观察完整service RED的真实别名缺失/错误合作分后，最小补existing ordering aliases点单/點單，不另建泛化同义词引擎。
- [ ] 在现有criterionMatch合作维度边界选择真正相关的事实语句；仅未来意愿、自己的需求、“可提供/希望”等不作已证明经历。明确已完成或实际负责的相关实施事实可用，否定/计划负责仍不算；句中事实和诉求并存不能一刀切丢掉有效事实，也不能跨无关句借词。原始来源字段/片段必须真实可核对，不能生成新经历或依赖姓名/机构猜测。
- [ ] 正例“曾为3家餐厅上线点单系统，完成POS对接交付”、日文/英文等价明确实施事实，以及混合已完成+寻找合作、只有意愿/否定/无关税务事实反例；合作0分仍保留该维度分母，缺整体资料和明确地区行为不改变。
- [ ] 固定Node22+既有zero-outbound preload，Web cwd完整运行下面3文件一次收口，再相关tsc一次。L不默认全量；若actualimpact触发H按RULES该受影响端一次I，保留原全量57fail/206skip，不复跑旧A52全量或修无关module。

```sh
node --test --import tsx tests/services/contact-needs.test.ts tests/api/contact-needs-route.test.ts tests/services/notification-discovery-prefilter.test.ts
node node_modules/typescript/bin/tsc --noEmit
```

- [ ] actual staged快照/准确immutable cache compare审计+白名单/依赖复核→单评分链功能commit；结束REPORT只填真实SC/RED/GREEN/SHA/未齐/句柄/预算，单doc审计commit并放锁。每同失败最多2repair/同假设3诊断，不重开原Generator。

## Task2：ROOT/Phone实际验证与集成（固定环境窗口）

- [ ] ROOT核固定功能/报告、精确增量，不整Phone祖先/覆盖用户dirty；在精确合并树必要直接检查后合chat-agent，Web/API变化先停旧主3000→新生产build→restart/health，新SC不面对旧服务。
- [ ] Phone父从原已验f8/f4基线或精确832消费正确55增量，不带未提交报名。保留旧public直到新预览真GET满足SC04；按既有unset非空串、独立TMPDIR/clear、实际compiled provider检查、preview登录及原本体/预算对比，不改原goal或联系人来迎合测试。
- [ ] 验证原四个100分案例的collaboration原文已不是直接经历，且原点单条件存在；有真实正例才展示正分，不能reseed编造。实际分数由分项决定，不靠ID打散、随意调权或给投资人漂亮分。
- [ ] 合格固定产物才Phone父自有IPC发布321xx并核固定公网真GET，失败按原IPC回退保护f4/ngrok/322xx。ROOT普通push/lsremote一致，中文交接注明两旧缺陷/locale控制/未齐项，原0052不能因本修复部分通过改为completed。
