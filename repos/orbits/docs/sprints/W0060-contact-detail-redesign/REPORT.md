# Sprint W0060 — 执行总结

协调者代写（Generator 写入 REPORT 被拦截，全文取自 Generator 最终回报）。

## 结果

- 已验证能做到：详情按原型五块重排——①头卡（档位+依据、行业「一级 / 二级」/职级四档派生名/地区 chip 点开同一编辑表单、「· 来自 {来源} · {日期}」、联系方式胶囊点击复制、「写 memo」「约 TA」）②「为什么是 TA」（对照目标、TA 能帮你、依据、已关联需求 chip 带阶段、「+ 关联到其他需求」关联后刷新、唯一下一步、为什么现在、约 TA/起草邮件；洞察 pending/failed/retrying/no_goal 显示 W0057 状态且关联与按钮可用）③三栏（D54 标签中英；只显示真实值，回退值显示「写一条 memo，AI 会帮你整理」；card_inference 浅色+「据名片推测」，话题虚线「· 推测」——协调者按 W0058 方案 (a) 决定）④最近互动（顶部快速 memo：一句+日期+保存，注明用于 AI 整理）⑤关系概览·名片备注默认收起。底部只剩「关闭」。真实页面 1440/375 对照原型，375 三栏纵向堆叠，无横向溢出，控制台 0 错误。
- 仍未验证：本机种子无 card_inference 数据，推测样式只由组件测试证明。

## 运行记录

- 结果：completed
- Generator：Claude Opus 5.5／2026-10-03；Planner revision 2（SHA256 333d1de41e68b5dba6c8bd6a19366413b8db7ca0776a0a85f7a403ce315327b9）
- 分支 sprint/W0060-contact-detail-redesign（从 W0059 c7925fc3 切出）；功能 SHA f8cf7ba2；合并 SHA：见登记表
- 档位 M（执行按 L 的验证范围）；未跑全量；付费 AI 0；未 push

## 验收结果

| SC | 结果 | 证据 |
| --- | --- | --- |
| SC-W0060-01 | pass | tests/pages/app-network-detail-modal.test.tsx（五块顺序、去留、中英标签、折叠 aria-expanded） |
| SC-W0060-02 | pass | 同文件三栏用例 + tests/services/contact-detail-profile-fallback.test.ts（VM fallbackFields、fieldSources 透传）+ tests/pages/contact-value.test.ts |
| SC-W0060-03 | pass | 同文件「为什么是 TA」三组用例 + router.refresh/起草邮件用例 + tests/services/contact-plan-context.test.ts（只调 getCurrent）+ contact-value 单测；app-plan-match-sheet onLinked 断言 |
| SC-W0060-04 | pass | 同文件快速 memo（同形 PATCH、双击 1 次、空禁用、失败保留、reload、Esc 不关）与复制（剪贴板/缺失/拒绝）用例 |
| SC-W0060-05 | pass | app-network-demo-mode.test.tsx 两条新用例（写入与约 TA/起草邮件拦截、0 请求 0 导航、无空壳）+ ~/orbit-sprint-evidence/web/sprint-W0060/run-01/ 1440-zh/375-zh/1440-en 截图、browser-results.json |

收口：28 文件 285 项全过；新增失败 5 条均为旧设计断言（概览档位、来源行「⇢ 来自」、「对方需求」标签、「▤ 写 memo」、「下一步建议」源码断言），按 RULES 5.3 改为新设计；tsc 源码 0 错误。

## 假设与额外阅读

- 额外阅读：reconnect-draft route-handlers（核实模板 0 AI）、plan-match-client、plan-snapshot-fixture、contact-detail-view-model-adapter、network-shell 样式、W0058 profileFieldSources。
- W0058 的 fieldSources 原未传到弹窗 VM：在 OrbitContactPublicProfileView 加可选 fieldSources/fallbackFields，adapter 透传；publicProfileFor 对外输出不变。
- 洞察改传 {view, quotaExhausted, goal}；NetworkInsightPanel 改为渲染整块②（保留 W0051/W0057 状态、轮询、重新生成）；新增 contact-value.ts（contactNextStep、contactWhyNow、profileColumn）供 W0061 复用。
- 「为什么现在」= 阶段前缀 + 行动 detail；detail 为空不显示；只认 linkedContactIds 恰好此人或 meta.contactId。
- readContactPlanContext 用 resolvePlanService({actorId}).getCurrent()，失败按无计划。
- 「起草邮件」复用 /api/contacts/:id/reconnect-draft（模板，0 AI），草稿在②内可编辑。
- 职级 chip 显示四档派生名，具体职级与来源放 chip 提示；location 自由文本由地区 chip 取代。
- 示例：②只在有下一步时、③只在有值时渲染；Esc 例外加 SELECT。
- impact：改动符号均 LOW；encounterFor 与 AppContactDetailPage UNKNOWN（文本搜索确认）；无 HIGH/CRITICAL。detect-changes 报 high（入口下游），不升 H。

## 交接

- 给 W0061：contact-value.ts 的 contactNextStep({insight,nextAction,language})、contactWhyNow(weekAction,t)；②首行在 NetworkInsightPanel 的 nw-why-rel（[data-insight-goal-relation]）。
- 弹窗新 props：insight?: NetworkDetailInsight（{view, quotaExhausted, goal}）、planContext?: NetworkDetailPlanContext；NetworkOpenDetail 同名字段。
- features/plans/contact-plan-context.ts：readContactPlanContext({actorId, contactId, now, plans?}) → {linkedNeeds[{needId,title,phaseNo,phaseTitle}], weekAction{id,title,detail,phaseNo,phaseTitle}|null}。
- PlanNeedLinkPanel 新增 onLinked/openLabel/openClassName。
- 无授权项；回退：revert f8cf7ba2。
