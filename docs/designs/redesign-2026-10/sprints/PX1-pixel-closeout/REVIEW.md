# PX1 REVIEW

**结论：不通过。** PX1 完成了四态数据和门禁取证，但尚未完成像素收口。REPORT 对未过项基本如实披露；其“自身新失败 0”验收条件不能成立。

## S

- **S1** `origin/redesign:docs/designs/redesign-2026-10/sprints/PX1-pixel-closeout/REPORT.md:180`：证据索引中 57 张目标图全部 FAIL，均有未归因超阈带；10 张 PASS 仅含既有 R11b Web 六图及交叉检查四图。按 A/B/D/E 交还项修复后逐图重比，合法归因完成前不得标记像素通过。
- **S2** `origin/redesign:repos/orbit-app/src/screens/network/network-design-fixture.ts:40`：新增 GET 未登记到 `src/data/offline-read/route-domain-inventory.ts`。同版本独立复跑清单测试 **25/26**，唯一失败明确指向该读取。补齐显式、版本化的开发态读取策略并复跑；REPORT 所列其他全量失败也缺同版本干净基线，不能推断其均为旧失败。

## M

- **M1** `origin/redesign:repos/orbits/app/api/dev/network-design-fixture/route.dev.ts:23`、`:33`：联系人 GET 虽要求登录，变体 GET/POST 仍无需认证，POST 修改进程级共享状态。PX1 的“按 actor 隔离”只覆盖返回值与 App 快照，不能隔离变体选择。给切换入口加认证并按 actor 隔离，补双账号测试。
- **M2** `origin/redesign:docs/designs/redesign-2026-10/sprints/PX1-pixel-closeout/REPORT.md:173`、`:177`：离线断网重启、返回列表滚动位置及“近い条件なら”实际跳转链未验证，SC-03/07 只能记部分完成；补操作链证据后再验收。

## m

- **m1** `origin/redesign:repos/orbit-app/src/screens/network/network-design-fixture-data.ts:28`：一条坏联系人会使整个 fixture 列表解析失败，与规则 10 的逐条跳过口径不符。改用逐条宽进校验，并测试额外字段及坏行。

## 核实通过项与范围

四态联系人与分析数据的定向 Web 测试 **6/6**、App fixture 测试 **2/2** 通过；抽看两张交叉检查 PASS 图及一张 R21 FAIL 图，与索引结论一致。PX1 未修改公开契约、outbox、同步域、组件库、token、导航壳或 OAuth 路径，也未删除旧屏；因此本批没有由删屏引起的新断链证据。未独立重跑全量像素门禁及全量测试。