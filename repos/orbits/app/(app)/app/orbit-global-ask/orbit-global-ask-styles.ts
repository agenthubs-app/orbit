/**
 * 全局提问入口的样式。
 *
 * 刻意**不**挂在 `[data-orbit-real-page]` 作用域下：这个组件挂在 `/app` 的
 * layout 上，比任何页面根节点都外层，用页面作用域前缀会让它整套样式失效
 * （见 CLAUDE.md 与 orbit-ui-conventions 里记的那个坑）。类名统一用 `oga-`
 * 前缀避免和页面样式撞车。
 *
 * 布局的两个关键点：
 *
 * 1. `.oga-dock` 是 `pointer-events: none` 的全宽容器，只有面板本体收事件。
 *    展开时鼠标滚轮、点击都能穿透到背景页面——这是「背景要能正常滑动」的实现，
 *    也是为什么这里没有全屏遮罩（有遮罩就必然吃掉滚动）。
 * 2. `--orbit-ask-clearance` 由组件实测写入，`::after` 垫片在页面末尾补出等高
 *    空白，于是滚到底时输入框正好落在内容下方而不是压在上面。垫片走 `::after`
 *    而不是 padding，是为了不覆盖各页面自己的 padding-bottom，也不受
 *    box-sizing 影响（产品页没有全局 border-box）。
 */

import { ORBIT_Z } from "../orbit-z";

/** 输入框浮在 sticky 条之上、下拉菜单与弹窗之下。 */
const ASK_Z = ORBIT_Z.sticky + 10;

export const ORBIT_ASK_STYLES = `
:root {
  --orbit-ask-clearance: 0px;
  /* AI 功能的专属渐变：品牌青绿推向青蓝。最亮的一档停在 #0E9AA7，
     和白色图标的对比度约 3.4:1，过 WCAG 非文本 3:1 这条线。 */
  --ai-grad: linear-gradient(140deg, #0B3F46 0%, #176A73 40%, #0E8B98 74%, #0E9AA7 100%);
  --ai-grad-hover: linear-gradient(140deg, #0E4B52 0%, #1A7B85 40%, #109AA8 74%, #12ACB8 100%);
  --ai-ring: rgba(14, 154, 167, 0.30);
  --ai-glow: 0 10px 28px rgba(11, 63, 70, 0.26), 0 2px 8px rgba(11, 63, 70, 0.16);
}

/* 包裹层只为借主题变量的继承而存在，不生成盒子，也就不会被任何
   [data-orbit-real-page] 的布局规则影响。 */
.oga-root { display: contents; }

.oga-root .oga-hide { display: none !important; }

/* ═══ 收起态：右下角的 Orbit 标记 ═══ */
.oga-root .oga-ball {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: ${ASK_Z};
  width: 54px;
  height: 54px;
  border: 0;
  border-radius: 50%;
  padding: 0;
  display: grid;
  place-items: center;
  color: #fff;
  background: var(--ai-grad);
  box-shadow: var(--ai-glow);
  cursor: pointer;
  transition: transform .16s ease, background .18s ease, box-shadow .18s ease;
}
/* 高光让渐变球看起来是个立体的物件，而不是一块贴纸。压在最暗的一角，
   不影响白色图标那侧的对比度。 */
.oga-root .oga-ball::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: radial-gradient(68% 58% at 30% 22%, rgba(255,255,255,.34), transparent 70%);
  pointer-events: none;
}
.oga-root .oga-ball > svg { position: relative; }
.oga-root .oga-ball:hover { background: var(--ai-grad-hover); transform: translateY(-2px); }
.oga-root .oga-ball:active { transform: scale(.94); }
.oga-root .oga-ball:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }

/* ═══ 展开态 ═══ */
.oga-root .oga-dock {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: ${ASK_Z};
  display: flex;
  justify-content: center;
  padding: 0 16px 18px;
  /* 容器不吃事件，背景照常滚动/点击；只有面板本体收事件。 */
  pointer-events: none;
}
.oga-root .oga-panel {
  position: relative;
  width: min(560px, calc(100vw - 32px));
  pointer-events: auto;
  animation: oga-in .2s cubic-bezier(.2,.9,.3,1);
}
@keyframes oga-in { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }

/* 面板背后的三层渐隐毛玻璃，把下方内容揉开，让输入框读得清。 */
.oga-root .oga-halo { position: absolute; inset: -86px -74px -52px; z-index: 0; pointer-events: none; }
.oga-root .oga-halo i { position: absolute; inset: 0; display: block; }
.oga-root .oga-halo .h1 { backdrop-filter: blur(2.5px); -webkit-backdrop-filter: blur(2.5px);
  -webkit-mask-image: radial-gradient(ellipse 100% 100% at 50% 64%, #000 0%, rgba(0,0,0,.94) 26%, rgba(0,0,0,.78) 42%, rgba(0,0,0,.55) 56%, rgba(0,0,0,.32) 70%, rgba(0,0,0,.14) 83%, rgba(0,0,0,.04) 92%, transparent 100%);
  mask-image: radial-gradient(ellipse 100% 100% at 50% 64%, #000 0%, rgba(0,0,0,.94) 26%, rgba(0,0,0,.78) 42%, rgba(0,0,0,.55) 56%, rgba(0,0,0,.32) 70%, rgba(0,0,0,.14) 83%, rgba(0,0,0,.04) 92%, transparent 100%); }
.oga-root .oga-halo .h2 { backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
  -webkit-mask-image: radial-gradient(ellipse 76% 78% at 50% 66%, #000 0%, rgba(0,0,0,.92) 22%, rgba(0,0,0,.72) 38%, rgba(0,0,0,.46) 54%, rgba(0,0,0,.24) 70%, rgba(0,0,0,.08) 86%, transparent 100%);
  mask-image: radial-gradient(ellipse 76% 78% at 50% 66%, #000 0%, rgba(0,0,0,.92) 22%, rgba(0,0,0,.72) 38%, rgba(0,0,0,.46) 54%, rgba(0,0,0,.24) 70%, rgba(0,0,0,.08) 86%, transparent 100%); }
.oga-root .oga-halo .h3 { backdrop-filter: blur(13px); -webkit-backdrop-filter: blur(13px);
  -webkit-mask-image: radial-gradient(ellipse 54% 56% at 50% 68%, #000 0%, rgba(0,0,0,.88) 20%, rgba(0,0,0,.62) 38%, rgba(0,0,0,.34) 56%, rgba(0,0,0,.12) 76%, transparent 100%);
  mask-image: radial-gradient(ellipse 54% 56% at 50% 68%, #000 0%, rgba(0,0,0,.88) 20%, rgba(0,0,0,.62) 38%, rgba(0,0,0,.34) 56%, rgba(0,0,0,.12) 76%, transparent 100%); }

.oga-root .oga-top, .oga-root .oga-row, .oga-root .oga-note { position: relative; z-index: 1; }
.oga-root .oga-top { display: flex; align-items: center; gap: 7px; margin-bottom: 9px; flex-wrap: wrap; }
.oga-root .oga-chips { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }

/* 背景色走 --surface 而不是写死的白：这个组件现在活在所有页面上，深色主题下
   写死白底会变成「浅紫文字压在白药丸上」，对比度直接掉到不可读。 */
.oga-root .oga-chip {
  display: inline-flex; align-items: center; height: 28px; padding: 0 11px;
  border-radius: var(--r-pill, 999px); font: inherit; font-size: 12.5px; font-weight: 500;
  background: color-mix(in srgb, var(--surface) 86%, transparent); color: var(--text-2);
  border: 1px solid var(--border);
  backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
  box-shadow: 0 3px 12px rgba(23,33,31,.10);
  white-space: nowrap; cursor: pointer;
  transition: background .14s, color .14s, border-color .14s;
}
.oga-root .oga-chip:hover { background: var(--surface); border-color: var(--accent); color: var(--accent-press); }

/* 会随问题一起带走的页面上下文。做成可划掉的 chip 而不是隐式附加：
   用户该看得见我们要带走什么，也该能拒绝。 */
.oga-root .oga-context {
  display: inline-flex; align-items: center; gap: 4px; height: 28px; padding: 0 5px 0 10px;
  border-radius: var(--r-pill, 999px); font-size: 12.5px; font-weight: 500;
  background: color-mix(in srgb, var(--surface) 78%, transparent); color: var(--text-3);
  border: 1px dashed var(--border-2);
  backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
  white-space: nowrap;
}
.oga-root .oga-context-x {
  display: grid; place-items: center; width: 18px; height: 18px; padding: 0;
  border: 0; border-radius: 50%; background: none; color: var(--text-4); cursor: pointer;
}
.oga-root .oga-context-x:hover { background: var(--surface-3); color: var(--ink); }

.oga-root .oga-close {
  margin-left: auto; width: 28px; height: 28px; padding: 0; border-radius: 50%;
  background: color-mix(in srgb, var(--surface) 86%, transparent); border: 1px solid var(--border);
  color: var(--text-3); display: grid; place-items: center; flex: 0 0 auto;
  backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
  box-shadow: 0 3px 12px rgba(23,33,31,.10); cursor: pointer;
}
.oga-root .oga-close:hover { background: var(--surface); color: var(--ink); }

.oga-root .oga-row {
  display: flex; align-items: center; gap: 11px;
  background: color-mix(in srgb, var(--surface) 66%, transparent);
  border: 1px solid color-mix(in srgb, var(--surface) 82%, transparent);
  outline: 1px solid var(--border);
  border-radius: var(--r-pill, 999px);
  padding: 6px 6px 6px 18px;
  backdrop-filter: blur(20px) saturate(175%); -webkit-backdrop-filter: blur(20px) saturate(175%);
  box-shadow: 0 10px 30px rgba(23,33,31,.15);
  transition: outline-color .15s, box-shadow .15s;
}
.oga-root .oga-row:focus-within { outline-color: var(--ai-ring); box-shadow: 0 10px 30px rgba(23,33,31,.15), 0 0 0 3px var(--ai-ring); }
.oga-root .oga-lead { color: var(--text-3); display: inline-flex; flex: 0 0 auto; }
.oga-root .oga-row input {
  flex: 1; min-width: 0; border: 0; background: none; font: inherit; font-size: 14.5px;
  color: var(--text); min-height: 38px; outline: none;
}
.oga-root .oga-row input:focus, .oga-root .oga-row input:focus-visible { outline: none; }
.oga-root .oga-row input::placeholder { color: var(--text-3); transition: opacity .2s; }

.oga-root .oga-send {
  width: 36px; height: 36px; padding: 0; border: 0; border-radius: 50%;
  background: var(--ai-grad); color: #fff; display: grid; place-items: center; flex: 0 0 auto;
  cursor: pointer; transition: background .15s, transform .08s, opacity .15s;
}
.oga-root .oga-send:hover:not(:disabled) { background: var(--ai-grad-hover); }
.oga-root .oga-send:active:not(:disabled) { transform: scale(.94); }
.oga-root .oga-send:disabled { opacity: .45; cursor: default; }
.oga-root .oga-send:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.oga-root .oga-note { font-size: 11px; color: var(--text-2); margin: 9px 0 0; text-align: center; }

/* ═══ 给页面底部让位 ═══
   垫在页面根节点末尾。agent 页的根是 height:100dvh 的 flex 列，垫片会变成 flex
   item 把布局挤歪，所以它标了 data-orbit-ask-clearance="manual"，自己在
   .ws-inner 的 padding 上让位。 */
[data-orbit-real-page]:not([data-orbit-ask-clearance="manual"])::after {
  content: "";
  display: block;
  flex: none;
  height: var(--orbit-ask-clearance, 0px);
}

@media (max-width: 640px) {
  .oga-root .oga-ball { right: 14px; bottom: calc(14px + env(safe-area-inset-bottom)); }
  .oga-root .oga-dock { padding-bottom: calc(12px + env(safe-area-inset-bottom)); }
}

@media (prefers-reduced-motion: reduce) {
  .oga-root .oga-ball, .oga-root .oga-panel, .oga-root .oga-chip,
  .oga-root .oga-send, .oga-root .oga-row { animation: none !important; transition: none !important; }
}
`;
