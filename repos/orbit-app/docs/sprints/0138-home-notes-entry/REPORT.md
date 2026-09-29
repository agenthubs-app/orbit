# Sprint 0138 — 执行报告（run-01）

## 结果摘要

首页的「记笔记」和「所有笔记」已合并为一个「笔记」快捷入口，位于「新建待办」之后并进入未筛选的 `/notes`。新建操作保留在笔记列表页，仍进入 `/notes/new`。功能提交：`a6910a10b7777ef2f68e9aafeed23bd0c24e18fd`。

Root 已在冻结组合 QA 树 `55806e7e5`（含本线功能提交及 0132 组合变更）完成原生 Simulator 与 phoneweb 的实际跨端操作。该 QA 树不是最终主线提交；Root 的主线集成／合并树收口仍待完成。本报告记录已执行证据，不声明主线已合入或 Sprint 生命周期已由协调者关闭。

## 验收结果

| SC | 结果 | 证据与边界 |
| --- | --- | --- |
| SC-0138-01 | 通过 | 首页只保留一个「笔记」入口，顺序在「新建待办」之后；不再显示首页「记笔记」或「所有笔记」。组件交互测试与组合树原生／phoneweb 首页截图均验证。 |
| SC-0138-02 | 通过 | 点击首页「笔记」进入无联系人、活动或搜索过滤的笔记列表；组件夹具断言导航为 `/notes` 且无业务写入。组合树原生及 phoneweb 路由已实际点击。 |
| SC-0138-03 | 通过 | 笔记页「新建笔记」仍导航至 `/notes/new`。原生创建 `QA-0138 app01` v1 后，phoneweb 列表／详情回读同一标题与正文；phoneweb 创建 `QA-0138 web01` v1 后，Simulator 列表（4/4）及详情回读同一标题与正文。 |
| SC-0138-04 | 部分验证 | 首页入口复用既有 `notes.title` 翻译和笔记图标，没有新增字典或改变账号／离线门禁；笔记列表原有历史、搜索、分页、重试、较大字号及英文 chrome 测试仍通过。实际截图覆盖组合树的原生与 phoneweb。未单独声明所有语言、字号和离线状态的完整跨端截图覆盖。 |
| SC-0138-05 | Root 实际验证；最终集成待收口 | 组合 QA 树在 iPhone17Pro Simulator 与 fresh phoneweb 上完成首页→笔记→新建→保存→另一端列表／详情回读。由于主线 B 合并及最终主线树核验仍由 Root 处理，此项不代表最终主线集成完成。 |

## 实现与验证

- 功能变更仅在 `repos/orbit-app/src/screens/home/HomeDashboardScreen.tsx`：两个首页 action 替换为 `{ labelKey: "notes.title", href: "/notes", icon: "notes" }`，位于 `home.newTask` 之后。
- 测试仅改 `repos/orbit-app/tests/home-dashboard-interactions.test.ts` 与 `repos/orbit-app/tests/notes-list-interactions.test.tsx`：覆盖唯一首页入口、旧入口消失、无筛选 `/notes` 导航和无写入；列表页新建按钮仍导航 `/notes/new`。
- RED：旧实现运行新增首页交互用例失败；期望「笔记」按钮数为 1，实际为 0。GREEN：
  `node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/home-dashboard-interactions.test.ts tests/home-dashboard.test.ts tests/notes-list-interactions.test.tsx`
  81/81 通过，0 失败、0 跳过，exit 0。类型检查 `npm run typecheck` exit 0，无诊断。
- Root 在组合树重新运行同三测试文件：81/81，0 失败／跳过，exit 0；App typecheck exit 0。
- RED、GREEN 与类型检查记录（从命令输出整理，非原始重定向 stdout）：[`0138-home-notes-shortcut-verification.txt`](../../../../../build/harness-logs/sprint-0138/0138-home-notes-shortcut-verification.txt)。
- GitNexus 本线工作树索引：110,778 nodes、183,979 edges。提交前 `detect_changes` 的 all 与 staged 均映射到 3 个预期文件，风险 LOW，0 个受影响流程；结果无 partial／truncated 标记。

## 组合树运行证据

Root 报告的组合 QA 树：`55806e7e5`。phoneweb 导出 exit 0，entry `d01c27fb284f009b4ecb0083092252b3.js`，服务端口 32110 指向批准的本地 API 3100；Debug Orbit.app 从同组合源码构建并安装，Simulator 通过显式 `127.0.0.1:8082` Metro 加载。

原生截图：

- [`0138-native-home.png`](/Users/xzhao/Projects/orbit/build/harness-state/evidence/sprint-0137/root-qa/0138-native-home.png)
- [`0138-native-notes-list.png`](/Users/xzhao/Projects/orbit/build/harness-state/evidence/sprint-0137/root-qa/0138-native-notes-list.png)
- [`0138-native-web-note.png`](/Users/xzhao/Projects/orbit/build/harness-state/evidence/sprint-0137/root-qa/0138-native-web-note.png)

phoneweb 截图：

- [`0138-phoneweb-home.png`](/Users/xzhao/Projects/orbit/build/harness-state/evidence/sprint-0137/root-qa/0138-phoneweb-home.png)
- [`0138-phoneweb-list.png`](/Users/xzhao/Projects/orbit/build/harness-state/evidence/sprint-0137/root-qa/0138-phoneweb-list.png)
- [`0138-phoneweb-web-note.png`](/Users/xzhao/Projects/orbit/build/harness-state/evidence/sprint-0137/root-qa/0138-phoneweb-web-note.png)

以上运行步骤由 Root 在其锁定的组合 QA 树执行；本线没有操作 Simulator、浏览器账号、3100／8082／32110 服务或共享缓存。未使用 AI/provider。

## 集成状态

- 本线功能固定提交：`a6910a10b7777ef2f68e9aafeed23bd0c24e18fd`。
- 本报告当前待提交；Root 拥有 README、Bridge 登记和主线集成。
- 不 push、不部署。主线 B merge／最终集成树确认完成后，由协调者更新 Sprint 登记生命周期；本报告不代替该协调动作。
