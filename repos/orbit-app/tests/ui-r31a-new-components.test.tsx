import assert from "node:assert/strict";
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
