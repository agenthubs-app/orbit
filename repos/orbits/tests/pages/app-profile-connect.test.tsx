import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { CONNECT_INTEGRATIONS, ProfileConnect } from "../../app/(app)/app/profile/profile-0918/profile-connect";
import { PROFILE_STYLES } from "../../app/(app)/app/profile/profile-0918/profile-shell";

const DESIGN_NAMES = ["Google Calendar", "Gmail", "Google Contacts", "Notion"];

test("connect renders the four intMeta cards 1:1 with glyph box colours, desc and scope rows", () => {
  const html = renderToStaticMarkup(<ProfileConnect />);
  assert.deepEqual(CONNECT_INTEGRATIONS.map((it) => it.name), DESIGN_NAMES);
  for (const name of DESIGN_NAMES) {
    assert.match(html, new RegExp(`<strong class="pc-int-name">${name}</strong>`), name);
  }
  assert.equal((html.match(/class="pc-card pc-int-card"/g) ?? []).length, 4);
  // glyph 色块：background / color 为动态色内联
  assert.match(html, /class="pc-int-glyph" style="background:#ECEEFB;color:#2E3270">31<\/span>/);
  assert.match(html, /class="pc-int-glyph" style="background:#FBECEA;color:#B5473A">M<\/span>/);
  assert.match(html, /class="pc-int-glyph" style="background:#ECEEFB;color:#4B4FC7">⚇<\/span>/);
  assert.match(html, /class="pc-int-glyph" style="background:#F1F1FA;color:#0E1225">N<\/span>/);
  // desc 与 scopes 原样
  assert.match(html, /同步你的日程安排，帮助 iOrbit 更好地为你规划时间。/);
  assert.match(html, /读取页面与数据库（在你授权后）/);
  assert.equal((html.match(/class="pc-int-scope"/g) ?? []).length, 8);
  assert.equal((html.match(/class="pc-int-check">✓<\/span>/g) ?? []).length, 8);
});

test("connect cards are all 未连接 with a non-interactive 即将开放 span in the button position and zero <button> inside the cards", () => {
  const html = renderToStaticMarkup(<ProfileConnect />);
  assert.equal((html.match(/class="pc-int-state pc-int-state-off">● 未连接<\/span>/g) ?? []).length, 4);
  assert.doesNotMatch(html, /pc-int-state[^>]*>● 已连接/);
  assert.equal((html.match(/<span class="pc-connect-cta pc-connect-cta-soon" aria-disabled="true">即将开放<\/span>/g) ?? []).length, 4);
  const cardsStart = html.indexOf('class="pc-card pc-int-card"');
  const cardsEnd = html.indexOf("连接概览");
  assert.ok(cardsStart > 0 && cardsEnd > cardsStart);
  assert.doesNotMatch(html.slice(cardsStart, cardsEnd), /<button/);
  // 设计的「连接 / 管理」按钮文案不出现（无 OAuth、无 toggle、无存储的连接状态）
  assert.doesNotMatch(html, />连接<\/(button|span)>/);
  assert.doesNotMatch(html, />管理</);
});

test("connect overview counts are real: 已连接 0 / 未连接 4; 连接说明 card verbatim", () => {
  const html = renderToStaticMarkup(<ProfileConnect />);
  assert.match(html, /<strong class="pc-conn-count">0<\/strong><span class="pc-conn-label">已连接<\/span>/);
  assert.match(html, /<strong class="pc-conn-count">4<\/strong><span class="pc-conn-label">未连接<\/span>/);
  assert.match(html, /连接说明/);
  assert.match(html, /Orbit 只会访问你授权的数据，并且仅用于为你提供更好的服务。你可以随时在这里管理或断开连接。/);
  // 设计 275 行「了解更多 →」是 mock 动作（flashEdit）且无真实目标页 → 省略（记台账）
  assert.doesNotMatch(html, /了解更多/);
  assert.doesNotMatch(html, /<button/);
});

test("PROFILE_STYLES carry the connect rules scoped to the page", () => {
  for (const cls of [".pc-connect", ".pc-int-grid", ".pc-int-card", ".pc-int-head", ".pc-int-glyph", ".pc-int-state", ".pc-int-state-off", ".pc-int-copy", ".pc-int-name", ".pc-int-desc", ".pc-int-scopes", ".pc-int-scope", ".pc-int-check", ".pc-connect-cta", ".pc-connect-cta-soon", ".pc-conn-card", ".pc-conn-grid", ".pc-conn-cell", ".pc-conn-cell-next", ".pc-conn-icon-on", ".pc-conn-icon-off", ".pc-conn-count", ".pc-conn-label", ".pc-note-card", ".pc-note-row", ".pc-note-icon", ".pc-note-text"]) {
    assert.match(PROFILE_STYLES, new RegExp(`\\[data-orbit-real-page="profile-0918"\\] ${cls.replace(/\./g, "\\.")} \\{`), cls);
  }
});
