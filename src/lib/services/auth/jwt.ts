/**
 * Authentication uses opaque, database-backed session tokens.  This module is
 * intentionally retained only to avoid breaking older imports; JWTs are not an
 * authentication mechanism in this application.
 */
import type { JWTPayload } from "@/types";

export async function signToken(_payload: JWTPayload): Promise<string> {
  throw new Error("JWT sessions are disabled. Use createSession().");
}

export async function verifyToken(_token: string): Promise<JWTPayload | null> {
  return null;
}
