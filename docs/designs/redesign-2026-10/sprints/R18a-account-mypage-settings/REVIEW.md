# R18a REVIEW（`origin/redesign`）

**结论：暂不通过收口。** SC-02 的契约实现、旧屏替换和多组定向测试有证据；公开预览仍有隐私缺口。REPORT 已将实机操作、像素门禁及部分全量验证标为未完成，不能按 SC-13 验收。

## 问题

- **S1｜公开招待预览绕过 `publicFields`。** `repos/orbits/features/invite-codes/service.ts:449` 仅按旧 `sharedKeys` 输出公司／职位、提供／寻求；`profile-reader.ts:29` 起的招待资料也未读取 `publicFields`。持有码的匿名访客仍可能看到用户在新设置中关闭的字段。只在兑换前的 preview 投影叠加 `publicFields` 过滤并补匿名访问测试；兑换后的联系人共享需保留其独立授权语义。REPORT 已将此项交接 R15，但当前风险仍在。

- **M1｜实机和像素 SC 未验收。** `REPORT.md:5` 记录签名构建登录成功后在同步依赖加载处报 `METRO_SERVER_ERROR`，SC-03～06 无已登录实机操作；`REPORT.md:328` 明确 SC-12 整套像素门禁未跑。修复加载故障后，在准确源码的构建上重跑三账号操作及画面矩阵。

- **M2｜“自身新失败 0”不能用于当前收口。** `REPORT.md:41` 的 App 全量仍有 12 项失败，其中 Task 分页失败相对上一轮新增；单测重跑通过尚未解释全量竞态。`5b0f70a09` 又改了账户代码，而报告只给出定向结果。定位该全量失败，并在最终提交版本重跑、逐项比较失败名；Web 全量及 copy QA 也仍为红灯（`REPORT.md:329`）。

- **m1｜旧路由测试偏浅。** `repos/orbits/tests/pages/r18a-account-route-wiring.test.ts:7` 只检查源码包含组件名和 `redirect(`，不能证明旧 `?view=`、引导 `next`、静态设置段覆盖占位路由在运行时可达。补针对性路由行为测试及 390 宽度跳转抽查。

## 核实通过项

SC-02 的 `card`／`publicFields` 为可选新增字段，App 副本及宽进响应 schema 已同步；旧 PUT 不传可见性时保留存值。`/api/profile` 按认证 actor 读写，OAuth `returnTo=settings` 经白名单写入签名 state。App 离线资料使用账户专属 `self-profile` 页面副本，保存按钮禁用；profile 不在设备同步 domain registry 中，无对应离线 outbox 字段需补。旧屏文件、路由登记和离线清单已有替换记录。`radius.none` 的 token 越线改动在 REPORT 中有用户批准记录；未发现 R18a 提交改动组件库或导航壳。以上为源码、提交和留存日志复核，未将报告中的定向测试算作本次独立重跑。