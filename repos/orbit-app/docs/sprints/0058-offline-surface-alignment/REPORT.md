# Sprint0058 实际部分交付报告

原生消费清单的10项遗漏和AI／首页审计识别错误已修正，固定源码的完整消费者审计通过。实际离线回读仍未接通：现有运行时没有消费全域读取清单及事件域选择器，不能把登记通过称为全域离线可读。本run产品执行已结束，交付部分 source_ready，SC03 blocked；没有完成全部Sprint验收或发布。

## 固定提交与文件范围

- 唯一 A Generator，run-01；没有新增实现或评审代理，没有重开0056／0057。
- canonical ROOT Planner SHA256：`0c748bda83d6beeeafc0440fc3da6f0e31fd9cc2aef52b658c0b735ea9520920`。
- 工作树：`/Users/xzhao/Projects/orbit/.worktrees/sprint-0058-offline-surface-alignment`，分支 `codex/sprint-0058-offline-surface-alignment`。
- 实际产品基线：`ca77035729bffae1c977ed30b6697921c02decfb`，TREE `d5106684cf824b922b21a1898b07d527fc71c983`；包含前序固定52路径，不把它们计作本轮实现。
- 实际部分功能提交：`137f6f2ea0d85a0f604a436b74ca12e53f54494c`，TREE `e20ae9bb2a854b4f83c96b08d9ea1fd3652c12b3`。
- 仅三个文件，80行新增／8行删除：`src/data/offline-read/route-domain-inventory.ts`、`scripts/audit-offline-read-surfaces.ts`、`tests/offline-read-inventory.test.ts`，均位于 `repos/orbit-app/`。
- 2026-09-16 20:59:51 UTC，功能提交后实际 `git status --short` 为空，产品tree与正式审计快照完全相同。没有修改页面、qualification、Web、字典、shared契约、同步协议或迁移。

## 实现与安全边界

新增登记来自真实调用，而非按计划猜测。CanonicalEventDetailModules 的 registration／operations／post-event/artifact GET及 registration/cancel POST 四项；PersonalScheduleAssociations 的 contacts/:id、notes、notes/:id GET和 contacts/search POST四项；PersonalScheduleDetailScreen 的 schedule-items及 schedule-items/:id GET两项，共十项。registration POST仍归真实报名消费者，未凭旧描述虚增模块调用。

operations末段现在与既有operations子资源同属 event-operations。新增条目使用各自既有域、schemaVersion1、typed selector标签、durable_normalized读取声明、metadata_only及online_only mutation；同接口多个消费者策略一致。声明不等于已运行的selector。未增加offline_queue资格，未知路径／方法、认证和秘密端点仍拒绝或 online_only_secret／never_local。

只移除确已退役的 PersonalScheduleList detail登记；没有删除仍合法的AI／首页调用。首页 `paths[section]` 从有限源对象及section类型直接解析，撤除旧位置fallback；混合已知与UNKNOWN分支仍报告UNRESOLVED_PATH。AI沿既有精确computed-path规则把源位置343／496校正到实际345／498，不新增通配或忽略名单。该既有AI位置机制仍有行漂移维护限制，并非已完成通用AST语义分析；源码改变须重新审计。既有未解析delegate／method／path及合法调用掩盖非法调用的反例保持。

## 真实RED、验证与失败归属

| 检查 | 实际结果 |
| --- | --- |
| 精确新行为及真实消费者 RED65683 | 4项，1通过／3失败，0skip／0cancel，exit1，9342.133459ms，两guard0；实际扫描10unregistered／10invalid，与前序失败一致 |
| 最小修复后完整 inventory 文件72731 | 17／17，0fail／0skip／0cancel，exit0，9467.466083ms，两guard0 |
| App types3906 | 一次执行，实际exit0，两guard0 |
| 唯一 App 全量 I70715 | 实际exit1，3203项／3202通过／1失败／0skip／0cancel，498725.24175ms；全日志542条guard输出，nonzero0 |
| diff与cached diff检查 | 实际exit0；只有三个固定路径，完整差量与冻结SHA一致 |

使用固定 Node22、`env -i PATH=/usr/bin:/bin`、zero-outbound preload与ROOT指定0057 protected-runtime preload。后者禁止3000／8082／5432／6543及32000–32999保护端口。两preload使用 `--import`，未加载真实环境文件。定向命令为 `node --test --test-concurrency=2 --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/offline-read-inventory.test.ts`；类型为 `node node_modules/typescript/bin/tsc --noEmit`。I采用相同参数及package真实两组quoted globs `tests/**/*.test.ts`、`tests/**/*.test.tsx`，只执行一次，不编辑被测版本或重复全量。新增三个测试使前序3200项变为3203项。

唯一全量失败为 `the 58-route visual snapshot plus subsequent feature routes matches every real app entry`：unexpected只有 `/+html`，missing／duplicates为空，实际栈 `tests/app-wide-route-coverage.test.ts:274:10`。与0057同源域外失败，未修路由、放宽断言或称失败获豁免。本轮不是全量green。

前序0057原I59826的3200项／3198通过／2失败／0skip／451494.023292ms、542条guard nonzero0保持。其第二项 `the actual native consumers all have explicit versioned policies` 栈为原 `tests/offline-read-inventory.test.ts:86:10`，10unregistered中canonical4来自固定52路径，personal6及10invalid也不能按旧基线豁免。本轮完整17项和本次I中的该审计实际通过，不把前序原I改记通过。

Web产品未变，没有重跑Web全库。只按前序0057报告复用ROOT既有Web57项／55通过／2个PostgreSQL skip／0fail／guard0及types0的未变范围证据，不声称本轮执行或真实数据库验证。已批准App／Web本地依赖链接由ROOT提供，未install或envcopy。

## 影响分析及不可变审计

固定 `repo=/Users/xzhao/Projects/orbit` 的actual upstream：domainFor LOW／1direct／3expanded；evaluate MEDIUM／7direct／15expanded；recordTransport LOW／2direct／14expanded，均0已映射流程。objectProperty另查LOW／3direct／16expanded，但最终未修改。图未覆盖AST动态关系和新增测试的部分仍UNKNOWN，零映射不代表零风险。

ROOT在实际stale后sole-writer刷新16631，最终实际exit0／276.2秒／META基线817。重建期间正式审计一次返回数据库unavailable，未当成功或提交；A未重复图请求或刷新。最终ROOT正式比较固定ca770..e20：3files／10mapped symbols／0flows／LOW，完整三路径80+/8-已读审后放行部分功能提交。未使用ROOT空staged检查替代本线快照。

## 五项SC与具体剩余依赖

| SC | 状态／实际依据与缺项 |
| --- | --- |
| 58-01 | 本地清单通过：十项真实消费、正确域／selector标签／schema和独立写策略，operations末段及陌生子资源反例覆盖 |
| 58-02 | 本地通过：固定源码真实扫描unregistered／invalid均空；源map解析、未知键／映射分支、方法／delegate及混合调用拒绝由完整17项验证；AI既有位置维护限制保留 |
| 58-03 | blocked，不报离线回读通过：registry函数在现有运行时无消费者；useOrbitApiClient仍直接HTTP，useApiResource用旧snapshot且canonical资格模块network-only；legacy repo只有contact/note/task/relationship_followup/personal_schedule/inbox_item六kind，schema及cursor缺domain+authorizationEpoch，snapshot缺strict projection／lease元数据，纯grant与ScopePort尚未接可信issuance／存储。registration、operations、post-event及日程关联／详情均没有本轮可安全绑定的全域runtime selector，缺对应授权回读、撤权及删除fence证明。完整修复依赖0033～0036既有机制、同步协议和迁移，不在本轮不引入架构／不改迁移范围；ROOT已确认只阻相应SC，未降低原目标 |
| 58-04 | 定向与types通过，唯一I实际执行但有域外1失败；不宣称全量green。源码冻结和全部guard结果明确，Web未变证据仅复用 |
| 58-05 | 固定部分源码提交完成；本报告另doc审计提交待ROOT。精确主合chat-agent／push核、生产build及PID／health、主8082实际同账号只读设备消费和Phone影响交接均未发生，不预填成功 |

原0033～0036／0050／0053缺项保持，0050同账号同活动取消→再次报名和日程双向写回读不由本轮登记代替。没有改变日期、账号、角色或数据来制造验收窗口。

## 结束与证据

产品执行已结束，三源码编辑锁、重套件运行锁和全部类型／测试句柄已释放；不再源编辑或重开run。报告暂不填写自身SHA。真实服务、设备／Simulator、账号、业务数据、DB／缓存、provider和公网均未操作，A费用0，原累计$5账本不重置。

ignored证据目录：`/Users/xzhao/Projects/orbit/.worktrees/sprint-0058-offline-surface-alignment/build/harness-state/evidence/sprint-0058/run-01/`，含checkpoint、完整app-I.log和product.diff。product.diff SHA256为 `634455264e4e4b4d4b3f452f4eade627f9c3523498add139f2f4253309d9041b`。ROOT应只消费固定功能／报告提交，不取移动HEAD，不覆盖其他线或用户改动；部分主合不等于全域离线或Sprint完成。
