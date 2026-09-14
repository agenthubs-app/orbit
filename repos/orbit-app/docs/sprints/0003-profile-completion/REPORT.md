# Sprint 0003 — 执行总结

## 目标实现情况

- 服务端已经用姓名、合法的两级行业和完整生日独立计算 onboarding 状态；资料丰富度不再冒充注册完成度。生日保持日历日期语义，只向本人资料返回，不进入公开资料、联系人搜索、AI 本人资料或 dashboard 投影。
- 资料保存已经使用版本比较、mutation ID、事务和幂等回执。冲突、重放、并发首次创建、账号切换、服务器切换和迟到响应都不会覆盖较新的草稿或其他账号资料。
- App 已接入真实补全模式：认证成功后读取服务端 onboarding；未完成用户进入 `/profile?complete=1&next=...`，只有收到匹配且 complete 的保存回执才返回经过白名单验证的原目标。完整用户不会重复被拦截。
- 密码注册／登录、原生资料编辑与保存已有真实本地 HTTP 和 Simulator 证据。Google mobile broker、PKCE 和已配置 client 已真实进入 Google 官方登录页，但当前浏览器没有用户登录态且 Chrome 控制通道不可用，因此没有取得 provider callback、code exchange 和最终系统回跳；也没有用同一 actor 在 Web 与 App 双向回读同一 profile。Sprint 因 SC-0003-05 保持 `blocked`。

## 运行记录

- 结果：`blocked`；SC-0003-01～04 pass，SC-0003-05 blocked。
- run：run-01；Generator owner `/root`；2026-09-14 21:26 JST 开始，2026-09-15 03:03 JST 收口当前可执行工作。
- 原 Planner：revision 2，启动 SHA256 `8315be01f929ce997cc43dfeadd87f489522c63ce53d1dd7102c7288018c4bd1`。
- 被验收的最后功能 HEAD：`b2afc634d`；当前集成主线：`e93ba57cf`。
- 环境：本地 App/Web、iOS Simulator、隔离 PostgreSQL、已有 Next 开发服务和 Google OAuth 配置；没有可代用户完成登录的 Google 浏览器会话，没有同版本同账号双端业务环境。

## 实现与提交

| 内容 | commit | 对应 SC |
| --- | --- | --- |
| onboarding 判定、两级行业、私密生日和投影隔离 | `65c2a8050` | 01、02、05 |
| profile CAS、事务、幂等回执、回滚和有限重试 | `6082b9961` | 03、05 |
| App 补全编辑器、认证后服务端判定、安全 next 和迟到请求隔离 | `5e05d8f30` | 01～04 |
| 通知、密码恢复、资料 source 测试消费者与新状态对齐 | `bd9999097` | 01、03、04 |
| 旧 membership 保留原 profile record identity 并原地更新 | `b2afc634d` | 01、03、05 |

## 验收结果

| SC | 结果 | 证据与限制 |
| --- | --- | --- |
| SC-0003-01 | pass | 服务端 policy 与 App 交互覆盖 incomplete 进入编辑器且零写入、complete 不重复拦截，以及缺 policy 时不靠旧 richness 猜测。真实 HTTP 注册 201、登录 200、保存／重试 200，保存前 incomplete、保存后 complete；旧 membership 二次登录保持同一 profile ID。 |
| SC-0003-02 | pass | 行业使用受控两级目录；按获批技术补充，职位是可选自填，不另建职位分类服务。生日覆盖闰日、非法日期、跨时区不变日、另一 actor 与公开／搜索／AI／dashboard 隔离；原生编辑器与匹配回执已有截图。提取与建议仍必须先进入表单，再由用户另行保存。 |
| SC-0003-03 | pass | 隔离 PostgreSQL 14 个真实事务场景及相关 75/75 覆盖 409、相同 mutation 重放、不同内容冲突、并发、回滚、actor 隔离和最多三次序列化重试；App 覆盖失败保稿、设备 ID 失败零写入、刷新和账号／服务器代次隔离。 |
| SC-0003-04 | pass | 本地交互与真实密码账号范围内，合法 `/events/event-1?tab=details` 返回原目标，非法外链回落安全路径；只有服务端 complete 且保存回执匹配才导航。Google 的最终回跳不计入本项，单列在 SC-05。 |
| SC-0003-05 | blocked | 本地 HTTP 注册、原生密码登录与资料保存真实完成；Google 已到 `accounts.google.com`，但没有用户授权后的 callback/code exchange。Web 页面证据还出现 `Unexpected end of JSON input`，Web 与原生证据不是同一账号，尚未证明同 actor、同 profile ID 的 App→Web→App 回读。 |

## 验证证据

| 检查 | 结果 |
| --- | --- |
| 当前主线 0003 App 定向集 | 209/209，exit 0 |
| 当前主线 0003 Web 非 PostgreSQL 定向集 | 54/54，exit 0 |
| 当前主线 App 全量 | 2672/2672，exit 0 |
| 当前主线 App／Web typecheck | 两端 exit 0 |
| 资料基础层相关集 | 55/55；对应版本 App 全量 2593/2593 |
| 原子保存相关集 | 75/75，含隔离 PostgreSQL 14 项；对应版本 App 全量 2593/2593 |
| Web 历史安全全量 | 基础层 2990 pass／47 fail／168 skip；CAS 层 3005 pass／47 fail／168 skip；47 个失败名称与获准基线一致，不宣称 Web 全量通过 |
| 原生／HTTP | `build/harness-state/evidence/sprint-0003/run-01/live/` 中保留注册、旧 membership、登录、编辑、保存和 OAuth 到达页证据；目录被忽略，不提交截图或账号资料 |

completion 首次 App 全量的 23 个失败和消费者中间集 3 个失败均保留在日志；随后通知 harness 19/19，后继主线全量先后 2632/2632、2642/2642，本次集成主线最终为 2672/2672。失败修复过程没有被改写成首次即通过。

## 阻塞与恢复条件

- 由用户在 Google 登录页选择并授权实际测试账号；代理不代填邮箱、密码、验证码，也不把到达 provider 页面当作完成 OAuth。
- 在同版本 API/Web/App 完成 callback、mobile code exchange 和 `orbit://account/oauth` 系统回跳，记录脱敏 actor/profile ID 与版本。
- 使用同一账号核对姓名、生日、父／子行业和 `updatedAt` 的 App→Web 及 Web→App 回读，确认另一账号和公开投影仍不可见生日。
- Web profile 页面必须返回可解析的实际资料，不再出现本轮 `Unexpected end of JSON input`。完成以上动作后，追加关联原 SC-0003-05 的接续验收，不重开或覆盖本报告。

## 费用与交接

- 本轮没有新增付费 AI/OCR 调用，累计费用保持此前记录；确实发生了 Google OAuth 网络请求，但没有已知费用，不能写成“零 provider 请求”。
- 没有部署、推送或写入未知业务数据库；隔离 PostgreSQL 仅用于事务验证并已停止。
- 0003 的本地产品文件已释放。0011 可以复用字段级版本写入基础实现窄目标更新，但不得恢复整份 profile 覆盖写法。
