# 0003 资料完成判定与生日隐私技术提案

2026-09-14；基于 `df824de70` 的源码核查。已确认产品输入直接复用：姓名／行业必填、自我介绍选填，不增加公司／职位必填；生日完整年月日，仅本人可见。本文是待审的 B1 跨端补充，尚未扩张原 App Planner 白名单或启动实现。

## 当前实现不能直接复用的部分

- Web `features/profile/live-service.ts` 与 mock-service.ts 的 completeness 检查 displayName、headline、relationshipGoal、homeMarket、targetRelationshipTypes、preferredIntroChannels 六项；不检查行业或生日。直接用 ready 拦截登录会把可选项变成必填。
- `app/api/profile/handlers.ts` 的认证 actor 已传到 service；不是缺身份入口。现有 ManualProfileContract／更新输入没有生日、注册完成状态或保存版本前置条件。
- `storage/profile-live-record-provider.ts` 的 record mapper 重建字段。仅把生日放进客户端请求会被丢掉；放进 publicProfile 又会进入公开资料投影的风险范围。
- App `AccountAuthScreen.tsx` 登录后按 `nextHrefForAccountAuthSubmit` 跳转；`normalizedNext` 已限制内部支持路由并排除认证页。应保留这个验证器，不另做任意 URL 跳转。
- App `ProfileScreen.tsx` 已有草稿、保存回执和 actor／server 隔离；`profile-detail-contract.ts` 校验的 completeness 字段仍是上述旧六项。新完成判定必须独立解析，不依靠资料卡片是否非空。
- 仓库不存在独立的 `src/view-models/profile-completion.ts` 或 Web `shared/contract/auth.ts`；实际入口是 account-auth.ts、profile-detail-contract.ts 和 features/auth 的契约。最初两个猜测路径已通过文件清单排除，不新增同名假接口。

## 推荐契约

保留旧 completeness 作为资料丰富度指标；在同一个已认证 `/api/profile` payload 增加独立 onboarding 字段，不把 UI 评分变成权限判断。

```ts
type ProfileOnboardingField =
  | "displayName" | "primaryIndustryId" | "secondaryIndustryId" | "birthDate";
type ProfileOnboarding = {
  policyVersion: 1;
  status: "incomplete" | "complete";
  missingFields: readonly ProfileOnboardingField[];
};
```

服务端从已保存资料计算，不接受客户端提供 complete／missingFields。姓名按 trim 非空，行业复用 0020 的父子验证；自我介绍、公司、职位及旧六项评分中的其他字段不参与 onboarding。生日是否作为旧账号登录后的强制补全条件，仍需随本技术策略明确批准；不能仅因字段缺失就让所有旧用户无法访问已有内容。本提案的新资料完整状态要求有效生日，旧账号不批量伪造日期或后台补写。

生日采用 `birthDate: "YYYY-MM-DD"`，服务端按真实日历校验、拒绝未来日期及非法闰日，不引入时区或推断年龄限制。存储放 `LiveProfileRecord` 的私密扩展字段，不放 PublicProfileDTO／contact／networkPerson。只在认证本人 `/api/profile` 返回；投影采用字段白名单。0020 的 profile.getSelf 继续明确排除生日；搜索文本、trace 和日志同样不加入生日。

保存请求延伸为现有 profile update 加 `expectedUpdatedAt`（首次创建为 null）与稳定 mutationId；原子比较 actor 所属记录版本，同 mutationId 同 payload 重放同一回执，不同 payload 拒绝。客户端保存后核对资料 ID、更新字段和服务端完成状态；409 保稿并提示刷新，不悄悄覆盖。此版本能力不能由 App 的本地请求锁代替。

旧客户端未发送新字段时保留现有值；其现有资料编辑继续可用，但不能伪造新 onboarding 完成。两端需要相同已发布协议，不能一端擅自新增门槛而另一端仍只按旧评分显示。

## 页面与返回路径

认证成功后读取本人 profile：complete 返回已验证 next；incomplete 进入现有 `/profile` 的补全模式，携带已验证内部 next。读取失败显示重试，不伪装成 incomplete 或成功放行。资料页面展示服务端缺项，普通查看与补全模式共用实际编辑能力，不复制整页。

补全保存成功后再次验证回执的 onboarding.status，只有 complete 才返回原目标；未完成仍留在原稿界面。登录、Google 回跳、资料读取和保存均使用同一 actor／server 代次；切账号、切服务器或旧请求晚到时不导航、不回填旧数据。GET 不保存默认资料，打开补全页不创建空记录。

## 拟补入的文件边界

这些是待审的准确目标，不是已获准修改。0003 的原 App 白名单保持不变，审阅后才修订 Planner。

| 边界 | 文件 |
| --- | --- |
| Web 资料契约与判定 | `shared/contract/profile.ts`、`features/profile/contract.ts`、`service.ts`、`live-service.ts`、`mock-service.ts`；新增 `features/profile/onboarding.ts` |
| Web 私密存储／并发 | `features/profile/storage/profile-live-record-provider.ts`；新增 `features/profile/storage/profile-mutations.ts`，在 feature 层消费现有事务设施，不改通用数据库机制 |
| Web HTTP／页面 | `app/api/profile/handlers.ts`；`app/(app)/app/profile/orbit-real-profile.tsx`；同目录 `compose-app-profile-from-previously-approved-mock-first-capabilities/profile-view-model-adapter.ts` |
| App 已有页面与路由 | 原白名单中的 AccountAuthScreen、ProfileScreen、AuthSessionProvider、account-auth、profile；补 `src/api/profile-detail-contract.ts`、`app/(app)/profile.tsx` 的补全模式接线，共享副本只 sync |
| 新测试 | Web `tests/capabilities/profile-onboarding-policy.test.ts`、`profile-private-birth-date.test.ts`、`profile-update-conflicts.test.ts`；App 原拟新增 `tests/profile-completion-interactions.test.tsx` |

Web 登录回调是否需要改独立路由，要根据实际 profile 页面承接验证后列精确文件；不为本工作改 OAuth provider、密钥或全局身份服务。职位保持自填可选，不增建职位分类服务。

## 具体测试与已有证据

新增测试应先 RED：旧评分 100 但缺行业仍 incomplete；只填必需项而公司／职位空仍可 complete；恶意提交 complete 无效；生日跨时区原字符串不变；另一 actor／公开投影／AI／searchText 不含生日；旧请求省略 birthDate 不清空；409 保稿；登录 next 白名单和迟到请求不导航。

实际新用户、已有用户及 Google 回跳属于后续设备／授权业务验收，不能以 Node 按钮断言替代。当前仅复用 0020 READINESS_AUDIT 所记录的 App 20 项基线中的账户返回路径与身份显示测试；未运行新 policy、生日隐私或冲突测试，不能标 SC 通过。

下一步是把本提案与 0020 的最终字段版本合并进 0003 Planner 审阅；不再以“生日精度没决定”或“要用户选择时区”作为缺项，也不擅自实施尚未批准的旧账号补全策略。
