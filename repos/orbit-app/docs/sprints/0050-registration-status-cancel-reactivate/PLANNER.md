# Sprint 0050 — 报名原因与取消／再次报名闭环

唯一 SprintContract，revision1，existing-codebase / single-generator。原需求：2026-09-16 用户截图两项要求，关联 R-04、0004、0043、0049 和 Phone 已批准的本人取消修复。目标见 [GOAL](GOAL.md)，设计见 [AUDIT-DESIGN](AUDIT-DESIGN.md)，步骤见 [中文实施计划](../../../../../docs/superpowers/plans/2026-09-16-sprint-0050-registration-lifecycle.md)。

## 基线、依赖和唯一实现者

目标主线 chat-agent，规划主线 8f00f91cd7e3637813e9b9d574b06f8dfefd1bf5；执行基线固定 Phone f7c8a15123b78cfa732db10c7642573b921f3dfe，其parent为dd2ae559c73396f4911c302bbe88801ab9300941，已含 PW0012 canonical 详情、0049 问卷与正式提交的本人取消修复。只消费本 Sprint 增量及必需固定依赖，不把 Phone 全部祖先或未提交残留合入主线。

Phone 原取消修复八路径已完成唯一提交f7c8a15123b78cfa732db10c7642573b921f3dfe，139+/22-，逐blob等于冻结回执；patch SHA256 e9a9eca316597952265eb2cdcd72d31599e2ad36ee7402363caf3b72865ab8a6仅作历史来源。实际linked detect为8files/22symbols/0flows，但Phone索引落后33提交，交接明确UNKNOWN不冒零风险；ROOT已独立核对commit八路径stat。原作者已释放取消域，Generator从固定基线继续完整链，不重做旧修复、不重复旧十条取消。现有合法窗口缺项只阻对应真实保存验收。

唯一 Generator GPT-5.6 Sol / medium，run-01，独立分支 codex/sprint-0050-registration-lifecycle-clarity。ROOT仅规划、文件锁、Git集成、服务与设备实际验收。C49源码已冻结，本轮暂挂其后续执行槽，保留原SC和commit；E46继续暂挂，D45原run不扩域；不新派Reviewer/Evaluator，不重开已结束run。

## 白名单与排除

- App修改 src/view-models/event-registration.ts、src/screens/events/EventDetailScreen.tsx、src/screens/events/EventRegistrationScreen.tsx、现有 PW0012 src/view-models/canonical-event-detail.ts、src/screens/events/CanonicalEventDetailModules.tsx、src/api/canonical-event-detail-contract.ts。新建 src/view-models/event-registration-status.ts 及 tests/event-registration-status.test.ts。四字典仅本Sprint新增键，ROOT独占授予；任何同文件前序未提交内容不得覆盖。
- App完整直接测试：tests/event-registration-interactions.test.ts、tests/event-registration-view-model.test.ts、tests/canonical-event-detail-contract.test.ts、tests/canonical-event-detail-view-model.test.ts、tests/canonical-event-detail-screen.test.ts；必要新增tests/canonical-event-detail-interactions.test.ts先在checkpoint登记用途，不伪称已存在。必要locale/route/offline消费者先impact后登记，不顺手修旧孤项。
- Web修改 features/events/registration/contract.ts、eligibility.ts、deadline-gated-service.ts、runtime.ts、storage/event-operations-window-provider.ts、app/api/events/[id]/registration/route-handlers.ts、cancel/route-handler.ts、app/(app)/app/events/[id]/register/event-registration-workspace.tsx 和 app/(app)/app/canonical-event-detail-view.ts。只做原因传播、取消／恢复必要接线，不改原provider、签名题协议或全局认证。
- 八路径取消依赖中的 participant.ts、canonical-membership-writer.ts、canonical-registration-repository.ts 及对应三测试只先原样消费合法固定增量；新修改须准确impact并登记与SC02/03的直接关系，不能扩展到共享LiveStore／事务锁序／journal架构。
- Web完整直接测试：tests/services/event-registration-eligibility.test.ts、tests/capabilities/event-registration-deadline-gate.test.ts、tests/api/event-registration-routes.test.ts、tests/api/event-registration-deadline-route.test.ts、tests/services/event-operations-canonical-registration.test.ts、tests/pages/event-registration-workspace.test.tsx；新增 tests/api/event-registration-blocking-reason.test.ts。保存／恢复路由传递消费者按实际impact登记。
- 排除：任意真实migration、活动配置／角色／日期自动补齐、退款/邮件/推送/日历副作用、新报名系统、审批政策扩展、已结束活动开放、AI prompt/model/loop/预算重置、离线写入权限扩张、笔记／通知／共享同步基础重构、复现工具322xx、覆盖用户或Phone未提交文件。

## 五项验收契约

| SC | 可观察行为 | 真实验证与反例 |
| --- | --- | --- |
| 0050-01 | 详情／报名页显示具体业务原因；配置问题与读取失败分开，不再出现裸“暂不可操作” | App纯状态／canonical schema与真实组件，Web GET；缺原因旧payload安全兼容，非配置错误不冒配置问题；三语切换 |
| 0050-02 | 允许取消的本人报名在详情和报名页都有可发现入口，明确确认后收到正式取消回执并回读 | 两端交互与API/真实PG直接测试；无head已有membership可取消，legacy_importing/越权/错版本仍拒，失败保原报名 |
| 0050-03 | 取消后开放期可明确再次报名，正式 reactivate 并回读同一报名；不具资格时说明原因 | cancelled→rsvped API/service/UI链；signed answers、profile语义、registeredAt/reactivatedAt、名单状态正确；截止/取消活动/结束/admission不绕过 |
| 0050-04 | 双击、取消后旧回包、切号／切活动、409、503和重试不重复写、不串资料、不假成功 | 单飞/actor+server+event+revision/实际receipt反例，JSON错误无隐私泄漏；旧答案展示不伪造签名、空配置不自动provider调用 |
| 0050-05 | 固定源码 Web生产重建重启后，PhoneWeb和主8082 Simulator完成状态说明、取消→再次报名→独立回读 | ROOT锁定合法本人账号/准确可写活动/恢复边界，两端同记录Web↔App回读；公开Phone双引擎/Simulator交互，固定SHA/BUILD/PID/health；缺合法窗口不得用mock冒通过 |

## 验证与交付

先读根和两端 AGENTS、bridge/status与handoffs、RULES、本设计和计划、0004报告与0049/PW0012实际差量。Planner SHA256启动登记；symbol upstream impact 必须在修改前，HIGH/CRITICAL先告警，Phone或新符号UNKNOWN补源消费者。若ROOT统一索引 stale，由ROOT单次刷新，不各线重复analyze。

按计划TDD；本地新UI可先零外联完成。H链定向覆盖身份、失败、并发及传递消费，完整相关端types；本地代码收口受影响两端各一次I全量，保留原日志、失败和skip，只修新受影响项后跑完整文件，不无依据重跑全量。字典改变做已有同步检查，生成契约只走既有sync渠道；不手写生成副本。

Generator不控制任何现有服务／Simulator／真实账号／DB／provider，不自动POST或默认GET生成问题。ROOT所有MAIN3000/Metro8082/device；Phone32100/32110由现supervisor管理，换产物前经控制socket正常stop防旧进程复活；独立322xx保持。必要真实模型QA沿原唯一$5累计账本、精确目标和出站owner，不因用户费用可接受重置上限。任何真实fixture不能从未知管理员配置／凭据推断授权。

每个非预期失败最多两本地repair；同假设只读最多三次，不启动第二Generator。run结束创建真实REPORT，逐SC pass/fail/missing，必须保留未完成项。可独立安全交付增量 path限定commit + actual staged detect（linked ROOT盲区如实UNKNOWN）→完整最终SHA/报告SHA/残留交ROOT→安全精确merge chat-agent→合并树受影响测试/types/production与运行验证→适用普通push/独立远端核对。缺任何必需SC或未merge不能completed；取消成功不是整活动／0049／全域离线完成。
