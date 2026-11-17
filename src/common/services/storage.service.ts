import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { extname } from 'path';

export interface UploadResult {
  /** Public URL of the stored file */
  url: string;
  /** Object path inside the bucket (use it to delete the file later) */
  path: string;
}

/**
 * File storage backed by Supabase Storage.
 *
 * Env:
 *  - SUPABASE_URL               e.g. https://<project-ref>.supabase.co
 *  - SUPABASE_SERVICE_ROLE_KEY  service_role key (server only, never expose to frontend)
 *  - SUPABASE_STORAGE_BUCKET    bucket name (default: "uploads"), must be PUBLIC
 */
@Injectable()
export class StorageService {
  private _client?: SupabaseClient;
  private bucketReady?: Promise<void>;
  private readonly bucket = process.env.SUPABASE_STORAGE_BUCKET || 'uploads';

  // Created lazily so the app can still boot when storage env is missing
  private get client(): SupabaseClient {
    if (!this._client) {
      const url = process.env.SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!url || !key) {
        throw new InternalServerErrorException(
          'Storage belum dikonfigurasi: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY kosong',
        );
      }
      this._client = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    }
    return this._client;
  }

  /** Creates the public bucket on first use if it does not exist yet. */
  private ensureBucket(): Promise<void> {
    if (!this.bucketReady) {
      this.bucketReady = (async () => {
        const { data } = await this.client.storage.getBucket(this.bucket);
        if (data) return;
        const { error } = await this.client.storage.createBucket(this.bucket, {
          public: true,
        });
        if (error && !/already exists/i.test(error.message)) throw error;
      })().catch((err) => {
        this.bucketReady = undefined; // retry next time
        throw err;
      });
    }
    return this.bucketReady;
  }

  /**
   * Upload a buffer to `<folder>/<timestamp>-<random>-<safe file name>`.
   */
  async upload(
    buffer: Buffer,
    folder: string,
    options: { fileName?: string; contentType?: string } = {},
  ): Promise<UploadResult> {
    await this.ensureBucket();

    const contentType = options.contentType || 'application/octet-stream';
    const path = `${folder}/${this.buildFileName(options.fileName, contentType)}`;

    const { error } = await this.client.storage
      .from(this.bucket)
      .upload(path, buffer, { contentType, upsert: false });

    if (error) {
      throw new InternalServerErrorException(
        `Gagal upload file ke storage: ${error.message}`,
      );
    }

    const { data } = this.client.storage.from(this.bucket).getPublicUrl(path);
    return { url: data.publicUrl, path };
  }

  async remove(path: string): Promise<void> {
    const { error } = await this.client.storage.from(this.bucket).remove([path]);
    if (error) {
      throw new InternalServerErrorException(
        `Gagal menghapus file dari storage: ${error.message}`,
      );
    }
  }

  private buildFileName(original: string | undefined, contentType: string) {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    if (!original) {
      return `${unique}${this.extFromContentType(contentType)}`;
    }
    // Supabase object keys only accept a limited ASCII charset
    const ext = extname(original).toLowerCase();
    const base = original
      .slice(0, original.length - ext.length)
      .normalize('NFKD')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80);
    const safeExt = ext.replace(/[^a-z0-9.]/g, '');
    return `${unique}-${base || 'file'}${safeExt}`;
  }

  private extFromContentType(contentType: string): string {
    const map: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif',
      'application/pdf': '.pdf',
      'video/mp4': '.mp4',
      'audio/ogg': '.ogg',
    };
    return map[contentType.split(';')[0].trim()] ?? '';
  }
}
