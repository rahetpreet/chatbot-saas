import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

export interface StoredFile {
  url: string;
  filename: string;
  originalName: string;
  size: number;
  mimeType: string;
  storedPath: string;
}

export type StorageCategory = "attachments" | "avatars" | "exports" | "knowledge";

export interface UploadParams {
  tenantId: string;
  category: StorageCategory;
  buffer: Buffer;
  originalName: string;
  mimeType: string;
}

export interface StorageProvider {
  uploadFile(params: UploadParams): Promise<StoredFile>;
  deleteFile(storedPath: string): Promise<boolean>;
}

/** Executables and scripts are refused regardless of the declared MIME type. */
const FORBIDDEN_EXTENSIONS = [
  ".exe", ".bat", ".cmd", ".com", ".sh", ".php", ".js", ".mjs", ".cjs",
  ".vbs", ".msi", ".jar", ".dll", ".scr", ".ps1", ".htaccess",
];

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * Produces an unguessable storage key. The original filename is only used for
 * a short, sanitized prefix so that stored objects stay human-recognisable
 * without ever letting caller-controlled text steer the path.
 */
function buildObjectKey(params: UploadParams): { key: string; filename: string; ext: string } {
  const { tenantId, category, originalName } = params;
  const ext = path.extname(originalName).toLowerCase() || ".bin";
  if (FORBIDDEN_EXTENSIONS.includes(ext)) {
    throw new Error("File extension not permitted for security reasons.");
  }
  if (params.buffer.length > MAX_UPLOAD_BYTES) {
    throw new Error("File exceeds the maximum permitted size.");
  }
  const cleanBasename = path
    .basename(originalName, ext)
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .substring(0, 30) || "file";
  const filename = `${cleanBasename}_${randomUUID()}${ext}`;
  return { key: `tenants/${tenantId}/${category}/${filename}`, filename, ext };
}

/**
 * Development-only provider. Vercel's lambda filesystem is read-only outside
 * /tmp, so this must never be selected in production.
 */
export class LocalStorageProvider implements StorageProvider {
  private baseDir = path.join(process.cwd(), "public", "uploads");

  async uploadFile(params: UploadParams): Promise<StoredFile> {
    const { key, filename } = buildObjectKey(params);
    const filePath = path.join(this.baseDir, key);
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, params.buffer);
    return {
      url: `/uploads/${key}`,
      filename,
      originalName: params.originalName,
      size: params.buffer.length,
      mimeType: params.mimeType,
      storedPath: filePath,
    };
  }

  async deleteFile(storedPath: string): Promise<boolean> {
    try {
      await fs.promises.unlink(storedPath);
      return true;
    } catch {
      return false;
    }
  }
}

/** Durable object storage for serverless deployments. */
export class VercelBlobStorageProvider implements StorageProvider {
  async uploadFile(params: UploadParams): Promise<StoredFile> {
    const { put } = await import("@vercel/blob");
    const { key, filename } = buildObjectKey(params);
    const result = await put(key, params.buffer, {
      access: "public",
      contentType: params.mimeType,
      // The key already carries a UUID; a second random suffix would make the
      // stored path impossible to derive from the Attachment row.
      addRandomSuffix: false,
    });
    return {
      url: result.url,
      filename,
      originalName: params.originalName,
      size: params.buffer.length,
      mimeType: params.mimeType,
      storedPath: result.url,
    };
  }

  async deleteFile(storedPath: string): Promise<boolean> {
    try {
      const { del } = await import("@vercel/blob");
      await del(storedPath);
      return true;
    } catch {
      return false;
    }
  }
}

/** Raised when uploads are requested but no durable backend is configured. */
export class StorageNotConfiguredError extends Error {
  constructor() {
    super("File uploads are not configured for this deployment.");
    this.name = "StorageNotConfiguredError";
  }
}

export function getStorageProvider(): StorageProvider {
  const mode = (process.env.STORAGE_PROVIDER || process.env.STORAGE_MODE || "").toLowerCase();

  if (mode === "blob" || mode === "vercel-blob") return new VercelBlobStorageProvider();
  if (mode === "local") {
    // "local" is a development-only choice. Honouring it in production would
    // write to the read-only lambda filesystem and 500 on every upload, which
    // is exactly the failure this replaced.
    if (process.env.NODE_ENV === "production") {
      console.error('[storage] STORAGE_PROVIDER="local" is not usable on a serverless deployment; set it to "blob".');
      throw new StorageNotConfiguredError();
    }
    return new LocalStorageProvider();
  }

  // No explicit choice: infer. Writing to the bundle directory works in local
  // development but throws EROFS on Vercel, so production must not fall back
  // to it silently -- that produced a 500 on every upload.
  if (process.env.NODE_ENV === "production") {
    if (process.env.BLOB_READ_WRITE_TOKEN) return new VercelBlobStorageProvider();
    throw new StorageNotConfiguredError();
  }
  return new LocalStorageProvider();
}
