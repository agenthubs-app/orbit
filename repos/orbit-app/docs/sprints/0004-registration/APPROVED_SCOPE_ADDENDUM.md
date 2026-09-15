# 0004 跨端实施范围补充

2026-09-15，用户要求 A 线连续执行全部 epoch，并已授权必要的 Web/API、App、测试数据库与真实验收工作。本补充把 B2 已查明但原 Planner 未列出的服务端资格契约纳入 run-01；不改变 SC，也不把客户端时间当作资格来源。

## 本轮契约

- 报名 GET 返回 actor／event 作用域的服务端资格快照：判定时间、资格状态、原因、允许动作、报名或申请版本、题库版本。客户端只显示并执行 `allowedActions`，写接口仍在服务端重新核验。
- 资格覆盖未开放、截止、结束、活动取消、满额、待审核、已报名和已取消可重报。准入审核继续复用现有 admission policy／application；不另建第二套审核状态。
- 报名、取消、重报保留稳定记录身份和版本归属。重复动作返回同一业务结果；App 只接受同账号、同活动、同动作及当前版本的回执，迟到响应和读取失败不能解锁提交。
- 详情、列表、首页和日历继续读取 canonical membership／公开目录的同一投影。本轮只补缺失消费与回读证明，不新增猜测式报名集合接口。
- 个性化答案继续绑定 actor、event、题库 hash/version，并用冻结快照证明匹配消费。NFC 和长度上限属于既有规范化，不宣称字节完全不变。

## 文件锁

必要修改限定为：

- Web：`features/events/registration/contract.ts`、`deadline-gated-service.ts`、`runtime.ts`，报名 GET/POST 与取消 handler，必要的 admission state 组合，以及对应 `tests/api`、`tests/services`、`tests/capabilities`、页面回读测试。
- App：原 Planner 白名单中的 `EventRegistrationScreen.tsx`、`EventDetailScreen.tsx`、`event-registration.ts` 和三份对应测试；若准入动作需要现有 API 路径，仅允许最小修改 `src/api/endpoints.ts`。
- 验收：本 Sprint `REPORT.md`、登记表，以及被忽略的 `build/harness-state/evidence/sprint-0004/run-01/`。

不修改活动发布规则、容量算法、匹配算法或全局个人资料；不以旧缓存、匿名 401、mock 成功或客户端日期代替真实资格和写入验收。
