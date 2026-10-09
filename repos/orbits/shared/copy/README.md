# shared/copy — 标准用词源（R03）

两端共用的固定说法：导航名、Task 分段、按钮动词、状态 chip、Toast、确认框、筛选、AI 卡、离线 / 错误 / 降级 / 加载、示例、配额、推送长按菜单、权限、首页编辑、草稿边界。

| 文件 | 说明 |
| --- | --- |
| `ja.ts` / `zh.ts` / `en.ts` | 唯一的源，纯常量、零 import。三语的组和键必须一致（测试守着）。 |

- 术语和写法：`docs/designs/redesign-2026-10/sprints/R03-copy-and-ja/glossary.md`、`style-guide.md`。设计稿原文照搬的句子不要改写。
- 改了之后：本仓库跑 `npm run copy:qa -- --shared`（必须 0 问题，`tests/copy-qa/shared-copy.test.ts` 也会检查），再到 `repos/orbit-app` 跑 `npm run sync:contract`，把 App 副本 `src/api/copy/` 放进同一个提交。
- 读取：App `useStandardCopy()`（`src/i18n/standard-copy.ts`）；Web `standardCopyFor(language)`（`app/(app)/app/orbit-2026/copy/standard.ts`）。
- 组件类型（决定长度和语气检查）在 `scripts/copy-qa/kinds.mjs`。
