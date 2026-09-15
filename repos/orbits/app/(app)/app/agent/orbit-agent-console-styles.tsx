import fs from "node:fs";
import path from "node:path";

const AGENT_CONSOLE_CSS_ROUTE = "/orbit-reference/orbit-agent-console.generated.css";
const agentConsoleCssPath = path.join(
  process.cwd(),
  "public/orbit-reference/orbit-agent-console.generated.css",
);

export const AGENT_CONSOLE_STYLES = `
[data-orbit-real-page="agent"] {
  --sidebar-w: 212px;
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

/* ═══ 骨架 ═══ */
[data-orbit-real-page="agent"] .ws-body { display: flex; flex: 1; min-height: 0; }
[data-orbit-real-page="agent"] .agent-history.agent-history { background: #fafbfb !important; border-right: 1px solid var(--border); display: flex; flex-direction: column; flex-shrink: 0; }
[data-orbit-real-page="agent"] .agent-history-actions { padding: 12px 12px 10px; }
[data-orbit-real-page="agent"] .orbit-agent-new-chat { align-items: center; background: var(--accent-softer); border: 1px solid transparent; border-radius: 9px; color: var(--ink); font-size: 14px; font-weight: 650; gap: 9px; height: 40px; justify-content: flex-start; padding: 0 12px; width: 100%; display: inline-flex; cursor: pointer; }
[data-orbit-real-page="agent"] .orbit-agent-new-chat:hover { background: var(--accent-soft); border-color: rgba(23,106,115,.2); }
[data-orbit-real-page="agent"] .agent-history-heading { padding: 8px 16px 10px; }
[data-orbit-real-page="agent"] .agent-history-scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 0 8px 12px; }
[data-orbit-real-page="agent"] .orbit-agent-history-group { padding: 12px 10px 4px; font-size: 10.5px; }
[data-orbit-real-page="agent"] .ws-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
[data-orbit-real-page="agent"] .ws-scroll { flex: 1; min-height: 0; overflow-y: auto; }
/* 底部留白跟着全局提问输入框走：它是 fixed 的，不占文档流，展开时要主动让位，
   收起时 --orbit-ask-clearance 归 0，只留小球的余量。 */
[data-orbit-real-page="agent"] .ws-inner { max-width: 900px; margin: 0 auto; padding: 30px 32px calc(32px + var(--orbit-ask-clearance, 0px)); }

/* ═══ Dashboard ═══ */
[data-orbit-real-page="agent"] .hub-head { align-items: center; display: flex; gap: 18px; flex-wrap: wrap; }
[data-orbit-real-page="agent"] .hub-head .avatar { font-size: 26px !important; }
[data-orbit-real-page="agent"] .hub-head .who { flex: 1; min-width: 220px; }
[data-orbit-real-page="agent"] .hub-head h1 { font-size: 28px; margin: 0; }
[data-orbit-real-page="agent"] .hub-head .sub { color: var(--text-2); font-size: 14.5px; margin-top: 5px; }
[data-orbit-real-page="agent"] .hub-stats { background: var(--surface-2); border: 1px solid var(--border); border-radius: 16px; display: flex; gap: 30px; margin-top: 18px; padding: 14px 20px; flex-wrap: wrap; }
[data-orbit-real-page="agent"] .hub-stats .v { color: var(--ink); font-family: var(--console-tight); font-size: 24px; font-weight: 600; line-height: 1.1; }
[data-orbit-real-page="agent"] .hub-stats .k { color: var(--text-3); font-size: 12.5px; margin-top: 1px; }
[data-orbit-real-page="agent"] .brief { position: relative; overflow: hidden; border-radius: var(--r-lg); border: 1px solid var(--border); padding: 20px; margin-top: 18px;
  background: radial-gradient(64% 100% at 90% 0%, rgba(23,106,115,.13), transparent 58%), radial-gradient(48% 80% at 2% 100%, rgba(180,83,9,.07), transparent 58%), var(--accent-softer); }
[data-orbit-real-page="agent"] .brief-head { display: flex; align-items: center; gap: 9px; margin-bottom: 4px; flex-wrap: wrap; }
[data-orbit-real-page="agent"] .brief-mark { width: 28px; height: 28px; border-radius: 9px; background: var(--accent); color: #fff; display: grid; place-items: center; }
[data-orbit-real-page="agent"] .brief-head b { font-family: var(--console-tight); font-size: 15px; color: var(--ink); font-weight: 600; }
[data-orbit-real-page="agent"] .brief-head .st { font-size: 12px; color: var(--text-3); }
[data-orbit-real-page="agent"] .brief-lede { font-size: 14.5px; color: var(--text-2); margin: 0 0 13px; max-width: 62ch; line-height: 1.72; }
[data-orbit-real-page="agent"] .brief-lede b { color: var(--ink); }
[data-orbit-real-page="agent"] .brief-action-list { display: grid; gap: 9px; margin-bottom: 10px; }
[data-orbit-real-page="agent"] .brief-action-row { align-items: center; display: grid; gap: 12px; grid-template-columns: 32px minmax(0, 1fr) minmax(220px, 268px) 32px; min-height: 64px; overflow: visible; padding: 10px 11px; }
[data-orbit-real-page="agent"] .brief-action-index { align-items: center; align-self: center; background: var(--accent-soft); border: 1px solid rgba(23,106,115,.18); border-radius: 9px; color: var(--accent-press); display: inline-flex; font-family: var(--console-tight); font-size: 13px; font-weight: 700; height: 30px; justify-content: center; width: 30px; }
[data-orbit-real-page="agent"] .brief-action-copy { min-width: 0; }
[data-orbit-real-page="agent"] .brief-action-copy b { color: var(--ink); display: block; font-size: 14px; font-weight: 650; line-height: 1.35; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
[data-orbit-real-page="agent"] .brief-action-context { color: var(--text-3); display: block; font-size: 12.5px; line-height: 1.45; margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
[data-orbit-real-page="agent"] .brief-action-buttons { display: grid; gap: 7px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
[data-orbit-real-page="agent"] .brief-action-buttons .btn { justify-content: center; min-width: 0; padding-inline: 10px; width: 100%; }
[data-orbit-real-page="agent"] .brief-action-buttons .btn span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
[data-orbit-real-page="agent"] .brief-action-button-spacer { min-height: 32px; }
[data-orbit-real-page="agent"] .brief-action-more { height: 32px; position: relative; width: 32px; }
[data-orbit-real-page="agent"] .brief-action-more > summary { align-items: center; border-radius: 8px; color: var(--text-3); cursor: pointer; display: flex; height: 32px; justify-content: center; list-style: none; width: 32px; }
[data-orbit-real-page="agent"] .brief-action-more > summary::-webkit-details-marker { display: none; }
[data-orbit-real-page="agent"] .brief-action-more > summary:hover { background: rgba(255,255,255,.7); color: var(--ink); }
[data-orbit-real-page="agent"] .brief-action-more > div { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-sm); box-shadow: var(--shadow-md); display: grid; min-width: 132px; overflow: hidden; padding: 5px; position: absolute; right: 0; top: 36px; z-index: 5; }
[data-orbit-real-page="agent"] .brief-action-more > div button { background: none; border: 0; border-radius: 7px; color: var(--text-2); cursor: pointer; font: inherit; font-size: 12.5px; padding: 8px 10px; text-align: left; }
[data-orbit-real-page="agent"] .brief-action-more > div button:hover { background: var(--surface-2); color: var(--ink); }
[data-orbit-real-page="agent"] .brief-action-row.is-complete { opacity: .68; }
[data-orbit-real-page="agent"] .brief-action-row.is-complete .brief-action-index { background: var(--live-soft); border-color: rgba(22,101,52,.16); color: var(--live-text); }
[data-orbit-real-page="agent"] .brief-refresh { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; color: var(--text-4); background: none; border: 0; cursor: pointer; padding: 2px 0; margin-bottom: 10px; }
[data-orbit-real-page="agent"] .brief-refresh:hover { color: var(--text-2); }
[data-orbit-real-page="agent"] .brief-input { display: flex; align-items: center; gap: 10px; padding: 5px 5px 5px 16px; border-radius: var(--r-md); }
[data-orbit-real-page="agent"] .brief-input input { flex: 1; border: 0; background: none; font: inherit; font-size: 14.5px; color: var(--text); min-height: 38px; outline: none; min-width: 0; }
[data-orbit-real-page="agent"] .brief-input input::placeholder { color: var(--text-4); transition: opacity .2s; }
[data-orbit-real-page="agent"] .brief-send { width: 38px; height: 38px; border-radius: var(--r-sm); background: var(--accent); color: #fff; display: grid; place-items: center; transition: background .15s, transform .08s; border: 0; cursor: pointer; }
[data-orbit-real-page="agent"] .brief-send:hover { background: var(--accent-hover); }
[data-orbit-real-page="agent"] .brief-send:active { transform: scale(.95); }
[data-orbit-real-page="agent"] .brief-chips { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 11px; }
[data-orbit-real-page="agent"] .brief-note { font-size: 11.5px; color: var(--text-4); margin: 11px 0 0; }
[data-orbit-real-page="agent"] .sec-title { display: flex; align-items: baseline; gap: 10px; margin: 26px 0 11px; }
[data-orbit-real-page="agent"] .sec-title h2 { font-family: var(--console-tight); font-size: 16.5px; font-weight: 600; color: var(--ink); margin: 0; }
[data-orbit-real-page="agent"] .sec-title span { font-size: 12.5px; color: var(--text-4); }
[data-orbit-real-page="agent"] .appt { display: grid; grid-template-columns: auto 1fr; gap: 18px; padding: 17px 19px; }
[data-orbit-real-page="agent"] .appt-when { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 11px 15px; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--r-md); align-self: start; min-width: 100px; }
[data-orbit-real-page="agent"] .appt-when .d { font-family: var(--console-tight); font-size: 20px; font-weight: 600; color: var(--ink); line-height: 1.1; }
[data-orbit-real-page="agent"] .appt-when .t { font-size: 13px; font-weight: 600; color: var(--accent-press); }
[data-orbit-real-page="agent"] .appt-when .len { font-size: 11px; color: var(--text-3); font-family: var(--ff-mono); }
[data-orbit-real-page="agent"] .appt-when .in { font-size: 11px; font-weight: 600; color: var(--amber-text, #8A5A00); background: var(--amber-soft); border-radius: var(--r-pill); padding: 1px 9px; margin-top: 5px; }
[data-orbit-real-page="agent"] .appt-main { min-width: 0; }
[data-orbit-real-page="agent"] .appt-title-row { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; }
[data-orbit-real-page="agent"] .appt-title-row b { font-size: 15.5px; font-weight: 600; color: var(--ink); }
[data-orbit-real-page="agent"] .appt-who { display: flex; align-items: center; gap: 11px; margin-top: 10px; }
[data-orbit-real-page="agent"] .appt-actions { display: flex; gap: 9px; margin-top: 12px; flex-wrap: wrap; }
[data-orbit-real-page="agent"] .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 13px; }
[data-orbit-real-page="agent"] .act { padding: 16px 17px; display: flex; flex-direction: column; gap: 9px; transition: border-color .15s; }
[data-orbit-real-page="agent"] .act:hover { border-color: var(--border-2); }
[data-orbit-real-page="agent"] .act.span2 { grid-column: span 2; }
[data-orbit-real-page="agent"] .act-top { display: flex; align-items: center; gap: 10px; }
[data-orbit-real-page="agent"] .act-ic { width: 34px; height: 34px; border-radius: 9px; display: grid; place-items: center; flex: 0 0 auto; }
[data-orbit-real-page="agent"] .ic-teal { background: var(--accent-soft); color: var(--accent); }
[data-orbit-real-page="agent"] .ic-green { background: var(--live-soft); color: var(--live-text, #0E7A3C); }
[data-orbit-real-page="agent"] .ic-amber { background: var(--amber-soft); color: var(--amber-text, #8A5A00); }
[data-orbit-real-page="agent"] .ic-gray { background: var(--surface-2); color: var(--text-2); border: 1px solid var(--border); }
[data-orbit-real-page="agent"] .act-top b { font-size: 15px; color: var(--ink); font-weight: 600; }
[data-orbit-real-page="agent"] .act-badge { margin-left: auto; font-size: 11px; font-weight: 700; background: var(--signal, #C8323B); color: #fff; min-width: 20px; height: 20px; border-radius: var(--r-pill); display: inline-grid; place-items: center; padding: 0 6px; }
[data-orbit-real-page="agent"] .act p { font-size: 13.5px; color: var(--text-2); flex: 1; margin: 0; }
[data-orbit-real-page="agent"] .act p b { color: var(--ink); font-weight: 600; }
[data-orbit-real-page="agent"] .act .btn { align-self: flex-start; }
[data-orbit-real-page="agent"] .act.ai { border-color: var(--glass-border); background: radial-gradient(80% 120% at 100% 0%, rgba(23,106,115,.1), transparent 55%), var(--glass); backdrop-filter: blur(18px) saturate(150%); -webkit-backdrop-filter: blur(18px) saturate(150%); }
[data-orbit-real-page="agent"] .act .ai-chip { margin-left: auto; }
[data-orbit-real-page="agent"] .stage-row { display: flex; align-items: center; flex-wrap: wrap; row-gap: 6px; }
[data-orbit-real-page="agent"] .stage { display: flex; align-items: center; }
[data-orbit-real-page="agent"] .stage .s-dot { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 600; color: var(--text-3); background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--r-pill); padding: 4px 11px; }
[data-orbit-real-page="agent"] .stage.done .s-dot { color: var(--live-text, #0E7A3C); background: var(--live-soft); border-color: transparent; }
[data-orbit-real-page="agent"] .stage.now .s-dot { color: #fff; background: var(--accent); border-color: transparent; }
[data-orbit-real-page="agent"] .stage .s-link { width: 14px; height: 1.5px; background: var(--border-2); }
[data-orbit-real-page="agent"] .journeys { overflow: hidden; }
[data-orbit-real-page="agent"] .j-row { width: 100%; text-align: left; display: flex; align-items: center; gap: 14px; padding: 14px 18px; transition: background .15s; background: none; border: 0; cursor: pointer; font: inherit; color: inherit; }
[data-orbit-real-page="agent"] .j-row:hover { background: var(--accent-softer); }
[data-orbit-real-page="agent"] .j-row + .j-row { border-top: 1px solid var(--border); }
[data-orbit-real-page="agent"] .j-date { width: 42px; border-radius: var(--r-sm); overflow: hidden; text-align: center; flex: 0 0 auto; background: var(--surface-3); border: 1px solid var(--border); }
[data-orbit-real-page="agent"] .j-date .m { display: block; font-size: 10px; font-weight: 600; color: var(--text-2); padding: 2px 0 0; }
[data-orbit-real-page="agent"] .j-date .d { display: block; font-family: var(--console-tight); font-weight: 600; font-size: 15px; color: var(--ink); padding: 0 0 3px; }
[data-orbit-real-page="agent"] .j-main { flex: 1; min-width: 0; }
[data-orbit-real-page="agent"] .j-main b { display: block; font-size: 14.5px; color: var(--ink); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
[data-orbit-real-page="agent"] .j-main span { font-size: 12.5px; color: var(--text-2); }
[data-orbit-real-page="agent"] .j-arrow { color: var(--text-4); flex: 0 0 auto; }

/* ═══ 对话页 ═══ */
[data-orbit-real-page="agent"] .thread-bar { display: flex; align-items: center; gap: 12px; margin-bottom: 22px; }
[data-orbit-real-page="agent"] .btn-back { width: 34px; height: 34px; border-radius: var(--r-sm); border: 1px solid var(--border-2); background: var(--surface); color: var(--text-2); display: grid; place-items: center; flex: 0 0 auto; transition: border-color .15s, color .15s, background .15s; cursor: pointer; }
[data-orbit-real-page="agent"] .btn-back:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-softer); }
[data-orbit-real-page="agent"] .thread-bar .title { font-family: var(--console-tight); font-size: 16px; font-weight: 600; color: var(--ink); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
[data-orbit-real-page="agent"] .thread-bar .when { font-size: 12px; color: var(--text-4); font-family: var(--ff-mono); margin-left: auto; flex: 0 0 auto; }
[data-orbit-real-page="agent"] .thread { display: flex; flex-direction: column; gap: 20px; }
[data-orbit-real-page="agent"] .msg-user-row { align-self: flex-end; max-width: 78%; display: flex; align-items: flex-end; gap: 8px; }
[data-orbit-real-page="agent"] .msg-user-row .orbit-agent-message-copy { opacity: 0; transition: opacity .15s; }
[data-orbit-real-page="agent"] .msg-user-row:hover .orbit-agent-message-copy { opacity: 1; }
[data-orbit-real-page="agent"] .msg-user { background: var(--accent-soft); color: var(--ink); border-radius: var(--r-md) var(--r-md) 4px var(--r-md); padding: 11px 15px; font-size: var(--agent-body-size); }
[data-orbit-real-page="agent"] .msg-a { display: flex; gap: 12px; }
[data-orbit-real-page="agent"] .msg-a .mk { width: 28px; height: 28px; border-radius: 9px; background: var(--accent); color: #fff; display: grid; place-items: center; flex: 0 0 auto; margin-top: 2px; }
[data-orbit-real-page="agent"] .msg-a .body { flex: 1; min-width: 0; }
[data-orbit-real-page="agent"] .msg-a .body .orbit-agent-markdown { font-size: var(--agent-body-size); color: var(--text); line-height: 1.7; }
[data-orbit-real-page="agent"] .msg-note { align-items: center; background: var(--amber-soft); border-radius: var(--r-sm); color: var(--amber-text, #8A5A00); display: inline-flex; font-size: 13px; font-weight: 600; gap: 8px; margin-bottom: 10px; padding: 7px 12px; }
[data-orbit-real-page="agent"] .msg-tools { display: flex; justify-content: flex-end; margin-top: 8px; opacity: 0; transition: opacity .15s; }
[data-orbit-real-page="agent"] .msg-a:hover .msg-tools { opacity: 1; }
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

[data-orbit-real-page="agent"] .action-card-guard { font-size: 12px; color: var(--text-3); margin-top: 9px; display: flex; gap: 7px; align-items: flex-start; }

[data-orbit-real-page="agent"] .brief-input input:focus, [data-orbit-real-page="agent"] .brief-input input:focus-visible { outline: none; }

@media (max-width: 720px) {
  [data-orbit-real-page="agent"] .grid { grid-template-columns: 1fr; }
  [data-orbit-real-page="agent"] .act.span2 { grid-column: span 1; }
  [data-orbit-real-page="agent"] .appt { grid-template-columns: 1fr; gap: 13px; }
  [data-orbit-real-page="agent"] .brief-action-row { align-items: start; grid-template-columns: 32px minmax(0, 1fr) 32px; }
  [data-orbit-real-page="agent"] .brief-action-buttons { grid-column: 2 / 4; width: 100%; }
  [data-orbit-real-page="agent"] .brief-action-more { grid-column: 3; grid-row: 1; }
}
@media (max-width: 640px) {
  [data-orbit-real-page="agent"] .ws-inner { padding: 18px 16px calc(20px + var(--orbit-ask-clearance, 0px)); }
}
@media (prefers-reduced-motion: reduce) {
  [data-orbit-real-page="agent"] *, [data-orbit-real-page="agent"] *::before, [data-orbit-real-page="agent"] *::after { animation: none !important; transition: none !important; }
}
`;

let cachedAgentConsoleCssExists: boolean | undefined;

function agentConsoleCssExists(): boolean {
  cachedAgentConsoleCssExists ??= fs.existsSync(agentConsoleCssPath);
  return cachedAgentConsoleCssExists;
}

export function OrbitAgentConsoleStyles() {
  return agentConsoleCssExists()
    ? <link href={AGENT_CONSOLE_CSS_ROUTE} rel="stylesheet" />
    : <style dangerouslySetInnerHTML={{ __html: AGENT_CONSOLE_STYLES }} />;
}
