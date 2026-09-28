import crypto from "node:crypto";
import fs from "node:fs";

const encryptedPath = process.env.ENCRYPTED_SOURCE_PATH;
const outputPath = process.env.DECRYPTED_SOURCE_PATH;
const passphrase = process.env.SOURCE_PASSPHRASE;

if (!encryptedPath || !outputPath || !passphrase) {
  throw new Error(
    "ENCRYPTED_SOURCE_PATH, DECRYPTED_SOURCE_PATH, and SOURCE_PASSPHRASE are required."
  );
}

const payload = fs.readFileSync(encryptedPath);
const iv = payload.subarray(0, 12);
const authTag = payload.subarray(12, 28);
const ciphertext = payload.subarray(28);
const key = crypto.createHash("sha256").update(passphrase, "utf8").digest();
const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
decipher.setAuthTag(authTag);

const plaintext = Buffer.concat([
  decipher.update(ciphertext),
  decipher.final()
]);
fs.writeFileSync(outputPath, plaintext);
