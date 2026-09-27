// Fixture for paid-ai-test-boundary.test.ts; loaded only through the runner.
// It mimics a product path that swallows provider errors (fail closed), which is
// exactly how a leaked paid call used to pass unnoticed.
import test from "node:test";

test("fixture: a swallowed provider request", async () => {
  if (process.env.PAID_AI_FIXTURE_MODE === "inspect") {
    process.stdout.write(`fetch-name:${globalThis.fetch.name}\n`);
    return;
  }
  try {
    await fetch("https://api.deepseek.com/chat/completions", { method: "POST", body: "{}" });
  } catch {
    // fail closed, like language-normalization-service
  }
});
