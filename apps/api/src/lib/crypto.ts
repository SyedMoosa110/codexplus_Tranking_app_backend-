import { createHash, randomBytes } from 'node:crypto';

/**
 * Returns a SHA-256 hex digest of the input string.
 * Used for hashing refresh tokens before storing in the database.
 */
export const sha256 = (str: string): string =>
  createHash('sha256').update(str).digest('hex');

/**
 * Generates a cryptographically secure URL-safe random string.
 */
export const newToken = (bytes = 48): string =>
  randomBytes(bytes).toString('base64url');
