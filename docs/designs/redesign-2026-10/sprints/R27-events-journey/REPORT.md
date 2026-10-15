# R27 イベント参加者の動線 — REPORT（2026-10-15）

范围：探す / 詳細 / 参加登録（含取り消し、参加コード）/ 会う準備 / 会場モード / 会後，两端服务 + 两端新 UI + 删旧屏。没连 Neon、没部署；付费 AI 只在本机回环库验证 E3 / E4 各 1 次。

## 1. 提交

| 阶段 | 提交 |
| --- | --- |
| 契约 / 服务 / E3 · E4 | `ee090f29b` `9eae78589` `da9ceb7a2` `eeb5c6979` `57bc216b6` `f9e9d14dc` `57e199956` `bdf516c08`、本轮 `717e407b4`（`EventVenueResponse.me`）`8b592dc30`（`EventCodeResolveResponse` + `GET /api/events/by-code/[code]`） |
| Web 1440 / 1024 / 390 | `c4adbc661` `e53c5545c` `84241f1af` `a251fe188` `d8cc7462a` `5fc99a893` `7433afbc6` `5df399b09` `3953d83ef` `21f2a8e4e` `f7dc4fc3b` `21dc13092` `d4cfb5b9b` `a33700db3` `253ef2d74` `50669d08e` `8acf4edc3` `5d939ad8f` |
| App | `6896de184` `91b44cd61` `e22155047` `cefef5a25` `4c21bf770` `c0221aae6` `717e407b4` `3fb9c8168` `8b592dc30` |
| 删旧屏 | App `b220b6420` `9fceb2acb`；Web 见本轮收尾提交 |

## 2. 成功标准

| SC | 结果 |
| --- | --- |
| 契约 add-only / 快照 / parity | ✅ 新增 event-discover / search / prep / organizer-follow / overview / venue / after / join / code；`EventVenueResponse.me`、`EventCodeResolveResponse` 均顶层新增；快照与 parity 通过 |
| 服务 live + mock | ✅ 详情、参加登録 facade（复用现有访谈 / 报名 / 审核）、会う準備、会場（运营结果只读组合 + 自分だけメモ）、会後（E3 v3 + 规则退路 + 确定）、参加コード |
| E3 / E4 真实 AI | ✅ 2026-10-15 回环库各 1 次成功（E3 668 / 937 token、E4 564 / 294 token，账本 2 行 succeeded），日志 `R27/run-01/ai/verify-1015.log`；G18 可按此打开「AI 下書き」入口（生产开关未动） |
| Web 像素 | 1440 全部通过，W-R27-13 待组件库；1024 六屏通过；390：10 / 20 / 30 / 36 通过，40-390 / 60-390 暂缓（DEFERRED-A §3）；⋯ 菜单 W-R27-35 / 35b 通过 |
| App 像素（§20：超阈值带全部归因） | 见第 3 节 |
| SC-R27-11 旧屏 | ✅ App：`EventDetailScreen` / `EventRegistrationScreen` / `Registration7a*` / `RegisterInviteScreen` / `live/EventLiveScreen` / `EventsScreen` 与只被它们用的 17 个模块删除；attendees / participants / party* 改跳 `/events/[id]/live?tab=people`（`view=map` / `person=`）。Web：`events-0918` 详情 / 现场 / 列表 / 4 个 modal、旧报名工作台、`orbit-*` 旧详情模块共 24 个文件删除（仍被运营与 iOrbit 用的 modal-frame / register-modal / shell / model / community-card 保留）。允许清单只减；`screen-ownership.md` 活动行「已处理」 |

## 3. App 门禁（`scripts/visual/views/app-R27.json`，iPhone 16e (r27)，浅深）

| 视图 | 结果 |
| --- | --- |
| A-R27-10 探す 搜索中 · 14 / 15 詳細 · 20 / 21 / 22 参加登録 · 24 会う準備 · 27 / 28 / 30 / 32 会場 · 37 / 38 / 39 会後 | ✅ PASS（raw 0.03–0.07，超阈值带全部 [raster] / [data] 归因） |
| A-R27-06 / 07 / 08 探す、16 詳細参加者、29 / 31 / 33 / 34 会場 | ⏸ 待组件库：`Segmented` 38 vs kit 30（G23）；seg 临时补丁下各带 dy ≤4、只差字形 |
| A-R27-09 筛选弹层 | ⏸ 待组件库：`FilterOption` / `Toggle`（G23b） |
| A-R27-35 交換 toast | ⏸ 待组件库：`Toast` 带 ✕、不知道会场自带底栏的位置 |
| A-R27-26 チェックイン | ⏸ 画板已由主会话修正（`f7f7abb3e`）后复跑：剩 seg G23、QR 内容（真实 payload）、「画面を明るくしました」需要 expo-brightness 原生模块（DEFERRED-A §3） |

[data] 归因：推荐 3 人 vs 画板「6名」、我的桌 5 人 vs 画板「6名」、森さん职务全称、会後 #38 叠头像「森」不在次の一手名单。

开发回放（只在 `open-path` 开关下）：参加登録 `?replay=…&to=select|review|done`、会場 `meet=1` / `approve=<id>`；`tab` / `view` / `person` 是正式链接参数。

## 4. 测试

- App：3579 条 → 4 失败：`i18n-domain-split`（历史基线，键数 2253 快照）、`invite-code-screens` S1 与 `tasks-unification-interactions`（偶发，单跑通过）、`legacy-ui-ratchet` 已按主会话决定记入 `legacy-ui-deferred.json` 后通过。删旧屏前为 280 失败（旧屏测试打新路由）。
- Web：见收尾时的全量结果（本轮修了 R27 引起的：契约出口、lint 脚本死路径、dev 路由经工厂取 mock、隐私守卫〔评估 id 查询挪进评估模块〕、同步写锁登记、审核制报名的公開範囲校验〔**真 bug**：R27 把参加目的 / 会いたい人改成 matching_only 后，审核制活动的申请在 live 会全部被拒〕、产品面审计的 3 个无处理按钮〔保存 ★ / すべて見る / 受付 QR〕与 2 个可访问名）。
- 新增：`tests/r27-journey-routes.test.ts`、`tests/r27-event-redirects.test.ts`（App）。

## 5. GitNexus

每次提交前 detect-changes；删旧屏两次报 critical（删除 ~45 个旧文件、41 条旧流程），已用可达性分析（从所有路由入口静态可达）+ 全量测试核对，受影响流程都属于被删旧屏。impact：`completeVerifiedProfile` LOW；`buildVenue` / `overview` UNKNOWN → 文本核对调用方各 2 处、1 处。

## 6. 暂缓与交接

全部登记在 `DEFERRED-A.md`（§1 组件库：seg / FilterOption·Toggle / Toast；§3 原生模块亮度 + 语音、Web 390 两屏；§4 E3/E4 已 done）。新的跟进：

1. 详情 / 会う準備 / 会場 / 会後 在 App 改为 online-only（新数据按当前计划在服务端算），旧屏的离线副本（0115 / 0131）随旧屏删除——要不要给新屏补离线副本是产品取舍。
2. `legacy-ui-ratchet`：DiscoverPage 全屏搜索 `<Modal>`、详情 `.utabs`、会場 livebar 三处手写件记入 `tests/fixtures/legacy-ui-deferred.json`（主会话 10-15 定），待组件库补 UnderlineTabs / 可配置 TabBar / 全屏搜索页后替换删行（HANDOFF G23）。
3. Web `FormField`、`agentHrefForContext` 删旧屏后已无生产调用（未在本次删除清单）。
