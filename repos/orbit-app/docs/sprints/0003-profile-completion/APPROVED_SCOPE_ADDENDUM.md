# 0003 已批准跨端实施补充

2026-09-14：复用用户“全部获准”与 RULES 第0节，`TECHNICAL_PREPARATION.md` 的B1方案纳入本次执行；旧待审文字不再作为审批停点。原 revision 2 Planner SHA256 `8315be01f929ce997cc43dfeadd87f489522c63ce53d1dd7102c7288018c4bd1` 与五项SC不变。

## 实施次序

1. 服务端独立计算 `onboarding`：policyVersion=1、complete/incomplete及缺项；与原六项丰富度评分分开。新旧账号按实际姓名、合法父子行业和完整生日计算，不补假生日，不使公司／职位／介绍变成必填。
2. 私密 `birthDate` 按YYYY-MM-DD日历日期保存和校验，只在本人资料返回；公开资料、联系人、搜索、AI工具及trace不得包含生日。GET不创建资料，旧客户端省略字段保留原值。
3. 资料保存加入expectedUpdatedAt（首次null）与mutationId；原子版本比较及同请求幂等，不同负载复用ID拒绝。409保稿；两端消费相同回执，不用客户端请求锁代替存储保护。
4. 认证成功后读取服务端onboarding；未完成进入现有profile补全模式，完成后返回已验证next。失败可重试，旧代次请求不能导航或覆盖草稿。
5. 分功能TDD、相关完整回归、两端类型、必要同步、H全量；真实注册／Google回跳／同记录跨端证据仅在精确环境可用后执行，缺项不记通过。

## 精确文件边界

保留原App白名单；额外范围沿用已批准B1表：

- Web：`shared/contract/profile.ts`、`features/profile/{contract,service,live-service,mock-service,onboarding}.ts`、`features/profile/storage/{profile-live-record-provider,profile-mutations}.ts`、`app/api/profile/handlers.ts`、资料页 `orbit-real-profile.tsx` 与既有 `profile-view-model-adapter.ts`。
- App：补 `src/api/profile-detail-contract.ts`、`app/(app)/profile.tsx`；契约副本仅通过sync更新。
- 测试：Web `tests/capabilities/{profile-onboarding-policy,profile-private-birth-date,profile-update-conflicts}.test.ts`、App `tests/profile-completion-interactions.test.tsx`，加直接消费者既有测试；必要类型接线按RULES第0节逐项登记。

同一主代理为唯一Generator，原地chat-agent；不改OAuth provider／密钥／注册配置，不执行迁移或未知业务库写入。0023本地行业契约已交付；其余数据清单／真实模型验收与本任务独立，暂不并行写入相同文件。0003完成判定及写入基础正是本次实现内容，不要求其在启动前已实现。
