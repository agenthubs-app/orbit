import assert from "node:assert/strict";
import test from "node:test";

import { isInternalContactTag, mergeEditedContactTags, userFacingContactTags } from "../../shared/compute/contact-tags";

// R11a 追补（RD-33）：导入写下的内部标签不给用户看，保存时原样保留。
test("namespaced machine tags are internal; tags people typed are not", () => {
  for (const tag of ["source:external-import", "source:business-card", "event:climate-founders-dinner", "priority:warm-follow-up", "topic:storage-pilots"]) {
    assert.equal(isInternalContactTag(tag), true, tag);
  }
  for (const tag of ["CFO", "展示会で名刺交換", "source", "Source: 紹介", "memo:面談", "topic:", "vCard"]) {
    assert.equal(isInternalContactTag(tag), false, tag);
  }
});

test("the edit screen shows only user tags and saving puts the internal ones back", () => {
  const original = ["source:external-import", "CFO", "topic:community", "会食"];
  assert.deepEqual(userFacingContactTags(original), ["CFO", "会食"]);
  assert.deepEqual(mergeEditedContactTags(original, ["CFO", "紹介者"]), ["source:external-import", "topic:community", "CFO", "紹介者"]);
  // A user cannot add an internal-looking tag through the edit row, and duplicates collapse.
  assert.deepEqual(mergeEditedContactTags(["CFO"], ["CFO", "source:fake", "CFO"]), ["CFO"]);
});
