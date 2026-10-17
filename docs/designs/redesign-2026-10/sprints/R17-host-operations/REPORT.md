# R17 主催 — REPORT（2026-10-16 – 10-17）

范围：主办方从建活动到会后的全程（两端 + 服务端）。依据 [host/DESIGN.md](../host/DESIGN.md) v2、[PLANNER.md](PLANNER.md) rev 2。
用户 2026-10-16 答复 DESIGN §10 A1–A13「全按推荐」（9507522f9 写入 DESIGN / PLANNER，b2065ce20 改 §10 标题）；画板按结论的改动见决定表 §39（a708a2e6a）、预检 10 处修正见 §40（ab185db4f）。
没连 Neon、没部署、没调付费 AI、没发真实邮件。

## 1. 提交（服务端与文档）

| 阶段 | 提交 |
| --- | --- |
| 契约（只加）/ 纯函数 / mock / 路由 / token | 9c5237128 |
| 迁移 host-core（event-ops v16） | e6b4b8d03 |
| manager 角色与 4 个新能力（A9） | d30c74bce |
| 审核 waitlist、对候补再决定、受付番号、定型通知 outbox | 21d9b19fc |
| 活动写入层（三表同事务）、回填保护 | 580523a68 |
| 试点开关 A12 | c95c5131f |
| QR v2、kiosk live（扫码 / 撤销 / 当日枠 / 心跳）、计分对冲 | c28c3f898 |
| 共同運営者邀请 | a096f0007 |
| 主办方资料与公开页读取 | 375d8e3ef |
| 定型通知投递（事务邮件模块、worker） | 1fac8c88e |
| 编组调整层（engine 可选 composeGrouping） | 5003f4ea6 |
| live 服务 + 迁移 v17（主办方申込質問） | 8f700667 |
| 维护任务（通知投递、30 天自动归档） | de42c6bc |
| A6 编组 AI 只记账（账本 v5 event_matching） | 5f3452c6 |
| A11 R27 主催卡口径 | 776e8534 |
| R27 参加登録先问主办方申込質問 | 6f7585d0 |
| /e 短链、公开接口进未登录名单 | 9300f5b6 |
| 交接表 / DEFERRED-A R17-06～09 | 4d041bf8 |

| 界面与门禁 | 提交 |
| --- | --- |
| Web 运营中心 / 概要（第 1 段） | 1bbc2c5f6、673798959 |
| Web マッチング / 参加者 / 共同運営者抽屉（第 2 段） | 76afeea0e、ea05b3d12；契约 notifyCohosts bb24efdab |
| Web 申込設定 / レポート / kiosk（第 3 段） | 44d0ff0cb、8d2ae2592 |
| Web 公开主办方页 / 建活动 / 编辑 / 资料 / 加入 / 名簿（第 4 段） | e20986c4b |
| Web 页头「⋯」菜单（§44）、公开页手机版、copy:qa 主催域清零（第 5 段） | 22b5582f7 |
| App 運営センター / イベント運営 / 受付 / 加入 / 公开页 / `HostEventsRow` | fc4f40773、80680a9aa；文案重生成 73e26d965 |
| 删 Web 旧主办屏 | 23d2d7f58 |
| 删 App 旧主办屏 | 8751dcf26 |
| 独立复核修正 | 73c986b05 |
| 交接表 / DEFERRED-A R17-10～18、screen-ownership、G14 | d995bbeb5、本 REPORT 同提交 |

## 2. GitNexus（开工时 impact，`~/orbit-sprint-evidence/redesign/R17/run-01/baseline/impact.txt`）

| 符号 | 结果 | 对策 |
| --- | --- | --- |
| eventPilotDecision | HIGH（14） | 只加可选参数 `hostCreated` 与一个分支；不传时行为不变；kill switch 仍最先判断；测试覆盖 |
| applyEventCoreBackfillPlan | HIGH（10） | 只加「跳过 created_by = host」条件；回填测试与 host 生命周期测试都过 |
| eventAccessCapabilities | CRITICAL（33） | 判定函数不改，只往角色 / 能力名单里追加；权限矩阵测试逐项锁定 |
| projectCanonicalMembership | LOW（3） | 不改函数本体，调用后追加番号与 outbox（同一事务） |
| resolveCanonicalEventAlias / organizerKeyFor / shellAppliesTo / buildVenue / createEventCenterGetHandler / isPublicApiPath | LOW | — |
| decideApplication / checkInParticipant / listAccessibleEvents / publishGeneration | UNKNOWN（歧义） | 文本搜索核对调用方：decide = service + 审核路由；publishGeneration = service + 运营路由（只加可选参数） |

detect-changes：每次提交前跑；6f7585d0（R27 参加登録接主办方问题）报 high（6 条经过 createJoinService 的流程），均为预期，R27 报名测试全过。

## 3. 自定工程决定（与画板无关）

1. 受付番号放独立表 `event_reception_numbers` + 计数器（DESIGN 写「membership 加列」；membership 版本表不可变，独立表同样只加）。
2. 撤销签到 = 写 `event_ops_checkin_undos` 留档 → 删签到行（可再签）→ 原签到的 outbox / audit 行 id 加 `:undone:` 后缀留档；计分按 R24 写 `score_reversed`；番号不回收。
3. 主办方自定义申込質問放 `event_host_question_sets`（v17），回答存参加者本人的 `eventHostAnswers` 记录：现有 experience 问题绑定 5 个资料字段、registration / admission 校验严格，不在里面加维度。R27 参加登録先问这些问题（计入 5 问，再由访谈补足）。
4. 编组发布：`publishGeneration` 只加可选的 `composeGrouping`（DESIGN 原写「不改」；合成必须在冻结前进入同一份产物），不传时行为不变；合成结果照旧 `validateGrouping`。
5. 编组「ラウンド数」只开放 1–2（引擎固定两轮；3 暂缓，交接表 R17-07）；生成之后才承认的人显示「未配置」，发布时不入座。
6. 关注沿用 R27 actor 级 key（同一人的几份资料共用关注；按资料关注列为后续，R17-08）。
7. A6：编组 AI 不改 worker，用维护任务把每次任务尝试的 token 幂等补记进账本（system 池、无上限）。
8. `GET /api/events/center?summary=1` 给 R18（原数组响应不变）；完整运营中心走新契约 `GET /api/host/center`。
9. プロフィール完成度沿用 R27 参加登録 的カバー率口径（会社 44 + 四项各 14）。
10. 参加コード：写带横线与不带横线两个 alias（用户怎么输都能命中）；再发行一定换码。

## 4. 像素门禁总表（证据 `~/orbit-sprint-evidence/redesign/R17/run-01/`）

规则：Web 整屏 raw ≤0.02、`--grid 30` 超阈值带只能归因 [data]；App 按决定表 §20，超阈值带全部归因 [data] / [raster] 即通过。下表为最后一轮（Web：第 5 段 final5 / final5b，§45 改名后 final7 整套重跑、13 个视图随 mock 文字修正后 final8 全过（c24b2c709）；App：final7（§45 后重跑，结果与 final6 相同）），格式 raw / 超阈值带数。

| 视图 | 画板 | 浅 | 深 | 结论 |
| --- | --- | --- | --- | --- |
| W-P01 / P02 / P03（運営センター 空 / 少 / 大） | b6 #0–#2 | 0.0008/0、0.0004/0、0.0002/0 | 同左 | PASS |
| W-P06 概要 | web #20 | 0.0012/1 [data] | 0.0012/1 | PASS（§45 web #20 补了 ⋯，已去掉截图前隐藏，final6） |
| W-P08 / P09 マッチング | b6 #3 / #4 | 0.0165/1、0.0049/2 | 0.0161/1、0.0020/1 | PASS |
| W-P10 / P11 マッチング下書き / 公開確認 | b6 #5 / #6 | 0.0069/6、0.0020/0 | 0.0025/1、0.0012/0 | PASS |
| W-P12 / P13 / P14 参加者 | b6 #7–#9 | 0.0008/0、0.0008/0、0.0027/1 | 0.0008/0、0.0004/0、0.0019/1 | PASS |
| W-P15 / P16 / P17 受付 kiosk 1180 | b6 #10–#12（深 P16 = #45） | 0.0001/0、0.0039/0、0.0040/2 | 0.0001/0、0.0014/0、0.0015/0 | PASS |
| W-P19 / P20 / P21 申込設定 | b6 #13–#15 | 0.0027/2、0.0019/1、0.0016/1 | 0.0028/2、0.0019/1、0.0016/1 | PASS |
| W-P22–P25 レポート | b6 #16–#19 | 0.0052/1、0.0014/1、0.0014/1、0.0033/1 | 0.0053/1、0.0016/1、0.0016/1、0.0027/1 | PASS |
| W-P26 共同運営者抽屉 | b6 #20 | 0.0606 | 0.0465 | **未过：待组件库 G23**（Drawer 无 540 宽、内边距 20≠22；R17-17） |
| W-P27–P29 公开主办方页 1440 | b7 #33–#35 | 0/0 | 0/0 | PASS |
| W-P30–P33 公开主办方页 390（mweb） | b7 #36–#39 | 0/0 | 0/0 | PASS |
| A-P04 運営センター 空 | b6 #21 | 0.0415/12（全归因） | 0.0409/13 | PASS（[raster] 字形 / emoji / saturate 滤镜） |
| A-P05 運営センター 大 | b6 #22 | 0.0928/9（9 未归因） | 0.0873/9 | **未过：待组件库 G23**（Segmented 38≠30，下方整体下移 8；临时改 30 后位置差 0） |
| A-P07 イベント運営 概要 | b6 #23 | 0.0296/12（全归因） | 0.0294/12 | PASS（[data] 页头日期） |
| A-P18 受付（离线 + 失败行） | b6 #24 | 0.0336/16（全归因） | 0.0287/16 | PASS（[data] 头像色） |

**不进门禁（README 规则 11 / 决定表 §38，等用户过目 b12 补画）**：b12 #396–#481（建活动 / 编辑 / 确认框 / お知らせの文面 / 定型通知 / 资料 / 加入 / App 补画 / kiosk 弹层 / 1024 / 390 / 名簿 / ⋯ 菜单）全部照画板做了，本地比对过，PLANNER P34–P73 留待认可后加入（R17-05）。

画板问题共 6 批转 design-decisions，全部已改并重比：§40、§41、§42、§43、§44、§45。§45 与 c96706e44（全设计稿拉丁字母与日文之间加半角空格）后，R17 自己的 mock（host-events.ts、matching-sample.ts）同步改了文字；其他域示例数据里的「製造業DX」不归 R17（DEFERRED-A §45）。

规则 13（状态栏 / Home 条 / 地址栏是装饰）：两端 R17 页面都没有画，Web 已 grep 与目检，App 用系统状态栏 + 安全区。

## 5. 删旧屏与登记（SC-R17-16）

- Web：`ops-0918` 20 文件、旧公开主办页与 loader、`event-operations-page-event` 删除；`operations/{admission,experience}`、`analytics` → `operations?tab=people|setup|report`；`/app/o/[slug]` → `/o/<slug>`。登录前缀加 `/app/events/center`、`/app/events/[id]/{operations,edit,analytics}`。⌘K / 壳排除只留 `operations/check-in`（G14 说明已改）。
- App：`Event{Center,Operations,AdmissionReview,CheckIn,Experience,Roles,Analytics}{Screen,Content}`、`OrganizerPublicScreen`、7 个 view-model 删除；旧路由跳 `operations?seg=`；4 处登记（mobile-route-access、app-wide-route-coverage + README 快照、page-offline-inventory、route-parity）+ `parentForPath`。
- 允许清单只减：Web hardcoded 删 25 条；App hardcoded 22、legacy-ui 11、ionicons 8。审计：退出登录同源控件 9 → 6（R27 / R17 改页所致），HostSetup 预览按钮记 preview-only。
- `screen-ownership.md` 五行改为「已处理」。

## 6. 测试（基线：orbits 7454 / 7 失败；App 3483 / 3 失败）

| | 基线（开工） | 收口 | 说明 |
| --- | --- | --- | --- |
| orbits 全量（`npm test`） | 7454 / 7 失败 | 7415 / 11 失败 → 修 R17 引起的 4 项后剩 7 项 | 剩下 7 项与基线同一批：functional-audit navigation replay（已在 23d2d7f58 修，收口跑时已过）、product-surface-manifest 生成、demo-world-copy（「製造業DX」等 events 示例空格，已转主会话）、plan-design-fixtures dev route、add-contact / add-scan 3 项 |
| R17 引起后修好的 4 项 | — | 已过 | admission 旧页源码断言、A9 受付读报告聚合（403 → 200）、host 路由直接 import shared/mock、迁移条数写死 15 |
| typecheck:app / lint | 过 | 过 | — |
| App 全量（`npm test`） | 3483 / 3 失败 | 3313 / 2 失败 | 2 项均为基线（i18n-domain-split：R27 eventsJourney 未登记；S1 これまでのコード）；条数下降 = 删旧屏测试 25 个 |
| App tsc | 过 | 过 | — |
| R17 自己的测试 | — | tests/host 全过（Web 66+、DB 9 个文件）、App host-screens-render 12 / 12 | 复核修正后加：worker 租约 / 重试、overrides 绑定活动、中止后归档不进公开页、本机名单清理（两端） |
| copy:qa 主催域 | — | 0 | 第 5 段修文案 2 条、检查器误报 2 条 |
| 契约 parity / 快照 | — | 过 | 契约只加：notifyCohosts、trendMarks |

## 7. SC 逐条

| SC | 结论 | 证据 / 说明 |
| --- | --- | --- |
| 01 運営センター | 通过 | host-live-service、渲染测试；W-P01–P03、A-P04 PASS；A-P05 待组件库 |
| 02 建活动与发布 | 通过 | host-lifecycle-postgres（三表同事务、alias 带 / 不带横线、缺省 ops 配置、回填跳过 created_by=host、编辑通知、owner 中止、30 天归档）；第 4 段 mock 端到端走查 |
| 03 概要 | 通过 | W-P06、A-P07 PASS；App 五段含レポート摘要（b12 #430 不进门禁） |
| 04 マッチング | 通过（3 轮暂缓） | composeGrouping、overrides 版本、≤3 次新生成、不改提示词；W-P08–P11 PASS；roundCount 3 → R17-07 |
| 05 参加者 / 审核 | 通过 | admission-waitlist-outbox-postgres（waitlist、对候补再决定、番号、三条路径进 outbox）；W-P12–P14 PASS |
| 06 受付 | 通过 | checkin-v2-postgres（QR v2 签名 / 撤销 30 分 / 当日枠 / 心跳 / 计分对冲）；kiosk 离线队列与 TTL 渲染测试（两端）；W-P15–P17、A-P18 PASS；かな → R17-09 |
| 07 申込設定 | 通过 | 主办方問題 v17 + R27 参加登録先问；W-P19–P21 PASS；お知らせの文面 b12 #406 不进门禁 |
| 08 レポート | 通过 | small-cell（<5 + 差分保护）；W-P22–P25 PASS；推移标注 live 无来源 → R17-10 |
| 09 共同運営者 | 部分 | cohost-invites-postgres（令牌 / 绑定 / 限流 / 一致反馈 / owner 保护）；W-P26 待组件库 G23 |
| 10 公开主办方页 | 通过 | organizer-profile-postgres；W-P27–P33 PASS；旧链接 302；通報 → R17-15 |
| 11 危险色与字典 | 通过 | 中止 / 撤销签到 / 移除共同运营者用 `--coral-text`；NFC 随 A5 下一期 |
| 12 主办入口 | 通过（交接） | `HostEventsRow` + `center?summary=1` 已交付、展示页已加；App 入口 R17-04 交 R18 |
| 13 与 R27 对接 | 通过 | alias 命中 by-code、会場页番号与 QR v2、A11 主催卡（R27 门禁重比 → R17-06） |
| 14 定型通知 | 通过 | host-notices-postgres；邮件只走 transactional（非生产强制重定向或不发）；只发有账号者；尊重通知设置 |
| 15 补画待办 | 待用户 | b12 #396–#481 已照做，认可后加 P34–P73 进门禁（R17-05） |
| 16 旧屏 | 通过 | 第 5 节 |
| 17 通用口径 | 见第 8 节 | — |

## 8. 通用口径 G01–G26

- G03 危险色、G05 逐像素、G07 画板基准：照做（第 4 节）；G06 门禁做法照 R27。
- G10 Web 壳插槽：运营台用 `ShellPage` 的 title / subtitle / right；kiosk 不挂壳。
- G13 旧全局样式：新代码只在 `orbit-2026/host/*.module.css` 与 Orbit2026Scope 内。
- G14 kiosk / 公开页：只剩 check-in 不挂壳；公开页 `/o/[slug]` 用公开顶栏（R17-02）。
- G15–G17 App 壳：AppScreen / ShellTopBar / 系统状态栏 + 安全区（规则 13）。
- G18 演示世界：`DEMO_ACTOR_ID` 示例只读，mock 模式不写库不发邮件。
- G19 契约响应宽进：新契约响应全部 tolerant；App 先改宽进 `event_host_notice`。
- G20 允许清单只减：第 5 节。
- G21 Web 新页面作用域：Orbit2026Scope + ToastProvider。
- G22 语言：cookie `orbit-lang`；三语文案，copy:qa 主催域 0。
- G23 组件库遗留：P26 Drawer、A-P05 Segmented、App BottomSheet 无深色变体（b12 #428）→ R17-17。
- G24 / G26：沿用已做的字形与 token；新增 token `--r-host-avatar`。
- 其余（G01 / G02 / G04 / G08 / G09 / G11 / G12 / G25）：无新增偏离。

## 9. 暂缓（交接表 + DEFERRED-A 两处都写了）

R17-05 补画认可后进门禁；R17-06 A11 后 R27 视图重比；R17-07 编组 3 轮；R17-08 按资料关注；R17-09 受付かな；R17-10 推移标注 live；R17-11 名簿照合接口；R17-12 自分の視点「追加する」；R17-13 kiosk 定員数；R17-14 登出清 kiosk 缓存（复核时已做）；R17-15 通報；R17-16 App `/e/[slug]` 正式接口；R17-17 组件库 G23 两处；R17-18 编组发布与通知同事务。

需授权才能做（本轮未做）：生产迁移 event-ops v16 / v17 / v18、network-analysis v5；试点开关 A12 的生产生效；`ORBIT_CHECKIN_TOKEN_SECRET` 生产密钥；部署。

## 10. 独立复核

复核员（只读，pr-review-toolkit:code-reviewer）看了 9c5237128..HEAD 里 R17 的 37 个提交，报 6 条重要、9 条次要 / 待确认。处理（73c986b05）：

| # | 问题 | 处理 |
| --- | --- | --- |
| 1 | 通知 worker 领取后不占用，可能重复发邮件；邮件失败也标 sent | 修：claimed_until 租约（迁移 v18 只加列）+ failed / rejected 进重试 |
| 2 | 「PC に送る」live 下全部 skipped | 修：desktop_link 不查活动 |
| 3 | 比率能反推被抑制的人数 | 修：分子 <5 也抑制（两端 compute） |
| 4 | overrides 能写进别的活动 | 修：校验 generationId 属于本活动，SQL 带 event_id；新测试 matching-overrides-postgres |
| 5 | 中止后归档的活动进公开页 | 修：排除 payload.host.cancelledAt |
| 6 | 本机名单注销 / 失权 / 启动时不清 | 修：两端 clearEvent / clearAll / 启动清过期，注销清整库 |
| 7 | kiosk 先重放后判权限、键不绑定操作 | 修 |
| 8 | 接受邀请与授角色不在一个事务、不判活动状态 | 修：失败恢复邀请、中止 / 归档拒绝 |
| 9 | 编组发布与通知不在一个事务 | 暂缓 R17-18 |
| 10 | 未配置的人首字取错行 | 修 |
| 11 | App 心跳随按键重建 | 修 |
| 12 | cohost_invite 通知没有链接 | 修：/app/host/join/<短码> |
| 13 | kill switch 不拦主催路由 | 不改：总开关原本只管参加者侧申込体验（`experience` 路由），主催运营不是试点功能；DESIGN §2.11 A12 的「仍可停用」指申込 |
| 14 | 旧屏 opening 快照里还有已删文件 | 不改：opening 是冻结快照，测试只要求允许名单 ⊂ opening，全过 |
| 15 | 撤销时未投递的签到 outbox 仍会加分 | 修：pending 行作废 |

复核确认没问题的点：路由层 401 / 示例 403、各写操作的能力判定、公开接口不泄露姓名邮箱与草稿、活动写入的锁与版本、受付番号、QR v2 签名与生产缺 secret、邮件只在生产发真实地址、迁移可重复执行、试点开关顺序、删旧屏无残留 import。
