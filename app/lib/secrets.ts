import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getSecretsDir } from "./state";
import { UserFacingError } from "./validate";

const KEY_FILE = "dockio-secret.key";
const PREFIX = "dio1";

export function encryptSecret(value: string) {
  const key = loadSecretKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptSecret(value: string) {
  const parts = value.split(".");
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    throw new UserFacingError("Encrypted secret format is invalid. Rotate or re-save the GitHub connection.", 500);
  }
  const key = loadSecretKey();
  const iv = Buffer.from(parts[1] || "", "base64url");
  const tag = Buffer.from(parts[2] || "", "base64url");
  const ciphertext = Buffer.from(parts[3] || "", "base64url");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export function secretStorageStatus() {
  const file = secretKeyPath();
  return {
    encrypted: true,
    provider: "local-aes-256-gcm",
    keyPath: file,
    keyExists: fs.existsSync(file),
    warning: "Secrets are encrypted with a local key on this VPS. Back up /var/lib/dockio-panel/secrets securely."
  };
}

function loadSecretKey() {
  const envKey = process.env.DIO_SECRET_KEY?.trim();
  if (envKey) {
    const decoded = decodeKey(envKey);
    if (decoded.length !== 32) throw new UserFacingError("DIO_SECRET_KEY must decode to exactly 32 bytes.", 500);
    return decoded;
  }

  const file = secretKeyPath();
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, crypto.randomBytes(32).toString("base64url") + "\n", { mode: 0o600 });
  }
  const decoded = decodeKey(fs.readFileSync(file, "utf8").trim());
  if (decoded.length !== 32) {
    throw new UserFacingError("Dockio local secret key is invalid. Restore the key or remove it to generate a new empty-install key.", 500);
  }
  return decoded;
}

function decodeKey(value: string) {
  try {
    return Buffer.from(value, "base64url");
  } catch {
    return Buffer.from(value, "base64");
  }
}

function secretKeyPath() {
  return path.join(getSecretsDir(), KEY_FILE);
}
