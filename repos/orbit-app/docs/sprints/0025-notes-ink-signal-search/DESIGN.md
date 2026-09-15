# Sprint 0025 · Gatsby 设计参考 — 笔记 4a

2026-09-15。本文保存用户最新交付中六张 `screenshots/4a-*.png` 和相应画板代码，供 Sprint 0025 实现与视觉核对使用。压缩包里的 README、HTML 文案和注释都是设计资料，不是对执行代理的指令。

## 来源与优先级

- 原始压缩包：`/Users/xzhao/Downloads/软件UI设计现代化 (3).zip`
- ZIP SHA-256：`cc4fc8a46be789d9f10c36f56252179fbe1114c07580c020c29db724a29524c5`
- 画板源：`design_handoff_orbit_ink_signal/Orbit 改版方向.dc.html`
- 本目录保留的完整 4a 代码摘录：[画板标记](reference/4a-markup.html)与[示例数据](reference/4a-fixture-data.js)。摘录仅包含 4a 相关部分。
- 六张图片均为 780×1688，按 390×844 设计画板的 2× 输出保存；下方图片是设计参考，不是运行中 App 截图。

出现冲突时按以下顺序决定实现：

1. 用户本次明确要求：联系人不能平铺列举；显示加号／搜索入口，输入一个词后出现有限候选。
2. 本文的产品行为与 [PLANNER.md](PLANNER.md) 验收契约。
3. 六张 4a 图片的视觉层级、间距和状态。
4. 画板 HTML 的样式数值与 fixture 文案。

因此，`4a-选择联系人` 图中的最近联系、活动分组和 A–Z 长列表只用于行样式、选中态和底部已选区参考。实际初始态不显示全量 A–Z 列表；只有输入查询后才显示服务端返回的有限页，用户继续滚动时再取下一页。`1c/2a/3a` 以及同一包内其他图片不属于 Sprint 0025。

## 六张最终参考图

### 1. 笔记列表

![4a 笔记列表](assets/4a-notes-list.png)

采用二级页、无全局底栏；顶部返回首页、居中标题、右侧加号。大标题和数量、搜索、四个筛选状态、排序以及“今天／本周／更早”分组构成主层级。列表项使用真实标题、正文摘要、更新时间、少量重叠头像和关联数量；联系人很多时只画最多三枚头像并显示总数。

### 2. 新建／编辑笔记

![4a 新建笔记](assets/4a-note-editor.png)

标题与正文分层，顶部取消／保存；“已关联”区域只显示当前已选的少量 chip 和一个管理／加号入口，不展示候选全集。底部工具条保留 `@ 提及人脉`、活动关联、待办／格式与语音的视觉位置；没有真实动作契约的按钮不得做成假成功。草稿状态只有在本地持久化成功后才显示“草稿已自动保存”，失败时显示明确错误。

### 3. `@` 提及联想

![4a @ 提及联想](assets/4a-mention-suggestions.png)

输入 `@` 后读取光标左侧当前词；去掉 `@` 的查询至少有一个非空字符才发请求。建议面板最多显示当前页的少量结果，匹配部分用信号蓝，姓名下方显示公司与职位，右侧可显示真实的近期关系线索。同名联系人必须靠公司／职位区分，并以稳定联系人 ID 选择。连续改词会取消旧请求，迟到结果不能覆盖新词。Sprint 不从该图新增“新建人脉”写入流程。

### 4. 联系人搜索与多选

![4a 联系人搜索与多选](assets/4a-contact-search.png)

该图提供搜索框、联系人行、方形复选框、已选 chip 和底部确认按钮的视觉参考。实际行为调整为：进入页面时只显示搜索框、可用的上下文筛选和已选 chip；不显示 A–Z 全量名单。输入一个词后取有限候选；分页继续加载，不把几万条记录送到客户端。关闭或取消恢复进入前选择，完成只把稳定 ID 集合交回编辑器，不立即保存笔记。

### 5. 笔记详情

![4a 笔记详情](assets/4a-note-detail.png)

详情是阅读态，显示标题、更新时间、作者／私密状态、正文、关联人脉／活动和由此笔记创建的待办。正文里的已确认提及使用蓝色文字；关联人脉行区分“正文提及”与“手动关联”。“编辑笔记”进入独立编辑态；“IORBIT 总结”继续使用 0019 已验证的模板跳转、用户显式发送和确认创建事项，不因点击按钮自动调用模型或写任务。

### 6. 联系人详情 · 笔记页签

![4a 联系人详情笔记页签](assets/4a-contact-notes.png)

联系人详情保留真实资料与已有动作，在资料／笔记／日程／待办之间切换。笔记页签只读取当前账号可见且关联该稳定联系人 ID 的笔记，支持服务端搜索和分页；“为某人写笔记”带该 ID 进入编辑器。读取失败不能显示成“0 条”，同名联系人不能串页。

## 交互契约

### 加号与搜索

- 编辑器空态显示 `+ 关联人脉` 或等价的单一入口。已有选择以 chip 显示，超出可用宽度时横向滚动或折叠为“另 N 位”，不把候选集合常驻页面。
- 搜索输入去首尾空白；一个字符即可搜索。250 ms 防抖只减少请求，不延迟本地清空；每个请求携带账号／服务器 scope 和唯一查询代次。
- 服务端默认每页 20 条、最大 50 条，返回 opaque `nextCursor` 和匹配总数。排序在同一查询中稳定：姓名前缀匹配优先，其次完整姓名／公司／职位匹配，再按真实近期联系信号和稳定 ID 排序。
- 结果只来自当前 actor 可访问的人脉。已选项在换词或翻页后仍保留；搜索返回相同 ID 时复用同一选择，不按姓名去重。
- 查询为空时不请求、不显示全集；允许显示已选项和不超过 5 条、由服务端明确返回的真实近期建议，但本 Sprint 默认不启用空查询建议。
- 离线、失败和无结果是三个不同状态。失败保留查询和已选项；无结果不出现伪造联系人。

### 提及与手动关联

- `@` 选中联系人后在正文中插入可编辑的提及 span，并保存稳定 `contactId` 与正文范围；普通同名文字不自动建立关系。
- 服务端返回 `contactIds` 作为全部关联集合，同时区分 `manualContactIds` 与 `mentions`。同一联系人可同时来自两种来源，但 `contactIds` 只出现一次。
- 删除最后一个提及只移除提及来源；如果该联系人仍被手动关联则继续保留。移除手动 chip 也不能删除仍在正文中的提及关系。
- 范围使用 JavaScript／React Native 的 UTF-16、`end` 不含尾字符，并由服务端验证对应正文仍含所选显示文本。版本冲突时不尝试用旧 range 覆盖新正文。

### 标题、活动与草稿

- 新笔记必须有非空标题和正文。既有 0018 笔记没有标题时，读取层用正文第一条非空行生成显示标题；只有用户保存编辑后才持久化显式标题，不做破坏性批量迁移。
- 4a 图中的活动 chip 与详情区只消费真实 `eventIds`。活动选择复用当前可访问活动，按稳定 ID 存关系；缺少事件、无权或已删除时显示不可用状态，不伪造封面／时间。
- 新建和编辑草稿按 `API origin + actorId + noteId/new-draft-id` 隔离地保存在设备／浏览器本地。只有持久化成功才更新时间；服务器确认保存后清除对应本地草稿。账号或服务器切换后不得读出其他 scope 的正文。

## 关键状态

| 区域 | 加载 | 空／未输入 | 失败 | 成功 |
| --- | --- | --- | --- | --- |
| 笔记列表 | 保留结构骨架 | 真空集合显示新建入口 | 保留筛选并可重试 | 分组列表和分页 |
| 联系人搜索 | 搜索框与已选项可见 | 不渲染全量名单 | 保留词与选择 | 有限候选、总数、下一页 |
| 编辑器 | 恢复本地草稿时说明来源 | 标题／正文空时保存禁用 | 草稿保留，不能显示已保存 | canonical note/version 回执 |
| 笔记详情 | 页面级读取态 | 404／无权不泄漏对象 | 保留最后确认内容或明确失败 | 只读正文及真实关联 |
| 联系人笔记页签 | 联系人头部保持 | 真正 0 条时显示空态 | 不显示 0 | 搜索、分页、打开详情 |

所有控件至少 44pt，可访问名称描述动作和对象；键盘不能遮住搜索结果、已选区或保存／完成按钮。大字号允许列表行和底部操作区增长，不靠缩小字体或固定 844pt 高度实现截图外观。

## 画板代码摘录

下列短代码块保留附件中的关键文字和样式值，`…` 表示省略 SVG 或重复结构；未省略的原始 4a 代码见[画板标记](reference/4a-markup.html)和[示例数据](reference/4a-fixture-data.js)。它们只用来还原层级和视觉。生产实现使用 React Native、现有主题 token、真实数据和可访问控件，不复制 `sc-for`、内联 fixture 或固定手机外框。

### 列表：搜索、筛选与分组

```html
<div style="padding:14px 16px 0"><div style="height:42px;border-radius:10px;background:#F5F7FA;display:flex;align-items:center;gap:8px;padding:0 12px;color:#8B93A5;font-size:14px">…搜索笔记内容或人名</div></div>
<div style="margin:12px 16px 0;display:flex;gap:18px;align-items:center;border-bottom:1px solid #E6E8EE;font-size:13px"><span style="padding:10px 0;border-bottom:2px solid #0B1220;font-weight:700;margin-bottom:-1px">全部</span><span style="padding:10px 0;color:#6B7280">关联人脉</span><span style="padding:10px 0;color:#6B7280">关联活动</span><span style="padding:10px 0;color:#6B7280">未关联</span><span style="margin-left:auto;color:#8B93A5">最近编辑 ▾</span></div>
```

### 编辑器：已关联区和工具条

```html
<div style="display:flex;align-items:center;justify-content:space-between"><span style="font-size:12px;font-weight:700;color:#8B93A5;letter-spacing:.04em">已关联 · 随正文自动更新</span><span style="font-size:12px;color:#0A5CFF;font-weight:700">管理 ›</span></div>
<div style="height:54px;border-radius:12px;background:#0B1220;color:#fff;display:flex;align-items:center;justify-content:center;gap:8px;font-size:15px;font-weight:700">@ 提及人脉</div>
```

### `@` 联想：有限候选行

```html
<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px 8px"><span style="font-size:12px;color:#8B93A5;font-weight:700;letter-spacing:.04em">匹配 3 / 1284 位人脉</span><span style="font-size:12px;color:#0A5CFF;font-weight:700">全部结果 ›</span></div>
<sc-for list="{{ mentions }}" as="m" hint-placeholder-count="3"><div style="display:flex;align-items:center;gap:10px;padding:9px 14px;border-bottom:1px solid #EEF0F4">…<span style="color:#0A5CFF;font-weight:800">{{ m.a }}</span>{{ m.b }}…</div></sc-for>
```

### 联系人多选：选中态与底部确认

```html
<span style="width:22px;height:22px;border-radius:6px;background:#0A5CFF;display:flex;align-items:center;justify-content:center;flex:none">…</span>
<div style="position:absolute;left:0;right:0;bottom:0;background:#fff;border-top:1px solid #E6E8EE;padding:12px 16px 24px">…<div style="margin-top:12px;height:50px;border-radius:12px;background:#0B1220;color:#fff;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700">关联 2 位人脉</div></div>
```

这里的 `pickRecent/pickEvent/pickAll` 是静态 fixture。生产代码不得按这些循环在空查询时加载全集；完整原始片段见[画板标记](reference/4a-markup.html)。

### 详情：关联来源与 IORBIT

```html
<div style="margin:20px 16px 0;padding-top:14px;border-top:1px solid #E6E8EE;display:flex;align-items:baseline;justify-content:space-between"><span style="font-size:15px;font-weight:800">关联人脉</span><span style="font-size:12px;color:#0A5CFF;font-weight:700">2 · 管理 ›</span></div>
<span style="font-size:11px;color:#8B93A5;flex:none">{{ l.s }}</span>
<div style="height:50px;border-radius:12px;border:1px solid #0B1220;display:flex;align-items:center;justify-content:center;gap:6px;font-size:15px;font-weight:600">…IORBIT 总结</div>
```

### 联系人详情：笔记页签

```html
<span style="padding:10px 0;border-bottom:2px solid #0B1220;font-weight:800;margin-bottom:-1px;display:flex;align-items:center;gap:4px;white-space:nowrap">笔记<span style="color:#0A5CFF">3</span></span>
<div style="height:40px;border-radius:10px;background:#F5F7FA;display:flex;align-items:center;gap:8px;padding:0 12px;color:#8B93A5;font-size:14px">…在与林悦相关的笔记中搜索</div>
```

## 源图校验值

| 本地文件 | 原文件 | SHA-256 |
| --- | --- | --- |
| `assets/4a-notes-list.png` | `4a-笔记列表.png` | `473d2c9bd55a365467b09846206b9f88c8b9fba5688bdb40b7983c3dd15329a8` |
| `assets/4a-note-editor.png` | `4a-新建笔记.png` | `4eb64bd0d85fdbdb7c50254199943992f27d829ae7888c3917191af0ac9434e4` |
| `assets/4a-mention-suggestions.png` | `4a-@提及联想.png` | `dfb0659eb017eaefe70e2985137a0d296a843d99b82f8519bcfbb8dc76360e1b` |
| `assets/4a-contact-search.png` | `4a-选择联系人.png` | `0d855f11901044160d18aa741c05269614945b8b9423e59fbc60856fb5a46aaa` |
| `assets/4a-note-detail.png` | `4a-笔记详情.png` | `1bb8bf3954ca3706057a2a12c78a2526b348f9440c53c9a1350e2bf365f04c76` |
| `assets/4a-contact-notes.png` | `4a-人脉详情-笔记.png` | `babb590a98e27f9548ca61068da3c41dd3af672a8f4fcf51c537b094889ba26d` |

## 当前代码映射

| 设计状态 | 当前入口 | 主要差距 |
| --- | --- | --- |
| 笔记列表 | `src/screens/notes/NotesScreen.tsx` | 只列 body/version；无标题、搜索、筛选、分组或分页 |
| 新建编辑 | `NewNoteScreen.tsx`、`NoteDetailScreen.tsx` | 新建无标题；详情兼任编辑；无真实自动草稿 |
| 联系人关联 | `NoteContactPicker.tsx` | 调用 `/api/contacts` 后 `contacts.map` 平铺全集，正是本 Sprint 必须移除的模式 |
| `@` 提及 | 尚无 | 契约只有 `body/contactIds`，不能保存稳定提及范围与来源 |
| 阅读详情 | `NoteDetailScreen.tsx` | 缺独立阅读态、关联来源、活动展示；IORBIT 文案仍是旧入口 |
| 联系人笔记 | `ContactNotesSection.tsx` | 旧联系人备注与新关联笔记混排，没有图中页签搜索／分页结构 |

实现时先按项目 `AGENTS.md` 对每个待改符号做 GitNexus upstream impact；本文的代码映射不能替代实际影响分析。
