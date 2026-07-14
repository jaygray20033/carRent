// src/middlewares/upload.middleware.js
// Multer middleware for image uploads (memory storage → storage adapter).
// - max 5MB per file (configurable via UPLOAD_MAX_SIZE_MB)
// - allowed: png / jpg / jpeg / webp
import multer from 'multer';
import { env } from '../config/env.js';
import { ValidationError } from '../utils/apiError.js';

const MAX_SIZE_BYTES = (env.UPLOAD_MAX_SIZE_MB || 5) * 1024 * 1024;

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);

const fileFilter = (_req, file, cb) => {
  if (ALLOWED_MIME.has(file.mimetype)) return cb(null, true);
  cb(new ValidationError([{ field: 'image', message: 'Only PNG, JPG, JPEG, WEBP are allowed' }]));
};

const multerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE_BYTES },
  fileFilter,
});

/**
 * Single image upload — field name "image".
 */
export const uploadImage = multerUpload.single('image');

/**
 * Multiple image upload — field name "images", up to `max` files (default 10).
 * @param {number} max
 */
export const uploadImages = (max = 10) => multerUpload.array('images', max);

/** Single PDF upload — field name "file" (ENT-Day 3 amendments). */
const pdfFilter = (_req, file, cb) => {
  if (file.mimetype === 'application/pdf') return cb(null, true);
  const err = new ValidationError([
    { field: 'file', message: 'Only PDF is allowed' },
  ]);
  err.statusCode = 415;
  err.code = 'UNSUPPORTED_MEDIA';
  cb(err);
};

const multerPdf = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE_BYTES },
  fileFilter: pdfFilter,
});

export const uploadPdf = multerPdf.single('file');

/**
 * Translate Multer errors into our ValidationError so the error handler
 * returns a clean 422 instead of a raw 500.
 */
export const handleUploadError = (err, _req, _res, next) => {
  if (err instanceof multer.MulterError) {
    const msgMap = {
      LIMIT_FILE_SIZE: `File too large (max ${env.UPLOAD_MAX_SIZE_MB || 5}MB)`,
      LIMIT_FILE_COUNT: 'Too many files',
      LIMIT_UNEXPECTED_FILE: 'Unexpected file field',
    };
    return next(
      new ValidationError([
        { field: err.field || 'image', message: msgMap[err.code] || err.message },
      ])
    );
  }
  return next(err);
};

export default { uploadImage, uploadImages, handleUploadError };
