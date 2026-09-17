# Sprint 0052 — 需求匹配依据与评分改进

**Plan revision:** 1。**模式:** existing-codebase / single-generator。
**原需求:** 2026-09-16 用户要求将“一致：ai”改成简短的匹配依据总结，并改进失真的分数，新开 Sprint。
**易读目标:** [GOAL.md](GOAL.md)。**调查依据:** [AUDIT.md](AUDIT.md)。
**规划基线:** PhoneWeb `f7c8a15123b78cfa732db10c7642573b921f3dfe`，ROOT `8f00f91cd7e3637813e9b9d574b06f8dfefd1bf5`。ROOT 登记最终启动树及依赖增量后冻结本契约哈希；不预填 run 或 REPORT。

## 进入条件与执行归属

- 按 App docs/sprints/RULES.md 第0节复用用户本次改进授权，权重和短句模板是本目标内的可逆实现细节，不另建审批循环。
- ROOT 登记全局 0052、唯一实现者 `phoneweb-A-0052`，默认 `gpt-5.6-sol medium`，并固定隔离分支和精确源 SHA。一个 Sprint 一个 Generator，不增加 Evaluator 或第二实现者。
- 0050 释放共用四字典，确认匹配契约、服务和 view-model 无其他写入者；未释放前继续只读调查，不消耗 Generator run。笔记/报名锁不作为本 Sprint 可写范围。
- 在已固定源上取得适用的 fresh GitNexus upstream impact；新增符号及 linked-worktree 图盲区单列 UNKNOWN，不能把零流程解释为无影响。HIGH/CRITICAL 先报告，遵守项目索引刷新门槛。

## 评分与摘要契约

1. 先提取业务条件，区分用户自己的项目背景与寻找对象的方向。“我做餐厅点餐系统”是合作背景，不能推断用户只找开发者、只找投资人或只找门店。泛称合作允许经营试点与技术交付两个有证据的方向；明确“找投资人”时仅按投资方向评估能力。不支持的复杂否定继续要求澄清，不反转意图。
2. 将条件归为业务场景35、相关能力35、明确合作/实施经历20、用户显式地区等限制10。只对需求确实提出的维度分配权重，再归一到100；缺少联系人证据不得删掉该维度的分母。未提出具体限制时，前三项按35:35:20归一。常用别名覆盖中日英，餐厅/餐饮/レストラン/restaurant 与点餐/注文/ordering 属于业务概念；口头填充词不作为条件，拉丁词按词边界匹配，同一概念只计一次。
3. 每项只在保存的字段或证据能支持时计分。角色/明确简介可证明经营或交付相关性，不能由姓名、企业名称的想象、旧关系价值分推出能力。单独泛 AI 词或标签仅构成弱相关，总分上限15；重复标签不提高分。纯标签或明显不足的资料呈现依据不足，不能因此给确定的高分。明确地区缺失仍为待评估，不算地区不匹配。
4. API 返回实际维度权重、获得分数、证据字段/片段及摘要代码/参数，得分分项求和后统一舍入，支持核对。明确区分零命中与资料缺失。列表摘要最多两条关键依据，中文目标约20～36字、其他语言采用等价短句；模板使用界面语言，引用资料保留原文。只有 AI 词时解释弱相关和待确认项，不再显示“一致：ai”。
5. 使用 `needs-evidence-v2` 算法版本，契约/schema 配套升级并走现有 sync:contract。新 UI 能识别旧 v1 响应并明确旧评分，不将其渲染为 v2 分项；保留 goalVersion/dataVersion 的一致性检查与编辑后刷新。不同联系人证据相同可以同分，不用名字或 id 制造分差；id 仅用于稳定同分排序。

## 文件边界

- Backend cwd `repos/orbits`：修改 `features/contact-needs/{scoring.ts,service.ts,DESIGN.md}`、`shared/contract/contact-needs.ts`、`shared/api-schema/contact-needs.ts`、`tests/services/contact-needs.test.ts`、`tests/api/contact-needs-route.test.ts`。必要纯规则定义新增 `features/contact-needs/criteria.ts`，不得扩成通用推荐引擎。
- App cwd `repos/orbit-app`：修改 `src/view-models/contact-needs.ts`、`src/screens/contacts/ContactNeedsMatchesContent.tsx`、现有四字典 `src/i18n/{messages.ts,zh.ts,ja.ts,en.ts}`；修改现有 `tests/contact-needs-{view-model.test.ts,interactions.test.tsx}`。
- App `src/api/{contract,schema}/contact-needs.ts` 只允许既有 `npm run sync:contract` 生成，不手改副本。生产 Web 的其他需求匹配消费者由 impact/context 确认，存在时先追加精确适配文件及 SC 关系，再编辑。
- 本 Sprint 文档由 PhoneWeb 父维护，ROOT 持有全局登记表和主线集成。证据存受控 private 目录或 Git ignored build 目录，不进入产品源码。
- 排除关系价值评分、IORBIT 人脉分析生成、活动报名/取消、笔记生命周期、数据重播、测试账号 reseed 和模型 provider 配置。无真实业务数据改写；不改变公网域名。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0052-01 | 截图需求不再将现在/在做/一些作为条件；餐饮经营事实、餐饮系统交付事实优于仅 AI 标签，投资/市场角色没有相关证据时不能同获高分 | 现有 service 夹具新增不同证据联系人，真实调用评分函数，断言条件、顺序、分项总和和弱相关上限；不强行要求不同事实必定不同分 |
| SC-0052-02 | 摘要简短、指出实际关联与待确认项，展开能找到原始证据和分项；标签命中有标签来源；名称/重复标签/拉丁子串不能产生新能力或重复加分 | 服务证据溯源测试、App render 测试，中日英覆盖；无证据摘要不得出现已验证交付/可投融资等断言 |
| SC-0052-03 | 修改为日本制造采购或美国科技投资需求后按对应方向重排；缺必需地区或整体资料不足显示待评估，否定仍澄清；稳定同分不依赖旧关系价值分 | 保留/扩展现有排序、缺失、否定、dedupe 和 dataVersion 用例及完整文件回归 |
| SC-0052-04 | 新旧算法版本可识别，共享类型/schema 同步；并发需求变更仍冲突，编辑后页面不得显示旧版本评分当作新需求评分 | API route、service race、App view-model/交互测试、契约同步与两端 typecheck |
| SC-0052-05 | 固定新构建的 Web/API 与 PhoneWeb 通过同账号读取证实分数/依据一致，手机浏览器中日英正常，固定公网域名仍访问新产物 | ROOT 协调业务服务切换后 GET 证据、生产 build/export SHA、手机 viewport Chromium/WebKit 截图；需要需求编辑时仅在 ROOT 授权隔离验收对象验证，不改投资人当前需求造样本 |

## 一次 Generator 与最小验证

- [ ] 固定源、锁、适用批准和 Planner hash，impact 后在现有 fixture 写 SC-01/02 的 RED；运行完整 service 文件确认是业务断言失败。
- [ ] 最小规则/分项/版本实现，再做契约同步、view-model 和本地化摘要；逐项保留真实 RED/GREEN 日志，不复制示例数据到实际联系人。
- [ ] Backend 使用固定 Node `--import tsx --test tests/services/contact-needs.test.ts tests/api/contact-needs-route.test.ts`；App 使用固定 Node `--test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/contact-needs-view-model.test.ts tests/contact-needs-interactions.test.tsx`。运行契约/schema 同步消费者及两端 typecheck；受影响端 H 收口各一次必要集成检查。命令须使用各自 cwd 与已固定 Node/依赖。
- [ ] 等待 ROOT 环境窗口，再做一次目标后端生产 build 和 App production web export；不使用旧32100进程证明新算法。不修改原生设备或擅自接管 Main3000/Metro8082。
- [ ] 精确暂存、实际 detect_changes、白名单复核、提交功能 SHA；REPORT 写实际 SC 和缺项，交 ROOT 主线合并/合并树验证及 PhoneWeb 固定产物接入。未通过实际运行或主线验收不登记 completed。

本规则引擎无需模型调用；将确定性权重、上限、重试和版本策略写在代码。若调查证实需要新增模型提取才能满足已定 SC，先提出具体依赖与契约增量交 ROOT，不暗自改变本纯规则 provenance 或开第二 Generator。保留原累计预算账本，不创建新的额度。失败按 RULES 有限本地修复并原样留证；不预制完成报告。

业务切换先准确 IPC stop 旧32100/32110 supervisor，保留 ngrok supervisor 和固定 `blasphemy-unshackle-courier.ngrok-free.dev` 域名。32200/32210 冻结复现组合保持独立，Main/Metro/原生由 ROOT 管理。
