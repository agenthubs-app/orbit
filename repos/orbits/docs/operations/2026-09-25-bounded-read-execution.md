# 核心读取治理执行账本

2026-09-25；用户已授权修订计划并执行。基线 `26b3d5fc`。下文保留本地批次完成时的事实；随后用户明确授权本批生产发布，已按文末增量独立上线。任务停启、付费及额外生产数据修复不在此次授权内。

## 工作清单

- [x] 根据复审修订设计：增加 A′，补 legacy、双开关、容量模型与条件式 D。
- [x] A：读取可用生产元数据/用量，不读取业务全量；控制台存在延迟，未据此推算日消耗。
- [x] A：固定夹具定位联系人 1548→2064 行预算变化，保留可复现脚本。
- [x] A：实现离线容量模型与增长成本回归。
- [x] A′：权限正确的 SQL 消息未读接口、运行时 schema、App 角标接线及旧部署兼容。
- [x] A′：legacy 通知和跟进的 SQL scope 下推，保留合法关联与业务语义。
- [x] A′/B 子集：legacy 独立未读 SQL；typed 页面与全局未读候选分离，不读取回执或已处理历史。
- [ ] B/C 其余：生产排名出来后决定会话摘要页、联系人/任务/笔记与本人跟进历史的分页次序。
- [ ] D/E：按来源验证增量/到期覆盖，采取必要最小实现，不无条件新增所有结构。
- [x] 验证：隔离本地 PostgreSQL、权限/并发/增长/跨端测试、类型检查；图检查结果及局限见下。
- [x] 交接：记录真实验证范围、生产发布依赖；仅本批已验证相关改动纳入提交，用户原有修改保留。

## 边界

测试不加载云连接或生产凭据。已有用户修改不纳入提交。图谱缺失/UNKNOWN 不代表安全，关键源码手工核对。旧 API 不静默截断或删除字段。计数不跳过权限，提醒时效不因节流暗改。

## 证据

## 本批已实现

1. `GET /api/relationship-communication/unread-summary`：服务端身份；同一 SQL 验证两人会话、当前 binding、qualification 与读指针，返回一行计数。不读取消息正文。旧列表契约未改变。
2. `GET /api/notifications/unread-summary`：legacy 有效通知及 delivered/failed 提醒计划、read/ignored 交互在 SQL 聚合。保留来源不可用占位、重复 ID 的旧角标语义；不读联系人图/证据/标题正文。非法身份失败关闭，超过 500 条不再撞旧交互批量上限。
3. App 角标接入以上两个接口；能力按 actor/session/baseURL/focus scope 隔离；仅 404/405 回退旧接口，403/503/坏数据不触发额外重读。保留前台、失焦、Abort、换号、即时失效及 99 上限。typed 只请求 `limit=1`，全局未读不随页大小变化。
4. 跟进/legacy 图的 configured provider 使用单个 SQL 快照选择 owner 和合法显式关联，不再返回整个 workspace。拒绝存储 owner 与 payload owner 冲突的行；保持联系人 domain ID 与 storage ID 两种既有引用规则。SQL 入口保留已有进程预算检查，两个新摘要 API 同样受该检查保护；没有新增跨实例计费系统。
5. typed 列表新增 PostgreSQL read window：页面从游标位置取必要候选，凑够 page+1 停止；计数单独读取 active/unread 的 source metadata，仍校验实时来源状态。历史完整性检查在 SQL 进行，只返回坏记录 ID；操作回执不出库。原内存 adapter 保留作对照。
6. 指标增加 SQL 文本哈希（不输出 SQL/参数/业务数据），DML 返回行也计量；无返回行的成功 DML 不记作读。旧指标可聚合到 unattributed，不能误称完整按 route/job 的账本。
7. 本地复现、隔离回归入口、日志离线聚合和容量计算都收进 `scripts/diagnostics/`，不依赖 `/tmp`。

## 可复现实测（不是 Neon 账单）

| 场景 | 改前 | 改后 | 实测结论 |
| --- | --- | --- | --- |
| 消息角标，额外 1,000 条无关 10 KB 消息 | 旧服务需读完整会话消息 | 1 SQL / 1 行 / <100 字节 | 无正文出库；外部消息增长不放大返回量 |
| legacy 角标，额外 1,000 条无关 10 KB 通知 | 旧接口读图、提醒和交互 | 1 SQL / 1 行 / <100 字节 | 与旧有效候选及交互计数对照一致 |
| typed 页大小 2，12 条混合通知 + 1,000 条已处理历史，每条回执 10 KB | 21 SQL / 1,012 行 / 12,665,375 字节 | 4 SQL / 11 行 / 12,072 字节 | 本合成场景返回量下降约 99.90%；添加历史前后新成本相同 |
| 跟进：增加其他 actor 的 4,000 条 2 KB 记录 | 18,047,414 字节 | 7,740,270 字节 | 当前 actor 图结果不变；自身基准本来全部合法，改造前后自身字节相同 |
| legacy 图：增加其他 actor 的 5,000 条 2 KB 记录 | 20,639,200 字节 | 7,740,270 字节 | 不再跨用户放大；不是已完成本人历史分页 |
| 联系人固定夹具 | 1,548 行 | 2,064 行 | 516 窄 ID 行 / 35,340 字节来自证据 storage ID 正确性，不是正文退化 |

typed 测试的 sourceAccess 是受控权限适配，表中数字**不包含真实八类来源校验及 GET refresh 成本**。两个角标 <100 字节只计 reader 返回行，不包含认证和其他 API。消息 SQL COUNT、typed integrity SQL 仍可能随数据增长增加数据库计算；低返回量不等于 O(1) CPU。不能把上述百分比当作项目总节省比例。

## 生产事实与尚缺证据

- 只读核实 deployment `dpl_3UBsvmTRUMtYkFwujuhNmUw4ebpZ`，production READY，提交 `02ec26f0b8655011f900338eacc63881d378a76b`。项目历史名称带 staging，但这是现行 production，不能当测试环境。
- 当前项目环境变量清单存在 production `ORBIT_PG_READ_METRICS`；未读取敏感值，未证明部署快照实际开关。项目环境清单不等于旧部署快照，未据其缺少 typed/heartbeat 键推断线上状态。
- Neon 新 production 项目 `curly-block-17385488`，控制台项目列表约 35.36 MB 存储，但详情 Usage 同时显示 0；页面说明用量有延迟/休眠时可能不更新。组织当月网络 7.95 GB 包含其他项目，不能当新项目速率。未执行 Neon SQL、全量导出、迁移或删除。
- 还没有新旧部署的同窗口流量、真实 DAU/前台驻留时长、sourceAccess/refresh 热点排名。因此 D 的是否需要、按哪个来源先做仍未到决策门。

## 容量验收与使用方法

在 Web 工作目录执行：

```sh
ORBIT_LIFECYCLE_TEST_DATABASE_URL=postgresql://li@localhost/orbit_neon_audit_20260925 node --import tsx scripts/diagnostics/run-bounded-read-tests.ts
ORBIT_LIFECYCLE_TEST_DATABASE_URL=postgresql://li@localhost/orbit_neon_audit_20260925 node --import tsx scripts/diagnostics/neon-egress-local-probe.ts
node --import tsx scripts/diagnostics/egress-capacity-model.ts --input=/absolute/path/capacity.json
node --import tsx scripts/diagnostics/aggregate-postgres-metrics.ts < /absolute/path/metrics.ndjson
```

测试入口拒绝云主机和非 test/audit 数据库名；子进程只继承 PATH 和指定本地连接，不加载 `.env`。真实回归使用临时 schema，用毕清理。成本是 JSON 解码行字节估计，不是 Postgres wire/Neon 计费；所有调用方和真实项目增量仍需校准。日志聚合输入是显式限定时间窗、逐行 metric JSON 的导出，不是无期限 tail，也不需要购买 Log Drain。

`egress-capacity.example.json` 所有流量/时长/日活数都是**演示假设**。每轮 10 KB、每天前台 1 小时、15 秒轮询、每人 5 次 50 KB 操作，月 30 天、后台与一次性共 130 MB 时：10/100/1,000 DAU 对应约 0.925/8.08/79.63 GB。以 5 GB、30% 余量规划，100 DAU 场景会失败。这说明成熟实现也要按使用量做容量规划，而不是承诺免费额度支持任意用户数；实际输入必须替换为完整链路实测。

## 没有为了省流量而做的危险改动

- 未给所有 GET refresh 加 N 分钟 TTL。自动约谈提醒只在 `fireAt <= now < startsAt` 时间窗口生成，单纯 TTL 有漏提醒风险；安全替代仍需该来源到期入口/变更入口覆盖证明。多实例 lease 只能解决并发互斥，不能凭空解决时间变化。
- 未删除 GET 物化，也未无条件建设八类 outbox、全部投影表或跨实例预算系统。D 按发布后测量与来源矩阵逐个决策。
- 未关闭维护链。现有 canonical wake 已有到期领取/租约/恢复，本批不重写；typed 默认开关、后台 cutover、未来唤醒时效仍是发布核验项。
- 未一口气上线 HEAD 中数百提交。旧 App/旧服务器兼容存在，但与生产提交的独立发布差异和数据库迁移必须单独核查。

## 验证与发布交接

最终定向回归：Web 57/57（54 项隔离/成本/预算入口测试 + 3 项 PostgreSQL 持久化、并发和提醒优先级测试）；App 37/37（含真实浏览器渲染的 hook 生命周期）；两端完整 TypeScript 检查通过，契约/Schema 副本逐字同步检查通过，`git diff --check` 通过。不是全仓库所有测试或原生 iOS 真机验收，也未做云压力测试。

真实集成测试使用现有标准 record/appointment schema。另加可选 sync-trigger migration 时，两个旧测试的直接夹具写入违反 `SYNC_WRITE_LOCK_REQUIRED`；未关闭触发器或修改生产写入来隐藏问题。此批回归入口不安装该独立迁移，不以这批测试证明 sync-trigger 发布就绪；它仍需专属迁移/写入覆盖验证。

GitNexus 绑定 `/Users/li/work/orbit`，先前逐符号 impact 的 followup factory/SQL scope reader 为 CRITICAL、typed inbox service/repository 为 HIGH，已提前提示并运行关联回归。重建索引并执行 `detect-changes --scope all --limit 2000 --repo orbit` 及 staged 检查：47 个全部改动文件（包括未纳入提交的用户 Bridge 修改），提交范围 46 个文件；检测没有 partial/truncated 警告。一次全文搜索索引修复失败后，已 force 重建成功。索引器本身仍有动态漏边/流程数量上限，不能把识别出的流程当成完整调用面，或用 detect 汇总 MEDIUM 撤销先前 HIGH/CRITICAL。关键路径另以源码和回归核对。

Web/App 同步契约由 `npm run sync:contract` 生成，未手改副本。根 Bridge 有用户未提交改动，因此本次交接记录在这里，不覆盖根台账。测试中两个被中断的临时 schema 已明确清理，仅含可重建合成数据；未删除业务数据。

下一步依赖明确区分：

1. **可发布候选的本地代码**：本批实现和定向回归，不等于生产已生效；发布前需审查独立批次及与 `02ec26f0` 的依赖。
2. **需要生产发布/配置授权**：明确部署范围、目标项目、typed rollout 与维护用户影响后再实施。没有授权，不修改线上开关、任务链或数据。
3. **需要发布后实际数据**：采集 1～3 天完整链路日志并对照 Neon 同窗口增量，再决定 B/C 的余下优先级及 D。当前不能拿合成数字替代此决策。
4. **未完成的长期项**：会话摘要/消息历史分页、本人全部跟进/联系人/任务/笔记分页、typed 全来源增量与到期覆盖。它们没有被标成已完成，也不能因第一批测试通过宣称全产品已规模化。

只读发布差异检查已发现具体依赖：生产 typed service 尚无 HEAD 的 integrity failure/默认隐藏失效来源语义；旧 legacy provider 尚未过滤 archived；configured store 的进程预算、pool profile 与 timeout 接线也有差异。因此不能宣称本提交直接 cherry-pick 到 `02ec26f0` 就通过生产验证。先在隔离发布分支明确带入哪些既有语义，再做该版本回归及小流量验收；这与一口气发布全部 HEAD 是两个不同方案。

## 后续授权与独立上线（2026-09-25）

用户在得知“只发布这批优化，不带其他数百提交”的范围后回复“允许”。从生产 `02ec26f0` 新建隔离分支 `codex/neon-bounded-read-release-20260925`，移植并验证后端批次 `46e438ea57a29dca5e53396315b7ee26cda7e9a9`；没有发布主线全部 HEAD。

本次保留生产 typed 白名单、失效来源占位及 legacy 归档记录行为，不带入新的 integrity/隐藏规则或 sync/budget 子系统。schema、依赖、维护/cron/队列配置及环境变量未修改。发布版 Web 47/47、生成契约 4/4、完整 typecheck 和生产 build 通过；不是直接复用上文主线 57/37 的测试结论。

Vercel `prj_PFJXRat2a7ADxz6tWVLQU7rNTaIt` 的新 production 部署 `dpl_C7whpxNmJk7qaqcKTtGr2xgAPwAo` 已 READY，先 skip-domain 后 promote；平台回读确认 `www.orbitailink.com` 与 `orbitailink.com` 均指向新部署。正式地址为 https://www.orbitailink.com 。原部署 `dpl_3UBsvmTRUMtYkFwujuhNmUw4ebpZ` 保留回退。

发布技能不允许主动 fetch 部署 URL，本轮只确认云端构建和域名绑定，不冒称真实登录/读写/推送已验。旧部署最近一小时的有限日志搜索未返回读取计量样本；仍没有足够同窗口数据证明月流量节省比例。

本批 Vercel 发布不更新原生 App 安装包，消息/legacy 摘要接口要等新版 App 实际消费；服务端 scoped graph 和 typed 分页已进入正式代码。不能宣称手机角标全量读取已在所有用户设备消失，也不能把第一批上线当成全产品规模化治理完成。

详细回执在隔离发布分支 `repos/orbits/docs/operations/2026-09-25-bounded-read-production-release.md`。根 Bridge 原有修改及用户其他文件保持不变。
