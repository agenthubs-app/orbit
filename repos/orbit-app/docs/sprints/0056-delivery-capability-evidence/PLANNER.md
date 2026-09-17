# Sprint0056 — 交付能力事实选择执行计划

> 执行采用项目RULES单Generator流程；不调用已卸载brainstorming／executing-plans、不增加评审代理，不重开0052或0055。

**Goal:** 修正delivery能力从本人客户诉求借词得分及误导摘要，不改变已保存资料。
**Architecture:** 在既有scoring内为`capability:delivery`选择合格原字段子句，其余criterionMatch分支和0055collaboration规则不变；grounded摘要继续由真实matched criteria生成。
**Tech Stack:** 既有TypeScript、Node22／tsx、共享v2只读契约及现有Node test。
**Spec:** [GOAL.md](GOAL.md)、[AUDIT.md](AUDIT.md)，关联R-09／R-12及0052 SC02／03、0055新真实预览所暴露的未改能力分。
**Baseline:** 产品基线MAIN`d9cbf4918976f5b009d04a4af618cff7563f52e5`；后续仅本计划／启动登记文档可在新隔离树基线继承，精确SHA由README登记。不从Phone移动HEAD获取产品基线。

## 进入条件和文件边界

- RULES0／7复用既定准确评分、资料取证和持续推进批准；这是原失败SC的必要窄修正，不克隆原Sprint或降低目标。ROOT登记owner、run-01、隔离树、实际基线及Planner hash后启动唯一Generator。
- Web独占`repos/orbits/features/contact-needs/scoring.ts`、同目录`DESIGN.md`及`repos/orbits/tests/services/contact-needs.test.ts`；必要新增测试先用途／SC／实际影响登记，默认不新增产品文件。
- service.ts、criteria.ts、API route、notification-prefilter、shared/schema、App/四字典、笔记／活动／日程／offline／provider／工具配置均不修改。若出现真正依赖冲突，隔离具体动作并交ROOT，不扩通用语义引擎。
- GitNexus提示stale先由ROOT sole writer正式刷新；完成后执行待改符号actual upstream impacts，HIGH／CRITICAL先报告。新helper UNKNOWN补真实源码caller，不视为零风险。相同未改caller的有效分析按RULES4复用。
- 本线仅合成夹具和零外部调用定向检查；无真实账号／数据库／需求／联系人／偏好／服务／缓存／provider写操作。ROOT持主3000、8082、Simulator；Phone父持321xx／暂324xx／ngrok／冻结322xx。原AI/OCR累计$5账本不重置，本线费用0。
- `needs-evidence-v2`、35/35/20/10权重、弱AI15上限、缺资料分母、最终一次舍入、source字段、UTC／版本／schema和服务两次profile一致性保持；仅正确选择能力依据，不能按姓名／ID或指定漂亮总分调规则。

## 最多五项验收

| SC | 可观察结果 | 主要检查 |
| --- | --- | --- |
| SC56-01 | 匿名市场负责人自身“关注CRM集成试点客户”不算delivery能力；matched=false／strength=none／字段和excerpt为null，能力points0且base35／分母保留；摘要不再引用delivery | 真实scoreContactsForNeed完整service测试新增明确反例，原文及权重字面断言 |
| SC56-02 | 中日英本人寻找开发者／试点客户、将学习或希望成为工程师、未交付／否定、公司名字借开发词均不能算其能力；混合事实／诉求只保留合格原文 | 同完整文件的角色／profile／relationship／evidence原字段正反例，不创建假API／UI或只测私有helper |
| SC56-03 | 实际developer／engineer／店长职业、明确点单开发／实施职责、已完成交付，以及明确本人可提供开发或门店试点服务保留；0055实施资格仍独立且原ordering／排序／弱AI／race／API／预过滤不退化 | 完整受影响service／API／prefilter回归＋Backend typecheck一次；无App/wire变更复用精确对应源消费者证据，L不默认full |
| SC56-04 | 新固定Phone生产预览原账号78联系人／需求／版本／本体／预算不变；该实际对象能力0、摘要不借愿望，合法正例依据真实，API↔Phone一致，三语显示受控范围明确 | ROOT／Phone原raw对照、新GET／截图／来源；真实zh及明确非持久ja/en。按RULES5.4核适用同账号原生环境，缺项保持blocked，不伪称App往返或真实全天 |
| SC56-05 | 产品和中文报告固定提交，ROOT精确合chat-agent并验证incoming tree；主Webstop→新生产build→start／health、普通push／实际远端核；新前置合格后才Phone发布并公开核 | 正式cached快照审计／差量清单／合并SHA／PID／BUILD／entryhash／公开receipt，失败保留f4完整可回退产物 |

## Task1：能力依据到摘要的同一操作链

**Files:** 仅上述scoring.ts／DESIGN.md／既有service测试。
**Consumes:** 既有`scoreContactsForNeed(goal: string, inputContacts: readonly ContactListItemContract[])`、criterionMatch、evidenceSources、containsAlias及真实`contact(overrides)`测试factory。
**Produces:** 未改变的v2响应；只改变delivery对应matched／excerpt及据此自然产生的components／summary。新增`deliveryEvidence(contact: ContactListItemContract, aliases: readonly string[]): readonly [string, string] | undefined`限scoring.ts、仅criterionMatch调用；候选来自evidenceSources原字段，role需实际职业陈述，其他字段子句需明确职责／完成动作／本人当前提供服务，排客户需求与否定／未来身份。无依据返回undefined，实际用途和UNKNOWN登记后实现，不复用整字段命中充当fallback。

- [ ] 先在真实service文件写下列RED；保留原生／Phone新实际失败，不抹0052全量或55的独立通过。

```ts
test("a pilot-client request does not prove the contact's delivery capability", () => {
  const match = scoreContactsForNeed(
    "我现在在做餐厅AI点单系统，想认识一些合作方。",
    [contact({ id: "delivery-intent", displayName: "Anonymous", role: "市场负责人",
      profileSnippet: "某餐饮机构的市场负责人。本次关注「餐饮预约 CRM 集成试点客户」，可提供「种子投资人视角的筛选与创业者反馈」。" })],
  ).matches[0]!;
  const evidence = match.criteria.find(x => x.id === "capability:delivery")!;
  assert.equal(evidence.matched, false);
  assert.equal(evidence.strength, "none");
  assert.equal(evidence.evidenceField, null);
  assert.equal(evidence.evidenceExcerpt, null);
  const part = match.components!.find(x => x.dimension === "capability")!;
  assert.equal(part.baseWeight, 35);
  assert.equal(part.weight, 100 * 35 / 90);
  assert.equal(part.points, 0);
  assert.ok(!match.summary!.criterionIds.includes("capability:delivery"));
});
```

- [ ] 加实际职业／职责／完成／本人供给正例与中日英诉求／否定／未来／公司名反例，尤其区分“可提供门店试点场地”和“希望找试点客户”。期望excerpt为原字段中的字面子句，不能由待改helper计算期望。
- [ ] 使用固定Node22、`NODE_OPTIONS='--import /Volumes/ORICO/Dev/phoneweb-pw0010-validation/zero-outbound-preload.mjs'`，cwd隔离树`repos/orbits`，运行`node --test --import tsx tests/services/contact-needs.test.ts`，确认业务RED非loader错误。
- [ ] 最小产品接线形状如下；判定谓词在同文件纯规则中表达，不调用LLM、不添加身份／provider／管理路由，不重构0055实施规则。

```ts
// 在criterionMatch已有source选择处分支；deliveryEvidence沿用原字段，
// 区分实际职业／本人已宣称能提供的服务和其寻求的对象，返回原文子句。
const source = definition.dimension === "collaboration"
  ? implementationEvidence(contact, definitions, definition.aliases)
  : definition.id === "capability:delivery"
    ? deliveryEvidence(contact, definition.aliases)
    : candidates.find(([, value]) => containsAlias(value, definition.aliases));
// structuredIndustry／weak fallback维持原来非delivery语义；
// 无合格delivery证据不能再fallback到整段诉求或tag。
```

- [ ] GREEN后完整运行`node --test --import tsx tests/services/contact-needs.test.ts tests/api/contact-needs-route.test.ts tests/services/notification-discovery-prefilter.test.ts`及`node node_modules/typescript/bin/tsc --noEmit`，guard0／0skip；只有实际H按RULES做一次受影响I，不重复旧全量。真实分项汇总／来源不能靠改测试降低SC。
- [ ] 更新DESIGN一次记录能力声明与实施经历的差别、保守三语规则及来源限制；完整产品差量和实际cached tree交ROOT官方immutablecompare审计后，仅三路径批量feature commit。tree变动重审，不用ROOT空staged审计；不逐helper拆commit。

## Task2：交接与真实预览

- [ ] 本线实际结束后创建中文REPORT，逐SC写本地证据／仍缺项／原失败／fixed source SHA／预算0与句柄、锁释放；报告单doc另真实cached审计提交，不预填自身SHA／公共通过。
- [ ] ROOT核固定feature／report、源等价与tree，精确合main并跑受影响定向集；按RULES执行生产重建和远端核，不混Phone祖先／dirty。
- [ ] Phone父机械接固定增量，原账号只读预览对照匿名原失败对应实际ID（测试不用姓名规则）；能力分0是正确取证结果，不指定总分，原资料及预算不写。原0055ordering／协作0及已有personal分钟结果保留；新前置完整通过交ROOT后才IPC发布321xx／公开GET，新错误则不发布或回退已验f4。

## 失败、停止与恢复

本Sprint唯一run。预期RED按TDD；非预期同一失败最多两轮本地修复，原假设最多三次只读诊断，不能提高限额或启动评审／第二Generator。缺真实账号或同端环境只阻塞相应SC，独立本地部分继续；实际closed报告不得当恢复重开。已验证局部可按RULES路径限定提交／兼容合入，但所有必需SC未齐不completed。新的无关能力／场景或其他域问题记录具体失败交ROOT，不扩大此轮所有能力抽取；不造投资人数据、不清库／重置账户。
