import * as React from "react";

type ReactWithCache = { cache?: <T extends (...args: never[]) => unknown>(fn: T) => T };

/**
 * Memoize a server read for the current React server render, so the layout, the page and their
 * server components share one call per arguments. Next's App Router runs React 19, which provides
 * `cache`; there the result lives only for that one request. Elsewhere (proxy, route handlers,
 * Node tests on the installed React 18) the function is called straight through.
 */
export function cacheForRequest<T extends (...args: never[]) => unknown>(fn: T): T {
  const reactCache = (React as unknown as ReactWithCache).cache;
  return typeof reactCache === "function" ? reactCache(fn) : fn;
}
