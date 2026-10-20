# R28 新用户引导 — C 线交付与未结项

日期：2026-10-20。状态：**部分交付，Sprint 未验收完成**。本线只在本地 `line-c` 提交；没有推送、部署、访问 Neon／生产库或调用付费 AI。用户原有的 `HANDOFF-CLAUDE-2026-10-19.md` 未改动。

## 版本与做成的链路

- 起点 `8862ccce4`（含 R10 投影 `8eaf86733`）；设计 `50c708543`，契约兼容 `b987287e1`，政策 v2 `0881931f2`，资料流程和介绍额度 `90a346202`，真实指南与 intake `04d6bbe76`，原生界面 `7bffccbbd`，Web 资料和 B 扫描入口 `1073f9ea9`，Web 指南三语与布局 `3902a452d`，文案审计修正 `f41c94d4a`，像素视图清单 `c7025e429`，App 契约与读取注册 `11db421e9`，旧资料标签兼容导出清理 `f1e98a2b9`，介绍失败文案收口 `f718ea48d`，App `/start` 续接允许表 `f377525f4`，两端资料冲突防覆盖 `204814b18`，Web 日文预览 `23b76c711`，两端指南资料门禁 `a87fec3c9`／`d0263ad28`。上述提交均留在本地。
- 资料政策 v2 允许空生日，姓名／行业仍必填；App 先兼容 v1/v2／未知新版再切服务端。共享契约 snapshot 已更新，App 副本已同步。首次资料 PUT 前建 actor 流程；每屏 PUT、GET 复读、进度确认，失败不推进。跨端使用同一进度记录。
- 目标最多 2 个、保序、无默认期限；保留旧文本。介绍可用 ja/zh/en，首次流程每 actor 成功总额 3 次；幂等键、并发额度与失败重放由服务端持久记录，手写可继续。该本地运行未配置付费 provider，因此实际付费模型调用 **0**。
- Web `/app/start` 去掉演示开关门禁；App `/start` 已成为真实三步页。两端从 R10 共享投影读取 3 个条件，步骤 3 显示保存的第一目标并要求用户选 `goalKind`；仅恢复 `source:onboarding`、类型相符的 intake，不把同名其他来源当续接。Web 用 Web href，App 校验 App href 后进入原生计划流程。
- 本地同一合成账号实际走完 App 资料五屏：空生日、两个目标、介绍 AI 失败后手写、跳过导入。另一新 Web 合成账号也实际走完五屏：空生日、两个目标、介绍 AI 失败后手写、导入跳过；服务端回读 `lastConfirmedScreen=5`、`finishedAt` 非空，返回 `/app/start`，再进 `continue` 仍到 `/app/start`。六张 Web 各阶段截图在 `_evidence-c/R28/web-five-screen/`。Web 手工确认三个联系人后显示 2/3，并创建 onboarding intake；App 从指南恢复**同一个** intake 的问题阶段。首次草稿因本地没有付费 AI 配置失败，未产生 active plan，故 3/3 和回 Task 的四阶段链未验。

## SC 逐条结论

| SC | 结论 | 证据与缺项 |
| --- | --- | --- |
| 01 开工／预检 | 部分 | `preflight-checklist.md`、b1/b12 清单和两块 b12 定向预检；整份 b12 变体预检因耗时中断，未记通过。起点与 R18c/R10 基线见下。 |
| 02 入口／next | 部分 | Web 本地注册保留 `/app/start` 到资料页；匿名继续与指南 307 到登录，完整账号安全 next 到指南，外站与嵌套循环回 Home。有效邀请 `/i/<code>` 两端匿名可直达；Web 注册后回邀请并连通；App 新账号完成五屏后回原邀请，已有完整资料账号登录后直接回邀请，两次兑换均 200。邀请后资料不全曾可进真实指南，已修复两端 `/start` 门禁并实测转资料五屏。未遍历全部旧账号／流程状态与双端登录组合。 |
| 03 资料五屏／D28-2 | 部分 | BREAKING 登记、App 先兼容、v2、CAS/幂等/API、两端五屏操作链与服务端完成回读已做；Web 同账号双标签实际验证旧稿冲突被拒、刷新后从服务端第 2 屏续填。同账号 Web 基本资料→App 第 2 屏→Web 第 3 屏已双向实测；完整跨设备回读矩阵及各屏像素尚未验。 |
| 04 目标／文案 | 部分 | 上限 2、第三项限制、保序、三语与显式类型选择的定向测试；Web 资料内嵌首页／人脉预览的静态文案已补日文。R28 双目标文本在 R18a 共用编辑器重开后保持原文、无暗加期限的组件定向测试 5/5；真实保存后重开与各版位像素尚未全验。 |
| 05 AI 介绍 | 部分 | 服务额度、重放、并发、三语测试与两端失败手写链；Web 失败页不再显示 provider 配置/密钥名，额度耗尽不再给重试按钮。没有授权的付费正例，日文实际模型输出未运行。 |
| 06 名片入口 | 部分 | C 的旧 card-batch UI 已迁往 B 的扫描/导入路由；Web/App 跳过导入的完成链已实测，B 回程仍依赖浏览器返回和服务端续填，0/3/10 张真实批次未全验。 |
| 07 硬顺序 | 部分 | R10 共享投影、0/2/3 联系人及锁定／`?step` 定向测试，server 写拒绝；双设备、active v1/v2 的完整事实矩阵未全验。 |
| 08 App 指南 | 部分 | 原生 `/start`、锁定、2/3、计划续接已实机；active plan 缺付费 AI 正例，不能声明 3/3。 |
| 09 指南到 v2.2 | 部分 | 双端显式类型、onboarding intake 恢复同 ID；Web AI 初版失败后只显示恢复出口，四阶段→Task 未到达。 |
| 10 示例模式 | 部分 | C 的 profile、flow、intro 服务端样本写 403 早退测试；资料页的内嵌预览仅返回填写步骤，没有示例数据写入口。`/start` 是脱离预览的真实指南，新用户可在此写真资料；不能仅凭「仍在示例期」把该入口拦住。B 的 plan intake 示例写拒绝、A/D 拥有的示例横条/药丸及其写入口仍未联验。 |
| 11 D 线 Task | 待 D | 本线未修改 Task。状态契约与具体请求在下表；没有 D 提交和回传，Task 链不能报通过。 |
| 12 旧引用 | 部分 | C 的旧 `card-batch-ui` 使用与 `profile-model` re-export 已清理；Web 资料仍挂在 `onboarding-0918`，尚未达到新目录的文案审计零例外要求。D 壳的 `shell-routes.ts` 仍把 `/app/start` 与 `/app/profile/onboarding` 列为 `NO_SHELL`，C 单方挂 `ShellPage` 不会产生插槽；需 D 先给可用壳边界。 |
| 13 资料像素 | 未过 | W01 1440 浅和 A01 深各有 triptych；超阈值带仍未归因，其他宽／主题及资料屏没有完整 fixture。 |
| 14 指南／示例像素 | 未过 | A07、W07、W08 门禁失败；A08 首次比较用了错误路由，随后 `/contacts` 数据读失败，不能判通过；A/D 组件与 fixture 缺口见下。 |
| 15 失败／兼容／离线 | 部分 | v1/v2/未知契约、资料／进度重试、无网络和 intake 错误定向测试；Web 双标签 409 实际提示并保留未提交输入，服务端没有被旧稿覆盖；同浏览器换合成账号后初始资料与进度为空。C 模拟器从另一合成账号登出，再登录部分资料账号，续填卡正确显示 1/5；完整离线同步审计未完成。 |
| 16 收口 | 部分 | 本地代码、视图清单、REPORT／REVIEW、全量与基线对照均已收口；全量与像素门禁仍红，跨线依赖未回传，Sprint 保持开放。 |

R28-01→SC10/14：服务端 C 写保护已做，A/D 的展示与其他写入口待接。R28-02→SC11：Task 请求待 D。R28-03→SC09：已改为严格 onboarding intake。R28-04→SC07/08/12：App 真实指南已接，C 的旧 B 名片 UI 使用和资料标签旧导出已清理；Web 资料旧目录仍待迁移。试移 `orbit-2026/onboarding` 时，既有新目录审计检出 hard-coded 8/6/1、缺 ja 120/80；该试移已局部撤回，文案迁移与壳接入保留为未完成项。

入口 URL 表由源码、定向测试与本地实际路由核对；App 邀请全矩阵仍未跑。本地合成注册账号只写入 `orbit_line_c`：普通账号落到 `/app/profile/onboarding?next=%2Fapp%2Fstart`，另一个点击「Just look around」后重进 `/app/profile/continue` 仍回资料页。无会话 curl 访问继续页与指南均返回 307 登录，安全目标保留；已有完整账号的 Web 浏览器访问合法目标、外站目标和嵌套继续目标分别落到 `/app/start`、`/app/home`、`/app/home`。C 模拟器登录的完整资料账号打开 `orbit://profile/continue?next=%2Fstart` 后进入真实指南，外站 next 回 Home；截图 `_evidence-c/R28/app-continue-{valid-start,external-fallback}.png`。

有效邀请码实测：本地完整账号创建 7 天邀请，匿名浏览 `/i/<code>` 200；点击注册链接得到 `/app/account/signup?next=%2Fi%2F<code>`，新账号注册后直回邀请页、填写姓名并完成双向连接。此时新账号资料政策 v2 仍为 incomplete（缺两级行业）、流程记录为空；修前直接访问 `/app/start` 却显示真实指南，根因是旧 W0006 路由豁免仍在 `profile-onboarding-route-policy.ts`。R28 的私有页门禁优先于此旧豁免，故 C 线仅移除 `/app/start` 豁免，保留 `/i/<code>` 公开例外与五屏页本身豁免。代理 RED 7/10→GREEN 10/10，导航／指南组合 26/26；修后同一邀请账号进 `/app/start` 转 `/app/profile/onboarding?next=%2Fapp%2Fstart`，完整账号仍直达指南。截图 `_evidence-c/R28/valid-invite-{anonymous,profile-gate}.png`。邀请来源保存与连接属既有业务，本轮只做本地验收与 C 线门禁修复。

同一未完成资料账号登录 App 后，修前直接深链 `orbit://start` 显示 0/3 真实指南；修后 App 先读取服务端 profile policy，再读取指南，不完整或未知政策都转 `/profile/onboarding?next=%2Fstart`，资料读取失败停在可重试态。RED 0/4→GREEN 4/4，App typecheck exit 0；重启 Metro bundle 后实机直接深链进入五屏首屏，截图 `_evidence-c/R28/app-invitee-{guide-bypass-before,profile-gate-after}.png`。这验证 App 直接指南入口，不代替 App 邀请链接回程全矩阵。

App 邀请 `next` 的纯路由链追加复核：`/i/ABCD-EFGH` 经注册进入登录仍保留邀请目标，登录后先到资料五屏，流程完成的安全目标仍是该邀请页；`account-auth-view-model` 定向 8/8。随后用同一本地有效码、另一全新合成 App 账号实走：登出→`orbit://i/<code>` 显匿名邀请→注册自动登录→五屏基本／目标／强みニーズ／AI 失败后手写／导入跳过→回相同邀请确认页→连接。`POST /api/invite-codes/[code]/redeem` 200、完成页显示双方已加入人脉；本地邀请码 `used_count` 从 1 到 2。截图 `_evidence-c/R28/app-invite-{open,return,connected}.png`。这验证一个 App 正例，未覆盖全部登录／旧账号组合。

同一有效码又由已有完整资料 App 账号实走：登出→匿名邀请→登录→直接回相同邀请确认页，不重进五屏→连接成功。`POST /api/invite-codes/[code]/redeem` 200，`used_count` 从 2 到 3；截图 `_evidence-c/R28/app-invite-existing-{return,connected}.png`。未完整遍历旧账号无流程、流程未完成、恶意 next 与全部 Web/App 排列。

| 条件 | Web 落点 | App 落点 |
| --- | --- | --- |
| 未登录访问继续页 | `/app/account/login?next=...`，保留安全目标 | 账号登录入口，安全目标由原生路由解析 |
| 资料未完成或流程未结束 | `/app/profile/onboarding?next=...` | `/profile/onboarding?next=...` |
| 资料完成且流程结束，或旧账号无流程记录 | 安全 `next`，默认 `/app/home` | 安全 `next`，默认 `/home` |
| 流程或权限读取失败 | 继续页重试提示，不猜完成 | 错误状态与重试，不写进度 |
| 外站、认证／资料循环、嵌套恶意 next | 回安全默认目标 | 回安全默认目标 |
| 邀请 `/i/<code>` | 认证后直达邀请，随后私有页仍受资料门禁 | 实机新账号五屏完成后、已有完整账号登录后均回原邀请且兑换 200；未覆盖旧账号全部组合 |

## 像素门禁

`scripts/visual/views/app-R28.json`、`web-R28.json` 映射 b1/b12 到路由，共 26 个 App、72 个 Web 宽／主题条目。**清单不代表通过**；每个条目需对应的服务器进度、联系人、语言及主题 fixture。证据在 `_evidence-c/R28/pixel/`，结果 `result.json` 与 triptych 并存。

| 状态／板 | 轮次 | raw | 未归因超带／总超带 | 缺格 | 判定 |
| --- | ---: | ---: | ---: | ---: | --- |
| A01 深 b12#901 | 1 | .1985 | 9/9 | 11 | 未过；真实空字段与设计 fixture 不同，表单布局亦不同 |
| A07 锁定深 b12#913 | 1→3 | .0861→.0864 | 6/6 | 10→5 | 未过；已用尽三轮，不再重比 |
| A07 计划深 b12#917 | 1 | .1106 | 8/8 | 11 | 未过；计划类型确认区与设计尺寸冲突 |
| A08 深 b12#921 | 1 | .0917 | 7/7 | 6 | 比到了 `/home`，比较对象错误；`/contacts` 实机读服务失败 |
| W01 1440 浅 b1#16 | 1→3 | .0502→.0402 | 8/8（第 3 轮） | 27→23 | 未过；已用尽三轮 |
| W07 计划 1440 浅 b12#972 | 1→2 | .0447→.0277 | 5/5（第 2 轮） | 10→6 | 未过；实际显式类型核对区比设计稿更大 |
| W08 1440 浅 b12#984 | 1→2 | .076→.0583 | 25/25（第 2 轮） | 5→6 | 第 1 轮路由错；第 2 轮真实完整人脉页 2779px，画板为 900px 横条样例，不是同一整屏 |

未列的 P/宽度/主题没有可比较的同态 fixture，结论为 **未运行**，不能把预检或 Web 五屏操作截图算作像素通过。A01 错选 b1#10 的深色初比（raw .215）为无效比较。已到三轮上限的 W01、A07 锁定态转余项轮，不再本次增跑。

## 跨线交接

| 下一方 | 本端版本／已知事实 | 请求与接受条件 | 未验范围 |
| --- | --- | --- | --- |
| A 组件库 | C `7bffccbbd` 的 AppScreen kit／UiText 和 Web 自有 CSS；A01/A07 超带仍多 | 评估资料表单行高、输入、chip、指南卡与示例横条的 kit/token 对齐；给独立组件提交和 R28 状态 fixture 后按清单重比 | 未请求 C 越线修改 A 组件；手机系统外壳不实现 |
| B 名片／计划服务 | C `1073f9ea9` 改扫卡到 `/app/contacts/new/scan`；`04d6bbe76` 两端仅续接 `source:onboarding` intake | 扫描/导入路由提供明确 return-to-guide；plan intake 写在示例期返 403 且无存储／AI 副作用；4 阶段失败恢复与 App 回 Task 正例由 B/R23–25 给回执 | 本地 blank AI provider 仅到问题阶段；未写 B API 文件 |
| D Task／壳 | C 的指南显示 2/3 且未生成 active plan；A08/W08 画板与真实人脉页整屏不符；`shell-routes.ts` 当前对 `/app/start` 和 `/app/profile/onboarding` 禁壳 | 恢复 Task›プラン 空／有计划／示例横条、展开/药丸、写拦截、继续指南；明确 R28 两页的新壳插槽方案并移除对应禁壳路由，再回传独立 SHA、状态 props、同态 fixture、触控链 | 无 D 提交，未改 Task／壳；首页首步文案在 3 联系人后仍说“追加 3 张名片”需 R10/D 对齐 |
| 主会话／Bridge | 本地 contract v2、App 兼容、真实指南/intake；生产与付费均未动 | 在共同环境审阅安全 next 矩阵、跨端完整回读、active 计划 3/3、A/B/D 提交后重比；决定是否授权付费 AI/生产示例开关 | 没有请求或执行发布；`bridge/status.md`／`handoffs.md` 台账由 Bridge 协调者更新 |

DEFERRED（待用户授权）：生产示例开关、生产 since 与迁移、Neon/生产数据库、付费 AI 正例、部署／推送。当前本地测试账号与合成联系人仅在 `orbit_line_c`。

## 收口门禁与独立复核

基线：R18c Web 7915/6873 过/5 失败/1037 跳，App 3277/3261 过/14 失败/2 跳；较新主会话 R10fix Web 7936/6890 过/6 失败/1040 跳，App 3288/3272 过/14 失败/2 跳。失败按名称比对。

Web 单次全量（`heavy.sh c`，仅 LANG/LC_ALL）：7954 项，6852 过／8 失败／1094 跳，exit 1，日志 `_evidence-c/R28/web-full-closeout.log`。其中 6 个与 R10fix **同名**：产品 surface manifest、名片合并空字段、plan 设计 fixture、两项 B 扫描 UI 超时、原有 copy 上限失败。新增的 profile live-store 旧生日断言、copy allow list 未随翻译缩小已在 `f41c94d4a` 修复；修后定向 profile/continue/guide 40/40、copy 审计 7/7、Web typecheck exit 0。遵守“全量只在收口跑一次”，不把定向绿写成第二次全量通过。

App 单次全量（`heavy.sh c`，仅 LANG/LC_ALL）：3291 项，3267 过／22 失败／2 跳，exit 1，日志 `_evidence-c/R28/app-full-closeout.log`。13 个失败名与 R10fix 相同，旧 Home scroll 失败本次未复现；9 个 R28 新失败分别为继续页旧静态断言 1、copy 审计 2、离线读取注册 1、profile policy 旧断言 5。当前修正已使 profile 不合法已知版本拒绝、未来版本仅降级为不可判完成、v2 的无效生日仍可返回 incomplete；三语指南 copy 移入 locale 文件，继续页改用现有键，离线读取新入口保持 online-only。修后受影响定向与 typecheck 结果见下，不冒称第二次全量通过。

Web `typecheck:app` exit 0、lint exit 0、contract snapshot `--check` exit 0。`copy:qa` 7601 条、249 项问题，exit 1；介绍失败文案修改后再次运行，输出与 `web-copy-qa-closeout.log` 逐字相同，R28 键 0 项新增，故这项保留为既有质量门禁失败，不写成通过。日志分别为 `web-lint-closeout.log`、`contract-snapshot-closeout.log`、`web-copy-qa-closeout.log`、`web-copy-qa-after-errorcopy.log`。

R28 定向 Web 指南 28/28、资料路由 35/35、App 资料交互和指南相关定向均绿；两端 typecheck 在 UI 提交前后已各通过。App 修后受影响定向、route parity、contract sync 共 69/69，typecheck exit 0。独立复核另跑 Web 关键服务／路由／指南 40/40、App route parity／contract sync／intake 16/16，contract snapshot exit 0；介绍失败 UI 定向 15/15、文案审计 7/7、Web 资料编辑服务契约 10/10、App 离线读取与目标模型 47/47、App 续接／初始路由／route parity 31/31、Web typecheck/typecheck:app 与 App typecheck exit 0。Web 资料目录试迁又局部撤回后的复核见 REVIEW。

`204814b18` 后追加定向复核：Web 并发保存／资料五屏／指南／文案审计 43/43、Web typecheck exit 0；App 资料 API 与组件交互 22/22、路由和 intake 13/13、App typecheck exit 0。App 字典域检查 3 项中 2 项通过；唯一失败「original split key set」与 R10fix 基线同名，新增 `guide.*` 域已使「each locale is a folder」恢复通过。一次误用 App `npm test -- <file>` 触发全仓 glob 后已立即中断，**不是一次完成的全量验证**，不能用其结果改写上述单次收口全量结论；随后改用直接 `node --test` 定向运行。

`23b76c711` 后 Web 日文首页／人脉预览定向 17/17、文案审计组合 23/23、typecheck exit 0。预览是只读示意，不把其中的示例活动／人物当真实进度或联系人；完整画板像素仍按 SC13/14 保持未过。

指南资料门禁修后，Web 代理／导航／指南组合 46/46、typecheck exit 0；App profile API／继续／指南入口 17/17、typecheck exit 0。App 真机重启 bundle 的同账号直接深链复核见入口段；这些定向结果不替代单次全量的失败结论。

本地 `orbit_line_c` 追加 Web 双标签／换号操作复核：新合成账号同时打开两个 Basics 标签，各填不同姓名；标签 A 保存后服务端为 `Cross Tab A`、`lastConfirmedScreen=1`、`currentScreen=2`。标签 B 用旧版本点继续，界面提示资料已变化且草稿未保存，服务端姓名仍为 A、进度仍为第 2 屏；B 刷新后显示 Goals，预览姓名也是 A。在同一浏览器保留本地存储、清除会话并注册另一合成账号后，服务端资料姓名为空、流程记录为 `null`，Basics 输入为空，没有继承前一账号草稿。

双端接力：C 模拟器先从另一合成账号登出，再登录该部分资料账号；`continue` 显示 1/5 续填卡，点继续直接进入 Goals 2/5。App 选一项目标并保存后进入 Offer & seek 3/5；Web 重新登录同账号，API 读回 `relationshipGoal=資金調達`、`lastConfirmedScreen=2`、`currentScreen=3`，页面也显示 Offer & seek。对应实机/浏览器截图 `_evidence-c/R28/cross-device-{app,web}-step3.png`。这验证了两端的一次往返，不替代完整五屏跨设备、离线、邀请矩阵。

R18a 共用 GoalEditor 新增 R28 保真回归：把双目标及自由句组成的无期限文字解析后重开，输入仍是原文、没有期限被选中，复合保存仍为原文；`tests/pages/app-profile-goal-editor.test.tsx` 定向 5/5，React 服务端渲染仍打印既有 `useLayoutEffect` 提示。随后 Web 新账号在本地完成余下第 3～5 屏（AI 因空 provider 失败后手填、导入跳过），服务端读回五屏已完成；该操作没有进一步证明资料页编辑弹窗里的目标保存回读。

独立复核细节见 `REVIEW.md`。全量仍为 exit 1，像素超带仍未归因；定向通过没有覆盖整套注册／邀请、付费计划和 Task 回程。
