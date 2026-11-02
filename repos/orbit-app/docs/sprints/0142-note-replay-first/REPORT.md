# Sprint 0142 报告：笔记重传先认出「已经做过」

## 1. 状态
**已完成，等协调者复核合并。**
- 分支 `offline-fixes-20261102`，worktree `/Volumes/ORICO/Dev/worktrees/orbit/offline-fixes`，起点 `742cbd0aa`（0141 已在本分支完成）。
- 未推送，未部署，未碰 Neon / Vercel / 正式库。登记表未改，由协调者更新。

## 2. 验收
| SC | 结果 | 证据 |
|---|---|---|
| 01 已提交的新建／编辑，失去活动或联系人访问后重传，返回原结果 | 通过 | `tests/services/notes-service.test.ts` 新测试「a committed create or edit replays its original result after event or contact access is lost」：关联活动和联系人的笔记建好、改好后，把活动从可访问名单里拿掉（相当于取消报名），重传同一条新建、同一条编辑都返回原结果；再把联系人也拿掉（计划使用资格也不成立了），重传仍返回原结果；另一条只关联活动、没改过的笔记，重传返回的和第一次完全一样 |
| 02 新的修改仍因无访问被拒；同编号不同内容仍被拒 | 通过 | 同一测试：换新编号的新建、编辑都回 `NOTE_INVALID_INPUT`；同编号不同正文的新建、编辑都回 `NOTE_IDEMPOTENCY_CONFLICT`；最后笔记版本仍是 2，没有多写 |
| 03 orbits 笔记相关测试与类型检查无新增失败 | 通过 | 见第 5 节 |

先写测试再改代码：新测试在原代码上失败，失败原因正是重传新建时被 `eventIds contains an unavailable association` 拒绝；改完后通过。

## 3. 改了哪些文件
| 文件 | 改动 | 原因 |
|---|---|---|
| `repos/orbits/features/notes/service.ts`（新建 约 :322–333） | 进入笔记锁之后，先按「账号 + 修改编号」算出的笔记编号读一次已存的笔记，用原有的 `checkReplay` 查收据：同内容直接返回，不同内容回原来的冲突错误；查不到收据才做计划使用资格和联系人／活动访问检查，再走原来的「不存在才插入」 | 设计案第 3 步：收据先于其他检查 |
| `repos/orbits/features/notes/service.ts`（编辑 约 :383–388） | `checkReplay` 挪到联系人／活动访问检查之前；版本检查、计划使用资格、`saveIfVersion` 和保存失败后的重读查收据都没动 | 同上 |
| `repos/orbits/tests/services/notes-service.test.ts`（末尾） | 1 条新测试，沿用文件里已有的内存仓库和 `associationReader` 写法，访问名单做成可变的 | SC-01/02 |

## 4. 判断
- **重传返回的是笔记现在的样子，不是当时的快照。** 原有的 `checkReplay` 一直这样（收据只存版本号，不存当时的内容），本次没改。所以新建之后又改过的笔记，重传那条新建拿到的是改后的版本；测试按这个写，另加一条没改过的笔记验证「和第一次完全一样」。
- **新建多了一次按编号读取。** 收据存在笔记记录里，要先查就得先读。只多一次单条读取，在锁里做，读完后照旧走「不存在才插入」，并发下的兜底（插入失败后重读查收据）保留。
- **访问检查挪进了锁里。** 新建原来在锁外做检查，现在要先读收据再检查，就一起放到锁里；锁只针对这一条笔记，不影响别的写入。
- 已存笔记但查不到这个编号收据的情况（理论上不会发生，编号就是从修改编号算出来的），继续往下走，插入失败后回冲突错误，和原来一样。
- 范围外的没动：删除笔记后的重传、409 错误码细分、`unlinkContact`（它本来就先查收据）。

## 5. 命令与结果
在 `repos/orbits`，都带 `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8`：
- 定向：`node --test --import tsx tests/services/notes-service.test.ts` — 18 条全部通过（原 17 条 + 新 1 条）。
- 类型检查：`npm run typecheck` — 0 错误。
- 笔记相关 29 个文件（引用 `features/notes` 的和文件名带 note 的）：`node scripts/run-node-tests.mjs …`
  - 不带数据库：212 条，176 通过，0 失败，36 跳过（都要 Postgres）。
  - 带本机测试库 `ORBIT_LIFECYCLE_TEST_DATABASE_URL=…/orbit_test`（测试自己建临时 schema）：212 条，209 通过，1 失败，2 跳过（要其他环境变量）。失败的是 `note-list-projection-postgres.test.ts`「note version compare-and-swap matches the persisted PostgreSQL microsecond timestamp」（编辑时回 `NOTE_VERSION_CONFLICT`）。**原有的**：把 `service.ts` 换回原代码单独跑这个文件，同样 8 通过 / 1 失败，同一条。
- 全量：`node scripts/run-node-tests.mjs`（不带数据库，约 5 分钟）— **8063 条，6940 通过，22 失败，1101 跳过**。22 条都是**原有的**：把 `service.ts` 换回原代码（新测试保留）再跑一遍全量，失败的是同样这 22 条，外加新测试本身（23 条）。这 22 条集中在 `/app/agent`、联系人页、网页私信、通知设置、AI 额度页、产品清单／证据清单、按钮数量等，没有一条和笔记服务有关。

## 6. 提交
- `b8b841315` fix(orbits): answer note create/update replays before access checks
- 本报告单独一个 docs 提交。

## 7. 未决
1. 微秒时间戳那条 Postgres 失败（编辑在存了微秒精度时间的笔记上回版本冲突）是原有问题，不在本 Sprint 范围，建议另开处理。
2. 全量 22 条原有失败需要有人逐个看，不在本 Sprint 范围。
3. 只有服务端自动测试，没有在手机上实际取消报名再重传验证。
