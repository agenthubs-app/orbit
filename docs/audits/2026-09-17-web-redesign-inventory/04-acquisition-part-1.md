# 04-acquisition：源码明细

证据级别：当前工作区源码。此表列出符号级静态可达实现，不宣称每项都在某个角色/状态实际显示。按钮按 JSX 实现记录；数组 map 可生成多项按钮，条件分支互斥，不能把实现数当 DOM 按钮数。

调用表按所属函数提供 HTTP 路径/方法证据；与按钮 handler 是否连通应结合 handler 源码核对。仅同一文件出现的 API 不等于该按钮调用它。路径常量不是一次额外请求。跨文件、动态路径和 callback 不强行配对。

文案包含原有中文/英文/日文及动态表达式。表格中的长表达式节选有标记；完整内容在对应源码。布局表只证明 HTML/ARIA 分区，不证明实际视觉位置。全局 shell 与 layout 另见 01、02。开发页共享组件的来源入口会标为 /dev，不算客户页面。

## repos/orbits/app/(app)/app/contacts/business-card-batch-entry.tsx

源码：[business-card-batch-entry.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/business-card-batch-entry.tsx>)

静态来源入口：`/app/contacts/new`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 203 | BusinessCardBatchEntry | section | uploading ? ( &lt;div role="status" aria-live="polite" style={{ color: "var(--text-3)", fontSize: 12.5, marginTop: 10 }}&gt; {t({ en: `Uploading: ${uploadProgress.done}/${uploadProgress.total} files. Keep this page open until upload finishes.`, zh: `上传中：${uploadProgress.done}/${uploadProgress.total} 个文件。上传完成前请保持页面打开。` })} &lt;/ …（完整表达式见源码） | card |

### 本地状态（用于发现隐藏子界面）

| 行 | 状态声明 |
| --- | --- |
| 100 | [batches, setBatches] = useState&lt;readonly BusinessCardBatchDTO[]&gt;([]) |
| 101 | [ingestV2Batches, setIngestV2Batches] = useState&lt;readonly IngestBatchDTO[]&gt;([]) |
| 102 | [uploading, setUploading] = useState(false) |
| 105 | [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 }) |
| 106 | [error, setError] = useState&lt;string \| null&gt;(null) |
| 107 | [needsLogin, setNeedsLogin] = useState(false) |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 29 | link/a · IngestV2BatchRow | {batch.id.slice(0, 13)} {batch.expectedItems} photos / 张 {t(INGEST_V2_STATUS_COPY[batch.status])} | `/app/contacts/new/batch2/${batch.id}` | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 67 | link/a · BatchRow | {batch.sourceFiles[0]?.fileName ?? batch.id.slice(0, 8)} {` +${batch.sourceFiles.length - 1}`} {settled} / {batch.totalItems} {t(BATCH_STATUS_COPY[batch.status])} | `/app/contacts/new/batch/${batch.id}` | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 214 | button/button · BusinessCardBatchEntry | Bulk upload photos / 批量上传照片 | onclick: () =&gt; { if (INGEST_V2_ENABLED) { window.location.href = "/app/contacts/new/batch2"; return; } photoInputRef.current?.click(); } | {"disabled":"uploading","renderGateProps":[],"conditions":[]} |
| 229 | button/button · BusinessCardBatchEntry | Upload PDF / 上传 PDF | onclick: () =&gt; pdfInputRef.current?.click() | {"disabled":"uploading","renderGateProps":[],"conditions":[]} |
| 239 | field/input · BusinessCardBatchEntry | t({ en: "Bulk upload card photos", zh: "批量上传名片照片" }) | onchange: (event) =&gt; void submitBatch(event.target.files) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 248 | field/input · BusinessCardBatchEntry | t({ en: "Upload a card PDF", zh: "上传名片 PDF" }) | onchange: (event) =&gt; void submitBatch(event.target.files) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 264 | link/a · BusinessCardBatchEntry | Sign in / 重新登录 | /app/account/login?next=%2Fapp%2Fcontacts%2Fnew | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 264 | button/button · BusinessCardBatchEntry | Retry upload / 重试上传 | onclick: () =&gt; void submitBatch(selectedFiles.current) | {"disabled":"uploading","renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 111 | BusinessCardBatchEntry | 调用 | GET/由封装决定 | "/api/contact-drafts/business-card/batches" |
| 111 | BusinessCardBatchEntry | 路径常量 | 见调用/handler | "/api/contact-drafts/business-card/batches" |
| 130 | BusinessCardBatchEntry | 调用 | GET/由封装决定 | "/api/contact-drafts/business-card/batches/v2" |
| 130 | BusinessCardBatchEntry | 路径常量 | 见调用/handler | "/api/contact-drafts/business-card/batches/v2" |
| 176 | submitBatch | 调用 | POST | "/api/contact-drafts/business-card/batches" |
| 176 | submitBatch | 路径常量 | 见调用/handler | "/api/contact-drafts/business-card/batches" |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 19 | 文案/数据常量 en | "Cancelled" |
| 19 | 文案/数据常量 zh | "已取消" |
| 20 | 文案/数据常量 en | "Uploading" |
| 20 | 文案/数据常量 zh | "上传中" |
| 21 | 文案/数据常量 en | "Completed" |
| 21 | 文案/数据常量 zh | "已完成" |
| 22 | 文案/数据常量 en | "Expired" |
| 22 | 文案/数据常量 zh | "已过期" |
| 23 | 文案/数据常量 en | "Processing" |
| 23 | 文案/数据常量 zh | "识别中" |
| 24 | 文案/数据常量 en | "Ready to review" |
| 24 | 文案/数据常量 zh | "待确认" |
| 44 | 翻译 en | "photos" |
| 44 | 翻译 zh | "张" |
| 57 | 文案/数据常量 en | "Cancelled" |
| 57 | 文案/数据常量 zh | "已取消" |
| 58 | 文案/数据常量 en | "Completed" |
| 58 | 文案/数据常量 zh | "已完成" |
| 59 | 文案/数据常量 en | "Processing" |
| 59 | 文案/数据常量 zh | "识别中" |
| 60 | 文案/数据常量 en | "Ready to review" |
| 60 | 文案/数据常量 zh | "待确认" |
| 188 | 翻译 en | "Upload failed. Try again." |
| 188 | 翻译 zh | "上传失败，请重试。" |
| 195 | 翻译 en | "Upload failed. Try again." |
| 195 | 翻译 zh | "上传失败，请重试。" |
| 205 | 翻译 en | "Batch import" |
| 205 | 翻译 zh | "批量导入" |
| 209 | 翻译 en | "Upload many card photos, or one PDF with one card per page. Recognition runs in the background." |
| 210 | 翻译 zh | "一次上传多张名片照片，或一个每页一张名片的 PDF；识别在后台自动进行。" |
| 227 | 翻译 en | "Bulk upload photos" |
| 227 | 翻译 zh | "批量上传照片" |
| 236 | 翻译 en | "Upload PDF" |
| 236 | 翻译 zh | "上传 PDF" |
| 239 | 属性 aria-label | t({ en: "Bulk upload card photos", zh: "批量上传名片照片" }) |
| 241 | 翻译 en | "Bulk upload card photos" |
| 241 | 翻译 zh | "批量上传名片照片" |
| 248 | 属性 aria-label | t({ en: "Upload a card PDF", zh: "上传名片 PDF" }) |
| 250 | 翻译 en | "Upload a card PDF" |
| 250 | 翻译 zh | "上传名片 PDF" |
| 258 | 翻译 en | `Uploading: ${uploadProgress.done}/${uploadProgress.total} files. Keep this page open until upload finishes.` |
| 258 | 翻译 zh | `上传中：${uploadProgress.done}/${uploadProgress.total} 个文件。上传完成前请保持页面打开。` |
| 264 | 翻译 en | "Sign in" |
| 264 | 翻译 zh | "重新登录" |
| 264 | 翻译 en | "Retry upload" |
| 264 | 翻译 zh | "重试上传" |

## repos/orbits/app/(app)/app/contacts/business-card-capture-workspace.tsx

源码：[business-card-capture-workspace.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/business-card-capture-workspace.tsx>)

静态来源入口：`/app/contacts/new`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 348 | BusinessCardCaptureWorkspace | section |  | bcc-shell |
| 362 | BusinessCardCaptureWorkspace | h2 | t({ en: "Business-card recognition is not connected", zh: "名片识别尚未连接", }) |  |
| 375 | BusinessCardCaptureWorkspace | details |  |  |
| 376 | BusinessCardCaptureWorkspace | summary | t({ en: "Workspace administrator setup", zh: "工作区管理员配置", }) |  |
| 614 | BusinessCardCaptureWorkspace | section | privacyNote | bcc-shell |
| 617 | BusinessCardCaptureWorkspace | h2 | t({ en: "Turn a card into a relationship", zh: "把一张名片，变成一段可信关系" }) |  |
| 663 | BusinessCardCaptureWorkspace | section | privacyNote | bcc-shell |
| 713 | BusinessCardCaptureWorkspace | section |  | bcc-shell |
| 718 | BusinessCardCaptureWorkspace | h2 | t({ en: "Review what Orbit saw", zh: "复核 Orbit 识别到的内容" }) |  |
| 864 | BusinessCardCaptureWorkspace | section | state.inviteSelected ? ( &lt;div className="bcc-invitation"&gt; {state.invitationStatus === "preparing" ? ( &lt;p aria-live="polite"&gt;{t({ en: "Preparing editable invitation…", zh: "正在准备可编辑邀请…" })}&lt;/p&gt; ) : null} {state.invitation ? ( &lt;&gt; &lt;Field label={t({ en: "Subject", zh: "邮件主题" })} onChange={(value) =&gt; dispatch({ field: "subje …（完整表达式见源码） | bcc-shell |
| 870 | BusinessCardCaptureWorkspace | h2 | state.displayName \|\| t({ en: "Contact saved", zh: "联系人已收录" }) |  |
| 956 | BusinessCardCaptureWorkspace | section |  | bcc-shell |
| 960 | BusinessCardCaptureWorkspace | h2 | t({ en: "This card needs another look", zh: "这张名片需要重新处理" }) |  |

### 本地状态（用于发现隐藏子界面）

| 行 | 状态声明 |
| --- | --- |
| 314 | [state, dispatch] = useReducer( businessCardCaptureReducer, initialBusinessCardCaptureState, ) |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 291 | field/textarea · Field | label | onchange: (event) =&gt; onChange(event.target.value) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 298 | field/input · Field | label | onchange: (event) =&gt; onChange(event.target.value) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 376 | disclosure/summary · BusinessCardCaptureWorkspace | Workspace administrator setup / 工作区管理员配置 |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 386 | link/a · BusinessCardCaptureWorkspace | Back to contacts / 返回人脉 | /app/contacts | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 629 | button/button · BusinessCardCaptureWorkspace | Photograph card / 拍照扫描 | onclick: () =&gt; fileInputRef.current?.click() | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 637 | button/button · BusinessCardCaptureWorkspace | Upload image / 上传图片 | onclick: () =&gt; fileInputRef.current?.click() | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 646 | field/input · BusinessCardCaptureWorkspace | 上传名片图片 | onchange: selectFile | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 677 | button/button · BusinessCardCaptureWorkspace | Replace image / 更换图片 | onclick: () =&gt; fileInputRef.current?.click() | {"disabled":"state.kind === \"processing\"","renderGateProps":[],"conditions":[]} |
| 685 | button/button · BusinessCardCaptureWorkspace | Start recognition / 开始识别 | onclick: startRecognition | {"disabled":"state.kind === \"processing\"","renderGateProps":[],"conditions":[]} |
| 695 | field/input · BusinessCardCaptureWorkspace | 上传名片图片 | onchange: selectFile | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 735 | callback-control/Field · BusinessCardCaptureWorkspace |  | onchange: (value) =&gt; dispatch({ field: "displayName", type: "update_field", value }) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 743 | callback-control/Field · BusinessCardCaptureWorkspace |  | onchange: (value) =&gt; dispatch({ field: "role", type: "update_field", value }) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 750 | callback-control/Field · BusinessCardCaptureWorkspace |  | onchange: (value) =&gt; dispatch({ field: "organization", type: "update_field", value, }) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 763 | callback-control/Field · BusinessCardCaptureWorkspace |  | onchange: (value) =&gt; dispatch({ field: "email", type: "update_field", value }) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 770 | callback-control/Field · BusinessCardCaptureWorkspace |  | onchange: (value) =&gt; dispatch({ field: "phone", type: "update_field", value }) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 778 | callback-control/Field · BusinessCardCaptureWorkspace |  | onchange: (value) =&gt; dispatch({ field: "relationshipContext", type: "update_field", value, }) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 799 | button/button · BusinessCardCaptureWorkspace | {issue.message} 已处理 / 确认 | onclick: () =&gt; dispatch({ issueCode: issue.code, type: "acknowledge_issue", }) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 822 | field/input · BusinessCardCaptureWorkspace | I reviewed every field and want to create this contact. / 我已核对所有字段，并决定将其收录进人脉。 | onchange: (event) =&gt; dispatch({ type: "mark_fields_reviewed", value: event.target.checked, }) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 846 | button/button · BusinessCardCaptureWorkspace | Confirm and save / 确认并收录 | onclick: confirmContact | {"disabled":"!canConfirm","renderGateProps":[],"conditions":[]} |
| 875 | field/input · BusinessCardCaptureWorkspace | Invite them to join Orbit / 邀请对方加入 Orbit {state.email \|\| t({ en: "No email on the reviewed card", zh: "复核后的名片没有邮箱" })} | onchange: (event) =&gt; void selectInvitation(event.target.checked) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 892 | callback-control/Field · BusinessCardCaptureWorkspace |  | onchange: (value) =&gt; dispatch({ field: "subject", type: "update_invitation", value, }) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 903 | callback-control/Field · BusinessCardCaptureWorkspace |  | onchange: (value) =&gt; dispatch({ field: "body", type: "update_invitation", value, }) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 929 | button/button · BusinessCardCaptureWorkspace | Not now / 暂不邀请 | onclick: () =&gt; void selectInvitation(false) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 936 | button/button · BusinessCardCaptureWorkspace | Confirm invitation / 确认邀请 | onclick: confirmInvitation | {"disabled":"!state.invitation","renderGateProps":[],"conditions":[]} |
| 962 | button/button · BusinessCardCaptureWorkspace | Try another image / 换一张图片重试 / Start again / 重新开始 | onclick: () =&gt; dispatch({ type: "reset" }) | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 422 | startRecognition | 调用 | POST | "/api/contact-drafts/business-card/scan" |
| 422 | startRecognition | 路径常量 | 见调用/handler | "/api/contact-drafts/business-card/scan" |
| 461 | confirmContact | 调用 | POST | "/api/contacts/business-card/confirm" |
| 461 | confirmContact | 路径常量 | 见调用/handler | "/api/contacts/business-card/confirm" |
| 530 | selectInvitation | 调用 | POST | "/api/contact-invitations" |
| 530 | selectInvitation | 路径常量 | 见调用/handler | "/api/contact-invitations" |
| 571 | confirmInvitation | 调用 | PATCH | "/api/contact-invitations" |
| 571 | confirmInvitation | 路径常量 | 见调用/handler | "/api/contact-invitations" |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 291 | 属性 aria-label | label |
| 298 | 属性 aria-label | label |
| 334 | 翻译 en | "The durable live capability is not active." |
| 335 | 翻译 zh | "当前未启用可持久化的 live 能力。" |
| 339 | 翻译 en | "The private contact store is not configured." |
| 340 | 翻译 zh | "当前未配置私有联系人存储。" |
| 343 | 翻译 en | "The cloud OCR provider is not configured." |
| 344 | 翻译 zh | "当前未配置云端 OCR 服务。" |
| 358 | 翻译 en | "CAPABILITY UNAVAILABLE" |
| 359 | 翻译 zh | "能力当前不可用" |
| 364 | 翻译 en | "Business-card recognition is not connected" |
| 365 | 翻译 zh | "名片识别尚未连接" |
| 371 | 翻译 en | "No image will be uploaded and no contact will be created in this state." |
| 372 | 翻译 zh | "在此状态下不会上传图片，也不会创建联系人。" |
| 378 | 翻译 en | "Workspace administrator setup" |
| 379 | 翻译 zh | "工作区管理员配置" |
| 382 | JSX文字 | ORBIT_MODULE_MODE=live |
| 383 | JSX文字 | DEEPSEEK_API_KEY, GEMINI_API_KEY or GOOGLE_API_KEY |
| 384 | JSX文字 | ORBIT_EVENT_DATABASE_URL or ORBIT_LIVE_DATABASE_URL |
| 387 | 翻译 en | "Back to contacts" |
| 387 | 翻译 zh | "返回人脉" |
| 605 | 翻译 en | "The image is used only for this cloud recognition request and is not stored." |
| 606 | 翻译 zh | "图片只用于本次云端识别，不会保存原始名片。" |
| 616 | 翻译 en | "PRIVATE CAPTURE · CLOUD OCR" |
| 616 | 翻译 zh | "私密采集 · 云端识别" |
| 617 | 翻译 en | "Turn a card into a relationship" |
| 617 | 翻译 zh | "把一张名片，变成一段可信关系" |
| 620 | 翻译 en | "Photograph or upload a card. Orbit extracts visible fields, then waits for your review before creating anything." |
| 621 | 翻译 zh | "拍照或上传名片。Orbit 识别可见字段，但在你逐项复核前不会创建联系人。" |
| 626 | 翻译 en | "Ready when the card is" |
| 626 | 翻译 zh | "让名片正对镜头或选择图片" |
| 627 | JSX文字 | JPEG · PNG · WebP · HEIC · ≤ 10 MiB |
| 635 | 翻译 en | "Photograph card" |
| 635 | 翻译 zh | "拍照扫描" |
| 643 | 翻译 en | "Upload image" |
| 643 | 翻译 zh | "上传图片" |
| 646 | 属性 aria-label | 上传名片图片 |
| 665 | 翻译 en | "CAPTURE PREVIEW" |
| 665 | 翻译 zh | "采集预览" |
| 667 | 属性 alt | 待识别名片预览 |
| 671 | 翻译 en | "Reading visible fields…" |
| 671 | 翻译 zh | "正在识别名片字段…" |
| 683 | 翻译 en | "Replace image" |
| 683 | 翻译 zh | "更换图片" |
| 692 | 翻译 en | "Start recognition" |
| 692 | 翻译 zh | "开始识别" |
| 695 | 属性 aria-label | 上传名片图片 |
| 717 | 翻译 en | "CAPTURE → REVIEW" |
| 717 | 翻译 zh | "采集 → 复核" |
| 718 | 翻译 en | "Review what Orbit saw" |
| 718 | 翻译 zh | "复核 Orbit 识别到的内容" |
| 726 | 属性 alt | 名片证据预览 |
| 729 | 翻译 en | "Uploaded evidence" |
| 729 | 翻译 zh | "本次上传证据" |
| 735 | 属性 label | t({ en: "Name", zh: "姓名" }) |
| 736 | 翻译 en | "Name" |
| 736 | 翻译 zh | "姓名" |
| 743 | 属性 label | t({ en: "Role", zh: "职位" }) |
| 744 | 翻译 en | "Role" |
| 744 | 翻译 zh | "职位" |
| 750 | 属性 label | t({ en: "Organization", zh: "公司" }) |
| 751 | 翻译 en | "Organization" |
| 751 | 翻译 zh | "公司" |
| 763 | 属性 label | t({ en: "Email", zh: "邮箱" }) |
| 764 | 翻译 en | "Email" |
| 764 | 翻译 zh | "邮箱" |
| 770 | 属性 label | t({ en: "Phone", zh: "电话" }) |
| 771 | 翻译 en | "Phone" |
| 771 | 翻译 zh | "电话" |
| 778 | 属性 label | t({ en: "How you met", zh: "认识场景" }) |
| 779 | 翻译 en | "How you met" |
| 779 | 翻译 zh | "认识场景" |
| 792 | 翻译 en | "Needs your judgment" |
| 792 | 翻译 zh | "需要你判断" |
| 834 | 翻译 en | "I reviewed every field and want to create this contact." |
| 835 | 翻译 zh | "我已核对所有字段，并决定将其收录进人脉。" |
| 842 | 翻译 en | "No contact exists yet" |
| 843 | 翻译 zh | "此刻仍未写入联系人" |
| 853 | 翻译 en | "Confirm and save" |
| 853 | 翻译 zh | "确认并收录" |
| 869 | 翻译 en | "CONTACT CONFIRMED" |
| 869 | 翻译 zh | "联系人已确认" |
| 870 | 翻译 en | "Contact saved" |
| 870 | 翻译 zh | "联系人已收录" |
| 871 | 翻译 en | "Now decide whether to invite them. This is optional and separately confirmed." |
| 871 | 翻译 zh | "现在可以决定是否邀请对方。该操作完全可选，并需要单独确认。" |
| 881 | 翻译 en | "Invite them to join Orbit" |
| 881 | 翻译 zh | "邀请对方加入 Orbit" |
| 882 | 翻译 en | "No email on the reviewed card" |
| 882 | 翻译 zh | "复核后的名片没有邮箱" |
| 888 | 翻译 en | "Preparing editable invitation…" |
| 888 | 翻译 zh | "正在准备可编辑邀请…" |
| 892 | 属性 label | t({ en: "Subject", zh: "邮件主题" }) |
| 893 | 翻译 en | "Subject" |
| 893 | 翻译 zh | "邮件主题" |
| 903 | 属性 label | t({ en: "Message", zh: "邀请正文" }) |
| 904 | 翻译 en | "Message" |
| 904 | 翻译 zh | "邀请正文" |
| 919 | 翻译 en | "An email address and valid draft are required. Nothing was sent." |
| 919 | 翻译 zh | "需要有效邮箱和邀请草稿。当前没有发送任何邮件。" |
| 925 | 翻译 en | "Invitation prepared, not sent" |
| 925 | 翻译 zh | "邀请已准备，尚未发送" |
| 934 | 翻译 en | "Not now" |
| 934 | 翻译 zh | "暂不邀请" |
| 942 | 翻译 en | "Confirm invitation" |
| 942 | 翻译 zh | "确认邀请" |
| 947 | JSX文字 | externalSendRequested=false · emailProviderRequested=false · messageSent=false |
| 960 | 翻译 en | "This card needs another look" |
| 960 | 翻译 zh | "这张名片需要重新处理" |
| 968 | 翻译 en | "Try another image" |
| 968 | 翻译 zh | "换一张图片重试" |
| 969 | 翻译 en | "Start again" |
| 969 | 翻译 zh | "重新开始" |

## repos/orbits/app/(app)/app/contacts/business-card-import-client.ts

源码：[business-card-import-client.ts](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/business-card-import-client.ts>)

静态来源入口：`/app/contacts/new`、`/app/contacts/new/import/[id]`

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 5 | (module / render callback) | 路径常量 | 见调用/handler | "/api/contact-drafts/business-card/uploads" |
| 6 | (module / render callback) | 路径常量 | 见调用/handler | "/api/contact-drafts/business-card/imports" |
| 20 | importJSON | 调用 | GET/由封装决定 | url |
| 85 | create | 调用 | POST | IMPORTS |
| 107 | verify | 调用 | POST | `${IMPORTS}/verify-source` |
| 120 | perform | 调用 | POST | UPLOADS |

## repos/orbits/app/(app)/app/contacts/business-card-import-progress.tsx

源码：[business-card-import-progress.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/business-card-import-progress.tsx>)

静态来源入口：`/app/contacts/new`、`/app/contacts/new/import/[id]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 75 | BusinessCardImportProgress | section | !job && !error ? &lt;p role="status"&gt;{t({ en: "Loading saved progress…", zh: "正在读取已保存的进度…" })}&lt;/p&gt; : null job ? &lt;&gt; &lt;div role="status" aria-live="polite"&gt; &lt;p&gt;{label(job, t)}&lt;/p&gt; &lt;p&gt;{t({ en: `${job.completedSources}/${job.sourceCount} files prepared · ${job.preparedPages} pages saved`, zh: `已准备 ${job.completedSources}/${job …（完整表达式见源码） | card |
| 76 | BusinessCardImportProgress | h1 | t({ en: "Prepare card import", zh: "准备名片导入" }) |  |

### 本地状态（用于发现隐藏子界面）

| 行 | 状态声明 |
| --- | --- |
| 40 | [job, setJob] = useState&lt;PublicV1PreparationJob \| null&gt;(null) |
| 41 | [error, setError] = useState&lt;string \| null&gt;(null) |
| 42 | [reload, setReload] = useState(0) |
| 43 | [cancelling, setCancelling] = useState(false) |
| 111 | [jobs, setJobs] = useState&lt;PublicV1PreparationJob[]&gt;([]) |
| 111 | [error, setError] = useState&lt;string \| null&gt;(null) |
| 112 | [reload, setReload] = useState(0) |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 34 | link/a · LoginLink | Sign in / 重新登录 | `/app/account/login?next=${encodeURIComponent(typeof window === "undefined" ? "/app/contacts/new" : window.location.pathname)}` | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 95 | link/a · BusinessCardImportProgress | View recognition batch / 查看识别批次 | `/app/contacts/new/batch/${encodeURIComponent(job.batchId)}` | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 97 | button/button · BusinessCardImportProgress | Cancelling… / 正在取消… / Cancel import / 取消导入 | onclick: () =&gt; void cancel() | {"disabled":"cancelling","renderGateProps":[],"conditions":[]} |
| 99 | link/a · BusinessCardImportProgress | Choose files again / 重新选择文件 | /app/contacts/new | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 104 | button/button · BusinessCardImportProgress | Refresh status / 刷新状态 | onclick: () =&gt; setReload((n) =&gt; n + 1) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 132 | link/a · BusinessCardImportJobs | {label(job, t)} {t({ en: `${job.sourceCount} files · ${job.preparedPages} pages`, zh: `${job.sourceCount} 个文件 · ${job.preparedPages} 页` })} | `/app/contacts/new/import/${encodeURIComponent(job.id)}` | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 138 | button/button · BusinessCardImportJobs | Reload saved imports / 重新加载导入任务 | onclick: () =&gt; setReload((n) =&gt; n + 1) | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 118 | poll | 路径常量 | 见调用/handler | "/api/contact-drafts/business-card/uploads" |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 10 | 翻译 en | "Your session expired. Sign in again." |
| 10 | 翻译 zh | "登录已过期，请重新登录。" |
| 11 | 翻译 en | "This import is unavailable for this account." |
| 11 | 翻译 zh | "当前账号无法查看这个导入任务。" |
| 12 | 翻译 en | "The upload expired. Choose the files again." |
| 12 | 翻译 zh | "上传已过期，请重新选择文件。" |
| 14 | 翻译 en | "Choose readable card images (up to 10 MiB each) or a PDF (up to 50 MiB), with at most 500 cards in total." |
| 15 | 翻译 zh | "请选择可读取的名片图片（每张不超过 10 MiB）或 PDF（不超过 50 MiB），一个批次最多 500 张名片。" |
| 17 | 翻译 en | "This import changed. Refresh its status before retrying." |
| 17 | 翻译 zh | "导入状态已变化，请刷新状态后重试。" |
| 18 | 翻译 en | "The request did not complete. Retry to check the saved progress." |
| 18 | 翻译 zh | "请求未完成，请重试以确认已保存的进度。" |
| 29 | 文案/数据常量 en | "Waiting to prepare" |
| 29 | 文案/数据常量 zh | "等待准备" |
| 29 | 文案/数据常量 en | "Preparing files" |
| 29 | 文案/数据常量 zh | "正在准备文件" |
| 30 | 文案/数据常量 en | "Creating recognition batch" |
| 30 | 文案/数据常量 zh | "正在创建识别批次" |
| 30 | 文案/数据常量 en | "Files prepared" |
| 30 | 文案/数据常量 zh | "文件准备完成" |
| 31 | 文案/数据常量 en | "Preparation failed" |
| 31 | 文案/数据常量 zh | "文件准备失败" |
| 31 | 文案/数据常量 en | "Cancelled" |
| 31 | 文案/数据常量 zh | "已取消" |
| 35 | 翻译 en | "Sign in" |
| 35 | 翻译 zh | "重新登录" |
| 76 | 翻译 en | "Prepare card import" |
| 76 | 翻译 zh | "准备名片导入" |
| 77 | 翻译 en | "Loading saved progress…" |
| 77 | 翻译 zh | "正在读取已保存的进度…" |
| 81 | 翻译 en | `${job.completedSources}/${job.sourceCount} files prepared · ${job.preparedPages} pages saved` |
| 82 | 翻译 zh | `已准备 ${job.completedSources}/${job.sourceCount} 个文件，已保存 ${job.preparedPages} 页` |
| 83 | 属性 aria-label | t({ en: "File preparation", zh: "文件准备进度" }) |
| 83 | 翻译 en | "File preparation" |
| 83 | 翻译 zh | "文件准备进度" |
| 85 | 翻译 en | `Current file: ${Math.max(0, (job.currentSourcePage ?? 1) - 1)}/${job.currentSourcePageCount} pages` |
| 86 | 翻译 zh | `当前文件已准备 ${Math.max(0, (job.currentSourcePage ?? 1) - 1)}/${job.currentSourcePageCount} 页` |
| 89 | 翻译 en | "Your files are uploaded. You can close this page and return from the import center; preparation continues in the background." |
| 90 | 翻译 zh | "文件已上传。你可以关闭页面，稍后从导入中心返回；文件准备会在后台继续。" |
| 92 | 翻译 en | "Preparation is temporarily unavailable and will retry automatically." |
| 92 | 翻译 zh | "文件准备暂时受阻，稍后会自动重试。" |
| 93 | 翻译 en | "Preparation stopped. Temporary files are scheduled for cleanup." |
| 93 | 翻译 zh | "文件准备已停止，临时文件已安排清理。" |
| 96 | 翻译 en | "View recognition batch" |
| 96 | 翻译 zh | "查看识别批次" |
| 98 | 翻译 en | "Cancelling…" |
| 98 | 翻译 zh | "正在取消…" |
| 98 | 翻译 en | "Cancel import" |
| 98 | 翻译 zh | "取消导入" |
| 99 | 翻译 en | "Choose files again" |
| 99 | 翻译 zh | "重新选择文件" |
| 104 | 翻译 en | "Refresh status" |
| 104 | 翻译 zh | "刷新状态" |
| 131 | 属性 aria-label | t({ en: "Saved imports", zh: "已保存的导入任务" }) |
| 131 | 翻译 en | "Saved imports" |
| 131 | 翻译 zh | "已保存的导入任务" |
| 133 | 翻译 en | `${job.sourceCount} files · ${job.preparedPages} pages` |
| 133 | 翻译 zh | `${job.sourceCount} 个文件 · ${job.preparedPages} 页` |
| 138 | 翻译 en | "Reload saved imports" |
| 138 | 翻译 zh | "重新加载导入任务" |

## repos/orbits/app/(app)/app/contacts/new/batch/[id]/business-card-batch-view.tsx

源码：[business-card-batch-view.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/new/batch/[id]/business-card-batch-view.tsx>)

静态来源入口：`/app/contacts/new/batch/[id]`、`/app/contacts/new/batch2/[id]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 176 | BusinessCardBatchViewPure | section |  | bcb-shell |
| 178 | BusinessCardBatchViewPure | h2 | t({ en: "Batch cancelled", zh: "批次已取消" }) |  |
| 192 | BusinessCardBatchViewPure | section |  | bcb-shell |
| 195 | BusinessCardBatchViewPure | h2 | t({ en: "Batch completed", zh: "批次已完成" }) |  |
| 210 | BusinessCardBatchViewPure | section | workerStalled ? ( &lt;div className="bcb-warn"&gt; {t({ en: "Processing is taking longer than expected. You can return later, or cancel this import and add contacts manually.", zh: "处理时间比预期长。你可以稍后回来，也可以取消本次导入后手动添加联系人。", })} &lt;/div&gt; ) : null cancelControl | bcb-shell |
| 213 | BusinessCardBatchViewPure | h2 | t({ en: "Recognizing your cards…", zh: "正在识别名片…" }) |  |
| 261 | BusinessCardBatchViewPure | section | cancelControl | bcb-shell |
| 264 | BusinessCardBatchViewPure | h2 | t({ en: "All cards reviewed", zh: "全部卡片已处理" }) |  |
| 288 | BusinessCardBatchViewPure | section | cancelControl | bcb-shell |
| 294 | BusinessCardBatchViewPure | h2 | # currentItem.seq · currentItem.sourceFileName currentItem.sourcePage ? ` · 第${currentItem.sourcePage}页` : "" |  |
| 559 | BusinessCardBatchView | section | feedback ?? &lt;p role="status"&gt;{t({ en: "Loading batch…", zh: "正在加载批次…" })}&lt;/p&gt; | bcb-shell |
| 560 | BusinessCardBatchView | h2 | t({ en: "Card import", zh: "名片导入" }) |  |

### 本地状态（用于发现隐藏子界面）

| 行 | 状态声明 |
| --- | --- |
| 153 | [fields, setFields] = useState&lt;BusinessCardBatchFixedFields \| null&gt;(() =&gt; currentItem ? initialFixedFields(currentItem) : null, ) |
| 156 | [editedItemId, setEditedItemId] = useState&lt;string \| null&gt;( currentItem?.id ?? null, ) |
| 159 | [manualItemId, setManualItemId] = useState&lt;string \| null&gt;(null) |
| 485 | [actionError, setActionError] = useState&lt;number \| null&gt;(null) |
| 486 | [loadError, setLoadError] = useState&lt;number \| null&gt;(null) |
| 489 | [batch, setBatch] = useState&lt;BusinessCardBatchDTO \| null&gt;(null) |
| 490 | [items, setItems] = useState&lt;readonly BusinessCardBatchItemDTO[]&gt;([]) |
| 491 | [busy, setBusy] = useState(false) |
| 492 | [duplicateItemId, setDuplicateItemId] = useState&lt;string \| null&gt;(null) |
| 493 | [nowMs, setNowMs] = useState(() =&gt; Date.now()) |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 181 | link/a · BusinessCardBatchViewPure | Open contacts / 查看名片夹 | /app/contacts | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 186 | button/button · BusinessCardBatchViewPure | Cancel remaining import / 取消剩余导入 | onclick: onCancel | {"disabled":"busy","renderGateProps":[],"conditions":[]} |
| 201 | link/a · BusinessCardBatchViewPure | Open contacts / 查看名片夹 | /app/contacts | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 270 | button/button · BusinessCardBatchViewPure | Finish batch / 完成批次 | onclick: onFinish | {"disabled":"busy","renderGateProps":[],"conditions":[]} |
| 334 | field/input · BusinessCardBatchViewPure | {t(label)} | onchange: (event) =&gt; setFields((previous) =&gt; previous ? { ...previous, [key]: event.target.value } : previous, ) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 346 | field/textarea · BusinessCardBatchViewPure | Notes (nothing gets lost) / 备注（其余信息都在这里） | onchange: (event) =&gt; setFields((previous) =&gt; previous ? { ...previous, notes: event.target.value } : previous, ) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 376 | button/button · BusinessCardBatchViewPure | Skip this card / 跳过此卡 | onclick: () =&gt; onSkip(currentItem) | {"disabled":"busy","renderGateProps":[],"conditions":[]} |
| 384 | button/button · BusinessCardBatchViewPure | Create anyway / 仍然创建 | onclick: () =&gt; onConfirm(currentItem, fields, true) | {"disabled":"busy \|\| nameMissing","renderGateProps":[],"conditions":[]} |
| 395 | button/button · BusinessCardBatchViewPure | Skip / 跳过 | onclick: () =&gt; onSkip(currentItem) | {"disabled":"busy","renderGateProps":[],"conditions":[]} |
| 403 | button/button · BusinessCardBatchViewPure | Confirm and next / 确认并下一张 | onclick: () =&gt; onConfirm(currentItem, fields, false) | {"disabled":"busy \|\| nameMissing","renderGateProps":[],"conditions":[]} |
| 415 | button/button · BusinessCardBatchViewPure | Back / 返回 | onclick: () =&gt; setManualItemId(null) | {"disabled":"busy","renderGateProps":[],"conditions":[]} |
| 423 | button/button · BusinessCardBatchViewPure | Save manual entry / 保存手工录入 | onclick: () =&gt; onConfirm(currentItem, fields, duplicateItemId === currentItem.id, true) | {"disabled":"busy \|\| !fields.displayName.trim()","renderGateProps":[],"conditions":[]} |
| 434 | button/button · BusinessCardBatchViewPure | Skip / 跳过 | onclick: () =&gt; onSkip(currentItem) | {"disabled":"busy","renderGateProps":[],"conditions":[]} |
| 442 | button/button · BusinessCardBatchViewPure | Type it in / 手工录入 | onclick: () =&gt; setManualItemId(currentItem.id) | {"disabled":"busy","renderGateProps":[],"conditions":[]} |
| 450 | button/button · BusinessCardBatchViewPure | Retry recognition / 重试识别 | onclick: () =&gt; onRetry(currentItem) | {"disabled":"busy","renderGateProps":[],"conditions":[]} |
| 554 | link/a · BusinessCardBatchView | Sign in / 重新登录 | `/app/account/login?next=${encodeURIComponent(`/app/contacts/new/batch/${batchId}`)}` | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 555 | button/button · BusinessCardBatchView | Refresh status / 刷新状态 | onclick: () =&gt; { setActionError(null); void refresh(); } | {"disabled":"busy","renderGateProps":[],"conditions":[]} |
| 562 | link/a · BusinessCardBatchView | Back to contacts / 返回名片夹 | /app/contacts | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 569 | callback-control/BusinessCardBatchViewPure · BusinessCardBatchView |  | onconfirm: (item, fields, allowDuplicate, manual = false) =&gt; void withBusy(async () =&gt; { const body = await post( `/api/contact-drafts/business-card/batches/${batch.id}/items/${item.id}/${manual ? "manual-entry" : "confirm"}`, { ...fields, allowDuplicate }, ); if (!["duplicate_review", "created", "already_confirmed"].includes(body?.data?.state)) throw new BatchRequestFailure(502); if (body.data?.state === "duplicate_review") { setDuplicateItemId(item.id); } else { setDuplicateItemId(null); } }); oncancel: () =&gt; void withBusy(async () =&gt; { await post(`/api/contact-drafts/business-card/batches/${batch.id}/cancel`); …（完整表达式见源码） | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 117 | itemImageUrl | 路径常量 | 见调用/handler | `/api/contact-drafts/business-card/batches/${item.batchId}/items/${item.id}/image` |
| 477 | requestBatchJson | 调用 | GET/由封装决定 | path |
| 499 | BusinessCardBatchView | 路径常量 | 见调用/handler | `/api/contact-drafts/business-card/batches/${batchId}` |
| 577 | BusinessCardBatchView | 调用 | POST | `/api/contact-drafts/business-card/batches/${batch.id}/items/${item.id}/${manual ? "manual-entry" : "confirm"}` |
| 578 | BusinessCardBatchView | 路径常量 | 见调用/handler | `/api/contact-drafts/business-card/batches/${batch.id}/items/${item.id}/${manual ? "manual-entry" : "confirm"}` |
| 591 | BusinessCardBatchView | 调用 | POST | `/api/contact-drafts/business-card/batches/${batch.id}/cancel` |
| 591 | BusinessCardBatchView | 路径常量 | 见调用/handler | `/api/contact-drafts/business-card/batches/${batch.id}/cancel` |
| 595 | BusinessCardBatchView | 调用 | POST | `/api/contact-drafts/business-card/batches/${batch.id}/finish` |
| 595 | BusinessCardBatchView | 路径常量 | 见调用/handler | `/api/contact-drafts/business-card/batches/${batch.id}/finish` |
| 600 | BusinessCardBatchView | 调用 | POST | `/api/contact-drafts/business-card/batches/${batch.id}/items/${item.id}/retry` |
| 601 | BusinessCardBatchView | 路径常量 | 见调用/handler | `/api/contact-drafts/business-card/batches/${batch.id}/items/${item.id}/retry` |
| 607 | BusinessCardBatchView | 调用 | POST | `/api/contact-drafts/business-card/batches/${batch.id}/items/${item.id}/skip` |
| 608 | BusinessCardBatchView | 路径常量 | 见调用/handler | `/api/contact-drafts/business-card/batches/${batch.id}/items/${item.id}/skip` |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 22 | 文案/数据常量 en | "Confirmed" |
| 22 | 文案/数据常量 zh | "已收录" |
| 23 | 文案/数据常量 en | "Recognized" |
| 23 | 文案/数据常量 zh | "已识别" |
| 24 | 文案/数据常量 en | "Failed" |
| 24 | 文案/数据常量 zh | "识别失败" |
| 25 | 文案/数据常量 en | "Waiting" |
| 25 | 文案/数据常量 zh | "排队中" |
| 26 | 文案/数据常量 en | "Reading" |
| 26 | 文案/数据常量 zh | "识别中" |
| 27 | 文案/数据常量 en | "Skipped" |
| 27 | 文案/数据常量 zh | "已跳过" |
| 91 | 文案/数据常量 en | "Recognition did not read any fields. Fill them in by hand from the card image." |
| 92 | 文案/数据常量 ja | "認識ではフィールドを読み取れませんでした。カード画像を見ながら手入力してください。" |
| 93 | 文案/数据常量 zh | "识别没有读到任何字段，请对照卡图手工填写。" |
| 97 | 文案/数据常量 en | "A name is required before this card can be saved as a contact." |
| 98 | 文案/数据常量 ja | "連絡先として保存するには氏名が必要です。" |
| 99 | 文案/数据常量 zh | "需要填写姓名，才能把这张名片保存为联系人。" |
| 108 | 翻译 en | "After confirmation, images are no longer accessible and are deleted in the background. Skipping also removes the image." |
| 109 | 翻译 zh | "确认后卡图不再可访问，并由后台删除；跳过也会移除卡图。" |
| 178 | 翻译 en | "Batch cancelled" |
| 178 | 翻译 zh | "批次已取消" |
| 179 | 翻译 en | "Processing has stopped. Contacts already saved remain in your contacts." |
| 179 | 翻译 zh | "已停止处理，已经收录的联系人会保留。" |
| 180 | 翻译 en | "Card images have been deleted." |
| 180 | 翻译 zh | "卡图已删除。" |
| 180 | 翻译 en | "Card images are being deleted in the background." |
| 180 | 翻译 zh | "正在后台删除卡图。" |
| 181 | 翻译 en | "Open contacts" |
| 181 | 翻译 zh | "查看名片夹" |
| 186 | 翻译 en | "Cancel remaining import" |
| 186 | 翻译 zh | "取消剩余导入" |
| 187 | 翻译 en | "Stops processing and deletes card images. Contacts already saved are kept." |
| 187 | 翻译 zh | "停止处理并删除卡图，保留已收录的联系人。" |
| 194 | 翻译 en | "BATCH IMPORT" |
| 194 | 翻译 zh | "批量导入" |
| 195 | 翻译 en | "Batch completed" |
| 195 | 翻译 zh | "批次已完成" |
| 197 | 翻译 en | "Confirmed" |
| 197 | 翻译 zh | "已收录" |
| 198 | 翻译 en | "Skipped" |
| 198 | 翻译 zh | "已跳过" |
| 199 | 翻译 en | "Failed" |
| 199 | 翻译 zh | "失败" |
| 202 | 翻译 en | "Open contacts" |
| 202 | 翻译 zh | "查看名片夹" |
| 212 | 翻译 en | "BATCH IMPORT" |
| 212 | 翻译 zh | "批量导入" |
| 213 | 翻译 en | "Recognizing your cards…" |
| 213 | 翻译 zh | "正在识别名片…" |
| 216 | 翻译 en | "You can leave this page — processing continues in the background." |
| 217 | 翻译 zh | "可以离开本页，识别在后台继续；回来时进度自动恢复。" |
| 223 | 翻译 en | "Processing is taking longer than expected. You can return later, or cancel this import and add contacts manually." |
| 224 | 翻译 zh | "处理时间比预期长。你可以稍后回来，也可以取消本次导入后手动添加联系人。" |
| 237 | 翻译 en | "failed" |
| 237 | 翻译 zh | "失败" |
| 263 | 翻译 en | "BATCH IMPORT" |
| 263 | 翻译 zh | "批量导入" |
| 264 | 翻译 en | "All cards reviewed" |
| 264 | 翻译 zh | "全部卡片已处理" |
| 266 | 翻译 en | "Confirmed" |
| 266 | 翻译 zh | "已收录" |
| 267 | 翻译 en | "Skipped" |
| 267 | 翻译 zh | "已跳过" |
| 268 | 翻译 en | "Failed" |
| 268 | 翻译 zh | "失败" |
| 271 | 翻译 en | "Finish batch" |
| 271 | 翻译 zh | "完成批次" |
| 291 | 翻译 en | "REVIEW" |
| 291 | 翻译 zh | "逐张确认" |
| 292 | 翻译 en | "left" |
| 292 | 翻译 zh | "张待处理" |
| 301 | 属性 alt | t({ en: "Card image", zh: "名片图片" }) |
| 301 | 翻译 en | "Card image" |
| 301 | 翻译 zh | "名片图片" |
| 304 | 翻译 en | "Image removed" |
| 304 | 翻译 zh | "图片已删除" |
| 311 | 翻译 en | "Recognition failed" |
| 311 | 翻译 zh | "识别失败" |
| 324 | 文案/数据常量 en | "Name" |
| 324 | 文案/数据常量 zh | "姓名" |
| 325 | 文案/数据常量 en | "Company" |
| 325 | 文案/数据常量 zh | "公司" |
| 326 | 文案/数据常量 en | "Title" |
| 326 | 文案/数据常量 zh | "职位" |
| 327 | 文案/数据常量 en | "Email" |
| 327 | 文案/数据常量 zh | "邮箱" |
| 328 | 文案/数据常量 en | "Phone" |
| 328 | 文案/数据常量 zh | "电话" |
| 329 | 文案/数据常量 en | "How you met" |
| 329 | 文案/数据常量 zh | "认识场景" |
| 345 | 翻译 en | "Notes (nothing gets lost)" |
| 345 | 翻译 zh | "备注（其余信息都在这里）" |
| 360 | 翻译 en | "Looks like this person already exists in your contacts." |
| 361 | 翻译 zh | "该联系人似乎已存在于你的名片夹。" |
| 382 | 翻译 en | "Skip this card" |
| 382 | 翻译 zh | "跳过此卡" |
| 390 | 翻译 en | "Create anyway" |
| 390 | 翻译 zh | "仍然创建" |
| 401 | 翻译 en | "Skip" |
| 401 | 翻译 zh | "跳过" |
| 409 | 翻译 en | "Confirm and next" |
| 409 | 翻译 zh | "确认并下一张" |
| 421 | 翻译 en | "Back" |
| 421 | 翻译 zh | "返回" |
| 429 | 翻译 en | "Save manual entry" |
| 429 | 翻译 zh | "保存手工录入" |
| 440 | 翻译 en | "Skip" |
| 440 | 翻译 zh | "跳过" |
| 448 | 翻译 en | "Type it in" |
| 448 | 翻译 zh | "手工录入" |
| 456 | 翻译 en | "Retry recognition" |
| 456 | 翻译 zh | "重试识别" |
| 548 | 翻译 en | "Your session has expired. Sign in again to continue." |
| 548 | 翻译 zh | "登录已过期，请重新登录后继续。" |
| 549 | 翻译 en | "You do not have permission to perform this action." |
| 549 | 翻译 zh | "你没有执行此操作的权限。" |
| 550 | 翻译 en | "This batch is no longer available." |
| 550 | 翻译 zh | "此批次已不可用。" |
| 551 | 翻译 en | "The result could not be confirmed. Check the latest batch state below before retrying." |
| 551 | 翻译 zh | "暂时无法确认操作结果。请检查下方最新批次状态，再决定是否重试。" |
| 552 | 翻译 en | "Batch progress could not be loaded. Your last displayed state has been kept; try refreshing." |
| 552 | 翻译 zh | "暂时无法加载批次进度，已保留上次显示的状态，请刷新重试。" |
| 553 | 翻译 en | "Batch progress could not be loaded. Try refreshing." |
| 553 | 翻译 zh | "暂时无法加载批次进度，请刷新重试。" |
| 554 | 翻译 en | "Sign in" |
| 554 | 翻译 zh | "重新登录" |
| 555 | 翻译 en | "Refresh status" |
| 555 | 翻译 zh | "刷新状态" |
| 560 | 翻译 en | "Card import" |
| 560 | 翻译 zh | "名片导入" |
| 561 | 翻译 en | "Loading batch…" |
| 561 | 翻译 zh | "正在加载批次…" |
| 562 | 翻译 en | "Back to contacts" |
| 562 | 翻译 zh | "返回名片夹" |

## repos/orbits/app/(app)/app/contacts/new/batch/[id]/page.tsx

源码：[page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/new/batch/[id]/page.tsx>)

静态来源入口：`/app/contacts/new/batch/[id]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 31 | BusinessCardBatchPage | main |  | orbit-page |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 40 | link/a · BusinessCardBatchPage | ← 导入中心 | /app/contacts/new | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 44 | JSX文字 | ← 导入中心 |

## repos/orbits/app/(app)/app/contacts/new/batch2/[id]/business-card-ingest-v2-view.tsx

源码：[business-card-ingest-v2-view.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/new/batch2/[id]/business-card-ingest-v2-view.tsx>)

静态来源入口：`/app/contacts/new/batch2/[id]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 419 | BusinessCardIngestV2View | section | globalError ? &lt;div className="bci-warn"&gt;{globalError}&lt;/div&gt; : null renderPhase() | bci-shell |
| 467 | renderPhase | h2 | batch.status === "cancelled" ? t({ en: "Batch cancelled", zh: "批次已取消" }) : t({ en: "Batch expired", zh: "批次已过期" }) |  |
| 490 | renderPhase | h2 | t({ en: "Batch completed", zh: "批次已完成" }) |  |
| 524 | renderCollecting | h2 | t({ en: "Uploading photos…", zh: "正在上传照片…" }) |  |
| 641 | renderProcessing | h2 | t({ en: "Recognizing your cards…", zh: "正在识别名片…" }) |  |
| 685 | renderReview | h2 | t({ en: "All cards reviewed", zh: "全部卡片已处理" }) |  |
| 787 | ReviewPane | h2 | # item.seq · item.sourceFileName |  |

### 本地状态（用于发现隐藏子界面）

| 行 | 状态声明 |
| --- | --- |
| 256 | [detail, setDetail] = useState&lt;IngestBatchDetail \| null&gt;(null) |
| 257 | [busy, setBusy] = useState(false) |
| 258 | [duplicateItemId, setDuplicateItemId] = useState&lt;string \| null&gt;(null) |
| 259 | [manualItemId, setManualItemId] = useState&lt;string \| null&gt;(null) |
| 260 | [uploadStates, setUploadStates] = useState&lt;Record&lt;string, UploadPhaseState&gt;&gt;({}) |
| 261 | [globalError, setGlobalError] = useState&lt;string \| null&gt;(null) |
| 266 | [replaceTarget, setReplaceTarget] = useState&lt;IngestItemDTO \| null&gt;(null) |
| 764 | [fields, setFields] = useState&lt;FixedFields&gt;(initial) |
| 765 | [editedItemId, setEditedItemId] = useState(item.id) |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 182 | button/button · ExtraContactSignals | t({ en: "Use as the email", zh: "填入邮箱" }) | onclick: () =&gt; onChange({ ...fields, email: email.value }) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 196 | button/button · ExtraContactSignals | fillable ? t({ en: "Use as the phone", zh: "填入电话" }) : undefined | onclick: fillable ? () =&gt; onChange({ ...fields, phone: point.value }) : undefined | {"disabled":"!fillable","renderGateProps":[],"conditions":[]} |
| 235 | field/input · FieldEditor | {t(label)} | onchange: (event) =&gt; onChange({ ...fields, [key]: event.target.value }) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 243 | field/textarea · FieldEditor | Notes (nothing gets lost) / 备注（其余信息都在这里） | onchange: (event) =&gt; onChange({ ...fields, notes: event.target.value }) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 421 | field/input · BusinessCardIngestV2View |  | onchange: (event) =&gt; { void attachFiles(event.target.files); event.target.value = ""; } | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 432 | field/input · BusinessCardIngestV2View |  | onchange: (event) =&gt; { const file = event.target.files?.[0]; if (file && replaceTarget) { void submitReplace(replaceTarget, file); } setReplaceTarget(null); event.target.value = ""; } | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 478 | link/a · renderPhase | Back to import center / 返回导入中心 | /app/contacts/new | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 495 | link/a · renderPhase | Open contacts / 查看名片夹 | /app/contacts | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 563 | button/button · renderCollecting | Exclude / 排除 | onclick: () =&gt; void withBusy(async () =&gt; { await postAction(`/${batchId}/items/${item.id}/exclude`); }) | {"disabled":"busy","renderGateProps":[],"conditions":[]} |
