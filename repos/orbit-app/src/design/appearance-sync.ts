// Web and tests: no synchronous store — the browser setting (web) or the async
// restore (tests) applies; see appearance-sync.native.ts.
export const appearanceSyncStore = {
  read(_key: string): string | null { return null; },
  write(_key: string, _value: string): void {},
};
