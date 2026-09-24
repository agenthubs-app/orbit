import assert from 'node:assert/strict';
import test from 'node:test';
import {aggregatePostgresMetrics} from '../../scripts/diagnostics/aggregate-postgres-metrics';
test('metric ranking handles older unattributed logs, invalid lines and only exports scalar totals',()=>{
  const result=aggregatePostgresMetrics([
    JSON.stringify({event:'postgres_read_metric',queryFingerprint:'a'.repeat(24),returnedRows:2,approximateSerializedRowBytes:100,failed:false,secret:'never echo'}),
    JSON.stringify({event:'postgres_read_metric',returnedRows:0,approximateSerializedRowBytes:0,failed:true}),
    JSON.stringify({event:'postgres_read_metric',returnedRows:-1,approximateSerializedRowBytes:0}),
    'invalid',JSON.stringify({event:'unrelated'}),
  ]);
  assert.equal(result.accepted,2);assert.equal(result.rejected,2);assert.equal(result.groups[0]?.bytes,100);
  assert.equal(result.groups[1]?.fingerprint,'unattributed');assert.doesNotMatch(JSON.stringify(result),/never echo|secret/);
});
