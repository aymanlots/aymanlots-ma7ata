import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;

/**
 * Checks if a string is already a valid bcrypt hash.
 */
export function isBcryptHash(value?: string | null): boolean {
  if (!value || typeof value !== 'string') return false;
  return /^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$/.test(value.trim());
}

/**
 * Hashes a plaintext password using bcryptjs.
 * If the string is already a bcrypt hash, returns it as-is to prevent double-hashing.
 */
export async function hashPassword(plainTextPassword: string): Promise<string> {
  const trimmed = (plainTextPassword || '').trim();
  if (!trimmed) return '';
  if (isBcryptHash(trimmed)) {
    return trimmed;
  }
  return bcrypt.hash(trimmed, SALT_ROUNDS);
}

/**
 * Verifies a plaintext password against a stored bcrypt hash or legacy plaintext.
 * Seamlessly handles legacy accounts and validates hashes securely.
 */
export async function verifyPassword(
  plainTextAttempt: string,
  storedHashOrPlain?: string | null
): Promise<boolean> {
  const attempt = (plainTextAttempt || '').trim();
  const stored = (storedHashOrPlain || '').trim();

  if (!attempt || !stored) return false;

  if (isBcryptHash(stored)) {
    try {
      return await bcrypt.compare(attempt, stored);
    } catch {
      return false;
    }
  }

  // Fallback for legacy unhashed accounts
  return attempt === stored;
}

/**
 * Strips password field from user objects before passing to client UI or logging.
 */
export function sanitizeUserForClient<T extends { password?: string; [key: string]: any }>(
  user: T
): Omit<T, 'password'> & { has_password?: boolean } {
  const { password, ...rest } = user;
  return {
    ...rest,
    has_password: Boolean(password),
  };
}
