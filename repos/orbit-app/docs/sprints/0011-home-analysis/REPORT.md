# Sprint 0011 — 首页规格与人脉分析可信性执行报告

首页现在在原“联系跟进”区块展示真实推荐活动，未完成待办按既有日期与顺序最多显示五条；人脉分析只显示服务端验证并持久化的报告、生成时间和版本，数据变化会明确提示重新分析。用户点击分析只进入可编辑的 IORBIT 草稿，发送前不生成；关系目标使用字段级版本写入，不再覆盖整份资料。

## 运行记录

- 结果：`blocked`。本地实现、Web/App 契约、浏览器交互与 H 档 App 全量均通过；必需的登录态 Simulator 业务页、真实 provider 生成后回读及同一账号 Web↔App 目标回读未执行，不能把本地结果写成完整 Sprint 通过。
- run：run-01；owner `/root`；开始 2026-09-15 03:17 JST，结束本地实现与验证 2026-09-15 04:18 JST。
- Planner revision 3；SHA256 `1b817d35135aec7cdbe2eb231c047ad7f298d3142bc34d02e1fb1f43345d19f6`。
- 语义基线 `a1d7d7665`，启动登记 `6cf69280c`；最后功能 HEAD `9a10522b18edf2c05e818be02c3ba2ca5a2aa6b7`。
- 环境：本地 Node 25；provider keys 全部显式清空；iOS 26.4 Simulator 可启动，但 Orbit 停在登录页，没有授权的共同测试账号或真实分析对象。没有读取密钥、连接真实业务数据库或执行部署。

## 改了什么与 commit 对应

| 功能／原因 | 主要范围 | commit SHA | SC |
| --- | --- | --- | --- |
| 目标字段级保存、版本与幂等回执 | Web profile goal editor/API | `a1d7d7665` | 04 |
| 首页真实推荐活动、待办最多五条及补位 | App home screen/view-model/tests | `727aeeae2` | 01、05 |
| 服务端可信分析报告、数据版本重算与持久化恢复 | Web dashboard provider、会话存储、可靠发送、共享契约/tests | `7a2e9f767` | 02、03 |
| Web 已存报告、陈旧提示、显式 IORBIT 草稿 | Web analysis UI、prefill/tests | `3038e8ea7` | 02、03、04 |
| App 契约同步、报告展示、目标窄写入和生命周期隔离 | App AI route、dashboard、hooks、schema/view-model/tests | `9a10522b1` | 02～05 |

## 验收结果

| SC | 结果 | 本地证据与未闭合项 |
| --- | --- | --- |
| SC-0011-01 | blocked | 0/1/5/6+ 待办、成功补位、失败保留、活动空/错状态及真实详情路由的 App 组合 72/72 通过；登录态 Simulator 对照指定活动区块未运行。旧跟进区块与快捷按钮已移除，但 0018 的真实“记笔记”路由尚不存在，因此没有伪造入口。 |
| SC-0011-02 | pass | 服务端只接受首轮、紧邻首条用户消息、带受信 verification 的报告；source hash 由 actor-scoped 当前 dashboard 重算，旧版本为 stale。进入/刷新不生成；App/Web 报告与 schema 组合通过。 |
| SC-0011-03 | blocked | Web/App 均只登记一次性、actor+server 绑定的 editable prefill；取消、失焦、StrictMode 双 effect、切号及发送时点回归通过。真实 provider 显式发送→持久化→两端回读未运行。 |
| SC-0011-04 | blocked | PUT 仅含 `relationshipGoal`、`expectedUpdatedAt`、`mutationId`；错误/伪回执保稿，旧 ACK 不覆盖新草稿，409 刷新 baseline 后用新版本与新 mutation 重试，换号迟到请求被中止。真实同账号 App 写→Web 回读及 Web 写→App 回读未运行。 |
| SC-0011-05 | blocked | Pipeline 独立路由、旧入口、联系人生命周期及归档/历史回归通过；登录态 Simulator 的旧链接与返回路径未实际操作。 |

## 最小验证与未运行项

| 命令／场景 | 结果 | 范围 |
| --- | --- | --- |
| App 生命周期相关五文件组合 | 128/128，exit 0 | prefill、scope、报告、目标保存与 409 |
| App Planner 直接三组 | 72/72、28/28、5/5，exit 0 | SC-01～05 的 view-model、路由、渲染与交互 |
| Web 0011 组合 | 99/99，exit 0 | trusted report、可靠发送、Web UI 与目标编辑 |
| `npm run typecheck` / `npm run typecheck:app` | 双方 exit 0 | App 与 Web 全量类型 |
| App `npm test` | 2715/2715，0 fail/skip，181500.90075ms | H 档最终全量，已含契约同步检查 |
| `git diff --cached --check` | 无输出 | App 功能提交前检查 |
| GitNexus staged detect | `No changes detected` | 索引对嵌套变更未映射，不能据此声称零影响；已人工审核精确 13 个 App 文件并覆盖直接消费者 |
| iOS Simulator | Orbit 可启动，停在登录页 | 无授权共同账号，未进入首页/分析/Pipeline，不计为业务验收 |
| 真实 provider / PostgreSQL / 同账号双端 | not_run | 本轮禁用所有 provider key；没有精确授权对象与共同环境 |

## 信任、失败与兼容边界

- 客户端不能通过普通 session upsert 伪造 analysis verification；服务端先写消息、最后写受信 marker。部分持久化失败时报告仍不可信；同 request 的 outcome-unknown 恢复只补 marker，不重新运行模型。
- 报告只读取 `contacts.analysis` 的候选会话并做精确 origin/首轮/消息顺序校验，不用响应组装时间冒充报告时间。数据版本保留有序数组顺序，只规范化显式无序集合。
- App dashboard GET、关系目标 PUT 和机会重算绑定 actor+baseUrl；账号或服务器切换立即显示 loading、中止旧请求并屏蔽迟到回调。一次性 prefill 在 StrictMode effect 重放中只领取一次。
- 旧 App 可继续读取没有 `analysis` 的 dashboard；该区块显示 unavailable，而不是假装从未分析。Pipeline 和旧跟进业务未删除，只从首页移除重复入口。

## 费用与交接

本轮验证显式清空 OpenAI、Anthropic、Google/Gemini、DeepSeek key，新增付费模型调用为 0；不重置既有 USD 5 硬上限及已记 USD 0.012780，前序未核算增量仍保持未知。

0013 可依赖已经稳定的首页、Pipeline 与分析入口代码，但 0011 仍保持 blocked，直到获得共同登录账号/环境后完成：登录态 Simulator 首页与 Pipeline；显式分析发送后真实报告持久化及 Web/App 重开；关系目标 App→Web 与 Web→App 同一 profile/version 回读。回退应限定到上表功能提交，不覆盖其他线路或用户未跟踪设计素材。
