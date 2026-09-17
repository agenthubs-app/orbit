# Sprint 0045 — 私密笔记整条删除与删除传播

Plan revision：1；existing-codebase / single-generator。原需求：R-13/R-14、0018/0025追加能力；D现有UI和notes主资源无DELETE，测试笔记无法清理。单一目标：[整条笔记安全删除](GOAL.md)。

基线/证据见 [汇总§1](../SIMULATOR_REMEDIATION_PROGRAM.md#1-报告到底证明了什么)。进入条件：该新增目标的实施指令、actor/version/idempotency契约、授权精确测试记录；0033/0034 notes源/store/tombstone锁移交，0036 notes查询与证据失效接口固定。在线链可先实现，删除传播及AI真实行按各接口逐项验收，不要求无关域全部完成。

## 范围、交互与文件

- 交互：沿现有详情更多操作加入“删除笔记”；确认文案说明关联入口会移除，取消无副作用；确认期间防重复提交，失败保留正文和操作状态；版本冲突提示重新读取而非覆盖他人更新。新文案按现有中/日/英方式登记字典锁，不另做页面视觉改版。
- Web `repos/orbits/app/api/notes/[id]/{handler,route}.ts`、`features/notes/{service,repository,note-record,contract,association-reader}.ts`与service factory，`shared/contract/notes.ts`及实际schema源；存储/迁移新增路径只在必要时登记，真实migration另核授权。
- App `repos/orbit-app/src/screens/notes/NoteDetailScreen.tsx`、`EditNoteScreen.tsx`、`NotesScreen.tsx`、`src/view-models/notes.ts`、生成notes副本及实际客户端删除接线；Web笔记详情实际入口追踪后登记。
- 0033 journal/tombstone、0035失效、0036 notes adapter/artifact接口只消费或移交已登记必要点，不独立改其协议；关联联系人/活动索引只处理被删笔记映射。

排除：删联系人或活动、清空用户数据、任意actor可删笔记、恢复站/回收站新产品、新离线队列、自动清理模糊前缀记录、删除既存AI历史文字。历史AI记录按原产品规则保留；今后的源检索/缓存证据不能再附该已删正文。

## 验收契约（五项）

| SC | 可观察行为 | 主验证 |
| --- | --- | --- |
| SC-0045-01 | 同actor详情发起整条删除→确认→列表移除；取消不修改，失败保留可恢复内容 | Web/App确认交互及认证DELETE service/route行为 |
| SC-0045-02 | 非owner拒绝，版本冲突不删除新内容；重复/并发DELETE按既定幂等回执不产生不同副作用 | 两actor、CAS、并发、重试与事务回滚测试 |
| SC-0045-03 | 成功删除不再出现在列表/搜索/联系人/活动关联；源记录删除状态与关联清理原子一致 | 服务/索引回读、故障注入与同actorWeb↔App逐入口 |
| SC-0045-04 | canonical tombstone传播到已同步镜像及新AI查询/证据失效，不在重连复活；离线未提交不能称远端已删 | journal/delta、mirror与adapter测试；已同步→删除→另一端/断网重启→恢复矩阵 |
| SC-0045-05 | 同版本live Web与主包完成创建→删除闭环，准确清理授权QA记录，固定SHA与合并树可复验 | 原生点击/HTTP/账本无需新付费、精确清理清单与REPORT |

## 执行、最小检查与失败交接

先验证route只有GET/PATCH与当前repository删除语义；确认版本化tombstone/关联与源检索契约后impact，先写删除RED，再最小实现。Web定向 `tests/api/notes-routes.test.ts`、`tests/services/notes-service.test.ts`；App `tests/notes-interactions.test.tsx`、`tests/notes-list-interactions.test.tsx`、`tests/notes-view-model.test.ts`、`tests/contact-notes-interactions.test.ts`；增量/AI失效直接消费者按实际impact追加行为测试并登记。

H档：写入、CAS、事务、权限与同步删除，必须覆盖拒绝、失败回滚、关联原子性及传递消费者；收口受影响端集成/typecheck一次。只测在线UI不满足SC-04；只有contact unlink DELETE不算整条删除。无需真实provider付费证明检索排除，可先用出站spy；0036真实AI矩阵保持开放。

采用 [共同契约§4](../SIMULATOR_REMEDIATION_PROGRAM.md#4-共同执行验收和交付约束) 的唯一run、锁、Web重建重启、安全、证据及commit→merge chat-agent→合并树→适用push。未完成传播可安全部分提交但如实blocked；不改0018/0025历史完成事实。
