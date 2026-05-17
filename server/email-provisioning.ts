import crypto from "crypto";

function getSecret() {
  const value = process.env.EMAIL_PROVISIONING_SECRET?.trim() || "";
  if (!value) {
    throw new Error("EMAIL_PROVISIONING_SECRET is not configured");
  }
  return value;
}

function deriveKey() {
  const secret = getSecret();
  return crypto.scryptSync(secret, "oceanluxe-email-provisioning-v1", 32);
}

function b64(buf: Buffer) {
  return buf.toString("base64");
}

function fromB64(value: string) {
  return Buffer.from(value, "base64");
}

export function encryptTempPassword(value: string) {
  const key = deriveKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${b64(iv)}:${b64(tag)}:${b64(ciphertext)}`;
}

export function decryptTempPassword(value: string) {
  const raw = (value || "").trim();
  const [version, ivB64, tagB64, ciphertextB64] = raw.split(":");
  if (version !== "v1" || !ivB64 || !tagB64 || !ciphertextB64) {
    throw new Error("Invalid temp password ciphertext");
  }

  const key = deriveKey();
  const iv = fromB64(ivB64);
  const tag = fromB64(tagB64);
  const ciphertext = fromB64(ciphertextB64);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}

function randomChar(chars: string) {
  return chars[crypto.randomInt(0, chars.length)]!;
}

function shuffle(value: string) {
  const arr = value.split("");
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1);
    const tmp = arr[i];
    arr[i] = arr[j]!;
    arr[j] = tmp!;
  }
  return arr.join("");
}

export function generateTempPassword(length = 18) {
  const safeLength = Number.isFinite(length) && length >= 12 ? Math.floor(length) : 18;
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%^&*-_+?";
  const all = `${upper}${lower}${digits}${symbols}`;

  const base = [
    randomChar(upper),
    randomChar(lower),
    randomChar(digits),
    randomChar(symbols),
  ];

  while (base.length < safeLength) {
    base.push(randomChar(all));
  }

  return shuffle(base.join(""));
}

