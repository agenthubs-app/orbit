# Sprint 0065 — 活动取消确认 Web 兼容契约

## 需求与启动

关联用户活动取消／再次报名要求、最新“去做吧”，以及0064 SC64-04。ROOT只读实际发现当前 Phone b957 固定消费的两取消函数仍直接调用 `Alert.alert`，真实 Web 依赖方法空实现，无 bootstrap 替换；尚未用真实已报名记录重现点击，不把源码证据误称实际页面验收。为这个具体平台遗漏新增窄 Sprint，不克隆0050/0064、不改它们的冻结契约或降低SC。

唯一 Generator 复用空闲 A 任务 `01a0a838-4974-7ea2-bc4f-8ecce28b2af2`，GPT-5.6 Sol / medium，唯一run-01。原0033仅PhaseB待批准、无产品锁，暂停对应步骤而非关闭/重开原run；本Sprint另建 `.worktrees/sprint-0065-web-event-cancel-confirmation` / `codex/sprint-0065-web-event-cancel-confirmation`，基线 ROOT Main `104ff7988`（产品9dc），完整SHA由启动核对登记。完整读RULES/本契约及0050正式报告，索引ROOT独占，已104ff刷新，actual stale再交ROOT。ROOT只管理、Git集成和真实QA，不实现产品源码。与B0064 Web配置工具独立、无路径重叠，最多两个唯一Generator，不派Reviewer/Evaluator。

## 行为与文件边界

- Web两活动取消入口使用真实可用的确认接口，例如浏览器原生confirm；只有用户确认才进入原有取消流程，保留报名、关闭、不可用都不写。确认接口不可用或抛错须明确提示没有执行，保留草稿和报名，不能静默无反应或自动同意。
- 保留当前actor/origin/event/registrationVersion/allowedActions的确认前与回调执行时校验；确认等待期间切换主体、记录或资格不可提交旧取消。原生保留原Alert两按钮及现有行为，不改CAS/receipt/readback、不新增API、不允许mock自己确认成功。
- 允许新本域适配器 `repos/orbit-app/src/platform/confirm-event-cancellation.ts`，两个实际调用点 `src/screens/events/CanonicalEventDetailModules.tsx`、`EventRegistrationScreen.tsx`，必要一个错误文案及对应四个i18n文件。允许新真实平台适配测试与受影响 canonical-event-detail-screen、event-registration-interactions、event-registration-screen-source 完整测试；必要新增具体文件先登记，不能改通用auth/hooks/offline/store/主题、DDL/共享契约或其他页面确认。
- 测试不能只mock Alert为有效实现后宣称Web支持。首RED应从旧实际Web Alert空行为/真实调用链观察不到确认或写入，再以真实Web确认接口接线求绿；原生接口用明确native fixture验证。测试自己的绑定缺项如实修复，不改生产Platform判断去迁就mock。
- 唯一 H 档App操作链：确认/拒绝/接口不可用/异常/主体变化/单次写与独立回读保护，完整受影响测试及App types；本地代码收口一次App I，保留旧/+html失败，不为纯客户端改动跑另一端Web全量。最后给ROOT冻结BASE..TREE和实际原始日志，ROOT official gate后本线commit并交接锁，不直接Main merge/push。
- Generator不访问真实账号/DB/321xx或324xx预览/Main3000/8082/Simulator/公网、付费模型或账本。ROOT独占全部真实QA。Phone协调任务只机械消费固定最终源并新建发布产物、前端导出；后端若源/依赖字节完全未变可复用0064已验证生产构建并记录，不能覆写已冻结release0064。最终PUBLIC仅ROOT明确窗口后切，原0063完整回退与入口不变。

| SC | 可观察结果 | 主要证据 |
| --- | --- | --- |
| 65-01 | Web点击确有确认，保留/关闭不调用取消，确认只调用一次 | 实际Web依赖相关RED→GREEN及两实际消费者完整测试 |
| 65-02 | 无确认能力/抛错/actor或资格变化时不写、保留资料并准确提示 | 平台边界与当前scope/authority反例测试 |
| 65-03 | 原生Alert两按钮行为及原CAS/receipt/独立回读保护不变 | Native fixture消费者、必要types及一次App I；不冒称真实Native取消已完成 |
| 65-04 | 配置修复后同Phone QA正常页面完成取消与再次报名，正式回读一致、旧记录资料保留 | ROOT唯一真实验收窗口；模型问题用独立预览既有no-paid外层守护正常确定性回退，不冒称真实AI验证 |
| 65-05 | 固定功能/报告提交合入chat-agent并push；Phone消费新产物在原公网入口实际加载、可回退 | 官方fixed-tree gate/合并树验证、真实entry与健康/远端SHA |

同因非预期失败最多两轮必要修复，不重开Generator；全部必需SC未齐不completed。报告执行结束后才创建，列真实RED/GREEN与旧失败、准确SHA、原生/公网尚未证明的范围、源与预览区别、预算原字节与未完成SC。完成整体修复需要0064与本依赖的实际证据，不将代码交付当公网取消成功。
