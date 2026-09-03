import crypto from "crypto";

/**
 * Symmetric encryption for secrets that must be readable again: third-party AI
 * API keys, webhook signing secrets, and per-workspace SMTP passwords.
 *
 * These cannot be hashed like a password, because the server has to present
 * the original value to the upstream service. AES-256-GCM is used so tampering
 * is detected rather than silently decrypting to garbage.
 *
 * Without ENCRYPTION_KEY the functions pass values through unchanged. That is
 * a deliberate trade-off: a missing key degrades confidentiality but does not
 * take a running deployment offline, and the gap is logged loudly once.
 */

const PREFIX = "enc:v1:";
let warned = false;

function getKey(): Buffer | null {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    if (!warned) {
      warned = true;
      console.warn(
        "[crypto] ENCRYPTION_KEY is not set; AI keys and webhook secrets are stored unencrypted. " +
          "Generate one with: openssl rand -hex 32",
      );
    }
    return null;
  }

  // Accept a 64-character hex string (the documented form) or any passphrase,
  // which is stretched to 32 bytes so a short value cannot silently weaken it.
  if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, "hex");
  return crypto.createHash("sha256").update(raw).digest();
}

export function isEncryptionConfigured(): boolean {
  return Boolean(process.env.ENCRYPTION_KEY);
}

/** Returns the ciphertext, or the original value when no key is configured. */
export function encryptSecret(plaintext: string | null | undefined): string | null {
  if (plaintext === null || plaintext === undefined || plaintext === "") return plaintext ?? null;
  if (plaintext.startsWith(PREFIX)) return plaintext; // already encrypted

  const key = getKey();
  if (!key) return plaintext;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return PREFIX + [iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(":");
}

/** Reverses encryptSecret. Values stored before a key existed pass through. */
export function decryptSecret(value: string | null | undefined): string | null {
  if (!value) return value ?? null;
  if (!value.startsWith(PREFIX)) return value; // stored before encryption was enabled

  const key = getKey();
  if (!key) {
    console.error("[crypto] an encrypted value was read but ENCRYPTION_KEY is not set.");
    return null;
  }

  try {
    const [ivPart, tagPart, dataPart] = value.slice(PREFIX.length).split(":");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivPart, "base64"));
    decipher.setAuthTag(Buffer.from(tagPart, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(dataPart, "base64")), decipher.final()]).toString("utf8");
  } catch (error) {
    // Wrong key, or the ciphertext was altered. Never return a partial result.
    console.error("[crypto] could not decrypt a stored secret:", error);
    return null;
  }
}

/**
 * Encrypts named fields inside a JSON blob column. The workspace settings are
 * stored as JSON strings, so only the sensitive leaves are protected and the
 * rest stays queryable and human-readable.
 */
export function encryptJsonFields(json: string | null | undefined, fields: string[]): string | null {
  if (!json) return json ?? null;
  try {
    const parsed = JSON.parse(json);
    for (const field of fields) {
      if (typeof parsed[field] === "string" && parsed[field]) parsed[field] = encryptSecret(parsed[field]);
    }
    return JSON.stringify(parsed);
  } catch {
    return json;
  }
}

export function decryptJsonFields(json: string | null | undefined, fields: string[]): string | null {
  if (!json) return json ?? null;
  try {
    const parsed = JSON.parse(json);
    for (const field of fields) {
      if (typeof parsed[field] === "string" && parsed[field]) parsed[field] = decryptSecret(parsed[field]);
    }
    return JSON.stringify(parsed);
  } catch {
    return json;
  }
}

/** Fields that must never leave the server in cleartext. */
export const AI_SECRET_FIELDS = ["apiKey"];
export const SMTP_SECRET_FIELDS = ["pass", "password"];

/** Replaces secret values with a masked hint for display in the dashboard. */
export function maskSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  const plain = decryptSecret(value) || "";
  if (plain.length <= 4) return "••••";
  return `••••••••${plain.slice(-4)}`;
}
