# W1 账号与资料最小设计包

日期：2026-09-17。状态：主任务已批准的 A+B 与 C 可选分区/正确字段保存已实现，由 `gpt-5.6-luna` / `max` 编码，领域 Astra 独立 review；实际验证和交接范围见 [REPORT.md](REPORT.md)。固定词表、全局强制守卫不在本批实施范围。

主任务：`01a0ae27-0068-7613-9f87-82aa91a836bd`。工作树：`/Users/li/.codex/worktrees/197d/orbit`。初始 HEAD `d2180ba70bcea5f3c65d26a1b589e1020e9ba1a4`，干净 fast-forward 至 `29efb4c9d460b97ef526578d051e824592f52555`。以下应用路径均相对 `repos/orbits`。

编码基线按主任务后续指令再次干净 fast-forward 至 `161e9e6c4d1f314db90365a4d840718adfa12c70`。原设计稿保留。前端 auth、页面 VM 白名单、bio 唯一新输入及生日/窄字段/CAS选择均已明确批准，不重复申请。下面“建议／申请”措辞保留设计决策来源，以本段实际批准状态为准。独立本地端口 4611、域名 `w1.localhost`；数据库 `orbit_web_w1_20260917` 经确认不存在后创建；没有加载 Production/env 或共享其他任务数据库。

## 目标与边界

负责 P0-03 中首次登录资料引导、P1-08 资料简化、P1-09 基础/活动资料分离、P1-10 结构化选择。P0-03 的完整活动、匹配、人脉、AI、日程端到端链由主任务组织，不因本域完成而关闭整个条目。

不编辑 W0 account/auth 服务、actor/provisioning、存储、bootstrap/dashboard 或部署配置；不访问云 DB、不发布、不调用模型。共享 shell、语言 provider、共享 DTO/taxonomy 由主任务持有。生日沿用 policyVersion 1，无权自行删除或降为选填。

## 已解决能力与真实剩余

| 范围 | 已有源码能力 | Web 剩余差异 |
| --- | --- | --- |
| 基础门禁 | `features/profile/onboarding.ts` 计算姓名、一级行业、二级行业、合法生日四项；mock/live GET/PUT 返回 `onboarding` | auth 成功及 Google callback 直接去 `next`；资料页未消费权威状态 |
| 行业 | `shared/domain/industries.ts` 的 taxonomy v1、父子校验及三语标签；页面已有两级 select | 职位仍在行业之前，旧行业自由文本同时展示；缺分类的旧资料不能自动猜测 |
| 生日与公开边界 | `shared/contract/profile.ts` 定义私密 `birthDate`，公开投影明确排除；服务端校验日期 | route VM/展示 VM 丢生日，实际页面无生日输入，无法完成既有政策 |
| 保存 | `features/profile/live-service.ts`、`storage/profile-mutations.ts` 已具 CAS/幂等接口；页面已有 PUT 后 GET 回读 | VM 丢 `updatedAt`；提交无 `expectedUpdatedAt`/`mutationId`；完整对象回写混用行业/市场、供需/介绍渠道和目标关系类型 |
| 基础与匹配分离 | `onboarding` 与旧 `completeness` 已独立；基础四项填齐可在旧丰富度仅 17% 时完成 | Web 自建十项完整度仍要求公司、职位、微信/LINE、简介、开场白、供需、话题；“可被匹配”不代表某活动就绪 |
| 一句话介绍 | `bio` 已有最多 80 可见字符服务校验 | 同时显示 headline 一句话、bio 简介、relationshipGoal 开场白三项 |
| 结构化匹配 | offering/seeking 已去重、各最多 5 项；字段保持 string[]；活动 registration 有独立问卷/目标资料 | 页面只把用户已存值当候选，无正式预设；topics 尚无相同 5 项限制，不应擅自追加 |

证据入口：`app/(app)/app/account/orbit-real-account-auth.tsx`；`app/(app)/app/profile/orbit-real-profile.tsx`；`app/(app)/app/profile/compose-app-profile-from-previously-approved-mock-first-capabilities/{profile-route-view-model,profile-view-model-adapter}.ts`；`tests/capabilities/profile-onboarding-policy.test.ts`、`profile-private-birth-date.test.ts`、`profile-update-conflicts.test.ts`、`profile-ink-signal-fields.test.ts`。

额外根因：当前 route loader 把 profile、resume extraction、signal review 三项结果一起作为页面成功条件。首次手填资料不应依赖可选抽取/建议能力成功；基础读取失败必须明确失败，可选服务失败只能影响对应区域。空 profile 已有 actor 草稿，不需新增数据库记录或复制身份初始化服务；该草稿的合成 `updatedAt` 不能当持久版本，首次保存 CAS 应为 `null`。

## 最小方案

### A：先修复基础资料链，可独立交付

1. 服务端 route adapter 透传权威 onboarding、私密生日、真实持久版本和“尚无记录”事实。展示只接页面自有模型；必要的 API 输入/回读映射提至 profile 页面本地 adapter，不进一步扩大 presenter 对 feature DTO 的直接依赖。
2. 页面按“姓名 → 一级行业 → 二级行业 → 职位/公司 → 生日 → 一句话介绍 → 可选联系方式”组织。四项必填沿用 policy v1；职位/公司、联系方式和介绍不参与首次门禁。生日标明仅本人可见，不能进名片预览、公开投影或 AI 输入。
3. 改为显示“基础资料已完成／还需填写…”及服务端 missingFields。编辑时的校验可即时提示，但放行必须来自保存并回读后的服务器状态；不存在/未知版本 onboarding 时显示读取失败，不凭旧分数猜完成。
4. 仅显示一个介绍输入。建议以已有 80 字 `bio` 为新编辑入口，保留 `headline`、`relationshipGoal` 既有值；旧资料只存在 headline 时可以只读提示原内容，用户明确采用后再写 bio，禁止静默迁移或拼接。此字段归一选择由主任务审阅，不假装既有字段等价。
5. 通用档案移除开场白输入与旧行业自由文本输入，旧值不删除、不覆盖。行业仅写 ID；公司/职位保持明确独立字段。基础保存不提交活动供需/话题，不把供需镜像到 preferredIntroChannels/targetRelationshipTypes，不把 industry 镜像到 homeMarket。现有 `relationshipGoal: profile.intro`（页面第 57 行）把“开场白”映射为“关系目标”，必须在 W1 断开这一编辑语义：保留旧 relationshipGoal，本轮不将 bio/headline/intro 自动改写成目标，也不替用户推断目标；W4 只定义分析侧目标语义，不改此页面。
6. 复用既有 expectedUpdatedAt/mutationId，失败保稿；409 要求回读并让用户处理冲突，不自动覆盖。回执比对只核对本次明确提交字段，保留省略字段，不把 server 保留的隐藏数据误判成失败。成功 GET 更新本地真实版本。
7. 可选抽取不阻塞手动基础填写；首次资料路径只读取必要 profile 状态，不调用付费抽取。基础表单及其文案使用既有组件/局部样式，无全局 CSS 或语言系统调整。

### B：首次资料引导与认证回跳，须先批准入口文件

建议新增 `app/(app)/app/profile/continue/page.tsx`，作为认证后的统一服务器中转；用当前 session actor 与 profile service 读取权威状态。该路径是导航流程，不是新的认证服务。

注册自动登录、普通登录及 Google callback 均指向此中转，并携带原先规范化后的 next。未完成转至 `/app/profile?onboarding=1&next=...`；已完成直接回原路径。基础保存完成且 GET 回读核实后再继续。保存失败/读取失败留在原页面并可重试；未登录进入现有登录页。

复用 `features/auth/app-auth-routing.ts` 的既有 return-path 规范化函数，只读引用。额外排除 continue 自环、资料页嵌套 next 和认证循环；外站、协议相对路径、反斜杠一律安全回退。活动深链的 query 保留。

**边界必须明确**：统一登录回跳可关闭“首次登录不进入资料补充”，不能宣称阻止已登录用户手输所有私有页面。若产品要求应用全程强制门禁，主任务还需在所持 shell/路由边界统一消费相同状态，明确公开浏览、profile、登出/恢复等例外；W1 不自行改 layout/proxy。即使未批准全局守卫，也可独立完成 A 与登录回跳，不把它当授权/业务 API 的安全边界。

Google OAuth 的 provider/回调配置及真实账号验收是环境工作。用本地契约验证 callback 目标与状态分支，不因缺配置阻塞 A/B；不能将 stub 通过记为真实 Google 登录成功。

### C：活动资料与预设词表，拆成独立后续批次

资料页将 offering/seeking/topics 放在明确可选的“活动匹配偏好”区域或独立入口，解释其作为后续填写参考；本次活动目标留在已有 event-scoped registration 问卷，不写成通用 profile.relationshipGoal。基础完成不承诺活动可匹配，不自动复制/提交任何活动答案。

W3 继续持有 `app/(app)/app/events/[id]/register/page.tsx`、`event-registration-workspace.tsx` 与 `features/events/registration/**`。先交接基础完成状态、return path 和参考字段语义，避免 W1 改问卷或双方创建第二套活动资料。

已核查 `shared/domain`、`features/profile` 及相关 feature 字面量：权威目录是 industry v1；未发现行业→职位推荐和 offering/seeking/topics 的可复用版本化词表。事件问卷动态 options、测试 fixture、既有用户值均不能冒充固定 taxonomy。

因此 P1-10 预设标签及 P1-08 职位推荐暂不编造内容。请求主任务指定已有词表来源，或审阅独立的小型词表提案（键、语言标签、版本、别名、上限、自由输入保留方式）；共享文件由单一写入者实施。既有自定义职位/标签保留，未知旧值不能丢失，切换 UI 语言不能改变存储值。offering/seeking 继续各最多 5；topics 上限待正式政策决定。现有 string[] 的升级不得未经跨端协调就换成 ID[]。

## 批次与精确文件申请

以下是拟定写集合，须主任务冻结后才派 Luna max；新增测试名为提案，不代表已经存在。主任务已消息预留前端 `orbit-real-account-auth.tsx` 与 `orbit-profile-route-view-model.ts` 给本设计；预留不等于批准实施，仍维持“先不 coding”。

| 批次 | W1 拟写路径 | 外部申请/依赖 |
| --- | --- | --- |
| A 基础资料 | `app/(app)/app/profile/orbit-real-profile.tsx`；`profile/page.tsx`；`profile/compose-app-profile-from-previously-approved-mock-first-capabilities/profile-route-view-model.ts`、`profile-view-model-adapter.ts`；新增 `profile/profile-editor-adapter.ts`；`tests/pages/app-profile-live-route-services.test.ts`；新增 `tests/pages/app-profile-onboarding-editor.test.tsx`；`features/profile/DESIGN.md` | 申请 `app/(app)/app/orbit-profile-route-view-model.ts`：仅增加生日、onboarding、持久版本/新建状态与编辑所需页面字段。它是页面 VM，不是 shared/contract；仍须登记唯一写入者 |
| B 登录回跳 | 新增 `app/(app)/app/profile/continue/page.tsx`、`profile/profile-onboarding-navigation.ts`；对应 profile page；`tests/pages/app-account-auth-live-route-services.test.ts`；新增 `tests/pages/app-profile-onboarding-navigation.test.ts` | **明确申请前端** `app/(app)/app/account/orbit-real-account-auth.tsx` 的 success/callback 路由与过时说明；不申请 `features/account/**`、`features/auth/**` 或 `auth.ts`。全局门禁若需要由 W5 另批 |
| C 资料分区与建议 | profile 页面、adapter、测试及 DESIGN.md；A/B/C 顺序执行同文件，不能并行修改 | 主任务提供正式 taxonomy 与版本；W3 确認活动字段归属与引导入口；共享 DTO 无默认写权限 |

`profile-service-factory.ts` 如为了 A 隔离可选服务必须变更，先报告具体差异再扩白名单；不自动扩大到 service/storage。本设计不要求修改服务端 onboarding policy、共享契约或数据库。

## API 依赖与失败语义

- `GET /api/profile`：actor-scoped envelope；读 `data.profile`、`data.onboarding` 与真实 `profile.updatedAt`；空 profile 是可编辑的首次状态，错误不是空资料。
- `PUT /api/profile`：复用 ManualProfileUpdateInput 的窄字段、birthDate、expectedUpdatedAt 与 mutationId；既有服务验证后返回，再 GET 独立回读。
- 401 恢复登录且保留安全 next；读取/保存 5xx 保稿和重试；409 版本冲突不得自动重发覆盖；成功但回读不符不得标完成。
- 当前接口兼容省略字段；不能通过隐藏旧输入而发送空串清除旧资料。首建 `expectedUpdatedAt: null`，真实旧档案用实际版本。
- 不读写 onboarding cookie/localStorage 完成标志作为权威，不修改 account 创建/provisioning。

## 完成标准与验证

1. 空账号、仅四项基础完整账号、丰富但缺生日账号分别正确引导；不使用十项丰富度放行。姓名与行业 ID、生日持久保存并刷新回读；生日保持私密。
2. 保存基础资料后，既有 bio/headline/relationshipGoal/market/handles/匹配偏好中本次未编辑字段保持原值；行业变父级清空旧子级、错配不能保存。
3. 超 5 个供需标签与超 80 可见字符 bio 有明确错误；自定义旧标签保留；不无依据施加 topics=5。
4. 密码注册自动登录、自动登录失败后手动登录、普通登录、Google callback 的本地分支进入同一中转；合法活动 next 完成后返回，非法 next 和自环安全回退。真实 Google 配置单列环境验收。
5. 网络失败、401、读取异常、重复点击、保存后回读不符与 409 均有验证；表单保留草稿，没有误报已完成。
6. 既有定向政策/私密生日/保存冲突/行业/资料路由测试、新增交互与中转测试通过，再运行 Web typecheck。首轮不跑云端或模型、全仓压力测试。新增测试需真实覆盖状态与字段保全，不只检查源码字符串。
7. 本地实际产品路径至少验证一次空账号→基础资料→刷新→原目的页，以及已有资料保全；使用独占本地端口/隔离 schema，所需环境由主任务安排。仅 dev capability 测试不能算产品验收。
8. Astra 独立审 diff、失败路径与测试证据；提交前完整 detect-changes。交接给主任务基线、SHA、文件清单、已完成的子范围、实跑/未跑项与 App 影响，不自行标 P0-03 全链完成。

## 风险与待主任务决定

- 高业务影响点：登录导航遗漏分支或循环；隐藏字段被清空；生日泄漏；与 W0/W3/W5 文件冲突。这里是设计风险，不冒充尚未取得的 GitNexus HIGH 判定。
- 审阅 A/B 具体写集合，以及是否把全局强制门禁纳入 W5 批次。
- 审阅以 bio 为唯一新介绍输入且保留旧 headline/relationshipGoal 的兼容行为。
- 提供/审阅职位与供需话题词表，决定 topics 上限及版本策略；此项只阻塞推荐选项，不阻塞基础资料链。
- 本轮 API/共享 DTO 不变，App 应继续兼容；如果后续变更 taxonomy/DTO，必须由主任务安排同步与 App 验证。不能把 Web 页面修复认作原生 UI 已更新。

## 图谱与本轮验证记录

- 当前工作树起初没有索引。先执行 `query ... --repo .`，返回 repository not found；没有借用主目录旧索引背书。
- 已完成 `analyze --index-only --name orbit-web-w1-197d`，绑定当前 worktree 与基线；100.4 秒，108,337 nodes / 243,895 edges / 794 flows，未开启 embeddings/付费调用。分析器报告流程枚举与 callable candidate 上限，不能把缺失流程当作不存在。
- 已执行本地 `query 'profile onboarding industry birthDate'`：返回 profile live/mock 与 App profile 消费者定义，processes 为空；据此补查实际源码，没有以空结果放行。
- `context calculateProfileOnboarding` 明确 incoming 为 live `emptyPayload`/`payloadFor` 与 mock `success`；日期和行业验证来自既有函数。context 还含可疑测试同名解析边，不能照单全收为真实业务调用。
- `context profileRouteToOrbitProfileViewModel` 确认 `AppProfilePage`、`loadAppAdminPlatformRouteViewModel` 及资料/二级行业测试消费者。因此 A 的 VM 扩展还需覆盖 admin composition 回归；生日只进入本人编辑模型，不能因共享 adapter 扩展而进入其他公开展示。实施前按具体符号 impact 后再冻结改法。
- 上述条目记录设计阶段的图谱证据。批准后的实施、逐符号 impact、UNKNOWN 补查、真实产品验证及提交前完整 detect-changes 结果归档在 REPORT.md；不能把本设计稿的历史验证范围当作最终交付状态。
