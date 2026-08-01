# Orbit 演示视觉资产

Sprint 96 为演示活动、用户和联系人补齐本地视觉资产。所有页面只通过
`shared/demo-visual-assets.ts` 读取 `public/orbit-demo-assets/manifest.json`，
不要在组件里硬编码图片路径。

## 存放规则

- 生成媒体文件必须放在 `public/orbit-demo-assets`。
- 活动场景图放在 `public/orbit-demo-assets/events`。
- 用户和联系人头像放在 `public/orbit-demo-assets/avatars`。
- 禁止使用 remote hotlinked image URL。
- Manifest 里的每条资产必须有 `assetId`、`recordId`、`kind`、`src`、`alt`
  和 `sourceLabel`。
- 页面上渲染 manifest 图片时，带有 `data-demo-visual-asset-id` 的元素也必须带有
  `data-demo-visual-source-label`，用于测试和后续溯源验证；该属性不作为用户可见文案。

## 产品图片加载规范

活动封面、联系人照片等用户可见图片统一走
`shared/ui/orbit-progressive-image.tsx`，不直接使用裸 `<img>`：

- 使用 Next Image 根据真实槽位的 `sizes` 生成响应式 `srcset`；固定缩略图声明准确
  像素宽度，大卡和 Hero 使用断点尺寸。
- 首屏 HTML 内联低清 LQIP，图片下载和解码期间展示同源模糊预览，不回退到旧彩色
  渐变或纯色空块。
- 浏览器 `decode()` 完成后，原图与 LQIP 在 220ms 内交叉淡入淡出；边缘可读性遮罩
  与原图同步出现，避免第二次色调跳变。
- 容器必须提前保留宽高或宽高比，图片加载不得引起布局位移。
- 只有首屏主图可以 eager/preload，其余图片保持 lazy；同时遵守系统的
  `prefers-reduced-motion` 设置。

`npm run images:lqip` 会扫描 `public/orbit-covers` 和
`public/orbit-demo-assets`，生成并更新
`shared/ui/orbit-image-lqip.generated.ts`。`npm run build` 会在编译前自动执行该步骤。
新增或替换本地图片后必须运行生成器并提交生成文件。未来的 live/remote provider
必须提供可信 CDN 响应式变体、固有尺寸和 `blurDataURL`；缺少这些字段时只能使用
中性失败回退，不能把它视为正常加载状态。

## 生成提示词

活动场景图使用的提示词模板：

```text
AI-style editorial illustration for an Orbit relationship event.
Show a professional business gathering with a table, people in conversation,
soft ambient light, and no brand logos. The image should feel like a polished
product demo scene, not a stock photo. No remote source, no watermark.
```

头像使用的提示词模板：

```text
AI-style generated portrait avatar for an Orbit demo contact.
Create a clean editorial head-and-shoulders portrait with a soft abstract
background, professional expression, no text, no logo, and no watermark.
```

本次提交使用确定性的本地 SVG 来表达以上风格，便于测试和离线构建。以后替换为
真实生成的 PNG/WebP 时，仍然要保留相同 manifest 字段和本地路径规则。

## 授权姿态

这些文件是 Orbit demo 专用的本地生成资产，不来自第三方图库，也不引用外部 URL。
它们只用于产品演示、测试和本地预览。若以后使用外部设计工具或模型重新生成，
需要在 manifest 或本文档中记录来源、生成日期、使用权限和替换人。

## 替换流程

1. 在 `public/orbit-demo-assets/events` 或 `public/orbit-demo-assets/avatars`
   放入新的本地文件。
2. 更新 `public/orbit-demo-assets/manifest.json`，保持原有 `recordId` 稳定；
   如确实新增展示记录，新增对应 manifest entry。
3. 更新本文件的提示词、授权姿态或替换说明。
4. 运行 `npm run images:lqip`，提交更新后的
   `shared/ui/orbit-image-lqip.generated.ts`。
5. 运行：
   `npm test -- tests/capabilities/demo-visual-asset-coverage.test.ts tests/pages/app-demo-visual-assets.test.tsx`
6. 再运行 `npm run lint` 和 `npm run build`，确认没有 broken URL、空 alt text
   或缺失映射。

## Mock-to-live 替换边界

当前资产是 mock/demo media。Live 替换时新增的 provider 文件应位于资产边界旁：

- `shared/demo-visual-assets.ts` 继续作为 typed manifest accessor。
- 可新增 `shared/demo-visual-assets-live-provider.ts` 读取受信任的内部媒体库。
- 可新增 `shared/demo-visual-assets-mappers.ts` 把 live provider payload 映射回
  当前 `DemoVisualAsset` DTO。
- 需要的环境变量应只指向内部媒体库或签名 CDN 配置，不允许组件直接读取。
- Privacy/provenance 约束：头像不得从联系人真实账号抓取；必须有授权或生成记录；
  manifest 必须保留 `sourceLabel` 和稳定 `assetId`。
- 替换测试必须继续覆盖所有显示的活动、用户和联系人，并在新增展示记录缺图时失败。
