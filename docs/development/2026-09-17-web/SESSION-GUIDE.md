# Web 并行开发与主代理协作规则

日期：2026-09-17。用户指定主任务：`01a0ae27-0068-7613-9f87-82aa91a836bd`（待办事项主agent）。[状态与任务清单](README.md)是本轮协调入口。

用户已授权进入实施，主代理已批准首批W1–W4编码；最新基线161e9e6c、追加文件权限及资源分配见[执行台账](EXECUTION.md)。以下“初次设计”等内容为阶段规则，不撤销已批准批次。

## 模型与职责

- 主代理负责需求分解、总体设计、任务分配、文件所有权、依赖顺序、进度、集成与最终 review。
- 每个领域任务使用 `gpt-6-astra` / `high`，负责设计、任务拆解、检查编码结果和提交交接。
- 领域任务内部使用 `gpt-5.6-luna` / `max` 子代理编码。必须显式指定模型和 reasoning effort；不可只把名字写在 prompt 中而实际使用默认模型。
- Luna 只领取有验收标准和明确文件范围的编码单元。Astra 检查 diff、测试与需求符合性；不能只转述 Luna 的“完成”。
- 用户已授权本主代理组织这些任务及内部并行。创建更多长期任务须有实际必要，先复用现有领域任务。

## 基线与隔离

- 原目录 `/Users/li/work/orbit` 当前审计起点为 `e64357214a3bad99029a629558b7099d23819e5f`；其中用户未提交的 `AGENTS.md`、`CLAUDE.md` 保留。
- 更新的已提交集成基线是 `29efb4c9d460b97ef526578d051e824592f52555`，位于 `/Users/li/work/orbit-production-cutover`，本地 `origin/chat-agent` 也指向该提交。该树已有大量新功能，不能仅凭旧目录缺少代码判定待开发。
- 新任务在各自 Codex worktree 工作。先记录实际 HEAD；在干净工作树上可 fast-forward 到上述已验证存在的提交。若不能 fast-forward，先报告祖先关系与差异，由主代理选定集成方式，禁止 reset/强推/丢弃他人历史。
- 比较基线时使用提交内容；另一个工作树中正在编辑的文件不能算已解决，也不能复制覆盖。
- 新任务不得在 `/Users/li/work/orbit` 或 `/Users/li/work/orbit-production-cutover` 直接编码。用户未提交文件只读。
- 读代码先用 GitNexus query/context；修改函数前 impact，报告调用方、流程和风险。HIGH/CRITICAL 修改前明确提醒；UNKNOWN 要进一步核对。索引必须绑定实际仓库与版本，不能用旧索引为新代码背书。
- 提交前 detect-changes，partial/truncated 不能当通过。没有修改代码符号的纯协调 Markdown 不虚构符号影响分析。

## 开发阶段与交接

1. **设计中**：Astra 提交现状、最小差异、文件集合、接口影响、验收标准和未决问题。先复用已有设计与实现。
2. **设计审阅**：主代理检查与别的领域是否冲突，并明确批准本批次范围。已批准设计内的具体修复由主代理调度；新的产品取舍须提交用户审阅。无需对相同对象和版本反复询问。
3. **开发中**：Astra 派 Luna max 编码，先做能复现问题的针对性验证。不得让多个 Luna 同写同一个文件。
4. **领域 review**：Astra 检查实现、失败路径、权限、跨端兼容及测试，退回问题给原 Luna 修复。
5. **待集成**：回报基线、提交 SHA、文件清单、完成的需求 ID、实跑命令及结果、未跑项、另一端影响和回滚范围。
6. **主代理 review / 集成**：在独立集成树逐项合入；同一时间只有主代理做集成，先共享契约/服务，再消费者。检查文本冲突也检查业务语义冲突。
7. **已解决**：在清单中记录精确完成范围及证据。代码完成、测试通过、已部署、真实运行验收是不同事实；不得互相替代。

初次开设的领域任务先交付设计包，由主代理审阅后派发具体编码批次。规划节点的返回用于主代理调度，不能自动把需求标为完成。一个外部条件仅阻塞依赖它的验收，独立源码调查、设计和本地验证继续。

## 文件所有权与冲突处理

以下是责任域，不是无限目录写权限。每批编码前应进一步冻结具体文件清单。

| 领域 | 主要责任范围（均相对 Web `repos/orbits`） | 不得自行占用 |
| --- | --- | --- |
| W1 账号与资料 | `app/(app)/app/profile/**`、资料相关入口、`features/profile/**`、对应测试 | 认证身份/账号 provisioning 由现有数据任务占用；共享 taxonomy/DTO 申请主代理协调 |
| W2 人脉与名片 | `app/(app)/app/contacts/**`（排除`analysis/**`）、`features/acquisition/**`、人脉页面与对应测试 | 联系人 SQL 读取/分页与生命周期 writer、共享 chat policy 先协调；analysis属于W4 |
| W3 活动 | 活动产品页、报名页、`features/events/**` 对应展示/报名逻辑与测试 | 全局 profile、全局导航、云 worker/部署配置、跨端共享 DTO |
| W4 AI 与分析 | `agent/orbit-real-agent.tsx`、对象上下文href、`contacts/analysis/**`及对应测试；AI服务只领取明确批准的差异 | 本批排除tasks/notes/schedule v3、首页dashboard、底层读取、通知数据库并发、全局shell；联系人/活动DTO由各域提供 |
| W0 既有数据工作 | `shared/storage/**`、bootstrap/dashboard读取、`features/account/**`、认证 actor/provisioning、测试库/部署与读取成本 | 新任务不得与该域并发写同文件 |
| W5 主代理统筹 | 全局首页/导航/样式、跨域契约、最终集成、根目录协调文档/Bridge台账 | 未获具体批准前不自行批量修改产品布局 |

共享热点包括 `app/(app)/app/layout*`、根/共享 CSS、`shared/contract/**`、`shared/api-schema/**`、`shared/domain/**`、`shared/storage/**`、bootstrap/dashboard聚合、package/lockfile、DB migrations、Vercel配置与环境变量。任何领域需要它们，先交接具体变更和消费者，由主代理登记单一写入者及先后顺序。

W4首轮另发现全局待发送草稿的actor归属和旧href自动执行约定：`orbit-global-ask/orbit-ask-draft.ts`与`orbit-product-href.ts`由W5协调。`agent/page.tsx`只申请既有actor标识传递及组件实例隔离，待批准具体文件范围后再写入；不因此取得认证、账号或首页读取的编辑权限。

跨端契约必须按仓库同步规则更新与验证 App 消费者；App-only 导航、原生相机、widget 和推送验收不塞进 Web 编码任务。确需 App 改动由主代理另行协调。

## 已存在任务与资源边界

- `01a0a537-494f-75f2-8e61-9b7c4a5bba64`：整理数据上线，已有数据/部署交付与证据。
- `01a0ae46-0ccf-7d83-aff0-7128dbec26a5`：负责人已回复，其用户已授权修复四类读写问题，并将独立 staging 接正式域名作为 Production、保留旧 Neon 数据。起始基线为`29efb4c9`；最新部署进度见下方回执。该任务独占 contacts/bootstrap/dashboard 读取、storage 并发、账号创建、运行时维护、Neon/Vercel 配置及其 Bridge 交接。其他任务不重做这些工作，也不把过去“正式域名保持不动”的记录当成新的整体产品决定；发布事实以该负责人新回执为准。
- 审计时 production-cutover 出现未提交的 `app/api/_shared/authenticated-actor.ts`、`features/account/live-service.ts`、`features/account/storage/account-live-record-provider.ts`、`features/auth/storage/auth-account-provisioning-provider.ts`、`shared/storage/live-record-store.ts`、`shared/storage/postgres-live-record-store.ts`。后续用实时 git status 和负责人回复更新，不能以本快照认领这些文件。
- W0最新负责人回执：`732a017f`已推送，新Production部署`dpl_7SnhZuB3xhmuffFB9eCt2eKcfBsr`为READY（sin1），正式域名已归属新项目`prj_PFJXRat2a7ADxz6tWVLQU7rNTaIt`且verified，旧项目已暂停。正式域名登录回读仍在验证，不能标生产验收全部完成。各领域基线仍为29efb4c9，不自行覆盖、恢复或发布旧orbit，也不认领W0文件；部署只可使用新项目和新workspace并校验生产目标pin。主代理后续核对提交和接口变化；全量分页/SQL聚合仍由W0继续。
- 多任务不同时占用同一个开发端口、浏览器 QA 账号、数据库 schema、构建目录或云测试活动。领域本地运行用各自端口与专属 PostgreSQL schema；共享云验收由主代理串行安排。
- W0最新回执更新：`02ec26f0`已完成production部署（`dpl_5YSXNR4mGzsb1xWuZt6FfY4jUimV`，sin1），www正式域名刷新回读30位/30条联系人正确，旧项目仍暂停。新项目`gitLinked=false`，push不会自动发布，部署须显式指定`prj_PFJXRat2a7ADxz6tWVLQU7rNTaIt`；未来仍须逐次区分分支HEAD与已验证部署版本。Web/API契约及App base URL未变，但App重新登录和原生实机验收独立登记。Future Preview已移除数据库URL绑定，历史immutable previews仍非隔离测试环境，不得用于领域隔离测试。剩余全量搜索/分页/facets、dashboard聚合、CAS采用、idle/due-only唤醒继续保留，领域CAS接入须先协调W0接口与文件所有权。
- 批量测试在本地执行。遵守 `repos/orbits/docs/operations/free-staging-budget.md`；不加载 Production 配置，不复制模型/邮件密钥，不新建云资源或发布。需要云验收时明确版本、账号、操作量和已有授权预算。
- 任务报告写入各自工作树的 `repos/orbits/docs/development/web-2026-09-17/Wn/`。领域代理不直接写根目录总表或 Bridge；主代理收敛交接。
- 进度以实际工具返回与交接更新，任务未在运行时不声称正在编码。实施轮已建立主任务10分钟heartbeat“Web开发主代理调度”（ID `web`）；每次先读取各领域真实状态和文件变更，只执行已批准工作。用户暂停或授权范围完成后暂停检查。
