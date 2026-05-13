/**
 * Encrypt a plaintext string.
 * Returns a single colon-delimited string: ivHex:authTagHex:ciphertextHex
 */
export declare function encrypt(plaintext: string): string;
/**
 * Decrypt a string produced by `encrypt()`.
 * Throws if the ciphertext has been tampered with.
 */
export declare function decrypt(encryptedStr: string): string;
/** Hash a 4-digit transaction PIN. Cost factor 12 ≈ 300ms — strong but usable. */
export declare function hashPin(pin: string): Promise<string>;
/** Verify a plain PIN against a stored bcrypt hash. */
export declare function verifyPin(pin: string, hash: string): Promise<boolean>;
/** Generate a cryptographically random UUID v4. */
export declare function generateId(): string;
