# Sprint 0148 报告：首页人脉小组件显示人脉分布

## 1. 状态
**已完成，等协调者复核合并。**
- 分支 `offline-fixes-20261102`，worktree `/Volumes/ORICO/Dev/worktrees/orbit/offline-fixes`，起点 `61d4da67e`。
- 未推送，未部署，未碰 Neon / Vercel / 正式库。登记表未改。

## 2. 验收
| SC | 结果 | 证据 |
|---|---|---|
| 01 分组、未填写、合并其他、默认维度 | 通过 | `tests/home-network-distribution.test.ts` 7 条：行业前 3 名 + 「其他」+「未填写」且加起来等于总数；不足 3 类时没有「其他」、没人未填时没有「未填写」；地区按城市 → 地址文字 → 国家；认识场合里不知道的归「其他」、不算已填写；没有本机库时用服务器摘要的分项数也得到同样的分组；默认维度取已填写人数最多的一项（平手按 行业、地区、认识场合）；保存的选择按服务器 + 账号分开。orbits `tests/domain/network-analysis-model.test.ts` 新增 1 条：只有国家的人按国家分组，城市优先 |
| 02 切换并记住；点击进入人脉分析；断网可显示 | 通过 | `tests/offline-pages-home.test.tsx` 新增 4 条（浏览器里真点）：断网打开首页，人脉卡显示「科技与互联网 50% / 金融与投资 17% / 未填写 33%」，默认选中「行业」，而且没有任何 `/api/contacts` 请求；点「地区」后显示「东京 17% / 未填写 83%」，本机键 `orbit:home-network-dimension:v1:<服务器>:<账号>` 存为 `region`，刷新后仍是「地区」。点分布 → 导航到 `/contacts/dashboard`。只有 2 人时显示「再加几位，就能看到人脉分布」，没有比例条。小尺寸只显示比例条和第一名，没有切换 |
| 03 phoneweb 截图 | 通过 | 见第 6 节 |
| 04 全量与类型检查无新增失败 | 通过 | 见第 5 节 |

先写测试：纯函数 7 条在原代码上失败（文件不存在）；组件 4 条在原代码上都失败（等不到分布文字）；orbits 那 1 条失败（`analysisBucketKey` 不存在）。

## 3. 改了哪些文件
| 文件 | 改动 |
|---|---|
| `repos/orbits/shared/compute/network-analysis-model.ts`（:40、:129、:139）及 App 副本 `src/api/compute/network-analysis-model.ts` | 行增加可选 `countryCode`；地区分组在城市、地址文字都没有时用国家代码；导出分组规则 `analysisBucketKey`（就是原来的 `bucketKey`）。副本是手动拷贝的同一文件（没跑 `sync:contract`，避免把别的未同步文件一起拷过来） |
| `repos/orbits/features/network-analysis/analysis-reader.ts`、`src/view-models/network-analysis-local.ts` | 服务器和手机两边都把 `region.countryCode` 放进分析行，两边结果仍然一致（`tests/lf3-network-analysis-local.test.ts` 的服务器投影同步加了这一项） |
| `src/screens/network-analysis/analysis-labels.ts`（:50–63） | 新增 `regionName`：两位国家代码用系统自带的国家名（中国 / China / 中国），系统不支持时显示代码 |
| `src/screens/home/home-network-distribution.ts`（新） | 首页卡的分组：用 `analysisBucketKey` 计数，取前 3 名 + 其他 + 未填写；默认维度；本机保存键与读写 |
| `src/screens/home/HomeWidgetCards.tsx`（:208–280、:368、:385–387） | 人脉卡改为：总数 + 本月新增；中尺寸有「行业 / 地区 / 认识场合」切换、比例条、图例（名称 + 百分比）；小尺寸只有比例条和第一名，本月新增单独一行；少于 3 人显示提示；0 人仍是原来的空状态和「扫名片」按钮；点比例条或图例进入人脉分析。数据来自本机联系人副本；浏览器没有本机库时用 `/api/contacts/summary` 的分项数。去掉了最近 4 人头像和 `/api/contacts/page` 的读 |
| `src/i18n/{zh,en,ja}/home.ts` | 新增 8 个文案；小组件说明改为「人脉数量和分布」 |
| `src/data/account-local-caches.ts` | 退出登录 / 删除账号时一并删掉这个选择 |
| `src/data/offline-read/route-domain-inventory.ts`、`scripts/page-offline-inventory.ts`、`docs/offline/page-inventory.md` | 去掉首页卡对 `/api/contacts/page` 的登记；首页的说明改为分布（文档用脚本重新生成） |

## 4. 判断
- **「未填写」单独显示，人脉分析页仍合并在「其他」里。** 分析页的分组规则不变（它把没填的人和第 4 名以后合在一起），所以同一份数据，首页显示「其他 38% · 未填写 14%」，点进去分析页显示「其他 52%」。没有为首页另写一套分组，只在显示时把 `none` 拆出来。
- **认识场合里的「其他」不当成「未填写」**：服务器把不知道的认识场合也记成 `other`，分辨不出「没填」和「填了别的」，所以显示「其他」，灰色，放最后；但算「已填写比例」时不算它，否则认识场合永远 100%，默认永远是它。
- **地区缺城市时用国家**（协调者决定）放进了共用规则，所以人脉分析页也跟着变了：只有国家的人不再算「其他」，而是「中国」「日本」这样的分组；手机和服务器结果一致。网页版的分析页标签没改，会显示国家代码（如 `CN`）。
- **颜色**用分析页同一组分类色（`plum700`、`macBlueInk`、`macTealInk`），「其他」用 `ink3`，「未填写」用 `ink4`；深浅色都是现有 token。
- **日语「认识场合」用「出会い」**：原来的「出会った場所」放在三等分的切换里，网页上被截成「出会った…」。原生上会自动缩小字号，但为了不截断改用更短的「出会い」。分析页仍是「出会った場所」。
- **小尺寸的本月新增**改成短文案「本月 +21 / +21 this month / 今月 +21」并单独一行，原来跟在数字后面会被截断。
- **切换的位置**：放在数字下面、比例条上面的整行，而不是卡片右上角（卡片标题是首页统一画的，右上角没有位置；放在数字那一行英文、日文会挤）。
- 中尺寸的图例是两列，英文、日文的长行业名会被截短，但百分比总是完整显示；完整名称在人脉分析页。

## 5. 命令与结果
在 `repos/orbit-app`：
- `npx tsc --noEmit`：0 错误。orbits `npx tsc --noEmit`：0 错误。
- 定向：`home-network-distribution` 7 条、`offline-pages-home` 中 0148 的 4 条、`lf3-network-analysis-local`、`compute-sync`、`network-analysis-screen`、`page-offline-inventory`、`offline-read-inventory` 全过。
- orbits（`LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8`）：`network-analysis-model`、`network-analysis-fixtures`、`network-analysis-routes`、`structure-tab-model`、`network-no-contact-needs`、`contact-insights-read-paths` 共 30 条全过。
- 全量 `npm test`（第一次）：3436 条，3430 通过，4 失败，2 跳过。3 条已知（`api-schema-sync`、`contract-sync`、`route-parity`），第 4 条是我去掉 `/api/contacts/page` 后离线读登记表还留着这一项（`offline-read-inventory`），已改登记表并重新生成页面清单文档。
- 全量 `npm test`（修正后）：**3436 条，3431 通过，3 失败（只有已知的 3 条），2 跳过**。

## 6. 运行时检查（phoneweb）
- 服务器：本 worktree 的 orbits，`next dev` 在 8092，连本机新建的空库 `orbit_0148_runtime`（`db:migrate:live`、`db:migrate:sync-revision`、`scripts/migrate-web-runtime.ts`），`ORBIT_MODULE_MODE=live`，没有 AI key。
- 数据：经 HTTP 注册 `qa0148@example.test`。用手动添加 API（`POST /api/contacts/manual`，带 `primaryIndustryId` 和认识场合）建 13 人，其中 3 人没填行业；地区没有编辑 API，用联系人导入 API（`POST /api/contacts/import` 上传 CSV，带 Location / Country 列，再 commit）建 8 人。导入时服务器按规则只存了国家代码（城市为空），东京、大阪、上海、新加坡来自地址文字，王 磊只有国家 CN。共 21 人。
- App：`expo export --platform web`，`scripts/phoneweb-server.cjs` 在 8091，上游 8092。Chromium 390×844，2 倍图，经登录页登录。
- 结果：行业「科技与互联网 24% · 金融与投资 14% · 制造与供应链 10% · 其他 38% · 未填写 14%」；地区「东京 14% · 大阪 10% · 中国 5% · 其他 10% · 未填写 62%」（「中国」就是只有国家的那个人）；认识场合「介绍 19% · 其他 81%」（手动添加 API 选「活动」必须带活动 id，这次没建活动，所以没有活动类）。默认选中「行业」（填写最多）。把所有 `/api/**` 请求断掉再刷新，卡片照常显示分布，带「以前的信息 · 联网后保存」。点分布进入 `/contacts/dashboard`。全程没有页面报错。
- 截图（本目录）：
  - 中尺寸：`0148-zh-light-medium.png`、`0148-zh-dark-medium.png`、`0148-en-light-medium.png`、`0148-en-dark-medium.png`、`0148-ja-light-medium.png`、`0148-ja-dark-medium.png`
  - 小尺寸：`0148-zh-light-small.png`、`0148-en-dark-small.png`、`0148-ja-light-small.png`
  - 切换：`0148-zh-light-region.png`（地区）、`0148-ja-dark-met.png`（出会い）
  - 断网：`0148-zh-light-offline.png`；点击后的人脉分析：`0148-zh-light-tap-analysis.png`
- 看截图后改过的问题：小尺寸「+21 本月…」被截断 → 单独一行短文案；图例长名称把百分比截掉 → 名称和百分比分开，只截名称；日语切换「出会った…」被截断 → 「出会い」。
- 收尾：8091、8092 已停；3000 没碰。`orbit_0148_runtime` 已删除。`repos/orbit-app/dist` 是导出产物（git 忽略）。

## 7. 提交
- `2af9717a3` feat(network-analysis): a region without a city counts by its country
- `945440256` feat(app): the home network card shows how the network spreads
- 本报告和截图单独一个 docs 提交。

## 8. 未决
1. 没在真机上看，只有 phoneweb。原生上切换文字会自动缩小，图例截断位置也可能和网页不同。
2. iOS 桌面小组件（WidgetKit，`src/widgets/read-home-sources.ts`）仍读总数和最近 4 人，这次没改。
3. 网页版人脉分析页对「只有国家」的分组显示国家代码（如 `CN`），没改网页文案。
4. 认识场合没有截到「活动」一类（需要先有活动才能用手动添加 API 选活动）。
