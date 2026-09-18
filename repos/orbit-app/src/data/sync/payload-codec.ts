/**
 * At-rest encoding of a mirror record's payload_json. Native mirrors are whole-
 * database encrypted (SQLCipher) and use the identity codec; the browser has no
 * SQLCipher, so it encrypts each payload with AES-GCM under a non-extractable
 * Web Crypto key. The codec sees serialized JSON strings only — the repository's
 * SQL never changes.
 */
export interface PayloadCodec {
  encode(serialized: string): Promise<string>;
  decode(stored: string): Promise<string>;
}

export const IDENTITY_PAYLOAD_CODEC: PayloadCodec = {
  async encode(serialized) { return serialized; },
  async decode(stored) { return stored; },
};

const PREFIX = "orbit-aesgcm-v1:";
const IV_BYTES = 12;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export interface AesGcmCodecDependencies {
  subtle: Pick<SubtleCrypto, "encrypt" | "decrypt">;
  getRandomValues: (bytes: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer>;
}

/** AES-GCM with a fresh 96-bit IV per payload; the key never leaves the codec. */
export function createAesGcmPayloadCodec(key: CryptoKey, deps: AesGcmCodecDependencies): PayloadCodec {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  return {
    async encode(serialized) {
      const iv = deps.getRandomValues(new Uint8Array(IV_BYTES));
      const ciphertext = new Uint8Array(await deps.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(serialized) as Uint8Array<ArrayBuffer>));
      return `${PREFIX}${toBase64(iv)}:${toBase64(ciphertext)}`;
    },
    async decode(stored) {
      if (!stored.startsWith(PREFIX)) throw new Error("PAYLOAD_CODEC_UNRECOGNIZED");
      const [ivText, cipherText] = stored.slice(PREFIX.length).split(":");
      if (!ivText || !cipherText) throw new Error("PAYLOAD_CODEC_MALFORMED");
      const plain = await deps.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(ivText) }, key, fromBase64(cipherText));
      return decoder.decode(plain);
    },
  };
}
