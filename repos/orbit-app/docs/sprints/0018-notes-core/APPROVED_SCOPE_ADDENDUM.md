# Sprint 0018 跨端实施补充

2026-09-15 用户明确要求开始实现 0018 与 0019；按 `RULES.md` 第 0、6 节复用既有整体批准。本补充保留原 Planner revision 3、SHA256 `750df5d4ceb63b6691de6b61667eda96152da779833ead97e1b171c02057b79b` 和全部 SC，不降低验收条件。

## 可执行契约

- 独立笔记是 actor 私有的单一记录：`id`、`ownerUserId/accountId`、`body`、去重后的 `contactIds`、整数 `version`、`createdAt/updatedAt`。
- `POST /api/notes` 以 `idempotencyKey` 创建；同一账号重放返回同一 ID，同一 key 的不同内容冲突。空正文不写入。
- `GET /api/notes` 与 `GET /api/notes/:id` 只返回当前 actor 的记录，可用 `contactId` 过滤列表。
- `PATCH /api/notes/:id` 携带 `expectedVersion` 与 `idempotencyKey`，只更新正文或关联集合；版本不匹配返回冲突，幂等重放返回同一已确认版本。
- `DELETE /api/notes/:id/contacts/:contactId` 只解除一项关联，携带 `expectedVersion` 与 `idempotencyKey`；不得删除正文或其他关联。
- 使用现有 `orbit_records` 通用信封集合 `notes`，不新增数据库迁移、不接触真实数据库。

## 必要文件范围

为完成 SC-0018-01～05，追加以下本地实现范围：

- Web/API：`repos/orbits/features/notes/**`、`repos/orbits/app/api/notes/**`、`repos/orbits/shared/contract/notes.ts`、`repos/orbits/shared/contract/index.ts`、对应 `repos/orbits/tests/services/notes-service.test.ts`、`repos/orbits/tests/api/notes-routes.test.ts` 与契约测试直接消费者。
- App 契约与路由：`src/api/contract/notes.ts`、`src/api/contract/index.ts`、`src/api/endpoints.ts`、`app/notes/index.tsx`、`app/notes/new.tsx`、`app/notes/[id].tsx`。
- App 界面与接线：`src/screens/notes/NotesScreen.tsx`、`src/screens/notes/NewNoteScreen.tsx`、`src/screens/notes/NoteDetailScreen.tsx`、`src/view-models/notes.ts`、`src/screens/home/HomeDashboardScreen.tsx`、`src/screens/contacts/ContactNotesSection.tsx` 与 `src/screens/contacts/ContactDetailScreen.tsx`。
- App 验证与路由文档：`tests/notes-interactions.test.tsx`、`tests/home-dashboard-interactions.test.ts`、`tests/app-wide-route-coverage.test.ts`、`docs/designs/2026-09-08-app-wide-style/README.md`、契约同步测试的自动生成副本，以及本 Sprint 报告和 Bridge 交接。

旧联系人备注先作为只读历史内容保留。独立笔记创建、列表、详情和多人关联完成并可访问后，联系人详情不再提供旧备注写入；本轮不迁移、不删除、不强行归类历史备注。
