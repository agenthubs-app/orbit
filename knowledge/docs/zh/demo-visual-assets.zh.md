# Orbit 演示视觉资产规则（Sprint 96）

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/docs/architecture/demo-visual-assets.md` |
| 中文镜像 | `knowledge/docs/zh/demo-visual-assets.zh.md` |
| 分类 | `architecture` |
| 状态 | `current` |
| 新鲜度 | `likely-current` |
| 负责人域 | `app` |

## 怎么读

这页是当前阅读入口。具体字段、函数签名和运行行为仍以原始来源、相关代码路径和测试为准。

已登记来源和关联代码，但后续改动仍需要重新核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

规定演示活动/用户/联系人的本地视觉资产只能经 shared/demo-visual-assets.ts 读取 public/orbit-demo-assets/manifest.json，禁止组件硬编码路径与远程热链图片，并定义 manifest 字段、生成提示词、授权姿态、替换流程和 mock-to-live 替换边界。

## 审计依据

当前权威的资产存放与替换规则文档；覆盖范围与断言以 repos/orbits/tests/capabilities/demo-visual-asset-coverage.test.ts 等测试和 shared/demo-visual-assets.ts 代码为准。

## 结构化阅读入口

- 第 1 节：Orbit 演示视觉资产
- 第 2 节：存放规则
- 第 3 节：生成提示词
- 第 4 节：授权姿态
- 第 5 节：替换流程
- 第 6 节：Mock-to-live 替换边界

## 保留的代码与命令证据

### 代码证据 1

```text
AI-style editorial illustration for an Orbit relationship event.
Show a professional business gathering with a table, people in conversation,
soft ambient light, and no brand logos. The image should feel like a polished
product demo scene, not a stock photo. No remote source, no watermark.
```

### 代码证据 2

```text
AI-style generated portrait avatar for an Orbit demo contact.
Create a clean editorial head-and-shoulders portrait with a soft abstract
background, professional expression, no text, no logo, and no watermark.
```

## 源文档正文

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
4. 运行：
   `npm test -- tests/capabilities/demo-visual-asset-coverage.test.ts tests/pages/app-demo-visual-assets.test.tsx`
5. 再运行 `npm run lint` 和 `npm run build`，确认没有 broken URL、空 alt text
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
