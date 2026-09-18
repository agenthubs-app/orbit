# PW-0004 — 平台能力验证结果

## 结果摘要

结果为 **通过，代码修复可交付**。Web 批量名片原先把浏览器 `blob:` 当成非法本机 URI，现已通过平台适配器读取浏览器 `File`／Blob，并在分配完整缓冲区前检查 10 MiB 上限。原生仍只接受 `file://`／`content://`。

批量名片、单张名片、资料图片／文件、分享失败提示、推送开关与收件箱均获得独立浏览器证据。单张名片的早期探针在 hydration 前点击时两次未捕获 chooser；主线随后在 32111 等待 network-idle 后以独立 Chromium 捕获真实 filechooser 事件、选择 186 字节 PNG，并确认摘要、文件大小和页面错误计数。这里的“真实 filechooser”指浏览器事件 + Playwright `setFiles`，不声称人工操作了实体 OS 对话框。

## SC 结果

| SC | 结果 | 证据与边界 |
| --- | --- | --- |
| PW-0004-01 | pass | 32111 Chromium 捕获真实 file chooser，选择 `orbit-pw0004-card.png` 后文件名可见、创建按钮启用、无页面异常。 |
| PW-0004-02 | pass | 创建与上传在浏览器进程本地拦截；manifest SHA-256、rawSize、上传 SHA-256 和逐字节内容均与本地 PNG 相等。未请求 OCR，未写后端。 |
| PW-0004-03 | pass | `/profile/edit` → `/profile/more` 的图片和 TXT chooser 均成功，文件名可见且未提取。主线 32111 独立 Chromium 等待 hydration 后捕获单张名片 filechooser，186 字节 PNG 的 rawSize／摘要匹配、page errors 为 0；创建请求本地拦截 503，未写后端。 |
| PW-0004-04 | pass | 合成本地活动详情显示分享入口；注入 `navigator.share` 失败后显示“暂时无法分享，请重试。”，无页面异常。范围内没有浏览器下载动作，下载事件为 0；这是能力缺席记录，不是下载成功。 |
| PW-0004-05 | pass | `/settings` 的 System push 完成 on→off 往返，push token／mobile credential 请求为 0；`/inbox` 标题可见。 |

## 改动

功能 commit：`7496eb46f`（`fix(app): read browser batch image blobs`）。

- `src/api/batch-image-source.ts`：原生文件源，继续限制 `file://`／`content://`。
- `src/api/batch-image-source.web.ts`：Web `blob:` + picker `File`／fetch Blob 文件源，先暴露 size，再惰性读取字节。
- `src/api/batch-images.ts`：统一经平台文件源执行大小、魔数、MIME 和摘要校验。
- `tests/batch-images-web.test.ts`：真实浏览器 File/blob 读取、远程 URL 拒绝、超大 Blob 不分配缓冲区。
- `tests/batch-images.test.ts`：选择器已提供超大文件元数据时提前拒绝。
- `tests/business-card-ingest-interactions.test.ts`：Web fixture 改为符合 Expo Web 的 `blob:`／File 形态，并保留读取控制。

## 影响分析

`readOriginal` 为 HIGH：2 个直接消费者、10 个间接符号、跨 3 个模块，未索引到业务执行流。`prepareBatchImages` 为 MEDIUM（5 个直接消费者、9 个总消费者）；`prepareBatchImage` 和 `readPreparedBatchImage` 为 LOW；平台 `openFile` 为 UNKNOWN。由于共享读取边界为 HIGH，本轮未扩大功能，只增加平台源并保留原生 URI 语义，依靠原有与新增定向测试保护。

## 验证记录

- `batch-images.test.ts` + `batch-images-web.test.ts`：22/22。
- `business-card-ingest-interactions.test.ts`：150/150。
- `npm run typecheck`：exit 0。
- Expo Web export：89 routes，完成；只有既知 expo-notifications Web warning。
- 32111 浏览器探针：批量 manifest／上传摘要和字节全部相等；profile 图片／文档 chooser 通过；share 失败可见；push 注册请求 0；收件箱可达；page errors 0。

未运行完整 App 回归，按任务约定留给主线集成。未调用付费 OCR/AI/provider，未发送消息，未注册 push token，未保留真实业务写入。

## 已知边界

浏览器自动化使用 Playwright `setFiles` 响应 filechooser 事件，没有人工操作实体 OS 对话框；图片识别与资料提取也未执行。早期在 hydration 前点击单张名片选择器会错失 chooser 事件，最终证据在 network-idle 后取得，因此后续 E2E 应显式等待页面可交互状态。
