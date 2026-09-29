import assert from "node:assert/strict";
import test from "node:test";
import {
  assertLifecycleNodeSortRuntimeFor,
  lifecycleSortRuntimeSchema,
  VERIFIED_LIFECYCLE_NODE_SORT_RUNTIMES,
} from "../../features/followups/storage/lifecycle-task-pages";

// SC-W0025-02：只有经 PG 差分测试的 Node/ICU/Unicode 组合放行，其余一律 fail-closed。
// 版本号注入，不改 process.versions。
const runtime = (node: string, icu: string, unicode: string) => ({ node, icu, unicode });

test("verified Node/ICU/Unicode tuples pass the lifecycle sort runtime check", () => {
  for (const verified of [runtime("25.6.0", "78.2", "17.0"), runtime("26.10.0", "78.3", "17.0")]) {
    assert.doesNotThrow(() => assertLifecycleNodeSortRuntimeFor(verified), JSON.stringify(verified));
  }
  assert.deepEqual(
    VERIFIED_LIFECYCLE_NODE_SORT_RUNTIMES.map(({ node, icu, unicode }) => `${node}/${icu}/${unicode}`),
    ["25.6.0/78.2/17.0", "26.10.0/78.3/17.0"],
    "the whitelist holds exactly the differentially tested tuples",
  );
});

test("any tuple outside the whitelist throws LIFECYCLE_SORT_RUNTIME_UNVERIFIED", () => {
  const rejected = [
    runtime("26.10.0", "78.2", "17.0"), // 版本混搭：本机 Node + 旧 ICU
    runtime("25.6.0", "78.3", "17.0"), // 旧 Node + 本机 ICU
    runtime("26.9.0", "78.3", "17.0"), // 同 major 不同 patch
    runtime("26.10.1", "78.3", "17.0"),
    runtime("26.10.0", "78.3", "16.0"), // unicode 不同
    runtime("26.10.0", "78.3.1", "17.0"),
    runtime("26", "78", "17"), // 只写 major 不算
    runtime("", "", ""),
    { node: "26.10.0", icu: undefined, unicode: "17.0" }, // 无 ICU 的构建
  ];
  for (const candidate of rejected) {
    assert.throws(
      () => assertLifecycleNodeSortRuntimeFor(candidate),
      /^Error: LIFECYCLE_SORT_RUNTIME_UNVERIFIED$/,
      JSON.stringify(candidate),
    );
  }
});

test("the PG sort runtime schema still rejects tuples that differ from the verified literals", () => {
  const verified = { pg: "160012", encoding: "UTF8", catalog: "153.136", actual: "153.136", provider: "i", deterministic: true };
  assert.equal(lifecycleSortRuntimeSchema.safeParse(verified).success, true);
  for (const [key, value] of [
    ["pg", "170004"],
    ["encoding", "SQL_ASCII"],
    ["catalog", "153.14"],
    ["actual", "153.14"],
    ["provider", "c"],
    ["deterministic", false],
  ] as const) {
    assert.equal(lifecycleSortRuntimeSchema.safeParse({ ...verified, [key]: value }).success, false, key);
  }
  assert.equal(lifecycleSortRuntimeSchema.safeParse({ ...verified, extra: 1 }).success, false, "strict schema");
});
