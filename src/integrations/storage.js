// src/integrations/storage.js
// Storage adapter: AWS S3 (SDK v3) when configured, otherwise a local ./uploads
// fallback that serves files from the `/uploads` static route.
//
// Public API:
//   await storage.upload(file, { folder })   -> { key, url }
//   await storage.remove(keyOrUrl)           -> boolean
//   storage.driver                            -> 's3' | 'local'
//
// `file` is a Multer in-memory file: { buffer, originalname, mimetype, size }.

import { randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import logger from '../config/logger.js';

const S3_BUCKET = process.env.S3_BUCKET || '';
const S3_REGION = process.env.S3_REGION || 'ap-southeast-1';
const S3_ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID || '';
const S3_SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY || '';
const S3_PUBLIC_URL = process.env.S3_PUBLIC_URL || ''; // optional CDN/base url

// S3 is "configured" only when bucket + credentials are present.
const useS3 = Boolean(S3_BUCKET && S3_ACCESS_KEY_ID && S3_SECRET_ACCESS_KEY);

// ----- Local fallback config -----
const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');
const APP_URL = (process.env.APP_URL || 'http://localhost:4000').replace(/\/$/, '');

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

const extFromMime = (mimetype, originalname) => {
  const map = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/webp': '.webp',
  };
  if (map[mimetype]) return map[mimetype];
  const ext = path.extname(originalname || '');
  return ext || '';
};

const buildKey = (folder, file) => {
  const ext = extFromMime(file.mimetype, file.originalname);
  const safeFolder = (folder || 'vehicles').replace(/^\/+|\/+$/g, '');
  return `${safeFolder}/${Date.now()}-${randomUUID()}${ext}`;
};

// ----- S3 driver (lazy-loaded so the app runs without the dependency) -----
let s3Client = null;
let S3Cmds = null;

const getS3 = async () => {
  if (s3Client) return { s3Client, ...S3Cmds };
  const mod = await import('@aws-sdk/client-s3');
  const { S3Client, PutObjectCommand, DeleteObjectCommand } = mod;
  s3Client = new S3Client({
    region: S3_REGION,
    credentials: {
      accessKeyId: S3_ACCESS_KEY_ID,
      secretAccessKey: S3_SECRET_ACCESS_KEY,
    },
  });
  S3Cmds = { PutObjectCommand, DeleteObjectCommand };
  return { s3Client, ...S3Cmds };
};

const s3PublicUrl = (key) => {
  if (S3_PUBLIC_URL) return `${S3_PUBLIC_URL.replace(/\/$/, '')}/${key}`;
  return `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${key}`;
};

// ----- Public adapter -----
export const storage = {
  driver: useS3 ? 's3' : 'local',

  /**
   * Upload a single file.
   * @param {{buffer:Buffer, originalname:string, mimetype:string, size:number}} file
   * @param {{folder?:string}} [opts]
   * @returns {Promise<{key:string, url:string}>}
   */
  async upload(file, { folder = 'vehicles' } = {}) {
    const key = buildKey(folder, file);

    if (useS3) {
      const { s3Client: client, PutObjectCommand } = await getS3();
      await client.send(
        new PutObjectCommand({
          Bucket: S3_BUCKET,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
          CacheControl: 'public, max-age=31536000',
        })
      );
      return { key, url: s3PublicUrl(key) };
    }

    // Local fallback
    const dest = path.join(UPLOAD_DIR, key);
    ensureDir(path.dirname(dest));
    fs.writeFileSync(dest, file.buffer);
    return { key, url: `${APP_URL}/uploads/${key}` };
  },

  /**
   * Upload many files in parallel.
   * @param {Array} files
   * @param {{folder?:string}} [opts]
   * @returns {Promise<Array<{key:string,url:string}>>}
   */
  async uploadMany(files = [], opts = {}) {
    return Promise.all(files.map((f) => this.upload(f, opts)));
  },

  /**
   * Remove an object by storage key or public URL. Never throws.
   * @param {string} keyOrUrl
   * @returns {Promise<boolean>}
   */
  async remove(keyOrUrl) {
    if (!keyOrUrl) return false;
    try {
      // Normalize a public URL back to a storage key.
      let key = keyOrUrl;
      if (/^https?:\/\//i.test(keyOrUrl)) {
        const u = new URL(keyOrUrl);
        key = u.pathname.replace(/^\/+/, '').replace(/^uploads\//, '');
      }

      if (useS3) {
        const { s3Client: client, DeleteObjectCommand } = await getS3();
        await client.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }));
        return true;
      }

      const dest = path.join(UPLOAD_DIR, key);
      if (fs.existsSync(dest)) fs.unlinkSync(dest);
      return true;
    } catch (err) {
      logger?.warn?.(`storage.remove failed: ${err.message}`);
      return false;
    }
  },
};

export default storage;
