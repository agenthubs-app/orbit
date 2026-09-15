# Sprint 0024 — 人脉需求与匹配排序

Plan revision: 1。模式 existing-codebase / single-generator。原需求：用户明确批准 assets/concept-v2.png 并要求创建0024、开始实现。目标及视觉以 GOAL.md、DESIGN.md 为准；设计批准已满足，不重复审批。

## 基线与依赖

主线读取基线42edbdc15270aa3ed7c926dfedafe49abe51ae92，C工作树HEAD fca77373f123c03e29a0584cba46bade5f5eb907。旧C0009/0010/0022及B依赖副本保留；启动前归档差异，按协调者确认的发布版本衔接。共享ContactsScreen和i18n字典由0014持有时不得覆盖，先实现独立服务/组件。实际run登记、锁和基线以全局README为准；Git仍由协调者串行管理。

## 技术决策

复用 GET/PUT /api/profile 的 relationshipGoal、expectedUpdatedAt、mutationId 和严格回执确认，主页与匹配页使用同一需求编辑组件。取消不写入；失败保稿，409刷新最新版本但不自动覆盖服务器；切换身份/服务器立即清空旧状态，晚到响应不得回填。

新增 GET /api/contacts/needs-matches，只使用认证actor，忽略客户端actor身份。服务通过现有ProfileService和ContactsListSearchAndFilterService读取本人需求、可访问联系人全量；不在App复刻业务评分。读取失败返回503，不落回mock或旧关系分。需求为空返回未配置，读取时先后校验profile版本，变化返回409，客户端刷新。已有通用关系分、关系阶段不修改。

评分规则 needs-lexical-v1：以NFKC归一化的当前需求提取词语，去掉“寻找/希望/合作伙伴”等表达意图的停用语；复用行业字典识别三语行业条件，常见地区及采购/投资等资源语义使用显式别名。对需求中实际存在的条件等权计分：100 × 已有证据命中条件数 / 条件总数，取整数；不加入既有关系价值/强度。匹配依据逐项返回原需求条件、命中字段和已有资料摘录；未命中不编造证据。行业和地区条件仅在相应字段或明确文本存在时可判断，缺所需字段的联系人归为资料不足、score=null；没有实质条件也不给分并提示补充需求。规则只做词语/别名匹配，不声称理解任意复杂自然语言、成功概率或AI评估，页面依据说明此范围。

服务端先按contactId去重，全量评分后按score降序、id确定性升序；资料不足最后。首版一次返回完整当前可访问列表，不新增分页端点、不对客户端第一页局部排序。响应含goal、goalVersion（profile updatedAt）、dataVersion（参与评分字段canonical hash）、scoringVersion、generatedAt；版本与数据一起返回，不混用新目标和旧分数。再次打开/主动刷新重新读取，保存需求后立即隐藏旧评分并重读。只读请求不调用模型、不写业务数据。联系人详情与返回使用现有路由。

报告卡移动到每个分析分段的末尾，名称“人脉分析报告”；操作“去 IORBIT 分析”，解释“进入后可修改问题，发送后生成报告。”保留原可信会话来源与版本验证。机会刷新单独标注“刷新机会”，只调用现有机会重算。字号复用30/38主页标题、16/22导航标题、15/20联系人姓名、12/17详情及现有15/23正文；不改tokens。

## 文件范围

App：docs/sprints/0024-contact-needs-ranking/**；新增 app/contacts/matches.tsx、src/screens/contacts/ContactNeedsEditor.tsx、ContactNeedsMatchesScreen.tsx、src/hooks/useContactNeeds.ts、src/view-models/contact-needs.ts；修改 src/screens/contacts/ContactsScreen.tsx、ContactsDashboardScreen.tsx、src/api/endpoints.ts；src/i18n/{messages,zh,en,ja}.ts仅新增本功能文案；src/api/contract/contact-needs.ts、src/api/schema/contact-needs.ts仅sync生成。测试 tests/contact-needs-{interactions,view-model}.test.ts(x)、contacts-analysis相关受影响现有测试。

Web/API：新增 shared/contract/contact-needs.ts、shared/api-schema/contact-needs.ts、features/contact-needs/{scoring,service,service-factory}.ts、features/contact-needs/DESIGN.md、app/api/contacts/needs-matches/{route,handler}.ts、tests/services/contact-needs.test.ts、tests/api/contact-needs-route.test.ts。必要合同转发/索引或测试夹具按RULES §0先登记追加再修改。既有profile、contacts数据服务默认只读复用。

排除：生产部署、数据迁移、独立AI推理、批量更改联系人、修改通用关系强度、增加主页分数、其他Sprint未提交修改。原$5累计模型预算保持；本轮测试取消provider key、不触发付费模型。

## 验收契约

| SC | 可观察行为 | 主要证据 |
| --- | --- | --- |
| SC-0024-01 | 主页轻量入口：未填精确“您还没填写您的人脉需求。”；保存后摘要/排序；过滤列表/字号保留 | 真实组件交互；取消、失败、清空、409保稿；iOS同视口 |
| SC-0024-02 | 独立页针对当前需求全量排序；分数/依据真实、资料不足null、去重同分稳定 | 服务测试：同组联系人两种需求改变顺序、空需求、稀疏资料、同分、重复ID；HTTP契约 |
| SC-0024-03 | 不混用目标版本，身份/服务器隔离；只读匹配无业务写入 | 换号及延迟响应、版本冲突、503/伪回执；真实请求边界计数 |
| SC-0024-04 | 分析页无目标大卡；报告在三个分段末尾；机会刷新与主动发送分离 | 渲染/交互三分段及报告空/有/旧状态，验证点击只产生对应操作 |
| SC-0024-05 | 同账号Web/App需求回读一致；iOS填写→排序→依据→详情→返回；三语及动态字号沿用规范 | 共同本地版本、同记录双向回读，原生关键链路；类型/契约同步 |

## 执行与验证

按既有符号upstream impact → 服务/边界RED → 真实实现 → UI交互RED与接线 → 直接测试GREEN完成一个操作链。新算法不以静态文字断言替代。身份/共享契约为H档；代码收口冻结后受影响两端各一次全量及typecheck，局部失败按RULES §5最多两轮修复并跑完整受影响文件，不重复全量。缺真实业务证据单列，不能把类型检查当跨端完成。

一个run-01持续到验收/真实受阻；不新增Generator/Evaluator。完成后向协调者提交限定路径不可变补丁、源码版本、验证与遗留项，取得提交SHA后创建REPORT；不提前创建完成报告。中断写checkpoint保存句柄和未完成动作，继续同一次run。
