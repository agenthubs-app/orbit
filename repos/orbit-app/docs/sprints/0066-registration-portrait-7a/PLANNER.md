# Sprint 0066 — 7a 活动报名与独立画像契约（中文已批准）

**Plan revision:** 1。**模式:** existing-codebase / single-generator。**原需求:** 2026-09-17 用户指定 ZIP 的 7a 设计和参考代码；承接 R-04／R-09、0049、0050、0064／0065，不重开它们的 run。

**目标:** [GOAL](GOAL.md)。**设计与已查差异:** [DESIGN](DESIGN.md)。本页是本 Sprint 唯一验收契约，不提前创建 REPORT。

**规划基线:** 本地 Main `157ae8605616e0880f684a1c813a795ac76383cc`；已知远程 Main `29efb4c9d460b97ef526578d051e824592f52555`。执行前由 ROOT 明确纳入同事提交后的冻结基线和增量消费边界，不自动整体合并 Phone 私有祖先或生产切换支线。本轮不因设计工作自行 pull、部署或重启现有展示服务。

## 进入条件与责任

用户已明确选择 7a 外观，无需重新选颜色、画板或视觉方向。2026-09-17 用户回复“确认”，批准本契约及三项新增数据行为：历史答案可修改；画像可独立保存且不报名／取消／再次报名；画像本人可见，其他人中仅有权限主办方可见。同范围恢复不重复请求批准。先完成普通启动检查、协议细化和文件锁，再开始产品编辑。

ROOT负责规划、唯一 owner／文件锁、固定 SHA 集成、真实浏览器与设备验收。唯一实现者复用空闲B任务 `01a0a879-e8fe-77e3-b748-bd78005aecc8`，GPT-5.6 Sol / medium，独立分支 `codex/sprint-0066-registration-portrait-7a`／worktree `.worktrees/sprint-0066-registration-portrait-7a`；唯一 Generator/run-01，不派 Reviewer/Evaluator 或第二实现者。README 是运行状态唯一来源。

启动须核对最新主线与相关 diff、前序 0050／0065 REPORT、当前报名／画像／字典锁、已批准的后端持久化方案与可识别自有 QA 对象；冻结本契约 SHA256。协议拓扑与迁移方案确认前不允许用客户端存储伪造后端能力。GitNexus 的旧索引不能证明新增改动安全；ROOT解决索引新鲜度后，各待改符号 upstream impact，HIGH/CRITICAL先报告，UNKNOWN补源码调用检查。

## 行为边界

1. 三视图为报名资料、画像追问、画像结果，保留一个按 origin＋canonical actor＋event 隔离的编辑 session。返回报名／查看画像不重新生成、不重复写入、不丢答案；刷新、切账号／环境／活动遵守既有 scope、epoch 与权限规则。二级页面不出现主 Tab 底栏。
2. 题目和选项来自正式问题快照，编号与必答数来自实际题集。普通单选、唯一其他入口、其他空值校验、回读自定义答案和无选项开放题沿用0049。不得擅自压缩服务端签名题干、替换原选项或重算题集 hash；现有题干可能较长时允许自然换行，不以像素还原为由删题意。
3. 当前动态题突出显示，过去回答变成紧凑复核表；“全部”打开完整可滚动复核列表。历史包含可信字段标签、答案及可获得的真实题目快照，不虚构旧题原文。保留用户此前要求的历史可查看；本次7a替换展示形式，不回退成回答一题就看不到上一题。
4. 历史“改”明确编辑未提交草稿；已持久化报名资料仍服从原 allowedActions/update 政策，不偷偷开放旧不可修改报名。签名问题与答案必须保持对应，失效 token 不自动伪造或重签；依赖旧答案的后续题及旧画像标为失效，提供明确重新追问／生成入口。编辑取消保留原值；失败保留草稿；双击、晚回包和切scope不能重复追加或串数据。若需要后端重签，须通过原受认证题目路径，不信任前端声明题干／字段。
5. 进度使用原八个合法画像字段去重计数，不把题号、通用预填、点击数、其他空值当完成度；2px墨黑进度与单行标签取代四行堆叠。实际总题数未知时显示“已补充 N/8 项”，不冒称固定八道题或准确率。核心两项齐全保留“可以先生成，也可继续”的停止建议，服务端done仍决定停止；不新增答满八项才能报名或生成的门槛。“跳过”返回报名资料并保留本session，不自动提交、生成或发送下一题请求。
6. 生成画像和保存画像是不同操作。生成只产生本次活动的预览，不改变报名状态；结果视图使用真实生成字段，不拼接示例摘要。独立保存后必须有持久版本／精确回执及独立GET确认，重开读取同一已保存画像，不自动再调用模型。只在真实持久保存且回读确认后显示“已完成”；有未保存编辑或答案版本变化显示草稿／需更新，不把一次200或组件state当保存成功。
7. 新画像实体保存事件、本人、来源回答版本、生成来源和权限边界，使用当前应用既有持久化接口与事务约定，不绑定Supabase或Neon专属API。本人及当前有权限主办方读取，其他参会者／其他actor／其他事件不能读；不得追溯更改旧 event_attendees 问答快照、不影响既有已公开报名资料。涉及公开推荐的资料另走原授权投影，不由画像权限授予人脉查看权。画像保存前后报名status/version、membership与人数保持不变。
8. 画像“编辑”返回可编辑回答／再生成；“可能想认识”只显示真实、有权限的推荐结果与详情路由。现有推荐接口失败可见说明与重试，没有结果不造3人。省略无数据的装饰控件；导航右侧“···”只有在提供真实现有操作菜单时出现，不留无反应按钮。
9. 新画像属于用户可见的数据：纳入既有全域离线读取表面与缓存隔离审计，不发明独立localStorage旁路。离线仅阅读有效已授权快照，所有生成／编辑保存需要在线写资格；未接可信grant/epoch的全域runtime缺项须如实保留，不能因本Sprint关闭0033～0036。已有答题、取消、再次报名的签名、CAS、单飞、确认和独立回读保护不削弱。

## 文件边界与实现顺序

读取：设计HTML的7a区及fixture，现有App报名screen/view-model/questionnaire、Web报名workspace、adaptive-handlers、registration contract/interview-response-contract、存储事务直接消费者及bridge/status.md、bridge/handoffs.md。不运行参考support.js，不复制其外部脚本／遥测／canvas框架。

- App：修改 `src/screens/events/EventRegistrationScreen.tsx`，按职责可提取新 `src/screens/events/Registration7aViews.tsx`；新增 `src/view-models/event-registration-portrait.ts` 负责视图状态、复核和画像保存回读映射。必要修改 `src/view-models/event-registration.ts`／`event-registration-questionnaire.ts` 与实际API路径消费者，不改全局认证/hooks/主题。新增文案只写 `src/i18n/{messages,zh,ja,en}.ts` 并持有字典锁。
- Web UI：修改 `repos/orbits/app/(app)/app/events/[id]/register/event-registration-workspace.tsx` 及必要本域拆分组件。先区分原“保存报名并生成”操作，禁止将其挂到独立“保存画像”。Web显示与App保持相同业务状态，不要求桌面固定390宽。
- 新后端本域：提议在 `repos/orbits/features/events/registration/portrait/` 新建契约、纯服务、授权及现有存储适配；提议 `repos/orbits/app/api/events/[id]/registration/portrait/route.ts` 暴露独立画像GET与保存，沿用现有envelope／authenticated actor／事务规范。入口名、payload、版本、幂等与错误码应在批准后实施计划中冻结，未冻结前不写假接线。原persona/interview route 保持生成语义，仅在必要的签名或scope校验内登记修改。
- 共享响应契约／schema：仅新增本域画像DTO和运行时验证，通过批准的 `npm run sync:contract` 消费到App，不手改副本或扩大复制源白名单。新增读入口同步维护既有离线请求表面与策略登记，并跑真实审计。
- 测试：扩展App `tests/event-registration-interactions.test.ts`、`event-registration-view-model.test.ts`、`event-registration-questionnaire.test.ts`；新 `tests/event-registration-7a.test.tsx`／`event-registration-portrait.test.ts`；Web扩展 `tests/pages/event-registration-workspace.test.tsx`，新 `tests/api/event-registration-portrait.test.ts` 和 `tests/services/event-registration-portrait.test.ts`，必要隔离PG事务测试。实际新增路径须在启动补充记录中列明职责与SC，不改冻结SC。

顺序：冻结画像权限和版本契约→后端独立保存／GET及权限反例→App三视图与历史编辑接线→Web相同语义→固定源收口→ROOT实际两端验收。一个Generator串行跨端，不并行写共享契约。ROOT只写规划与集成记录，不实现上述产品源码。

排除：重做报名窗口配置、迁移真实展示账户、假seed推荐、AI provider/model/prompt改造、付费自动追问、全局Alert改造、联系人生命周期／通知／日程、生产数据库切换、域名／Vercel／Neon管理、覆盖用户根AGENTS/CLAUDE。真实DDL若现有存储不能满足，须追加明确迁移方案及环境授权后才执行，不从UI设计推导线上migration许可。

## 验收契约（五项）

| SC | 可观察结果 | 主证据 |
| --- | --- | --- |
| 66-01 | 三视图按7a层级、尺寸与颜色实现；其他仅选中才出现底线输入；小屏／键盘／大字号可操作、末行不被底栏遮挡 | 实际390逻辑宽截图对照及Simulator；完整新视图测试，设计值与状态差异明列 |
| 66-02 | 至少连续回答两题后全部历史仍可复核；历史编辑／取消编辑、过期画像、失败重试及旧回包均正确；进度和停止建议来自真实有效字段 | 完整App交互及问卷规则、Web页面测试；两端真实当前题→下一题→全部→编辑→返回链 |
| 66-03 | 生成不报名；独立保存有正式版本回执及GET回读，重开同一画像且不自动调AI；保存不改变报名状态／版本／人数 | 新服务/API/PG事务与scope/CAS反例；ROOT同一合法对象保存前后摘要及两端独立回读 |
| 66-04 | 本人及当前有权限主办方可读画像，其他actor／参会者／事件拒绝；旧报名快照权限与取消／重报保护不变；新离线入口登记且无旁路泄漏 | 完整API权限、消费者失败和实际离线表面审计；ROOT受控自有双账号正反例，不拿隐藏按钮当权限证据 |
| 66-05 | 固定功能与报告commit合入chat-agent并验证；Web源更新后fresh build/restart，Phone消费固定源重新export，主8082 Simulator真交互通过后普通push并核对远端 | 固定BASE..TREE/实际命令日志/服务与loaded-entry证据/SC截图/合并SHA与独立远端SHA |

## 验证、预算与交接

本轮规划为D，只查文件、链接、diff和契约一致性，不跑产品测试／typecheck／构建或业务写入。执行因新增写入与权限为H：每条操作链先真实行为RED、最小实现、定向GREEN；收口跑所有受影响完整测试文件、两端types及共享契约/离线审计。各受影响端一次I集成，保留旧失败和skip，不逐helper或每次commit重跑全量。实现计划由批准后的真实冻结协议展开，禁止测试mock自行确认权限／保存成功。

同因非预期失败最多两轮必要本地修复，不启动第二Generator、不降低SC；外部缺条件只暂停对应动作。付费模型测试仅ROOT释放明确窗口，沿用原累计$5唯一账本，不按Sprint重置；生成失败不得用示例或stub冒称真实provider成功。无付费授权时可先完成零付费合成测试，但真实生成SC缺项必须注明。

真实QA和服务生命周期均归ROOT：选择可识别自有QA活动／账号，正常页面操作，不改旧报名数据或投资人账户来凑场景；上线域和旧本地Phone环境分开记版本。Phone协调者仅机械消费固定提交／白名单，不实现第二版本；公共发布另按已有精确窗口与回退方案执行。

run结束才创建REPORT，逐SC列pass/fail/missing、RED→GREEN、实际源码/依赖/环境版本、失败历史、未提交改动与回退边界。本线路径限定commit前detect_changes→固定功能SHA＋报告SHA交ROOT→安全合入chat-agent→精确合并树检查及真实SC→普通push／独立远端核对。缺必需SC或未合并不能completed，不用文档完成冒充功能交付。
