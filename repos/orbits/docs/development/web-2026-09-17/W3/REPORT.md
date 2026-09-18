# W3 实施与验收记录

基线：`161e9e6c4d1f314db90365a4d840718adfa12c70`。本树 `/Users/li/.codex/worktrees/15e3/orbit`。编码：显式 `gpt-5.6-luna / max` 子代理；Astra 独立审查与实际产品验收。本文随批次补齐；未列通过的项目不视为完成。

## F：人数和容量事实

根因是三个 Web 投影行为：缺失摘要默认0、以人数加20生成容量、用第二次名单读取覆盖聚合总数。本批人数只取匹配 eventId 的合法非负安全整数摘要，缺失或非法为 null；容量从既有 admission policy 单事件读取，number（包括0）/null/undefined 分别表示有限/不限/未知。名单继续控制姓名展示和本人状态，保留输入总数。

追加批准的首页仅将无聚合来源的 canonical 人数改为 null 并隐藏原 span；公开主办方沿用 canonicalRows 已验证的 number，以局部类型细化保留数值，不使用断言或零兜底。无共享 DTO/API/storage/App 代码变更，无布局/CSS/推荐改造，也没有列表逐事件 policy 查询。

完整 CRITICAL/HIGH 依赖及20实际文件、24 direct 节点的逐项分类见 [CONSUMERS.md](./CONSUMERS.md)。未知图谱符号通过源码引用补查，不按0 caller判安全。

### 真实本地产品路由

独立 PostgreSQL16：loopback端口55463、库 `orbit_web_w3_20260917`；本树 Next4613、`http://w3.localhost:4613`、live模式。只用合成账户/活动。真实账户来自现有种子和storage流程，在正常登录页登录；独立域名避免同host跨端口cookie冲突。没有改变认证产品实现或清除其它域cookie。

本地辅助脚本 `/tmp/orbit-w3-seed.ts`、`/tmp/orbit-w3-scenarios.ts` 调用既有迁移/backfill/access/admission服务。账户密码和AUTH_SECRET不记录在交付文档。种子4账户、2活动、0 generations；全部数据在本任务本地库。以下为基线161e加本批工作树代码的实际浏览器结果，最终提交SHA在交接中记录。

| 场景 | 实测结果 |
| --- | --- |
| F前政策8、真实0人 | 旧详情显示20席/0除20，证实虚构容量 |
| F后服务提交参与者A，admitted v1 | 正常详情显示已报名1/8、限8人 |
| 临时公开活动无摘要、无policy | 详情显示“报名人数暂不可用”，无0人数、无数值容量与剩余席位 |
| 原活动policy改为null | 详情显示“不设人数上限”、已报名1人，无有限分母 |
| 正常报名workspace真实撤回确认 | 页面显示申请已撤回v2；本轮在R修改前执行，不能当R回读修复证据 |
| 撤回后policy容量0 | 详情显示限0人、已报名0/0、剩0席；真实0未被truthiness隐藏 |
| 恢复policy容量8 | 冷刷新显示已报名0/8、剩8席 |
| 全部活动内容/地图视图 | 均显示同一真实合成活动、正常详情链接，无null/undefined数字；少于5人隐藏人数沿用旧规则 |
| 公开主办方 | 1场活动、0累计参会、活动卡0人已报名，无nullable计算异常 |
| 参与者B通过真实service取得admitted v1，再真实登录 | `/app/home/events`显示该活动旅程；未知总数的原人数span隐藏，没有伪造0人 |

边界：未配置摘要的公开 fixture 会触发现有 canonical catalogue 的严格失败。完成未知详情验证后，仅将本任务该fixture按精确workspace/event/code条件设回draft，恢复完整列表验证；未修改产品catalogue契约。0容量在仍有1名admitted时被既有服务拒绝，先通过正常UI撤回后再配置0，没有强行写入非法容量。

上述报名fixture由本地现有service构造，不是全流程真实AI问卷验证。浏览器未点击生成画像、未调用付费模型/OCR。PhoneWeb、RNW、原生App未运行，Web结果不外推；本批未改它们的共享契约。

### 测试与独立审查

编码前新增mapper/detail红灯：22项16通过6失败，包含缺摘要变0、容量变20、错eventId/非法count、名单覆盖62为2、未知渲染。日志 `/tmp/w3-f-red-canonical-detail.log`。F前既有门禁服务/API在独立本地PG下26/26、0skip。

独立消费者初跑发现既有lifecycle断言使用注册前count0快照比较注册后roster1。主代理明确批准测试在写入后重新读取真实canonical聚合，保持不同快照62/2的独立mapper断言，不改变产品回到名单覆盖。最终测试同时确认写入后1、撤回后0，均通过真实canonical reader取得。

独立11文件消费者回归：**90/90通过，0skip，exit0**（`/tmp/orbit-w3-f-consumers-tokyo.log`）。命令工作目录为本树 `repos/orbits`：

```sh
env -i PATH=/opt/homebrew/bin:/usr/bin:/bin HOME=/Users/li TZ=Asia/Tokyo ORBIT_EVENT_DATABASE_URL=postgresql://li@127.0.0.1:55463/orbit_web_w3_20260917 node --test --import tsx tests/pages/app-canonical-event-detail-view.test.ts tests/pages/app-event-detail-page.test.tsx tests/pages/app-events-view-switcher.test.ts tests/pages/app-home-events-source.test.ts tests/pages/app-home-live-route-services.test.ts tests/pages/app-organizer-public-live-route-services.test.ts tests/pages/app-registered-event-lifecycle.test.ts tests/pages/app-events-live-route-services.test.ts tests/pages/app-events-registration-state.test.ts tests/pages/app-events-source.test.ts tests/pages/app-event-detail-live-route-services.test.ts
```

初次相同命令使用 `TZ=Asia/Shanghai`：89/90、0skip，唯一失败是 `app-events-live-route-services.test.ts:357`。该测试用机器本地 `setHours` 对比日本+09活动范围。为排除本批引入回归，创建临时精确基线树 `/tmp/orbit-w3-baseline-161e`（HEAD161e，tracked无修改），在Shanghai下运行 `node --test --test-name-pattern='public event presentation derives agenda clocks from canonical source ranges' --import tsx tests/pages/app-events-live-route-services.test.ts`，同样1/1失败、同一行；Tokyo下同基线单例1/1通过。日志分别为 `/tmp/orbit-w3-agenda-baseline-shanghai.log`、`/tmp/orbit-w3-agenda-baseline-tokyo.log`。本批不改原测试时间断言或时间产品代码，保留该既有环境约束。

独立类型检查在真实运行树和恢复生成文件后的最终树均exit0：`env -i PATH=/opt/homebrew/bin:/usr/bin:/bin HOME=/Users/li npm run typecheck`，日志 `/tmp/orbit-w3-f-finaltree-typecheck.log`。已停止仅本任务Next进程后恢复自己启动产生的 `next-env.d.ts` 单行差异，无环境文件纳入提交。`git diff --check`通过。


### 提交前图谱复核

本树索引增量刷新出现 `Property.property_fts Invalid UTF-8`；`--repair-fts`失败后，执行本树 `analyze --index-only --name orbit-web-w3-15e3 --workers 4 --force` 全量重建成功（exit0，108510 nodes / 244273 edges / 2060 clusters / 794 flows），FTS已重建。日志 `/tmp/orbit-w3-index-f-force.log`。构图仍有动态调用候选/流程预算裁剪提示，不能把缺失流程称为不存在；结合已有逐符号impact及CONSUMERS源码矩阵核对。

随后执行 `detect-changes --scope all --repo /Users/li/.codex/worktrees/15e3/orbit --limit 10000`，并直接调用同版本1.6.12的 `LocalBackend.callTool('detect_changes', {scope:'all', repo:本树绝对路径})` 取得完整结构，避免CLI formatter硬编码仅显示15项。原始结构见 [F-DETECT-CHANGES.json](./F-DETECT-CHANGES.json)：产品/测试为47/47；加入本批文档暂存后完整结果为**66/66 changed_symbols（额外19项为本批文档Section），19 files，1 affected process，risk_level=medium**；底层未返回error/partial/truncated字段，原样保存，未把缺失字段改写为false。47项均属于已批准产品/测试文件，无跨域意外改动。共享类型实施前的CRITICAL/HIGH风险仍按CONSUMERS保留，未用本次medium替代。


本批定向提交文件（Web根目录相对路径；10产品、5测试、4文档/证据）：

- `app/(app)/app/canonical-event-detail-view.ts`
- `app/(app)/app/events/[id]/orbit-real-event-detail.tsx`
- `app/(app)/app/events/compose-app-events-demo-event-1-from-previously-approved-mock-first-capabilities/event-detail-view-model-adapter.ts`
- `app/(app)/app/events/orbit-real-explore-client.tsx`
- `app/(app)/app/home/compose-app-home-from-previously-approved-mock-first-capabilities/home-route-view-model.tsx`
- `app/(app)/app/home/orbit-real-home.tsx`
- `app/(app)/app/o/compose-app-organizer-public-from-previously-approved-mock-first-capabilities/organizer-public-route-view-model.ts`
- `app/(app)/app/orbit-landing-route-view-model.ts`
- `app/(app)/app/orbit-organizer-route-view-model.ts`
- `app/(app)/app/orbit-registered-event-route-view-model.ts`
- `docs/development/web-2026-09-17/W3/CONSUMERS.md`
- `docs/development/web-2026-09-17/W3/F-DETECT-CHANGES.json`
- `docs/development/web-2026-09-17/W3/PLAN.md`
- `docs/development/web-2026-09-17/W3/REPORT.md`
- `tests/pages/app-canonical-event-detail-view.test.ts`
- `tests/pages/app-event-detail-page.test.tsx`
- `tests/pages/app-events-view-switcher.test.ts`
- `tests/pages/app-home-events-source.test.ts`
- `tests/pages/app-registered-event-lifecycle.test.ts`
