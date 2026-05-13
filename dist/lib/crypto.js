"use strict";
// src/lib/crypto.ts
//
// Encryption helpers for Personally Identifiable Information (PII).
// NIN and BVN must be encrypted before being stored in the database.
//
// Algorithm: AES-256-GCM
//   "Authenticated" encryption — detects if the ciphertext has been tampered with.
//   Each call produces a unique result (random IV) so two identical
//   values look different in the database.
//
// PIN hashing uses bcrypt (one-way — can verify but cannot reverse).
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.encrypt = encrypt;
exports.decrypt = decrypt;
exports.hashPin = hashPin;
exports.verifyPin = verifyPin;
exports.generateId = generateId;
const crypto_1 = __importDefault(require("crypto"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const config_1 = require("../config");
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 16;
const TAG_BYTES = 16;
// Key must be exactly 32 bytes (64 hex characters in .env)
const KEY = Buffer.from(config_1.config.encryption.key, 'hex');
// ── Symmetric encryption (reversible) ─────────────────────────────────────────
/**
 * Encrypt a plaintext string.
 * Returns a single colon-delimited string: ivHex:authTagHex:ciphertextHex
 */
function encrypt(plaintext) {
    const iv = crypto_1.default.randomBytes(IV_BYTES);
    const cipher = crypto_1.default.createCipheriv(ALGORITHM, KEY, iv);
    const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return [iv.toString('hex'), authTag.toString('hex'), encrypted.toString('hex')].join(':');
}
/**
 * Decrypt a string produced by `encrypt()`.
 * Throws if the ciphertext has been tampered with.
 */
function decrypt(encryptedStr) {
    const parts = encryptedStr.split(':');
    if (parts.length !== 3)
        throw new Error('Invalid encrypted string format.');
    const [ivHex, authTagHex, encHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const encrypted = Buffer.from(encHex, 'hex');
    const decipher = crypto_1.default.createDecipheriv(ALGORITHM, KEY, iv);
    decipher.setAuthTag(authTag);
    return decipher.update(encrypted).toString('utf8') + decipher.final('utf8');
}
// ── PIN hashing (one-way) ─────────────────────────────────────────────────────
/** Hash a 4-digit transaction PIN. Cost factor 12 ≈ 300ms — strong but usable. */
async function hashPin(pin) {
    return bcrypt_1.default.hash(pin, 12);
}
/** Verify a plain PIN against a stored bcrypt hash. */
async function verifyPin(pin, hash) {
    return bcrypt_1.default.compare(pin, hash);
}
// ── Misc ──────────────────────────────────────────────────────────────────────
/** Generate a cryptographically random UUID v4. */
function generateId() {
    return crypto_1.default.randomUUID();
}
//# sourceMappingURL=crypto.js.map