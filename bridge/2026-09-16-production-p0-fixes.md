# BR-025 — Production canonical 身份、AI 查询与关系跟进可见性

- 创建/更新日期：2026-09-16。
- 总状态：`source_ready`；web_status：`source_ready`；app_status：`consumer_ready`（身份与普通文本契约不变）；verification_status：Web Production 部分已验证，原生同环境未验证。
- 优先级：P1。发起角色：Web / Bridge。下一责任方：当前主代理负责 Web 部署及验收，App 生命周期入口缺口与原生验收保留开放，未冒充已接单。
- 授权：用户要求先修已发现问题、及时 commit，并整理完整目标的必要项；既有 Production 发布和合成测试数据授权继续适用。

## 变化与证据

- Web `6f844ea47`：iOrbit、个人日程、个人活动页和共用 Agent 请求上下文改用持久 membership 的 canonical actor；不存在 membership 时 fail closed，不用 raw subject 或默认用户兜底。
- AI 同提交把 `.query` 的 searchTerms 与原始 query 分离，后者仍用于 get 的当前轮 ID 授权；`40b63d218` 在默认两步执行/合成失败时返回真正查询到的有界文本，保留空结果/分页/状态，不增加写权限。HTTP 返回字段无变化，App 普通消息消费者可继续使用；新原生运行时尚未验收。
- 测试 `6597d8de8`：App 两项浏览器 fixture 显式 Tokyo 时区；Web 断言当前 profile transactional runtime。不是产品时区变更。
- Web `105ebba4d` 关系跟进可见性独立于 canonical task 集合，当前/历史/无法关联分区，缺失或冲突关联不产生链接；不批量转换 80 条 legacy task，不复制第二份可写状态，不伪造 completion/outcome，也不变更 lifecycle API。
- Production 联系人详情（`contact_005`）显示“来源数据·只读”，没有跟进完成或选择下一步按钮；源码该处也是固定只读展示。因此新分区链接仅用于查看上下文，不代表生命周期完成 UI 已接入。R1 保留实际处理闭环，不能用路由存在替代验收。
- App 源码审查：Followups 仅重定向到 generic Tasks 的 relationship 筛选；完成/恢复提交 generic task action，联系人详情无 outcome UI。Web 现有 stage route 也不是 `RelationshipLifecycleService.completeTask` 的 HTTP adapter；需要补 lifecycle 读/完成契约及两端消费者，保留双版本、幂等和 actor 隔离。App 当前这部分为 `identified`，不能笼统认为所有关系任务 `consumer_ready`。

## 验收与未完成

- 身份修复两组定向 92/92、75/75；AI 后续组合 108/108；Web provider 测试 16/16；App 上海/UTC 各 25/25；两端 typecheck 通过。组合存在重叠，不合计为全量测试。
- 最终 Web 组合 27/27（关系分区、generic tasks API/客户端/列表/详情/Today、AI query 回显），Web typecheck exit 0。提交前 staged detect-changes 已执行；仅映射到部分索引内符号，不能将零流程解释为无影响。
- 已发布 `6f844ea47` 到正式别名，iOrbit 显示 66 联系人/66 跟进；既有个人日程保存成功并刷新回读，无重复创建。
- 最终 Production `105ebba4d` / `dpl_2FjxtX314B6DRojeZvFbdDF8gTNh` 为 Ready，别名 `https://orbit-puce-kappa.vercel.app`。从精确提交子树构建，未带入用户根规则改动；云端构建/typecheck 通过。
- 最终正式浏览器：主账号普通待办保留，关系分区当前 66 / 历史 14；另一主办方当前 0，主账号任务详情仍拒绝跨账号读取。AI 用实际 provider 只读查找指定已存在任务，回复标题与 `status: open`、已读 tasks/未读其他领域；回复持久化到 canonical actor 会话。未执行业务写工具或外发。
- Web 写→原生 App 回读、App 写→Web 回读：本轮未完成。App 仍需兼容当前 SDK 的工具链；本机 Xcode 26.1.1，不能沿用旧本地 Simulator 成功记录冒充当前 Production 验收。
- 图分析存在 stale、SIGSEGV、UNKNOWN、partial 及 HIGH/CRITICAL 与 low 输出矛盾；已补源码/回归复核，不宣称完整图分析通过。
- 关闭条件：最终部署下的 Web 修复全部验收；App 关系跟进入口与完成 outcome 路径明确且同记录回读；原生 Production 验收完成。云端 worker、笔记/提醒实例与新账号主流程按 [剩余清单](../docs/designs/2026-09-16-cloud-goal-remaining.md)继续。

## 更新历史

- 2026-09-16：主代理与 Luna max 并行完成身份、AI 回显和测试修复，保持用户根规则文件未提交改动；没有将本轮进度标为整体目标完成。
