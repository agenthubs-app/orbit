# Event operations browser E2E

This path exercises the complete event on-site chain against live records. All people are fictional test fixtures. The fixed matching cohort contains exactly 64 active, on-time participants. Six additional accounts preserve cancelled lifecycle histories (three registered on time and three registered late before cancelling), so canonical storage contains 70 registration histories while the active directory and every frozen/published generation remain exactly 64. Names and profiles span Chinese, Japanese, English, and additional language backgrounds, with intentionally varied industries, companies, seniority, offers, needs, goals, energy styles, experience, and follow-up preferences. It intentionally creates no recommendations, table assignments, graph, check-in, contact request, or relationship record.

## Prepare and seed

Use an isolated development database. Configure one supported model provider and its matching server-side key (`gemini` + `GEMINI_API_KEY`, `deepseek` + `DEEPSEEK_API_KEY`, or `openai` + `OPENAI_API_KEY`). The model provider must return the strict JSON schema; invalid JSON, missing keys, timeouts, and schema errors fail the generation without a fallback.

```sh
export ORBIT_MODULE_MODE=live
export ORBIT_EVENT_DATABASE_URL='your isolated development database URL'
export ORBIT_AGENT_PROVIDER=openai
export OPENAI_API_KEY='your server-side key'
export ORBIT_EVENT_OPERATIONS_SEED_PASSWORD='choose a development-only password of at least 8 characters'
# Only when rotating the synthetic .example.test fixture credentials:
export ORBIT_EVENT_OPERATIONS_RESET_FIXTURE_PASSWORDS=1
npx tsx scripts/seed-event-operations-e2e.ts
npm run event-operations:worker
# Run `npm run dev` in a second terminal with the same environment.
npm run dev
```

The password is supplied only through the environment and is neither embedded nor printed. Re-running the seed resets the exact fixture event's registration and event-operations collections before recreating them. It does not broadly delete other events or accounts. The six cancelled histories exercise cancellation and late-registration state without reducing or contaminating the 64-person matching cohort.

## Isolated Neon demo workspace

The web demo seed uses `npm run db:seed:demo-workspace` with the dedicated
`workspace:orbit-demo-fixtures` workspace. It creates the reviewed organizer
account/profile chains, runs the explicit Event Core backfill against the
fixture sources, and verifies that all 13 public events have canonical
published rows, aliases, and canonical membership state. The public
`event_signup_01` event retains exactly 64 active memberships and 6 cancelled
histories. Stable mock organizer entity IDs are kept for local fixtures; the
backfill resolves them to the reviewed Neon auth actor IDs when a unique owner
claim already exists. This seed is development-only and refuses
`NODE_ENV=production`.

## 2026-09-16：Production 测试与激活审计

用户已明确授权把云端 Demo 数据复制到 Neon Production 供测试；正式对外上线前清理测试工作区。Production 使用 live 服务读取 `workspace:orbit-demo-fixtures`，而不是运行本地 mock provider。开发种子的 `NODE_ENV=production` 拒绝保护保持不变；本次采用先验空库、保留身份与版本的事务复制，不在 Production 重跑破坏性 seed。

`scripts/demo-canonical-memberships.ts` 替代直接设置 canonical 标志：调用正式激活入口，为无报名的公开 fixture 记录数量、摘要、截止时间来源及不可变审计；既有基线重放必须保持不变。只修复 allowlist 中无任何历史的 flags-only 状态，已有报名、审计或部分 metadata 一律拒绝。独立 PostgreSQL 测试覆盖回滚、幂等、审计篡改和范围约束；定向组合 27/27、typecheck、production build 通过。

当前云端演示主办方为 `naoki-yamamoto@organizers.orbit.example.test`，参与者为 `attendee01.event-ops@orbit.example.test`。两者测试密码保存在开发机器受限文件 `/Users/li/.config/orbit/demo-fixtures.env`，不入库、不入文档。下面独立 E2E seed 的 `organizer.event-ops` 账号不等于云端现有活动 owner。

为了测试主工作区的联系人/待办，另建 `demo-owner@orbit.example.test` credentials 登录，通过既有 auth-membership 机制关联合成 `account_orbit_generated`；未修改原 Google 身份。该专用测试登录只在当前测试 workspace 有效，正式清理时与 workspace 一并移除。密码同样仅在上述受限文件中。

Production 一次性导入已完成：56 张业务表共 9,217 行，其中 `orbit_records=8,703`。事务内验证空目标、schema/迁移账本相等和逐表内容摘要；仅复制业务数据，未覆盖账本。正式测试入口为 `https://orbit-puce-kappa.vercel.app`。后续不得向已写入用户测试操作的库重跑全量 seed；数据初始化修复与用户测试新增事实必须分开处理。

后续新增 `event_demo_cloud_flow_20261018` / `DEMO20261018`，标题“云端联调体验会（测试活动）”，2026-10-18 14:00–16:00 Asia/Tokyo，明确为无真实会务的合成活动。canonical event/version/alias/空报名激活审计在同一事务创建，主办方仍为已能登录的 Naoki；运营配置通过正式 UI 保存。参与者已完成两题报名，并刷新确认原始回答持久化，AI 画像不冒充原始事实。

实测发现 Web 取消按钮使用空 POST，而线上 Request 有 body stream 时被 JSON 校验拒绝。页面现在发送 `{ intent: "cancel", expectedRegistrationVersion }`，复用现有接口版本检查；准入制撤回不变。组件回归先红后绿，与接口/种子组合 19/19 通过。

修复版 `dpl_5JaVX9ko5phE3T4cdFTGcmmcMFxs` 已在 Production 验证：报名→刷新→取消→刷新→重新报名；membership versions 为 1/rsvped、2/cancelled、3/rsvped，三者 `source_registration_id` 相同，没有重复创建报名记录。

`scripts/demo-organizer-projection.ts` 修复静态 fixture account 与真实 credentials account 的双重主办方投影：仅处理 13 个已知 `.example.test` 身份，补齐登录 profile 缺失的组织/角色字段、重指 organizer account，并对已无外部引用的 26 条旧 account/profile 做带替代 ID 的 soft-delete。保留登录密码、已有 profile 修改和 Google 主账号。规划为纯函数，调用者同一事务读取并应用；二次规划必须为空；未知引用或非 fixture 记录拒绝处理。

原生 App 当前验证限制：Expo Go 缺少 ExpoAsset；本机原生构建因 Swift 6.2.1 不接受当前 expo-modules-jsi 的 `weak let` 编译失败。未修改依赖或降低生产安全设置；App 浏览器版的跨域限制也未绕过。不能把这些尝试标为原生双端验收通过。

历史 Preview 曾验证主办方登录及后台 64 人目录；本地 live API 连接同一 Neon Demo 时主办方 200、参与者 403。当前 Production 的登录、隔离与新增活动报名证据见上文；原 13 个历史活动仍保持结束状态。

### 人脉 fixture 与新版生命周期

Production 只读 preflight 发现旧生成数据中 66 个联系人对应 450 条关系，微秒时间字符串不符合当前严格运行契约，且缺少版本、积极推进目标和关系待办用途。`scripts/demo-relationship-projection.ts` 只处理精确 demo workspace 的原始 fixture：输入必须与当前生成源 payload 一致，拒绝覆盖用户修改、跨 owner、未知引用或部分应用。保留每个联系人的最小稳定关系 ID，384 条重复关系可恢复停用；旧采集状态转为明确的合成复核/跟进场景，而非伪造真实人工审阅。保留有效关系阶段，积极推进目标来自既有 fixture 的建议动作；66 条当前任务保留真实日期语义，14 条同联系人同意图的旧合成任务标为 dismissed，而不是伪造完成记录。

所有关系输入变化后的连接类 AI 分析都可恢复停用，不把旧分析移接到新输入。原始 evidence 不改写。新数据必须通过正式 lifecycle preflight 和 canonical read projection；整批在一个事务内应用、先备份，重放不覆盖后续用户编辑。生成器原始条数验证只适用于投影前，不再把去重后的条数变化误报成丢数据。

Production 已提交上述 662 条定向更新：66 contacts、66 active connections、80 历史/当前 tasks（66 open/scheduled、14 dismissed）；384 重复 connections 和 66 旧 connection analyses 可恢复停用。事务末 preflight 为 `readyForCutover=true`、issues 0，canonical projection 66；二次规划为空。受限备份为 `/Users/li/.config/orbit/production-test-2026-09-16/pre-relationship-consolidation.json`。正式 Web 列表和联系人详情刷新成功；46 项定向回归、typecheck 通过。没有改变 Web/App API，运行发布仍为上文修复版，后续 seed 投影脚本不需要另行发布才能使已写入的云端数据生效。

## Organizer path

1. Open `/app/account/login?next=%2Fapp%2Fevents%2Fevent_signup_01%2Foperations`.
2. Sign in as `organizer.event-ops@orbit.example.test` with the development password supplied above.
3. Confirm `/app/events/event_signup_01/operations` shows exactly 64 active, on-time participants with complete profiles. The underlying canonical fixture also retains 6 cancelled histories, including 3 late registrations.
4. Review the seeded time gates. Save only if intentionally changing them.
5. Select **Capture snapshot**. Record the immutable snapshot hash and confirm its participant count is 64. None of the 6 cancelled histories may enter that snapshot.
6. Keep the independent worker running. The admin page polls persisted progress automatically; it must never require repeated HTTP **Run AI tasks** clicks. The legacy `/run` route returns `EVENT_OPERATIONS_DURABLE_WORKER_REQUIRED` instead of holding an HTTP request open for provider work.
7. If a shard fails, confirm the exact provider/error code is visible and use **Retry failed shards**. Completed shard outputs must remain completed.
8. Once the generation is completed, select **Publish atomically**. Before this click, no new attendee result may appear.
9. Download **Export CSV** and confirm it contains the 64 frozen participant IDs, completeness flags, check-in state, and both table/seat columns.

## Attendee result and check-in path

1. Sign out, then sign in as `attendee01.event-ops@orbit.example.test` with the same development password.
2. Open `/app/party?eventId=event_signup_01`.
3. Confirm **All attendees** contains exactly 64 active registration-backed profiles. Cancelled histories must be absent. Non-recommended attendees must be labeled as directory profiles rather than recommendations.
4. Confirm **For you** contains only the published AI recommendations, with evidence-based reasons, two icebreakers, and a member hint. If the model returned no match, confirm the explicit `noMatchReason` appears.
5. Confirm **Groups** shows two distinct rounds, each with a real table number, seat, theme, rationale, three table icebreakers, and participant-specific prompts.
6. Confirm **Graph** node and edge counts match the published graph and that edges distinguish mutual recommendations, round-one tables, and round-two topics.
7. Open `/app/party/checkin?eventId=event_signup_01`, select **Check in now**, refresh, and confirm the same persisted timestamp remains. Repeating the action must not create another arrival record.

## Bilateral business-card consent

1. While signed in as attendee 01, request contact with attendee 02 from one attendee/recommendation card. Confirm only that one target moves to **Waiting for their consent**.
2. Sign out and sign in as `attendee02.event-ops@orbit.example.test`.
3. Open the same Party event and confirm the incoming request offers **Accept** and **Decline**.
4. Decline once after a fresh seed and verify the organizer consent audit shows `declined` with no contact-write evidence.
5. Re-run the seed, repeat the request, and accept it. Confirm the audit reaches `accepted` and contains two actor-scoped consent evidence IDs. Only after acceptance should each account receive the other participant's contact/connection records.

## Failure boundaries

- Remove the selected provider key and start/run a new generation: it must fail with `EVENT_OPERATIONS_AI_UNAVAILABLE` and preserve the previously published generation.
- Configure a test provider response with malformed or fenced JSON: it must fail with `EVENT_OPERATIONS_AI_JSON_INVALID`; no repair or fallback result may be published.
- Visit the organizer URL as an attendee: owned-event access must reject it.
- Visit Party without an active registration: registered-event access must reject it.
- Before `resultsAvailableAt`, Party must show a locked state even if a generation is published.

## 缺字段回归验收（2026-09-06）

默认种子的 64 名有效参与者使用完整且不同的画像；6 条取消历史保留原有生命周期覆盖。`tests/capabilities/event-operations-seed.test.ts` 同时运行完整画像场景和缺少可选字段的独立内存场景：后者保留核心字段，将 5 人限制为 3 项回答、3 人限制为 2 项回答，期望 56 complete / 5 partial / 3 minimal。两种场景都验证重复播种、精确范围清理、取消与迟到历史排除、管理页及冻结快照中的回答一致性，不能凭空补全缺失回答。这个自动化检查没有生成真实模型结果，也没有向云端导入测试人员。
