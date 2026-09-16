# Sprint 0051 — 所有历史笔记与生命周期可靠性

唯一 SprintContract，revision1，existing-codebase / single-generator。需求：2026-09-16 用户“写笔记处看不到所有过往笔记；新写 Sprint 并检查笔记生命周期”，关联 R-13/R-14、0018/0025/0029/0033～0036/0045。目标见 [GOAL](GOAL.md)，证据及设计见 [AUDIT-DESIGN](AUDIT-DESIGN.md)，步骤见 [中文实施计划](../../../../../docs/superpowers/plans/2026-09-16-sprint-0051-notes-history-lifecycle.md)。

## 基线、就绪条件与归属

规划基线主线 `8f00f91cd7e3637813e9b9d574b06f8dfefd1bf5`，目标主线 `chat-agent`。笔记域与 Phone `f7c8a15123b78cfa732db10c7642573b921f3dfe` 比较无差量。执行前协调者固定已交付 notes 依赖 SHA，记录实际源码差量、唯一 owner、Planner SHA256 与独立 worktree；不能把规划 HEAD 冒充未来执行版本。

用户已直接要求建立并派支线执行此 Sprint；复用 RULES 第0节批准，不重新索要同范围设计审阅。2026-09-16启动检查确认0045原代理不在活跃列表、工作树tracked clean、源码固定661c015678b4757befab029efd0109550b3b5bd1、原checkpoint注明源码/测试冻结且无活测试。ROOT暂挂0045后续执行槽，保留原Planner/SC/run/commit，将历史UI、列表/详情读取及其测试源锁移交0051，删除writer/事务/journal仍只消费前序正式接口，不把未接生产端口的0045半成品直接发布。

执行基线固定 `f7c8a15123b78cfa732db10c7642573b921f3dfe`，独立 `codex/sprint-0051-notes-history-lifecycle` / `.worktrees/sprint-0051-notes-history-lifecycle`，含Phone前序已固定依赖但只集成本Sprint增量及必要精确前序差量。唯一Generator `/root/d_sprint0051`，GPT-5.6 Sol / medium，run-01；ROOT管理集成、真实账号、服务和8082 Simulator。0050独占四字典，0051先用现有键推进纯分页/读取/入口及不依赖字典的测试；新增键等待0050固定冻结和ROOT显式移交，不同时编辑字典。最多两个独立Generator，不派第三实现者或评审/Evaluator。

历史 UI/分页及当前已支持格式读取可先沿固定认证API实施，不把旧API当作canonical v3完整覆盖。v3权威读取接线、删除/撤权/离线/AI证据按具体依赖推进；缺实际接口不能用stub或放宽legacy解码替代，不要求所有离线域提前完结，也不降低SC03/04/05。

## 文件边界

- App：`src/screens/home/HomeDashboardScreen.tsx`、`src/screens/notes/{NotesScreen,NewNoteScreen,EditNoteScreen,NoteDetailScreen}.tsx`、`src/screens/contacts/ContactNotesSection.tsx`、`src/view-models/notes.ts`、`app/notes/{index,new}.tsx`及实际详情/编辑路由、`src/storage/note-draft-storage.ts`；必要纯分页模块可新增 `src/view-models/note-history-pagination.ts`，不得改全局HTTP/auth/hooks来掩盖局部问题。
- Web：`features/notes/{service,repository,note-record,service-factory}.ts`、`app/api/notes/{collection-handler,route-support}.ts`、`app/api/notes/[id]/{handler,route}.ts`；canonical adapter 按0033/0045移交接口消费。现有共享 notes contract 与真正 schema 源有必要差量才改，App生成副本仅走既有 sync。
- 三语字典仅新增本 Sprint 文案，待0050释放；旧联系人备注、encounter note只追踪原接口/可见入口，不迁移其存储。现有 Web笔记页面的准确路径从源码登记后补充，不能凭路由同名假定它使用 App screen。
- 测试：App `tests/{notes-list-interactions.test.tsx,notes-interactions.test.tsx,notes-view-model.test.ts,note-draft-storage.test.ts,contact-notes-interactions.test.ts,app-locale-notes.test.ts,offline-read-inventory.test.ts}`；Web `tests/services/notes-service.test.ts`、`tests/api/notes-routes.test.ts`、`tests/capabilities/orbit-ai-actor-query-tools.test.ts`。新增 App `tests/note-history-pagination.test.ts` 与 Web `tests/services/note-history-compatibility.test.ts`，依赖原测试夹具/真实adapter；同步及AI权限的直接消费者按impact登记，不重写0036协议。
- 文档：本 Sprint `LIFECYCLE-AUDIT.md` 为实际审查成果；执行结束才写真实 `REPORT.md`，Bridge交接由ROOT更新。排除新的 Sites项目、版本历史编辑器、回收站、自动合并旧资源、真实数据库迁移/全库修复、用户历史删除、provider更换、任何费用上限重置。

## 五项验收契约

| SC | 可观察行为 | 主验证与反例 |
| --- | --- | --- |
| 0051-01 | 从首页/新建/详情/联系人笔记能发现并打开全局历史，默认未带隐式联系人/搜索过滤，导航不丢草稿 | App/Phone实际点击、三语及未保存确认；联系人页返回全局范围；新建快捷仍有效 |
| 0051-02 | 超过50篇历史可完整分页查看和搜索，不重复、不因切筛选/刷新/新写入而漏掉；数量、范围与完成状态可信 | 53篇、同时间不同ID、跨页创建/编辑/删除、后页失败/重试、迟到请求、切号/服务器/联系人；真实HTTP集合与UI ID集合对照 |
| 0051-03 | 已授权的合法旧格式及当前 canonical 笔记在列表/详情/关联/AI读取一致；异常记录不被悄悄当作不存在 | v1/v2与已交付v3实际decoder/adapter夹具；owner/workspace校验，墓碑和撤权拒绝；异常计数/状态脱敏可见，旧备注保留只读可达 |
| 0051-04 | 创建/编辑/解除关联/删除/同步/断网重启/撤权/重连及新AI查询全生命周期不丢、不串、不复活 | 正式写入回执+独立GET；409与幂等/旧ACK/晚到autosave；0045实际墓碑与0033～36镜像/授权/source fence；完整/部分/未同步离线状态分开 |
| 0051-05 | 固定源码生产重建重启的 Web/API、PhoneWeb和主8082 Simulator同账号同笔记完成真实读写回读，输出完整中文审查且安全集成 | ROOT准确自建记录集合/清理范围；跨端历史/搜索/创建/编辑/删除/离线矩阵；commit/BUILD/PID/health/API base与source版本；所有阶段pass/fail/missing和最终SHA |

## 执行、失败与交付

先读 RULES、根/两端 AGENTS、bridge/status及handoffs、本设计与计划、0025报告和0045/0033～36实际移交；证据可按未变版本复用。逐待改symbol upstream impact，HIGH/CRITICAL先报告，图谱缺失补源码不算零风险。先复现入口/分页与旧格式差异，TDD一次操作链实施，不把推测写成真实数据丢失。

属H档：写入、授权、共享格式与跨端同步。开发定向 RED/GREEN，交付完整受影响测试文件与相关端types；本地代码收口受影响端一次I全量，保留旧失败/skip，只修本次相关问题，不重复全库检查或自评分循环。运行零出站/真实env屏蔽既有guard，实际DB/provider/浏览器账号/设备只能ROOT持有；mock/组件不满足真实SC。

非预期失败每项最多两次本地修复，同假设最多三次只读诊断；缺项按具体依赖写checkpoint，继续无依赖工作，不启动第二Generator。完成安全功能后路径限定commit并实际 detect_changes；交接固定SHA、全部影响/证据/残留。ROOT精确合并 `chat-agent`、验证合并树、按已有授权push并核对远端。所有必需SC、功能与报告提交、主线合并与验证齐全才completed，不改0025历史完成事实，也不据此关闭0045或全域离线。
