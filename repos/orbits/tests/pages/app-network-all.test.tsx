import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { OrbitContactsViewModel } from "../../app/(app)/app/orbit-contacts-route-view-model";
import { NetworkAll } from "../../app/(app)/app/contacts/network-0918/network-all";

const vm: OrbitContactsViewModel = {
  connections: [
    { company: "Nexa AI", encounters: [], displayName: "田中惠子", email: "", g: "g-violet", id: "c1", industry: "科技与互联网", initial: "田", lineId: "", location: "", lastEventId: "", met: "", note: "", notes: [], offering: "", phone: "", pipelineStatus: "in_progress", relationshipStatus: "active", seeking: "下周约产品演示", source: "event", stage: "Active", title: "合作伙伴负责人", wechat: "", strength: "strong", valueTags: [], nextAction: null, lastInteraction: "昨天", dormant: false },
    { company: "三井", encounters: [], displayName: "山本健", email: "", g: "g-violet", id: "c2", industry: "专业服务", initial: "山", lineId: "", location: "", lastEventId: "", met: "", note: "", notes: [], offering: "", phone: "", pipelineStatus: "to_contact", relationshipStatus: "needs_follow_up", seeking: "", source: "referral", stage: "Needs follow-up", title: "顾问", wechat: "", strength: "unscored", valueTags: [], nextAction: null, lastInteraction: "", dormant: false },
  ],
  events: [], intros: [], pipelineStatuses: [],
};

test("all screen renders design structure with real counts", () => {
  const html = renderToStaticMarkup(<NetworkAll viewModel={vm} />);
  assert.match(html, /data-network-screen="all"/);
  assert.match(html, /共 2 位联系人/);
  // 六张来源卡，全部计数 2，活动认识 1
  assert.equal((html.match(/class="btn nw-source-card/g) ?? []).length, 6);
  assert.match(html, /活动认识[\s\S]{0,120}nw-source-n">1</);
  // 两行联系人；W0055：「关系档位」列读自动档位（strong → 核心，unscored → 未评估），不再显示旧手动阶段
  assert.equal((html.match(/class="btn nw-row"/g) ?? []).length, 2);
  assert.match(html, /关系档位/);
  assert.match(html, /data-network-tier="core"[\s\S]{0,240}核心/);
  assert.match(html, /data-network-tier="unscored"[\s\S]{0,120}未评估/);
  assert.doesNotMatch(html, /正在推进|待了解|保持联系|待设置关系|关系状态/);
  assert.doesNotMatch(html, /128/);
});

test("W0055: every remaining filter changes the list — no display-only filter boxes", () => {
  // 只看标记，不看页内 <style>（共享样式表里仍留着旧类名的规则，不影响页面）。
  const html = renderToStaticMarkup(<NetworkAll viewModel={vm} />).replace(/<style>[\s\S]*?<\/style>/g, "");
  // 原来的「来源／关系状态／行业／排序」四个 <label> 只显示固定文字、没有任何交互，已删除。
  assert.doesNotMatch(html, /nw-filter-label|nw-filter-box|nw-filter-caret/);
  assert.doesNotMatch(html, /全部状态|全部行业|All statuses|All industries/);
  // 剩下的筛选：一个可输入的搜索框 + 六张来源卡片按钮（都会改变列表，见下一条用例）。
  const filters = html.match(/<div class="nw-filters">([\s\S]*?)<\/div>/)?.[1] ?? "";
  assert.equal((filters.match(/<input/g) ?? []).length, 1);
  assert.equal(filters.replace(/<input[^>]*>/g, "").trim(), "");
  assert.equal((html.match(/<button type="button" class="btn nw-source-card/g) ?? []).length, 6);
});

test("source filter narrows rows and shows the design empty state", () => {
  const html = renderToStaticMarkup(<NetworkAll viewModel={vm} initialSource="scan" />);
  assert.equal((html.match(/class="btn nw-row"/g) ?? []).length, 0);
  assert.match(html, /没有匹配的联系人/);
});
