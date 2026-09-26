const multer = require('multer');

// Memory storage to stream buffer directly to Cloudinary or local disk
const storage = multer.memoryStorage();

// File filter
const fileFilter = (req, file, cb) => {
  // Allow all standard media types and common document formats
  const allowedMimePrefixes = ['image/', 'audio/', 'video/', 'application/pdf', 'text/'];
  const allowedExtensions = [
    '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg',
    '.mp3', '.wav', '.ogg', '.m4a',
    '.mp4', '.mov', '.avi', '.mkv',
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.txt', '.csv', '.zip', '.rar',
  ];

  const ext = file.originalname.toLowerCase();
  const isMimeAllowed = allowedMimePrefixes.some((prefix) => file.mimetype.startsWith(prefix));
  const isExtAllowed = allowedExtensions.some((allowedExt) => ext.endsWith(allowedExt));

  if (isMimeAllowed || isExtAllowed) {
    cb(null, true);
  } else {
    cb(new Error(`File type '${file.mimetype}' is not supported`), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB max
  },
});

module.exports = {
  uploadSingle: (fieldName = 'file') => upload.single(fieldName),
};
