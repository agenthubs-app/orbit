# W1 实现与验证记录

状态：A+B 与批准的匹配偏好分区已实现。主任务独立 review 发现的会话 ID 与账号 ID 不同、缺运行模式配置两种遗漏已修复；最终独立回归 129 passed / 0 failed / 0 skipped，完整 typecheck 通过。初版及补充证据分列如下。本记录只覆盖 W1，不代表 P0-03 全域链或全应用强制门禁完成。基线 `161e9e6c4d1f314db90365a4d840718adfa12c70`；领域 Astra 设计与独立 review，编码及独立失败路径测试委派 `gpt-5.6-luna` / `max`。范围与批准见 PLAN.md。

## 隔离环境

- 工作树 `/Users/li/.codex/worktrees/197d/orbit`，应用 `repos/orbits`；只在该树编码。
- `npm ci --ignore-scripts --no-audit --no-fund`：307 packages；package/lockfile 未改。
- 独立 Next dev：`http://w1.localhost:4611`；专属 cookie 域避免本机其他端口会话冲突。`.next` 在本工作树，没有共享构建目录。
- 本机 PostgreSQL 5432：查询确认 `orbit_web_w1_20260917` 不存在后才创建，workspace `workspace:web-w1-20260917`，只迁移 orbit_records。
- CAS 既有专用测试另使用 `mktemp /tmp/orbit-profile-cas.XXXXXX` 的全新临时 PostgreSQL 集群，Unix socket、禁用 TCP；未复用或清空任何既有库。
- 所有进程用 `env -i` 显式设置本机配置；没有读取/加载 `.env`、Production 配置、付费模型/OCR key；没有发布或云资源操作。

## 基线验证（编码前）

| 命令/范围 | 结果 |
| --- | --- |
| `node --import tsx --test tests/capabilities/profile-onboarding-policy.test.ts tests/capabilities/profile-private-birth-date.test.ts tests/capabilities/profile-ink-signal-fields.test.ts tests/capabilities/profile-update-conflicts.test.ts tests/pages/app-admin-platform-live-route-services.test.ts` | 30 passed，0 failed，14 CAS skipped（未配置专用 socket）；随后下项独立补齐 |
| 专用临时 socket + `node --import tsx --test tests/capabilities/profile-update-conflicts.test.ts` | 14/14 passed，0 skipped |
| `node --import tsx --test tests/pages/app-profile-live-route-services.test.ts tests/pages/secondary-industry-editors.test.tsx tests/pages/app-account-auth-live-route-services.test.ts tests/capabilities/app-auth-routing.test.ts` | 23/23 passed，0 skipped |
| 本地真实 HTTP 注册 + 浏览器 credentials 登录到 `/app/profile` | 201 注册、200 credentials、200 资料页；观察到旧十项完成度、缺少生日的基线行为 |

上述是改动前基线，不替代最终验证。用于数据保全的合成账号仅存在本地独立库；准备了旧 headline、长期 relationshipGoal、homeMarket、供需/话题、隐藏 phone/website/linkedinUrl/xHandle，之后将验证基础窄字段保存不会覆盖它们。凭据不入文档/Git。

## 设计审查关注项

1. 空记录的编辑预填不能伪装持久版本；首次 CAS 为 null。
2. PUT mutationId 确认与 GET 独立字段回读分开；不确定重试复用原 body/id。
3. handles 为整体替换边界，需保留隐藏键，也要核对明确删除是否成功。
4. 可选建议同步/异步异常均隔离；主 profile 错误不能伪装空资料。
5. 编辑器不得把旧 headline 猜成职位、把 intro 写为目标，生日仅本人编辑数据。
6. 既有 public adapter 的 admin/home/Agent 消费者必须回归；不改 W3 home 人数语义。

## 改动前图谱

专属索引 `orbit-web-w1-197d`，根 `/Users/li/.codex/worktrees/197d/orbit`，meta.lastCommit 为本批 `161e9e6c`。本次刷新 117.3 秒、108,477 nodes、244,207 edges；流程枚举存在全仓上限，缺流程不能作为无影响证据。

- `OrbitRealProfile`、`profileReadbackMatches`、`profileUpdateInput`、`BusinessCardPreview`、`EditSections`：LOW，直接消费者集中于本人资料页面。
- `ChipGroup`：HIGH，已在父任务改动前明确提醒；必须结合实际文件符号及编辑器交互回归，不用共享轴或零流程弱化风险。
- `AppProfileSuccessViewModel`：MEDIUM 下界，admin/home/party/profile 消费者；其余 route loader/adapter 主要为 LOW，但包含传递的 AppAgentPage 流程。
- `AppProfilePage`：UNKNOWN，额外源码确认是 Next 路由入口；新增 adapter 符号在基线不存在，不把图谱零调用当安全结论。
- B 预查 `OrbitRealAccountAuth`：LOW，直接调用为 signup/login/forgot-password 页面；仍需在实施时逐个检查实际修改的嵌套符号。

上述是改动前影响检查，不替代最终完整 detect-changes。

## 最终验证与提交

执行中产品检查：在 `w1.localhost:4611/app/profile` 用正常表单保存姓名、两级行业、bio、微信；真实 SQL 回读确认写入，旧 headline/relationshipGoal/homeMarket/介绍渠道/目标关系类型及隐藏 phone/website/linkedinUrl/xHandle 全部保留，供需话题未改变。生日用日期控件原生按键输入合成日期后保存，数据库与刷新页面一致，权威状态显示基础资料已完成，公开名片不显示生日。

日期控件的自动化 `fill` 没有触发 React 修改状态，改用原生键盘事件后成功；不将工具输入失败报告为已定位的产品缺陷。第一次并发冲突尝试期间发生开发 HMR 全页重载，结果不计入验收。

A 初版冻结后重新执行真实冲突：浏览器修改 bio 草稿，另一个本地服务调用更新同一合成账号 role；浏览器保存收到 PUT 409，草稿完整保留并禁用再次覆盖。点击“刷新最新资料”后显示另一端的新职位，同时保留本地 bio 草稿；用户明确再次保存，PUT 200 + GET 200，页面显示“基础资料已保存并完成复读核验”。这次没有 HMR 干扰。独立审查另外发现 handles 恢复时保留旧隐藏键的风险，已要求以最新服务端 handles 为基底修复并补测试。

独立 A 初版验证：`npm run typecheck` 通过；profile live/editor、secondary industry、admin、home 共 38 项，37 passed / 1 failed。失败为旧测试要求将 legacy industry 放入 PUT，与批准的窄字段保存冲突；须更新语义断言并重跑，不能跳过测试。ChipGroup 二次精确 context/impact 确认符号是本文件，HIGH 判定保留，真实三层影响为 EditSections → OrbitRealProfile → AppProfilePage，无共享组件修改。

独立中间 typecheck 的两处 editorDisabled prop、旧 industry 全量回写测试断言、handles 子键并发恢复，以及 onboarding 自动跳转丢失匹配草稿的问题均已修正。既有 industry 测试现在通过真实 service 先保存旧 industry/bio，再验证窄字段写入保留旧值；没有靠删除场景或跳过测试处理失败。

## 最终独立验证

- 13 个定向测试文件合计 **107 passed / 0 failed / 0 skipped**：onboarding policy、私密生日、profile signal 字段、真实 PostgreSQL CAS、auth return path、profile route/editor/failure paths/navigation、二级行业、account auth、admin/home composition。包括 14 个 PostgreSQL CAS 用例；未把无环境跳过计为通过。补跑时临时 PostgreSQL 未显式传 Unix socket 参数而启动失败，随后恢复原专用 socket / 禁 TCP 参数并完整重跑通过，未动已有 5432 服务。
- 完整 `npm run typecheck` 通过；`git diff --check` 通过。Next 生成的 `next-env.d.ts` 路径变化已恢复，不纳入提交。
- 新增失败路径行为覆盖：409 保稿与明确重存；只改微信时保留另端最新 LINE、phone、website；PUT 成功但 GET 失败时复用同一 body/mutationId；未知或缺失政策阻止保存；两个分区互相保稿；首建 null 版本与未改动姓名预填；仅在回读 complete 后导航，回读失败/incomplete 或仍有匹配草稿时不自动离开。
- 认证组件新增 4 个行为测试通过：普通登录、注册自动登录、自动登录失败后的 created/email 回退、Google callbackUrl。使用真实 NextAuth `signIn` 和本地 HTTP fetch 替身，实际断言导航及请求体；没有依赖不可替换的模块 mock，也没有连接真实 Google。
- 真实本地 HTTP：合成新账号注册 201、credentials 登录 200，continue 对 incomplete 账号转 profile；基础 PUT 200 与 GET complete 后，continue 返回 `/app/contacts?from=w1-http#w1`，query/hash 原样保留。
- 真实浏览器：普通登录 → `/app/profile?onboarding=1&next=...` → 原生日期控件补齐生日 → 保存并回读 → `/app/contacts?from=w1-ui#w1`。已完成资料账号也通过 continue 直接回原目标。
- 真实浏览器代理包装回归：未登录访问 continue，既有 proxy 转为 `login?next=continue?...`；登录页只解包这一层，登录后到 `/app/contacts?from=w1-wrapper#kept`，没有丢目标或循环。该问题由真实 HTTP 路径发现，没有修改 proxy/shared shell。
- 验证中曾遇到跨任务 CUA 和 app 消息工具超时，主任务确认其他域也受影响。连接恢复后已补齐上述浏览器验收；未重启共享服务、清理其他会话或把工具故障归因于产品。
- 本任务 Next 4611 与临时 CAS PostgreSQL 集群已停止；独立本地数据库及合成记录保留以便复查。没有云端、付费模型/OCR、邮件发送或部署操作。

## B 图谱与边界

编码代理在基线索引执行了 B 的精确 context/impact：`OrbitRealAccountAuth` LOW，直接消费者为 login/signup/forgot-password；`readAccountAuthQueryFromLocation` LOW，直接消费者为该组件；`AppProfilePage` UNKNOWN，额外核实 Next 路由入口。`OrbitRealAccountAuth.onSubmit` 使用精确 UID 消除同名歧义，因索引丢弃 receiver-typing call sites 为 UNKNOWN lower-bound；源码确定为表单回调。`onGoogleSignIn` UNKNOWN，源码确定为本组件 Google 按钮回调。新 continuation/导航符号在基线不存在，不能以零调用当安全证据，提交前需索引新增文件并完整检测。

## 交接与剩余

- 本批未改 `features/account/**`、`features/auth/**`、`auth.ts`、profile service/storage、共享 DTO/taxonomy、全局 shell/CSS、W3 活动问卷或 App 代码。
- Web 使用既有 API 的 policy v1、私密 birthday、CAS 与 mutation receipt。App 契约无需同步；不宣称原生 UI、跨端同记录并发或完整业务链已验收。
- 仍由主任务持有：W5 全应用强制门禁；正式职位/供需/话题词表；W3 活动资料与问卷全链；真实 Google OAuth provider 环境验收。注册自动登录失败回退与 Google callback 本地分支验证不等于真实 Google 账号登录。
- 交接提交 SHA 由提交成功后发给主任务，本文件不写自引用 SHA；无远程 push、PR 合并或部署。

## 提交前最终图谱

- 已强制刷新专属 `orbit-web-w1-197d` 索引，纳入全部新增文件；基线仍为 `161e9e6c`。最终索引 108,814 nodes、244,759 edges、2,081 clusters、794 flows。
- GitNexus 1.6.12 CLI 的人类摘要固定只展示前 15 个符号，不能用其 `...375 more` 摘要满足完整检查。直接调用同一安装版本 `LocalBackend.callTool("detect_changes", {scope:"all", repo:"orbit-web-w1-197d"})`，保存未切片的完整结构化结果，并读取全部 390 个符号及全部 2 条流程。结果：16 个差异文件、390 个符号、风险 MEDIUM；无 error/partial/truncated 标记，数组数量与 summary 完全一致。但 changed_symbols 只映射 15 个不同文件；这不等于 16 个文件均有符号覆盖，缺项证据见下节。
- 两条报告流程为 `CreateContactRequestAtomically → MarkDirty`、`Send → MarkDirty`。进一步读取两条流程的全部 12 个步骤及精确文件 UID，发现均经 `onsite-operations-repository.ts:digest` 连向组件内部 `OrbitRealProfile.update`。源码确认前者调用 `node:crypto` 的 `hash.update()`，后者是 React 组件词法作用域内的表单更新函数；中途的 `sha256` / `digest` 也跨接到 App 的 Expo Crypto。故这两条跨域路径是同名方法误连，不是实际调用链，不能据此声称已验证活动或 Agent 写入。
- 全仓索引仍有既有覆盖限制：14 个非本批大文件跳过，流程入口候选、分支与遍历预算存在上限。完整 detect 仅指本次结果没有截断或查询失败，不表示全仓图谱没有覆盖盲区。实际边界另由精确源码、107 项测试、typecheck 和真实本地浏览器/HTTP/数据库验证支撑。
- 最终完整原始结果留在本机 `/tmp/orbit-w1-final-detect-full.json`，不将生成图谱/日志加入交付。提交只包含批准的 16 个 W1 文件；暂存差异空白检查通过。


## 主任务独立复核补充

初版提交 `68d26c77` 后，主任务要求验证原始 Auth.js profile ID 不等于 canonical account ID、非 production 且缺少双运行模式变量的条件。此前真实本地合成账号采用同值主体，并显式设置 live，故上述 107 项与浏览器链路不能证明这两个条件正确；初版验收结论需要此补充。

### 身份与运行模式证据

- 现有 `/api/profile` GET/PUT 经 `resolveAuthenticatedApiActor` 使用 canonical `actor.id`。`AuthenticatedApiActor.id` 的明确契约是 account ID；profile live service 和 provider 都按 profile.accountId 匹配，不支持把 raw profile ID 当 owner。
- 首轮只读 service 级探针（provider 为测试替身，不能独立证明存储隔离）：session subject `profile:canonical-owner` 映射为 `account:canonical-owner`；实际 live service 用 raw ID 返回 empty，用 canonical ID 读到 `profile:canonical-owner`。membership 缺失时 live identity resolver 返回 null。
- 初版 profile page 和新增 continuation 都直接传 session.user.id，确实与 API 不一致。并非因为 W3 使用 account ID 而照搬改名。
- 清空 `ORBIT_MODULE_MODE`、`ORBIT_FEATURE_MODE` 且非 production：resolveFeatureMode 和默认 profile factory 均为 mock，默认 getProfile 返回 `profile_ari_lane`；显式 live 在无数据库时返回 `PROFILE_LIVE_STORE_UNCONFIGURED`。profile page bundle 和 API 也沿用该默认模式。
- 修复限定本人资料的两个服务端页面：仅 live runtime 进入真实服务；先复用已有会话身份解析器获得 canonical owner；缺模式、membership 缺失或解析异常均受控失败，不能渲染示例编辑器或当成真实空资料首建。continuation 明确选 live。API/backend 不在本批改动边界。
- 独立索引刷新后，两页精确 context/impact 为 UNKNOWN：无已解析 caller，源码确认是 Next 路由入口。共享 loader 的 impact 为 CRITICAL（3 个直接消费者 profile/admin/home、8 个总影响、AppAgent 9 条流程），已提前警告；本次避免修改共享 loader 默认行为。其旧 failure scenario 会调用 mock suggestion 且含 Ari 文案，因此不拿该分支伪装身份错误。

### 图谱文件覆盖更正

- 唯一没有 changed_symbols 映射的差异文件为 `tests/pages/app-profile-live-route-services.test.ts`。对该精确路径查询返回 23 个节点：一个 File（startLine/endLine 为 null）、22 个实体节点；文件没有漏索引。
- 可映射实体的 0-based 范围为 15–74 的常量/命名 helper，以及 185–205 的对象属性。初版 `git diff -U0` 的新行是 114、123、128–129、152、158–159、170、173–176、249（1-based），均在没有命名符号节点的匿名 test 回调中，与已索引实体范围不重叠。
- 当前 detect_changes 的实现要求 start/end 非 null 且与变更 hunk 相交，因此该 File 不会进入结果；没有给原始结果补造节点。补核方式为完整源码差异审查及该测试文件的真实执行。后续交接必须分别报告 diff 文件集合和符号映射集合，不用 summary.changed_files 或数组计数替代集合核对。

独立存储证明已执行：使用真实 `createStorageProfileProvider`、`createStorageAccountSessionProvider`、`resolveAuthenticatedApiActorIdentity` 与内存 LiveRecordStore，准备 raw profile ID 与 account ID 不同的 A/B 两主体记录；raw profile ID 读取 accounts/profiles 都为 0，canonical A 只返回 A、canonical B 只返回 B，两个 Auth.js subject 分别映射到各自 canonical owner，legacy account subject 也正确。没有在替身 provider 中手写 actor 筛选。领域主审在 clean env 独立重跑通过，原始证据 `/tmp/orbit-w1-storage-identity-proof.json`。

已有独立文案残留：`app/(app)/app/profile/compose-app-profile-from-previously-approved-mock-first-capabilities/profile-route-view-model.ts` 的 `routeStateViewModel("failure", failure)`，在 canonical 身份已验证但 live profile service 失败时被 loader 调用；该函数创建 mock service 对象，固定 nextStep/recovery 文案仍含 Ari。传入 failure 的路径不会为确定错误而读取 mock suggestion，也没有返回示例 profile 数据。新两页的 nonlive/membership 错误不经过此分支；本批没有因此扩大修改 CRITICAL loader 的默认语义。

- 导航测试最终 **21/21 passed**：实际执行两页，auth/redirect 与框架边界使用本地替身；关键资料用例经过真实 route loader、editor adapter、live service、storage provider 与内存 store。原始 profile subject/canonical owner 不同；首建明确断言 hasPersistedProfile=false、expectedUpdatedAt=null，已有档断言真实名称与持久版本。另覆盖 nonlive 不解析身份/不创建服务、不挂编辑器，membership null/throw，production 缺 mode 或显式 mock 仍按共享规则进入 live，完整资料保留 next query/hash，空档/incomplete/store 异常回 onboarding。
- 最终领域主审独立执行 14 个文件 **129 passed / 0 failed / 0 skipped**（原 13 文件集 + authenticated-actor-context，含 14 个真实临时 PostgreSQL CAS）；完整 `npm run typecheck` 与 `git diff --check` 通过。证据 `/tmp/orbit-w1-review-final-tests.log`、`/tmp/orbit-w1-review-final-typecheck.log`。本轮额外 PostgreSQL clean env 启动因缺 locale 失败，显式 LC_ALL=C 后正常启动；只用原专用 Unix socket、禁 TCP，验证完已停止。
- 页面补测是实际服务端页面函数执行，不是新增浏览器验收，也不以独立 provider 探针代替页面行为。首轮浏览器/HTTP 验收的同值主体边界保留上述限定；本轮没有重启 Next 或访问云端。
- 最终索引验证曾发现 incremental 构建异常：combined detect 把同一接口关联到 776 条跨仓流程，并丢失已有 auth/文档等节点，尽管返回没有 partial/truncated。已明确警告并停用该结果；异常 raw 保留 `/tmp/orbit-w1-review-detect-combined-before-force.json` 和 incremental 对应副本。专属索引一次 `analyze --index-only --force --name orbit-web-w1-197d` 后恢复，不修改原始 raw 来消除异常。
- 强制重建后索引：108,896 nodes、244,954 edges、2,080 clusters、789 flows。完整增量 detect 为 **5 文件 / 95 符号 / 3 流程 / MEDIUM**，5 个路径全部映射；基线 `161e9e6c` 到全部 W1 变更的 compare 为 **16 文件 / 478 符号 / 5 流程 / MEDIUM**，15 个路径映射，唯一缺项仍是上文已核实的匿名 test 回调文件。全部 changed IDs 非空且唯一，路径非空且无额外文件；符号/流程数组长度与 summary 一致，均无 error/partial/truncated。
- 已完整读取 478 个符号并核查 5 条流程的全部 26 个步骤与精确 UID：3 条是 profile 页经 continuation/next 规范化的实际链路；另 2 条仍是上文已核实的 crypto update/digest 同名误连。本次强制索引仍存在 14 个大文件跳过及流程预算覆盖限制：9,543/9,743 候选入口未枚举、8,766 callees 丢弃、61 次遍历预算截断；不得把完整 detect 等同于全仓没有覆盖盲区。
- 最终未经裁剪的原始结果：`/tmp/orbit-w1-review-detect-incremental.json`、`/tmp/orbit-w1-review-detect-combined.json`。图谱、测试日志与探针均不进入 Git。
- 增量提交只包含两个页面、原 navigation 测试、DESIGN 与本 REPORT，共 5 个原范围文件；依赖原提交 `68d26c772f86574444a34cc11df5fd2c5eb445d8`，主任务需按原提交、增量提交顺序应用。增量 SHA 在提交后交接，不写自引用。共享 loader、auth/profile backend、API、公共契约均未改。


## 409 并发恢复的第二轮复核

主任务在整合暂存区末轮审查中指出 Reload 并发窗口，要求 Astra 先只读复现。对 `6ff3db61`，Astra 复用现有 failure fixture 挂载真实编辑器，用两个 deferred GET 严格执行：初始读取 → 修改微信 → PUT 409 → 同时启动两次 Reload → 首次 Reload 完成 → 修改姓名 → PUT 成功及独立 GET 核验 → 第二次 Reload 的旧快照迟到。

结果确实失败：Reload 按钮在首个请求进行中仍可操作；第一次回读完成后保存按钮恢复。新姓名已显示保存核验成功、版本为 00:02；迟到的旧回读随后将姓名和版本回退到 00:01，并重新写入捕获的 dirty handles。成功保存后不作修改提交不会请求，而旧回读后不作修改提交却发送带旧版本和 handles 的新 PUT。此证明客户端状态回退与 dirty 复活，不代表服务器 CAS 被绕过；探针没有真实 API/数据库写入，第三 PUT 按 409 处理。

原始证据 `/tmp/orbit-w1-reload-race-evidence.json`，原样反例 `/tmp/orbit-w1-reload-race.rk325888/probe.test.tsx`，运行日志 `/tmp/orbit-w1-reload-race-run.log`。反例测试 1/1 pass 表示成功复现缺陷，不能记为安全验收。仓库代码在只读结论交付时保持干净。

主任务随后批准仅修改既有 `orbit-real-profile.tsx`、`app-profile-editor-failure-paths.test.tsx` 和本 REPORT。原 Luna/max 执行先 RED 后修复；Astra 独立审查与重放。新提交依赖 `6ff3db61`，不覆盖主任务已暂存的前两提交，不改全站 actor、共享 loader、API 或后端。

改动前在专属强制重建索引执行精确 context/impact：`reloadLatestProfile@990:2` LOW，直接调用者为 OrbitRealProfile、传递至 AppProfilePage（三条 next 规范化流程）；OrbitRealProfile LOW，直接 AppProfilePage；`saveProfile@833:2` LOW，直接 onSubmit/onSaveMatching 两个保存入口。全部 UID 与源码匹配，没有使用同名符号或零流程掩盖风险。

- 正式同 tick 双 Reload 用例先 RED（旧实现初始 GET 加两次刷新共 3 次，期望 2），日志 `/tmp/orbit-w1-reload-race-red.log`。Astra 在生产修改前另执行两个独立 safety 用例，均 RED，日志 `/tmp/orbit-w1-reload-safety-red.log`。第三个 save 锁用例仅在修复后执行，不冒充 RED。
- 修复在 await 前取得同步 ref 锁，使 Reload 与保存互斥；刷新期间真实禁用编辑/保存/刷新并显示双语 busy 文案。operation epoch 与 mounted 检查覆盖初读、PUT 回执、GET 回读和异常处理，finally 只释放属于自己的操作。没有修改 extraction、API 或后端 CAS。
- Astra 原始反例文件保持不变。修复后原探针先因 busy 按钮名称变化不能找到旧按钮而停止；仅扩展按钮定位文本的同顺序重放则在原不安全断言“刷新中 disabled=false”处失败，实际为 true。这两次失败仅证明旧操作入口已阻断，不单独记为安全通过。正向独立 safety 重放在真实挂载组件上 **3/3 passed**：双回调仅一个 GET、旧保存闭包无法越过刷新锁、JSON 仍 pending 时仍持锁、失败保稿与明确重试、刷新完成后新编辑可保存回读且 dirty 清空、保存 pending 时旧 Reload 回调不能插入；日志 `/tmp/orbit-w1-reload-safety-final.log`。
- 最终仓内 failure suite **15/15 passed**，新增 5 个持久行为用例。主审发现首轮冻结声明误把 PUT readback 失败当作 Reload 失败覆盖，要求补齐后才接受最终冻结；现已逐行核实真正的 Reload JSON 延迟、失败保稿、保存继续禁用和显式 retry 成功路径，没有通过删除断言或更改请求顺序回避反例。卸载用例验证迟到 PUT 不再触发验证 GET 或导航。
- Astra 在最终文件上独立执行前述 14 文件组合，**134 passed / 0 failed / 0 skipped**，包含原 14 个真实 PostgreSQL CAS 用例；日志 `/tmp/orbit-w1-reload-fix-final-tests.log`。完整 `npm run typecheck` 通过，日志 `/tmp/orbit-w1-reload-fix-final-typecheck.log`。生产文件 SHA256 为 `e6dab8460e8dcb3d7704fe9adc932a26d2291c7f3af53f6231d0c64158461676`，测试文件为 `41222f5149ccde1de8ca550f06230f2eb663ec96fce652804a87ec64ab8925b4`。
- 最终一次 force 索引为 108,909 nodes、244,981 edges、2,085 clusters、789 flows；完整 raw detect 本轮增量为 **3 差异文件 / 17 符号 / 0 流程 / LOW**，三个路径全部映射。相对 `161e9e6c` 的完整 W1 compare 为 **16 差异文件 / 489 符号 / 5 流程 / MEDIUM**，15 个路径映射，唯一缺项仍是 `tests/pages/app-profile-live-route-services.test.ts`，再次精确查询得到同一 File + 22 实体与上述行范围。新增 failure 测试路径由回调中的 method/function 节点映射，并不表示每个匿名测试本身都有节点。
- 已读取全部 489 个符号；changed ID 非空且唯一、filePath 非空，summary 与数组一致，diff 与映射集合没有额外路径。完整读取 5 条流程的全部 26 步精确 UID：3 条实际 next 规范化链、2 条既有 crypto update/digest 同名误连，与前次复核相同。增量 0 流程不表示 React 回调没有消费者，实际依赖已由修改前精确 impact 和挂载测试核实。完整 detect 无 error/partial/truncated；全仓索引仍跳过 14 个大文件，9543/9743 入口未枚举、8766 callees 丢弃、61 次遍历预算限制，保留覆盖边界。
- 未裁剪原始结果 `/tmp/orbit-w1-reload-fix-detect-incremental.json`、`/tmp/orbit-w1-reload-fix-detect-combined.json`；完整流程步骤 `/tmp/orbit-w1-reload-fix-processes.json`、缺项节点证据 `/tmp/orbit-w1-reload-fix-file-coverage.json`。报告收尾后再次核对 detect 与暂存差异；不重复 force，不为图谱改变测试形状，不往 raw 补造节点。
- 本轮仅提交主任务授权的上述三个文件，依赖 `6ff3db6164c2089cae46c39d67c23d89acf389b7`；此前两提交顺序不变。本轮没有新增浏览器/云端验收，临时专用 Unix socket PostgreSQL 已停止，没有影响共享 5432 服务。
