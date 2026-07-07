import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const prototypeHtmlPath = path.join(
  process.cwd(),
  "public/orbit-reference/orbit-reference.html",
);

let cachedStyleText: string | undefined;
const cachedScriptText = new Map<string, string>();

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
  z-index: 90;
}

.orbit-live-checkin-page button {
  line-height: normal;
}

.orbit-live-checkin-page button:disabled {
  opacity: 1;
}

.orbit-live-checkin-page .orbit-party-icon-button {
  font-size: 13px;
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
  background: var(--glass-bar);
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
  font-weight: 600;
  gap: 8px;
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
  font-weight: 600;
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
  font-weight: 600;
  line-height: 1.1;
}

[data-orbit-real-page].orbit-party-page .orbit-party-event-title span {
  color: var(--text-3);
  font-size: 13px;
}

[data-orbit-real-page].orbit-party-page .orbit-party-ended-pill {
  background: var(--surface-2);
  border-radius: 999px;
  color: var(--text-3);
  font-size: 12px;
  font-weight: 600;
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
  font-weight: 600;
  gap: 8px;
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
  font-weight: 600;
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
  gap: 8px;
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
  font-weight: 600;
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
  font-weight: 600;
}

[data-orbit-real-page].orbit-party-page .orbit-party-agenda-main p {
  color: var(--text-3);
  font-size: 13px;
  margin: 5px 0 0;
}

[data-orbit-real-page].orbit-party-page .orbit-party-agenda-status {
  color: var(--live);
  font-size: 13px;
  font-weight: 600;
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
  font-weight: 600;
  gap: 12px;
  height: 40px;
  min-height: 40px;
  padding: 10px 12px;
}

.orbit-host-admin-page .orbit-host-nav-item.is-active {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}

.orbit-host-admin-page .orbit-host-exit {
  background: transparent;
  border: 0;
  border-radius: 10px;
  color: var(--text-3);
  cursor: pointer;
  display: flex;
  font-family: var(--ff);
  font-size: 14px;
  gap: 10px;
  padding: 10px 12px;
}

.orbit-platform-page .orbit-platform-nav-item {
  border-radius: 10px;
  color: #AAA8C8;
  font-size: 14px;
  font-weight: 600;
  height: 40px;
  min-height: 40px;
  padding: 0 12px;
}

.orbit-platform-page .orbit-platform-nav-item.is-active {
  color: #fff;
}

.orbit-platform-page .orbit-host-exit {
  border-radius: 10px;
  font-size: 14px;
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

[data-orbit-real-page] input:disabled,
[data-orbit-real-page] select:disabled,
[data-orbit-real-page] textarea:disabled {
  opacity: 1;
}

/* Disabled buttons must be visually distinct. .btn variants carry their own
   disabled palette; everything else falls back to reduced emphasis. The live
   check-in page opts out below (its disabled tiles are stateful, not inert). */
[data-orbit-real-page] button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
[data-orbit-real-page] .btn:disabled,
[data-orbit-real-page].orbit-live-checkin-page button:disabled {
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
  font-weight: 600;
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
  background: var(--accent-soft-hover, rgba(139, 123, 240, 0.26));
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
  font-size: 14px;
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
  font-weight: 600;
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
  font-weight: 600;
}

[data-orbit-real-page] .orbit-brand-link {
  align-items: center;
  color: var(--accent);
  display: inline-flex;
  flex: 0 0 auto;
}

[data-orbit-real-page="agent"] .orbit-nav-link {
  font-weight: 600;
}

/* Mobile navigation: the top bar carries brand + current page title on the
   left, and iOrbit + language + hamburger on the right; primary destinations
   live in the hamburger's full-width menu panel. This replaces the old
   compressed single-bar layout (11px links, 30×34 targets). */
@media (max-width: 640px) {
  [data-orbit-real-page] .orbit-top-nav {
    display: flex !important;
    flex-shrink: 0;
    gap: 10px;
    height: 56px;
    min-height: 56px;
    padding: 0 14px;
    width: 100%;
  }

  [data-orbit-real-page] .orbit-top-nav .orbit-nav-links,
  [data-orbit-real-page] .orbit-top-nav .orbit-brand-word,
  [data-orbit-real-page] .orbit-top-nav .orbit-me-link {
    display: none !important;
  }

  [data-orbit-real-page] .orbit-top-nav .orbit-top-actions {
    flex: 0 0 auto;
    gap: 8px !important;
    margin-left: 0;
  }

  [data-orbit-real-page="landing"] {
    padding-bottom: 0 !important;
  }
}

/* ===================================================================
   Desktop top-nav — match the starfield homepage nav (orbit-starfield-
   desktop #skNav) so the product pages and the landing share ONE nav
   language: brand wordmark + tagline, centered plain-text links, plain
   中/EN, subtle "Me" pill. Only applies >640px; the mobile hamburger
   layout above is untouched.
   =================================================================== */
[data-orbit-real-page] .orbit-top-nav {
  justify-content: space-between;
}
/* Match the homepage nav's taller, roomier bar on desktop (mobile keeps its
   own compact 56px bar from the <=640px block above). */
@media (min-width: 641px) {
  [data-orbit-real-page] .orbit-top-nav {
    height: auto;
    min-height: 0;
    padding: 18px clamp(20px, 5vw, 56px);
  }
}
[data-orbit-real-page] .orbit-nav-lead {
  align-items: center;
  display: flex;
  gap: 11px;
  min-width: 0;
}
[data-orbit-real-page] .orbit-brand-link {
  align-items: center;
  display: inline-flex;
  gap: 11px;
}
[data-orbit-real-page] .orbit-brand-word {
  display: flex;
  flex-direction: column;
  line-height: 1;
}
[data-orbit-real-page] .orbit-brand-name {
  color: var(--ink);
  font-size: 18px;
  font-weight: 500;
  letter-spacing: 0.02em;
}
[data-orbit-real-page] .orbit-brand-sub {
  color: var(--text-3);
  font-size: 9px;
  letter-spacing: 0.03em;
  margin-top: 4px;
}
[data-orbit-real-page] .orbit-top-nav .orbit-nav-links {
  align-items: center;
  display: flex;
  gap: 4px;
}
[data-orbit-real-page] .orbit-top-nav .orbit-nav-link {
  background: none;
  border: 0;
  border-radius: 9px;
  color: rgba(236, 234, 246, 0.72);
  font-size: 14px;
  font-weight: 500;
  padding: 8px 15px;
  text-decoration: none;
  transition: color 0.14s, background 0.14s;
}
[data-orbit-real-page] .orbit-top-nav .orbit-nav-link:hover {
  background: transparent;
  color: var(--ink);
}
[data-orbit-real-page] .orbit-top-nav .orbit-nav-link.is-active {
  background: rgba(255, 255, 255, 0.06);
  color: var(--ink);
}
[data-orbit-real-page] .orbit-top-nav .orbit-me-link {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border-2);
  border-radius: var(--r-pill);
  color: var(--text);
  font-size: 13px;
  font-weight: 500;
  height: auto;
  padding: 7px 16px;
}
[data-orbit-real-page] .orbit-top-nav .orbit-me-link:hover {
  background: rgba(255, 255, 255, 0.11);
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
  font-size: 13px;
  font-weight: 400;
}

[data-orbit-real-page="home-events"] button.orbit-account-event-card {
  font-size: 13px;
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

/* ===================================================================
   Starfield theme layer — aligns every product screen with the cosmic
   homepage identity (deep-space canvas, violet primary, warm-gold
   support, Noto Serif SC display, JetBrains Mono metadata).
   Token remap only; declared last so it wins over the extracted
   prototype tokens and the audit layer above.
   Contrast (WCAG): text 15.8:1, text-2 7.7:1, text-3 6.4:1 on surface;
   accent 5.5:1; on-accent (dark ink on violet, the homepage pill
   pattern) 5.8:1; live 8.8:1, amber 9.8:1, rose 6.7:1, sky 7.7:1.
   =================================================================== */
[data-orbit-real-page] {
  color-scheme: dark;
  --accent: #8B7BF0;
  --accent-hover: #9C8EF5;
  --accent-press: #7A69E6;
  --accent-soft: rgba(139, 123, 240, 0.16);
  --accent-softer: rgba(139, 123, 240, 0.09);
  --accent-ring: rgba(139, 123, 240, 0.42);
  --on-accent: #0B0A15;
  --accent-grad: linear-gradient(180deg, #9C8EF5, #7A69E6);
  --accent-grad-bar: linear-gradient(90deg, #8B7BF0, #6359E9);
  --ink: #F2F0FB;
  --text: #ECEAF6;
  --text-2: #A6A3BD;
  --text-3: #9793B8;
  --text-4: #6E6A8F;
  --bg: #06050D;
  --bg-soft: #0D0B1E;
  --bg-sunken: #08070F;
  --surface: #12101F;
  --surface-2: #171430;
  --surface-3: #1D1936;
  --border: rgba(150, 145, 200, 0.14);
  --border-2: rgba(150, 145, 200, 0.22);
  --border-strong: rgba(150, 145, 200, 0.34);
  --hairline: rgba(150, 145, 200, 0.10);
  --live: #34C98E;
  --live-soft: rgba(52, 201, 142, 0.14);
  --amber: #E0B472;
  --amber-soft: rgba(216, 176, 106, 0.15);
  --rose: #F0718B;
  --rose-soft: rgba(224, 65, 95, 0.17);
  --sky: #6FA8F8;
  --sky-soft: rgba(45, 127, 240, 0.17);
  --sh-xs: 0 1px 2px rgba(0, 0, 0, 0.45);
  --sh-sm: 0 1px 2px rgba(0, 0, 0, 0.4), 0 2px 6px rgba(0, 0, 0, 0.45);
  --sh-md: 0 2px 4px rgba(0, 0, 0, 0.4), 0 8px 24px rgba(0, 0, 0, 0.55);
  --sh-lg: 0 8px 16px rgba(0, 0, 0, 0.45), 0 24px 56px -12px rgba(123, 108, 232, 0.25);
  --sh-pop: 0 12px 32px rgba(0, 0, 0, 0.6), 0 40px 80px -20px rgba(123, 108, 232, 0.35);
  --ff: 'Noto Sans SC', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  --ff-tight: 'Noto Serif SC', 'Songti SC', Georgia, serif;
  --ff-mono: 'JetBrains Mono', 'Geist Mono', ui-monospace, monospace;
  --scrim: rgba(4, 3, 10, 0.62);
  /* Dark-glass surfaces for bars/chips that previously used white glass. */
  --glass-bar: rgba(10, 8, 18, 0.78);
  --glass-chip: rgba(16, 13, 32, 0.86);
}

/* Re-declare font-family INSIDE the token scope. The prototype sets
   font-family: var(--ff) on the body element, which sits outside
   [data-orbit-real-page] — so the var resolved to the prototype's Inter
   stack and every inherited text node rendered in the system CJK font
   (PingFang/YaHei) instead of the bundled Noto Sans SC. This one rule is
   what actually activates the starfield sans across product pages. */
[data-orbit-real-page] {
  font-family: var(--ff);
}

/* EN display serif follows the homepage: Newsreader replaces Noto Serif SC
   when the document language is English. */
html[lang="en"] [data-orbit-real-page] {
  --ff-tight: 'Newsreader', Georgia, serif;
}

/* Cosmic page canvas behind every product screen — the homepage scene
   gradient, verbatim values. */
body:has([data-orbit-real-page]) {
  background: radial-gradient(130% 100% at 50% 14%, #14122A 0%, #0D0B1E 42%, #08070F 72%, #06050D 100%) fixed #06050D;
}

/* Prototype chrome that hardcodes light glass/white surfaces (not token
   driven) — restated in the homepage's dark-glass language. Text inside
   these is token colored, so only the surfaces need the remap. */
[data-orbit-real-page] .orbit-organizer-topnav {
  background: rgba(10, 8, 18, 0.66);
  border-bottom: 1px solid var(--border);
}
/* Product top-nav uses the exact glass of the starfield homepage nav
   (orbit-starfield #skNav): lighter, more transparent, softer hairline. */
[data-orbit-real-page] .orbit-top-nav {
  background: rgba(8, 7, 16, 0.26);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  border-bottom: 1px solid rgba(150, 145, 200, 0.07);
}
[data-orbit-real-page] .orbit-mobile-bar,
[data-orbit-real-page] .orbit-sticky-cta,
[data-orbit-real-page] .orbit-subpage-header,
[data-orbit-real-page] .orbit-host-mobile-next-bar,
[data-orbit-real-page] .orbit-host-mobile-create-bar {
  background: rgba(10, 8, 18, 0.78);
  border-color: var(--border);
}
[data-orbit-real-page] .orbit-graph-legend,
[data-orbit-real-page] .orbit-party-icon-button,
[data-orbit-real-page] .orbit-organizer-back {
  background: rgba(16, 13, 32, 0.84);
  border-color: var(--border-2);
}
[data-orbit-real-page] .orbit-card-date,
[data-orbit-real-page] .orbit-landing-event-date,
[data-orbit-real-page] .orbit-organizer-date {
  background: rgba(13, 11, 30, 0.88);
  color: var(--ink);
}
[data-orbit-real-page] .orbit-landing-secondary,
[data-orbit-real-page] .orbit-landing-phase-card,
[data-orbit-real-page] .orbit-landing-info-card,
[data-orbit-real-page] .orbit-landing-small-link.is-button,
[data-orbit-real-page] .orbit-landing-registered-card,
[data-orbit-real-page] .orbit-landing-empty,
[data-orbit-real-page] .orbit-landing-loading,
[data-orbit-real-page] .orbit-landing-mobile-event-card {
  background: linear-gradient(158deg, rgba(20, 18, 38, 0.97), rgba(11, 10, 22, 0.985));
  border-color: var(--border);
}
[data-orbit-real-page] .orbit-landing-brand-explainer {
  background: var(--bg-soft);
}
[data-orbit-real-page] .orbit-person-node.is-placeholder {
  background:
    linear-gradient(var(--surface-2), var(--surface-2)) padding-box,
    var(--node-gradient, var(--accent-grad)) border-box;
}

/* Inverted-contrast controls: the prototype pairs an ink background with
   white text (dark-on-light). With ink now bright, flip the text to the
   homepage pill pattern (bright fill + near-black ink, 17:1). */
[data-orbit-real-page] .btn-dark,
[data-orbit-real-page] .chip.is-active,
[data-orbit-real-page] .orbit-organizer-seg button.is-active {
  color: #0B0A15;
}

/* Admin/platform keeps its dark rail by decision — pin it to the cosmic
   panel color instead of var(--ink), which is now bright. */
[data-orbit-real-page] .orbit-platform-sidebar {
  background: #0D0B1E;
}

/* ===================================================================
   Audit round 2 — systemic fixes (scrims, on-cover badges, nav wrap).
   Declared last so these win over both the prototype styles and the
   layers above.
   =================================================================== */

/* Hover token for soft (accent-tinted) controls; replaces the light-theme
   hardcoded #E5E3FA that used to flash white on the dark theme. */
[data-orbit-real-page] {
  --accent-soft-hover: rgba(139, 123, 240, 0.26);
}

/* Every overlay scrim goes through the same token. The host-modal backdrop
   is a <button>, so the element reset above wiped its prototype background
   entirely — restate it here (P0: the create/invite dialogs had NO scrim). */
[data-orbit-real-page] .orbit-host-modal-backdrop,
[data-orbit-real-page] .orbit-party-picker-overlay,
[data-orbit-real-page] .orbit-host-auth-backdrop,
[data-orbit-real-page] .orbit-account-auth-backdrop {
  background: var(--scrim);
}

/* Badges overlaid on cover art sit on saturated gradients where the tinted
   text pattern (violet-on-violet) drops to ~1.25:1. On covers they adopt the
   dark-glass pill language of the date badge next to them. */
[data-orbit-real-page] .cover .badge {
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  background: var(--glass-chip);
  border: 1px solid rgba(255, 255, 255, 0.16);
}
[data-orbit-real-page] .cover .badge-live { color: #7FE8BE; }
[data-orbit-real-page] .cover .badge-soon { color: #CFC6F8; }
[data-orbit-real-page] .cover .badge-ended { color: var(--text-2); }

/* Platform mobile nav items must not wrap mid-label ("活动/审核"). */
[data-orbit-real-page] .orbit-platform-nav-item {
  white-space: nowrap;
}

/* ===================================================================
   Starfield coordination: carry the homepage's warm gold secondary and
   its restrained cosmic palette into every inner page, so product screens
   read as the same night sky as the landing hero (not a cooler, flatter
   violet-only variant).
   =================================================================== */

/* Eyebrow kickers ("EXPLORE · 东京", "DASHBOARD", "ACCOUNT" …) adopt the
   homepage's warm gold — the same accent as its "RELATIONSHIP STARFIELD"
   label — tying every section header back to the hero. */
[data-orbit-real-page] .eyebrow {
  color: var(--amber);
}

/* Avatars share the coordinated cosmic palette (muted, violet-leaning, with
   one warm gold), keeping seven distinguishable people-tones without the
   original neon green/blue/rose that clashed with the covers. */
[data-orbit-real-page] .g-indigo { --av-a: #9C8EF5; --av-b: #6359E9; }
[data-orbit-real-page] .g-violet { --av-a: #B892EC; --av-b: #7A4FD0; }
[data-orbit-real-page] .g-rose { --av-a: #D68FC2; --av-b: #A85186; }
[data-orbit-real-page] .g-amber { --av-a: #EDC57C; --av-b: #CF9438; }
[data-orbit-real-page] .g-emerald { --av-a: #8FBFC4; --av-b: #47898F; }
[data-orbit-real-page] .g-sky { --av-a: #8A9CEC; --av-b: #5063CE; }
[data-orbit-real-page] .g-slate { --av-a: #9490AE; --av-b: #565478; }

/* Person initial-avatars: replace the strong two-tone gradient fill with a
   quiet tinted disc + a light-hue initial. Keeps per-person color identity
   without shouting. Icon tiles and photo avatars (svg/img children) keep the
   bold fill, so only the "name placeholder" circles soften. */
[data-orbit-real-page] .avatar:not(:has(svg)):not(:has(img)) {
  background: color-mix(in srgb, var(--av-b, #6359E9) 20%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--av-b, #6359E9) 30%, transparent);
  color: color-mix(in srgb, var(--av-a, #8B7BF0) 74%, #FFFFFF);
}

/* Language toggle — plain "中 / EN" text, matching the starfield homepage nav
   (orbit-starfield-desktop). Active language brightens; the rest stays muted. */
[data-orbit-real-page] .orbit-lang-toggle {
  align-items: center;
  display: inline-flex;
  flex-shrink: 0;
  font-family: var(--ff-mono);
  font-size: 12px;
  gap: 2px;
  letter-spacing: 0.05em;
}
[data-orbit-real-page] .orbit-lang-toggle button {
  background: none;
  border: 0;
  color: var(--text-3);
  cursor: pointer;
  font: inherit;
  letter-spacing: inherit;
  padding: 6px 3px;
}
[data-orbit-real-page] .orbit-lang-toggle button.is-active {
  color: var(--ink);
}
[data-orbit-real-page] .orbit-lang-sep {
  color: var(--text-4);
}

/* Button loading state — standard async affordance for every .btn variant.
   Pair with disabled + aria-busy at the call site. */
@keyframes orbit-btn-spin {
  to { transform: rotate(360deg); }
}
[data-orbit-real-page] .btn.is-loading {
  pointer-events: none;
}
[data-orbit-real-page] .btn.is-loading::before {
  animation: orbit-btn-spin 0.6s linear infinite;
  border: 2px solid currentColor;
  border-radius: var(--r-pill);
  border-right-color: transparent;
  content: "";
  height: 14px;
  width: 14px;
}

/* Destructive button variant (danger actions were previously unmarked). */
[data-orbit-real-page] .btn-danger {
  background: var(--rose);
  box-shadow: var(--sh-xs);
  color: #16060B;
}
[data-orbit-real-page] .btn-danger:hover {
  background: #F2839A;
}
[data-orbit-real-page] .btn-danger-soft {
  background: var(--rose-soft);
  color: var(--rose);
}
[data-orbit-real-page] .btn-danger-soft:hover {
  background: rgba(224, 65, 95, 0.26);
}

/* Admin/platform mobile: single-metric stat tiles were one per row (a full
   screen for four numbers) — pack them two-up. */
@media (max-width: 760px) {
  [data-orbit-real-page] .orbit-host-stat-grid,
  [data-orbit-real-page] .orbit-platform-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 12px;
  }
}

/* Mobile top-nav elements (page title, iOrbit icon, hamburger, menu panel):
   desktop keeps the full link bar, so these only exist <=640px. */
[data-orbit-real-page] .orbit-nav-page-title,
[data-orbit-real-page] .orbit-nav-iorbit-icon,
[data-orbit-real-page] .orbit-nav-menu-btn,
[data-orbit-real-page] .orbit-nav-menu-layer {
  display: none;
}

@media (max-width: 640px) {
  [data-orbit-real-page] .orbit-nav-menu .orbit-nav-page-title {
    color: var(--ink);
    display: inline;
    font-family: var(--ff-tight);
    font-size: 17px;
    font-weight: 600;
    letter-spacing: -0.01em;
  }
  [data-orbit-real-page] .orbit-nav-iorbit-icon,
  [data-orbit-real-page] .orbit-nav-menu-btn {
    align-items: center;
    background: transparent;
    border: 0;
    border-radius: var(--r-sm);
    color: var(--text-2);
    cursor: pointer;
    display: inline-flex;
    height: 36px;
    justify-content: center;
    width: 36px;
  }
  [data-orbit-real-page] .orbit-nav-iorbit-icon {
    color: var(--accent);
  }
  [data-orbit-real-page] .orbit-nav-iorbit-icon.is-active {
    background: var(--accent-soft);
  }
  [data-orbit-real-page] .orbit-nav-menu-layer {
    display: block;
    inset: 0;
    position: fixed;
    z-index: 70;
  }
  [data-orbit-real-page] .orbit-nav-menu-scrim {
    background: var(--scrim);
    border: 0;
    cursor: pointer;
    inset: 0;
    position: absolute;
  }
  [data-orbit-real-page] .orbit-nav-menu-panel {
    animation: pop 0.18s cubic-bezier(0.22, 1, 0.36, 1);
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    border-radius: 0 0 20px 20px;
    box-shadow: var(--sh-pop);
    left: 0;
    padding: 8px 10px 14px;
    position: absolute;
    right: 0;
    top: 56px;
  }
  [data-orbit-real-page] .orbit-nav-menu-item {
    align-items: center;
    border-radius: var(--r-sm);
    color: var(--text-2);
    display: flex;
    font-size: 16px;
    font-weight: 600;
    gap: 14px;
    min-height: 56px;
    padding: 0 14px;
    text-decoration: none;
  }
  [data-orbit-real-page] .orbit-nav-menu-item.is-active {
    background: var(--accent-softer);
    color: var(--accent);
  }
}

/* Field-level validation: message sits under the field, in the danger hue. */
[data-orbit-real-page] .field.is-invalid {
  border-color: var(--rose) !important;
}
[data-orbit-real-page] .field.is-invalid:focus {
  box-shadow: 0 0 0 4px rgba(224, 65, 95, 0.24);
}
[data-orbit-real-page] .field-error-text {
  align-items: center;
  color: var(--rose);
  display: flex;
  font-size: 13px;
  gap: 6px;
  line-height: 1.4;
}

/* Z-index scale: 0–10 in-page, 35 sticky bars, 60 top nav, 70 dropdowns,
   90 sheets/overlays-in-page, 100 modal dialogs, 120 toasts. The prototype
   scattered modal layers across 40/90/120 — pin them all to the modal tier. */
[data-orbit-real-page] .orbit-host-modal-layer,
[data-orbit-real-page] .orbit-host-auth-overlay,
[data-orbit-real-page] .orbit-party-picker-overlay {
  z-index: 100;
}

/* Modal cards share one radius (20px, the ModalShell standard). */
[data-orbit-real-page] .orbit-host-create-modal,
[data-orbit-real-page] .orbit-host-invite-modal {
  border-radius: 20px;
}

/* Minimum readable text: the prototype dips to 8–10.5px on date tiles and
   metadata. 11px is the floor (matches the inline-style floor in React). */
[data-orbit-real-page] .orbit-landing-event-date small,
[data-orbit-real-page] .orbit-date-tile span,
[data-orbit-real-page] .orbit-party-table-meta,
[data-orbit-real-page] .orbit-party-table-seat-label,
[data-orbit-real-page] .orbit-party-graph-stat .mono,
[data-orbit-real-page] .orbit-party-me-stat .mono,
[data-orbit-real-page] .orbit-party-me-code-body .eyebrow,
[data-orbit-real-page] .orbit-organizer-date span {
  font-size: 11px;
}
`;

interface BundledAsset {
  compressed?: boolean;
  data: string;
  mime: string;
}

function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function extractBundlerScript(srcDoc: string, type: string): string | undefined {
  const escapedType = type.replace("/", "\\/");
  return srcDoc.match(new RegExp(`<script type="${escapedType}">([\\s\\S]*?)<\\/script>`))?.[1];
}

function unpackTemplate(srcDoc: string) {
  const manifestText = extractBundlerScript(srcDoc, "__bundler/manifest");
  const templateText = extractBundlerScript(srcDoc, "__bundler/template");

  if (!manifestText || !templateText) return srcDoc;

  const manifest = JSON.parse(manifestText) as Record<string, BundledAsset>;
  let template = JSON.parse(templateText) as string;

  for (const [uuid, entry] of Object.entries(manifest)) {
    const compressed = Buffer.from(entry.data, "base64");
    const bytes = entry.compressed ? zlib.gunzipSync(compressed) : compressed;
    const dataUrl = `data:${entry.mime};base64,${bytes.toString("base64")}`;
    template = template.split(uuid).join(dataUrl);
  }

  return template;
}

function readReferenceStyles() {
  if (cachedStyleText) return cachedStyleText;

  const html = fs.readFileSync(prototypeHtmlPath, "utf8");
  const srcDoc = html.match(/<iframe class="browser-frame"[^>]*srcdoc="([\s\S]*?)"><\/iframe>/)?.[1];

  if (!srcDoc) {
    throw new Error("Orbit reference iframe srcdoc was not found.");
  }

  const template = unpackTemplate(decodeHtmlAttribute(srcDoc));
  cachedStyleText = [...template.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
    .map((match) => match[1])
    .join("\n");

  return cachedStyleText;
}

export function readPrototypeScriptAsset(uuid: string) {
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

  const compressed = Buffer.from(entry.data, "base64");
  const bytes = entry.compressed ? zlib.gunzipSync(compressed) : compressed;
  const script = bytes.toString("utf8");

  cachedScriptText.set(uuid, script);
  return script;
}

function scriptContent(value: string) {
  return value.replace(/<\/script/gi, "<\\/script");
}

export function OrbitReferenceThreeRuntime() {
  const threeScript = readPrototypeScriptAsset("4636af91-bda9-4959-bb19-8ab1c003d4e6");

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: scriptContent(threeScript) }} />
      <script dangerouslySetInnerHTML={{ __html: "window.__orbitPrototypeThreeReady = !!window.THREE;" }} />
    </>
  );
}

export function OrbitReferenceStyles() {
  return <style dangerouslySetInnerHTML={{ __html: `${readReferenceStyles()}\n${reactReferenceIsolationStyles}` }} />;
}
