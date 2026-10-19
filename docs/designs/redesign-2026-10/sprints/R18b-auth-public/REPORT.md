# Sprint R18b-auth-public 收口报告（C 线；未通过总验收）

## 2026-10-20 RD-25 复核修复（当前结论）

开工在 `line-c` 执行 `git pull --rebase origin redesign`，从 `52af0d076` 快进到含独立 [REVIEW](REVIEW.md) 的 `383eb80e2`；每次后续提交前均确认 `origin/redesign` 是当前 HEAD 祖先。只改本 worktree，未推送、未连接 Neon / 生产、未部署；原有未跟踪 `HANDOFF-CLAUDE-2026-10-19.md` 未碰。以下为本轮已核实的增量；下方 RD-33 记录是此前阶段的证据快照。

| RD-25 项 | 本轮结果与提交 | 验证边界 |
| --- | --- | --- |
| M1 | `a509632f6`：三语各 32 个新增 `auth.*` 键从 `account.ts` 移至 `auth.ts`；R03 快照改为只选当时 2,253 个键，保留三语同键 / 单域检查；`MaintenanceView` 重试改用 kit `Button`。 | App 字典 3/3；维护组件 3/3。旧按钮全局 ratchet 从 86 降至 **85 / 上限 79，仍 FAIL**，但维护页已不在未迁列表。W-09 两种维护时间态各 6/6 像素回归通过，见下文。 |
| M2 | `76ec6f67d`：Web 注册自动登录失败时在当前标签页保存一次性、120 秒有效邮箱状态；App 仅在当前进程保存同样状态。登录页取出后即清除；URL 仅带 `created=1` 与规范化的安全 `next`，直接拼入 URL 的 `email` 不再预填。`39688f1c4` 随后删除路由审计中该入口的旧 `email` 期望。 | App 认证 / 路由 / 字典 33/33；Web 认证 / 维护 54/54；已有 Google 回跳与安全 `next` 用例包含在这些定向组。路由审计修订后 101 项中 97 通过、4 跳过、0 失败。未把模拟 OAuth 当作真实授权链。 |
| m1 | `40fdca360`：按主会话已给的批准，把 `5e26aef60` 的稀疏资料读取修复记为 **R18a 页面复核补修随 R18b 提交**；归属和证据见下方专节及四栏交接。 | 原提交定向 12/12 与已登录设置→公开页返回局部链；不扩写为 R18b 总验收。 |
| S1 | `784380ba0`：全局强制更新 / 维护拦截明确 **转 D 线**，根壳冷启动与任意受支持深链不可绕过的验收要求见下方专节。 | C 的直达更新页 / 维护页和纯策略测试不能代替 D 根 `app/_layout.tsx` 集成。生产开关继续关闭。 |

### 最终源码验证与逐名基线差分

以 REVIEW 引用的 RD-33 收口全量日志为**同一 C 线最近全量基线**，按失败用例名的多重集比较；完整 `new`、`resolved`、`persisting` 原名分别写在 `/Users/xzhao/orbit-sprint-evidence/redesign/R18b/run-01/app-failure-name-diff-rd25.json` 和同目录 `web-failure-name-diff-rd25.json`，原始日志同目录 `app-full-rd25-final.log`、`web-full-rd25-final.log`。这些 JSON 是逐名差分，不以总数推断归属。

| 端 | RD-33 基线 | 本轮各一次全量 | 逐名差分 |
| --- | --- | --- | --- |
| App | 3,252 项 / 29 fail / 0 cancelled / 2 skip | **3,254 项 / 3,240 pass / 12 fail / 0 cancelled / 2 skip，exit 1** | 新增 **0**；旧失败消失 17；持续 12（R12 名片链 9 项、设置迟到回执、人脈合并提示、收件箱筛选选中态）。 |
| Web | 7,769 项 / 23 fail / 0 cancelled / 545 skip | **7,769 项 / 7,210 pass / 14 fail / 0 cancelled / 545 skip，exit 1**，按要求设 `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8` 并只连本地 `orbit_line_c_test` | 旧失败消失 11；持续 12；新增 **2**，名称和后续处理见下。 |

Web 新增的 `route query parameters come from route-local URL consumers, not transitive get/set calls` 是 M2 去掉 `email` URL 读取后的旧审计断言；`39688f1c4` 只删除该入口的 `email` 期望，整份审计定向 97 pass / 4 skip / 0 fail。另一个新增名 `saved cloud facts drain in bounded batches; daily quota and ignored identities persist across workers` 在全量中 `20 !== 0`，相同本地测试库的独立文件复跑 **3/3 pass**；通知发现源码及该测试文件从 RD-33 基线到本轮没有 C 线修改。并发 / 本机状态导致波动只是推断，交通知归属方复核，**仍按全量失败记录**。本轮遵守两端全量各一次：审计修正后只做定向复验，没有第二次 Web 全量；因此不能声称修正后整树全量已通过或全部新增失败已消失。

最终源码 App `typecheck`、Web `typecheck` / `typecheck:app` / `lint`、`git diff --check` 均 exit 0；Web lint 日志在同一证据目录 `web-type-lint-rd25-final.log`。M1/M2 定向测试先红后绿，Web 新审计断言在全量红后修订并定向通过。全量仍为红灯，SC-16 未通过。

### 像素回归、SC 余项与交接

M1 换按钮后，以本地显式 `maintenance.active=true` 的匿名 live 版本响应分别实拍 `until` 缺失和合法时间两态：W-R18b-09 的 1440 / 1024 / 390 × 浅 / 深 **12/12 PASS**，每张 0 超阈带、0 未归因、0 缺块，raw 最大 **0.0005**；triptych 与摘要在 `/Users/xzhao/orbit-sprint-evidence/redesign/R18b/run-01/rd25-maintenance-button-unknown/`、`rd25-maintenance-button-until/`。这只覆盖维护页按钮回归。认证 W/A-01～05 的既有 FAIL 与单屏三轮上限、A-04 画板缺邮箱字段仍见下文，SC-14 总门禁未通过。

SC-03/04/06 的 M2 隐私回退及安全目标定向通过，真实 Google / 邮件 / 邀请全链仍待集成验收；SC-08 的 R18a 设置页补修按 m1 归属，不扩大本 Sprint 范围；SC-10/12/15 的全局版本拦截与 Web 浮条挂壳等 D 线依赖仍 OPEN；SC-16 的全量及按钮 ratchet 仍红。发布支持邮箱、法务正文、商店地址、真实 OAuth / 邮件及生产开关继续待用户授权。

| 本端版本 | 另一端影响 | 未完成事项 / 下一责任方 | 验证范围 |
| --- | --- | --- | --- |
| C `a509632f6`、`76ec6f67d`、`39688f1c4`（RD-25 M1/M2） | Web/App 注册失败回退不再把邮箱放进 URL；安全 `next` 和 Google callback 仍使用原规范化路径；无共享契约字段变化 | 主会话在 Bridge 台账登记；通知归属方调查仅全量复现的 cloud facts drain；共享 UI / 审计归属方继续收 85/79 按钮 ratchet | App 33/33、Web 54/54、审计 97 pass / 4 skip；W-09 12/12 PASS；App 全量 12 fail、Web 全量 14 fail，修订后未重复 Web 全量 |
| C `784380ba0`（RD-25 S1 请求） | C 的版本响应 / 公共更新页已可供两端消费，深链阻断尚未由根壳保证 | D 线独立提交 App 根全局版本 / 维护门禁与 Web 浮条挂载，核底栏及 Toast；主会话集成后重验 SC-10/12/15 | C 直达页与纯策略证据；未验 D 壳、任意深链全局阻断或正式发布 |

本轮各项按路径单独提交，追加路由审计修复仍只含 M2 的一条断言；`git show --stat HEAD` 已核路径。无可归因的像素豁免未填写，未触 D 壳 / 其他线源文件；自启动的 3400、3420 服务已停，8084 未启动，未停 3000。

## 2026-10-20 RD-33 续工记录（历史基线；以上 RD-25 结论优先）

本节覆盖其下原「收口日期」到「历史执行记录」的更旧阶段快照。它记录 RD-33 当时证据；其中 i18n、按钮和全量数字均早于上方 RD-25 修复，当前状态以 RD-25 节为准。工作树 `line-c` 当时已拉取复核 `origin/redesign 044c401b7`；未推送、未连接 Neon / 生产、未部署。开工前未跟踪的 `HANDOFF-CLAUDE-2026-10-19.md` 保持原样。

### RD-25 m1：R18a 设置页补修归属

`5e26aef60` 中 `AccountProfilePage.tsx` 对稀疏 `/api/profile` 的可选 `handles` 加空值保护，测试在 `r18a-account-profile.test.tsx`；这属于 **R18a 页面复核补修**，不是 R18b 的页面归属。主会话已明确批准它随 R18b 提交。该提交保留的定向资料 / 相邻交互 12/12 和已登录设置→公开页返回浏览器证据只覆盖此补修及 SC-08 局部操作链，不证明两端全量或 R18b 总验收。

### RD-25 S1：转 D 线

**全局强制更新 / 维护拦截转 D 线。** C 已有匿名 `app-version` live 读取、默认关闭的 `enforceMinimum`、维护信号解析及对应公开画面；根 `app/_layout.tsx` 的全局判定与阻断属于 D 线壳。D 需在独立路径提交中让冷启动和任意受支持深链都先经过判定，验证强制更新不可绕过、维护仅在 `maintenance.active === true` 显示、普通 503 / 离线放行，并使底栏与 Toast 偏移跟实际可见状态一致。集成前 SC-10 / SC-12 / SC-15 的全局部分仍未通过；正式强制更新开关保持关闭。C 不直接改 D 壳。

### §C-2 文档更新请求：RD-33 十二项代定

请求主会话把下列 2026-10-20 代定写入决定表 §C-2，并同步 README / HANDOFF / DEFERRED-A 中相应的旧停点；C 线只更新本报告。b1 #0–#9 原地改稿均附「2026-10-20 主会话代定」，b12 末尾补出 W/A-01～05 画板，五项预检、画框范围与仍待验证项见 `preflight-checklist.md`。以下决策不构成像素或发布许可。

| 编号 | 执行口径 |
| --- | --- |
| 1–2 | 保留跨屏既有「登録は1分」、删除无来源的「確認は1枚5秒」；12 枚 / 3 人 / 46 分 / 今日 +10 / 人名均标为「サンプル」，下书演示不可点且不读取访客数据。 |
| 3–4 | 顶栏 FAQ 走公开 `/help`；功能走真实页内锚点，无对应区块的入口移除。App skip 留在欢迎流程的登录 / 注册选择，已认证与明确深链直达原目标。 |
| 5–6 | Google 仅 provider 启用时显示；补无 Google 浅深画板。设备待恢复提示仅显示匿名总数或读取失败，补两态浅深画板。 |
| 7–9 | 删「登录状态保持」与注册确认邮件承诺；注册成功尝试自动登录、失败回登录；密码只提示至少 8 字符，两端校验 72 UTF-8 字节上限，删强度条和英数字必填。 |
| 10–12 | 409 邮箱卡给登录 / 重置入口，不保证送达；找回统一受理语并删除倒计时 / 打开邮件 App；失效链接统一「このリンクは使えません」且可重新申请，不回填邮箱。 |

### SC 对照（截至本轮源码与实拍）

| SC | 状态 | 证据及余项 |
| --- | --- | --- |
| 01 | 改稿 / 预检完成，整体未关 | b1 改稿、b12 W/A-01～05 补画及浅深预检已记录；UI 操作与像素需单独验。 |
| 02–03 | 功能切片完成，像素未过 | Web `/`、`/app` 新落地、无 Google 弹层与认证四态直链运行；409 给登录 / 重置，找回同响应，失效链接通用。定向认证与安全 `next` 37/37；W-01～05 代表矩阵 FAIL。 |
| 04–05 | 功能切片完成，原生 / 邮件全链未关 | App 欢迎、登录 / 注册 / 找回 / 重置全屏接入；skip 保持公开，原生 fragment 深链解析、72 字节校验及受理文案有定向 23/23；A-01～05 实拍 FAIL。未发送真实邮件。 |
| 06–07 | 局部通过 | 两端安全 `next`、邀请目标与 provider 隐藏有定向回归；真实 Google broker 完整成功 / 取消链、邀请接入后全链未在本轮实走。 |
| 08–09 | 仍部分 | 公开帮助 / 法务 / FAQ 和设置跳转沿用先前证据；正式法律正文、支持邮箱与 App 像素仍为发布 / 门禁余项。 |
| 10–12 | 仍部分 | live 版本接口和 C 浮条状态保留；D 根壳的全局不可绕过版本拦截与 Web 浮条挂载、真实商店地址和 A-10 / W-10 实拍未关。 |
| 13 | 本线旧屏清理完成，跨线保留 | `account/auth-0918/**`、`orbit-landing-0918.tsx`、`orbit-real-landing-page.tsx` 已不在 tracked runtime；新 `/`、`/app`、认证四态及 `mobile-google` 回调 / 失败页均不导入旧参考样式。`orbit-landing-route-view-model.ts` 仍供首页 / 活动跨线类型使用，`OrbitReferenceStyles` 仍被多个跨线页使用；按条件保留共享文件与跨线消费者并交接。 |
| 14 | FAIL | Web 认证 25 张本轮复比 0 PASS；App A-01～05 已实拍代表屏均 FAIL，若单张满三轮则停止该屏改动。不得用空归因表消除未归因带。 |
| 15–16 | 未关 | D 已提交的登录态底栏条件需与新增认证 / 强制更新实走；全量复验及 Bridge 交接见下文。 |

### 像素余项与三轮上限

Web 注册的无 Google / request / valid / invalid 代表画面覆盖 1440、1024、390 与浅深，矩阵二次复比的 25 张 **0 PASS**，`/Users/xzhao/orbit-sprint-evidence/redesign/R18b/run-01/web-auth-matrix-r2/summary.json` 留有每张 raw、超阈带、缺块和 triptych。W-01 的 1440 浅色三轮末 raw 7.88%、390 浅色三轮末 3.78%，均 FAIL；390 深色第二轮 3.68%，仍 11 条超阈带。W-02 390 浅色二次 5.52% / 16 带 / 2 缺块，W-03 8.23% / 18 带 / 2 缺块，W-04 4.41% / 16 带 / 2 缺块，W-05 有效 4.56% / 16 带 / 2 缺块；这些仍是失败画面，不以相邻屏结果推断通过。W-04 1440 浅色第三轮 2.42% / 12 带 / 4 缺块、W-05 有效 1440 浅色第二轮 2.23% / 11 带 / 3 缺块，均 FAIL。其余受理、409、自动登录两态、72 字节等仍需隔离交互 fixture，不能把画板登记当门禁。

App 使用独立已签名 Debug 构建、C 模拟器和 Metro JS 实拍。A-01 无 Google 浅色三轮末 raw 11.42% / 13 带 / 4 缺块，深色首轮 9.32% / 11 带 / 4 缺块；A-02 无 Google 浅色三轮末 5.80% / 11 带 / 3 缺块，深色首轮 8.79% / 12 带 / 7 缺块；A-03 无 Google 浅色三轮末 12.23% / 12 带 / 5 缺块，深色首轮 12.48% / 13 带 / 5 缺块；A-04 浅色二轮 11.03% / 9 带 / 5 缺块、深色首轮 11.23% / 9 带 / 5 缺块；A-05 有效浅色三轮末 4.62% / 11 带 / 5 缺块、深色首轮 5.04% / 12 带 / 4 缺块，失效浅色二轮 3.49% / 6 带 / 3 缺块、深色首轮 3.49% / 6 带 / 3 缺块。原生重置深链最初只显示粘贴框，修复后已用真实 `orbit://account/reset-password#token=…` 唤起密码表单；旧截图未算作有效新表单门禁。开发菜单覆盖截图也已排除，不计设计轮次。完整目录 `/Users/xzhao/orbit-sprint-evidence/redesign/R18b/run-01/app-a*/`；所有上述屏为 FAIL。A-04 画板没有邮箱输入而真实请求态必须输入邮箱，这项画板 / 功能冲突需主会话复核，不能为像素删除业务字段。

`views/web-R18b.json` 登记了 36 个 W-01～05 代表画面与真实填值步骤；`views/app-R18b.json` 登记 A-01～05 全部浅深设计索引，并注明需 provider、202 / 409、待恢复数或 72 字节等本地 fixture 的画面。未实拍的登记项不算已验。

### 本轮测试与门禁

- 收口时两端全量各跑一次，使用 `_runs/heavy.sh c`；Web 带 `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8` 与本机 `orbit_line_c_test` 数据库参数。App 日志 `/Users/xzhao/orbit-sprint-evidence/redesign/R18b/run-01/app-full-rd33-closure.log`：**3,252 tests / 3,221 pass / 29 fail / 2 skip，exit 1**。失败中本线旧表征测试仍断言旧按钮、旧开放式输入框、注册成功回登录、旧关闭标签，另有硬编码文案和 Ionicons 清单；随后已按 RD-33 与新画板做有界修复，App 认证 / 重置 / 宽屏 / 大字 / 静态门槛定向 **78/78 pass**，`npm run typecheck` exit 0。其余全量还含 R12 扫描链、邀请提示拦截、设置迟到回执、收件箱选中态与旧字典快照；**未再跑第二次全量，不称最终树全量通过或零新增失败**。
- Web 日志 `/Users/xzhao/orbit-sprint-evidence/redesign/R18b/run-01/web-full-rd33-closure.log`：**7,769 tests / 7,201 pass / 23 fail / 545 skip，exit 1**。本线旧 auth modal 断言、root 旧导航审计、认证 CSS token / legacy icon 引用随后修复，按新 UI 的 HTTP / hash / 409 / 安全 `next` 重写相应表征断言；相关定向 **37/37、28/28、2/2 pass**。最终源码 `typecheck`、`typecheck:app`、`lint`、`git diff --check` exit 0。其余全量还含 Host / Search 审计候选、联系人和 R12、R16 本机 PostgreSQL、Dashboard、设计 fixture 扫描及按钮数旧上限（本轮实扫 86 对 79）；不调高上限或修改跨线源码。**未再跑第二次全量**。
- 在唯一一次 Web 全量之后，SC-13 检查又定位到 C `mobile-google` 对共享旧参考样式的最后一个引用。`3a95c0797` 将回调 / 不可用态改为 `Orbit2026Scope` 的新样式，保留 request 首值、provider 关闭、Google 回跳与邮箱登录出口；旧硬编码文案允许清单只减。本次后续定向 `mobile-auth-routes` + Web hardcoded-copy **17/17 pass**，`typecheck` / `typecheck:app` exit 0。该提交晚于上面的全量日志，不以它证明最终全量通过。
- 字典 `i18n-domain-split` 仍按 R03 的 2,253 个原始键和「键前缀须等于目录名」检查：当前 R18b 在 `account.ts` 增加的 `auth.*` 新键违反后者，且全仓已有大量 R03 后新键使旧固定总数失效。本 Sprint 的 PLANNER 仅授权在三语 `account.ts` 加键；不能把 `auth.ts` 和旧全仓快照测试当作 C 线私有文件改写。请求主会话协调 i18n 所有者迁移新增键至正确域，并把测试改成只锁定 R03 原始集合、继续验证三语同键 / 单域归属；在此之前 SC-16 维持红灯。
- CSS token 改写使用已有 `--fs-*` / `--r-*` / `--shadow-float`，legacy eye 图标改用 `orbit-2026/ui/Icon`。字重 / 布局数字未放宽；浮层阴影和眼睛图标确有视觉变化，前述认证 triptych 生成时间早于该修复，所以它们只说明此前失败，**不代表最终源码重比**。对应画面在 A 线 kit / D 壳集成与像素余项收口时必须重新比，且单屏不得越过已记三轮上限。

### D 线请求、交接与待决定

**D 线下个 Sprint 请求：**在 `redesign-d` 的独立路径提交中，把 C 的 `WebVersionBannerGate` 挂到 Web 壳，以页面初始构建 ID 对比 live `webBuildId`；仅双方都有且不同才显示可关闭浮条，目标构建变化后重新显示。App 根 `app/_layout.tsx` 挂全局版本 / 维护判定，覆盖任意受支持深链且不可绕过；未认证欢迎、认证、重置、强制更新、公开异常不显示底栏，`ToastProvider.hasTabBar` 跟实际可见状态一致。D 已有登录态底栏条件提交不能代替全局版本拦截。D 线按路径独立提交并实走会话切换 / 转场 / 深链 / Toast，不混入 R20a；C 不编辑 D 壳。W-10 与全局强制更新仍标「等 D 线」。

| 本端版本 | 另一端影响 | 未完成事项 / 下一责任方 | 验证范围 |
| --- | --- | --- | --- |
| C `line-c`：RD-33 b1/b12、Web 新落地 / 四态、App 欢迎 / 四态、C 版本状态；最终提交号见本节后的提交记录 | Web 与 App 的公开入口、认证文案、Google provider 开关、重置 hash 与 8 字符 / 72 字节语义对齐；live `app-version` 契约继续供两端消费 | D 挂 Web 浮条与 App 根全局版本门禁；主会话在 Bridge 台账登记并审查；R28 改引导画板目标上限；R17 公开主办顶栏按新公开规范评估；i18n 所有者处理域归属；C 后续收像素余项 | Web 认证相关定向 37/37、移动 Google / 文案 17/17、App 78/78、两端类型检查；Web 25 张认证代表画面及 App 已实拍代表屏 FAIL；未验生产、真实 Google / 邮件、全矩阵、D 壳或最终像素 |
| `5e26aef60`（R18a 设置资料页复核补修，主会话批准随 R18b 提交） | Web 已登录设置页读取稀疏资料时不因可选 `handles` 缺失崩溃；不更改 App 资料契约 | R18a 页面归属方在集成台账标明补修来源，后续资料页回归归 R18a；C 不据此认领 R18c 账户页 | 该提交定向资料 / 相邻交互 12/12，已登录设置→公开页返回浏览器链；未覆盖全量或全部 SC-08 |

**待主会话决定：**A-04 找回请求画板无邮箱输入，与真实请求行为冲突；建议保留字段并修画板，影响 A-04 / SC-14。其他十二项已按 RD-33 代定，不再重复提问。**待用户授权的发布门禁：**正式支持邮箱、法务正文、生产更新开关、商店地址、真实 OAuth / 邮件及发布。**越线自查：**未改 D 壳、A kit、R28 / R18c、桥根台账或根汇总文档；未推送、未触生产、未停 3000。C 的 3400 / 3420 / 8084 和专用模拟器已停；Next dev 自动生成的 `next-env.d.ts`、`tsconfig.json` 差异已逐项还原，用户原有未跟踪文件未碰。

**本轮路径提交（均未 push）：**`3ade8271f` App 认证 / 重置、`8cf5371c9` Web 认证 / token 样式、`1dd230b3d` 两端视觉清单、`3a95c0797` Web 移动 Google 回调旧样式清理。本报告分别以 `426b41e2f` 和本次增补文档提交记录收口状态；每次 `git show --stat HEAD` 均已逐项核对。此前设计与入口提交 `f1db93a17`、`35de43719`、`fd78542fa` 仍在同一 `line-c` 链上。

**收口日期：**2026-10-20。**分支：**`line-c`，已按要求从 `origin/redesign` rebase；本轮仅在 C 工作树执行，未 push、未连接 Neon / 生产、未部署。下方旧执行记录保留为逐次证据；本节是最终状态。`HANDOFF-CLAUDE-2026-10-19.md` 为开工前已存在的未跟踪文件，本轮未修改或提交。

## 结论与 SC 对照

R18b **未达到全部 SC**，停在设计事实 / 动作代定、跨线壳接线、App 像素门禁三轮上限以及两端全量红灯。主会话已批准 `preflight-checklist.md` 的补画并删除 b1 #9 两条不真实的密码实时检查；批准只解决相应画板使用权，不代表操作链或像素通过。本轮 C 线 App 公开页最小调整在最终 rebase 后为 `d7b0f9b94`，Web W-10 浮条组件 / 状态为 `042d58c73`；两项都没有把失败门禁记成通过。

收口源码还包括 W-10 kit token 修正 `d1cb185fa` 与 App 维护卡 / 重试排版 `0e2711e31`。本轮基于 `origin/redesign e4c7172f3` 重放 C 提交；提交号随 rebase 改写。Web 全量复验早于最后的 CSS token 修正，App 全量早于维护排版修正，不能把旧日志称作最终树全量通过。

| SC | 本轮收口状态 | 已有证据 / 未完成条件 |
| --- | --- | --- |
| 01 开工与预检 | 部分 | 开工 rebase、b1/b7 改稿与 b12 补画已有记录；本轮批准补画已更新预检表。b1 欢迎 / 认证的真实数据、导航目的地、异态与 token 仍待主会话代定及补画。 |
| 02 Web 落地 | 部分 | `/`、`/app` 会话路由目标测试有记录；未登录仍跑旧落地，W-01 新画面与全矩阵未做。 |
| 03 Web 认证四态 | 部分 | 注册重名与找回邮件枚举边界、现有注册法务链接通过定向 / 浏览器验证；新 b1 弹层、四态直链和 W-02～05 未完成。 |
| 04 App 欢迎 / 认证 | 部分 | 注册法务链接原生返回保留草稿已有证据；未登录仍走旧入口，A-01～05 与完整原生链未完成。 |
| 05 重置与邮件 | 部分 | 本地隔离库 HTTP 目标组 46/46；实际邮件投递、新 UI 与完整回跳未验证。 |
| 06 深链 / 邀请 | 部分 | Web 安全 `next` 与 App 路由目标组通过；新认证 UI 上的邀请完整操作链未实走。 |
| 07 Google broker | 部分 | App 成功回跳缺陷已修，broker 目标组通过；真实 Google 成功 / 取消原生链未实走。 |
| 08 公开帮助 / 法务 / 设置 | 部分 | 两端公开路由、Web 已登录设置往返、App 法务返回及 404→Help 有操作证据；正式正文待用户授权，App 公开页像素未过。 |
| 09 FAQ / 联系反馈 | 部分 | 静态 FAQ 搜索与展开、邮箱 `null` 时准备中有定向与 Web 门禁；真实邮箱 / 邮件 App 出口待用户授权和配置，App 像素未过。 |
| 10 404 / 维护 | 部分 | 已知 / 未知路由、显式维护信号与 503 区分，Web 维护两态矩阵通过；App 404 及维护未知 / 有效 `until` 浅深实拍均 FAIL，根级维护拦截未证实。 |
| 11 live 版本接口 | 功能切片完成，总验收未关 | 独立 `app-version` live、可选字段、服务端变量、`no-store`、匿名 HTTP 200 与默认关态已证；全量仍红，生产变量未写。 |
| 12 强制更新 / 浮条 | 部分 | App 判定和公开更新页已测；C 线 Web 浮条组件、live 响应读取、目标构建关闭持久化与目标变化重显在隔离浏览器通过。A-10 浅深实拍因无真实商店地址呈禁用态而 FAIL；App 全局不可绕过拦截、商店出口、D Web 壳挂载及 W-10 像素仍未完成。 |
| 13 旧屏与 R18a 回归 | 未完成 | 旧认证 / 落地组件仍有运行时引用，跨线 view model 亦有引用；不能按清单删除。静态路由与注销局部回归不代替完整清理。 |
| 14 像素收口 | 未过 | Web 公开 404、帮助 / 法务及维护指定切片通过；App Help / 404 / 法务本轮均 FAIL，认证、已登录态与更新浮条等缺矩阵。详见下表。 |
| 15 导航 / 可访问 | 部分 | D 根壳 `5bd066aad` 的已登录底栏条件与 Toast 条件目标测试通过；真实全局版本门禁、认证全链、全尺寸键盘 / 无障碍仍缺。 |
| 16 全量与交接 | 未过 | 两端全量 exit 1；本报告逐项交接，未声称零新增失败或独立复核完成。 |

### SC-13 旧屏保留 / 删除条件

| 文件或目录 | 本轮引用核对与处理 |
| --- | --- |
| `account/auth-0918/**` | login、signup、forgot-password、reset-password 仍在运行时导入 `AuthModal`；新 b1 四态链未接，不删除。 |
| `orbit-landing-0918.tsx` | 根 `/`、`/app` 和四条认证路由仍导入；新落地 / 背景未接，不删除。 |
| `orbit-real-landing-page.tsx` | 未找到当前运行时 import，但还有旧拷贝允许清单与文档引用；PLANNER 要求新链路接通后才清理，未提前删除或缩小允许清单。 |
| `orbit-landing-route-view-model.ts` | 首页、活动页的 adapter 与类型仍导入；先由归属线迁移消费者后才可删除。 |
| `OrbitReferenceStyles` | 根落地、认证、联系人、活动等页仍导入；只在 C 新链路接通后解除本线引用，共享文件不能由 C 删除。 |

## 门禁总表与未过重比

| 画面 / 范围 | 最新证据 | 结果 |
| --- | --- | --- |
| Web 公开 404 + Help 默认 + Terms / Privacy 占位 | `_evidence-c/R18b/visual-public-24-20261019/summary.json` | 同批 24/24 PASS；只覆盖这些公开默认态。 |
| Web Help FAQ 展开与无结果 | `_evidence-c/R18b/visual-help-states-final-20261019/summary.json` | 12/12 PASS；与上一行不是同一次 36 张全量。 |
| Web 维护：未知与有效 `until` | `_evidence-c/R18b/maintenance-{unknown-6-final,until-6}-20261019/summary.json` | 各 6/6 PASS；本地显式 live 维护信号。 |
| App 公开 Help | `_evidence-c/R18b/app-public-gate-20261020/help-{light-03,dark-01}/` | 浅色第 3 轮 raw 4.37%，深色首轮 4.32%；仍有 5 条超阈 / 未归因带，FAIL。浅色达到三轮上限。 |
| App 公开 404 | `_evidence-c/R18b/app-public-gate-20261020/not-found-{light-03,dark-01}/` | 浅色第 3 轮 raw 1.78%，深色首轮 1.78%；各有 2 条超阈 / 未归因带，FAIL。raw 小于 2% 也不能改写成通过。 |
| App Terms / Privacy 占位 | `_evidence-c/R18b/app-public-gate-20261020/{terms,privacy}-{light,dark}-*/` | Terms 浅 / 深 raw 1.66% / 1.62%，Privacy 1.58% / 1.52%；各有 3 条超阈 / 未归因带，FAIL。Terms 浅色达到三轮上限。 |
| App 维护 A-09 未知 / 有效 `until` | `_evidence-c/R18b/app-version-gate-20261020/maintenance-*/` | 正确标题画板下，未知浅色第 3 轮 raw 2.67%、3 条未归因（随后全宽按钮 / 卡片纵距改动未再重比，三轮上限已到）；未知深色 raw 2.59%、2 条；有效 `until` 浅色第 2 轮 2.39%、深色 2.30%，各 2 条，均 FAIL。首个 `maintenance-unknown-light-01` 错选 Web 私有 404 画板，属于工具定位错误，不计 A-09 设计轮次，也不当作产品失败。 |
| App 强制更新 A-10 | `_evidence-c/R18b/app-version-gate-20261020/force-update-{light,dark}-01/` | 浅 / 深 raw 11.35% / 11.36%，各 5 条未归因及 1 缺块，FAIL。未配置真实 App Store 地址时按钮按既定安全逻辑禁用并显示准备中；画板是可用底部商店按钮。不得以假链接通过发布门禁。 |
| W-10 Web 新版浮条 | `042d58c73`、`web-version-banner-browser.test.tsx` | C 私有组件 / 行为目标通过；D 壳未挂，六幅补画尚无产品页面实拍 / 像素门禁，**未验**。 |
| 其余 W/A-R18b 画面与状态 | `preflight-checklist.md` 及各 views JSON | 缺设计事实代定、C/D 壳接线或实拍；**未验**，不是「待组件库」通过。A 线 kit 若需补值，由主会话协调，不在 C 线私改。 |

本轮 App 视觉从已验签的 C Debug 构建加载当前 Metro JS，在新建 iPhone 16e 模拟器实拍；图片、triptych、`result.json` 均保留在上述目录。Help FAQ marker、404 换行和法务间距按画板做了 C 私有改动；相邻渲染测试先红后绿、App typecheck 与定向测试通过。各条残余差异保持**未归因**，不能用主观「字体误差」消除门禁。用完的模拟器已按 UUID 删除；旧 C 模拟器未动。

A-09 本轮只在 C 私有 `MaintenanceContent` 调整卡片文字居中、重试图标 / 全宽按钮与卡片纵距；浅色未知态的末次截图早于最后两项布局微调，故不为最终源码补写像素结论。有效 `until` 的后续截图和深色未知态使用了相应新源码，仍是 FAIL。A-10 的商店地址未提供，未动强制更新屏以伪造可点击状态。

## 测试与基线

- Web 在 `042d58c73` 前以 `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 ORBIT_EVENT_DATABASE_URL=postgresql://xzhao@127.0.0.1:5432/orbit_line_c_test heavy.sh c -- npm test` 收到 **7,764 tests / 7,204 pass / 15 fail / 545 skip / 0 cancelled，exit 1**；完整日志 `_evidence-c/R18b/web-full-final-20261020.log`。失败为 manifest 生成、联系人合并、R20b 会面卡、dashboard 只读两项、design fixture import、R16 每日一问 PostgreSQL 三项、跨账号并发、cloud facts drain、R12 名片两项、`*-0918` 链接颜色旧计数、按钮数量 ratchet。后两项实扫分别 34 对旧下限 40、85 对旧上限 79；按钮列表包含 C `MaintenanceView.tsx:74`，不能把它说成全属他线，也不能直接放宽门槛。W-10 新增源码后的全量复验记录追加在本节末尾。
- Web W-10 源码加入后的全量：**7,768 tests / 7,208 pass / 15 fail / 545 skip，exit 1**，日志 `_evidence-c/R18b/web-full-after-w10-20261020.log`。新 CSS token 门槛在该轮失败；把 W-10 的圆角和字号全部改用已有 kit token 后，`orbit-2026-css-tokens` 与 W-10 四组定向 **8/8 pass**，修复提交 `d1cb185fa`。该轮先前的跨账号并发失败未复现，不能因失败总数仍是 15 就称失败清单不变。修复后未再做第三轮 Web 全量；当前全量结论仍为红，不宣称最终树零新增失败。
- App `heavy.sh c -- npm test`：**3,246 tests / 3,232 pass / 12 fail / 2 skip / 0 cancelled，exit 1**；完整日志 `_evidence-c/R18b/app-full-final-20261020.log`。失败为 R12 相机 / 名片流程 9 项（共同等待 `add-batch-reading` 超时）、拆分字典旧固定键数（实际 2872 对 2253）、settings discovery toggles 迟到回执、typed inbox filter 选中态。上述目标与本轮 C 公开视图改动无共同执行路径，但没有同一 HEAD 的 pristine 全量对照，不能以此断言零新增失败。
- 本轮 App 公开页改动后的 `npm run typecheck` exit 0；12/12 相关目标测试、56/56 App 版本 / 公开 / 认证 / 路由扩展组通过。Web 公开 / 版本等目标按项目 runner 79 pass、1 skip（缺独立数据库参数的用例）；该 skip 未当作通过。
- App 当前源码 `npm run typecheck` exit 0。Web 在 W-10 新源码上 `npm run typecheck` / `typecheck:app` / `lint` 均 exit 0，日志在 `_evidence-c/R18b/{web-typecheck,web-typecheck-app,web-lint}-after-w10-20261020.log`。W-10 新增纯逻辑、静态渲染与隔离 Chromium 操作共 6/6；先红后绿日志 `web-version-banner-{red,view-red}-20261020.log`。`copy:qa -- --web` 为 3899 条 / 29 个旧告警、exit 1；本轮 `webVersion*` 无告警，不称 copy-qa 通过。Web lint 是固定清单，不能代替新文件覆盖。
- A-09 最终源码的维护 / 强制更新目标组 **8/8 pass**，App `npm run typecheck` exit 0；新增卡片居中渲染断言先红后绿。App 全量是在这次 A-09 排版微调前执行，不能作为最终源码的零新增失败证明；按收口重任务限制未重复全量。

## 改稿、工程决定与越线自查

- 已沿 RD-33 把 b1 目标上限改为 2、移除 b7 的 Pro / 虚构邮箱 / Gmail 正文与草稿 / 假反馈成功，支持邮箱保持 `null`，法务仅公开前占位；b1 #9 两条虚构实时密码检查已从画板删除。W-10 补画按本轮批准更新预检状态，其 C 私有 UI / 状态已交；D 壳页面未挂载。
- 本轮 App Help 使用 C 私有可访问 disclosure 控件绘制画板的三角标记；404 只调整公开文案换行及 C 页面布局，没有改 A kit、D 根壳或 R28 / R18c 页面。未因视觉失败扩散新 token 或写宽松归因。
- Web / App 跨端用户可见路由与版本契约的既有变更已按 `bridge/status.md` 和 `bridge/handoffs.md` 对照。C 无权改桥根台账，交接原文在下表；路由 / 类型测试通过不标作业务对齐完成。

## 交接表追加（四栏原文）

| 本端版本 | 另一端影响 | 未完成事项 / 下一责任方 | 验证范围 |
| --- | --- | --- | --- |
| C `line-c`（本报告提交前 `042d58c73`；`app-version` live、公开路由、App 视图、W-10 浮条） | Web 版本响应加可选 `enforceMinimum` / `maintenance` / `webBuildId`，App 同步契约消费；R18c 的 `account-lifecycle` 仍 mock | D 线根布局需挂不可绕过的 App 版本门禁，并在 Web 壳以页面初始构建 ID 挂 C 的 `WebVersionBannerGate`；主会话在 Bridge 台账登记并独立复核 | 匿名 live HTTP / no-store、App 纯策略、D 底栏目标测试、W-10 隔离 Chromium 关闭 / 变更重显；未验生产配置、全局拦截或真实壳像素 |
| C 公开 Help / 404 / 法务路由与设置跳转 | Web 和 App 的公开页可在未登录访问，已登录设置需要安全返回；旧认证 / 落地仍在运行时 | C 线待 b1 事实代定后完成新入口并删本线旧屏；R28 负责引导页 `1〜3個まで`→2；R17 负责公开主办页顶栏 | Web 已登录设置与 404 浏览器链、App 签名 Debug 公开 / 已登录 404 与法务链接；不含全尺寸像素、发布法务文本或真实 OAuth |

## 请求 / 待主会话决定 / 待用户授权

- **待主会话决定：** b1 #0/#1 的「登録は1分」「確認は1枚5秒」可信口径、演示插画是否标明样例及其按钮、前三个顶栏链接真实目标、App 欢迎页「スキップ」目的地；b1 认证画板中的 Google 未启用态、设备待恢复提示、密码与重置页面的无来源演示邮箱 / 倒计时 / 错误分型。逐项事实、推荐和影响 SC 见 `preflight-checklist.md` §「b1 #0 / #1 逐元素复核的新停点」及认证来源表。按用户指示跳过受影响 UI，不向离线用户发问。
- **请求 D：** 在 D 文件边界接 App 根级版本 / 维护拦截并证实深链不可绕过、更新页无底栏与 Toast 偏移；Web 壳以初始页面构建 ID 挂 `WebVersionBannerGate` 并实走 W-10 全矩阵。本轮 D 已交 `5bd066aad` 仅解决登录态底栏，不把它当作全局版本门禁。C 不直接改 D 壳。
- **请求 A / 组件库：** 若剩余 App 门禁差异最终定位到 kit 字号、Chip 或顶栏，A 线对照 triptych 评估；当前差异仍未归因，不能预记「待组件库」豁免。组件合入后重新跑对应视图。
- **请求共享测试归属线：** 按实际来源复核 34/40 旧链接色计数和 85/79 按钮计数；后者包括 C 维护页，C 应在画面视觉复核时确认按钮风格，而非抬高上限。Web 另外 13 个全量失败交各模块所有者按完整日志复查；App 失败清单见下方追加。
- **待用户授权（发布门禁）：** 正式支持邮箱、法律正文、生产强制更新开关、真实 OAuth / 邮件、商店地址及正式发布。未配置、未触发、未以假数据宣称已发布。
- **文档更新请求：** 主会话在 README / HANDOFF / DEFERRED-A / 决定表 / screen-ownership 登记本报告未完成项、R28 目标上限改稿及跨线旧屏引用；C 线未越界编辑这些汇总文件。

## 历史执行记录（保留原文；以下日期对应当时源码）

2026-10-19 22:45 C Web 维护页视觉矩阵：先读公开版本接口，发现本地默认 mock 返回演示版本（不含维护信号）；改用 C 专用本地服务 `ORBIT_MODULE_MODE=live`，分别验证无 `until` 与 `until=2026-10-19T03:00:00Z` 的 HTTP 200 响应确有 `maintenance.active=true`，再访问真实 `/maintenance`。手机首轮画面对照揭示缺少公开页雾面背景与 18px 边距，以及说明／日程字号和卡片内边距差异；按画板修 CSS 后，手机第三轮通过。桌面首次清单把 900px 画板与工具默认 960／880px 视口相配，导致 raw 偏高和误报缺块；清单改为显式 900px，并去掉桌面内容区多余横向内边距。两套独立清单 `web-R18b-maintenance-{unknown,until}.json` 分别记录运行前提和 6 张画板；最终各 **6/6 PASS，0 超阈、0 未归因、0 缺块**，raw 最大 0.0005，摘要分别在 `_evidence-c/R18b/maintenance-unknown-6-final-20261019/summary.json` 与 `_evidence-c/R18b/maintenance-until-6-20261019/summary.json`。版本接口／维护组件目标测试 **6/6**，其中普通 503／离线不进入维护态；这不证明全局自动拦截、App 矩阵或发布环境开关，SC-10 / 14 / 16 仍 OPEN。无真实账号、生产配置或数据库修改。

2026-10-19 22:31 C Web Help 中途态：不加产品测试开关，沿用视觉工具的真实交互步骤注册 FAQ 首项展开与搜索「領収書」无结果各 6 张（1440／1024／390 × 浅／深），R18b Web 清单由 24 增为 36 张。首轮展开 6/6；无结果首轮因搜索框仍聚焦而出现非设计稿焦点描边，脚本补点标题失焦。随后手机无结果仍红，逐字核对设计稿发现日文结果文案漏「に」；浏览器断言先 RED 0/1，补字后 GREEN 1/1。最终两态同批像素门禁 **12/12 PASS，0 超阈、0 未归因、0 缺块**，摘要在 `_evidence-c/R18b/visual-help-states-final-20261019/summary.json`。相邻 Web FAQ／公开页目标 **8/8**、`typecheck:app` exit 0、`git diff --check` exit 0。先前公开默认／法务／404 的 24 张在上一轮单独通过，本轮未重跑，不能将两个批次称为同一次 36 张全量。已登录态、维护、认证、App 视觉及全量门禁仍 OPEN；正式法务正文／支持邮箱仍是发布门禁。本轮不触生产或真实账号，不推送。

2026-10-19 21:33 C App 全量复核：21:27 首轮全量未使用项目重任务锁，因此以本轮 `/Volumes/ORICO/Dev/worktrees/orbit/_runs/heavy.sh c -- npm test` 复跑为受控结果；完整日志存于 `_evidence-c/R18b/run-01/c-app-full-route-parity-d364ad6c8.log`。结果仍为 **3,231 tests / 3,215 pass / 14 fail / 2 skip，exit 1**，失败名称与本轮首跑一致；路由对齐测试在全量内通过。`skip` 交互失败的 Playwright 日志显示提示层拦截按钮点击，受控重跑仍失败；该测试属于其他界面线，C 线未改它，也未将其解释为 R18b 已解决。14 项未清，SC-16 仍 OPEN；本轮没有浏览器／模拟器像素验收。

2026-10-19 21:27 C SC-13 路由审计修正：Web `/app/[...missing]` 以 `notFound()` 处理未知地址，App `/[...legacy]` 对未知地址显示公开 404（已知旧地址仍按迁移表跳转），二者是本线的兜底路由，但文件名不同。App `route-parity` 检查原先只认同名路径，误报 Web `'/[...missing]'` 缺少原生页面。先加真实临时路由树测试，RED 时明确报 `'/[...missing]'` 与真正缺失的 `'/brand-new'`；再仅将这两个具名兜底路由配对，GREEN **11/11**，其中真正缺失的 `/brand-new` 仍被查出，未用全局 catch-all 掩盖功能缺页。仅改审计测试文件，未改产品路由或 UI。App `typecheck` exit 0、`git diff --check` exit 0；全量测试 **3,231 tests / 3,215 pass / 14 fail / 2 skip，exit 1**，新增用例通过。本轮路由审计不再失败，但 `skip` 交互失败重新出现；相对 21:11 的 3,230 项记录，失败名称并非完全一致，不能由总数相同推断零新增失败或归因于本改动。其余失败为 R12 相机／名片 9 项、旧字典快照、discovery toggles、邀请历史、typed inbox tabs。不能称全量通过，SC-13 的路由检查局部通过，SC-16 仍 OPEN。

2026-10-19 21:19 C App 注册法务原生往返补证：`f04615fa0` 干净源码经 C Metro 8084 加载到现有 C 专用、已验证签名的 Debug 宿主（日文 iOS 模拟器），并用仅本机健康探针允许在线注册页显示。注册页可访问性树上「利用規約」「プライバシーポリシー」均为 Link、44pt 高；输入合成邮箱与 8 字符密码后，逐一点击进入公开条款／隐私占位页，再通过页内返回到原注册页。两次返回后的原生可访问性值保留完整邮箱与 8 个密码掩码点，屏幕截图也已目视核对；没有点击创建账号。健康探针日志仅有 `/api/health` 两次 200 和 `/api/auth/mobile/providers` 一次 401，无注册请求。首个离页动作触发 iOS 系统「Save Password?」提示，本轮选 `Not Now`，不将其误记为产品失败。截图 SHA、宿主 hash、进程/端口与精确清理见 `/Volumes/ORICO/Dev/worktrees/orbit/_evidence-c/R18b/native-signup-legal-f04615fa0/OWNERSHIP.md`。本轮宿主早于 JS 提交，并非同源原生重建；不证明注册提交、正式法务正文、像素／全尺寸、Google 或 SC-04 整体完成。模拟器已恢复 Light/Shutdown，API 3411、Metro 8084 均无监听，C 树不受影响。

2026-10-19 21:11 C App 注册公开法务入口与公开文案扫描：`AccountAuthScreen` 注册态新增独立可访问的条款／隐私链接，分别 push `/legal/terms`、`/legal/privacy`；未更改注册提交、Google 或安全 `next`。真实 RNW 表单交互测试先因链接缺失 RED 16/17，实施后 17/17；覆盖点击不发注册请求、当前邮箱／密码草稿仍在、登录态不显示链接、窄屏双倍字号可触达。返回后的**原生栈保留草稿尚未实走**，不能以该模拟导航测试替代 SC-04 原生操作链。新增三语短文案放进允许扩展的 `publicInfo` 域，正式法务正文仍为「公開前に掲載」发布门禁；日／中／英短文案按用户文案检查去除空泛表述。另将 App FAQ 的原三语跨语关键词与维护时间格式移入同域字典，保留原搜索命中和东京时间结果；新增关键词与中／英时区回归。App 聚焦测试 **29/29**、typecheck exit 0，硬编码文案扫描从失败转通过。完整 App 套件在最终源上 **3,230 tests / 3,214 pass / 14 fail / 2 skip / 0 cancelled，exit 1**；相对本轮更改前 3,229 / 3,211 / 16 / 2，没有新增失败名，原 16 项里硬编码扫描已修复，另一个旧交互失败本次未复现，不能把后者算修复。仍失败的 14 项是 9 项 R12 相机／名片、旧字典拆分快照、discovery toggles、邀请历史、typed inbox tabs、原生页面覆盖审计；其中字典快照固定 2253，当前非新增域键数 2921，是跨线旧门槛而非本轮新 `publicInfo` 键。`git diff --check` exit 0，`git fetch origin redesign` 后 C ahead 11 / behind 0；不推送。SC-04 / 08 / 09 / 10 仅补局部证据，SC-14 / 15 / 16 与正式发布仍 OPEN。

2026-10-19 12:47 C 已登录设置→公开帮助／法务回跳追试：新建空的 C 专用本地 DB、合成 actor 与已完成资料，真实 `/app/settings` 在 390／1440 宽度下打开后点击「ヘルプ」到公开 `/help`；签名会话直开 `/app/settings/terms|privacy` 分别 307 到公开 `/terms|privacy`，占位文案可见，再从帮助页「設定へ」返回已登录设置。首轮发现设置页异步读取正常 HTTP 200 的稀疏 `/api/profile` 时，合法可选 `handles` 缺失会触发 `Cannot read properties of undefined (reading 'email')`。在资料组件增一条稀疏资料回归测试，**RED 3/4** 正好复现该异常；仅将邮箱读取改为可选字段后，资料与相邻交互 **12/12**，同一真实浏览器链路两宽均 **exit 0／browser error 0**。Web `typecheck:app`、`typecheck`、lint 均 exit 0。完整 Web 套件仍 **7,747 tests / 7,175 pass / 27 fail / 545 skip / 0 cancelled，exit 1**；新增用例在全量中通过，但没有同一 HEAD 的 pristine 全量对照，**不宣称全量零新增失败**。完整失败名、两张截图 hash、环境归属和 exact cleanup 在 `_evidence-c/R18b/signed-settings-c4e56a03b491/OWNERSHIP.md` 与 `web-full.log`。仅本轮 DB 在 owner／workspace／3 行／连接 0 核对后按精确名称 drop，catalog 0；3410 服务停止，生成 tracked 差异复原。此结果补 SC-08 已登录 Web 设置入口／公开页返回的局部证据，不代表 App 设置链、注册同意链接、像素／无障碍／全量或 R18b 关闭。

2026-10-19 11:40 C 原生公开版本页限定追试：C 专用已签名 Debug host + 当前 JS，在日文 iOS 模拟器上直达 `/maintenance` 与 `/force-update`。本机仅回环 `GET /api/app/version` 先以 `maintenance.active=true` / `until=2026-10-19T03:00:00Z` 回 HTTP 200、三层 `no-store`，原生显示日文维护页及 `10月19日 12:00（日本時間）`；再以 `0.2.0` 最低版本、强制开关 true、维护 false 回 200，host 版本 `0.1.0` 时原生显示日文更新页。未配真实 App Store URL，更新按钮灰置并写明链接准备中，未点击。两张无开发警告遮挡的截图及 hash、端点/进程归属与 `MissingSecret` 中间件诊断见 `_evidence-c/R18b/native-version-20261019-1134/OWNERSHIP.md`。只停止本轮 C app/API/Metro，3410/8084 已空，模拟器 Light / Shutdown，签名 app/container 保留；没有数据库或账号。**直达页不等于 D 线根壳全局拦截、深链阻断、商店发布、全尺寸像素或 SC-12 总验收。**

2026-10-19 11:35 C 原生公开页日文追试：在同一 C 专用模拟器、经验证的 ad-hoc signed host 与当前 C Metro JS 上，以 iOS `-AppleLanguages '(ja)' -AppleLocale ja_JP` 启动，`orbit://removed-page` 显示日文公开 404、首页／帮助出口且无私有底栏；帮助页显示日文标题、FAQ 可展开，无匹配搜索显示空态。搜索截图仍有日文 IME 候选层且输入被转换，只证明本地空态可到达，不证明输入法关闭或精确搜索串。直接公开 Terms / Privacy 均显示日文「公開前に掲載」占位，**不代表法律正文已发布**。图片、SHA-256 和边界见 `_evidence-c/R18b/native-404-20261019-1114/OWNERSHIP.md`。本轮只终止 C app 与 Metro PID 40616，8084 已空，C 模拟器恢复 Light / Shutdown；签名 app/container 保留。无 API / DB / 账号 / 外部服务。此为签名 host + 当前 JS 的公开页限定检查，不是同源重建、已登录链、全尺寸／像素或 R18b 总验收。

2026-10-19 11:20 C 原生公开 404 / Help 限定追试：clean `d1bdb2a9f` 的当前 JavaScript 经本机 Metro 8084，先在 C 专用模拟器的旧 unsigned host 打开 `orbit://removed-page`，出现公开英文 404、无私有底栏；「See help」进入公开 FAQ，一条问答可展开，无匹配词显示空态；「Back to home」离开 404，但没有 API 时登录页上覆盖预期断网提示。该 host 报 `ERR_NOTIFICATIONS_KEYCHAIN_ACCESS` / `ERR_KEY_CHAIN`，独立签名检查发现它只是 linker-signed、Info.plist 未绑定。改装已有经 `codesign --verify --deep --strict` 的 C 专用 ad-hoc signed host（可执行文件 SHA `9ab3ead8…c4f0e92`），仍加载同一当前 JS；公开 404 的浅 / 深两态和 Help 出口再次显示，Metro 未复现上述 Keychain / sync cleanup 错误。暗→浅需重启 app 才刷新主题，故只记录重启后的两态，不称动态切换或画板 pixel 通过。证据 / 图像 hash / 资源归属在 `_evidence-c/R18b/native-404-20261019-1114/OWNERSHIP.md`。仅 C app 进程和本轮 Metro 停止，模拟器 Light / Shutdown，签名 app/container 保留，C tree clean；无 API / DB / actor / 外部 provider。此结果不证明已登录壳、日文文案、精确同源 native build、全尺寸或 SC-16。

2026-10-19 09:50 404 / 维护 HTTP 合并复跑：`run-not-found-http-smoke.zsh` **exit 0**。匿名 `/removed-page` 和这次的 `/app/removed-page` 均返回 404；三种桌面 / 手机、浅 / 深浏览器场景均看到公开 404、安全首页与帮助出口，无私有壳或横向溢出，点击帮助成功。维护的未知时刻、有效 UTC 转东京时间、503 不误报也再次实走；匿名 `/app/settings/help` 正常 307 到登录并保留安全 `next`。Next 流式 `not-found` 允许分段页返回 HTTP 200，因此脚本在该情况另要求 `noindex` 与可见 404；这次实际仍是 404，不能外推所有冷启动状态。Web / App 当前树类型检查均 exit 0，`git diff --check` exit 0；这些不代替已登录壳、App 原生导航、像素矩阵或全量验收。

2026-10-19 W/A-08 404 切片（原生与完整像素门禁仍未过）：App `[...legacy]` 现在仅把已知旧深链映射到目标，未知或畸形路径显示公开 404，不再静默回 `/home`；首页出口按会话选 `/` 或 `/home`，帮助指向公开 `/help`，404 本身无底栏目标。Web 根 `not-found` 与 `/app` catch-all + 分段 `not-found` 返回公开 / 已登录两种内容，已登录 `/app` 由现有壳承载，公开态不挂私有壳。App 路由 / 内容与旧路由审计 **13/13**，Web 组件 / CSS token **4/4**，两端当时的 typecheck exit 0；三语 App `publicInfo` 当时 **26 条 / 0 告警**，Web copy-qa 仍为 26 个其他域既有告警。匿名 HTTP `/removed-page`、`/app/removed-page` 均为 **404**；首版脚本因只在初始 HTML 找 `/app` 分段链接 exit 1，修正后 Chromium 的公开桌面浅色、手机深色和匿名 `/app` 手机浅色 **3/3** 显示 404、首页 / 帮助出口、无私有壳和横向溢出，点击帮助到 `/help` 均成功。该次合并脚本最后 **exit 1**：它错误地要求匿名 `/app/settings/help` 直接跳 `/help`，实际认证门禁先 307 到登录并保留安全 `next`；已修正匿名预期并排队整体复跑，已登录设置别名仍未实走。App 原生导航、已登录 Web 壳、全矩阵像素与全量仍待验。09:28 半小时监视发现系统盘约 2.0 GiB（安全阈值 5 GiB），重任务排队暂停；未清理他线数据或把失败脚本记作通过。

2026-10-19 W/A-09 维护与 A-10 强制更新切片（工作树，非全局拦截验收）：Web 公开 `/maintenance` 仅在 `GET /api/app/version` 成功且 `maintenance.active===true` 后显示，缺失／非法 `until` 给未知时刻，合法 UTC fixture 格式化为 `10月19日 12:00（日本時間）`；重试信号解除返回安全首页，普通 503 / 网络失败不渲染维护。纯逻辑 / 组件与 CSS token 目标 **5/5**，浏览器未知时刻、有效时刻与 503 **3 场景已实走**，截图留 `_evidence-c/R18b/run-01/maintenance-phone-*`；上述合并脚本仍因设置别名断言 exit 1，不把整体记绿。App `/maintenance` 与 `/force-update` 都在直接打开时重新读取公开版本政策；非对应信号退出，强制更新开关仍由服务端缺省关闭。App 内容 / 策略 / 路由与离线清单目标 **16/16**、新 `publicInfo` **38 条 / 0 告警**；Web 全域 copy-qa 仍为原有其他域 26 项。App Store 正式页面 URL 未提供，故只接受 `apps.apple.com` 的真实 listing 链接，缺配置时升级按钮明确禁用，发布门禁与 SC-12 不得关闭。b12 按钮原文「App Store でアップデート」超过现有 button 文案上限，运行时暂用较短的「ストアで更新」并保留画板原文；属已批准画板与拷贝门禁冲突，像素重比 / 最终措辞待主会话代定。App 根壳的全局版本拦截归 D 线，本线没有越界编辑；因此直接深链仍可能绕过强制更新，SC-10/12/15 尚未通过。Web 当前树 `typecheck:app` exit 0；App 加强制更新后的最终 typecheck 在运行，未记通过。无真实发布开关、App Store URL 或生产变量写入。

2026-10-19 RD-33 主会话代定：`preflight-checklist.md` 已补的公开帮助 / 法务、404、维护和 App 强制更新画板及预检记录获准作 UI 实施依据；b12 末尾补画已有「主会话代定」注释，并补记本次认可范围。此批准**不是**交互、像素或发布门禁通过，Web 新版浮条及 b1 其他认证 / 欢迎冲突仍照原停点处理。b1 #9 原画板的「英字と数字を含む」「以前と異なるパスワード」两条没有服务端 / App 支撑的实时勾选已原地删除并注释，只留下真实的「8文字以上」，未加新密码策略。删除前聚焦断言预期红、删除后绿；同板 `board-preflight.mjs --design b1-onboarding-cards.html --board-index 9` 重跑 exit 0：1 块、近似 token 0、自洽提示 0、疑似无功能 0，7 项缺 token 中含模拟机外框与字距，仍须按既有 token/kit 归属核对；深色与邮箱 / 自动登录等独立冲突仍 OPEN。此轮不跑两端全量，按用户要求留收口时执行。

2026-10-19 W/A-11 首个 UI 切片（工作树，尚未收口）：Web 根级 `/help`、`/terms`、`/privacy` 匿名 HTTP 200，帮助 FAQ 本地搜索 / 展开、邮箱 null「準備中」、法务「公開前に掲載」；Web 设置三个静态段仅跳公开地址。Web 渲染 + 搜索目标 **7/7**，390 浅 / 深浏览器交互 **1/1**，匿名 HTTP 三路均 200 且无虚构 `mailto:` / 发送成功入口，最终工作树 `typecheck:app` exit 0；新 Web 文案定向 copy-qa 0 项，整域仍有 26 项既有告警。App 新 `/help`、`/legal/{terms,privacy}` 不包私有路由，设置三段静态跳公开页；内容渲染 **3/3**、新增 `publicInfo` 文案 **23 条 / 0 告警**、路由覆盖 **1/1**、route parity **10/10**、离线清单 **5/5**、公开路由政策 **1/1**；App 当前工作树 `typecheck` exit 0。App i18n 固定拆分快照仍 **2/3**，固定旧键数 2253、现为 2921（新 `publicInfo` 已加入排除域）；属此前已登记的跨线快照 ratchet，不能算绿。两端真实设置返回 / 注册同意链接、App 原生操作、公开页全尺寸像素及两端全量仍待收口。首次 HTTP 脚本因 zsh `status` 只读变量在取码前中止，修正后复跑才取得上述 200；测试 Next 服务已停，自动生成的 `next-env.d.ts` / `tsconfig.json` 差异已恢复。磁盘一度剩约 3 GiB，重任务队列暂停；未清理他线数据。

2026-10-19 04:22 补充：C 线在干净检查点无冲突 rebase 到 `origin/redesign d8e6dafb7`，R18a 独立复核四补丁的新提交及目标验证见其 REPORT。此处没有新增 R18b UI：b12 公开页／认证／404／维护／更新草案仍待主会话设计认可。新源 App `typecheck`、Web `typecheck:app` exit0；C Web invite/route 17 pass、14 个未配置 PG 的预期 skip，App Metro/sync 54/54。这些不替代 R18b 全量、真实认证链、像素门禁或设计批准。

2026-10-18，C 线 `line-c`。本 Sprint 的入口、认证、帮助、异常与像素验收均未收口；以下只记录已验证的独立工作项，避免把局部测试误写成 SC 全通过。不推送、不触碰生产环境。

2026-10-19 01:34 检查点：三份公开页 / 异常态画板草案以 `88424a08f` 单独提交，仍待主会话设计认可。C 线随后把 62 个提交无冲突 rebase 到 `origin/redesign` 的 `6ea769085`，再接入隔离原生重试报告；重试交接点 `715a8478a` 干净，ahead 63 / behind 0，`git diff --check` exit 0。该代码的 Web `typecheck:app` 和 App `typecheck` 均 exit 0；rebase 后 Web 版本接口 / 认证服务 / FAQ 目标测试 17/17，App 版本策略 / 读取 / FAQ / 认证 view-model 15/15。全量测试没有因 rebase 重跑，旧全量红色结果仍在下文。R18a 报告已写清 Metro `load-native` 阻断、非已证实的签名故障，原生 SC03–06 / 像素留待 DEFERRED；R18b 继续，不能据此关闭任何 UI 门禁。主会话需把 R18a DEFERRED 文案转入中央清单。

2026-10-19 02:11 检查点：主线上游接入 D 至 `2b95b1ac1` 后，C 在干净树上重新 rebase 65 个提交，现 `79d7ef01f`，ahead 65 / behind 0，`git diff --check` exit 0。四处冲突按来源合并：契约导出保留 D 的 Todo / calendar 与 C 的 account；三语注册同时保留 Todo 和 me；离线读取面删除已退役的旧 Profile 路径，保留新 me 与 D 的 Task / Todo 路径；live 能力和 503 路由清单同时纳入 D 与 C 条目。Web 版本 / live 路由 / 认证 / FAQ 目标组 **35/35**，App 契约 / 版本 / account / 离线读取面 **39/39**。全量不在此时重跑；两端 typecheck 因本机内置盘降至约 4.1 GiB 暂缓，不能借用上一个上游的通过记录。R18a 原生重试报告已随 C 线保留（现 `3143ad390`），Metro `load-native` 阻断与设计认可门禁不变。

2026-10-19 02:18 检查点：B 线 R11b 接入 `origin/redesign bf1aac746` 后，C 再从干净树 rebase；重复的页面清单文档提交被 Git 自动略去，现 C ahead 65 / behind 0。冲突中同时保留 B 的 `networkAnalysis` 与 C 的 `me` 三语／copy-qa 注册及 live 能力；离线页面清单由仓库生成器重建为 **121 条**，对应测试通过。最终上游的 Web 版本 / 合同路由 / FAQ **24/24**；App 契约及页面清单等 **13/14**，唯一失败是已有的拆分前字典固定键数锁（现 2902，固定值 2253），三语键集一致性本身通过。Web `typecheck:app` 在这次 B rebase 之前 exit0，不能算最终树验证；最终树 App `typecheck` 因同机 B / A2 并行检查使内存降到 5%、内置盘约 4.45 GiB，由本线主动中断 **exit130**，未通过也未失败于类型诊断。待资源恢复重跑，未重跑全量。

02:28 复验：同一 B+D 上游的 C 工作树中，App `npm run typecheck`、Web `npm run typecheck:app`、Web `npm run typecheck` 及 Web `npm run lint` 均重跑 **exit0**。前述 App exit130 保留为资源中断记录；Web 全范围检查在内置盘再跌到约 3.8 GiB 时已经自行完成，停止指令到达后返回的原命令状态仍为 exit0，并无类型诊断。两端完整套件未在这次 rebase 后重跑；不能据此关闭 SC-16。

02:38 补核 D 已合入的 App 根壳：`root-shell-auth-render`、认证 view-model、初始路由、me 路由与全 App 路由登记共 **30/30 pass**。其中根壳用例确认会话未成立时不挂底栏及底栏高度 Toast；邀请与重置入口的安全回跳仍通过。它是 C+D 合并后的源码／渲染目标回归，不包含真实注销→登录操作或原生像素，SC-15 仍未收口。

02:45 上游 R13 秘书预览契约 `306f32224` 到达后，C 在干净树上无冲突 rebase 69 个提交；Web 秘书预览契约／接口与版本接口目标测试 **8/8**、App 契约 fixture **3/3**，Web `typecheck:app` / `typecheck` / `lint` 和 App `typecheck` 均 exit 0，`git diff --check` 无告警。未重跑完整套件，R18b 设计认可、UI 操作链、像素和 SC-16 仍未收口；未推送。

## 当前检查点

| SC | 状态 | 实际证据 / 未完依赖 |
| --- | --- | --- |
| SC-01 开工 / 预检 | 部分完成 | C 线已确认 R18a 设置占位存在；b1 #0–#9/#60 与 b7 #52–#61/#75/#82 的标题、类型、尺寸已列出。原稿 23 块自动预检的自洽提示均为 0。按 PLANNER §2 已就地修 b1 #0 / #1 的目标数和 b7 12 块帮助、反馈、404、维护、更新画板的虚构承诺，改后两组重跑均为 0 项数值不自洽。b12 末尾新增公开帮助 / 法务、公开 / 已登录 404、维护未知 / 有效时刻、App 强制更新与 Web 新版浮条草案：Web 1440 / 1024 / 390、App phone，已补画处各浅 / 深。W/A-11 的 29 块代表、404 的 14 块、维护的 16 块、强制更新的 2 块与新版浮条的 6 块自动预检均近似 token 0、自洽提示 0；缺 token 均为模拟设备 / 外框 / kit 值，窄屏 / 桌面截图已核。草案需主会话复核认可；其余 b12 断点 / 中途态、全量逐元素映射、五项通过与独立草案提交已完成，设计认可仍未完成；任何 UI 门禁未过。详见 `preflight-checklist.md` 与 `_evidence-c/R18b/run-01/preflight-{public-v2,404,maintenance,force-update-final,web-version-final}*`。 |
| SC-02 Web 落地 | 会话路由切片已实现，Sprint 验收未收口 | 已登录打开 `/` 会先 307 到 `/app/home`；`/app` 页面本身也以首页为目标，但未完成资料的账号先被全局资料门禁送至 `/app/profile/onboarding?next=%2Fapp`，不能笼统称两条路径始终同去首页。未登录仍显示既有落地页。路由源码断言先红后绿，`app-home-live-route-services.test.ts` 16/16、`smoke.test.tsx` 1/1；本机模拟模式匿名 `/`、`/app` 均 HTTP 200 且 HTML 含落地页标记，进程内假账号的上述登录态跳转也已实走。资料完整账号、新 b1 视觉、弹层与全尺寸门禁尚未验证。 |
| SC-11 live 版本接口 | 服务端切片已实现，Sprint 验收未收口 | `GET /api/app/version` 已从 `account-lifecycle` 分出独立 `app-version` live 能力；mock 仍读演示世界，exports / deletion 的 live 仍返回 `NOT_IMPLEMENTED`。服务端环境变量读取合法 semver；缺失、非法或颠倒的版本范围会关闭强制更新并记服务端诊断。仅 `maintenance.active` 显式 true 才返回维护，非法 `until` 不透出；`webBuildId` 只取合法 `VERCEL_GIT_COMMIT_SHA`。响应沿用 no-store 信封，不建表。新增可选字段已同步 App，契约快照已重生。相关 Web 路由 / 契约 34/34、App 同步 / fixture 6/6；当前树 Web / App typecheck 与 Web lint exit 0。当前 C 树本地匿名 HTTP 200 / no-store 已实走；最新 Web 全量明确指定本机测试库后为 7,482 项、11 失败、529 skip，旧的 33 失败是未配置测试库的另一种运行条件，不是 22 项产品修复；具体新增 PostgreSQL 失败见下。最新 App 全量 exit 1，11 fail / 1 cancelled，原两项 C 清单审计与认证提示语言回归均通过，不能宣称全量绿。 |
| SC-09 FAQ / 联系 | 两端公开页面切片已实现，Sprint 验收未收口 | `supportEmail: null`；Web / App 公开 Help 和法务占位页已接，Web 390 浅 / 深操作与匿名 HTTP 三路通过（冒头 W/A-11）。C 原生 signed host + 当前 JS 已实走日文公开 404 / Help / FAQ 展开 / 搜索空态及 Terms / Privacy 占位；搜索截图有 IME 覆盖，未完成无障碍与像素检查。正式支持邮箱 / 法务正文仍是发布门禁；注册 / 设置来回、全尺寸日文与像素矩阵未验收。 |
| SC-06 深链 / 邀请 | 既有安全路径回归通过，Sprint 验收未收口 | Web `app-auth-routing` / `invite-codes-return-path` 9/9；App `account-auth-view-model` / `initial-route` 22/22。站内 `next` 白名单、外域 / 协议相对路径回退及 `/i/<code>` 保留已获测试证据；新认证 UI 实走与注册后完整链仍待。 |
| SC-07 Google mobile broker | App 注册页成功回跳缺陷已修，Sprint 验收未收口 | 注册页 Google 成功原误走邮箱注册的「回登录」规则，测试先红（15/16，实际 `/account/login?created=1&email=…`），改为与 Google 登录同走 `/profile/onboarding?next=…` 后认证交互 16/16；App 路由 / broker 相关目标测试 34/34、Web 服务 / 路由 / 加密目标测试 24/24，App typecheck exit 0。取消、错误与安全 `next` 既有目标回归通过；真实 Google 授权、原生模拟器成功 / 取消及新 UI 画板尚未验收。 |
| SC-05 重置与邮件 | HTTP / 本机真实库回归通过，Sprint 验收未收口 | `password-reset.test.ts` 的 HTTP 目标组覆盖同源 / 无 Origin、非法正文、未配置、无效 token、错误脱敏、no-store / no-referrer；UTF-8 多字节超过 4096 字节时须在服务前返回 413。伪造短 `Content-Length` 的分块上传原会读完整个 16 块才拒绝，改为超过 4096 字节即取消后回归通过。当前目标文件在明确指定 `127.0.0.1:5432/orbit_line_c_test` 后 **46/46 pass、0 skip**，含持久化 / 重试 / 单次消费 / 旧会话撤销，随机隔离 schema 残留 0。Web typecheck / lint exit 0；全量新增测试通过但套件仍红。新 UI、实际邮件投递与完整回跳仍未验收，不写全通过。 |
| SC-03 注册枚举差异 | 服务与本地库 HTTP 回执回归通过，现有 Web 注册法务链接接通，Sprint 验收未收口 | `auth-user-service.test.ts` 11/11：注册重复邮箱明确 `AUTH_EMAIL_TAKEN`，登录未知邮箱与错误密码同为泛化错误；新注册拒绝超过 72 UTF-8 字节的密码，避免 bcrypt 静默截断。隔离本地库的密码找回测试新增密码账号 / 未注册邮箱 / 仅 OAuth 账号经真实服务与 HTTP handler 的回执等价断言，目标组 1/1。现有 Web 注册弹窗的条款／隐私文字已接公开路由，生产构建浏览器中打开新标签后原表单输入保留（详见下文）；新 b1 视觉、App 注册链接与既有超长密码账号兼容策略仍待处理。 |
| SC-12 版本策略 | 判定 / 公开页切片已实现，Sprint 验收未收口 | App 版本 / 维护判定、公开读取、Web 浮条纯身份比较有定向回归；Web 维护两态 / 503 已实走。C 原生 signed host + 当前 JS 在本机 live 版本信号下直达日文维护 / 强制更新页，东京时间显示正确、无商店 URL 时更新按钮禁用；详情见冒头追试。App 根壳全局拦截归 D 且未实走，真实商店 URL / 发布开关未提供；Web 新版浮条呈现 / 持久关闭未实现。画板与发布 gate 仍 OPEN。 |
| SC-08 404 | Web / App 已登录路由与出口补验，Sprint 验收未收口 | Web 匿名 HTTP 与浏览器浅 / 深 404、Help 出口已通过（冒头 09:50）；当前 C 源码独立原生构建并签名，在新建 iPhone 模拟器以当前 JS 实走公开日文 404 浅／深、Help / FAQ 与返回（见下文）。当前 C 生产 Web 构建以本机合成账号在 390 / 1024 / 1440 的浅色与深色实走 `/app/removed-page`：HTTP 404 / noindex、已登录壳、Help `/help` 和 Home `/app/home` 均通过，未捕获浏览器异常；本轮补查的四档另验无横向溢出。开发构建有 React 性能追踪异常，详见下文。同一精确源码签名 App 的本机合成账号已登录链也在单台 iPhone 实走：日文未知深链浅／深、Help 返回、Home 回已登录壳均符合路由目标；注销的通知清理 404 另列限制。逐像素、无障碍与 App 全尺寸门禁仍 OPEN。 |
| SC-04、10、13～16 | 未完成 | 认证完整操作链、旧屏清理、D 线底栏集成与 Web 浮条、逐像素矩阵、两端全量及独立复核尚未交付。SC-02 / 03 / 05～07 有上列局部证据，但各自操作链仍未收口。 |

## 版本配置与安全边界

- `ORBIT_APP_MIN_SUPPORTED_VERSION`、`ORBIT_APP_LATEST_VERSION`：服务端 semver。各字段缺失 / 非法时各自返回 `0.0.0` 作为安全兜底；未配置最新版本不会虚报有新版本，绝不用演示世界的 `1.0.0` / `1.2.0` 假装 live。
- `ORBIT_APP_ENFORCE_MINIMUM=true`：只有两个版本都合法且最小版本不高于最新版本时，响应才返回 `enforceMinimum: true`；否则返回 false 并记诊断。正式发布前保持未配置 / 关闭；此处没有写生产变量。
- `ORBIT_APP_MAINTENANCE_ACTIVE=true`：才返回 `{active:true}`；`ORBIT_APP_MAINTENANCE_UNTIL` 只有合法时间才附上。普通 503、断网与此无关。
- `VERCEL_GIT_COMMIT_SHA`：合法 Git SHA 才作为 `webBuildId`；它是相等 / 不等标识，不作字典序版本比较。前端新版浮条尚未实现。

## 本轮验证与诊断

版本路由新测试 `tests/api/app-version-route.test.ts` 初跑因 live 未注册返回 503，3/3 预期红；接线后 3/3 绿。随后补入「latest 缺失或低于 minimum 不可强制」和「缺 latest 不虚报新版本」断言，各自先红后绿。原 `redesign-contract-routes` 测试先如预期因 app/version 不再 503 失败，更新既有能力清单后通过。集中运行 `app-version-route`、`redesign-contract-routes`、`demo-world-consistency`、`contract-append-only`、`redesign-schema-parity` 合计 34/34 通过；最后的版本微调又重跑版本 / 路由 21/21。App `contract-sync` / `contract-fixtures-parse` 6/6 通过，`git diff --check` 无问题。

2026-10-19 复核同一版本接口 / 契约组 Web 34/34、App 同步 / fixture 6/6，两端 typecheck 与 Web lint exit 0；服务端 live、契约快照和 App 同步副本按 11 条确定路径提交为 `27ed82e2d`，`git show --stat` 已核未夹带 App 启动判定、FAQ 或画板文件。该提交不代表版本门禁已挂根布局，也未推送。最新 Web 全量与跨线日期 fixture 结果见下，SC-16 仍红。

独立新增的支持配置测试初跑因模块缺失失败，补入 `supportEmail: null` 后 1/1 通过。App 版本策略 / 读取两组测试均先红（模块缺失）后绿，合计 5/5；其中真实 `OrbitApiClient` 对 503 和 `fetch` 抛错均返回可放行诊断。App 新代码之后 `npm run typecheck` exit 0；Web 在支持配置加入后再跑 `npm run typecheck` exit 0。两端全量均已按公平重任务队列排队，尚无结果。它们是底层切片，不是 App 启动链或 UI 验收。

随后补了非法日历日期 `2026-02-31` 回归：服务端 / App 测试先各失败一次（原实现依赖会顺延日期的 `Date.parse`），改用现有 Zod 日期约束后两端目标测试各 3/3 通过，非法恢复时刻不再透出。App 还补测可选开关 / 维护信号类型错误，先红后绿；两组版本测试合计仍为 5/5。修正后 App 与 Web typecheck 均再跑 exit 0；最后一次 App 可选字段微调后再跑 App typecheck exit 0，Web lint exit 0。

2026-10-19 再验 App 版本判定、公开接口读取与离线清单审计三组测试，合计 28/28 通过；App typecheck exit 0，改动路径的 `git diff --check` 与暂存检查均无问题。判定 / 读取 / endpoint 登记 / 不落离线镜像这 7 条路径已按路径提交 `0678911d4`，`git show --stat` 核对无画板或未完成 UI 文件。此提交只交 SC-12 底层切片；根布局门禁、强制更新页、Web 浮条及完整验收仍未完成，未推送。

不改代码的既有安全回归：Web `app-auth-routing` / `invite-codes-return-path` 9/9，App `account-auth-view-model` / `initial-route` 22/22；密码恢复 HTTP 目标组 39/39。该批回归尚未覆盖真实库，故随后另做下列隔离库验证；新界面端到端仍未做。

随后在确认为本机的 PostgreSQL `orbit_line_c_test` 上，仅运行 `password-reset.test.ts` 的真实库目标用例 1/1 通过（约 2.9 秒）：随机临时 schema 内核对令牌持久化、不把明文写入记录、投递重试、并发单次消费、密码替换、旧会话撤销、31 分钟过期和被后续请求取代。测试 finally 清理后直接查询 `information_schema.schemata`，`password_reset_%` 残留数为 0。此为本地存储边界，不是线上 SMTP / OAuth 或新 UI 操作链。

续跑既有 `auth-user-service.test.ts` 10/10：注册重复邮箱可辨 `AUTH_EMAIL_TAKEN`，登录未知邮箱与错误密码给相同泛化错误。其后在 `password-reset.test.ts` 原有随机 schema / 本地库测试中补充密码账号、未注册邮箱及仅 OAuth 账号的实际 `handlePasswordResetRequest` 回执比较：三者经真实 `createPasswordResetService` 均为 HTTP 202、`no-store` 且 JSON 信封完全相同。只指定本机 `127.0.0.1:5432/orbit_line_c_test`，最终目标组 1/1、Web typecheck exit 0，finally 清理后 `password_reset_%` schema 残留 0；没有真实邮件投递。此证据补足找回请求的 HTTP 枚举边界，不代替新 Web / App 表单的操作验收。

SC-07 的 App 注册页 Google 入口使用同一 broker，但成功后调用了邮箱注册共用的 `nextHrefForAccountAuthSubmit({ mode: "signup" })`，会把已经登录的 OAuth 用户送回 `/account/login?created=1&email=…`，而不是先完成资料再回安全 `next`。在真实 `AccountAuthScreen` 的浏览器交互测试中新增注册页场景，初跑 15/16、唯一失败的实际地址为 `/account/login?created=1&email=&next=%2Fevents%2Fevent-1%3Ftab%3Ddetails`；只把 Google 成功分支改用已有登录完成规则，保留邮箱注册原规则。复跑 16/16；App `mobile-auth` / `account-auth-view-model` / `mobile-route-access` 34/34、App typecheck exit 0；Web `mobile-auth-service` 8/8、`mobile-auth-routes` / `mobile-auth-crypto` 16/16。上述只证明本地 broker 与模拟边界，真实 Google 授权及原生成功 / 取消录像仍未跑，设计批准与像素门禁也仍未过。

续查请求体上限发现 HTTP 头以字节检查 4096，而读完整正文后的防伪造头兜底误用 JavaScript 字符数。测试以仅 2012 字符、实际 6012 UTF-8 字节的多字节 JSON 和伪造 `content-length: 2` 复现：原 handler 意外进入服务并返回 202（预期 413）；把兜底改为 `Buffer.byteLength(raw, "utf8")` 后，请求 / 确认两操作都在服务前拒绝。HTTP 目标组 39/39，明确本地库地址后整个 `password-reset.test.ts` 45/45，结束后临时 schema 0；Web typecheck / lint exit 0。此为请求大小边界修复，不改变找回枚举回执、令牌时效或实际邮件交付状态；该改动晚于首次 Web 全量，已纳入下文第二次全量复测。

SC-02 的根路径会话分流：先把 `app-home-live-route-services.test.ts` 改成要求 `/` 已登录显式跳 `/app/home`，预期红（15/16）；在 `app/page.tsx` 加 `redirect` 后 16/16 绿，匿名落地组件固定传 `authenticated={false}`。同步更新旧冒烟断言，Web `smoke.test.tsx` 1/1 绿；语言选择与安全回跳两组再跑 10/10。第一次冒烟命令误用 App 专属 preload、在加载前失败，已按 Web 脚本重跑，错误不算产品失败。随后在当前 C 树的独立 127.0.0.1:3410、本机 mock 模式且不配置数据库或 Google 凭据的 Next 开发服务中，对匿名 `GET /` 与 `GET /app` 实走：两者均 HTTP 200、HTML 均含 `data-orbit-real-page="landing-0918"`。首次启动默认同时监听局域网，立即停止且未请求；重启显式绑定 loopback 才执行上述检查。

同一 loopback mock 服务里又用临时内存注册的 `.test` 假账号走真实凭据回调：注册 201、回调 200、会话 200 且有账号 ID。首次诊断脚本把 Next 的相对 `Location` 误断为绝对 URL，并错误预期未完成资料的 `/app` 一定直达首页，故脚本 exit 1；其实际响应已表明 `/` 为 307→`/app/home`，`/app` 被资料门禁 307→`/app/profile/onboarding?next=%2Fapp`。对照 `proxy.ts` 的门禁范围与来源后，另用新内存假账号重跑并以准确响应断言，脚本 exit 0：`/` 307→`/app/home`，继续取 `/app/home` 307→`/app/profile/onboarding?next=%2Fapp%2Fhome`，直接取 `/app` 307→`/app/profile/onboarding?next=%2Fapp`。这是未完成资料账号的真实本机 HTTP 链，不证明资料完整账号会进入首页，也不证明新落地视觉或私有页面操作链。`profile-onboarding-access.server.ts` 在非 live 模式固定返回 `unavailable`，因此 mock 账号不能用于验证「资料完整→放行」；这需要另经授权的隔离本机 live fixture，不能借以前锁定旧源码 / 模拟器包的授权越界。验证后服务停止、3410 无监听，Next 自动改动的 `next-env.d.ts` / `tsconfig.json` 已恢复受跟踪原值。独立生成的忽略目录 `.next-line-c-r18b-route` 约 107 MB 仍保留，删除被工具安全策略拒绝，未绕过；假账号只在该进程内存中，关服后不保留。

2026-10-19 再跑当前 C 树的入口 / 首页目标文件，`app-home-live-route-services.test.ts` 与 `smoke.test.tsx` 合计 **17/17 pass**；Web typecheck / lint 同轮 exit 0，三条入口源码 / 测试路径 diff 检查无问题。根路径会话分流按路径提交 `0d9baba24`，`git show --stat` 核对未夹带其他页面或画板；未推送。此前 loopback 的未完成资料账号证据仍是此行为的操作链边界，不能把该提交算成资料完整用户或新设计稿画面的验收。

Web 浮条条件纯函数 `shouldShowWebVersionBanner` 的测试初跑因模块缺失失败，补实现后 1/1 通过：页面 / 接口缺任一构建 ID 不显示，相同不显示，不同即显示（即使新 SHA 字典序更小）。D 线壳挂载与关闭行为尚未实现；此结果不能当作 Web 浮条整体验收。

续补「关闭后同一目标构建不循环、目标构建改变可再提示」测试，先红后绿；浮条判定合计 2/2。当前只提供目标构建 ID 比较条件，实际关闭状态持久化仍属 D 线壳呈现工作。公开帮助草案 FAQ 的名片答案也已按 `ScanBatchScreen` 的可编辑 / 自动确认事实收窄，并在预检表新增 W/A-11 逐元素来源核对；仍待主会话设计认可。

该 FAQ 改稿后的 b12 自动预检第一次重跑在 Playwright 加载设计稿时 30 秒超时，未取得新结果（`_evidence-c/R18b/run-01/preflight-public-copy-check.log`）。旧 `preflight-public-final` 只对应改稿前草案；待共享浏览器负载下降后有界重试，未将本次失败写成通过。

复核 W/A-11 的已登录设置入口时发现草案顶栏仍显示「ログイン」。已在 b12 原有 40 块之后追加 W-R18b-11H/T/P-auth 的 Web 1440 / 1024 / 390 浅深变体（18 个视觉画框），顶栏动作标为「設定へ」；原 #548–#587 不移动。HTML 两段内联脚本可解析，浏览器列板确认新增 #588–#605 的标题、宽度与主题；390 帮助及 1440 条款草案截图已目视核对。随后 29 块浅色代表的 `preflight-public-v2.{json,md,log}` exit 0：近似 token 0、缺 token 86（均为画框 / 模拟设备 / kit 顶栏值）、数字不自洽 0、疑似无功能 15（均为本地 FAQ 搜索输入）。前一次加载超时仍保留失败日志。自动预检不代表五项人工预检、设计认可或 UI 验收。

404 的旧 b7 Web #59 带私有侧栏，无法直接用于未登录未知路由。已在 b12 尾部补 A-R18b-08 与 W-R18b-08 公开 / 已登录草案 #606–#619，Web 1440 / 1024 / 390 与 App phone 均有浅 / 深；公开 Web 无私有导航。修正了图标过小与 390 文案孤行，App、Web 公共 / 私有 390 截图已目视复核。14 块浅 / 深画板的 `preflight-404.{json,md}` / `preflight-404-dark.json` 均 exit 0：每组近似 token 0、缺 token 19（4 个 Web 画框阴影，15 个模拟手机外框值）、数字不自洽 0、疑似无功能 0。此为待主会话独立设计认可的草案；App 已登录 404 是否复用无底栏画框仍待确认，未知路由 UI 未实现。

`preflight-checklist.md` 已把 W/A-08 与 W/A-11 跨断点重复元素合并为逐项来源表：404 触发 / 首页 / 帮助 / 会话外壳，三条 FAQ 的能力依据、本地搜索与无结果、联系邮箱 null、法务占位和公开导航。来源清单不代替尚未到位的页面操作链、设计认可或发布文本授权。

维护页依 b7 #55 / #60 在 b12 末尾补 #620–#635：App phone 与 Web 1440 / 1024 / 390 均浅 / 深，分别演示 `maintenance.active=true` 无有效 `until`、以及有效 `until=2026-10-19T03:00:00Z`。第二态显示 `10月19日 12:00（日本時間）` 只作为设计 fixture；真实页面必须按接口值与时区格式化。代表浅 / 深截图目视核对，16 块 `preflight-maintenance.{json,md}` exit 0：近似 token 0、缺 token 48（8 个 Web 外框阴影、40 个模拟手机外框值）、数字不自洽 0、疑似无功能 0。逐元素来源与普通 503 / 离线边界已记 `preflight-checklist.md`；仍为未认可草案、没有维护 UI 操作链或像素门禁。

App 强制更新依 b7 #56 在 b12 尾部补 #636–#637 浅 / 深画板：只展示 `enforceMinimum=true` 且当前版本低于最低版时的阻断态，唯一出口为 App Store，不含关闭、版本号、更新日志或数据不会丢失等未经验证承诺。首次截图发现卡片孤行、按钮未贴底，已把说明收短并将唯一按钮贴于底部，最终两张截图目视核对。最终 `preflight-force-update-final.{json,md}` 两块 exit 0：近似 token 0、缺 token 10（每块 5 个均为模拟手机外框 / 系统状态栏值）、数字不自洽 0、疑似无功能 0。文案精简按日文用户文案检查执行；仍为待认可草案，启动门禁和真实页面未实现。

Web 新版浮条依 b7 #61 在 b12 尾部补 #638–#643：1440 / 1024 / 390 各浅 / 深。设置页背景仅用于观察全局浮条的位置，不声称输入已保存；浮条给「あとで」关闭与用户主动「再読み込み」两个动作。首轮截图显示 `pop` 样式在新画板组不生效、原 R18a 设置列表同样失去该组专属 `srow` 样式，已从计算样式确认根因，改用自足卡片和简单的设置背景；390 的浮条再上移至与底栏相隔 4px。日文说明删去孤行并保留重载前确认输入内容的提醒。后续读图发现说明沿用 `--ink-3` 时浅 / 深对比仅 2.90:1 / 4.06:1；针对六张真画框的只读对比断言先红，再仅把浮条说明改为 `--ink-2`，重跑分别达 6.85:1 / 7.91:1，六张均超过 4.5:1。最终六图重新捕获、390 浅 / 深目视复核，`preflight-web-version-final.{json,md}` 再跑 exit 0：近似 token 0、缺 token 14（4 个 Web 外框阴影、10 个模拟手机外框值）、数字不自洽 0、疑似无功能 0。此为草案，仍待设计认可和 D 线壳实现；纯函数 2/2 不能代替真实关闭 / 重载链。

SC-13 旧屏引用预审（只读，未删除）：`OrbitLanding0918` 仍由根 `/`、`/app` 及登录 / 注册 / 找回 / 重置四个公开认证路由直接渲染；四个认证路由还直接引入 `account/auth-0918/auth-modal.tsx`。新链路未接通之前删除两者会切断现有入口。`orbit-real-landing-page.tsx` 在 `app/` 内无运行时进口，但页面测试仍引用其源码，需等新落地替换后同步测试 / 清单再删。`orbit-landing-route-view-model.ts` 仍供首页、活动、公开事件与组织者模型使用，不能随落地页直接删除；`orbit-reference-styles.tsx` 在 `app/` 的 39 个 TS/TSX 文件中被引用或定义，涉及任务、活动、设置及联系人，C 线只能在替换自身页面后解除自己的引用。以上按 PLANNER SC-13 保留，非“旧屏清理已完成”；未触碰其他线模块。

b1 W/A-02～05 做了现有认证链路的只读来源预审，已将登录、注册、找回、重置的 Web / App 请求和回跳对应关系补入 `preflight-checklist.md`。发现 Web 旧找回成功卡虽然附有“受理不等于送达”说明，主标题仍称链接“已发送”；新稿须统一为受理语义，并保持找回对邮箱存在性的同响应。另发现 b1 #9 两条实时密码要求（英数字混合、与旧密码不同）在服务端和 App 校验均不存在；推荐先从新画板移除虚构勾选，若要新增真实策略须主会话另行授权。此项是设计 / 行为冲突登记，不表示四态预检通过，也未写新认证 UI。

继续核对 b1 原稿与真实链路，另登记四个不成立的承诺：Web 注册后确认邮件（实际尝试自动登录、无邮箱验证）、Web 登录“保持登录状态”勾选（无对应会话策略输入）、过期重置链接回填邮箱（邮件链接只有 fragment token）、App 改密码后自动登录（服务端只改密并撤销旧会话）。逐项来源和建议已写入预检表，主会话 / 用户未认可改稿前不把这些交互做成装饰性假功能。

本轮逐元素复核 b1 #3 / #7 / #8 又发现两类未登记冲突：Web 注册强度条与 App 注册占位要求英数字混合，但当时 `auth-user-service.ts` 只要求有效邮箱和至少 8 字符；现有纯数字注册 / 重复邮箱目标组 10/10 通过，不存在强度评分回执。App 找回受理画面固定 `0:42` 重发倒计时并称链接已送达，然而公开 `PasswordResetResponse` 仅含受理消息；服务端虽有 60 秒冷却，但对已注册、未知及仅 OAuth 邮箱给同一回执，不暴露某账号的剩余时间或送达状态。两处已在 `preflight-checklist.md` 登记为待认可的改稿 / 产品取舍；不能把 UI 假进度条、伪倒计时或已送达声明接到现有服务。没有改 b1 画板或实现这些交互。

再核 b1 #5 / #9：服务端对格式错误、过期、已用和被新请求取代的重置 token 统一返回 `INVALID_TOKEN`，画板不能把通用失效结果确诊为「有効期限が切れています」；App 新密码画板显示演示邮箱，但重置 URL 只有 fragment token，App 页面与公开响应都不含邮箱，跨设备打开时也没有可信的找回表单上下文。两项已进预检表，建议分别改为通用失效说明、移除无来源的邮箱；在设计认可前未改画板或 UI。不同 token 原因仍应分别覆盖安全回归，不等于向前端公开区别。

b1 #2 / #6 登录画面已按输入、错误、Google、忘记 / 注册、返回和 App 本机恢复提醒逐元素补来源表。固定 Google 按钮与真实可用性条件冲突：Web 只有 Google 两项配置齐备才将 provider 传给页面，App 仅在 `auth.googleEnabled` 时生成动作；无 provider 的新画板布局仍缺。App 原生登录还保留本机加密未同步修改的匿名数量 / 无法确认数量提示，原 b1 #6 未画，不能在换版时悄悄丢掉恢复边界。现有 App 登录来源 / 提示目标组本轮 16/16 通过；这只验证旧行为来源，不是新画板、深色或操作链通过。

注册密码边界补查：`bcryptjs.truncates` 和本机 hash / compare 实测，两个密码若前 72 字节相同、仅尾部不同会被视为同一密码。重置服务原已拒绝超 72 UTF-8 字节，新注册服务此前只验至少 8 字符。先加内存真实服务测试，以 24 个汉字（72 字节）通过、25 个（75 字节）拒绝并不留账号为准，旧实现预期红（实际 `success`）；随后注册服务加同一字节上限并把通用输入错误写明上限，目标组 11/11、相邻认证 / 并发路由组 11/11，Web typecheck 与 lint exit 0。登录校验暂不拒绝既有长密码账号，避免无迁移地锁住用户；历史账号仍可出现 bcrypt 截断等价，且无法从已存 hash 判断谁当初输入超长，须另定兼容 / 重置策略。Web 注册 `maxLength=72` 只按字符数截，不可代替服务字节校验；App 的旧帮助文案也只说至少 8 字符，当前 `registerOrbitAccount` 会把服务端英语错误直接显示在日文页面。新认证画板和客户端错误映射须处理上限提示，未获认可前不改 UI。后述 Web 全量仍红，不能据定向测试写 SC-16 通过。

上述注册服务、错误文案与回归测试已按 C 线三条文件路径独立提交 `1f3dd05e9`；`git show --stat` 仅含这三条，未混入仍在进行的 R18b 画板 / 其他切片。未推送、未合入上游。

App 注册 #7 的重复邮箱卡同时展示「登录」和「重置密码」。只读服务核对表明 409 不透露邮箱对应密码账号还是仅 Google 账号；后者的找回申请虽也回 202，但 `password-reset-store` 仅对有 `passwordHash` 的账号建立邮件任务。已把这个安全 / 体验边界写入预检：可保留通用重置入口，但受理文案不能承诺送达，也不能按 409 猜出 provider。没有修改未认可画板。

b1 #0 / #1 的原始 token 扫描也已按值和命中元素补入预检表：Web / 手机模拟外框值与产品排版分开；真实落地页导航间距、标题 / 正文行高字距、欢迎页标题字距列为 A 线需核对的候选；两块共用的微字号名片仅列营销插画视觉项，不推成全局 UI token。续核 #2–#9 / #60 的非 exact 项：Web 四态及深色错误态只重复落地背景 / 插画值；App 四态除设备外框外，仅标题与部分小标签字距须核。此为告警归类，未获画板认可，也未申请或新增 token。

SC-15 D 线依赖核对：`redesign-d` 当前历史包含独立 App 根壳提交 `d096aa6d0`（最初为 `39a353303`，后续 rebase 后同内容），仅改 `repos/orbit-app/app/_layout.tsx` 与 `tests/root-shell-auth-render.test.ts`，D REPORT 记定向 root SSR 回归 1/1。C 当前 `app/_layout.tsx` 仍按 pathname 挂 `ShellTabBar` / 设置 Toast 偏移，`git branch --contains d096aa6d0` 只有 `line-d`；故 D 已交付独立修正但尚未进入 C，更没有本线的未登录→登录→再注销操作回归或 Web 浮条证据。待主线集成后按 PLANNER SC-15 重验；不把 D 定向测试换算成 C 验收。

上游集成检查点：22:41 JST 的本地 `origin/redesign` 相对 C HEAD 多 6 个提交，含 R31a 文档 / no-regress 修正与独立复核记录（SC-03 仍 open）；C 相对该上游另有 51 个提交，合并基点 `324218dda028e02e4a48a938940b08a240a7296e`。因此本轮 C 全量仍对应当前 C 树，不代表上游 R31a 组件 / no-regress 集成后的像素验收；待本轮工作树稳定并满足路径提交门禁后，再按 PLANNER 的 rebase / 冲突规则复核。此时不在脏树及全量排队过程中重排历史。

D REPORT 另交接 App 现有登录页英语标题下混入中文设备待恢复提示。C 确认 `AccountAuthScreen.tsx` 的未知数量与加密修改数量两段直写中文后，先补三语与源码接线断言，目标组如预期 8/10 红；再改用 `auth.devicePendingWritesUnknown` / `auth.devicePendingWriteCount` 语言键，后者只插入匿名 `{count}`，保留原账号 / 原服务器恢复边界。只读复核 `AuthSessionProvider.readPendingWritesOnDevice`：它把 `pendingWriteSummary()` 的当前 / 其他账号计数相加，登录页没有账号、邮箱或域名列表；画面上的 `baseUrl` 比较只防止旧请求的结果出现在切换后的服务器画面，并非把总数伪称当前服务器独有。随后补英文 1 项计数断言，先红后把英文改为不依赖复数变化的计数句；三语翻译、拷贝门槛、字典键集的目标组重跑 19/19，最终措辞后的 App typecheck exit 0；旧硬编码允许数从 3 降到 1。此修改晚于第二次 App 全量，仍需同树全量与 App 浅 / 深操作画面重验，不能称认证 UI 验收已过。

Web 全量 `c-web-full-version-working-tree.log` 已在当前 R18b 工作树结束，**7,476 tests / 6,424 pass / 32 fail / 1,020 skip，exit 1**。按完整失败名称对照 R18a 最近一次 `c-web-full-current-c34e559df.log` 的 31 项：原有「手入力→元に戻す」30 秒超时本次未复现；新增两项静态规范失败——`orbit-0918-anchor-colour` 六域锚点门槛 60、当前 59，以及 `orbit-button-ratchet` 非 `.btn` 按钮上限 79、当前 84。两项单独重跑均复现（目标 5 项中 3 pass / 2 fail）；它们检查的现有 / 上游跨线源文件与固定门槛均不在本轮 C 修改清单，当前未调整门槛或改动别线 UI 以掩盖失败。须由相应屏幕 / 规范所有者检查近期删除的链接及新增的五个设计控制，再给出保留覆盖率与外观的修正；C 线 SC-16 仍红。其余 30 个失败名称与 R18a 基线一致，但不能把 32 fail 写成全量通过。

归因补查：对比 `c34e559df..HEAD`，锚点测试所扫的旧 `contacts/network-0918` 目录有跨线删改，测试的固定数量自检未随之更新；新 `.btn` 计数中可见 `orbit-2026/network/ContactDrawer.tsx` 的五个 `styles.why` / `styles.more` 按钮与 `NetworkScreen.tsx` 的一个 `styles.why` 按钮，净数 +5（另有删除），均非本轮 R18b 改动。不能仅把 60 改 59 或 79 改 84；须由对应所有者按设计规格决定迁移 `.btn`、记录有理由的例外或更新扫描覆盖，再重验。

上述全量结束后，在包含 `/` 会话分流与全部 C 切片的同一工作树上重跑 Web `npm run typecheck` 与 `npm run lint`，两者均 exit 0。类型 / lint 通过不能抵消全量测试的 32 项失败。

其后新增 Web 公开 FAQ 纯过滤规则，先跑 `public-faq-search.test.ts` 因模块缺失预期红，再加最小实现后 3/3 绿：空查询保序、问题 / 答案 / 关键词匹配、无结果为空。尚无真实页面、网络搜索或获批最终 FAQ 文案；此修改晚于首次 Web 全量，已纳入下文第二次全量复测。加此文件后当前树 Web `npm run typecheck` 与 `npm run lint` 均已重跑 exit 0。

App 按不能跨仓库直接 import Web 源码的规则，在 `src/view-models/public-faq-search.ts` 实现同一纯过滤行为；`tests/public-faq-search.test.ts` 先因模块缺失预期红，再 3/3 绿。新增后 App `npm run typecheck` exit 0。FAQ 文案与界面仍待设计认可。

App 全量 `c-app-full-version-working-tree.log` 在本轮 C 树结束，**3,070 tests / 3,055 pass / 13 fail / 2 skip，exit 1**。与 R18a 最近一次 12 项失败按名称比对：既有「suggestion next page replaces twenty previews」偶发超时本次未复现；新增「the actual native consumers all have explicit versioned policies」与「the committed page inventory document is the rendering of the registry」。前者是本轮 `src/api/app-version.ts` 新 GET 未登记，已在离线读面清单补成 `app-version` 域、`online_only_secret` / `never_local`，目标审计重跑通过；另有专门测试确认公开版本响应不会落入离线账号镜像，1/1 通过。后者是已提交离线页面清单多一行失效的 Sprint 0137 汇总，登记表实际为 0，已删该行，生成内容逐行一致，目标组 5/5 通过。第一次并跑两个目标组时页面测试仍读取到补丁前文档，故其 25/26 不算后续修复通过；独立重跑 5/5 才是有效证据。修复后的 App `npm run typecheck` exit 0。两项都是第一次全量之后的改动，不得把原 13 fail 追溯改写。

修复后第二次完整 App 套件 `c-app-full-version-after-policy-fix.log` 结束，**3,071 tests / 3,054 pass / 11 fail / 4 cancelled / 2 skip，exit 1**。逐失败名比对：此前 C 所有的版本策略登记和页面清单两项均在完整运行中通过；余下 11 个失败名与 R18a 基线中除偶发 suggestion paging 外的 11 个一致（9 个 R12 名片读取、字典拆分锁、邀请页被 toast 遮挡）。另 4 个通知注册 race 用例在 5 秒限制处超时并被取消，既不属于之前的 11 个失败名，也不能记为通过；须隔离重验并查运行负载 / 定时器，不能靠增加测试限时或从总数里抹去。完整 App 仍为红灯。

对这 9 个 R12 名片用例的第二次全量堆栈逐项复核：8 个停在浏览器 `waitForFunction` / `locator.waitFor` 的 5 秒等待（其中 6 个等不到 `add-batch-reading`），另 1 个「离开相机仍完成上传」实际批次状态为 `collecting` 而非期望的 `processing`。这不能一概称为过期 fixture 或纯负载波动；属于 B 线业务 / 浏览器操作链，C 线未改其实现或放宽等待。邀请历史用例是 toast 挡住链接；字典拆分用例是旧快照键数 2253 与当前 2813 不等。待各所有者按具体堆栈修复后再重验，不从 C 线全量失败数中抹除。

隔离运行整个 `notification-registration-races.test.ts`，**15/15 pass / 0 cancelled，exit 0**；四个在全量中取消的用例各自耗时约 0.77–1.35 秒、低于现有 5 秒限制。这支持全量并发负载超时的判断，但尚未用同树全量证明稳定，未调整用例超时或生产逻辑。

认证提示语言修复后的第三次 App 全量 `_evidence-c/R18b/run-01/c-app-full-after-auth-locale.log` 已经结束，**3,072 tests / 3,059 pass / 11 fail / 0 cancelled / 2 skip，exit 1**。相对第二次全量新增 1 个认证提示语言回归且通过；两项 C 自有的版本策略 / 页面清单审计也再次通过。将完整失败名称去掉耗时并与第二次全量的 11 项失败（排除那次 4 个 cancelled）做排序差集，结果为空：仍是 9 个 R12 名片、1 个旧字典快照、1 个邀请 toast 遮挡，未见新 C 失败名。第二次全量取消的 4 个通知注册 race 用例本次全部在原 5 秒限制内通过，故不再把它们列为当前取消项；当前完整套件仍因 11 fail 为红灯。

Google 注册成功回跳、App 维护判定和相关回归加入后的第四次 App 全量 `_evidence-c/R18b/run-01/c-app-full-after-auth-broker-body-limit.log` 结束，**3,074 tests / 3,060 pass / 11 fail / 1 cancelled / 2 skip，exit 1**，约 301 秒。与第三次全量按去时长后的完整失败名称比较，原 11 项全部保留且无新失败名；新增取消项是通知注册 race 的 `opt-out leaves the canonical registry revoked after an in-flight registration commits`，在 5 秒测试限制处取消，不能算通过。本轮 C 测试期间同机另有 B 线 Web 全量 Node 进程（当时 PID 46957）并行运行，负载可能相关，但不能凭并行就断言根因。该通知文件随后隔离重跑 **15/15 pass / 0 cancelled**，目标用例约 1 秒；这只支持并发负载假设，不能把完整套件的 1 cancelled 消除或当作 SC-16 通过。本轮 C 新增的 Google 注册交互和维护回归在完整套件内通过；Web FAQ 与密码找回大小修复纳入下述 Web 复测。

第二次 Web 全量 `_evidence-c/R18b/run-01/c-web-full-after-faq-body-limit.log` 在 B 线两端全量结束后独占共享重任务槽位运行，**7,480 tests / 6,428 pass / 32 fail / 0 cancelled / 1,020 skip，exit 1**，约 304 秒。相对首次 Web 全量新增 4 项且均通过：三项本地 FAQ 搜索规则及一项超限 UTF-8 找回请求拒绝。将两次日志的完整失败名称去除耗时、去重、排序后逐项比较，差集为空，原 32 个失败名称均未消失也没有新失败名称。该结果证明新增切片未增加全量失败名，但全量仍红，不能作为 SC-16 或任何页面操作链验收。

密码重置 HTTP 的后续有界读取回归先 RED：伪造 `Content-Length: 2` 的 16 个 1024-byte 分块，旧 `request.text()` 在返回 413 前读完 16 块。改为逐块累计真实字节数，超过 4096 即取消 reader；同一测试 GREEN，未触发 service，回执仍为 413 / `PAYLOAD_TOO_LARGE`。目标文件首轮未配置数据库为 **46 tests / 45 pass / 0 fail / 1 skip**。随后先只读确认 `127.0.0.1:5432` 的目标库名和用户确为 `orbit_line_c_test` / `xzhao`，明确指定本机连接串重跑同一文件 **46/46 pass、0 skip**；测试使用随机 `password_reset_*` schema，结束后查询残留 **0**。此为本轮源码的真实库回归，不是云端或真实邮件投递。当前 Web `npm run typecheck` 与 `npm run lint` 均 exit 0。共享重任务槽位中的第三次 Web 全量 `_evidence-c/R18b/run-01/c-web-full-after-stream-limit.log` 结束：**7,481 tests / 6,429 pass / 32 fail / 0 cancelled / 1,020 skip，exit 1**。与第二次完整失败名去时长、去重排序后的 `diff -u` exit 0；新测试通过但原 32 个失败没有消失，SC-16 仍未过。

2026-10-19 再用当前 C 树及本机 `orbit_line_c_test` 重跑密码重置目标文件 **46/46 pass / 0 skip**，结束后 `password_reset_*` schema 残留 **0**；Web typecheck / lint exit 0，改动路径 diff 检查无问题。请求体有界读取及其回归测试仅两条路径提交为 `b328a73ce`，`git show --stat` 核对无其他未完成页面 / 画板文件；未推送。该独立修复不改变第四次 Web 全量仍有 33 项失败的结论。

注册 72 字节修复后的第四次 Web 全量 `_evidence-c/R18b/run-01/c-web-full-after-register-byte-boundary.log`：**7,482 tests / 6,429 pass / 33 fail / 0 cancelled / 1,020 skip，exit 1**，新注册边界用例在完整套件中通过。与第三次失败名去时长排序对比，只新增 `web personal client requests the editable collection rather than the legacy aggregate`，其余 32 项未变。该测试在 C / D 两线单独复跑都失败；它以 2026-09-17 的固定予定测试按当前日期计算的客户端窗口，2026-10-19 时已越过窗口起点。D 线按归属仅把该测试 fixture 改为同一次捕获的当前时间 + 1 日，目标文件 10/10、相邻客户端 / 路由 19/19、另一时区 10/10、D Web typecheck / lint exit 0；D 全量 7,790 项中 6,717 pass / 39 fail / 0 cancelled / 1,034 skip，目标测试通过、相对前一 D 全量无新失败名。该修正已按 D 线文件路径提交 `f7dc2c118`，未推送、未进入 C。不能把 C 全量的第 33 项提前扣除，也不能把余下 32 项当通过。

后续发现一个 SC-10 / 12 交叉条件：服务端在 `ORBIT_APP_MIN_SUPPORTED_VERSION` 有值、`ORBIT_APP_LATEST_VERSION` 缺失且维护显式开启时，会安全返回 `latestAppVersion: "0.0.0"`、`enforceMinimum: false` 与 `maintenance.active: true`。App 原判定先检查版本范围，使维护被误判为普通放行。先加策略回归，实际红 1/3（得到 `policy-invalid`）；再将显式维护判定移到版本范围校验前，并在公开接口读取测试覆盖同一响应。App 两组最终 6/6、App typecheck exit 0；Web 服务端路由同一配置响应的断言 3/3，未跟踪的新文件经 `git diff --no-index --check` 检查无空白告警。版本范围非法且**没有**维护信号时仍安全放行并附诊断；本修复不代表维护页、启动接线或完整 App 套件已经通过，此改动晚于上述第三次全量。

SC-11 实际 HTTP 复查：原定 C 端口 3400 被另一份 `redesign-c-r18a-retry` 工作树占用，先前对它的请求为旧 `account-lifecycle` 503，不能当作当前 R18b 失败或通过。核对 PID 工作目录后，当前 C 树在空闲 3410 / 独立 `.next-line-c-r18b-runtime` 临时启动，本地显式 `live`、版本 `1.0.0` / `1.2.0`、强制开关关；匿名 `GET /api/app/version` 实际返回 HTTP 200、`success:true`、版本值与 `enforceMinimum:false`，同时有 `Cache-Control`、`CDN-Cache-Control`、`Vercel-CDN-Cache-Control: no-store`。中间件仍报缺少本地 Auth secret 的启动诊断，但未阻止公开接口，不能视为已验证认证链。验证后已停止本轮 3410 服务并确认端口关闭；Next 自动加入 `tsconfig.json` 的临时类型路径已用补丁恢复，追踪文件无差异。没有写生产配置或调用真实 OAuth。

首次 Web typecheck 没进入源码诊断：本工作区遗留的被忽略 `.next/dev/types/validator.ts` 引用上游已删的 `contacts/pipeline` 两个路由。`next typegen` 生成了新的 `.next/types/validator.ts`，但未删旧开发缓存；确认 C 线 3400 无服务且旧文件不受 Git 跟踪后，将那一份旧文件**移至** `_evidence-c/R18b/run-01/stale-next-dev-validator.ts` 保留，原 `npm run typecheck` 重跑 exit 0。`next-env.d.ts` 被 typegen 临时改成正式类型引用后已恢复原追踪内容；没有把生成文件变化纳入产品提交。原始失败不能算通过，重跑 exit 0 才是当前证据。

2026-10-19 App 认证页回归再验：`account-auth-screen-source`、`ink-signal-auth`、硬编码文案门槛、profile 三语与 copy-sync 五组 **38/38 pass**，App typecheck exit 0。Google 注册成功后的跳转继续走资料完成页并保留安全 `next`；设备待恢复提示改为日 / 中 / 英字典，匿名数量不泄露账号名或邮箱。新增两条文案在 `copy:qa -- --app auth` 首轮暴露组件类型未登记、英文 `we` 与中文占位符空格问题，修正后不再出现在告警；全域 QA 仍 **53 个旧键告警、exit 1**，不能称通过。上述 8 条 App 路径按路径提交 `3e4b2c68c`，`git show --stat` 已核，未推送。该提交晚于第四次 App 全量，仍须集成态复验。

2026-10-19 离线页面清单文档与实际路由登记表逐行一致，`page-offline-inventory.test.ts` **5/5 pass**；单行过期的 Sprint 0137 汇总删除按路径提交 `1297acb47`，未改分类注册表。Web 公开 FAQ 本地过滤、构建 ID 浮条纯判定与支持邮箱空配置共 **6/6 pass**，App FAQ 本地过滤 **3/3 pass**；两端 typecheck 与 Web lint exit 0。8 条底层规则 / 测试路径提交 `340714a52`，`git show --stat` 已核；未推送。这些测试不证明公开帮助页、浮条状态存储、真实联系动作或 UI 画面已实现，仍须按 SC-09 / 12 及设计门禁完成操作链。

2026-10-19 发现此前 Web 全量未设置 `ORBIT_EVENT_DATABASE_URL`：失败堆栈明确写 `ORBIT_EVENT_DATABASE_URL is required`。只读核对本机 PostgreSQL 的 `orbit_line_c_test` 与回环地址，明确传入 `postgresql://xzhao@127.0.0.1:5432/orbit_line_c_test` 后先跑事件访问真实库目标 **3/3 pass**。再经共享重任务锁在同一 C 树跑全量：**7,482 tests / 6,942 pass / 11 fail / 0 cancelled / 529 skip，exit 1**。先前无库条件为 7,482 / 6,429 pass / 33 fail / 1,020 skip；两轮配置及实际执行的用例集合不同，不能把失败减少的差额叫作源码修复。新的 11 项为 D 已修但未入 C 的日期 fixture、manifest 生成、联系人合并、design fixture import、R16 每日一问 PostgreSQL 三项、R12 名片两项及两个跨线静态 ratchet。R16 `completion-question.test.ts` 在同一库隔离复现 **30 项中 27 pass / 3 fail**：内存版都通过，PostgreSQL 的三个场景遗漏真实活动选项；随机 `completion_*` schema 清理后残留 0。该模块归 A 线，本轮 C 不越线改它；其他 8 项仍须各归属方复核。Web 全量与 SC-16 依然红。

2026-10-19 SC-08 已登录 Web 404 追试：在 C HEAD `97bbc1b28` 的独立回环库注册资料完整的合成账号，使用本机一次性 Auth secret 进入 `/app/removed-page`。开发构建的 390 / 1440 操作链均达到 HTTP 404 / noindex、已登录壳、Help 公共页无私有壳、浏览器返回后 Home 回 `/app/home`；但两档都在 React Server Components **开发版** `flushComponentPerformance` 的 `performance.measure` 抛 `UnknownAppPage cannot have a negative time stamp`，Next 开发问题浮层可见，故开发版的“零浏览器错误”门禁明确失败，没有把它吞掉或归咎于应用代码。相同源码随后 `next build --webpack` 编译、TypeScript、静态页生成均 exit 0；用生产构建重复完全相同的 390 / 1440 操作链，两档均 HTTP 404 / noindex、壳与两个出口正确、**0 uncaught pageerror**。证据与生产截图在 `_evidence-c/R18b/signed-404-459bcbc6d2c1/OWNERSHIP.md`；这是路由 / 操作 QA，不是 b12 像素、暗色、全尺寸、无障碍或 App 404 验收。试验服务已停止、端口 3411 关闭，Next 自动改写的两条追踪文件已恢复；检查本机数据库只含该 nonce 的三条账号记录、0 其他 workspace / 0 连接后，仅删除该精确试验库，目录证据保留。未写产品源码、未推送。

2026-10-19 SC-08 已登录 App 404 追试：C 专用签名 iOS host 加载当前 C Metro JS；独立本机试验库的完整资料账号经原生邮箱密码 UI 登录，认证和同步入口返回 200。`orbit://removed-page` 显示日文 404 而非静默进首页；Help 打开公开日文帮助，返回后 Home 进入有本人问候和底栏的已登录首页。浅 / 深两态均已截图，深色经模拟器切换并重启 App 后再次以 Home 验证会话保持。首轮 Home 的“暂时不可用”提示由试验库漏跑 `appointment_aggregates` 迁移导致：三个日程提供者逐项探测仅会面源报缺表，补跑仓库既有迁移后全源空表读取成功、`/api/schedule-items` 200，刷新后提示消失；这是 QA 环境修复，无产品源码改动。证据、四张截图 hash 与完整清理在 `_evidence-c/R18b/native-signed-404-7909c7f1198c/OWNERSHIP.md`。原生路由 / 内容目标测试第一次遗漏仓库的 React Native 测试 hook，语法转换失败、不能算产品测试红；按 `package.json` 入口加 hook 重跑 **3/3 pass**。注销 UI 回到登录页、服务端 sign-out 200；推送设备 DELETE 400 且开发警告仍提示通知清理未完全确认，不能写“完整注销清理通过”。推送服务代码对已配置数据库要求 `ORBIT_PUSH_TOKEN_KEY`，本轮未提供，可能是该 400 的试验环境原因，但没有回执正文及同库重验，不能断定。仅精确新建的本地库在 owner / workspace / 连接检查后删除，服务与模拟器停止，生成文件复原。该检查不是精确源码原生重建、b12 逐像素、全部尺寸或无障碍验收，SC-08 仍 OPEN。

2026-10-19 SC-08 已登录 Web 404 补充尺寸／主题追试：复用同一 C HEAD 的生产构建与已删除后确认不存在的专用本机测试库名，重新建库并注册新的合成账号；在 1024 浅色、390／1024／1440 深色四档实走未知路由、Help、浏览器返回、Home。四档均 HTTP 404／noindex、已登录壳与出口正确，根节点计算主题符合测试设置，页面宽度未溢出视口，**0 uncaught pageerror，浏览器脚本 exit 0**。四张截图人工查看，hash 与清理证明在 `_evidence-c/R18b/signed-404-matrix-94ff2f1e7e6d/OWNERSHIP.md`。这将 Web 功能覆盖推进到三种宽度和浅／深主题，但不替代 b12 逐像素或无障碍验收；SC-08／R18b 仍 OPEN。仅该测试库在精确 owner／workspace／连接与异源行核对后删除、catalog 0；服务端口 3411 已关闭，本轮无产品源码改动。

2026-10-19 SC-08 原生同源码构建追试：C `97bbc1b28` 的 `repos/orbit-app` 用独立 DerivedData 和全机重任务锁执行 arm64 iOS Simulator Debug 构建，**xcodebuild exit 0**；产物 ad-hoc 签名、密封资源和 Info.plist 经 `codesign --verify --deep --strict`，bundle ID `app.agenthubs.orbit`。只在本轮新建的 iPhone 17 Pro / iOS 26.4 模拟器安装该产物，安装后可执行文件 SHA-256 与构建产物相同。当前 C Metro JS 下，日文 `orbit://removed-page` 的公开 404 浅／深均显示，Help 进入公开 FAQ、首条可展开，返回回到 404；三张截图已目视核对。完整产物、截图 hash、Expo 开发警告与精确清理见 `_evidence-c/R18b/native-exact-0ab67b939174/OWNERSHIP.md`。这补上了此前“旧签名 host + 当前 JS”对公开 404 的原生同源码缺口，**仍不证明该新包的已登录流程、逐像素／无障碍／全尺寸或发布包**。试验模拟器只含本轮安装，验证后按精确 UUID 删除；旧 C 模拟器未动。Metro 停止、8084 无监听，构建产物保留，无产品源码改动。

2026-10-19 SC-08 精确源码签名 App 已登录追试：复用上段 C `97bbc1b28` 已构建并重新验签的同源码 Debug 产物，新建 iPhone 17 Pro / iOS 26.4 模拟器及全空 C 专用本机库，迁移日程表并种入资料完整的合成账号。原生登录 UI 后认证／同步入口与 `/api/schedule-items` 均返回 200；`orbit://removed-page` 的日文公开 404 在浅／深两态无私有底栏，Help 到公开 FAQ、返回 404、Home 到带本人问候的已登录首页均实走；深色重启后仍有会话。四张截图已人工查看，开发警告浮条仍在，证据、hash 与精确资源归属在 `_evidence-c/R18b/native-exact-signed-404-398c5d3a65f9/OWNERSHIP.md`。注销 UI 回登录、服务端 sign-out 200；推送设备 DELETE 404 `NOT_FOUND`，通知清理仍警告未确认。本轮库无 `pushDevices` 行，服务代码对不存在设备返回 404，因此只支持“该合成账号无设备记录可撤销”，**不宣称通知清理通过**，也未跨 C 404 归属改推送源码。独立模拟器 UUID 删除；3411／8084 端口空；确认 owner、零连接、仅本轮 workspace 四行后仅删除精确本地试验库，catalog 0；Next 自动生成 tracked 差异复原。该检查补齐“精确源码包的已登录 404”单机功能证据，不是发布包、b12 像素、无障碍、全部尺寸或 R18b 总验收。

2026-10-19 SC-03／08 Web 注册法务链接追试：现有 `auth-0918` 注册弹窗的「服务条款／隐私政策」原是无法点击的 `<span>`，虽已有公开 `/terms`、`/privacy` 页面。仅把两处接为新标签的真实链接，保留当前输入；作用域悬停色钉住原设计值。先以渲染断言见到预期红，再改链接；Chromium 悬停色测试先见 `rgb(14,18,37)` 的错误色、补 scoped rule 后为 `rgb(107,111,153)`。最终注册＋公开页目标组 **30/30 pass**、Web `typecheck:app` 与 lint exit 0，当前源码生产构建 exit 0。本机生产浏览器逐个点两链接，均在新标签打开公开法务占位页，原 `/app/account/signup` 的邮箱和密码输入未丢，0 uncaught pageerror（另有 2 条 CSS preload warning）；详见 `_evidence-c/R18b/legal-links-20261019/OWNERSHIP.md`。首次开发浏览器没有配置本机 Auth secret，报 `MissingSecret`；首次编译新路由会刷新旧标签并清空输入，故该次不算验收。同一 HEAD 的 Web 全量用本地测试库执行仍 **exit 1**：C 公开页文案扫描、`*-0918` 链接数量旧门槛（实扫 34，要求 40）、跨线／PostgreSQL 等仍红；没有同一 HEAD pristine 全量对照，**不宣称零新增全量失败**，也未降低门槛。这只补现有 Web 注册功能链接，不代表新 b1 认证画面、App 注册链接、正式法律正文、全尺寸像素／无障碍或 R18b 总验收。

2026-10-19 SC-14 公开 Web 404 首个像素切片：按 b12 已定的 W-R18b-08 公开态补六张视图清单（1440 / 1024 / 390，浅 / 深），归因 JSON 留空，不用豁免掩盖差异。390 浅色首次 raw 8.27%、缺块 4；按画框调整移动端内边距、雾背景、顶栏高度和日文说明断行后，与 1024 / 1440 说明字体及内容宽度一起重比，最终六张 **6/6 PASS**：1440 浅 / 深 raw 0.10% / 0.10%，1024 浅 / 深 0.15% / 0.15%，390 浅 / 深 0.09% / 0.09%；均 0 超阈带、0 未归因、无缺块。摘要在 `_evidence-c/R18b/visual-w08-public-all-20261019/summary.json`。404 目标测试 2/2、Web typecheck 与 lint exit 0。Web 全量 `npm test` exit 1，终端末尾可见按钮基准失败；本轮输出过长被截断，未取到可靠失败总数 / 与先前全量的逐名差分，不能声称零新增失败。该清单仅覆盖**未登录公开 404**；已登录 404、App、帮助、维护、认证四态及 R18b 全矩阵仍未通过 SC-14，总验收保持 OPEN。

SC-16 续查：上段首次全量遗漏仓库要求的 `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8`，不能作合规基线；按该环境重跑 **7,748 tests / 6,663 pass / 44 fail / 1,041 skip，exit 1**。其中 C 线公开页源码的三个直写日文扫描断言失败，定向重现指向 `NotFoundPage`、`PublicInfoPage`、`MaintenanceView`。将 404 的移动断行改为从已翻译正文定位、FAQ 搜索别名和维护日期词尾搬入三语文案数据，未改页面文义或日期来源。定向文案／公开页／维护／FAQ **19/19 pass**，Web `typecheck`、`typecheck:app`、`lint` exit 0；改后 404 六张重比仍 **6/6 PASS**、raw 与上段相同，摘要 `_evidence-c/R18b/visual-w08-public-all-after-copy-20261019/summary.json`。改后全量仍 exit 1；过滤后的终端输出尾段被截断，未取到可靠总数及逐名差分，不推断其余失败都属旧问题，也不称 SC-16 / 全量通过。

另单独复现两个共享门槛（5 项中 3 pass / 2 fail）：`*-0918` 链接颜色断言失败点不是 C 新加法务链接的 hover 色，而是跨域扫描面由旧最低 40 条减至实际 34 条；旧页删除记录已在测试注释中，但测试最低值未随归属方更新。按钮基准实际 83、旧上限 79；列表含 C 的 `MaintenanceView.tsx:74` 一处及其他线页面，不能靠直接放宽上限或改动别线按钮假装修好。C 留这两项 OPEN，向共享测试 / 组件归属方请求按当前来源重核基线；维护页按钮要保持真实重试语义，待该画面获准像素收口时一并评估 `.btn` 风格，不为测试数字盲改 UI。

2026-10-19 SC-14 公开 Web Help / 法务默认态：按已代定的 b12 W-R18b-11H/T/P 补登记 Help、条款占位、隐私占位各 1440 / 1024 / 390 浅深六张。Help 390 浅色首轮 raw 7.87%、6 超阈带、9 缺块；经移动端画板外边距 / 雾背景 / 顶栏高度与 FAQ 首项间距、联系卡排版两轮最小调整，第三轮 raw 1.05%、0 超阈 / 未归因 / 缺块。随后 Help 六张 **6/6 PASS**（1440 浅 / 深 0.37% / 0.35%；1024 0.56% / 0.53%；390 1.05% / 0.98%），条款与隐私各六张 **12/12 PASS**（各 0.09%～0.16%）。连同既有公开 404，当前已登记 24 张整套重跑 **24/24 PASS**、无超阈 / 未归因 / 缺块；摘要 `_evidence-c/R18b/visual-public-24-20261019/summary.json`。Web 公开 Help / FAQ / 法务 / 404 目标组 **10/10 pass**；Web `typecheck`、`typecheck:app`、`lint` exit 0。按规定 `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8` 重跑全量 **7,748 tests / 6,667 pass / 40 fail / 1,041 skip，exit 1**，失败清单没有这次公开页面目标用例，但不能等同零新增全量失败证明。Help FAQ 展开 / 无结果中途态、已登录公开入口、App、维护、认证及全矩阵仍 OPEN；正式法务正文和邮箱仍待用户发布授权。

SC-16 跨线清单复现：`product-surface-manifest.test.ts` 目标文件 54/55、仅失败 `new P0 candidates`；新增候选正好是 `host/HostSetup.tsx` 按钮及 `search/SearchPanel.tsx` 按钮 / 名称三项，均非 C 线 R18b 文件。C 不改主办 / 搜索页面，也不在审计清单里静默豁免；交各归属线核操作与登记。

## 请求 / 未过 / 下一步

1. SC-01：b1/b7 已代定文案改稿与自动重跑完成；W/A-11 公开帮助 / 法务、W/A-08 404、W/A-09 维护两态、A-10 强制更新和 W-10 新版浮条浅 / 深草案已补。前四组已按 RD-33 代定认可为实施依据，浮条及其他画板仍按原停点复核。仍须用来源表逐项核对数据 / 动作，把真实 token 缺口与营销插画尺寸区分后按 C/A 文件边界交 A 线，并在 b12 末尾补齐其余画面的断点 / 深色，再跑五项人工预检。仅上述公开 Web 404 / Help 默认态 / 法务占位共 24 张像素已过，其他 R18b UI 像素**未过**。
   - b1 #0 / #1 重看原稿时新增停点：仅 b1 出现的「確認は1枚5秒」缺耗时来源；「登録は1分」虽未找到计时证据，却是 R15 邀请等跨屏既有口径，不能 C 线单独改；未登录插画的 12 枚 / 3 人 / 分数应明确是演示，不能像访客数据；顶栏前三个链接缺真实目标；欢迎页「スキップ」目的地未定。推荐与影响已逐项写在 `preflight-checklist.md`，待主会话代定，W-01 / A-01 不开 UI。
2. SC-11 / SC-16：最新 C Web 全量在明确本机测试库下为 7,482 项中 11 fail；其中 R16 PostgreSQL 每日一问 3 项已隔离复现，日期 fixture 待集成 D 的修正，另有联系人 / R12 / 静态规范等跨线失败。不能把未配置数据库时的 33 fail 或这次少掉的失败名当作产品修复；也不能调高门槛或削弱覆盖来当成通过。最新 C App 全量仍有 11 fail / 1 cancelled；通知 race 隔离 15/15 通过不能抵消全量取消。C 自有版本、离线清单、认证语言与 Google 回跳等定向回归通过，并已按上文列出的独立提交保存；全量与像素验收仍未收口。后续须由各所有者按堆栈修复、集成上游并重验。
   - `/` 根路由改动后的 Web typecheck / lint 已重跑 exit 0；App 本轮离线清单修复后的 typecheck exit 0。
3. D 线请求保持 PLANNER §1 / §9 边界：根布局认证态底栏、Toast 偏移和 Web 壳浮条由 D 线独立提交；C 线不得代改。SC-12 还需 D 线确认 App 根布局的全局版本门禁挂载点：C 线提供政策读取、判定及获批后的更新 / 维护内容，D 线在不绕过任意深链的根壳接入并回归会话、底栏和 Toast。当前 `app/index.tsx` 只处理 `/` 根入口，不可作为全局阻断证明；未获设计认可及跨线接入前保持 SC-12 OPEN。
4. 支持邮箱与正式法务正文仍是发布授权门禁；不配置真实邮箱、不伪造法律文本。生产启用强制更新、真实 OAuth / 邮件、部署与 TestFlight 均未执行。
