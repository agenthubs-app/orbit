# Sprint0055 — 点单识别与实施事实纠偏执行总结

## 目标实现情况

本轮修复0052真实预览发现的两项问题：原需求中的“点单／點單”现在与“点餐／點餐”归为同一个业务条件；联系人自己的税务落地诉求、未来合作意愿、否定或讨论，不能当作点单实施经历。相关的明确已完成工作或实际实施职责仍计分，混合事实和诉求只引用合格事实的原文子句，没有实施证据时合作项0分但原权重分母保留。

本地SC55-01/02/03已验证。新生产预览、真实原账号78联系人回读、主线合并树、生产重建/发布及远端核对由ROOT/Phone持有，本线未执行SC55-04/05，整个Sprint不能记completed。未重开0052，也不抹掉原预览及全量失败。

## 运行记录

- 结果：blocked（本地实现已交付，真实预览和集成待协调）；run-01，唯一Generator phoneweb-A `01a0a879-e923-7701-8e39-935f36eab448`，未增加实现者或评审。
- 启动时间以ROOT登记为准；本线首次时钟记录2026-09-16 18:35:23 UTC时已进入只读准备，不能冒充准确启动时刻。本地结束确认2026-09-16 18:45:45 UTC。
- 固定工作树 `/Users/xzhao/Projects/orbit/.worktrees/sprint-0055-needs-intent-evidence-correctness`；分支 `codex/sprint-0055-needs-intent-evidence-correctness`；干净基线 `37b29b5a00edcde413242991377d0470587baf48`，不承接Phone活动报名脏改动。
- 冻结Planner SHA256：`458c4f56244227c78b6020e46c4bf77ff414bc68db34ef6b5a24f4b9b5a9e15e`，实际核对相同；RULES、GOAL、AUDIT、Planner及0052REPORT已完整读取。
- 最后功能commit：`56e0c19d1f4875540f277dca46360aded124f88a`；实际HEAD tree=`77de193f94a980648139c49ff2fa4ef679d87130`，与ROOT审计快照完全相同。完整产品patch SHA256：`11755c3a0baa545485d81462826caca4c8d062f3d7924cf867c7256842401f48`。
- 主线合并SHA、合并树验证、普通push/远端SHA：等待ROOT，不预填通过。报告自身SHA由真实Git历史/交接提供，不在自身文件预填。

## 改了什么

| 行为／原因 | 实际路径（相对工作树） | 功能commit | SC |
| --- | --- | --- | --- |
| 补点单／點單，同概念只计一次 | `repos/orbits/features/contact-needs/criteria.ts` | `56e0c19d1` | 01 |
| 合作项选择同一原字段子句中相关实施事实／职责，排意愿、否定、讨论和无关税务落地 | `repos/orbits/features/contact-needs/scoring.ts` | `56e0c19d1` | 02/03 |
| 记录保守规则及固定产品SHA区别，不冒称通用语义理解 | `repos/orbits/features/contact-needs/DESIGN.md` | `56e0c19d1` | 01–03 |
| 原需求、三语言正反例、原文来源、未完成／讨论及既有排序回归 | `repos/orbits/tests/services/contact-needs.test.ts` | `56e0c19d1` | 01–03 |

仅以上四个路径改变。保留`needs-evidence-v2`算法族、wire shape、35/35/20/10权重、缺资料分母、舍入和service两次profile一致性检查；未改shared契约/schema、App副本/VM/Screen、四字典、其他领域或真实联系人。旧夹具制造采购事实对美国科技投资诉求的错误合作分由20纠正为0，资料本身未改变。

## 验收结果

| SC | 状态 | 实际证据及范围 |
| --- | --- | --- |
| SC55-01 | pass（本地） | 完整service文件调用真实criteriaForNeed/scoreContactsForNeed，原点单goal、繁简混用、日英ordering同概念；明确ID与一次计数。 |
| SC55-02 | pass（本地） | 匿名原语义夹具不再获实施分，matched=false、strength=none、证据字段/片段null、baseWeight20/归一分母不变、总分低于100；无真实联系人写入。 |
| SC55-03 | pass（本地） | 中日英意愿/未来/否定/无关事实反例、完成及负责正例、混合事实/诉求的原文子句与role来源，完整既有排序/同分/弱AI/缺失/race/API/通知预过滤回归及Backend types。 |
| SC55-04 | blocked / not_run | Phone父须提供固定新build/entry、原账号原78联系人/原需求与版本的真实只读GET、本体及预算不变、API↔Phone与ja/en受控展示证据。本线合成夹具不能替代这些证据，原错误832预览未获准发布。 |
| SC55-05 | blocked / not_run | 固定功能及报告交接后，由ROOT完成精确主线增量/合并树检查、主Web生产重建/重启、普通push/远端一致；Phone只发布真实预览合格产物并核固定公网域名。本线没有环境切换或发布授权。 |

## 实际命令、失败历史与复用

固定Node v22.23.2：`/Volumes/ORICO/Dev/cache/npm/_npx/52027bd8fc0022aa/node_modules/node/bin/node`。仅显式设置运行变量`NODE_OPTIONS`加载`/Volumes/ORICO/Dev/phoneweb-pw0010-validation/zero-outbound-preload.mjs`；不披露凭据值，不复制env或安装依赖。两端lock与MAIN分别SHA完全相同，node_modules仅ignored symlink复用现有MAIN目录。命令cwd为本工作树`repos/orbits`。

证据在Git ignored `build/harness-state/evidence/sprint-0055/run-01/`；完整产品差量`git/product.diff`，过程和原始工具输出另在任务历史。

| 命令／场景 | 实际结果 | 日志 |
| --- | --- | --- |
| 只读合成调用真实评分，未改产品 | 原点单条件缺ordering；税务诉求score100/实施22.2222复现，guard0 | 任务18:36 UTC原始输出 |
| `node --test --import tsx tests/services/contact-needs.test.ts`（首次RED） | exit1；15 tests/10pass/5fail/0skip，业务断言失败非loader错误 | `commands/service-red.log` |
| 同完整文件（最小GREEN） | exit0；15/15pass/0skip/guard0 | `commands/service-green.log` |
| 同完整文件（新四个独立未完成／讨论RED） | exit1；19 tests/15pass/4fail/0skip；将负责、日文未完了、英文No completed、曾讨论分别失败 | `commands/unfulfilled-red.log` |
| `node --test --import tsx tests/services/contact-needs.test.ts tests/api/contact-needs-route.test.ts tests/services/notification-discovery-prefilter.test.ts` | exit0；25/25pass/0skip，1044.901875ms；所有worker guard denied=0 | `commands/final-backend-direct.log` |
| `node node_modules/typescript/bin/tsc --noEmit`（本线相关端一次） | 原session78913 actual exit0 | `commands/backend-typecheck.log` |

四个新边界RED后仅一次谓词修正，再最终完整定向GREEN，不增加生成/评审循环。actual`git diff 193e..37b`在需求评分目录、shared needs、service/API/prefilter测试及lock为空，故承接0052最后17项专项基线，不伪称本轮重新跑基线。App/wire未修改，不同步生成、不跑App检查或重复0052全量。此为L局部实现，actualimpact未触发H，因此没有本轮I full。

历史失败原样保留：0052 Backend原full3621 tests/3358pass/57fail/206skip，contacts-analysis worker guard拒绝4；App原full3130/3129pass/1fail（未改待办43.999969pt严格44pt断言），后续单文件通过不抹掉full失败。Phone错误832预览缺ordering/四人100的原receipt与controlled-display/动态collectedAt比较记录仍有效，本线通过不把0052改为completed。

## 审计、锁与后续交接

- ROOT sole索引writer释放后，实际成功日志234.5s及META `59cfbc13ebae1ba44e55a9b9a07a9ca85edffc67`/2026-09-16T18:41:04.195Z确认fresh；未取得原session退出码，不冒称有该凭证。A实际list_repos/ROOT context绑定正确目录；query/context/process目录未映射匹配流程，不能当作没有影响。
- 实际upstream：criteriaForNeed LOW2直接调用（score/discovery）；criterionMatch LOW1内层criterionMatches；evidenceSources LOW2直接/5expanded，未编辑。scoreContactsForNeed零调用方按UNKNOWN，源码service.ts34真实调用补查。唯一新helper implementationEvidence actualimpact notfound按UNKNOWN，实际仅criterionMatch调用，再读取evidenceSources/containsAlias；没有HIGH/CRITICAL结果。
- ROOT实际官方detect_changes对`37b..77de`、repo绝对ROOT、scope compare成功：4files/42mapped/0affectedflows/LOW；准确immutable cached快照/4path manifest/patch与A write-tree核对一致，不是ROOT错误cwd staged空结果；新helper图盲区仍UNKNOWN。功能commit前cached diffcheck0，实际commit tree77de保持。
- 本地所有测试/type句柄已结束，无A产品服务。功能已提交，报告另按精确单doc快照审计提交后交ROOT/Phone；后续固定两SHA与workingtree/锁释放事实以最终交接为准，未自动main合并/push/重启/清缓存。
- 费用及副作用：本线0新模型/provider调用、0真实账号/数据库/prefs/需求/联系人写入；原累计$5硬预算和账本由ROOT持有，不按Sprint重置或猜测最新余额。
- 下一步与恢复条件：ROOT/Phone接固定功能及报告，在获准环境窗口完成SC55-04/05；保持旧合格公网产物直到新预览通过。若真实预览仍失败，按契约如实失败/保留证据，不重开本Generator、不修饰数据或借旧进程当新证据。需要回退由协调者选择精确版本，不自动reset或覆盖用户改动。
