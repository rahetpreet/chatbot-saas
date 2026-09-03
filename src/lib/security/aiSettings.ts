import { AI_SECRET_FIELDS, decryptJsonFields, encryptJsonFields, isEncryptionConfigured } from "@/lib/security/crypto";
import { getPlatformAIConfig } from "@/lib/services/ai";

export { AI_SECRET_FIELDS, decryptJsonFields, encryptJsonFields, isEncryptionConfigured };

/**
 * Decrypts a workspace's stored AI configuration for server-side use.
 *
 * Every consumer of Tenant.aiConfig must go through this: passing the raw
 * column to the AI layer would send an encrypted string as the API key and
 * fail with an opaque 401 from the provider.
 */
export function readTenantAiConfig(aiConfig: string | null | undefined): string | null {
  return decryptJsonFields(aiConfig, AI_SECRET_FIELDS);
}

/**
 * What the platform-level AI key provides, for display in the dashboard. The
 * key itself is never included.
 */
export function getPlatformAiSummary(): {
  available: boolean;
  provider: string | null;
  model: string | null;
  encryptionConfigured: boolean;
} {
  const platform = getPlatformAIConfig();
  return {
    available: Boolean(platform),
    provider: platform?.provider ?? null,
    model: platform?.model ?? null,
    encryptionConfigured: isEncryptionConfigured(),
  };
}
