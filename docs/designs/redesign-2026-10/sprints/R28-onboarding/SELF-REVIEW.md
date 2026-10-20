# R28 C 线自查

日期：2026-10-20。结论：**局部功能已交付，R28 未达到 Sprint 验收条件。** 本文件仅为 C 线自查，主会话的独立 `REVIEW.md` 文件名保持空出。自查重新查读源码、定向运行关键用例并核对门禁；全量失败或未运行的像素状态不记为通过。

## 重新执行

| 项目 | 结果 | 范围 |
| --- | --- | --- |
| Web guide/progress/continue 关键用例 | 40/40 过 | 真实三步投影、actor 流程 CAS、API 401/403、锁定、`next` 与计划入口 UI |
| App route parity/contract sync/intake | 16/16 过 | 路由覆盖、3 份契约副本、平台 href 与 `source:onboarding` 续接 |
| Web 旧标签导出退休后 | 41/41 过 | Web 资料五屏、指南、原 profile 兼容路径；另有导航／资料门禁 13 过、4 项因 PG 测试库未配置而跳 |
| 文案零增长审计 | 9/9 过 | 旧 opening snapshot 原样保留；旧允许清单没有扩大 |
| TypeScript 与契约 | Web typecheck/typecheck:app exit 0、App typecheck exit 0、contract snapshot `--check` exit 0 | Web 旧导出删除后无运行时 import；App 受影响定向 69/69 见 REPORT |
| Web 页面 surface manifest | 87/88 过 | 唯一失败仍是 Host/Search 的三个既有 P0，未涉及 R28；与全量基线同类 |
| 资料编辑与离线读取 | Web 资料编辑服务契约 10/10、App 离线读取与目标模型 47/47 | 目标字段部分更新和清空、三语目标往返、读取域精确策略；尚未替代两端同账号双设备实测 |

Web/App 各只跑过一次收口全量，分别 exit 1。新增失败已按 REPORT 所列原因修复并用定向测试复核；**没有第二次全量通过的证据**。`copy:qa` 仍 exit 1，输出与本轮更早基线逐字一致。报告保留这些红项。

## 源码与运行链核对

- `features/guide/start-steps.ts` 与 `progress.ts` import R10 的同一份 `computeGuideRealProgress`；指南与首页的三步完成事实不靠客户端 `currentStep` 猜测。资料进度是 actor 级 CAS；未知服务端资料政策不误判已完成。
- `/api/profile`、资料进度和介绍草稿的示例请求在构造存储或模型前返回 403。Web 资料页内嵌预览只把点击导回真实填写步骤；`/start` 是真实指南，仍在示例期的新用户需要能从这里保存目标。不能把整页挂到示例写拦截下。C 的计划入口仍依赖 R22–25 的写 API 提供同等保护，A/D/B 的示例表面未联验，因此 SC10 保留部分。
- 本地合成账号走过 App 空生日、双目标、介绍失败后手填、导入跳过；Web 确认三个联系人，创建 onboarding intake；App 恢复同一个 intake。付费 provider 留空，计划 AI 初版失败，没有 active plan；3/3、Task 回程和日文真实 AI 正例无证据。
- 另一个 Web 新账号完成了基本→目标→画像→介绍失败后手写→导入跳过，服务端读回五屏确认与结束时间；之后 `continue` 落回 `/app/start`。逐屏操作截图在 `_evidence-c/R28/web-five-screen/`，不替代像素门禁。实机截图发现原介绍失败提示暴露 `API_KEY` 配置名；`f718ea48d` 改为按错误码给可操作的用户文案，重试/额度用尽定向 15/15、文案审计 7/7、Web typecheck/typecheck:app exit 0，修后本地截图不再含配置名。
- 浏览器补核 Web 新注册与匿名／合法／恶意 `next` 的实际路由，结果记于 REPORT。有效邀请、跨设备同标签和 App 登录链仍需同态环境。
- C 模拟器实际暴露 `/start` 不在 App 初始路线允许表：深链继续误回 Home。`f377525f4` 只登记此 C 指南路由；RED 为 18/20，修后 App 初始路线／资料续接／route parity 31/31、typecheck exit 0，重启 bundle 后实机继续落到真实指南，恶意外站 next 回 Home。`simctl` 直接写入旁支证据目录遇到 macOS 权限拒绝；改为截图到 `/tmp` 后复制，未把首次截图失败算成 UI 失败。
- 双标签复核发现 Web 和 App 的资料客户端在 409 后无条件读取新版本并重发旧输入，能覆盖另一端刚确认的同一字段。`204814b18` 改为停止写入、保留本屏输入并提示核对；Web RED 0/1→GREEN 1/1，资料／指南／文案审计组合 43/43；App API RED 7/9→GREEN 9/9，交互组合 22/22、route parity/intake 13/13，两端 typecheck exit 0。App 指南文案同时并入正式 `guide.*` 字典域，修复新增空域导致的目录校验失败；旧 pre-split 字典哈希仍与 R10fix 基线同名失败。
- Web 资料内嵌预览在 ja 模式仍回退英文。`23b76c711` 为首页和人脉预览补日文表与动态句，RED 15/16→GREEN 17/17；文案审计 23/23、Web typecheck exit 0。只读示意仍不参与真实指南的联系人／计划计算。
- 在本地 `orbit_line_c` 做了同账号两个 Web 标签的真实操作复核：两标签各持一份 Basics 草稿，A 保存推进到 Goals，B 的旧版本保存提示冲突且保留输入；API 再读仍是 A 的姓名与第 2 屏。B 刷新后续填 Goals。随后在同一浏览器换新合成账号，资料姓名与进度均为空，Basics 输入未串号。C 模拟器从另一账号登出并登录此账号，续填卡为 1/5，直接进入 Goals；App 保存目标到第 3 屏后，Web 再登录同账号读到相同目标与第 3 屏。截图在 `_evidence-c/R28/cross-device-{app,web}-step3.png`。邀请与完整离线矩阵仍未完成。
- R28 双目标无期限文字经过 R18a 共用 GoalEditor 的解析、重开与复合写入后保持原文；定向 5/5。实际本地 Web 账号随后完成第 3～5 屏，AI 空 provider 手填继续，服务端五屏完成回读；资料页编辑弹窗的目标保存回读仍没有端到端证据。
- 有效邀请的 Web 实链补核发现旧 W0006 `/app/start` 豁免绕开了 R28 资料门禁：邀请页匿名 200，注册后直回邀请并连接，但缺行业资料的新账号可进入真实指南。C 线移除这条精确豁免，保留邀请公开例外；代理测试先 RED 7/10、修后连同导航／指南 26/26。相同邀请账号再进指南被转到资料五屏且 `next=/app/start` 保留，完整账号仍能进入指南。截图 `_evidence-c/R28/valid-invite-{anonymous,profile-gate}.png`。
- 相同邀请账号在 App 直接打开 `orbit://start` 也暴露 0/3 真实指南。C 线 App 入口现在先读取服务端 profile policy，完成才读指南，未知政策和读取失败不能放行；定向测试 RED 0/4→GREEN 4/4、App typecheck exit 0。重启 Metro 后实机深链落五屏首屏，前后截图 `_evidence-c/R28/app-invitee-{guide-bypass-before,profile-gate-after}.png`。
- App 注册→登录→资料五屏的邀请安全目标纯路由链 8/8，目标仍为 `/i/ABCD-EFGH`。全新本地 App 账号实机从匿名邀请进入，完成五屏后回原邀请并兑换 200，`used_count` 1→2；已有完整资料账号从同一匿名邀请登录，直接回邀请并兑换 200，`used_count` 2→3。完成页显示双方连接；截图 `_evidence-c/R28/app-invite-{open,return,connected}.png` 与 `app-invite-existing-{return,connected}.png`。两条正例仍未遍历整张认证矩阵。
- §R28-b 已授权 C 精确修改 D 壳路由：`/app/start` 和 `/app/profile/onboarding` 不再禁壳，并接现有 `ShellPage` 插槽；路由测试通过。D 仍需复核壳状态与同态像素 fixture。
- 全仓当前运行时代码与测试的旧 `onboarding-0918` 引用已清除，Web 五屏在 `orbit-2026/onboarding`，文案在 `orbit-2026/copy/onboarding.ts`，ja/zh/en 齐备。新目录 copy 审计零新增；旧路径仅保留在不可改的历史 opening snapshot 与历史描述中。

## 边界与余项

本轮 §R28-b～f 定向自查：壳路由 1/1；新目录 copy 审计 7/7、资料流程／冲突／首页模型 23/23、Web typecheck 通过；样本 intake 路由 5/5，403 返回前不构造 service；Web 指南卡回程 1/1、B 扫描完成 UI 回程 1/1，App 回程目标白名单 1/1、App 入口模型 15/15、App typecheck 通过。App 旧扫描上传 UI 用例仍在 5 秒内停于「アップロード中 0 / 3枚」，仅见 POST 批次而无 PUT 图片；暂时还原本轮 `ScanCaptureScreen` 所有修改后同一用例仍失败，因此不归因于本轮回程改动，也不把它报绿。最终全量结果另记 REPORT。

最后一次 Web 全量在日文 `LANG` 下出现一个 R10fix 未列的新失败名：Home bounded SQL 测试要求查询一次，而生产排序运行时在未验证的 `ja-JP` collator 下先拒绝查询。源码没有为测试放宽排序守卫；测试补上此安全分支，整文件在日文与默认 locale 各 24/24。全量原始失败仍保留在 REPORT，未第二次运行全量。

相对起点 `8862ccce4` 的已提交源代码和测试 diff 位于 R28 归属的资料、指南、契约兼容、视图和证据路径。按主会话 §R28-b/d/e/f，本轮还精确修改 D 壳两路、B 扫描／导入 returnTo、B intake 示例写拒绝、D/R10 首页首步文案。A 组件、D Task、R22–25 计划引擎没有被 C 修改；用户原有 `HANDOFF-CLAUDE-2026-10-19.md` 未动。没有推送、部署、生产/Neon 连接或付费模型调用。本机 provider key 未配置，RD-33 授权有效。本地服务和 C 模拟器均已停止；Next 启动时自动写出的 `next-env.d.ts`、`tsconfig.json` 已恢复。

下一次验收须取得 A/D 的状态组件和同态 fixture、可用的本地付费 provider key，以补日文介绍、active plan 3/3、四阶段 Task 回程，再补前端示例表面、注册／邀请／设备矩阵和未过像素带。B 回程与 intake 403 已由 C 在精确授权边界实现，仍待 B 复核。W01 与 A07 锁定态已达每屏三轮上限，转 ⑪，本次不再加跑。各 SC 的具体缺项及四方请求见 REPORT。
