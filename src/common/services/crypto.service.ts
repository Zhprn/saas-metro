import { Injectable, Logger } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGO = 'aes-256-gcm';
const KEY_HEX = process.env.MESSAGE_ENCRYPTION_KEY ?? '';

/**
 * AES-256-GCM symmetric encryption for sensitive fields (e.g. message text).
 *
 * Encrypted format (stored in DB):
 *   base64(iv) + ":" + base64(authTag) + ":" + base64(ciphertext)
 *
 * The key is loaded from MESSAGE_ENCRYPTION_KEY env var (64 hex chars = 32 bytes).
 */
@Injectable()
export class CryptoService {
  private readonly logger = new Logger(CryptoService.name);
  private readonly key: Buffer;

  constructor() {
    if (!KEY_HEX || KEY_HEX.length !== 64) {
      this.logger.warn(
        'MESSAGE_ENCRYPTION_KEY is missing or invalid (must be 64 hex chars). ' +
          'Message encryption will be DISABLED. Set this in your .env file.',
      );
      this.key = Buffer.alloc(32); // zero key — encryption still runs but is insecure
    } else {
      this.key = Buffer.from(KEY_HEX, 'hex');
    }
  }

  /**
   * Encrypt a plain-text string.
   * Returns null if input is null/undefined/empty.
   */
  encrypt(plaintext: string | null | undefined): string | null {
    if (!plaintext) return null;

    const iv = randomBytes(12); // 96-bit IV recommended for GCM
    const cipher = createCipheriv(ALGO, this.key, iv);

    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);

    const tag = cipher.getAuthTag(); // 128-bit authentication tag

    // Store as three base64 segments joined by ":"
    return [
      iv.toString('base64'),
      tag.toString('base64'),
      encrypted.toString('base64'),
    ].join(':');
  }

  /**
   * Decrypt a string that was previously encrypted with `encrypt()`.
   * Returns null if input is null/undefined/empty.
   * Returns the raw string as-is if it doesn't match the expected encrypted format
   * (graceful fallback for existing plain-text rows during migration).
   */
  decrypt(ciphertext: string | null | undefined): string | null {
    if (!ciphertext) return null;

    const parts = ciphertext.split(':');
    // If it's not the expected format (iv:tag:data), treat as legacy plain text
    if (parts.length !== 3) {
      return ciphertext;
    }

    try {
      const [ivB64, tagB64, encB64] = parts;
      const iv = Buffer.from(ivB64, 'base64');
      const tag = Buffer.from(tagB64, 'base64');
      const enc = Buffer.from(encB64, 'base64');

      const decipher = createDecipheriv(ALGO, this.key, iv);
      decipher.setAuthTag(tag);

      return decipher.update(enc).toString('utf8') + decipher.final('utf8');
    } catch {
      // Decryption failure — may be a plain-text legacy row; return as-is
      this.logger.warn('Failed to decrypt a field — returning raw value');
      return ciphertext;
    }
  }
}
