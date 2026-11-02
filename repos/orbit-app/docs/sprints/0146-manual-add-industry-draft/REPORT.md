# Sprint 0146 报告：手动添加的公司、行业和草稿

## 1. 状态
**已完成，等协调者复核合并。**
- 分支 `offline-fixes-20261102`，worktree `/Volumes/ORICO/Dev/worktrees/orbit/offline-fixes`，起点 `ba70e9377`。
- 未推送，未部署，未碰 Neon / Vercel / 正式库。登记表未改，由协调者更新。

## 2. 验收
| SC | 结果 | 证据 |
|---|---|---|
| 01 填公司和行业保存后，联系人记录有 organization 和 primaryIndustryId；不在目录里的行业被拒 | 通过 | 服务器：`tests/api/manual-contact-v2-routes.test.ts` 走真路由（handler + 真 service）。内存存储两条：带公司和行业保存后，记录里 `organization`、`primaryIndustryId` 都对，行业来源记为 `user`；行业 `space_travel` 回 400，一条都没写。统合时对方没有行业就补上，已有用户自己填的行业就保留。PostgreSQL 一条（本机临时库 `orbit_0146_test`，测试自建 schema）：建完后直接查 `orbit_records`，`payload->>'organization'`、`payload->>'primaryIndustryId'` 都对（人脉分析就是按这个字段分组）。App：`tests/add-contact-screens.test.tsx` 新增一条，手动添加页一打开就有「会社」「業界」，点「業界」打开的是编辑联系人同一个选择面板（没有「役職層」页签），选「製造・サプライチェーン」→「決定」→ 保存，请求体里有 `organization` 和 `primaryIndustryId`；测试用的假服务器现在用真的请求 schema（严格）校验请求体 |
| 02 填一半离开再打开自动恢复；保存后草稿删除；换账号看不到 | 通过 | `tests/add-contact-screens.test.tsx` 两条：填姓名、公司、邮箱后草稿写进本机（键里有服务器地址和账号）；换一个页面再打开，三项都回来了，打开过的「連絡先」也照样展开，显示「前回保存しなかった内容を戻しました」；点「クリア」表单清空、本机草稿删除；再恢复一次后保存，查重按恢复的内容重新跑了，草稿删除。另一个账号用同一份本机存储打开，表单是空的，没有提示。`tests/manual-contact-draft-storage.test.ts` 三条（按服务器和账号隔离、坏数据读成没有草稿、晚到的自动保存不会把已清除的草稿写回来）。`tests/lf5-account-local-caches.test.ts`：退出登录清掉本账号的手动添加草稿，别的账号的不动 |
| 03 phoneweb 截图：表单、行业选择、恢复提示 | 通过 | 见第 6 节 |
| 04 两端全量和类型检查没有新增失败 | 通过 | 见第 5 节 |

先写测试再改代码：服务器 3 条（两条新的 + PostgreSQL 那条）在原代码上失败；App 新加的 3 条页面测试和草稿存储测试在原代码上失败，改完全部通过。

## 3. 改了哪些文件
| 文件 | 改动 |
|---|---|
| `orbits/shared/contract/manual-contact.ts`（:28）、`shared/api-schema/manual-contact.ts`（:39） | 手动添加的请求加可选 `primaryIndustryId`，schema 用行业目录 `z.enum(INDUSTRY_IDS)` 校验。App 里两份副本同步，逐字一致 |
| `orbits/features/contacts/manual-contact-v2/service.ts`（:11、:167–169、:250、:272） | 新建时用 `applyEnrichedValues` 写行业，来源 `user`、方式 `contact_edit`（和编辑联系人一样），之后 AI 补全不会覆盖；统合时把行业交给字段写入 |
| `orbits/features/contacts/contact-field-write.ts`（:72、:151） | `applyContactFieldValues` 加可选 `fillEnrichment`，按名片并入的规则写（只补空、只替换 AI 推测的），和字段在同一次条件更新里 |
| `orbit-app/src/screens/network/IndustryPickerSheet.tsx`（新） | 行业选择面板从 `ContactEditScreen.tsx` 原样搬出来，加 `primaryOnly`（只选主行业：不显示详细行业和「役職層」页签）和 `title`。编辑联系人页改为引用它，行为不变 |
| `orbit-app/src/storage/manual-contact-draft-storage.ts`（新） | 手动添加草稿，照着笔记草稿写：键 `orbit:manual-contact-draft:v1:<服务器>:<账号>`，同一个键的写入排队，读到不合格的内容当作没有草稿 |
| `orbit-app/src/screens/add/manual-model.ts`（:26、:29、:57） | 表单加 `primaryIndustryId`，保存时带上 |
| `orbit-app/src/screens/add/ManualContactScreen.tsx`（:100–130、:186–196、:223、:278–283、:315–340、:392–395） | 公司常驻，下面是行业（未选择 / 已选 + 清除），再下面是职位；芯片只剩「出会った場所」「メモ」「連絡先」。草稿：打开时读一次，人已经开始输入就不覆盖；表单变化后 0.5 秒写入，表单清空就删除；离开页面时把还没写的那次写掉；顶部提示 + 「クリア」；保存成功删除 |
| `orbit-app/src/data/account-local-caches.ts`（:7、:26） | 退出登录和删除账号时一起删掉手动添加草稿 |
| `orbit-app/src/i18n/{zh,ja,en}/add.ts`、`copy-kinds.ts` | 新增行业、未选择、选择行业、清除行业、恢复提示、清空 6 个词；删掉已经用不到的「会社」芯片文字 |
| 测试 | 见第 2 节；`add-contact-screens` 里两条旧测试原来要先点「会社」芯片，改成直接用常驻的公司输入框 |

## 4. 判断
- **笔记草稿其实没有在退出登录时清除。** 我查了：`clearAccountLocalCaches` 里没有笔记草稿，笔记草稿只在保存或主动丢弃时删。PLANNER 写明手动添加草稿要在退出登录时删，所以我把它加进了 `clearAccountLocalCaches`（退出登录和删除账号都走这里），不管有没有待同步都删。笔记草稿要不要也这样，留给协调者决定。
- **职位跟着公司一起常驻。** 原来职位是点「会社」芯片后和公司一起出来的。芯片去掉后，职位放在行业下面，一直显示。
- **统合时也写行业，但只补空。** 统合界面不问行业；如果直接丢掉，用户选的行业就悄悄没了。所以按名片并入的老规则：对方没有行业或只有 AI 推测的才写，对方自己填过的保留。
- **行业算用户自己填的（`user`）。** 和编辑联系人一样，后台的 AI 补全不会改掉它。
- **草稿只存表单和展开了哪些项**，不存查重结果、统合选择和幂等编号；恢复后查重重新跑，保存时重新生成编号。
- **只打开了某一项、什么都没填，不算草稿。** 表单是空的就删除草稿。
- **恢复提示一直留着**，直到点「クリア」或保存成功。

## 5. 命令与结果
在 `repos/orbits`（`LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8`）：
- 定向：`manual-contact-v2-routes`、`manual-contact-v2`、`manual-contact-v2-postgres`，带 `ORBIT_EVENT_DATABASE_URL=…/orbit_0146_test`：29 条全过。
- `npm run typecheck`、`npm run typecheck:app`：0 错误。
- 全量 `npm test`（不带数据库，约 4 分钟）：**8065 条，6942 通过，22 失败，1101 跳过**。22 条都是原有的，集中在 `/app/agent`、联系人页文字检查、网页私信、通知、AI 额度页、产品清单、按钮数量、日历基线，和 0142 报告里那 22 条同一批地方，没有一条碰到手动添加。其中 `contract-append-only`（快照没更新）我专门核对过：把契约文件换回起点版本，检查结果一样是「契约有新增但快照未更新」，起点就已经红；我的改动只是新增可选字段，检查没有报破坏。快照我没有重写，因为那会把别人的新增一起记进去。

在 `repos/orbit-app`：
- `npx tsc --noEmit`：0 错误。
- 全量 `npm test`：**3418 条，3413 通过，3 失败，2 跳过**。3 条是已知的原有失败（`api-schema-sync`、`contract-sync`、`route-parity`）；我改的 `manual-contact.ts` 两份副本和源一致，没有让它们变多。第一次全量是和 Expo 导出、本地服务器同时跑的，多了 2 条（`personal-schedule-interactions`、`task-date-interactions`），单独跑这两个文件 107 条全过，机器空闲时重跑全量也没有再出现。

## 6. 运行时检查（phoneweb）
- 服务器：本 worktree 的 orbits，`next dev` 在 8092，连本机新建的空库 `orbit_0146_runtime`（`db:migrate:live` + `db:migrate:sync-revision`），没有 AI key。
- App：`expo export --platform web`，`scripts/phoneweb-server.cjs` 在 8091，上游 8092。Chromium 390×844，日语。
- 经 HTTP 注册 `qa0146@example.test`，登录后先建一个「石川 陽介 / ミライ精機」，然后在手动添加页：输入公司「ミライ」出现「ミライ精機 · 人脈に 2人」；选上，填职位；点「業界」选「製造・サプライチェーン」；离开页面再回来，内容恢复并显示提示；保存。
- 结果：保存前本机有一条草稿键 `orbit:manual-contact-draft:v1:http%3A%2F%2F127.0.0.1%3A8091:<账号>`，保存后没有了。库里这个人：`organization = ミライ精機`、`role = 生産技術部 課長`、`primaryIndustryId = manufacturing_supply_chain`、行业来源 `user`；`GET /api/contacts/<id>` 也回了公司和行业。
- 截图（本目录）：
  - `0146-company-suggestion.png`：公司输入时的已有公司提示
  - `0146-industry-picker.png`：行业选择面板
  - `0146-form-company-industry.png`：填好公司、行业、职位的表单
  - `0146-draft-restored.png`：再次打开时的恢复提示
- 没截联系人详情页：网页版详情页要读本机镜像，我临时搭的库只跑了两组迁移，同步接口有几个回 503，详情页显示「見つかりません」。这是临时环境不全，不是本 Sprint 的问题；改用接口回读确认了公司和行业。
- 收尾：8091、8092 已停；3000 没碰。`orbit_0146_runtime`、`orbit_0146_test` 已删除。`repos/orbit-app/dist` 是导出产物（git 忽略）。

## 7. 提交
- `e48ae49b3` feat(contacts): accept a primary industry on manual add
- `7b9596f13` refactor(app): move the industry picker sheet into its own file
- `a3572ea4a` feat(app): company and industry on manual add, with a device draft
- 本报告单独一个 docs 提交。

## 8. 未决
1. 笔记草稿退出登录时不删（见第 4 节第一条），要不要统一请协调者决定。
2. 网页版的手动添加抽屉没有加行业，这次只改了 App。
3. 没有在真机上验证，只有 phoneweb。
4. orbits 契约快照（`shared/contract/.snapshot.json`）起点就不是最新的，需要有人统一 `--write`。
