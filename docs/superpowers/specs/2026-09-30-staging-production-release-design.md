# Orbit Staging / Production 发布设计

日期：2026-09-30（Asia/Tokyo）
状态：用户已批准目标与自主推进；本文记录执行设计和当前可验证边界。

## 2026-10-01 发布目标更正

2026-09-17 的生产切换记录表明，原名 `orbit-staging-20260917` 的 Vercel 项目
`prj_PFJXRat2a7ADxz6tWVLQU7rNTaIt` 已承载 `www.orbitailink.com` 和
`orbitailink.com`；原测试 Neon 项目 `orange-forest-30108072` 也已成为该正式
环境的数据源。下文 2026-09-30 盘点中将这两个资源称为可复用 staging 目标的
表述已经失效，不得据此进行 Preview 部署、迁移、seed 或 App 联调。

当前远程 `staging` (`54528fbe9`) 与 `production` (`02ec26f0b`) 分支已推送，
但分支存在不代表有隔离的云端测试环境。用户已批准建立新的独立免费测试资源。
2026-10-01 已在 Hobby 账号 `orbitsdev2026-7133` 创建空的 Vercel 项目
`orbit-staging` / `prj_35zD2mkGoJVLKACR3dbr2xow2tpG`，设置 Root Directory
为 `repos/orbits`、Framework 为 Next.js；只读回查确认 Git 未关联、环境变量为零、
部署为零。之后将隔离 staging worktree 的本地 Vercel 链接钉在此项目，并只在
Preview 环境设置了新的 Sensitive `AUTH_SECRET`；数据库连接及工作区变量仍为空。
Neon 浏览器授权首次尝试 60 秒超时，独立测试库尚未创建或核实。旧
`setup-minimal-staging.ts` 的目标校验仍锁定已转为正式环境的 Neon 主机，
**不得**在新库或正式库运行该脚本；拿到新项目 ID 后须先修正保护并验证。
部署、数据库写入和 TestFlight 归档仍暂停。生产环境不变。

## 2026-10-03 执行更新

- Neon CLI 与项目级 MCP 已分别完成授权；项目根目录新增 8 个 Neon agent skills。
  新 Free 组织 `org-green-dawn-28409611` 下的独立项目 `shy-thunder-17190072`
  位于新加坡、Postgres 18；默认分支名虽为 `production`，但项目 ID 与正式库
  `orange-forest-30108072` 不同。新库 `public` 表数为 0。
- 独立 Vercel 项目 `prj_35zD2mkGoJVLKACR3dbr2xow2tpG` 的 Preview 现有
  `AUTH_SECRET`、新库 Sensitive 连接串、`ORBIT_WORKSPACE_ID` 及数据库主机/
  workspace 目标校验变量。没有复制正式密钥。项目仍未关联 Git；为解决 CLI
  对嵌套 Next.js 产物的路径错误，Root Directory 从 `repos/orbits` 调为项目根。
- 从固定 `staging@54528fbe9` 仅导出 `repos/orbits` 到临时部署目录，使用
  `vercel.staging.json`（无 cron）构建的 Preview
  `dpl_Hjuu8x9RWf87Lpn3zakh89mLguE9` 已 `READY`。受保护的
  `/api/health` 经 Vercel CLI 授权访问返回 200；此探针不查询数据库，也不证明
  登录可用。此前一个被平台归类为 Production 的首次部署和一个 Preview 均构建/
  产物部署失败，只有上述 Preview 可用；正式 Vercel 项目未改动。
- 新库上用单连接事务试跑核心迁移，事务内生成 52 张表，回滚后独立复查仍为
  0 张表。隔离 staging 工作树中已将旧初始化脚本的允许主机和 workspace
  改为新项目目标；相关 5 个测试与 Web 类型检查通过。此代码改动尚未提交，
  上述云端 Preview 仍是原固定提交，不包含这次初始化脚本修改。
- 正式建表与合成测试数据写入、调整独立 Preview 的访问保护正等待分别确认。
  当前 Preview 仍受 Vercel Authentication 保护，iPhone App 尚不能访问；
  TestFlight archive/upload 和真实业务验收均未开始。

### 2026-10-03 13:45 JST 验证增量

用户已同意对新测试库正式建表并写入最小合成数据，以及关闭独立测试项目的访问保护。
`shy-thunder-17190072` 的目标与空库复核后，初始化 dry-run 为 28 条记录、
2 个活动、42,760 字节；正式事务提交成功。独立 SQL 回读为 70 张 `public`
表、28 条通用记录、2 个活动。4 个合成账号共用的随机测试密码只保存在本机
Keychain 条目 `orbit-staging-test-accounts-20261003`，临时数据库连接配置已删除。

仅 `orbit-staging` (`prj_35zD2mkGoJVLKACR3dbr2xow2tpG`) 的 Vercel
Authentication 已关闭；项目配置回读 `ssoProtection: null`。公开 Preview 的
`/api/health` 返回 200，主办方凭据登录取得有效会话；`/api/contacts?limit=10`
匿名请求为 401，主办方返回 2 条、参与者 A 返回 1 条合成联系人，均为 200。
这只证明上述路径及账号隔离的一个样本，不代表 App 全业务验收。

以 staging API origin 和 `1.0.0 (1)` 预检 Expo 配置通过，但首次 iOS archive
在签名预检阶段失败：`xcodebuild` 报告找不到指定的 `K7QA7XYU46` 团队账号
及 `app.agenthubs.orbit` 描述文件。没有生成 archive 或上传 TestFlight；
这个 ID 是从证书显示名称中错误提取的，并非已验证的 Team ID。构建产物目录
位于外接盘，未切换正式 API、正式 Vercel 项目或正式数据库。
随后尝试不签名的 iPhone Release 编译，依赖编译尚未完成时系统盘余量由
约 6.3 GiB 降至约 5.5 GiB；按 5 GiB 硬停止线提前中断。Xcode 进程已退出，
外接盘的 DerivedData 保留供后续增量构建；本次不能作为设备编译通过证据。

### 2026-10-03 15:36 JST 签名诊断更正

用户提供的 Xcode Accounts 截图显示同一 Apple 账号已登录，并显示两个团队
（Lei Zhou：App Manager；XIN ZHAO：Admin）。此前只读的 Xcode 偏好键仅列出
一个历史 Personal Team，不是当前 GUI 团队清单；据此断言账号未登录是错误的。
进一步读取证书 subject 发现，显示名称括号中的 `K7QA7XYU46` **不是**
Team ID；真实 OU/Team ID 是 `J24SD8G86T`，对应偏好设置中的 Personal Team。
项目未设置 `DEVELOPMENT_TEAM`，上次命令行误将证书名称后缀作为 Team ID，
因此“找不到该团队”不能用于判断开发者账号未登录。两个当前 GUI 团队的 ID
尚未核实，不能推断哪个拥有 App 或需要新付费会员。系统盘余量约 5.3 GiB，接近 5 GiB 停止线；
确认正确团队 ID 并恢复构建空间前不重试完整归档。

### 2026-10-03 16:02 JST TestFlight 上传增量

用户从 Apple Developer Membership details 确认 XIN ZHAO 团队 ID 为
`J24SD8G86T`。系统盘可用空间一度回升至约 7.4 GiB，未移动旧缓存；
以固定 staging API origin、外接盘 DerivedData/Archive、自动签名和正确 Team ID
执行 iOS Release archive，`xcodebuild` 退出码 0。归档中的 Bundle ID 为
`app.agenthubs.orbit`、版本 `1.0.0 (1)`，`codesign --verify --deep --strict`
通过，签名与 embedded provisioning profile 的 Team ID 均为 `J24SD8G86T`；
`EXConstants.bundle/app.config` 和 `main.jsbundle` 均含独立 staging API host。

使用 `app-store-connect` / `destination=upload` 自动分发签名上传；
`xcodebuild -exportArchive` 退出码 0，日志显示 `Upload succeeded`、
`Uploaded Orbit`、`Uploaded package is processing`。这确认 Apple 收到包，
**不确认 TestFlight 处理完成、可安装或外部测试审核通过**。导出阶段出现
`hermesvm.framework` 缺少匹配 dSYM 的 `Upload Symbols Failed` 警告；主包上传
成功，但 Hermes 崩溃符号化可能受限。归档位于外接盘
`testflight-artifacts/2026-10-03/Archives/Orbit-Staging.xcarchive`；上传型导出
没有留下本地 IPA。系统盘最低观测约 5.1 GiB，未触及 5 GiB 硬停止线。
下一步核对 App Store Connect 的处理状态与合规提示，再添加内部测试者；
外部朋友需按 Apple 的 TestFlight 审核流程邀请，不触发 App Store 正式发布。

## 目标

建立可复现的 `staging` 与 `production` 发布分支，先将最新已整合的 App 与 Web/API 代码部署到隔离 staging 环境，验证 staging App 在真实 iPhone 上可用；发现问题时只在 staging 修复并重复构建/验收。通过后，将同一代码版本晋级到 production，并以 production API 配置重新构建 App。

本方案不创建新付费资源、不升级套餐、不迁移或重置 production 数据。原生 App 通过 TestFlight 安装；Web/API 的 staging 目标须独立于现有正式 Vercel 项目，并经用户确认后才能建立；staging 与 production 使用各自的 API、数据库和密钥。

## 当前盘点（2026-09-30）

| 范围 | 可验证状态 | 发布影响 |
|---|---|---|
| 共同发布仓库 | 外层 `/Users/xzhao/Projects/orbit` 是同时包含 `repos/orbit-app` 与 `repos/orbits` 的单一 Git 仓库；发布源基线为 `1d9aab2fc`。旧 `repos/orbits` Git 索引是陈旧副本，不是发布源 | App 与 Web/API 必须从同一外层提交构建；每个候选固定一个共同 SHA |
| 开发状态 | Sprint 0137/0138 的未合并工作不自动进入候选；本次 staging 候选只基于当时最新已整合提交，加本轮明确记录的 3 文件修复 | 后续 WIP 不自动并入；候选变化需重建并重跑相应验收 |
| Staging 分支与候选 | 本地及远程 `staging` 均为 `54528fbe9`（`fix(release): prepare staging app candidate`），父提交 `1d9aab2fc`；候选在隔离 worktree `/Volumes/ORICO/Dev/MacMovedData/dot-codex/worktrees/testflight-staging/orbit` | 当前候选可复现本地构建；需先确认独立的 staging 云端目标 |
| Production 分支 | 本地 `production` 暂定基线为 `02ec26f0b`，与 `staging` 分离；Vercel 实际线上 SHA 尚未核实，Production 分支尚未晋级或部署 | 登录 Vercel 后先读取线上 deployment SHA；若与基线不同，停止晋级并先对齐真实线上状态 |
| Staging Web/API | 旧 Preview 已返回 HTTP 410；原 `orbit-staging-20260917` 项目 ID `prj_PFJXRat2a7ADxz6tWVLQU7rNTaIt` 后来接管正式域名，不能复用作 staging。新 Hobby 账号已创建独立空项目 `orbit-staging` / `prj_35zD2mkGoJVLKACR3dbr2xow2tpG`；无 Git 关联、无部署，只有 Preview Sensitive `AUTH_SECRET` | 需先配置独立数据库、工作区和站点地址，再显式部署固定 staging SHA；绝不将正式项目作为 staging 目标 |
| Staging 数据库 | 原测试 Neon 项目 `orange-forest-30108072` 已成为正式环境数据源；Neon 新项目尚未建立，本机浏览器授权首次尝试超时。旧初始化脚本仍将该正式数据库主机写死在目标校验中 | 建立独立免费测试库后先修正并验证目标保护；不复制或修改 Production 数据，不运行旧脚本或批量 seed |
| Production 在线状态 | `https://orbitailink.com/api/health` 与 `https://www.orbitailink.com/api/health` 只读返回 HTTP 200；这不证明部署 SHA，也未执行任何业务写入 | Production 域名与数据库未改动；先核实线上 SHA、项目和变量绑定，staging 通过后才晋级 |
| iOS 配置与本地验收 | Bundle ID 为 `app.agenthubs.orbit`；Expo 已改为 `1.0.0` / iOS build `1`，匹配 App Store Connect 1.0 记录。Debug/Release 模拟器构建成功，并在独立 iPhone 17e 模拟器启动到登录页。构建时 staging API 未配置，故不是 staging 业务验收；未生成或上传 TestFlight archive。2026-10-01 本机证书查询仅见 Apple Development，未见 Distribution 身份；`Orbit` workspace/scheme 可被 Xcode 识别 | staging API 恢复后，以 `EXPO_PUBLIC_ORBIT_API_BASE_URL` 指向 staging origin 重新归档；Xcode 账号、Distribution 自动签名/上传权限仍需核实 |
| 代码验证 | App 全量测试 3917/3917、离线读取审计 23/23、App typecheck 通过；Web typecheck 与 Next 生产构建通过。修复了审计器中过期的动态调用行号映射 | 这些是本地代码/构建证据，不替代 staging 登录、API、跨账号数据隔离或 TestFlight 真机验证 |
| 资源 | 最近检查系统盘约 26 GB、外接盘约 693 GB 可用；项目规程要求低于 5 GB 停止重型构建 | DerivedData 已放外接盘；继续监测空间，不删除用户文件/缓存 |
| 费用 | 用户要求不新增付费资源 | 仅使用现有账号/套餐；若现有套餐不能支持本次测试，暂停并给出所需用户操作，不自动升级或购买 |

## 分支与晋级模型

App 与 Web/API 位于同一个外层 Git 仓库，因此只维护一对 `staging`、`production` 分支；Vercel 项目仍按 staging/production 环境隔离。每次候选另存一份发布清单，记录共同 Git SHA、共享 API 契约状态、Expo/Xcode 版本、Vercel deployment ID、API origin 标识、数据库迁移版本和已知限制。不得只凭分支名判断两端配套。

当前 `staging` 候选为 `54528fbe9`，其发布源 `1d9aab2fc` 是最新已整合提交；本轮只额外修正 Expo 版本/build number 与离线读取审计器映射，并加了相应测试。未合并的 Sprint 分支不自动纳入。不得把旧内层 Web repo 的 `main@ea90c33` 当作发布源，也不得把其陈旧索引差异当作外层产品未提交变更。

`production` 当前本地基线为最近可定位的部署记录 `02ec26f0b`，但不是经 Vercel 当前线上 SHA 证实的基线。授权后必须与线上 Deployment SHA 复核；若不一致，先恢复真实线上基线。staging 业务验收通过后才可快进/合并已验证的候选，保留可回退提交，不复制粘贴文件、不重写历史。

历史记录显示生产项目按手动 CLI 发布管理，且当时没有 Git 自动部署绑定；执行前需重新核实。首次发布由固定 SHA 的源码树显式部署：staging 使用经核实与正式项目不同的独立项目、Preview target 和 staging 配置；production 使用既有正式项目及 Production target。部署前后读取项目名、目标环境、commit/build ID 和部署状态，不打印任何密钥值。

## 环境矩阵

| 组件 | Staging | Production |
|---|---|---|
| Web/API | 待确认或经批准创建的独立免费 Vercel staging 项目，显式 Preview target | 现有承载 `www.orbitailink.com` / `orbitailink.com` 的 Vercel 项目，显式 Production target |
| 数据库 | 待确认或经批准创建的独立免费测试库，仅合成账号/数据 | 当前正式 Neon 数据库；不由本流程迁移、清空或复制数据 |
| App API 地址 | 已部署 staging Web/API 的 HTTPS origin | 正式 Web/API origin |
| iOS 分发 | 使用 App Store Connect 已建 App 记录上传 TestFlight build；朋友使用外部测试组，首个外测 build 等待 Apple Beta App Review | 只有用户另行启动 App Store 发布才提交商店审核；production API 配置的归档不自动上架 |
| 异步能力 | 只启用 staging 项目明确配置且可隔离验证的任务；不复制生产密钥/消费者 | 沿用当前 Production 配置；不在 staging 验收时切换或重启生产消费者 |
| 数据/密钥 | staging 独立 Auth、DB、workspace 和可选服务密钥；默认不配置 AI/OCR/邮件计费凭据 | 现有正式绑定保持不变，禁止复制连接串或认证密钥 |

App staging 与 production 使用同一 Bundle ID，避免建立第二个 Apple 应用记录。两个包由相同已验证代码分别以 staging/prod API origin 构建；由于 API origin 被写入构建配置，晋级时需对 production 配置重新归档，不能把连接 staging 的 TestFlight 二进制直接当成正式 API 二进制。

## 执行顺序与验收

### A. 稳定发布输入

1. 以外层 `chat-agent` 最新已整合代码为共同源；分别核对当前 Sprint 工作树，未合并 WIP 保留在其原分支，不等待未来所有 Sprint 才启动 staging。
2. 核对共同仓库 SHA、API 契约同步和 App/API 路由兼容性，生成发布清单。
3. 已建立并推送 `staging`（当前候选 `54528fbe9`）和 `production`（暂定 `02ec26f0b`）。Vercel 登录后复核生产 SHA，再冻结候选。
4. 归档/构建前确保系统盘余量高于 5 GB 的项目硬停止线，并把发布工作树与 Xcode DerivedData/Archive 放在外接盘。

### B. 恢复并部署 Staging

1. 用户已批准建立独立免费测试资源；Vercel 空项目已创建，ID、Hobby 套餐、零变量和零部署已核实。Neon 账号授权仍需由持有人在浏览器完成；随后只读核对套餐及现有项目，再建立与 Production 完全不同的测试库并核对项目 ID、额度。只输出名称与脱敏状态，不读取密钥值。不得使用已经承载正式域名的旧 `orbit-staging-20260917` 项目。
2. 确认新的 staging DB 与正式数据源完全不同，且只含可重建的合成数据；检查 schema 版本。只执行兼容性迁移的 dry-run；任何真实数据写入、reset 或不可逆迁移均不在本授权内。
3. 使用已审核的 staging 配置和显式 Preview target 部署固定 Web SHA；确认部署 Ready、健康检查、认证、CORS/Origin、私有资源隔离及数据库连通性。
4. Expo 配置已设为 `1.0.0 (1)`，但 TestFlight archive 尚未生成。恢复 staging API 后，以 staging HTTPS origin 设置 `EXPO_PUBLIC_ORBIT_API_BASE_URL`，使用 `ios/Orbit.xcworkspace` 的 `Orbit` scheme 和外接盘 Archive/DerivedData 构建。上传前确认 App Store Connect 当前可用 build number、Xcode Apple Developer team 和 Distribution 签名；任何账号验证由持有人操作。上传到 TestFlight，不点击 App Store `Add for Review`。
5. 等待 Apple 处理 build；先由账户持有人内部安装验证，再提交外部 Beta App Review，通过后邀请朋友。Apple 账号/协议提示、双重认证和审核等待必须由账号持有人处理。

### C. Staging 实际验证

通过标准按一次真实候选构建执行，不拼接旧 Sprint 结果：

- iPhone 安装、首次启动、登录、退出和重登成功；确认应用实际连接 staging origin。
- 核心路线：联系人列表/详情与编辑、笔记、事项、日程、消息/通知；每条路线使用 staging 合成账号并从另一个客户端回读。
- 至少两账号验证隐私隔离；非法/过期会话不能读取私有资源。
- 文件/相机/OCR/AI/邮件/队列按配置矩阵逐项验证；未配置或未验收能力必须关闭且用户可见失败，不触发 production 或付费 provider。
- 检查服务端错误、队列积压、登录链路与数据库配额；保留部署 ID、构建号、脱敏日志及失败复现步骤。
- 已知失败逐项修复到 staging 分支，运行新增回归和对应定向测试，重建并在 iPhone 复验。不能用截图、typecheck 或单一 API 200 代替业务闭环。

### D. 晋级 Production

只有 staging 清单所有必需项通过，才将同一对已验证 SHA 晋级到两仓库 `production` 分支。部署前复核实际 Production 当前 SHA、目标项目、正式 API/数据库变量绑定名称和兼容迁移；生产数据库写入或迁移另走备份、dry-run、回滚审查。

按 production API origin 重新构建 iOS archive 并增加 build number。Web 以 Production target 部署。先做只读健康检查及一条无副作用登录/读取 canary，再由 TestFlight 构建进行正式环境登录回归。任何 staging 验收失败、部署目标混淆、配置差异未解释、配额不足或数据库迁移要求未获明确许可时，停止晋级并留在 staging。

Production 的 Vercel 发布和正式数据库写入彼此分开；回滚 Web 代码不能自动回滚 schema，必须保留兼容窗口和明确恢复步骤。App Store 公开发布不是本轮目标。

## 现阶段阻塞与用户操作

1. 用户已同意建立新的独立免费 staging Vercel 项目和 Neon 测试库；Vercel 空项目已建。旧 `orbit-staging-20260917` Vercel 项目及 `orange-forest-30108072` Neon 项目已经用于正式环境，不得复用。Neon 浏览器授权仍待完成；不要把密码、token、数据库连接串或环境变量值发到聊天。
2. 账号持有人首次用 Xcode/App Store Connect 上传时，若系统要求 Apple Developer team、Distribution certificate、协议确认或双重认证，请在设备上完成；不要把验证码或私钥发到聊天。
3. 历史 staging deployment 两个路径均返回 410；旧项目已转为 Production，不能“恢复”它来做 staging。独立测试 API 就绪前不得构建一个指向 Production API 的“staging” App。若免费额度不可用，停止并给出选项，不自动升级或购买。
4. 当前所有本地验证均已完成，但它们不能证明 staging 业务可用。Vercel Preview 部署、真实账号登录、测试数据回读、TestFlight archive/upload、朋友邀请及 Production 晋级仍未完成；Production 项目和数据库未被修改。

## 本次执行记录

- 已建立本地 `staging` / `production` 分支及 staging 隔离 worktree；staging 候选提交为 `54528fbe9`，production 暂留 `02ec26f0b`。两分支已推送远程并于 2026-10-01 独立回读确认。
- 修正 Expo iOS 版本到 `1.0.0`、build number `1`，并修复动态 API 路径审计映射的过期行号。
- 验证：App 3917/3917、离线审计 23/23、App typecheck、Web typecheck、Web Production build 均通过；iOS Debug/Release Simulator build 成功，iPhone 17e 模拟器启动并显示登录页。
- Web/API staging 历史地址 `/api/health` 和 `/app/account/login` 均只读返回 410；Production 两个域名 `/api/health` 返回 200。未使用 Production 账号写入数据。
- Vercel CLI 已登录 Hobby 新账号并创建独立空项目 `orbit-staging` / `prj_35zD2mkGoJVLKACR3dbr2xow2tpG`。项目没有 Git 关联或部署；隔离 worktree 已在本地链接该项目，Preview 仅有新生成的 Sensitive `AUTH_SECRET`。Neon 授权首次超时，新独立测试库仍待完成；旧初始化脚本目标保护尚未适配，不能运行。未部署新的云端 staging、未生成/上传 TestFlight archive，也未晋级 Production。模拟器登录页不是 staging 业务验收证据。
