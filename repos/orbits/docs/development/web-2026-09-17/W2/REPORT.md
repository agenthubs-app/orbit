# W2 人脉与双面名片实施验证记录

状态：实施、独立运行验证、完整图谱检查完成；本记录随实现提交。基线 `161e9e6c4d1f314db90365a4d840718adfa12c70`。未部署。

## 范围与决定

W2-A 消费已有双面名片契约：上传前显式配对、稳定请求幂等键、按卡复核、按字段选择正反面来源、整卡版本/digest 快照、确认回执校验与卡数统计。没有改共享 DTO、服务、存储、OCR、auth 或 App 源码。

复核图片采用响应式网格，窄屏自动换行；公司、职位、邮箱和电话使用多行编辑区域。

W2-B 根据可复现的详情裁切修复局部 CSS。公司/职位、邮箱、电话可完整换行；768px 窄字段网格也调整标签列。列表摘要维持现状。

用户已明确“先保留邀请绑定，自动发现功能记录在档案作为后续开发的方向”。本轮保持既有邀请接受绑定和服务端 canSend，不实现 email/phone 自动发现；延期设计与能力证据见 PLAN §5，此项不作为当前阻塞。

用户明确接受私有名片图片局部例外：图片同源带会话获取；在浏览器生成 LQIP 与真实宽度 variants；contain 固定比例框、decode 后 220ms 渐变、reduced-motion、请求中止与 URL 回收。不上传衍生图、不提供公开 URL。首次客户端 loading 不是 SSR LQIP，也不宣称减少首次图片网络传输。

## 隔离环境与验证边界

- 独立工作树 `/Users/li/.codex/worktrees/5c7b/orbit`，Web 根 `repos/orbits`。
- 独立开发地址 `http://w2.localhost:4612`；`AUTH_URL` 同地址，合成 QA 会话、本树 `.next`。未清理或使用其他任务浏览器会话；最终 QA 后核对 PID/cwd 并停止本任务开发服务。
- 独立本地数据库 `orbit_web_w2_20260917`，API/repository 测试自建随机 schema，执行后 schema 残留为 0。
- 命令采用 `env -i PATH="$PATH" SHARP_IGNORE_GLOBAL_LIBVIPS=1`；不加载 Production 环境；未调用真实 OCR/付费模型、未部署。
- 产品页面 QA 运行真实 Next 路由与组件，业务 API 使用合成请求拦截；它验证 UI 与请求协议，不等同真实联系人落库。真实 API/repository 另由本地 PostgreSQL 回归覆盖。
- 详情长值 QA 运行真实 mock route → adapter → 详情组件，附真实主题及 reference CSS，Chromium 测量 320/375/768/1280px；是渲染组件 fixture，不能写成线上数据验证。

## 已执行独立验证

| 验证 | 命令或证据 | 结果及边界 |
| --- | --- | --- |
| 既有双面 schema | `node --import tsx --test tests/api-schema/business-card-two-sided-contract.test.ts` | 3/3，合同基线 |
| 本地 API/repository | `ORBIT_EVENT_DATABASE_URL=postgresql://li@127.0.0.1:5432/orbit_web_w2_20260917 node --import tsx --test tests/api/business-card-ingest-v2-routes.test.ts tests/capabilities/business-card-ingest-v2-repository.test.ts` | 28/28，0 skip；包括原子确认、并发幂等、排除/跳过/清理；注入合成 actor/extraction，无真实 OCR |
| 长值 Chromium 回归 | `node --import tsx --test tests/pages/app-contact-detail-long-values.test.tsx` | 通过；四种宽度完整值、所有可见字段无横向溢出 |
| 独立长值 fixture | `/tmp/orbit-w2-long-values-fixed.mjs` | 四种宽度 `problems:[]`，页面宽度等于 viewport；修复前公司/邮箱/电话 scrollWidth 超出容器 |
| 配对产品路由 | `/tmp/orbit-w2-start-qa.mjs` | 两照片明确配成一张卡；创建 503 后重试 key/manifest 完全一致，375px 无横滚 |
| 审阅产品路由 | `/tmp/orbit-w2-review-qa.mjs` | 未解字段冲突不提交；back 公司与手工 email 来源正确；双面版本/digest 齐全；503 重试同 intent/payload |
| 审阅失败与兼容 | `/tmp/orbit-w2-review-failures.mjs` | duplicate_review 仅再次明确操作才 allowDuplicate=true；409 回读保留手工值/标旧来源失效；不完整回执回读且不前进；旧单面 item 回执计一张卡。网络 abort 已修复，最终无 pageerror 且出现日文保稿/重试提示；版本变化后图片 blob 同步更新；completed 双面只计一张卡 |
| 私有图片真实组件 | `/tmp/orbit-w2-private-image-qa.mjs` | contain、真实 srcset、reduced-motion、410/401、源切换和卸载；晚到 bitmap/toBlob/decode 不覆盖新图；26 临时 URL 全部回收。仓内挂载测试也通过；源码断言与真实 Chromium 生命周期证据分别记录，不混淆 |

最终目标组 `node --import tsx --test tests/pages/app-business-card-ingest-v2-view.test.tsx tests/pages/app-business-card-ingest-v2-pairing.test.tsx tests/pages/ingest-v2-route-view-model.test.ts tests/pages/ingest-v2-private-image.test.tsx tests/pages/app-contact-detail-long-values.test.tsx tests/pages/app-contact-detail-localized-source-labels.test.tsx tests/api-schema/business-card-two-sided-contract.test.ts`：48/48，通过，0 skip。日志 `/tmp/orbit-w2-target-tests-commitable.log`。

完整 `npm run typecheck` 通过（exit 0，最后代码修改后），日志 `/tmp/orbit-w2-typecheck-commitable.log`。

额外真实产品路由验证：四份相同 digest 文件跨两次上传 wave 全部成功，顶部照片/卡片就绪均 4/4；320px 配对页无横滚。源码审阅修正了上传中解冻配对和逐槽键盘入口。最终 Chromium 重新验证 Enter/Space 逐槽选择、上传中禁止解冻、失败后可调整，以及创建后的 `?lang=ja` 保留。Start 预览明确为 52px；复核图片实测并随 ResizeObserver 更新 `sizes`，320/375/768/1280px 分别为 278/160.5/357/483px，均不超出 figure。该检查在同一页面连续调整宽度执行，没有依赖重新挂载。

临时脚本、日志和截图均位于 `/tmp`，不作为产品文件提交。早期基线与中间测试结果不替代上述最终检查。

## 图谱检查与已知工具限制

仓库/工作树均绑定 `/Users/li/.codex/worktrees/5c7b/orbit`，注册名 `orbit-web-w2-20260917`，索引基线 HEAD 为 `161e9e6c4d1f314db90365a4d840718adfa12c70`（相对 HEAD 0 commits behind），索引包含本批未提交文件。最终执行 `analyze --force --index-only --name orbit-web-w2-20260917 --workers 3` 完整重建，108864 nodes / 245187 edges / 2065 clusters / 792 flows。

CLI formatter 固定只显示 15 个符号，`--limit 5000` 仍不展开完整列表；因此用同一已安装版本的 `LocalBackend.callTool("detect_changes", {scope:"all", repo:绝对工作树路径})` 保存原始结构化结果，没有修改工具实现。最终 14 文件、434 符号、434 条完整列表、6 流程、risk=high；error/partial/truncated 均无。逐项比对 changed_symbols.filePath 与 Git 的 14 个改动文件完全一致，包括新增 docs/tests。证据 `/tmp/orbit-w2-detect-rebuilt-full.json` 与 `/tmp/orbit-w2-detect-rebuilt-summary.json`。

早期增量索引存在空 id/name 的 Function 节点，PrivateImage upstream 扩散到无关模块，曾返回 CRITICAL/partial；调高工具公开环境配置 `IMPACT_MAX_CHUNKS=100` 可解除 enrichment 默认 1000 项限制，但异常节点仍存在，且 detect 映射缺少 4 文件，未据此通过检查。完整重建后重新运行同一精确 UID/depth=3/limit=5000：PrivateImage 的 5 个上游节点全部列出，无 partial/truncated，原始 risk=HIGH。直接调用者正确回到 CardReviewPane 与 BusinessCardIngestV2Start，间接为 renderReview、StartPage、renderPhase，均在本批路由内。以 `/tmp/orbit-w2-private-impact-rebuilt.json` 为最终结果；不将早期增量输出当作最终证据，也不改写工具风险评级。

6 条 detect 流程均从 BusinessCardIngestV2Start 进入私图 helper；context 将 `createLocalVariants` 的浏览器 `bitmap.close()` 误连到三个同名测试 fixture 的 close，继而列出 UnexpectedNavigation/RuntimeDeadline/Resolve 等测试流程。源码仅调用浏览器 ImageBitmap.close，不导入这些测试辅助模块；实际私图生命周期由挂载测试和 Chromium 晚到任务/URL 回收验证。保留工具原始 high 结论。

全仓索引自身仍有流程发现采样上限（9553 候选入口未展开、8794 callee 被上限略过、62 次遍历达到预算，792 条已发现流程不是所有流程），13 个无关大文件被默认 512KB 上限跳过。不能宣称未列出的流程不存在。早期 Property FTS invalid UTF-8/关键词索引停用在最终 force 重建日志中未再报告；完整 detect 的输出检查与全仓覆盖限制分别记录。
## App 影响与尚未覆盖

API/schema 无变动，App 无源码改动；Web 开始发送已有 `cardId/side` 及确认元数据。跨端共享同一真实环境的写后读、实体手机相机、真实 OCR 质量和图片过期云清理未在本轮执行。邀请通信权限保持现状，自动发现明确延期。

编码由显式 Luna max 完成：w2_luna 负责 A 文件集，w2_long_values 负责 B 的组件与测试，w2_final_fixes 在前述编码者停止后串行完成最终局部修正（来源快照校验、逐槽布局、语言保留、实际图片 sizes）；没有并行写同一文件。Astra 独立设计、diff review、运行验证与最终提交。

## 集成回归追加：批量选图审计适配

本追加批基于冻结提交 `482f337fa41398fa214aa7bd5131da94302462d6`，独立于 P1-14 待决设计。主协调明确批准原 Luna max 仅调整 `tests/audits/full-product-functional-audit.test.ts` 的 `hidden batch file inputs retain handler records and accessible picker triggers` 一个测试，Astra 更新本报告、独立验证并提交这两个文件。没有修改生产代码、audit generator、既有二维码文案断言、App 或共享协议；另行批准落盘的 P1-14 设计文档不混入此提交。

**原因与精确范围：** start 页旧断言仍要求一个无名称隐藏输入；新配对流程已有首次选择 `inputRef`（`readPhotos(files,false)`）与追加照片 `addInputRef`（`readPhotos(files,true)`）两个入口。它们位于 `app/(app)/app/contacts/new/batch2/business-card-ingest-v2-start.tsx:341–342`，均为 hidden、有 onchange 的 multiple file input。正反面槽位另有三个静态 JSX 输入节点（298、312、318；back 条件两支运行时二选一），带 label、role=button、Enter/Space、capture=environment；因继承 label 名称，不属于本断言的 visibleName=null 集合。不能把数字2解释成正反面数量。

start 的两个选择按钮（343–344）使用 `ingest-v2-copy.ts` 中真实 en/zh/ja 文案，inventory 如实分类为 `dynamic-static-expression`。review 页仍有两个无名称隐藏输入（`[id]/business-card-ingest-v2-view.tsx:530、541`，重挂/替换处理），其直接重挂按钮（712）使用内联三语文案，分类仍是 `present-static`。逐面替换按钮（958）通过 onReplace(item)→设置目标→replaceRef.click 间接触发；本条 `.click()` 静态筛选不覆盖整条间接运行链，不能将静态通过当作全部浏览器可访问性验证。

测试仅将 start 数量改为2，并在原 tuple 增加逐页面精确的 pickerNameEvidence：start=`dynamic-static-expression`、review=`present-static`。原有名称非空、隐藏分类、onchange、picker 非空检查均保留，没有全局放宽为任意名称类型。只改数量时，原 callback 仍会在名称证据断言失败；审阅候选同时修正两项后，两页面断言通过。Luna 应用的文件与审阅候选逐字一致。

**正式 RED / GREEN 与类型验证：** Web 根使用隔离环境 `env -i PATH="$PATH" SHARP_IGNORE_GLOBAL_LIBVIPS=1`，执行：

```sh
node --test --import tsx --test-name-pattern='^hidden batch file inputs retain handler records and accessible picker triggers$' tests/audits/full-product-functional-audit.test.ts
npm run typecheck
```

- RED 在改动前正式运行：1项、0 pass、1 fail，654行 `2 !== 1`；日志 `/tmp/orbit-w2-batch-audit-red.log`。
- GREEN 在补丁后运行相同正式命令：1项、1 pass、0 fail、0 skip；日志 `/tmp/orbit-w2-batch-audit-green.log`。
- 完整 `npm run typecheck` 通过，exit 0；日志 `/tmp/orbit-w2-batch-audit-typecheck.log`。`git diff --check` 通过。
- 这不是全 audit 文件通过。主协调已逐项归类旧基线失败：本文件12项，另 manifest 1项，基线组合167项/154 pass/13 fail。当前仅关闭本轮新增的一条断言不一致，不重跑整个组合或改期望掩盖旧失败。旧 `app-agent-contact-recommendations.test.tsx` 的二维码/关系背景文案差异仍按基线问题保留。

**提交前图谱及匿名回调边界：** 绑定本树 `orbit-web-w2-20260917`，索引 HEAD 482f337f，与修改前基线一致。精确 File UID upstream depth3/limit5000 返回 UNKNOWN、0解析调用；按实际测试标题/file 检索回调也返回 notfound/UNKNOWN，范围查询未找到该匿名回调的独立 Function 节点。已补查顶层 `test(...)` 注册、package.json 的 `test:audit-full-product`、`scripts/run-node-tests.mjs` 入口，以及实际生成 inventory/执行 callback 证据；没有把0解释为 unused/LOW，也不为凑图谱节点重构测试。

同版本 LocalBackend 原始 detect_changes 用于完整输出；该匿名回调的两处代码 hunk 起于647、663行，均位于测试块646–665行，已与 Git raw diff 逐行对照。加入报告后的完整输出为 changed_files=2、changed_count=2、affected_processes=[]、原始 risk_level=low，无 error/partial/truncated；2条完整列表等于2个映射计数。**映射的2条均为 REPORT Markdown Section，测试匿名回调没有映射条目**；仅测试改动时工具曾报告0符号。两文件计数完整不代表代码符号映射完整，不能将原始 low 当作已解析的业务影响证明。主已明确批准按实际匿名范围与源码补证的例外；保留原始 risk/计数，不伪造符号映射。证据包括 `/tmp/orbit-w2-batch-audit-file-impact.json`、`-callback-impact.json`、`-callback-nodes.json`、`-code-hunks.diff`；提交前 staged 范围最终完整原始输出以 `-detect-final-full.json` 保存。

相关合成 inventory 与三阶段 callback 对照保存在 `/tmp/orbit-w2-batch-input-inventory.json`、`-assertions.json`；它们没有恢复历史 runtime fixture、没有改 generator，也不替代上述正式 RED/GREEN。当前批准范围完成后冻结两文件增量供主协调验收；未部署。
