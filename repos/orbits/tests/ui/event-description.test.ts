import assert from "node:assert/strict";
import test from "node:test";
import { buildSync } from "esbuild";
import { createRequire } from "node:module";

// 2026-11-12：紹介 = Markdown。主催者が貼った長文（改行・「• 」箇条書き・リンク）が整形され、raw HTML / 画像は描かれない。
const compiled = buildSync({ stdin: { contents: `
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EventDescription } from './app/(app)/app/orbit-2026/events/EventDescription';
import { journeyTranslator } from './app/(app)/app/orbit-2026/events/DiscoverTab';
export function render(text) { return renderToStaticMarkup(<EventDescription text={text} t={journeyTranslator('ja')} />); }
`, loader: 'tsx', resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', loader: { '.css': 'empty', '.module.css': 'empty' }, jsx: 'automatic' });
const mod: { render?: (text: string | null) => string } = {};
const wrapper = { exports: mod };
new Function('require', 'module', 'exports', compiled.outputFiles[0]!.text)(createRequire(process.cwd() + '/package.json'), wrapper, mod);
Object.assign(mod, wrapper.exports);

import { descriptionToMarkdown } from '../../app/(app)/app/orbit-2026/events/EventDescription';

test('pasted event text: single newlines stay line breaks, 「• 」 becomes list items (also mid-line)', () => {
  const md = descriptionToMarkdown('🌏 交流会｜募集\r\n想认识不同背景的人\n🗣️ 活动内容 • 非演讲型 • 自由聊天\n• 中日双语');
  assert.equal(md, '🌏 交流会｜募集  \n想认识不同背景的人  \n🗣️ 活动内容  \n- 非演讲型\n- 自由聊天\n- 中日双语');
  const html = mod.render!('🗣️ 活动内容 • 非演讲型 • 自由聊天\n• 中日双语\n详见 https://example.com/x');
  assert.match(html, /<ul>[\s\S]*<li>非演讲型<\/li>[\s\S]*<li>中日双语<\/li>\n<\/ul>\n<p>详见 /);
  assert.match(html, /<a href="https:\/\/example.com\/x" target="_blank" rel="noopener noreferrer">/);
});
test('markdown: headings, bold, links render; raw html is escaped and images are dropped', () => {
  const html = mod.render!('## スケジュール\n**19:00** 受付 [会場](https://example.com)\n<script>alert(1)</script>\n![pixel](https://evil.example/p.gif)');
  assert.match(html, /<h2>スケジュール<\/h2>/); assert.match(html, /<strong>19:00<\/strong>/);
  assert.doesNotMatch(html, /<script>/); assert.doesNotMatch(html, /<img/); assert.doesNotMatch(html, /evil\.example/);
});
test('empty / whitespace description renders nothing; server render is the open state (no toggle until measured)', () => {
  assert.equal(mod.render!(null), ''); assert.equal(mod.render!('  \n '), '');
  const html = mod.render!('x\n'.repeat(80));
  assert.match(html, /data-event-description="open"/); assert.doesNotMatch(html, /data-event-description-toggle/);
});
