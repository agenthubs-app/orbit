# R15 P1 复核：改当前招待码的共享项目（码不变）

- 复核人：独立复核（未参与实现），2026-10-12
- 范围：`562f615f`（契约 + 服务端 + 测试）、`55d56989`（REPORT）
- 依据：`add-and-invite/DESIGN.md` §2.4 / §4.2 / §6 / §10、`R15-invite-codes/PLANNER.md`、`REPORT.md`；接口 `PUT /api/invite-codes/current/share`

## 结论：通过

没有 S / M。下面 6 条 m 是建议，可以在加人界面返工接这个接口时顺手处理。

## 核对过的点

| 项 | 结果 | 依据 |
| --- | --- | --- |
| 契约只加不改 | ✅ 只新增 `InviteCodeShareUpdateInput`，响应复用 `InviteCodeContract`；snapshot 已更新 | `shared/contract/invite-codes.ts:169-182` |
| 请求严、响应宽 | ✅ 请求 `z.object({ sharedKeys, idempotencyKey }).strict()`，`sharedKeys` 与发码 / 兑换共用 `sharedKeysInput`（枚举、去重、≤5）；响应仍是不 strict 的 `inviteCodeSchema` | `shared/api-schema/invite-codes.ts:100-101` |
| App 副本 | ✅ `contract/invite-codes.ts`、`contract/index.ts`、`schema/invite-codes.ts` 与 orbits 逐字一致（`diff` 为空） | — |
| 他人的码 | ✅ 仓储按 `workspace_id + actor_id + id` 更新；服务只取本人 `findUsableCode`；Bob 改 → 404（内存 + PG 都测了） | `repository.ts:240-248`、`service.ts:411-427` |
| 示例模式写拦截 | ✅ `authed(true, …)` → `SAMPLE_READ_ONLY` 403；路由测试覆盖 | `handlers.ts:134-149, 165-169` |
| 公开预览不泄露 email / phone | ✅ 预览仍是 `includeContact: false`；测试在键里放 `phone` / `email` 后断言预览只有名字 / 公司 / offering / seeking | `service.ts:445`；`invite-codes-service.test.ts` P1 第一例 |
| 兑换读到新值 | ✅ 兑换 `findCodeByCode(…, { forUpdate: true })` 在 READ COMMITTED 下等锁后读最新提交版本，`peer` 与 `inviterSharedKeys` 都来自这一行；测试中 Carol 后兑换得到新键、Bob 的旧连接不变 | `service.ts:475, 504-531`；`configured.ts:79` |
| 改码 vs 发码 / 作废 | ✅ 三者同一把 `lockActor` 咨询锁；更新语句再带 `revoked_at is null and superseded_at is null`，不会改到刚被替换 / 作废的码 | `service.ts:322, 404, 416` |
| 改码 vs 兑换 | ✅ 两边在码行上串行（兑换 `for update`，改码 `update`）；锁顺序：改码 = actor 锁 → 行锁，兑换 = 行锁 → pair 锁，无环，不会死锁 | — |
| 过期 / 作废 / 被替换 / 没资料 | ✅ 404 / 404 / 404 / 409 `PROFILE_REQUIRED`，口径与 `current()` 一致（满员的码仍算当前码，可改） | `service.ts:418-421` |
| Web 落地页缓存 | ✅ `/i/[code]` 是 `force-dynamic`，改完下次打开就是新值 | `app/i/[code]/page.tsx:12` |
| 测试 | ✅ 服务层内存 + PostgreSQL 各 2 例、live 路由内存 + PG、mock 路由各 1 例；本机串行跑 `invite-codes-service` / `invite-codes-routes` / `redesign-contract-routes` 46/46 通过（PG 用例实际执行，未 skip） | — |

## 问题

### m1 发码幂等重放会因为改过共享项目而变成 409

- 位置：`repos/orbits/features/invite-codes/service.ts:323-329`
- 场景：`POST /api/invite-codes`（键 K，`sharedKeys=[organization]`）已成功但响应丢了 → 期间 `PUT /current/share` 改成 `[email]` → 客户端用同一个 K 重发 → `replay.sharedKeys`（已是 `[email]`）≠ 请求的 `[organization]` → `IDEMPOTENCY_CONFLICT`。同一个请求的重放不再拿到同样的结果。
- 现实风险低：两端界面失败后都会把 `createKey` 清掉（`InviteCodeModal.tsx:123`、`InviteSenderScreen.tsx:125`），重试用新键；所以只记 m。
- 建议：重放比较只看 `maxUses`，或在码行上另存「发码时的键」（`created_shared_keys`）用于比较；至少在服务注释里写明这个例外。

### m2 `idempotencyKey` 在 live 只校验非空、不参与语义；mock 却按键重放

- 位置：live `service.ts:411-412`；mock `features/redesign-contracts/mock-service.ts:234-242`
- 场景：同一个键先 `[seeking]`、再用同一个键发 `[email]`：live 改成 `[email]`（PUT 语义），mock 原样返回第一次的 `[seeking]` 结果；码作废后用旧键重发，mock 仍 200、live 404。mock 与 live 不同形，前端照 mock 写的重试逻辑到 live 会表现不同。
- 建议：mock 去掉 `currentShares` 重放表，改成与 live 一样「直接按当前码应用、没有当前码 404」；契约注释（`shared/contract/invite-codes.ts:173-178`）写明这个键只为与其他写接口同形、服务端按 PUT 语义处理（与 `…/connections/[contactId]/share` 一致）。

### m3 mock 发码重放返回的是旧的 `shared`

- 位置：`mock-service.ts:218-219`（`creates` 表）与 `:239`（只改 `mine[0].contract`）
- 场景：mock 里发码（键 K）→ 改共享 → 用 K 重放发码 → 返回改之前的 `shared`，而 `GET /current` 已是新值。只影响演示世界。
- 建议：`creates` 里存码，重放时从 `mine` 取当前 contract。

### m4 没有并发测试

- 位置：`tests/capabilities/invite-codes-service.test.ts` P1 两例都是串行
- 说明：上面「改码 vs 兑换 / 发码」的正确性是读代码 + 隔离级别推出来的，没有 PG 用例钉住。
- 建议：PG 套件加一例 `Promise.all([updateCurrentShare(A,…), redeem(B,…)])`，断言 B 拿到的 `peer` 要么全是旧键要么全是新键、连接行 `inviterSharedKeys` 与 `peer` 一致；再加一例与 `create` 并发，断言新码不被改、旧码不被改成新键。

### m5 设计文档没登记新接口

- 位置：`add-and-invite/DESIGN.md` §4.2（`:205-217`）、§2.4（`:86`）；`R15-invite-codes/PLANNER.md` 接口表（`:50` 一带）
- 说明：REPORT 记了，但契约清单与接口表没有 `InviteCodeShareUpdateInput` / `PUT /api/invite-codes/current/share`，后来人按 DESIGN 找不到；§2.4「[変更]」也没写明是「码不变、只影响之后的人」。
- 建议：§4.2 追加一行；§2.4 在「[変更]」后补一句口径。

### m6 「没有当前码」与「无资料」的先后

- 位置：`service.ts:418-421`
- 说明：先判 404 再判 409，资料被删且码已过期时返回 404（不提示补资料）。与 `current()` 一致，可接受；只是界面接的时候要知道：409 只在「有当前码但资料没名字」时出现。
- 建议：不改代码；界面接入时在 copy 里两种都处理。

## 处理记录（执行人，2026-10-12）

全部在 `52081e81`。

| 条目 | 处理 |
| --- | --- |
| m1 | 不改代码，`service.ts` create 的重放分支写了例外注释。成熟做法（Stripe 式：按键存原请求指纹、只与原请求比）要给 `invite_codes` 加列 = 生产迁移，不算低成本；只比 `maxUses` 又会放过「同键换内容」的误用。两端界面发码失败后都清键重试，现实碰不到；409 是安全一侧。以后若要加列，和下一次招待码迁移一起做。 |
| m2 | 已修：mock 去掉 `currentShares` 重放表，与 live 同为 PUT 语义（同键换内容按新内容改；码作废后旧键也是 404）；契约 `InviteCodeShareUpdateInput.idempotencyKey` 注释写明「只为同形、按 PUT 语义」（只改注释，快照无变化，App 副本已同步）。mock 路由用例更新。 |
| m3 | 已修：mock 发码重放返回这张码现在的 contract（改过共享就是改后的值，与 `GET /current` 一致）；注释写明 live 另有 409 比对、演示世界不做。新增 mock 用例。 |
| m4 | 已补（服务层，内存 + PG）：「改码 vs 6 人并发兑换」——每个兑换的 `peer` 要么全旧要么全新，连接上的 `sharedByPeer` 与之一致；「改码 vs 发码并发 ×4 轮」——改动只落在那一刻的当前码上，PG 直接查 `invite_codes` 断言被替换的旧码不会拿到新键、新码的键是发码时的或改后的。 |
| m5 | 已补：DESIGN §2.4 追加「[変更]」口径一行、§4.2 追加 `InviteCodeShareUpdateInput` 一行；R15 PLANNER 接口表追加 `PUT /api/invite-codes/current/share` 一行。 |
| m6 | 不改代码。给界面接入的说明：`PUT /current/share` 先判「有没有当前码」（404）再判资料（409 `PROFILE_REQUIRED`），所以 409 只在「有当前码但资料没名字」时出现；界面两种都要处理——404 回到「コードをつくる」，409 引导去补资料。 |

验证：`invite-codes-service` 25/25、`invite-codes-routes`、`redesign-contract-routes` 18/18、`invite-codes-r15-schema`、`redesign-schema-parity`、`demo-world-consistency`、`contract-append-only`，连同 R16 相关共 120/120（PG 用例实际执行）；`typecheck`、`typecheck:app`、`lint`、App `tsc --noEmit`、App `contract-sync` 3/3 通过。
