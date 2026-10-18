require.extensions[".css"] = (module) => {
  module.exports = new Proxy({}, { get: (_target, name) => name === "__esModule" ? false : String(name) });
};
globalThis.document = { activeElement: null, addEventListener() {}, removeEventListener() {} };
