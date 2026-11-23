/**
 * The browser's half of Web Push for the local push simulator (agent-design AG16; eval/README.md §10, PSH.yaml 约定一).
 *
 * The product encrypts every browser reminder for the one browser it goes to (RFC 8291, aes128gcm), so the simulator
 * can only say what a reminder holds if it is that browser. For the eval's fixture devices the browser's key pair is
 * derived from the device's id — by the seed (which registers the public half as the subscription) and here (which
 * keeps the private half) — so no key travels between them. These keys exist only for the local simulator: a real
 * browser makes its own and never shows the private half to anyone.
 */
"use strict";

const crypto = require("node:crypto");

const b64url = (buffer) => Buffer.from(buffer).toString("base64url");

/** The simulated browser's keys for one device id: a P-256 key pair and the 16-byte auth secret. */
function evalWebPushKeys(deviceId) {
  const ecdh = crypto.createECDH("prime256v1");
  // A SHA-256 output is a valid P-256 private scalar for all practical inputs (it must be below the curve order).
  ecdh.setPrivateKey(crypto.createHash("sha256").update(`agent-eval-web-push:key:${deviceId}`).digest());
  const auth = crypto.createHash("sha256").update(`agent-eval-web-push:auth:${deviceId}`).digest().subarray(0, 16);
  return { auth: b64url(auth), ecdh, p256dh: b64url(ecdh.getPublicKey()) };
}

/** The subscription a browser would hand to the page, pointing at the simulator of this server. */
function evalWebPushSubscription(deviceId, port) {
  const keys = evalWebPushKeys(deviceId);
  return { endpoint: `http://127.0.0.1:${port}/__agent-eval/push/web/${encodeURIComponent(deviceId)}`, keys: { auth: keys.auth, p256dh: keys.p256dh } };
}

const hmac = (key, data) => crypto.createHmac("sha256", key).update(data).digest();

/**
 * Decrypts one aes128gcm message (RFC 8188 header, RFC 8291 keys) as the browser would. `keys` is `{ ecdh, auth }`
 * with the browser's own key pair. Returns the plaintext as a string; throws when the message was not made for these keys.
 */
function decryptWebPush(body, keys) {
  const buffer = Buffer.from(body);
  const salt = buffer.subarray(0, 16);
  const idLength = buffer.readUInt8(20);
  const senderPublic = buffer.subarray(21, 21 + idLength);
  const record = buffer.subarray(21 + idLength);
  const receiverPublic = keys.ecdh.getPublicKey();
  const shared = keys.ecdh.computeSecret(senderPublic);
  const authSecret = Buffer.from(keys.auth, "base64url");
  const ikm = hmac(hmac(authSecret, shared), Buffer.concat([Buffer.from("WebPush: info\0"), receiverPublic, senderPublic, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const key = hmac(prk, Buffer.concat([Buffer.from("Content-Encoding: aes128gcm\0"), Buffer.from([1])])).subarray(0, 16);
  const nonce = hmac(prk, Buffer.concat([Buffer.from("Content-Encoding: nonce\0"), Buffer.from([1])])).subarray(0, 12);
  const decipher = crypto.createDecipheriv("aes-128-gcm", key, nonce);
  decipher.setAuthTag(record.subarray(record.length - 16));
  const padded = Buffer.concat([decipher.update(record.subarray(0, record.length - 16)), decipher.final()]);
  // The last record ends with 0x02 and optional zero padding after it.
  let end = padded.length;
  while (end > 0 && padded[end - 1] === 0) end -= 1;
  if (end === 0 || padded[end - 1] !== 2) throw new Error("not a final aes128gcm record");
  return padded.subarray(0, end - 1).toString("utf8");
}

module.exports = { decryptWebPush, evalWebPushKeys, evalWebPushSubscription };
