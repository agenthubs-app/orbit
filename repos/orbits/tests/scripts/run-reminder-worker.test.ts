import assert from "node:assert/strict";
import test from "node:test";

import { parseReminderWorkerCommand, runReminderWorkerCycle } from "../../scripts/run-reminder-worker";

test("reminder worker defaults to one safe dispatch pass", () => {
  assert.deepEqual(parseReminderWorkerCommand([]), { intervalMs: 30_000, watch: false });
});

test("reminder worker accepts a bounded polling interval", () => {
  assert.deepEqual(parseReminderWorkerCommand(["--watch", "--interval-ms", "45000"]), {
    intervalMs: 45_000,
    watch: true,
  });
  assert.throws(() => parseReminderWorkerCommand(["--watch", "--interval-ms", "500"]), /at least 5000/u);
});

test('legacy reminder dispatch waits for typed cutover and stops if cutover fails',async()=>{
  const calls:string[]=[];
  await assert.rejects(runReminderWorkerCycle({
    typedPass:async()=>{calls.push('typed');throw Error('cutover unavailable');},
    legacyDispatch:async()=>{calls.push('legacy');return {claimed:1};},
  }),/cutover unavailable/);
  assert.deepEqual(calls,['typed']);
  const result=await runReminderWorkerCycle({typedPass:async()=>{calls.push('typed');},legacyDispatch:async()=>{calls.push('legacy');return {claimed:1};}});
  assert.deepEqual(result,{claimed:1});assert.deepEqual(calls,['typed','typed','legacy']);
});
