# Sprint 0146 — 手动添加：公司、行业、自动保留草稿

**Plan revision:** 1。**模式:** existing-codebase / single-generator；运行状态以[登记表](../README.md#sprint-登记表)为准。
**原需求:** 用户 2026-11-02 需求 1「手动输入，可以添加公司，行业，保留草稿」；用户授权协调者自主决定方案、不出设计案。
**单一目标:** 手动添加表单常驻公司、新增行业、本机草稿。
**基线:** `chat-agent` 942280cd9；分支 `offline-fixes-20261102`（工作目录 `/Volumes/ORICO/Dev/worktrees/orbit/offline-fixes`）。

## 已确认的事实

- 页面 `src/screens/add/ManualContactScreen.tsx`、模型 `manual-model.ts:16-24,49-66`；公司是可选芯片，纯文本，有已有公司名建议。
- 行业在联系人模型里是固定目录 `primaryIndustryId`（`orbits/shared/contract/contacts.ts:76-79`、`industries.ts`），手动添加契约不接受；`ContactEditScreen.tsx` 有可复用的 `IndustryPickerSheet`。
- 草稿可参照 `src/storage/note-draft-storage.ts`（按服务器 + 账号区分）。

## 决定（协调者）

- 公司改为默认显示（不再藏在芯片里）；行业放在公司下面，可选，单选主行业。
- 手动添加契约两端加可选 `primaryIndustryId`，服务端校验目录并写入联系人。
- 草稿：字段变化后防抖写入；打开时恢复并提示，可清空；保存成功、主动清空、退出登录时删除。草稿不参与重复检查和幂等编号计算，恢复后重新计算。

## 范围与文件

- App：`ManualContactScreen.tsx`、`manual-model.ts`、草稿存储（新文件）、i18n、契约副本、测试。
- 服务器：`shared/api-schema/manual-contact.ts`、`features/contacts/manual-contact-v2/service.ts`、测试。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0146-01 | 填公司和行业保存，联系人记录有 organization 与 primaryIndustryId；非法行业被拒 | 服务器真路由测试 + App 测试 |
| SC-0146-02 | 填一半离开再打开自动恢复；保存后草稿删除；换账号看不到别人的草稿 | App 测试 |
| SC-0146-03 | phoneweb 截图：表单、行业选择、恢复提示 | 截图 |
| SC-0146-04 | 两端全量与类型检查无新增失败 | 命令与计数 |
