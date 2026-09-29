import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const appRoot = join(import.meta.dirname, '..');
const metroConfig = require(join(appRoot, 'metro.config.js'));

test('namespaces transform cache entries by the physical project worktree', () => {
  const { getDefaultConfig } = require('expo/metro-config');
  const defaultCacheVersion = getDefaultConfig(appRoot).cacheVersion;
  const expectedCacheVersion = `${defaultCacheVersion}:orbit-app:${resolve(appRoot)}`;

  assert.equal(metroConfig.cacheVersion, expectedCacheVersion);
  assert.notEqual(
    metroConfig.cacheVersion,
    `${defaultCacheVersion}:orbit-app:${resolve(appRoot, '..', 'other-worktree')}`,
  );
});

test('rewrites async chunk URLs rooted at the symlinked node_modules realpath', () => {
  const realNodeModules = realpathSync(join(appRoot, 'node_modules'));
  const realPathChunk = `${realNodeModules}/expo-secure-store/build/SecureStore.bundle`;
  const escapedRealPath = `/${'../'.repeat(4)}${realPathChunk.slice(1)}`;
  const requestUrl = new URL(
    `http://localhost:8082${escapedRealPath}?platform=ios&modulesOnly=true&runModule=false`,
  ).toString();

  const rewritten = new URL(metroConfig.server.rewriteRequestUrl(requestUrl));

  assert.equal(
    rewritten.pathname,
    '/node_modules/expo-secure-store/build/SecureStore.bundle',
  );
  assert.equal(rewritten.search, '?platform=ios&modulesOnly=true&runModule=false');
});

test('leaves unrelated Metro URLs unchanged', () => {
  const requestUrl = 'http://localhost:8082/index.bundle?platform=ios&dev=true';

  assert.equal(metroConfig.server.rewriteRequestUrl(requestUrl), requestUrl);
});

test('rewrites Metro request paths without requiring an absolute URL', () => {
  const realNodeModules = realpathSync(join(appRoot, 'node_modules'));
  const realPathChunk = `${realNodeModules}/expo-secure-store/build/SecureStore.bundle`;
  const escapedRealPath = `/${'../'.repeat(4)}${realPathChunk.slice(1)}`;
  const requestPath = new URL(
    `http://localhost:8082${escapedRealPath}?platform=ios&modulesOnly=true`,
  ).pathname + '?platform=ios&modulesOnly=true';

  assert.equal(
    metroConfig.server.rewriteRequestUrl(requestPath),
    '/node_modules/expo-secure-store/build/SecureStore.bundle?platform=ios&modulesOnly=true',
  );
});

test('preserves Expo virtual-entry URL rewriting', () => {
  const requestPath = '/.expo/.virtual-metro-entry.bundle?platform=ios&dev=true';

  const rewritten = metroConfig.server.rewriteRequestUrl(requestPath);

  assert.notEqual(rewritten, requestPath);
  assert.match(rewritten, /\.bundle\?/);
  assert.match(rewritten, /transform\.routerRoot=app/);
});
