import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";

import { FullScreenSearch, TabBar, UnderlineTabs } from "../src/components/ui";
import { renderedText, renderToHtml } from "./helpers/render";

// R31a (G23 / R27-04 / R30): the three components the hand-written pages waited for.
test("UnderlineTabs: one tab list, the selected tab marked, the count after its label", () => {
  const html = renderToHtml(<UnderlineTabs value="people" onChange={() => undefined} testIDPrefix="t-" tabs={[{ key: "intro", label: "紹介" }, { key: "people", label: "参加者", count: 12 }]} />);
  assert.equal((html.match(/role="tablist"/gu) ?? []).length, 1);
  assert.equal((html.match(/role="tab"/gu) ?? []).length, 2);
  assert.match(html, /aria-selected="true"[^>]*data-testid="t-people"|data-testid="t-people"[^>]*aria-selected="true"/u);
  assert.ok(renderedText(<UnderlineTabs value="intro" onChange={() => undefined} tabs={[{ key: "people", label: "参加者", count: 12 }]} />).includes("参加者 12"));
});

test("TabBar: five glass items, labels and the selected item; live variant keeps the same items", () => {
  const items = [{ key: "a", label: "現場", icon: "home" }, { key: "b", label: "おすすめ", icon: "star" }, { key: "c", label: "参加者", icon: "users" }, { key: "d", label: "グループ", icon: "grid" }, { key: "e", label: "予定", icon: "clock" }] as const;
  for (const variant of ["main", "live"] as const) {
    const html = renderToHtml(<TabBar variant={variant} value="c" onChange={() => undefined} items={[...items]} testIDPrefix="v-" />);
    assert.equal((html.match(/role="tab"/gu) ?? []).length, 5, variant);
    assert.match(html, /aria-label="参加者"[^>]*aria-selected="true"|aria-selected="true"[^>]*aria-label="参加者"/u, variant);
  }
});

test("FullScreenSearch: search row, chips and results in order; hidden when not visible", () => {
  const text = renderedText(
    <FullScreenSearch value="高橋" onChangeText={() => undefined} placeholder="検索" clearLabel="クリア" cancelLabel="キャンセル" onCancel={() => undefined} chips={<React.Fragment>すべて</React.Fragment>} testID="s">
      結果
    </FullScreenSearch>,
  );
  assert.ok(text.indexOf("キャンセル") < text.indexOf("すべて") && text.indexOf("すべて") < text.indexOf("結果"), text);
  const html = renderToHtml(<FullScreenSearch kind="events" value="" onChangeText={() => undefined} placeholder="検索" clearLabel="クリア" cancelLabel="キャンセル" onCancel={() => undefined} testID="s" />);
  assert.match(html, /data-testid="s"/u);
  assert.doesNotMatch(html, /aria-label="クリア"/u, "no clear button while empty");
  assert.equal(renderToHtml(<FullScreenSearch overlay visible={false} value="" onChangeText={() => undefined} placeholder="検索" clearLabel="クリア" cancelLabel="キャンセル" onCancel={() => undefined} />), "");
});

test("Popover: the anchored .gmenu panel with rows (current one selected), nothing when closed", () => {
  const { Popover, PopoverRow, PopoverDivider } = require("../src/components/ui") as typeof import("../src/components/ui");
  const html = renderToHtml(
    <Popover visible onClose={() => undefined} anchor={{ top: 192, left: 18, right: 60 }} testID="pop">
      <PopoverRow title="シリーズA 資金調達" subtitle="スコア 128 · 話した人 19" selected accessibilityRole="radio" onPress={() => undefined} />
      <PopoverDivider />
      <PopoverRow title="完了した目標" subtitle="1件" muted onPress={() => undefined} />
    </Popover>,
  );
  assert.match(html, /data-testid="pop"/u);
  assert.match(html, /aria-checked="true"/u);
  assert.equal(renderToHtml(<Popover visible={false} onClose={() => undefined} anchor={{ top: 0, left: 0, right: 0 }}><PopoverDivider /></Popover>), "");
});

test("PopoverRow disabled state is announced and cannot receive a press", () => {
  const { PopoverRow } = require("../src/components/ui") as typeof import("../src/components/ui");
  const html = renderToHtml(<PopoverRow title="完了した目標" disabled onPress={() => undefined} />);
  assert.match(html, /aria-disabled="true"/u);
  assert.match(html, /disabled=""/u);
});

test("Toggle and CategoryTabs expose the same selection as their visual state on RN Web", () => {
  const { Toggle, CategoryTabs } = require("../src/components/ui") as typeof import("../src/components/ui");
  const on = renderToHtml(<Toggle value onValueChange={() => undefined} accessibilityLabel="通知" />);
  const off = renderToHtml(<Toggle value={false} onValueChange={() => undefined} accessibilityLabel="通知" disabled />);
  assert.match(on, /aria-checked="true"/u);
  assert.match(off, /aria-checked="false"/u);
  assert.match(off, /aria-disabled="true"/u);
  const tabs = renderToHtml(<CategoryTabs options={[{ key: "all", label: "すべて" }, { key: "news", label: "通知" }]} value="news" onChange={() => undefined} accessibilityLabel="分類" />);
  assert.match(tabs, /aria-label="すべて"[^>]*aria-selected="false"|aria-selected="false"[^>]*aria-label="すべて"/u);
  assert.match(tabs, /aria-label="通知"[^>]*aria-selected="true"|aria-selected="true"[^>]*aria-label="通知"/u);
});

test("InlineChip stays in a text line after a wrapping value", () => {
  const { InlineChip, UiText } = require("../src/components/ui") as typeof import("../src/components/ui");
  const html = renderToHtml(<UiText>長い前提の値 <InlineChip label="推測" tone="apricot" /></UiText>);
  assert.match(html, /長い前提の値\s*<span[^>]*>推測<\/span>/u);
  assert.doesNotMatch(html, /長い前提の値[^]*?<div[^>]*>推測/u);
});

test("FullDrawer left variant mirrors its entry and rounded edge", () => {
  const { FullDrawer, UiText } = require("../src/components/ui") as typeof import("../src/components/ui");
  const right = renderToHtml(<FullDrawer visible title="履歴" onClose={() => undefined}><UiText>本文</UiText></FullDrawer>);
  const left = renderToHtml(<FullDrawer visible title="履歴" side="left" onClose={() => undefined}><UiText>本文</UiText></FullDrawer>);
  const drawerClass = (html: string) => html.match(/<div class="([^"]*r-backgroundColor-[^"]*)" style="opacity:/u)?.[1] ?? "";
  assert.match(drawerClass(right), /r-right-/u);
  assert.match(drawerClass(right), /r-borderTopLeftRadius-/u);
  assert.match(drawerClass(left), /r-left-/u);
  assert.match(drawerClass(left), /r-borderTopRightRadius-/u);
  assert.doesNotMatch(drawerClass(left), /r-right-|r-borderTopLeftRadius-/u);
});

// R31a (R11a requests): Chip leading icon, SearchField trailing slot, IconButton solid, the full-page form container.
test("Chip draws a 12pt leading icon before the label; SearchField keeps a trailing slot; IconButton solid", () => {
  const { Chip, SearchField, IconButton } = require("../src/components/ui") as typeof import("../src/components/ui");
  const chip = renderToHtml(<Chip label="名刺" icon="scan" />);
  assert.match(chip, /<svg[^>]*width="12"/u);
  assert.ok(chip.indexOf("<svg") < chip.indexOf("名刺"), "icon first");
  assert.doesNotMatch(renderToHtml(<Chip label="名刺" />), /<svg/u);
  const field = renderToHtml(<SearchField value="" onChangeText={() => undefined} placeholder="検索" trailing={<IconButton icon="sliders" size={34} accessibilityLabel="絞り込み" onPress={() => undefined} />} />);
  assert.match(field, /aria-label="絞り込み"/u);
  assert.ok(renderToHtml(<IconButton icon="check" solid accessibilityLabel="保存" onPress={() => undefined} />).includes('aria-label="保存"'));
});

test("FormScreen is AppScreen on the kit inset with ✕ cancel and a solid ✓ save", () => {
  const source = readFileSync(new URL("../src/components/FormScreen.tsx", import.meta.url), "utf8");
  assert.match(source, /inset="kit"/u);
  assert.match(source, /backIcon="x"/u);
  assert.match(source, /icon="check" solid/u);
});

// R31a (RD-28): the gate's mid-state switch (`?design=`) never exists outside a dev build with open-path.
test("designState: only with the dev open-path switch, only short slug values", () => {
  const { designState } = require("../src/screens/add/design-state") as typeof import("../src/screens/add/design-state");
  const { addDesignMock } = require("../src/screens/add/add-design-mock") as typeof import("../src/screens/add/add-design-mock");
  assert.equal(designState("premise", true), "premise");
  assert.equal(designState(["n09", "x"], true), "n09");
  assert.equal(designState("premise", false), null, "release build / switch off: ignored");
  assert.equal(designState("<script>", true), null);
  assert.equal(designState(undefined, true), null);
  assert.equal(addDesignMock("open-path", "open-path", false), false, "a release build (__DEV__ false) never turns open-path on");
});
