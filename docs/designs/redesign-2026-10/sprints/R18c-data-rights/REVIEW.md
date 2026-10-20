# R18c 独立复核 REVIEW

**结论：不通过，维持“未收口”。** `origin/redesign` 的实现支持 REPORT 所述的主要本机导出、密码退会流程，但共享数据清除和异机 pending 清理仍有隐私缺口。工作树保持干净；本次未修改仓库或提交。

## S

1. **异机进入 pending 时保留待同步写入。** [AuthSessionProvider.tsx:304](/Volumes/ORICO/Dev/worktrees/orbit/redesign/repos/orbit-app/src/api/AuthSessionProvider.tsx:304) 调用 `purgeSyncScope`；[sync-lifecycle.ts:336](/Volumes/ORICO/Dev/worktrees/orbit/redesign/repos/orbit-app/src/data/sync/sync-lifecycle.ts:336) 会先把 outbox 归档进恢复库。这不满足 SC-09 的申请后清除要求。改用账户删除专用清理，并覆盖恢复库及异机 pending 测试。

2. **清除共享面谈会删除对方的命令回执。** [notes.ts:66](/Volumes/ORICO/Dev/worktrees/orbit/redesign/repos/orbits/features/account/data-rights/purge/notes.ts:66) 按面谈 ID 删除全部 outbox 和回执；[测试:52](/Volumes/ORICO/Dev/worktrees/orbit/redesign/repos/orbits/tests/services/account-data-rights-purge-notes-postgres.test.ts:52) 甚至造出并断言删除 `other` 的回执。应保留并净化对方回执，分别处理仍含本人信息的通知，验证对方幂等重试。

3. **共享收件箱仍暴露原始账号 ID，且列表可能解析失败。** [inbox.ts:32](/Volumes/ORICO/Dev/worktrees/orbit/redesign/repos/orbits/features/account/data-rights/purge/inbox.ts:32) 删除成员却保留会话身份列；[bounded-reader.ts:15](/Volumes/ORICO/Dev/worktrees/orbit/redesign/repos/orbits/features/relationship-communication/bounded-reader.ts:15) 仍将原 ID 投影给对方，并为缺失成员生成空姓名；读取 schema 要求字符串。应在 API 和同步共用投影中输出统一占位，补对方列表及离线同步测试。

## M / m

- **M：Google challenge 进入回调 URL。** [AccountDeletionPage.tsx:65](/Volumes/ORICO/Dev/worktrees/orbit/redesign/repos/orbits/app/(app)/app/orbit-2026/account-rights/AccountDeletionPage.tsx:65) 将可用于换取 receipt 的 challenge 放入查询串。改用短期、同站且绑定会话的服务端状态，避免凭据进入 URL 历史和请求日志。回调目标本身是站内相对路径。
- **M：越线登记不完整。** R18c 改了 [app/index.tsx:10](/Volumes/ORICO/Dev/worktrees/orbit/redesign/repos/orbit-app/app/index.tsx:10) 和 R18b Google broker；PLANNER 将导航入口及 broker 列为别线范围，REPORT 的“未越线”未说明批准或交接。主会话需确认归属并登记。
- **m：旧屏替换未清旧图标用法。** [AccountScreen.tsx:92](/Volumes/ORICO/Dev/worktrees/orbit/redesign/repos/orbit-app/src/screens/profile/AccountScreen.tsx:92) 仍用 Ionicons，且仍在旧用法允许清单；按 SC-12、RD-24 换新图标并缩减清单。

## SC 与验证

SC-01～04 的预检、只加可选响应字段、严格请求、CAS 与配额有文档、代码和测试；App 契约及 schema 副本一致。SC-05～06 有私有 ZIP、本人签名下载和本机空账号操作证据，离页调度及实时时钟过期未实操。SC-07～09 有双端路由、密码申请／取消证据，Google 真账号与异机清理未通过。SC-10 因上述问题及角色账本 `reason` 失败关闭而未通过；SC-11 匿名完成邮件与身份删除同事务有代码，像素未过。SC-12 路由及离线库存测试通过但有旧用法；SC-13 像素未过；SC-14 共享域零残留未证；SC-15 生产清除保持关闭；SC-16 未通过。

本次独立聚焦运行 **Web 8/8、App 12/12**。REPORT 的 Web 全量“0 新失败”发生在最后两个补丁前，且部分基线失败改为跳过；App 新增失败修补后也未重跑全量。因此最终代码的“自身新失败 0”**尚无全量证据**。