import assert from "node:assert/strict";
import test from "node:test";

import { createLiveOrbitAgentLocalBoundaryPayload } from "../../features/orbit-ai/live-agent-runtime";

// QA-A 2026-10-26: requests the model can handle were stopped by local boundaries.
test("a pronoun after an @mention is not an unknown recipient", () => {
  assert.equal(createLiveOrbitAgentLocalBoundaryPayload("@高橋智子 帮我起草一封邮件约她下周见面聊合作"), null);
  assert.equal(createLiveOrbitAgentLocalBoundaryPayload("帮我给她写一条下周三见面的消息。")?.provenance.source, "local:orbit-agent-clarification-boundary");
});

test("putting one item on the schedule is one request, not two directions", () => {
  assert.equal(createLiveOrbitAgentLocalBoundaryPayload("周四下午3点和林玫开会，帮我加到日程，标题写 林玫会议"), null);
  assert.equal(createLiveOrbitAgentLocalBoundaryPayload("明天活动该认识谁？顺便帮我给 Maya 写一条跟进消息。")?.provenance.source, "local:orbit-agent-multi-intent-boundary");
});
