# Sprint 0064 — 展示活动报名窗口修复报告

## 结果与范围

十三场展示活动的报名配置已修复，公开活动日期没有改动。公网页面已不再一律显示“暂不可操作”。ROOT 在正常用户路由完成报名、取消、再次报名及最终取消，两个取消入口均验证了拒绝确认不写入、接受确认只提交一次、正式 GET 独立回读一致。

本轮唯一 B Generator、唯一 run-01，代码基线 `9dc41bd1e80d1129206b001ae6640907b3e41b9a`；冻结 PLANNER SHA256 为 `eaaa5e7d4ec31b535ceb47a3799018213acfa11981d5c87a3d65899e4e6c2b3c`。ROOT 独占 Main Git、索引、真实数据库、账号、发布和费用账本。B 未访问业务 5432、Main 3000、321xx、公网或付费模型，未修改 App 页面、通用身份/存储、DDL、migration、共享契约或生产种子。

配置修复暴露了已交付取消按钮在 RN Web 上调用空实现 Alert 的问题。ROOT 另行批准 Sprint 0065，由独立 A 修复浏览器确认；本报告引用其已完成的真实验收和固定消费版本，不把 App 修改计入 B 的六个源文件，也不重开 0050/0063。

| 验收 | 实际结果 |
| --- | --- |
| 64-01 | 默认只读预览，精确十三个目标；错误库、工作区、活动、日期、owner、版本或策略冲突拒绝执行；真实预览列十三项变化、十二项缺配置。 |
| 64-02 | 隔离 PostgreSQL 覆盖原子性、冲突、幂等和精确回退；ROOT 真实一次事务更新十三个 heads、追加十三条审计，重放无新增写，重新预览变化为零，原数据摘要一致。 |
| 64-03 | 十三场正式 GET `questions=false` 全部 HTTP 200；资料截止为开始前十分钟，报名截止为开始前五分钟；真实页面及公网检查全部没有旧不可操作提示。 |
| 64-04 | 正常报名生命周期四次业务 POST；详情和报名资料页的两次拒绝确认均零 POST、完整报名不变，接受确认均单次 CAS；最终取消，原资料和答案保留。 |
| 64-05 | 功能已合 Main 并普通推送，独立远端 SHA 一致；Phone 新消费树与新前端字节已在原入口实际服务，健康 live/200，旧 release-0063 完整保留。报告本身的官方单文档 gate、提交和最终推送由 ROOT 在本候选冻结后收口。 |

这里的完成只针对冻结的产品验收；报告不能预先引用自己的提交 SHA。本轮并非全量 I 全绿，未验证 Native 或真实 AI，既有推荐 schema 警告未修复。

## 交付代码与风险

功能提交 `796d5c6b3f3395344a074d09023178491e57651a`；必要 owner 修复追加提交 `8daf13a8ffd0005f968387fdaa8ddd786695fe99`。最终源 TREE `178ee2c88eb1d39b2829b0c3fef79896da8b752c`，相对基线仅新建六文件、831 行：

- `repos/orbits/features/events/registration/phoneweb-registration-window-repair.ts`
- `repos/orbits/scripts/repair-phoneweb-registration-windows.ts`
- `repos/orbits/tests/services/phoneweb-registration-window-repair.test.ts`
- `repos/orbits/tests/services/phoneweb-registration-window-repair-postgres.test.ts`
- `repos/orbits/tests/scripts/repair-phoneweb-registration-windows.test.ts`
- `repos/orbits/tests/services/fixtures/phoneweb-registration-window-repair-fixture.ts`

新增符号 upstream impact 为 UNKNOWN，已以实际受控 CLI 和测试调用补查；仍按写入工具 H 档处理，不把 UNKNOWN 当零风险。ROOT 官方 fixed-base/tree 检测六文件、零映射符号、零映射流程、LOW、无 stale；零映射不是没有动态数据库影响。既有窗口 provider 的两文件三调用只读核查，无修改。

工具只允许本机 `orbit_phoneweb_20260916`、`workspace:phoneweb-demo` 的 event_01～event_10、event_signup_01～03。真实 owner 为 signup_01 的 `user_mu3lykrb_sv4h84`，其余十二项为 `user_orbit_primary_qa`。缺配置复用 signup_01 的既有模板；推荐数 4、table 6、shard 6、attempt 3 保持。非报名时刻按既有相对偏移对齐并列入预览：check-in −60 分钟、results 0、round1 +15、round2 +60 分钟。公开目录、主办方、活动 revision 不变。

读取单一源快照，校验源/计划摘要、head 及历史最大版本。apply 在 SERIALIZABLE 事务中先按固定顺序锁十三行，再锁 `event_ops_configuration_heads`、`event_ops_configurations`、`event_ops_admission_policy_heads` 三表，模式 SHARE ROW EXCLUSIVE。锁超时 5 秒、语句超时 30 秒，失败整批回滚，不隐藏重试。表锁会暂时阻塞同库其他配置写入，不是只有十三行的影响；ROOT 以独占真实写入窗口执行。

不复用会修改 event revision 的旧 persistConfiguration。仅追加配置版本、heads 和审计；历史最大版本保证回退后再修复不复用旧版本号。回退先核对全部 heads、审计和旧配置内容摘要，任何变化整批拒绝；只恢复原 heads，原来无 head 的对象只移除本轮创建的指针，不删除历史配置或审计。

## 验证记录

| 检查 | 原始终态 |
| --- | --- |
| 六个受影响测试文件，owner 修复前 | 46 tests；44 pass、0 fail、2 skip；actual 28778 / exit 0，6581.981583 ms。两项 skip 是旧 canonical 业务 PG 测试未提供其专用 URL，不算通过。 |
| 必要 owner 修复后三个完整测试文件 | pure 18 + PostgreSQL 11 + CLI 9；38/38 pass、0 fail、0 skip；actual 6504 / exit 0，9443.198625 ms。 |
| 完整 Web types | 原 actual 17561 exit 0；最终源必要复验 actual 64503 exit 0。均 `tsc --noEmit --incremental false -p tsconfig.json`。 |
| 唯一 Web I | actual 61061 exit 1；3868 tests、3591 pass、64 fail、213 skip、0 cancel；130529.770875 ms。未重跑 I。 |
| 旧 picker 完整文件环境纠正复验 | actual 99814 exit 0；5/5 pass、0 skip；1898.344584 ms。只显式指定已安装浏览器，无下载、源码或断言修改。 |
| ROOT Main 合并后完整受影响测试 | 81/81 pass、0 fail、0 skip、0 cancel；20486.566333 ms，guard 0。 |

所有新增行为先有效 RED 再实现 GREEN。PG 测试只在 ROOT 指定 35434 实例运行，每个 fixture 独立核验用户、数据库、端口、data_directory 与 ROOT marker；只用自身 UUID schema 和合成资料，不运行迁移/业务种子。中途失败及 rollback 覆盖保留 event、membership、profile 和 answers 摘要；真实竞争锁超时断言为 55P03。最初锁测试错误共享同一物理连接导致 25001，保留原失败，只拆 fixture 的独立 transactionPool，未放松断言。

原 I 的旧 59 个失败名称全数保留。额外五个失败都是旧 picker before-hook 缺默认 Chromium 1161，显式使用既有 1228 后整个原文件五项通过。它们是 unavailable-zone 只读、44px 触控目标、闰日导航与确认、任意分钟暂存/禁用确认、键盘取消恢复焦点。不能把原 I 的 64 fail/213 skip 改写成 59/206。

新增七个 skip 来自基线已合入的 0033 Phase A、未提供 `ORBIT_SYNC_PHASE_A_TEST_URL`：旧 RR lock snapshot、RC barrier、新 RR read lease、rolled-back watermark hole、shared/exclusive writers、source/journal/epoch/receipt 注入回滚、receipt replay bypass gate。没有验证这些专用 PG 行为，不算通过，更不授权后续生产协议。I 中本轮新增 pure 15、PG 11、CLI 9 均实际通过、无 skip。

I 父进程 guard 0，但旧子 Playwright denied 4/protected 0，原日志保留；不能称整轮所有 guard 0。owner 修复定向测试父/子 guard 均 0。

原 I 日志 SHA256：`128e3fb9df8297556c315dce742c84cf6c0f245383cbfb7afed8c41faefadc35`；owner 修复完整定向日志 SHA256：`673c73d77389950305fa33c5d2dffb3c7638042e0bc6df0ffb9f70445060d5a6`。原始日志位于 B worktree 的 `build/harness-state/evidence/sprint-0064/run-01/`，未覆盖失败。

## ROOT 真实修复与数据保护

真实 preflight 显示十二项无配置，signup_01 的配置 v1 仍是旧八月时间；正式目录十三项均 canonical/published、活动 v2。全部 admission policy 均空。ROOT 第一次 dry-run actual d079fd exit 1，尚未 apply：先前“十三项 owner 都是 QA”的口头摘要错误，B 当初重复到了校验和 fixture。原完整快照早已显示 signup_01 的不同 owner，事件数据从未变更。

ROOT 批准同 run 必要修复。正确混合 owner 的有效 RED（actual 514a9b：1 pass/2 fail）后，只修改每项 expectedOwner、合成 fixture 和行为断言，三个文件 21 加/2 删；最终 38 项全过。首次失败空输出文件保留，真实重试使用新文件名，不覆盖证据。

正确真实预览 actual 0c8a29：十三项变化、十二项缺配置，planHash `de072f3c2ed6810685c783f1ca2fb733c2de16782ef8a068696d7b3599b615ae`。真实 apply actual 2bb707：十三 heads/十三审计；重放 `alreadyApplied=true`，新预览变化零。signup_01 的旧配置 v1 保留，新版 v2 追加。

配置修复本身六类原业务记录 count/digest 完全不变：

| 原数据 | count | digest |
| --- | ---: | --- |
| event_ops_events | 29 | `9c308ff813995a9bfd335a6ffa27f08a` |
| membership_versions | 96 | `b2a9fc518b4bdbcfb92c93bc357acc97` |
| membership_heads | 80 | `e924f1f7c4cdb8cc992860964fd9bc0d` |
| profile_versions | 80 | `f74348af30d176b526fd4a2c4dac75b7` |
| profile_heads | 80 | `496231ef54fe8a1d9884130dfd2f5fe3` |
| profile_response_versions | 0 | `d41d8cd98f00b204e9800998ecf8427e` |

真实验证快照 SHA256 `255624fb75605c5ee949bb2749b57949cbec62133ff67a347510d3555659dd7c`；apply receipt SHA256 `330bc577de4b1cce9a0ec56251e46632bfe1015995456ba254cb6b0196a432b6`。B 只读独立核验这些快照，未操作真实库。

修复后十三场正式 GET `questions=false` 均 HTTP 200，原十场 cancelled 的版本未变、可重新报名，三场新增活动可报名。随后的正常 QA 新增记录另计，不把整个 Sprint 声称零业务写入。

## 真实页面闭环与发布

验收对象只新增 `(event_signup_02, user_orbit_primary_qa)` 及其固定 participant profile。06:00:43.938Z 正常报名成功后，旧取消按钮 actual 53706 没有弹窗、没有 POST、状态仍 rsvped，明确不是取消成功。该真实失败促成 0065，不用测试替代真实行为。

| 正常 UI 步骤 | 正式状态 / updatedAt（2026-09-17 UTC） | 业务 POST |
| --- | --- | ---: |
| 报名 | rsvped / 06:00:43.938Z | 1 |
| 详情拒绝取消确认 | rsvped / 原时间不变 | 0 |
| 详情接受取消确认 | cancelled / 06:09:36.421Z | 1 |
| 再次报名 | rsvped / 06:09:48.418Z | 1 |
| 报名资料页拒绝取消确认 | rsvped / 原时间不变 | 0 |
| 报名资料页接受取消确认 | cancelled / 06:11:56.351Z | 1 |

接受确认均单次正式 CAS POST，并独立 GET；拒绝确认完整 registration 深比较不变。报名 ID 一直为 `event-registration:event_signup_02:user_orbit_primary_qa`，profile ID 不变，答案“反馈或专业能力”“创业者”保留，最终 membership v4/profile v1。ROOT 已目检实际截图；B 只读独立核验六份原 receipt SHA 和正式状态，并目检最终取消资料页，看到已取消、可重新报名和保留的两项答案。

最终全表 count 为 29/100/81/81/81/2，相对原数据增量 0/+4/+1/+1/+1/+2。排除且仅排除新 owned QA case 后，六类原 count/digest 全部一致。新 QA case 原先不存在，最终 cancelled 并保留历史，不等于恢复为不存在，不删除历史来凑摘要。

正式回读未请求题目，provenance 为 deterministic-not-requested、provider/model 空、无外部网络。两条 UI 答案的历史来源为 legacy_unknown、question/generation 空；不能当作真实 AI 题目或模型生成验证。预算 raw `493f` 摘要原字节保持、36 项全部 settled、累计 cap 5000000；不编造本轮余额或模型质量结论。PUBLIC 沿用原预算 guard，没有新增 no-paid flag；preview 的外层隔离 guard 不能当 PUBLIC 配置。

Phone 机械消费固定 0050 依赖及 0065 源 `d0e141cc98b5b667a84dd93137c02b65d1459ffc`，最终 consumer `519230b7db0725a55616df03b5cbb42c15215e44`、TREE `f082d977c7a664828a43416546fd288aa090eb11`。ROOT 独立比较十路径、raw 字节及 backend subtree 不变。canonical 测试只消费固定 delta，不整覆 Main 文件；三项 legacy owner/privacy 消费差异保留 TODO。旧 Phone 分支未整体合回 Main。

原 ngrok 入口不变：`https://blasphemy-unshackle-courier.ngrok-free.dev`。ROOT 切换 actual 95867 exit 0，06:12:55～57Z；旧 43205/43206/43207 正常 IPC 退出，新 supervisor/backend/frontend 为 87138/87139/87140，均健康、零重启；ngrok 原 26690/27063 不变。独立公网 actual 16209：index/health HTTP 200、mode live，index 引用新 `entry-875fe518450afc98f32a57ec06064502.js`，实际服务 raw SHA256 `1afd800644e786cc255f5438ca49748a6f7c21f7b7556a7cfe42bb9ed8db1399`。

后台 Next 与初版前端 Expo 的 0064 父构建 actual 65227 exit 0，后台真实 BUILD_ID `6cy0j8e-CXA8xaVz4VdAm`，源 `b95765bd794b1cfab80760064cbd76ecdb3db819` / TREE `54b441d0035becd9933421a85da4c88c06f99f60`。0065 前端 fresh export 父构建 actual 24399 exit 0；后台 subtree `aff2e90ecbaf0c2116df41c4fcd144505228ec70` 完全相同，明确复用 0064 后台和 BUILD_ID，没有另做一次 Next build。B 只读 source.json、实际 BUILD_ID 和构建日志尾段；两份 source.json 的 budget before/after 完整 SHA256 均为 `493f2ed72328e543b620c28c6a8a9ab03823a92fd290381b79330dc720d2d4da`。构建证据位于 `/Volumes/ORICO/Dev/phoneweb-runtime-20260916/private/release-0064/` 的 source.json/backend-build.log/frontend-export.log 及 release-0065 的 source.json/frontend-export.log，不读取 env 或凭据。

公网十三场页面 actual 74009 exit 0：旧提示全部消失，最终十一场“重新报名”、两场“报名参加”，页面检查零业务写入。旧 release-0063 完整保留用于回退；本轮没有执行一次新公网 rollback，不把历史回退记为本轮成功。

ROOT 另以公网正常登录 UI actual 91593 exit 0 完成 auth/csrf → credentials callback → session，随后正式 GET questions=false 显示 signup_02 已取消、可重新报名；未注入 mobile cookie。该正常登录后再次逐场检查 actual 75943 exit 0，十三项结果一致、零业务 POST。凭据未进入脱敏 receipt 或报告。较早的公网页面证据仍保留，不覆盖原检查。

64 功能 Main no-ff 合并 `7379d9e82846e15e722fafa8776f32f8b2d2b80b`，六源文件与最终 B 源字节相同。Main 后续集成 65 源/报告后，普通代码 push actual 87375 exit 0；ROOT 独立 ls-remote actual 13202 exit 0，本地 HEAD/远端 `chat-agent` 均为 `7b1b3de289eba6e550a4702954df6056eddc664e`。这是代码收口 SHA，不是尚未产生的本报告提交 SHA。

## 受控工具操作与交接

ROOT 设置显式 `ORBIT_REGISTRATION_REPAIR_URL`，不在报告写连接凭据；入口为 `repos/orbits/scripts/repair-phoneweb-registration-windows.ts`，使用项目既有 Node/TS 运行方式。默认无参数为只读 stdout 预览；以下参数分别对应新绝对路径文件：

```text
--output /absolute/new-preview.json
--apply --plan /absolute/new-preview.json --confirm-plan-hash <reviewed-hash> --output /absolute/new-apply-receipt.json
--rollback /absolute/new-apply-receipt.json --confirm-plan-hash <same-reviewed-hash> --output /absolute/new-rollback-receipt.json
```

输出文件 wx/0600，不覆盖旧文件。操作前必须核对批准目标、预览变化、原 owner、正式日期、锁影响和完整 hash；回退需仍匹配全部精确 heads/旧配置摘要。输出失败可能发生在数据库提交后，必须查审计并用同计划幂等恢复 receipt，不能以输出错误推断事务已回滚。工具不加载 .env、不 bootstrap、不迁移、不启动服务、通知或 worker。

B 源/测试锁已释放，无运行中的测试、types、I 或 PG clients。ROOT 严格 marker/client0 验证后正常停止 isolated PG，保留数据和 UUID schemas；私有 previews 也按精确 original PIDs 正常 IPC 停止，产物保留，PUBLIC 不受影响。曾将 PG 后台 logical replication launcher 误计为测试客户端的严格检查失败原证据保留；实际 B TCP clients 为零，未杀 ROOT 后台进程。

剩余非本轮验收项：推荐页仍提示“服务返回的数据版本暂时无法识别，请更新 App 后重试”；legacy owner/privacy 的 Phone 消费差异、上述继承 PG skip、原 I 失败均未关闭。browser-native confirm 仅指浏览器 JavaScript confirm，不是 iOS Native/Simulator/真机测试。不得据此宣称所有活动功能、真实 AI 或全项目完成。

ROOT 真实证据统一在 `/Users/xzhao/Projects/orbit/build/harness-state/evidence/sprint-0064/run-01/`：`phone-preflight-before.json`、`phone-repair-real-verification.json`、apply/idempotent receipts、`registration-after-configurations.json`、`registration-lifecycle-final.json` 及六份 UI receipts/PNG、`original-data-after-final-cancellation.json`、`phone-consumer-0065-gate.json`、`public65-served-verification.json`、`all13-public65-page-check.json`、`main-merged-affected.log`。ROOT 持最终报告官方 gate、普通提交、Main 合并/推送及远端核验；本候选不生成自己的未来 SHA。
