import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { OrbitContactsViewModel } from "../../app/(app)/app/orbit-contacts-route-view-model";
import { NetworkAll } from "../../app/(app)/app/contacts/network-0918/network-all";

const vm: OrbitContactsViewModel = {
  connections: [
    { company: "Nexa AI", encounters: [], displayName: "田中惠子", email: "", g: "g-violet", id: "c1", industry: "科技与互联网", initial: "田", lineId: "", location: "", lastEventId: "", met: "", note: "", notes: [], offering: "", phone: "", pipelineStatus: "in_progress", relationshipStatus: "active", seeking: "下周约产品演示", source: "event", stage: "Active", title: "合作伙伴负责人", wechat: "", strength: "medium", valueTags: [], nextAction: null, lastInteraction: "昨天", dormant: false },
    { company: "三井", encounters: [], displayName: "山本健", email: "", g: "g-violet", id: "c2", industry: "专业服务", initial: "山", lineId: "", location: "", lastEventId: "", met: "", note: "", notes: [], offering: "", phone: "", pipelineStatus: "to_contact", relationshipStatus: "needs_follow_up", seeking: "", source: "referral", stage: "Needs follow-up", title: "顾问", wechat: "", strength: "medium", valueTags: [], nextAction: null, lastInteraction: "", dormant: false },
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
  // 两行联系人，阶段 chip 真实
  assert.equal((html.match(/class="btn nw-row"/g) ?? []).length, 2);
  assert.match(html, /正在推进/);
  assert.match(html, /待了解/);
  assert.doesNotMatch(html, /128/);
});

test("source filter narrows rows and shows the design empty state", () => {
  const html = renderToStaticMarkup(<NetworkAll viewModel={vm} initialSource="scan" />);
  assert.equal((html.match(/class="btn nw-row"/g) ?? []).length, 0);
  assert.match(html, /没有匹配的联系人/);
});
