/**
 * iOrbit（对话域）旧控制台作用域皮肤。
 *
 * iOrbit 任务 6a：`../orbit-real-agent.tsx` 删除，`CONSOLE_STYLES` 逐字搬到这里。
 * 它仍是 `[data-orbit-real-page="agent"]` 作用域（外层 div），供 `iorbit-shell.tsx`
 * 给回合内的既有富组件（`PanelCards` / `AgentWelcome` / 任务卡 / 草稿卡 / 删除确认）
 * 供皮。无 React，因此 node 测试可直接 import。
 */
import { ORBIT_LEFT_SIDEBAR_WIDTH } from "../../orbit-layout-constants";

/* ═══ 工作台整页样式：docs/designs/journey/home-console-green.html 1:1 迁移，
   全部限定在 [data-orbit-real-page="agent"] 作用域内。═══ */
// 任务 3：回合内的既有富组件（PanelCards / AgentWelcome / 任务卡 / 草稿卡）仍吃这套
// `[data-orbit-real-page="agent"]` 作用域皮肤，新壳因此也要挂一份（设计无这些槽位）。
export const CONSOLE_STYLES = `
[data-orbit-real-page="agent"] {
  --sidebar-w: ${ORBIT_LEFT_SIDEBAR_WIDTH}px;
  --agent-body-size: 15px;
  --console-tight: 'Inter Tight', Inter, system-ui, -apple-system, 'PingFang SC', sans-serif;
  --glass: rgba(255,255,255,.66);
  --glass-border: #dbe7e4;
  --text-3: #687078;
  --text-4: #687078;
  font-size: 15px;
  line-height: 1.65;
}
[data-orbit-real-page="agent"] .hide { display: none !important; }
[data-orbit-real-page="agent"] .h-display { font-family: var(--console-tight); font-weight: 600; letter-spacing: 0; line-height: 1.02; color: var(--ink); }
[data-orbit-real-page="agent"] .eyebrow { font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--text-3); }
[data-orbit-real-page="agent"] .glass { background: var(--glass); border: 1px solid var(--glass-border); border-radius: var(--r-md); backdrop-filter: blur(18px) saturate(150%); -webkit-backdrop-filter: blur(18px) saturate(150%); box-shadow: inset 0 1px 0 rgba(255,255,255,.9); }
[data-orbit-real-page="agent"] .ai-chip { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; padding: 3px 9px; border-radius: var(--r-pill); background: var(--accent-soft); color: var(--accent-press); }
[data-orbit-real-page="agent"] .badge { display: inline-flex; align-items: center; gap: 5px; height: 24px; padding: 0 9px; border-radius: var(--r-pill); font-size: 12px; font-weight: 600; white-space: nowrap; }
[data-orbit-real-page="agent"] .badge-ok { background: var(--live-soft); color: var(--live-text, #0E7A3C); }
[data-orbit-real-page="agent"] .badge-wait { background: var(--amber-soft); color: var(--amber-text, #8A5A00); }
[data-orbit-real-page="agent"] .badge-muted { background: var(--surface-2); color: var(--text-2); border: 1px solid var(--border); }
[data-orbit-real-page="agent"] .chip { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 12px; border-radius: var(--r-pill); font-size: 13px; font-weight: 500; background: var(--surface-2); color: var(--text-2); border: 1px solid transparent; white-space: nowrap; transition: background .14s, color .14s, border-color .14s; cursor: pointer; }
[data-orbit-real-page="agent"] .chip:hover { color: var(--accent-press); border-color: var(--accent); background: var(--surface); }
[data-orbit-real-page="agent"] .avatar.avatar { font-family: var(--console-tight); background: linear-gradient(140deg, var(--av-a, #2E8A93), var(--av-b, #0e4b52)); box-shadow: none; color: #fff; border: 0; display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; font-weight: 600; flex-shrink: 0; }
[data-orbit-real-page="agent"] .avatar.avatar .avatar-letter { color: #fff; }
[data-orbit-real-page="agent"] .avatar.avatar .avatar-orbit { display: none; }
[data-orbit-real-page="agent"] .g-teal { --av-a:#2E8A93; --av-b:#0e4b52; }
[data-orbit-real-page="agent"] .g-slate { --av-a:#7d92ad; --av-b:#40536b; }
[data-orbit-real-page="agent"] .g-sand { --av-a:#c39a63; --av-b:#8a6b3a; }
[data-orbit-real-page="agent"] .g-moss { --av-a:#6ba585; --av-b:#3f7d5c; }
[data-orbit-real-page="agent"] .g-plum { --av-a:#a487a0; --av-b:#7a5a74; }

/* ═══ Dashboard（残余）═══
   收尾 2026-09-24：概览 / 日程 / 旅程三段的整块规则（brief-action-* / hub-* /
   appt* / act* / ic-* / stage-row / s-dot / s-link / journeys / j-*）与「骨架」
   整段（ws-* / agent-history* / orbit-agent-new-chat / orbit-agent-history-group）
   已删——/app/today 与旧 agent 工作台随任务 6a 删除后，这些类在
   [data-orbit-real-page="agent"] 作用域内没有任何渲染点。保留的四条是仍可能
   被域内富组件命中的通用件。删除名单由 tests/ui/iorbit-console-styles-dead-classes.test.ts 守住。 */
[data-orbit-real-page="agent"] .brief { position: relative; overflow: hidden; border-radius: var(--r-lg); border: 1px solid var(--border); padding: 20px; margin-top: 18px;
  background: radial-gradient(64% 100% at 90% 0%, rgba(23,106,115,.13), transparent 58%), radial-gradient(48% 80% at 2% 100%, rgba(180,83,9,.07), transparent 58%), var(--accent-softer); }
[data-orbit-real-page="agent"] .sec-title { display: flex; align-items: baseline; gap: 10px; margin: 26px 0 11px; }
[data-orbit-real-page="agent"] .sec-title h2 { font-family: var(--console-tight); font-size: 16.5px; font-weight: 600; color: var(--ink); margin: 0; }
[data-orbit-real-page="agent"] .sec-title span { font-size: 12.5px; color: var(--text-4); }
[data-orbit-real-page="agent"] .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 13px; }
[data-orbit-real-page="agent"] .stage { display: flex; align-items: center; }

/* ═══ 对话页（残余）═══
   收尾 2026-09-24：thread-bar / btn-back / agent-chat-composer* / msg-user* /
   msg-a / msg-note / msg-tools 全删——对话屏在任务 6a 后整屏是 ir-*
   （iorbit-chat.tsx），这些选择器一条都不再命中。注意随之失效的两处后代规则：
   .msg-user-row .orbit-agent-message-copy{opacity:0}（复制键的 hover 浮标）与
   .msg-a .body .orbit-agent-markdown{font-size…}——两个后代类本身仍在售，
   但只能通过已死的祖先被这份皮肤够到，所以删除是零渲染变化。 */
[data-orbit-real-page="agent"] .thread { display: flex; flex-direction: column; gap: 20px; }
[data-orbit-real-page="agent"] .thinking { display: flex; align-items: center; gap: 8px; font-size: 13.5px; color: var(--text-3); }
[data-orbit-real-page="agent"] .thinking .sp { width: 14px; height: 14px; border-radius: 50%; border: 2px solid var(--border-2); border-top-color: var(--accent); animation: orbit-agent-spin .8s linear infinite; }
@keyframes orbit-agent-spin { to { transform: rotate(360deg); } }
[data-orbit-real-page="agent"] .new-empty { text-align: center; padding: 60px 0 20px; }
[data-orbit-real-page="agent"] .new-empty .mk { width: 46px; height: 46px; border-radius: var(--r-md); background: var(--accent); color: #fff; display: grid; place-items: center; margin: 0 auto 14px; }
[data-orbit-real-page="agent"] .new-empty h3 { font-family: var(--console-tight); font-size: 20px; font-weight: 600; color: var(--ink); margin: 0; }
[data-orbit-real-page="agent"] .new-empty p { font-size: 14px; color: var(--text-2); margin: 6px 0 0; }
[data-orbit-real-page="agent"] .new-empty .chips { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; margin-top: 18px; }
[data-orbit-real-page="agent"] .panel { margin-top: 13px; border: 1px solid var(--border); border-radius: var(--r-md); overflow: hidden; background: var(--surface); }
[data-orbit-real-page="agent"] .panel-head { display: flex; align-items: center; gap: 8px; padding: 10px 14px; background: var(--surface-2); border-bottom: 1px solid var(--border); }
[data-orbit-real-page="agent"] .panel-head b { font-size: 13px; color: var(--ink); font-weight: 600; }
[data-orbit-real-page="agent"] .panel-head .meta { font-size: 12px; color: var(--text-3); margin-left: auto; }
[data-orbit-real-page="agent"] .panel-body { padding: 6px 14px 12px; }
[data-orbit-real-page="agent"] .p-person { display: flex; align-items: center; gap: 11px; padding: 11px 0; flex-wrap: wrap; }
[data-orbit-real-page="agent"] .p-person + .p-person { border-top: 1px dashed var(--border-2); }
[data-orbit-real-page="agent"] .p-person .w { flex: 1; min-width: 160px; }
[data-orbit-real-page="agent"] .p-person .w b { display: block; font-size: 14px; color: var(--ink); font-weight: 600; }
[data-orbit-real-page="agent"] .p-person .w span { font-size: 12.5px; color: var(--text-2); }
[data-orbit-real-page="agent"] .p-person .why { flex-basis: 100%; font-size: 13px; color: var(--text-2); background: var(--surface-2); border-left: 2px solid var(--accent); padding: 8px 12px; border-radius: 0 var(--r-sm) var(--r-sm) 0; }
[data-orbit-real-page="agent"] .p-person .w b .p-conf { font-style: normal; font-size: 11px; font-weight: 600; color: var(--accent); background: var(--accent-softer); border-radius: var(--r-pill); padding: 2px 7px; margin-left: 7px; vertical-align: 1px; }
[data-orbit-real-page="agent"] .p-acts { display: flex; gap: 8px; }
/* ═══ 跟进队列（按人分组卡片）与内联草稿 ═══
   产品字号只有三级：--t-lead 人名/结论/主题，--t-base 事项/说明/正文/按钮，
   --t-meta 一切次级。层级由字重（600/400）和颜色（ink/muted）承担，
   不允许出现第四个字号数值。 */
[data-orbit-real-page="agent"] { --t-lead: 15px; --t-base: 13px; --t-meta: 12px; }

[data-orbit-real-page="agent"] .todo-stack { margin-top: 13px; display: grid; gap: 8px; }
[data-orbit-real-page="agent"] .todo-verdict { color: var(--ink); font-size: var(--t-lead); font-weight: 600; line-height: 1.5; margin: 0 0 4px; }
[data-orbit-real-page="agent"] .todo-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-md); padding: 13px 15px; }
[data-orbit-real-page="agent"] .todo-head { display: flex; align-items: flex-start; gap: 11px; }
[data-orbit-real-page="agent"] .todo-who { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 1px; }
[data-orbit-real-page="agent"] .todo-who b { color: var(--ink); font-size: var(--t-lead); font-weight: 600; line-height: 1.4; }
[data-orbit-real-page="agent"] .todo-sub { color: var(--text-2); font-size: var(--t-meta); }
[data-orbit-real-page="agent"] .todo-side { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; flex: 0 0 auto; }
[data-orbit-real-page="agent"] .todo-due { color: var(--text-3); font-size: var(--t-meta); font-variant-numeric: tabular-nums; white-space: nowrap; }
[data-orbit-real-page="agent"] .todo-due.soon { color: var(--amber-text, #8A5A00); font-weight: 600; }
/* 展开钮既是摘要也是开关；内容宽度，focus 轮廓贴文字，不横穿整卡。 */
[data-orbit-real-page="agent"] .todo-peek { align-items: center; background: none; border: 0; color: var(--text-2); cursor: pointer; display: inline-flex; font: inherit; font-size: var(--t-meta); gap: 6px; margin-top: 6px; padding: 3px 2px; }
[data-orbit-real-page="agent"] .todo-peek:hover { color: var(--accent); }
[data-orbit-real-page="agent"] .todo-tri { transition: transform .18s ease; }
[data-orbit-real-page="agent"] .todo-peek[aria-expanded="true"] .todo-tri { transform: rotate(90deg); }
[data-orbit-real-page="agent"] .todo-detail { border-top: 1px solid var(--border); margin-top: 12px; padding-top: 4px; }
[data-orbit-real-page="agent"] .todo-zone { color: var(--text-3); font-size: var(--t-meta); margin: 12px 0 2px; }
[data-orbit-real-page="agent"] .todo-items { list-style: none; margin: 0; padding: 0; }
[data-orbit-real-page="agent"] .todo-item { display: grid; gap: 0 11px; grid-template-columns: auto 1fr; padding: 9px 0; }
[data-orbit-real-page="agent"] .todo-item + .todo-item { border-top: 1px solid var(--border); }
/* 勾选框描边化：未选空盒，选中浅底 + 勾。选中态由控件自己承载，不给整行铺底。 */
[data-orbit-real-page="agent"] .todo-check { appearance: none; -webkit-appearance: none; background: var(--surface); border: 1.5px solid var(--border-2); border-radius: 4px; cursor: pointer; display: grid; grid-row: 1 / span 2; height: 16px; margin: 2px 0 0; place-items: center; transition: border-color .15s, background .15s; width: 16px; }
[data-orbit-real-page="agent"] .todo-check:hover { border-color: var(--accent); }
[data-orbit-real-page="agent"] .todo-check:checked { background: var(--accent-softer); border-color: var(--accent); }
[data-orbit-real-page="agent"] .todo-check:checked::before { border-bottom: 2px solid var(--accent); border-left: 2px solid var(--accent); content: ""; height: 4px; margin-top: -2px; transform: rotate(-45deg); width: 8px; }
[data-orbit-real-page="agent"] .todo-item .t { color: var(--ink); cursor: pointer; font-size: var(--t-base); font-weight: 600; line-height: 1.55; }
[data-orbit-real-page="agent"] .todo-item .t.t-off { color: var(--text-2); font-weight: 400; }
[data-orbit-real-page="agent"] .todo-item .d { color: var(--text-2); font-size: var(--t-base); grid-column: 2; line-height: 1.55; margin-top: 1px; }
[data-orbit-real-page="agent"] .todo-view { margin-top: 10px; }
[data-orbit-real-page="agent"] .linkish { background: none; border: 0; color: var(--text-2); cursor: pointer; font: inherit; font-size: var(--t-meta); padding: 2px 0; text-decoration: underline; text-underline-offset: 3px; }
[data-orbit-real-page="agent"] .linkish:hover { color: var(--accent); }

/* 内联草稿：卡片的下半部分，不是第二张卡。主题/正文无框，像一封信而不是表单。 */
[data-orbit-real-page="agent"] .draft { border-top: 1px solid var(--border); display: grid; flex-basis: 100%; gap: 9px; margin-top: 12px; padding-top: 13px; }
[data-orbit-real-page="agent"] .draft-label { color: var(--text-3); font-size: var(--t-meta); margin: 0; }
[data-orbit-real-page="agent"] .draft-stale { align-items: center; background: var(--amber-soft); border-radius: var(--r-sm); color: var(--amber-text, #8A5A00); display: flex; flex-wrap: wrap; font-size: var(--t-meta); gap: 8px; margin: 0; padding: 7px 10px; }
[data-orbit-real-page="agent"] .draft-stale .linkish { color: inherit; font-weight: 600; }
[data-orbit-real-page="agent"] .draft-subj { background: none; border: 0; border-bottom: 1px solid var(--border); color: var(--ink); font: inherit; font-size: var(--t-lead); font-weight: 600; padding: 0 0 9px; width: 100%; }
[data-orbit-real-page="agent"] .draft-subj:focus { border-bottom-color: var(--accent); outline: none; }
[data-orbit-real-page="agent"] .draft-body { background: none; border: 0; color: var(--text); font: inherit; font-size: var(--t-base); line-height: 1.75; min-height: 150px; padding: 2px 0 0; resize: vertical; width: 100%; }
[data-orbit-real-page="agent"] .draft-body:focus { outline: none; }
[data-orbit-real-page="agent"] .draft-foot { align-items: center; display: flex; flex-wrap: wrap; gap: 9px; }
[data-orbit-real-page="agent"] .draft-guard { align-items: flex-start; color: var(--text-2); display: flex; flex: 1; font-size: var(--t-meta); gap: 7px; line-height: 1.5; margin: 0; min-width: 200px; }
[data-orbit-real-page="agent"] .draft-guard > svg { color: var(--accent); flex: 0 0 auto; margin-top: 2px; }
[data-orbit-real-page="agent"] .draft-guard b { color: var(--ink); font-weight: 600; margin-right: 6px; }
[data-orbit-real-page="agent"] .draft-error { align-items: center; background: rgba(179, 38, 30, .06); border: 1px solid rgba(179, 38, 30, .25); border-radius: var(--r-sm); display: flex; flex-basis: 100%; flex-wrap: wrap; gap: 10px; margin-top: 10px; padding: 10px 12px; }
[data-orbit-real-page="agent"] .draft-error .w { flex: 1; font-size: var(--t-base); line-height: 1.5; min-width: 200px; }
[data-orbit-real-page="agent"] .draft-error .w b { color: var(--danger); display: block; font-weight: 600; }
[data-orbit-real-page="agent"] .draft-error .w span { color: var(--text-2); font-size: var(--t-meta); }

/* 状态动效：面板/回执进场 4px 上浮淡入，check 轻弹一下，按钮换字交叉淡入。
   全部 transform/opacity（不引起回流），时长 180-250ms；页面末尾的
   prefers-reduced-motion 规则会整体关掉这些动画。 */
[data-orbit-real-page="agent"] .draft { animation: agent-draft-in .22s ease-out; }
[data-orbit-real-page="agent"] .btn .swap { animation: agent-label-in .18s ease-out; }
/* 交接回执：记录「草稿已转入草稿箱」这一件已发生的事。用 accent 软底而不是
   success 绿——发送尚未发生，这里不是完成态；且 --live-text 在浅色主题下没有
   重绑，直接用会对比度不足。 */
[data-orbit-real-page="agent"] .draft-receipt { align-items: flex-start; animation: agent-draft-in .22s ease-out; background: var(--accent-softer); border-radius: var(--r-sm); display: flex; flex-basis: 100%; flex-wrap: wrap; gap: 10px; margin-top: 12px; padding: 11px 13px; }
[data-orbit-real-page="agent"] .draft-receipt-check { align-items: center; animation: agent-check-pop .25s ease-out; background: var(--accent); border-radius: 50%; color: var(--on-accent); display: inline-flex; flex: 0 0 auto; height: 20px; justify-content: center; margin-top: 1px; width: 20px; }
[data-orbit-real-page="agent"] .draft-receipt .w { color: var(--text-2); flex: 1; font-size: var(--t-meta); line-height: 1.5; min-width: 200px; }
[data-orbit-real-page="agent"] .draft-receipt .w b { color: var(--ink); display: block; font-size: var(--t-base); font-variant-numeric: tabular-nums; font-weight: 600; }
[data-orbit-real-page="agent"] .draft-receipt-acts { align-items: center; align-self: center; display: flex; gap: 12px; }
@keyframes agent-draft-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
@keyframes agent-check-pop { 0% { opacity: 0; transform: scale(.6); } 60% { transform: scale(1.08); } 100% { opacity: 1; transform: scale(1); } }
@keyframes agent-label-in { from { opacity: 0; transform: translateY(2px); } to { opacity: 1; transform: none; } }

@media (max-width: 720px) {
  [data-orbit-real-page="agent"] .grid { grid-template-columns: 1fr; }
}
@media (prefers-reduced-motion: reduce) {
  [data-orbit-real-page="agent"] *, [data-orbit-real-page="agent"] *::before, [data-orbit-real-page="agent"] *::after { animation: none !important; transition: none !important; }
}

/* Orbit_0918 批次 4c：agent 控制台整体换肤（W4 锁已按用户 2026-09-19 指令释放；
   逻辑零改动，仅作用域 CSS；本文件属 scale-ratchet SNAPPED，故全部走模板 CSS） */
html[data-theme="light"] [data-orbit-real-page="agent"] {
  --agent-canvas: #FBFBFE; --agent-ink: #0E1225; --agent-muted: #6B6F99; --agent-hairline: #E8E9F6;
  --agent-signal: #4B4FC7; --agent-signal-soft: #ECEEFB;
  --accent: #4B4FC7; --accent-hover: #2E3270; --accent-press: #2E3270;
  --accent-soft: #ECEEFB; --accent-softer: #F7F7FD; --accent-ring: #B9BCEB;
  --accent-grad: #4B4FC7; --accent-grad-bar: #4B4FC7;
  --ink: #0E1225; --text: #0E1225; --text-2: #3B3F7A; --text-3: #6B6F99; --text-4: #9FA3C4;
  --bg: #FBFBFE; --bg-soft: #FBFBFE; --bg-sunken: #F1F1FA;
  --surface: #FFFFFF; --surface-2: #F7F7FD; --surface-3: #ECEEFB;
  --border: #E8E9F6; --border-2: #DDDEFA; --border-strong: #B9BCEB;
  --hairline: #E8E9F6; --glass-border: #E8E9F6;
}
[data-orbit-real-page="agent"] .h-display { font-family: 'Noto Serif SC', 'Songti SC', 'SimSun', serif; font-weight: 900; letter-spacing: -0.02em; }
[data-orbit-real-page="agent"] .btn-primary { background: #0E1225; border-color: #0E1225; box-shadow: none; color: #FFFFFF; }
[data-orbit-real-page="agent"] .btn-primary:hover:not(:disabled) { background: #2E3270; border-color: #2E3270; }
[data-orbit-real-page="agent"] .btn-ghost { background: #FFFFFF; border-color: #DDDEFA; color: #3B3F7A; box-shadow: none; }
[data-orbit-real-page="agent"] .btn-soft { background: #ECEEFB; border-color: #ECEEFB; color: #2E3270; box-shadow: none; }
`;

