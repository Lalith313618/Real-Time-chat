const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');

// Configure Cloudinary
const isCloudinaryConfigured = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET &&
  process.env.CLOUDINARY_API_KEY.trim() !== '' &&
  process.env.CLOUDINARY_API_SECRET.trim() !== ''
);

if (isCloudinaryConfigured) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
  console.log('[Cloudinary] Configured with cloud:', process.env.CLOUDINARY_CLOUD_NAME);
} else {
  console.log('[Upload] Cloudinary credentials not fully specified. Local storage fallback active.');
}

/**
 * Upload buffer to Cloudinary with local storage fallback
 * @param {Buffer} buffer - File buffer from multer memory storage
 * @param {Object} options - Upload options (folder, resource_type, originalname, mimetype)
 * @returns {Promise<Object>} Upload result { fileUrl, publicId, resourceType, fileName, fileSize }
 */
const uploadFile = (buffer, options = {}) => {
  return new Promise(async (resolve, reject) => {
    const {
      folder = 'chat_app/uploads',
      resource_type = 'auto',
      originalname = 'file',
      mimetype = 'application/octet-stream',
    } = options;

    if (isCloudinaryConfigured) {
      try {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder,
            resource_type,
            use_filename: true,
            unique_filename: true,
          },
          (error, result) => {
            if (error) {
              console.warn('[Cloudinary Stream Error]:', error.message, '- falling back to local');
              // Fallback to local on Cloudinary network/auth error
              return saveLocally(buffer, originalname, mimetype)
                .then(resolve)
                .catch(reject);
            }
            resolve({
              fileUrl: result.secure_url,
              publicId: result.public_id,
              resourceType: result.resource_type,
              format: result.format,
              fileName: originalname,
              fileSize: result.bytes || buffer.length,
            });
          }
        );
        uploadStream.end(buffer);
      } catch (err) {
        console.warn('[Cloudinary Exception]:', err.message, '- falling back to local');
        saveLocally(buffer, originalname, mimetype)
          .then(resolve)
          .catch(reject);
      }
    } else {
      // Local storage fallback
      saveLocally(buffer, originalname, mimetype)
        .then(resolve)
        .catch(reject);
    }
  });
};

/**
 * Save file locally in backend/uploads directory
 */
const saveLocally = (buffer, originalname, mimetype) => {
  return new Promise((resolve, reject) => {
    try {
      const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      const ext = path.extname(originalname) || '';
      const safeBase = path.basename(originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
      const uniqueName = `${Date.now()}_${safeBase}${ext}`;
      const filePath = path.join(uploadsDir, uniqueName);

      fs.writeFile(filePath, buffer, (err) => {
        if (err) return reject(err);

        // Determine resource type
        let resourceType = 'raw';
        if (mimetype.startsWith('image/')) resourceType = 'image';
        else if (mimetype.startsWith('video/')) resourceType = 'video';
        else if (mimetype.startsWith('audio/')) resourceType = 'audio';

        const port = process.env.PORT || 5000;
        const fileUrl = `http://localhost:${port}/uploads/${uniqueName}`;

        resolve({
          fileUrl,
          publicId: uniqueName,
          resourceType,
          fileName: originalname,
          fileSize: buffer.length,
          isLocal: true,
        });
      });
    } catch (e) {
      reject(e);
    }
  });
};

module.exports = {
  cloudinary,
  isCloudinaryConfigured,
  uploadFile,
};
