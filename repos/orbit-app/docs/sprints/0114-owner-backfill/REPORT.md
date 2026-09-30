# Sprint 0114 执行报告：补写主人（断网第 0 期下半）

**run-01。** Generator 为子代理（没有再派子代理），报告由协调者代存。分支 `sprint/0114-owner-backfill`，基线 `2b00eee0a` 加开工提交 `07cf22e3f`，没有推送。

**状态：completed。** 下面提到需要决定的一处，已由协调者按用户授权决定，见第 11 节。
- **偏离计划的一处：** 按计划，没被引用、也判断不了主人的来源记录（程序里叫 evidence），应该归给生成它的演示账号。我改成了默认不补，只列出来。加 `--assign-generated-sources` 才按计划补。原因和实测数字见第 3 节第 1 条。
- **orbits 全量有 1 条失败：** 是我放在 `build/` 下的临时脚本类型报错，已移走，该文件重跑通过。没有重跑全量（见第 5 节）。

## 1. 结论

**已验证能做到：**
- **联系人及附属数据（本地开发库 `orbit_events`，逐类对照）：**
  - 关系 488 条全部补上主人，现在主人为空 0 条。
  - 来源记录中被联系人数据引用的 264 条补上了主人。
  - 联系人和联系人详情状态没有可补的（详情状态这类在开发库里没有数据）。
  - 执行前后，每个账号的联系人列表和全部详情页内容逐字节相同。
- **被多人共用的来源：** 每人各有一份，各自的引用改指向自己那份，内容不变，没有删除任何行。这条由真库测试证明，开发库里没有需要复制的情况（复制 0 条）。
- **补写命令 `npm run db:backfill:owners`：**
  - 默认只统计（dry-run），`--preview` 把每一条计划改动写成文件，`--apply` 先把要改的行导出备份再写库。
  - 远程库执行要加 `--confirm-remote=<host>/<database>`。
  - 第二次执行改动 0 行。
- **种子脚本：** 在空库里重新生成数据后，这几类主人为空的行数是 0。脚本本身不用改，原因见第 3 节第 5 条。
- **主人检查没有被绕过：** 补写走一个登记过的处理方式，但它只能给空主人补第一个主人，数据库守卫对它不开放任何口子。
- **平台公共数据**（参会者、推荐算法中间数据等）没有补，逐类列在执行输出里。

**仍然没有主人的行（开发库）：**
- 联系人 1 条：`contact:business-card:ef5fc8eb…`（江東 新，7 月 23 日的名片记录）。没有 accountId，也没有任何记录引用它，无法判断，没有改。
- 来源记录 4147 条：

| 数量 | 为什么没补 |
|---|---|
| 1826 | 平台公共数据：只被 attendees、eventParticipantIntents、aiAnalyses、networkPeople、recommendationTests、personRelationshipEdges、matchRecommendations 引用 |
| 2320 | 没有任何「有主人、且未删除」的记录引用它：1166 条谁都没引用；488 条只被已删除的关系引用；666 条只被没有主人的演示数据引用（interactionMemories 600、agentActions 60、permissions 1、dashboards 5）。加 `--assign-generated-sources` 即归给 `account_orbit_generated` |
| 1 | `evidence:event:01`：被演示账号的会面和主办方的活动共用，两边都在联系人类别之外，引用改不了，列出来没动 |

**付费调用 0 次。** 我启动的东西都已停掉，临时库 `orbit_events_scratch_0114` 已删除。现在只有你的 3000 在监听。

## 2. 逐项验收

| SC | 结果 | 证据 |
|---|---|---|
| 01 每类主人为空 = 0，判断不了的单列 | 部分达成 | 关系 0；联系人 1 条、来源 4147 条逐条列出原因（见上表）。其中 2320 条来源是我改了默认不补，需要你确认（第 3 节第 1 条）。前后对照：`orbit_events-counts-before/after.txt` |
| 02 共用来源复制后，两人的详情页和原来一样 | 通过 | 真库测试用真实的联系人详情服务比较 A、B、C 三人执行前后的页面，除编号外完全相同。开发库全部账号的列表和详情逐字节相同（`orbit_events-pages-*.json`） |
| 03 可重复；dry-run 和 preview 不改库；执行前导出 | 通过 | 测试：dry-run 和 preview 前后整库哈希不变；第二次执行 0 改动，哈希不变；备份里有全部被改行的原样。开发库备份 752 行、1.4MB，第二次执行改动 0 |
| 04 空库重新生成种子后主人为空 = 0 | 通过（不是先红后绿） | `seed-owner-postgres`：生成数据的种子，加上以子进程运行的账号联系人种子，之后补写命令的预演改动为 0 |
| 05 检查没被绕过；全量；typecheck；棘轮 | 通过（全量见第 5 节） | 数据库守卫生成的 SQL 与基线逐字相同（`guard-sql-unchanged.txt`）；审计新增一条反例；棘轮文件没有改动 |

## 3. 设计取舍（需要你知道的）

1. **需要你决定：没被有效引用的来源记录默认不补。**
   - 实测：如果按计划把 2584 条都归给演示账号，这个账号的跟进和提醒页面每次要读的来源行数从 248 变成 957，字节从 377KB 变成 1.24MB（第二版实测）。
   - 按计划全补（第一版），「所有者为该账号的来源行」从 36 变成 2611（2.78MB），启动接口的读取从 386 行变成 2961 行。
   - 原因是：跟进页面、提醒页面和启动接口会读取「这个账号拥有的全部来源记录」。
   - 这些行不挂在任何联系人下面，0116 不会把它们发给设备，补上主人只会增加读取成本。
   - 现在的默认只补被引用的：跟进页面读到的来源行 248 变成 291（多 52KB），启动接口读取 386 变成 641 行（多出的都是只取编号的小行）。
   - 如果要按原计划全补，加 `--assign-generated-sources`，一条命令即可，随时可以补。
   - 反过来，补上以后再清空就难了：0116 把来源记录纳入守卫之后，清主人本身会被拦。所以先不补是可逆的做法。
2. **用「只能补第一个主人」的方式登记，而不是普通的改主人方式：**
   - 如果直接把名字加进登记清单，数据库守卫会让任何带这个名字的事务改笔记、待办的主人。我在旧的 owner-guard 上跑过，新测试立刻失败（`red-naive-handler-registration.txt`）。
   - 现在的做法：登记表里每个处理方式都带范围，分两种：
     - 「改主人」：守卫和 `reassignRecordOwner` 只认这一种，目前没有登记任何一个。
     - 「只补第一个主人」：补写命令属于这种，只限 contacts、connections、contact_detail_states、evidence 四类。静态审计要求它的每条写语句都带 `user_id is null` 条件。
   - 守卫生成的 SQL 没变，所以数据库不需要重新迁移。
3. **488 条关系在开发库里都是已删除状态。** 是演示数据清理时删掉的重复边。补上主人后，页面读取会过滤掉已删除行，所以显示不变，也没有增加读取。
4. **共用来源怎么分：**
   - 原来那一行留给谁：引用改不了的那一方（笔记、活动等不属于联系人类别的记录）留原行；两边的引用都能改时，留给编号排在前面的主人。
   - 其他人各得一份新编号的副本，编号规则为 `<原编号>~owner-<哈希>`，只改这些人在 contacts、connections、contact_detail_states 里的引用。
   - 同步类别（笔记、待办、日程）永远不改写。
   - 两方以上的引用都改不了时，整行列为「判断不了」，不做任何改动。
5. **种子脚本不用改：**
   - 生成种子从 7 月 28 日起就写了主人。开发库里这些空主人，是 7 月 24 日之前生成的旧数据（来源记录最后更新于 7 月 24 日）。0113 修好通用 upsert 之后，不会再被清空。
   - `seed-demo-workspace.ts` 把活动的主人置空后，下一步马上由主办方计划重新补上。活动不在联系人范围内，保留原样。
6. **防并发：**
   - 执行时整个过程在一个事务里，先取同步提交顺序锁，所以 0116 把联系人纳入同步后，这个命令照样能用。
   - 写完后在同一个事务里再算一遍计划，还有剩余改动就整体回滚。
   - 补主人的语句都带 `user_id is null` 条件，碰到已经有主人的行就报错回滚：测试里故意让计划去改已有主人，三条测试都触发了 `OWNER_BACKFILL_CONFLICT`。

## 4. 新增测试及各自证明什么

**`owner-backfill-postgres`（4 条，真库）：**
1. **按引用补主人：**
   - 联系人按 accountId 或引用它的关系；关系跟随联系人；详情状态按 actorId；来源按引用它的记录的主人。
   - accountId 和联系人主人不一致的关系、找不到依据的联系人和来源，都列出来不改。
   - 平台公共数据的行一个字节都不变；B 账号的数据一个字节都不变；已有的主人一个都没变。
   - 生成的来源只有加 `--assign-generated-sources` 才归给演示账号。
2. **共用来源复制：**
   - 正好新增 3 份副本，一行没少。
   - 副本内容和原来相同；引用、信封列和下一步行动里的来源都改指向自己那份。
   - 笔记这类同步类别不被改写；活动加会面共用的来源不动。
   - A、B、C 三人的详情页和执行前相同。
3. **只读与重复执行：**
   - dry-run 和 preview 前后整库哈希不变；没给备份路径时拒绝执行。
   - 备份包含所有被改行的原样。
   - 第二次执行 0 改动，哈希不变。
4. **远程保护和命令行：**
   - 远程库没有 `--confirm-remote` 时拒绝执行，只读预演允许。
   - 以真实子进程跑命令：预演不写库，执行后写出一个备份文件，第二次输出 `assigned 0 … copied 0`。

**`seed-owner-postgres`（1 条）：** 空库跑完两个种子后，四类都没有空主人，补写预演改动为 0。

**`sync-owner-guard-postgres` 新增 1 条：** 用「只补第一个主人」的名字，也改不了笔记或待办的主人、清不掉主人，`reassignRecordOwner` 同样拒绝。

**`sync-owner-audit` 新增反例：** 这类处理方式里有一条语句没带 `user_id is null` 时，审计报 `OWNER_OVERWRITE`。

**先失败的证据**（目录 `repos/orbit-app/build/harness-state/evidence/sprint-0114/run-01/commands/`）：
- `red-owner-backfill.txt`：模块还不存在时测试失败。
- 三个故意改坏实现的版本：
  - `red-mutation-no-copies.txt`：不复制共用来源，2 条测试失败；
  - `red-mutation-public-owned.txt`：把公共数据也补上主人，1 条失败；
  - `red-mutation-reowns-contacts.txt`：计划去改已有主人，数据库条件拦下，4 条都失败。
- `red-naive-handler-registration.txt`：直接登记名字会打开守卫。
- `red-audit-first-owner-guard.txt`：换回旧的审计实现，新反例报不出来。

## 5. 全量、Postgres、typecheck

**orbits 全量：** 5289 条，4748 通过，**1 条失败**，540 跳过。
- 失败的是 `orbit-typecheck-ratchet`，报的是我放在被 git 忽略的 `build/` 下的临时取证脚本 `build/owner-backfill-page-dump.ts` 的类型错误，已提交的代码没有问题。
- 脚本移到 scratchpad 后，该文件 2/2 通过，没有重跑全量。
- 和基线（0 失败）比，没有其他失败。

**App 全量：** 3729/3729 通过。App 没有改动。

**Postgres 环境（`--test-concurrency=1`，经 `run-node-tests.mjs`）：**
- 在 `orbit_test` 上跑 27 个文件（清单在 `postgres-env-files.txt`，包含与 sync、主人、联系人读取、种子、审计相关的全部数据库测试）：122 条，121 通过，0 失败，1 跳过。
- 在 `orbit_cutover_test_20260917` 上跑 `contact-search-pagination` 和 `read-projection-parity`：35 条，28 通过，7 条失败，都是 `contact-search-pagination` 原有的 7 条。

**typecheck 与 lint：** orbits 的 `typecheck`、`typecheck:app`、`lint` 和 App 的 `typecheck` 都是 0 错误。

**读取棘轮：** 文件没有改动。代码里没有新增 `listRecords`。

## 6. 提交

- `5cdd0d5ec` feat(orbits): owner backfill for contact rows through a registered first-owner handler (0114)（唯一也是最后一个功能提交）

**改动文件：**
- 新增：`features/sync/owner-backfill.ts`、`scripts/backfill-owners.ts`、`tests/services/owner-backfill-postgres.test.ts`、`tests/services/seed-owner-postgres.test.ts`
- 修改：`features/sync/domain-registry.ts`、`features/sync/owner-guard.ts`、`package.json`（新增 `db:backfill:owners`）、`tests/support/sync-owner-audit.ts`、`tests/storage/sync-owner-audit.test.ts`、`tests/storage/sync-write-lock-audit.test.ts`、`tests/services/sync-owner-guard-postgres.test.ts`

以上都在 `repos/orbits/` 下。工作区只剩你原有的文件：各个 codex-review.md、`.claude/skills/gitnexus/`、`output/`、`next-env.d.ts`。REPORT.md 由协调者代存。

## 7. 运行时证据

证据目录同上，还有 `backups/` 和几个 json 文件。

**执行顺序：**
1. **`orbit_test`：** 这个库的 public schema 里没有联系人数据。预演、执行、再预演都是 0 改动，执行结果 `verified true`（`orbit_test-run.txt`）。
2. **`orbit_events` 的临时副本**（9245 行，用 pg_dump 复制）：
   - 前两版规则都在副本上跑过，数字留作对照，放在 `superseded/`。
   - 最终版：预演和 preview 后哈希不变 `2620c6f0…`；执行改了 752 行（关系 488，来源 264），第二次执行 0 改动。
   - 全部账号的列表和详情逐字节相同。
3. **`orbit_events`（提交 `5cdd0d5ec`、测试通过之后）：**
   - 执行前：关系 578 行中 488 行没有主人；联系人 94 中 1；来源 4483 中 4411。
   - 执行：改了 752 行，`verified true`。备份在 `backups/owner-backfill-orbit_events-2026-09-28T003136103Z.jsonl`（752 行）。
   - 执行后：关系 0、联系人 1、来源 4147。再预演改动为 0。
   - 账号 `account_orbit_generated`：列表 78 条，详情 78 个，0 个报错，显示的来源 168 条，执行前后逐字节相同（`orbit_events-pages-*.json`）。
   - 读取成本：该账号拥有的来源行 36 → 291，启动接口读取 386 → 641 行，跟进页面读到的来源行 248 → 291。
4. **3000 冒烟：** 我没有登录会话，所以只做了数据库层的检查：用真实的联系人列表和详情服务，读取与 3000 同一个库。不带会话访问 `/api/contacts` 返回 401，说明服务在运行。没有重启过 3000。

## 8. GitNexus

- 索引已过期，我用 `gitnexus analyze --skip-agents-md` 重建，没有改写 AGENTS.md 或 CLAUDE.md。
- 流程问题：`domain-registry` 的第一处修改是在跑 impact 之前做的。索引重建后补跑了 impact，也补做了文本搜索核对。
- impact 结果：
  - `SYNC_OWNER_CHANGE_HANDLERS`：LOW，0 处。这是常量，调用方靠文本搜索确认：owner-guard、审计辅助代码和审计测试。
  - `assertRegisteredOwnerChange`：LOW，2 处（两个 `reassignRecordOwner`）。
  - `auditOwnerWrites`：LOW。
  - `seedGeneratedRelationshipFixturesIntoLiveStore`：LOW。这个函数最后没有改。
- 提交前 staged 的 detect-changes：low，受影响流程 0。与基线比较的结果也是 low，变化中还混进了你那些没提交的 codex-review.md。
- 列为「已改」的 `SYNC_OWNER_GUARD_SQL`，已核实生成的文本与基线相同。

## 9. 生产步骤（需要你确认，我没有碰生产）

建议写进 `PRODUCTION_ROLLOUT.md`：

① **只读统计：** 部署 `5cdd0d5ec` 之后，用生产的连接配置运行 `npm run db:backfill:owners`（默认只统计，可以直接连远程库）。
- 记下四类的 total、ownerless、assign、copy、skip、unresolvable，以及列出的每一行。
- 再运行 `-- --preview --out-dir=<外部备份目录>`，保存逐条计划改动。
- 判断不了的行，确认后再决定是否手工处理。

② **执行（会先备份）：**
`npm run db:backfill:owners -- --apply --out-dir=<外部备份目录> --confirm-remote=<host>/<database>`
- 全程一个事务：先导出要改的行，再写库，然后自检，自检不过就回滚。
- 如果你决定按原计划全补，再加 `--assign-generated-sources`。

③ **验证：**
- 再跑一次 dry-run，assign 和 copy 都应该是 0。
- 冒烟：两个账号各打开一次联系人列表和详情。

④ **回滚：**
- 备份文件里有每个被改行的原样。
- 目前这四类不受守卫限制，按备份把主人恢复为空、删掉副本、恢复被改的引用，都可以做到。
- 0116 把它们纳入守卫以后，就不能这样回滚了，所以**必须在 0116 上线前执行并确认**。

不需要数据库迁移，守卫 SQL 没有变。

## 10. 需要你知道或决定的事

1. **要不要按原计划全补？** 默认没补的来源记录，是否要加 `--assign-generated-sources` 全部补上？代价见第 3 节第 1 条。
2. **名片联系人 `江東 新`：** 7 月 23 日创建，没有任何主人依据。时间上看可能是 demo@orbit.dev 账号创建的，但我没有按时间去猜。
3. **`evidence:event:01`：** 被活动和会面共用，不属于联系人范围，原样保留。
4. **违规记录：**
   - 我在 `repos/orbits` 目录里执行过一次 `git diff --stat`，读到的是遗留的嵌套 `.git`，只读，没有副作用。
   - 临时取证脚本放进了 `build/`，导致类型棘轮测试失败一次，已移走。
5. **交接给 0116：**
   - 附属类别清单是 contacts、connections、contact_detail_states、evidence（`card-service` 和联系人读取实际读的就是这四类）。
   - 关联方式：
     - 关系通过 `payload.contactId` 关联联系人；
     - 详情状态通过 `payload.actorId` 和 `payload.contactId` 关联；
     - 来源记录由联系人和关系的 `payload.evidenceIds`、`evidence_ids` 以及 `nextAction.evidenceId` 引用，按 `payload.id` 匹配。
   - interactionMemories 不在联系人页面的读取范围内。
   - 补写命令可以重复执行，0116 上线前要在生产执行一次。
## 11. 协调者复核与决定

**复核**（在 `5cdd0d5ec` 上）：
- **orbits 全量**：5289 条，4749 通过，**0 失败**，540 跳过。子代理那次失败，是放在 `build/` 下的临时脚本，已经移走。
- **Postgres 测试**：涉及 sync、主人、联系人、种子、来源、关系的全部 `orbit_test` 文件，共 281 条，275 通过，1 失败，5 跳过。唯一的失败是 `task-page-postgres` 的语句超时，0112 已登记为不稳定用例，与本 Sprint 无关。
- **App**：没有改动。

**决定（按用户 2026-09-28 的授权）：接受子代理的默认做法，孤立来源记录不补主人。**

理由：
1. 这 2320 条都没有被任何「有主人、且未删除」的记录引用，0116 也不会把它们发给设备，补上主人对断网没有帮助。
2. 补上以后，演示账号的跟进、提醒、启动接口读取量会增加 3 到 7 倍，这和本轮「降低读取量」的目标相反。
3. 不补是可逆的：以后需要时，加 `--assign-generated-sources` 一条命令就能补上。
4. 用户决定 3 的本意，是让演示数据的主人符合引用关系。被引用的都已经补了。

**转给后续 Sprint：**
- 读取「账号拥有的全部来源记录」本身就是个读取量问题 → 并入 **0116**：改为只读被引用的来源，有上限。
- 孤立来源和已删除关系要不要清理 → 需要用户决定，暂不处理，登记在 `PRODUCTION_ROLLOUT.md` 的待决事项。
- 名片联系人「江東 新」没有任何主人依据 → 保持没有主人。

**上线前提**：0114 的补写必须在 0116 上线之前在生产执行并确认，已写入 `PRODUCTION_ROLLOUT.md`。
