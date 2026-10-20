# R28 新用户引导 — C 线交付与未结项

日期：2026-10-20。状态：**部分交付，Sprint 未验收完成**。本线只在本地 `line-c` 提交；没有推送、部署、访问 Neon／生产库或调用付费 AI。用户原有的 `HANDOFF-CLAUDE-2026-10-19.md` 未改动。

## 版本与做成的链路

- 起点 `8862ccce4`（含 R10 投影 `8eaf86733`）；设计 `50c708543`，契约兼容 `b987287e1`，政策 v2 `0881931f2`，资料流程和介绍额度 `90a346202`，真实指南与 intake `04d6bbe76`，原生界面 `7bffccbbd`，Web 资料和 B 扫描入口 `1073f9ea9`，Web 指南三语与布局 `3902a452d`，文案审计修正 `f41c94d4a`，像素视图清单 `c7025e429`，App 契约与读取注册 `11db421e9`，旧资料标签兼容导出清理 `f1e98a2b9`，介绍失败文案收口 `f718ea48d`。上述提交均留在本地。
- 资料政策 v2 允许空生日，姓名／行业仍必填；App 先兼容 v1/v2／未知新版再切服务端。共享契约 snapshot 已更新，App 副本已同步。首次资料 PUT 前建 actor 流程；每屏 PUT、GET 复读、进度确认，失败不推进。跨端使用同一进度记录。
- 目标最多 2 个、保序、无默认期限；保留旧文本。介绍可用 ja/zh/en，首次流程每 actor 成功总额 3 次；幂等键、并发额度与失败重放由服务端持久记录，手写可继续。该本地运行未配置付费 provider，因此实际付费模型调用 **0**。
- Web `/app/start` 去掉演示开关门禁；App `/start` 已成为真实三步页。两端从 R10 共享投影读取 3 个条件，步骤 3 显示保存的第一目标并要求用户选 `goalKind`；仅恢复 `source:onboarding`、类型相符的 intake，不把同名其他来源当续接。Web 用 Web href，App 校验 App href 后进入原生计划流程。
- 本地同一合成账号实际走完 App 资料五屏：空生日、两个目标、介绍 AI 失败后手写、跳过导入。另一新 Web 合成账号也实际走完五屏：空生日、两个目标、介绍 AI 失败后手写、导入跳过；服务端回读 `lastConfirmedScreen=5`、`finishedAt` 非空，返回 `/app/start`，再进 `continue` 仍到 `/app/start`。六张 Web 各阶段截图在 `_evidence-c/R28/web-five-screen/`。Web 手工确认三个联系人后显示 2/3，并创建 onboarding intake；App 从指南恢复**同一个** intake 的问题阶段。首次草稿因本地没有付费 AI 配置失败，未产生 active plan，故 3/3 和回 Task 的四阶段链未验。

## SC 逐条结论

| SC | 结论 | 证据与缺项 |
| --- | --- | --- |
| 01 开工／预检 | 部分 | `preflight-checklist.md`、b1/b12 清单和两块 b12 定向预检；整份 b12 变体预检因耗时中断，未记通过。起点与 R18c/R10 基线见下。 |
| 02 入口／next | 部分 | Web 本地实际注册保留 `/app/start` 到资料页；匿名继续与指南 307 到登录，完整账号安全 next 到 `/app/start`，外站与嵌套循环回 `/app/home`；App 为定向测试。有效邀请和双端登录的整张实机 URL 矩阵未完成。 |
| 03 资料五屏／D28-2 | 部分 | BREAKING 登记、App 先兼容、v2、CAS/幂等/API、两端五屏操作链与服务端完成回读已做；跨设备双标签、完整回读矩阵及各屏像素尚未验。 |
| 04 目标／文案 | 部分 | 上限 2、第三项限制、保序、三语与显式类型选择的定向测试；旧 R18a 编辑器重开与各版位像素尚未全验。 |
| 05 AI 介绍 | 部分 | 服务额度、重放、并发、三语测试与两端失败手写链；Web 失败页不再显示 provider 配置/密钥名，额度耗尽不再给重试按钮。没有授权的付费正例，日文实际模型输出未运行。 |
| 06 名片入口 | 部分 | C 的旧 card-batch UI 已迁往 B 的扫描/导入路由；Web/App 跳过导入的完成链已实测，B 回程仍依赖浏览器返回和服务端续填，0/3/10 张真实批次未全验。 |
| 07 硬顺序 | 部分 | R10 共享投影、0/2/3 联系人及锁定／`?step` 定向测试，server 写拒绝；双设备、active v1/v2 的完整事实矩阵未全验。 |
| 08 App 指南 | 部分 | 原生 `/start`、锁定、2/3、计划续接已实机；active plan 缺付费 AI 正例，不能声明 3/3。 |
| 09 指南到 v2.2 | 部分 | 双端显式类型、onboarding intake 恢复同 ID；Web AI 初版失败后只显示恢复出口，四阶段→Task 未到达。 |
| 10 示例模式 | 部分 | C 的 profile、flow、intro 服务端样本写 403 早退测试；C 页前端拦截、plan intake 与 A/D 拥有的示例横条/药丸未联验。 |
| 11 D 线 Task | 待 D | 本线未修改 Task。状态契约与具体请求在下表；没有 D 提交和回传，Task 链不能报通过。 |
| 12 旧引用 | 部分 | C 的旧 `card-batch-ui` 使用与 `profile-model` re-export 已清理；Web 资料仍挂在 `onboarding-0918`，尚未达到新目录的文案审计零例外要求。 |
| 13 资料像素 | 未过 | W01 1440 浅和 A01 深各有 triptych；超阈值带仍未归因，其他宽／主题及资料屏没有完整 fixture。 |
| 14 指南／示例像素 | 未过 | A07、W07、W08 门禁失败；A08 首次比较用了错误路由，随后 `/contacts` 数据读失败，不能判通过；A/D 组件与 fixture 缺口见下。 |
| 15 失败／兼容／离线 | 部分 | v1/v2/未知契约、资料／进度重试、无网络和 intake 错误定向测试；跨端换号和完整离线同步审计未完成。 |
| 16 收口 | 部分 | 本地代码、视图清单、REPORT／REVIEW、全量与基线对照均已收口；全量与像素门禁仍红，跨线依赖未回传，Sprint 保持开放。 |

R28-01→SC10/14：服务端 C 写保护已做，A/D 的展示与其他写入口待接。R28-02→SC11：Task 请求待 D。R28-03→SC09：已改为严格 onboarding intake。R28-04→SC07/08/12：App 真实指南已接，C 的旧 B 名片 UI 使用和资料标签旧导出已清理；Web 资料旧目录仍待迁移。试移 `orbit-2026/onboarding` 时，既有新目录审计检出 hard-coded 8/6/1、缺 ja 120/80；该试移已局部撤回，文案迁移与壳接入保留为未完成项。

入口 URL 表由源码、定向测试与本地 Web 实际路由核对；有效邀请与 App 全矩阵仍未跑。本地两个一次性合成注册账号只写入 `orbit_line_c`，一个落到 `/app/profile/onboarding?next=%2Fapp%2Fstart`，另一个点击「Just look around」后重进 `/app/profile/continue` 仍回资料页。无会话 curl 访问继续页与指南均返回 307 登录，安全目标保留；已有完整账号的 Web 浏览器访问合法目标、外站目标和嵌套继续目标分别落到 `/app/start`、`/app/home`、`/app/home`。

| 条件 | Web 落点 | App 落点 |
| --- | --- | --- |
| 未登录访问继续页 | `/app/account/login?next=...`，保留安全目标 | 账号登录入口，安全目标由原生路由解析 |
| 资料未完成或流程未结束 | `/app/profile/onboarding?next=...` | `/profile/onboarding?next=...` |
| 资料完成且流程结束，或旧账号无流程记录 | 安全 `next`，默认 `/app/home` | 安全 `next`，默认 `/home` |
| 流程或权限读取失败 | 继续页重试提示，不猜完成 | 错误状态与重试，不写进度 |
| 外站、认证／资料循环、嵌套恶意 next | 回安全默认目标 | 回安全默认目标 |
| 邀请 `/i/<code>` | 认证后直达邀请，随后私有页仍受资料门禁 | 由原生初始路由及安全 next 解析，尚需实机邀请正例 |

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
| D Task／壳 | C 的指南显示 2/3 且未生成 active plan；A08/W08 画板与真实人脉页整屏不符 | 恢复 Task›プラン 空／有计划／示例横条、展开/药丸、写拦截、继续指南；回传独立 SHA、状态 props、同态 fixture、触控链 | 无 D 提交，未改 Task；首页首步文案在 3 联系人后仍说“追加 3 张名片”需 R10/D 对齐 |
| 主会话／Bridge | 本地 contract v2、App 兼容、真实指南/intake；生产与付费均未动 | 在共同环境审阅安全 next 矩阵、跨端完整回读、active 计划 3/3、A/B/D 提交后重比；决定是否授权付费 AI/生产示例开关 | 没有请求或执行发布；`bridge/status.md`／`handoffs.md` 台账由 Bridge 协调者更新 |

DEFERRED（待用户授权）：生产示例开关、生产 since 与迁移、Neon/生产数据库、付费 AI 正例、部署／推送。当前本地测试账号与合成联系人仅在 `orbit_line_c`。

## 收口门禁与独立复核

基线：R18c Web 7915/6873 过/5 失败/1037 跳，App 3277/3261 过/14 失败/2 跳；较新主会话 R10fix Web 7936/6890 过/6 失败/1040 跳，App 3288/3272 过/14 失败/2 跳。失败按名称比对。

Web 单次全量（`heavy.sh c`，仅 LANG/LC_ALL）：7954 项，6852 过／8 失败／1094 跳，exit 1，日志 `_evidence-c/R28/web-full-closeout.log`。其中 6 个与 R10fix **同名**：产品 surface manifest、名片合并空字段、plan 设计 fixture、两项 B 扫描 UI 超时、原有 copy 上限失败。新增的 profile live-store 旧生日断言、copy allow list 未随翻译缩小已在 `f41c94d4a` 修复；修后定向 profile/continue/guide 40/40、copy 审计 7/7、Web typecheck exit 0。遵守“全量只在收口跑一次”，不把定向绿写成第二次全量通过。

App 单次全量（`heavy.sh c`，仅 LANG/LC_ALL）：3291 项，3267 过／22 失败／2 跳，exit 1，日志 `_evidence-c/R28/app-full-closeout.log`。13 个失败名与 R10fix 相同，旧 Home scroll 失败本次未复现；9 个 R28 新失败分别为继续页旧静态断言 1、copy 审计 2、离线读取注册 1、profile policy 旧断言 5。当前修正已使 profile 不合法已知版本拒绝、未来版本仅降级为不可判完成、v2 的无效生日仍可返回 incomplete；三语指南 copy 移入 locale 文件，继续页改用现有键，离线读取新入口保持 online-only。修后受影响定向与 typecheck 结果见下，不冒称第二次全量通过。

Web `typecheck:app` exit 0、lint exit 0、contract snapshot `--check` exit 0。`copy:qa` 7601 条、249 项问题，exit 1；介绍失败文案修改后再次运行，输出与 `web-copy-qa-closeout.log` 逐字相同，R28 键 0 项新增，故这项保留为既有质量门禁失败，不写成通过。日志分别为 `web-lint-closeout.log`、`contract-snapshot-closeout.log`、`web-copy-qa-closeout.log`、`web-copy-qa-after-errorcopy.log`。

R28 定向 Web 指南 28/28、资料路由 35/35、App 资料交互和指南相关定向均绿；两端 typecheck 在 UI 提交前后已各通过。App 修后受影响定向、route parity、contract sync 共 69/69，typecheck exit 0。独立复核另跑 Web 关键服务／路由／指南 40/40、App route parity／contract sync／intake 16/16，contract snapshot exit 0；介绍失败 UI 定向 15/15、文案审计 7/7、Web typecheck/typecheck:app exit 0；Web 资料目录试迁又局部撤回后的复核见 REVIEW。

独立复核细节见 `REVIEW.md`。全量仍为 exit 1，像素超带仍未归因；定向通过没有覆盖整套注册／邀请、付费计划和 Task 回程。
