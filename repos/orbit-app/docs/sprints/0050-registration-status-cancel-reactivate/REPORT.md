# Sprint 0050 实施报告

时间：2026-09-16 14:59 UTC。唯一 Generator，run-01；不启动 Evaluator、Reviewer、第二 Generator 或新 run。
状态：本地源码交付，真实跨端验收未完成；不能标 completed。ROOT 管理主线、Bridge、服务与设备。

## 固定版本与边界

- 分支：`codex/sprint-0050-registration-lifecycle-clarity`。
- 批准 Planner SHA256：`8deec4cfbb4c86f92d4dcf3f9ee690cbcd0cc69e51480112863730ac0810d5da`，启动后未修改 Planner/SC。
- 基线：`f7c8a15123b78cfa732db10c7642573b921f3dfe`；既有取消修复依赖沿用，未重做或混入 Phone 其他未提交内容。
- 字典提交：`e285b9c989e386b3696e0f56fca9a48db88e13fc`，4 路径、80 行新增，仅新增 20 keys；已向 ROOT 释放字典锁。
- 功能提交：`fe41cb49b3cd5937a7aa9f100c7498f616933819`，33 路径、610+/81-。
- 相对基线准确产品/tests 增量：37 路径、690+/81-。本报告另占一个文档路径；没有 lockfile、env、SDK/provider、共享复制源或服务配置改动。
- App/Web node_modules 复用既有安装链接；没有安装依赖、复制凭证或读取 MAIN 环境。未真实登录、seed、写 DB、取消旧十条记录、调用 AI/OCR，未改原累计 $5 账本。
- ROOT 应精确集成取消依赖与这两个增量提交，不能合并整条 Phone 祖先。真实 build/restart、PhoneWeb、8082 Simulator 由 ROOT 统一执行。

## 行为与 SC

| SC | 本地证据与实现 | 仍缺什么 |
| --- | --- | --- |
| SC01 具体原因 | 可选 blockingReason 来自真实 enrollment/window；配置缺失、迁移、时间非法、暂时读取失败分别解释。保留 reason===state、旧 availability 签名及旧 payload。GET 读取异常为 503，不伪造配置原因；配置受限的默认读取不读/生成题。App 三语与 Web 两语接真实详情/报名消费者。 | 同固定集成版本的真实页面负例复核由 ROOT 执行。 |
| SC02 本人取消 | App canonical 详情及报名页均有可发现的取消；资料 update 禁用不隐藏合法 cancel。确认时再核对 scope/资格/版本；单飞正式 intent cancel/version，严格 actor/event/record/version 回执，独立 questions=false GET 核对后刷新。保留原 canonical_misconfigured 已有 membership 合法取消，迁移状态不授予原 POST 拒绝的 cancel。 | 未重复真实十条 POST；新版本真实取消验收与页面人数回读待 ROOT。 |
| SC03 再次报名 | 开放且 cancelled 明确 intent reactivate，原记录/版本、合法 answers 与已有签名 responses（不伪造 token），正式回执+独立 GET；取消且已截止仍保留“已取消”事实并禁提交。旧服务端 payload 与同 record 路由生命周期通过。 | 缺有配置、报名开放且当前账号合法可写的 QA 活动，不能假改日期或配置。 |
| SC04 隔离/错误 | scope、版本、草稿 revision、旧回调、单飞、403/409/503/错误 ACK、独立 GET 失败、题集变化显式丢弃等受影响完整交互测试。cancel-only 不会调用 interview/persona。Web 旧取消 ACK 换 actor 不再发旧 GET；withdraw/apply 原政策不拓展。 | 真实两端切号/服务错误复核待 ROOT；本地合成测试不能替代真实 SC05。 |
| SC05 真实跨端 | 未执行生产/设备/真实 DB 动作。 | ROOT 合并精确固定源码，生产构建重启；合法 QA 写窗口；PhoneWeb 和 8082 Simulator 对同记录取消→再次报名双向回读。SC05 未通过。 |

## TDD、类型与完整必要文件

使用 TDD、verification-before-completion、systematic-debugging；no-ai-tone 指导新增原因/确认文案采用直接、具体的表述。没有使用被用户禁止的规划/代理评审循环。

预期 RED → 最小实现 → GREEN：

- App 具体原因 3 fail → 3 pass；取消且截止保留事实额外 RED → 完整 copy/VM/locale 消费者 42 pass。
- Web 实际原因 GET 原开放 200、错误读取原 200 → 配置 200 unavailable、失败 503；window-provider 原无法区分空日期与非法顺序 → 6 pass。
- 默认配置 GET 原因题读取异常为 503 → 200 无题/无生成；完整 API/eligibility 最后 23 pass。
- App 取消原立即 POST、旧版本确认仍可 POST、有效 ACK 后 GET 503 仍称成功 → 确认/版本失效/独立回读守卫通过；取消后明确 reactivate。同文件完整交互及 canonical screen/VM 消费者最后 77 pass。
- Web 取消原双击 2 POST → 1 POST+intent/version+严格 ACK+GET。旧 ACK 换 actor：首夹具因等待多余 GET 被 Node cancelled；修订夹具令该 GET 明确 503 后有效 RED 2!=1，窄 scope 修复后完整 pages 18 pass。
- importing 既有报名原仍显示允许 cancel → 无 actions，原 POST 禁令保持。
- App 必要完整定向集初 112 pass/3 fail（旧文案断言及非 2xx ACK 不应 GET），窄修后完整 125 pass；后续变化由上述完整 77/42 文件回归覆盖。
- Web 必要完整定向集 54 total /52 pass/0 fail/2 skip；两项 PG 无合法独立目标，不称通过。
- App 类型初 exactOptionalPropertyTypes 1 错误，窄 conditional spread 修复；冻结源码类型 exit 0。
- Web 类型新 detail union 1 错误，窄结果 typing 修复；最后类型 exit 0。

没有把 test-name 筛选结果冒充完整文件。类型的失败原日志保留；未改变批准的 shared/contract、shared/api-schema、shared/domain 源或副本，未扩展 sync 通道。一次 App 全量包含合同/API Schema/受控字典 sync 检查，成功证据复用，不重复生成。

## 一次 I 的真实结果（不是最终全量通过）

两端各一次，Node 22，concurrency=2。I 开始时为当时源码快照；后续上述窄报名链补漏/夹具修复只回归完整受影响文件，未重跑整库。输入差异留 `integration-input.diff`。不得把该次 I 改记为最终源码全绿。

| 端 | 总数 | pass | fail | cancelled | skip | exit |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| App | 3098 | 3096 | 2 | 0 | 0 | 1 |
| Web | 3594 | 3324 | 57 | 7 | 206 | 1 |

App 两项均为本次的直接测试消费者，已保留 I 原失败并窄修：

1. app-wide-events 的精确报名 body 旧断言未含版本字段，保留 touch target/失败草稿断言，完整文件 29 pass。
2. event-registration-screen-source 的旧 persona→submit slice 包含新独立 GET helper，窄切片边界修正，保留“persona 不保存报名”断言，完整文件 1 pass。

Web 7 cancelled 是该次 I 载入 scope 测试首夹具版本产生的待 GET 链，后完整 pages 18 pass，不称 I 原取消项通过。57 fail 包含缺独立 PG 目标的页面/角色/迁移/worker 检查、既有 runtime/audit manifest 证据检查、contract profile 常量/出口、contact labels、durable retry、脚本子进程 node PATH/导入检查等。未改这些域外实现；未全面证明所有失败的历史归属，不猜测为本轮回归或全称旧失败。受影响服务端页面 DB 文件单独也报缺 ORBIT_EVENT_DATABASE_URL，保留原 hookFailed；不载 MAIN env、不连接业务数据库以求绿。

Guard：所有本轮定向/类型 PW guard `real-env-blocked=true`、denied=0。Web 一次 I 出站尝试合计 denied=4，被拦截，不能称“未尝试出站”；App 一次 I denied=0。额外保护 MAIN/Metro/Phone/PG 既有端口的 guard 两端 denied=0。没有执行真实出站或业务服务/DB动作。

## GitNexus 与自检

显式 repo=orbit-root，ROOT index 8f00、indexedAt 2026-09-16T12:17:04.387Z。没有自行索引大树。

- eventRegistrationToView LOW4 direct/0 flows；GET factory LOW4 direct；readRegistrationPayload LOW1 POST；Web runGeneration LOW2 direct/1 process；Web cancel LOW1 direct；OrbitRealEventDetail LOW4 direct/1 process。
- runtime availability HIGH，已由 ROOT 向用户告警；旧函数签名与函数体不改，仅新窄 reader 给必要 GET/详情/报名消费者接线，旧 AppEventsPage/AppAgentPage 流程签名不变。
- helper、canonical 模块、新 HTTP writer 与动态回调存在图盲区，明确 UNKNOWN，已补源码链和完整交互测试，LOW0 flows 不表示零风险。
- 两次提交前 staged detect 显式 orbit-root 返回 0，因为 indexed ROOT 看不到本 linked worktree 的 staged delta，解释为 UNKNOWN，不称无影响。实际 cached 字典4路径与功能33路径已逐文件自检/diff --check；实际源链 registration GET→window→eligibility→App schema/VM/模块/报名页、Web server page/workspace/detail→正式 POST→ACK→独立 GET。
- 源码自检保持 owner、报名时间、legacy_importing、旧取消依赖、签名题验证、admission withdraw/apply 边界。不引入自动配置/日期修改、退款/Push/全局画像/新报名系统/SDK/provider。

## 原始证据与复现

证据根：`build/harness-state/evidence/sprint-0050/run-01/`（ignored，不提交 Cookie/token/日志）。关键日志：

- `app-baseline.log`、`web-baseline.log`、`app-status-red.log`、`web-reason-red.log`、`web-window-red.log`、`app-lifecycle-red.log`、`app-detail-cancel-red.log`。
- `app-targeted-final.log`、`web-targeted-final.log`、`app-final-source-regression.log`、`app-final-copy-regression.log`、`web-final-source-regression.log`、`web-final-pages-regression.log`。
- `app-frozen-types.log`、`web-delivery-types-final.log`。
- `app-integration-once.log`、`web-integration-once.log`、`app-integration-local-repair.log`、`app-source-slice-repair.log`、`checkpoint.md`、`integration-input.diff`。

Node：`/Volumes/ORICO/Dev/cache/npm/_npx/52027bd8fc0022aa/node_modules/node/bin/node`。
PW preload：`/Volumes/ORICO/Dev/phoneweb-pw0010-validation/zero-outbound-preload.mjs`，完整读后执行；env-i PATH=/usr/bin:/bin，未加载真实 env。I 另 import evidence 根 `protected-runtime-preload.mjs`（仅防 guard 的 localhost 例外触及真实端口）。

App：`--test --import tsx --import ./tests/helpers/register-render-hooks.mjs <完整测试文件>`；
Web：`--test --import tsx <完整测试文件>`；
I：另加 `--test-concurrency=2` 与本端 package test 的完整 glob。
类型：Node 的 `node_modules/typescript/bin/tsc --noEmit`，Web 另 `--incremental false -p tsconfig.json`。
全部保留 NODE_OPTIONS 的 preload；命令 stdout/stderr 和退出码按上述真实结果，不把被拦截调用写成未尝试。

## 精确产品/tests 路径（37）

```text
repos/orbit-app/src/api/canonical-event-detail-contract.ts
repos/orbit-app/src/i18n/en.ts
repos/orbit-app/src/i18n/ja.ts
repos/orbit-app/src/i18n/messages.ts
repos/orbit-app/src/i18n/zh.ts
repos/orbit-app/src/screens/events/CanonicalEventDetailModules.tsx
repos/orbit-app/src/screens/events/EventDetailScreen.tsx
repos/orbit-app/src/screens/events/EventRegistrationScreen.tsx
repos/orbit-app/src/view-models/canonical-event-detail.ts
repos/orbit-app/src/view-models/event-registration-status.ts
repos/orbit-app/src/view-models/event-registration.ts
repos/orbit-app/tests/app-wide-events.test.ts
repos/orbit-app/tests/canonical-event-detail-screen.test.ts
repos/orbit-app/tests/canonical-event-detail-view-model.test.ts
repos/orbit-app/tests/event-registration-interactions.test.ts
repos/orbit-app/tests/event-registration-screen-source.test.ts
repos/orbit-app/tests/event-registration-status.test.ts
repos/orbit-app/tests/event-registration-view-model.test.ts
repos/orbits/app/(app)/app/canonical-event-detail-view.ts
repos/orbits/app/(app)/app/events/[id]/orbit-real-event-detail.tsx
repos/orbits/app/(app)/app/events/[id]/page.tsx
repos/orbits/app/(app)/app/events/[id]/register/event-registration-workspace.tsx
repos/orbits/app/(app)/app/events/[id]/register/page.tsx
repos/orbits/app/api/events/[id]/registration/route-handlers.ts
repos/orbits/app/api/events/[id]/registration/route.ts
repos/orbits/features/events/registration/blocking-reason-copy.ts
repos/orbits/features/events/registration/contract.ts
repos/orbits/features/events/registration/deadline-gated-service.ts
repos/orbits/features/events/registration/eligibility.ts
repos/orbits/features/events/registration/runtime.ts
repos/orbits/features/events/registration/storage/event-operations-window-provider.ts
repos/orbits/tests/api/event-registration-blocking-reason.test.ts
repos/orbits/tests/api/event-registration-routes.test.ts
repos/orbits/tests/pages/app-canonical-event-detail-view.test.ts
repos/orbits/tests/pages/event-registration-workspace.test.tsx
repos/orbits/tests/services/event-registration-eligibility.test.ts
repos/orbits/tests/services/event-registration-window-provider.test.ts
```

交接：功能与字典固定源码已冻结，工作树无未提交产品残留；本报告提交后给 ROOT 报告完整 SHA。两端 I/types/test 进程已结束。只剩 ROOT 精确集成/生产构建、合法 QA 写窗口、真实 PhoneWeb+Simulator SC 以及主线/Bridge 收口；本 run 不另开代理或泛化等待。
