"use strict";

let denied = 0;
const deniedCode = "ORBIT_NETWORK_GUARD_DENIED";

function deniedError(kind) {
  denied += 1;
  const error = new Error(`Network access denied by test guard: ${kind}`);
  error.code = deniedCode;
  return error;
}

function deny(kind) {
  throw deniedError(kind);
}

function denyAsync(kind) {
  return Promise.reject(deniedError(kind));
}

function patch(object, name, replacement, required = false) {
  if (!object || typeof object[name] !== "function") {
    if (required) throw new Error(`Network guard could not patch ${name}`);
    return;
  }
  try {
    object[name] = replacement;
  } catch {
    Object.defineProperty(object, name, { configurable: true, writable: true, value: replacement });
  }
  if (required && object[name] !== replacement) throw new Error(`Network guard could not install ${name}`);
}

function isUnixSocketPath(value) {
  return typeof value === "string" && (value.startsWith("/") || value.startsWith("\\\\.\\pipe\\") || value.startsWith("\\\\?\\pipe\\"));
}

function isUnixSocketArgs(args) {
  const normalizedArgs = Array.isArray(args[0]) ? args[0] : args;
  const options = normalizedArgs[0];
  if (isUnixSocketPath(options)) return true;
  return Boolean(options && typeof options === "object" && isUnixSocketPath(options.path) && options.host == null && options.port == null);
}

const net = require("node:net");
const originalNetConnect = net.connect;
const originalNetCreateConnection = net.createConnection;
const originalSocketConnect = net.Socket?.prototype?.connect;
patch(net, "connect", function guardedNetConnect(...args) {
  if (isUnixSocketArgs(args)) return Reflect.apply(originalNetConnect, this, args);
  return deny("net.connect");
}, true);
patch(net, "createConnection", function guardedNetCreateConnection(...args) {
  if (isUnixSocketArgs(args)) return Reflect.apply(originalNetCreateConnection, this, args);
  return deny("net.createConnection");
}, true);
patch(net.Socket?.prototype, "connect", function guardedSocketConnect(...args) {
  if (isUnixSocketArgs(args)) return Reflect.apply(originalSocketConnect, this, args);
  return deny("net.Socket.connect");
}, true);

const tls = require("node:tls");
patch(tls, "connect", (...args) => deny("tls.connect"), true);
patch(tls.TLSSocket?.prototype, "connect", function guardedTlsSocketConnect(...args) { return deny("tls.TLSSocket.connect"); });

const http = require("node:http");
patch(http, "request", (...args) => deny("http.request"), true);
patch(http, "get", (...args) => deny("http.get"), true);

const https = require("node:https");
patch(https, "request", (...args) => deny("https.request"), true);
patch(https, "get", (...args) => deny("https.get"), true);

const http2 = require("node:http2");
patch(http2, "connect", (...args) => deny("http2.connect"));

const dgram = require("node:dgram");
patch(dgram, "createSocket", (...args) => deny("dgram.createSocket"));

const dns = require("node:dns");
for (const name of ["lookup", "resolve", "resolve4", "resolve6", "reverse"]) {
  patch(dns, name, (...args) => deny(`dns.${name}`));
}
for (const name of ["lookup", "resolve", "resolve4", "resolve6", "reverse"]) {
  patch(dns.promises, name, (...args) => denyAsync(`dns.promises.${name}`));
}

patch(globalThis, "fetch", (...args) => denyAsync("fetch"), true);

try {
  const undici = require("undici");
  for (const name of ["fetch", "request", "stream", "pipeline", "connect", "upgrade"]) {
    patch(undici, name, (...args) => denyAsync(`undici.${name}`));
  }
} catch {
  // The built-in fetch and node network modules remain guarded when undici is unavailable.
}

process.once("exit", () => {
  process.stderr.write(`guard: denied=${denied}\n`);
});
