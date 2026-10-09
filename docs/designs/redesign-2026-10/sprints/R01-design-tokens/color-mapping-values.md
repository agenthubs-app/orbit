# R01 写死颜色值逐条清单

由脚本按色相和明度给出默认去向；实施时按所在位置的用途确认（规则见 [color-mapping.md](color-mapping.md)「按用途换色」）。「（看用途）」= 写法特殊（变量拼接等），实施时逐个判断。

## Web `repos/orbits/app/(app)/app/`（551 种，4832 处）

| 旧值 | 处数 | → 新 token | 说明 | 所在文件 |
| --- | --- | --- | --- | --- |
| `#FFFFFF` | 572 | `surface` | 作底色时；在深色 / 强调底上作文字时用 on-accent，照片上用 on-image | `app/(app)/app/account/auth-0918/auth-modal.tsx` `app/(app)/app/agent/iorbit-0918/console-styles.ts` `app/(app)/app/agent/iorbit-0918/iorbit-home-styles.ts` `app/(app)/app/agent/iorbit-0918/iorbit-my-plan-styles.ts` 等 40 个 |
| `#6B6F99` | 368 | `ink-3-text` | 0918 说明文字 | `app/(app)/app/account/auth-0918/auth-modal.tsx` `app/(app)/app/agent/iorbit-0918/console-styles.ts` `app/(app)/app/agent/iorbit-0918/iorbit-actions.tsx` `app/(app)/app/agent/iorbit-0918/iorbit-home-styles.ts` 等 33 个 |
| `#0E1225` | 349 | `ink` | 0918 主文字 | `app/(app)/app/account/auth-0918/auth-modal.tsx` `app/(app)/app/agent/iorbit-0918/console-styles.ts` `app/(app)/app/agent/iorbit-0918/iorbit-home-styles.ts` `app/(app)/app/agent/iorbit-0918/iorbit-my-plan-styles.ts` 等 29 个 |
| `#4B4FC7` | 332 | `accent-text` | 0918 强调；纯图形处用 accent | `app/(app)/app/_demo/demo-persona.ts` `app/(app)/app/account/auth-0918/auth-modal.tsx` `app/(app)/app/agent/iorbit-0918/console-styles.ts` `app/(app)/app/agent/iorbit-0918/iorbit-actions.tsx` 等 34 个 |
| `#2E3270` | 313 | `plum-900` | 0918 深强调（结论文字、深色 chip） | `app/(app)/app/account/auth-0918/auth-modal.tsx` `app/(app)/app/agent/iorbit-0918/console-styles.ts` `app/(app)/app/agent/iorbit-0918/iorbit-home-styles.ts` `app/(app)/app/agent/iorbit-0918/iorbit-my-plan-styles.ts` 等 33 个 |
| `#3B3F7A` | 288 | `ink-2` | 0918 次级文字 | `app/(app)/app/account/auth-0918/auth-modal.tsx` `app/(app)/app/agent/iorbit-0918/console-styles.ts` `app/(app)/app/agent/iorbit-0918/iorbit-home-styles.ts` `app/(app)/app/agent/iorbit-0918/iorbit-my-plan-styles.ts` 等 29 个 |
| `#ECEEFB` | 235 | `accent-soft` | 0918 面板 / 选中浅底；无强调含义的大块用 surface-2 | `app/(app)/app/account/auth-0918/auth-modal.tsx` `app/(app)/app/agent/iorbit-0918/console-styles.ts` `app/(app)/app/agent/iorbit-0918/iorbit-actions.tsx` `app/(app)/app/agent/iorbit-0918/iorbit-home-styles.ts` 等 33 个 |
| `#E8E9F6` | 224 | `line` | 0918 卡片边框 | `app/(app)/app/agent/iorbit-0918/console-styles.ts` `app/(app)/app/agent/iorbit-0918/iorbit-home-styles.ts` `app/(app)/app/agent/iorbit-0918/iorbit-my-plan-styles.ts` `app/(app)/app/agent/iorbit-0918/iorbit-plan-card-styles.ts` 等 24 个 |
| `#DDDEFA` | 222 | `line` | 0918 控件边框（新设计输入框靠 surface-2 底，不靠描边） | `app/(app)/app/account/auth-0918/auth-form.tsx` `app/(app)/app/account/auth-0918/auth-modal.tsx` `app/(app)/app/agent/iorbit-0918/console-styles.ts` `app/(app)/app/agent/iorbit-0918/iorbit-home-styles.ts` 等 30 个 |
| `#9FA3C4` | 151 | `ink-3-text` | 0918 弱提示文字（原本不达标） | `app/(app)/app/agent/iorbit-0918/console-styles.ts` `app/(app)/app/agent/iorbit-0918/iorbit-actions.tsx` `app/(app)/app/agent/iorbit-0918/iorbit-home-styles.ts` `app/(app)/app/agent/iorbit-0918/iorbit-my-plan-styles.ts` 等 23 个 |
| `#F7F7FD` | 142 | `surface-2` | 0918 浅面板 | `app/(app)/app/account/auth-0918/auth-modal.tsx` `app/(app)/app/agent/iorbit-0918/console-styles.ts` `app/(app)/app/agent/iorbit-0918/iorbit-styles.ts` `app/(app)/app/agent/iorbit-0918/plan-match-sheet.tsx` 等 21 个 |
| `#B9BCEB` | 138 | `plum-300` | 0918 焦点环 / 强调描边 | `app/(app)/app/account/auth-0918/auth-modal.tsx` `app/(app)/app/agent/iorbit-0918/console-styles.ts` `app/(app)/app/agent/iorbit-0918/iorbit-home-styles.ts` `app/(app)/app/agent/iorbit-0918/iorbit-my-plan-styles.ts` 等 24 个 |
| `#F1F1FA` | 43 | `surface-2` |  | `app/(app)/app/agent/iorbit-0918/console-styles.ts` `app/(app)/app/agent/iorbit-0918/iorbit-actions.tsx` `app/(app)/app/agent/iorbit-0918/iorbit-styles.ts` `app/(app)/app/contacts/card-batch-0918/card-batch-styles.ts` 等 14 个 |
| `#2F6B4F` | 41 | `ok-text` | 完成 / 成功文字 | `app/(app)/app/agent/iorbit-0918/iorbit-styles.ts` `app/(app)/app/contacts/card-batch-0918/card-batch-styles.ts` `app/(app)/app/contacts/network-0918/network-import-styles.ts` `app/(app)/app/contacts/network-0918/network-import.tsx` 等 13 个 |
| `#8B7BF0` | 37 | `accent` | 星空紫：图形用 accent，文字用 accent-text | `app/(app)/app/orbit-reference-styles.tsx` `app/(app)/app/orbit-starfield-desktop-logic.ts` `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile-logic.ts` 等 5 个 |
| `#B5473A` | 35 | `coral-text` | 错误 / 删除 | `app/(app)/app/agent/iorbit-0918/iorbit-actions.tsx` `app/(app)/app/agent/iorbit-0918/iorbit-styles.ts` `app/(app)/app/contacts/card-batch-0918/card-batch-styles.ts` `app/(app)/app/contacts/network-0918/network-shell.tsx` 等 10 个 |
| `#8A6420` | 31 | `mac-apricot-text` | 注意 / 提醒文字 | `app/(app)/app/contacts/card-batch-0918/card-batch-styles.ts` `app/(app)/app/contacts/network-0918/network-import-styles.ts` `app/(app)/app/contacts/network-0918/network-import.tsx` `app/(app)/app/contacts/network-0918/network-model.ts` 等 11 个 |
| `#E6F1EC` | 27 | `ok-soft` |  | `app/(app)/app/agent/iorbit-0918/iorbit-styles.ts` `app/(app)/app/contacts/card-batch-0918/card-batch-styles.ts` `app/(app)/app/contacts/network-0918/network-import.tsx` `app/(app)/app/contacts/network-0918/network-overview-model.ts` 等 10 个 |
| `#FBFBFE` | 20 | `bg` | 0918 页面底 | `app/(app)/app/agent/iorbit-0918/console-styles.ts` `app/(app)/app/agent/iorbit-0918/iorbit-shell.tsx` `app/(app)/app/agent/iorbit-0918/iorbit-styles.ts` `app/(app)/app/contacts/card-batch-0918/card-batch-styles.ts` 等 14 个 |
| `#FBF1DC` | 19 | `mac-apricot` | 黄 / 橙浅底 | `app/(app)/app/contacts/card-batch-0918/card-batch-styles.ts` `app/(app)/app/contacts/network-0918/network-import-styles.ts` `app/(app)/app/contacts/network-0918/network-import.tsx` `app/(app)/app/contacts/network-0918/network-model.ts` 等 10 个 |
| `#C9CBEA` | 16 | `line` | 分隔 / 描边 | `app/(app)/app/contacts/network-0918/network-analysis-structure.tsx` `app/(app)/app/contacts/network-0918/network-model.ts` `app/(app)/app/contacts/network-0918/network-shell.tsx` `app/(app)/app/events/events-0918/events-model.ts` 等 5 个 |
| `#EEEFF8` | 16 | `surface-2` | 浅灰面 | `app/(app)/app/contacts/network-0918/network-import-styles.ts` `app/(app)/app/contacts/network-0918/network-shell.tsx` `app/(app)/app/events/events-0918/events-shell.tsx` `app/(app)/app/orbit-landing-0918.tsx` 等 5 个 |
| `#D8B06A` | 16 | `mac-apricot-ink` | 金黄图形；文字用 mac-apricot-text | `app/(app)/app/orbit-starfield-desktop-logic.ts` `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile-logic.ts` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `#000000` | 15 | `ink` | 作文字时；阴影改 none 或 shadow-float | `app/(app)/app/orbit-global-ask/orbit-global-ask-styles.ts` `app/(app)/app/orbit-reference-styles.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `#C4461B` | 13 | `coral-text` | 错误 / 删除 | `app/(app)/app/agent/iorbit-0918/iorbit-home-styles.ts` `app/(app)/app/agent/iorbit-0918/iorbit-my-plan-styles.ts` `app/(app)/app/events/events-0918/community-card.tsx` `app/(app)/app/start/start-guide-styles.ts` |
| `#9A6B22` | 13 | `mac-apricot-text` | 注意 / 提醒文字 | `app/(app)/app/events/ops-0918/ops-model.ts` `app/(app)/app/events/ops-0918/ops-shell.tsx` |
| `#F4F5FC` | 12 | `accent-soft` | 紫浅底 | `app/(app)/app/agent/iorbit-0918/iorbit-home-styles.ts` `app/(app)/app/agent/iorbit-0918/iorbit-my-plan-styles.ts` `app/(app)/app/agent/iorbit-0918/iorbit-plan-card-styles.ts` `app/(app)/app/events/events-0918/community-card.tsx` 等 6 个 |
| `#CFC6FF` | 12 | `accent-soft` | 紫浅底 | `app/(app)/app/orbit-starfield-desktop-logic.ts` `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile-logic.ts` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `#FBECEA` | 11 | `coral-soft` | 红 / 橙红浅底 | `app/(app)/app/agent/iorbit-0918/iorbit-actions.tsx` `app/(app)/app/events/ops-0918/ops-model.ts` `app/(app)/app/events/ops-0918/ops-shell.tsx` `app/(app)/app/profile/profile-0918/profile-connect.tsx` |
| `#6359E9` | 10 | `accent-text` | 星空紫深 | `app/(app)/app/admin/compose-app-admin-platform-from-previously-approved-mock-first-capabilities/admin-platform-route-view-model.ts` `app/(app)/app/events/compose-app-events-demo-event-1-from-previously-approved-mock-first-capabilities/event-detail-view-model-adapter.ts` `app/(app)/app/events/compose-app-events-from-previously-approved-mock-first-capabilities/events-view-model-adapter.ts` `app/(app)/app/orbit-landing-route-view-model.ts` 等 6 个 |
| `#06050D` | 10 | `bg` | 星空底 → 跟随主题的页面底 | `app/(app)/app/orbit-reference-styles.tsx` `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `#C6A06A` | 10 | `mac-apricot-ink` | 金黄图形；文字用 mac-apricot-text | `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `rgba(255,255,255,0.10)` | 10 | `line` | 白色低透明：深色面上的分隔 | `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` `app/(app)/app/profile/profile-0918/business-card-preview.tsx` |
| `#AEB2DD` | 10 | `ink-4` | 装饰灰；作文字时用 ink-3-text | `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `#F0F1F8` | 9 | `surface-2` | 浅灰面 | `app/(app)/app/contacts/card-batch-0918/card-batch-styles.ts` `app/(app)/app/contacts/network-0918/network-analysis-structure.tsx` `app/(app)/app/contacts/network-0918/network-model.ts` `app/(app)/app/contacts/network-0918/network-overview-model.ts` 等 5 个 |
| `rgba(14,18,37,0.25)` | 9 | `（去掉阴影）/ shadow-float` | 黑色半透明：阴影，浮层用 shadow-float，其余去掉 | `app/(app)/app/contacts/card-batch-0918/card-batch-styles.ts` `app/(app)/app/contacts/network-0918/network-shell.tsx` `app/(app)/app/events/events-0918/events-shell.tsx` `app/(app)/app/events/ops-0918/ops-shell.tsx` 等 6 个 |
| `#ECEAF6` | 8 | `surface-2` | 浅灰面 | `app/(app)/app/orbit-reference-styles.tsx` `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `#A99FE8` | 8 | `plum-300` | 浅紫装饰 / 焦点 | `app/(app)/app/orbit-starfield-desktop-logic.ts` `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile-logic.ts` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `rgba(216,176,106,0.5)` | 8 | `mac-apricot-ink` | 金黄图形；文字用 mac-apricot-text | `app/(app)/app/orbit-starfield-desktop-logic.ts` `app/(app)/app/orbit-starfield-mobile-logic.ts` |
| `#3A2C11` | 8 | `ink` | 近黑 | `app/(app)/app/orbit-starfield-desktop-logic.ts` `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile-logic.ts` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `rgba(150,145,200,0.3)` | 8 | `plum-300` | 浅紫装饰 / 焦点 | `app/(app)/app/orbit-starfield-desktop-logic.ts` `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile-logic.ts` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `#F5F6FF` | 8 | `accent-soft` | 紫浅底 | `app/(app)/app/orbit-starfield-desktop-logic.ts` `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile-logic.ts` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `rgba(160,156,200,0.26)` | 8 | `surface-2` | 浅灰透明底 | `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `rgba(255,255,255,0.045)` | 8 | `line` | 白色低透明：深色面上的分隔 | `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `#DDD9EE` | 8 | `line` | 分隔 / 描边 | `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `rgba(150,138,245,0.55)` | 8 | `plum-300` | 浅紫装饰 / 焦点 | `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `#C6C9E6` | 8 | `line` | 分隔 / 描边 | `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `#FBEAEA` | 7 | `coral-soft` | 红 / 橙红浅底 | `app/(app)/app/contacts/card-batch-0918/card-batch-styles.ts` `app/(app)/app/profile/onboarding-0918/onboarding-styles.ts` `app/(app)/app/profile/profile-0918/profile-shell.tsx` |
| `#FBF1E4` | 7 | `mac-apricot` | 黄 / 橙浅底 | `app/(app)/app/events/ops-0918/ops-model.ts` `app/(app)/app/events/ops-0918/ops-shell.tsx` |
| `#B4413C` | 6 | `coral-text` | 错误 / 删除 | `app/(app)/app/agent/actions/orbit-all-actions-controls.tsx` `app/(app)/app/agent/actions/orbit-today-decision-form.tsx` `app/(app)/app/agent/agent-action-status-card.tsx` `app/(app)/app/events/[id]/orbit-post-event-followup-capture.tsx` |
| `rgba(255,255,255,0.14)` | 6 | `line` | 白色低透明：深色面上的分隔 | `app/(app)/app/agent/iorbit-0918/iorbit-home-styles.ts` `app/(app)/app/contacts/card-batch-0918/card-batch-styles.ts` `app/(app)/app/contacts/network-0918/network-shell.tsx` `app/(app)/app/orbit-reference-primitives.tsx` 等 5 个 |
| `rgba(0,0,0,.35)` | 6 | `（去掉阴影）/ shadow-float` | 黑色半透明：阴影，浮层用 shadow-float，其余去掉 | `app/(app)/app/contacts/analysis/analysis-goal-editor.tsx` `app/(app)/app/contacts/contact-interaction-editor.tsx` `app/(app)/app/contacts/contact-notes-editor.tsx` `app/(app)/app/contacts/contact-tag-editor.tsx` 等 6 个 |
| `#C2410C` | 6 | `coral-text` | 错误 / 删除 | `app/(app)/app/events/[id]/register/event-admission-status-card.tsx` `app/(app)/app/events/[id]/register/event-registration-workspace.tsx` `app/(app)/app/orbit-public-shell.tsx` `app/(app)/app/orbit-reference-styles.tsx` |
| `#9FA3D9` | 6 | `plum-300` | 浅紫装饰 / 焦点 | `app/(app)/app/events/events-0918/events-model.ts` `app/(app)/app/events/events-0918/events-shell.tsx` `app/(app)/app/orbit-landing-0918.tsx` |
| `rgba(150,145,200,0.14)` | 6 | `accent-soft` | 紫浅底 | `app/(app)/app/orbit-reference-styles.tsx` `app/(app)/app/orbit-starfield-desktop-logic.ts` `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile-logic.ts` 等 5 个 |
| `rgba(0,0,0,0.85)` | 6 | `scrim / scrim-web` | 黑色半透明：遮罩 | `app/(app)/app/orbit-starfield-desktop-logic.ts` `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile-logic.ts` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `#F1EFF9` | 6 | `accent-soft` | 紫浅底 | `app/(app)/app/orbit-starfield-desktop-logic.ts` `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile-logic.ts` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `#8A5A00` | 5 | `mac-apricot-text` | 注意 / 提醒文字 | `app/(app)/app/agent/iorbit-0918/console-styles.ts` `app/(app)/app/contacts/network-0918/network-shell.tsx` `app/(app)/app/orbit-theme.tsx` |
| `#0E4B52` | 5 | `mac-teal-text` | 青色文字；图形用 mac-teal-ink | `app/(app)/app/agent/iorbit-0918/console-styles.ts` `app/(app)/app/orbit-global-ask/orbit-global-ask-styles.ts` `app/(app)/app/orbit-reference-styles.tsx` `app/(app)/app/orbit-theme.tsx` |
| `#FBEDE6` | 5 | `coral-soft` | 红 / 橙红浅底 | `app/(app)/app/agent/iorbit-0918/iorbit-home-styles.ts` `app/(app)/app/agent/iorbit-0918/iorbit-my-plan-styles.ts` `app/(app)/app/agent/iorbit-0918/iorbit-plan-card-styles.ts` |
| `#2F7A55` | 5 | `ok-text` | 完成 / 成功；图形用 ok | `app/(app)/app/agent/iorbit-0918/iorbit-my-plan-styles.ts` `app/(app)/app/start/start-guide-styles.ts` |
| `#EEEFFD` | 5 | `accent-soft` | 紫浅底 | `app/(app)/app/agent/iorbit-0918/iorbit-my-plan-styles.ts` `app/(app)/app/agent/iorbit-0918/plan-match-sheet.tsx` `app/(app)/app/contacts/network-0918/contact-value-line.tsx` |
| `#C9CBF0` | 5 | `accent-soft` | 紫浅底 | `app/(app)/app/agent/iorbit-0918/plan-match-sheet.tsx` `app/(app)/app/contacts/network-0918/contact-value-line.tsx` `app/(app)/app/profile/profile-0918/profile-shell.tsx` |
| `#B42318` | 5 | `coral-text` | 错误 / 删除 | `app/(app)/app/agent/iorbit-0918/plan-match-sheet.tsx` `app/(app)/app/contacts/contact-relationship-initialization.tsx` `app/(app)/app/contacts/network-0918/network-shell.tsx` `app/(app)/app/events/[id]/register/registration-portrait-workspace.tsx` |
| `rgba(59,63,122,0.12)` | 5 | `accent-soft` | 紫浅底 | `app/(app)/app/events/ops-0918/ops-shell.tsx` `app/(app)/app/o/orbit-real-organizer-public.tsx` `app/(app)/app/orbit-0918-tokens.ts` `app/(app)/app/orbit-reference-styles.tsx` 等 5 个 |
| `#176A73` | 5 | `mac-teal-text` | 青色文字；图形用 mac-teal-ink | `app/(app)/app/orbit-global-ask/orbit-global-ask-styles.ts` `app/(app)/app/orbit-reference-styles.tsx` `app/(app)/app/orbit-theme.tsx` |
| `#9C8EF5` | 5 | `plum-300` | 浅紫装饰 / 焦点 | `app/(app)/app/orbit-reference-primitives.tsx` `app/(app)/app/orbit-reference-styles.tsx` |
| `#0B0A15` | 5 | `ink` | 近黑 | `app/(app)/app/orbit-reference-styles.tsx` `app/(app)/app/orbit-theme.tsx` |
| `#0D0B1E` | 5 | `ink` | 近黑 | `app/(app)/app/orbit-reference-styles.tsx` `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `rgba(150,145,200,0.12)` | 5 | `accent-soft` | 紫浅底 | `app/(app)/app/orbit-starfield-desktop-logic.ts` `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile-logic.ts` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `rgba(150,145,200,0.16)` | 5 | `accent-soft` | 紫浅底 | `app/(app)/app/orbit-starfield-desktop-logic.ts` `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile-logic.ts` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `#687078` | 4 | `ink-2` | 深灰次级文字 | `app/(app)/app/agent/iorbit-0918/console-styles.ts` `app/(app)/app/orbit-reference-styles.tsx` `app/(app)/app/orbit-theme.tsx` |
| `rgba(255,255,255,0.22)` | 4 | `line` | 白色低透明：深色面上的分隔 | `app/(app)/app/agent/iorbit-0918/iorbit-home-styles.ts` `app/(app)/app/contacts/network-0918/network-shell.tsx` `app/(app)/app/orbit-reference-primitives.tsx` `app/(app)/app/profile/profile-0918/business-card-preview.tsx` |
| `rgba(0,0,0,0.45)` | 4 | `scrim / scrim-web` | 黑色半透明：遮罩 | `app/(app)/app/contacts/card-batch-0918/card-batch-styles.ts` `app/(app)/app/orbit-reference-styles.tsx` |
| `rgba(59,63,122,0.08)` | 4 | `accent-soft` | 紫浅底 | `app/(app)/app/contacts/card-batch-0918/card-batch-styles.ts` `app/(app)/app/events/ops-0918/ops-shell.tsx` `app/(app)/app/orbit-0918-tokens.ts` `app/(app)/app/profile/onboarding-0918/onboarding-styles.ts` |
| `#5B8C7A` | 4 | `ok-text` | 完成 / 成功；图形用 ok | `app/(app)/app/contacts/network-0918/network-model.ts` `app/(app)/app/contacts/network-0918/network-shell.tsx` `app/(app)/app/events/events-0918/events-model.ts` `app/(app)/app/events/events-0918/events-shell.tsx` |
| `#C7C9E4` | 4 | `line` | 分隔 / 描边 | `app/(app)/app/events/ops-0918/ops-shell.tsx` |
| `#A6A3BD` | 4 | `ink-4` | 装饰灰；作文字时用 ink-3-text | `app/(app)/app/orbit-reference-styles.tsx` `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `#08070F` | 4 | `ink` | 近黑 | `app/(app)/app/orbit-reference-styles.tsx` `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `rgba(20,18,38,0.97)` | 4 | `scrim / scrim-web` | 黑色半透明：遮罩 | `app/(app)/app/orbit-reference-styles.tsx` `app/(app)/app/orbit-starfield-desktop-logic.ts` `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `rgba(11,10,22,0.985)` | 4 | `scrim / scrim-web` | 黑色半透明：遮罩 | `app/(app)/app/orbit-reference-styles.tsx` `app/(app)/app/orbit-starfield-desktop-logic.ts` `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `rgba(176,162,250,0.85)` | 4 | `plum-300` | 浅紫装饰 / 焦点 | `app/(app)/app/orbit-starfield-desktop-logic.ts` `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile-logic.ts` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `#E7CD9A` | 4 | `mac-apricot-ink` | 金黄图形；文字用 mac-apricot-text | `app/(app)/app/orbit-starfield-desktop-logic.ts` `app/(app)/app/orbit-starfield-mobile-logic.ts` |
| `#F0CF94` | 4 | `mac-apricot-ink` | 金黄图形；文字用 mac-apricot-text | `app/(app)/app/orbit-starfield-desktop-logic.ts` `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile-logic.ts` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `rgba(216,176,106,0.85)` | 4 | `mac-apricot-ink` | 金黄图形；文字用 mac-apricot-text | `app/(app)/app/orbit-starfield-desktop-logic.ts` `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile-logic.ts` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `#1A1830` | 4 | `ink` | 近黑 | `app/(app)/app/orbit-starfield-desktop-logic.ts` `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile-logic.ts` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `rgba(170,176,204,0.8)` | 4 | `ink-4` | 装饰灰；作文字时用 ink-3-text | `app/(app)/app/orbit-starfield-desktop-logic.ts` `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile-logic.ts` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `rgba(139,123,240,0.5)` | 4 | `plum-300` | 浅紫装饰 / 焦点 | `app/(app)/app/orbit-starfield-desktop-logic.ts` `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile-logic.ts` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `#B9AEF0` | 4 | `plum-300` | 浅紫装饰 / 焦点 | `app/(app)/app/orbit-starfield-desktop-logic.ts` `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile-logic.ts` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `#BCB2F4` | 4 | `plum-300` | 浅紫装饰 / 焦点 | `app/(app)/app/orbit-starfield-desktop-logic.ts` `app/(app)/app/orbit-starfield-mobile-logic.ts` |
| `rgba(139,123,240,.22)` | 4 | `accent-soft` | 紫浅底 | `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `rgba(150,145,200,0.18)` | 4 | `accent-soft` | 紫浅底 | `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `#E6E7F8` | 4 | `accent-soft` | 紫浅底 | `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `#CFD0EC` | 4 | `line` | 分隔 / 描边 | `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `#D6D8F0` | 4 | `accent-soft` | 紫浅底 | `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `#B9BCE0` | 4 | `ink-4` | 装饰灰；作文字时用 ink-3-text | `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `#8A8DB0` | 3 | `ink-3-text` | 灰色说明文字 | `app/(app)/app/account/auth-0918/auth-modal.tsx` `app/(app)/app/orbit-landing-0918.tsx` |
| `rgba(14,18,37,0.28)` | 3 | `（去掉阴影）/ shadow-float` | 黑色半透明：阴影，浮层用 shadow-float，其余去掉 | `app/(app)/app/agent/iorbit-0918/iorbit-history-drawer.tsx` `app/(app)/app/agent/iorbit-0918/iorbit-styles.ts` `app/(app)/app/events/ops-0918/ops-shell.tsx` |
| `rgba(255,255,255,0.7)` | 3 | `glass` | 白色半透明：毛玻璃 | `app/(app)/app/agent/iorbit-0918/iorbit-home-styles.ts` `app/(app)/app/contacts/network-0918/network-shell.tsx` `app/(app)/app/orbit-reference-primitives.tsx` |
| `#E6F3EC` | 3 | `ok-soft` | 绿浅底 | `app/(app)/app/agent/iorbit-0918/iorbit-my-plan-styles.ts` `app/(app)/app/start/start-guide-styles.ts` |
| `rgba(59,63,122,0.06)` | 3 | `accent-soft` | 紫浅底 | `app/(app)/app/agent/iorbit-0918/iorbit-styles.ts` `app/(app)/app/profile/onboarding-0918/onboarding-styles.ts` |
| `rgba(14,18,37,0.18)` | 3 | `（去掉阴影）/ shadow-float` | 黑色半透明：阴影，浮层用 shadow-float，其余去掉 | `app/(app)/app/agent/iorbit-0918/iorbit-styles.ts` `app/(app)/app/events/ops-0918/ops-shell.tsx` `app/(app)/app/profile/profile-0918/business-card-preview.tsx` |
| `rgba(255,255,255,0.88)` | 3 | `glass` | 白色半透明：毛玻璃 | `app/(app)/app/contacts/card-batch-0918/card-batch-styles.ts` `app/(app)/app/orbit-reference-styles.tsx` |
| `#FCFBF7` | 3 | `mac-apricot` | 黄 / 橙浅底 | `app/(app)/app/contacts/card-batch-0918/card-batch-styles.ts` |
| `rgba(255,255,255,0.18)` | 3 | `line` | 白色低透明：深色面上的分隔 | `app/(app)/app/contacts/card-batch-0918/card-batch-styles.ts` `app/(app)/app/orbit-reference-styles.tsx` |
| `#6B8FB5` | 3 | `mac-blue-text` | 信息蓝；图形用 mac-blue-ink | `app/(app)/app/contacts/network-0918/network-analysis-structure.tsx` `app/(app)/app/contacts/network-0918/network-model.ts` `app/(app)/app/contacts/network-0918/network-shell.tsx` |
| `#9C7A3E` | 3 | `mac-apricot-text` | 注意 / 提醒文字 | `app/(app)/app/contacts/network-0918/network-analysis-structure.tsx` `app/(app)/app/contacts/network-0918/network-model.ts` `app/(app)/app/contacts/network-0918/network-shell.tsx` |
| `#A33A3A` | 3 | `coral-text` | 错误 / 删除 | `app/(app)/app/contacts/network-0918/network-import-styles.ts` `app/(app)/app/contacts/network-0918/network-import.tsx` |
| `rgba(14,18,37,0.35)` | 3 | `（去掉阴影）/ shadow-float` | 黑色半透明：阴影，浮层用 shadow-float，其余去掉 | `app/(app)/app/contacts/network-0918/network-shell.tsx` `app/(app)/app/events/events-0918/events-shell.tsx` |
| `#FAFAFF` | 3 | `accent-soft` | 紫浅底 | `app/(app)/app/contacts/network-0918/network-shell.tsx` |
| `#7C4FC7` | 3 | `accent-text` | 紫色强调；图形用 accent | `app/(app)/app/events/events-0918/event-live.tsx` `app/(app)/app/events/events-0918/events-model.ts` `app/(app)/app/events/events-0918/events-shell.tsx` |
| `#FDF8EF` | 3 | `mac-apricot` | 黄 / 橙浅底 | `app/(app)/app/events/ops-0918/ops-model.ts` `app/(app)/app/events/ops-0918/ops-shell.tsx` |
| `#C8323B` | 3 | `coral-text` | 错误 / 删除 | `app/(app)/app/inbox/relationship-inbox-panel.tsx` `app/(app)/app/orbit-reference-styles.tsx` `app/(app)/app/orbit-theme.tsx` |
| `rgba(255,255,255,0.86)` | 3 | `glass` | 白色半透明：毛玻璃 | `app/(app)/app/orbit-account-shell.tsx` `app/(app)/app/orbit-reference-styles.tsx` |
| `rgba(255,255,255,0.92)` | 3 | `glass` | 白色半透明：毛玻璃 | `app/(app)/app/orbit-reference-primitives.tsx` `app/(app)/app/orbit-reference-styles.tsx` `app/(app)/app/profile/onboarding-0918/onboarding-styles.ts` |
| `#1D1936` | 3 | `ink` | 近黑 | `app/(app)/app/orbit-reference-styles.tsx` |
| `#12101F` | 3 | `ink` | 近黑 | `app/(app)/app/orbit-reference-styles.tsx` |
| `#7A69E6` | 3 | `accent-text` | 紫色强调；图形用 accent | `app/(app)/app/orbit-reference-styles.tsx` |
| `rgba(255,255,255,0.72)` | 3 | `glass` | 白色半透明：毛玻璃 | `app/(app)/app/orbit-reference-styles.tsx` `app/(app)/app/profile/profile-0918/business-card-preview.tsx` |
| `#14122A` | 3 | `ink` | 近黑 | `app/(app)/app/orbit-reference-styles.tsx` `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `#E6E9EB` | 3 | `surface-2` | 浅灰面 | `app/(app)/app/orbit-reference-styles.tsx` `app/(app)/app/orbit-theme.tsx` |
| `rgba(186,190,214,0.62)` | 3 | `ink-4` | 装饰灰；作文字时用 ink-3-text | `app/(app)/app/orbit-starfield-desktop-logic.ts` `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `#ECEEFF` | 3 | `accent-soft` | 紫浅底 | `app/(app)/app/orbit-starfield-desktop-logic.ts` `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `#BE123C` | 3 | `coral-text` | 错误 / 删除 | `app/(app)/app/orbit-theme.tsx` |
| `rgba(190,18,60,0.12)` | 3 | `coral-soft` | 红 / 橙红浅底 | `app/(app)/app/orbit-theme.tsx` |
| `#155E75` | 3 | `mac-teal-text` | 青色文字；图形用 mac-teal-ink | `app/(app)/app/orbit-theme.tsx` |
| `#17211F` | 3 | `ink` | 近黑 | `app/(app)/app/orbit-theme.tsx` `app/(app)/app/profile/profile-0918/business-card-preview.tsx` |
| `#F4F7F5` | 3 | `ok-soft` | 绿浅底 | `app/(app)/app/orbit-theme.tsx` |
| `rgba(23,33,31,0.08)` | 3 | `（去掉阴影）/ shadow-float` | 黑色半透明：阴影，浮层用 shadow-float，其余去掉 | `app/(app)/app/orbit-theme.tsx` |
| `#B03B40` | 3 | `coral-text` | 错误 / 删除 | `app/(app)/app/tasks/tasks-styles.tsx` |
| `rgba(14,18,37,0.45)` | 2 | `scrim / scrim-web` | 黑色半透明：遮罩 | `app/(app)/app/account/auth-0918/auth-modal.tsx` `app/(app)/app/contacts/card-batch-0918/card-batch-styles.ts` |
| `rgba(14,18,37,0.3)` | 2 | `（去掉阴影）/ shadow-float` | 黑色半透明：阴影，浮层用 shadow-float，其余去掉 | `app/(app)/app/account/auth-0918/auth-modal.tsx` `app/(app)/app/contacts/card-batch-0918/card-batch-styles.ts` |
| `#0E9E68` | 2 | `ok-text` | 完成 / 成功；图形用 ok | `app/(app)/app/admin/compose-app-admin-platform-from-previously-approved-mock-first-capabilities/admin-platform-route-view-model.ts` `app/(app)/app/orbit-landing-route-view-model.ts` |
| `#2D7FF0` | 2 | `mac-blue-text` | 信息蓝；图形用 mac-blue-ink | `app/(app)/app/admin/compose-app-admin-platform-from-previously-approved-mock-first-capabilities/admin-platform-route-view-model.ts` `app/(app)/app/orbit-landing-route-view-model.ts` |
| `#E0415F` | 2 | `coral-text` | 错误 / 删除 | `app/(app)/app/admin/compose-app-admin-platform-from-previously-approved-mock-first-capabilities/admin-platform-route-view-model.ts` `app/(app)/app/orbit-landing-route-view-model.ts` |
| `#E08A2B` | 2 | `mac-apricot-text` | 注意 / 提醒文字 | `app/(app)/app/admin/compose-app-admin-platform-from-previously-approved-mock-first-capabilities/admin-platform-route-view-model.ts` `app/(app)/app/orbit-landing-route-view-model.ts` |
| `#0E7A3C` | 2 | `ok-text` | 完成 / 成功；图形用 ok | `app/(app)/app/agent/iorbit-0918/console-styles.ts` `app/(app)/app/orbit-theme.tsx` |
| `#2E8A93` | 2 | `mac-teal-text` | 青色文字；图形用 mac-teal-ink | `app/(app)/app/agent/iorbit-0918/console-styles.ts` |
| `rgba(14,18,37,0.32)` | 2 | `（去掉阴影）/ shadow-float` | 黑色半透明：阴影，浮层用 shadow-float，其余去掉 | `app/(app)/app/agent/iorbit-0918/iorbit-home-styles.ts` `app/(app)/app/contacts/network-0918/network-shell.tsx` |
| `rgba(14,18,37,0.22)` | 2 | `（去掉阴影）/ shadow-float` | 黑色半透明：阴影，浮层用 shadow-float，其余去掉 | `app/(app)/app/agent/iorbit-0918/iorbit-home-styles.ts` `app/(app)/app/contacts/network-0918/network-shell.tsx` |
| `#8A3414` | 2 | `coral-text` | 错误 / 删除 | `app/(app)/app/agent/iorbit-0918/iorbit-my-plan-styles.ts` |
| `#5F6390` | 2 | `ink-3-text` | 灰色说明文字 | `app/(app)/app/agent/iorbit-0918/iorbit-plan-card-styles.ts` |
| `#A83A16` | 2 | `coral-text` | 错误 / 删除 | `app/(app)/app/agent/iorbit-0918/iorbit-plan-card-styles.ts` |
| `rgba(255,255,255,0.08)` | 2 | `line` | 白色低透明：深色面上的分隔 | `app/(app)/app/contacts/card-batch-0918/card-batch-styles.ts` |
| `#E9D3A4` | 2 | `mac-apricot-ink` | 金黄图形；文字用 mac-apricot-text | `app/(app)/app/contacts/card-batch-0918/card-batch-styles.ts` |
| `#FFFBF2` | 2 | `mac-apricot` | 黄 / 橙浅底 | `app/(app)/app/contacts/card-batch-0918/card-batch-styles.ts` `app/(app)/app/contacts/network-0918/network-import-styles.ts` |
| `#8A8DB8` | 2 | `ink-4` | 装饰灰；作文字时用 ink-3-text | `app/(app)/app/contacts/card-batch-0918/card-batch-styles.ts` `app/(app)/app/contacts/network-0918/network-shell.tsx` |
| `rgba(75,79,199,0.12)` | 2 | `accent-soft` | 紫浅底 | `app/(app)/app/contacts/card-batch-0918/card-batch-styles.ts` |
| `#8A8FB0` | 2 | `ink-3-text` | 灰色说明文字 | `app/(app)/app/contacts/network-0918/network-analysis-structure.tsx` `app/(app)/app/contacts/network-0918/network-model.ts` |
| `#C9CBE6` | 2 | `line` | 分隔 / 描边 | `app/(app)/app/contacts/network-0918/network-import-styles.ts` |
| `#FFF4E5` | 2 | `mac-apricot` | 黄 / 橙浅底 | `app/(app)/app/contacts/network-0918/network-insight-panel.tsx` `app/(app)/app/contacts/network-0918/network-insights.tsx` |
| `#8A5300` | 2 | `mac-apricot-text` | 注意 / 提醒文字 | `app/(app)/app/contacts/network-0918/network-insight-panel.tsx` `app/(app)/app/contacts/network-0918/network-insights.tsx` |
| `#F4F5FD` | 2 | `accent-soft` | 紫浅底 | `app/(app)/app/contacts/network-0918/network-shell.tsx` |
| `rgba(59,63,122,0.10)` | 2 | `accent-soft` | 紫浅底 | `app/(app)/app/contacts/network-0918/network-shell.tsx` `app/(app)/app/events/events-0918/events-shell.tsx` |
| `#EEF0FB` | 2 | `accent-soft` | 紫浅底 | `app/(app)/app/contacts/network-0918/network-shell.tsx` |
| `#1F2357` | 2 | `plum-900` | 深紫 | `app/(app)/app/contacts/network-0918/network-shell.tsx` |
| `#2F7A4F` | 2 | `ok-text` | 完成 / 成功；图形用 ok | `app/(app)/app/contacts/network-0918/network-shell.tsx` |
| `#B3261E` | 2 | `coral-text` | 错误 / 删除 | `app/(app)/app/contacts/network-0918/network-shell.tsx` `app/(app)/app/events/[id]/operations/admission/event-admission-policy-panel.tsx` |
| `rgba(59,63,122,0.15)` | 2 | `accent-soft` | 紫浅底 | `app/(app)/app/events/events-0918/events-shell.tsx` `app/(app)/app/profile/onboarding-0918/onboarding-styles.ts` |
| `#FDF1EF` | 2 | `coral-soft` | 红 / 橙红浅底 | `app/(app)/app/events/events-0918/events-shell.tsx` |
| `#F1C9C3` | 2 | `coral` | 红色图形；文字用 coral-text | `app/(app)/app/events/events-0918/events-shell.tsx` |
| `#F5E3C2` | 2 | `mac-apricot` | 黄 / 橙浅底 | `app/(app)/app/events/ops-0918/ops-model.ts` `app/(app)/app/events/ops-0918/ops-shell.tsx` |
| `#F0E2C6` | 2 | `mac-apricot-ink` | 金黄图形；文字用 mac-apricot-text | `app/(app)/app/events/ops-0918/ops-shell.tsx` |
| `#6B4B12` | 2 | `mac-apricot-text` | 注意 / 提醒文字 | `app/(app)/app/events/ops-0918/ops-shell.tsx` |
| `#8A8EE0` | 2 | `plum-300` | 浅紫装饰 / 焦点 | `app/(app)/app/events/ops-0918/ops-shell.tsx` |
| `#1A7D9B` | 2 | `mac-teal-text` | 青色文字；图形用 mac-teal-ink | `app/(app)/app/home/orbit-real-home.tsx` `app/(app)/app/orbit-theme.tsx` |
| `#E5484D` | 2 | `coral-text` | 错误 / 删除 | `app/(app)/app/inbox/relationship-inbox-panel.tsx` |
| `#0E9AA7` | 2 | `mac-teal-text` | 青色文字；图形用 mac-teal-ink | `app/(app)/app/orbit-global-ask/orbit-global-ask-styles.ts` |
| `rgba(0,0,0,.94)` | 2 | `scrim / scrim-web` | 黑色半透明：遮罩 | `app/(app)/app/orbit-global-ask/orbit-global-ask-styles.ts` |
| `rgba(0,0,0,.78)` | 2 | `scrim / scrim-web` | 黑色半透明：遮罩 | `app/(app)/app/orbit-global-ask/orbit-global-ask-styles.ts` |
| `rgba(0,0,0,.55)` | 2 | `scrim / scrim-web` | 黑色半透明：遮罩 | `app/(app)/app/orbit-global-ask/orbit-global-ask-styles.ts` |
| `rgba(0,0,0,.32)` | 2 | `（去掉阴影）/ shadow-float` | 黑色半透明：阴影，浮层用 shadow-float，其余去掉 | `app/(app)/app/orbit-global-ask/orbit-global-ask-styles.ts` |
| `rgba(0,0,0,.14)` | 2 | `（去掉阴影）/ shadow-float` | 黑色半透明：阴影，浮层用 shadow-float，其余去掉 | `app/(app)/app/orbit-global-ask/orbit-global-ask-styles.ts` |
| `rgba(0,0,0,.04)` | 2 | `（去掉阴影）/ shadow-float` | 黑色半透明：阴影，浮层用 shadow-float，其余去掉 | `app/(app)/app/orbit-global-ask/orbit-global-ask-styles.ts` |
| `rgba(0,0,0,.92)` | 2 | `scrim / scrim-web` | 黑色半透明：遮罩 | `app/(app)/app/orbit-global-ask/orbit-global-ask-styles.ts` |
| `rgba(0,0,0,.72)` | 2 | `scrim / scrim-web` | 黑色半透明：遮罩 | `app/(app)/app/orbit-global-ask/orbit-global-ask-styles.ts` |
| `rgba(0,0,0,.46)` | 2 | `scrim / scrim-web` | 黑色半透明：遮罩 | `app/(app)/app/orbit-global-ask/orbit-global-ask-styles.ts` |
| `rgba(0,0,0,.24)` | 2 | `（去掉阴影）/ shadow-float` | 黑色半透明：阴影，浮层用 shadow-float，其余去掉 | `app/(app)/app/orbit-global-ask/orbit-global-ask-styles.ts` |
| `rgba(0,0,0,.08)` | 2 | `（去掉阴影）/ shadow-float` | 黑色半透明：阴影，浮层用 shadow-float，其余去掉 | `app/(app)/app/orbit-global-ask/orbit-global-ask-styles.ts` |
| `rgba(0,0,0,.88)` | 2 | `scrim / scrim-web` | 黑色半透明：遮罩 | `app/(app)/app/orbit-global-ask/orbit-global-ask-styles.ts` |
| `rgba(0,0,0,.62)` | 2 | `scrim / scrim-web` | 黑色半透明：遮罩 | `app/(app)/app/orbit-global-ask/orbit-global-ask-styles.ts` |
| `rgba(0,0,0,.34)` | 2 | `（去掉阴影）/ shadow-float` | 黑色半透明：阴影，浮层用 shadow-float，其余去掉 | `app/(app)/app/orbit-global-ask/orbit-global-ask-styles.ts` |
| `rgba(0,0,0,.12)` | 2 | `（去掉阴影）/ shadow-float` | 黑色半透明：阴影，浮层用 shadow-float，其余去掉 | `app/(app)/app/orbit-global-ask/orbit-global-ask-styles.ts` |
| `rgba(23,33,31,.10)` | 2 | `（去掉阴影）/ shadow-float` | 黑色半透明：阴影，浮层用 shadow-float，其余去掉 | `app/(app)/app/orbit-global-ask/orbit-global-ask-styles.ts` |
| `rgba(23,33,31,.15)` | 2 | `（去掉阴影）/ shadow-float` | 黑色半透明：阴影，浮层用 shadow-float，其余去掉 | `app/(app)/app/orbit-global-ask/orbit-global-ask-styles.ts` |
| `#C9CBEF` | 2 | `accent-soft` | 紫浅底 | `app/(app)/app/orbit-landing-0918.tsx` `app/(app)/app/profile/onboarding-0918/onboarding-styles.ts` |
| `#B892EC` | 2 | `plum-300` | 浅紫装饰 / 焦点 | `app/(app)/app/orbit-reference-primitives.tsx` `app/(app)/app/orbit-reference-styles.tsx` |
| `#7A4FD0` | 2 | `accent-text` | 紫色强调；图形用 accent | `app/(app)/app/orbit-reference-primitives.tsx` `app/(app)/app/orbit-reference-styles.tsx` |
| `#D68FC2` | 2 | `mac-pink-text` | 粉色文字；图形用 mac-pink-ink | `app/(app)/app/orbit-reference-primitives.tsx` `app/(app)/app/orbit-reference-styles.tsx` |
| `#A85186` | 2 | `mac-pink-text` | 粉色文字；图形用 mac-pink-ink | `app/(app)/app/orbit-reference-primitives.tsx` `app/(app)/app/orbit-reference-styles.tsx` |
| `#EDC57C` | 2 | `mac-apricot-ink` | 金黄图形；文字用 mac-apricot-text | `app/(app)/app/orbit-reference-primitives.tsx` `app/(app)/app/orbit-reference-styles.tsx` |
| `#8FBFC4` | 2 | `mac-teal-text` | 青色文字；图形用 mac-teal-ink | `app/(app)/app/orbit-reference-primitives.tsx` `app/(app)/app/orbit-reference-styles.tsx` |
| `#47898F` | 2 | `mac-teal-text` | 青色文字；图形用 mac-teal-ink | `app/(app)/app/orbit-reference-primitives.tsx` `app/(app)/app/orbit-reference-styles.tsx` |
| `#8A9CEC` | 2 | `plum-300` | 浅紫装饰 / 焦点 | `app/(app)/app/orbit-reference-primitives.tsx` `app/(app)/app/orbit-reference-styles.tsx` |
| `#5063CE` | 2 | `accent-text` | 紫色强调；图形用 accent | `app/(app)/app/orbit-reference-primitives.tsx` `app/(app)/app/orbit-reference-styles.tsx` |
| `#9490AE` | 2 | `ink-4` | 装饰灰；作文字时用 ink-3-text | `app/(app)/app/orbit-reference-primitives.tsx` `app/(app)/app/orbit-reference-styles.tsx` |
| `#565478` | 2 | `ink-2` | 深灰次级文字 | `app/(app)/app/orbit-reference-primitives.tsx` `app/(app)/app/orbit-reference-styles.tsx` |
| `rgba(255,255,255,0.55)` | 2 | `glass` | 白色半透明：毛玻璃 | `app/(app)/app/orbit-reference-primitives.tsx` `app/(app)/app/profile/profile-0918/business-card-preview.tsx` |
| `#AAA8C8` | 2 | `ink-4` | 装饰灰；作文字时用 ink-3-text | `app/(app)/app/orbit-reference-styles.tsx` |
| `rgba(139,123,240,0.26)` | 2 | `accent-soft` | 紫浅底 | `app/(app)/app/orbit-reference-styles.tsx` |
| `rgba(99,89,233,0.22)` | 2 | `accent-soft` | 紫浅底 | `app/(app)/app/orbit-reference-styles.tsx` |
| `rgba(99,89,233,0.16)` | 2 | `accent-soft` | 紫浅底 | `app/(app)/app/orbit-reference-styles.tsx` |
| `rgba(251,251,254,0.9)` | 2 | `accent-soft` | 紫浅底 | `app/(app)/app/orbit-reference-styles.tsx` `app/(app)/app/profile/onboarding-0918/onboarding-styles.ts` |
| `rgba(139,123,240,0.16)` | 2 | `accent-soft` | 紫浅底 | `app/(app)/app/orbit-reference-styles.tsx` |
| `rgba(139,123,240,0.09)` | 2 | `accent-soft` | 紫浅底 | `app/(app)/app/orbit-reference-styles.tsx` |
| `rgba(139,123,240,0.42)` | 2 | `plum-300` | 浅紫装饰 / 焦点 | `app/(app)/app/orbit-reference-styles.tsx` |
| `#F2F0FB` | 2 | `accent-soft` | 紫浅底 | `app/(app)/app/orbit-reference-styles.tsx` |
| `#9793B8` | 2 | `ink-4` | 装饰灰；作文字时用 ink-3-text | `app/(app)/app/orbit-reference-styles.tsx` |
| `#6E6A8F` | 2 | `ink-3-text` | 灰色说明文字 | `app/(app)/app/orbit-reference-styles.tsx` |
| `#171430` | 2 | `ink` | 近黑 | `app/(app)/app/orbit-reference-styles.tsx` |
| `rgba(150,145,200,0.22)` | 2 | `accent-soft` | 紫浅底 | `app/(app)/app/orbit-reference-styles.tsx` |
| `rgba(150,145,200,0.34)` | 2 | `plum-300` | 浅紫装饰 / 焦点 | `app/(app)/app/orbit-reference-styles.tsx` |
| `rgba(150,145,200,0.10)` | 2 | `accent-soft` | 紫浅底 | `app/(app)/app/orbit-reference-styles.tsx` |
| `rgba(5,4,12,0.08)` | 2 | `（去掉阴影）/ shadow-float` | 黑色半透明：阴影，浮层用 shadow-float，其余去掉 | `app/(app)/app/orbit-reference-styles.tsx` |
| `rgba(5,4,12,0.22)` | 2 | `（去掉阴影）/ shadow-float` | 黑色半透明：阴影，浮层用 shadow-float，其余去掉 | `app/(app)/app/orbit-reference-styles.tsx` |
| `rgba(5,4,12,0.82)` | 2 | `scrim / scrim-web` | 黑色半透明：遮罩 | `app/(app)/app/orbit-reference-styles.tsx` |
| `rgba(255,255,255,0.78)` | 2 | `glass` | 白色半透明：毛玻璃 | `app/(app)/app/orbit-reference-styles.tsx` |
| `rgba(255,255,255,0.12)` | 2 | `line` | 白色低透明：深色面上的分隔 | `app/(app)/app/orbit-reference-styles.tsx` |
| `rgba(255,255,255,0.15)` | 2 | `line` | 白色低透明：深色面上的分隔 | `app/(app)/app/orbit-reference-styles.tsx` |
| `rgba(13,11,30,0.88)` | 2 | `scrim / scrim-web` | 黑色半透明：遮罩 | `app/(app)/app/orbit-reference-styles.tsx` |
| `#F0718B` | 2 | `coral` | 红色图形；文字用 coral-text | `app/(app)/app/orbit-reference-styles.tsx` |
| `rgba(224,65,95,0.17)` | 2 | `coral-soft` | 红 / 橙红浅底 | `app/(app)/app/orbit-reference-styles.tsx` |
| `rgba(0,0,0,0.4)` | 2 | `scrim / scrim-web` | 黑色半透明：遮罩 | `app/(app)/app/orbit-reference-styles.tsx` |
| `rgba(10,8,18,0.78)` | 2 | `scrim / scrim-web` | 黑色半透明：遮罩 | `app/(app)/app/orbit-reference-styles.tsx` |
| `#171A1C` | 2 | `ink` | 近黑 | `app/(app)/app/orbit-reference-styles.tsx` `app/(app)/app/orbit-theme.tsx` |
| `#EEF7F6` | 2 | `mac-teal` | 青浅底 | `app/(app)/app/orbit-reference-styles.tsx` `app/(app)/app/orbit-theme.tsx` |
| `#125B63` | 2 | `mac-teal-text` | 青色文字；图形用 mac-teal-ink | `app/(app)/app/orbit-reference-styles.tsx` `app/(app)/app/orbit-theme.tsx` |
| `#F4F8F7` | 2 | `mac-teal` | 青浅底 | `app/(app)/app/orbit-reference-styles.tsx` `app/(app)/app/orbit-theme.tsx` |
| `rgba(23,106,115,0.28)` | 2 | `mac-teal` | 青浅底 | `app/(app)/app/orbit-reference-styles.tsx` `app/(app)/app/orbit-theme.tsx` |
| `#2B3034` | 2 | `ink` | 近黑 | `app/(app)/app/orbit-reference-styles.tsx` `app/(app)/app/orbit-theme.tsx` |
| `#969DA3` | 2 | `ink-3-text` | 灰色说明文字 | `app/(app)/app/orbit-reference-styles.tsx` `app/(app)/app/orbit-theme.tsx` |
| `#FAFBFB` | 2 | `surface` | 近白 | `app/(app)/app/orbit-reference-styles.tsx` `app/(app)/app/orbit-theme.tsx` |
| `#F7F8F8` | 2 | `surface-2` | 浅灰面 | `app/(app)/app/orbit-reference-styles.tsx` `app/(app)/app/orbit-theme.tsx` |
| `#F1F3F3` | 2 | `surface-2` | 浅灰面 | `app/(app)/app/orbit-reference-styles.tsx` `app/(app)/app/orbit-theme.tsx` |
| `#D9DEE1` | 2 | `line` | 分隔 / 描边 | `app/(app)/app/orbit-reference-styles.tsx` `app/(app)/app/orbit-theme.tsx` |
| `#C7CDD1` | 2 | `ink-4` | 装饰灰；作文字时用 ink-3-text | `app/(app)/app/orbit-reference-styles.tsx` `app/(app)/app/orbit-theme.tsx` |
| `rgba(255,255,255,1)` | 2 | `surface` | 近白 | `app/(app)/app/orbit-starfield-desktop-logic.ts` `app/(app)/app/orbit-starfield-mobile-logic.ts` |
| `rgba(255,255,255,.5)` | 2 | `glass` | 白色半透明：毛玻璃 | `app/(app)/app/orbit-starfield-desktop-logic.ts` `app/(app)/app/orbit-starfield-mobile-logic.ts` |
| `rgba(255,255,255,0)` | 2 | `line` | 白色低透明：深色面上的分隔 | `app/(app)/app/orbit-starfield-desktop-logic.ts` `app/(app)/app/orbit-starfield-mobile-logic.ts` |
| `rgba(224,186,120,0.9)` | 2 | `mac-apricot-ink` | 金黄图形；文字用 mac-apricot-text | `app/(app)/app/orbit-starfield-desktop-logic.ts` `app/(app)/app/orbit-starfield-mobile-logic.ts` |
| `rgba(0,0,0,0.9)` | 2 | `scrim / scrim-web` | 黑色半透明：遮罩 | `app/(app)/app/orbit-starfield-desktop-logic.ts` `app/(app)/app/orbit-starfield-mobile-logic.ts` |
| `rgba(123,108,232,0.4)` | 2 | `plum-300` | 浅紫装饰 / 焦点 | `app/(app)/app/orbit-starfield-desktop-logic.ts` `app/(app)/app/orbit-starfield-mobile-logic.ts` |
| `rgba('+(54+lum*54|0)` | 2 | `mac-pink-text` | 粉色文字；图形用 mac-pink-ink | `app/(app)/app/orbit-starfield-desktop-logic.ts` `app/(app)/app/orbit-starfield-mobile-logic.ts` |
| `rgba(40,34,68,'+(al*0.66)` | 2 | `（看用途）` | 变量 / 非常规写法 | `app/(app)/app/orbit-starfield-desktop-logic.ts` `app/(app)/app/orbit-starfield-mobile-logic.ts` |
| `rgba(20,17,42,0)` | 2 | `（去掉阴影）/ shadow-float` | 黑色半透明：阴影，浮层用 shadow-float，其余去掉 | `app/(app)/app/orbit-starfield-desktop-logic.ts` `app/(app)/app/orbit-starfield-mobile-logic.ts` |
| `rgba(150,138,224,'+bloom+')` | 2 | `（看用途）` | 变量 / 非常规写法 | `app/(app)/app/orbit-starfield-desktop-logic.ts` `app/(app)/app/orbit-starfield-mobile-logic.ts` |
| `rgba(150,138,224,0)` | 2 | `accent-soft` | 紫浅底 | `app/(app)/app/orbit-starfield-desktop-logic.ts` `app/(app)/app/orbit-starfield-mobile-logic.ts` |
| `rgba(48,42,86,'+wash+')` | 2 | `（看用途）` | 变量 / 非常规写法 | `app/(app)/app/orbit-starfield-desktop-logic.ts` `app/(app)/app/orbit-starfield-mobile-logic.ts` |
| `rgba(30,26,58,'+(wash*0.96)` | 2 | `（看用途）` | 变量 / 非常规写法 | `app/(app)/app/orbit-starfield-desktop-logic.ts` `app/(app)/app/orbit-starfield-mobile-logic.ts` |
| `rgba(15,12,34,'+(wash*0.82)` | 2 | `（看用途）` | 变量 / 非常规写法 | `app/(app)/app/orbit-starfield-desktop-logic.ts` `app/(app)/app/orbit-starfield-mobile-logic.ts` |
| `rgba(118,104,232,'+a+')` | 2 | `（看用途）` | 变量 / 非常规写法 | `app/(app)/app/orbit-starfield-desktop-logic.ts` `app/(app)/app/orbit-starfield-mobile-logic.ts` |
| `rgba(96,84,200,'+(a*0.5)` | 2 | `（看用途）` | 变量 / 非常规写法 | `app/(app)/app/orbit-starfield-desktop-logic.ts` `app/(app)/app/orbit-starfield-mobile-logic.ts` |
| `rgba(96,84,200,0)` | 2 | `accent-soft` | 紫浅底 | `app/(app)/app/orbit-starfield-desktop-logic.ts` `app/(app)/app/orbit-starfield-mobile-logic.ts` |
| `rgba(216,176,106,0.3)` | 2 | `mac-apricot-ink` | 金黄图形；文字用 mac-apricot-text | `app/(app)/app/orbit-starfield-desktop-logic.ts` `app/(app)/app/orbit-starfield-mobile-logic.ts` |
| `rgba(150,150,210,'+(0.06*al)` | 2 | `（看用途）` | 变量 / 非常规写法 | `app/(app)/app/orbit-starfield-desktop-logic.ts` `app/(app)/app/orbit-starfield-mobile-logic.ts` |
| `rgba(180,176,235,0.3)` | 2 | `plum-300` | 浅紫装饰 / 焦点 | `app/(app)/app/orbit-starfield-desktop-logic.ts` `app/(app)/app/orbit-starfield-mobile-logic.ts` |
| `rgba(205,201,230,0.92)` | 2 | `line` | 分隔 / 描边 | `app/(app)/app/orbit-starfield-desktop-logic.ts` `app/(app)/app/orbit-starfield-mobile-logic.ts` |
| `rgba(139,123,240,'+al+')` | 2 | `（看用途）` | 变量 / 非常规写法 | `app/(app)/app/orbit-starfield-desktop-logic.ts` `app/(app)/app/orbit-starfield-mobile-logic.ts` |
| `rgba(139,123,240,'+(al*0.5)` | 2 | `（看用途）` | 变量 / 非常规写法 | `app/(app)/app/orbit-starfield-desktop-logic.ts` `app/(app)/app/orbit-starfield-mobile-logic.ts` |
| `rgba(139,123,240,'+(engBase*0.16)` | 2 | `（看用途）` | 变量 / 非常规写法 | `app/(app)/app/orbit-starfield-desktop-logic.ts` `app/(app)/app/orbit-starfield-mobile-logic.ts` |
| `rgba(139,123,240,'+(engBase*0.1)` | 2 | `（看用途）` | 变量 / 非常规写法 | `app/(app)/app/orbit-starfield-desktop-logic.ts` `app/(app)/app/orbit-starfield-mobile-logic.ts` |
| `rgba(166,150,250,'+(engBase*(0.32+engBoost*0.45)` | 2 | `（看用途）` | 变量 / 非常规写法 | `app/(app)/app/orbit-starfield-desktop-logic.ts` `app/(app)/app/orbit-starfield-mobile-logic.ts` |
| `rgba(216,176,106,':'rgba(143,128,244,')` | 2 | `（看用途）` | 变量 / 非常规写法 | `app/(app)/app/orbit-starfield-desktop-logic.ts` `app/(app)/app/orbit-starfield-mobile-logic.ts` |
| `rgba(216,176,106,':'rgba(170,156,240,')` | 2 | `（看用途）` | 变量 / 非常规写法 | `app/(app)/app/orbit-starfield-desktop-logic.ts` `app/(app)/app/orbit-starfield-mobile-logic.ts` |
| `#EFEAFF` | 2 | `accent-soft` | 紫浅底 | `app/(app)/app/orbit-starfield-desktop-logic.ts` `app/(app)/app/orbit-starfield-mobile-logic.ts` |
| `#D6D0FF` | 2 | `accent-soft` | 紫浅底 | `app/(app)/app/orbit-starfield-desktop-logic.ts` `app/(app)/app/orbit-starfield-mobile-logic.ts` |
| `rgba(40,34,72,'+(0.4*f)` | 2 | `（看用途）` | 变量 / 非常规写法 | `app/(app)/app/orbit-starfield-desktop-logic.ts` `app/(app)/app/orbit-starfield-mobile-logic.ts` |
| `rgba(24,20,48,'+(0.3*f)` | 2 | `（看用途）` | 变量 / 非常规写法 | `app/(app)/app/orbit-starfield-desktop-logic.ts` `app/(app)/app/orbit-starfield-mobile-logic.ts` |
| `rgba(14,11,30,'+(0.22*f)` | 2 | `（看用途）` | 变量 / 非常规写法 | `app/(app)/app/orbit-starfield-desktop-logic.ts` `app/(app)/app/orbit-starfield-mobile-logic.ts` |
| `#E8E6F4` | 2 | `surface-2` | 浅灰面 | `app/(app)/app/orbit-starfield-desktop-logic.ts` `app/(app)/app/orbit-starfield-mobile-logic.ts` |
| `rgba(11,10,21,0.62)` | 2 | `scrim / scrim-web` | 黑色半透明：遮罩 | `app/(app)/app/orbit-starfield-desktop-logic.ts` `app/(app)/app/orbit-starfield-mobile-logic.ts` |
| `rgba(0,0,0,0.7)` | 2 | `scrim / scrim-web` | 黑色半透明：遮罩 | `app/(app)/app/orbit-starfield-desktop-logic.ts` `app/(app)/app/orbit-starfield-mobile-logic.ts` |
| `rgba(165,160,210,0.45)` | 2 | `plum-300` | 浅紫装饰 / 焦点 | `app/(app)/app/orbit-starfield-desktop-logic.ts` `app/(app)/app/orbit-starfield-mobile-logic.ts` |
| `rgba(165,160,210,0.4)` | 2 | `plum-300` | 浅紫装饰 / 焦点 | `app/(app)/app/orbit-starfield-desktop-logic.ts` `app/(app)/app/orbit-starfield-mobile-logic.ts` |
| `rgba(90,80,200,0.08)` | 2 | `accent-soft` | 紫浅底 | `app/(app)/app/orbit-starfield-desktop-logic.ts` `app/(app)/app/orbit-starfield-mobile-logic.ts` |
| `rgba(90,80,200,0)` | 2 | `accent-soft` | 紫浅底 | `app/(app)/app/orbit-starfield-desktop-logic.ts` `app/(app)/app/orbit-starfield-mobile-logic.ts` |
| `rgba(5,4,11,0)` | 2 | `（去掉阴影）/ shadow-float` | 黑色半透明：阴影，浮层用 shadow-float，其余去掉 | `app/(app)/app/orbit-starfield-desktop-logic.ts` `app/(app)/app/orbit-starfield-mobile-logic.ts` |
| `rgba(4,3,9,0.62)` | 2 | `scrim / scrim-web` | 黑色半透明：遮罩 | `app/(app)/app/orbit-starfield-desktop-logic.ts` `app/(app)/app/orbit-starfield-mobile-logic.ts` |
| `rgba(139,123,240,0.30)` | 2 | `plum-300` | 浅紫装饰 / 焦点 | `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `#C8C4DD` | 2 | `ink-4` | 装饰灰；作文字时用 ink-3-text | `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `rgba(139,123,240,0.12)` | 2 | `accent-soft` | 紫浅底 | `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `rgba(139,123,240,0.06)` | 2 | `accent-soft` | 紫浅底 | `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `rgba(255,255,255,0.035)` | 2 | `line` | 白色低透明：深色面上的分隔 | `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `rgba(150,145,200,0.15)` | 2 | `accent-soft` | 紫浅底 | `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `rgba(120,108,240,0.5)` | 2 | `plum-300` | 浅紫装饰 / 焦点 | `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `rgba(255,255,255,0.05)` | 2 | `line` | 白色低透明：深色面上的分隔 | `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `#9389D6` | 2 | `plum-300` | 浅紫装饰 / 焦点 | `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `#EEECF7` | 2 | `surface-2` | 浅灰面 | `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `rgba(139,123,240,0.14)` | 2 | `accent-soft` | 紫浅底 | `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `rgba(150,140,255,0.4)` | 2 | `plum-300` | 浅紫装饰 / 焦点 | `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `#C7C0FF` | 2 | `accent-soft` | 紫浅底 | `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `rgba(139,123,240,0.28)` | 2 | `accent-soft` | 紫浅底 | `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `rgba(160,150,255,0.8)` | 2 | `plum-300` | 浅紫装饰 / 焦点 | `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `#C4C0D8` | 2 | `ink-4` | 装饰灰；作文字时用 ink-3-text | `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `rgba(12,10,22,0.55)` | 2 | `scrim / scrim-web` | 黑色半透明：遮罩 | `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `rgba(139,123,240,0.22)` | 2 | `accent-soft` | 紫浅底 | `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `rgba(139,123,240,0.7)` | 2 | `plum-300` | 浅紫装饰 / 焦点 | `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `#CDC8EC` | 2 | `plum-300` | 浅紫装饰 / 焦点 | `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `rgba(14,12,24,0.82)` | 2 | `scrim / scrim-web` | 黑色半透明：遮罩 | `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `#E7E4F4` | 2 | `surface-2` | 浅灰面 | `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `#9C98B6` | 2 | `ink-4` | 装饰灰；作文字时用 ink-3-text | `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `rgba(10,8,18,0.5)` | 2 | `scrim / scrim-web` | 黑色半透明：遮罩 | `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `#CDCAE3` | 2 | `line` | 分隔 / 描边 | `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `#9B8BFF` | 2 | `plum-300` | 浅紫装饰 / 焦点 | `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `rgba(8,7,16,0.82)` | 2 | `scrim / scrim-web` | 黑色半透明：遮罩 | `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `rgba(6,5,12,0.97)` | 2 | `scrim / scrim-web` | 黑色半透明：遮罩 | `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `#A7A1D6` | 2 | `plum-300` | 浅紫装饰 / 焦点 | `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `#CDD0EC` | 2 | `line` | 分隔 / 描边 | `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `rgba(22,20,40,0.97)` | 2 | `scrim / scrim-web` | 黑色半透明：遮罩 | `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `rgba(12,11,24,0.985)` | 2 | `scrim / scrim-web` | 黑色半透明：遮罩 | `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `rgba(123,108,232,0.5)` | 2 | `plum-300` | 浅紫装饰 / 焦点 | `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `#D7D6E8` | 2 | `line` | 分隔 / 描边 | `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `#F1EEF8` | 2 | `surface-2` | 浅灰面 | `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `rgba(139,123,240,0.10)` | 2 | `accent-soft` | 紫浅底 | `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `rgba(139,123,240,0.85)` | 2 | `plum-300` | 浅紫装饰 / 焦点 | `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `rgba(139,123,240,0.18)` | 2 | `accent-soft` | 紫浅底 | `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `rgba(150,145,200,0.26)` | 2 | `accent-soft` | 紫浅底 | `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `#C8A978` | 2 | `mac-apricot-ink` | 金黄图形；文字用 mac-apricot-text | `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `rgba(216,176,106,0.42)` | 2 | `mac-apricot-ink` | 金黄图形；文字用 mac-apricot-text | `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `rgba(216,176,106,0.22)` | 2 | `mac-apricot` | 黄 / 橙浅底 | `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `#E0C187` | 2 | `mac-apricot-ink` | 金黄图形；文字用 mac-apricot-text | `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `#F6EFE2` | 2 | `mac-apricot` | 黄 / 橙浅底 | `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `rgba(198,160,106,0.55)` | 2 | `mac-apricot-ink` | 金黄图形；文字用 mac-apricot-text | `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `rgba(198,160,106,0.10)` | 2 | `mac-apricot` | 黄 / 橙浅底 | `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `rgba(198,160,106,0.9)` | 2 | `mac-apricot-ink` | 金黄图形；文字用 mac-apricot-text | `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `rgba(198,160,106,0.18)` | 2 | `mac-apricot` | 黄 / 橙浅底 | `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `#9F9CB8` | 2 | `ink-4` | 装饰灰；作文字时用 ink-3-text | `app/(app)/app/orbit-starfield-desktop.tsx` `app/(app)/app/orbit-starfield-mobile.tsx` |
| `rgba(180,176,220,0.32)` | 2 | `ink-4` | 装饰灰；作文字时用 ink-3-text | `app/(app)/app/orbit-starfield-mobile-logic.ts` |
| `#16A34A` | 2 | `ok-text` | 完成 / 成功；图形用 ok | `app/(app)/app/orbit-theme.tsx` |
| `rgba(22,163,74,0.12)` | 2 | `ok-soft` | 绿浅底 | `app/(app)/app/orbit-theme.tsx` |
| `#B45309` | 2 | `mac-apricot-text` | 注意 / 提醒文字 | `app/(app)/app/orbit-theme.tsx` |
| `rgba(180,83,9,0.12)` | 2 | `mac-apricot` | 黄 / 橙浅底 | `app/(app)/app/orbit-theme.tsx` |
| `#1D4ED8` | 2 | `mac-blue-text` | 信息蓝；图形用 mac-blue-ink | `app/(app)/app/orbit-theme.tsx` |
| `rgba(29,78,216,0.12)` | 2 | `mac-blue` | 蓝浅底 | `app/(app)/app/orbit-theme.tsx` |
| `rgba(23,33,31,0.40)` | 2 | `scrim / scrim-web` | 黑色半透明：遮罩 | `app/(app)/app/orbit-theme.tsx` |
| `#0E7490` | 2 | `mac-teal-text` | 青色文字；图形用 mac-teal-ink | `app/(app)/app/orbit-theme.tsx` |
| `#EEF2F0` | 2 | `ok-soft` | 绿浅底 | `app/(app)/app/orbit-theme.tsx` |
| `rgba(23,33,31,0.10)` | 2 | `（去掉阴影）/ shadow-float` | 黑色半透明：阴影，浮层用 shadow-float，其余去掉 | `app/(app)/app/orbit-theme.tsx` |
| `rgba(23,33,31,0.06)` | 2 | `（去掉阴影）/ shadow-float` | 黑色半透明：阴影，浮层用 shadow-float，其余去掉 | `app/(app)/app/orbit-theme.tsx` |
| `#A9ACE8` | 2 | `plum-300` | 浅紫装饰 / 焦点 | `app/(app)/app/profile/profile-0918/profile-shell.tsx` |
| `#4285F4` | 1 | `mac-blue-text` | 信息蓝；图形用 mac-blue-ink | `app/(app)/app/account/auth-0918/auth-form.tsx` |
| `#34A853` | 1 | `ok-text` | 完成 / 成功；图形用 ok | `app/(app)/app/account/auth-0918/auth-form.tsx` |
| `#FBBC05` | 1 | `mac-apricot-text` | 注意 / 提醒文字 | `app/(app)/app/account/auth-0918/auth-form.tsx` |
| `#EA4335` | 1 | `coral-text` | 错误 / 删除 | `app/(app)/app/account/auth-0918/auth-form.tsx` |
| `#FDF2F4` | 1 | `coral-soft` | 红 / 橙红浅底 | `app/(app)/app/account/auth-0918/auth-modal.tsx` |
| `#F5C6D0` | 1 | `coral-soft` | 红 / 橙红浅底 | `app/(app)/app/account/auth-0918/auth-modal.tsx` |
| `#A32642` | 1 | `coral-text` | 错误 / 删除 | `app/(app)/app/account/auth-0918/auth-modal.tsx` |
| `rgba(255,255,255,.66)` | 1 | `glass` | 白色半透明：毛玻璃 | `app/(app)/app/agent/iorbit-0918/console-styles.ts` |
| `#DBE7E4` | 1 | `mac-teal` | 青浅底 | `app/(app)/app/agent/iorbit-0918/console-styles.ts` |
| `rgba(255,255,255,.9)` | 1 | `glass` | 白色半透明：毛玻璃 | `app/(app)/app/agent/iorbit-0918/console-styles.ts` |
| `#7D92AD` | 1 | `mac-blue-text` | 信息蓝；图形用 mac-blue-ink | `app/(app)/app/agent/iorbit-0918/console-styles.ts` |
| `#40536B` | 1 | `mac-blue-text` | 信息蓝；图形用 mac-blue-ink | `app/(app)/app/agent/iorbit-0918/console-styles.ts` |
| `#C39A63` | 1 | `mac-apricot-ink` | 金黄图形；文字用 mac-apricot-text | `app/(app)/app/agent/iorbit-0918/console-styles.ts` |
| `#8A6B3A` | 1 | `mac-apricot-text` | 注意 / 提醒文字 | `app/(app)/app/agent/iorbit-0918/console-styles.ts` |
| `#6BA585` | 1 | `ok-text` | 完成 / 成功；图形用 ok | `app/(app)/app/agent/iorbit-0918/console-styles.ts` |
| `#3F7D5C` | 1 | `ok-text` | 完成 / 成功；图形用 ok | `app/(app)/app/agent/iorbit-0918/console-styles.ts` |
| `#A487A0` | 1 | `mac-pink-text` | 粉色文字；图形用 mac-pink-ink | `app/(app)/app/agent/iorbit-0918/console-styles.ts` |
| `#7A5A74` | 1 | `mac-pink-text` | 粉色文字；图形用 mac-pink-ink | `app/(app)/app/agent/iorbit-0918/console-styles.ts` |
| `rgba(23,106,115,.13)` | 1 | `mac-teal` | 青浅底 | `app/(app)/app/agent/iorbit-0918/console-styles.ts` |
| `rgba(180,83,9,.07)` | 1 | `mac-apricot` | 黄 / 橙浅底 | `app/(app)/app/agent/iorbit-0918/console-styles.ts` |
| `rgba(179,38,30,.06)` | 1 | `coral-soft` | 红 / 橙红浅底 | `app/(app)/app/agent/iorbit-0918/console-styles.ts` |
| `rgba(179,38,30,.25)` | 1 | `coral-soft` | 红 / 橙红浅底 | `app/(app)/app/agent/iorbit-0918/console-styles.ts` |
| `rgba(46,50,112,0.08)` | 1 | `accent-soft` | 紫浅底 | `app/(app)/app/agent/iorbit-0918/iorbit-home-styles.ts` |
| `rgba(75,79,199,0.08)` | 1 | `accent-soft` | 紫浅底 | `app/(app)/app/agent/iorbit-0918/iorbit-home-styles.ts` |
| `#F4F5FE` | 1 | `accent-soft` | 紫浅底 | `app/(app)/app/agent/iorbit-0918/iorbit-my-plan-styles.ts` |
| `#7A2E12` | 1 | `coral-text` | 错误 / 删除 | `app/(app)/app/agent/iorbit-0918/iorbit-plan-card-styles.ts` |
| `rgba(14,18,37,0.12)` | 1 | `（去掉阴影）/ shadow-float` | 黑色半透明：阴影，浮层用 shadow-float，其余去掉 | `app/(app)/app/agent/iorbit-0918/iorbit-styles.ts` |
| `#3B3FA8` | 1 | `accent-text` | 紫色强调；图形用 accent | `app/(app)/app/agent/iorbit-0918/plan-match-sheet.tsx` |
| `rgba(14,18,37,.38)` | 1 | `（去掉阴影）/ shadow-float` | 黑色半透明：阴影，浮层用 shadow-float，其余去掉 | `app/(app)/app/agent/iorbit-0918/plan-match-sheet.tsx` |
| `rgba(14,18,37,.22)` | 1 | `（去掉阴影）/ shadow-float` | 黑色半透明：阴影，浮层用 shadow-float，其余去掉 | `app/(app)/app/agent/iorbit-0918/plan-match-sheet.tsx` |
| `rgba(14,18,37,0.55)` | 1 | `scrim / scrim-web` | 黑色半透明：遮罩 | `app/(app)/app/contacts/card-batch-0918/card-batch-styles.ts` |
| `#1B1E33` | 1 | `ink` | 近黑 | `app/(app)/app/contacts/card-batch-0918/card-batch-styles.ts` |
| `rgba(251,241,220,0.14)` | 1 | `mac-apricot` | 黄 / 橙浅底 | `app/(app)/app/contacts/card-batch-0918/card-batch-styles.ts` |
| `#F2D9A6` | 1 | `mac-apricot-ink` | 金黄图形；文字用 mac-apricot-text | `app/(app)/app/contacts/card-batch-0918/card-batch-styles.ts` |
| `#D9DBF5` | 1 | `accent-soft` | 紫浅底 | `app/(app)/app/contacts/card-batch-0918/card-batch-styles.ts` |
| `#4A4F9C` | 1 | `accent-text` | 紫色强调；图形用 accent | `app/(app)/app/contacts/card-batch-0918/card-batch-styles.ts` |
| `#9A9DC0` | 1 | `ink-4` | 装饰灰；作文字时用 ink-3-text | `app/(app)/app/contacts/card-batch-0918/card-batch-styles.ts` |
| `#F2F3FB` | 1 | `accent-soft` | 紫浅底 | `app/(app)/app/contacts/card-batch-0918/card-batch-styles.ts` |
| `#E4F3EA` | 1 | `ok-soft` | 绿浅底 | `app/(app)/app/contacts/card-batch-0918/card-batch-styles.ts` |
| `#2F6B45` | 1 | `ok-text` | 完成 / 成功；图形用 ok | `app/(app)/app/contacts/card-batch-0918/card-batch-styles.ts` |
| `#6B6FA8` | 1 | `ink-3-text` | 灰色说明文字 | `app/(app)/app/contacts/card-batch-0918/card-batch-styles.ts` |
| `#7B7FE0` | 1 | `plum-300` | 浅紫装饰 / 焦点 | `app/(app)/app/contacts/card-batch-0918/card-batch-styles.ts` |
| `#CFE3D8` | 1 | `ok-text` | 完成 / 成功；图形用 ok | `app/(app)/app/contacts/card-batch-0918/card-batch-styles.ts` |
| `#F0C9C3` | 1 | `coral` | 红色图形；文字用 coral-text | `app/(app)/app/contacts/card-batch-0918/card-batch-styles.ts` |
| `#FFF8F7` | 1 | `coral-soft` | 红 / 橙红浅底 | `app/(app)/app/contacts/card-batch-0918/card-batch-styles.ts` |
| `rgba(75,79,199,0)` | 1 | `accent-soft` | 紫浅底 | `app/(app)/app/contacts/card-batch-0918/card-batch-styles.ts` |
| `rgba(75,79,199,0.28)` | 1 | `accent-soft` | 紫浅底 | `app/(app)/app/contacts/card-batch-0918/card-batch-styles.ts` |
| `rgba(75,79,199,0.6)` | 1 | `accent-text` | 紫色强调；图形用 accent | `app/(app)/app/contacts/card-batch-0918/card-batch-styles.ts` |
| `#ECEBE4` | 1 | `mac-apricot` | 黄 / 橙浅底 | `app/(app)/app/contacts/card-batch-0918/card-batch-styles.ts` |
| `rgba(255,255,255,0.96)` | 1 | `glass` | 白色半透明：毛玻璃 | `app/(app)/app/contacts/card-batch-0918/card-batch-styles.ts` |
| `rgba(59,63,122,0.14)` | 1 | `accent-soft` | 紫浅底 | `app/(app)/app/contacts/card-batch-0918/card-batch-styles.ts` |
| `#FBFBFF` | 1 | `accent-soft` | 紫浅底 | `app/(app)/app/contacts/network-0918/contact-value-line.tsx` |
| `#8A8DB3` | 1 | `ink-4` | 装饰灰；作文字时用 ink-3-text | `app/(app)/app/contacts/network-0918/contact-value-line.tsx` |
| `#C99A3A` | 1 | `mac-apricot-text` | 注意 / 提醒文字 | `app/(app)/app/contacts/network-0918/network-import-styles.ts` |
| `#FFFDF7` | 1 | `mac-apricot` | 黄 / 橙浅底 | `app/(app)/app/contacts/network-0918/network-import-styles.ts` |
| `#F7FAF8` | 1 | `ok-soft` | 绿浅底 | `app/(app)/app/contacts/network-0918/network-import-styles.ts` |
| `#F1F1FB` | 1 | `accent-soft` | 紫浅底 | `app/(app)/app/contacts/network-0918/network-insight-panel.tsx` |
| `#4A4E80` | 1 | `ink-2` | 深灰次级文字 | `app/(app)/app/contacts/network-0918/network-insight-panel.tsx` |
| `#E4E5FA` | 1 | `accent-soft` | 紫浅底 | `app/(app)/app/contacts/network-0918/network-model.ts` |
| `#F3F4FC` | 1 | `accent-soft` | 紫浅底 | `app/(app)/app/contacts/network-0918/network-shell.tsx` |
| `#B07A1E` | 1 | `mac-apricot-text` | 注意 / 提醒文字 | `app/(app)/app/contacts/network-0918/network-shell.tsx` |
| `#EEF0FF` | 1 | `accent-soft` | 紫浅底 | `app/(app)/app/contacts/network-0918/network-shell.tsx` |
| `#F1F2F6` | 1 | `surface-2` | 浅灰面 | `app/(app)/app/contacts/network-0918/network-shell.tsx` |
| `#5B5E7A` | 1 | `ink-2` | 深灰次级文字 | `app/(app)/app/contacts/network-0918/network-shell.tsx` |
| `#EAF6EF` | 1 | `ok-soft` | 绿浅底 | `app/(app)/app/contacts/network-0918/network-shell.tsx` |
| `#3A3E66` | 1 | `ink-2` | 深灰次级文字 | `app/(app)/app/contacts/network-0918/network-shell.tsx` |
| `#FFF6E5` | 1 | `mac-apricot` | 黄 / 橙浅底 | `app/(app)/app/contacts/network-0918/network-shell.tsx` |
| `#3D41B0` | 1 | `accent-text` | 紫色强调；图形用 accent | `app/(app)/app/contacts/network-0918/network-shell.tsx` |
| `#24613A` | 1 | `ok-text` | 完成 / 成功；图形用 ok | `app/(app)/app/contacts/network-0918/network-shell.tsx` |
| `#147D64` | 1 | `mac-teal-text` | 青色文字；图形用 mac-teal-ink | `app/(app)/app/events/[id]/operations/admission/event-admission-policy-panel.tsx` |
| `#EEF0F4` | 1 | `surface-2` | App 旧浅面 | `app/(app)/app/events/[id]/register/registration-portrait-recommendations.tsx` |
| `rgba(14,18,37,.35)` | 1 | `（去掉阴影）/ shadow-float` | 黑色半透明：阴影，浮层用 shadow-float，其余去掉 | `app/(app)/app/events/events-0918/event-modal-frame.tsx` |
| `rgba(59,63,122,0.28)` | 1 | `accent-soft` | 紫浅底 | `app/(app)/app/events/events-0918/events-shell.tsx` |
| `rgba(59,63,122,0.16)` | 1 | `accent-soft` | 紫浅底 | `app/(app)/app/events/events-0918/events-shell.tsx` |
| `#E8B34B` | 1 | `mac-apricot-ink` | 金黄图形；文字用 mac-apricot-text | `app/(app)/app/events/events-0918/events-shell.tsx` |
| `rgba(75,79,199,0.15)` | 1 | `accent-soft` | 紫浅底 | `app/(app)/app/events/events-0918/events-shell.tsx` |
| `#E3C25A` | 1 | `mac-apricot-ink` | 金黄图形；文字用 mac-apricot-text | `app/(app)/app/events/events-0918/events-shell.tsx` |
| `#6E56CF` | 1 | `accent-text` | 紫色强调；图形用 accent | `app/(app)/app/events/ops-0918/ops-form.tsx` |
| `#F1F8F4` | 1 | `ok-soft` | 绿浅底 | `app/(app)/app/events/ops-0918/ops-model.ts` |
| `#E0EFE6` | 1 | `ok-soft` | 绿浅底 | `app/(app)/app/events/ops-0918/ops-model.ts` |
| `#C8A24A` | 1 | `mac-apricot-text` | 注意 / 提醒文字 | `app/(app)/app/home/orbit-real-home.tsx` |
| `rgba(21,94,117,.30)` | 1 | `mac-teal-text` | 青色文字；图形用 mac-teal-ink | `app/(app)/app/home/orbit-real-home.tsx` |
| `rgba(23,33,31,.16)` | 1 | `（去掉阴影）/ shadow-float` | 黑色半透明：阴影，浮层用 shadow-float，其余去掉 | `app/(app)/app/home/orbit-real-home.tsx` |
| `rgba(10,12,16,0.42)` | 1 | `scrim / scrim-web` | 黑色半透明：遮罩 | `app/(app)/app/inbox/relationship-inbox-panel.tsx` |
| `rgba(10,12,16,0.18)` | 1 | `（去掉阴影）/ shadow-float` | 黑色半透明：阴影，浮层用 shadow-float，其余去掉 | `app/(app)/app/inbox/relationship-inbox-panel.tsx` |
| `rgba(22,18,40,.12)` | 1 | `（去掉阴影）/ shadow-float` | 黑色半透明：阴影，浮层用 shadow-float，其余去掉 | `app/(app)/app/inbox/relationship-inbox-panel.tsx` |
| `rgba(20,16,36,.04)` | 1 | `（去掉阴影）/ shadow-float` | 黑色半透明：阴影，浮层用 shadow-float，其余去掉 | `app/(app)/app/inbox/relationship-inbox-panel.tsx` |
| `rgba(20,16,36,.05)` | 1 | `（去掉阴影）/ shadow-float` | 黑色半透明：阴影，浮层用 shadow-float，其余去掉 | `app/(app)/app/inbox/relationship-inbox-panel.tsx` |
| `rgba(20,16,36,.09)` | 1 | `（去掉阴影）/ shadow-float` | 黑色半透明：阴影，浮层用 shadow-float，其余去掉 | `app/(app)/app/inbox/relationship-inbox-panel.tsx` |
| `rgba(0,0,0,0.3)` | 1 | `（去掉阴影）/ shadow-float` | 黑色半透明：阴影，浮层用 shadow-float，其余去掉 | `app/(app)/app/orbit-account-shell.tsx` |
| `#0B3F46` | 1 | `ink` | 近黑 | `app/(app)/app/orbit-global-ask/orbit-global-ask-styles.ts` |
| `#0E8B98` | 1 | `mac-teal-text` | 青色文字；图形用 mac-teal-ink | `app/(app)/app/orbit-global-ask/orbit-global-ask-styles.ts` |
| `#1A7B85` | 1 | `mac-teal-text` | 青色文字；图形用 mac-teal-ink | `app/(app)/app/orbit-global-ask/orbit-global-ask-styles.ts` |
| `#109AA8` | 1 | `mac-teal-text` | 青色文字；图形用 mac-teal-ink | `app/(app)/app/orbit-global-ask/orbit-global-ask-styles.ts` |
| `#12ACB8` | 1 | `mac-teal-text` | 青色文字；图形用 mac-teal-ink | `app/(app)/app/orbit-global-ask/orbit-global-ask-styles.ts` |
| `rgba(14,154,167,0.30)` | 1 | `mac-teal-text` | 青色文字；图形用 mac-teal-ink | `app/(app)/app/orbit-global-ask/orbit-global-ask-styles.ts` |
| `rgba(11,63,70,0.26)` | 1 | `mac-teal` | 青浅底 | `app/(app)/app/orbit-global-ask/orbit-global-ask-styles.ts` |
| `rgba(11,63,70,0.16)` | 1 | `mac-teal` | 青浅底 | `app/(app)/app/orbit-global-ask/orbit-global-ask-styles.ts` |
| `rgba(255,255,255,.34)` | 1 | `line` | 白色低透明：深色面上的分隔 | `app/(app)/app/orbit-global-ask/orbit-global-ask-styles.ts` |
| `#3FBF9F` | 1 | `mac-teal-text` | 青色文字；图形用 mac-teal-ink | `app/(app)/app/orbit-landing-0918.tsx` |
| `#4A5468` | 1 | `ink-2` | 深灰次级文字 | `app/(app)/app/orbit-landing-route-view-model.ts` |
| `#2A2166` | 1 | `plum-900` | 深紫 | `app/(app)/app/orbit-reference-primitives.tsx` |
| `#2B1A56` | 1 | `plum-900` | 深紫 | `app/(app)/app/orbit-reference-primitives.tsx` |
| `#3C1E4E` | 1 | `plum-900` | 深紫 | `app/(app)/app/orbit-reference-primitives.tsx` |
| `#CB8E34` | 1 | `mac-apricot-text` | 注意 / 提醒文字 | `app/(app)/app/orbit-reference-primitives.tsx` |
| `#5C3C14` | 1 | `mac-apricot-text` | 注意 / 提醒文字 | `app/(app)/app/orbit-reference-primitives.tsx` |
| `#17393E` | 1 | `mac-teal-text` | 青色文字；图形用 mac-teal-ink | `app/(app)/app/orbit-reference-primitives.tsx` |
| `#1C2358` | 1 | `plum-900` | 深紫 | `app/(app)/app/orbit-reference-primitives.tsx` |
| `#221F3A` | 1 | `plum-900` | 深紫 | `app/(app)/app/orbit-reference-primitives.tsx` |
| `rgba(6,5,13,0.42)` | 1 | `scrim / scrim-web` | 黑色半透明：遮罩 | `app/(app)/app/orbit-reference-primitives.tsx` |
| `rgba(6,5,13,0.06)` | 1 | `（去掉阴影）/ shadow-float` | 黑色半透明：阴影，浮层用 shadow-float，其余去掉 | `app/(app)/app/orbit-reference-primitives.tsx` |
| `rgba(6,5,13,0.10)` | 1 | `（去掉阴影）/ shadow-float` | 黑色半透明：阴影，浮层用 shadow-float，其余去掉 | `app/(app)/app/orbit-reference-primitives.tsx` |
| `rgba(6,5,13,0.62)` | 1 | `scrim / scrim-web` | 黑色半透明：遮罩 | `app/(app)/app/orbit-reference-primitives.tsx` |
| `rgba(255,255,255,0.32)` | 1 | `line` | 白色低透明：深色面上的分隔 | `app/(app)/app/orbit-reference-primitives.tsx` |
| `rgba(255,255,255,0.85)` | 1 | `glass` | 白色半透明：毛玻璃 | `app/(app)/app/orbit-reference-primitives.tsx` |
| `rgba(255,255,255,0.6)` | 1 | `glass` | 白色半透明：毛玻璃 | `app/(app)/app/orbit-reference-primitives.tsx` |
| `rgba(0,0,0,0.18)` | 1 | `（去掉阴影）/ shadow-float` | 黑色半透明：阴影，浮层用 shadow-float，其余去掉 | `app/(app)/app/orbit-reference-primitives.tsx` |
| `rgba(8,7,16,0.26)` | 1 | `（去掉阴影）/ shadow-float` | 黑色半透明：阴影，浮层用 shadow-float，其余去掉 | `app/(app)/app/orbit-reference-styles.tsx` |
| `rgba(150,145,200,0.07)` | 1 | `accent-soft` | 紫浅底 | `app/(app)/app/orbit-reference-styles.tsx` |
| `rgba(139,123,240,0.55)` | 1 | `plum-300` | 浅紫装饰 / 焦点 | `app/(app)/app/orbit-reference-styles.tsx` |
| `rgba(20,20,28,0.42)` | 1 | `scrim / scrim-web` | 黑色半透明：遮罩 | `app/(app)/app/orbit-reference-styles.tsx` |
| `#8170F1` | 1 | `plum-300` | 浅紫装饰 / 焦点 | `app/(app)/app/orbit-reference-styles.tsx` |
| `#614CE2` | 1 | `accent-text` | 紫色强调；图形用 accent | `app/(app)/app/orbit-reference-styles.tsx` |
| `#8A8A93` | 1 | `ink-3-text` | 灰色说明文字 | `app/(app)/app/orbit-reference-styles.tsx` |
| `#73737B` | 1 | `ink-3-text` | 灰色说明文字 | `app/(app)/app/orbit-reference-styles.tsx` |
| `#34C98E` | 1 | `ok-text` | 完成 / 成功；图形用 ok | `app/(app)/app/orbit-reference-styles.tsx` |
| `rgba(52,201,142,0.14)` | 1 | `ok-soft` | 绿浅底 | `app/(app)/app/orbit-reference-styles.tsx` |
| `#7FE0B4` | 1 | `ok-text` | 完成 / 成功；图形用 ok | `app/(app)/app/orbit-reference-styles.tsx` |
| `#E0B472` | 1 | `mac-apricot-ink` | 金黄图形；文字用 mac-apricot-text | `app/(app)/app/orbit-reference-styles.tsx` |
| `rgba(216,176,106,0.15)` | 1 | `mac-apricot` | 黄 / 橙浅底 | `app/(app)/app/orbit-reference-styles.tsx` |
| `#F0C374` | 1 | `mac-apricot-ink` | 金黄图形；文字用 mac-apricot-text | `app/(app)/app/orbit-reference-styles.tsx` |
| `#F09AA4` | 1 | `coral` | 红色图形；文字用 coral-text | `app/(app)/app/orbit-reference-styles.tsx` |
| `#6FA8F8` | 1 | `mac-blue-text` | 信息蓝；图形用 mac-blue-ink | `app/(app)/app/orbit-reference-styles.tsx` |
| `rgba(45,127,240,0.17)` | 1 | `mac-blue` | 蓝浅底 | `app/(app)/app/orbit-reference-styles.tsx` |
| `rgba(0,0,0,0.55)` | 1 | `scrim / scrim-web` | 黑色半透明：遮罩 | `app/(app)/app/orbit-reference-styles.tsx` |
| `rgba(123,108,232,0.25)` | 1 | `accent-soft` | 紫浅底 | `app/(app)/app/orbit-reference-styles.tsx` |
| `rgba(0,0,0,0.6)` | 1 | `scrim / scrim-web` | 黑色半透明：遮罩 | `app/(app)/app/orbit-reference-styles.tsx` |
| `rgba(123,108,232,0.35)` | 1 | `plum-300` | 浅紫装饰 / 焦点 | `app/(app)/app/orbit-reference-styles.tsx` |
| `rgba(4,3,10,0.62)` | 1 | `scrim / scrim-web` | 黑色半透明：遮罩 | `app/(app)/app/orbit-reference-styles.tsx` |
| `rgba(16,13,32,0.86)` | 1 | `scrim / scrim-web` | 黑色半透明：遮罩 | `app/(app)/app/orbit-reference-styles.tsx` |
| `rgba(10,8,18,0.66)` | 1 | `scrim / scrim-web` | 黑色半透明：遮罩 | `app/(app)/app/orbit-reference-styles.tsx` |
| `rgba(16,13,32,0.84)` | 1 | `scrim / scrim-web` | 黑色半透明：遮罩 | `app/(app)/app/orbit-reference-styles.tsx` |
| `#E5E3FA` | 1 | `accent-soft` | 紫浅底 | `app/(app)/app/orbit-reference-styles.tsx` |
| `rgba(255,255,255,0.16)` | 1 | `line` | 白色低透明：深色面上的分隔 | `app/(app)/app/orbit-reference-styles.tsx` |
| `#7FE8BE` | 1 | `ok-text` | 完成 / 成功；图形用 ok | `app/(app)/app/orbit-reference-styles.tsx` |
| `#CFC6F8` | 1 | `accent-soft` | 紫浅底 | `app/(app)/app/orbit-reference-styles.tsx` |
| `#CF9438` | 1 | `mac-apricot-text` | 注意 / 提醒文字 | `app/(app)/app/orbit-reference-styles.tsx` |
| `#D8D9F0` | 1 | `line` | 分隔 / 描边 | `app/(app)/app/orbit-reference-styles.tsx` |
| `#16060B` | 1 | `ink` | 近黑 | `app/(app)/app/orbit-reference-styles.tsx` |
| `#F2839A` | 1 | `coral` | 红色图形；文字用 coral-text | `app/(app)/app/orbit-reference-styles.tsx` |
| `rgba(224,65,95,0.26)` | 1 | `coral-soft` | 红 / 橙红浅底 | `app/(app)/app/orbit-reference-styles.tsx` |
| `rgba(224,65,95,0.24)` | 1 | `coral-soft` | 红 / 橙红浅底 | `app/(app)/app/orbit-reference-styles.tsx` |
| `#7B838A` | 1 | `ink-3-text` | 灰色说明文字 | `app/(app)/app/orbit-reference-styles.tsx` |
| `rgba(52,201,142,.75)` | 1 | `ok-text` | 完成 / 成功；图形用 ok | `app/(app)/app/orbit-reference-styles.tsx` |
| `rgba(139,123,240,.72)` | 1 | `plum-300` | 浅紫装饰 / 焦点 | `app/(app)/app/orbit-reference-styles.tsx` |
| `rgba(111,168,248,.72)` | 1 | `mac-blue-text` | 信息蓝；图形用 mac-blue-ink | `app/(app)/app/orbit-reference-styles.tsx` |
| `rgba(216,176,106,0.34)` | 1 | `mac-apricot-ink` | 金黄图形；文字用 mac-apricot-text | `app/(app)/app/orbit-starfield-desktop-logic.ts` |
| `rgba(150,145,200,0.13)` | 1 | `accent-soft` | 紫浅底 | `app/(app)/app/orbit-starfield-desktop-logic.ts` |
| `#9C92E0` | 1 | `plum-300` | 浅紫装饰 / 焦点 | `app/(app)/app/orbit-starfield-desktop-logic.ts` |
| `rgba(170,176,204,0.7)` | 1 | `ink-4` | 装饰灰；作文字时用 ink-3-text | `app/(app)/app/orbit-starfield-desktop-logic.ts` |
| `rgba(24,22,45,0.99)` | 1 | `plum-900` | 深紫 | `app/(app)/app/orbit-starfield-mobile-logic.ts` |
| `rgba(14,13,27,1)` | 1 | `ink` | 近黑 | `app/(app)/app/orbit-starfield-mobile-logic.ts` |
| `rgba(216,176,106,0.4)` | 1 | `mac-apricot-ink` | 金黄图形；文字用 mac-apricot-text | `app/(app)/app/orbit-starfield-mobile-logic.ts` |
| `rgba(186,190,214,0.7)` | 1 | `ink-4` | 装饰灰；作文字时用 ink-3-text | `app/(app)/app/orbit-starfield-mobile-logic.ts` |
| `#F3F5FF` | 1 | `accent-soft` | 紫浅底 | `app/(app)/app/orbit-starfield-mobile-logic.ts` |
| `#CFC9EF` | 1 | `accent-soft` | 紫浅底 | `app/(app)/app/orbit-starfield-mobile-logic.ts` |
| `rgba(18,16,34,0.4)` | 1 | `scrim / scrim-web` | 黑色半透明：遮罩 | `app/(app)/app/orbit-starfield-mobile-logic.ts` |
| `rgba(150,145,200,0.1)` | 1 | `accent-soft` | 紫浅底 | `app/(app)/app/orbit-starfield-mobile-logic.ts` |
| `#241C3A` | 1 | `plum-900` | 深紫 | `app/(app)/app/orbit-starfield-mobile-logic.ts` |
| `rgba(176,180,206,0.68)` | 1 | `ink-4` | 装饰灰；作文字时用 ink-3-text | `app/(app)/app/orbit-starfield-mobile-logic.ts` |
| `rgba(216,176,106,0.8)` | 1 | `mac-apricot-ink` | 金黄图形；文字用 mac-apricot-text | `app/(app)/app/orbit-starfield-mobile-logic.ts` |
| `rgba(170,154,250,0.8)` | 1 | `plum-300` | 浅紫装饰 / 焦点 | `app/(app)/app/orbit-starfield-mobile-logic.ts` |
| `#04030A` | 1 | `ink` | 近黑 | `app/(app)/app/orbit-starfield-mobile.tsx` |
| `#5B646B` | 1 | `ink-2` | 深灰次级文字 | `app/(app)/app/orbit-theme.tsx` |
| `#B4232E` | 1 | `coral-text` | 错误 / 删除 | `app/(app)/app/orbit-theme.tsx` |
| `#0F4758` | 1 | `mac-teal-text` | 青色文字；图形用 mac-teal-ink | `app/(app)/app/orbit-theme.tsx` |
| `rgba(21,94,117,0.12)` | 1 | `mac-teal` | 青浅底 | `app/(app)/app/orbit-theme.tsx` |
| `rgba(21,94,117,0.06)` | 1 | `mac-teal` | 青浅底 | `app/(app)/app/orbit-theme.tsx` |
| `rgba(14,116,144,0.40)` | 1 | `mac-teal-text` | 青色文字；图形用 mac-teal-ink | `app/(app)/app/orbit-theme.tsx` |
| `#52615D` | 1 | `ink-2` | 深灰次级文字 | `app/(app)/app/orbit-theme.tsx` |
| `#5A6864` | 1 | `ink-2` | 深灰次级文字 | `app/(app)/app/orbit-theme.tsx` |
| `#8A938F` | 1 | `ink-3-text` | 灰色说明文字 | `app/(app)/app/orbit-theme.tsx` |
| `#E8EFEC` | 1 | `ok-soft` | 绿浅底 | `app/(app)/app/orbit-theme.tsx` |
| `#F9FBFA` | 1 | `ok-soft` | 绿浅底 | `app/(app)/app/orbit-theme.tsx` |
| `#F1F5F3` | 1 | `ok-soft` | 绿浅底 | `app/(app)/app/orbit-theme.tsx` |
| `rgba(23,33,31,0.16)` | 1 | `（去掉阴影）/ shadow-float` | 黑色半透明：阴影，浮层用 shadow-float，其余去掉 | `app/(app)/app/orbit-theme.tsx` |
| `rgba(23,33,31,0.24)` | 1 | `（去掉阴影）/ shadow-float` | 黑色半透明：阴影，浮层用 shadow-float，其余去掉 | `app/(app)/app/orbit-theme.tsx` |
| `rgba(23,33,31,0.07)` | 1 | `（去掉阴影）/ shadow-float` | 黑色半透明：阴影，浮层用 shadow-float，其余去掉 | `app/(app)/app/orbit-theme.tsx` |
| `rgba(21,94,117,0.16)` | 1 | `mac-teal` | 青浅底 | `app/(app)/app/orbit-theme.tsx` |
| `rgba(23,33,31,0.14)` | 1 | `（去掉阴影）/ shadow-float` | 黑色半透明：阴影，浮层用 shadow-float，其余去掉 | `app/(app)/app/orbit-theme.tsx` |
| `rgba(21,94,117,0.20)` | 1 | `mac-teal` | 青浅底 | `app/(app)/app/orbit-theme.tsx` |
| `rgba(255,255,255,0.82)` | 1 | `glass` | 白色半透明：毛玻璃 | `app/(app)/app/orbit-theme.tsx` |
| `rgba(249,251,250,0.88)` | 1 | `glass` | 白色半透明：毛玻璃 | `app/(app)/app/orbit-theme.tsx` |
| `rgba(255,255,255,0.42)` | 1 | `line` | 白色低透明：深色面上的分隔 | `app/(app)/app/orbit-theme.tsx` |
| `rgba(75,79,199,.1)` | 1 | `accent-soft` | 紫浅底 | `app/(app)/app/profile/goal-editor/goal-editor.tsx` |
| `rgba(59,63,122,0.1)` | 1 | `accent-soft` | 紫浅底 | `app/(app)/app/profile/onboarding-0918/onboarding-styles.ts` |
| `#22312D` | 1 | `mac-teal-text` | 青色文字；图形用 mac-teal-ink | `app/(app)/app/profile/profile-0918/business-card-preview.tsx` |
| `#131B19` | 1 | `ink` | 近黑 | `app/(app)/app/profile/profile-0918/business-card-preview.tsx` |
| `rgba(94,234,212,0.16)` | 1 | `mac-teal` | 青浅底 | `app/(app)/app/profile/profile-0918/business-card-preview.tsx` |
| `rgba(255,255,255,0.46)` | 1 | `line` | 白色低透明：深色面上的分隔 | `app/(app)/app/profile/profile-0918/business-card-preview.tsx` |
| `rgba(255,255,255,0.09)` | 1 | `line` | 白色低透明：深色面上的分隔 | `app/(app)/app/profile/profile-0918/business-card-preview.tsx` |
| `rgba(255,255,255,0.84)` | 1 | `glass` | 白色半透明：毛玻璃 | `app/(app)/app/profile/profile-0918/business-card-preview.tsx` |
| `rgba(255,255,255,0.4)` | 1 | `line` | 白色低透明：深色面上的分隔 | `app/(app)/app/profile/profile-0918/business-card-preview.tsx` |
| `rgba(255,255,255,0.5)` | 1 | `glass` | 白色半透明：毛玻璃 | `app/(app)/app/profile/profile-0918/business-card-preview.tsx` |
| `rgba(255,255,255,0.45)` | 1 | `line` | 白色低透明：深色面上的分隔 | `app/(app)/app/profile/profile-0918/business-card-preview.tsx` |
| `rgba(255,255,255,0.8)` | 1 | `glass` | 白色半透明：毛玻璃 | `app/(app)/app/profile/profile-0918/business-card-preview.tsx` |
| `#F6F6FD` | 1 | `accent-soft` | 紫浅底 | `app/(app)/app/start/start-guide-styles.ts` |
| `rgba(46,50,112,.08)` | 1 | `accent-soft` | 紫浅底 | `app/(app)/app/start/start-guide-styles.ts` |
| `rgba(75,79,199,.08)` | 1 | `accent-soft` | 紫浅底 | `app/(app)/app/start/start-guide-styles.ts` |
| `#EEEEEE` | 1 | `surface-2` | 浅灰面 | `app/(app)/app/tasks/personal-schedule-date-time-picker.tsx` |
| `rgba(0,0,0,.07)` | 1 | `（去掉阴影）/ shadow-float` | 黑色半透明：阴影，浮层用 shadow-float，其余去掉 | `app/(app)/app/tasks/tasks-styles.tsx` |

## App `repos/orbit-app/src/`（57 种，119 处，不含 design/tokens.ts）

| 旧值 | 处数 | → 新 token | 说明 | 所在文件 |
| --- | --- | --- | --- | --- |
| `#0B1220` | 17 | `ink` | App 旧主文字 | `src/screens/events/Registration7aRecommendations.tsx` `src/screens/events/Registration7aViews.tsx` |
| `#FFFFFF` | 8 | `surface` | 作底色时；在深色 / 强调底上作文字时用 on-accent，照片上用 on-image | `src/api/batch-image-compressor.web.ts` `src/screens/contacts/ContactDetailScreen.tsx` `src/screens/contacts/ContactsScreen.tsx` `src/screens/events/Registration7aViews.tsx` |
| `#0A5CFF` | 8 | `accent-text` | App 旧强调蓝；图形用 accent | `src/screens/events/EventRegistrationScreen.tsx` `src/screens/events/Registration7aRecommendations.tsx` `src/screens/events/Registration7aViews.tsx` |
| `#E6E8EE` | 6 | `line` | App 旧描边 | `src/screens/events/Registration7aViews.tsx` |
| `rgba(255,255,255,0.92)` | 5 | `glass` | 白色半透明：毛玻璃 | `src/screens/events/EventDetailScreen.tsx` `src/screens/events/EventsScreen.tsx` `src/screens/home/HomeScreen.tsx` `src/screens/organizer/OrganizerPublicScreen.tsx` |
| `#6B7280` | 5 | `ink-3-text` | 灰色说明文字 | `src/screens/events/Registration7aRecommendations.tsx` `src/screens/events/Registration7aViews.tsx` |
| `#8B93A5` | 4 | `ink-3-text` | 灰色说明文字 | `src/screens/events/Registration7aViews.tsx` |
| `#7FB3FF` | 3 | `mac-blue-text` | 信息蓝；图形用 mac-blue-ink | `src/screens/contacts/ContactDetailScreen.tsx` `src/screens/contacts/ContactsScreen.tsx` |
| `#3B82F6` | 3 | `mac-blue-text` | 信息蓝；图形用 mac-blue-ink | `src/screens/contacts/ContactDetailScreen.tsx` `src/screens/contacts/ContactsScreen.tsx` |
| `#C4C9D4` | 3 | `ink-4` | 装饰灰；作文字时用 ink-3-text | `src/screens/contacts/ContactDetailScreen.tsx` `src/screens/contacts/ContactsScreen.tsx` |
| `rgba(255,255,255,0.88)` | 3 | `glass` | 白色半透明：毛玻璃 | `src/screens/events/EventsScreen.tsx` `src/screens/home/HomeScreen.tsx` |
| `#EEF0F4` | 3 | `surface-2` | App 旧浅面 | `src/screens/events/Registration7aRecommendations.tsx` `src/screens/events/Registration7aViews.tsx` |
| `rgba(11,18,32,0.10)` | 2 | `（去掉阴影）/ shadow-float` | 黑色半透明：阴影，浮层用 shadow-float，其余去掉 | `src/components/OrbitTabBar.tsx` `src/screens/notes/NoteMentionEditor.tsx` |
| `rgba(10,10,16,0.08)` | 2 | `（去掉阴影）/ shadow-float` | 黑色半透明：阴影，浮层用 shadow-float，其余去掉 | `src/screens/admin/AdminScreen.tsx` `src/screens/platform/PlatformScreen.tsx` |
| `rgba(22,22,26,0.34)` | 2 | `（去掉阴影）/ shadow-float` | 黑色半透明：阴影，浮层用 shadow-float，其余去掉 | `src/screens/ai/AiScreen.tsx` `src/screens/ai/AiSessionOrganization.tsx` |
| `#475569` | 2 | `ink-2` | 深灰次级文字 | `src/screens/events/Registration7aViews.tsx` |
| `rgba(255,255,255,0.78)` | 2 | `glass` | 白色半透明：毛玻璃 | `src/screens/home/HomeScreen.tsx` `src/screens/organizer/OrganizerPublicScreen.tsx` |
| `rgba(0,0,0,0.35)` | 2 | `（去掉阴影）/ shadow-float` | 黑色半透明：阴影，浮层用 shadow-float，其余去掉 | `src/screens/schedule/PersonalScheduleDateTimePicker.tsx` `src/screens/schedule/PersonalScheduleRules.tsx` |
| `rgba(18,18,28,0.10)` | 1 | `（去掉阴影）/ shadow-float` | 黑色半透明：阴影，浮层用 shadow-float，其余去掉 | `src/screens/ai/AiScreen.tsx` |
| `rgba(18,18,28,0.16)` | 1 | `（去掉阴影）/ shadow-float` | 黑色半透明：阴影，浮层用 shadow-float，其余去掉 | `src/screens/ai/AiScreen.tsx` |
| `rgba(18,18,28,0.18)` | 1 | `（去掉阴影）/ shadow-float` | 黑色半透明：阴影，浮层用 shadow-float，其余去掉 | `src/screens/ai/AiScreen.tsx` |
| `rgba(22,22,26,0.12)` | 1 | `（去掉阴影）/ shadow-float` | 黑色半透明：阴影，浮层用 shadow-float，其余去掉 | `src/screens/ai/AiScreen.tsx` |
| `#000000` | 1 | `ink` | 作文字时；阴影改 none 或 shadow-float | `src/screens/contacts/BusinessCardScanScreen.tsx` |
| `rgba(255,255,255,0.28)` | 1 | `line` | 白色低透明：深色面上的分隔 | `src/screens/contacts/ContactAcquisitionScreen.tsx` |
| `rgba(15,23,42,0.82)` | 1 | `scrim / scrim-web` | 黑色半透明：遮罩 | `src/screens/contacts/ContactAcquisitionScreen.tsx` |
| `rgba(255,255,255,0.25)` | 1 | `line` | 白色低透明：深色面上的分隔 | `src/screens/contacts/ContactAcquisitionScreen.tsx` |
| `#7B6E5B` | 1 | `mac-apricot-text` | 注意 / 提醒文字 | `src/screens/contacts/ContactsDashboardScreen.tsx` |
| `#3E8C94` | 1 | `mac-teal-text` | 青色文字；图形用 mac-teal-ink | `src/screens/contacts/ContactsDashboardScreen.tsx` |
| `#8B6BB1` | 1 | `accent-text` | 紫色强调；图形用 accent | `src/screens/contacts/ContactsDashboardScreen.tsx` |
| `rgba(22,22,26,0.28)` | 1 | `（去掉阴影）/ shadow-float` | 黑色半透明：阴影，浮层用 shadow-float，其余去掉 | `src/screens/contacts/ContactsDashboardScreen.tsx` |
| `#5EEAD4` | 1 | `mac-teal-text` | 青色文字；图形用 mac-teal-ink | `src/screens/contacts/ContactsScreen.tsx` |
| `#0EA5E9` | 1 | `mac-blue-text` | 信息蓝；图形用 mac-blue-ink | `src/screens/contacts/ContactsScreen.tsx` |
| `#FCD34D` | 1 | `mac-apricot-ink` | 金黄图形；文字用 mac-apricot-text | `src/screens/contacts/ContactsScreen.tsx` |
| `#F59E0B` | 1 | `mac-apricot-text` | 注意 / 提醒文字 | `src/screens/contacts/ContactsScreen.tsx` |
| `#A78BFA` | 1 | `plum-300` | 浅紫装饰 / 焦点 | `src/screens/contacts/ContactsScreen.tsx` |
| `#6366F1` | 1 | `plum-300` | 浅紫装饰 / 焦点 | `src/screens/contacts/ContactsScreen.tsx` |
| `#FDA4AF` | 1 | `coral` | 红色图形；文字用 coral-text | `src/screens/contacts/ContactsScreen.tsx` |
| `#F472B6` | 1 | `mac-pink-text` | 粉色文字；图形用 mac-pink-ink | `src/screens/contacts/ContactsScreen.tsx` |
| `rgba(0,0,0,0.28)` | 1 | `（去掉阴影）/ shadow-float` | 黑色半透明：阴影，浮层用 shadow-float，其余去掉 | `src/screens/events/EventDetailScreen.tsx` |
| `#128877` | 1 | `mac-teal-text` | 青色文字；图形用 mac-teal-ink | `src/screens/events/EventExperienceContent.tsx` |
| `#2563EB` | 1 | `mac-blue-text` | 信息蓝；图形用 mac-blue-ink | `src/screens/events/EventExperienceContent.tsx` |
| `#C43B58` | 1 | `coral-text` | 错误 / 删除 | `src/screens/events/EventExperienceContent.tsx` |
| `#6E56CF` | 1 | `accent-text` | 紫色强调；图形用 accent | `src/screens/events/EventExperienceContent.tsx` |
| `rgba(8,8,12,0.38)` | 1 | `（去掉阴影）/ shadow-float` | 黑色半透明：阴影，浮层用 shadow-float，其余去掉 | `src/screens/events/EventsScreen.tsx` |
| `#F5F7FA` | 1 | `surface-2` |  | `src/screens/events/Registration7aViews.tsx` |
| `#B42318` | 1 | `coral-text` | 错误 / 删除 | `src/screens/events/Registration7aViews.tsx` |
| `#EEF3FF` | 1 | `mac-blue` | 蓝浅底 | `src/screens/events/Registration7aViews.tsx` |
| `rgba(11,18,32,0.4)` | 1 | `scrim / scrim-web` | 黑色半透明：遮罩 | `src/screens/events/live/LivePersonSheet.tsx` |
| `rgba(8,8,12,0.34)` | 1 | `（去掉阴影）/ shadow-float` | 黑色半透明：阴影，浮层用 shadow-float，其余去掉 | `src/screens/home/HomeScreen.tsx` |
| `rgba(255,255,255,0.86)` | 1 | `glass` | 白色半透明：毛玻璃 | `src/screens/home/HomeScreen.tsx` |
| `rgba(255,255,255,0.24)` | 1 | `line` | 白色低透明：深色面上的分隔 | `src/screens/home/HomeScreen.tsx` |
| `rgba(255,255,255,0.18)` | 1 | `line` | 白色低透明：深色面上的分隔 | `src/screens/organizer/OrganizerPublicScreen.tsx` |
| `rgba(255,255,255,0.84)` | 1 | `glass` | 白色半透明：毛玻璃 | `src/screens/organizer/OrganizerPublicScreen.tsx` |
| `rgba(10,10,16,0.40)` | 1 | `scrim / scrim-web` | 黑色半透明：遮罩 | `src/screens/organizer/OrganizerPublicScreen.tsx` |
| `rgba(10,10,16,0.38)` | 1 | `（去掉阴影）/ shadow-float` | 黑色半透明：阴影，浮层用 shadow-float，其余去掉 | `src/screens/organizer/OrganizerPublicScreen.tsx` |
| `rgba(11,18,32,0.35)` | 1 | `（去掉阴影）/ shadow-float` | 黑色半透明：阴影，浮层用 shadow-float，其余去掉 | `src/screens/schedule/PersonalScheduleAssociations.tsx` |
| `rgba(16,24,40,0.28)` | 1 | `（去掉阴影）/ shadow-float` | 黑色半透明：阴影，浮层用 shadow-float，其余去掉 | `src/screens/tasks/TaskDetailScreen.tsx` |
