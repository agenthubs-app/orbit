# Sprint 0081 — 执行报告

## 结果

**partial。** SC-02（复现后修复）无法达成——**在当前主线上复现不出用户那次 422**；SC-01 部分达成（抓到了这条链路唯一会产生的 422 及其 `portraitCode`），SC-03／04／05 达成。
功能已提交并 `merge --no-ff` 合回 `chat-agent`。唯一 run-01。批准契约 [PLANNER.md](PLANNER.md) revision 1／SHA256 `726a8b6a…`。

## 先用人话说

我按 App 的真实请求把整条链路在本机跑了一遍：用演示账号报名 `event_01`（填两道必答题）→ 6 轮自适应问答（每轮都拿到 `questionToken` + `portraitAdaptiveToken`）→ 用 8 条答案（2 条报名预填 + 6 条签名问答）请求画像预览。

**结果是 200，画像正常生成。** 也就是说今天的主线上，"答完第八题生成不了画像"这个路径是通的。你那次会话（9-18 05:43–06:23）在更早的版本上，具体那次拒绝无法再触发。

途中确实抓到了这条链路唯一会发生的 422：**字段重复**（"Answer fields and response IDs must be unique."，`portraitCode: PORTRAIT_INPUT_INVALID`）。触发条件是自适应问答又问了一遍报名时已经答过的字段。而 App 当时只显示服务端那句话、不显示代码，所以"数据有问题"和"临时故障"在界面上长得一模一样——这正是那次事后查不出原因的直接理由。

## 固定版本

| 内容 | 实际版本 |
| --- | --- |
| 基线 | `chat-agent` = `7a28b5728` |
| 功能提交 | `5d66b76b2` fix(sprint-0081) |
| 合并 | `b58da3747` merge(sprint-0081)（`--no-ff`） |

## SC 映射与证据

| SC | 状态 | 证据 |
| --- | --- | --- |
| SC-0081-01 复现并拿到 portraitCode | partial | 拿到了 `PORTRAIT_INPUT_INVALID`（字段重复）与其 message；但这是构造出来的重复字段，不是用户那次的原始拒绝。用户那次的 `portraitCode` 已无法取得（日志只记状态码，会话早于今天的主线） |
| SC-0081-02 修复后 200 | n/a | 主线本来就是 200：真实链路（2 预填 + 6 签名 = 8 答案）返回 persona 与 `generationToken`，无需修复 |
| SC-0081-03 混合证明通过、负例仍拒 | pass | `event-registration-portrait.test.ts` 新增两例（走真实 `readPortraitAnswerProofs` 与真实签名）：8 条混合证明全部通过且保留 registration 来源；重复字段被 422 `PORTRAIT_INPUT_INVALID` 拒绝 |
| SC-0081-04 界面透出 portraitCode | pass | `EventRegistrationScreen.tsx` 拒绝时在文案后附 `（<portraitCode>）` |
| SC-0081-05 无回归 | pass | orbits 画像相关 16/16、typecheck 0；App 报名相关 81/81、typecheck 0 |

## 排查过程中排除的假设（如实记录）

- **预填答案的 responseId 不一致**（TODO 里的首要怀疑）：不成立。`participantProfile.interviewResponses` 与 `registrationSource.answers` 的 responseId 都是 `legacy:<field>`，逐一对齐。
- **缺少 `portraitAdaptiveToken`**：不成立。服务端只在请求体带 `mode: "portrait-interview"` 时签发，而 App 正是这么发的；6 轮全部拿到了 token。
- **token 过期**：不成立，两类 token 有效期 48 小时。
- 我自己的复现脚本两次构造错误（漏 `mode`、漏把 `field` 带进 transcript），第二次正好造出了字段重复的 422——这也说明**任何让 transcript 不完整的客户端状态都会导致同一个拒绝**。

## 未做与下一步

- 未改证明校验器：拒绝重复字段是对的，放宽会让同一字段出现两条答案进入画像。
- 真正值得做的后续：自适应问答返回"已答字段"时，App 目前直接报错停住（`EventRegistrationScreen.tsx:358`），可以改成跳过并重取一题；以及把 transcript 的构造收敛到一处，避免遗漏字段。两者都需要新的 SC，不在本轮范围。
- 若这个问题再次出现，界面会给出 `portraitCode`，届时可据此直接定位分支。
