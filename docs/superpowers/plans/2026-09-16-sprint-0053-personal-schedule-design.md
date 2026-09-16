# Sprint 0053 个人日程实施计划

> 执行者使用仓库RULES唯一Generator流程；不调用已卸载executing-plans、不派逐任务Generator/Reviewer，不新增独立原型。前序源锁和执行槽已释放，ROOT登记并显式启动B唯一run-01。

**目标：** 按选定参考重做设置与真实阅读详情，保留安全日程链路。

**架构：** 现有personal_schedule_items扩展可选设计字段，统一v1/v2投影；通用原详情地址进入阅读，新增edit地址进入现有编辑器；新字段认证写入和独立GET闭环。

**技术栈：** Expo Router/React Native/react-native-web/现有Ink Signal tokens，Next个人日程API/Zod/PostgreSQL LiveRecord，Node22/tsx/node:test/Playwright。

**规范：** [Planner](../../../repos/orbit-app/docs/sprints/0053-personal-schedule-design/PLANNER.md)与[参考设计](../../../repos/orbit-app/docs/sprints/0053-personal-schedule-design/DESIGN.md)。

## 全局约束

主线chat-agent，执行固定基线42fcd36208b1291b00371bc2e8777f02ff301e41（0051最终，含f7与固定onBack/笔记读取及0050字典等价差量）；唯一B任务Sol medium，前序Generator结束/源锁释放，ROOT登记后开始run-01。已有修改不覆盖，字典只新增必要键；只消费已固定笔记接口，不冒充0051 v3/删除/离线已完成。新DTO通过x-orbit-personal-schedule-version:2 opt-in；旧v1严格投影。无真实数据库/账户/服务/设备/provider副作用；实际运行ROOT持锁，生产Web变更必须build/restart。提醒/重复未支持诚实说明，不自动写其他用户跟进或外部Calendar。所有SC保留。

## 任务1：字段落库与双版本投影（SC03/04）

文件：Web个人service/schema/contract、authority-contract、个人handler/collection，新增representation/association-reader及representation.test.ts；App生成副本只走sync。

接口：PersonalScheduleContract保持原字段，新增Planner列出的allDay/timeZone/meetingMethod/meetingUrl/contactIds/noteIds；创建/patch严格校验，关系仅当前actor/workspace，POST/PATCH/DELETE继续expectedUpdatedAt/idempotencyKey。旧API输出保留原白名单，新version输出全量已校验字段，不导出secret。

- [ ] 从现有personal-schedule-routes fixture写RED：带新header创建全天/线上/关联→GET同字段；无headerGET仍旧shape；旧PATCH只改title不清新字段；重复key/跨actor/无权note/危险URL拒绝。示例基于该fixture的真实handler：

```ts
assert.equal(created.status, 201);
assert.equal(saved.data.scheduleItem.allDay, true);
assert.equal(Object.hasOwn(legacy.data.scheduleItem, "allDay"), false);
assert.deepEqual(readback.data.scheduleItem.contactIds, [ownedContactId]);
assert.equal(stale.status, 409);
```

变量均由同测试fixture实际HTTP生成，ownedContactId用已注入认证关联reader合法对象，不创建真实联系人。

- [ ] actualimpact后扩展strict源schema与持久service，不使用未知schema宽松透传；删/清除遵循原版本化语义。完整验证新字段后统一投影v1/v2及collection一致；关联reader缺接口记录具体路径，不造放行reader。
- [ ] 定向GREEN及完整个人API文件，新增权威schema传递消费者、Webtypes及既有sync一次；固定安全功能commit。

## 任务2：时间块和地点编辑（SC01/04）

文件：App PersonalScheduleScreen/新PersonalScheduleTimeBlock、personal-schedule-editor.ts，新增duration.test.ts；Webworkspace/editor-model/client真实对齐。

接口：保留personalScheduleDraft及buildPersonalScheduleChange旧行为，扩新字段类型；新增duration纯函数输入已验证draft/IANAzone/30|60|120，返回ready draft或invalid原因。全天local calendar nextDate→合法instant，状态绑定同actor/server/id/revision。API client统一opt-in header与receipt精确新字段匹配。

- [ ] 写行为RED：18:00+30=18:30、23:45+30次日00:15、DST全天23/25小时、fold/gap拒绝、无变化保秒、结束时间清空/改期，double-save一次写、返回确认保稿。
- [ ] 大标题底线输入；日期一行、两列时间和时长快捷；跨天才展开结束日期，选择面板用已安装控件，缺原生库先使用现有可访问展开控件，不擅自安装新SDK。合并时区/仅保存Orbit附注。
- [ ] 线上/线下与URL清除接线共用真实draft；顶栏/底栏save同步singleflight，正式receipt+GET后进入详情。取消/顶栏返回消费0051已固定onBack，未移交前只暂停该接线。
- [ ] 完整editor/interactions/新duration文件与直接Webworkspace回归，相关types；不全平台全排列。

## 任务3：独立详情、真实关联和稳定路由（SC02/03）

文件：App新PersonalScheduleDetailScreen/Associations、detail VM、[id].tsx与[id]/edit.tsx、PersonalScheduleList和实际home/calendar消费者；Webworkspace阅读/编辑拆分；新增detail-interactions.test.tsx。

接口：详情 `/schedule/personal/<encoded-id>`；编辑后缀/edit；新建/new不被动态路由吞掉。详情仅GET，不在打开或点击关联时保存。合法meetingUrl仅用户点击打开；关联notes/contact读取原认证API，数量与可读事实一致。

- [ ] 路由RED覆盖encoded ID、home/calendar/list→同一详情、详情编辑/改期→同记录、GET404/503/未登录、不完整或foreign receipt，不把event/meeting转成可编辑personal。
- [ ] 按参考的大标题/起止/日期时长时区/紧凑信息行渲染真实字段；无结束/无权限/未知关联有清晰状态，不显示示例时间/人名。链接scheme校验、无可用链接无“进入会议”。
- [ ] 联系人/笔记有界选择/移除/保存/跳转，关系不自动向其他人分享；删除/撤权关联避免披露，冲突保稿。提醒/重复只显示真实支持状态，未实现不可点击且明确说明。
- [ ] 同viewport浅色/大字及键盘下底部CTA截图对照，tokens深色基本回归；真实Avatar/既有图标不生成demo头像或系统chrome。必要完整测试文件定向GREEN后固定安全commit。

## 任务4：运行时视觉和跨端交付（SC05）

文件：本Sprint真实REPORT及ROOT Bridge交接；证据放ignored build。接口：ROOT fixedSHA/BUILD/Phone产物/Metro8082/native安装版本/同actor/workspace/准确自建ID与cleanup边界。

- [ ] H本地收口受影响端一次I与未覆盖types/sync；保留真实失败/skip和有限修复回归，不写成全库绿色。
- [ ] ROOT生产Web重建重启及health，再Phone重建、主线App安装连接8082；保留已有32110固定隧道、322xx工具与预算账本，不由Generator换服务/账户。
- [ ] 实际创建→独立详情→编辑/改期→App写Web读/Web写Phone及Simulator读，覆盖全天、跨天、线上链接及合法关联；安全删除只清准确自建记录。不调用真实AI/外部provider补 UI 证据。
- [ ] 开参考图与实际同viewport同状态图比较，记录明显偏差及修复；报告每SC pass/fail/missing、SHA、完整测试与真实运行结果，不把原型或路由200当业务通过。
- [ ] 路径限定commit+实际detect、交固定SHA给ROOT，精确merge chat-agent/合并树验证/适用push/远端SHA核对。缺实际SC或依赖不completed，不重开Generator。
