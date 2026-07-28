import assert from "node:assert/strict";
import test from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

import AgentFunctionalTestReportPage from "../../app/dev/agent-test-report/page";
import { AGENT_CAPABILITY_DEFINITIONS } from "../../features/agent/capabilities/registry";
import {
  AGENT_EVALUATED_CAPABILITIES,
  AGENT_EVALUATION_CASES,
  AGENT_EVALUATION_SUMMARY,
  AGENT_FLOW_STAGES,
  AGENT_RESOLVED_FINDINGS,
} from "../../features/agent/evaluation/functional-test-report";

test("Agent functional report stays aligned with the capability registry", () => {
  assert.equal(AGENT_CAPABILITY_DEFINITIONS.length, 20);
  assert.deepEqual(
    AGENT_EVALUATED_CAPABILITIES.map((capability) => capability.id),
    AGENT_CAPABILITY_DEFINITIONS.map((capability) => capability.id),
  );
  assert.equal(AGENT_FLOW_STAGES.length, 8);
  assert.equal(AGENT_EVALUATION_SUMMARY.cases, AGENT_EVALUATION_CASES.length);
  assert.equal(
    AGENT_EVALUATION_SUMMARY.passed + AGENT_EVALUATION_SUMMARY.limited,
    AGENT_EVALUATION_SUMMARY.cases,
  );
  assert.equal(
    AGENT_EVALUATION_SUMMARY.limited,
    AGENT_EVALUATION_CASES.filter((item) => item.status === "limited").length,
  );
  assert.ok(
    AGENT_EVALUATION_SUMMARY.limited > 0,
    "Known limitations must remain visible until executable evidence passes",
  );
  assert.equal(
    AGENT_RESOLVED_FINDINGS.length,
    15,
    "The report must enumerate every currently audited root-cause finding",
  );
});

test("Agent functional report renders every expectation and actual result", () => {
  const html = renderToStaticMarkup(<AgentFunctionalTestReportPage />);

  assert.match(html, /Agent 全功能测试报告/);
  assert.match(html, /一次 Agent 请求经历什么/);
  assert.match(html, /注册表中的全部 20 项能力/);
  assert.match(html, /逐项对照预期与实测/);
  assert.match(html, /为什么会出问题，以及怎么从根上修/);

  for (const testCase of AGENT_EVALUATION_CASES) {
    assert.match(html, new RegExp(testCase.id));
    assert.match(html, new RegExp(testCase.expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(html, new RegExp(testCase.actual.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});
