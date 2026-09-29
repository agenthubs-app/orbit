import assert from "node:assert/strict";
import test from "node:test";

test("the shared contact-pipeline decision classifies every persisted relationship stage", async () => {
  let compute: typeof import("../../shared/compute/contact-pipeline");
  try {
    compute = await import("../../shared/compute/contact-pipeline");
  } catch {
    assert.fail("shared/compute/contact-pipeline.ts must provide the server and App stage decision");
  }

  assert.deepEqual([
    compute.contactPipelineStageFor("captured"),
    compute.contactPipelineStageFor("needs_follow_up"),
    compute.contactPipelineStageFor("reviewing"),
    compute.contactPipelineStageFor("active"),
    compute.contactPipelineStageFor("nurture"),
    compute.contactPipelineStageFor("archived"),
    compute.contactPipelineStageFor("unknown"),
  ], ["to_contact", "to_contact", "in_progress", "in_progress", "nurture", "archived", null]);
});
