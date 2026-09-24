# W2 人脉与名片：设计与批准记录

日期：2026-09-17。范围：主任务 P1-11～15；本包仅申请 Web 双面名片与长文本批次，不将设计完成标为需求完成。负责人 Astra high；获准具体文件后显式派发 Luna max，Astra 独立 review。

实施批准更新：主协调已批准 W2-A、W2-B（先复现再局部修复），并追加 `new/batch2/page.tsx` 与 `new/batch2/[id]/page.tsx` 的返回入口三语（只改标题，不改布局、批次 ID 编码或链接目的地）。工作树已于实施前保留本文并干净 fast-forward 到 `161e9e6c4d1f314db90365a4d840718adfa12c70`。用户明确选择“接受本批局部例外，保持图片私有”，主协调据此批准 `new/batch2/ingest-v2-private-image.tsx` 与 `tests/pages/ingest-v2-private-image.test.tsx`：同源授权读取、本地真实 LQIP/variants、contain、decode/crossfade、取消旧请求与 URL 回收；首次客户端 loading 不宣称 SSR LQIP，不外传图片。此例外只覆盖本批私有名片预览，且仅豁免 SSR LQIP：Start 52px 槽位明确传入 sizes；复核按实际容器宽度测量并响应尺寸变化。Luna max（w2_luna，显式模型/effort，fork none）承担编码，Astra 独立验证。

## 1. 实施前设计阶段的基线与证据边界

- 工作树：`/Users/li/.codex/worktrees/5c7b/orbit`，从干净 `d2180ba70bcea5f3c65d26a1b589e1020e9ba1a4` fast-forward 至 `29efb4c9d460b97ef526578d051e824592f52555`。
- 已读 SESSION-GUIDE、本树根与 Web AGENTS、Bridge status/handoffs；更新的图谱规则按 SESSION-GUIDE 执行。
- 图谱工具未暴露，使用 `/Users/li/work/orbit/.gitnexus/run.cjs` CLI。`list` 显示 `orbit-production-cutover` 索引提交为同一 `29efb4c9`；只读 `query/context` 导航该快照，随后读取本工作树源码。该索引所属树有 W0 未提交文件，不能代表其当前运行态，也不能给后续 W2 修改提供新版本证明。
- 查询过 business card ingest / contact identity invitation，context 确认 `BusinessCardIngestV2View` 被批次 page 调用、调用上传/刷新/替换与语言 hook。query 没有返回流程，不能解释为无影响。`OrbitRealContacts` 未命中，补源码查阅；`confirmItem` 歧义以文件路径与真实 `confirmCard` 实现核对。
- 设计阶段只新增本文，不改代码符号、不提交代码、不连接云 DB、不调用 OCR/付费模型、不启动 worker、不发布。不虚构 impact 或测试通过；编码前需在本树建立/绑定当前索引，逐符号 impact，HIGH/CRITICAL 先报、UNKNOWN 补查，提交前完整 detect-changes。

下列路径均相对 Web 根 `repos/orbits`。

## 2. 已存在能力与精确缺口

| 对象 | 基线事实与证据 | 处理 |
| --- | --- | --- |
| Web 手机相机 | `app/(app)/app/contacts/business-card-capture-workspace.tsx:649,698` 已有 `capture="environment"` | 不重做单面相机链路；批次入口只补明确的正/反面选图/拍摄槽 |
| 双面身份 | `features/acquisition/business-card-ingest-v2/contract.ts:79` manifest 已有 `cardId/side`；`repository.ts:522` 要求每卡一个 front、最多一个 back | Web start `business-card-ingest-v2-start.tsx:108` 未发送二者，现走真实 legacy 单面兼容 |
| 原子一次创建 | `app/api/contact-drafts/business-card/batches/v2/handlers.ts:624` 与 `repository.ts:1220` 已锁整卡、核对版本/digest、幂等创建并清理两面 | 不改 API、repository、writer；Web 消费现有确认契约 |
| Web 来源复核 | `new/batch2/[id]/business-card-ingest-v2-view.tsx:385,663,733` 按 item 选图、按 item 计数，提交仅 fields/allowDuplicate | 改成整卡 view model、逐面来源、整卡一次确认 |
| 三语 | `app/(app)/app/orbit-language-context.tsx:13,56` 已接受可选 ja，缺省才回退英语；不是 provider 只支持两种语言 | 首批文案补完整 en/zh/ja；全站覆盖由 W5 统筹，不新建语言系统 |
| 公司长值 | 列表 `orbit-real-contacts.tsx:347,669` 公司/职位合成行使用 nowrap/ellipsis；详情 `orbit-real-card-connection.tsx:482,528` 原值存在且未显式省略 | 源码证明列表截断，尚无浏览器证据证明详情无法完整查看；先用长值复现，再做局部修复 |
| 背景/简介 | `orbit-real-card-connection.tsx:162` 区分关系背景、公开 bio、intro；`contact-detail-view-model-adapter.ts:391` 已去掉与 bio 相同的 intro | 不能认定数据库重复，暂不做合并写入/清理 |
| 真实通信 | `features/relationship-communication/service.ts:394,458` 按目标邮箱接受邀请，按 confirmed binding 得出 canSend | 复用现有服务和拒权；不编辑收件箱、不自动绑定、不放开聊天 |
| 私有 Memo | 复用主任务既有保存/回读审计，本轮不另造实现 | 保留已有编辑器与隐私边界 |

## 3. 申请批次 W2-A：配对 → 来源复核 → 一次创建

### 3.1 配对与上传

1. 选择照片后先进入可编辑配对区，尚不创建服务端 batch。每张初始为独立单面卡，用户明确把照片放入另一张卡的反面槽；不按文件名、顺序或相似度猜配对。每卡正面必填、反面可选；支持改配对/移除和按槽补拍。批量单面路径仍一次选多图、一次提交。
2. 每个草稿卡生成稳定 `cardId`；每个槽明确 front/back。展示“卡数 / 照片数”，现有 100 限制继续按照片计算，沿用 MIME/10 MiB/摘要上传规则。
3. 用户确认配对后冻结 manifest 与创建请求 idempotencyKey。网络失败重发同一请求；用户改配对/换文件后形成新请求 key。避免同一个 key 对不同 manifest 触发冲突；双击只发一次。
4. 已创建 batch 的分组以服务端 `cardId/side` 为准；刷新继续按 digest 重挂文件。现有 manifest 没有“追加反面”接口，因此创建后不承诺增删配对，逐面替换复用现有 replace；需重新配对时明确取消未确认批次后重建，不扩展服务端契约。
5. 上传/识别进度按照片，复核/完成计数按卡。`repository.ts:742` 的 excludeItem 已按 card_id 排除整卡并清理两面；收集期按钮明确标“排除此卡（含两面）”，不让逐面按钮隐式丢掉整卡。

### 3.2 复核 view model 与草稿

- 在 route adapter 中从 DTO 按 `cardId` 分组，向 presenter 提供卡、正/反面图片与状态、字段候选、版本快照、可用动作；禁止 presenter 新增服务工厂/存储依赖。
- 一次显示一张卡：原设计考虑手机正/反面切换；最终采用同一响应式网格显示两面，窄至 320px 自动换行，保留各自状态与逐面操作。只有单面时不制造空反面。字段与动作保持可键盘访问，布局变化不丢表单。
- 姓名、公司、职位、邮箱、电话逐字段选择来源：候选标记“正面/反面”，手工修改标记“手工”。`fieldSources` 用 itemId；手工或空值用 null。同字段两面值不同时必须显式复核，不静默选一面覆盖另一面。保留 CJK 原文姓名优先与 phone/mobile 类型规则。
- 相同值或只有一个非空候选可预填且显示来源；其他联系方式仍可见。备注分别保留两面剩余识别内容和来源标签，不做语义去重、不覆盖用户手工备注；关系背景由用户编辑，不能从公开简介推断。
- 草稿按 cardId 维持，来源选择绑定 itemId/version/imageDigest。刷新、重 OCR 或重拍改变某面版本时，受影响来源失效并提示重新复核；手工字段保留。切下一卡才切换草稿，不让新卡继承旧字段。

### 3.3 请求、失败和回执

- 复用 `POST /api/contact-drafts/business-card/batches/v2/:id/items/:itemId/confirm`。字段之外发送 `confirmationIntentId`、整卡 `expectedCardItems: [{itemId, version, imageDigest}]`、`fieldSources`。数据类型与 schema 使用 `shared/contract/business-card-batch.ts:228`、`shared/api-schema/business-card-batch.ts:312`；不改共享契约。
- 两面均 extracted 才走 confirm。一面 terminal_failed 时提供“重试该面/替换该面/手工复核整卡/跳过整卡”；manual-entry 已允许 extracted + terminal_failed。未完成上传/识别时不能确认。
- 发现的边界：归一化失败可能没有 imageDigest；schema 要求 digest，repository 与存储 image_digest 精确相等。不可用 clientDigest 伪装；该情况先显示修复图片后再确认，若要支持无 digest 手工收录，单列后端批次申请与复现证据，不混入 W2-A。
- 网络重试保留相同确认意图及完全相同 payload；改字段/版本/allowDuplicate 后新建意图。409 保稿、刷新权威状态并让受影响来源重新选择；不得静默换 key 重建联系人。
- `duplicate_review` 保留字段，仅用户选择“仍然创建”才带 allowDuplicate=true。成功核对返回 items 属于当前卡、同一 contactId、全 confirmed 后前进；响应不完整先 GET 回读，不把 HTTP 200 当全部成功。
- 跳过与确认按整卡收口，重试/替换按单面；成功计数按 cardId/confirmedContactId 去重，旧 legacy 单面批次仍能打开和确认。

### 3.4 W2-A 精确写文件申请

| 文件 | 用途 |
| --- | --- |
| `app/(app)/app/contacts/new/batch2/business-card-ingest-v2-start.tsx` | 配对、逐槽相机/选图、冻结 manifest |
| `app/(app)/app/contacts/new/batch2/[id]/business-card-ingest-v2-view.tsx` | 整卡复核、逐面动作、回执和计数 |
| `app/(app)/app/contacts/new/batch2/ingest-v2-client.ts` | 仅消费已有确认请求/响应与失败类型；不改变 transport/provider |
| `app/(app)/app/contacts/new/batch2/ingest-v2-route-view-model.ts`（新增） | DTO→卡、候选、快照与 UI 草稿映射 |
| `app/(app)/app/contacts/new/batch2/ingest-v2-copy.ts`（新增） | 此流程完整 en/zh/ja 文案，复用当前 t |
| `tests/pages/app-business-card-ingest-v2-view.test.tsx` | 更新既有复核行为回归 |
| `tests/pages/app-business-card-ingest-v2-pairing.test.tsx`（新增） | 显式配对与 manifest 请求验证 |
| `tests/pages/ingest-v2-route-view-model.test.ts`（新增） | 分组、来源失效、确认 payload 和回执 |
| `docs/development/web-2026-09-17/W2/PLAN.md`、`REPORT.md`（后者新增） | 审阅决定与真实验证记录 |

上述文件获准后同一 Luna 串行实施，避免 start 新 manifest 已启用但 review 尚不发送确认元数据的中间版本集成。不改既有后端或 App。若现有 UI 测试依赖需要同步其他文件，先发精确追加清单。

## 4. 申请批次 W2-B：长值完整阅读

- 先以合成值复现：200 字公司名、长日文/英文职位、无空格邮箱、320/375/768/1280 px，检查列表→详情链路与批次复核。
- 最小方案：详情公司与职位分行并可完整换行，联系字段 `overflow-wrap:anywhere`；需要紧凑展示时使用可聚焦“查看完整内容”展开，不能仅依赖 hover/title。复核公司/职位提供完整多行编辑/阅读，不截断保存值。
- 列表允许摘要截断，但点击详情必须能看到完整原值；不扩展全局 CSS、不改存储长度、不得擅自裁剪内容。若当前详情已通过，保持其布局，只修复确实失败的位置。
- 申请写：`app/(app)/app/contacts/orbit-real-card-connection.tsx`、`tests/pages/app-contact-detail-long-values.test.tsx`（新增）。列表 `orbit-real-contacts.tsx` 暂不申请；只有证明详情入口不可达等真实问题后再追加。名片复核长值包含在 W2-A view 中。

## 5. P1-13：自动发现延期档案；保留邀请绑定

**最终范围决定（用户明确延期）：**用户已选择“先保留邀请绑定，自动发现功能记录在档案作为后续开发的方向”。本轮不实现 email/phone 自动发现、标识验证、可发现偏好或电话挑战；以下设计和能力核对作为后续档案，既有邀请接受绑定与服务端 canSend 鉴权保持。本项是已确定的后续方向，不是 W2-A/B 当前阻塞，也不再询问相同决定。

| 层 | 建议语义 | 约束与负责方 |
| --- | --- | --- |
| 发现候选 | 用户自己的 contact email OR phone 与允许被发现的账号已验证标识相交，产生候选状态 | 不是身份确认；同一邮箱/电话多人、共享公司电话、两个标识各匹配不同账号均为歧义。电话需明确国家区号，不能只删符号后匹配；W0 提供账号能力，W5 决定共享 DTO |
| 本人同意绑定 | 用户主动发出既有邀请，对方接受后形成权威 binding | 现有接受校验目标邮箱；phone-only 匹配缺邀请/身份挑战协议，不能套邮箱接口伪造成功。候选命中本身不写 binding |
| 可通信 | 只读既有 eligibility.canSend、conversationId、qualificationVersion；发消息再次由服务端授权 | pending/revoked/expired 不开放聊天；发现层不得改变 canSend；不复制消息服务或更改收件箱 |

后续重启自动发现开发时再确认的取舍：允许谁被发现、候选展示的最小资料、phone-only 邀请路径，以及歧义时用户操作。建议新发现结果独立于现有 eligibility.status，避免“unregistered”同时承担“没绑定”与“没账号”的不同含义。现有 getEligibility 在无邀请/绑定时返回 unregistered，不能据此证明账号不存在。

本轮不申请此层编码文件。后续共享能力预计涉及 `features/relationship-communication/service.ts`、`shared/contract/relationship-communication.ts` 和对应 schema（实际文件及能力需 W5/W0 先确认），不能直接加入 W2-A。不会读取真实账号目录来“证明匹配”。

P1-13 决策小提案（不随 W2-A 获准实施）：

| 需产品决定 | 建议最小选择 | 验收反例 |
| --- | --- | --- |
| 谁可被发现 | 仅对方明确允许且已验证的标识；只在当前用户已拥有的联系人上按需发现 | 输入任意陌生邮箱/号码不能获得注册与否、账号 ID 或完整资料；没有发现结果不能断言未注册 |
| 候选披露范围 | 只返回联系资格所需的最小提示，候选未确认不暴露完整账号档案；不做全目录搜索 | 同事公用前台电话不能显露所有匹配账号；重复请求的速率/审计由后端设计负责 |
| OR 与歧义 | 邮箱与电话分别查找后取集合；只有唯一且无冲突候选才允许进入确认界面，仍不绑定 | 邮箱→A、电话→B；一个号码→多账号；无国家区号；标识未验证，均停在需核对状态 |
| phone-only 邀请 | 首版只提示补充可验证邮箱，沿用本人接受；若必须电话邀请则单独设计挑战、有效期、重放和撤销 | 不以 OCR 电话或“发现唯一候选”替代本人同意，不推导 canSend=true |

上述后续建议不构成本批待决事项；未来实施前 W0 还需先证明账号域具有何种已验证标识及可发现偏好，不能在 UI 假设这些字段已存在。

实施前能力核对（`161e9e6c`，只读，未访问账号数据）：图谱 query 未找到对应 verified/discoverability 能力，`context AuthUser` 未命中，按规则补查 `features/auth`、`features/account`、`features/profile`、共享 contract/schema 中相关字面。`features/auth/contract.ts:48` 的 AuthUserDTO 只有 id/email/displayName/provider/时间；`features/auth/storage/auth-user-live-record-provider.ts:20` 仅额外保存 passwordHash/providerAccountId；`auth-user-service.ts:55` 的 credentials 注册执行格式校验、密码哈希与落库，没有邮箱所有权验证步骤。`auth.ts:72` 消费 Google profile.email，但本地用户 DTO 不记录统一的 emailVerified 状态。`shared/contract/profile.ts:51` 的 email/phone 是资料联系方式，无验证标记。上述已核对范围未见 discoverable/discoverability 或手机号验证字段，不能把资料 phone、可登录邮箱或 provider 名称直接当作跨提供方统一“已验证且同意被发现”的发现凭据。此结论限定源码边界，不声称全仓库绝无其他能力；需 W0 确认权威来源后才可实施匹配。

## 6. 背景/简介与日文接入

背景/简介只保留审阅建议：以“关于此人”为阅读区，关系背景与公开简介保留各自来源/编辑权限；完全相同的展示文本可考虑合并展示标签，不同文本不自动摘要或覆盖。已有 bio/intro 去重继续复用。真实重复数据尚无证据，先由授权数据负责人提供脱敏同记录的字段来源或本地 fixture 复现，再决定是否调整 adapter；不做 SQL 合并。

给 W5 的三语接入需求：

1. 沿用 `OrbitLanguageProvider.t({en,zh,ja})`，W2 自有 `ingest-v2-copy.ts` 提供逐条完整日文。请求确认 W5 是否即将变更 copy 类型/字典入口；默认本批不动 provider/core、shell 或共享 language 字典。
2. 所需文案域：配对、正/反面、卡数/照片数、上传/重挂/识别/替换、字段来源与手工、来源过期、重复联系人、整卡确认/跳过、图片过期、公司长值展开。动态数量用各语种完整句式；OCR 原始人名/公司内容不机器翻译。
3. 页面 chrome 和全站导航语言仍由 W5 统一提供。主协调已追加批准两个 batch2 page 的“导入中心”返回标题与语言参数；W2 仅局部改动，不把本流程三语测试写成全站日文完成。
4. 原先确认的私有 image endpoint 只返回 bytes，不具备共享 responsive/LQIP DTO。用户已明确接受本批局部私图例外，采用同源授权读取与浏览器本地 LQIP/variants；W2 不扩大共享 media 契约，也不把首次 loading 宣称为 SSR LQIP。

## 7. 验收、执行顺序与交接

批准 W2-A 的文件及上述局部交互后，先锁定索引/impact → Luna max 实施和定向回归 → Astra 审 diff、失败路径、契约和 mounted UI → 完整 detect-changes → 独立提交；W2-B 已获准，由另一名显式 Luna max（w2_long_values，fork none）仅在自己的两个文件内实现；与 A 文件集不交叉，A 内部仍保持同一 Luna 串行。不擅自派新长期 session。

最低验收：

- 两照片明确配成一张卡，两张单面保持两张卡；奇数照片/重复文件/超限/取消选择不误配；网络重试 manifest 和 key 稳定。
- 双面姓名/公司冲突必须选择来源；手工覆盖 source=null；换面不丢稿；重拍/重 OCR 后旧来源不能提交，手工内容保留。
- 从请求断言两面版本与来源齐全；测试重复点击、丢响应重试、409、重复联系人确认、单面旧批次、整卡跳过、反面失败/替换、缺 digest 限制。
- 成功以整卡同一联系人回执/GET 回读为准，UI 计数为一；本地 API/PG 已有原子性回归可复用，未实跑不得标绿。
- 中英日局部文案无意外回退；手机布局、键盘焦点、长公司名/邮箱完整读取、不溢出、不被底栏遮挡。
- 计划命令：`node --import tsx --test` 运行上述 page/view-model 与既有 `tests/api-schema/business-card-two-sided-contract.test.ts`，随后 `npm run typecheck`。新增 API/PG 验证须显式仅使用独立本地 schema，并核对现有测试的环境入口后才运行。

设计阶段未安装依赖或执行测试；获准实施后已在本树 npm ci，使用独立 w2.localhost:4612、本地 orbit_web_w2_20260917 数据库及合成身份/图片开展验证。详细最终结果另见 REPORT，不共享构建目录、不加载 Production 环境。真实 OCR、实体相机、云写入、两端共同环境回读属于单独验收，不在本轮源码设计结论中。

批准已完成：W2-A 文件集与配对/来源选择交互、W2-B 先复现再局部修复、私有图片本批例外、当前三语 copy 接口与两处返回标题。P1-13 自动发现已明确延期；背景/简介合并与任何共享 DTO 改动没有本批编码授权。
