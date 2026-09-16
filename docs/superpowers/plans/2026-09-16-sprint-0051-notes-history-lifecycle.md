# Sprint 0051 历史笔记与生命周期实施计划

> 执行者遵循仓库 `RULES.md` 的唯一 Generator；技能 subagent-driven-development 仅用于既定独立任务执行，不新派逐任务实现者/评审，不调用已卸载的 executing-plans。此计划不另设契约或降低 SC。

**目标：** 用户可找到全部已保存历史，且笔记全生命周期经证据验证。

**架构：** 沿现有 `/notes` 与认证 notes API 修复入口和分页，统一消费已交付 canonical 读取；删除、镜像与AI权限消费0045/0033～36的正式接口。保留新建快捷、草稿分区与版本化写入，不新增平行笔记库。

**技术栈：** Expo Router / React Native / react-native-web；Next认证API、既有PostgreSQL LiveRecord/canonical adapter、Node22/tsx/node:test/Playwright、已批准加密离线镜像。

**规范：** [唯一Planner](../../../repos/orbit-app/docs/sprints/0051-notes-history-lifecycle/PLANNER.md)、[证据和设计](../../../repos/orbit-app/docs/sprints/0051-notes-history-lifecycle/AUDIT-DESIGN.md)。

## 全局约束

执行固定f7c8a15123b78cfa732db10c7642573b921f3dfe，ROOT已暂挂源码冻结的0045并移交历史UI/读取锁；唯一 `/root/d_sprint0051` GPT-5.6 Sol / medium，主线chat-agent。两Generator上限，0050四字典仍独占、ROOT释放前0051不改字典。真实设备/账号/DB/服务ROOT独占。只读离线不授权在线写入；历史异常不吞掉，未知v3不能只放宽schemaVersion校验，删除/sync/journal只消费前序正式接口。首次必读及symbol impact、实际detect、零出站guard、两次修复上限均按Planner。

## 任务1：建立历史入口与分页的真实复现（SC01/02）

文件：修改 App `tests/notes-list-interactions.test.tsx`、`tests/notes-interactions.test.tsx`及实际首页直接测试；新增 `tests/note-history-pagination.test.ts`。

接口：消费现有 `NotesPageView {notes:NoteView[];total:number;nextCursor:string|null}`、`notesPageFromPayload(data,actorId,language)`、`notesSearchPath({association,contactId,q,limit,cursor})`。若提取分页纯函数，定义 `mergeNotePages(base: readonly NoteView[], extra: readonly NoteView[]): NoteView[]`，按ID去重、同ID取较新version，同version取较新updatedAt，排序updatedAt降序及ID升序；身份校验必须在合并前进行，不能依此函数隐藏越权payload。

- [ ] 基于现有浏览器夹具设置53篇、首屏20/后页20/末页13；实际点击加载更多，记录精确请求cursor和UI ID集合；迟到第二页用受控Promise在切换搜索/联系人/scope后释放。
- [ ] 写分页纯函数RED，数据复用当前 notes-view-model 的合法 fixture，并扩充同ID新版本与跨页重复；例如以下行为断言（`base/extra`由该fixture生成）：

```ts
const merged = mergeNotePages(base, extra);
assert.equal(new Set(merged.map(note => note.id)).size, merged.length);
assert.equal(merged.find(note => note.id === "note:one")?.version, 3);
assert.equal(merged.some(note => note.id === "note:old-page"), false);
```

最后一项只用于 generation 已拒绝的旧页不得进入 extra 的操作链测试，不能让纯合并函数猜测请求范围。

- [ ] 在现有 Web service fixture 中创建53篇，遍历 `service.search({actorId,limit:20,...cursor})`，对照底层合法记录全集；两页中间更新/删除用0045正式端口，接口未交付时先记录该子场景缺项，不伪造删除成功。
- [ ] 执行精确新用例确认行为RED，记录实际失败而非环境缺包；不在此阶段重复全量。

## 任务2：修复历史入口与分页消费者（SC01/02）

文件：App HomeDashboardScreen、NotesScreen、New/Edit/Detail、ContactNotesSection及必要纯分页模块；Web notes/service与collection-handler仅分页来源确需变化时修改。

接口：沿用 `/notes` 全局、`/notes?contactId=<encoded>`关联、`/notes/new`新建，详情 `/notes/<encoded-id>`；保留现有draftStorage load/save/clear作用域。GET第一页和后页显式绑定actor/server/scope/query/contact/filter/generation，旧回包不能确认新scope。

- [ ] 上述symbol先impact，登记实际直接/传递调用者与风险；当前稿只做规划，不能复用未执行的影响分析。
- [ ] 保留新建快捷，加入所有笔记入口；新建跳历史有改动时沿用确认与保稿；详情返回实际历史路由。联系人笔记标明范围并显式跳全局。
- [ ] 单飞和AbortController/generation保护分页，首屏/后页统一合并；刷新、query、scope、首屏源版本变化重置旧页和cursor。分页过程中源集合变化消费正式revision/snapshot；接口尚缺时明确使旧cursor失效、提示重载，不能默默继续offset导致遗漏。
- [ ] 显示已加载/总量、加载更多/全部加载、页失败重试，错误不假空态；用户点击全局“全部”不残留联系人条件。
- [ ] 定向GREEN后跑改变测试的完整文件及直接首页/导航消费者、相关App类型与三语同步一次；固定此安全增量commit，不夹带0045或0050未提交源码。

## 任务3：合法历史格式与读写生命周期（SC03/04）

文件：Web notes/note-record、repository、service-factory、collection与detail handlers；App VM与draftStorage；Web新增note-history-compatibility.test.ts及既有notes-route/service、actor-query-tools完整文件。

接口：消费0045真实NoteMutationPort及其移交的canonical v3 decoder/read adapter；记录实际export路径/签名到checkpoint再接线。UI和 `notes.query` 使用同一owner/workspace过滤、实体状态和revision来源，不新建工具或改变0036契约。

- [ ] 枚举旧联系人私有备注、v1/v2独立笔记、canonical v3、草稿、encounter note的实际source/collection/owner/schema/lifecycle；先兼容合法fixture RED，未知版本及异常记录作为受控错误/部分结果而非悄悄丢弃。
- [ ] 最小修复权威读取接线，v1投影保留原ID/正文/关联/时间，v2/v3按各自正式decoder校验；不自动写回迁移。异常仅报脱敏计数/原因，不公开正文或跨actor信息。
- [ ] 测正式create→GET→list、update CAS→GET→关联、unlink与晚到autosave/旧ACK；写失败和409保稿，成功只清本scope草稿且晚回包不恢复已清内容。
- [ ] 对照0045删除→墓碑→所有关联/搜索排除，以及0033镜像/撤权和0036新AI查询source fence；遗留AI文字不冒充当前source。依赖缺失仅阻对应接线/真实验收，记录精确接口与责任方。
- [ ] 用guard完成身份隔离、失败、并发、回滚等完整直接测试；本地H收口只做一次受影响端I，保留既有失败/skip原日志，补局部修复的完整回归。

## 任务4：实际跨端验收与中文审查交付（SC05）

文件：Sprint新建LIFECYCLE-AUDIT.md；真正run结束时REPORT.md；ROOT更新Bridge。接口：固定Web/API source SHA和BUILD、Phone产物、Metro8082/App版本、同actor/workspace与精确自建笔记ID；真实数据库/服务/设备由ROOT持锁。

- [ ] ROOT锁定合法隔离测试账号及自建记录范围，生产Web重新构建重启并核health；Phone源码产物同步重建，Simulator重新安装连接主8082。不得用运行旧Web验证新源码。
- [ ] 实际从首页新建处进入全部历史，遍历超过一页并搜索最早笔记；同记录Web写→App读、App写→Phone读，完成编辑/关联与删除后逐入口回读。
- [ ] 完整同步后断网冷启动读取最早及最新笔记；验证部分/未同步历史提示；在线另一端删除或撤权后重连不复活、不串账号，离线只读仍不触发在线写。
- [ ] 中文审查表每一资源/阶段写权威源、存储、接口、版本、权限、同步/离线状态、实际证据与修复；不同笔记来源不能只给“正常”总评。
- [ ] 功能与真实报告分别路径限定commit+实际detect，交ROOT最终完整SHA和残留；精确merge chat-agent、验证合并树、按已有push授权核对远端。未满足SC不能completed，真实验收缺项不能用mock填pass。
