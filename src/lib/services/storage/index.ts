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

export interface StorageProvider {
  uploadFile(params: {
    tenantId: string;
    category: "attachments" | "avatars" | "exports" | "knowledge";
    buffer: Buffer;
    originalName: string;
    mimeType: string;
  }): Promise<StoredFile>;

  deleteFile(storedPath: string): Promise<boolean>;
}

export class LocalStorageProvider implements StorageProvider {
  private baseDir: string;

  constructor() {
    this.baseDir = path.join(process.cwd(), "public", "uploads");
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  async uploadFile(params: {
    tenantId: string;
    category: "attachments" | "avatars" | "exports" | "knowledge";
    buffer: Buffer;
    originalName: string;
    mimeType: string;
  }): Promise<StoredFile> {
    const { tenantId, category, buffer, originalName, mimeType } = params;

    // MIME and extension sanitization
    const ext = path.extname(originalName).toLowerCase() || ".bin";
    const forbiddenExts = [".exe", ".bat", ".cmd", ".sh", ".php", ".js", ".vbs", ".msi"];
    if (forbiddenExts.includes(ext)) {
      throw new Error("File extension not permitted for security reasons.");
    }

    const tenantDir = path.join(this.baseDir, "tenants", tenantId, category);
    if (!fs.existsSync(tenantDir)) {
      fs.mkdirSync(tenantDir, { recursive: true });
    }

    // Generate safe UUID filename
    const uniqueId = randomUUID();
    const cleanBasename = path.basename(originalName, ext).replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 30);
    const filename = `${cleanBasename}_${uniqueId}${ext}`;
    const filePath = path.join(tenantDir, filename);

    await fs.promises.writeFile(filePath, buffer);

    const publicUrl = `/uploads/tenants/${tenantId}/${category}/${filename}`;

    return {
      url: publicUrl,
      filename,
      originalName,
      size: buffer.length,
      mimeType,
      storedPath: filePath,
    };
  }

  async deleteFile(storedPath: string): Promise<boolean> {
    try {
      if (fs.existsSync(storedPath)) {
        await fs.promises.unlink(storedPath);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }
}

export function getStorageProvider(): StorageProvider {
  // Free-first local storage is the primary default
  return new LocalStorageProvider();
}
