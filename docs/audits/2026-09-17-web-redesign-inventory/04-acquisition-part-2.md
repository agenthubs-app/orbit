| 581 | button/button · renderCollecting | Cancel batch / 取消批次 | onclick: () =&gt; void withBusy(async () =&gt; { await postAction(`/${batchId}/cancel`); }) | {"disabled":"busy","renderGateProps":[],"conditions":[]} |
| 594 | button/button · renderCollecting | Re-attach photos / 重新选择照片 | onclick: () =&gt; reattachRef.current?.click() | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 603 | button/button · renderCollecting | Retry upload / 重试上传 | onclick: () =&gt; void pumpUploads() | {"disabled":"busy \|\| Object.values(uploadStates).some((state) =&gt; state.kind === \"uploading\")","renderGateProps":[],"conditions":[]} |
| 610 | button/button · renderCollecting | Start recognition / 开始识别 | onclick: () =&gt; void withBusy(async () =&gt; { const response = await postAction(`/${batchId}/finalize`); if (!response.ok) { const body = (await response.json().catch(() =&gt; null)) as { error?: { message?: string }; } \| null; setGlobalError(body?.error?.message ?? `HTTP ${response.status}`); } }) | {"disabled":"busy \|\| !readyToFinalize","renderGateProps":[],"conditions":[]} |
| 694 | callback-control/ReviewPane · renderReview |  | onconfirm: (fields, allowDuplicate, manual) =&gt; void submitConfirm(currentItem, fields, allowDuplicate, manual); onretry: () =&gt; void withBusy(async () =&gt; { await postAction(`/${batchId}/items/${currentItem.id}/retry`); }) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 819 | callback-control/FieldEditor · ReviewPane |  | onchange: setFields | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 822 | callback-control/ExtraContactSignals · ReviewPane |  | onchange: setFields | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 838 | button/button · ReviewPane | Skip this card / 跳过此卡 / Skip / 跳过 | onclick: onSkip | {"disabled":"busy","renderGateProps":[],"conditions":[]} |
| 844 | button/button · ReviewPane | Create anyway / 仍然创建 / Confirm and next / 确认并下一张 | onclick: () =&gt; onConfirm(fields, duplicate, false) | {"disabled":"busy \|\| nameMissing","renderGateProps":[],"conditions":[]} |
| 856 | button/button · ReviewPane | Back / 返回 | onclick: onManualToggle | {"disabled":"busy","renderGateProps":[],"conditions":[]} |
| 859 | button/button · ReviewPane | Save manual entry / 保存手工录入 | onclick: () =&gt; onConfirm(fields, duplicate, true) | {"disabled":"busy \|\| nameMissing","renderGateProps":[],"conditions":[]} |
| 870 | button/button · ReviewPane | Replace photo / 替换图片 | onclick: onReplace | {"disabled":"busy","renderGateProps":[],"conditions":[]} |
| 873 | button/button · ReviewPane | Type it in / 手工录入 | onclick: onManualToggle | {"disabled":"busy","renderGateProps":[],"conditions":[]} |
| 876 | button/button · ReviewPane | Retry recognition / 重试识别 | onclick: onRetry | {"disabled":"busy","renderGateProps":[],"conditions":[]} |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 106 | 文案/数据常量 en | "Preparing" |
| 106 | 文案/数据常量 zh | "准备中" |
| 107 | 文案/数据常量 en | "Confirmed" |
| 107 | 文案/数据常量 zh | "已收录" |
| 108 | 文案/数据常量 en | "Excluded" |
| 108 | 文案/数据常量 zh | "已排除" |
| 109 | 文案/数据常量 en | "Recognized" |
| 109 | 文案/数据常量 zh | "已识别" |
| 110 | 文案/数据常量 en | "Reading" |
| 110 | 文案/数据常量 zh | "识别中" |
| 111 | 文案/数据常量 en | "Waiting" |
| 111 | 文案/数据常量 zh | "排队中" |
| 112 | 文案/数据常量 en | "Skipped" |
| 112 | 文案/数据常量 zh | "已跳过" |
| 113 | 文案/数据常量 en | "Failed" |
| 113 | 文案/数据常量 zh | "识别失败" |
| 114 | 文案/数据常量 en | "Uploaded" |
| 114 | 文案/数据常量 zh | "已上传" |
| 124 | 文案/数据常量 en | "No name was recognized on this card." |
| 124 | 文案/数据常量 zh | "没有识别到姓名。" |
| 125 | 文案/数据常量 en | "An email address looks invalid — check it against the card." |
| 125 | 文案/数据常量 zh | "有邮箱格式可疑，请对照图片核对。" |
| 126 | 文案/数据常量 en | "A phone number looks invalid — check it against the card." |
| 126 | 文案/数据常量 zh | "有电话号码可疑，请对照图片核对。" |
| 127 | 文案/数据常量 en | "Multiple offices are printed — confirm the primary one." |
| 127 | 文案/数据常量 zh | "名片上有多个办公地点，请确认主要地点。" |
| 128 | 文案/数据常量 en | "The same number appears under more than one label." |
| 128 | 文案/数据常量 zh | "同一号码出现在多个标签下，请确认归属。" |
| 129 | 文案/数据常量 en | "Native and romanized names differ — confirm which is primary." |
| 129 | 文案/数据常量 zh | "原文姓名与罗马字拼写不同，请确认主名。" |
| 130 | 文案/数据常量 en | "The company name may be missing a legal suffix (株式会社 / Inc. …)." |
| 130 | 文案/数据常量 zh | "公司名可能丢失了「株式会社／Inc.」等后缀，请对照图片补全。" |
| 131 | 文案/数据常量 en | "A second character-level read disagrees with a field — verify it character by character." |
| 131 | 文案/数据常量 zh | "二次逐字符识别与结果不一致，请对照图片逐字核对标出的字段。" |
| 150 | 文案/数据常量 en | "Phone" |
| 150 | 文案/数据常量 zh | "电话" |
| 151 | 文案/数据常量 en | "Mobile" |
| 151 | 文案/数据常量 zh | "手机" |
| 152 | 文案/数据常量 en | "Fax" |
| 152 | 文案/数据常量 zh | "传真" |
| 153 | 文案/数据常量 en | "WeChat" |
| 153 | 文案/数据常量 zh | "微信" |
| 154 | 文案/数据常量 en | "LINE" |
| 155 | 文案/数据常量 en | "WhatsApp" |
| 156 | 文案/数据常量 en | "Website" |
| 156 | 文案/数据常量 zh | "网站" |
| 157 | 文案/数据常量 en | "Other" |
| 157 | 文案/数据常量 zh | "其他" |
| 180 | 翻译 en | "Also recognized" |
| 180 | 翻译 zh | "还识别到" |
| 182 | 属性 title | t({ en: "Use as the email", zh: "填入邮箱" }) |
| 186 | 翻译 en | "Use as the email" |
| 186 | 翻译 zh | "填入邮箱" |
| 189 | 翻译 en | "Email" |
| 189 | 翻译 zh | "邮箱" |
| 196 | 属性 title | fillable ? t({ en: "Use as the phone", zh: "填入电话" }) : undefined |
| 201 | 翻译 en | "Use as the phone" |
| 201 | 翻译 zh | "填入电话" |
| 225 | 文案/数据常量 en | "Name" |
| 225 | 文案/数据常量 zh | "姓名" |
| 226 | 文案/数据常量 en | "Company" |
| 226 | 文案/数据常量 zh | "公司" |
| 227 | 文案/数据常量 en | "Title" |
| 227 | 文案/数据常量 zh | "职位" |
| 228 | 文案/数据常量 en | "Email" |
| 228 | 文案/数据常量 zh | "邮箱" |
| 229 | 文案/数据常量 en | "Phone" |
| 229 | 文案/数据常量 zh | "电话" |
| 230 | 文案/数据常量 en | "How you met" |
| 230 | 文案/数据常量 zh | "认识场景" |
| 242 | 翻译 en | "Notes (nothing gets lost)" |
| 242 | 翻译 zh | "备注（其余信息都在这里）" |
| 448 | 翻译 en | "BATCH IMPORT" |
| 448 | 翻译 zh | "批量导入" |
| 456 | 翻译 en | "Originals are stored temporarily for import and scheduled for cleanup. Recognition images are hidden after you confirm or skip." |
| 457 | 翻译 zh | "原件会临时保存用于导入，并安排自动清理；确认或跳过后不再展示识别图片。" |
| 469 | 翻译 en | "Batch cancelled" |
| 469 | 翻译 zh | "批次已取消" |
| 470 | 翻译 en | "Batch expired" |
| 470 | 翻译 zh | "批次已过期" |
| 474 | 翻译 en | "Confirmed contacts are kept; everything else was cleaned up." |
| 475 | 翻译 zh | "已确认的联系人会保留，其余项目与图片均已清理。" |
| 479 | 翻译 en | "Back to import center" |
| 479 | 翻译 zh | "返回导入中心" |
| 490 | 翻译 en | "Batch completed" |
| 490 | 翻译 zh | "批次已完成" |
| 492 | 翻译 en | "Confirmed" |
| 492 | 翻译 zh | "已收录" |
| 493 | 翻译 en | "Skipped" |
| 493 | 翻译 zh | "已跳过" |
| 496 | 翻译 en | "Open contacts" |
| 496 | 翻译 zh | "查看名片夹" |
| 524 | 翻译 en | "Uploading photos…" |
| 524 | 翻译 zh | "正在上传照片…" |
| 527 | 翻译 en | "done" |
| 527 | 翻译 zh | "已就绪" |
| 528 | 翻译 en | "excluded" |
| 528 | 翻译 zh | "已排除" |
| 541 | 翻译 en | `${missingFiles.length} photo(s) need to be re-attached (the page was reloaded). Choose the same photos again — they are matched by content.` |
| 542 | 翻译 zh | `${missingFiles.length} 张照片需要重新挂载（页面曾刷新）。重新选择同一批照片即可，系统按内容自动匹配。` |
| 552 | 文案/数据常量 en | "Uploading…" |
| 552 | 文案/数据常量 zh | "上传中…" |
| 555 | 文案/数据常量 en | "Waiting for file" |
| 555 | 文案/数据常量 zh | "等待文件" |
| 573 | 翻译 en | "Exclude" |
| 573 | 翻译 zh | "排除" |
| 591 | 翻译 en | "Cancel batch" |
| 591 | 翻译 zh | "取消批次" |
| 599 | 翻译 en | "Re-attach photos" |
| 599 | 翻译 zh | "重新选择照片" |
| 607 | 翻译 en | "Retry upload" |
| 607 | 翻译 zh | "重试上传" |
| 626 | 翻译 en | "Start recognition" |
| 626 | 翻译 zh | "开始识别" |
| 641 | 翻译 en | "Recognizing your cards…" |
| 641 | 翻译 zh | "正在识别名片…" |
| 644 | 翻译 en | "You can leave this page — processing continues in the background." |
| 645 | 翻译 zh | "可以离开本页，识别在后台继续；回来时进度自动恢复。" |
| 665 | 翻译 en | "retrying" |
| 665 | 翻译 zh | "等待重试" |
| 685 | 翻译 en | "All cards reviewed" |
| 685 | 翻译 zh | "全部卡片已处理" |
| 687 | 翻译 en | "Confirmed" |
| 687 | 翻译 zh | "已收录" |
| 688 | 翻译 en | "Skipped" |
| 688 | 翻译 zh | "已跳过" |
| 784 | 翻译 en | "REVIEW" |
| 784 | 翻译 zh | "逐张确认" |
| 785 | 翻译 en | "left" |
| 785 | 翻译 zh | "张待处理" |
| 793 | 属性 alt | t({ en: "Card image", zh: "名片图片" }) |
| 793 | 翻译 en | "Card image" |
| 793 | 翻译 zh | "名片图片" |
| 796 | 翻译 en | "Image removed" |
| 796 | 翻译 zh | "图片已删除" |
| 803 | 翻译 en | "Recognition failed" |
| 803 | 翻译 zh | "识别失败" |
| 806 | 翻译 en | "the photo may be too hard to read" |
| 806 | 翻译 zh | "照片可能过难识别" |
| 827 | 翻译 en | "Looks like this person already exists in your contacts." |
| 828 | 翻译 zh | "该联系人似乎已存在于你的名片夹。" |
| 840 | 翻译 en | "Skip this card" |
| 840 | 翻译 zh | "跳过此卡" |
| 841 | 翻译 en | "Skip" |
| 841 | 翻译 zh | "跳过" |
| 851 | 翻译 en | "Create anyway" |
| 851 | 翻译 zh | "仍然创建" |
| 852 | 翻译 en | "Confirm and next" |
| 852 | 翻译 zh | "确认并下一张" |
| 857 | 翻译 en | "Back" |
| 857 | 翻译 zh | "返回" |
| 865 | 翻译 en | "Save manual entry" |
| 865 | 翻译 zh | "保存手工录入" |
| 871 | 翻译 en | "Replace photo" |
| 871 | 翻译 zh | "替换图片" |
| 874 | 翻译 en | "Type it in" |
| 874 | 翻译 zh | "手工录入" |
| 877 | 翻译 en | "Retry recognition" |
| 877 | 翻译 zh | "重试识别" |

## repos/orbits/app/(app)/app/contacts/new/batch2/[id]/page.tsx

源码：[page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/new/batch2/[id]/page.tsx>)

静态来源入口：`/app/contacts/new/batch2/[id]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 37 | BusinessCardIngestV2BatchPage | main |  | orbit-page |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 46 | link/a · BusinessCardIngestV2BatchPage | ← 导入中心 | /app/contacts/new | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 50 | JSX文字 | ← 导入中心 |

## repos/orbits/app/(app)/app/contacts/new/batch2/business-card-ingest-v2-start.tsx

源码：[business-card-ingest-v2-start.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/new/batch2/business-card-ingest-v2-start.tsx>)

静态来源入口：`/app/contacts/new/batch2`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 141 | BusinessCardIngestV2Start | section | error ? &lt;div className="bci-warn"&gt;{error}&lt;/div&gt; : null | bci-start |
| 144 | BusinessCardIngestV2Start | h2 | t({ en: "Photograph your cards", zh: "拍好名片，再一次导入" }) |  |

### 本地状态（用于发现隐藏子界面）

| 行 | 状态声明 |
| --- | --- |
| 74 | [error, setError] = useState&lt;string \| null&gt;(null) |
| 75 | [preparing, setPreparing] = useState(false) |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 170 | field/input · BusinessCardIngestV2Start |  | onchange: (event) =&gt; void startBatch(event.target.files) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 178 | button/button · BusinessCardIngestV2Start | Preparing… / 准备中… / Choose photos / 选择名片照片 | onclick: () =&gt; inputRef.current?.click() | {"disabled":"preparing","renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 119 | startBatch | 调用 | POST | INGEST_V2_API_BASE |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 35 | 文案/数据常量 en | "One card per photo" |
| 35 | 文案/数据常量 zh | "一卡一照" |
| 37 | 文案/数据常量 en | "Shoot each card separately — multiple cards in one photo confuse recognition." |
| 38 | 文案/数据常量 zh | "每张名片单独拍一张。一张照片拍多张名片，识别很可能不准确。" |
| 44 | 文案/数据常量 en | "Fill the frame, face-on" |
| 44 | 文案/数据常量 zh | "正对名片、填满画面" |
| 46 | 文案/数据常量 en | "Hold the phone parallel to the card and let it fill most of the frame." |
| 47 | 文案/数据常量 zh | "手机与名片平行，让名片占据画面大部分，不歪斜。" |
| 53 | 文案/数据常量 en | "Good light, no glare" |
| 53 | 文案/数据常量 zh | "光线充足、避免反光" |
| 55 | 文案/数据常量 en | "Even lighting beats flash — tilt slightly if the card is glossy." |
| 56 | 文案/数据常量 zh | "均匀光线优于闪光灯；名片反光时稍微倾斜避开高光。" |
| 62 | 文案/数据常量 en | "Avoid: piles & backgrounds" |
| 62 | 文案/数据常量 zh | "避免：多卡合拍、杂乱背景" |
| 64 | 文案/数据常量 en | "No card stacks, no busy desks, no fingers over the text." |
| 65 | 文案/数据常量 zh | "不要一次拍一摞名片，不要杂乱桌面，不要手指遮挡文字。" |
| 87 | 翻译 en | `At most ${INGEST_V2_MAX_ITEMS} photos per batch.` |
| 88 | 翻译 zh | `每批最多 ${INGEST_V2_MAX_ITEMS} 张照片。` |
| 97 | 翻译 en | `${oversize.name} exceeds the 10 MiB per-photo limit.` |
| 98 | 翻译 zh | `${oversize.name} 超过单张 10 MiB 上限。` |
| 143 | 翻译 en | "BATCH IMPORT" |
| 143 | 翻译 zh | "批量导入" |
| 144 | 翻译 en | "Photograph your cards" |
| 144 | 翻译 zh | "拍好名片，再一次导入" |
| 147 | 翻译 en | `Pick up to ${INGEST_V2_MAX_ITEMS} photos (${RECOMMENDED_MAX} or fewer works best). Each photo should contain exactly one card.` |
| 148 | 翻译 zh | `一次最多选择 ${INGEST_V2_MAX_ITEMS} 张（建议每批 20–${RECOMMENDED_MAX} 张）。请确保一张照片只包含一张名片。` |
| 164 | 翻译 en | "One photo, one card — multi-card photos are often recognized incorrectly." |
| 165 | 翻译 zh | "一张照片只拍一张名片，多张合拍可能识别不准确。" |
| 185 | 翻译 en | "Preparing…" |
| 185 | 翻译 zh | "准备中…" |
| 186 | 翻译 en | "Choose photos" |
| 186 | 翻译 zh | "选择名片照片" |

## repos/orbits/app/(app)/app/contacts/new/batch2/ingest-v2-client.ts

源码：[ingest-v2-client.ts](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/new/batch2/ingest-v2-client.ts>)

静态来源入口：`/app/contacts/new/batch2`、`/app/contacts/new/batch2/[id]`

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 13 | (module / render callback) | 路径常量 | 见调用/handler | "/api/contact-drafts/business-card/batches/v2" |
| 62 | fetchBatchDetail | 调用 | GET/由封装决定 | `${INGEST_V2_API_BASE}/${batchId}` |
| 91 | postAction | 调用 | POST | `${INGEST_V2_API_BASE}${path}` |

## repos/orbits/app/(app)/app/contacts/new/batch2/ingest-v2-content-transport.ts

源码：[ingest-v2-content-transport.ts](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/new/batch2/ingest-v2-content-transport.ts>)

静态来源入口：`/app/contacts/new/batch2/[id]`

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 5 | (module / render callback) | 路径常量 | 见调用/handler | "/api/contact-drafts/business-card/uploads" |
| 34 | json | 调用 | GET/由封装决定 | url |
| 66 | perform | 路径常量 | 见调用/handler | `/api/contact-drafts/business-card/batches/v2/${input.batchId}/items/${input.itemId}/${input.operation === "replace" ? "replace" : "content"}` |
| 73 | consume | 调用 | POST | `${BASE}/consume-v2` |
| 85 | perform | 调用 | POST | BASE |

## repos/orbits/app/(app)/app/contacts/new/batch2/ingest-v2-upload-feedback.ts

源码：[ingest-v2-upload-feedback.ts](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/new/batch2/ingest-v2-upload-feedback.ts>)

静态来源入口：`/app/contacts/new/batch2/[id]`

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 3 | 文案/数据常量 en | "This image could not be read. Choose another file." |
| 3 | 文案/数据常量 zh | "无法读取这张图片，请重新选择文件。" |
| 6 | 文案/数据常量 en | "Sign in again, then retry the upload." |
| 6 | 文案/数据常量 zh | "请重新登录后重试上传。" |
| 9 | 文案/数据常量 en | "The item has changed. Refresh and check it before retrying." |
| 9 | 文案/数据常量 zh | "这张名片已发生变化，请刷新核对后重试。" |
| 12 | 文案/数据常量 en | "This batch is no longer available. Return to the import center." |
| 12 | 文案/数据常量 zh | "此批次已不可用，请返回导入中心。" |
| 14 | 文案/数据常量 en | "Upload did not finish. Retry with the same file." |
| 14 | 文案/数据常量 zh | "上传尚未完成，请使用同一文件重试。" |

## repos/orbits/app/(app)/app/contacts/new/batch2/page.tsx

源码：[page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/new/batch2/page.tsx>)

静态来源入口：`/app/contacts/new/batch2`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 23 | BusinessCardIngestV2StartPage | main |  | orbit-page |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 32 | link/a · BusinessCardIngestV2StartPage | ← 导入中心 | /app/contacts/new | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 36 | JSX文字 | ← 导入中心 |

## repos/orbits/app/(app)/app/contacts/new/import/[id]/page.tsx

源码：[page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/new/import/[id]/page.tsx>)

静态来源入口：`/app/contacts/new/import/[id]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 32 | BusinessCardImportPage | main |  | orbit-page |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 41 | link/a · BusinessCardImportPage | ← 导入中心 | /app/contacts/new | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 45 | JSX文字 | ← 导入中心 |

## repos/orbits/app/(app)/app/contacts/orbit-real-cards-import.tsx

源码：[orbit-real-cards-import.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/orbit-real-cards-import.tsx>)

静态来源入口：`/app/contacts/new`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 203 | OrbitRealCardsImport | main |  | orbit-page |
| 214 | OrbitRealCardsImport | h1 | t({ en: "Import hub", zh: "导入中心" }) | h-display |
| 222 | OrbitRealCardsImport | section | SOURCES.map((source) =&gt; ( &lt;SourceCard businessCardAvailability={businessCardAvailability} key={source.key} onSelect={() =&gt; setSelectedSource(source.key)} selected={selectedSource === source.key} source={source} t={t} /&gt; )) businessCardAvailability.available ? &lt;BusinessCardBatchEntry /&gt; : null |  |

### 本地状态（用于发现隐藏子界面）

| 行 | 状态声明 |
| --- | --- |
| 200 | [selectedSource, setSelectedSource] = useState("scan") |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 163 | button/button · SourceCard | available ? undefined : unavailableTitle | onclick: available ? onSelect : undefined | {"disabled":"!available","renderGateProps":[],"conditions":[]} |
| 231 | callback-control/SourceCard · OrbitRealCardsImport |  | onselect: () =&gt; setSelectedSource(source.key) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 265 | link/a · OrbitRealCardsImport | t({ en: "Back", zh: "返回" }) | /app/contacts | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 32 | 文案/数据常量 en | "Scan business card" |
| 32 | 文案/数据常量 zh | "名片扫描" |
| 33 | 文案/数据常量 en | "Photo or upload · OCR extraction" |
| 33 | 文案/数据常量 zh | "拍照或上传，OCR 自动识别" |
| 35 | 文案/数据常量 en | "Medium · field review" |
| 35 | 文案/数据常量 zh | "可信度 中 · 需逐字段复核" |
| 36 | 文案/数据常量 en | "Active" |
| 36 | 文案/数据常量 zh | "当前" |
| 42 | 文案/数据常量 en | "QR connect" |
| 42 | 文案/数据常量 zh | "现场扫码" |
| 43 | 文案/数据常量 en | "Both scan · mutually confirmed" |
| 43 | 文案/数据常量 zh | "双方扫码，可信度高" |
| 45 | 文案/数据常量 en | "High trust" |
| 45 | 文案/数据常量 zh | "可信度 高" |
| 51 | 文案/数据常量 en | "Event attendees" |
| 51 | 文案/数据常量 zh | "活动名单导入" |
| 52 | 文案/数据常量 en | "Import attendees · tag relationship state" |
| 52 | 文案/数据常量 zh | "导入参会者，区分关系状态" |
| 54 | 文案/数据常量 en | "Batch · pending" |
| 54 | 文案/数据常量 zh | "批量 · 待确认" |
| 60 | 文案/数据常量 en | "Contacts import" |
| 60 | 文案/数据常量 zh | "通讯录导入" |
| 61 | 文案/数据常量 en | "Phone / Google / CSV" |
| 61 | 文案/数据常量 zh | "手机 / Google / CSV" |
| 63 | 文案/数据常量 en | "Low · needs vetting" |
| 63 | 文案/数据常量 zh | "可信度 低 · 需核对" |
| 69 | 文案/数据常量 en | "Referral" |
| 69 | 文案/数据常量 zh | "推荐关系" |
| 70 | 文案/数据常量 en | "Requires intermediary consent" |
| 70 | 文案/数据常量 zh | "需中间人知情" |
| 72 | 文案/数据常量 en | "Consent required" |
| 72 | 文案/数据常量 zh | "需知情同意" |
| 154 | 翻译 en | "Cloud business-card recognition is not configured for this environment." |
| 155 | 翻译 zh | "当前环境尚未配置云端名片识别。" |
| 158 | 翻译 en | "This source is not connected in the current environment." |
| 159 | 翻译 zh | "当前环境尚未连接这个来源。" |
| 163 | 属性 title | available ? undefined : unavailableTitle |
| 179 | 翻译 en | "Unavailable" |
| 179 | 翻译 zh | "不可用" |
| 180 | 翻译 en | "Not connected" |
| 180 | 翻译 zh | "未连接" |
| 214 | 翻译 en | "Import hub" |
| 214 | 翻译 zh | "导入中心" |
| 216 | 翻译 en | "Pick a source, or review the scanned card draft" |
| 216 | 翻译 zh | "选择来源，或复核右侧名片扫描草稿" |
| 225 | 翻译 en | "Add contacts" |
| 225 | 翻译 zh | "来源入口" |
| 226 | 翻译 en | "Where from?" |
| 226 | 翻译 zh | "从哪里导入？" |
| 244 | 翻译 en | "Every source creates a draft first; nothing is written to your contacts until you confirm." |
| 245 | 翻译 zh | "所有来源都先生成待确认草稿，确认前不写入联系人库。" |
| 265 | 属性 aria-label | t({ en: "Back", zh: "返回" }) |
| 265 | 翻译 en | "Back" |
| 265 | 翻译 zh | "返回" |
| 268 | 翻译 en | "Card review" |
| 268 | 翻译 zh | "名片复核" |
| 280 | 翻译 en | "Other sources" |
| 280 | 翻译 zh | "其他来源" |
| 285 | 属性 title | t({ en: "This source is not connected in the current environment.", zh: "当前环境尚未连接这个来源。", }) |
| 290 | 翻译 en | "This source is not connected in the current environment." |
| 291 | 翻译 zh | "当前环境尚未连接这个来源。" |
| 298 | 翻译 en | "Not connected" |
| 298 | 翻译 zh | "未连接" |


