# Sprint 0138 — 首页笔记入口合并

**Plan revision:** 1。**模式:** existing-codebase / single-generator；执行方式沿用 [RULES.md](../RULES.md)，不另派实现者或评审代理。
**原需求:** 用户 2026-09-30 要求：首页「添加新的笔记」与「查看所有笔记」合并为「笔记」，在笔记页内新建。
**单一目标:** 首页只保留一个通向完整笔记列表的入口，列表内继续提供新建。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 编制时本地主线 `chat-agent` = `9087d9fecd280efbe3586f14fdfab3dc8eca1d42`；开工时登记实际基线与 Planner SHA256，不提前消耗 run-01。
**进入条件:** 已批准的目标与当前笔记列表、新建路由可用；协调者分配唯一 Generator、首页文件锁和验证资源。无需等待 0133–0136；不以 0132 完成作为入口改动的硬依赖。若验收树包含 0132，使用冻结的组合版本，不覆盖其进行中改动。

## 已查明的事实

- 真实首页是 `app/home.tsx` 挂载的 `HomeDashboardScreen`，不是展示活动目录的 `HomeScreen`。
- `HomeDashboardScreen.tsx` 的 `quickActions` 当前同时含 `home.newNote → /notes/new`、`notes.allNotes → /notes`，两个按钮使用同一个笔记图标。
- 已有 `notes.title` 翻译为中文「笔记」、英文「Notes」、日文「メモ」，直接复用；不改字典、不删仍被别处使用的旧 key。
- `NotesScreen` 已有右上角新建按钮；`app/notes/index.tsx` 和 `app/notes/new.tsx` 已承接列表与创建。无需新增列表、接口或存储层。
- 本需求更新首页入口的旧设计决定，但不改写 0011、0018 等历史 Planner 或报告。
- 编制时 GitNexus 绑定 `orbit-line-b-0132`，`HomeDashboardScreen` upstream 报 LOW、0 已解析直接调用；精确文本补查确认 `/home` 路由和真实首页交互测试仍是消费者，不能据零调用判定无人使用。实施前在实际工作树重新核对相关符号 impact。

## 范围与文件

- 修改：`repos/orbit-app/src/screens/home/HomeDashboardScreen.tsx`，仅合并 `quickActions` 中两个笔记项。
- 修改：`repos/orbit-app/tests/home-dashboard-interactions.test.ts`，替换旧双入口预期，保留其余首页导航、日期、账号保护和无隐式写入断言。
- 修改：`repos/orbit-app/tests/notes-list-interactions.test.tsx`，补现有列表的新建按钮导航断言；已有历史 53 条、分页失败重试断言保留。
- 只读复用：`repos/orbit-app/src/screens/notes/NotesScreen.tsx`、`NewNoteScreen.tsx`、`repos/orbit-app/app/{home.tsx,notes/index.tsx,notes/new.tsx}`、现有中日英字典和笔记数据源。
- 交付文档：本目录 `REPORT.md` 在执行结束后创建；登记表和 Bridge 交接由协调者更新。
- 排除：重做笔记页面、修改筛选或分页协议、改变笔记权限／离线队列、改 Web 独立控制台首页、删除或迁移旧笔记、部署和远程 push。phoneweb 与原生 App 使用同一份首页源码。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0138-01 | 首页只出现一个「笔记」快捷按钮，在新建待办之后；旧「记笔记」「所有笔记」首页按钮消失，其他快捷按钮不变 | 首页真实组件交互 RED→GREEN |
| SC-0138-02 | 点击「笔记」进入 `/notes`，不附加联系人、活动、搜索条件，不触发笔记创建或其他业务写入 | 路由与无业务写入断言 |
| SC-0138-03 | 笔记页现有新建入口可进入 `/notes/new`；已有历史、搜索、分页及重试正常；新笔记保存后可从列表再次打开 | 笔记列表完整测试及同记录运行时回读 |
| SC-0138-04 | 中／日／英复用既有标签；窄屏与较大字号不出现重复入口或挡住点击；沿用原账号保护与离线读写门禁 | 必要语言／布局交互断言及原生截图 |
| SC-0138-05 | Simulator 和 fresh phoneweb 均实际完成首页→笔记→新建→保存→列表打开；相关检查通过，本线提交并由协调者合入 `chat-agent` | 本地跨端操作、版本记录、固定 SHA 与合并树检查 |

## 一个操作链的执行顺序

- [ ] 核对基线、用户未提交改动和独占文件；登记同一 run-01、哈希、唯一 Generator（用户指定 GPT-6 Luna / high）。查看首页渲染处及相关符号 impact；本 Sprint 不接管其他线的共享基础设施。
- [ ] 在首页既有 `open`、`hydrate`、`press`、`writes` 夹具中用以下行为替换旧双入口用例，并先运行确认 RED：

```ts
test("home has one notes shortcut to unfiltered history without writes", async t => {
  const p = await open(t); await hydrate(p);
  assert.equal(await p.getByRole("button", { name: "笔记", exact: true }).count(), 1);
  assert.equal(await p.getByRole("button", { name: "记笔记", exact: true }).count(), 0);
  assert.equal(await p.getByRole("button", { name: "所有笔记", exact: true }).count(), 0);
  await press(p, "笔记");
  assert.deepEqual(await p.evaluate(() => (window as any).fixture.navigation), ["/notes"]);
  assert.deepEqual(await writes(p), []);
});
```

- [ ] 两个旧笔记项合成下面一项，位置仍在 `home.newTask` 之后；不修改其他首页逻辑或列表数据源：

```ts
{ labelKey: "notes.title", href: "/notes", icon: "notes" },
```

- [ ] 首页综合导航用例的「记笔记」改为「笔记」，相应期望从 `/notes/new` 改为 `/notes`；笔记列表夹具断言点击「新建笔记」得到 `/notes/new`，保留历史分页全部原断言。使用现有翻译夹具核对 `Notes`／`メモ`，不新增字典或共享测试设施。
- [ ] 跑下面完整定向集与 App 类型检查；必要修复按 RULES 的上限执行，不把局部变化当作重跑两端全量的理由。
- [ ] 排队取得设备／服务锁。在同一获准本地测试账号和数据库上完成 SC-05：只新建带 `QA-0138-` 前缀的测试笔记，不编辑或删除既有用户笔记；记录 App→phoneweb、phoneweb→App 的同记录回读。正常导航产生的写入也须计入，缺对象授权则只暂停该真实写入步骤。
- [ ] 重新导出并重启本线 phoneweb，确认其同源 API 配置和新 bundle；Metro 8082 加载本线原生新 JS。若 Web/API 源码未变，复用同源健康产物；若变更，则先生产构建、重启，再验收。不得清共享缓存、停止用户 3000 或争抢其他线 Simulator。
- [ ] 精确暂存本线文件，完整 graph all/staged 检查后 commit；结束时写实际 REPORT，交接固定功能／报告 SHA。协调者合并到 `chat-agent`，复核受影响的合并树后才能记 completed。

## 最小测试与检查

实现档位 L：预期只改局部首页导航与对应断言；若实际 impact 涉及通用基础设施或 HIGH/CRITICAL 产品风险，由协调者按 RULES 重新确定覆盖，不自行扩大产品范围。

工作目录为 `repos/orbit-app`，操作链收口运行：

```sh
node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/home-dashboard-interactions.test.ts tests/home-dashboard.test.ts tests/notes-list-interactions.test.tsx
npm run typecheck
```

开发阶段可以对新增用例定向运行，但不得把筛选后的结果称为完整文件通过。若笔记测试夹具在选定基线不兼容当前 hooks，先确认前序已有修复并复用，不为本 Sprint 重建或降低笔记测试。

保留现有笔记创建的有效同源测试证据；实际保存／回读由 SC-05 补齐。没有 API、存储或契约变更，不跑服务端全量、迁移、同步生成、AI 或 OCR。按 RULES 仅有实际风险扩大或明确要求才再次触发全量。

## 失败与交接

首页入口与笔记页创建是同一操作链，不拆多个 Generator。必要文件超出上述边界时先查影响、追加原因及锁；与 0132 或后续首页待办变更冲突时，仅暂停重叠动作。共享设备验收排队不等于独立实现必须等待 0133–0136。

报告逐项列 SC、相关版本、测试命令／退出码、截图、测试笔记脱敏标识及遗留事项。代码、报告与合并验证缺任一项都不能标 completed；本轮只编制计划，不提前创建 REPORT 或启动实现。
