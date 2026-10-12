# R16 #2 复核：LinkedIn 导入的人「加入时间」用 connectedOn

- 复核人：独立复核（未参与实现），2026-10-12
- 范围：`7c68292f`（纯函数 + 导入写字段 + 每天一问读取 + 测试）、`03829bcf`（REPORT）
- 依据：`R16-import-and-completion/PLANNER.md`、`REPORT.md`（「请用户拍板」#2）、`shared/compute/completion-question-rules.ts`

## 结论：有条件通过

主路径正确：时区规范（东京日正午 = UTC 03:00）、未来日期丢弃、`min(连接日期, 录入时间)`、SQL / 内存预筛同口径、活动 ±14 天窗口改围绕加入时间，都对。**条件是修 M1**（旧数据退路会误采「合并时追加的备注行」，违反「合并不改已有人的加入时间」）。m1–m5 是建议。

## 核对过的点

| 项 | 结果 | 依据 |
| --- | --- | --- |
| 时区 | ✅ `noonOf` 写 `Date.UTC(y, m-1, d, 3)`，UTC 日期 = 东京日期；`tokyoDayOf` 测试钉住；ISO 前 10 位可直接与 `YYYY-MM-DD` 字典序比较 | `shared/compute/linkedin-connected-on.ts:43-46` |
| 不存在的日期 | ✅ `daysInMonth` 含闰年规则；2/30、2023-02-29、13 月都返回 null（有测试） | `:32-34, 43-45` |
| 未来日期 | ✅ `tokyoCalendarDaysUntil(connectedAt, importedAt) = 连接日 − 导入日 ≤ 0` 才存；同一东京日保留，读取时 `earliestAddedAt` 取较早者，不会把加入时间推后 | `:75-80`；`tokyo-calendar-days.ts:67-72` |
| 旧数据退路无未来校验 | ✅ 不需要：`earliestAddedAt` 取较早者，未来日期永远不会胜出 | `:93-99` |
| SQL 预筛是否超集 | ✅ 可被问的人 `addedAt ≥ since`，而 `addedAt ≤ createdAt`，故 `createdAt ≥ since ≥ 下沿`，原条件仍是超集；新增的「结构化连接日期 < 下沿 → 排除」只排除 `addedAt ≤ 连接日期 < 下沿` 的人，一定问不到。内存实现同条件 | `features/contacts/completion/repository.ts:276, 321-322` |
| 读取上限 | ✅ 600 条早年连接 + 1 个近期手入力，PG 用例证明近期人不被挤掉（上限 500） | `completion-question.test.ts`「hundreds of long-connected imports」 |
| 合并不写结构化字段 | ✅ `linkedinConnectedAt` 只在 `contactFromRow`（新建）写；`mergeCardIntoContact` 不碰；有 PG 路由测试 | `features/contacts/import/service.ts:159-164` |
| 字段在后续编辑中保留 | ✅ 字段写入走 `{ ...record.payload }`，不按白名单重建 | `features/contacts/contact-field-write.ts:103` |
| App 副本 | ✅ `orbit-app/src/api/compute/linkedin-connected-on.ts` 与 orbits 逐字一致，依赖的 `compute-text` / `tokyo-calendar-days` 在 App 侧都在 | — |
| 不进跨端契约 | ✅ 只加 `ContactDTO` 可选字段（服务端内部类型） | `shared/domain/contracts.ts:163-168` |
| 测试 | ✅ 纯函数 5、导入 2（PG）、每天一问 3×(内存 + PG) + PG 读取上限 1。本机串行跑 `linkedin-connected-on` 5/5、`completion-question` 22/22、`contact-import-routes` 12/12。注：三个文件并行跑时 PG 迁移 statement timeout（共享 `orbit_test` 的环境问题，与本提交无关），串行全过 | — |

## 问题

### M1 旧数据退路会把「合并时追加的 LinkedIn 备注行」当成加入时间

- 位置：`repos/orbits/features/contacts/completion/repository.ts:176-178`（`completionAddedAt` 的 `legacy` 条件）；SQL 侧 `:314`（`linkedin_connected_note` 取第一处匹配）；`shared/compute/linkedin-connected-on.ts:83-90`
- 复现：
  1. 10/05 用 CSV 导入（例如 Google 通讯录 / 没有 `Connected On` 列的表）新建 X：`source = { type: external_contacts, label: "CSV 导入" }`，没有 `linkedinConnectedAt`，备注里没有连接日期行。
  2. 10/08 导入 LinkedIn `Connections.csv`，X 那行选「合并」→ `mergeCardIntoContact` 往 X 的备注追加「导入补充 · 2026-10-08\nLinkedIn 连接日期: 15 Mar 2015」（`business-card-contact-match.ts:251-263`）。
  3. `completionAddedAt`：`structured` 为空 + 来源是 CSV 导入 → 退而解析备注行 → `addedAt = 2015-03-15`，X 从 30 天窗口里消失，再也不会被问。
- 这与提交说明和 `import/service.ts:160` 注释的不变量「合并进已有联系人不写，已有人的加入时间不变」矛盾。现有测试「a merge never moves an existing person's added-at」只用了**手动**联系人（来源不是 CSV 导入），没覆盖这个分支。本提交之后新建的 CSV 联系人同样会中招（只要导入时那行没有可解析的连接日期），所以不是「只影响旧数据、30 天后自然消失」。
- 建议修法（任选其一，第一种最小）：
  - 退路只认本提交上线**之前**录入的人：`legacy` 条件加 `input.createdAt < LEGACY_CUTOFF`（例如 `"2026-10-13"`，按部署日定），之后导入的人只认结构化字段。
  - 或者只认**导入新建时**写的那一行：退路要求备注行不在「导入补充 · …」段之后（即出现在第一个空行之前）；SQL 正则同步改成只看第一段。
  - 补测试：CSV 导入新建（无连接日期）→ 再合并一份带 `Connected On` 的 LinkedIn CSV → 每天一问仍能问到这个人（内存 + PG）。

### m1 点分隔的日期按「月.日.年」解析

- 位置：`shared/compute/linkedin-connected-on.ts:62-67`
- 场景：`05.01.2024`（德 / 俄等地区 Excel 另存的写法，几乎总是「日.月.年」）被解析成 2024-05-01。斜线的「月/日/年」有 LinkedIn 英文导出作依据，点号没有。
- 建议：点号三段一律按「日.月.年」，或直接认不出返回 null（「不猜」的原则）；补一条测试。

### m2 斜线两段都 ≤12 时只能猜「月/日」

- 位置：同上 `:62-67`
- 场景：欧洲用户 Excel 改过的 `05/01/2024`（本意 1 月 5 日）→ 5 月 1 日。日本用户 Excel 是 `2024/01/05`，走年在前的分支不受影响，所以影响面小。
- 建议：可选：同一批里若出现任何首段 > 12 的行，则整批按「日/月/年」解析（批次级判定，主流导入工具的做法）；否则至少在导入预览里把解析后的日期显示出来让人看见。

### m2 之外的已知局限（不必改，记一笔）

- 本提交之前已经导入、只有备注行的人，SQL 不能按连接日期排除（原文格式不定），仍占读取上限；最多约 32 天后自然出窗口。提交说明已写明，可接受。

### m3 缺一条「SQL 预筛字符串比较」的边界测试

- 位置：`repository.ts:322`（`linkedinConnectedAt >= $4`，`$4` = 下沿的 UTC 日期）
- 说明：逻辑正确（结构化值都是 `YYYY-MM-DDT03:00:00.000Z`，UTC 日 = 东京日，下沿另留 2 天余量），但没有用例钉住「连接日期恰好在下沿当天 / 前一天」的取舍；以后有人改了存储格式（比如存成 `YYYY-MM-DD` 或带 `+09:00`）会悄悄变。
- 建议：PG 套件加一例：连接日 = 今天 − 31 天（应被排除且确实问不到）与 = 今天 − 29 天（应被问到）。

### m4 SQL 与 JS 抽备注行的空白口径略不同

- 位置：SQL `repository.ts:314` 用 `[[:space:]]*`（不含全角空格 U+3000）；JS `linkedin-connected-on.ts:86` 用 `trim()`（含全角空格）
- 场景：用户手改备注把行首缩进成全角空格 → 内存版能认、PG 版认不出，两种存储结果不同。实际几乎遇不到。
- 建议：SQL 改成 `[[:space:]　]*`（同文件 `has_meeting_note` 已经这样写）。

### m5 文档

- 位置：`R16-import-and-completion/PLANNER.md` 没有 `linkedinConnectedAt` 字段与「加入时间」口径；`REPORT.md` 只记了拍板结果
- 建议：PLANNER 每天一问一节补一句「加入时间 = min(连接日期, 录入时间)，连接日期来自导入新建时的 `linkedinConnectedAt`」，并写明 M1 的退路边界。

## 处理记录（执行人，2026-10-12）

全部在 `52081e81`。

| 条目 | 处理 |
| --- | --- |
| M1 | 已修（采用建议的第二种，且不依赖部署日）：`linkedinConnectedOnFromNotes` 只读备注**第一段**（第一个空行之前），且这一段首行不能是合并追加段的标题「… · YYYY-MM-DD」（覆盖「备注原本为空、合并后只有追加段」的情况）。导入新建时备注各行用单个换行连起来，合并追加段一定在空行之后或带标题行，所以合并带来的连接日期不再改加入时间；认不出时退回录入时间（安全一侧）。没选「上线日截止」：它挡不住上线前建的 CSV 联系人在上线后被合并。先写的失败用例：`completion-question` 「#2 M1」内存 + PG（两种备注形状），纯函数「a line appended by a later merge」。 |
| m1 | 已修：点分隔三段一律「日.月.年」（`05.01.2024` → 1 月 5 日）；`01.13.2024` 认不出返回 null；补用例。 |
| m2 | 不改行为：斜线两段都 ≤ 12 维持「月/日」，代码注释写明理由（这一列来自 LinkedIn `Connected On`，英文导出是美式；日本 Excel 是年在前，不受影响）。批次级判定留给导入预览返工时再看。 |
| m3 | 已补：「预筛下沿当天留、前一天排除」（直接测 `recentContacts`）与服务层「29 天前问、31 天前不问」，内存 + PG 各一。 |
| m4 | 已修：SQL 不再用正则抽行，只在备注含「LinkedIn 连接日期:」时带出备注原文，由同一个 JS 函数判断（`trim()` 含全角空格），两种存储同一口径；补全角缩进用例（内存 + PG）。 |
| m5 | 已补：R16 PLANNER 接口表下追加「加入时间口径（2026-10-12 用户拍板）」与旧数据退路边界。 |

验证：`linkedin-connected-on` / `completion-question` / `contact-import-routes` 48/48；连同 R15 相关与契约门禁共 120/120（PG 用例实际执行）；`typecheck`、`typecheck:app`、`lint`、App `tsc --noEmit`、App `contract-sync` 3/3 通过。
