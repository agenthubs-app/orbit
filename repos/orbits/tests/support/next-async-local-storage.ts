import { AsyncLocalStorage } from "node:async_hooks";

// Next installs AsyncLocalStorage on globalThis when its server boots. Import
// this module before anything that loads Next's request stores
// (next/dist/server/app-render/*-async-storage.external) outside a Next server.
(globalThis as { AsyncLocalStorage?: unknown }).AsyncLocalStorage ??= AsyncLocalStorage;
