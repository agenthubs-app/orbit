// Test stub: the clipboard is a native module; records what was copied.
const copied = [];
module.exports = {
  __esModule: true,
  copied,
  setStringAsync: async (text) => { copied.push(text); return true; },
  getStringAsync: async () => copied[copied.length - 1] ?? "",
};
