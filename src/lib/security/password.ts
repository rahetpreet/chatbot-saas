import bcrypt from "bcryptjs";
import crypto from "crypto";

const BCRYPT_ROUNDS = 10;

/**
 * Generates a cryptographically secure, high-entropy temporary password.
 * Format: 16-20 characters containing uppercase, lowercase, numbers, and special characters.
 * Excludes ambiguous characters (0, O, I, l, 1) for clean usability.
 */
export function generateTemporaryPassword(length: number = 16): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const numbers = "23456789";
  const symbols = "!@#$%^&*()_+-=[]{}";
  const allChars = upper + lower + numbers + symbols;

  if (length < 12) length = 12;

  // Ensure at least one character from each set
  const required = [
    upper[crypto.randomInt(0, upper.length)],
    lower[crypto.randomInt(0, lower.length)],
    numbers[crypto.randomInt(0, numbers.length)],
    symbols[crypto.randomInt(0, symbols.length)],
  ];

  // Fill remaining characters
  const remainingCount = length - required.length;
  const randomBytes = crypto.randomBytes(remainingCount);
  const remaining: string[] = [];

  for (let i = 0; i < remainingCount; i++) {
    const charIndex = randomBytes[i] % allChars.length;
    remaining.push(allChars[charIndex]);
  }

  // Combine and shuffle securely
  const passwordArray = [...required, ...remaining];
  for (let i = passwordArray.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [passwordArray[i], passwordArray[j]] = [passwordArray[j], passwordArray[i]];
  }

  return passwordArray.join("");
}

/**
 * Securely hashes a password using bcrypt with standard work factor.
 */
export async function hashPassword(password: string): Promise<string> {
  if (!password || typeof password !== "string") {
    throw new Error("Password must be a non-empty string");
  }
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Securely compares a plaintext password with a stored hash.
 */
export async function verifyPassword(password: string, hash?: string | null): Promise<boolean> {
  if (!password || !hash) {
    return false;
  }
  try {
    return await bcrypt.compare(password, hash);
  } catch (error) {
    console.error("Password verification error:", error);
    return false;
  }
}

/**
 * Validates password strength policy for user password changes.
 */
export function validatePasswordStrength(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!password || password.length < 8) {
    errors.push("Password must be at least 8 characters long.");
  }
  if (!/[A-Z]/.test(password)) {
    errors.push("Password must contain at least one uppercase letter.");
  }
  if (!/[a-z]/.test(password)) {
    errors.push("Password must contain at least one lowercase letter.");
  }
  if (!/[0-9]/.test(password)) {
    errors.push("Password must contain at least one number.");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Generates a secure random reset token and returns both the plaintext token (for email/display)
 * and its SHA-256 hash (for database storage).
 */
export function generatePasswordResetToken(): { token: string; tokenHash: string; expiresAt: Date } {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes expiry

  return { token, tokenHash, expiresAt };
}
