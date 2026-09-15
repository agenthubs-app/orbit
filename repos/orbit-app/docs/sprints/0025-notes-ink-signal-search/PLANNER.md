# Sprint 0025 — 笔记 4a 改版与搜索式人脉关联

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在[登记表](../README.md)。
**原需求:** 2026-09-15 新增；承接 R-13 的 0018 笔记核心和 0019 笔记建议，视觉与交互只取最新包的 `4a-*`。
**单一目标:** 在不枚举联系人全集的前提下交付六个 4a 笔记状态，并保持私密、版本、幂等和跨端一致。
**易读目标:** [GOAL.md](GOAL.md)。**视觉与产品规格:** [DESIGN.md](DESIGN.md)。
**文档基线:** 根 HEAD `f2c8ddcefe63fe4ccd5ad08c78fd5b2a9add0d70`；根 `AGENTS.md`、`CLAUDE.md` 为既有用户改动，不写、不暂存；已有未跟踪 `docs/designs/2026-09-15-notes-contact-picker/` 不属于本 Sprint。

用户明确指定编号 0025。虽然 0024 当前为空，编号不改成 0024；这是对通用“下一个空号”规则的本次直接覆盖，0024 不在本 Sprint 中补建或复用。

## 进入条件与依赖

- 用户已提供并选定最新设计包，明确只采用六张 `4a-*` 及对应代码；设计输入与“加号→输入词→有限候选”的产品决定已齐全。
- 0018 为 completed，提供 actor 私有 note、版本、幂等和多人关联；0019 的 SC-01～04 已通过，`IORBIT 总结`必须复用其显式发送／确认创建路径。0019 的全局 R-00～R-14 收口 SC-05 不阻塞本 Sprint 的局部笔记改版。
- 启动实现前必须读取 0018／0019 REPORT、Bridge `status.md`／`handoffs.md` 和当前 diff，登记当时 HEAD、Planner SHA256、run-01 owner 与文件锁；本次文档编制不消耗 Generator run。
- 实施依赖当前 Web/API 与 App 工程可构建、隔离 PostgreSQL 可用、一个获准的同账号 Web/App 测试身份和 iOS Simulator。缺少真实环境只阻塞 SC-05 的真实验收，不阻塞此前可独立完成的代码和测试；run 开始后最终如缺证据按规则报告 blocked。
- 每个待改函数／组件／handler 在编辑前运行 GitNexus upstream impact，API handler 同时做 API impact。HIGH／CRITICAL 先向用户报告风险和直接消费者，再继续已授权实现；索引未收录时用源码补查并明确限制。

## 契约决定

### 笔记数据

共享响应继续保留 `id/accountId/ownerUserId/body/contactIds/version/createdAt/updatedAt`，并新增：

- `title: string`：新写入必填；旧记录读取时由正文第一条非空行确定显示标题，不批量迁移。
- `manualContactIds: readonly string[]`：用户通过管理搜索显式添加的稳定 ID；旧记录的 `contactIds` 按手动来源兼容。
- `mentions: readonly { contactId: string; start: number; end: number; displayText: string }[]`：UTF-16、尾端不含；服务端验证范围与正文及当前 actor 可访问联系人。
- `contactIds`：服务端 canonical 派生的 `manualContactIds ∪ mentions.contactId`，排序去重，供 0018／0019 与旧消费者继续使用。
- `eventIds: readonly string[]`：仅保存当前 actor 可访问的真实活动 ID。无事件时为空；关联活动不向参与者分享笔记。

存储读取接受 schema v1，投影出完整新版 NoteContract；新建／修改写 schema v2。旧客户端仍可发送 `body/contactIds`，服务端把它解释为手动关联并保留已有 `title/mentions/eventIds`，不能因省略新字段清空。新版 PATCH 的省略表示不改、显式空数组表示清空；所有参与 fingerprint、版本比较和幂等回执。

既有 `DELETE /api/notes/[id]/contacts/[contactId]` 保持“解除这篇笔记与该联系人全部关系”的旧语义：同时移除该 ID 的手动来源和 mention 元数据，但不删除正文文字、笔记或联系人。新版编辑器仅移除某一种来源时使用 canonical PATCH，避免旧客户端行为被静默改变。

### 分页搜索

- `GET /api/notes` 扩展 `q/contactId/association/sort/cursor/limit`；默认 20、最大 50，返回 `notes/total/nextCursor`。`association` 只接受 `all|contacts|events|unlinked`，`sort` 只接受 `updated_desc|updated_asc`。游标 opaque、绑定 actor 和查询条件；条件变化后旧游标无效。
- `POST /api/contacts/search` 扩展 `cursor/limit/contextEventId`，返回可选的 `total/nextCursor`。无 query 时本 Sprint 的编辑器不发请求；服务端分页在存储提供层执行或有等价的有界读取证据，不能先把几万条完整对象送到 App 再切片。
- 联系人排序与 [DESIGN](DESIGN.md#加号与搜索) 一致，并以稳定 ID 收尾；同一游标页不重复、不漏项。分页只返回当前 actor 范围，未知／越权游标与筛选不泄漏对象是否存在。

### 草稿与导航

- 新建和编辑使用 scope 隔离的本地草稿存储；持久化失败时不显示“已自动保存”。取消如果存在未确认修改要给出保留草稿／放弃／继续编辑，不能静默丢失。
- `/notes/[id]` 是阅读态；新增 `/notes/[id]/edit` 为编辑态。`/notes/new?contactId=` 继续预置稳定联系人 ID；不存在或无权时不串到同名联系人。
- `IORBIT 总结` 只是 0019 `buildNoteSuggestionNavigation` 的新标签与视觉入口，不改变模型调用和任务接受协议。

## 范围与文件白名单

实现 cwd 分别为 `/Users/xzhao/Projects/orbit/repos/orbits` 和 `/Users/xzhao/Projects/orbit/repos/orbit-app`。同一 Generator 串行修改；根 Git 只由协调者暂存和提交。

### Web/API 与共享契约

- `repos/orbits/shared/contract/notes.ts`
- `repos/orbits/shared/contract/contacts.ts`
- `repos/orbits/shared/contract/index.ts`
- `repos/orbits/features/notes/contract.ts`
- `repos/orbits/features/notes/note-record.ts`
- `repos/orbits/features/notes/repository.ts`
- `repos/orbits/features/notes/service.ts`
- `repos/orbits/features/notes/service-factory.ts`
- 新建 `repos/orbits/features/notes/association-reader.ts`，只负责按 actor 批量解析已保存的联系人／活动 ID 和人名检索命中的 ID
- `repos/orbits/app/api/notes/route-support.ts`
- `repos/orbits/app/api/notes/collection-handler.ts`
- `repos/orbits/app/api/notes/[id]/handler.ts`
- `repos/orbits/features/contacts/contract.ts`
- `repos/orbits/features/contacts/contact-graph-query.ts`
- `repos/orbits/features/contacts/live-service.ts`
- `repos/orbits/features/contacts/storage/contact-live-record-provider.ts`
- `repos/orbits/app/api/contacts/search/handler.ts`
- `repos/orbits/tests/services/notes-service.test.ts`
- `repos/orbits/tests/api/notes-routes.test.ts`
- `repos/orbits/tests/capabilities/contact-notes.test.ts`
- `repos/orbits/tests/capabilities/contacts-list-search-and-filter-mock.test.ts`
- 新建 `repos/orbits/tests/capabilities/note-search-pagination.test.ts`
- 新建 `repos/orbits/tests/capabilities/contact-search-pagination.test.ts`
- 新建 `repos/orbits/tests/capabilities/note-association-reader.test.ts`

若实际 provider 的有界查询实现位于上表外，只允许补入 `repos/orbits/features/contacts/storage/` 下直接实现该 provider 的一个精确文件；启动记录必须列出路径、impact、为什么是 SC-02 必需。不得借机重写通用 live-record store。

### App

- 经 `npm run sync:contract` 生成 `src/api/contract/notes.ts`、`src/api/contract/contacts.ts` 及同步索引
- `src/api/endpoints.ts`
- `src/view-models/notes.ts`
- `src/view-models/contacts.ts`（只扩分页搜索映射，不重写联系人主页）
- `src/screens/notes/NotesScreen.tsx`
- `src/screens/notes/NewNoteScreen.tsx`
- `src/screens/notes/NoteContactPicker.tsx`
- `src/screens/notes/NoteDetailScreen.tsx`
- `src/screens/contacts/ContactNotesSection.tsx`
- `src/screens/contacts/ContactDetailScreen.tsx`（只接笔记页签、计数和导航）
- `app/notes/[id].tsx`
- 新建 `app/notes/[id]/edit.tsx`
- 新建 `src/screens/notes/EditNoteScreen.tsx`
- 新建 `src/screens/notes/NoteMentionEditor.tsx`
- 新建 `src/screens/notes/NoteEventPicker.tsx`
- 新建 `src/storage/note-draft-storage.ts`
- `tests/notes-view-model.test.ts`
- `tests/notes-interactions.test.tsx`
- `tests/contact-notes-view-model.test.ts`
- `tests/contact-notes-interactions.test.ts`
- `tests/ink-signal-contact-detail.test.ts`
- 新建 `tests/note-contact-search-interactions.test.tsx`
- 新建 `tests/note-mentions-interactions.test.tsx`
- 新建 `tests/note-draft-storage.test.ts`

### 文档与交接

- 本 Sprint 的 `GOAL.md`、`DESIGN.md`、`PLANNER.md`；执行结束后才新增 `REPORT.md`
- `docs/sprints/README.md`
- `bridge/status.md`、`bridge/handoffs.md`，并按模板新增本 Sprint App↔Web 交接记录

必要的路由覆盖／安全清单测试若因新 `/notes/[id]/edit` 失败，可修改直接列出该路由的既有测试文件；启动追加记录必须给出精确路径和失败证据。公共主题、`AppScreen`、HTTP client、auth、任务协议、AI service、活动服务和数据库通用设施不在范围。

## 排除范围

- 不实现或恢复包中的 `1c/2a/3a` 页面；不采用 4a 选择器的空查询 A–Z 全量清单。
- 不新增向量搜索、AI 联系人搜索、外部通讯录调用、自动创建联系人、自动消息／通知或笔记分享。
- 不因出现姓名文本自动关联；只有用户从候选中选择稳定 ID 才建立提及或手动关系。
- 不让点击 `IORBIT 总结` 自动发送、自动生成建议或自动创建待办；不改变 0019 的日期确认和接受幂等。
- 不批量迁移旧笔记、不访问生产数据库、不部署、不清理真实记录；不伪造活动封面、关系线索、作者或自动保存状态。
- 不重做联系人资料、日程、待办和语音／富文本系统。工具条上没有现有真实能力且本 Sprint 未列出的动作隐藏或禁用并解释，不能做无效按钮。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0025-01 | 笔记列表按 4a 显示真实标题、摘要、时间、关联数量，能按正文／标题／人名搜索，按四种关联范围筛选并稳定分页；旧无标题记录仍可读。 | Web note service／route 的 legacy v1、查询、筛选、游标和 actor 反例；App 列表真实交互与 390×844、双倍字号视觉截图。 |
| SC-0025-02 | 编辑器初始不请求或渲染联系人全集；点加号或输入 `@词` 后只出现有限候选，一字符、连续改词、迟到响应、同名、多选、翻页、清空、取消都正确，10,000 人夹具下客户端渲染行数保持有界。 | provider 层有界查询与游标测试；App 真实 HTTP fixture 记录请求／撤销／scope，渲染节点计数和同名稳定 ID 断言；无 query 请求数为 0。 |
| SC-0025-03 | 标题、正文、手动联系人、提及和活动保存为一个 actor 私有 canonical note；删除提及／chip 按来源更新关联，旧客户端省略新字段不清空；自动草稿只在对应 scope 恢复，失败和取消不丢内容。 | Web schema v1→v2、幂等／版本冲突／越权／范围校验测试；App 编辑、草稿重启、账号／服务器切换及保存失败交互。 |
| SC-0025-04 | 阅读详情与联系人“笔记”页签符合 4a：来源标签、真实关联活动／待办、搜索分页和带联系人新建可用；`IORBIT 总结`只预填，显式发送／确认后才写事项。 | App 详情／联系人页签／0019 回归；Web 联系人筛选 note API；错误、404、无权和缺失关联对象反例；iOS 键盘、返回、大字号和 VoiceOver 标签。 |
| SC-0025-05 | 当前源码构建的 Web/API 与原生 App 在同账号、同数据库中双向创建／编辑／搜索同一 note，并保持 title/body/contact/mention/event/version 一致；另一账号不可见，Web/API 更新后已重新构建重启。 | Web 生产构建和健康检查；浏览器＋iOS Simulator（发布要求时补实体设备）同一脱敏账号的 Web→App、App→Web 回读；记录 Web commit、启动地址／模式、App base URL／build、note ID/version、服务重启和隔离反例。 |

## 一次 Generator 的执行顺序

每个 Task 属于同一个 run-01，不启动第二个实现者或 Evaluator。

### Task 1 — 新契约、旧记录兼容和有界查询（SC-01／02／03）

1. 读取前序 REPORT、Bridge 和当前源码，登记基线／Planner hash；对共享 note、contact query、handler 符号逐个做 upstream/API impact，先报告 HIGH／CRITICAL。
2. 先扩 Web tests 观察 RED：v1 note 投影标题、v2 新字段、旧客户端 PATCH 保留、mention range／actor 校验、note 搜索筛选游标、10,000 contacts 的 provider 有界读取和 opaque cursor。
3. 最小实现共享契约、note record/service/routes、actor-scoped association reader 与 contact search 分页。按人名搜索笔记时由读取层批量解析联系人 ID；保存联系人／活动关联时也通过同一 actor 范围校验。不要在 route 或 App 中先加载全集再切片；分页顺序用稳定 ID 收尾。
4. 运行 Task 1 完整相关测试和 Web typecheck；执行 `npm run sync:contract`，检查生成副本只含预期变化。按“兼容契约＋有界搜索”一个可验收链提交。

### Task 2 — 搜索式关联、提及和草稿（SC-02／03）

1. 新增 App RED：空查询零请求；250 ms 后一字请求；第二个词取消第一个；迟到响应／换账号／换 base URL 不污染；同名按 ID；分页有界；选择保持；取消回滚。
2. 实现加号入口、全屏搜索、多选已选区和 `@` 候选面板。复用现有 API client 与 scope；请求用 AbortController 和 query generation 双保险。
3. 新增提及来源合并／删除、标题正文、活动选择和本地草稿 RED；实现 UTF-16 range 调整、canonical request builder、scope draft storage 与失败状态。不得在日志输出正文或候选完整资料。
4. 跑新测试完整文件、notes view-model 和直接消费者；App typecheck 一次。按“编辑器搜索关联＋草稿”提交，不以静态源码字符串断言代替点击／输入／HTTP 行为。

### Task 3 — 六个 4a 状态与导航（SC-01／04）

1. 将 `NotesScreen` 接到搜索／筛选／分页并实现 4a 分组行；长标题、无头像、超过三人、活动缺失、加载／空／失败先有行为测试。
2. 拆出 `/notes/[id]` 阅读态与 `/notes/[id]/edit` 编辑态；详情接真实关联来源、活动、来源待办和 0019 IORBIT 导航。保存成功才返回 canonical 阅读态。
3. 把联系人详情的旧备注区调整为 4a 页签中的关联笔记视图，旧备注只读保留在资料语义中，不被删除或伪迁移；搜索和新建始终携带当前 contactId。
4. 按 DESIGN 的六图做 React Native Web 390×844 对照和双倍字号／键盘检查，修复可观察差异；图中 fixture 数量、状态栏与外框不进入产品。跑直接消费者和路由覆盖、App typecheck，提交“六屏 4a 阅读／编辑／联系人入口”。

### Task 4 — 同版本 Web/App 收口（全部 SC）

1. 完成本 Sprint H/I 定向和受影响端一次全量；既有失败按名称与基线记录，不能记成通过。执行 `git diff --check`、共享契约同步检查和 GitNexus `detect_changes(scope: staged)`。
2. 因 Web/API／共享契约已变，停止旧 Web 进程；在目标环境做生产构建，启动新产物并检查健康端点。启动 App 指向该地址，确认浏览器与 App 使用同一脱敏账号和数据库。
3. Web 新建含标题、提及、手动联系人和活动的 note→App 刷新／搜索／详情回读；App 修改并移除一种关联来源→Web 刷新回读；再做另一 actor 404、stale version 409 和重复幂等键不重复写。
4. 保存原生 iOS 的加号、输入搜索、同名选择、键盘、阅读／编辑返回和联系人页签证据。全部五项满足后才写 REPORT、更新登记与 Bridge 交接；否则逐项标 fail／blocked 并结束 run，不降低契约。

## 最小测试与检查

**档位：H + I。** 本 Sprint 修改 actor 私有写入、版本／幂等、共享契约、跨端状态和大量联系人查询，必须覆盖隔离、并发、兼容和真实双端回读；开发中仍只跑当前操作链定向集，代码收口后每个受影响端全量一次。

Web cwd `/Users/xzhao/Projects/orbit/repos/orbits`：

```sh
node --test --import tsx tests/services/notes-service.test.ts tests/api/notes-routes.test.ts tests/capabilities/contact-notes.test.ts tests/capabilities/contacts-list-search-and-filter-mock.test.ts tests/capabilities/note-search-pagination.test.ts tests/capabilities/contact-search-pagination.test.ts tests/capabilities/note-association-reader.test.ts
npm run typecheck
npm test
```

App cwd `/Users/xzhao/Projects/orbit/repos/orbit-app`：

```sh
npm run sync:contract
node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/notes-view-model.test.ts tests/notes-interactions.test.tsx tests/note-contact-search-interactions.test.tsx tests/note-mentions-interactions.test.tsx tests/note-draft-storage.test.ts tests/contact-notes-view-model.test.ts tests/contact-notes-interactions.test.ts tests/ink-signal-contact-detail.test.ts tests/note-suggestions-interactions.test.tsx
npm run typecheck
npm test
```

隔离 PostgreSQL 用当前项目已有临时数据库设施执行 note/search provider 集成；缺配置必须显式失败或登记 blocked，不能 skip 后宣称 SC-02／03／05 通过。10,000 联系人夹具只保存最小字段并测 provider 调用边界、页大小和客户端渲染数，不截图或日志输出完整名单。

视觉证据包括六个 4a 主状态以及搜索无结果／失败、编辑保存失败、双倍字号、键盘。只在实现版本变化影响布局时重拍；不做无关页面像素评分。真实跨端运行严格遵守 [RULES 5.4](../RULES.md#54-app-开发期间的-web-运行门槛)，组件测试、mock API 或只开 Metro 不能替代 SC-05。

本 Sprint 不需要付费模型来验证搜索、草稿和视觉；IORBIT 路径可用受控 provider 证明“点击不调用、显式发送才调用”。若真实模型是既有环境的必需部分，沿用全局费用账本和用户硬上限，不重置。

## 失败与交接

同一非预期失败按 RULES 最多两轮本地修复；搜索 provider 若无法证明有界读取，不得用客户端 `.slice(0, 20)` 关闭 SC-02。旧记录不能读取、mention range 失配、跨账号草稿泄漏、版本冲突覆盖或未重启 Web 都是必需 SC 失败。

交接需列两端 commit、NoteContract／ContactsListPayload 版本、旧客户端兼容、实际追加白名单、分页限制、草稿 scope、Web 生产构建／重启信息、App base URL、同账号／另一账号证据和六图差异。REPORT 只在 run 结束时创建；文档编制、设计截图入库或定向测试通过都不是 Sprint 完成。
