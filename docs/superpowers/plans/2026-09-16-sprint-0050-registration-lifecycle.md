# Sprint 0050 报名状态、取消与再次报名实施计划

> Agent按单一Generator执行本计划，遵守Sprint RULES，不调用用户禁用的brainstorming/executing-plans，不派Reviewer/Evaluator。用户已选择子任务执行，不重复执行方式菜单。

**Goal:** 清晰解释活动报名限制，并完成本人取消→再次报名的真实闭环。

**Architecture:** 服务端产生可选细分原因，保留原eligibility state/reason/allowedActions；App共享VM与普通Screen实现PhoneWeb和原生入口，复用原mutation/receipt与reactivate事务。原取消八路径只消费固定提交，不靠配置伪造或新报名旁路。

**Tech Stack:** Node22、Next.js、TypeScript、React Native/Expo、Zod及既有Node test/浏览器交互夹具。生产SQL仅原事务路径；不新装测试框架。

**Spec:** [0050契约](../../../repos/orbit-app/docs/sprints/0050-registration-status-cancel-reactivate/PLANNER.md)和[中文设计](../../../repos/orbit-app/docs/sprints/0050-registration-status-cancel-reactivate/AUDIT-DESIGN.md)。

## 全局约束

run-01唯一Sol medium；执行基线f7c8a15123b78cfa732db10c7642573b921f3dfe固定，已含正式取消修复及dd2问卷/详情背景。只实现两个用户目标，不改既有活动／报名截止策略、不DB直写，不由子任务重启共享服务。0真实出站基线与TDD；只读注册GET使用questions=false。每失败最多两repair；H收口每受影响端一次I，不重跑旧全量。所有真实账号/事件/恢复/window与费用由ROOT登记。正式保存与取消必须独立回读，不用UI乐观状态验收。

## Task 1 — 原取消依赖与准确基线

文件：读取Phone冻结八路径、0004报告、本契约和设计；在ignored build/harness-state/evidence/sprint-0050/run-01/checkpoint.md登记实际head/hash/源锁/依赖提交及未齐动作。

- [ ] 核对独立worktree归属、固定f7c8及dd2祖先、tracked clean、node_modules既有链接；不复制.env或账号数据。
- [ ] 完整读取固定取消commit的八路径diff，与冻结patch/逐blob核对；取得前先读原来源，不把未提交patch纳入本线成果。
- [ ] 对实际待改符号运行orbit-root upstream impact；图谱方法/Phone模块缺失按UNKNOWN列出实际route→runtime→service→canonical writer→membership消费者。ROOT先协调stale统一刷新。
- [ ] App完整registration-view-model/interactions，Web完整eligibility/deadline/routes作为相关基线。旧DB环境失败按名保留，不拿guard禁用DB制造通过，也不因此停止纯UI工作。
- [ ] 仅在ROOT发固定取消SHA及唯一接线窗口后机械消费该commit；cached检查只能八路径，不复制全Phone祖先、bridge或复现tools。

## Task 2 — 真实原因传播与可读状态

文件：Web registration/contract、eligibility、runtime、window provider和GET route；App canonical schema、event-registration-status新模块、event-registration VM、四字典；各完整消费者测试。

接口：保留 EventRegistrationEligibility.reason===state，新可选 blockingReason 为 configuration_required | migration_in_progress | invalid_window | temporarily_unavailable。不可读取的私有配置不返回；枚举只由实际server窗口读取产生，旧payload缺字段兼容。App新模块输出标题、说明和可重试属性；UI权限仍只由原allowedActions决定。

- [ ] 在新 tests/api/event-registration-blocking-reason.test.ts 用已有GET工厂依赖注入与零外联夹具写RED：缺配置200应明确configuration_required，连接异常保持503而非配置原因，questions=false无question/provider调用。
- [ ] 新App完整状态测试锁RED，不允许空policyVersion推断缺配置；缺字段、未知原因、读取失败、未开放、截止、结束、活动取消与名额满分别显示正确文案。
- [ ] 在现有window读取处保留原availability语义，必要新增 {availability,blockingReason} 窄返回并接GET；不重复无界DB读取，不改变POST的截止校验。
- [ ] canonical schema保留新字段、严格身份与reason/state一致验证；普通VM使用locale字典自然语言，UI未知原因安全回退。
- [ ] 运行上述完整文件与相关类型检查，检查所有状态来源；禁止仅换“暂不可操作”为另一个笼统词。

以下测试直接补入现有eligibility完整文件，复用该文件已存在event/evaluatedAt/registration夹具，不复制另一套模型：

```ts
test("cancelled registration reactivates only while the public window is open", () => {
  const original = registration("cancelled");
  const open = resolveEventRegistrationEligibility({ event, evaluatedAt,
    legacyAvailability: "open", registration: original });
  assert.equal(open.state, "registration_cancelled");
  assert.deepEqual(open.allowedActions, ["reactivate"]);
  const closed = resolveEventRegistrationEligibility({ event, evaluatedAt,
    legacyAvailability: "registration_closed", registration: original });
  assert.equal(closed.allowedActions.includes("reactivate"), false);
});
```

## Task 3 — 详情取消入口及再次报名接线

文件：共享App EventDetailScreen、EventRegistrationScreen、CanonicalEventDetailModules、canonical VM；Web canonical-event-detail-view、registration workspace，现有完整交互／路由测试。

接口：消费既有EventRegistrationView.canCancel/cancelLabel/allowedActions/registrationVersion；取消提交intent=cancel+expectedRegistrationVersion；再次报名提交已有register POST的intent=reactivate+合法签名answers/version。成功仅以当前actor/event/record/action/version的真实mutationReceipt并独立GET核对。

- [ ] 写交互RED：详情已报名允许cancel但update禁用时仍可发现取消入口；点击弹确认，关闭确认不写，确认只一次正确POST。
- [ ] 写取消失败／409／错回执RED，禁止假“已取消”；成功GET更新列表／详情／报名页，取消后显示再次报名或可信禁止原因。
- [ ] 写开放cancelled再次报名RED，确认后intent=reactivate，不重建另一个记录；既有answers合法回读，但签名questions更换需重确认。
- [ ] 用既有request单飞/revision/scope/receipt helper最小接线；旧cancel ACK不得覆盖后来的reactivate状态；切号/切event立即隔离私有状态。
- [ ] Web同样接线；admission withdraw/apply保持原策略，不能改成legacy reactivate；缺配置新报名仍失败且说明准确。
- [ ] 完整registration/canonical交互及API/deadline/PG直接消费者覆盖二次取消/重复重报、旧版本、安全404、状态变化和profile保留。无合法独立PG测试目标时标未执行，不连MAIN DB顶替。

## Task 4 — 冻结、检查与真实跨端交接

- [ ] 本地变更冻结后完整定向文件、两端types、字典sync；仅受影响端各一次I，保留旧/环境失败和guard拦截。新增受影响失败只两repair后跑完整文件，不无依据重复全量。
- [ ] 逐SC核对实际diff和证据；明确旧取消依赖fixed SHA与本Sprint新增能力，不能把旧十条取消回执当新reactivate成功。
- [ ] path限定stage与actual detect，linked ROOT盲区以UNKNOWN+本worktree准确git diff/cached补充；本线commit不夹用户或Phone残留。
- [ ] 给ROOT完整40位功能SHA/branch/必要dependencies/测试完整counts和失败名/未提交残留；ROOT与Phone协调者先production build/restart，再公开Phone和主8082Simulator实际同记录交互。
- [ ] ROOT登记合法本人活动和精确取消/再次报名/恢复边界；无配置且无主办者合法配置路径时仅验证原因负例，SC05真实保存保持missing，继续其他独立可验动作。
- [ ] 必需恢复/独立回读完成后真实REPORT按SC列pass/fail/missing，本线报告commit→ROOT机械merge chat-agent→合并树验证→既有授权普通push/独立远端核对；未齐不能completed。
