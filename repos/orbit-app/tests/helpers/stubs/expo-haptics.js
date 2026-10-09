// Test stub: records calls so tests can check that presses give feedback.
const calls = [];
module.exports = {
  __esModule: true,
  calls,
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
  NotificationFeedbackType: { Success: "success", Warning: "warning", Error: "error" },
  impactAsync: async (style) => { calls.push(["impact", style]); },
  notificationAsync: async (type) => { calls.push(["notification", type]); },
};
