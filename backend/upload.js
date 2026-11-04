const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const config = require('./config');

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
]);

const EXTENSION_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
};

fs.mkdirSync(config.uploadDir, { recursive: true });

// Files stay in memory: Cloudinary needs a buffer, and local disk storage
// writes the buffer itself once the request has been validated.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes, files: 1 },
  fileFilter(req, file, cb) {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      const err = new Error('Only JPEG, PNG, WEBP, GIF or AVIF images are allowed');
      err.status = 415;
      return cb(err);
    }
    return cb(null, true);
  },
});

/** Saves an in-memory image to the local uploads directory. */
const saveLocally = async (file) => {
  const extension = EXTENSION_BY_MIME[file.mimetype] || '.jpg';
  const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${extension}`;
  const destination = path.join(config.uploadDir, filename);
  await fs.promises.writeFile(destination, file.buffer);
  return { url: `/uploads/${filename}`, publicId: `local:${filename}` };
};

/** Uploads a buffer to Cloudinary and resolves with { url, publicId }. */
const uploadToCloudinary = (file) =>
  new Promise((resolve, reject) => {
    // Lazy require so the server can run without Cloudinary configured.
    const cloudinary = require('cloudinary').v2;
    cloudinary.config({
      cloud_name: config.cloudinary.cloudName,
      api_key: config.cloudinary.apiKey,
      api_secret: config.cloudinary.apiSecret,
    });
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'lost-and-found', resource_type: 'image' },
      (error, result) => {
        if (error) return reject(error);
        return resolve({ url: result.secure_url, publicId: result.public_id });
      }
    );
    stream.end(file.buffer);
  });

/**
 * Persists an uploaded image and returns { url, publicId }.
 * Uses Cloudinary when configured, otherwise local disk.
 */
const storeImage = async (file) => {
  if (config.useCloudinary) return uploadToCloudinary(file);
  return saveLocally(file);
};

/** Best-effort removal of a previously stored image. Never throws. */
const destroyImage = async (publicId) => {
  if (!publicId) return;
  try {
    if (publicId.startsWith('local:')) {
      const filename = path.basename(publicId.slice('local:'.length));
      await fs.promises.unlink(path.join(config.uploadDir, filename));
      return;
    }
    if (config.useCloudinary) {
      const cloudinary = require('cloudinary').v2;
      await cloudinary.uploader.destroy(publicId);
    }
  } catch (err) {
    if (err && err.code === 'ENOENT') return; // already gone
    console.warn('Could not remove image', publicId, err.message);
  }
};

module.exports = {
  upload,
  storeImage,
  destroyImage,
  ALLOWED_MIME_TYPES,
  EXTENSION_BY_MIME,
};
