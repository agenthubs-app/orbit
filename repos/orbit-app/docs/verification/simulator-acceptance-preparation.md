# Sprint 0046：验收工具准备

本批只交付身份检查和 fixture 准备工具，不宣称实际设备、样本或交互验收通过。原 run-01 继续；SC01/02 的实际 manifest、SC03 来源点击、SC04 完整矩阵和 SC05 真实清理仍待对应进入条件。

## 身份检查

唯一 CLI 入口：`scripts/verify-simulator-runtime-identity.mjs --config <绝对路径>`。配置只含脱敏元数据，不放 Cookie、密码、token、连接串或业务正文。使用 ROOT 指定的 cached Node 22.23.2：

```sh
ORBIT_ACCEPTANCE_NODE=/Volumes/ORICO/Dev/cache/npm/_npx/52027bd8fc0022aa/node_modules/node/bin/node
"$ORBIT_ACCEPTANCE_NODE" scripts/verify-simulator-runtime-identity.mjs --config /absolute/non-secret-runtime-config.json
```

配置包含：

- `expected`：固定 `udid`、主包 `bundleId=app.agenthubs.orbit`、`scheme=orbit`、`nativeSha256`、`metroOrigin`（主线8082）、`jsSha256`、`webOrigin`、`webArtifactSha256`、`appSourceRoot`、`webSourceRoot`、canonical `actorDigest`。hash 来自 ROOT 已核验的固定产物/源码，不从观察结果自动生成“预期”。
- 明确的 `nativePid`、`metroPid`、`webPid`；只核对这些 PID，不选另一个运行进程。
- `metroBundleUrl`：主线实际请求的 `.bundle` URL；`webArtifactUrl`：对应 Web BUILD_ID 的 `/_next/static/<BUILD_ID>/*.js` URL；`webArtifactPath`、`buildIdPath`：固定生产产物的绝对路径。
- 可选 `runtimeReceipt`：ROOT 在实际主包操作时独立观察的 `udid`、`bundleId`、`nativePid`、`observedAt`、`executableSha256`、`loadedJsOrigin`、`loadedJsSha256`、`apiOrigin`、`actorDigest`。不能复制 expected 来充观察。receipt 超过5分钟或跨重启/PID变化必须重新实际观察；禁止读取 userdefaults 或 auth Cookie 来凑证据。

读取范围仅限 simctl 设备/应用清单及主包 container、Info.plist、native executable，lsof 指定 PID 的 executable/cwd/listening 元数据，本地指定 BUILD_ID/static artifact，以及匿名 `/status`、`.bundle`、`/api/health`、指定 Web static JS。`plutil` 输出至 stdout，不写 plist。网络只允许显式本地 origin 的上述路径，不跟随重定向、不发送 credentials。单探针15秒上限、响应64MiB上限；不 boot、launch、terminate、换号、登录、读取进程环境或调用业务 API。

核验 native executable 实际字节hash/运行进程、scheme 冲突、主线 Metro served JS 字节hash及进程源码目录、Web served static 字节与固定产物hash/BUILD_ID/进程目录/live health。健康和版本号仅辅助，不能替代实际字节与 loaded-JS/actor receipt。

| 结果 | 含义 |
| --- | --- |
| `evidence-consistent` / exit0 | 工具收集与 operator 提供的证据一致；`actualAcceptancePassed=false`，**不是 SC 或功能 PASS**。receipt 的真实性仍由 ROOT 实际设备/API观察证明；Web static 对照也不独立证明所有业务 handler 版本。 |
| `blocked` / exit2 | 固定设备未 boot/不存在或缺少实际观察证据；停止对应验收，不启动其他设备。 |
| `failed` / exit1 | 错包、scheme 冲突、source/hash/actor 不符或探针前置失败；stderr 使用安全固定错误代码，不输出原始响应或参数。 |

## Fixture 准备

唯一 CLI 入口在 Web 仓库：`scripts/prepare-simulator-acceptance-fixtures.ts --plan <绝对路径>`；默认且唯一模式是 dry-run。`--apply`、`--cleanup` 和非 dry-run mode 都硬拒绝。没有数据库、migration、auth provisioner、正式 API、actor 创建或外部适配器入口。

plan 必须显式包含 `target={databaseId,workspaceId}`、精确 `allowedTargets`、`allowedActorIds`、`allowedRecordIds` 与 `records`。每条 record 是 `{collection,id,actorId,role,payload}` 的受审规格，不是已存在的真实记录；payload 只允许 JSON，文件不存真实凭证。manifest 输出精确 collection/ID/actor/role/hash，不输出 payload。重复 ID、未列目标/actor/ID、角色缺失或两消息角色同 actor 均拒绝。

角色要求：`message-a`、`message-b`、`notification-reminder`、`notification-suggestion`、`notification-update`、`saved-need`、`registration-event` 各一条。角色齐全只证明计划齐全，不证明消息绑定、来源授权、需求匹配结果或可报名资格。manifest 明确 `realSamplesVerified=false`，四项 live checks 保持 pending。

内存测试辅助函数只接受 genuine built-in Map，使用 Map 原生方法，不调用注入 get/create/delete I/O。先检查全部碰撞再创建；同计划重复执行不新增，输出 `scope=test-adapter-only` 和仅本次 `createdIds`。cleanup 只遍历原 manifest 精确创建 ID，重验 target/plan hash/完整 record hash；已变更记录保留并列 `retainedChangedIds`，缺失列 `absentIds`。不扫描前缀、不 batch delete、不清理真实数据，`realCleanupPerformed=false`。

复用调查：既有 `seed-event-operations-e2e.ts` 会载入环境、迁移、创建凭据并 reset 活动范围；`seed-account-contact-fixtures.ts` 会写 canonical contact/connection/evidence 并归档 legacy。其纯 contact 构造器固定完整旧12人集合，不提供双人消息、typed 来源、真实需求结果或可报名资格。本工具不调用这些副作用 CLI，也不包装旧集合冒充真实结果。ROOT 确认精确隔离目标/actor/记录/清理批准后，实际样本仍须通过既有正式业务边界单独准备、验证前后数量及精确 ID，并记录真实 cleanup。

## 本批验证与剩余

cached Node 22.23.2 的完整直接文件：App `--test tests/simulator-runtime-identity.test.mjs` 7/7；Web `--test --import tsx tests/services/simulator-acceptance-fixtures.test.ts` 5/5。App glob 不收 mjs，必须显式执行，不改全库测试配置。两文件先功能缺失 RED，再最小实现 GREEN；CLI 安全结构化失败另有 RED→GREEN。Web 首次顶层 await 被 CJS 转换拒绝，改 async test 后才取得功能 RED，此命令错误不算产品回归。

collector 测试读取真正临时 native/artifact 文件并对 served Response 字节求hash；simctl/lsof 是不可避免的外部读探针测试替身，不代表已经操作真实设备。Map 测试证明计划工具的回放/精确保留与清理行为，不代表正式服务、DB、授权或原生行为已通过。

本准备不改变产品身份、权限、业务写入、契约或 sync 消费者，按 RULES 的 L 运行完整直接文件/相关类型检查，不陪跑产品全量。实际权限/fixture apply 高风险接线和最终 I 检查仍未满足。0033～0036 actual runtime、0043/0045 固定版本以及新增 Web composer 依赖分别保留，不用空页或脚本测试替代全域离线/交互矩阵；provider/OAuth/Push 外部 TODO 不关闭。

通知只读追踪：typed service 已在 source unavailable/changed 时替换安全 title/reason、移除 href/excerpt/actions，App 能呈现这段说明，不能据缺额外文案判新缺陷。legacy notification 聚合直接映射历史 deepLink，App 仅校验合法路径，目标缺失仍需源码/正式 API事实追踪。本批不编辑 legacy service、来源 store 或其他被锁 consumer；必要产品切片先交 ROOT 核与0033/Phone锁。
