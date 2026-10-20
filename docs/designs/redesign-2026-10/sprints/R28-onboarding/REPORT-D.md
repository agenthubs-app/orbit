# R28 D 线：Task › プラン与壳复核

日期：2026-10-20。状态：**D 线局部交付；SC-R28-10/11 与 Sprint 整体未验收完成**。本报告独立于 C 线 `REPORT.md`；没有推送、部署或访问 Neon／生产。

## §R28-g 交付

- Web Task 的プラン页读取同一 actor 的 R10/R28 指南投影，`inDemo` 时显示杏色示例横条；持久化的 `guideState.bannerCollapsed` 决定展开或药丸，显示投影所得 `n / 3`，继续入口为 `/app/start`。空计划与已有计划都走同一提示，计划区域的按钮、链接、表单提交及顶栏新增会在用户触发前弹出示例只读提示。非示例保留原计划页。
- App Task 的プラン页通过新增的、仅认证本人可读的 `GET /api/tasks/demo-status` 取得同一服务端视图。D 自有适配层在演示开关开启时把指南来源的 `null` 判为读取失败，API 返回 503，App 保持加载／重试状态且不开放新增；Web Task 服务端页也使用同一严格适配层，不把来源故障误作“非示例”。示例时 App 以遮罩拦截计划动作，横条／药丸、`n / 3` 和 `/start` 继续入口与 Web 对齐。折叠状态写回既有 `PATCH /api/guide/state`；失败保留原状态并提示重试。App 离线读取清单登记了新 GET 与现有 PATCH（在线且非离线队列）。
- C 的 §R28-b 两条壳路由 `/app/start`、`/app/profile/onboarding` 留在共用 `ShellPage`，D 复核其导航键应为 Home；`shell-routes.ts` 已加 `/app/start → home`，其他路由规则不动。App `parentForPath('/start')` 也明确为 `/home`。
- C 的 §R28-f 首步判断使用共用指南投影，方向正确；D 把 Web 首页仍写「追加三张名片」的三语文案改成「确认三位联系人」，与完成判定一致。三语定向测试覆盖文本。

## 写保护边界与待交接

Task 前端拦截有定向浏览器／App 测试：示例计划按钮不能写入，空计划创建动作不能导航到创建页，折叠状态可写回。D Task 专用的严格适配层补测了指南来源失败→Web 页不渲染可写计划／App API 503，而非 `inDemo=false`。C 已为 `POST /api/agent/plans/intakes` 加 `SAMPLE_READ_ONLY` 403 且 service spy 未被调用。**其他计划写路由**（例如条目变更、手动进展、v2 操作）位于 B/R23–25，当前未见统一的 demo actor 403；因此不能声称直接 API 请求也被拒绝，SC-R28-10 的服务端零副作用门禁仍未过。C 共用读取器在其他页面仍会把来源故障折成 `null`，需 C/B 联验；本次 D 的前端拦截不能替代服务端门禁。

## 验证和像素

Web `GET /api/tasks/demo-status` 与指南来源故障定向 4/4，Task 浏览器与切换页签瞬态 13/13；壳定向 18/18；首页文案定向 9/9。App 读取／导航定向 10/10、离线清单 29/29、提示组件 1/1；Task 容器实渲染在补充非示例 API fixture 后 11/11。另测既有 intake 示例 403 定向 5/5。

App 用户限定的**一次**全量在修复前运行，`_evidence-d/R28/app-full-final.log`：3,319 tests／3,301 pass／16 fail／2 skip、exit 1。对 `_evidence-main/r10fix-app-full.log` 的 14 个失败名逐名比较：当时**新增 3**、旧失败转绿 1，详细集合在 `_evidence-d/R28/app-failure-comparison.json`。三个新增是本次提示组件的原色值和原生 `Modal` 触犯既有审计，以及旧 Task 测试未给新增 API 回非示例状态。生产组件已改用 kit `ConfirmDialog`，旧夹具补明确的 `inDemo=false`，另增 `inDemo=true` 的动作拦截测试；后续精确的 `node --test` 五文件 **26/26**，涵盖颜色／旧 UI 审计及 Task 容器 11/11。App `npm run typecheck` exit 0。并入 C 的 R28 复核修复后，App 导航／离线清单及本次受影响文件扩大定向 **39/39**、`typecheck` 再次 exit 0。**没有第二次 App 全量**，所以最终合并树完整「新增 0」尚无全量复核证据。曾误用 `npm test -- <文件>`，该脚本忽略文件参数而启动第二次全量；发现后中止（exit 130），不计作结果，随后改用 `node --test` 精确跑文件。

Web 首轮全量在四个 D 静态门禁修复前运行，`_evidence-d/R28/web-full-final.log`：7,970 tests／6,865 pass／11 fail／1,094 skip、exit 1。对 `_evidence-main/r10fix-web-full.log` 六个失败名，首轮**新增 5**：本线的 Task 硬编码文案两项、CSS token、裸按钮，以及未改动的活动报名↔计划同步测试。把文案移入三语 `taskCopy`、CSS 改为 token、裸按钮改成 kit `Button` 后，Task 浏览器与四个审计连同计划同步单测定向 **30/30**；计划同步失败单独不可复现。中途发现 Task 状态读取故障需严格区分，故中止尚停在产品审计段的中间复跑（exit 130）；新增的故障注入与 Task 浏览器定向 **17/17**，Web `npm run typecheck:app` exit 0。`copy:qa --web` 为 4,200 entries／29 个仓库既有问题，D 新增的 Task／Home 文案无告警。

D 源码修正后的 Web 全量 `_evidence-d/R28/web-full-verified-final.log`：**7,973 tests／6,874 pass／5 fail／1,094 skip、exit 1**。`_evidence-d/R28/web-failure-comparison-final.json` 对指定 R10fix 六个失败名：**新增 0、旧项转绿 1**（硬编码文案 allow list）；剩余 5 项均同名旧失败。活动报名↔计划同步那项在该轮通过。随后并入 C 的 R28 复核修复，Web D 相关扩大定向 **61/61**、`typecheck:app` exit 0。

**最终合并树** Web 全量 `_evidence-d/R28/web-full-after-rebase.log`：7,978 tests／6,876 pass／7 fail／1 cancelled／1,094 skip、exit 1。`_evidence-d/R28/web-failure-comparison-after-rebase.json` 对 R10fix：新失败名 **3**，分别是 C 的指南步骤点击／已记录步骤两项旧测试仍期待「步骤 1 未完成时可重开步骤 2」，以及 B 扫描批次 ID 编码用例 30 秒超时。指南两项单独复跑 20 项中 18 过／2 失败，`9b2033e25` 的 `canOpenStartStep` 已按复核要求改为检查全部前置步骤，但 `app-start-guide.test.tsx` 对应 fixture／期望未同步；本线不回退正确的顺序规则。扫描超时在 C 的最新 `REPORT.md` 也明确记录为单独复跑仍超时。三项均不在 D 源码／测试路径，本报告没有把「最终合并树新增 0」写成通过；D 自有 Task、壳、Home 与审计定向 61/61 通过。

截图证据在 `/Volumes/ORICO/Dev/worktrees/orbit/_evidence-d/R28/`：最终源码重抓 Web 的空／有计划 × 展开／药丸 × 浅／深局部 fixture 共 6 张；App 提示组件的展开／药丸 × 浅／深共 4 张，并人工检查了 Web 1440 展开和药丸、App 深色展开。Web 有计划 fixture 使用合成计划内容，App 截图只渲染提示组件；D 本地临时签名导致 App Keychain 登录链未成立。并入的 C 报告后来补有本地付费 AI 正例，`_evidence-c/R28/paid-local/{web-task-plan,app-task-plan}.png` 展示了同账号真实 active plan 与双端 Task，但拍摄于 D 示例提示代码并入之前，不能替代 D 改后实机复测。b1 A4 #22–25 是 Home／人脉样例，**没有 Task 整屏同态画板**；按 PLANNER §像素规则，D 的十张局部截图不计正式像素通过，Task 专项正式比较 0 轮，未耗用三轮上限。D 改后的 App 实机 Task 示例／真实计划、跨端折叠及触控录屏仍待同态 fixture。

| SC | D 线结论 | 还缺什么 |
| --- | --- | --- |
| SC-R28-10 示例模式 | 部分 | Task 前端展示与拦截已做；B/R23–25 其余计划写 API 的 403／库、AI、通知零副作用未联验，跨端折叠实测未做。 |
| SC-R28-11 Task | 部分 | 空／有计划组件及示例状态定向覆盖；C 的旧版本有真实 active plan 双端截图，D 改后未实机复测，Task 无同态画板可进像素门禁。 |
| SC-R28-14 像素 | 未过 | Task 局部 fixture 只供审阅，没有正式整屏比较；C 既有像素失败仍按 `REPORT.md` 保留。 |

## Bridge 交接（由协调者更新根台账）

| 本端版本 | 另一端影响 | 未完成事项 | 验证范围 |
| --- | --- | --- | --- |
| D `f221919b2`（§R28-g Task／壳／首页文案）；R19 复核 `7f9dcca0a` | C 的指南投影现在进入 Web/App Task 示例提示；Web `/app/start` 导航归 Home，App `/start` 归 Home；B 的 intake 403 保留。 | B/R23–25 对所有计划写 API 做 actor 级 `SAMPLE_READ_ONLY` 403 和零副作用测试；C/B 联验其他 demo 页面来源故障时的服务端保护；C 已有真实 active plan 正例，需在 D 合并后回传同 actor 示例／真实状态与双端触控链；A/设计给 Task 整屏同态画板或明确无画板状态。 | D 的组件、路由、API 与离线清单定向；本地十张局部截图。正式像素、真实跨端持久化及计划服务端全路由写拒绝未验。 |
| C／B R28 回归 | 合并 `9b2033e25` 后，R10fix Web 基线之外出现 C 指南两名、B 扫描一名；D 没有改这些文件。 | C 更新指南测试 fixture／期望以符合「所有前置步骤已完成才可进入」的新规则；B/C 查扫描批次 ID 用例的 30 秒超时，保持编码断言。 | 合并树 Web 全量日志与失败名 JSON；指南定向 18/20；C 报告也记录扫描单测超时。没有 C/B 修复提交或复跑后的全量。 |

生产示例开关、正式账号及部署仍按 C 的 `REPORT.md` 待用户授权；本线没有进行这些操作。
