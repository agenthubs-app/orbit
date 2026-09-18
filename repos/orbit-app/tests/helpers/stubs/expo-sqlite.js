// expo-sqlite's entry references Metro globals (__DEV__) at load time, so it
// cannot be imported under node --test. The Web lifecycle imports it statically
// (see sync-lifecycle.web.ts for why); in Node the capability probe never
// reaches these functions, and the browser test bundles the real module.
function unavailable() {
  return Promise.reject(new Error("expo-sqlite is not available under node --test"));
}

module.exports = {
  openDatabaseAsync: unavailable,
  deleteDatabaseAsync: unavailable,
};
