import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const prototypeHtmlPath = path.join(
  process.cwd(),
  "public/orbit-reference/orbit-reference.html",
);

// reference styles 从旧 prototype HTML 中抽取，用来让 React 页面复用同一套视觉基线。
// 这里做了进程内缓存，避免每次渲染都重复读取和解包完整 HTML。
let cachedStyleText: string | undefined;
const cachedScriptText = new Map<string, string>();

// React 页面需要少量隔离样式，避免 prototype 的按钮/input/reset 规则和 React 组件互相污染。
const reactReferenceIsolationStyles = `
[data-orbit-real-page] button,
[data-orbit-real-page] input,
[data-orbit-real-page] select,
[data-orbit-real-page] textarea {
  background: initial;
  border: initial;
  border-radius: initial;
  color: inherit;
  font: inherit;
  letter-spacing: 0;
  line-height: normal;
  margin: 0;
  max-width: none;
  height: auto;
  min-height: auto;
  min-width: 0;
  padding: 0;
}

[data-orbit-real-page] button {
  font-weight: inherit;
}

.orbit-party-page button,
.orbit-party-graph-screen button {
  min-width: 0;
}

.orbit-party-auth-overlay {
  position: absolute;
  inset: 0;
  z-index: 80;
}

.orbit-live-checkin-page button {
  line-height: normal;
}

.orbit-live-checkin-page button:disabled {
  opacity: 1;
}

.orbit-live-checkin-page .orbit-party-icon-button {
  font-size: 13.3333px;
  font-weight: 400;
  line-height: normal;
  padding: 1px 6px;
}

[data-orbit-real-page="landing"] .orbit-landing-brand-explainer {
  background: var(--surface) !important;
  border-top: 0 !important;
  margin-top: 48px !important;
  padding-bottom: 72px !important;
  padding-top: 58px !important;
}

@media (max-width: 640px) {
  [data-orbit-real-page="landing"] .orbit-landing-brand-explainer {
    margin-top: 34px !important;
    padding-bottom: 52px !important;
    padding-top: 44px !important;
  }

  .orbit-live-checkin-page .orbit-party-checkin-hero {
    position: relative;
  }

  .orbit-live-checkin-page .orbit-party-checkin-meta {
    justify-content: flex-start;
    padding-right: 92px;
  }

  .orbit-live-checkin-page .orbit-party-checkin-meta .badge-live {
    position: absolute;
    right: 18px;
    top: 18px;
  }
}

[data-orbit-real-page].orbit-party-page .orbit-party-top-tabs {
  align-items: center;
  background: rgba(255,255,255,0.94);
  border-bottom: 1px solid var(--border);
  display: flex;
  flex-shrink: 0;
  gap: 10px;
  min-height: 60px;
  overflow: hidden;
  padding: 10px 18px;
  position: relative;
  z-index: 35;
}

[data-orbit-real-page].orbit-party-page .orbit-party-return-icon {
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--border-2);
  border-radius: 999px;
  box-shadow: var(--sh-xs);
  color: var(--ink);
  cursor: pointer;
  display: inline-flex;
  flex: 0 0 auto;
  height: 38px;
  justify-content: center;
  width: 38px;
}

[data-orbit-real-page].orbit-party-page .orbit-party-return-icon:hover {
  background: var(--surface-2);
  border-color: var(--border-strong);
}

[data-orbit-real-page].orbit-party-page .orbit-party-top-tab-list {
  align-items: center;
  display: flex;
  flex: 1;
  gap: 8px;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
}

[data-orbit-real-page].orbit-party-page .orbit-party-top-tab-list::-webkit-scrollbar {
  display: none;
}

[data-orbit-real-page].orbit-party-page .orbit-party-top-tab {
  border-color: var(--border-2);
  cursor: pointer;
  flex: 0 0 auto;
  height: 36px;
  padding: 0 12px;
}

[data-orbit-real-page].orbit-party-page .orbit-party-top-tab.is-active {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--on-accent);
}

[data-orbit-real-page].orbit-party-page .orbit-party-desktop-chrome {
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

[data-orbit-real-page].orbit-party-page .orbit-party-desktop-head {
  align-items: center;
  display: flex;
  gap: 12px;
  margin: 0 auto;
  max-width: 1040px;
  padding: 22px 24px 12px;
  width: 100%;
}

[data-orbit-real-page].orbit-party-page .orbit-party-exit-button {
  align-items: center;
  background: var(--surface-2);
  border: 1px solid transparent;
  border-radius: 10px;
  color: var(--text);
  cursor: pointer;
  display: inline-flex;
  flex-shrink: 0;
  font-size: 14px;
  font-weight: 650;
  gap: 7px;
  height: 38px;
  padding: 0 13px;
}

[data-orbit-real-page].orbit-party-page .orbit-party-exit-button:hover {
  background: var(--surface-3);
}

[data-orbit-real-page].orbit-party-page .orbit-party-event-mark {
  align-items: center;
  background: var(--accent);
  border-radius: 10px;
  color: var(--on-accent);
  display: flex;
  flex-shrink: 0;
  font-size: 18px;
  font-weight: 750;
  height: 38px;
  justify-content: center;
  width: 38px;
}

[data-orbit-real-page].orbit-party-page .orbit-party-event-title {
  display: grid;
  gap: 2px;
  min-width: 0;
}

[data-orbit-real-page].orbit-party-page .orbit-party-event-title strong {
  color: var(--ink);
  font-size: 16px;
  font-weight: 750;
  line-height: 1.1;
}

[data-orbit-real-page].orbit-party-page .orbit-party-event-title span {
  color: var(--text-3);
  font-size: 12.5px;
}

[data-orbit-real-page].orbit-party-page .orbit-party-ended-pill {
  background: var(--surface-2);
  border-radius: 999px;
  color: var(--text-3);
  font-size: 12px;
  font-weight: 650;
  margin-left: auto;
  padding: 6px 12px;
}

[data-orbit-real-page].orbit-party-page .orbit-party-desktop-tabs {
  align-items: center;
  display: flex;
  gap: 26px;
  margin: 0 auto;
  max-width: 1040px;
  padding: 0 24px;
  width: 100%;
}

[data-orbit-real-page].orbit-party-page .orbit-party-desktop-tab {
  align-items: center;
  background: transparent;
  border: 0;
  border-bottom: 2px solid transparent;
  color: var(--text-2);
  cursor: pointer;
  display: inline-flex;
  font-size: 15px;
  font-weight: 650;
  gap: 7px;
  height: 44px;
  padding: 0 0 12px;
}

[data-orbit-real-page].orbit-party-page .orbit-party-desktop-tab:hover,
[data-orbit-real-page].orbit-party-page .orbit-party-desktop-tab.is-active {
  color: var(--accent);
}

[data-orbit-real-page].orbit-party-page .orbit-party-desktop-tab.is-active {
  border-bottom-color: var(--accent);
}

[data-orbit-real-page].orbit-party-page .orbit-party-attendee-grid {
  display: grid;
  gap: 14px;
  margin-top: 18px;
}

[data-orbit-real-page].orbit-party-page .orbit-party-attendee-card {
  align-items: flex-start;
  display: flex;
  gap: 14px;
  padding: 16px;
  position: relative;
}

[data-orbit-real-page].orbit-party-page .orbit-party-attendee-avatar {
  flex-shrink: 0;
  font-size: 20px;
  height: 50px;
  width: 50px;
}

[data-orbit-real-page].orbit-party-page .orbit-party-attendee-body {
  min-width: 0;
  padding-right: 72px;
}

[data-orbit-real-page].orbit-party-page .orbit-party-attendee-name {
  color: var(--ink);
  font-size: 16px;
  font-weight: 750;
}

[data-orbit-real-page].orbit-party-page .orbit-party-attendee-meta,
[data-orbit-real-page].orbit-party-page .orbit-party-attendee-summary {
  color: var(--text-3);
  font-size: 13px;
  line-height: 1.45;
  margin-top: 4px;
}

[data-orbit-real-page].orbit-party-page .orbit-party-attendee-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 12px;
}

[data-orbit-real-page].orbit-party-page .orbit-party-attendee-tags .chip {
  font-size: 12px;
  height: 26px;
}

[data-orbit-real-page].orbit-party-page .orbit-party-attendee-seat {
  position: absolute;
  right: 14px;
  top: 14px;
}

[data-orbit-real-page].orbit-party-page .orbit-party-agenda-list {
  margin-top: 26px;
}

[data-orbit-real-page].orbit-party-page .orbit-party-agenda-row {
  align-items: flex-start;
  display: grid;
  grid-template-columns: 72px 24px minmax(0, 1fr) auto;
  min-height: 62px;
}

[data-orbit-real-page].orbit-party-page .orbit-party-agenda-time {
  color: var(--accent);
  font-family: var(--ff-mono);
  font-size: 14px;
  font-weight: 700;
  padding-top: 2px;
}

[data-orbit-real-page].orbit-party-page .orbit-party-agenda-line {
  align-items: center;
  display: flex;
  flex-direction: column;
  height: 100%;
}

[data-orbit-real-page].orbit-party-page .orbit-party-agenda-line span {
  background: var(--live);
  border-radius: 999px;
  height: 14px;
  width: 14px;
}

[data-orbit-real-page].orbit-party-page .orbit-party-agenda-line i {
  background: var(--live);
  display: block;
  flex: 1;
  margin: 5px 0;
  opacity: 0.7;
  width: 2px;
}

[data-orbit-real-page].orbit-party-page .orbit-party-agenda-main strong {
  color: var(--ink);
  display: block;
  font-size: 16px;
  font-weight: 750;
}

[data-orbit-real-page].orbit-party-page .orbit-party-agenda-main p {
  color: var(--text-3);
  font-size: 13px;
  margin: 5px 0 0;
}

[data-orbit-real-page].orbit-party-page .orbit-party-agenda-status {
  color: var(--live);
  font-size: 12.5px;
  font-weight: 650;
  padding-top: 2px;
}

@media (min-width: 641px) {
  [data-orbit-real-page].orbit-party-page {
    background: var(--bg);
    height: auto !important;
    min-height: 100dvh;
    overflow: auto !important;
  }

  [data-orbit-real-page].orbit-party-page .orbit-party-home-scroll,
  [data-orbit-real-page].orbit-party-page .orbit-party-network-scroll,
  [data-orbit-real-page].orbit-party-page .orbit-party-attendees-scroll,
  [data-orbit-real-page].orbit-party-page .orbit-party-table-scroll,
  [data-orbit-real-page].orbit-party-page .orbit-party-graph-scroll,
  [data-orbit-real-page].orbit-party-page .orbit-party-agenda-scroll {
    flex: 0 0 auto !important;
    margin: 0 auto;
    max-width: 1040px;
    min-height: auto !important;
    overflow: visible !important;
    padding: 42px 24px 88px !important;
    width: 100%;
  }

  [data-orbit-real-page].orbit-party-page .orbit-party-home-scroll > .card:first-of-type {
    margin-top: 0 !important;
  }

  [data-orbit-real-page].orbit-party-page .orbit-party-network-list,
  [data-orbit-real-page].orbit-party-page .orbit-party-attendee-grid {
    display: grid;
    gap: 14px;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  [data-orbit-real-page].orbit-party-page .orbit-party-network-person.card {
    min-height: 186px;
  }

  [data-orbit-real-page].orbit-party-page .orbit-party-network-header {
    align-items: flex-end;
  }

  [data-orbit-real-page].orbit-party-page .orbit-party-attendees-search {
    width: min(100%, 280px);
  }

  [data-orbit-real-page].orbit-party-page .orbit-party-table-seat-scene {
    margin-top: 32px !important;
  }

  [data-orbit-real-page].orbit-party-page .orbit-party-graph-scroll .card {
    box-shadow: none;
  }
}

.orbit-host-admin-page button,
.orbit-admin-access-page button,
.orbit-platform-page button {
  min-width: 0;
}

.orbit-host-admin-page .orbit-host-nav-item {
  background: transparent;
  border-radius: 10px;
  color: var(--text-2);
  display: flex;
  font-size: 14px;
  font-weight: 550;
  gap: 11px;
  height: 40px;
  min-height: 40px;
  padding: 10px 12px;
}

.orbit-host-admin-page .orbit-host-nav-item.is-active {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 550;
}

.orbit-host-admin-page .orbit-host-exit {
  background: transparent;
  border: 0;
  border-radius: 10px;
  color: var(--text-3);
  cursor: pointer;
  display: flex;
  font-family: var(--ff);
  font-size: 13.5px;
  gap: 10px;
  padding: 10px 12px;
}

.orbit-platform-page .orbit-platform-nav-item {
  border-radius: 10px;
  color: #AAA8C8;
  font-size: 14px;
  font-weight: 550;
  height: 40px;
  min-height: 40px;
  padding: 0 12px;
}

.orbit-platform-page .orbit-platform-nav-item.is-active {
  color: #fff;
}

.orbit-platform-page .orbit-host-exit {
  border-radius: 10px;
  font-size: 13.5px;
  padding: 10px 12px;
}

@media (max-width: 760px) {
  .orbit-platform-page .orbit-platform-nav-item {
    height: 42px;
    min-height: 42px;
    padding: 0 8px;
  }

  .orbit-host-admin-page .orbit-host-stat-tile.card {
    border-radius: var(--r-md);
  }
}

.orbit-host-admin-page .orbit-host-portfolio-card.card {
  border: 0;
  border-radius: 18px;
}

.orbit-host-admin-page .orbit-host-portfolio-cover {
  border-radius: 0 !important;
}

.orbit-host-admin-page .orbit-host-event-stat-cover {
  border-radius: 0 !important;
}

[data-orbit-real-page] button:disabled,
[data-orbit-real-page] input:disabled,
[data-orbit-real-page] select:disabled,
[data-orbit-real-page] textarea:disabled {
  opacity: 1;
}

[data-orbit-real-page] textarea {
  resize: none;
}

[data-orbit-real-page] .mono {
  font-family: var(--ff-mono);
}

[data-orbit-real-page].orbit-shell {
  display: block;
  gap: normal;
  margin: 0;
  max-width: none;
  min-height: 100dvh;
  width: 100%;
}

[data-orbit-real-page].orbit-page,
[data-orbit-real-page].orbit-personal-page {
  display: block;
  gap: normal;
  margin: 0;
  max-width: none;
  min-height: 100dvh;
  padding: 0;
  place-items: normal;
  width: 100%;
}

[data-orbit-real-page] .btn {
  align-items: center;
  border: 1px solid transparent;
  border-radius: var(--r-sm);
  cursor: pointer;
  display: inline-flex;
  font-size: 15px;
  font-weight: 550;
  gap: 8px;
  height: 44px;
  justify-content: center;
  letter-spacing: 0;
  padding: 0 20px;
  text-decoration: none;
  transition: background .15s, border-color .15s, color .15s, transform .08s, box-shadow .15s;
  user-select: none;
  white-space: nowrap;
}

[data-orbit-real-page] .btn:active {
  transform: translateY(0.5px);
}

[data-orbit-real-page] .btn-primary {
  background: var(--accent);
  box-shadow: var(--sh-xs);
  color: var(--on-accent);
}

[data-orbit-real-page] .btn-primary:hover {
  background: var(--accent-hover);
}

[data-orbit-real-page] .btn-dark {
  background: var(--ink);
  color: #fff;
}

[data-orbit-real-page] .btn-dark:hover {
  background: #000;
}

[data-orbit-real-page] .btn-soft {
  background: var(--accent-soft);
  color: var(--accent);
}

[data-orbit-real-page] .btn-soft:hover {
  background: #E5E3FA;
}

[data-orbit-real-page] .btn-ghost {
  background: var(--surface);
  border-color: var(--border-2);
  box-shadow: var(--sh-xs);
  color: var(--text);
}

[data-orbit-real-page] .btn-ghost:hover {
  background: var(--surface-2);
  border-color: var(--border-strong);
}

[data-orbit-real-page] .btn-quiet {
  background: transparent;
  color: var(--text-2);
}

[data-orbit-real-page] .btn-quiet:hover {
  background: var(--surface-3);
  color: var(--text);
}

[data-orbit-real-page] .btn-sm {
  border-radius: var(--r-xs);
  font-size: 13.5px;
  height: 36px;
  padding: 0 14px;
}

[data-orbit-real-page] .btn-lg {
  border-radius: var(--r-md);
  font-size: 16px;
  height: 50px;
  padding: 0 24px;
}

[data-orbit-real-page] .btn-block {
  width: 100%;
}

[data-orbit-real-page] .btn[disabled],
[data-orbit-real-page] .btn.is-disabled {
  background: var(--surface-3);
  border-color: transparent;
  box-shadow: none;
  color: var(--text-4);
  cursor: not-allowed;
}

[data-orbit-real-page] .orbit-agent-btn {
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--border-2);
  border-radius: 999px;
  color: var(--accent);
  cursor: pointer;
  display: inline-flex;
  font-family: var(--ff);
  font-size: 14px;
  font-weight: 600;
  gap: 6px;
  height: 36px;
  padding: 0 14px;
  text-decoration: none;
  white-space: nowrap;
}

[data-orbit-real-page] .orbit-agent-btn:hover {
  background: var(--surface-2);
  border-color: rgba(99,89,233,0.22);
}

[data-orbit-real-page] .orbit-agent-btn.is-active {
  background: var(--accent-soft);
  border-color: rgba(99,89,233,0.22);
}

[data-orbit-real-page] .orbit-agent-btn.is-active:hover {
  background: rgba(99,89,233,0.16);
}

[data-orbit-real-page] .orbit-me-link {
  align-items: center;
  background: var(--accent-soft);
  border: 1px solid transparent;
  border-radius: 10px;
  color: var(--accent);
  cursor: pointer;
  display: inline-flex;
  font-family: var(--ff);
  font-size: 14px;
  font-weight: 650;
  height: 38px;
  justify-content: center;
  padding: 0 16px;
  text-decoration: none;
  white-space: nowrap;
}

[data-orbit-real-page] .orbit-me-link:hover {
  background: rgba(99,89,233,0.16);
}

[data-orbit-real-page] .orbit-top-icon-btn {
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--border-2);
  border-radius: 10px;
  box-shadow: var(--sh-xs);
  color: var(--ink);
  cursor: pointer;
  display: inline-flex;
  flex-shrink: 0;
  height: 36px;
  justify-content: center;
  padding: 0;
  width: 36px;
}

[data-orbit-real-page] .orbit-top-icon-btn:hover {
  background: var(--surface-2);
  border-color: var(--border-strong);
}

[data-orbit-real-page] .orbit-top-nav .orbit-nav-link {
  font-weight: 550;
}

[data-orbit-real-page] .orbit-brand-link {
  align-items: center;
  color: var(--accent);
  display: inline-flex;
  flex: 0 0 auto;
}

[data-orbit-real-page="agent"] .orbit-nav-link {
  font-weight: 550;
}

@media (max-width: 640px) {
  [data-orbit-real-page] .orbit-top-nav {
    display: flex !important;
    flex-shrink: 0;
    gap: 4px;
    height: 58px;
    min-height: 58px;
    overflow-x: auto;
    overflow-y: hidden;
    padding: 0 8px;
    scrollbar-width: none;
    width: 100%;
  }

  [data-orbit-real-page] .orbit-top-nav::-webkit-scrollbar {
    display: none;
  }

  [data-orbit-real-page] .orbit-top-nav .orbit-brand-link {
    margin-right: 0;
  }

  [data-orbit-real-page] .orbit-top-nav .orbit-agent-btn {
    flex: 0 0 auto;
    font-size: 11.5px;
    gap: 4px;
    height: 34px;
    padding: 0 5px;
  }

  [data-orbit-real-page] .orbit-top-nav .orbit-agent-btn svg {
    display: none !important;
  }

  [data-orbit-real-page] .orbit-top-nav .orbit-nav-links {
    display: flex;
    flex: 0 0 auto;
    gap: 2px;
  }

  [data-orbit-real-page] .orbit-top-nav .orbit-nav-link {
    align-items: center;
    display: inline-flex;
    flex: 0 0 auto;
    font-size: 11px;
    height: 34px;
    padding: 0 4px;
    white-space: nowrap;
  }

  [data-orbit-real-page] .orbit-top-nav .orbit-top-actions {
    flex: 0 0 auto;
    gap: 5px !important;
    margin-left: 0;
  }

  [data-orbit-real-page] .orbit-top-nav .orbit-lang-button {
    flex: 0 0 auto;
    font-size: 11.5px !important;
  }

  [data-orbit-real-page] .orbit-top-nav .orbit-me-link {
    flex: 0 0 auto;
    font-size: 11.5px;
    height: 34px;
    padding: 0 6px;
  }

  /* Agent (iOrbit) shares the standard mobile top-nav sizing — the bar scrolls
     horizontally if the extra history button doesn't fit, instead of shrinking
     the font out of alignment with every other page. */

  [data-orbit-real-page="landing"] {
    padding-bottom: 0 !important;
  }
}

[data-orbit-real-page] .chip {
  align-items: center;
  background: var(--surface-2);
  border: 1px solid transparent;
  border-radius: var(--r-pill);
  color: var(--text-2);
  cursor: pointer;
  display: inline-flex;
  font-size: 13px;
  font-weight: 500;
  gap: 6px;
  height: 30px;
  letter-spacing: 0;
  min-height: auto;
  padding: 0 12px;
  transition: background .14s, color .14s, border-color .14s;
  white-space: nowrap;
}

[data-orbit-real-page] .chip:hover {
  background: var(--surface-3);
}

[data-orbit-real-page] .chip.is-active {
  background: var(--ink);
  color: #fff;
}

[data-orbit-real-page] .chip-accent {
  background: var(--accent-soft);
  color: var(--accent);
}

[data-orbit-real-page] .chip.badge-live {
  background: var(--live-soft);
  color: var(--live);
}

[data-orbit-real-page="explore"] .orbit-map-rail button,
[data-orbit-real-page="explore"] .orbit-map-canvas button,
[data-orbit-real-page="explore"] .orbit-map-canvas-inner button {
  font-size: 13.3333px;
  font-weight: 400;
}

[data-orbit-real-page="home-events"] button.orbit-account-event-card {
  font-size: 13.3333px;
  font-weight: 400;
}

[data-orbit-real-page] .card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  box-shadow: var(--sh-sm);
}

[data-orbit-real-page] .card-hover {
  cursor: pointer;
  transition: box-shadow .18s, transform .18s, border-color .18s;
}

[data-orbit-real-page] .card-hover:hover {
  border-color: var(--border-2);
  box-shadow: var(--sh-md);
  transform: translateY(-2px);
}

[data-orbit-real-page].orbit-party-page .orbit-party-network-person.card {
  border-radius: var(--r-md);
}

[data-orbit-real-page].orbit-party-page .orbit-party-network-seat.chip {
  background: var(--accent-soft);
  color: var(--accent);
}

[data-orbit-real-page].orbit-party-page .orbit-party-network-search input {
  color: var(--text);
  font-size: 14px;
  padding: 1px 2px;
}

[data-orbit-real-page].orbit-party-page .orbit-party-network-filter.btn {
  padding: 0;
}

[data-orbit-real-page].orbit-party-page .orbit-party-network-tags .chip {
  font-size: 12px;
  height: 26px;
}

[data-orbit-real-page] .orbit-graph-canvas {
  background:
    radial-gradient(circle at 50% 45%, var(--surface), var(--bg-sunken) 62%),
    var(--bg-sunken);
  min-height: 560px;
  overflow: hidden;
  position: relative;
}

[data-orbit-real-page] .orbit-graph-canvas svg {
  display: block;
  min-height: 560px;
}

@media (max-width: 640px) {
  [data-orbit-real-page] .orbit-graph-canvas,
  [data-orbit-real-page] .orbit-graph-canvas svg {
    min-height: 460px;
  }
}

[data-orbit-real-page] .field {
  background: var(--surface);
  border: 1px solid var(--border-2);
  border-radius: var(--r-sm);
  color: var(--text);
  font-size: 15px;
  height: 48px;
  outline: none;
  padding: 0 14px;
  transition: border-color .14s, box-shadow .14s, background .14s;
  width: 100%;
}

[data-orbit-real-page] .field::placeholder {
  color: var(--text-4);
}

[data-orbit-real-page] .field:focus {
  border-color: var(--accent) !important;
  box-shadow: 0 0 0 4px var(--accent-ring);
}

/* ===================================================================
   Audit hardening: a11y + design-system tokens (root-cause layer).
   Loaded AFTER the prototype styles so these win on shared selectors.
   =================================================================== */

/* Centralized tokens that were previously hardcoded across pages. */
[data-orbit-real-page] {
  --scrim: rgba(20, 20, 28, 0.42);
  --accent-grad: linear-gradient(180deg, #8170F1, #614CE2);
  --accent-grad-bar: linear-gradient(90deg, #8B7BF0, #6359E9);
  --on-dark: #FFFFFF;
  --admin-nav-ink: #AAA8C8;
  --admin-nav-ink-strong: #FFFFFF;

  /* WCAG AA: tertiary text was #8A8A93 (3.42:1 on white — fails 4.5:1).
     Nudged to a neutral that clears AA for the meta/caption copy it carries. */
  --text-3: #73737B;
}

/* S1 — global keyboard focus ring. The reset above strips native outlines;
   nothing restored them, so keyboard users had no focus indicator anywhere. */
[data-orbit-real-page] :is(a, button, input, textarea, select, summary, [tabindex], [role="button"], [role="tab"], [role="link"]):focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: var(--r-xs);
}
[data-orbit-real-page] .card:focus-visible,
[data-orbit-real-page] .card-hover:focus-visible,
[data-orbit-real-page] .orbit-card-link:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
[data-orbit-real-page] .field:focus-visible {
  outline: none;
}
/* Dark surfaces (platform/admin dark sidebars) need a light ring. */
.orbit-platform-page :is(a, button, [tabindex], [role="button"], [role="tab"]):focus-visible {
  outline-color: #fff;
}

/* S? — respect reduced motion for every React-layer animation/transition. */
@media (prefers-reduced-motion: reduce) {
  [data-orbit-real-page] *,
  [data-orbit-real-page] *::before,
  [data-orbit-real-page] *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}

/* S5 — enforce a real type scale on the heading classes. The prototype
   defines these with no font-size, forcing every call site to inline px.
   Sizes live here now; call sites should drop inline fontSize. */
[data-orbit-real-page] .h-display { font-size: 28px; line-height: 1.04; }
[data-orbit-real-page] .h-title { font-size: 20px; line-height: 1.12; }
[data-orbit-real-page] .h-section { font-size: 17px; line-height: 1.25; }
[data-orbit-real-page] .body { font-size: 15px; line-height: 1.6; }
[data-orbit-real-page] .text-sm { font-size: 13px; line-height: 1.5; }
@media (max-width: 640px) {
  [data-orbit-real-page] .h-display { font-size: 24px; }
  [data-orbit-real-page] .h-title { font-size: 19px; }
  [data-orbit-real-page] .h-section { font-size: 16px; }
}

/* S3 — standardized icon button. Visual chrome stays compact, but the hit
   area is never below 44px (Apple HIG / Material minimum). */
[data-orbit-real-page] .icon-btn {
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--border-2);
  border-radius: 10px;
  box-shadow: var(--sh-xs);
  color: var(--ink);
  cursor: pointer;
  display: inline-flex;
  flex-shrink: 0;
  justify-content: center;
  min-height: 44px;
  min-width: 44px;
  padding: 0;
}
[data-orbit-real-page] .icon-btn:hover {
  background: var(--surface-2);
  border-color: var(--border-strong);
}
[data-orbit-real-page] .icon-btn-plain {
  background: transparent;
  border: 1px solid transparent;
  box-shadow: none;
}
[data-orbit-real-page] .icon-btn-plain:hover {
  background: var(--surface-3);
  border-color: transparent;
}

/* S3 — hit-area expander for compact controls (copy/zoom/seat/graph nodes)
   that must keep their visual size. Extends tap target to 44px without
   shifting layout. Apply to the control and keep it position:relative. */
[data-orbit-real-page] .hit-44 {
  position: relative;
}
[data-orbit-real-page] .hit-44::after {
  content: "";
  position: absolute;
  top: 50%;
  left: 50%;
  height: 44px;
  width: 44px;
  min-height: 100%;
  min-width: 100%;
  transform: translate(-50%, -50%);
}

/* Bump the existing small icon button to a compliant hit area. */
[data-orbit-real-page] .orbit-top-icon-btn {
  min-height: 44px;
  min-width: 44px;
}

/* iOrbit chat-history button (mobile nav): a light ghost icon that keeps a
   44px tap target but sheds the heavy bordered box so it sits harmoniously
   beside the language toggle and the "Me" pill. */
[data-orbit-real-page="agent"] .orbit-top-nav .orbit-agent-history-btn {
  background: transparent;
  border-color: transparent;
  box-shadow: none;
  color: var(--text-2);
  /* Borderless icon: tighten the footprint so it sits evenly between the
     language toggle and the "Me" pill (the 44px box left it floating). */
  min-width: 36px;
  width: 36px;
}
[data-orbit-real-page="agent"] .orbit-top-nav .orbit-agent-history-btn:hover {
  background: var(--surface-3);
  border-color: transparent;
  color: var(--ink);
}
`;

interface BundledAsset {
  compressed?: boolean;
  data: string;
  mime: string;
}

function decodeHtmlAttribute(value: string): string {
  // iframe srcdoc 在 HTML attribute 中被实体转义；解包前先还原成真实 HTML。
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function extractBundlerScript(srcDoc: string, type: string): string | undefined {
  // prototype bundle 把 manifest/template 等资产藏在特定 type 的 script 标签中。
  const escapedType = type.replace("/", "\\/");
  return srcDoc.match(new RegExp(`<script type="${escapedType}">([\\s\\S]*?)<\\/script>`))?.[1];
}

function unpackTemplate(srcDoc: string) {
  // 如果没有 bundler manifest，就把 srcdoc 当作普通 HTML 处理。
  const manifestText = extractBundlerScript(srcDoc, "__bundler/manifest");
  const templateText = extractBundlerScript(srcDoc, "__bundler/template");

  if (!manifestText || !templateText) return srcDoc;

  const manifest = JSON.parse(manifestText) as Record<string, BundledAsset>;
  let template = JSON.parse(templateText) as string;

  for (const [uuid, entry] of Object.entries(manifest)) {
    // manifest 中的资产可能被 gzip 压缩；解包后以内联 data URL 替换 template 里的 uuid。
    const compressed = Buffer.from(entry.data, "base64");
    const bytes = entry.compressed ? zlib.gunzipSync(compressed) : compressed;
    const dataUrl = `data:${entry.mime};base64,${bytes.toString("base64")}`;
    template = template.split(uuid).join(dataUrl);
  }

  return template;
}

function readReferenceStyles() {
  // 样式只需要读取一次；后续请求复用 cachedStyleText。
  if (cachedStyleText) return cachedStyleText;

  const html = fs.readFileSync(prototypeHtmlPath, "utf8");
  const srcDoc = html.match(/<iframe class="browser-frame"[^>]*srcdoc="([\s\S]*?)"><\/iframe>/)?.[1];

  if (!srcDoc) {
    throw new Error("Orbit reference iframe srcdoc was not found.");
  }

  const template = unpackTemplate(decodeHtmlAttribute(srcDoc));
  // 只抽取 style 标签内容，脚本资产通过 readPrototypeScriptAsset 单独读取。
  cachedStyleText = [...template.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
    .map((match) => match[1])
    .join("\n");

  return cachedStyleText;
}

export function readPrototypeScriptAsset(uuid: string) {
  // prototype script 按 uuid 读取并缓存，供 Three/i18n 等 runtime 单独注入。
  const cached = cachedScriptText.get(uuid);
  if (cached) return cached;

  const html = fs.readFileSync(prototypeHtmlPath, "utf8");
  const srcDoc = html.match(/<iframe class="browser-frame"[^>]*srcdoc="([\s\S]*?)"><\/iframe>/)?.[1];

  if (!srcDoc) {
    throw new Error("Orbit reference iframe srcdoc was not found.");
  }

  const manifestText = extractBundlerScript(decodeHtmlAttribute(srcDoc), "__bundler/manifest");

  if (!manifestText) {
    throw new Error("Orbit reference manifest was not found.");
  }

  const manifest = JSON.parse(manifestText) as Record<string, BundledAsset>;
  const entry = manifest[uuid];

  if (!entry) {
    throw new Error(`Orbit reference script asset ${uuid} was not found.`);
  }

  // script 资产同样可能 gzip 压缩，解包后以纯文本注入到 React script 标签。
  const compressed = Buffer.from(entry.data, "base64");
  const bytes = entry.compressed ? zlib.gunzipSync(compressed) : compressed;
  const script = bytes.toString("utf8");

  cachedScriptText.set(uuid, script);
  return script;
}

function scriptContent(value: string) {
  // 避免内联脚本文本中出现 </script> 提前结束 script 标签。
  return value.replace(/<\/script/gi, "<\\/script");
}

export function readReferenceStyleSheet() {
  return `${readReferenceStyles()}\n${reactReferenceIsolationStyles}`;
}

export function OrbitReferenceThreeRuntime() {
  // 旧 prototype 的 Three runtime 仍从 bundle 中读取，避免重写 3D 依赖装配。
  const threeScript = readPrototypeScriptAsset("4636af91-bda9-4959-bb19-8ab1c003d4e6");

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: scriptContent(threeScript) }} />
      <script dangerouslySetInnerHTML={{ __html: "window.__orbitPrototypeThreeReady = !!window.THREE;" }} />
    </>
  );
}

export function OrbitReferenceStyles() {
  // React 页面通过外部 stylesheet 复用 prototype 原始样式和 React 隔离补丁，
  // 避免把多 MB CSS 直接内联进每个 SSR HTML 响应。
  return <link rel="stylesheet" href="/api/orbit-reference/styles" />;
}
