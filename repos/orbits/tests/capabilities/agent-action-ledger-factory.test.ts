/**
 * Agent ledger factory 测试：mock 模式可解析，live 模式返回未配置 failure。
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createAgentLedgerService } from "../../features/agent/service-factory";

test("mock mode resolves a working ledger service", async () => {
  const service = createAgentLedgerService("mock");
  const result = await service.listEntries();
  assert.equal(result.success, true);
});

test("live mode returns the unconfigured failure until a store exists", async () => {
  const service = createAgentLedgerService("live");
  const result = await service.listEntries();
  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.code, "AGENT_LEDGER_LIVE_STORE_UNCONFIGURED");
  }
});
