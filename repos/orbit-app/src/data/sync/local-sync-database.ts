// Native entry: Metro resolves `./local-sync-database` to this file on iOS/Android
// and to `local-sync-database.web.ts` in the browser. Both re-export the same core.
export * from "./local-sync-database-core";
