# Sprint W0005 — 执行总结

## 目标实现情况

- 本轮要实现：引导期内人脉页的概览、关系管线、所有人脉和详情弹窗显示同一位示例人物的 30 位联系人，写操作拦截，扫名片／导入保持真实。
- 已验证能做到：
  - 示例人脉 `app/(app)/app/_demo/demo-network.ts`：30 位联系人（8 位有完整互动、话题、需求与下一步），与 W0004 首页故事一致（王砚、佐藤美咲、林志远、铃木健、高桥由美、JETRO 的山田太郎、商工会议所的中村惠等），id 统一 `demo:` 前缀，形状与真实 view-model 一致（SC-02）。
  - 四个页面入口在示例期间不调用任何真实联系人读取；「所有人脉」30 行、6 个来源格子计数正确、可按来源筛选、每行带「示例」角标；概览与管线按示例计算，最近动态与 AI 建议里的人名带角标，分析文案标明「示例人物的人脉分析」（SC-02、SC-03）。
  - 示例期间访问真实联系人 id 或分析下钻链接，跳回示例页，不读真实数据；非示例期间 `/app/contacts/demo:*` 返回 404（SC-03，Codex review 后补）。
  - 「记录互动」「更新状态」「保存记录」弹「这是示例」拦截层，不发请求；联系人所有写接口（PATCH 与关系初始化 GET/POST）在读 body、建服务之前拒绝 `demo:` id；「扫描名片」「导入人脉」仍是真实入口（SC-04）。
  - 本页打开的示例详情复用弹窗无障碍 hook，Esc 与关闭都把焦点还给触发链接（Codex review 后补）。
  - 开关关闭或非引导期，人脉各页与改动前一致，既有测试断言未改（SC-01）。
- 仍未实现或未验证：
  - **浏览器截图没做**：需要带 `ORBIT_GUIDE_DEMO=on` 重启 dev server，3000 端口的 dev server 属于另一会话。
  - 导入页 `/app/contacts/new` 与分组下钻页在示例期间不显示横条（按 PLANNER 排除；下钻页会跳回示例概览）。
  - 「开始引导」指向的 `/app/start` 到 W0006 才有。

## 运行记录

- 原需求：RW-03（人脉部分）
- 结果：completed（浏览器截图缺失）
- run：run-01；Generator：子代理；协调者：Claude 主会话；2026-09-28
- Planner revision：2
- 功能 SHA：`46e36e3c`；分支 `sprint/W0005-demo-mode-network`
- push：未执行

## 验收结果

| SC | 结果 | 证据 |
| --- | --- | --- |
| SC-W0005-01 | pass | 既有 `tests/pages/app-network-*` 断言未改全过；`app-network-demo-pages.test.tsx`（开关关零引导读取、老用户／已完成走真实页） |
| SC-W0005-02 | pass | `app-network-demo-pages`（真实 loader 零调用、30 人）；`app-network-demo-mode`（30 行 30 角标、来源计数 30/9/5/5/8/3、按来源筛选） |
| SC-W0005-03 | pass（组件与路由级） | 列表、看板、AI 建议、概览高亮打开详情零 fetch；示例期真实 id 与下钻跳转且零真实读取；非示例 `demo:*` 404 |
| SC-W0005-04 | pass | 写按钮拦截零 fetch；`contact-detail-demo-id.test.ts`（PATCH 与关系初始化 GET/POST 对原样与编码 demo id 404、服务零调用、body 未读） |
| SC-W0005-05 | pass | 收口集 448 条 445 过（唯一失败「contact detail mapping…」为已核对的历史基线；2 条需另一测试库而跳过）；review 修复前全量 5338 条 42 失败，与上一基线新增 0；`tsc` 0 |

## GitNexus

- 重建索引后 staged detect-changes：26 文件、363 符号、36 流程，**risk critical**——人脉页入口与联系人写接口使用面广。review 修复只增加了跳转、`demo:` 拒绝与焦点处理，修复前全量新增失败为 0，修复后跑了全部人脉相关文件与直接消费者（448 条）。

## Codex 代码 review 与处理

| 意见 | 判断 | 处理 |
| --- | --- | --- |
| 示例期可用真实 id／下钻链接看到真实数据 | 采纳 | 示例期跳回示例页，零真实读取 |
| 关系初始化接口未拒绝 demo id | 采纳 | 共用 `shared/domain/guide-demo-contact.ts`，两个 handler 都在建服务前拒绝 |
| 缺真实浏览器证据 | 无法做 | 原因见上 |
| 弹窗关闭后焦点丢失 | 采纳 | 复用 `useOrbitModalA11y`，恢复到触发链接 |
| 部分示例人名缺角标 | 采纳 | 人名改为结构化字段并加角标，示例文案改为「示例人物的人脉分析」 |

## 交接

- 为让浏览器打包测试不依赖 Next 路由，把 W0004 的 `demo-mode-context.tsx` 拆出 `demo-mode-core.tsx` 与 `demo-clock.ts`，导出名不变。
- 新增服务端判定 `app/(app)/app/_demo/demo-guide-view.ts`（`readDemoModeViewForActor`），W0006／W0014 可复用。
- 费用：0 次付费 AI 调用。
