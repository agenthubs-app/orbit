import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

// Run against an already-open conversation, with the keyboard either open or
// closed. This checks actual Simulator geometry rather than source wiring.
const udid = process.argv[2];
assert.ok(udid, "Pass the target Simulator UDID");
const nodes = JSON.parse(execFileSync("idb", ["ui", "describe-all", "--udid", udid], { encoding: "utf8" }));
const app = nodes.find((node) => node.type === "Application");
const input = nodes.find((node) => node.type === "TextArea" && node.AXLabel?.startsWith("继续聊聊"));
const send = nodes.find((node) => node.AXLabel === "发送消息");
assert.ok(app && input && send, "Conversation composer and Send must be accessible on screen");
for (const node of [input, send]) {
  assert.ok(node.frame.y >= 0 && node.frame.y + node.frame.height <= app.frame.height,
    `${node.AXLabel} must stay inside the visible screen`);
}
const keyboard = nodes.find((node) => node.type === "Keyboard");
if (keyboard) assert.ok(send.frame.y + send.frame.height <= keyboard.frame.y + 1, "Send must stay above the keyboard");
console.log(JSON.stringify({ passed: true, screen: app.frame, input: input.frame, send: send.frame, keyboard: keyboard?.frame ?? null }));
